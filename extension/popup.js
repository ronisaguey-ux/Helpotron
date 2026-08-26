const statusEl = document.getElementById('status');
const serverInput = document.getElementById('server');
const publicIdInput = document.getElementById('public_id');
const tabSelect = document.getElementById('tabSelect');
const unparseableBox = document.getElementById('unparseableBox');
const unparseableReason = document.getElementById('unparseableReason');
const btnOpenDataLake = document.getElementById('btnOpenDataLake');

function setStatus(text) {
  statusEl.innerText = text;
}

function showUnparseable(reason) {
  unparseableBox.style.display = 'block';
  unparseableReason.innerText = `⚠️ Unparseable Website: ${reason || 'Unsupported DOM or protected webview.'}`;
}

function hideUnparseable() {
  unparseableBox.style.display = 'none';
}

async function init() {
  const { server, public_id, update_available, latest_version } = await chrome.storage.local.get(['server', 'public_id', 'update_available', 'latest_version']);
  serverInput.value = server || 'http://localhost:8000';
  publicIdInput.value = public_id || '';
  publicIdInput.placeholder = 'your Helpotron username';

  const updateBanner = document.getElementById('updateBanner');
  const updateBadge = document.getElementById('updateVersionBadge');
  const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');

  if (update_available && latest_version) {
    updateBanner.style.display = 'block';
    if (updateBadge) updateBadge.innerText = `v${latest_version}`;
  } else {
    updateBanner.style.display = 'none';
  }

  if (btnDownloadUpdate) {
    btnDownloadUpdate.addEventListener('click', async () => {
      const srv = serverInput.value.trim() || 'http://localhost:8000';
      chrome.tabs.create({ url: `${srv}/api/extension/download` });
    });
  }

  // Populate open tabs into dropdown
  chrome.runtime.sendMessage({ action: 'getTabs' }, (resp) => {
    if (resp?.ok && resp.tabs) {
      tabSelect.innerHTML = '';
      resp.tabs.forEach((t) => {
        if (t.url && /^https?:/i.test(t.url)) {
          const opt = document.createElement('option');
          opt.value = t.id;
          let host = '';
          try { host = new URL(t.url).hostname; } catch {}
          opt.innerText = `${t.active ? '👉 ' : ''}${(t.title || '').slice(0, 38)} (${host})`;
          if (t.active) opt.selected = true;
          tabSelect.appendChild(opt);
        }
      });
      if (tabSelect.options.length === 0) {
        tabSelect.innerHTML = '<option value="">No eligible tabs open</option>';
      }
    }
  });
}

document.getElementById('startScrape').addEventListener('click', async () => {
  hideUnparseable();
  const selectedTabId = tabSelect.value;
  setStatus('🔍 Analyzing page & running extraction heuristics…');
  const resp = await chrome.runtime.sendMessage({ action: 'startScrape', tabId: selectedTabId });
  if (resp?.ok) {
    setStatus(`✅ Tracked & Ingested: ${resp.title}`);
  } else if (resp?.unparseable) {
    setStatus('❌ Unable to parse assignment content.');
    showUnparseable(resp.error);
  } else {
    setStatus(`❌ ${resp?.error || 'Extraction failed'}`);
  }
});

document.getElementById('activateAgent').addEventListener('click', async () => {
  hideUnparseable();
  const selectedTabId = tabSelect.value;
  setStatus('🤖 Spawning AI Subagent with custom tools on selected tab…');
  const resp = await chrome.runtime.sendMessage({ action: 'activateAgent', tabId: selectedTabId });
  if (!resp?.ok) {
    setStatus(`❌ ${resp?.error || 'Failed starting subagent'}`);
  } else {
    setStatus(`🤖 Subagent ${resp.session_id} active. Methodically inspecting DOM, rubrics, and attachments…`);
    pollAgentStatus(resp.session_id);
  }
});

async function pollAgentStatus(sessionId) {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 6000)); // poll every 6s
    const s = await chrome.runtime.sendMessage({ action: 'agentStatus' }).catch(() => null);
    if (!s || !s.active) continue;

    if (s.status === 'done') {
      setStatus(`✅ Subagent completed (${s.steps} tool calls) — clean coursework ingested into Helpotron!`);
      return;
    }
    if (s.status === 'unparseable') {
      setStatus('⚠️ Website cannot be parsed by subagent.');
      showUnparseable(s.result_text || 'Protected webview or missing rubric data.');
      return;
    }
    if (s.status === 'failed' || s.status === 'disconnected') {
      setStatus(`❌ Subagent ${s.status} — compute credits preserved. Retry on another tab.`);
      return;
    }
    if (s.status === 'running') {
      setStatus(`🤖 Subagent running [Step ${s.steps}/120] — executing custom tool calls…`);
    }
  }
}

document.getElementById('startRecording').addEventListener('click', async () => {
  setStatus('Opening audio recorder…');
  const resp = await chrome.runtime.sendMessage({ action: 'startRecording' });
  if (!resp?.ok) setStatus(`❌ ${resp?.error || 'failed'}`);
  else setStatus('🎙️ Audio recorder tab launched.');
});

btnOpenDataLake.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openDataLake' });
});

document.getElementById('saveSettings').addEventListener('click', async () => {
  const srv = serverInput.value.trim() || 'http://localhost:8000';
  const pid = publicIdInput.value.trim();
  const pwd = document.getElementById('password')?.value;

  if (pid && pwd) {
    try {
      setStatus('🔐 Authenticating with Helpotron…');
      const res = await fetch(`${srv}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: pid, password: pwd }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        await chrome.storage.local.set({
          server: srv,
          public_id: data.public_id || pid,
          token: data.token,
        });
        setStatus('✅ Logged in & token saved');
        return;
      } else {
        setStatus(`❌ Auth failed: ${data.detail || data.message || 'Invalid credentials'}`);
        return;
      }
    } catch (e) {
      setStatus(`❌ Connection error: ${String(e)}`);
      return;
    }
  }

  await chrome.storage.local.set({
    server: srv,
    public_id: pid,
  });
  setStatus('✅ Settings saved');
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'unparseable_report') {
    showUnparseable(msg.reason);
  }
});

init();
