/* ============================================================
   nukrax.goal — animation.js
   Every animation timing / easing / helper lives here.
   ============================================================ */

(function (global) {
  'use strict';

  const EASE = {
    standard: 'cubic-bezier(0.22,1,0.36,1)',
    snappy:   'cubic-bezier(0.16,1,0.3,1)',
    spring:   'cubic-bezier(0.34,1.4,0.64,1)',
    linear:   'linear'
  };

  const DURATION = {
    instant: 120,
    fast:    180,
    base:    280,
    medium:  450,
    slow:    700,
    counter: 900,
    ring:    1100,
    page:    600
  };

  const STAGGER = {
    card: 55,     // ms between successive card reveals
    row:  40
  };

  const CONFIG = {
    reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ease: EASE,
    duration: DURATION,
    stagger: STAGGER
  };

  // ---------- counter (number roll-up) animation ----------
  // Animates a numeric text value from `from` to `to` over `duration` ms.
  function animateCounter(el, from, to, opts) {
    opts = opts || {};
    const duration = CONFIG.reducedMotion ? 0 : (opts.duration || DURATION.counter);
    const format = opts.format || (n => Math.round(n).toString());
    const startTime = performance.now();

    if (duration === 0) {
      el.textContent = format(to);
      return;
    }

    function tick(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutExpo(t);
      const value = from + (to - from) * eased;
      el.textContent = format(value);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = format(to);
    }
    requestAnimationFrame(tick);
  }

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  // ---------- progress ring ----------
  // Sets stroke-dashoffset on an SVG circle to represent a 0-100 percentage.
  function animateRing(circleEl, pct, opts) {
    opts = opts || {};
    const r = circleEl.r.baseVal.value;
    const circumference = 2 * Math.PI * r;
    circleEl.style.strokeDasharray = `${circumference}`;
    const target = circumference - (Math.max(0, Math.min(100, pct)) / 100) * circumference;
    if (CONFIG.reducedMotion) {
      circleEl.style.strokeDashoffset = target;
      return;
    }
    circleEl.style.transition = `stroke-dashoffset ${opts.duration || DURATION.ring}ms ${EASE.standard}`;
    // force reflow so transition applies from current value
    circleEl.getBoundingClientRect();
    requestAnimationFrame(() => { circleEl.style.strokeDashoffset = target; });
  }

  // ---------- progress bar ----------
  function animateBar(barEl, pct, opts) {
    opts = opts || {};
    const p = Math.max(0, Math.min(100, pct));
    if (CONFIG.reducedMotion) {
      barEl.style.width = p + '%';
      return;
    }
    barEl.style.transition = `width ${opts.duration || DURATION.slow}ms ${EASE.standard}`;
    requestAnimationFrame(() => { barEl.style.width = p + '%'; });
  }

  // ---------- scroll reveal ----------
  // Adds 'in-view' class to elements with [data-reveal] as they enter viewport.
  function initScrollReveal(root) {
    const targets = (root || document).querySelectorAll('[data-reveal]');
    if (!targets.length) return;
    if (CONFIG.reducedMotion || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('in-view'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(el => io.observe(el));
  }

  // ---------- card stagger ----------
  function applyStagger(elements, gapMs) {
    const gap = gapMs || STAGGER.card;
    Array.from(elements).forEach((el, i) => {
      el.style.setProperty('--i', i);
      el.style.animationDelay = `${i * gap}ms`;
    });
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(message, opts) {
    opts = opts || {};
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove('warn');
    if (opts.warn) el.classList.add('warn');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), opts.duration || 2200);
  }

  // ---------- micro press feedback ----------
  function bindPressFeedback(selector) {
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('pointerdown', () => el.classList.add('is-pressed'));
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
        el.addEventListener(evt, () => el.classList.remove('is-pressed'))
      );
    });
  }

  // ---------- page transition (curtain) ----------
  function pageOut(href) {
    if (CONFIG.reducedMotion) { window.location.href = href; return; }
    const curtain = document.getElementById('page-curtain');
    if (!curtain) { window.location.href = href; return; }
    curtain.classList.add('active');
    setTimeout(() => { window.location.href = href; }, DURATION.medium);
  }

  function pageInReveal() {
    const app = document.getElementById('app');
    if (app) requestAnimationFrame(() => app.classList.add('show'));
    const curtain = document.getElementById('page-curtain');
    if (curtain) setTimeout(() => curtain.classList.remove('active'), 60);
  }

  global.NKXAnim = {
    CONFIG,
    EASE,
    DURATION,
    STAGGER,
    animateCounter,
    animateRing,
    animateBar,
    initScrollReveal,
    applyStagger,
    toast,
    bindPressFeedback,
    pageOut,
    pageInReveal
  };

})(window);
