"""Build the music box manifest from assets/audio/.

Drop-in flow (mirrors images/ -> data/gallery.js):

    assets/audio/anime/My-Song.mp3        -> anime list
    assets/audio/classic/My-Song.mp3      -> classic list
    assets/audio/others/My-Song.mp3       -> others list
    assets/audio/Anime_My-Song.mp3        -> anime list (flat + prefix)
    assets/audio/Classic_My-Song.mp3      -> classic list (flat + prefix)
    assets/audio/Others_My-Song.mp3       -> others list (flat + prefix)

Then commit + push. A GitHub Action (.github/workflows/music-manifest.yml)
re-runs this script so the site picks up added/removed songs with zero
manual list edits.

Rules:
- Folder wins: parent dir `anime` / `classic` / `others` (case-insensitive).
- Else filename prefix wins: Anime_ / Classic_ / Others_ (also Anime-,
- Anime<space>, case-insensitive). Legacy lowercase `anime-` / `classic-` also accepted
  so old flat files keep working until moved.
- Files with no recognizable category are skipped with a warning.
- `data/music-meta.json` (optional) maps basename -> {title, artist, anime,
  year} to polish display names. Anything not in it is derived from the
  filename: `Artist_-_Title.mp3` splits, otherwise title is prettified and
  artist is "Unknown".

AUTO-GENERATED output -- do not edit `data/music.js` by hand.
"""

import json
import re
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "assets" / "audio"
OUTPUT_JS = ROOT / "data" / "music.js"
META_JSON = ROOT / "data" / "music-meta.json"

SUPPORTED_EXTS = {".mp3", ".ogg", ".m4a", ".wav", ".opus", ".flac"}
CATEGORIES = ("anime", "classic", "others")
ID_PREFIX = {"anime": "an", "classic": "cl", "others": "ot"}

PREFIX_RE = re.compile(r"^(anime|classic|others)[_\-\s]+(.+)$", re.IGNORECASE)
LEADING_NUM_RE = re.compile(r"^(\d{1,4})[_\-\s]+(.+)$")


def detect_category(path: Path):
    """Return 'anime'/'classic'/'others' or None. Folder wins, then prefix."""
    parent = path.parent.name.lower()
    if parent in CATEGORIES:
        return parent
    m = PREFIX_RE.match(path.name)
    if m:
        return m.group(1).lower()
    low = path.name.lower()
    if low.startswith("anime-") or low.startswith("anime_"):
        return "anime"
    if low.startswith("classic-") or low.startswith("classic_"):
        return "classic"
    if low.startswith("others-") or low.startswith("others_") or low.startswith("other-") or low.startswith("other_"):
        return "others"
    return None


def strip_prefix(name: str) -> str:
    m = PREFIX_RE.match(name)
    if m:
        return m.group(2)
    low = name.lower()
    for pre in ("anime-", "anime_", "classic-", "classic_", "others-", "others_", "other-", "other_"):
        if low.startswith(pre):
            return name[len(pre):]
    return name


def clean_token(s: str) -> str:
    s = s.replace("_", " ").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def smart_title(s: str) -> str:
    s = clean_token(s)
    if not s:
        return "Untitled"
    # Title-case only when the name is uniformly cased (typical
    # slug filenames); preserves intentional casing like "KANA-BOON".
    if s.islower() or s.isupper():
        return s.title()
    return s


def derive_from_filename(path: Path):
    stem = path.stem
    stem = strip_prefix(stem)
    # Optional leading track number: "01_Silhouette" -> keep number for
    # stable sorting, drop it from the display title.
    m = LEADING_NUM_RE.match(stem)
    if m and len(clean_token(m.group(2))) >= 2:
        stem = m.group(2)
    # "Artist_-_Title" split (underscores already added as spaces above
    # by clean, so split on the raw stem first).
    raw = stem.replace("_", " ")
    if " - " in stem or " - " in raw:
        sep = " - " if " - " in stem else " - "
        artist_raw, title_raw = raw.split(sep, 1)
        artist = clean_token(artist_raw) or "Unknown"
        title = smart_title(title_raw)
        if not title or title == "Untitled":
            title = smart_title(stem)
            artist = "Unknown"
        return title, artist
    return smart_title(stem), "Unknown"


