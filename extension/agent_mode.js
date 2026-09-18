// agent_mode.js — Helpotron Agent Mode (09-01, operator spec).
// Own extension tab (agent_mode.html). Jobs:
//   1. Screen selection: MV3 tabCapture.getMediaStreamId -> the selected tab's
//      live stream, or desktopCapture.chooseDesktopMedia for screen/window
//      preview (Firefox / no tabCapture fallback — preview only).
//   2. Frame grab: canvas -> JPEG q0.7, longest side <= 1280.
//   3. Agent chat: POST /api/extension/agent_chat {text, images, agent_mode,
//      viewport} — the server prepends the vision analysis per frame and asks
//      the agent for a fenced ```control block. GET /api/extension/agent_chat/
//      history mirrors the popup's chat (same chrome.storage 'helpotron_chat').
//   4. Control: ONLY with explicit user consent (toggle default OFF + consent
//      modal + always-visible Stop + banner). Executes server-validated
//      control_actions through chrome.debugger (CDP Input domain) with the
//      server-side humanlike path (server_logic.js) — never teleporting.
//   5. Safety: user move/click/key interrupts via the content script's
//      {'agent:user-interrupt'} message -> pause, NO auto-resume (Resume
//      button), Stop/Esc/close -> debugger detach + drive-window disarm.
//   6. 09-02 CHAT options: the popup's "See screen" / "Execute" switches and
//      the MANUAL / AUTOMATIC / YOLO permission mode are obeyed live (See
//      screen ON auto-captures the active tab; Execute OFF means the agent only
//      talks). Every action is classified on the live page via CDP (never
//      keystroke reading): credential/OTP/card fields and downloads are HARD
//      blocked in every mode; risky actions (destructive/submit/leave-page/
//      credential-adjacent) ask in AUTOMATIC; MANUAL asks per action; YOLO
//      never asks. Approvals broker through the background (popup card if open,
//      else system notification) and auto-deny after ~60s. Action bursts are
//      capped at 15 (MAX_ACTIONS) and gated by the extension's host permissions.
// No placeholders — every branch above is implemented and guarded; the page
// renders standalone (no chrome.* injection) so failures are visible, not
// silent.


// ── Environment guards (page stays usable when not running as an extension) ──
const hasChrome = typeof chrome !== 'undefined' && !!chrome.runtime;
const hasTabCapture = hasChrome && !!(chrome.tabCapture && chrome.tabCapture.getMediaStreamId);
const hasDesktopCapture = hasChrome && !!(chrome.desktopCapture && chrome.desktopCapture.chooseDesktopMedia);

// ── Constants ────────────────────────────────────────────────────────────────
const CHAT_KEY = 'helpotron_chat';          // shared with popup.js (mirror)
const LOG_KEY = 'agent_mode_log';           // storage.local ring, last 200
const MAX_LOG_ENTRIES = 200;
const MAX_FRAME_DIM = 1280;                 // longest side cap (spec)
const JPEG_QUALITY = 0.7;                   // frame quality (spec)
// 09-02 (spec): cap consecutive actions at 15 per task, matching the server
// cap (screen_vision._MAX_CONTROL_ACTIONS — the server rejects >15 too).
const MAX_ACTIONS = 15;
const MAX_DRIVE_MS = 60_000;                // hard wall for one actions burst
const INTERRUPT_BUSY_MS = 500;              // content-script throttle
const DEFAULT_SERVER = 'https://helpotron.dpdns.org';

// 09-02 CHAT option state (written by the popup; read here + on change):
//   helpotron_chat_seescreen — attach the screen to chat messages (bool)
//   helpotron_chat_execute   — run returned control_actions at all (bool)
//   helpotron_agent_mode     — manual / auto / yolo approval policy (string)
const SEE_SCREEN_KEY = 'helpotron_chat_seescreen';
const EXECUTE_KEY = 'helpotron_chat_execute';
const MODE_KEY = 'helpotron_agent_mode';
const SEE_SCREEN_DEFAULT = true;
const EXECUTE_DEFAULT = false;
const MODE_DEFAULT = 'manual';
const MODES = ['manual', 'auto', 'yolo'];

// key op -> CDP key table (native VK + key/code for dispatchKeyEvent).
const KEY_TABLE = {
  Enter:     { key: 'Enter', code: 'Enter', vk: 13 },
  Escape:    { key: 'Escape', code: 'Escape', vk: 27 },
  Tab:       { key: 'Tab', code: 'Tab', vk: 9 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight:{ key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  ArrowUp:   { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  Home:      { key: 'Home', code: 'Home', vk: 36 },
  End:       { key: 'End', code: 'End', vk: 35 },
  Delete:    { key: 'Delete', code: 'Delete', vk: 46 },
  PageUp:    { key: 'PageUp', code: 'PageUp', vk: 33 },
  PageDown:  { key: 'PageDown', code: 'PageDown', vk: 34 },
};
// CDP modifiers bitmask: alt=1 ctrl=2 meta=4 shift=8 (spec).
const MOD_BITS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const DEBUGGER_VERSION = '1.3';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  myTabId: null,
  driveTabId: null,          // tab we captured — the ONLY place we may drive
  driveTabTitle: '',
  videoStream: null,
  videoW: 0,
  videoH: 0,
  cssViewport: null,         // {w,h} via Runtime.evaluate once debugger attached
  frame: null,               // {b64, w, h} newest JPEG snapshot (vision space)
  cursor: null,              // last CSS-space cursor position (no teleports)
  lastSide: null,            // alternating perpendicular bow side (humanlike)
  controlOn: false,          // toggle default OFF — explicit consent required
  paused: false,             // user/interrupt pause — NO auto-resume
  pendingStop: false,
  driving: false,            // an actions burst is executing
  debuggerAttached: false,
  logs: [],
  // 09-02 CHAT options (from the popup; storage fallbacks apply).
  seescreen: SEE_SCREEN_DEFAULT,
  execute: EXECUTE_DEFAULT,
  agentMode: MODE_DEFAULT,
  awaitingApproval: false,   // a REQ_APPROVAL is pending right now
  pendingActions: null,      // actions dropped on attach failure — one-click retry
};

const els = {
  captureChip: $('captureChip'),   frameMeta: $('frameMeta'),
  selectTabBtn: $('selectTabBtn'), pickScreenBtn: $('pickScreenBtn'),
  lookBtn: $('lookBtn'),           grabFrameBtn: $('grabFrameBtn'),
  clearFrameBtn: $('clearFrameBtn'),
  video: $('liveVideo'),           visionOutput: $('visionOutput'),
  chatMessages: $('chatMessages'), chatInput: $('chatInput'),
  chatSend: $('chatSend'),         chatRefresh: $('chatRefresh'),
  chatNotes: $('loginNote'),
  controlToggle: $('controlToggle'), controlSwitchWrap: $('controlSwitchWrap'),
  stopBtn: $('stopBtn'),           resumeBtn: $('resumeBtn'),
  controlBanner: $('controlBanner'), bannerText: $('bannerText'),
  consentOverlay: $('consentOverlay'), consentAck: $('consentAck'),
  consentEnable: $('consentEnable'), consentCancel: $('consentCancel'),
  tabPickerOverlay: $('tabPickerOverlay'), tabPickerList: $('tabPickerList'),
  tabPickerClose: $('tabPickerClose'),
  actionLogList: $('actionLogList'), clearLogBtn: $('clearLogBtn'),
  statusLine: $('statusLine'),
};

// ── Status / banner / log helpers ───────────────────────────────────────────
function setStatus(text) { els.statusLine.textContent = text || ''; }

function pushLog(kind, text) {
  const entry = { kind, text, ts: Date.now() };
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_ENTRIES) state.logs = state.logs.slice(-MAX_LOG_ENTRIES);
  renderLogs();
  try { chrome.storage.local.set({ [LOG_KEY]: state.logs.slice(-MAX_LOG_ENTRIES) }); } catch (e) { /* standalone */ }
}

function renderLogs() {
  const list = els.actionLogList;
  list.innerHTML = '';
  if (state.logs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'log-empty';
    empty.textContent = 'No actions yet — the agent writes its steps here.';
    list.appendChild(empty);
    return;
  }
  for (const entry of state.logs) {
    const div = document.createElement('div');
    const time = new Date(entry.ts).toLocaleTimeString([], { hour12: false });
    const cls = entry.kind === 'op' ? 'log-op'
              : entry.kind === 'warn' ? 'log-warn'
              : entry.kind === 'err' ? 'log-err' : '';
    if (cls) div.className = cls;
    div.textContent = `[${time}] ${entry.text}`;
    list.appendChild(div);
  }
  list.scrollTop = list.scrollHeight;
}

function updateBanner() {
  const show = state.controlOn;
  els.controlBanner.classList.toggle('hidden', !show);
  if (!show) return;
  if (state.paused) {
    els.controlBanner.classList.add('warn');
    els.bannerText.textContent = state.pendingActions && state.pendingActions.length
      ? `⏸ Could not attach the debugger to the tab — press "Resume driving" to retry the ${state.pendingActions.length} agent action(s). Nothing runs until you retry.`
      : 'Paused by you — the agent will NOT drive again until you press "Resume driving". Nothing is retried automatically.';
    els.resumeBtn.classList.remove('hidden');
  } else {
    els.controlBanner.classList.remove('warn');
    els.bannerText.textContent = state.pendingActions && state.pendingActions.length
      ? `Debugger attach failed — press "Resume driving" to retry the ${state.pendingActions.length} agent action(s).`
      : 'Control is ON — the agent can move the mouse, click and type inside the selected tab. Stop button / Esc always work; moving the mouse pauses it (no auto-resume).';
    els.resumeBtn.classList.add('hidden');
  }
}

function setChip(text) {
  els.captureChip.textContent = '';
  const dot = document.createElement('span');
  dot.className = 'dot';
  els.captureChip.appendChild(dot);
  els.captureChip.appendChild(document.createTextNode(text));
}

// ── Auth (same storage credentials as popup.js) ──────────────────────────────
async function authHeaders() {
  const { session_token, token } = await chrome.storage.local.get(['session_token', 'token']);
  const auth = session_token || token || '';
  return auth ? { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }
              : { 'Content-Type': 'application/json' };
}
async function isLoggedIn() {
  const { public_id, session_token, token } = await chrome.storage.local.get(['public_id', 'session_token', 'token']);
  return !!(public_id && (session_token || token));
}
async function serverUrl() {
  const { server } = await chrome.storage.local.get('server');
  const srv = typeof server === 'string' && server.trim() ? server.trim() : DEFAULT_SERVER;
  return srv.replace(/\/+$/, '');
}

// ── 09-02 CHAT option state (popup is the writer; this page obeys it live) ────
function applyAgentState(st) {
  state.seescreen = st[SEE_SCREEN_KEY] === undefined ? SEE_SCREEN_DEFAULT : !!st[SEE_SCREEN_KEY];
  state.execute = st[EXECUTE_KEY] === undefined ? EXECUTE_DEFAULT : !!st[EXECUTE_KEY];
  state.agentMode = MODES.includes(st[MODE_KEY]) ? st[MODE_KEY] : MODE_DEFAULT;
  updateModeChip();
}

function updateModeChip() {
  const modeChip = document.getElementById('modeChip');
  if (modeChip) modeChip.textContent = `mode — ${state.agentMode}`;
  const set = (id, label, on, onClass) => {
    const chip = document.getElementById(id);
    if (!chip) return;
    chip.textContent = '';
    const dot = document.createElement('span');
    dot.className = 'dot';
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(`${label}: ${on ? 'ON' : 'OFF'}`));
    chip.classList.toggle(onClass, !!on);
  };
  set('seescreenChip', 'See screen', state.seescreen, 'chip--blue');
  set('executeChip', 'Study Mode', state.execute, 'chip--amber');
}

