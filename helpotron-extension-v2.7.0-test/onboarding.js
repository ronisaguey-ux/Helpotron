// onboarding.js — first-run page: reflects the real account state and gives
// the two exits (sign in on the website / close). No nag logic here — the
// page only ever opens once, from background.js on install.
(function () {
  'use strict';

  const statusEl = document.getElementById('obStatus');
  const signInBtn = document.getElementById('obSignIn');
  const doneBtn = document.getElementById('obDone');

  function getServer() {
    return new Promise((resolve) => {
      chrome.storage.local.get('server', (st) => resolve((st.server || 'https://helpotron.dpdns.org').replace(/\/+$/, '')));
    });
  }

  chrome.storage.local.get(['public_id', 'session_token', 'token'], (st) => {
    const pid = (st.public_id || '').trim();
    const connected = !!(pid && (st.session_token || st.token));
    if (statusEl) {
      statusEl.textContent = connected ? `Connected: @${pid}` : 'Not connected';
    }
    if (signInBtn) {
      signInBtn.querySelector('span').textContent = connected ? 'Open Helpotron' : 'Sign in to Helpotron';
    }
  });

  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      chrome.tabs.create({ url: await getServer() });
    });
  }
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      chrome.tabs.getCurrent((tab) => {
        if (tab && tab.id != null) chrome.tabs.remove(tab.id);
      });
    });
  }
})();
