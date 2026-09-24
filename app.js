/**
 * MEOWKING - Client Application & Router (v2: isolated + future-proof)
 * -------------------------------------------------------------
 * Single-file, zero-dependency, classic-script safe (works on file://).
 *
 * Module map (all inside one IIFE, no globals leaked except the
 * documented window.*Micro helpers for editor.html):
 *   core      -> safeStorage, getSiteData, getYear, routeToken, cleanups
 *   chrome    -> theme, visitor, siteInfo/footer, pet, clock, ticker, fx, skin, konami
 *   music     -> initMusicBox (idempotent, self-contained Audio instance)
 *   gallery   -> renderGalleryBox/initGalleryBox + route-change cleanup
 *   lists     -> articles/notes/projects/about/links renderers + pager helpers
 *   reader    -> articleDetail (.md-only) / templeDetail + progress bar
 *   guestbook -> Firestore + local buffer, isolated per-route
 *   router    -> renderRoute (error-isolated per view) + nav state
 *   security  -> escapeHtml, safeHref, safeImageSrc, markdown parsers
 *
 * Future-proof rules:
 *   1. Each init is idempotent (dataset flag) and wrapped in safeCall so
 *      one broken widget can never kill the rest of the app.
 *   2. Route-scoped effects (gallery timer, lightbox, progress bar) are
 *      always torn down before the next route renders.
 *   3. Async .md fetches are guarded by routeToken (stale writes dropped).
 *   4. Never add top-level globals; expose only via window.Meowking.
 */

