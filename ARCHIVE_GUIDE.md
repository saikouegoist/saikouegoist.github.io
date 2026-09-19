# MEOWKING - Content & Archive Guide

A complete guide to managing your articles, notes, projects, links, and about information across the separated data architecture.

---

## Content Directory Structure

All content is modular and separated into dedicated files for fast, effortless editing:

```
meowking/
├── articles/                <-- Put your standalone Markdown (.md) article files here
│   ├── why-the-old-web-matters.md
│   ├── minimalist-cybersecurity-habits.md
│   ├── zen-of-plain-text.md
│   └── retro-web-aesthetics.md
├── data/                    <-- Metadata & site collections
│   ├── articles.js          <-- Article registry (links to articles/*.md)
│   ├── notes.js             <-- Quick thoughts & terminal snippets
│   ├── projects.js          <-- Portfolio projects & tech tags
│   ├── links.js             <-- Curated web directory & shrines
│   ├── about.js             <-- Biography, interests & hardware setup
│   └── config.js            <-- Site title, stats, buttons & quotes
├── assets/                  <-- Images & 88x31 retro badges
└── index.html               <-- Main website
```

---

## 0. Visual Content Studio (Easiest)

Open `editor.html` — double-click it in this folder, or visit it on your live site. It gives you guided forms for **articles, notes, and projects**: auto-slugs, auto read-time, live preview using the site's real renderer, and validation (required fields, real calendar dates, duplicate IDs). Opening it can never alter the published site; it only produces download files until you push.

Flow per item: **fill the form → Save → Download** the generated file(s) → **replace** your local copy (`data/articles.js`, `data/notes.js`, `data/projects.js`, plus `articles/your-slug.md` for articles) → refresh `index.html` → push to publish. For articles, download the `.md` even if you saved first — the button falls back to your staged copy. The sections below document the manual alternative and the exact file formats.

No login or password: the studio runs locally and never sends anything anywhere. Article bodies live only in `articles/*.md`; `data/articles.js` holds metadata + file path.

---

## 1. How to Add & Remove Articles

You no longer have to write entire articles inside JavaScript! Each article lives in its own `.md` file.

### Step 1: Create a Markdown File
Create a new file in the `articles/` folder, e.g., `articles/my-new-post.md`:

```markdown
### Section Title

Write your thoughts here in standard Markdown!

- Bullet item 1
- Bullet item 2

```python
# Code snippets are formatted automatically
print("Hello, world!")
```

> "Blockquotes look great too."
```

### Step 2: Register in `data/articles.js`
Open `data/articles.js` and paste this block at the top of `window.SITE_ARTICLES`:

```javascript
  {
    id: "my-new-post",                     // Unique URL slug (e.g. #/articles/my-new-post)
    title: "My New Post Title",
    date: "2026-09-15",                    // Format: YYYY-MM-DD (Used for year filtering)
    year: "2026",                          // Optional: Auto-detected from date
    readTime: "4 min read",
    tags: ["tech", "cybersecurity"],       // Tags for search and badges
    excerpt: "A short summary shown in preview cards.",
    file: "articles/my-new-post.md"        // Path to your markdown file
  },
```

### How to Remove an Article
Simply delete the entry from `data/articles.js` (and optionally delete its file from `articles/`).

---








## 2. How to Add & Remove Notes

Notes are short observations, tips, quotes, or terminal one-liners shown on `#/notes`.

### How to Add a Note
Open `data/notes.js` and paste this block at the top of `window.SITE_NOTES`:

```javascript
  {
    id: "note-006",
    date: "2026-09-15",                    // Format: YYYY-MM-DD
    year: "2026",                          // Optional: Auto-detected from date
    tags: ["linux", "cli"],
    content: "Tip: Use `grep -rn 'search_term' .` to find text recursively in current folder."
  },
```

### How to Remove a Note
Simply delete or comment out the block from `data/notes.js`.

---

## 3. How to Add & Remove Projects

Projects are showcased on `#/projects` with status tags, tech stack badges, and GitHub/demo links.