async function loadAgentState() {
  const st = await chrome.storage.local.get([SEE_SCREEN_KEY, EXECUTE_KEY, MODE_KEY]);
  applyAgentState(st);
}

// storage.onChanged: the popup can change toggles/mode while this page is open;
// obey immediately (execute gating, seescreen attach, approval policy).
if (hasChrome) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SEE_SCREEN_KEY] || changes[EXECUTE_KEY] || changes[MODE_KEY]) {
      loadAgentState();
      const ch = changes[SEE_SCREEN_KEY];
      if (ch && ch.newValue && !state.videoStream) maybeAutoCapture(); // see screen ON -> capture now
    }
  });
}

// See screen ON: auto-capture the active tab of the current window so the
// screen really is attached to the next message (the user can still switch).
async function maybeAutoCapture() {
  if (!hasTabCapture || state.videoStream) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return;
    pushLog('info', `“See screen” is ON — auto-capturing active tab: ${tab.title || tab.url.slice(0, 50)}`);
    await startTabStream(tab.id, tab.title || tab.url);
  } catch (e) {
    pushLog('warn', `auto-capture of the active tab failed: ${(e && e.message) || e}`);
    setStatus(`⚠️ Could not auto-capture the active tab (${(e && e.message) || e}) — use “Select tab”.`);
  }
}

// ── Chat rendering (mirror of popup.js markup contract) ──────────────────────
// Copy-to-clipboard control attached to every chat bubble (operator 09-10).
function makeCopyButton(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-copy';
  btn.textContent = 'Copy';
  btn.title = 'Copy this message';
  btn.addEventListener('click', async () => {
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        done = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e2) { done = false; }
    }
    btn.textContent = done ? 'Copied' : 'Failed';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
  });
  return btn;
}

// Server-rendered HTML injection (thin-wrapper, 2026-09-14). Same contract as
// popup.js: the server renders markdown+LaTeX to HTML; the client injects it
// (sanitized) instead of shipping a KaTeX bundle or a math renderer.
function sanitizeHtml(html) {
  if (!html) return '';
  const ALLOWED_TAGS = new Set([
    'P', 'BR', 'B', 'I', 'EM', 'STRONG', 'CODE', 'PRE', 'SPAN', 'DIV',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'UL', 'OL', 'LI', 'A',
    'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'SUB', 'SUP',
    'MATH', 'MROW', 'MI', 'MN', 'MO', 'MSUP', 'MSUB', 'MFRAC', 'MUNDER',
    'MOVER', 'MUNDEROVER', 'MTEXT', 'MTABLE', 'MTR', 'MTD', 'MSQRT', 'MROOT',
    'MENCLOSE', 'MSPACE'
  ]);
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, link, meta, style, base, form, noscript, mglyph, annotation-xml, svg, foreignObject').forEach(n => n.remove());

  const all = doc.body.querySelectorAll('*');
  all.forEach(el => {
    const tag = el.tagName.toUpperCase();
    if (!ALLOWED_TAGS.has(tag)) {
      el.remove();
      return;
    }
    for (const attr of Array.from(el.attributes || [])) {
      const name = attr.name.toLowerCase();
      const val = String(attr.value || '').trim().toLowerCase();
      if (name.startsWith('on') || val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === 'href') {
        if (!val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('mailto:') && !val.startsWith('#')) {
          el.removeAttribute(attr.name);
        }
      } else if (name !== 'class' && name !== 'display' && name !== 'target' && name !== 'rel' && name !== 'title') {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

function formatMessage(rawText, html) {
  const span = document.createElement('span');
  span.className = 'chat-msg-body';
  const clean = sanitizeHtml(html);
  if (clean) {
    span.innerHTML = clean;
  } else {
    span.textContent = rawText || '';
  }
  return span;
}

function addChatMsgEl(sender, text, html) {
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (sender === 'user' ? 'user' : sender === 'agent' ? 'agent' : 'chat-note');
  if (sender === 'user' || sender === 'agent') {
    const sp = document.createElement('span');
    sp.className = 'chat-sender';
    sp.textContent = sender === 'user' ? 'You' : 'Study Buddy';
    div.appendChild(sp);
  }
  const body = formatMessage(text, html);
  div.appendChild(body);
  div.appendChild(makeCopyButton(text));
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return div;
}

function chatReplyText(data, fallback) {
  const raw = data && (data.reply || data.message);
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw.text === 'string') return raw.text;
  if (data && data.status === 'insufficient_tokens') return '⚠️ Insufficient tokens — the operator hasn’t granted you tokens yet.';
  return fallback || '✅ Done.';
}

function renderChat(msgs) {
  els.chatMessages.innerHTML = '';
  if (!msgs || msgs.length === 0) {
    addChatMsgEl('note', '👋 Agent Mode: the agent can see this screen (frames are attached to your messages) and — when Control is ON — drive the selected tab like a human.');
    addChatMsgEl('note', '💡 Try: “What is on this screen?” then “click the blue button”.');
    return;
  }
  msgs.forEach((m) => addChatMsgEl(m.sender === 'user' ? 'user' : 'agent', m.text, m.html || ''));
}

async function cacheChat(msgs) {
  const list = (msgs || []).slice(-80).map((m) => ({
    sender: m.sender === 'user' ? 'user' : 'agent',
    text: m.text,
    ts: m.timestamp || new Date().toISOString(),
  }));
  try { await chrome.storage.local.set({ [CHAT_KEY]: list }); } catch (e) { /* standalone */ }
}

async function loadChatHistory() {
  const cached = (await chrome.storage.local.get(CHAT_KEY))[CHAT_KEY];
  if (cached && cached.length) renderChat(cached);
  const srv = await serverUrl();
  try {
    const headers = await authHeaders();
    if (!headers.Authorization) { refreshLoginNote(); return; } // login required
    const res = await fetch(`${srv}/api/extension/agent_chat/history`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const msgs = ((data && data.chat) || []).map((m) => ({ sender: m.sender, text: m.text }));
    if (msgs.length) { renderChat(msgs); cacheChat(msgs); }
    else if (cached && cached.length) renderChat(cached);
  } catch (e) {
    if (!cached || !cached.length) {
      addChatMsgEl('note', '⚠️ Could not reach server history — is the server up? Agent Mode still works after you send the first message.');
    }
  }
}

function refreshLoginNote() {
  const note = els.chatNotes;
  isLoggedIn().then((ok) => {
    note.classList.toggle('hidden', ok);
    els.chatSend.disabled = !ok;
    els.chatInput.placeholder = 'Tell the agent what to do on this screen…';
  });
}

// ── Screen capture ──────────────────────────────────────────────────────────
function stopVideo() {
  // Detach BEFORE driveTabId is cleared: detachDebugger reads it to target
  // the tab, and nulling it first would silently leak a live debugger (with
  // its attach infobar) onto the captured tab.
  if (state.debuggerAttached && state.driveTabId) detachDebugger().catch(() => {});
  if (state.videoStream) {
    try { state.videoStream.getTracks().forEach((tr) => tr.stop()); } catch (e) { /* ok */ }
    state.videoStream = null;
  }
  try { els.video.srcObject = null; } catch (e) { /* ok */ }
  state.videoW = 0; state.videoH = 0;
  state.frame = null;
  state.driveTabId = null;
  state.driveTabTitle = '';
  state.cssViewport = null;
  state.pendingActions = null;
  els.frameMeta.textContent = 'no frame yet';
  els.video.classList.remove('mirror');
  els.visionOutput.classList.add('hidden');
  maybeDisableToggle();
}

function onVideoMetadata() {
  state.videoW = els.video.videoWidth || 0;
  state.videoH = els.video.videoHeight || 0;
  if (!state.videoW || !state.videoH) {
    pushLog('warn', 'video stream loaded without dimensions');
    return;
  }
  els.frameMeta.textContent = `${state.videoW}×${state.videoH} live`;
  setStatus(`📺 Capturing${state.driveTabTitle ? `: ${state.driveTabTitle}` : ''} (${state.videoW}×${state.videoH})`);
  pushLog('info', `capture started (${state.videoW}×${state.videoH})`);
  maybeEnableToggle();
}

async function startTabStream(tabId, tabTitle) {
  stopVideo();
  try {
    const { id: consumerTabId } = await chrome.tabs.getCurrent();
    state.myTabId = consumerTabId;
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
      consumerTabId,
    });
    if (!streamId) throw new Error('tab capture returned no stream id');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });
    state.videoStream = stream;
    state.driveTabId = tabId;
    state.driveTabTitle = tabTitle || `tab #${tabId}`;
    els.video.srcObject = stream;
    els.video.addEventListener('loadedmetadata', onVideoMetadata, { once: true });
    setChip(`Tab: ${state.driveTabTitle}`);
    pushLog('info', `selected tab to drive: ${state.driveTabTitle}`);
  } catch (e) {
    pushLog('err', `tab capture failed: ${e && e.message ? e.message : e}`);
    setStatus(`❌ Tab capture failed — ${e && e.message ? e.message : e}`);
    stopVideo();
  }
}

function pickScreen() {
  if (!hasDesktopCapture) {
    pushLog('warn', 'desktopCapture unavailable — pick-screen is disabled here');
    setStatus('❌ Screen picker unavailable in this browser.');
    return;
  }
  stopVideo();
  // Callback form: streamId arrives when the user picks; '' on cancel.
  // NOTE: first arg is the classic source ARRAY (['screen','window']) — the
  // documented Chromium signature since forever and the only form Firefox
  // accepts; a `{targetTypes:[...]}` options object is not part of either
  // browser's chooseDesktopMedia schema.
  chrome.desktopCapture.chooseDesktopMedia(['screen', 'window'], (streamId) => {
    if (!streamId) {
      pushLog('info', 'screen picker cancelled');
      setStatus('Screen picker cancelled.');
      return;
    }
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: streamId },
      },
    }).then((stream) => {
      state.videoStream = stream;
      state.driveTabId = null; // screens are preview-only: no tab to drive
      state.driveTabTitle = '';
      els.video.srcObject = stream;
      els.video.addEventListener('loadedmetadata', onVideoMetadata, { once: true });
      setChip('Screen preview (no control)');
      pushLog('info', 'screen/window preview capture started — control needs a captured TAB, so the agent can only watch this feed');
      maybeDisableToggle();
    }).catch((e) => {
      pushLog('err', `screen capture failed: ${e && e.message ? e.message : e}`);
      setStatus(`❌ Screen capture failed — ${e && e.message ? e.message : e}`);
    });
  });
}

