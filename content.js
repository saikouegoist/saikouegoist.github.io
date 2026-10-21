/**
 * MEOWKING - Content Aggregator & Bridge
 * -------------------------------------------------------------
 * Your data is now organized into separate, easy-to-edit files inside the /data folder:
 * 
 * 1. data/config.js         -> Edit site title, stats, and quotes
 * 2. data/articles.js       -> Add / remove / edit articles
 * 3. data/projects.js       -> Add / remove / edit portfolio projects
 * 4. data/temples.js        -> Add / remove / edit temple pages
 * 5. data/about.js          -> Edit bio, interests, and hardware setup
 * 6. data/links.js          -> Edit categorized web directory
 * 7. data/guestbook.js      -> Seed entries for the guestbook
 * 8. data/gallery.js        -> Gallery manifest (auto-generated)
 * 9. data/music.js          -> Music manifest (auto-generated)
 * 10. data/firebase-config.js -> Firebase guestbook config
 * 
 * This file automatically bundles them together.
 */

window.SITE_CONTENT = {
  get siteInfo() { return window.SITE_CONFIG || {}; },
  get articles() { return window.SITE_ARTICLES || []; },
  get projects() { return window.SITE_PROJECTS || []; },
  get temples() { return window.SITE_TEMPLES || []; },
  get about() { return window.SITE_ABOUT || {}; },
  get coolLinks() { return window.SITE_LINKS || []; },
  get guestbook() { return window.SITE_GUESTBOOK || []; },
  get gallery() { return window.SITE_GALLERY || []; },
  get music() { return window.SITE_MUSIC || {}; },
  get tweets() { return window.SITE_TWEETS || []; }
};
