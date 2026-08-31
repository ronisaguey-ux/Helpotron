const statusEl = document.getElementById('status');
const serverInput = document.getElementById('server');
const publicIdInput = document.getElementById('public_id');
const tabSelect = document.getElementById('tabSelect');
const unparseableBox = document.getElementById('unparseableBox');
const unparseableReason = document.getElementById('unparseableReason');
const btnOpenDataLake = document.getElementById('btnOpenDataLake');
const openAssignmentBtn = document.getElementById('openAssignmentBtn');

const TABS_CACHE_KEY = 'helpotron_tabs_cache';
const CRAWL_CACHE_KEY = 'helpotron_crawl_cache';
const LAST_SCRAPE_KEY = 'helpotron_last_scrapes';

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

// Popup-open latency: the popup paints from cached snapshots first, then
// refreshes from the service worker / server after first paint. The tab
// dropdown is the slowest piece today — it waits for a SW message round-trip
// (cold SW = wake + parse), so cache the last-known tab list in storage and
// render it synchronously in init().
function renderTabOptions(tabs) {
  tabSelect.innerHTML = '';
  tabs.forEach((t) => {
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

async function refreshTabs() {
  chrome.runtime.sendMessage({ action: 'getTabs' }, (resp) => {
    if (resp?.ok && resp.tabs) {
      renderTabOptions(resp.tabs, false);
      // Cache the snapshot for instant paint on the next popup open.
      chrome.storage.local.set({ [TABS_CACHE_KEY]: resp.tabs }).catch(() => {});
    }
  });
}

async function init() {
  // ONE batched storage read — everything else paints from these snapshots.
  const st = await chrome.storage.local.get([
    'server', 'public_id', 'token', 'session_token',
    'update_available', 'latest_version', CHAT_KEY,
    TABS_CACHE_KEY, CRAWL_CACHE_KEY,
  ]);
  serverInput.value = st.server || 'https://helpotron.dpdns.org';
  publicIdInput.value = st.public_id || '';
  publicIdInput.placeholder = 'your Helpotron username';
  // 08-26: scrape data must land on the right account — force login first.
  // session_token is the long-lived (7-day sliding) credential returned by
  // /api/login; the 24h JWT in `token` is only a fallback.
  const loggedIn = !!(st.public_id && (st.token || st.session_token));
  if (!loggedIn) {
    setStatus('⚠️ Login required: enter your Helpotron username & password below and Save (or sign in on the website once — the session syncs here). Scrapes stay disabled until then.');
    statusEl.classList.remove('hidden');
  }

  const updateBanner = document.getElementById('updateBanner');
  const updateBadge = document.getElementById('updateVersionBadge');
  const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');

  if (st.update_available && st.latest_version) {
    updateBanner.style.display = 'block';
    if (updateBadge) updateBadge.innerText = `v${st.latest_version}`;
  } else {
    updateBanner.style.display = 'none';
  }

  if (btnDownloadUpdate) {
    btnDownloadUpdate.addEventListener('click', async () => {
      const srv = serverInput.value.trim() || 'http://localhost:8000';
      chrome.tabs.create({ url: `${srv}/api/extension/download` });
    });
  }

  // Instant paint #1: cached tab dropdown (no SW round-trip needed).
  if (st[TABS_CACHE_KEY] && st[TABS_CACHE_KEY].length) {
    renderTabOptions(st[TABS_CACHE_KEY]);
  }

  // Instant paint #2: cached chat mirror (empty → greeting + help note).
  renderChat(st[CHAT_KEY]);

  // Instant paint #3: last-known crawl progress.
  if (st[CRAWL_CACHE_KEY]) {
    renderCrawlStatus(st[CRAWL_CACHE_KEY]);
  }

  // Chatbox: enabled only when logged in.
  chatSendBtn.disabled = !loggedIn;

  // ── Anything requiring the service worker or the network is deferred to
  // past the first drawn frame; the UI above is already fully informative. ──
  requestAnimationFrame(() => {
    // Refresh tabs list (also re-caches it) after paint.
    refreshTabs();
    // Resume showing an in-flight course crawl (08-28).
    pollCrawlStatus();
    // Reconcile chat with the server (mirror already painted).
    if (loggedIn) loadChatHistory();
  });
}

// 08-28 auto-create/return bubble: the server upsert creates the Assignment
// bubble when the scraped page has none yet (dedupe on canvas_id) and returns
// its id; remember the payload per tab so the chatbox can pin instructions and
// follow-up runs to the SAME bubble, and surface an "open bubble" button.
async function rememberScrape(tabId, resp) {
  if (!tabId || !resp?.assignment_id) return;
  try {
    const all = (await chrome.storage.local.get(LAST_SCRAPE_KEY))[LAST_SCRAPE_KEY] || {};
    all[String(tabId)] = {
      assignment_id: resp.assignment_id,
      title: resp.title || '',
      payload: resp.payload || null,
      ts: Date.now(),
    };
    // keep only the newest 40 tabs
    const keys = Object.keys(all);
    if (keys.length > 40) delete all[keys[0]];
    await chrome.storage.local.set({ [LAST_SCRAPE_KEY]: all });
  } catch { /* storage is best-effort here */ }
}

function showOpenAssignment(assignmentId) {
  if (!assignmentId) return;
  openAssignmentBtn.style.display = 'block';
  openAssignmentBtn.innerText = `📖 Open bubble #${assignmentId} in Helpotron`;
  openAssignmentBtn.dataset.assignmentId = String(assignmentId);
}

openAssignmentBtn.addEventListener('click', () => {
  const id = openAssignmentBtn.dataset.assignmentId;
  if (!id) return;
  const srv = (serverInput.value.trim() || 'http://localhost:8000').replace(/\/+$/, '');
  chrome.tabs.create({ url: `${srv}/#assignment=${id}` });
  setStatus(`📖 Opening bubble #${id} in Helpotron…`);
});

document.getElementById('startScrape').addEventListener('click', async () => {
  hideUnparseable();
  openAssignmentBtn.style.display = 'none';
  const selectedTabId = tabSelect.value;
  setStatus('🔍 Deep-scraping page (waiting for load, expanding content, hashing files)…');
  const resp = await chrome.runtime.sendMessage({ action: 'startScrape', tabId: selectedTabId });
  if (resp?.ok) {
    const bits = [];
    if (resp.promptLen) bits.push(`${resp.promptLen} chars of content`);
    if (resp.filesFound) bits.push(`${resp.filesFound} files found (${resp.filesUploaded || 0} uploaded to dump, ${resp.filesRecorded || 0} URL+hash saved)`);
    const detail = bits.length ? ` — ${bits.join(', ')}` : '';
    setStatus(`✅ Tracked & Ingested: ${resp.title}${detail} — bubble #${resp.assignment_id}`);
    const srv = (serverInput.value.trim() || 'http://localhost:8000').replace(/\/+$/, '');
    await rememberScrape(selectedTabId, resp);
    showOpenAssignment(resp.assignment_id);
  } else if (resp?.unparseable) {
    setStatus('❌ Nothing could be collected — no content and no files found.');
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

// ── Full-course crawl UI (08-28) ──────────────────────────────────────────────
const btnStartCrawl = document.getElementById('startCrawl');
const btnStopCrawl = document.getElementById('stopCrawl');
const crawlProgressEl = document.getElementById('crawlProgress');
let crawlPollTimer = null;

function renderCrawlStatus(s) {
  if (!s || !s.phase || s.phase === 'idle') {
    btnStartCrawl.style.display = '';
    btnStopCrawl.style.display = 'none';
    crawlProgressEl.style.display = 'none';
    return;
  }
  const active = s.phase === 'queued' || s.phase === 'running' || s.phase === 'stopping';
  btnStartCrawl.style.display = active ? 'none' : '';
  btnStopCrawl.style.display = active ? '' : 'none';
  crawlProgressEl.style.display = 'block';
  let text = '';
  if (s.phase === 'queued' || s.phase === 'running') {
    text = `🌐 Scraping ${s.scope || ''} — ${s.done}/${s.total} pages saved`;
    if (s.failed) text += `, ${s.failed} skipped`;
    if (s.lastTitle) text += `\nLast: ${s.lastTitle}`;
    if (s.phase === 'queued') text = '🌐 Course crawl queued — starting in a moment… ' + text.slice(10);
    crawlProgressEl.style.color = '#93c5fd';
  } else if (s.phase === 'done') {
    text = `✅ Course crawl finished — ${s.done}/${s.total} pages saved` + (s.failed ? `, ${s.failed} skipped (${s.lastError || ''})` : '');
    crawlProgressEl.style.color = '#6ee7b7';
  } else if (s.phase === 'stopped') {
    text = `⏹ Crawl stopped — ${s.done}/${s.total} pages saved before stopping.`;
    crawlProgressEl.style.color = '#fda4af';
  } else if (s.phase === 'stopping') {
    text = '⏹ Stopping crawl…';
    crawlProgressEl.style.color = '#fda4af';
  } else if (s.phase === 'failed') {
    text = `❌ Crawl error: ${s.lastError || 'unknown'}`;
    crawlProgressEl.style.color = '#fca5a5';
  }
  crawlProgressEl.innerText = text;
}

async function pollCrawlStatus() {
  const resp = await chrome.runtime.sendMessage({ action: 'crawlStatus' }).catch(() => null);
  const state = resp && resp.ok ? resp : { phase: 'idle' };
  renderCrawlStatus(state);
  // Instant-paint cache: the last-known crawl progress so the next popup open
  // paints it before the SW reply arrives.
  if (state.phase && state.phase !== 'idle') {
    chrome.storage.local.set({ [CRAWL_CACHE_KEY]: state }).catch(() => {});
  }
  if (state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'stopped' && state.phase !== 'failed') {
    crawlPollTimer = setTimeout(pollCrawlStatus, 2000);
  } else {
    crawlPollTimer = null;
  }
}

btnStartCrawl.addEventListener('click', async () => {
  hideUnparseable();
  const selectedTabId = tabSelect.value;
  setStatus('🌐 Scanning course links & index pages… (robots-respecting)');
  const resp = await chrome.runtime.sendMessage({ action: 'startCrawl', tabId: selectedTabId });
  if (resp?.ok) {
    setStatus(`🌐 Queued ${resp.total} pages of ${resp.scope} — scraping slowly with the badge showing progress. You can close the popup.`);
    pollCrawlStatus();
  } else {
    setStatus(`❌ ${resp?.error || 'Failed to start course crawl'}`);
  }
});

btnStopCrawl.addEventListener('click', async () => {
  setStatus('⏹ Stopping course crawl…');
  const resp = await chrome.runtime.sendMessage({ action: 'stopCrawl' });
  setStatus(resp?.ok ? `⏹ Crawl stopped.` : `❌ ${resp?.error || 'No crawl running'}`);
  pollCrawlStatus();
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

  // 08-31 captcha: when the server enforces Turnstile, this popup cannot solve
  // it (MV3 blocks remote scripts), so password login here would 403. The web
  // app login hands the session to the extension (HELPOTRON_SESSION_HANDOFF →
  // storeSession); here we validate any synced session or route the user there.
  let captchaOn = false;
  try {
    const cfgRes = await fetch(`${srv}/api/public-config`);
    const cfg = await cfgRes.json();
    captchaOn = !!(cfg && cfg.captcha_enabled);
  } catch (e) { /* server unreachable; try normal auth below */ }

  if (captchaOn && pid && pwd) {
    const st = await chrome.storage.local.get(['public_id', 'session_token', 'token']);
    if (st.public_id && (st.session_token || st.token)) {
      try {
        const meRes = await fetch(`${srv}/api/me`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.session_token || st.token}` },
        });
        const me = await meRes.json();
        if (meRes.ok && me.public_id) {
          setStatus(`✅ Signed in as ${me.public_id} — web session synced to the extension`);
          chatSendBtn.disabled = false;
          loadChatHistory();
          return;
        }
      } catch (e) { /* session stale — fall through */ }
    }
    await chrome.storage.local.set({ server: srv, public_id: pid });
    setStatus('🔒 Security check is on — sign in on the Helpotron website (session syncs here automatically). Opening site…');
    chrome.tabs.create({ url: srv });
    return;
  }

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
          session_token: data.session_token || '',
        });
        setStatus('✅ Logged in & token saved');
        chatSendBtn.disabled = false;
        loadChatHistory();
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

// Live-sync: when the web app hands off a session after a captcha login, the
// popup picks it up without a manual reopen.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.public_id || changes.session_token || changes.token)) {
    init();
  }
});

// ── Mini Agent Chatbox (talk to the scraper/capture agent) ───────────────────
// Messages go to POST /api/extension/agent_chat (same agent pipeline as the
// web chat, on the 'extensions' surface). History comes from
// GET /api/extension/agent_chat/history. A local mirror in chrome.storage
// keeps the conversation visible even when the server is unreachable, and
// everything also persists server-side (AgentChatMessage), so the popup
// reopen / restart / web-chat views all agree.

const CHAT_KEY = 'helpotron_chat';
const chatMessagesEl = document.getElementById('chatMessages');
const chatInputEl = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSend');
const chatScrapeBtn = document.getElementById('chatScrapeTab');
const chatRefreshBtn = document.getElementById('chatRefresh');
let chatBusy = false;

async function chatAuthHeaders() {
  const { session_token, token } = await chrome.storage.local.get(['session_token', 'token']);
  const auth = session_token || token || '';
  return auth ? { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }
              : { 'Content-Type': 'application/json' };
}

async function chatIsLoggedIn() {
  const { public_id, session_token, token } = await chrome.storage.local.get(['public_id', 'session_token', 'token']);
  return !!(public_id && (session_token || token));
}

function addChatMessageEl(sender, text, isTyping) {
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (sender === 'user' ? 'user' : sender === 'agent' ? 'agent' : 'chat-note');
  if (sender === 'user') {
    const sp = document.createElement('span');
    sp.className = 'chat-sender';
    sp.textContent = 'You';
    div.appendChild(sp);
  } else if (sender === 'agent') {
    const sp = document.createElement('span');
    sp.className = 'chat-sender';
    sp.textContent = 'Agent';
    div.appendChild(sp);
  }
  const body = document.createElement('span');
  body.textContent = text;
  div.appendChild(body);
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return div;
}

function chatReplyText(data, fallback) {
  const raw = data && (data.reply || data.message);
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw.text === 'string') return raw.text;
  if (data && data.status === 'insufficient_tokens') return '⚠️ Insufficient tokens — the operator hasn’t granted you tokens yet.';
  return fallback || '✅ Done.';
}

async function cacheChat(msgs) {
  const list = (msgs || []).slice(-80).map((m) => ({
    sender: m.sender === 'user' ? 'user' : 'agent',
    text: m.text,
    ts: m.timestamp || new Date().toISOString(),
  }));
  await chrome.storage.local.set({ [CHAT_KEY]: list });
}

// ── Greeting handling (08-28) ────────────────────────────────────────────────
// The extension agent chat greets by time of day. Empty-name fix (consistent
// with the web TodayView fix): a missing, blank or 'Guest' name is NEVER
// interpolated — it hides the name fragment and falls back to the neutral
// 'there', so no "Good afternoon , there ." style gap can ever render.
function greetingNameFallback() {
  const pid = (publicIdInput.value || '').trim();
  return (pid && pid !== 'Guest') ? pid : 'there';
}

function chatGreetingText() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${greetingNameFallback()}.`;
}

function renderChat(msgs) {
  chatMessagesEl.innerHTML = '';
  if (!msgs || msgs.length === 0) {
    // Welcome/onboarding greeting: renders the neutral 'there' when the
    // account has no display name yet — never an empty-name fragment.
    addChatMessageEl('note', `👋 ${chatGreetingText()} This chat talks to your Helpotron agent — ask it to scrape, summarize, or plan the page you have open.`);
    addChatMessageEl('note', '💡 Type an instruction, e.g. “only scrape algebra” — the agent replies here.');
    return;
  }
  msgs.forEach((m) => addChatMessageEl(m.sender === 'user' ? 'user' : 'agent', m.text));
}

async function loadChatHistory() {
  // Instant paint from the local mirror, then reconcile with the server.
  const cached = (await chrome.storage.local.get(CHAT_KEY))[CHAT_KEY];
  if (cached && cached.length) renderChat(cached);
  const srv = serverInput.value.trim() || 'http://localhost:8000';
  try {
    const headers = await chatAuthHeaders();
    if (!headers.Authorization) return; // login required; init() holds the note
    const res = await fetch(`${srv}/api/extension/agent_chat/history`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const msgs = ((data && data.chat) || []).map((m) => ({ sender: m.sender, text: m.text }));
    if (msgs.length) {
      renderChat(msgs);
      cacheChat(msgs);
    } else if (cached && cached.length) {
      renderChat(cached); // server has nothing (new account) — keep the mirror
    }
  } catch (e) {
    if (!cached || !cached.length) {
      addChatMessageEl('note', '⚠️ Could not reach server history — is the server up and restarted with the chat route?');
    }
  }
}

async function sendChatMessage() {
  const text = chatInputEl.value.trim();
  if (!text || chatBusy) return;
  if (!(await chatIsLoggedIn())) {
    setStatus('⚠️ Login required: enter your Helpotron username & password below and save.');
    return;
  }
  const srv = serverInput.value.trim() || 'http://localhost:8000';
  chatBusy = true;
  chatSendBtn.disabled = true;
  chatInputEl.value = '';
  addChatMessageEl('user', text);
  const typingEl = addChatMessageEl('agent', '…thinking…');
  try {
    const res = await fetch(`${srv}/api/extension/agent_chat`, {
      method: 'POST',
      headers: await chatAuthHeaders(),
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    const reply = chatReplyText(data, '✅ Done.');
    typingEl.replaceWith(addChatMessageEl('agent', reply));
    setStatus(`💬 Agent answered (${reply.slice(0, 60)}${reply.length > 60 ? '…' : ''})`);
    const cur = (await chrome.storage.local.get(CHAT_KEY))[CHAT_KEY] || [];
    await cacheChat([...cur, { sender: 'user', text }, { sender: 'agent', text: reply }]);
    // 08-28: the agent picked its scrape tool (scrape_assignment on the
    // extensions surface) — the answer prose is the ack; the REAL capture
    // runs in the browser, so drive the same local scraper the button uses.
    // Response shapes accepted: data.scrape_request (route-level contract)
    // or data.execution.action === 'scrape_assignment' (executor passthrough).
    const scrapeAsked = !!(data && (data.scrape_request ||
      (data.execution && data.execution.action === 'scrape_assignment')));
    if (scrapeAsked) {
      // scrape_request rides top-level on the route contract and inside
      // execution on the executor passthrough — accept both.
      const execReq = data.execution && data.execution.scrape_request;
      const scrapeReq = data.scrape_request || execReq || {};
      const instruction = (scrapeReq && typeof scrapeReq.instruction === 'string')
        ? scrapeReq.instruction.trim() : text;
      const last = (await chrome.storage.local.get(LAST_SCRAPE_KEY))[LAST_SCRAPE_KEY];
      const assignmentId = last ? (last[String(tabSelect.value)]?.assignment_id || null) : null;
      const autoNote = scrapeReq.note || '';
      if (autoNote) addChatMessageEl('agent', autoNote);
      await runTabScrapeWithInstruction(instruction || 'scrape the assignment', assignmentId);
    }
  } catch (e) {
    typingEl.replaceWith(addChatMessageEl('agent', `⚠️ ${e.message}`));
    setStatus('❌ Chat send failed; messages stay in this popup only.');
  } finally {
    chatBusy = false;
    chatSendBtn.disabled = false;
    chatInputEl.focus();
  }
}

chatSendBtn.addEventListener('click', sendChatMessage);
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});
chatRefreshBtn.addEventListener('click', async () => {
  setStatus('⟳ Reloading conversation…');
  await loadChatHistory();
  setStatus('✅ Chat reloaded.');
});

// Run the REAL tab scrape for an instruction (08-28): sends the instruction
// into the tab-scraper flow — the same browser agent the 🤖 Spawn button uses,
// with the given instruction as its mission constraint (e.g. "only scrape
// algebra"). Shared by the "Scrape selected tab" button and by the chatbox
// agent's scrape_assignment action (see sendChatMessage).
async function runTabScrapeWithInstruction(instruction, assignmentId) {
  const selectedTabId = tabSelect.value;
  if (!selectedTabId) {
    setStatus('⚠️ Select a target tab above first.');
    return { ok: false, error: 'No tab selected' };
  }
  setStatus('🤖 Sending instruction to the tab scraper…');
  const resp = await chrome.runtime.sendMessage({
    action: 'scrapeWithInstruction',
    tabId: selectedTabId,
    instruction,
    assignmentId,
  }).catch((e) => ({ ok: false, error: String(e) }));
  if (resp?.ok) {
    const bubbleNote = assignmentId ? ` — linked to bubble #${assignmentId}` : '';
    const note = `🤖 Sent to the tab scraper (session ${resp.session_id})${bubbleNote}: “${instruction}”. Progress shows in the status line.`;
    addChatMessageEl('agent', note);
    const cur = (await chrome.storage.local.get(CHAT_KEY))[CHAT_KEY] || [];
    await cacheChat([...cur, { sender: 'user', text: instruction }, { sender: 'agent', text: note }]);
    // Persist the instruction on the bubble (server keeps the last one) so a
    // follow-up message re-runs the scrape with full context.
    const last = (await chrome.storage.local.get(LAST_SCRAPE_KEY))[LAST_SCRAPE_KEY];
    const lastScrape = last ? last[String(selectedTabId)] : null;
    if (lastScrape?.payload && assignmentId) {
      chrome.runtime.sendMessage({
        action: 'persistInstruction',
        payload: lastScrape.payload,
        assignmentId,
        instruction,
      }).catch(() => {});
    }
    setStatus(`🤖 Scraper ${resp.session_id} running with your instruction — methodical scrape started${assignmentId ? ` for bubble #${assignmentId}` : ''}.`);
    pollAgentStatus(resp.session_id);
    return { ok: true };
  }
  setStatus(`❌ ${resp?.error || 'Failed to start the scraper'}`);
  return { ok: false, error: resp?.error || 'Failed to start the scraper' };
}

// Send the typed instruction into the tab-scraper flow (the same browser
// agent the 🤖 Spawn button uses, but with the chatbox text as its mission
// instruction — e.g. "only scrape algebra" constrains what it collects).
chatScrapeBtn.addEventListener('click', async () => {
  const instruction = chatInputEl.value.trim();
  if (!instruction) {
    setStatus('⚠️ Type the instruction first (e.g. "only scrape algebra"), then press this.');
    return;
  }
  // 08-28: continue the SAME bubble the tab was already scraped into (when
  // there is one) — the instruction enters the actual agent scrape run AND is
  // persisted on the assignment for follow-up context.
  const last = (await chrome.storage.local.get(LAST_SCRAPE_KEY))[LAST_SCRAPE_KEY];
  const assignmentId = last ? (last[String(tabSelect.value)]?.assignment_id || null) : null;
  const res = await runTabScrapeWithInstruction(instruction, assignmentId);
  if (res && res.ok) chatInputEl.value = '';
});

// ── Scrape tool (08-28): fill the prompt with scraped page context ───────────
// Given the selected tab, extracts title + URL + visible/main text through the
// same parser as the Scrape buttons (content.js) and FILLS the chat prompt
// with the scraped context — no assignment is saved here; the user reviews and
// sends it to the agent ("scrape into prompt/notes").
const chatScrapeContextBtn = document.getElementById('chatScrapeContext');
chatScrapeContextBtn.addEventListener('click', async () => {
  hideUnparseable();
  const selectedTabId = tabSelect.value;
  setStatus('📄 Extracting page content from the selected tab…');
  const resp = await chrome.runtime.sendMessage({ action: 'scrapeContext', tabId: selectedTabId })
    .catch((e) => ({ ok: false, error: String(e) }));
  if (!resp?.ok) {
    setStatus(`❌ ${resp?.error || 'Scrape failed'}`);
    return;
  }
  chatInputEl.value = resp.text;
  chatInputEl.focus();
  chatInputEl.setSelectionRange(0, 0);
  setStatus(`📄 Scraped "${resp.title}" (${resp.chars} chars) into the prompt — review, add any instruction, then press Send.`);
  const note = `📋 Scraped page into the prompt: ${resp.title} — ${resp.chars} chars of context ready to send.`;
  addChatMessageEl('agent', note);
  const cur = (await chrome.storage.local.get(CHAT_KEY))[CHAT_KEY] || [];
  await cacheChat([...cur, { sender: 'agent', text: note }]);
});

// ── Launch to Doc Assistive Typing Controller ───────────────────────────────
const gdocsTabSelect = document.getElementById('gdocsTabSelect');
const wpmSlider = document.getElementById('wpmSlider');
const wpmValue = document.getElementById('wpmValue');
const btnStartLaunchToDoc = document.getElementById('btnStartLaunchToDoc');
const typingProgressSection = document.getElementById('typingProgressSection');
const typingStatusText = document.getElementById('typingStatusText');
const typingPercentText = document.getElementById('typingPercentText');
const typingProgressBar = document.getElementById('typingProgressBar');
const btnPauseTyping = document.getElementById('btnPauseTyping');
const btnCancelTyping = document.getElementById('btnCancelTyping');
const gdocsTypingBadge = document.getElementById('gdocsTypingBadge');

let isTypingPaused = false;
let activeGDocsTabId = null;


const realismPresetSelect = document.getElementById('realismPreset');
const chkTypos = document.getElementById('chkTypos');
const chkFalseStarts = document.getElementById('chkFalseStarts');
const chkPauses = document.getElementById('chkPauses');
const chkJitter = document.getElementById('chkJitter');
const chkBurst = document.getElementById('chkBurst');
const chkFatigue = document.getElementById('chkFatigue');
const assignmentSelect = document.getElementById('assignmentSelect');

if (realismPresetSelect) {
  realismPresetSelect.addEventListener('change', () => {
    const val = realismPresetSelect.value;
    if (val === 'gentle') {
      if (wpmSlider) wpmSlider.value = 35;
      if (wpmValue) wpmValue.innerText = '35 WPM';
      if (chkTypos) chkTypos.checked = true;
      if (chkFalseStarts) chkFalseStarts.checked = true;
      if (chkFatigue) chkFatigue.checked = true;
    } else if (val === 'academic') {
      if (wpmSlider) wpmSlider.value = 65;
      if (wpmValue) wpmValue.innerText = '65 WPM';
      if (chkTypos) chkTypos.checked = true;
      if (chkFalseStarts) chkFalseStarts.checked = true;
      if (chkBurst) chkBurst.checked = true;
    } else if (val === 'brisk') {
      if (wpmSlider) wpmSlider.value = 95;
      if (wpmValue) wpmValue.innerText = '95 WPM';
      if (chkFalseStarts) chkFalseStarts.checked = false;
      if (chkBurst) chkBurst.checked = true;
    } else if (val === 'motor') {
      if (wpmSlider) wpmSlider.value = 50;
      if (wpmValue) wpmValue.innerText = '50 WPM';
      if (chkTypos) chkTypos.checked = true;
      if (chkFalseStarts) chkFalseStarts.checked = true;
      if (chkJitter) chkJitter.checked = true;
      if (chkFatigue) chkFatigue.checked = true;
    }
  });
}

// Assignment picker (Bob flow 08-31): the extension's launch-to-doc section
// lists the user's Helpotron assignments so they can pick WHICH assignment to
// type, then pick the editor tab, then start. Text is fetched from the
// assignment's full view (draft > materials > prompt), same source the web
// modal uses.
let selectedAssignmentText = '';

async function refreshAssignments() {
  if (!assignmentSelect) return;
  const { server, session_token, token, public_id } = await chrome.storage.local.get([
    'server', 'session_token', 'token', 'public_id',
  ]);
  const srv = server || 'https://helpotron.dpdns.org';
  if (!srv || !public_id || !(session_token || token)) {
    assignmentSelect.innerHTML = '<option value="">Log in to Helpotron to pick an assignment…</option>';
    return;
  }
  try {
    const resp = await fetch(`${srv}/api/assignments`, {
      headers: { Authorization: `Bearer ${session_token || token}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    assignmentSelect.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.innerText = 'Select an assignment to type…';
    assignmentSelect.appendChild(none);
    (data.assignments || []).slice(0, 50).forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.id;
      const s = a.status || '';
      opt.innerText = `(${s}) ${(a.title || `Assignment ${a.id}`).slice(0, 42)}`;
      assignmentSelect.appendChild(opt);
    });
    selectedAssignmentText = '';
  } catch (e) {
    assignmentSelect.innerHTML = '<option value="">Could not load assignments</option>';
  }
}

if (assignmentSelect) {
  assignmentSelect.addEventListener('change', async () => {
    const id = assignmentSelect.value;
    selectedAssignmentText = '';
    if (!id) return;
    const { server, session_token, token } = await chrome.storage.local.get(['server', 'session_token', 'token']);
    const srv = server || 'https://helpotron.dpdns.org';
    try {
      const resp = await fetch(`${srv}/api/assignment/${id}/full-view`, {
        headers: { Authorization: `Bearer ${session_token || token}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const assign = data.assignment || {};
      const materials = data.materials || [];
      let text = assign.do_it_work || '';
      if (!text && materials.length) {
        const textMat = materials.find((m) => m.content_text || m.content);
        if (textMat) text = textMat.content_text || textMat.content;
      }
      if (!text) text = assign.prompt || '';
      selectedAssignmentText = text;
      setStatus(`📄 Loaded "${(assign.title || 'assignment').slice(0, 30)}" (${text.split(/\s+/).filter(Boolean).length} words)`);
    } catch (e) {
      setStatus(`⚠️ Could not load assignment: ${String(e).slice(0, 60)}`);
    }
  });
}

if (wpmSlider && wpmValue) {
  wpmSlider.addEventListener('input', () => {
    wpmValue.innerText = `${wpmSlider.value} WPM`;
  });
}

async function refreshGDocsTabs() {
  if (!gdocsTabSelect) return;
  chrome.runtime.sendMessage({ action: 'getEditableTabs' }, (resp) => {
    gdocsTabSelect.innerHTML = '';
    const tabs = (resp && resp.tabs) || [];
    if (tabs.length === 0) {
      gdocsTabSelect.innerHTML = '<option value="new">✨ Open New Google Doc (docs.new)</option>';
      return;
    }
    tabs.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      const appIcon = t.app === 'Google Docs' ? '📄' : t.app === 'Gmail' ? '✉️' : t.app === 'Notion' ? '📝' : '🌐';
      opt.innerText = `${t.active ? '👉 ' : ''}${appIcon} [${t.app}] ${(t.title || 'Document').slice(0, 26)}`;
      if (t.active) opt.selected = true;
      gdocsTabSelect.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = 'new';
    newOpt.innerText = '➕ Open New Google Doc (docs.new)';
    gdocsTabSelect.appendChild(newOpt);
  });
}

if (btnStartLaunchToDoc) {
  btnStartLaunchToDoc.addEventListener('click', async () => {
    const targetVal = gdocsTabSelect ? gdocsTabSelect.value : null;
    const targetTabId = targetVal && targetVal !== 'new' ? Number(targetVal) : null;
    const wpm = Number(wpmSlider ? wpmSlider.value : 65) || 65;

    // Text source: assignment picker first (Bob flow), then chat, then last payload
    let textToType = selectedAssignmentText || (chatInputEl && chatInputEl.value.trim()) || '';
    if (!textToType) {
      const last = (await chrome.storage.local.get('helpotron_last_doc_payload'))['helpotron_last_doc_payload'];
      textToType = (last && last.text) || 'Helpotron Assistive Typing: Document ready for editing and review.';
    }

    setStatus('⌨️ Launching assistive typing engine…');
    if (typingProgressSection) typingProgressSection.style.display = 'block';
    if (gdocsTypingBadge) gdocsTypingBadge.style.display = 'inline-block';

    const resp = await chrome.runtime.sendMessage({
      action: 'launchToDoc',
      payload: {
        tabId: targetTabId,
        text: textToType,
        wpm,
        naturalPauses: chkPauses ? chkPauses.checked : true,
        jitter: chkJitter ? chkJitter.checked : true,
        typoRate: chkTypos && chkTypos.checked ? 0.02 : 0.0,
        falseStartRate: chkFalseStarts && chkFalseStarts.checked ? 0.015 : 0.0,
        title: assignmentSelect && assignmentSelect.value ? (assignmentSelect.selectedOptions[0] || {}).text || 'Assignment Document' : 'Assignment Document',
      }
    }).catch((e) => ({ ok: false, error: String(e) }));

    if (!resp?.ok) {
      setStatus(`❌ ${resp?.error || 'Could not start assistive typing'}`);
      if (typingProgressSection) typingProgressSection.style.display = 'none';
      if (gdocsTypingBadge) gdocsTypingBadge.style.display = 'none';
    } else {
      activeGDocsTabId = resp.tabId;
      setStatus(`⌨️ Assistive typing active at ${wpm} WPM.`);
    }
  });
}

if (btnPauseTyping) {
  btnPauseTyping.addEventListener('click', async () => {
    if (isTypingPaused) {
      await chrome.runtime.sendMessage({ action: 'resumeTyping', tabId: activeGDocsTabId });
      btnPauseTyping.innerText = '⏸ Pause';
      isTypingPaused = false;
      if (typingStatusText) typingStatusText.innerText = 'Typing…';
    } else {
      await chrome.runtime.sendMessage({ action: 'pauseTyping', tabId: activeGDocsTabId });
      btnPauseTyping.innerText = '▶ Resume';
      isTypingPaused = true;
      if (typingStatusText) typingStatusText.innerText = 'Paused';
    }
  });
}

if (btnCancelTyping) {
  btnCancelTyping.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'cancelTyping', tabId: activeGDocsTabId });
    if (typingProgressSection) typingProgressSection.style.display = 'none';
    if (gdocsTypingBadge) gdocsTypingBadge.style.display = 'none';
    setStatus('⏹ Assistive typing cancelled.');
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'unparseable_report') {
    showUnparseable(msg.reason);
  } else if (msg.action === 'BROADCAST_TYPING_PROGRESS' || msg.action === 'TYPING_PROGRESS') {
    const payload = msg.payload || msg;
    if (typingProgressSection) typingProgressSection.style.display = 'block';
    if (gdocsTypingBadge) gdocsTypingBadge.style.display = 'inline-block';
    const pct = payload.progressPct || payload.percentage || 0;
    if (typingProgressBar) typingProgressBar.style.width = `${pct}%`;
    if (typingPercentText) typingPercentText.innerText = `${pct}% (${payload.wordsTyped || 0}/${payload.totalWords || 0} w)`;
    if (typingStatusText) {
      if (!payload.isTyping && pct >= 100) {
        typingStatusText.innerText = 'Completed ✨';
        setTimeout(() => {
          if (typingProgressSection) typingProgressSection.style.display = 'none';
          if (gdocsTypingBadge) gdocsTypingBadge.style.display = 'none';
        }, 4000);
      } else if (payload.isPaused) {
        typingStatusText.innerText = 'Paused';
      } else if (!payload.isTyping) {
        typingStatusText.innerText = 'Stopped';
      } else {
        typingStatusText.innerText = `Typing at ${payload.wpm || 65} WPM…`;
      }
    }
  }
});

refreshGDocsTabs();
refreshAssignments();
init();