### How to Add a Project
Open `data/projects.js` and add an entry to `window.SITE_PROJECTS`:

```javascript
  {
    id: "my-cli-tool",
    title: "My CLI Tool",
    year: "2026",                          // Year shown in title & dropdown filter
    date: "2026-09-15",
    status: "Active",                      // "Active", "W.I.P", or "Archived"
    statusType: "success",                 // "success" (green), "warning" (amber), or "neutral" (grey)
    description: "A fast terminal-based tool for network packet monitoring.",
    tags: ["Rust", "Networking", "Linux"],
    github: "https://github.com/yourname/tool",  // Leave "" if none
    demo: "https://yourdemo.com",                // Leave "" if none
    details: "Optional technical details or architecture notes."
  },
```

### How to Remove a Project
Simply delete or comment out the block from `data/projects.js`.

---

## 4. How to Edit Cool Links

Curated web resources and links are managed in `data/links.js`.

### How to Add a Link
Open `data/links.js` and add an item under an existing category or create a new category:

```javascript
  {
    category: "Tools & Utilities",
    items: [
      {
        name: "CyberChef",
        url: "https://gchq.github.io/CyberChef/",
        description: "The Swiss Army knife of data manipulation and cryptography."
      },
      {
        name: "My Favorite Tool",
        url: "https://example.com/",
        description: "A great tool for web design."
      }
    ]
  }
```

---

## 5. How to Edit About Me & Setup

Personal biography, interests, and hardware/software setup are in `data/about.js`.

### How to Update
Open `data/about.js`:
- **Biography**: Add or edit paragraphs in `bio: [ "Paragraph 1...", "Paragraph 2..." ]`. Markdown (bold, links, code) is supported.
- **Interests**: Add bullet points to `interests: [ "Cybersecurity", "Retro computing", ... ]`.
- **Setup Table**: Add rows to `setup: [ { category: "OS", value: "Arch Linux" }, ... ]`.




---

## 6. How the Year Dropdowns & Search Work

- **Dynamic Year Detection**: The dropdown filter scans your items and **only lists years where items actually exist** (e.g., `2026 (2)`, `2025 (1)`). If a year has no content, it is automatically omitted.
- **Instant Search**: Type any keyword, tag, or excerpt into the search bar to filter in real time.
- **Combined Filtering**: Search and the Year dropdown work together seamlessly:
  - Select `2025` + search `plain` &rarr; shows only 2025 articles matching "plain".
  - Select `All Years` &rarr; searches across all content.

---




## 7. How to Add Images

1. Put your image file inside the `assets/` folder (e.g. `assets/diagram.png`).
2. To use it in an article markdown file:
   ```markdown
   ![Diagram Description](assets/diagram.png)
   ```
3. To use it in `data/config.js` or `data/articles.js`:
   ```javascript
   coverImage: "assets/diagram.png"
   ```

---

## Quick Cheat Sheet

| Task | File to Edit |
| :--- | :--- |
| **Write anything (easiest)** | Use `editor.html`, download, replace local files |
| **Write an article** | Create `articles/your-post.md`, register in `data/articles.js` |
| **Add a gallery image** | Drop `.png`/`.jpg`/`.jpeg`/`.gif`/`.webp` into `images/` and push (manifest auto-updates, never hand-edit `data/gallery.js`) |
| **Add a song** | Drop `.mp3` into `assets/audio/anime/`, `assets/audio/classic/` or `assets/audio/others/` (or flat as `Anime_Song.mp3` / `Classic_Song.mp3` / `Others_Song.mp3`) and push (manifest auto-updates, never hand-edit `data/music.js`; use `Artist_-_Title.mp3` to set artist; polish names in `data/music-meta.json`) |
| **Delete an article** | Remove from `data/articles.js` |
| **Add a quick thought** | Add to `data/notes.js` |
| **Add a project** | Add to `data/projects.js` |
| **Add a bookmark / link** | Add to `data/links.js` |
| **Edit bio & computer setup** | Edit `data/about.js` |
| **Change site name / stats** | Edit `data/config.js` |
