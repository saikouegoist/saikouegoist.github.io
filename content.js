/**
 * MEOWKING - Content Aggregator & Bridge
 * -------------------------------------------------------------
 * Your data is now organized into separate, easy-to-edit files inside the /data folder:
 * 
 * 1. data/config.js         -> Edit site title, stats, and quotes
 * 2. data/articles.js       -> Add / remove / edit articles
 * 3. data/notes.js          -> Add / remove / edit quick notes
 * 4. data/projects.js       -> Add / remove / edit portfolio projects
 * 5. data/temples.js        -> Add / remove / edit temple pages
 * 6. data/about.js          -> Edit bio, interests, and hardware setup
 * 7. data/links.js          -> Edit categorized web directory
 * 8. data/guestbook.js      -> Seed entries for the guestbook
 * 9. data/gallery.js        -> Gallery manifest (auto-generated)
 * 10. data/music.js         -> Music manifest (auto-generated)
 * 11. data/firebase-config.js -> Firebase guestbook config
 * 
 * This file automatically bundles them together.
 */

window.SITE_CONTENT = {
  get siteInfo() { return window.SITE_CONFIG || {}; },
  get articles() { return window.SITE_ARTICLES || []; },
  get notes() { return window.SITE_NOTES || []; },
  get projects() { return window.SITE_PROJECTS || []; },
  get temples() { return window.SITE_TEMPLES || []; },
  get about() { return window.SITE_ABOUT || {}; },
  get coolLinks() { return window.SITE_LINKS || []; },
  get guestbook() { return window.SITE_GUESTBOOK || []; },
  get gallery() { return window.SITE_GALLERY || []; },
  get music() { return window.SITE_MUSIC || {}; }
};