// Tab picker modal
async function showTabPicker() {
  if (!hasChrome) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (e) {
    pushLog('err', `tabs.query failed: ${e && e.message ? e.message : e}`);
    return;
  }
  const { id: myId } = await chrome.tabs.getCurrent();
  const pick = tabs.filter((t) => t.id !== myId && typeof t.url === 'string' && /^https?:/i.test(t.url));
  const list = els.tabPickerList;
  list.innerHTML = '';
  if (!pick.length) {
    div(list, 'tab-pick-row', 'No browser tabs available to capture — open a page in another tab first.');
    els.tabPickerOverlay.classList.remove('hidden');
    return;
  }
  for (const t of pick.slice(0, 25)) {
    const row = document.createElement('div');
    row.className = 'tab-pick-row';
    row.setAttribute('role', 'option');
    const name = document.createElement('span');
    name.textContent = t.title && t.title.trim() ? t.title.trim().slice(0, 70) : '(untitled)';
    row.appendChild(name);
    const host = document.createElement('span');
    host.className = 'host';
    try { host.textContent = new URL(t.url).hostname; } catch (e) { host.textContent = ''; }
    if (host.textContent) row.appendChild(host);
    row.addEventListener('click', () => {
      els.tabPickerOverlay.classList.add('hidden');
      startTabStream(t.id, name.textContent);
    });
    list.appendChild(row);
  }
  els.tabPickerOverlay.classList.remove('hidden');
}

// ── Frame grab (canvas -> JPEG q0.7, longest side <= 1280) ───────────────────
function grabFrame() {
  const video = els.video;
  if (!state.videoStream || !state.videoW || !state.videoH) {
    pushLog('warn', 'no live capture — select a tab or screen first');
    setStatus('⚠️ No live capture; grab needs a running preview.');
    return null;
  }
  try {
    // Target dims. When the CSS viewport is known, render the frame AT that
    // size so one frame pixel == one CSS pixel: then the frame the model reads,
    // the DOM element list (getBoundingClientRect = CSS), and the CDP mouse
    // dispatch all share ONE coordinate space, and no scale factor can drift a
    // click. Without it, fall back to the raw video (device) dims and let
    // scaleF() rescale at dispatch — the degraded path.
    const cssVp = state.cssViewport;
    let w, h;
    if (cssVp && cssVp.w > 0 && cssVp.h > 0) {
      w = Math.max(1, Math.round(cssVp.w));
      h = Math.max(1, Math.round(cssVp.h));
    } else {
      const scale = Math.min(1, MAX_FRAME_DIM / Math.max(video.videoWidth || state.videoW, video.videoHeight || state.videoH));
      w = Math.max(1, Math.round((video.videoWidth || state.videoW) * scale));
      h = Math.max(1, Math.round((video.videoHeight || state.videoH) * scale));
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    const b64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    state.frame = { b64, w, h };
    return state.frame;
  } catch (e) {
    pushLog('err', `frame grab failed: ${e && e.message ? e.message : e}`);
    return null;
  }
}

// Vision axis: frame pixel dims are what the agent/model saw; the server
// clamps the model's coordinates into {width, height} BEFORE they come back,
// so viewport must be the FRAME dims (not CSS). The extension rescales
// frame -> CSS at dispatch time (see scaleXFor).
function viewportForServer() {
  const f = state.frame || { w: state.videoW, h: state.videoH };
  return { width: f.w, height: f.h };
}

async function lookNow() {
  await ensureCssViewport();  // frame in CSS space before grab
  if (!state.videoStream || !state.frame && !grabFrame()) {
    setStatus('⚠️ Grab a frame first — select a tab or screen and press “Look now”.');
    pushLog('warn', 'Look now skipped: nothing captured');
    return;
  }
  const f = state.frame;
  els.visionOutput.classList.remove('hidden');
  els.visionOutput.textContent = '…analyzing frame…';
  setStatus('👁 Vision: analyzing frame…');
  pushLog('info', `vision request: ${f.w}×${f.h} frame`);
  const srv = await serverUrl();
  try {
    const headers = await authHeaders();
    if (!headers.Authorization) throw new Error('login required (popup)');
    const res = await fetch(`${srv}/api/extension/vision`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_b64: f.b64,
        width: f.w,
        height: f.h,
        prompt: '',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    const analysis = data.analysis || 'no analysis returned';
    els.visionOutput.textContent = `→ ${analysis}`;
    setStatus(`👁 Vision: ${data.status === 'success' ? 'ok' : data.status}`);
    pushLog('info', `vision answered: ${analysis.slice(0, 110)}${analysis.length > 110 ? '…' : ''}`);
  } catch (e) {
    els.visionOutput.textContent = `⚠️ ${e.message}`;
    setStatus(`👁 ❌ vision failed — ${e.message}`);
    pushLog('warn', `vision failed: ${e.message}`);
  }
}

// ── Consent modal (spec: explicit, on every enable) ──────────────────────────
function openConsent() {
  els.consentAck.checked = false;
  els.consentEnable.disabled = true;
  els.consentOverlay.classList.remove('hidden');
  els.consentAck.focus();
}
function closeConsent() {
  els.consentOverlay.classList.add('hidden');
}

function enableControl() {
  state.controlOn = true;
  state.paused = false;
  state.pendingStop = false;
  els.controlSwitchWrap.classList.add('on');
  updateBanner();
  pushLog('info', 'CONTROL ENABLED (consent given) — real mouse/keyboard drive armed inside the selected tab');
  setStatus('🎛 Control ON — visible Stop point: header button, Esc, or your own mouse move.');
  if (!state.driveTabId) pushLog('warn', 'note: no tab captured yet — control only applies once you Select a tab');
}

function disableControl(reason) {
  state.controlOn = false;
  state.paused = false;
  state.pendingActions = null;
  els.controlSwitchWrap.classList.remove('on');
  if (state.driving) state.pendingStop = true; // running burst aborts at next checkpoint
  updateBanner();
  pushLog('info', reason || 'CONTROL OFF');
}

function maybeEnableToggle() {
  // The toggle is always usable; without a captured tab runActions() refuses
  // (belt-and-suspenders on the SERVER-hardened action list). Allowing it here
  // lets the user pre-consent before picking the tab they want driven.
  els.controlToggle.disabled = false;
}
function maybeDisableToggle() {
  if (!state.driveTabId && els.controlToggle.checked) {
    // capture was cleared while ON: safest is OFF (fresh consent needed anyway)
    els.controlToggle.checked = false;
    disableControl('control reset — capture cleared (toggle returns to OFF by default)');
  }
}

// ── Debugger / CDP control (the ONLY channel that moves the real cursor) ─────
async function ensureDebugger() {
  if (state.debuggerAttached || !state.driveTabId) return true;
  // 09-06: `debugger` is a REQUIRED manifest permission now, so it is always
  // present and there is no prompt to approve. The old optional-permission
  // probe could only ever return true — and returned FALSE on any throw,
  // silently disabling driving — so the attach below is the real gate.
  const tab = { tabId: state.driveTabId };
  try {
    // 09-08: a leaked session from a prior capture (popup closed mid-drive) makes
    // attach fail with "Another debugger is already attached". Detach first,
    // best-effort — if DevTools genuinely holds it, detach rejects and we catch,
    // because that is a real blocker the user has to close by hand anyway.
    await chrome.debugger.detach(tab).catch(() => {});
    await chrome.debugger.attach(tab, DEBUGGER_VERSION);
    state.debuggerAttached = true;
    pushLog('info', `debugger attached (protocol ${DEBUGGER_VERSION}) — driver armed`);
    return true;
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    pushLog('err', `debugger attach failed: ${msg}`);
    setStatus(`❌ Cannot drive: the tab is under another debugger (DevTools open?) — ${msg}`);
    return false;
  }
}

async function detachDebugger() {
  if (!state.debuggerAttached || !state.driveTabId) { state.debuggerAttached = false; return; }
  const tabId = state.driveTabId; // pin before any await: stopVideo() may clear driveTabId
  await removeVirtualCursor(tabId).catch(() => {});
  try { await chrome.debugger.detach({ tabId }); } catch (e) { /* already gone */ }
  state.debuggerAttached = false;
  pushLog('info', 'debugger detached — driving stopped');
}

const VIRTUAL_CURSOR_ID = '__helpotron_agent_cursor__';

async function initVirtualCursor(tabId) {
  if (!chrome.debugger || !tabId) return;
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `(() => {
        let cur = document.getElementById('${VIRTUAL_CURSOR_ID}');
        if (!cur) {
          cur = document.createElement('div');
          cur.id = '${VIRTUAL_CURSOR_ID}';
          cur.innerHTML = \`
            <div style="position: relative; pointer-events: none;">
              <svg width="28" height="28" viewBox="0 0 24 24" style="filter: drop-shadow(0 3px 10px rgba(0,0,0,0.6)); transform: rotate(-22deg);">
                <path d="M4 2v18l5-4.5 3 6.5 3-1.5-3-6.5h6.5L4 2z" fill="#14b8a6" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
              <div id="__helpotron_cursor_badge__" style="position: absolute; left: 22px; top: 12px; display: inline-flex; align-items: center; gap: 4px; background: #090d16; color: #5eead4; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; border: 1px solid #14b8a6; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-family: system-ui, -apple-system, sans-serif; white-space: nowrap; pointer-events: none;">
                <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
                <span id="__helpotron_cursor_text__">AI Agent</span>
              </div>
              <div id="__helpotron_cursor_ripple__" style="position: absolute; top: -6px; left: -6px; width: 36px; height: 36px; border-radius: 50%; border: 2.5px solid #5eead4; opacity: 0; transform: scale(0.3); pointer-events: none;"></div>
            </div>
          \`;
          cur.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none; will-change: transform; transition: opacity 0.2s ease; opacity: 1; transform: translate(400px, 300px);';
          document.documentElement.appendChild(cur);
        }
        // Generation token: a delayed removal from a PRIOR cleanup must never
        // delete the cursor a new burst is driving (fast retry races).
        window.__helpotron_cursor_gen__ = (window.__helpotron_cursor_gen__ || 0) + 1;
        cur.__hgen = window.__helpotron_cursor_gen__;
        cur.style.display = 'block';
        cur.style.opacity = '1';
        window.__helpotron_pause__ = false;
        if (!window.__helpotron_esc_listener__) {
          window.__helpotron_esc_listener__ = true;
          window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              window.__helpotron_pause__ = true;
            }
          }, { capture: true });
        }
      })()`
    });
  } catch (e) {}
}

