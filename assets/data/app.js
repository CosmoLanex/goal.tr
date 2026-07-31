/* ============================================================
   nukrax.goal — app.js
   Single-page shell: preloader, nav, and view switching.
   Dashboard / History / Settings are views within this one page.
   ============================================================ */

window.NKXApp = (function () {
  'use strict';

  const VIEWS = ['dashboard', 'history', 'settings'];

  // ---------- preloader (once per session) ----------
  (function preloader() {
    const SEEN_KEY = 'nkx_goal_intro_seen';
    const preloaderEl = document.getElementById('preloader');
    const app = document.getElementById('app');
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) {}

    if (seen) {
      preloaderEl.style.transition = 'none';
      preloaderEl.style.display = 'none';
      app.style.transition = 'none';
      app.classList.add('show');
    } else {
      setTimeout(() => {
        preloaderEl.classList.add('out');
        setTimeout(() => app.classList.add('show'), 80);
        try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
      }, 1400);
    }
  })();

  // ---------- nav burger (mobile) ----------
  const navBurger = document.getElementById('navBurger');
  const navLinks = document.getElementById('navLinks');
  if (navBurger) {
    navBurger.addEventListener('click', () => navLinks.classList.toggle('open'));
  }

  // ---------- view switching ----------
  function switchView(view, opts) {
    opts = opts || {};
    if (VIEWS.indexOf(view) === -1) view = 'dashboard';

    VIEWS.forEach(v => {
      document.getElementById(`view-${v}`).classList.toggle('active', v === view);
    });
    document.querySelectorAll('.nav-link, .nav-logo').forEach(a => {
      a.classList.toggle('active', a.dataset.view === view);
    });

    if (!opts.skipHash) {
      history.replaceState(null, '', `#${view}`);
    }
    navLinks.classList.remove('open');

    // render fresh data every time a view becomes visible
    const module = { dashboard: window.DashboardView, history: window.HistoryView, settings: window.SettingsView }[view];
    if (module) module.render();

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function initialViewFromHash() {
    const hash = (location.hash || '').replace('#', '');
    return VIEWS.indexOf(hash) !== -1 ? hash : 'dashboard';
  }

  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });

  window.addEventListener('hashchange', () => {
    switchView(initialViewFromHash(), { skipHash: true });
  });

  // ---------- init all view modules once, then show the right one ----------
  DashboardView.init();
  HistoryView.init();
  SettingsView.init();
  switchView(initialViewFromHash(), { skipHash: true });

  return { switchView };
})();
