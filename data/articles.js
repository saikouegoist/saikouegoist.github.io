/**
 * MEWOKING - Articles Collection
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
    readTime: "3 min read",
    tags: ["retro", "css", "design"],
    excerpt: "Exploring the tactile charm of beveled buttons, royal blue headers, and dotted dividing lines.",
  },
];