async function moveVirtualCursor(tabId, x, y) {
  if (!chrome.debugger || !tabId) return;
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `(() => {
        const cur = document.getElementById('${VIRTUAL_CURSOR_ID}');
        if (cur) {
          cur.style.transform = 'translate(' + ${Math.round(x)} + 'px, ' + ${Math.round(y)} + 'px)';
        }
      })()`
    });
  } catch (e) {}
}

async function animateVirtualCursorClick(tabId) {
  if (!chrome.debugger || !tabId) return;
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `(() => {
        const rip = document.getElementById('__helpotron_cursor_ripple__');
        if (rip) {
          rip.style.transition = 'none';
          rip.style.opacity = '1';
          rip.style.transform = 'scale(0.3)';
          void rip.offsetWidth;
          rip.style.transition = 'transform 0.35s cubic-bezier(0,0,0.2,1), opacity 0.35s ease-out';
          rip.style.transform = 'scale(2.2)';
          rip.style.opacity = '0';
        }
      })()`
    });
  } catch (e) {}
}

async function setVirtualCursorAction(tabId, actionText) {
  if (!chrome.debugger || !tabId) return;
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `(() => {
        const txt = document.getElementById('__helpotron_cursor_text__');
        if (txt) txt.textContent = ${JSON.stringify(actionText)};
      })()`
    });
  } catch (e) {}
}

async function removeVirtualCursor(tabId) {
  if (!chrome.debugger || !tabId) return;
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `(() => {
        const cur = document.getElementById('${VIRTUAL_CURSOR_ID}');
        if (cur) {
          const myGen = cur.__hgen;
          cur.style.opacity = '0';
          setTimeout(() => {
            // Only remove if no NEW burst re-initialized the cursor meanwhile.
            if (cur.__hgen === myGen && cur.parentNode) cur.parentNode.removeChild(cur);
          }, 220);
        }
      })()`
    });
  } catch (e) {}
}

async function cdp(method, params) {
  await chrome.debugger.sendCommand({ tabId: state.driveTabId }, method, params || {});
}

async function getCssViewport() {
  try {
    const r = await chrome.debugger.sendCommand(
      { tabId: state.driveTabId }, 'Runtime.evaluate',
      { expression: 'JSON.stringify({w: window.innerWidth, h: window.innerHeight})', returnByValue: true },
    );
    const val = r && r.result && r.result.value;
    const obj = typeof val === 'string' ? JSON.parse(val) : r && r.result && r.result.result && r.result.result.value;
    if (obj && obj.w > 0 && obj.h > 0) {
      state.cssViewport = { w: Number(obj.w), h: Number(obj.h) };
      return state.cssViewport;
    }
  } catch (e) { /* fall through to video-based scale */ }
  return null;
}

// Populate state.cssViewport without needing the debugger attached. Uses
// chrome.scripting (the element registry's getTabViewport), which works on any
// scriptable tab — so the frame can be normalized to CSS space BEFORE a run
// attaches anything. Returns the viewport or null.
async function ensureCssViewport() {
  if (state.cssViewport && state.cssViewport.w > 0) return state.cssViewport;
  if (!state.driveTabId) {
    try { await getCssViewport(); } catch (e) { /* no debugger yet */ }
    return state.cssViewport || null;
  }
  try {
    const v = (window.HelpotronElements && typeof window.HelpotronElements.getTabViewport === 'function')
      ? await window.HelpotronElements.getTabViewport(state.driveTabId).catch(() => null)
      : null;
    if (v && v.width > 0 && v.height > 0) {
      state.cssViewport = { w: v.width, h: v.height };
      return state.cssViewport;
    }
  } catch (e) { /* fall through */ }
  return null;
}

// frame/model px -> CSS px for dispatch. Best source: Runtime.evaluate
// innerWidth/innerHeight (true CSS viewport). Fallback: the capture video
// dimensions (DPR-1 assumption) — still never teleports, and the server has
// already clamped every coordinate into frame space.
async function scaleF() {
  const f = state.frame || { w: state.videoW, h: state.videoH };
  const fw = Math.max(1, f.w || 1);
  const fh = Math.max(1, f.h || fw);
  let cssW = state.videoW;
  let cssH = state.videoH;
  if (state.cssViewport && state.cssViewport.w > 0 && state.cssViewport.h > 0) {
    cssW = state.cssViewport.w;
    cssH = state.cssViewport.h;
  } else {
    const cv = await getCssViewport();
    if (cv) { cssW = cv.w; cssH = cv.h; }
  }
  return { sx: cssW / fw, sy: cssH / fh };
}

async function driveMessage(mode, active) {
  if (!state.driveTabId) return;
  try {
    await chrome.tabs.sendMessage(state.driveTabId, { type: 'agent-drive', mode, active });
  } catch (e) { /* no content script on this page (non-matched host) — interrupts untracked there */ }
}

async function mouseEvent(type, x, y, opts = {}) {
  const params = {
    type,
    x: Math.round(x),
    y: Math.round(y),
    button: opts.button || 'none',
    buttons: opts.buttons || 0,
  };
  if (opts.clickCount) params.clickCount = opts.clickCount;
  if (opts.deltaX !== undefined) params.deltaX = opts.deltaX;
  if (opts.deltaY !== undefined) params.deltaY = opts.deltaY;
  if (opts.modifiers) params.modifiers = opts.modifiers;
  await cdp('Input.dispatchMouseEvent', params);
}

async function moveCursorAlong(points, buttons = 0) {
  // points: humanMovePoints samples {x,y,t}. Buttons>0 means dragging.
  for (let i = 1; i < points.length; i++) {
    if (state.pendingStop) return false;
    const dt = points[i].t - points[i - 1].t;
    if (dt > 0) await sleep(Math.min(dt, 60));
    await mouseEvent('mouseMoved', points[i].x, points[i].y, { buttons });
    state.cursor = { x: points[i].x, y: points[i].y };
    if (state.driveTabId) await moveVirtualCursor(state.driveTabId, points[i].x, points[i].y);
  }
  return true;
}

// The curve is generated server-side so every client moves the same way and a
// change to the motion profile does not need an extension release. The server
// returns the same {x, y, t} samples the local implementation did.
// server_logic.js is a classic script loaded by agent_mode.html, so it is read
// off the global scope rather than imported.
async function pathBetween(fromX, fromY, toX, toY, side) {
  if (!globalThis.HelpotronSL) return [{ x: fromX, y: fromY, t: 0 }, { x: toX, y: toY, t: 1 }];
  return await globalThis.HelpotronSL.humanMovePoints(fromX, fromY, toX, toY, { side });
}

