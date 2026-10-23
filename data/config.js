/**
 * MEOWKING - Site Configuration & Settings
 * -------------------------------------------------------------
 * Edit this file to customize site title, tagline, avatar,
 * stats, buttons, warning box, and random thoughts.
 */

window.SITE_CONFIG = {
  title: "meowking",
  tagline: "my little corner of the internet",
  author: "meowking",
  avatar: "assets/cat.jpg",
  copyrightYear: "2026",
  footerText: "best viewed without expectations",
  lastUpdated: "10 / 06 / 2004", // Retro format or dynamic date

  // Top & sidebar navigation links
  navLinks: [
    { id: "home", label: "home", href: "#/" },
    { id: "articles", label: "articles", href: "#/articles" },
    { id: "projects", label: "projects", href: "#/projects" },
    { id: "notes", label: "notes", href: "#/notes" },
    { id: "guestbook", label: "guestbook", href: "#/guestbook" },
    { id: "about", label: "about", href: "#/about" },
    { id: "links", label: "links", href: "#/links" }
  ],

  // Stats displayed in left sidebar
  siteStats: {
    pages: "08",
    articlesCount: "auto", // "auto" automatically counts from articles.js
    visitorsBase: 1337,    // Base counter; increments in browser localStorage
    bugs: "&infin;"
  },

  // Homepage welcome card
  welcome: {
    title: "welcome",
    paragraphs: [
      "Hello. You have somehow ended up on **meowking's little corner of the Internet**.",
      "This is a personal homepage, notebook, archive and dumping ground for things I find interesting.",
      "I write about technology, cybersecurity, the Internet, ideas, projects, and whatever else catches my attention.",
      "No particular reason for the cat. There just is one."
    ]
  },

  // Right sidebar "about me" snippet
  aboutSnippet: {
    title: "about me",
    greeting: 'I\'m <img src="assets/meowking-name.gif" alt="meowking" class="about-meowking-gif">',
    bio: "Interested in computers, cybersecurity, technology, the Internet and the weird things people do with them.",
    linkText: "more about me &rarr;",
    linkHref: "#/about"
  },

  // Red warning callout box
  warningBox: {
    title: "warning",
    text: "I have no idea what I'm doing."
  },

  // Random quotes displayed on the homepage
  randomThoughts: [
    "Everyone wants their website to look like an app now. I wanted mine to look like a website.",
    "A computer is like air conditioning: it becomes useless when you open Windows.",
    "The best documentation is written when you are angry that the previous documentation was wrong.",
    "90% of modern web performance issues can be solved by deleting JavaScript you never needed.",
    "If debugging is the process of removing software bugs, then programming must be the process of putting them in."
  ],

  // 88x31 retro pixel badges
  buttons: [
    {
      image: "assets/button-meowking.gif",
      alt: "MEOWKING Web Site",
      link: "#/"
    },
    {
      image: "assets/button-private.gif",
      alt: "No Tracking 100% Private",
      link: "#/"
    }
  ]
};
