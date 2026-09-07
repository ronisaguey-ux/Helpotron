// theme.js — applies the extension theme at document start (dark-first).
// Persisted in chrome.storage.sync as 'ext_theme' ('dark' | 'light' | 'system')
// and 'ext_accent' ('teal' | 'indigo' | 'rose' | 'amber'). Options page and
// popup both load this file first; popup.css tokens switch on
// <html data-theme="dark|light"> + accent overrides.
(function () {
  'use strict';

  // Accent palettes: [dark primary, dark hover, dark on-primary] / [light ...]
  var ACCENTS = {
    teal: {
      dark: ['#59d8c9', '#76f5e5', '#003732'],
      light: ['#00685f', '#008378', '#ffffff'],
    },
    indigo: {
      dark: ['#bfc2ff', '#e0e0ff', '#1518a6'],
      light: ['#4648d4', '#6063ee', '#ffffff'],
    },
    rose: {
      dark: ['#ffb2be', '#ffdad9', '#660021'],
      light: ['#924628', '#b05e3d', '#ffffff'],
    },
    amber: {
      dark: ['#ffc46b', '#ffd99e', '#4a2c00'],
      light: ['#a05c00', '#c26f0e', '#ffffff'],
    },
  };

  function resolveTheme(pref) {
    if (pref === 'light') return 'light';
    if (pref === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }

  function apply(theme, accent) {
    var t = resolveTheme(theme);
    document.documentElement.dataset.theme = t;
    var ac = ACCENTS[accent];
    if (!ac || accent === 'teal') return;
    var p = t === 'light' ? ac.light : ac.dark;
    var s = document.documentElement.style;
    s.setProperty('--primary', p[0]);
    s.setProperty('--primary-hover', p[1]);
    s.setProperty('--on-primary', p[2]);
    s.setProperty('--ring', p[0]);
  }

  // Instant default before first paint (dark-first product default).
  apply('dark', undefined);

  try {
    chrome.storage.sync.get(['ext_theme', 'ext_accent'], function (st) {
      apply(st.ext_theme || 'dark', st.ext_accent);
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync' || (!changes.ext_theme && !changes.ext_accent)) return;
      chrome.storage.sync.get(['ext_theme', 'ext_accent'], function (st) {
        apply(st.ext_theme || 'dark', st.ext_accent);
      });
    });
  } catch (e) { /* opened outside a browser (dev preview) */ }
})();