// Execute ONE server-validated control action. All coordinates arrive in
// FRAME/model pixel space (the server clamped them to the frame viewport);
// they are rescaled to CSS px here.
async function executeAction(op) {
  const { sx, sy } = await scaleF();
  const modMask = (op.modifiers || []).reduce((m, name) => m | (MOD_BITS[name] || 0), 0);

  const pt = (x, y) => ({ x: x * sx, y: y * sy });
  const to = pt(op.x ?? op.toX, op.y ?? op.toY);
  const from = op.fromX !== undefined ? pt(op.fromX, op.fromY) : to;

  // A coordinate op whose target never resolved (a ref/target that did not
  // match the live page) would carry NaN here: Math.round(undefined * scale) is
  // NaN, CDP silently drops a NaN mouse event, and the user sees the debugger
  // attach and then NOTHING happen. Refuse loudly instead — return false so the
  // burst counts it as not-completed and the caller can say so. `type` and `key`
  // need no coordinates; everything else does.
  if (op.op !== 'type' && op.op !== 'key') {
    const needsFrom = op.op === 'drag';
    const badTo = !Number.isFinite(to.x) || !Number.isFinite(to.y);
    const badFrom = needsFrom && (!Number.isFinite(from.x) || !Number.isFinite(from.y));
    if (badTo || badFrom) {
      pushLog('warn', `action "${op.op}" has no resolvable target` +
        (op.target ? ` ("${op.target}")` : op.ref !== undefined ? ` (ref ${op.ref})` : '') +
        ' — the element was not found on the page, so nothing was clicked');
      setStatus(`⚠️ Could not find "${op.target || ('ref ' + op.ref) || op.op}" on this page — that step was skipped.`);
      return false;
    }
  }

  if (state.driveTabId) {
    const actLabel = op.op ? op.op.toUpperCase() : 'ACTION';
    await setVirtualCursorAction(state.driveTabId, actLabel);
  }

  const hop = async (target, dragging) => {
    // Each hop STARTS at the current tracked cursor (never teleport: a second
    // hop inside the same action — drag — chains from where the first ended).
    // Humanlike rule: consecutive moves bow to ALTERNATING sides.
    const cur = state.cursor || { x: state.cssViewport ? state.cssViewport.w / 2 : 100, y: state.cssViewport ? state.cssViewport.h / 2 : 100 };
    if (state.lastSide === null) state.lastSide = Math.random() < 0.5 ? 1 : -1;
    const side = state.lastSide;
    state.lastSide = -side;
    const path = await pathBetween(cur.x, cur.y, target.x, target.y, side);
    const ok = await moveCursorAlong(path, dragging ? 1 : 0);
    return ok;
  };

  let ok = true;
  switch (op.op) {
    case 'move':
      ok = await hop(to, false);
      break;

    case 'click': {
      ok = await hop(to, false);
      if (!ok) break; // interrupted on the way — never click through a pause
      if (state.driveTabId) await animateVirtualCursorClick(state.driveTabId);
      const button = op.button === 'right' ? 'right' : 'left';
      const btns = button === 'right' ? 2 : 1;
      await mouseEvent('mousePressed', to.x, to.y, { button, buttons: btns, clickCount: 1 });
      await sleep(rand(40, 90));
      await mouseEvent('mouseReleased', to.x, to.y, { button, buttons: 0, clickCount: 1 });
      break;
    }

    case 'dblclick':
      ok = await hop(to, false);
      if (!ok) break;
      if (state.driveTabId) await animateVirtualCursorClick(state.driveTabId);
      await mouseEvent('mousePressed', to.x, to.y, { button: 'left', buttons: 1, clickCount: 1 });
      await sleep(rand(30, 60));
      await mouseEvent('mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1 });
      await sleep(rand(30, 70));
      await mouseEvent('mousePressed', to.x, to.y, { button: 'left', buttons: 1, clickCount: 2 });
      await sleep(rand(30, 60));
      await mouseEvent('mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 2 });
      break;

    case 'drag': {
      ok = await hop(from, false);
      if (!ok) break;
      await mouseEvent('mousePressed', from.x, from.y, { button: 'left', buttons: 1, clickCount: 1 });
      await sleep(rand(40, 80));
      // drag path = still humanlike (one new bow), button held (buttons:1)
      const dragged = await hop(to, true);
      // ALWAYS release — never leave the button down on interrupt
      try { await mouseEvent('mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1 }); }
      catch (e) { /* tab went away */ }
      if (!dragged) { ok = false; }
      break;
    }

    case 'type':
      // Focus is where the prior click left it; inserting text is a native
      // composition event — moves the cursor? No: only the caret (no teleport).
      if (op.clear !== false && state.driveTabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: state.driveTabId },
            func: () => {
              const el = document.activeElement;
              if (el && ('value' in el || el.isContentEditable)) {
                if ('value' in el) {
                  el.value = '';
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (el.isContentEditable) {
                  el.innerText = '';
                }
              }
            },
          }).catch(() => {});
        } catch {}
      }
      await cdp('Input.insertText', { text: String(op.text || '') });
      if (state.driveTabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: state.driveTabId },
            func: (txt) => {
              const el = document.activeElement;
              if (el && 'value' in el) {
                if (!el.value) el.value = txt;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            },
            args: [String(op.text || '')],
          }).catch(() => {});
        } catch {}
      }
      break;

    case 'key': {
      const k = KEY_TABLE[op.key];
      if (!k) { ok = false; break; }
      await cdp('Input.dispatchKeyEvent', {
        type: 'rawKeyDown', key: k.key, code: k.code,
        modifiers: modMask, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
        text: '', unmodifiedText: '',
      });
      if (op.key === 'Enter') {
        await cdp('Input.dispatchKeyEvent', {
          type: 'char', text: '\r',
        }).catch(() => {});
      }
      await sleep(rand(30, 70));
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyUp', key: k.key, code: k.code,
        modifiers: modMask, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
      });
      if (op.key === 'Enter' && state.driveTabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: state.driveTabId },
            func: () => {
              const el = document.activeElement;
              if (!el) return;
              const form = el.form || el.closest('form');
              if (form) {
                try { form.requestSubmit(); return; } catch {}
              }
              const parent = el.closest('form, div, header') || el.parentElement;
              if (parent) {
                const btn = parent.querySelector('button[type="submit"], button.search-btn, button[aria-label*="search" i], button[aria-label*="find" i], .search-btn, svg.search-icon');
                if (btn) (btn.closest('button') || btn).click();
              }
            },
          }).catch(() => {});
        } catch {}
      }
      break;
    }

    case 'scroll': {
      ok = await hop(to, false);
      if (!ok) break;
      await mouseEvent('mouseWheel', to.x, to.y, {
        button: 'none', buttons: 0,
        deltaX: Math.trunc(op.deltaX || 0), deltaY: Math.trunc(op.deltaY || 0),
      });
      break;
    }

    default:
      ok = false;
  }
  return ok;
}

const OP_LABEL = {
  move: (o) => `move → (${o.x},${o.y})`,
  click: (o) => `click ${o.button || 'left'} → (${o.x},${o.y})`,
  dblclick: (o) => `double-click → (${o.x},${o.y})`,
  drag: (o) => `drag (${o.fromX},${o.fromY}) → (${o.toX},${o.toY})`,
  type: (o) => `type "${(o.text || '').slice(0, 24)}${(o.text || '').length > 24 ? '…' : ''}"`,
  key: (o) => `key ${(o.modifiers || []).join('+') ? (o.modifiers || []).join('+') + '+' : ''}${o.key}`,
  scroll: (o) => `scroll Δ(${o.deltaX},${o.deltaY}) @ (${o.x},${o.y})`,
};

// ── 09-02 action safety engine ─────────────────────────────────────────────────
// Classification runs on the LIVE page via CDP Runtime.evaluate (no content.js
// edit, no keystroke reading — the DOM is only inspected by coordinate /
// activeElement). Policy per permission mode:
//   manual  — ask for EVERY action
//   auto    — ask ONLY for RISKY actions (credential-adjacent inputs,
//             destructive clicks/submits/deletes, downloads, leaving the page
//             set), act otherwise
//   yolo    — never ask
// 09-08 (operator: "nth is hard blocked, allow yolo todo anything and
// everything, its the users choice"). Credential/OTP/card fields and downloads
// used to be refused in EVERY mode, YOLO included — the app overruling its own
// owner on their own screen, in the one mode whose entire promise is that it
// never asks. They are RISKY now, not forbidden: manual asks for them (manual
// asks for everything), auto asks for them, YOLO runs them. The classifier is
// still worth running because its label is what the approval card shows, so
// "approve" stays an informed click.
const RISKY_CORES = new Set([
  'credential', 'credential-adjacent', 'download', 'destructive', 'submit', 'leaving',
]);

// Builds a single Runtime.evaluate expression returning a JSON string
// {core, desc} — where core is one of:
//   credential | credential-adjacent | download | destructive | submit |
//   leaving | normalish
function classifyExpr(useActive, cssX, cssY) {
  return `(() => {
    const classify = (el) => {
      let node = el;
      while (node && node.getAttribute) {
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        const get = (a) => (node.getAttribute ? (node.getAttribute(a) || '') : '');
        const type = get('type').toLowerCase();
        const blob = [type, get('id'), get('name'), get('placeholder'), get('aria-label'), tag].join(' ').toLowerCase();
        if (type === 'password') return 'credential';
        if (['current-password','new-password','one-time-code','otp','cc-number','cc-exp','cc-exp-month','cc-exp-year','cc-csc','cc-name'].includes(type)) return 'credential';
        if (/(\\bpass(word)?\\b|\\bpasswd\\b|\\bpwd\\b|\\botp\\b|one[ -]?time|secret|cvv|cvc|card[ -_]?number|cc[ -_]?num)/.test(blob)) return 'credential';
        if (tag === 'a' && node.hasAttribute('download')) return 'download';
        if (tag === 'input' && type === 'file') return 'download';
        if (tag === 'form' && node.querySelector('input[type=password]')) return 'credential-adjacent';
        if (tag === 'button' || (tag === 'input' && (type === 'button' || type === 'submit'))) {
          const label = (((node.innerText || '') + ' ' + (node.value || '') + ' ' + get('aria-label') + ' ' + get('title'))).toLowerCase().slice(0, 120);
          if (/(delete|remove|erase|clear all|sign out|log out|logout|deactivate|close (my )?account|unsubscribe|terminate|revoke|void|permanently)/.test(label)) return 'destructive';
          if (/(submit|save|confirm|accept|agree|post|publish|send|complete|finish|checkout|place order|pay)/.test(label)) return 'submit';
        }
        if (tag === 'a') {
          const href = node.href || '';
          if (href) {
            let target = '';
            try { target = new URL(href, window.location.href).origin; } catch (e) {}
            if (target && target !== window.location.origin) return 'leaving';
          }
          const label = (((node.innerText || '') + ' ' + get('aria-label') + ' ' + get('title'))).toLowerCase().slice(0, 120);
          if (/(download|\\.zip|\\.pdf|\\.docx?|\\.csv|\\.xlsx?)/.test(label)) return 'download';
          if (/(delete|remove|sign out|log out|logout)/.test(label)) return 'destructive';
        }
        node = node.parentElement;
      }
      return 'normalish';
    };
    const desc = (el) => !el ? '' : ((el.tagName ? el.tagName.toLowerCase() : '') + '#' + (el.id || '') + '.' + (el.name || '') + '[' + ((el.type) || '') + ']');
    ${useActive
      ? `const ae = document.activeElement;
         return JSON.stringify({ core: (ae && ae.getAttribute) ? classify(ae) : 'normalish', desc: desc(ae) });`
      : `const el = document.elementFromPoint(${Math.round(cssX)}, ${Math.round(cssY)});
         if (!el) return JSON.stringify({ core: 'normalish', desc: 'empty point' });
         return JSON.stringify({ core: classify(el), desc: desc(el) });`}
  })()`;
}

