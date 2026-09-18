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

  // Connection state is the presence of an API key — the only credential the
  // extension holds. The legacy public_id/session_token pair is gone.
  chrome.storage.local.get(['public_id', 'api_key'], (st) => {
    const pid = (st.public_id || '').trim();
    const connected = !!st.api_key;
    if (statusEl) {
      statusEl.textContent = connected ? (pid ? `Connected: @${pid}` : 'Connected') : 'Not connected';
    }
    if (signInBtn) {
      signInBtn.querySelector('span').textContent = connected ? 'Open Helpotron' : 'Get an API key';
    }
  });

  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      // Straight to the panel that mints a key — there is no login flow.
      chrome.tabs.create({ url: `${await getServer()}/settings#apikeys` });
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
