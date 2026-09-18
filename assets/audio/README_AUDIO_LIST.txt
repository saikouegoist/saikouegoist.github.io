================================================================================
MEOWKING RETRO MUSIC BOX - AUDIO FILES DIRECTORY (AUTO-SCANNED)
================================================================================
Drop .mp3 files in the right folder, then commit + push. Done.
A GitHub Action regenerates data/music.js automatically (same as images/).

  assets/audio/anime/My-Song.mp3      -> anime list
  assets/audio/classic/My-Song.mp3    -> classic list
  assets/audio/others/My-Song.mp3     -> others list

Flat drops also work if the filename starts with the category:

  assets/audio/Anime_My-Song.mp3      -> anime list
  assets/audio/Classic_My-Song.mp3    -> classic list
  assets/audio/Others_My-Song.mp3     -> others list

Rules:
- Folder wins over filename prefix. No prefix needed inside subfolders,
  but Anime_/Classic_ prefixes are accepted everywhere.
- Want artist + title split automatically? Name it:
    YOASOBI_-_Idol.mp3                -> artist "YOASOBI", title "Idol"
- Otherwise the title is prettified from the filename and artist is
  "Unknown" (e.g. Test_Song_Thing.mp3 -> "Test Song Thing").
- To polish a display name without renaming the file, add an entry to
  data/music-meta.json:
    "My-Song.mp3": {"title": "My Song", "artist": "Somebody",
                    "anime": "Some Anime OP", "year": "2024"}
- Supported: .mp3 (.ogg/.m4a/.wav/.opus/.flac also scanned).
- Never hand-edit data/music.js -- run:
    python scripts/build-music-manifest.py
================================================================================