// Classify one action. NEVER throws — unknown classification degrades to
// 'normalish' (the server-side action list is already geometrically clamped).
async function classifyAction(op) {
  if (!state.debuggerAttached || !state.driveTabId) return { core: 'normalish', desc: '' };
  const useActive = op.op === 'type' || op.op === 'key';
  let cssX = 0; let cssY = 0;
  if (!useActive) {
    const { sx, sy } = await scaleF();
    const fx = (op.x !== undefined ? op.x : (op.toX !== undefined ? op.toX : 0));
    const fy = (op.y !== undefined ? op.y : (op.toY !== undefined ? op.toY : 0));
    cssX = fx * sx; cssY = fy * sy;
  }
  try {
    const r = await chrome.debugger.sendCommand(
      { tabId: state.driveTabId }, 'Runtime.evaluate',
      { expression: classifyExpr(useActive, cssX, cssY), returnByValue: true },
    );
    const val = r && r.result && r.result.value;
    if (typeof val === 'string') {
      const parsed = JSON.parse(val);
      return { core: typeof parsed.core === 'string' ? parsed.core : 'normalish', desc: String(parsed.desc || '') };
    }
  } catch (e) { /* classify best-effort */ }
  return { core: 'normalish', desc: '' };
}

// Ask the human (popup card when open, else a system notification via the
// background broker). Deny-default: the broker auto-denies on popup close and
// after its 60s TTL; this function additionally denies if the worker never
// answers (90s safety) so a drive can never hang on a dead prompt.
function requestApproval(title, summary) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (approved) => {
      state.awaitingApproval = false;
      updateModeChip();
      if (!done) { done = true; resolve(!!approved); }
    };
    const safety = setTimeout(() => finish(false), 90_000);
    state.awaitingApproval = true;
    updateModeChip();
    setStatus(`⏳ Asking you to approve: ${summary.slice(0, 90)}`);
    chrome.runtime.sendMessage({ action: 'REQ_APPROVAL', title, summary })
      .then((resp) => { clearTimeout(safety); finish(resp && resp.approved); })
      .catch(() => { clearTimeout(safety); finish(false); });
  });
}

async function actionApproved(op, cls, idx, total) {
  const label = OP_LABEL[op.op] ? OP_LABEL[op.op](op) : JSON.stringify(op);
  const risky = RISKY_CORES.has(cls.core);
  if (state.agentMode === 'manual') {
    const summary = `Action ${idx + 1}/${total}: ${label}\nClassified: ${cls.core}${cls.desc ? ' (' + cls.desc + ')' : ''}\nManual mode — approve to run, Deny to skip (auto-denies in ~60s).`;
    const ok = await requestApproval(`Helpotron agent action ${idx + 1}/${total}: ${cls.core}`, summary);
    pushLog(ok ? 'info' : 'warn', ok ? `✓ approved: ${label}` : `⛔ you denied (${cls.core}): ${label}`);
    return ok;
  }
  if (state.agentMode === 'auto' && risky) {
    const summary = `RISKY action ${idx + 1}/${total}: ${label}\nClassified: ${cls.core}${cls.desc ? ' (' + cls.desc + ')' : ''}\nAutomatic mode — risky actions ask; everything else runs on its own (auto-denies in ~60s).`;
    const ok = await requestApproval(`Risky action ${idx + 1}/${total}: ${cls.core}`, summary);
    pushLog(ok ? 'info' : 'warn', ok ? `✓ risky approved: ${label}` : `⛔ you denied (${cls.core}): ${label}`);
    return ok;
  }
  // auto + non-risky, or yolo: no prompt (server list already sanitized).
  return true;
}

function hostPatternFor(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}/*`;
  } catch (e) { return null; }
}

async function hostPermitted(tabUrl) {
  const pat = hostPatternFor(tabUrl);
  if (!pat) return false;
  try { return await chrome.permissions.contains({ origins: [pat] }); } catch (e) { return false; }
}

async function runActions(actions) {
  if (!state.controlOn || state.paused) {
    pushLog('warn', state.controlOn ? 'pause active — actions dropped (press Resume first)' : 'control is OFF — actions dropped (agent sees the screen but cannot drive)');
    return;
  }
  if (!state.driveTabId) {
    pushLog('warn', 'no captured TAB — actions dropped (pick a tab, not a screen)');
    return;
  }
  let list = (actions || []).slice(0, MAX_ACTIONS); // 09-02 cap re-enforced locally
  if (!list.length) return;

  // A ref-based op carries no coordinates: resolve it against the live DOM
  // before anything is dispatched, so it joins the coordinate path below. An
  // unresolvable ref is left alone and falls through unchanged.
  try {
    list = await window.HelpotronElements.resolveActionRefs(state.driveTabId, list);
  } catch (e) { /* keep the original list */ }

  // Host-permission gate (09-02): only act where the extension's own host
  // permissions cover the page — never on strangers' origins.
  const driveTab = await chrome.tabs.get(state.driveTabId).catch(() => null);
  if (!driveTab || !driveTab.url) {
    pushLog('warn', 'drive tab is gone — actions dropped');
    return;
  }
  if (!(await hostPermitted(driveTab.url))) {
    pushLog('warn', `HOST-PERMISSION GATE: no host permission for ${driveTab.url} — actions dropped (the extension only acts on sites it is installed for)`);
    setStatus('⛔ The agent is not permitted to act on that site — no host permission.');
    return;
  }

  if (await ensureDebugger() === false) {
    // One-click retry instead of a dead drop: the burst is remembered, the
    // page grays out as paused, and "Resume driving" re-runs it after the
    // user closed DevTools / switched to a normal page.
    state.pendingActions = list;
    state.pendingStop = true;
    state.paused = true;
    updateBanner();
    setStatus('⏸ Debugger attach failed — press "Resume driving" to retry the agent actions.');
    return;
  }
  state.pendingActions = null;
  state.driving = true;
  state.pendingStop = false;
  if (state.driveTabId) await initVirtualCursor(state.driveTabId);
  const started = performance.now();
  // start cursor estimate: css center (real cursor resync happens on move sample 0)
  const cv = await getCssViewport();
  if (cv && !state.cursor) state.cursor = { x: cv.w / 2, y: cv.h / 2 };

  await driveMessage('arm', true);   // content script: next real user gesture fires interrupt
  await driveMessage('window', true); // mask incidental motion during our burst
  pushLog('info', `▶ executing ${list.length} action(s) · mode: ${state.agentMode}`);
  let completed = 0;
  let asked = 0;
  try {
    for (let i = 0; i < list.length; i++) {
      const op = list[i];
      if (state.pendingStop) break;
      if (performance.now() - started > MAX_DRIVE_MS) {
        pushLog('warn', `drive wall-clock cap (${MAX_DRIVE_MS / 1000}s) reached`);
        break;
      }
      // per-action safety: re-check the page is still ours (navigation), then
      // classify + apply the permission mode (manual/auto/yolo).
      const now = await chrome.tabs.get(state.driveTabId).catch(() => null);
      if (!now || !now.url || !(await hostPermitted(now.url))) {
        pushLog('warn', 'page changed while driving and is outside the host-permission set — remaining actions dropped');
        break;
      }
      const cls = await classifyAction(op);
      pushLog('op', `${OP_LABEL[op.op] ? OP_LABEL[op.op](op) : JSON.stringify(op)} [${cls.core}${cls.desc ? ` ${cls.desc}` : ''}]`);
      if (!(await actionApproved(op, cls, i, list.length))) {
        continue; // denied — skip and keep going (per-action granularity)
      }
      asked++;
      const ok = await executeAction(op);
      if (ok === false && state.pendingStop) break; // user interrupt mid-path
      completed++;
      if (completed < list.length) await sleep(rand(300, 650)); // dwell between actions
    }
    if (state.pendingStop) {
      pushLog('warn', '⏹ interrupted — remaining actions dropped, nothing is retried automatically');
    } else {
      pushLog('info', `✓ drive burst finished (${completed}/${list.length} actions${asked ? `, ${asked} approved` : ''})`);
      if (completed < list.length) pushLog('warn', `${list.length - completed} action(s) skipped`);
    }
  } catch (e) {
    pushLog('err', `drive burst failed: ${e && e.message ? e.message : e}`);
  } finally {
    state.driving = false;
    state.awaitingApproval = false;
    updateModeChip();
    if (state.driveTabId) await removeVirtualCursor(state.driveTabId).catch(() => {});
    await driveMessage('window', false);
    await driveMessage('disarm', false);
    await detachDebugger();
  }
}

// ── Interrupt / pause: NO auto-resume (spec safe default) ────────────────────
function suspendForInterrupt(trigger) {
  state.pendingStop = true;
  state.paused = state.controlOn;
  state.pendingActions = null; // an interrupt cancels an unattached retry too
  updateBanner();
  pushLog('warn', `⏹ paused by ${trigger} — press “Resume driving” to allow the next drive`);
  setStatus(trigger === 'user' ? '🖱 user activity detected — agent paused' : '⏹ Stopped.');
}