def load_meta():
    try:
        return json.loads(META_JSON.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError) as e:
        print(f"music manifest: WARNING ignoring broken {META_JSON.name}: {e}")
        return {}


def collect():
    meta = load_meta()
    # Case-insensitive meta lookup; legacy entries may be keyed by old
    # flat filename while the file now lives in a subfolder.
    meta_ci = {str(k).lower(): v for k, v in meta.items()} if isinstance(meta, dict) else {}
    buckets = {"anime": [], "classic": [], "others": []}
    skipped = []
    if not AUDIO_DIR.is_dir():
        return buckets, skipped
    # Recursive: subfolders anime/, classic/, others/ + legacy flat files.
    # rglob("*") also yields README_AUDIO_LIST.txt etc -- filtered by ext.
    files = sorted(
        (p for p in AUDIO_DIR.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS),
        key=lambda p: p.relative_to(AUDIO_DIR).as_posix().lower(),
    )
    for path in files:
        cat = detect_category(path)
        if cat not in buckets:
            skipped.append(path.relative_to(AUDIO_DIR).as_posix())
            continue
        rel = path.relative_to(AUDIO_DIR).as_posix()
        url = "assets/audio/" + "/".join(urllib.parse.quote(part, safe="") for part in rel.split("/"))
        override = meta_ci.get(path.name.lower()) or meta_ci.get(rel.lower())
        title, artist, anime, year = None, None, None, ""
        if isinstance(override, dict):
            title = str(override.get("title") or "").strip() or None
            artist = str(override.get("artist") or "").strip() or None
            anime = str(override.get("anime") or "").strip() or None
            year = str(override.get("year") or "")
        if not title or not artist:
            d_title, d_artist = derive_from_filename(path)
            title = title or d_title
            artist = artist or d_artist
        entry = {
            "id": "",  # filled after sorting
            "title": title,
            "artist": artist,
            "file": url,
        }
        if anime:
            entry["anime"] = anime
        if year:
            entry["year"] = year
        buckets[cat].append(entry)
    # Stable order + deterministic ids (an-01.., cl-01.., ot-01..)
    for cat in CATEGORIES:
        buckets[cat].sort(key=lambda e: (e["file"].lower(), e["title"].lower()))
        width = max(2, len(str(len(buckets[cat]))))
        prefix = ID_PREFIX.get(cat, cat[:2])
        for i, entry in enumerate(buckets[cat], 1):
            entry["id"] = f"{prefix}-{str(i).zfill(width)}"
    return buckets, skipped


def main():
    buckets, skipped = collect()
    lines = [
        "/**",
        " * MEOWKING - Music Box Manifest (AUTO-GENERATED)",
        " * -------------------------------------------------------------",
        " * Do NOT edit by hand. Generated by scripts/build-music-manifest.py",
        " * from the contents of assets/audio/. Drop MP3s into",
        " * assets/audio/anime/, assets/audio/classic/ or assets/audio/others/",
        " * (or flat with an Anime_ / Classic_ / Others_ prefix) and push --",
        " * the music-manifest workflow regenerates this file.",
        " *",
        " * Optional polish: data/music-meta.json maps",
        " * \"filename.mp3\" -> {\"title\": ..., \"artist\": ...,",
        " * \"anime\": ..., \"year\": ...} and wins over filename parsing.",
        " */",
        "",
        "window.SITE_MUSIC = {",
        f"  classic: {json.dumps(buckets['classic'], ensure_ascii=False, indent=4)},",
        f"  anime: {json.dumps(buckets['anime'], ensure_ascii=False, indent=4)},",
        f"  others: {json.dumps(buckets['others'], ensure_ascii=False, indent=4)}",
        "};",
        "",
    ]
    OUTPUT_JS.write_text("\n".join(lines), encoding="utf-8")
    print(
        f"music manifest: {len(buckets['anime'])} anime + "
        f"{len(buckets['classic'])} classic + "
        f"{len(buckets['others'])} others -> {OUTPUT_JS.relative_to(ROOT)}"
    )
    for s in skipped:
        print(f"music manifest: skipped (no Anime/Classic/Others category): {s}")


if __name__ == "__main__":
    main()
