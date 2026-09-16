/**
 * MEOWKING - Client Application & Router
 * -------------------------------------------------------------
 * Powers dynamic routing, markdown parsing, theme toggling,
 * async article loading, and dropdown year filtering for GitHub Pages.
 */

(function () {
  'use strict';

  // Article content cache for fetched markdown files
  const articleContentCache = {};

  // Cleanup callback for any "reading mode" UI (e.g. the scroll progress
  // bar) set up by the current route, torn down before the next route renders.
  let readingModeCleanup = null;

  // Safe storage helper (prevents SecurityError crashes in private browsing or iframe contexts)
  const safeStorage = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, val) {
      try { localStorage.setItem(key, val); } catch (e) { }
    }
  };

  function getSiteData() {
    return {
      siteInfo: window.SITE_CONFIG || (window.SITE_CONTENT && window.SITE_CONTENT.siteInfo) || {},
      articles: window.SITE_ARTICLES || (window.SITE_CONTENT && window.SITE_CONTENT.articles) || [],
      notes: window.SITE_NOTES || (window.SITE_CONTENT && window.SITE_CONTENT.notes) || [],
      projects: window.SITE_PROJECTS || (window.SITE_CONTENT && window.SITE_CONTENT.projects) || [],
      about: window.SITE_ABOUT || (window.SITE_CONTENT && window.SITE_CONTENT.about) || {},
      coolLinks: window.SITE_LINKS || (window.SITE_CONTENT && window.SITE_CONTENT.coolLinks) || [],
      guestbook: window.SITE_GUESTBOOK || (window.SITE_CONTENT && window.SITE_CONTENT.guestbook) || []
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
    initPetCat();
    initMusicBox();
    window.addEventListener('hashchange', renderRoute);
    renderRoute();
  });

  // -----------------------------------------------------------
  // 2. Theme Toggle (Dark / Light)
  // -----------------------------------------------------------
  function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const savedTheme = safeStorage.get('meowking_theme') || 'dark';
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
    safeStorage.set('meowking_theme', theme);
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
    let visits = parseInt(safeStorage.get('meowking_visits'), 10);

    if (isNaN(visits)) {
      visits = baseCount;
    } else {
      visits += 1;
    }
    safeStorage.set('meowking_visits', visits);

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
    if (titleEl) titleEl.textContent = info.title || 'meowking';
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
      if (greetingEl) {
        if (info.aboutSnippet.greeting && info.aboutSnippet.greeting.includes('<')) {
          greetingEl.innerHTML = `<strong>${info.aboutSnippet.greeting}</strong>`;
        } else {
          greetingEl.innerHTML = `<strong>${escapeHtml(info.aboutSnippet.greeting)}</strong>`;
        }
      }
      if (bioEl) bioEl.textContent = info.aboutSnippet.bio;
      if (linkEl) {
        if (info.aboutSnippet.linkText) linkEl.innerHTML = info.aboutSnippet.linkText;
        if (info.aboutSnippet.linkHref) linkEl.href = info.aboutSnippet.linkHref;
      }
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
    if (footerCopy) footerCopy.innerHTML = `&copy; ${info.copyrightYear || '2026'} ${escapeHtml(info.title || 'meowking')}`;
    if (footerTagline && info.footerText) footerTagline.textContent = info.footerText;
  }

  // -----------------------------------------------------------
  // Interactive Pet Cat on Divider
  // -----------------------------------------------------------
  function initPetCat() {
    const dividerWrap = document.querySelector('.sidebar-pixel-divider-wrap');
    if (!dividerWrap) return;

    const purrSounds = ['♥ purr~', '✨ meow!', 'nya~ ★', 'purr... ♥', '=^.^='];
    let soundIndex = 0;

    dividerWrap.setAttribute('title', 'Click to pet me! =^.^=');
    dividerWrap.addEventListener('click', (e) => {
      const old = dividerWrap.querySelectorAll('.cat-floating-heart');
      old.forEach(el => el.remove());

      const msg = document.createElement('span');
      msg.className = 'cat-floating-heart';
      msg.textContent = purrSounds[soundIndex % purrSounds.length];
      soundIndex++;

      const rect = dividerWrap.getBoundingClientRect();
      const offsetX = e.clientX ? (e.clientX - rect.left) : (rect.width / 2);
      msg.style.left = Math.max(25, Math.min(rect.width - 25, offsetX)) + 'px';

      dividerWrap.appendChild(msg);
      setTimeout(() => msg.remove(), 1200);
    });
  }

  // -----------------------------------------------------------
  // Retro Japanese Music Box Engine (Classic & Anime Edition)
  // -----------------------------------------------------------
  function initMusicBox() {
    const playerEl = document.getElementById('box-music-player');
    const headerMusicBtn = document.getElementById('header-music-btn');
    if (!playerEl && !headerMusicBtn) return;

    const musicData = window.SITE_MUSIC;
    if (!musicData) return;

    // Elements
    const titleEl = document.getElementById('music-track-title');
    const artistEl = document.getElementById('music-track-artist');
    const extraEl = document.getElementById('music-track-extra');
    const counterEl = document.getElementById('music-track-counter');
    const vuMeterEl = document.getElementById('music-vu-meter');
    const modeIndicator = document.getElementById('music-mode-indicator');
    const btnClassic = document.getElementById('btn-mode-classic');
    const btnAnime = document.getElementById('btn-mode-anime');
    const btnPlay = document.getElementById('btn-music-play');
    const btnPrev = document.getElementById('btn-music-prev');
    const btnNext = document.getElementById('btn-music-next');
    const volumeSlider = document.getElementById('music-volume');
    const btnLoop = document.getElementById('btn-music-loop');

    // State
    let currentMode = safeStorage.get('meowking_music_mode') || 'classic';
    if (currentMode === 'classical') currentMode = 'classic';
    if (currentMode === 'songs') currentMode = 'anime';
    if (!musicData[currentMode]) currentMode = 'classic';

    let currentTrackIndex = 0;
    let isPlaying = false;
    let isLooping = safeStorage.get('meowking_music_loop') !== 'false'; // default true
    let volume = parseFloat(safeStorage.get('meowking_music_vol')) || 0.7;

    // Real Audio Player (HTML5 Audio)
    const audioPlayer = new Audio();
    audioPlayer.preload = 'auto';
    let loadedTrackFile = null;
    let vuInterval = null;

    const VU_PATTERNS = [
      '▰▱▱▱▱▱', '▰▰▱▱▱▱', '▰▰▰▱▱▱',
      '▰▰▰▰▱▱', '▰▰▰▰▰▱', '▰▰▰▰▰▰',
      '▱▰▰▰▰▱', '▱▱▰▰▱▱'
    ];

    function getTracks() {
      return (musicData[currentMode] && musicData[currentMode].length > 0)
        ? musicData[currentMode]
        : (musicData.classic || []);
    }

    function startVUMeter() {
      if (vuInterval) clearInterval(vuInterval);
      let step = 0;
      vuInterval = setInterval(() => {
        if (!isPlaying || !vuMeterEl) return;
        vuMeterEl.textContent = VU_PATTERNS[step % VU_PATTERNS.length];
        step++;
      }, 160);
    }

    function stopVUMeter() {
      if (vuInterval) {
        clearInterval(vuInterval);
        vuInterval = null;
      }
      if (vuMeterEl) vuMeterEl.textContent = '▱▱▱▱▱▱';
    }

    function updatePlayUI(playing) {
      isPlaying = playing;
      if (playing) {
        if (btnPlay) {
          btnPlay.textContent = '[⏸ PAUSE]';
          btnPlay.title = 'Pause playback';
        }
        if (headerMusicBtn) {
          headerMusicBtn.textContent = '⏸ pause music';
          headerMusicBtn.classList.add('playing');
        }
        if (playerEl) playerEl.classList.add('music-active');
        startVUMeter();
      } else {
        if (btnPlay) {
          btnPlay.textContent = '[▶ PLAY]';
          btnPlay.title = 'Start playback';
        }
        if (headerMusicBtn) {
          headerMusicBtn.textContent = '▶ play music';
          headerMusicBtn.classList.remove('playing');
        }
        if (playerEl) playerEl.classList.remove('music-active');
        stopVUMeter();
      }
    }

    // Audio Player events
    audioPlayer.addEventListener('ended', () => {
      if (isLooping) {
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(() => {});
      } else {
        selectTrack(currentTrackIndex + 1);
      }
    });

    audioPlayer.addEventListener('error', (e) => {
      console.warn('Audio playback error:', e);
      updatePlayUI(false);
    });

    function startPlayback() {
      const tracks = getTracks();
      const track = tracks[currentTrackIndex];
      if (!track) return;

      if (loadedTrackFile !== track.file) {
        audioPlayer.src = track.file;
        loadedTrackFile = track.file;
      }
      audioPlayer.volume = volume;
      audioPlayer.loop = isLooping;

      audioPlayer.play().then(() => {
        updatePlayUI(true);
      }).catch(err => {
        console.warn('Playback prevented or file error:', err);
        updatePlayUI(false);
      });
    }

    function stopPlayback() {
      try {
        audioPlayer.pause();
      } catch (e) { }
      updatePlayUI(false);
    }

    function togglePlayback() {
      if (isPlaying) {
        stopPlayback();
      } else {
        startPlayback();
      }
    }

    function updateTrackDisplay() {
      const tracks = getTracks();
      const track = tracks[currentTrackIndex] || tracks[0];
      if (!track) return;

      if (titleEl) titleEl.textContent = track.title;
      if (artistEl) artistEl.textContent = track.artist || '';
      if (extraEl) {
        extraEl.textContent = track.anime ? `[${track.anime}]` : (track.year ? `(${track.year})` : '');
      }
      if (counterEl) {
        counterEl.textContent = `${String(currentTrackIndex + 1).padStart(2, '0')}/${String(tracks.length).padStart(2, '0')}`;
      }

      if (btnClassic) btnClassic.classList.toggle('active', currentMode === 'classic');
      if (btnAnime) btnAnime.classList.toggle('active', currentMode === 'anime');
      if (modeIndicator) modeIndicator.textContent = currentMode === 'classic' ? 'CLASSIC' : 'ANIME';
    }

    function switchMode(newMode) {
      if (currentMode === newMode) {
        if (!isPlaying) {
          startPlayback();
        }
        return;
      }
      stopPlayback();
      currentMode = newMode;
      safeStorage.set('meowking_music_mode', currentMode);
      currentTrackIndex = 0;
      updateTrackDisplay();
      startPlayback();
    }

    function selectTrack(index) {
      const wasPlaying = isPlaying;
      stopPlayback();
      const tracks = getTracks();
      currentTrackIndex = (index + tracks.length) % tracks.length;
      updateTrackDisplay();
      if (wasPlaying) {
        startPlayback();
      }
    }

    // Event Listeners
    if (btnClassic) {
      btnClassic.addEventListener('click', () => switchMode('classic'));
    }
    if (btnAnime) {
      btnAnime.addEventListener('click', () => switchMode('anime'));
    }
    if (btnPlay) {
      btnPlay.addEventListener('click', togglePlayback);
    }
    if (headerMusicBtn) {
      headerMusicBtn.addEventListener('click', togglePlayback);
    }
    if (btnPrev) {
      btnPrev.addEventListener('click', () => selectTrack(currentTrackIndex - 1));
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => selectTrack(currentTrackIndex + 1));
    }
    if (volumeSlider) {
      volumeSlider.value = Math.round(volume * 100);
      volumeSlider.addEventListener('input', (e) => {
        volume = parseInt(e.target.value, 10) / 100;
        safeStorage.set('meowking_music_vol', volume);
        audioPlayer.volume = volume;
      });
    }
    if (btnLoop) {
      btnLoop.classList.toggle('active', isLooping);
      btnLoop.title = isLooping ? 'Loop: ON (Repeat track)' : 'Loop: OFF (Auto-advance)';
      btnLoop.addEventListener('click', () => {
        isLooping = !isLooping;
        safeStorage.set('meowking_music_loop', isLooping);
        audioPlayer.loop = isLooping;
        btnLoop.classList.toggle('active', isLooping);
        btnLoop.title = isLooping ? 'Loop: ON (Repeat track)' : 'Loop: OFF (Auto-advance)';
      });
    }

    // Initial render
    updateTrackDisplay();
  }






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

    // Tear down any reading-mode UI (e.g. the scroll progress bar) left
    // over from the previous route before rendering the new one.
    if (readingModeCleanup) {
      readingModeCleanup();
      readingModeCleanup = null;
    }

    // Distraction-free reading layout: hides the left/right sidebars and
    // footer, keeps the header/top-nav, and widens the article pane.
    const isArticleReading = route.startsWith('articles/');
    document.body.classList.toggle('reading-mode', isArticleReading);

    if (route === 'home' || route === '') {
      renderHome(mainContent);
    } else if (route === 'articles') {
      renderArticles(mainContent);
    } else if (isArticleReading) {
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
    } else if (route === 'guestbook') {
      renderGuestbook(mainContent);
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
        "Hello. You have somehow ended up on **meowking's little corner of the Internet**.",
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

          <p class="filter-count-line">Showing <span id="articles-count">${articles.length}</span> result(s)</p>

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
          <div class="reading-pane-inner">
            <a href="#/articles" class="back-btn">&larr; back to articles</a>

            <h1 class="article-full-title">${escapeHtml(article.title)}</h1>
            <div class="article-card-meta">
              <span>Published: ${article.date}</span>
              ${article.readTime ? `<span>Reading time: ${escapeHtml(article.readTime)}</span>` : ''}
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
      </div>
    `;

    // Set up the reading progress bar for this article; renderRoute() will
    // tear it down automatically when the visitor navigates away.
    readingModeCleanup = setupReadingProgressBar();

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

  // Thin fixed progress bar along the top of the viewport that fills up as
  // the visitor scrolls through the article. Returns a cleanup function
  // that removes the listeners and the bar itself.
  function setupReadingProgressBar() {
    const bar = document.createElement('div');
    bar.id = 'reading-progress-bar';
    document.body.appendChild(bar);

    const updateProgress = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
      bar.style.width = pct + '%';
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
      bar.remove();
    };
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

          <p class="filter-count-line">Showing <span id="notes-count">${notes.length}</span> result(s)</p>

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

          <p class="filter-count-line">Showing <span id="projects-count">${projects.length}</span> result(s)</p>

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

  // -----------------------------------------------------------
  // RETRO GUESTBOOK VIEW (Firebase Firestore + IRC Style)
  // -----------------------------------------------------------
  function renderGuestbook(container) {
    const siteData = getSiteData();
    const seedEntries = siteData.guestbook || [];

    // Helper: Deterministic IRC Nickname Color
    function getNickColorClass(name) {
      let hash = 0;
      const str = String(name || '');
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return `nick-color-${Math.abs(hash) % 8}`;
    }

    // Local storage helpers (offline / fallback cache)
    function getLocalEntries() {
      try {
        const raw = safeStorage.get('meowking_guestbook_entries');
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function saveLocalEntries(entries) {
      try {
        safeStorage.set('meowking_guestbook_entries', JSON.stringify(entries));
      } catch (e) {
        console.error('Failed to save to localStorage', e);
      }
    }

    // Get Firestore database instance safely
    function getDb() {
      if (window.FIREBASE_DB) return window.FIREBASE_DB;
      if (typeof firebase !== 'undefined' && firebase.firestore && firebase.apps.length > 0) {
        window.FIREBASE_DB = firebase.firestore();
        return window.FIREBASE_DB;
      }
      return null;
    }

    let firestoreEntries = [];
    let isConnectedToFirestore = false;
    let currentIcon = "🐱";
    // Whitelist of avatar icons offered by the UI. Any guestbook entry whose
    // `icon` field isn't one of these (e.g. crafted via a direct Firestore
    // write bypassing the form) falls back to the default cat icon instead
    // of being trusted/rendered as-is.
    const ALLOWED_GB_ICONS = ['🐱', '💾', '👾', '🌐', '📟', '☕', '⚡', '🕹️', '🔮', '⭐'];
    let searchQuery = "";
    let selectedIconFilter = "all";
    let selectedSortOrder = "newest";
    let selectedDateFilter = "all";

    // --- Client-side spam mitigation (cooldown + honeypot) ---
    // NOTE: this is a UX deterrent only, not a security boundary -- anyone
    // can bypass client JS entirely and call Firestore directly. The real
    // enforcement lives in firestore.rules on the backend.
    const GB_SUBMIT_COOLDOWN_MS = 45 * 1000; // 45 seconds between posts
    const GB_LAST_SUBMIT_KEY = 'meowking_gb_last_submit';
    const GB_SUBMIT_BTN_DEFAULT_HTML = '<span>[ ↵ TRANSMIT ENTRY ]</span>';
    let cooldownIntervalId = null;

    function getSubmitCooldownRemainingMs() {
      const last = parseInt(safeStorage.get(GB_LAST_SUBMIT_KEY), 10);
      if (isNaN(last)) return 0;
      return Math.max(0, GB_SUBMIT_COOLDOWN_MS - (Date.now() - last));
    }

    function startSubmitCooldownUI() {
      const submitBtn = document.getElementById('gb-submit-btn');
      if (!submitBtn) return;
      if (cooldownIntervalId) clearInterval(cooldownIntervalId);

      const tick = () => {
        const remaining = getSubmitCooldownRemainingMs();
        if (remaining <= 0) {
          clearInterval(cooldownIntervalId);
          cooldownIntervalId = null;
          submitBtn.disabled = false;
          submitBtn.innerHTML = GB_SUBMIT_BTN_DEFAULT_HTML;
          return;
        }
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>[ WAIT ${Math.ceil(remaining / 1000)}s ]</span>`;
      };

      tick();
      cooldownIntervalId = setInterval(tick, 500);
    }

    // Build DOM structure
    container.innerHTML = `
      <div class="box">
        <div class="box-header">
          <span>retro guestbook</span>
        </div>
        <div class="box-content">

          <div class="bbs-ascii-banner">
            <div class="bbs-banner-row">
              <span>◈ MEOWKING GUESTBOOK — public log buffer</span>
              <span id="bbs-status-text" class="bbs-status-badge bbs-status-offline">CONNECTING...</span>
            </div>
          </div>

          <div id="gb-alert-area"></div>
          

          <!-- BBS Sign Prompt Console (Terminal Form) -->
          <div class="bbs-prompt-box">
            <div class="bbs-prompt-header">
              <span class="bbs-prompt-header-title">&gt; SIGN_LOGBOOK</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">[LIVE SYNC]</span>
            </div>

            <div class="bbs-prompt-body">
              <form id="guestbook-form" autocomplete="off">
                <div class="bbs-terminal-input-row">
                  <div class="bbs-terminal-field">
                    <label for="gb-alias" class="bbs-terminal-label">
                      <span>Handle / Alias <span class="req">*</span></span>
                      <span style="font-size: 0.72rem;">(max 40 chars)</span>
                    </label>
                    <input type="text" id="gb-alias" class="bbs-terminal-input" placeholder="e.g. cyber_surfer" maxlength="40" required>
                  </div>

                  <div class="bbs-terminal-field">
                    <label for="gb-website" class="bbs-terminal-label">
                      <span>Personal Website / URL</span>
                      <span style="font-size: 0.72rem;">(optional)</span>
                    </label>
                    <input type="text" id="gb-website" class="bbs-terminal-input" placeholder="e.g. github.com/you" maxlength="120">
                  </div>
                </div>

                <!-- Honeypot field: hidden from real users via CSS. Bots that
                     blindly fill every input on the page will populate this,
                     letting the submit handler silently ignore the entry. -->
                <div class="gb-honeypot-field" aria-hidden="true">
                  <label for="gb-hp-website2">Leave this field blank</label>
                  <input type="text" id="gb-hp-website2" name="website2" tabindex="-1" autocomplete="off">
                </div>

                <!-- Avatar Icon Selector -->
                <div class="guestbook-icon-picker">
                  <label class="bbs-terminal-label" style="margin-bottom: 4px;">
                    <span>Choose Avatar Symbol:</span>
                  </label>
                  <div class="icon-selector-group" id="icon-selector-group">
                    <button type="button" class="icon-choice-btn selected" data-icon="🐱">🐱</button>
                    <button type="button" class="icon-choice-btn" data-icon="💾">💾</button>
                    <button type="button" class="icon-choice-btn" data-icon="👾">👾</button>
                    <button type="button" class="icon-choice-btn" data-icon="🌐">🌐</button>
                    <button type="button" class="icon-choice-btn" data-icon="📟">📟</button>
                    <button type="button" class="icon-choice-btn" data-icon="☕">☕</button>
                    <button type="button" class="icon-choice-btn" data-icon="⚡">⚡</button>
                    <button type="button" class="icon-choice-btn" data-icon="🕹️">🕹️</button>
                    <button type="button" class="icon-choice-btn" data-icon="🔮">🔮</button>
                    <button type="button" class="icon-choice-btn" data-icon="⭐">⭐</button>
                  </div>
                </div>

                <!-- Message Textarea -->
                <div class="bbs-terminal-field" style="margin-bottom: 12px;">
                  <label for="gb-message" class="bbs-terminal-label">
                    <span>Message<span class="req">*</span></span>
                    <span id="char-counter" class="char-counter">500 characters remaining</span>
                  </label>
                  <textarea id="gb-message" class="bbs-terminal-textarea" placeholder="&gt; Type greeting or comment to leave on the public logbook..." maxlength="500" required></textarea>
                </div>

                <div class="guestbook-footer-row">
                  <div style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">
                    ⚡ Transmitted immediately to Firebase Firestore. Markdown supported.
                  </div>
                  <button type="submit" id="gb-submit-btn" class="bbs-submit-btn">
                    <span>[ ↵ TRANSMIT ENTRY ]</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- BBS Multi-Filter & Search Toolbar -->
          <div class="bbs-filter-panel">
            <div class="bbs-filter-row-top">
              <div class="bbs-search-box">
                <span class="bbs-search-icon">🔍</span>
                <input type="text" id="gb-search-input" class="bbs-search-input" placeholder="Search by alias, message, or website...">
              </div>

              <div class="bbs-filter-dropdowns">
                <!-- Icon Filter -->
                <div class="bbs-select-wrapper">
                  <span>Icon:</span>
                  <select id="gb-icon-filter" class="bbs-select">
                    <option value="all">All Icons</option>
                    <option value="🐱">🐱 Cat</option>
                    <option value="💾">💾 Floppy</option>
                    <option value="👾">👾 Alien</option>
                    <option value="🌐">🌐 Web</option>
                    <option value="📟">📟 Pager</option>
                    <option value="☕">☕ Coffee</option>
                    <option value="⚡">⚡ Bolt</option>
                    <option value="🕹️">🕹️ Joy</option>
                    <option value="🔮">🔮 Orb</option>
                    <option value="⭐">⭐ Star</option>
                  </select>
                </div>

                <!-- Sort Order -->
                <div class="bbs-select-wrapper">
                  <span>Sort:</span>
                  <select id="gb-sort-select" class="bbs-select">
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>

                <!-- Date Range Filter -->
                <div class="bbs-select-wrapper">
                  <span>Time:</span>
                  <select id="gb-date-filter" class="bbs-select">
                    <option value="all">All Time</option>
                    <option value="7days">Past 7 Days</option>
                    <option value="30days">Past 30 Days</option>
                    <option value="thisYear">This Year</option>
                  </select>
                </div>

                <!-- Quick Action Buttons -->
                <button type="button" id="btn-export-gb" class="btn-retro-secondary" title="Export entries to JSON file">💾 Export</button>
                <button type="button" id="btn-refresh-gb" class="btn-retro-secondary" title="Reload from Firestore">🔄 Sync</button>
              </div>
            </div>

            <!-- Filter Status Line -->
            <div class="bbs-filter-info-bar">
              <span id="gb-count-indicator">Loading entries...</span>
              <span id="gb-filter-clear-span" style="display: none;">
                Filtered view active — <a href="javascript:void(0)" id="clear-all-filters-btn" class="bbs-filter-clear-link">Reset filters</a>
              </span>
            </div>
          </div>

          <!-- BBS / IRC Log Stream Container -->
          <div class="bbs-log-feed" id="guestbook-feed-container">
            <div style="padding: 24px; text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
              Connecting to Firebase Firestore buffer...
            </div>
          </div>

        </div>
      </div>
    `;

    // Date range filter helper
    function matchesDateFilter(timestampStr, filter) {
      if (filter === 'all' || !timestampStr) return true;
      try {
        const entryDate = new Date(timestampStr.replace(' ', 'T'));
        if (isNaN(entryDate.getTime())) return true;
        const now = new Date();
        const diffMs = now - entryDate;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (filter === '7days') return diffDays <= 7;
        if (filter === '30days') return diffDays <= 30;
        if (filter === 'thisYear') return entryDate.getFullYear() === now.getFullYear();
      } catch (e) {
        return true;
      }
      return true;
    }

    // Combine cloud, local, and seed entries
    function getAllCombinedEntries() {
      // If we have live Firestore entries, use them as primary
      if (firestoreEntries && firestoreEntries.length > 0) {
        return firestoreEntries;
      }

      // Check cached Firestore or local storage entries
      const locals = getLocalEntries();
      if (locals && locals.length > 0) {
        return [...locals, ...seedEntries];
      }

      return seedEntries;
    }

    // Render the BBS / IRC Log Feed
    function renderEntriesFeed() {
      const feedEl = document.getElementById('guestbook-feed-container');
      const countEl = document.getElementById('gb-count-indicator');
      const clearSpan = document.getElementById('gb-filter-clear-span');
      if (!feedEl) return;

      const all = getAllCombinedEntries();
      const query = searchQuery.toLowerCase().trim();

      const hasActiveFilter = Boolean(query || selectedIconFilter !== 'all' || selectedDateFilter !== 'all');
      if (clearSpan) {
        clearSpan.style.display = hasActiveFilter ? 'inline' : 'none';
      }

      // Filter entries
      let filtered = all.filter(item => {
        // Search query filter
        if (query) {
          const matchAlias = (item.alias || '').toLowerCase().includes(query);
          const matchMsg = (item.message || '').toLowerCase().includes(query);
          const matchWeb = (item.website || '').toLowerCase().includes(query);
          if (!matchAlias && !matchMsg && !matchWeb) return false;
        }

        // Icon filter
        if (selectedIconFilter !== 'all') {
          if (item.icon !== selectedIconFilter) return false;
        }

        // Date filter
        if (selectedDateFilter !== 'all') {
          if (!matchesDateFilter(item.timestamp, selectedDateFilter)) return false;
        }

        return true;
      });

      // Sort entries
      filtered.sort((a, b) => {
        const timeA = new Date(String(a.timestamp || '').replace(' ', 'T')).getTime() || 0;
        const timeB = new Date(String(b.timestamp || '').replace(' ', 'T')).getTime() || 0;
        return selectedSortOrder === 'oldest' ? timeA - timeB : timeB - timeA;
      });

      if (countEl) {
        countEl.textContent = `Showing ${filtered.length} of ${all.length} entries (${selectedSortOrder === 'newest' ? 'newest first' : 'oldest first'})`;
      }

      if (filtered.length === 0) {
        feedEl.innerHTML = `
          <div style="padding: 30px 20px; text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
            [NO MATCHING LOG ENTRIES FOUND IN BUFFER]<br>
            <span style="font-size: 0.8rem; margin-top: 6px; display: inline-block;">
              Try modifying your search or <a href="javascript:void(0)" id="feed-clear-filters-link" style="color: #38bdf8;">clearing active filters</a>.
            </span>
          </div>
        `;
        const link = document.getElementById('feed-clear-filters-link');
        if (link) {
          link.addEventListener('click', resetAllFilters);
        }
        return;
      }

      const totalCount = all.length;
      feedEl.innerHTML = filtered.map((entry, index) => {
        const entryNum = String(selectedSortOrder === 'newest' ? totalCount - index : index + 1).padStart(2, '0');
        const nickColorClass = getNickColorClass(entry.alias);

        // Format clean timestamp
        const tsDisplay = entry.timestamp ? entry.timestamp.slice(0, 16) : '2026-09-15 12:00';

        // Clean website link if present
        let websiteChipHtml = '';
        if (entry.website) {
          let url = entry.website.trim();
          if (!/^https?:\/\//i.test(url) && !url.startsWith('#')) {
            url = 'https://' + url;
          }
          const displayUrl = escapeHtml(entry.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''));
          websiteChipHtml = `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="bbs-site-link" title="Visit ${escapeHtml(entry.alias)}'s website">
              🌐 ${displayUrl} ↗
            </a>
          `;
        }

        const safeIcon = ALLOWED_GB_ICONS.includes(entry.icon) ? entry.icon : '🐱';
        const formattedMsg = formatInlineMarkdown(escapeHtml(entry.message));

        let sysopReplyHtml = '';
        if (entry.adminReply) {
          sysopReplyHtml = `
            <div class="bbs-sysop-reply">
              <span class="bbs-sysop-tag">*** [sysop note]:</span>
              ${formatInlineMarkdown(escapeHtml(entry.adminReply))}
            </div>
          `;
        }

        return `
          <div class="bbs-log-entry" id="entry-${escapeHtml(String(entry.id))}">
            <div class="bbs-log-meta-line">
              <span class="bbs-num">#${entryNum}</span>
              <span class="bbs-ts">[${escapeHtml(tsDisplay)}]</span>
              <span class="bbs-icon-tag">${escapeHtml(safeIcon)}</span>
              <span class="bbs-nick ${nickColorClass}">&lt;${escapeHtml(entry.alias)}&gt;</span>
              ${websiteChipHtml}
            </div>
            <div class="bbs-log-msg">${formattedMsg}</div>
            ${sysopReplyHtml}
          </div>
        `;
      }).join('');
    }

    // Reset all filter controls helper
    function resetAllFilters() {
      searchQuery = '';
      selectedIconFilter = 'all';
      selectedSortOrder = 'newest';
      selectedDateFilter = 'all';

      const sInput = document.getElementById('gb-search-input');
      const iSelect = document.getElementById('gb-icon-filter');
      const soSelect = document.getElementById('gb-sort-select');
      const dSelect = document.getElementById('gb-date-filter');

      if (sInput) sInput.value = '';
      if (iSelect) iSelect.value = 'all';
      if (soSelect) soSelect.value = 'newest';
      if (dSelect) dSelect.value = 'all';

      renderEntriesFeed();
    }

    const resetFiltersBtn = document.getElementById('clear-all-filters-btn');
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', resetAllFilters);
    }

    // Update connection status badge
    function updateConnectionStatus(isLive, customText) {
      const statusEl = document.getElementById('bbs-status-text');
      if (!statusEl) return;

      if (isLive) {
        statusEl.className = 'bbs-status-badge bbs-status-live';
        statusEl.textContent = customText || 'LIVE FIREBASE SYNC';
      } else {
        statusEl.className = 'bbs-status-badge bbs-status-offline';
        statusEl.textContent = customText || 'LOCAL BUFFER (OFFLINE)';
      }
    }

    // Setup Firebase Real-time Firestore Listener
    function setupFirestoreListener() {
      const db = getDb();
      if (!db) {
        console.warn("Firestore not available yet. Using local entries.");
        updateConnectionStatus(false, 'LOCAL STORAGE MODE');
        renderEntriesFeed();
        return;
      }

      try {
        updateConnectionStatus(false, 'CONNECTING...');

        // Subscribe to guestbook collection in real-time
        db.collection('guestbook').onSnapshot((snapshot) => {
          isConnectedToFirestore = true;
          updateConnectionStatus(true, 'LIVE FIREBASE SYNC');

          const entries = [];
          snapshot.forEach((doc) => {
            const d = doc.data();
            let tsStr = d.timestamp;
            if (!tsStr && d.createdAt && typeof d.createdAt.toDate === 'function') {
              const dateObj = d.createdAt.toDate();
              const pad = n => String(n).padStart(2, '0');
              tsStr = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
            }

            entries.push({
              id: doc.id,
              alias: d.alias || 'anonymous',
              icon: d.icon || '🐱',
              website: d.website || null,
              timestamp: tsStr || '2026-09-15 12:00:00',
              message: d.message || '',
              adminReply: d.adminReply || null,
              createdAt: d.createdAt
            });
          });

          // If collection is empty, include seed entries so the guestbook isn't empty
          if (entries.length === 0) {
            firestoreEntries = [...seedEntries];
          } else {
            firestoreEntries = entries;
          }

          // Cache to localStorage for offline fallback
          try {
            safeStorage.set('meowking_guestbook_cloud_cache', JSON.stringify(firestoreEntries));
          } catch (e) { }

          renderEntriesFeed();
        }, (error) => {
          console.warn("Firestore listener error (falling back to cached data):", error);
          updateConnectionStatus(false, 'FIRESTORE OFFLINE');
          renderEntriesFeed();
        });
      } catch (err) {
        console.error("Failed to attach Firestore listener:", err);
        updateConnectionStatus(false, 'FIRESTORE ERROR');
        renderEntriesFeed();
      }
    }

    // Icon Selector setup
    const iconButtons = container.querySelectorAll('.icon-choice-btn');
    iconButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        iconButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentIcon = btn.getAttribute('data-icon') || '🐱';
      });
    });

    // Character Counter
    const messageInput = document.getElementById('gb-message');
    const charCounter = document.getElementById('char-counter');
    if (messageInput && charCounter) {
      messageInput.addEventListener('input', () => {
        const remaining = 500 - messageInput.value.length;
        charCounter.textContent = `${remaining} characters remaining`;
        charCounter.style.color = remaining < 50 ? '#f87171' : 'var(--text-muted)';
      });
    }

    // Search input listener
    const searchInput = document.getElementById('gb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderEntriesFeed();
      });
    }

    // Icon filter listener
    const iconSelect = document.getElementById('gb-icon-filter');
    if (iconSelect) {
      iconSelect.addEventListener('change', (e) => {
        selectedIconFilter = e.target.value;
        renderEntriesFeed();
      });
    }

    // Sort order listener
    const sortSelect = document.getElementById('gb-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        selectedSortOrder = e.target.value;
        renderEntriesFeed();
      });
    }

    // Date filter listener
    const dateSelect = document.getElementById('gb-date-filter');
    if (dateSelect) {
      dateSelect.addEventListener('change', (e) => {
        selectedDateFilter = e.target.value;
        renderEntriesFeed();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh-gb');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        setupFirestoreListener();
        showAlert("Syncing latest log entries from Firebase...", "success");
      });
    }

    // Export Log button
    const exportBtn = document.getElementById('btn-export-gb');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const entries = getAllCombinedEntries();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(entries, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `meowking_guestbook_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      });
    }

    // Alert helper
    function showAlert(msg, type) {
      const alertArea = document.getElementById('gb-alert-area');
      if (!alertArea) return;
      alertArea.innerHTML = `
        <div class="guestbook-alert guestbook-alert-${type}">
          ${escapeHtml(msg)}
        </div>
      `;
      setTimeout(() => {
        if (alertArea) alertArea.innerHTML = '';
      }, 5000);
    }

    // Form Submission Handler (Transmits to Firebase Firestore)
    const form = document.getElementById('guestbook-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const aliasInput = document.getElementById('gb-alias');
        const websiteInput = document.getElementById('gb-website');
        const msgInput = document.getElementById('gb-message');
        const submitBtn = document.getElementById('gb-submit-btn');
        const honeypotInput = document.getElementById('gb-hp-website2');

        // Honeypot: real visitors never see or fill this field. If it has a
        // value, this is almost certainly a bot filling every input blindly.
        // Pretend success so the bot doesn't learn its submission was rejected.
        if (honeypotInput && honeypotInput.value.trim() !== '') {
          console.warn('Guestbook honeypot triggered -- submission silently ignored.');
          form.reset();
          showAlert("✓ Transmitted! Your entry is now permanently broadcast in the live Firebase guestbook.", "success");
          return;
        }

        // Client-side rate limit: block rapid-fire re-submissions.
        const cooldownRemaining = getSubmitCooldownRemainingMs();
        if (cooldownRemaining > 0) {
          showAlert(`Whoa, slow down! You can post again in ${Math.ceil(cooldownRemaining / 1000)}s.`, "error");
          startSubmitCooldownUI();
          return;
        }

        const alias = (aliasInput ? aliasInput.value : '').trim();
        let website = (websiteInput ? websiteInput.value : '').trim();
        const message = (msgInput ? msgInput.value : '').trim();

        if (!alias) {
          showAlert("Please enter your alias or nickname.", "error");
          aliasInput && aliasInput.focus();
          return;
        }

        if (!message) {
          showAlert("Please enter a message or comment.", "error");
          msgInput && msgInput.focus();
          return;
        }

        // Clean website
        if (website && !/^https?:\/\//i.test(website) && !website.startsWith('#')) {
          website = 'https://' + website;
        }

        // Format clean timestamp
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const newEntry = {
          alias: alias,
          icon: currentIcon,
          website: website || null,
          timestamp: timestamp,
          message: message,
          adminReply: null
        };

        // Disable button while transmitting
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span>[ TRANSMITTING... ]</span>`;
        }

        const db = getDb();
        let cloudSuccess = false;

        if (db) {
          try {
            const serverTs = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
              ? firebase.firestore.FieldValue.serverTimestamp()
              : new Date();

            const docRef = await db.collection('guestbook').add({
              ...newEntry,
              createdAt: serverTs
            });

            newEntry.id = docRef.id;
            cloudSuccess = true;
          } catch (err) {
            console.warn("Could not save to Firestore directly (offline or rules restricted), saving to local buffer:", err);
          }
        }

        // Always save to local backup as well
        if (!newEntry.id) {
          newEntry.id = 'user-' + Date.now();
        }
        const locals = getLocalEntries();
        locals.unshift(newEntry);
        saveLocalEntries(locals);

        // Reset form
        form.reset();
        if (charCounter) {
          charCounter.textContent = '500 characters remaining';
          charCounter.style.color = 'var(--text-muted)';
        }

        // Start the post-submit cooldown (keeps the button disabled with a
        // countdown instead of immediately allowing another post).
        safeStorage.set(GB_LAST_SUBMIT_KEY, String(Date.now()));
        startSubmitCooldownUI();

        // Reset search query to show newest entry
        searchQuery = '';
        if (searchInput) searchInput.value = '';
        renderEntriesFeed();

        // Highlight new entry
        setTimeout(() => {
          const newEl = document.getElementById(`entry-${newEntry.id}`);
          if (newEl) {
            newEl.classList.add('bbs-highlight-new');
            newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);

        if (cloudSuccess) {
          showAlert("✓ Transmitted! Your entry is now permanently broadcast in the live Firebase guestbook.", "success");
        } else {
          showAlert("✓ Saved to local buffer! (Live Firebase synchronization pending).", "success");
        }
      });
    }

    // If the page was reloaded shortly after a previous submission, reflect
    // the remaining cooldown on the button immediately instead of letting
    // it look ready to submit again.
    if (getSubmitCooldownRemainingMs() > 0) {
      startSubmitCooldownUI();
    }

    // Connect to Firestore and start listening
    setupFirestoreListener();
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
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Only allow safe URL schemes for markdown-style links. This blocks
    // javascript:, data:, vbscript:, etc. from being used to smuggle
    // executable code in via user-submitted content (e.g. the guestbook).
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const trimmedUrl = url.trim();
      const isSafe = /^(https?:|mailto:|#|\/)/i.test(trimmedUrl);
      const safeHref = isSafe ? trimmedUrl : '#';
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener">${label}</a>`;
    });
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