function resumeDriving() {
  state.paused = false;
  state.pendingStop = false;
  updateBanner();
  pushLog('info', '► resumed driving — the next agent actions will run (nothing stale is replayed)');
  // Attach-failed burst retry: the actions were dropped, not lost — re-run
  // them now that the user pressed Resume.
  if (state.pendingActions && state.pendingActions.length) {
    const burst = state.pendingActions;
    state.pendingActions = null;
    pushLog('info', `retrying the ${burst.length} action(s) that failed to attach`);
    runActions(burst).catch((e) => pushLog('err', `retry failed: ${e && e.message ? e.message : e}`));
  }
}

function stopAll(trigger) {
  suspendForInterrupt(trigger || 'Stop button');
  if (state.debuggerAttached) detachDebugger();
  driveMessage('window', false);
  driveMessage('disarm', false);
}

// ── Chat send (agent mode: frame + viewport attached) ────────────────────────
let chatBusy = false;
async function sendChatMessage() {
  const text = els.chatInput.value.trim();
  if (!text || chatBusy) return;
  if (!(await isLoggedIn())) {
    refreshLoginNote();
    setStatus('⚠️ Login required — open the popup and sign in first.');
    return;
  }
  const srv = await serverUrl();
  chatBusy = true;
  els.chatSend.disabled = true;
  els.chatInput.value = '';
  addChatMsgEl('user', text);

  // Attach a FRESH frame when a live capture is running AND the "See screen"
  // toggle is ON (09-02: the toggle decides what the agent sees). See screen
  // ON with no capture yet -> auto-capture the active tab right now.
  let images = [];
  let viewport = null;
  let frameDim = null;
  let screenError = null;
  if (!state.seescreen) {
    pushLog('info', '“See screen” toggle is OFF — this message carries no screen frame');
  } else {
    if (!state.videoStream && hasTabCapture) await maybeAutoCapture();
    if (state.videoStream && state.videoW && state.videoH) {
      await ensureCssViewport();  // so grabFrame renders the frame in CSS space
      const f = grabFrame();
      if (f) {
        images = [f.b64];
        viewport = viewportForServer();
        frameDim = { w: f.w, h: f.h };
        pushLog('info', `sent frame attached (${f.w}×${f.h}, jpeg q${JPEG_QUALITY})`);
      }
    }
    if (!images.length) {
      screenError = 'no active stream captured — select a tab or navigate to a regular web page';
    }
  }

  // CSS viewport of the drive tab — the space the DOM element list is measured
  // in. Needed both to put that list into frame space when a frame is attached,
  // and as the clamp box on the (rare) execute-without-frame path.
  let cssVp = state.cssViewport;
  if (!cssVp && state.driveTabId) {
    try {
      const v = (window.HelpotronElements && typeof window.HelpotronElements.getTabViewport === 'function')
        ? await window.HelpotronElements.getTabViewport(state.driveTabId).catch(() => null)
        : (typeof window.getTabViewport === 'function' ? await window.getTabViewport(state.driveTabId).catch(() => null) : null);
      if (v) { cssVp = { w: v.width, h: v.height }; state.cssViewport = cssVp; }
    } catch (e) { /* unknown viewport — frame dims / default below */ }
  }
  if (!frameDim && cssVp) viewport = { width: cssVp.w, height: cssVp.h };

  const typingEl = addChatMsgEl('agent', '…thinking…');
  const body = { text, agent_mode: true, seescreen: state.seescreen, execute: state.execute };
  if (images.length) body.images = images;
  if (screenError) body.screen_error = screenError;
  if (viewport) body.viewport = viewport;

  // The page's own element list — exact measured coordinates, not a vision
  // guess. Only when the run may actually act, so a look-only turn pays no
  // extra tokens; an empty list leaves the vision path untouched.
  if (state.execute && state.driveTabId) {
    try {
      // allowAttach: chrome.scripting cannot read a page outside the manifest's
      // host_permissions, which is most of the web — the list came back empty
      // and the model was left guessing coordinates. The debugger reads any tab.
      let els = await window.HelpotronElements.collectInteractiveElements(
        state.driveTabId, undefined, { allowAttach: true });
      // The list is measured in CSS px; when a frame is attached the model
      // reads (and is clamped in) FRAME space. Convert the list so the two
      // agree — otherwise every listed coordinate is off by the frame's
      // downscale factor. ref-based ops ignore x/y, so this is the fallback
      // path's accuracy only; it must not be silently wrong.
      if (els && els.length && frameDim && cssVp && cssVp.w > 0 && frameDim.w > 0) {
        const sx = frameDim.w / cssVp.w;
        const sy = frameDim.h / cssVp.h;
        els = els.map((e) => ({ ...e,
          x: Math.round((e.x || 0) * sx),
          y: Math.round((e.y || 0) * sy),
          w: Math.round((e.w || 0) * sx),
          h: Math.round((e.h || 0) * sy),
        }));
      }
      if (els && els.length) body.elements = els;
    } catch (e) { /* no list — the vision path still works */ }
  }
  try {
    const headers = await authHeaders();
    const ctrl = new AbortController();
    const fetchTimer = setTimeout(() => ctrl.abort(), 75000);
    let res;
    try {
      res = await fetch(`${srv}/api/extension/agent_chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(fetchTimer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    if (data && data.status === 'permission_required') {
      // Server permission gate (09-07): action needs the user's decision before
      // the agent can execute. Renders this page's shared card; answers post to
      // /api/extension/approval/respond.
      const ap = (data.approval_request && data.approval_request.req_id)
        ? data.approval_request
        : (data.permission_request
            ? { req_id: data.permission_request.id, title: data.permission_request.title, summary: data.permission_request.description }
            : null);
      if (ap) pendAgentApprovals.push({ reqId: String(ap.req_id), title: ap.title || 'Permission required', summary: ap.summary || 'The agent is waiting for your decision.', viaServer: true });
      while (pendAgentApprovals.length > 5) pendAgentApprovals.shift();
      renderAgentApproval();
      setStatus('⚠️ The agent needs your approval before it can act.');
    }
    const reply = chatReplyText(data, '✅ Done.');
    typingEl.replaceWith(addChatMsgEl('agent', reply, data.reply_html || ''));
    const actions = Array.isArray(data.control_actions) ? data.control_actions : null;
    if (actions && actions.length) {
      const n = actions.length;
      if (!state.execute) {
        // 09-02: the Execute toggle is OFF — the agent talks, it never acts.
        pushLog('warn', `agent proposed ${n} action(s) but “Study Mode” is OFF — turn it on in the popup (then Control ON + Resume) to let it drive`);
        setStatus(`Agent proposed ${n} action(s) — “Study Mode” is OFF, nothing ran.`);
      } else if (data.control_requires_approval && !agentControlSessionAllowed) {
        // Server permission gate (09-14, S1-3). The server refuses a burst the
        // current mode does not authorise — e.g. a COMMITTING one (submit /
        // send / delete / buy, or a type-then-Enter) in Auto mode, which is
        // exactly what a page trying to steer the agent would aim at. The card
        // carries the real ops so "Approve" is an informed click. Nothing runs
        // unless the user says allow.
        const reqId = `agentctl-${Date.now()}`;
        pendAgentApprovals.push({
          reqId,
          title: 'Approve screen control?',
          summary: data.control_summary
            ? `${data.control_summary}` + (data.control_permission_reason ? `\n\nReason: ${data.control_permission_reason}` : '')
            : `The agent wants to run ${n} action(s) on your screen.`,
          onDecision: async (decision, note, opts) => {
            if (decision !== 'allow') {
              pushLog('warn', 'screen control rejected — nothing ran');
              setStatus('Screen control rejected — nothing ran.');
              return;
            }
            if (opts && opts.autoAdd) agentControlSessionAllowed = true;
            setStatus(`Executing ${n} action(s) after approval…`);
            await runActions(actions);
            setStatus('✓ Actions finished.');
          },
        });
        while (pendAgentApprovals.length > 5) pendAgentApprovals.shift();
        renderAgentApproval();
        setStatus(`⚠️ ${n} action(s) need your approval (mode: ${state.agentMode}).`);
      } else if (!state.controlOn || state.paused) {
        pushLog('warn', `agent proposed ${n} action(s) but control is ${state.controlOn ? 'paused' : 'OFF'} — enable Control (or press Resume) to let it drive`);
      } else {
        setStatus(`👁 Agent sees the screen — ${state.agentMode !== 'yolo' ? `requesting permission for ${n} action(s) (mode: ${state.agentMode})…` : `executing ${n} action(s) (YOLO mode — no prompts)`}`);
        await runActions(actions);
        setStatus('✓ Actions finished.');
      }
    }
    const cur = (await chrome.storage.local.get(CHAT_KEY))[CHAT_KEY] || [];
    await cacheChat([...cur, { sender: 'user', text }, { sender: 'agent', text: reply }]);
  } catch (e) {
    typingEl.replaceWith(addChatMsgEl('agent', `⚠️ ${e.message}`));
    setStatus('❌ Study Buddy chat failed.');
    pushLog('err', `chat failed: ${e.message}`);
  } finally {
    chatBusy = false;
    els.chatSend.disabled = false;
    els.chatInput.focus();
  }
}

// ── Server approval card (09-07): the same card as the popup's, wired to
// /api/extension/approval/respond. pendAgentApprovals holds server-channel
// prompts delivered by an agent_chat "permission_required" response.
const pendAgentApprovals = [];
// Set once the user approves a screen-control card with "auto-add", so a run
// that needs several confirmed bursts does not re-ask for each one. Mirrors
// popup.js's screenControlSessionAllowed; per-session only, never persisted.
let agentControlSessionAllowed = false;
const AGENT_NEUTRAL_HINT = 'Say something first — Neutral needs your note';

function renderAgentApproval() {
  const card = document.getElementById('approvalCard');
  const titleEl = document.getElementById('approvalTitle');
  const textEl = document.getElementById('approvalText');
  if (!card || !titleEl || !textEl) return;
  const item = pendAgentApprovals[0];
  if (!item) {
    card.style.display = 'none';
    syncAgentApprovalSection();
    return;
  }
  titleEl.innerText = item.title;
  textEl.innerText = item.summary;
  const input = document.getElementById('approvalInput');
  const statusLine = document.getElementById('approvalStatus');
  const helper = document.getElementById('approvalHelper');
  if (input) { input.value = ''; input.setAttribute('aria-invalid', 'false'); }
  if (statusLine) statusLine.hidden = true;
  if (helper) {
    helper.classList.remove('a-helper--warn');
    helper.textContent = 'Approve = let it act · Reject = stop it · Neutral = don’t do it, just send your note.';
  }
  card.style.display = 'block';
  syncAgentApprovalSection();
}

// #approvalSection carries an inline display:none that nothing ever cleared, so
// the card rendered into a hidden parent and the full-tab Agent Mode never
// showed an approval at all — the status line said one was waiting, the card
// itself was never painted. The section is up while either the card or the
// answered-status line has something to say. Same rule as the popup's dock.
function syncAgentApprovalSection() {
  const section = document.getElementById('approvalSection');
  if (!section) return;
  const card = document.getElementById('approvalCard');
  const statusLine = document.getElementById('approvalStatus');
  const cardUp = !!card && card.style.display !== 'none';
  const statusUp = !!statusLine && !statusLine.hidden;
  section.style.display = (cardUp || statusUp) ? '' : 'none';
}

function answerAgentApproval(reqId, decision, note, opts) {
  const d = (decision === 'allow' || decision === 'deny' || decision === 'neutral')
    ? decision
    : (decision ? 'allow' : 'deny');
  const text = String(note || '').trim();
  const autoAdd = Boolean(opts && opts.autoAdd);
  const ix = pendAgentApprovals.findIndex((p) => p.reqId === reqId);
  // Local prompts (screen control, 09-14). The actions are already in hand on
  // this side — there is nothing to resume server-side, so the card just gates
  // the dispatch. Without this hook `control_requires_approval` was ignored
  // here and runActions() executed anyway, so the server's confirmation gate
  // was silently discarded in Agent Mode (the popup already honoured it).
  const onDecision = ix >= 0 ? pendAgentApprovals[ix].onDecision : null;
  if (ix >= 0) pendAgentApprovals.splice(ix, 1);
  if (typeof onDecision === 'function') {
    const card0 = document.getElementById('approvalCard');
    const status0 = document.getElementById('approvalStatus');
    Promise.resolve(onDecision(d, text, { autoAdd })).catch(() => {});
    if (card0) card0.style.display = 'none';
    if (status0) {
      status0.innerText = d === 'allow'
        ? (autoAdd ? '✅ Allowed — won’t ask again this session.' : '✅ Allowed the agent action.')
        : d === 'deny' ? '⛔ Rejected — nothing ran on your screen.'
        : '⚪ Neutral — nothing ran; the agent got your note.';
      status0.hidden = false;
    }
    renderAgentApproval();
    return;
  }
  const card = document.getElementById('approvalCard');
  const statusLine = document.getElementById('approvalStatus');
  const done = (msg) => {
    if (card) card.style.display = 'none';
    if (statusLine) { statusLine.innerText = msg; statusLine.hidden = false; }
    renderAgentApproval();
  };
  chrome.storage.local.get(['server', 'session_token', 'token'])
    .then(async (st) => {
      const srv = (st.server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
      const t = st.session_token || st.token || '';
      try {
        const res = await fetch(`${srv}/api/extension/approval/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ req_id: reqId, decision: d, ...(text ? { text } : {}), auto_add: autoAdd }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) done(`⚠️ Could not send your decision (HTTP ${res.status}${data.detail ? ' — ' + data.detail : ''})`);
        else if (d === 'deny') done('⛔ Rejected the agent action.');
        else if (d === 'neutral') done('⚪ Neutral — the agent got your note.');
        else if (autoAdd) done('✅ Allowed — added to auto-approved actions.');
        else done('✅ Allowed the agent action.');
      } catch (err) {
        done(`⚠️ Could not reach the server: ${String(err).slice(0, 90)}`);
      }
    })
    .catch(() => {});
}

