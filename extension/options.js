// options.js — wires the options page to chrome.storage.sync/local.
// Shape: theme + accent + capture/privacy toggles = sync (device-agnostic
// preferences); account = local (credentials never sync).

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SYNC_KEYS = {
    ext_theme: 'dark',
    ext_accent: 'teal',
  };

  const els = {
    status: $('optAccountStatus'),
    lastSync: $('optLastSync'),
    avatar: $('optAvatar'),
    disconnect: $('btnDisconnect'),
    signIn: $('optSignIn'),
    themeButtons: document.querySelectorAll('[data-theme-pick]'),
    swatches: document.querySelectorAll('[data-accent]'),
    linkPrivacy: $('linkPrivacy'),
    linkTerms: $('linkTerms'),
  };

  function getServer() {
    return new Promise((resolve) => {
      chrome.storage.local.get('server', (st) => resolve((st.server || 'https://helpotron.dpdns.org').replace(/\/+$/, '')));
    });
  }

  function paintAccount() {
    chrome.storage.local.get(['public_id', 'session_token', 'token'], (st) => {
      const pid = (st.public_id || '').trim();
      const connected = !!(pid && (st.session_token || st.token));
      if (connected) {
        els.status.textContent = `Connected: @${pid}`;
        els.lastSync.textContent = 'Last synced: just now';
        els.avatar.textContent = (pid[0] || 'S').toUpperCase();
        els.disconnect.hidden = false;
        els.signIn.hidden = true;
      } else {
        els.status.textContent = 'Not connected';
        els.lastSync.textContent = 'Sign in to sync your scrapes and chat.';
        els.avatar.textContent = 'S';
        els.disconnect.hidden = true;
        els.signIn.hidden = false;
      }
    });
  }

  function markTheme(pref) {
    els.themeButtons.forEach((b) => {
      b.classList.toggle('selected', b.dataset.themePick === pref);
      b.setAttribute('aria-pressed', b.dataset.themePick === pref ? 'true' : 'false');
    });
  }
  function markAccent(accent) {
    els.swatches.forEach((s) => s.classList.toggle('selected', s.dataset.accent === accent));
  }

  function init() {
    chrome.storage.sync.get(SYNC_KEYS, (st) => {
      markTheme(st.ext_theme || 'dark');
      markAccent(st.ext_accent || 'teal');
    });
    paintAccount();
  }

  function save(extra) {
    chrome.storage.sync.set(extra || {});
  }

  // ── Theme picker ──
  els.themeButtons.forEach((b) => {
    b.addEventListener('click', () => {
      save({ ext_theme: b.dataset.themePick });
      markTheme(b.dataset.themePick);
    });
  });

  // ── Accent swatches ──
  els.swatches.forEach((s) => {
    s.addEventListener('click', () => {
      save({ ext_accent: s.dataset.accent });
      markAccent(s.dataset.accent);
    });
  });

  // ── Account actions ──
  els.disconnect.addEventListener('click', async () => {
    await chrome.storage.local.remove(['public_id', 'token', 'session_token']);
    paintAccount();
  });

  els.signIn.addEventListener('click', async () => {
    const srv = await getServer();
    chrome.tabs.create({ url: srv });
  });

  els.linkPrivacy.addEventListener('click', async (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${await getServer()}/privacy` });
  });
  els.linkTerms.addEventListener('click', async (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${await getServer()}/terms` });
  });

  init();
})();
