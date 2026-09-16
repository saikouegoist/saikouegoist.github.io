/**
 * MEOWKING - Articles Collection
 * -------------------------------------------------------------
 * HOW TO ADD A NEW ARTICLE:
 * 1. Create a markdown file in the `articles/` folder (e.g. `articles/my-post.md`).
 * 2. Add an entry to the top of `window.SITE_ARTICLES` below:
 *
 *   {
 *     id: "my-post",
 *     title: "My Post Title",
 *     date: "2026-09-15",
 *     year: "2026",               // Optional: auto-detected from date
 *     readTime: "4 min read",
 *     tags: ["security", "retro"],
 *     excerpt: "Brief one-line summary of the post.",
 *     file: "articles/my-post.md"  // Path to your markdown file!
 *   },
 *
 * HOW TO REMOVE AN ARTICLE:
 * Simply delete its block from the list below (and optionally delete its .md file).
 */

window.SITE_ARTICLES = [
  {
    id: "retro-web-aesthetics",
    title: "Reclaiming the 90s Web Aesthetic",
    date: "2026-09-15",
    year: "2026",
    readTime: "1 min read",
    tags: ["retro", "css", "design"],
    excerpt: "Exploring the tactile charm of beveled buttons, royal blue headers, and dotted dividing lines.",
    file: "articles/retro-web-aesthetics.md",
    content: `### Why Retro Feels Authentic

The early web had personality because it was created by passionate individuals rather than corporate brand agencies.

Table borders, 88x31 pixel buttons, high-contrast title bars, and monospace counters communicated that a real human being was tinkering on the other end of the wire.

Bringing that spirit into the modern era gives us fast, lightweight, joyful spaces that respect user autonomy and bandwidth.`
  },
];