function answerAgentApprovalFromButton(decision, opts) {
  const p = pendAgentApprovals[0];
  if (!p) return;
  const input = document.getElementById('approvalInput');
  const helper = document.getElementById('approvalHelper');
  const text = input ? String(input.value || '') : '';
  if (decision === 'neutral' && !text.trim()) {
    if (input) { input.focus(); input.setAttribute('aria-invalid', 'true'); }
    if (helper) {
      helper.classList.add('a-helper--warn');
      helper.textContent = AGENT_NEUTRAL_HINT;
    }
    return;
  }
  answerAgentApproval(p.reqId, decision, text, opts);
}

// ── Wiring ───────────────────────────────────────────────────────────────────
function init() {
  // chrome absent / wrong context -> the page still renders, with a clear reason.
  if (!hasChrome) {
    setStatus('⚠️ Not running inside the Helpotron extension (no chrome.runtime) — open agent_mode.html from the extension toolbar.');
    pushLog('err', 'extension context unavailable — Agent Mode must run as an extension page');
    return;
  }

  chrome.storage.local.get(LOG_KEY).then((st) => {
    const saved = (st[LOG_KEY] || []).slice(-MAX_LOG_ENTRIES);
    if (Array.isArray(saved)) { state.logs = saved; renderLogs(); }
  });
  pushLog('info', 'Helpotron Agent Mode opened');

  // 09-02: read the CHAT options (seescreen / execute / mode) the popup owns,
  // then — when "See screen" is ON — auto-capture the active tab right away.
  loadAgentState().then(() => {
    if (state.seescreen) maybeAutoCapture();
  });

  els.selectTabBtn.addEventListener('click', () => {
    if (!hasTabCapture) {
      pushLog('warn', 'browser has no tabCapture API — use “Pick screen” for a preview (driving needs a tab)');
      setStatus('⚠️ No tabCapture support here — Pick screen for preview only.');
      return;
    }
    showTabPicker();
  });
  els.pickScreenBtn.addEventListener('click', pickScreen);
  els.lookBtn.addEventListener('click', lookNow);
  els.grabFrameBtn.addEventListener('click', () => {
    if (!state.videoStream) {
      pushLog('warn', 'nothing captured — select a tab or pick a screen first');
      setStatus('⚠️ No live capture to grab.');
      return;
    }
    const f = grabFrame();
    if (f) {
      els.frameMeta.textContent = `frame ${f.w}×${f.h} @q${JPEG_QUALITY}`;
      pushLog('info', `frame grabbed (${f.w}×${f.h}) — attached to your next message`);
      setStatus(`📸 Frame grabbed (${f.w}×${f.h})`);
    }
  });
  els.clearFrameBtn.addEventListener('click', () => {
    stopVideo();
    setChip('No screen selected');
    setStatus('Capture cleared.');
    pushLog('info', 'capture cleared by user');
  });

  // Control toggle: default OFF; every ON requires the consent modal again.
  els.controlToggle.addEventListener('change', () => {
    if (els.controlToggle.checked) openConsent();
    else disableControl('control toggled OFF by the user (fresh consent needed to re-enable)');
  });
  els.consentAck.addEventListener('change', () => { els.consentEnable.disabled = !els.consentAck.checked; });
  els.consentEnable.addEventListener('click', () => {
    if (!els.consentAck.checked) return;
    closeConsent();
    maybeEnableToggle();
    if (!state.driveTabId) els.controlToggle.checked = true; // allowed: applies once a tab is selected
    enableControl();
  });
  els.consentCancel.addEventListener('click', () => {
    els.controlToggle.checked = false;
    closeConsent();
    pushLog('info', 'control consent declined — toggle stays OFF');
  });

  els.stopBtn.addEventListener('click', () => stopAll('Stop button'));
  els.resumeBtn.addEventListener('click', resumeDriving);
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // let inputs handle Esc
    if (state.controlOn) stopAll('Esc key');
  });

  els.chatSend.addEventListener('click', sendChatMessage);

  // Server-approval card buttons (same contract as the popup card).
  for (const [aid, decision, aopts] of [
    ['approvalApprove', 'allow', null],
    ['approvalReject', 'deny', null],
    ['approvalNeutral', 'neutral', null],
    ['approvalApproveAuto', 'allow', { autoAdd: true }],
  ]) {
    const el = document.getElementById(aid);
    if (el) el.addEventListener('click', () => answerAgentApprovalFromButton(decision, aopts));
  }
  els.chatInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendChatMessage(); }
  });
  els.chatRefresh.addEventListener('click', loadChatHistory);
  els.clearLogBtn.addEventListener('click', () => {
    state.logs = [];
    renderLogs();
    try { chrome.storage.local.set({ [LOG_KEY]: [] }); } catch (e) { /* ok */ }
  });

  els.tabPickerClose.addEventListener('click', () => els.tabPickerOverlay.classList.add('hidden'));

  // Content-script interrupt: user grabbed the mouse / pressed a key / scrolled
  // inside the captured tab while control is armed -> pause, NO auto-resume.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'agent:user-interrupt') return;
    if (state.controlOn) suspendForInterrupt('your mouse/keyboard');
  });

  // Tab closed -> detach + disarm + clear (never leave a stale drive window).
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId !== state.driveTabId) return;
    pushLog('warn', 'captured tab was closed — capture cleared, driver disarmed');
    stopVideo();
    state.pendingStop = true;
    updateBanner();
  });

  // Hard cleanup on page close: disarm + detach immediately.
  window.addEventListener('beforeunload', () => {
    if (state.driveTabId) {
      try { chrome.tabs.sendMessage(state.driveTabId, { type: 'agent-drive', mode: 'disarm', active: false }); } catch (e) { /* ok */ }
    }
    if (state.debuggerAttached) {
      try { chrome.debugger.detach({ tabId: state.driveTabId }); } catch (e) { /* ok */ }
    }
  });

  maybeDisableToggle();
  updateBanner();
  refreshLoginNote();
  loadChatHistory();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// keep a single inline helper out of the DOM (used by showTabPicker only)
function div(container, cls, text) {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  container.appendChild(el);
}
