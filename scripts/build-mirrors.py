"""Build static mirror pages from index.html.

Single source of truth: `index.html`.
Generates: about.html, articles.html, notes.html, projects.html,
           links.html, guestbook.html

Why mirrors exist: the app is a hash-router SPA (`#/about`, ...).
Mirrors give crawlers / direct file:// opens a landing page with the
correct `body data-page` fallback (see renderRoute() in app.js).

Do NOT edit mirrors by hand. Edit `index.html`, then re-run:

    python scripts/build-mirrors.py

A GitHub Action (.github/workflows/mirrors.yml) re-runs this on every
push that touches `index.html` so github.io stays in sync.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "index.html"

# page -> (output file, <title>, meta description)
PAGES = {
    "about": (
        "about.html",
        "about me - meowking",
        "About meowking: background, interests, and computing setup.",
    ),
    "articles": (
        "articles.html",
        "articles - meowking",
        "Long-form essays, security notes, and technical articles by meowking.",
    ),
    "notes": (
        "notes.html",
        "notes - meowking",
        "Quick thoughts, short observations, and terminal snippets by meowking.",
    ),
    "projects": (
        "projects.html",
        "projects - meowking",
        "Portfolio of open source tools, scripts, and software by meowking.",
    ),
    "links": (
        "links.html",
        "cool links - meowking",
        "A curated directory of cool links, retro websites, and tools by meowking.",
    ),
    "guestbook": (
        "guestbook.html",
        "guestbook - meowking",
        "Sign the retro guestbook, drop your alias, plug your personal website, and browse visitor comments.",
    ),
}


def build_one(template: str, page: str, title: str, description: str) -> str:
    html = template

    # 1. <body> -> <body data-page="x"> (index.html has plain <body>)
    html = re.sub(r"<body(?P<attrs>[^>]*)>", f'<body data-page="{page}"', html, count=1)

    # 2. <title>...</title>
    html = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1, flags=re.DOTALL)

    # 3. meta description (index.html splits it across lines, so DOTALL)
    html = re.sub(
        r'<meta name="description"\s+content=".*?">',
        f'<meta name="description" content="{description}">',
        html,
        count=1,
        flags=re.DOTALL,
    )

    # 4. Prefix hash links so mirrors work from any path:
    #    href="#/about" -> href="index.html#/about"
    #    (skip if already prefixed -- keeps the script idempotent)
    html = re.sub(r'href="(?!index\.html)(#/[^"]*)"', r'href="index.html\1"', html)

    # 5. Move `active` class from home to this page's nav links
    #    (top nav + sidebar nav both use data-route="x").
    #    5a. strip existing actives, preserving other classes
    #        e.g. class="nav-guestbook-link active" -> class="nav-guestbook-link"
    html = re.sub(r'class="nav-guestbook-link active"', 'class="nav-guestbook-link"', html)
    html = re.sub(r' class="active"', "", html)

    #    5b. add active to matching data-route links
    def add_active(m: re.Match) -> str:
        tag = m.group(0)
        if 'data-route="guestbook"' in tag and "nav-guestbook-link" in tag:
            return tag.replace('class="nav-guestbook-link"', 'class="nav-guestbook-link active"')
        return tag.replace('data-route=', 'class="active" data-route=', 1)

    html = re.sub(
        rf'<a [^>]*data-route="{re.escape(page)}"[^>]*>',
        add_active,
        html,
    )

    # 6. Stamp provenance so future editors know not to hand-edit
    stamp = f"<!-- AUTO-GENERATED from index.html by scripts/build-mirrors.py -- do not edit by hand. Page: {page} -->\n"
    html = html.replace("<!DOCTYPE html>\n", "<!DOCTYPE html>\n" + stamp, 1)

    return html


def main() -> None:
    template = SOURCE.read_text(encoding="utf-8")
    for page, (filename, title, description) in PAGES.items():
        out = ROOT / filename
        out.write_text(build_one(template, page, title, description), encoding="utf-8")
        print(f"mirror: index.html -> {filename} (page={page})")


if __name__ == "__main__":
    main()
