/**
 * MEWOKING - Client Application & Router
 * -------------------------------------------------------------
 * Powers dynamic routing, markdown parsing, theme toggling,
 * async article loading, and dropdown year filtering for GitHub Pages.
 */

(function () {
  'use strict';

  // Article content cache for fetched markdown files
  const articleContentCache = {};

  function getSiteData() {
    return {
      siteInfo: window.SITE_CONFIG || (window.SITE_CONTENT && window.SITE_CONTENT.siteInfo) || {},
      articles: window.SITE_ARTICLES || (window.SITE_CONTENT && window.SITE_CONTENT.articles) || [],
      notes: window.SITE_NOTES || (window.SITE_CONTENT && window.SITE_CONTENT.notes) || [],
      projects: window.SITE_PROJECTS || (window.SITE_CONTENT && window.SITE_CONTENT.projects) || [],
      about: window.SITE_ABOUT || (window.SITE_CONTENT && window.SITE_CONTENT.about) || {},
      coolLinks: window.SITE_LINKS || (window.SITE_CONTENT && window.SITE_CONTENT.coolLinks) || []
    };
  }

  // Helper to extract year from date string (YYYY-MM-DD or year field)
  function getYear(item) {
    if (item.year) return String(item.year);
    if (item.date) return String(item.date).slice(0, 4);
    return '2026';
  }

  // -----------------------------------------------------------
  // 1. Initialization
  // -----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initVisitorCounter();
    populateSiteInfo();
    window.addEventListener('hashchange', renderRoute);
    renderRoute();
  });

  // -----------------------------------------------------------
  // 2. Theme Toggle (Dark / Light)
  // -----------------------------------------------------------
  function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('mewoking_theme') || 'dark';
    setTheme(savedTheme);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mewoking_theme', theme);
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = theme === 'dark' ? 'light mode' : 'dark mode';
    }
  }

  // -----------------------------------------------------------
  // 3. Visitor Counter
  // -----------------------------------------------------------
  function initVisitorCounter() {
    const siteData = getSiteData();
    const baseCount = (siteData.siteInfo.siteStats && siteData.siteInfo.siteStats.visitorsBase) || 1337;
    let visits = parseInt(localStorage.getItem('mewoking_visits'), 10);

    if (isNaN(visits)) {
      visits = baseCount;
    } else {
      visits += 1;
    }
    localStorage.setItem('mewoking_visits', visits);

    const statVisitors = document.getElementById('stat-visitors');
    if (statVisitors) {
      statVisitors.textContent = String(visits).padStart(6, '0');
    }
  }

  // -----------------------------------------------------------
  // 4. Populate Site Info & Sidebars
  // -----------------------------------------------------------
  function populateSiteInfo() {
    const siteData = getSiteData();
    const info = siteData.siteInfo;

    const titleEl = document.getElementById('site-title');
    const taglineEl = document.getElementById('site-tagline');
    const avatarEl = document.getElementById('site-avatar');
    if (titleEl) titleEl.textContent = info.title || 'mewoking';
    if (taglineEl) taglineEl.textContent = info.tagline || 'my little corner of the internet';
    if (avatarEl && info.avatar) avatarEl.src = info.avatar;

    // Site Stats
    const pagesEl = document.getElementById('stat-pages');
    const articlesCountEl = document.getElementById('stat-articles');
    const bugsEl = document.getElementById('stat-bugs');
    if (pagesEl && info.siteStats) pagesEl.textContent = info.siteStats.pages || '07';
    if (bugsEl && info.siteStats) bugsEl.innerHTML = info.siteStats.bugs || '&infin;';
    if (articlesCountEl) {
      const count = (siteData.articles && siteData.articles.length) || 0;
      articlesCountEl.textContent = String(count).padStart(2, '0');
    }

    // Buttons / Badges
    const badgesShelf = document.getElementById('badges-shelf');
    if (badgesShelf && info.buttons && Array.isArray(info.buttons)) {
      badgesShelf.innerHTML = info.buttons
        .map(btn => `<a href="${btn.link || '#/'}" class="badge-item"><img src="${btn.image}" alt="${btn.alt || 'badge'}"></a>`)
        .join('');
    }

    // Right Sidebar
    const greetingEl = document.getElementById('about-snippet-greeting');
    const bioEl = document.getElementById('about-snippet-bio');
    const linkEl = document.getElementById('about-snippet-link');
    if (info.aboutSnippet) {
      if (greetingEl) greetingEl.innerHTML = `<strong>${escapeHtml(info.aboutSnippet.greeting)}</strong>`;
      if (bioEl) bioEl.textContent = info.aboutSnippet.bio;
      if (linkEl && info.aboutSnippet.linkText) linkEl.innerHTML = info.aboutSnippet.linkText;
    }

    const warningTextEl = document.getElementById('warning-text');
    if (warningTextEl && info.warningBox) {
      warningTextEl.textContent = info.warningBox.text || "I have no idea what I'm doing.";
    }

    const lastUpdatedEl = document.getElementById('stat-last-updated');
    if (lastUpdatedEl && info.lastUpdated) {
      lastUpdatedEl.textContent = info.lastUpdated;
    }

    // Footer
    const footerCopy = document.getElementById('footer-copy');
    const footerTagline = document.getElementById('footer-tagline');
    if (footerCopy) footerCopy.innerHTML = `&copy; ${info.copyrightYear || '2026'} ${escapeHtml(info.title || 'mewoking')}`;
    if (footerTagline && info.footerText) footerTagline.textContent = info.footerText;
  }

  // -----------------------------------------------------------
  // 5. Routing Engine
  // -----------------------------------------------------------
  function renderRoute() {
    const rawHash = window.location.hash || '';
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    let route = rawHash.replace(/^#\/?/, '').trim();
    if (!route) {
      const dataPage = document.body.getAttribute('data-page');
      route = dataPage || 'home';
    }

    updateActiveNav(route.split('/')[0]);

    if (route === 'home' || route === '') {
      renderHome(mainContent);
    } else if (route === 'articles') {
      renderArticles(mainContent);
    } else if (route.startsWith('articles/')) {
      const articleId = route.replace('articles/', '');
      renderArticleDetail(mainContent, articleId);
    } else if (route === 'notes') {
      renderNotes(mainContent);
    } else if (route === 'projects') {
      renderProjects(mainContent);
    } else if (route === 'about') {
      renderAbout(mainContent);
    } else if (route === 'links') {
      renderLinks(mainContent);
    } else {
      renderNotFound(mainContent);
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function updateActiveNav(activeKey) {
    const topLinks = document.querySelectorAll('#top-nav-list a');
    const sidebarLinks = document.querySelectorAll('#sidebar-nav-list a');

    [...topLinks, ...sidebarLinks].forEach(a => {
      const routeAttr = a.getAttribute('data-route');
      if (routeAttr === activeKey) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  }

  // -----------------------------------------------------------
  // 6. View Renderers
  // -----------------------------------------------------------

  // HOMEPAGE VIEW
  function renderHome(container) {
    const siteData = getSiteData();
    const info = siteData.siteInfo || {};
    const welcomeData = info.welcome || {
      title: "welcome",
      paragraphs: [
        "Hello. You have somehow ended up on **mewoking's little corner of the Internet**.",
        "This is a personal homepage, notebook, archive and dumping ground for things I find interesting.",
        "I write about technology, cybersecurity, the Internet, ideas, projects, and whatever else catches my attention.",
        "No particular reason for the cat. There just is one."
      ]
    };

    const welcomeHtml = `
      <div class="box box-welcome">
        <div class="box-header">${escapeHtml(welcomeData.title)}</div>
        <div class="box-content">
          ${welcomeData.paragraphs.map(p => `<p>${formatInlineMarkdown(p)}</p>`).join('')}
        </div>
      </div>
    `;

    const articles = (siteData.articles || []).slice(0, 3);
    let writingsHtmlContent = '';

    if (articles.length === 0) {
      writingsHtmlContent = `<p>Nothing to show!</p>`;
    } else {
      writingsHtmlContent = `
        <ul class="writings-list">
          ${articles.map(art => `
            <li class="writing-item">
              <a href="#/articles/${art.id}" class="writing-title-link">${escapeHtml(art.title)}</a>
              <div class="writing-meta">${art.date} · ${art.readTime || ''}</div>
            </li>
          `).join('')}
        </ul>
      `;
    }

    const writingsHtml = `
      <div class="box box-writings">
        <div class="box-header">latest writings</div>
        <div class="box-content">
          ${writingsHtmlContent}
          <div class="more-link-bar">
            <a href="#/articles" class="more-link">read all writings &rarr;</a>
          </div>
        </div>
      </div>
    `;

    const thoughts = info.randomThoughts || [
      "Everyone wants their website to look like an app now. I wanted mine to look like a website."
    ];
    const pickedThought = thoughts[Math.floor(Math.random() * thoughts.length)];

    const randomThoughtHtml = `
      <div class="box box-random-thought">
        <div class="box-header">random thought</div>
        <div class="box-content">
          <p class="random-thought-quote">"${escapeHtml(pickedThought)}"</p>
        </div>
      </div>
    `;

    container.innerHTML = welcomeHtml + writingsHtml + randomThoughtHtml;
  }

  // -----------------------------------------------------------
  // ARTICLES VIEW (With Search + Year Dropdown)
  // -----------------------------------------------------------
  function renderArticles(container) {
    const siteData = getSiteData();
    const articles = siteData.articles || [];

    // Calculate years ONLY if articles exist for that year
    const yearCounts = {};
    articles.forEach(a => {
      const yr = getYear(a);
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    });
    const yearsWithArticles = Object.keys(yearCounts).sort().reverse();

    let selectedYear = 'all';
    let searchQuery = '';

    container.innerHTML = `
      <div class="box">
        <div class="box-header">articles</div>
        <div class="box-content">

          <!-- <p class="buttons-note">Articles are loaded from markdown files in <code>articles/</code> and registered in <code>data/articles.js</code>.</p> -->
          
          <div class="filter-controls-row">
            <input type="text" id="article-search" class="filter-input" placeholder="Search articles by title, excerpt, or #tag...">
            
            <div class="filter-dropdown-wrapper">
              <label for="article-year-select" class="filter-label">Year:</label>
              <select id="article-year-select" class="retro-select">
                <option value="all">All Years (${articles.length})</option>
                ${yearsWithArticles.map(yr => `<option value="${yr}">${yr} (${yearCounts[yr]})</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="articles-container">
            ${renderArticleList(articles)}
          </div>
        </div>
      </div>
    `;

    function updateArticlesView() {
      const filtered = articles.filter(a => {
        const itemYear = getYear(a);
        const matchYear = selectedYear === 'all' || itemYear === selectedYear;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
          a.title.toLowerCase().includes(q) ||
          (a.excerpt || '').toLowerCase().includes(q) ||
          (a.tags || []).some(t => t.toLowerCase().includes(q));

        return matchYear && matchSearch;
      });

      const countEl = document.getElementById('articles-count');
      if (countEl) countEl.textContent = filtered.length;
      document.getElementById('articles-container').innerHTML = renderArticleList(filtered);
    }

    const searchInput = document.getElementById('article-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        updateArticlesView();
      });
    }

    const yearSelect = document.getElementById('article-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        updateArticlesView();
      });
    }
  }

  function renderArticleList(articles) {
    if (articles.length === 0) {
      return `<p style="color: var(--text-muted); padding: 14px 0;">No articles match your search or filter.</p>`;
    }
    return articles.map(art => `
      <article class="article-card">
        <h2 class="article-card-title">
          <a href="#/articles/${art.id}">${escapeHtml(art.title)}</a>
        </h2>
        <div class="article-card-meta">
          <span>📅 ${art.date}</span>
          ${art.readTime ? `<span>⏱️ ${escapeHtml(art.readTime)}</span>` : ''}
          ${art.file ? `<span style="color: var(--text-muted);">📄 ${escapeHtml(art.file)}</span>` : ''}
        </div>
        <p class="article-excerpt">${escapeHtml(art.excerpt || '')}</p>
        <div class="tag-list">
          ${(art.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}
        </div>
      </article>
    `).join('');
  }

  // -----------------------------------------------------------
  // ARTICLE DETAIL / READER VIEW (Async Markdown File Loading)
  // -----------------------------------------------------------
  async function renderArticleDetail(container, articleId) {
    const siteData = getSiteData();
    const article = (siteData.articles || []).find(a => a.id === articleId);

    if (!article) {
      container.innerHTML = `
        <div class="box">
          <div class="box-header">article not found</div>
          <div class="box-content">
            <p>The requested article could not be found.</p>
            <p><a href="#/articles" class="back-btn">&larr; back to articles</a></p>
          </div>
        </div>
      `;
      return;
    }

    // Show reader shell first
    container.innerHTML = `
      <div class="box article-full">
        <div class="box-header">reading: ${escapeHtml(article.title)}</div>
        <div class="box-content">
          <a href="#/articles" class="back-btn">&larr; back to articles</a>
          
          <h1 class="article-full-title">${escapeHtml(article.title)}</h1>
          <div class="article-card-meta">
            <span>Published: ${article.date}</span>
            ${article.readTime ? `<span>Reading time: ${escapeHtml(article.readTime)}</span>` : ''}
            ${article.file ? `<span>Source: <code>${escapeHtml(article.file)}</code></span>` : ''}
          </div>
          
          <div class="tag-list" style="margin-bottom: 16px;">
            ${(article.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}
          </div>

          <div class="article-body" id="article-markdown-body">
            <p style="color: var(--text-muted);">Loading article content...</p>
          </div>

          <div class="more-link-bar" style="margin-top: 24px;">
            <a href="#/articles" class="back-btn">&larr; back to all writings</a>
          </div>
        </div>
      </div>
    `;

    // Fetch markdown content from file if needed
    let rawContent = article.content || articleContentCache[article.id] || '';

    if (!rawContent && article.file) {
      try {
        const response = await fetch(article.file);
        if (response.ok) {
          rawContent = await response.text();
          articleContentCache[article.id] = rawContent;
        } else {
          rawContent = `*Could not load external file: ${article.file} (HTTP ${response.status})*`;
        }
      } catch (err) {
        // Fallback for file:/// protocol if CORS restricts local fetch
        rawContent = `*Note: To view external markdown files locally, run a lightweight local server (e.g. \`python -m http.server\` or \`npx serve\`). On GitHub Pages, this file will load automatically.*`;
      }
    }

    // Strip frontmatter if present (e.g. --- title: ... ---)
    if (rawContent.startsWith('---')) {
      const secondDivider = rawContent.indexOf('---', 3);
      if (secondDivider !== -1) {
        rawContent = rawContent.slice(secondDivider + 3).trim();
      }
    }

    const bodyEl = document.getElementById('article-markdown-body');
    if (bodyEl) {
      bodyEl.innerHTML = parseMarkdown(rawContent);
    }
  }

  // -----------------------------------------------------------
  // NOTES VIEW (With Search + Year Dropdown)
  // -----------------------------------------------------------
  function renderNotes(container) {
    const siteData = getSiteData();
    const notes = siteData.notes || [];

    // Calculate years ONLY if notes exist for that year
    const yearCounts = {};
    notes.forEach(n => {
      const yr = getYear(n);
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    });
    const yearsWithNotes = Object.keys(yearCounts).sort().reverse();

    let selectedYear = 'all';
    let searchQuery = '';

    container.innerHTML = `
      <div class="box">
        <div class="box-header">notes & thoughts</div>
        <div class="box-content">

          <!-- <p class="buttons-note">Quick thoughts, short observations, terminal snippets from <code>data/notes.js</code>.</p> -->
          
          <div class="filter-controls-row">
            <input type="text" id="note-search" class="filter-input" placeholder="Search notes by keyword or #tag...">
            
            <div class="filter-dropdown-wrapper">
              <label for="note-year-select" class="filter-label">Year:</label>
              <select id="note-year-select" class="retro-select">
                <option value="all">All Years (${notes.length})</option>
                ${yearsWithNotes.map(yr => `<option value="${yr}">${yr} (${yearCounts[yr]})</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="notes-feed" id="notes-container">
            ${renderNoteList(notes)}
          </div>
        </div>
      </div>
    `;

    function updateNotesView() {
      const filtered = notes.filter(n => {
        const itemYear = getYear(n);
        const matchYear = selectedYear === 'all' || itemYear === selectedYear;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
          n.content.toLowerCase().includes(q) ||
          (n.tags || []).some(t => t.toLowerCase().includes(q));

        return matchYear && matchSearch;
      });

      const countEl = document.getElementById('notes-count');
      if (countEl) countEl.textContent = filtered.length;
      document.getElementById('notes-container').innerHTML = renderNoteList(filtered);
    }

    const searchInput = document.getElementById('note-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        updateNotesView();
      });
    }

    const yearSelect = document.getElementById('note-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        updateNotesView();
      });
    }
  }

  function renderNoteList(notes) {
    if (notes.length === 0) {
      return `<p style="color: var(--text-muted); padding: 14px 0;">No notes match your filter or search.</p>`;
    }
    return notes.map(note => `
      <div class="note-item">
        <div class="note-meta">
          <span>📅 ${note.date}</span>
          <div class="tag-list">
            ${(note.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
        <div class="note-content">${formatInlineMarkdown(note.content)}</div>
      </div>
    `).join('');
  }

  // -----------------------------------------------------------
  // PROJECTS VIEW (With Search + Year Dropdown)
  // -----------------------------------------------------------
  function renderProjects(container) {
    const siteData = getSiteData();
    const projects = siteData.projects || [];

    // Calculate years ONLY if projects exist for that year
    const yearCounts = {};
    projects.forEach(p => {
      const yr = getYear(p);
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;
    });
    const yearsWithProjects = Object.keys(yearCounts).sort().reverse();

    let selectedYear = 'all';
    let searchQuery = '';

    container.innerHTML = `
      <div class="box">
        <div class="box-header">projects & software</div>
        <div class="box-content">

          <!-- <p class="buttons-note">Open-source tools, scripts, and software from <code>data/projects.js</code>.</p> -->
          
          <div class="filter-controls-row">
            <input type="text" id="project-search" class="filter-input" placeholder="Search projects by title, description, or tech stack...">
            
            <div class="filter-dropdown-wrapper">
              <label for="project-year-select" class="filter-label">Year:</label>
              <select id="project-year-select" class="retro-select">
                <option value="all">All Years (${projects.length})</option>
                ${yearsWithProjects.map(yr => `<option value="${yr}">${yr} (${yearCounts[yr]})</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="projects-grid" id="projects-container">
            ${renderProjectList(projects)}
          </div>
        </div>
      </div>
    `;

    function updateProjectsView() {
      const filtered = projects.filter(p => {
        const itemYear = getYear(p);
        const matchYear = selectedYear === 'all' || itemYear === selectedYear;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.details || '').toLowerCase().includes(q) ||
          (p.tags || []).some(t => t.toLowerCase().includes(q));

        return matchYear && matchSearch;
      });

      const countEl = document.getElementById('projects-count');
      if (countEl) countEl.textContent = filtered.length;
      document.getElementById('projects-container').innerHTML = renderProjectList(filtered);
    }

    const searchInput = document.getElementById('project-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        updateProjectsView();
      });
    }

    const yearSelect = document.getElementById('project-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        updateProjectsView();
      });
    }
  }

  function renderProjectList(projects) {
    if (projects.length === 0) {
      return `<p style="color: var(--text-muted); padding: 14px 0;">No projects match your filter or search.</p>`;
    }
    return projects.map(proj => {
      const statusClass = proj.statusType === 'warning' ? 'status-warning' : (proj.statusType === 'neutral' ? 'status-neutral' : 'status-success');
      const itemYear = getYear(proj);
      return `
        <div class="project-card">
          <div class="project-header">
            <h2 class="project-title">${escapeHtml(proj.title)} <span style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-muted); font-weight: normal;">(${itemYear})</span></h2>
            <span class="project-status ${statusClass}">${escapeHtml(proj.status || 'Active')}</span>
          </div>
          <p class="project-desc">${escapeHtml(proj.description)}</p>
          ${proj.details ? `<p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">${escapeHtml(proj.details)}</p>` : ''}
          <div class="tag-list">
            ${(proj.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
          <div class="project-links">
            ${proj.demo ? `<a href="${proj.demo}" target="_blank" rel="noopener">⚡ Live Demo</a>` : ''}
            ${proj.github ? `<a href="${proj.github}" target="_blank" rel="noopener">🐙 GitHub</a>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ABOUT VIEW
  function renderAbout(container) {
    const siteData = getSiteData();
    const about = siteData.about || {};

    container.innerHTML = `
      <div class="box">
        <div class="box-header">${escapeHtml(about.heading || 'about me')}</div>
        <div class="box-content">
          ${(about.bio || []).map(p => `<p>${formatInlineMarkdown(p)}</p>`).join('')}
          
          <h3 style="font-family: var(--font-ui); margin: 20px 0 8px 0; border-bottom: 1px solid var(--dotted-border); padding-bottom: 4px;">core interests</h3>
          <ul>
            ${(about.interests || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
          </ul>

          <h3 style="font-family: var(--font-ui); margin: 20px 0 8px 0; border-bottom: 1px solid var(--dotted-border); padding-bottom: 4px;">current setup</h3>
          <table class="setup-table">
            <tbody>
              ${(about.setup || []).map(item => `
                <tr>
                  <td>${escapeHtml(item.category)}</td>
                  <td><strong>${escapeHtml(item.value)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // LINKS VIEW
  function renderLinks(container) {
    const siteData = getSiteData();
    const linkCategories = siteData.coolLinks || [];

    container.innerHTML = `
      <div class="box">
        <div class="box-header">cool links & web directory</div>
        <div class="box-content">
        
          <!-- <p class="buttons-note">A curated archive of high-signal websites, personal blogs, and tools from <code>data/links.js</code>.</p> -->
        
          ${linkCategories.map(cat => `
            <div class="links-category">
              <h2 class="links-category-title">${escapeHtml(cat.category)}</h2>
              <div class="links-group">
                ${(cat.items || []).map(item => `
                  <div class="link-entry">
                    <a href="${item.url}" target="_blank" rel="noopener">&rarr; ${escapeHtml(item.name)}</a>
                    <span class="link-desc">— ${escapeHtml(item.description)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 404 VIEW
  function renderNotFound(container) {
    container.innerHTML = `
      <div class="box">
        <div class="box-header">404: page not found</div>
        <div class="box-content">
          <p>The page you requested does not exist or has moved.</p>
          <p><a href="#/" class="back-btn">&larr; return to homepage</a></p>
        </div>
      </div>
    `;
  }

  // -----------------------------------------------------------
  // 7. Micro Markdown Engine
  // -----------------------------------------------------------
  function parseMarkdown(md) {
    if (!md) return '';
    let text = md.replace(/\r\n/g, '\n').trim();

    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const index = codeBlocks.length;
      const cleanCode = escapeHtml(code.trim());
      codeBlocks.push(`<pre><code class="language-${lang}">${cleanCode}</code></pre>`);
      return `__CODE_BLOCK_${index}__`;
    });

    text = text.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    text = text.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
    text = formatInlineMarkdown(text);

    text = text.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    text = text.replace(/<\/ul>\s*<ul>/g, '');

    text = text.replace(/^\s*\d+\.\s+(.*$)/gim, '<oli>$1</oli>');
    text = text.replace(/<oli>(.*?)<\/oli>/g, '<li>$1</li>');
    text = text.replace(/(<li>[\s\S]*?<\/li>)/g, '<ol>$1</ol>');
    text = text.replace(/<\/ol>\s*<ol>/g, '');

    const paragraphs = text.split(/\n\n+/);
    text = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<blockquote>') || p.startsWith('__CODE_BLOCK_')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    codeBlocks.forEach((block, i) => {
      text = text.replace(`__CODE_BLOCK_${i}__`, block);
      text = text.replace(`<p>__CODE_BLOCK_${i}__</p>`, block);
    });

    return text;
  }

  window.parseMarkdownMicro = parseMarkdown;

  function formatInlineMarkdown(text) {
    if (!text) return '';
    text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
