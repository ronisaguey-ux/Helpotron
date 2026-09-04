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
//      humanlike path module (mouse_path.js) — never teleporting.
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

import { humanMovePoints } from './mouse_path.js';

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
    els.bannerText.textContent =
      'Paused by you — the agent will NOT drive again until you press "Resume driving". Nothing is retried automatically.';
    els.resumeBtn.classList.remove('hidden');
  } else {
    els.controlBanner.classList.remove('warn');
    els.bannerText.textContent =
      'Control is ON — the agent can move the mouse, click and type inside the selected tab. Stop button / Esc always work; moving the mouse pauses it (no auto-resume).';
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
  set('executeChip', 'Execute', state.execute, 'chip--amber');
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
function addChatMsgEl(sender, text) {
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (sender === 'user' ? 'user' : sender === 'agent' ? 'agent' : 'chat-note');
  if (sender === 'user' || sender === 'agent') {
    const sp = document.createElement('span');
    sp.className = 'chat-sender';
    sp.textContent = sender === 'user' ? 'You' : 'Agent';
    div.appendChild(sp);
  }
  const body = document.createElement('span');
  body.textContent = text;
  div.appendChild(body);
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
  msgs.forEach((m) => addChatMsgEl(m.sender === 'user' ? 'user' : 'agent', m.text));
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
    const scale = Math.min(1, MAX_FRAME_DIM / Math.max(video.videoWidth || state.videoW, video.videoHeight || state.videoH));
    const w = Math.max(1, Math.round((video.videoWidth || state.videoW) * scale));
    const h = Math.max(1, Math.round((video.videoHeight || state.videoH) * scale));
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
  // debugger is an OPTIONAL permission granted when Execute is switched on in
  // the popup — refuse to attach (with a helpful message) when it is absent.
  try {
    const has = await chrome.permissions.contains({ permissions: ['debugger'] });
    if (!has) {
      pushLog('info', 'debugger permission not granted — driving disabled');
      setStatus('⚠️ Agent actions are off in this browser. Open the Helpotron popup, switch Execute on, and approve the permission prompt.');
      return false;
    }
  } catch (e) {
    pushLog('err', `debugger permission check failed: ${e}`);
    return false;
  }
  const tab = { tabId: state.driveTabId };
  try {
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
  try { await chrome.debugger.detach({ tabId: state.driveTabId }); } catch (e) { /* already gone */ }
  state.debuggerAttached = false;
  pushLog('info', 'debugger detached — driving stopped');
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
  }
  return true;
}

function pathBetween(fromX, fromY, toX, toY, side) {
  return humanMovePoints(fromX, fromY, toX, toY, { side });
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

  const hop = async (target, dragging) => {
    // Each hop STARTS at the current tracked cursor (never teleport: a second
    // hop inside the same action — drag — chains from where the first ended).
    // Humanlike rule: consecutive moves bow to ALTERNATING sides.
    const cur = state.cursor || { x: state.cssViewport ? state.cssViewport.w / 2 : 100, y: state.cssViewport ? state.cssViewport.h / 2 : 100 };
    if (state.lastSide === null) state.lastSide = Math.random() < 0.5 ? 1 : -1;
    const side = state.lastSide;
    state.lastSide = -side;
    const path = pathBetween(cur.x, cur.y, target.x, target.y, side);
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
      await cdp('Input.insertText', { text: String(op.text || '') });
      break;

    case 'key': {
      const k = KEY_TABLE[op.key];
      if (!k) { ok = false; break; }
      await cdp('Input.dispatchKeyEvent', {
        type: 'rawKeyDown', key: k.key, code: k.code,
        modifiers: modMask, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
        text: '', unmodifiedText: '',
      });
      await sleep(rand(30, 70));
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyUp', key: k.key, code: k.code,
        modifiers: modMask, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
      });
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
// Hard blocks apply in EVERY mode: credential/OTP/card fields (never type into
// them) and downloads/file inputs (no arbitrary file downloads). The cap of 15
// actions (MAX_ACTIONS) is re-enforced locally, and the whole burst is gated by
// host permissions (the extension may only act where it has host permission).
const RISKY_CORES = new Set(['credential-adjacent', 'destructive', 'submit', 'leaving']);
const HARD_CORES = new Set(['credential', 'download']);

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
  // HARD blockers first — they apply in EVERY mode and are never asked about.
  if (HARD_CORES.has(cls.core)) {
    pushLog('err', `HARD SAFETY BLOCK [${cls.core}] ${label} (${cls.desc}) — skipped without asking, this is always forbidden`);
    setStatus(`⛔ Hard safety block: ${cls.core} (${label.slice(0, 40)}…) — the agent cannot do this, ever.`);
    return false;
  }
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
  const list = (actions || []).slice(0, MAX_ACTIONS); // 09-02 cap re-enforced locally
  if (!list.length) return;

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

  if (await ensureDebugger() === false) return;
  state.driving = true;
  state.pendingStop = false;
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
        if (HARD_CORES.has(cls.core)) { completed++; continue; } // hard block = consumed slot, nothing ran
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
    await driveMessage('window', false);
    await driveMessage('disarm', false);
    await detachDebugger();
  }
}

// ── Interrupt / pause: NO auto-resume (spec safe default) ────────────────────
function suspendForInterrupt(trigger) {
  state.pendingStop = true;
  state.paused = state.controlOn;
  updateBanner();
  pushLog('warn', `⏹ paused by ${trigger} — press “Resume driving” to allow the next drive`);
  setStatus(trigger === 'user' ? '🖱 user activity detected — agent paused' : '⏹ Stopped.');
}

function resumeDriving() {
  state.paused = false;
  state.pendingStop = false;
  updateBanner();
  pushLog('info', '► resumed driving — the next agent actions will run (nothing stale is replayed)');
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
  if (!state.seescreen) {
    pushLog('info', '“See screen” toggle is OFF — this message carries no screen frame');
  } else {
    if (!state.videoStream && hasTabCapture) await maybeAutoCapture();
    if (state.videoStream && state.videoW && state.videoH) {
      const f = grabFrame();
      if (f) {
        images = [f.b64];
        viewport = viewportForServer();
        pushLog('info', `sent frame attached (${f.w}×${f.h}, jpeg q${JPEG_QUALITY})`);
      }
    }
  }

  const typingEl = addChatMsgEl('agent', '…thinking…');
  const body = { text, agent_mode: true };
  if (images.length) body.images = images;
  if (viewport) body.viewport = viewport;
  try {
    const headers = await authHeaders();
    const res = await fetch(`${srv}/api/extension/agent_chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    const reply = chatReplyText(data, '✅ Done.');
    typingEl.replaceWith(addChatMsgEl('agent', reply));
    const actions = Array.isArray(data.control_actions) ? data.control_actions : null;
    if (actions && actions.length) {
      const n = actions.length;
      if (!state.execute) {
        // 09-02: the Execute toggle is OFF — the agent talks, it never acts.
        pushLog('warn', `agent proposed ${n} action(s) but “Execute” is OFF — turn it on in the popup (then Control ON + Resume) to let it drive`);
        setStatus(`Agent proposed ${n} action(s) — “Execute” is OFF, nothing ran.`);
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
    setStatus('❌ Agent chat failed.');
    pushLog('err', `chat failed: ${e.message}`);
  } finally {
    chatBusy = false;
    els.chatSend.disabled = false;
    els.chatInput.focus();
  }
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