(function () {
  'use strict';

  // Article content cache for fetched markdown files
  const articleContentCache = {};

  // Cleanup callback for any "reading mode" UI (e.g. the scroll progress
  // bar) set up by the current route, torn down before the next route renders.
  let readingModeCleanup = null;

  // Cleanup callback for gallery autoplay + lightbox, torn down on
  // route change so the 3s slideshow never keeps ticking off-home.
  let galleryCleanup = null;

  // Cleanup for guestbook route effects (Firestore listener + cooldown
  // timer). Separate from readingModeCleanup so the two can never
  // overwrite each other.
  let guestbookCleanup = null;

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
      temples: window.SITE_TEMPLES || (window.SITE_CONTENT && window.SITE_CONTENT.temples) || [],
      about: window.SITE_ABOUT || (window.SITE_CONTENT && window.SITE_CONTENT.about) || {},
      coolLinks: window.SITE_LINKS || (window.SITE_CONTENT && window.SITE_CONTENT.coolLinks) || [],
      guestbook: window.SITE_GUESTBOOK || (window.SITE_CONTENT && window.SITE_CONTENT.guestbook) || [],
      gallery: window.SITE_GALLERY || (window.SITE_CONTENT && window.SITE_CONTENT.gallery) || [],
      music: window.SITE_MUSIC || (window.SITE_CONTENT && window.SITE_CONTENT.music) || null
    };
  }

  // Helper to extract year from date string (YYYY-MM-DD or year field)
  function getYear(item) {
    if (item.year) return String(item.year);
    if (item.date) return String(item.date).slice(0, 4);
    return String(new Date().getFullYear());
  }

  // Navigation token: incremented on every route change so async
  // article/temple fetches from a previous page can never overwrite
  // the current page when they resolve out of order.
  let routeToken = 0;

  // Public, conflict-free namespace. Nothing else writes here.
  window.Meowking = window.Meowking || {};
  window.Meowking.version = '2.0.0';

  // Run one init without letting it break the others. Returns the
  // function's result (or undefined on failure) and logs a warning.
  function safeCall(name, fn) {
    try {
      return fn();
    } catch (err) {
      console.warn('Meowking init skipped [' + name + ']:', err);
      return undefined;
    }
  }

  // Idempotency guard for global (non-route) widgets. Route widgets use
  // explicit cleanup callbacks instead (galleryCleanup/readingModeCleanup).
  function once(key) {
    try {
      if (document.body.dataset['init_' + key]) return false;
      document.body.dataset['init_' + key] = '1';
      return true;
    } catch (e) {
      return true;
    }
  }

  // -----------------------------------------------------------
  // 1. Initialization (each widget isolated; hash listener added once)
  // -----------------------------------------------------------
  // Prevent clicking swastika badge from triggering parent brand link navigation
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('.header-swastika-badge')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    // editor.html sets window.MEOWKING_NOAUTOINIT before loading this file:
    // it only needs the markdown/security helpers below, never the live site.
    if (window.MEOWKING_NOAUTOINIT) return;
    if (!once('boot')) { safeCall('route', () => renderRoute()); return; }
    safeCall('theme', initTheme);
    safeCall('visitors', initVisitorCounter);
    safeCall('siteInfo', populateSiteInfo);
    safeCall('pet', initPetCat);
    safeCall('clock', initRetroClock);
    safeCall('ticker', initRetroTicker);
    safeCall('music', initMusicBox);
    safeCall('mobile', initMobileChrome);
    safeCall('fx', initFx);
    safeCall('skin', initSkin);
    safeCall('konami', initKonami);
    if (!window.__meowkingHashBound) {
      window.__meowkingHashBound = true;
      window.addEventListener('hashchange', () => safeCall('route', renderRoute));
    }
    safeCall('route', renderRoute);
  });

  // -----------------------------------------------------------
  // 2. Theme Toggle (Dark / Light)
  // -----------------------------------------------------------
  function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const stored = safeStorage.get('meowking_theme');
    let startTheme = stored || 'dark';

    // Night-owl auto mode: first-time visitors (no stored choice) landing
    // between 10pm and 6am get dark theme plus an owl badge. Any manual
    // toggle writes the key and permanently wins over the auto behavior.
    if (!stored) {
      const hour = new Date().getHours();
      if (hour >= 22 || hour < 6) {
        startTheme = 'dark';
        if (toggleBtn && toggleBtn.parentElement && !document.getElementById('night-owl-badge')) {
          const badge = document.createElement('span');
          badge.id = 'night-owl-badge';
          badge.className = 'night-owl-badge';
          badge.textContent = '🦉 night owl';
          toggleBtn.parentElement.appendChild(badge);
        }
      }
    }

    setTheme(startTheme);

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
      toggleBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
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
    // Bugs stat supports HTML entities (default "&infin;") but must never
    // execute markup: allow entities/text only, escape anything with tags.
    if (bugsEl && info.siteStats) {
      const bugsRaw = String(info.siteStats.bugs || '&infin;');
      bugsEl.innerHTML = /[<>]/.test(bugsRaw) ? escapeHtml(bugsRaw) : bugsRaw;
    }
    if (articlesCountEl) {
      const count = (siteData.articles && siteData.articles.length) || 0;
      articlesCountEl.textContent = String(count).padStart(2, '0');
    }

    // Buttons / Badges
    const badgesShelf = document.getElementById('badges-shelf');
    if (badgesShelf && info.buttons && Array.isArray(info.buttons)) {
      badgesShelf.innerHTML = info.buttons
        .map(btn => `<a href="${escapeHtml(safeHref(btn.link, '#/'))}" class="badge-item"><img src="${escapeHtml(safeImageSrc(btn.image, 'assets/cat.jpg'))}" alt="${escapeHtml(btn.alt || 'badge')}"></a>`)
        .join('');
    }

    // Right Sidebar
    const greetingEl = document.getElementById('about-snippet-greeting');
    const bioEl = document.getElementById('about-snippet-bio');
    const linkEl = document.getElementById('about-snippet-link');
    if (info.aboutSnippet) {
      if (greetingEl) {
        // Greeting may intentionally contain a single <img> (animated
        // name gif). Anything else is escaped to block stored XSS via config.
        greetingEl.innerHTML = `<strong>${sanitizeGreeting(info.aboutSnippet.greeting)}</strong>`;
      }
      if (bioEl) bioEl.textContent = info.aboutSnippet.bio;
      if (linkEl) {
        if (info.aboutSnippet.linkText) linkEl.textContent = info.aboutSnippet.linkText;
        if (info.aboutSnippet.linkHref) linkEl.href = safeHref(info.aboutSnippet.linkHref, '#/about');
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

    // Footer (rendered by updateFooter, refreshed on every route change)
    updateFooter();
  }

  // -----------------------------------------------------------
  // Footer (with a discreet studio shortcut on the links page)
  // -----------------------------------------------------------
  function currentRouteKey() {
    const rawHash = window.location.hash || '';
    if (!rawHash) {
      return document.body.getAttribute('data-page') || 'home';
    }
    const h = rawHash.replace(/^#\/?/, '').trim();
    if (!h) return 'home';
    return h.split('/')[0];
  }

  // Re-rendered on every route change: on #/links the © becomes a little
  // gif button to the content studio (editor.html), everywhere else the
  // classic text line is shown.
  function updateFooter() {
    const siteData = getSiteData();
    const info = siteData.siteInfo || {};
    const footerCopy = document.getElementById('footer-copy');
    const footerTagline = document.getElementById('footer-tagline');
    if (footerTagline && info.footerText) footerTagline.textContent = info.footerText;
    if (!footerCopy) return;
    const safeYear = escapeHtml(info.copyrightYear || '2026');
    if (currentRouteKey() === 'links') {
      footerCopy.innerHTML = `<a href="editor.html" class="footer-copy-gif-link" title="studio"><img src="assets/studio-pen.gif" class="footer-copy-gif" alt="©"></a> ${safeYear} ${escapeHtml(info.title || 'meowking')}`;
    } else {
      footerCopy.innerHTML = `&copy; ${safeYear} ${escapeHtml(info.title || 'meowking')}`;
    }
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
  // Retro Background Stars + System Time Clock Widget
  // -----------------------------------------------------------
  function initRetroClock() {
    if (!once('clock')) return;
    const timeEl = document.getElementById('retro-clock-time');
    if (!timeEl) return;
    const pad = (n) => String(n).padStart(2, '0');
    function tick() {
      const now = new Date();
      // Colons ride in spans so CSS can blink them like a 90s LCD.
      // pad() output is digits only, safe for innerHTML.
      timeEl.innerHTML = pad(now.getHours()) +
        '<span class="clock-colon">:</span>' + pad(now.getMinutes()) +
        '<span class="clock-colon">:</span>' + pad(now.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  }

  // Seasonal ticker suffix, zero assets needed. Updates itself by month.
  function getSeasonalBit() {
    const m = new Date().getMonth();
    if (m === 9) return '★ 🎃 SPOOKY SEASON ON THIS SITE ★&nbsp;&nbsp;&nbsp;';
    if (m === 11) return '★ ❄ HAPPY HOLIDAYS FROM MEOWKING ★&nbsp;&nbsp;&nbsp;';
    if (m === 0) return '★ 🎆 NEW YEAR, SAME BUGS ★&nbsp;&nbsp;&nbsp;';
    if (m === 2 || m === 3) return '★ 🌸 SPRING PATCH TUESDAY ★&nbsp;&nbsp;&nbsp;';
    if (m >= 5 && m <= 7) return '★ ☀ SUMMER UPTIME ★&nbsp;&nbsp;&nbsp;';
    return '';
  }


  // Retro marquee ticker, driven by rAF so it scrolls even where CSS
  // animations are disabled. Pauses while hovered, like holding a marquee.
  function initRetroTicker() {
    if (!once('ticker')) return;
    const track = document.querySelector('.retro-ticker-track');
    const bar = document.querySelector('.retro-ticker');
    if (!track || !bar || track.dataset.tickerOn) return;
    track.dataset.tickerOn = '1';

    // Inject seasonal bits into BOTH spans equally so the
    // half-width seamless loop keeps working.
    const spans = track.querySelectorAll('span');
    const baseHtml = spans.length > 0 ? spans[0].innerHTML : '';
    function refreshTickerExtras() {
      const extra = getSeasonalBit();
      spans.forEach(sp => { sp.innerHTML = baseHtml + extra; });
    }
    refreshTickerExtras();
    const tickerRefreshId = setInterval(refreshTickerExtras, 60000);

    let paused = false;
    let x = 0;
    let last = performance.now();
    const SPEED_PX_PER_SEC = 45;
    // Gentler (not frozen) when the OS asks for reduced motion, so the
    // ticker still visibly scrolls instead of looking broken.
    const reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const speed = reduceMotion ? 15 : SPEED_PX_PER_SEC;
    document.addEventListener('visibilitychange', () => { last = performance.now(); });
    bar.addEventListener('mouseenter', () => { paused = true; });
    bar.addEventListener('mouseleave', () => { paused = false; });
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Never burn CPU while the tab is hidden; rAF is already throttled
      // there but the 60s refresh interval above keeps content fresh.
      if (!paused && !document.hidden) {
        const half = track.scrollWidth / 2;
        if (half > 0) {
          x -= speed * dt;
          if (-x >= half) x += half;
          track.style.transform = 'translate3d(' + x + 'px,0,0)';
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // -----------------------------------------------------------
  // Retro Japanese Music Box Engine (Classic, Anime & Others)
  // -----------------------------------------------------------
  function initMusicBox() {
    if (!once('music')) return;
    const playerEl = document.getElementById('box-music-player');
    const headerMusicBtn = document.getElementById('header-music-btn');
    if (!playerEl && !headerMusicBtn) return;

    const musicData = getSiteData().music || window.SITE_MUSIC;
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
    const btnOthers = document.getElementById('btn-mode-others');
    const btnPlay = document.getElementById('btn-music-play');
    const btnPrev = document.getElementById('btn-music-prev');
    const btnNext = document.getElementById('btn-music-next');
    const volumeSlider = document.getElementById('music-volume');
    const muteBtn = document.getElementById('music-mute');
    const volPct = document.getElementById('music-vol-pct');
    const legacyGlyph = document.querySelector('.music-vol-glyph');
    const btnLoop = document.getElementById('btn-music-loop');
    const dancerSprite = document.getElementById('music-dancer-sprite');
    const dancerStage = document.getElementById('music-dancer-stage');
    const dancerStatus = document.getElementById('music-dancer-status');

    // State
    let currentMode = safeStorage.get('meowking_music_mode') || 'classic';
    if (currentMode === 'classical') currentMode = 'classic';
    if (currentMode === 'songs') currentMode = 'anime';
    if (!['classic', 'anime', 'others'].includes(currentMode)) currentMode = 'classic';
    if (!musicData[currentMode]) currentMode = 'classic';

    let currentTrackIndex = 0;
    let isPlaying = false;
    let isLooping = safeStorage.get('meowking_music_loop') !== 'false'; // default true
    let volume = parseFloat(safeStorage.get('meowking_music_vol'));
    if (!isFinite(volume)) volume = 0.7;
    volume = Math.min(1, Math.max(0, volume));
    let lastVolume = volume > 0 ? volume : 0.7;

    // Real Audio Player (HTML5 Audio)
    const audioPlayer = new Audio();
    audioPlayer.preload = 'auto';
    let loadedTrackFile = null;
    let vuInterval = null;

    const DANCER_GROOVES = [
      '♪ dancing to the beat! ♪',
      'groovin\' =^.^= ♪',
      '♪ 90s retro vibes ♪',
      'feel the rhythm! ♪♫'
    ];
    let grooveIdx = 0;

    const VU_PATTERNS = [
      '▰▱▱▱▱▱', '▰▰▱▱▱▱', '▰▰▰▱▱▱',
      '▰▰▰▰▱▱', '▰▰▰▰▰▱', '▰▰▰▰▰▰',
      '▱▰▰▰▰▱', '▱▱▰▰▱▱'
    ];

    function getTracks() {
      const modeTracks = musicData[currentMode];
      // Return the mode's own list even when empty, so an empty category
      // honestly shows "-- no tracks --" instead of borrowing classic's.
      // Only fall back for legacy manifests missing the key entirely.
      if (Array.isArray(modeTracks)) return modeTracks;
      return Array.isArray(musicData.classic) ? musicData.classic : [];
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
      const miniPlay = document.getElementById('minibar-play');
      const miniBar = document.getElementById('music-minibar');
      const miniVu = document.getElementById('minibar-vu');
      if (playing) {
        if (btnPlay) {
          btnPlay.textContent = '[⏸ PAUSE]';
          btnPlay.title = 'Pause playback';
        }
        if (headerMusicBtn) {
          headerMusicBtn.textContent = '⏸';
          headerMusicBtn.setAttribute('aria-label', 'Pause music');
          headerMusicBtn.title = 'Pause music';
          headerMusicBtn.classList.add('playing');
        }
        if (playerEl) playerEl.classList.add('music-active');
        if (dancerSprite) {
          dancerSprite.src = 'assets/dancer-playing.gif';
        }
        if (dancerStage) {
          dancerStage.classList.add('is-dancing');
        }
        if (dancerStatus) {
          dancerStatus.textContent = DANCER_GROOVES[grooveIdx % DANCER_GROOVES.length];
          grooveIdx++;
        }
        if (miniPlay) {
          miniPlay.textContent = '⏸';
          miniPlay.setAttribute('aria-label', 'Pause music');
        }
        if (miniBar) miniBar.classList.add('is-playing');
        if (miniVu) miniVu.textContent = '▰▰▰';
        startVUMeter();
      } else {
        if (btnPlay) {
          btnPlay.textContent = '[▶ PLAY]';
          btnPlay.title = 'Start playback';
        }
        if (headerMusicBtn) {
          headerMusicBtn.textContent = '▶';
          headerMusicBtn.setAttribute('aria-label', 'Play music');
          headerMusicBtn.title = 'Play music';
          headerMusicBtn.classList.remove('playing');
        }
        if (playerEl) playerEl.classList.remove('music-active');
        if (dancerSprite) {
          dancerSprite.src = 'assets/dancer-stopped.gif';
        }
        if (dancerStage) {
          dancerStage.classList.remove('is-dancing');
        }
        if (dancerStatus) {
          dancerStatus.textContent = '[...ohh, music stopped :3]';
        }
        if (miniPlay) {
          miniPlay.textContent = '▶';
          miniPlay.setAttribute('aria-label', 'Play music');
        }
        if (miniBar) miniBar.classList.remove('is-playing');
        if (miniVu) miniVu.textContent = '▱▱▱';
        stopVUMeter();
      }
    }

    // Audio Player events
    audioPlayer.addEventListener('ended', () => {
      const tracks = getTracks();
      if (isLooping) {
        try { audioPlayer.currentTime = 0; } catch (e) { }
        audioPlayer.play().catch(() => { updatePlayUI(false); });
      } else if (currentTrackIndex < tracks.length - 1) {
        // Auto-advance, but stop at the end of the playlist (no wrap).
        selectTrack(currentTrackIndex + 1);
      } else {
        updatePlayUI(false);
      }
    });

    audioPlayer.addEventListener('error', (e) => {
      console.warn('Audio playback error:', e);
      // Drop the poisoned src so the next retry reloads instead of
      // re-playing a failed buffer forever.
      loadedTrackFile = null;
      try { audioPlayer.removeAttribute('src'); audioPlayer.load(); } catch (err) { }
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
      audioPlayer.volume = Math.min(1, Math.max(0, volume));
      audioPlayer.loop = isLooping;

      // Older browsers return undefined instead of a promise here.
      let playResult = null;
      try {
        playResult = audioPlayer.play();
      } catch (err) {
        console.warn('Playback prevented or file error:', err);
        updatePlayUI(false);
        return;
      }
      if (playResult && typeof playResult.then === 'function') {
        playResult.then(() => {
          updatePlayUI(true);
        }).catch(err => {
          console.warn('Playback prevented or file error:', err);
          updatePlayUI(false);
        });
      } else {
        updatePlayUI(true);
      }
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
      const miniBar = document.getElementById('music-minibar');
      const miniTitle = document.getElementById('minibar-title');
      const syncMini = (text) => {
        if (miniTitle) miniTitle.textContent = text;
        if (miniBar) {
          miniBar.hidden = false;
          try { document.body.classList.add('has-minibar'); } catch (e) { /* non-critical */ }
        }
      };
      if (!track) {
        if (titleEl) titleEl.textContent = '-- no tracks --';
        if (artistEl) artistEl.textContent = '';
        if (extraEl) extraEl.textContent = '';
        if (counterEl) counterEl.textContent = '00/00';
        syncMini('-- no tracks --');
        return;
      }

      if (titleEl) titleEl.textContent = track.title || '';
      if (artistEl) artistEl.textContent = track.artist || '';
      if (extraEl) {
        if (track.anime) {
          extraEl.textContent = `[${track.anime}]`;
        } else if (track.year) {
          // Numeric years render as (1979); free-form subtitles
          // (e.g. Japanese titles stored in year) render bare.
          const y = String(track.year);
          extraEl.textContent = /^\d{3,4}[a-z]?$/i.test(y.trim()) ? `(${y})` : y;
        } else {
          extraEl.textContent = '';
        }
      }
      if (counterEl) {
        counterEl.textContent = `${String(currentTrackIndex + 1).padStart(2, '0')}/${String(tracks.length).padStart(2, '0')}`;
      }

      if (btnClassic) btnClassic.classList.toggle('active', currentMode === 'classic');
      if (btnAnime) btnAnime.classList.toggle('active', currentMode === 'anime');
      if (btnOthers) btnOthers.classList.toggle('active', currentMode === 'others');
      if (modeIndicator) modeIndicator.textContent = currentMode.toUpperCase();
      syncMini(`${track.title || 'Untitled'} — ${track.artist || ''}`.trim());
    }

    function switchMode(newMode) {
      if (currentMode === newMode) {
        if (!isPlaying) {
          startPlayback();
        }
        return;
      }
      const wasPlaying = isPlaying;
      stopPlayback();
      currentMode = newMode;
      safeStorage.set('meowking_music_mode', currentMode);
      currentTrackIndex = 0;
      // Force reload: playlists may share a file path and the
      // new first track must always start from 0, not resume mid-track.
      loadedTrackFile = null;
      try { audioPlayer.currentTime = 0; } catch (e) { }
      updateTrackDisplay();
      if (wasPlaying) {
        startPlayback();
      }
    }

    function selectTrack(index) {
      const wasPlaying = isPlaying;
      stopPlayback();
      const tracks = getTracks();
      if (!tracks.length) return;
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
    if (btnOthers) {
      btnOthers.addEventListener('click', () => switchMode('others'));
    }
    if (btnPlay) {
      btnPlay.addEventListener('click', togglePlayback);
    }
    if (headerMusicBtn) {
      headerMusicBtn.addEventListener('click', togglePlayback);
    }
    if (dancerStage) {
      dancerStage.addEventListener('click', togglePlayback);
    }
    if (btnPrev) {
      btnPrev.addEventListener('click', () => selectTrack(currentTrackIndex - 1));
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => selectTrack(currentTrackIndex + 1));
    }
    const miniPlayBtn = document.getElementById('minibar-play');
    const miniNextBtn = document.getElementById('minibar-next');
    if (miniPlayBtn) miniPlayBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlayback(); });
    // Unlike the box next/prev (which only resume if already playing),
    // the mini-next auto-starts when paused. Capture wasPlaying first so
    // selectTrack's own resume path and ours never double-fire play().
    if (miniNextBtn) miniNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasPlaying = isPlaying;
      selectTrack(currentTrackIndex + 1);
      if (!wasPlaying) startPlayback();
    });
    if (volumeSlider) {
      volumeSlider.value = Math.round(volume * 100);
      volumeSlider.addEventListener('input', (e) => {
        let v = parseInt(e.target.value, 10) / 100;
        if (!isFinite(v)) v = 0.7;
        volume = Math.min(1, Math.max(0, v));
        if (volume > 0) lastVolume = volume;
        safeStorage.set('meowking_music_vol', volume);
        try { audioPlayer.volume = volume; } catch (err) { }
        updateVolumeUI();
      });
    }
    function glyphForVolume(v) {
      if (v <= 0) return '🔇';
      if (v < 0.34) return '🔈';
      if (v < 0.67) return '🔉';
      return '🔊';
    }
    function updateVolumeUI() {
      const pct = Math.round(volume * 100);
      if (volumeSlider && document.activeElement !== volumeSlider) {
        volumeSlider.value = pct;
      }
      if (volPct) volPct.textContent = pct + '%';
      const glyph = glyphForVolume(volume);
      if (muteBtn) {
        muteBtn.textContent = glyph;
        muteBtn.title = volume <= 0 ? 'Unmute' : 'Mute (volume ' + pct + '%)';
      }
      // Legacy static glyph support (pre-upgrade mirrors).
      if (legacyGlyph) legacyGlyph.textContent = glyph;
    }
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        if (volume > 0) {
          lastVolume = volume;
          volume = 0;
        } else {
          volume = lastVolume > 0 ? lastVolume : 0.7;
        }
        safeStorage.set('meowking_music_vol', volume);
        try { audioPlayer.volume = volume; } catch (err) { }
        updateVolumeUI();
      });
    }
    updateVolumeUI();
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
    // Set when the engine is live: renderRoute uses it to avoid revealing
    // a dead minibar when init bailed early (no music data / no player).
    window.Meowking.musicReady = true;
  }






  // -----------------------------------------------------------
  // Weather FX Engine (snow / rain / matrix over a fixed canvas)
  // -----------------------------------------------------------
  function initFx() {
    if (!once('fx')) return;
    const btn = document.getElementById('fx-toggle');
    const MODES = ['off', 'snow', 'rain', 'matrix'];
    let mode = safeStorage.get('meowking_fx') || 'off';
    if (!MODES.includes(mode)) mode = 'off';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mode = 'off';
    }

    let canvas = document.getElementById('fx-layer');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'fx-layer';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const SNOW_CHARS = ['❄', '·', '*', '❅'];
    const MATRIX_CHARS = 'アイウエオカキクケコサシスセソ0123456789'.split('');
    let parts = [];
    let rafId = null;

    function newPart(anywhere) {
      const W = canvas.width, H = canvas.height;
      if (mode === 'rain') {
        return { x: Math.random() * (W + 100), y: anywhere ? Math.random() * H : -20, len: 10 + Math.random() * 14, sp: 9 + Math.random() * 7 };
      }
      if (mode === 'matrix') {
        return { x: Math.floor(Math.random() * (W / 16)) * 16, y: anywhere ? Math.random() * H : -20, sp: 2 + Math.random() * 4, ch: MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)] };
      }
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -10, r: 1 + Math.random() * 2.4, sp: 0.4 + Math.random() * 1.1, drift: Math.random() * 1.2, ch: SNOW_CHARS[Math.floor(Math.random() * SNOW_CHARS.length)] };
    }

    function frame() {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      if (mode === 'rain') {
        ctx.strokeStyle = 'rgba(140,180,255,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        parts.forEach(p => {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 3, p.y + p.len);
          p.y += p.sp; p.x -= 0.6;
          if (p.y > H + 20) { p.y = -20; p.x = Math.random() * (W + 100); }
        });
        ctx.stroke();
      } else if (mode === 'matrix') {
        ctx.font = '14px monospace';
        parts.forEach(p => {
          for (let t = 0; t < 7; t++) {
            ctx.fillStyle = t === 0 ? 'rgba(180,255,180,0.9)' : `rgba(0,180,0,${0.55 - t * 0.07})`;
            ctx.fillText(p.ch, p.x, p.y - t * 15);
          }
          p.y += p.sp;
          if (Math.random() < 0.02) p.ch = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
          if (p.y - 105 > H) { p.y = -20; p.x = Math.floor(Math.random() * (W / 16)) * 16; }
        });
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '12px monospace';
        const t = performance.now() / 1000;
        parts.forEach(p => {
          ctx.fillText(p.ch, p.x + Math.sin(t + p.y * 0.02) * p.drift * 12, p.y);
          p.y += p.sp;
          if (p.y > H + 12) { p.y = -12; p.x = Math.random() * W; }
        });
      }
      rafId = requestAnimationFrame(frame);
    }

    const OK_BADGE = '<img src="assets/fx-ok.svg" class="fx-ok-gif" alt="" aria-hidden="true">';
    function apply() {
      if (btn) {
        btn.innerHTML = 'fx:' + mode + OK_BADGE;
        btn.title = 'Weather FX: ' + mode + ' (click to cycle)';
      }
      safeStorage.set('meowking_fx', mode);
      parts = [];
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (mode === 'off' || document.hidden) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const n = mode === 'matrix' ? 70 : 130;
      for (let i = 0; i < n; i++) parts.push(newPart(true));
      rafId = requestAnimationFrame(frame);
    }

    document.addEventListener('visibilitychange', apply);
    if (btn) btn.addEventListener('click', () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      apply();
    });
    apply();
  }

  // -----------------------------------------------------------
  // Winamp Skin Toggle for the music box (CSS does the painting)
  // -----------------------------------------------------------
  function initSkin() {
    if (!once('skin')) return;
    const btn = document.getElementById('skin-btn');
    const box = document.getElementById('box-music-player');
    let skin = safeStorage.get('meowking_skin') || 'default';
    if (skin !== 'winamp') skin = 'default';
    function apply() {
      if (box) box.classList.toggle('winamp-skin', skin === 'winamp');
      if (btn) btn.classList.toggle('active', skin === 'winamp');
      safeStorage.set('meowking_skin', skin);
    }
    if (btn) btn.addEventListener('click', () => {
      skin = skin === 'winamp' ? 'default' : 'winamp';
      apply();
    });
    apply();
  }

  // -----------------------------------------------------------
  // Konami Code Easter Egg (cat rain, 5s cooldown)
  // -----------------------------------------------------------
  function initKonami() {
    if (!once('konami')) return;
    const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let pos = 0;
    let cooling = false;
    document.addEventListener('keydown', (e) => {
      // Ignore keystrokes typed into inputs/textareas/selects so chatting
      // in the guestbook can never trigger (or corrupt) the sequence.
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = (k === SEQ[pos]) ? pos + 1 : (k === SEQ[0] ? 1 : 0);
      if (pos === SEQ.length) { pos = 0; catRain(); }
    });
    function catRain() {
      if (cooling) return;
      cooling = true;
      setTimeout(() => { cooling = false; }, 5000);
      for (let i = 0; i < 36; i++) {
        const s = document.createElement('span');
        s.className = 'konami-cat';
        s.textContent = Math.random() < 0.5 ? '=^.^=' : '🐱';
        s.style.left = (Math.random() * 100) + 'vw';
        s.style.animationDelay = (Math.random() * 1.2) + 's';
        s.style.fontSize = (0.9 + Math.random() * 1.2) + 'rem';
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 4800);
      }
    }
  }

  function renderRoute() {
    const rawHash = window.location.hash || '';
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    let route = rawHash.replace(/^#\/?/, '').trim();
    if (!rawHash) {
      const dataPage = document.body.getAttribute('data-page');
      route = dataPage || 'home';
    } else if (!route) {
      route = 'home';
    }

    try { updateActiveNav(route.split('/')[0]); } catch (e) { console.warn('nav update failed:', e); }
    try { updateFooter(); } catch (e) { console.warn('footer update failed:', e); }

    // Music box UI lives on the home page only, but the AUDIO is global:
    // it keeps playing across routes and stops only on manual pause or
    // tab close (the mobile minibar + desktop header button stay visible
    // everywhere so pause is always reachable).
    const isHome = route === 'home' || route === '';
    try {
      document.body.classList.toggle('no-music', !isHome);
      // The mini-player is global chrome: keep it revealed on EVERY route
      // (not just home) whenever the music engine initialized, so pause is
      // always one tap away no matter which page is open.
      const miniBar = document.getElementById('music-minibar');
      if (miniBar && window.Meowking && window.Meowking.musicReady) {
        miniBar.hidden = false;
        try { document.body.classList.add('has-minibar'); } catch (e) { /* non-critical */ }
      }
      // Dismiss the sheet on ANY navigation (including off-home -> home)
      // so it never covers the next page's content.
      if (window.Meowking && typeof window.Meowking.closeMusicSheet === 'function') {
        window.Meowking.closeMusicSheet();
      }
    } catch (e) { /* non-critical */ }

    // Invalidate any in-flight article/temple fetch from the previous page.
    routeToken++;

    // Tear down gallery autoplay + lightbox first so the slideshow
    // never survives a route change.
    if (galleryCleanup) {
      try { galleryCleanup(); } catch (e) { console.warn('gallery cleanup failed:', e); }
      galleryCleanup = null;
    }

    // Tear down any reading-mode UI (e.g. the scroll progress bar) left
    // over from the previous route before rendering the new one.
    if (readingModeCleanup) {
      try { readingModeCleanup(); } catch (e) { console.warn('reading cleanup failed:', e); }
      readingModeCleanup = null;
    }

    // Tear down guestbook effects (Firestore onSnapshot + cooldown timer)
    // so repeat visits never stack duplicate listeners/timers.
    if (guestbookCleanup) {
      try { guestbookCleanup(); } catch (e) { console.warn('guestbook cleanup failed:', e); }
      guestbookCleanup = null;
    }

    // Distraction-free reading layout: hides the left/right sidebars and
    // footer, keeps the header/top-nav, and widens the article pane.
    const isArticleReading = route.startsWith('articles/');
    const isTempleReading = route.startsWith('temples/') || route === 'temples' || route === 'unknown';
    try {
      document.body.classList.toggle('reading-mode', isArticleReading || isTempleReading);
    } catch (e) { /* non-critical */ }

    // Each view is isolated: a broken list/template shows an error box
    // instead of blanking the whole app or breaking the next route.
    const showViewError = (name, err) => {
      console.warn('view failed [' + name + ']:', err);
      try {
        mainContent.innerHTML = `
          <div class="box">
            <div class="box-header">oops — ${name} failed to load</div>
            <div class="box-content">
              <p>Something broke rendering this view, but the rest of the site still works.</p>
              <p><a href="#/" class="back-btn">&larr; back home</a></p>
            </div>
          </div>`;
      } catch (e2) { /* last resort: leave previous content */ }
    };
    const runView = (name, fn) => {
      try {
        const out = fn();
        if (out && typeof out.catch === 'function') {
          out.catch((err) => showViewError(name, err));
        }
      } catch (err) {
        showViewError(name, err);
      }
    };

    if (route === 'home' || route === '') {
      runView('home', () => renderHome(mainContent));
    } else if (route === 'articles') {
      runView('articles', () => renderArticles(mainContent));
    } else if (isArticleReading) {
      const articleId = route.replace('articles/', '');
      runView('article', () => renderArticleDetail(mainContent, articleId));
    } else if (route === 'temples' || route === 'unknown') {
      runView('temples', () => {
        const temples = getSiteData().temples || [];
        if (temples.length > 0) {
          return renderTempleDetail(mainContent, temples[0].id);
        }
        return renderTemples(mainContent);
      });
    } else if (isTempleReading) {
      const templeId = route.replace('temples/', '').replace('unknown/', '');
      runView('temple', () => renderTempleDetail(mainContent, templeId));
    } else if (route === 'notes') {
      runView('notes', () => renderNotes(mainContent));
    } else if (route === 'projects') {
      runView('projects', () => renderProjects(mainContent));
    } else if (route === 'about') {
      runView('about', () => renderAbout(mainContent));
    } else if (route === 'links') {
      runView('links', () => renderLinks(mainContent));
    } else if (route === 'guestbook') {
      runView('guestbook', () => renderGuestbook(mainContent));
    } else {
      runView('404', () => renderNotFound(mainContent));
    }

    try { window.scrollTo(0, 0); } catch (e) { /* non-critical */ }
  }

  function updateActiveNav(activeKey) {
    const topLinks = document.querySelectorAll('#top-nav-list a');
    const sidebarLinks = document.querySelectorAll('#sidebar-nav-list a');
    const tabLinks = document.querySelectorAll('.mobile-tabbar a');

    [...topLinks, ...sidebarLinks, ...tabLinks].forEach(a => {
      const routeAttr = a.getAttribute('data-route');
      if (routeAttr === activeKey) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  }

  // -----------------------------------------------------------
  // Mobile chrome: bottom sheet for the music box + minibar expand.
  // Range inputs inside the sheet must still work on touch, so only
  // taps directly on the backdrop (not inside the sheet) dismiss it.
  // -----------------------------------------------------------
  function initMobileChrome() {
    if (!once('mobile')) return;
    const box = document.getElementById('box-music-player');
    const minibar = document.getElementById('music-minibar');
    const trackBtn = document.getElementById('minibar-track');
    if (!box || !minibar || !trackBtn) return;

    const isPhone = () => {
      try {
        return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
      } catch (e) { return false; }
    };
    const closeSheet = () => {
      box.classList.remove('sheet-open');
      document.body.classList.remove('sheet-open');
    };
    trackBtn.addEventListener('click', () => {
      if (!isPhone()) return;
      // Works on every route: the sheet is the on-demand full player on
      // phones (the sidebar box itself stays home-only for layout).
      const open = box.classList.toggle('sheet-open');
      document.body.classList.toggle('sheet-open', open);
    });
    document.addEventListener('click', (e) => {
      if (!isPhone() || !box.classList.contains('sheet-open')) return;
      if (box.contains(e.target) || minibar.contains(e.target)) return;
      closeSheet();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSheet();
    });
    // Exposed so renderRoute can dismiss the sheet on navigation.
    window.Meowking.closeMusicSheet = closeSheet;
  }

  // -----------------------------------------------------------
  // 6. View Renderers
  // -----------------------------------------------------------

  // Shared list page size: articles, notes and projects views (and the
  // studio) all show this many entries per page with prev/next paging.
  const LIST_PAGE_SIZE = 49;

  // Builds the prev/next pager row shared by the list views. Returns ''
  // when everything fits on one page. Callers re-bind the buttons after
  // injecting the HTML.
  function pagerRowHtml(currentPage, totalPages, prevId, nextId) {
    if (totalPages <= 1) return '';
    return `<div class="pager-row">
      <button type="button" class="pager-btn" id="${prevId}"${currentPage <= 1 ? ' disabled' : ''}>&larr; prev</button>
      <span class="pager-info">Page ${currentPage} of ${totalPages}</span>
      <button type="button" class="pager-btn" id="${nextId}"${currentPage >= totalPages ? ' disabled' : ''}>next &rarr;</button>
    </div>`;
  }

  // "1–49 of 132" style range text for the Showing… count lines.
  function pageRangeText(filteredLength, currentPage) {
    if (filteredLength === 0) return '0';
    const start = (currentPage - 1) * LIST_PAGE_SIZE + 1;
    const end = Math.min(filteredLength, currentPage * LIST_PAGE_SIZE);
    return `${start}–${end} of ${filteredLength}`;
  }

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
              <a href="#/articles/${escapeHtml(art.id)}" class="writing-title-link">${escapeHtml(art.title)}</a>
              <div class="writing-meta">${escapeHtml(art.date || '')}${art.date && art.readTime ? ' · ' : ''}${escapeHtml(art.readTime || '')}</div>
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
    const pickedThought = thoughts.length > 0
      ? thoughts[Math.floor(Math.random() * thoughts.length)]
      : "Everyone wants their website to look like an app now. I wanted mine to look like a website.";

    const randomThoughtHtml = `
      <div class="box box-random-thought">
        <div class="box-header">random thought</div>
        <div class="box-content">
          <p class="random-thought-quote">"${escapeHtml(pickedThought)}"</p>
        </div>
      </div>
    `;

    container.innerHTML = welcomeHtml + writingsHtml + randomThoughtHtml + renderGalleryBox();
    initGalleryBox();
  }

  // -----------------------------------------------------------
  // HOMEPAGE IMAGE GALLERY (auto-generated manifest, one at a time)
  // Reads window.SITE_GALLERY written by scripts/build-gallery-manifest.py
  // from the contents of images/. No manual filename list.
  // -----------------------------------------------------------
  function getGalleryImages() {
    const siteData = getSiteData();
    const raw = siteData.gallery || [];
    return raw
      .map((entry) => (typeof entry === 'string' ? entry : (entry && (entry.src || entry.file)) || ''))
      .filter((src) => typeof src === 'string' && src.length > 0);
  }

  function galleryAltText(src, index) {
    try {
      const base = decodeURIComponent(String(src).split('/').pop().split('?')[0]);
      const stem = base.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
      if (stem) return stem.slice(0, 80);
    } catch (e) { }
    return 'gallery image ' + (index + 1);
  }

  function renderGalleryBox() {
    const images = getGalleryImages();
    if (images.length === 0) return '';

    const showControls = images.length > 1;
    const startFit = (function () {
      try {
        return safeStorage.get('meowking_gallery_fit') === 'whole' ? 'whole' : 'cover';
      } catch (e) { return 'cover'; }
    })();
    return `
      <div class="box box-gallery">
        <div class="box-header"><span>gallery</span><span class="gallery-count" id="gallery-counter">01/${String(images.length).padStart(2, '0')}</span></div>
        <div class="box-content gallery-box-content">
          <div class="gallery-scroll">
            <div class="gallery-frame${startFit === 'whole' ? ' fit-whole' : ''}" id="gallery-frame" title="Click to view fullscreen" tabindex="0" role="button" aria-label="Open gallery fullscreen viewer">
              <img id="gallery-img" src="${escapeHtml(images[0])}" alt="${escapeHtml(galleryAltText(images[0], 0))}">
            </div>
          </div>
          <div class="gallery-controls" id="gallery-controls">
            ${showControls ? `
            <button type="button" class="gallery-btn" id="gallery-prev" title="Previous image">[&lt; prev]</button>
            <button type="button" class="gallery-btn" id="gallery-next" title="Next image">[next &gt;]</button>
            <button type="button" class="gallery-btn" id="gallery-random" title="Show a random image">[? random]</button>
            <button type="button" class="gallery-btn" id="gallery-auto" title="Toggle 3s slideshow">[auto: off]</button>` : ''}
            <button type="button" class="gallery-btn" id="gallery-fit" title="Toggle fill frame / show whole image">[fit: ${startFit}]</button>
          </div>
        </div>
      </div>
    `;
  }

  function initGalleryBox() {
    const images = getGalleryImages();
    if (images.length === 0) return;
    const img = document.getElementById('gallery-img');
    const frame = document.getElementById('gallery-frame');
    const counter = document.getElementById('gallery-counter');
    const btnPrev = document.getElementById('gallery-prev');
    const btnNext = document.getElementById('gallery-next');
    const btnRandom = document.getElementById('gallery-random');
    const btnAuto = document.getElementById('gallery-auto');
    const btnFit = document.getElementById('gallery-fit');
    if (!img) return;

    let index = 0;
    let autoTimer = null;
    const pad = (n) => String(n).padStart(2, '0');

    // --- Fullscreen lightbox (singleton, built on demand) ---
    function getLightbox() {
      let lb = document.getElementById('gallery-lightbox');
      if (lb) return lb;
      lb = document.createElement('div');
      lb.id = 'gallery-lightbox';
      lb.className = 'gallery-lightbox';
      lb.hidden = true;
      lb.innerHTML = `
        <div class="gallery-lb-backdrop" data-lb-close></div>
        <div class="gallery-lb-inner" role="dialog" aria-modal="true" aria-label="Gallery image viewer">
          <div class="gallery-lb-top">
            <span class="gallery-lb-counter" id="gallery-lb-counter">01/01</span>
            <button type="button" class="gallery-btn" id="gallery-lb-close" title="Close (Esc)">[x close]</button>
          </div>
          <img id="gallery-lb-img" class="gallery-lb-img" src="" alt="">
          <div class="gallery-lb-caption" id="gallery-lb-caption"></div>
          <div class="gallery-lb-controls">
            <button type="button" class="gallery-btn" id="gallery-lb-prev" title="Previous (Left arrow)">[&lt; prev]</button>
            <button type="button" class="gallery-btn" id="gallery-lb-next" title="Next (Right arrow)">[next &gt;]</button>
          </div>
        </div>`;
      document.body.appendChild(lb);
      return lb;
    }

    function syncLightbox() {
      const lb = document.getElementById('gallery-lightbox');
      if (!lb || lb.hidden) return;
      const lbImg = document.getElementById('gallery-lb-img');
      const lbCounter = document.getElementById('gallery-lb-counter');
      const lbCaption = document.getElementById('gallery-lb-caption');
      if (lbImg) {
        lbImg.src = images[index];
        lbImg.alt = galleryAltText(images[index], index);
      }
      if (lbCounter) lbCounter.textContent = pad(index + 1) + '/' + pad(images.length);
      if (lbCaption) lbCaption.textContent = galleryAltText(images[index], index);
    }

    function onLbKey(e) {
      if (e.key === 'Escape') { closeLightbox(); return; }
      // Ignore arrows typed into form fields behind the overlay.
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    }

    function openLightbox() {
      const lb = getLightbox();
      lb.hidden = false;
      document.body.classList.add('gallery-lb-open');
      syncLightbox();
      document.addEventListener('keydown', onLbKey);
      const btnClose = document.getElementById('gallery-lb-close');
      const btnLbPrev = document.getElementById('gallery-lb-prev');
      const btnLbNext = document.getElementById('gallery-lb-next');
      const backdrop = lb.querySelector('[data-lb-close]');
      if (btnClose && !btnClose.dataset.wired) {
        btnClose.dataset.wired = '1';
        btnClose.addEventListener('click', closeLightbox);
      }
      if (btnLbPrev && !btnLbPrev.dataset.wired) {
        btnLbPrev.dataset.wired = '1';
        btnLbPrev.addEventListener('click', () => show(index - 1));
      }
      if (btnLbNext && !btnLbNext.dataset.wired) {
        btnLbNext.dataset.wired = '1';
        btnLbNext.addEventListener('click', () => show(index + 1));
      }
      if (backdrop && !backdrop.dataset.wired) {
        backdrop.dataset.wired = '1';
        backdrop.addEventListener('click', closeLightbox);
      }
      if (btnClose) btnClose.focus();
    }

    function closeLightbox() {
      const lb = document.getElementById('gallery-lightbox');
      if (lb) lb.hidden = true;
      document.body.classList.remove('gallery-lb-open');
      document.removeEventListener('keydown', onLbKey);
      if (frame) frame.focus();
    }

    function show(i) {
      index = (i + images.length) % images.length;
      img.src = images[index];
      img.alt = galleryAltText(images[index], index);
      if (counter) counter.textContent = pad(index + 1) + '/' + pad(images.length);
      syncLightbox();
    }

    function showRandom() {
      if (images.length < 2) return;
      let next = index;
      // Avoid repeating the same image twice in a row.
      while (next === index) {
        next = Math.floor(Math.random() * images.length);
      }
      show(next);
    }

    function stopAuto() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
      if (btnAuto) btnAuto.textContent = '[auto: off]';
    }

    function toggleAuto() {
      if (autoTimer) { stopAuto(); return; }
      autoTimer = setInterval(() => show(index + 1), 3000);
      if (btnAuto) btnAuto.textContent = '[auto: on]';
    }

    if (btnPrev) btnPrev.addEventListener('click', () => show(index - 1));
    if (btnNext) btnNext.addEventListener('click', () => show(index + 1));
    if (btnRandom) btnRandom.addEventListener('click', showRandom);
    if (btnAuto) btnAuto.addEventListener('click', toggleAuto);
    if (btnFit && frame) btnFit.addEventListener('click', () => {
      const whole = frame.classList.toggle('fit-whole');
      safeStorage.set('meowking_gallery_fit', whole ? 'whole' : 'cover');
      btnFit.textContent = whole ? '[fit: whole]' : '[fit: cover]';
    });
    if (frame) {
      // A swipe that travels also synthesizes a click — suppress it briefly
      // so swiping to the next image doesn't pop the lightbox open.
      let suppressClickUntil = 0;
      frame.addEventListener('click', (e) => {
        if (Date.now() < suppressClickUntil) { e.stopPropagation(); e.preventDefault(); return; }
        openLightbox();
      });
      frame.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(); }
      });
      // Thumb swipe: horizontal drag navigates, tap still opens lightbox.
      let touchX = null;
      frame.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) touchX = e.touches[0].clientX;
      }, { passive: true });
      frame.addEventListener('touchend', (e) => {
        if (touchX === null) return;
        const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchX;
        const dx = endX - touchX;
        touchX = null;
        if (Math.abs(dx) < 40) return;
        suppressClickUntil = Date.now() + 500;
        if (dx < 0) show(index + 1);
        else show(index - 1);
      }, { passive: true });
    }

    // Autoplay + lightbox must die on route change (renderRoute runs this).
    galleryCleanup = () => {
      stopAuto();
      const lb = document.getElementById('gallery-lightbox');
      if (lb) lb.remove();
      document.body.classList.remove('gallery-lb-open');
      document.removeEventListener('keydown', onLbKey);
      galleryCleanup = null;
    };
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
    let currentPage = 1;

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

          <div id="articles-pager"></div>
        </div>
      </div>
    `;

    function updateArticlesView() {
      const filtered = articles.filter(a => {
        const itemYear = getYear(a);
        const matchYear = selectedYear === 'all' || itemYear === selectedYear;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
          String(a.title || '').toLowerCase().includes(q) ||
          String(a.excerpt || '').toLowerCase().includes(q) ||
          (a.tags || []).some(t => String(t || '').toLowerCase().includes(q));

        return matchYear && matchSearch;
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
      if (currentPage > totalPages) currentPage = totalPages;
      const pageItems = filtered.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE);

      const countEl = document.getElementById('articles-count');
      if (countEl) countEl.textContent = pageRangeText(filtered.length, currentPage);
      const listEl = document.getElementById('articles-container');
      if (listEl) listEl.innerHTML = renderArticleList(pageItems);
      const pagerEl = document.getElementById('articles-pager');
      if (pagerEl) {
        pagerEl.innerHTML = pagerRowHtml(currentPage, totalPages, 'articles-prev', 'articles-next');
        const prevBtn = document.getElementById('articles-prev');
        const nextBtn = document.getElementById('articles-next');
        if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updateArticlesView(); } });
        if (nextBtn) nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updateArticlesView(); } });
      }
    }

    const searchInput = document.getElementById('article-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        currentPage = 1;
        updateArticlesView();
      });
    }

    const yearSelect = document.getElementById('article-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        currentPage = 1;
        updateArticlesView();
      });
    }

    updateArticlesView();
  }

  function renderArticleList(articles) {
    if (articles.length === 0) {
      return `<p style="color: var(--text-muted); padding: 14px 0;">No articles match your search or filter.</p>`;
    }
    return articles.map(art => `
      <article class="article-card">
        <h2 class="article-card-title">
          <a href="#/articles/${escapeHtml(art.id)}">${escapeHtml(art.title)}</a>
        </h2>
        <div class="article-card-meta">
          <span>📅 ${escapeHtml(art.date || '')}</span>
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
    const myToken = ++routeToken;
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
              <span>Published: ${escapeHtml(article.date || '')}</span>
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
    // Error states below show a message instead of an article — drop the
    // bar too so it doesn't linger over the error until next navigation.
    const dropBar = () => {
      if (readingModeCleanup) {
        try { readingModeCleanup(); } catch (e) { /* non-critical */ }
        readingModeCleanup = null;
      }
    };

    // Article bodies live ONLY in articles/*.md (single source of truth).
    // No inline fallback: a missing file is a real error, surfaced clearly.
    // NOTE: fetch() requires http(s) — run `python -m http.server` locally.
    let rawContent = '';
    const cached = articleContentCache[article.id];
    if (typeof cached === 'string' && cached) {
      rawContent = cached;
    } else if (!article.file) {
      dropBar();
      const bodyEl = container.querySelector('#article-markdown-body');
      if (bodyEl && myToken === routeToken) {
        bodyEl.innerHTML = '<p style="color: var(--text-muted);">*Article misconfigured: missing "file" in data/articles.js.*</p>';
      }
      return;
    } else {
      try {
        const response = await fetch(article.file);
        if (myToken !== routeToken) return;
        if (response.ok) {
          rawContent = await response.text();
          articleContentCache[article.id] = rawContent;
        } else if (response.status === 404) {
          dropBar();
          const bodyEl = container.querySelector('#article-markdown-body');
          if (bodyEl && myToken === routeToken) {
            bodyEl.innerHTML = `<p style="color: var(--text-muted);">*Could not load article file: ${escapeHtml(article.file)} (404 — file missing from articles/).*</p>`;
          }
          return;
        } else {
          dropBar();
          const bodyEl = container.querySelector('#article-markdown-body');
          if (bodyEl && myToken === routeToken) {
            bodyEl.innerHTML = `<p style="color: var(--text-muted);">*Could not load article file: ${escapeHtml(article.file)} (HTTP ${response.status}).*</p>`;
          }
          return;
        }
      } catch (err) {
        if (myToken !== routeToken) return;
        dropBar();
        const bodyEl = container.querySelector('#article-markdown-body');
        if (bodyEl) {
          const isFileProto = window.location.protocol === 'file:';
          bodyEl.innerHTML = isFileProto
            ? '<p style="color: var(--text-muted);">*Articles load from .md files only — open via a local server (<code>python -m http.server</code>) instead of double-clicking index.html.*</p>'
            : `<p style="color: var(--text-muted);">*Network error loading ${escapeHtml(article.file)}. Check connection and retry.*</p>`;
        }
        return;
      }
    }

    if (!rawContent || !rawContent.trim()) {
      if (myToken !== routeToken) return;
      dropBar();
      const bodyEl = container.querySelector('#article-markdown-body');
      if (bodyEl) {
        bodyEl.innerHTML = `<p style="color: var(--text-muted);">*Article file is empty: ${escapeHtml(article.file)}.*</p>`;
      }
      return;
    }

    // Stale navigation guard: if the user already moved to another
    // article, never paint this fetch into the new page.
    if (myToken !== routeToken) return;

    // Strip frontmatter if present (e.g. --- title: ... ---)
    rawContent = rawContent.trimStart();
    if (rawContent.startsWith('---')) {
      const secondDivider = rawContent.indexOf('---', 3);
      if (secondDivider !== -1) {
        rawContent = rawContent.slice(secondDivider + 3).trim();
      }
    }

    if (myToken !== routeToken) return;
    const bodyEl = container.querySelector('#article-markdown-body');
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
  // UNKNOWN / TEMPLES VIEWS (list + reader with Prev/Next)
  // Renders .md files from temples/ registered in data/temples.js
  // -----------------------------------------------------------
  function renderTemples(container) {
    const siteData = getSiteData();
    const temples = siteData.temples || [];

    if (temples.length === 0) {
      container.innerHTML = `
        <div class="box">
          <div class="box-header">Temple</div>
          <div class="box-content">
            <p>Nothing here yet</p>
            <p><a href="#/" class="back-btn">&larr; back home</a></p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="box">
        <div class="box-header">Temple</div>
        <div class="box-content">
          <ul class="writings-list">
            ${temples.map(t => `
              <li class="writing-item">
                <a href="#/temples/${escapeHtml(t.id)}" class="writing-title-link">${escapeHtml(t.title || t.id)}</a>
                <div class="writing-meta">${escapeHtml(t.date || '')}</div>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  async function renderTempleDetail(container, templeId) {
    const myToken = ++routeToken;
    const siteData = getSiteData();
    const temples = siteData.temples || [];
    const idx = temples.findIndex(t => t.id === templeId);
    const page = idx !== -1 ? temples[idx] : null;

    if (!page) {
      container.innerHTML = `
        <div class="box">
          <div class="box-header">Temple - not found</div>
          <div class="box-content">
            <p>The requested page could not be found.</p>
            <p><a href="#/temples" class="back-btn">&larr; back</a></p>
          </div>
        </div>
      `;
      return;
    }

    const prev = idx > 0 ? temples[idx - 1] : null;
    const next = idx < temples.length - 1 ? temples[idx + 1] : null;

    container.innerHTML = `
      <div class="box article-full">
        <div class="box-header"><span>Temple <span class="temple-page-num">${String(idx + 1).padStart(2, '0')}/${String(temples.length).padStart(2, '0')}</span></span><span class="temple-head-nav">${prev ? `<a href="#/temples/${escapeHtml(prev.id)}" class="temple-head-btn">&larr; prev</a>` : `<span class="temple-head-btn disabled">&larr; prev</span>`}${next ? `<a href="#/temples/${escapeHtml(next.id)}" class="temple-head-btn">next &rarr;</a>` : `<span class="temple-head-btn disabled">next &rarr;</span>`}</span></div>
        <div class="box-content">
          <div class="reading-pane-inner">
            <h1 class="article-full-title">${escapeHtml(page.title || page.id)}</h1>
            <div class="article-card-meta"><span>${escapeHtml(page.date || '')}</span></div>
            <div class="article-body" id="temple-markdown-body">
              <p style="color: var(--text-muted);">Loading...</p>
            </div>
            <div class="temple-bottom-row">
              <button type="button" class="temple-top-btn" id="temple-top-btn">&uarr; top</button>
            </div>
          </div>
        </div>
      </div>
    `;

    readingModeCleanup = setupReadingProgressBar();

    const templeTopBtn = container.querySelector('#temple-top-btn');
    if (templeTopBtn) {
      templeTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    let rawContent = articleContentCache['temple:' + page.id] || '';
    if (typeof rawContent !== 'string') rawContent = String(rawContent);

    if (!rawContent && page.file) {
      try {
        const response = await fetch(page.file);
        if (myToken !== routeToken) return;
        if (response.ok) {
          rawContent = await response.text();
          articleContentCache['temple:' + page.id] = rawContent;
        } else {
          rawContent = page.content || `*Could not load file: ${page.file} (HTTP ${response.status})*`;
        }
      } catch (err) {
        rawContent = page.content || `*Note: run a local server (e.g. \`python -m http.server\`) to preview external .md locally. On GitHub Pages this loads automatically.*`;
      }
    }

    if (!rawContent) rawContent = page.content || '';

    if (myToken !== routeToken) return;
    rawContent = rawContent.trimStart();
    if (rawContent.startsWith('---')) {
      const secondDivider = rawContent.indexOf('---', 3);
      if (secondDivider !== -1) rawContent = rawContent.slice(secondDivider + 3).trim();
    }

    if (myToken !== routeToken) return;
    const bodyEl = container.querySelector('#temple-markdown-body');
    if (bodyEl) bodyEl.innerHTML = parseMarkdown(rawContent);
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
    let currentPage = 1;

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

          <div id="notes-pager"></div>
        </div>
      </div>
    `;

    function updateNotesView() {
      const filtered = notes.filter(n => {
        const itemYear = getYear(n);
        const matchYear = selectedYear === 'all' || itemYear === selectedYear;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
          String(n.content || '').toLowerCase().includes(q) ||
          (n.tags || []).some(t => String(t || '').toLowerCase().includes(q));

        return matchYear && matchSearch;
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
      if (currentPage > totalPages) currentPage = totalPages;
      const pageItems = filtered.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE);

      const countEl = document.getElementById('notes-count');
      if (countEl) countEl.textContent = pageRangeText(filtered.length, currentPage);
      const listEl = document.getElementById('notes-container');
      if (listEl) listEl.innerHTML = renderNoteList(pageItems);
      const pagerEl = document.getElementById('notes-pager');
      if (pagerEl) {
        pagerEl.innerHTML = pagerRowHtml(currentPage, totalPages, 'notes-prev', 'notes-next');
        const prevBtn = document.getElementById('notes-prev');
        const nextBtn = document.getElementById('notes-next');
        if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updateNotesView(); } });
        if (nextBtn) nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updateNotesView(); } });
      }
    }

    const searchInput = document.getElementById('note-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        currentPage = 1;
        updateNotesView();
      });
    }

    const yearSelect = document.getElementById('note-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        currentPage = 1;
        updateNotesView();
      });
    }

    updateNotesView();
  }

  function renderNoteList(notes) {
    if (notes.length === 0) {
      return `<p style="color: var(--text-muted); padding: 14px 0;">No notes match your filter or search.</p>`;
    }
    return notes.map(note => `
      <div class="note-item">
        <div class="note-meta">
          <span>📅 ${escapeHtml(note.date || '')}</span>
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
    let currentPage = 1;

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

          <div id="projects-pager"></div>
        </div>
      </div>
    `;

    function updateProjectsView() {
      const filtered = projects.filter(p => {
        const itemYear = getYear(p);
        const matchYear = selectedYear === 'all' || itemYear === selectedYear;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
          String(p.title || '').toLowerCase().includes(q) ||
          String(p.description || '').toLowerCase().includes(q) ||
          String(p.details || '').toLowerCase().includes(q) ||
          (p.tags || []).some(t => String(t || '').toLowerCase().includes(q));

        return matchYear && matchSearch;
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
      if (currentPage > totalPages) currentPage = totalPages;
      const pageItems = filtered.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE);

      const countEl = document.getElementById('projects-count');
      if (countEl) countEl.textContent = pageRangeText(filtered.length, currentPage);
      const listEl = document.getElementById('projects-container');
      if (listEl) listEl.innerHTML = renderProjectList(pageItems);
      const pagerEl = document.getElementById('projects-pager');
      if (pagerEl) {
        pagerEl.innerHTML = pagerRowHtml(currentPage, totalPages, 'projects-prev', 'projects-next');
        const prevBtn = document.getElementById('projects-prev');
        const nextBtn = document.getElementById('projects-next');
        if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; updateProjectsView(); } });
        if (nextBtn) nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; updateProjectsView(); } });
      }
    }

    const searchInput = document.getElementById('project-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        currentPage = 1;
        updateProjectsView();
      });
    }

    const yearSelect = document.getElementById('project-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        currentPage = 1;
        updateProjectsView();
      });
    }

    updateProjectsView();
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
            ${proj.demo ? `<a href="${escapeHtml(safeHref(proj.demo))}" target="_blank" rel="noopener">⚡ Live Demo</a>` : ''}
            ${proj.github ? `<a href="${escapeHtml(safeHref(proj.github))}" target="_blank" rel="noopener">🐙 GitHub</a>` : ''}
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
          <div class="table-scroll">
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
                    <a href="${escapeHtml(safeHref(item.url))}" target="_blank" rel="noopener">&rarr; ${escapeHtml(item.name)}</a>
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
    let gbUnsubscribe = null;
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
                Filtered view active — <a href="#" id="clear-all-filters-btn" class="bbs-filter-clear-link">Reset filters</a>
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
        // Unparseable (possibly forged) timestamps bypass nothing: they are
        // hidden under active date filters instead of failing open.
        if (isNaN(entryDate.getTime())) return false;
        const now = new Date();
        const diffMs = now - entryDate;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (filter === '7days') return diffDays <= 7;
        if (filter === '30days') return diffDays <= 30;
        if (filter === 'thisYear') return entryDate.getFullYear() === now.getFullYear();
      } catch (e) {
        return false;
      }
      return true;
    }

    // Combine cloud, local, and seed entries
    function getAllCombinedEntries() {
      const locals = getLocalEntries() || [];
      // If we have live Firestore entries, use them as primary, but keep
      // offline-saved entries that never reached the cloud. Matched by
      // content so already-synced posts don't show up twice.
      if (firestoreEntries && firestoreEntries.length > 0) {
        const cloudKeys = new Set(firestoreEntries.map(e => `${e.alias}||${e.message}||${e.timestamp}`));
        const pending = locals.filter(e => !cloudKeys.has(`${e.alias}||${e.message}||${e.timestamp}`));
        return [...pending, ...firestoreEntries];
      }

      // Check cached Firestore or local storage entries
      if (locals.length > 0) {
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

      // Sort entries by server time when available (createdAt is
      // server-bounded by firestore.rules; the client timestamp string is
      // attacker-controlled and only a fallback). This stops forged far-
      // future timestamps from pinning entries to the top.
      const entryTimeMs = (e) => {
        try {
          const c = e && e.createdAt;
          if (c && typeof c.toDate === 'function') {
            const t = c.toDate().getTime();
            if (isFinite(t)) return t;
          }
          if (c instanceof Date) {
            const t = c.getTime();
            if (isFinite(t)) return t;
          }
          if (typeof c === 'number' && isFinite(c)) return c;
        } catch (err) { /* fall through to timestamp string */ }
        return new Date(String((e && e.timestamp) || '').replace(' ', 'T')).getTime() || 0;
      };
      filtered.sort((a, b) => {
        const timeA = entryTimeMs(a);
        const timeB = entryTimeMs(b);
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
              Try modifying your search or <a href="#" id="feed-clear-filters-link" style="color: #38bdf8;">clearing active filters</a>.
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
        const tsDisplay = entry.timestamp ? String(entry.timestamp).slice(0, 16) : '2026-09-15 12:00';

        // Clean website link if present
        let websiteChipHtml = '';
        if (entry.website) {
          let url = String(entry.website).trim();
          const isInternal = url.startsWith('#') || url.startsWith('/');
          if (!/^https?:\/\//i.test(url) && !isInternal) {
            url = 'https://' + url;
          }
          let displayUrl = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
          if (isInternal) {
            displayUrl = displayUrl === '#' || displayUrl === '' ? 'home' : displayUrl.replace(/^#\/?/, '');
          }
          const targetAttr = isInternal ? '' : ' target="_blank" rel="noopener noreferrer"';
          const arrow = isInternal ? '' : ' ↗';
          websiteChipHtml = `
            <a href="${escapeHtml(safeHref(url, '#'))}"${targetAttr} class="bbs-site-link" title="Visit ${escapeHtml(entry.alias)}'s website">
              🌐 ${escapeHtml(displayUrl)}${arrow}
            </a>
          `;
        }

        const safeIcon = ALLOWED_GB_ICONS.includes(entry.icon) ? entry.icon : '🐱';
        const formattedMsg = formatInlineMarkdown(entry.message, true);

        let sysopReplyHtml = '';
        if (entry.adminReply) {
          sysopReplyHtml = `
            <div class="bbs-sysop-reply">
              <span class="bbs-sysop-tag">*** [sysop note]:</span>
              ${formatInlineMarkdown(entry.adminReply, true)}
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
    function resetAllFilters(e) {
      // Called directly as a click handler on href="#" links, so swallow
      // the event to avoid jumping to the top of the page.
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
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

      // Drop any previous listener (e.g. from the Sync button) so repeated
      // syncs never stack duplicate subscriptions.
      if (gbUnsubscribe) {
        try { gbUnsubscribe(); } catch (e) { }
        gbUnsubscribe = null;
      }

      try {
        updateConnectionStatus(false, 'CONNECTING...');

        // Subscribe to guestbook collection in real-time
        gbUnsubscribe = db.collection('guestbook').onSnapshot((snapshot) => {
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
    // In-flight guard: the button is disabled during transmit (stops double
    // click), but an Enter submit still fires while disabled — this flag
    // stops the handler from running twice for one transmission.
    let gbSubmitInFlight = false;
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (gbSubmitInFlight) return;

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

        // Enforce the same limits as firestore.rules client-side (maxlength
        // attributes are trivially bypassed via devtools/paste). Website is
        // measured AFTER the https:// normalization below (rules measure
        // the stored value), so the length check lives there.
        if (alias.length > 40) {
          showAlert("Alias is too long — 40 characters max.", "error");
          aliasInput && aliasInput.focus();
          return;
        }
        if (message.length > 500) {
          showAlert("Message is too long — 500 characters max.", "error");
          msgInput && msgInput.focus();
          return;
        }

        // Clean website
        if (website && !/^https?:\/\//i.test(website) && !website.startsWith('#')) {
          website = 'https://' + website;
        }
        if (website && website.length > 120) {
          showAlert("Website URL is too long — 120 characters max.", "error");
          websiteInput && websiteInput.focus();
          return;
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
        gbSubmitInFlight = true;

        // getDb() reads firebase.apps — a half-loaded firebase global would
        // throw OUTSIDE the try below and brick the form (flag stays true).
        let db = null;
        try {
          db = getDb();
        } catch (err) {
          console.warn("Firebase accessor failed, using local buffer:", err);
        }
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
            const code = err && err.code;
            // Rules rejections (oversize/forged fields) are NOT offline —
            // show the error and stop WITHOUT buffering locally, so
            // server-rejected content never renders as if accepted.
            if (code === 'permission-denied' || code === 'invalid-argument' || code === 'failed-precondition') {
              console.warn("Guestbook entry rejected by Firestore rules:", err);
              showAlert("Entry rejected by the guestbook rules. Check lengths and try again.", "error");
              gbSubmitInFlight = false;
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = GB_SUBMIT_BTN_DEFAULT_HTML;
              }
              return;
            }
            console.warn("Could not save to Firestore directly (offline or rules restricted), saving to local buffer:", err);
          }
        }
        gbSubmitInFlight = false;

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

    // If the visitor navigates away, renderRoute() runs this cleanup: stop
    // the cooldown countdown so it can't tick against detached DOM forever,
    // and detach the Firestore live listener so listeners never stack up
    // across repeat visits to the guestbook.
    guestbookCleanup = () => {
      if (cooldownIntervalId) {
        clearInterval(cooldownIntervalId);
        cooldownIntervalId = null;
      }
      if (gbUnsubscribe) {
        try { gbUnsubscribe(); } catch (e) { }
        gbUnsubscribe = null;
      }
      guestbookCleanup = null;
    };

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
    if (typeof md !== 'string') md = String(md);
    let text = md.replace(/\r\n/g, '\n').trim();

    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)[ \t]*\n?([\s\S]*?)```/g, (_, lang, code) => {
      const index = codeBlocks.length;
      const cleanCode = escapeHtml(code.trim());
      const safeLang = String(lang || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
      const langAttr = safeLang ? ` class="language-${safeLang}"` : '';
      codeBlocks.push(`<pre><code${langAttr}>${cleanCode}</code></pre>`);
      return `__CODE_BLOCK_${index}__`;
    });

    // A standalone --- line is a horizontal rule. It gets a placeholder so
    // paragraph wrapping never swallows it (it previously rendered literally).
    text = text.replace(/^[ \t]*---[ \t]*$/gm, '__HR__');

    // Headings and blockquotes are extracted into placeholders BEFORE the
    // whole-document inline pass. The generated tags must never go through
    // the escape step (it previously turned `### x` into literal
    // `&lt;h3&gt;` text). Raw HTML inside them is still escaped, because
    // each line is inline-formatted individually before being stored.
    const headBlocks = [];
    text = text.replace(/^#{1,6} (.*$)/gim, (full, m) => {
      const level = Math.min(6, full.match(/^#+/)[0].length);
      headBlocks.push(`<h${level}>` + formatInlineMarkdown(m, false) + `</h${level}>`);
      return `__HEAD_BLOCK_${headBlocks.length - 1}__`;
    });

    // Consecutive "> " lines group into ONE blockquote (joined with <br>),
    // instead of N separate boxes. ">" with no trailing space also parses.
    const quoteBlocks = [];
    text = text.replace(/^(?:\>[ \t]?.*(?:\n|$))+/gim, (m) => {
      const lines = m.split('\n')
        .map((l) => l.replace(/^\>[ \t]?/, '').trim())
        .filter((l) => l.length > 0);
      if (!lines.length) return m;
      quoteBlocks.push('<blockquote>' + lines.map((l) => formatInlineMarkdown(l, false)).join('<br>') + '</blockquote>');
      return `__QUOTE_BLOCK_${quoteBlocks.length - 1}__`;
    });

    // Lists are extracted into placeholders BEFORE the whole-document inline
    // pass (like heads/quotes above). Items are inline-formatted individually,
    // so running the doc-level pass first would double-escape the generated
    // <strong>/<a>/<code> tags into visible tag soup.
    // Supports -, *, + bullets and ordered lists.
    const listBlocks = [];
    text = text.replace(/^[ \t]*[-*+][ \t]+.*(?:\n[ \t]*[-*+][ \t]+.*)*/gm, (m) => {
      const items = m.split('\n')
        .map((l) => '<li>' + formatInlineMarkdown(l.replace(/^[ \t]*[-*+][ \t]+/, '').trim(), false) + '</li>').join('');
      listBlocks.push('<ul>' + items + '</ul>');
      return `__LIST_BLOCK_${listBlocks.length - 1}__`;
    });
    text = text.replace(/^[ \t]*\d+\.[ \t]+.*(?:\n[ \t]*\d+\.[ \t]+.*)*/gm, (m) => {
      const items = m.split('\n')
        .map((l) => '<li>' + formatInlineMarkdown(l.replace(/^[ \t]*\d+\.[ \t]+/, '').trim(), false) + '</li>').join('');
      listBlocks.push('<ol>' + items + '</ol>');
      return `__LIST_BLOCK_${listBlocks.length - 1}__`;
    });
    text = formatInlineMarkdown(text, false);

    const paragraphs = text.split(/\n\n+/);
    // A generated block is identified by its placeholder prefix. A block
    // sharing a chunk with trailing text (single newline, no blank line)
    // keeps the block and wraps only the rest in <p>.
    const blockPh = /^(__(?:CODE|LIST|HEAD|QUOTE)_BLOCK_\d+__|__HR__)/;
    text = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      const ph = p.match(blockPh);
      if (ph && p.length > ph[0].length) {
        return ph[0] + `<p>${p.slice(ph[0].length).trim().replace(/\n/g, '<br>')}</p>`;
      }
      if (p.startsWith('<ul>') || p.startsWith('<ol>') || blockPh.test(p)) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    codeBlocks.forEach((block, i) => {
      text = text.replace(`__CODE_BLOCK_${i}__`, block);
      text = text.replace(`<p>__CODE_BLOCK_${i}__</p>`, block);
    });

    listBlocks.forEach((block, i) => {
      text = text.replace(`__LIST_BLOCK_${i}__`, block);
      text = text.replace(`<p>__LIST_BLOCK_${i}__</p>`, block);
    });

    headBlocks.forEach((block, i) => {
      text = text.replace(`__HEAD_BLOCK_${i}__`, block);
      text = text.replace(`<p>__HEAD_BLOCK_${i}__</p>`, block);
    });

    quoteBlocks.forEach((block, i) => {
      text = text.replace(`__QUOTE_BLOCK_${i}__`, block);
      text = text.replace(`<p>__QUOTE_BLOCK_${i}__</p>`, block);
    });

    text = text.replace(/<p>__HR__<\/p>/g, '<hr>');
    text = text.replace(/__HR__/g, '<hr>');

    return text;
  }

  window.parseMarkdownMicro = parseMarkdown;
  // Reused by editor.html (local content studio) for previews and lists.
  window.formatInlineMarkdownMicro = formatInlineMarkdown;
  window.escapeHtmlMicro = escapeHtml;
  // Namespaced handles for future code (no new globals allowed).
  window.Meowking.parseMarkdown = parseMarkdown;
  window.Meowking.formatInlineMarkdown = formatInlineMarkdown;
  window.Meowking.escapeHtml = escapeHtml;
  window.Meowking.safeHref = safeHref;
  window.Meowking.renderRoute = function () { return safeCall('route', renderRoute); };

  // Inline markdown with single-escape guarantee: the input is always
  // escaped exactly once up front, so raw HTML can never survive and
  // entities are never double-escaped (fixes &amp;amp; in guestbook).
  // preEscaped is kept for backwards compatibility but ignored.
  function formatInlineMarkdown(text, preEscaped) {
    if (!text) return '';
    if (typeof text !== 'string') text = String(text);
    void preEscaped;
    text = escapeHtml(text);
    // Inline code: content is already escaped above, insert as-is.
    text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    // URLs may contain one level of balanced parens (e.g. Wikipedia
    // links). A naive \(([^)]+)\) would stop at the first inner ")" and
    // leave a stray paren behind, so match balanced parens instead.
    const urlInParens = '\\(([^()]*(?:\\([^()]*\\)[^()]*)*)\\)';
    // Images: ![alt](src). Relative paths allowed (same-origin); dangerous
    // schemes (javascript:, data:, etc.) fall back to plain alt text.
    // alt/src are already escaped, so they are used as-is (no re-escape).
    text = text.replace(new RegExp('!\\[([^\\]]*)\\]' + urlInParens, 'g'), (match, alt, url) => {
      const src = url.trim();
      if (/^\s*(javascript|data|vbscript|file):/i.test(stripCtrlForSchemeCheck(src))) return alt;
      if (!isSafeImageSrc(src)) return alt;
      return `<img src="${src}" alt="${alt}" loading="lazy">`;
    });
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Only allow safe URL schemes for markdown-style links. This blocks
    // javascript:, data:, vbscript:, etc. from being used to smuggle
    // executable code in via user-submitted content (e.g. the guestbook).
    // Label/href are already escaped, so they are used as-is.
    text = text.replace(new RegExp('\\[([^\\]]+)\\]' + urlInParens, 'g'), (match, label, url) => {
      const trimmedUrl = url.trim();
      // Same policy as safeHref(): dangerous schemes blocked, everything
      // else (https?/mailto:/#// plus relative paths like assets/x.gif)
      // allowed. Previously relative links silently died as href="#".
      // Scheme test uses the control-char-stripped copy (see safeHref).
      let safeHrefValue = '#';
      const checkUrl = stripCtrlForSchemeCheck(trimmedUrl);
      if (!/^\s*(javascript|data|vbscript|file):/i.test(checkUrl)) {
        if (/^(https?:|mailto:|#|\/)/i.test(checkUrl) || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(checkUrl)) {
          safeHrefValue = trimmedUrl;
        }
      }
      return `<a href="${safeHrefValue}" target="_blank" rel="noopener">${label}</a>`;
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

  // URL sanitizers: block javascript:/data:/vbscript:/file: everywhere
  // (projects, links, badges, markdown). Relative paths and
  // https?/mailto:/#// are allowed.
  // Scheme tests run on a control-char-stripped copy: the WHATWG URL parser
  // strips tabs/newlines, so `jav\tascript:` must not slip past the block.
  // The ORIGINAL value is returned when allowed (filenames may contain
  // spaces), since a scheme-less value is harmless either way.
  function stripCtrlForSchemeCheck(s) {
    return String(s == null ? '' : s).replace(/[\x00-\x1f\x7f]/g, '');
  }
  function safeHref(url, fallback) {
    const fb = fallback || '#';
    if (typeof url !== 'string') return fb;
    const t = url.trim();
    if (!t) return fb;
    const tc = stripCtrlForSchemeCheck(t);
    if (/^\s*(javascript|data|vbscript|file):/i.test(tc)) return fb;
    if (/^(https?:|mailto:|#|\/)/i.test(tc)) return t;
    // Relative paths like assets/x.gif or index.html#/about have no
    // scheme — allow them, block everything else with a scheme (blob:, etc).
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(tc)) return t;
    return fb;
  }

  function isSafeImageSrc(src) {
    if (typeof src !== 'string') return false;
    const t = src.trim();
    if (!t) return false;
    const tc = stripCtrlForSchemeCheck(t);
    if (/^\s*(javascript|data|vbscript|file):/i.test(tc)) return false;
    if (/^(https?:|#|\/)/i.test(tc)) return true;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(tc)) return true;
    return false;
  }

  function safeImageSrc(src, fallback) {
    const fb = fallback || 'assets/cat.jpg';
    if (isSafeImageSrc(src)) return String(src).trim();
    return fb;
  }

  // About-snippet greeting: escape everything, then restore at most one
  // whitelisted <img> (the animated name gif) with a safe src. Strips
  // event-handler attributes and dangerous schemes.
  function sanitizeGreeting(raw) {
    if (raw == null) return '';
    const s = String(raw);
    if (!s.includes('<')) return escapeHtml(s);
    const m = s.match(/<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/i);
    const prefix = escapeHtml(s.split('<')[0]);
    if (!m) return escapeHtml(s);
    const src = safeImageSrc(m[1], '');
    if (!src) return escapeHtml(s);
    return `${prefix} <img src="${escapeHtml(src)}" alt="meowking" class="about-meowking-gif">`;
  }

})();
