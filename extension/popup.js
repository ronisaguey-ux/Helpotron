const statusEl = document.getElementById('status');
const serverInput = document.getElementById('server');
const publicIdInput = document.getElementById('public_id');

function setStatus(text) {
  statusEl.innerText = text;
}

async function init() {
  const { server, public_id } = await chrome.storage.local.get(['server', 'public_id']);
  serverInput.value = server || 'http://localhost:8000';
  publicIdInput.value = public_id || 'dev-user';
}

document.getElementById('startScrape').addEventListener('click', async () => {
  setStatus('Scraping...');
  const resp = await chrome.runtime.sendMessage({ action: 'startScrape' });
  if (resp?.ok) setStatus(`✅ Tracked: ${resp.title}`);
  else setStatus(`❌ ${resp?.error || 'failed'}`);
});

document.getElementById('startRecording').addEventListener('click', async () => {
  setStatus('Opening recorder...');
  const resp = await chrome.runtime.sendMessage({ action: 'startRecording' });
  if (!resp?.ok) setStatus(`❌ ${resp?.error || 'failed'}`);
  else setStatus('🎙️ Recorder tab opened');
});

document.getElementById('saveSettings').addEventListener('click', async () => {
  await chrome.storage.local.set({ server: serverInput.value.trim(), public_id: publicIdInput.value.trim() });
  setStatus('✅ Settings saved');
});

init();
