# meowking - Retro Personal Website Template

> **A deployment-ready personal website template compatible with GitHub Pages (`github.io`), featuring an authentic early-2000s web shrine aesthetic and a single-file content management system.**

---

## 🌟 Highlights

- **Aesthetic**: Faithfully replicates the classic personal web shrine layout with royal blue header boxes, subtle borders, retro typography, and a 3-column desktop grid.
- **Zero Build Step**: Built with 100% native HTML5, CSS3, and modern Vanilla JavaScript. No Node.js, Webpack, or framework compilation required.
- **Centralized Content**: Add, edit, or delete articles, notes, projects, and site settings by updating a single file: `content.js`.
- **Integrated Content Studio**: Includes `editor.html`—a visual writing tool with live Markdown preview and 1-click download/copy to update your content without touching code.
- **GitHub Pages Ready**: Out-of-the-box support for `yourusername.github.io/meowking/` or a custom domain.
- **Theme Toggle**: Switch between Dark Mode (default obsidian & royal blue) and Light Mode (crisp retro paper) with persistent `localStorage`.
- **Offline Capable**: Double-click `index.html` on your computer to open and view the site locally without even running a web server!

---

## 📁 Project Structure

```
meowking/
├── assets/
│   ├── cat.jpg                  # Avatar image (gritty grainy kitten)
│   ├── button-meowking.svg      # Retro 88x31 "MEOWKING WEB SITE" button
│   └── button-private.svg       # Retro 88x31 "NO TRACK" badge
├── index.html                   # Main site HTML structure & SPA shell
├── style.css                    # Complete stylesheet & dark/light theme
├── content.js                   # THE CENTRALIZED DATA FILE (articles, notes, projects)
├── content.json                 # JSON mirror for automated tools / API backup
├── app.js                       # Routing engine, markdown renderer, theme & counter
├── editor.html                  # Visual Content Studio / Post Creator
├── .nojekyll                    # Tells GitHub Pages to serve all files as static
└── README.md                    # This documentation
```

---

## 🚀 How to Deploy to GitHub Pages

You can deploy this site to GitHub Pages in under 2 minutes.

### Option A: Using the GitHub Web Interface (No Git Required)

1. Log in to [GitHub](https://github.com/) and click **New repository**.
2. Name your repository `meowking` (or `yourusername.github.io` if you want it as your primary site).
3. Set the repository to **Public** and click **Create repository**.
4. On the repository page, click **uploading an existing file**.
5. Drag and drop all the files and folders from this folder (`index.html`, `style.css`, `content.js`, `app.js`, `editor.html`, `.nojekyll`, and the `assets/` folder).
6. Click **Commit changes**.
7. Go to **Settings** → **Pages** (in the left sidebar).
8. Under **Branch**, select `main` (or `master`), leave folder as `/ (root)`, and click **Save**.
9. In 1–2 minutes, your site will be live at:  
   `https://yourusername.github.io/meowking/` (or `https://yourusername.github.io/`)!

---

### Option B: Using Git in the Terminal

```bash
# 1. Navigate to the project directory
cd meowking

# 2. Initialize git repository
git init

# 3. Add all files and commit
git add .
git commit -m "Initial commit of meowking site"

# 4. Link to your GitHub repository
git branch -M main
git remote add origin https://github.com/yourusername/meowking.git

# 5. Push to GitHub
git push -u origin main
```

After pushing:
1. Open your repository on GitHub.
2. Go to **Settings** → **Pages**.
3. Under **Source**, select **Deploy from a branch**, choose `main` and `/ (root)`, then click **Save**.

---

## ✍️ Content Management: How to Add & Update Content

You **never** need to touch `index.html` or `style.css` to manage your content. Everything is driven by `content.js`.

### Method 1: Using the Visual Content Studio (`editor.html`)

1. Open `editor.html` directly in your browser.
2. Choose what you want to create:
   - **📝 New Article**: Write title, tags, and Markdown body with a live side-by-side preview.
   - **💬 New Note**: Add a quick thought or code snippet.
   - **🚀 New Project**: Add a portfolio item with tags, GitHub URL, and live demo link.
3. Click **Download updated content.js** and replace the existing `content.js` in your project!

---

### Method 2: Direct Editing of `content.js`

Open [content.js](content.js) in any code editor (Notepad, VS Code, etc.).

#### 1. Adding an Article
Inside the `articles: [ ... ]` array, add a new block:

```javascript
{
  id: "my-first-article",             // URL slug (e.g. #/articles/my-first-article)
  title: "My First Article Title",
  date: "2026-09-15",
  readTime: "4 min read",
  tags: ["security", "retro"],
  excerpt: "Short summary shown in preview cards.",
  coverImage: "assets/sample.jpg",     // Optional image
  content: `
### Heading 1

This is my post content written in Markdown!

- Bullet item
- Another item

\`\`\`python
def hello():
    print("Code snippets are supported!")
\`\`\`
  `
},
```

#### 2. Adding a Note
Inside the `notes: [ ... ]` array:

```javascript
{
  id: "note-005",
  date: "2026-09-15",
  tags: ["setup", "linux"],
  content: "Configured my backup cron job today using rsync."
},
```

#### 3. Adding a Project
Inside the `projects: [ ... ]` array:

```javascript
{
  id: "my-awesome-tool",
  title: "My Awesome Tool",
  status: "Active",                  // "Active", "W.I.P", or "Archived"
  statusType: "success",             // "success", "warning", or "neutral"
  description: "A fast terminal tool for querying DNS records.",
  tags: ["Rust", "Networking", "CLI"],
  github: "https://github.com/yourusername/tool",
  demo: "https://yourdemo.com",
  details: "Optional extra details about the project architecture."
},
```

#### 4. Adding Images
1. Save your image file into the `assets/` folder (e.g. `assets/my-diagram.png`).
2. Reference it in your article Markdown:
   ```markdown
   ![Diagram Description](assets/my-diagram.png)
   ```
   Or in standard HTML format:
   ```html
   <img src="assets/my-diagram.png" alt="Diagram" style="max-width: 100%; border: 1px solid var(--border-color);">
   ```

---

## 🎨 Customization

All site settings are organized in the `siteInfo` section of `content.js`:

| Setting | Description |
| :--- | :--- |
| `title` | Site brand name shown in header and tab title (default: `"meowking"`) |
| `tagline` | Header subtitle (default: `"my little corner of the internet"`) |
| `avatar` | Path to header avatar image (default: `"assets/cat.jpg"`) |
| `lastUpdated` | Formatted date displayed in the right sidebar (e.g. `"10 / 06 / 2004"`) |
| `siteStats` | Values for `pages`, `visitorsBase`, and `bugs` count |
| `randomThoughts` | Array of quotes/thoughts randomly shown on the homepage |
| `warningBox` | Header and text for the red callout box |
| `buttons` | 88x31 badges shown in the left column |

---

## 💻 Local Previewing

You can preview this site instantly in two ways:

1. **Directly**: Double-click `index.html` in Windows Explorer. It opens right in your default browser!
2. **Via Local Server**:
   ```bash
   # Using Python:
   python -m http.server 8000
   
   # Or using Node.js:
   npx serve .
   ```
   Then open `http://localhost:8000` in your browser.

---

## 📜 License

Created for the personal web. Free to use, adapt, and build upon.
