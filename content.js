/**
 * MEWOKING - Content Aggregator & Bridge
 * -------------------------------------------------------------
 * Your data is now organized into separate, easy-to-edit files inside the /data folder:
 * 
 * 1. data/articles.js -> Add / remove / edit articles
 * 2. data/notes.js    -> Add / remove / edit quick notes
 * 3. data/projects.js -> Add / remove / edit portfolio projects
 * 4. data/about.js    -> Edit bio, interests, and hardware setup
 * 5. data/links.js    -> Edit categorized web directory
 * 6. data/config.js   -> Edit site title, stats, and quotes
 * 
 * This file automatically bundles them together.
 */

window.SITE_CONTENT = {
  get siteInfo() { return window.SITE_CONFIG || {}; },
  get articles() { return window.SITE_ARTICLES || []; },
  get notes() { return window.SITE_NOTES || []; },
  get projects() { return window.SITE_PROJECTS || []; },
  get about() { return window.SITE_ABOUT || {}; },
  get coolLinks() { return window.SITE_LINKS || []; }
};
