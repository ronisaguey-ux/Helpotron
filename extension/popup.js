// Helpotron browser-action popup — 09-02 companion launcher.
// Exactly two options (SCRAPE / CHAT) with sub-options revealed under each.
// CHAT carries two switches (See screen / Execute) + the 3-way permission mode
// (manual / auto / yolo) synced to the backend ai.mode setting, and the popup
// itself is the approval surface for agent actions when it is open.

const statusEl = document.getElementById('status');
const serverInput = document.getElementById('server');
const publicIdInput = document.getElementById('public_id');
const unparseableBox = document.getElementById('unparseableBox');
const unparseableReason = document.getElementById('unparseableReason');
const btnOpenDataLake = document.getElementById('btnOpenDataLake');
const openAssignmentBtn = document.getElementById('openAssignmentBtn');

const CRAWL_CACHE_KEY = 'helpotron_crawl_cache';
const LAST_SCRAPE_KEY = 'helpotron_last_scrapes';

// ── 09-02 CHAT option state (persisted, backend-synced) ───────────────────────
const SEE_SCREEN_KEY = 'helpotron_chat_seescreen';
const EXECUTE_KEY = 'helpotron_chat_execute';
const CHAT_CONTROLS_COLLAPSED_KEY = 'helpotron_chat_controls_collapsed';
const MODE_KEY = 'helpotron_agent_mode';
const EFFORT_KEY = 'helpotron_agent_effort';
const MODEL_KEY = 'helpotron_agent_model';
const MODEL_TIER_KEY = 'helpotron_agent_model_tier';
const EDUCATIONAL_MODE_KEY = 'helpotron_educational_mode';
// 09-08 jurisdiction: which tabs the agent may see and drive this turn.
// 'active' (one tab, the old behaviour) | 'all' (every driveable tab) | an
// array of tab ids the user picked.
const JURISDICTION_KEY = 'helpotron_agent_jurisdiction';

const SEE_SCREEN_DEFAULT = true;
const EXECUTE_DEFAULT = true;
const MODE_DEFAULT = 'manual';
const EFFORT_DEFAULT = 500; // backend fallback when unauthenticated/offline
const EDUCATIONAL_MODE_DEFAULT = true;
const JURISDICTION_DEFAULT = 'active';
const MODELS = ['manual', 'auto', 'yolo'];
// The server refuses more than 4 frames per call (screen_vision
// _MAX_IMAGES_PER_CALL). Capture stops there rather than sending frames that
// would be silently dropped and leave the model reasoning about a tab it
// never actually saw.
const MAX_JURISDICTION_FRAMES = 4;
// A jurisdiction is also capped, well above the frame cap: tabs past the frame
// cap are still REPORTED (as uncaptured) and still driven, they just arrive
// unseen. 16 matches the server's `tabs` max_length — one more would 422 the
// whole turn. When the cap bites the user is told, because a silently halved
// "all tabs" is the same lie this labelling exists to stop.
const MAX_JURISDICTION_TABS = 16;

const modelToggles = {
  toggleSeeScreen: document.getElementById('toggleSeeScreen'),
  toggleExecute: document.getElementById('toggleExecute'),
  toggleEducationalMode: document.getElementById('toggleEducationalMode'),
};
const effortScoreSlider = document.getElementById('effortScoreSlider');
const effortScoreVal = document.getElementById('effortScoreVal');
const chatModelIndicator = document.getElementById('chatModelIndicator');
const chatToggleEdu = document.getElementById('chatToggleEdu');
const chatToggleSee = document.getElementById('chatToggleSee');
const chatToggleExecute = document.getElementById('chatToggleExecute');
const chatToggleTabs = document.getElementById('chatToggleTabs');
const tabJurisdictionPanel = document.getElementById('tabJurisdictionPanel');
const tabJurisdictionList = document.getElementById('tabJurisdictionList');
const btnCloseJurisdiction = document.getElementById('btnCloseJurisdiction');
const chatQuickPause = document.getElementById('chatQuickPause');
const chatEffortSlider = document.getElementById('chatEffortSlider');
const chatEffortVal = document.getElementById('chatEffortVal');
const chatModelBadge = document.getElementById('chatModelBadge');
const chatControlsBar = document.getElementById('chatControlsBar');
const chatControlsToggle = document.getElementById('chatControlsToggle');
const chatControlsSummary = document.getElementById('chatControlsSummary');
const modeBtns = Array.from(document.querySelectorAll('.mode-btn'));
const modeHintEl = document.getElementById('modeHint');
const modelEffortEl = document.getElementById('modelEffort');
const modelNameEl = document.getElementById('modelName');
const modelTierEl = document.getElementById('modelTier');
const btnPopOut = document.getElementById('btnPopOut');
const btnClosePopup = document.getElementById('btnClosePopup');
let effortFromServer = null; // true once GET /api/user/settings succeeded
let effortPatchDebounceTimer = null;

// ── Window Mode & Appbar Button Controls ─────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const isWindowMode = urlParams.get('mode') === 'window' || urlParams.get('window') === '1';
// background.js stamps the side panel's path with ?mode=panel — the side panel
// and the action popup both load popup.html and are otherwise identical.
const isPanelMode = urlParams.get('mode') === 'panel';
// The distinction that actually matters for driving a tab: a popped-out window
// and a side panel KEEP their document across tab/window focus changes, while a
// browser-action popup is destroyed the instant focus leaves it.
const isPersistentSurface = isWindowMode || isPanelMode || window.innerHeight > 600;
if (isWindowMode) {
  document.body.classList.add('window-mode');
}
if (isPanelMode) {
  document.body.classList.add('panel-mode');
}
if (isPersistentSurface || window.innerHeight > 600 || window.innerWidth > 415) {
  document.body.classList.add('fluid-mode');
}
window.addEventListener('resize', () => {
  if (window.innerHeight > 600 || window.innerWidth > 415) {
    document.body.classList.add('fluid-mode');
  }
});
if (isPersistentSurface && btnPopOut) {
  btnPopOut.style.display = 'none'; // already on a surface that stays open
}

// chrome.sidePanel.open() is gesture-gated, and the gesture is spent by the
// first await in the click handler. Resolve the window id NOW so the handler
// can call open() with no await in front of it.
let currentWindowId = null;
try {
  Promise.resolve(chrome.windows.getCurrent())
    .then((w) => { currentWindowId = w && w.id; })
    .catch(() => {});
} catch { /* no windows API (should not happen in a popup) */ }

// Keep-open: the real window MUST exist before this popup closes. Closing the
// popup first was killing the in-flight chrome.windows.create — the browser
// action popup died before the create landed, so no window ever appeared
// ("it still closes when I close out"). Order: await create -> close. On any
// failure the popup stays alive and the error surfaces at the button.
let popoutInFlight = false;
let popoutErrTimer = null;
if (btnPopOut) {
  btnPopOut.addEventListener('click', async () => {
    if (popoutInFlight) return; // double-click: the first click already opens it
    popoutInFlight = true;
    btnPopOut.disabled = true;
    const errEl = document.getElementById('popOutError');
    try {
      // Side panel FIRST, and with NO await ahead of it — sidePanel.open() is
      // gesture-gated, so an intervening `await chrome.tabs.query(...)` can
      // spend the user gesture and make open() reject. currentWindowId was
      // resolved at load time precisely so this call stays synchronous.
      if (chrome.sidePanel && chrome.sidePanel.open && currentWindowId != null) {
        try {
          await chrome.sidePanel.open({ windowId: currentWindowId });
          window.close();
          return;
        } catch { /* fall through to a real popup window */ }
      }
      const win = await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html?mode=window'),
        type: 'popup',
        width: 440,
        height: 660,
        focused: true,
      });
      if (!win || !win.id) throw new Error('chrome.windows.create returned no window');
      window.close(); // go away only once the persistent window is up
    } catch (e) {
      popoutInFlight = false;
      btnPopOut.disabled = false;
      if (errEl) {
        errEl.innerText = "⚠️ Couldn't open the keep-open window — please try again.";
        errEl.hidden = false;
        clearTimeout(popoutErrTimer);
        popoutErrTimer = setTimeout(() => { if (errEl) errEl.hidden = true; }, 5000);
      }
    }
  });
}

if (btnClosePopup) {
  btnClosePopup.addEventListener('click', () => {
    window.close();
  });
}

// ── Natural Mouse Path Generator (humanlike Bezier curve) ────────────────────
function _bezPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function _easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function humanMovePoints(fromX, fromY, toX, toY, opts = {}) {
  const fx = Number(fromX) || 0;
  const fy = Number(fromY) || 0;
  const tx = Number(toX) || 0;
  const ty = Number(toY) || 0;
  const dx = tx - fx;
  const dy = ty - fy;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return [{ x: tx, y: ty, t: 0 }];

  const duration = Math.min(950, Math.max(300, 260 + dist * 0.35));
  const nX = (dist > 0 ? -dy / dist : 0);
  const nY = (dist > 0 ? dx / dist : 0);
  const side = opts.side !== undefined ? (opts.side > 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);

  const off = dist * (0.08 + Math.random() * 0.10) * side;
  const u1 = 0.25 + Math.random() * 0.15;
  const u2 = 0.60 + Math.random() * 0.18;
  const p0 = { x: fx, y: fy };
  const p3 = { x: tx, y: ty };
  const p1 = { x: fx + dx * u1 + nX * off, y: fy + dy * u1 + nY * off };
  const p2 = { x: fx + dx * u2 + nX * off * (0.7 + Math.random() * 0.6),
               y: fy + dy * u2 + nY * off * (0.7 + Math.random() * 0.6) };

  let dt = 10 + Math.random() * 6;
  const tGapCap = Math.max(40, dist / 6);
  if (dt > tGapCap) dt = tGapCap;

  const points = [{ x: fx, y: fy, t: 0 }];
  const count = Math.max(6, Math.round(duration / dt));
  for (let i = 1; i <= count; i++) {
    const tNorm = i / (count + 1);
    const tms = tNorm * duration;
    const eased = _easeInOut(tNorm);
    const p = _bezPoint(p0, p1, p2, p3, eased);
    points.push({ x: p.x, y: p.y, t: tms });
  }
  points.push({ x: tx, y: ty, t: duration });
  return points;
}

const statusTextEl = document.getElementById('statusText');
let statusClearTimer = null;

function setStatus(text) {
  const msg = text == null ? '' : String(text);
  if (statusTextEl) {
    statusTextEl.innerText = msg;
  } else {
    statusEl.innerText = msg;
  }
  // Two-line clamp in CSS; the untruncated message stays reachable on hover.
  statusEl.title = msg;
  statusEl.hidden = !msg;
  // Transient confirmations clear themselves; warnings/errors stay until the
  // user dismisses them or the next message replaces them.
  clearTimeout(statusClearTimer);
  const sticky = /^[⚠️🔒]|error|failed|required/i.test(msg);
  if (msg && !sticky) {
    statusClearTimer = setTimeout(() => {
      if (statusEl.title === msg) setStatus('');
    }, 6000);
  }
}

const btnStatusCloseEl = document.getElementById('btnStatusClose');
if (btnStatusCloseEl) btnStatusCloseEl.addEventListener('click', () => setStatus(''));

function showUnparseable(reason) {
  unparseableBox.style.display = 'block';
  unparseableReason.innerText = `⚠️ Unparseable Website: ${reason || 'Unsupported DOM or protected webview.'}`;
}

function hideUnparseable() {
  unparseableBox.style.display = 'none';
}

// ── Active-tab helper (the new launcher has no tab dropdown: option 1 = the
// focused tab of the current window, per spec). ───────────────────────────────
async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0].id : null;
}

// ── Effort -> vision model mirror of server.screen_vision.resolve_vision_model
// (same bands, same clamps; unit-tested server-side — kept identical here so
// the popup hint always agrees with the model the backend will actually use). ─
function clampEffortScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) return EFFORT_DEFAULT;
  return Math.min(1000, Math.max(1, Math.round(num)));
}

function effortModelInfo(score) {
  const s = clampEffortScore(score);
  if (s <= 333) return { tier: 'low', label: 'Gemini 3.1 Flash Lite', model: 'google/gemini-3.1-flash-lite' };
  if (s <= 666) return { tier: 'med', label: 'DeepSeek V4.1 Flash', model: 'deepseek/deepseek-v4.1-flash' };
  return { tier: 'high', label: 'Gemini 3.8 Flash', model: 'google/gemini-3.8-flash' };
}

async function persistAgentState(patch) {
  await chrome.storage.local.set(patch);
}

async function readAgentState() {
  return await chrome.storage.local.get([
    SEE_SCREEN_KEY, EXECUTE_KEY, MODE_KEY, EFFORT_KEY, MODEL_KEY, MODEL_TIER_KEY, EDUCATIONAL_MODE_KEY,
    JURISDICTION_KEY,
  ]);
}

const MODE_HINTS = {
  manual: 'Manual — the agent asks you before EVERY action it wants to take.',
  auto: 'Automatic — the agent acts on its own; you only get asked for risky actions (credentials, deletions/submits, downloads, leaving this site).',
  yolo: 'YOLO — the agent never asks, and nothing is off limits. It is your screen and your call.',
};

function applyModeToUI(mode) {
  const next = MODELS.includes(mode) ? mode : MODE_DEFAULT;
  modeBtns.forEach((b) => {
    const on = b.dataset.mode === next;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (modeHintEl) modeHintEl.innerText = MODE_HINTS[next] || '';
}

// Toggle choices the USER made in THIS popup session. applyAgentStateToUI /
// syncAgentSettingsFromServer must never overwrite them (a just-clicked toggle
// cannot be reverted by a later server sync or a stale storage snapshot —
// the user's own choice always wins on-screen; it is already persisted).
const localToggleChoices = new Map(); // toggleId -> value the user chose

function applyToggleValue(toggle, val) {
  if (!toggle) return;
  toggle.checked = !!val;
  toggle.setAttribute('aria-checked', val ? 'true' : 'false');
}

async function applyAgentStateToUI(st) {
  applyModeToUI(st[MODE_KEY] || MODE_DEFAULT);
  // One switch row per toggle: the row label is a single <label> wrapping the
  // input, so apply from storage/snapshot ONLY when the user hasn't touched
  // this toggle in the current session (their click already wrote storage).
  if (modelToggles.toggleSeeScreen) {
    const v = st[SEE_SCREEN_KEY] === undefined ? SEE_SCREEN_DEFAULT : st[SEE_SCREEN_KEY];
    if (!localToggleChoices.has('toggleSeeScreen')) applyToggleValue(modelToggles.toggleSeeScreen, v);
  }
  if (modelToggles.toggleExecute) {
    const v = st[EXECUTE_KEY] === undefined ? EXECUTE_DEFAULT : st[EXECUTE_KEY];
    if (!localToggleChoices.has('toggleExecute')) applyToggleValue(modelToggles.toggleExecute, v);
  }
  if (modelToggles.toggleEducationalMode) {
    const v = st[EDUCATIONAL_MODE_KEY] === undefined ? EDUCATIONAL_MODE_DEFAULT : st[EDUCATIONAL_MODE_KEY];
    if (!localToggleChoices.has('toggleEducationalMode')) applyToggleValue(modelToggles.toggleEducationalMode, v);
  }
  // Effort -> model line (mirror of the backend resolver).
  const score = clampEffortScore(st[EFFORT_KEY] === undefined ? EFFORT_DEFAULT : st[EFFORT_KEY]);
  const info = effortModelInfo(score);
  if (modelEffortEl) modelEffortEl.innerText = `effort ${score}`;
  if (effortScoreVal) effortScoreVal.innerText = `${score}`;
  if (effortScoreSlider) effortScoreSlider.value = score;
  if (modelNameEl) modelNameEl.innerText = info.label;
  if (modelTierEl) modelTierEl.innerText = `(${info.tier})`;
  syncInChatControls(st);
}

function syncInChatControls(st) {
  const see = st[SEE_SCREEN_KEY] === undefined ? SEE_SCREEN_DEFAULT : !!st[SEE_SCREEN_KEY];
  const exe = st[EXECUTE_KEY] === undefined ? EXECUTE_DEFAULT : !!st[EXECUTE_KEY];
  const edu = st[EDUCATIONAL_MODE_KEY] === undefined ? EDUCATIONAL_MODE_DEFAULT : !!st[EDUCATIONAL_MODE_KEY];
  const score = clampEffortScore(st[EFFORT_KEY] === undefined ? EFFORT_DEFAULT : st[EFFORT_KEY]);
  const info = effortModelInfo(score);

  if (chatToggleEdu) {
    chatToggleEdu.classList.toggle('active', edu);
    const lbl = chatToggleEdu.querySelector('.chip-title');
    if (lbl) lbl.textContent = edu ? 'Edu: ON' : 'Edu: OFF';
  }
  if (chatToggleSee) {
    chatToggleSee.classList.toggle('active', see);
    const lbl = chatToggleSee.querySelector('.chip-title');
    if (lbl) lbl.textContent = see ? 'Screen: ON' : 'Screen: OFF';
  }
  if (chatToggleExecute) {
    chatToggleExecute.classList.toggle('active', exe);
    const lbl = chatToggleExecute.querySelector('.chip-title');
    if (lbl) lbl.textContent = exe ? 'Study Mode: ON' : 'Study Mode: OFF';
  }
  if (chatEffortSlider) chatEffortSlider.value = score;
  if (chatEffortVal) chatEffortVal.textContent = score;
  if (chatModelBadge) chatModelBadge.textContent = info.label;
  // One-line digest shown on the collapsed config header, so a folded panel
  // still says what the agent is currently allowed to do.
  if (chatControlsSummary) {
    const mode = st[MODE_KEY] || MODE_DEFAULT;
    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
    chatControlsSummary.textContent = `${modeLabel} · screen ${see ? 'on' : 'off'} · study mode ${exe ? 'on' : 'off'}`;
  }
  // Needs a live tab count for the "all (N)" label, so it repaints itself
  // rather than reading from the snapshot this function was handed.
  refreshJurisdictionChip().catch(() => {});
}

// ── Backend settings sync (09-02): GET /api/user/settings -> ai.{effortScore,
// mode}; PATCH ai.mode when the user changes it in the popup. Offline /
// unauthenticated -> extension-local fallback (effort 500, mode manual).
async function authToken() {
  const { session_token, token } = await chrome.storage.local.get(['session_token', 'token']);
  return session_token || token || '';
}

async function syncAgentSettingsFromServer() {
  const { server, public_id } = await chrome.storage.local.get(['server', 'public_id']);
  const srv = (serverInput.value.trim() || server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  const t = await authToken();
  const st = await readAgentState();
  const haveLocalMode = st[MODE_KEY];
  if (!public_id || !t) {
    // Unauthenticated/offline: extension-local fallback.
    await persistAgentState({ [EFFORT_KEY]: EFFORT_DEFAULT, [MODEL_KEY]: effortModelInfo(EFFORT_DEFAULT).model, [MODEL_TIER_KEY]: effortModelInfo(EFFORT_DEFAULT).tier });
    effortFromServer = false;
    await applyAgentStateToUI(await readAgentState());
    return;
  }
  try {
    const res = await fetch(`${srv}/api/user/settings`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const settings = (data && data.settings) || {};
    const ai = settings.ai || {};
    const score = clampEffortScore(ai.effortScore === undefined ? EFFORT_DEFAULT : ai.effortScore);
    const info = effortModelInfo(score);
    const serverMode = MODELS.includes(ai.mode) ? ai.mode : MODE_DEFAULT;
    const hier = (ai && ai.hierarchy) || {};
    const extCfg = hier.extensions || {};
    let eduModeVal = st[EDUCATIONAL_MODE_KEY] !== undefined ? Boolean(st[EDUCATIONAL_MODE_KEY]) : EDUCATIONAL_MODE_DEFAULT;
    if (st[EDUCATIONAL_MODE_KEY] === undefined) {
      if (extCfg.mode === 'open' || settings.educationalMode === false) {
        eduModeVal = false;
      } else if (extCfg.mode === 'edu' || settings.educationalMode === true) {
        eduModeVal = true;
      }
    }

    effortFromServer = true;
    await persistAgentState({
      [EFFORT_KEY]: score,
      [MODEL_KEY]: info.model,
      [MODEL_TIER_KEY]: info.tier,
      // Never overwrite the educational-mode choice the user made in THIS
      // popup session: the server's extCfg.mode/educationalMode may be stale
      // (the PATCH below is still in flight), so the local choice wins.
      ...(localToggleChoices.has('toggleEducationalMode') ? {} : { [EDUCATIONAL_MODE_KEY]: eduModeVal }),
      // Server mode wins unless the user changed it locally just now
      // (pendingLocalMode guards the in-flight PATCH below).
      ...(pendingLocalMode ? {} : { [MODE_KEY]: serverMode }),
    });
    await applyAgentStateToUI(await readAgentState());
  } catch (e) {
    // Network/auth failure: keep whatever local state we had; surface fallback
    // with the ACTUAL saved local values (not assumed defaults).
    effortFromServer = false;
    const localScore = clampEffortScore(st[EFFORT_KEY] === undefined ? EFFORT_DEFAULT : st[EFFORT_KEY]);
    const localMode = MODELS.includes(st[MODE_KEY]) ? st[MODE_KEY] : MODE_DEFAULT;
    setStatus(`⚠️ Could not sync agent settings from the server (${String(e).slice(0, 60)}) — using saved local state (effort ${localScore}, mode ${localMode}).`);
  }
}

let pendingLocalMode = false;
async function setAgentMode(mode) {
  if (!MODELS.includes(mode)) return;
  await persistAgentState({ [MODE_KEY]: mode });
  applyModeToUI(mode);
  // Persist to the backend so the web app and the extension agree.
  const { server, public_id } = await chrome.storage.local.get(['server', 'public_id']);
  const srv = (serverInput.value.trim() || server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  const t = await authToken();
  if (!public_id || !t) {
    setStatus(`🔒 Mode set to ${mode} locally — sign in for it to sync with your account.`);
    return;
  }
  try {
    pendingLocalMode = true;
    const res = await fetch(`${srv}/api/user/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ ai: { mode } }),
    });
    if (res.ok) {
      setStatus(`✅ Permission mode saved to your account: ${mode}`);
    } else {
      const d = await res.json().catch(() => ({}));
      setStatus(`⚠️ Saved locally, but the account rejected it: ${d.detail || res.status}`);
    }
  } catch (e) {
    setStatus(`⚠️ Saved locally; could not reach the server (${String(e).slice(0, 60)}).`);
  } finally {
    pendingLocalMode = false;
  }
}

modeBtns.forEach((b) => {
  b.addEventListener('click', () => setAgentMode(b.dataset.mode));
});

// ONE handler per switch input, bound to the input's `change` event only.
// Each toggle lives in a single <label class="switch-row"> that wraps its own
// input (native label activation = exactly one toggle per click) — there is
// no container-level click delegation and no nested label anywhere, so a
// click on the row or the input flips the switch exactly once.
async function handleToggleChange(id, val) {
  const isEdu = id === 'toggleEducationalMode';
  const isSee = id === 'toggleSeeScreen';
  const key = isEdu ? EDUCATIONAL_MODE_KEY : isSee ? SEE_SCREEN_KEY : EXECUTE_KEY;
  const inputEl = modelToggles[id];
  if (inputEl) {
    inputEl.checked = val;
    inputEl.setAttribute('aria-checked', val ? 'true' : 'false');
  }
  // Record the user's own choice so sync/apply never reverts it this session.
  localToggleChoices.set(id, !!val);

  // Educational mode toggle -> syncs to local storage and backend settings
  if (isEdu) {
    await persistAgentState({ [key]: val });
    setStatus(val
      ? '🎓 Educational Mode: ON — standard study guidance active.'
      : '🔓 Educational Mode: OFF — open agent mode active (unrestrained by school-only rules).');

    const { server, public_id } = await chrome.storage.local.get(['server', 'public_id']);
    const srv = (serverInput.value.trim() || server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
    const t = await authToken();
    if (public_id && t) {
      fetch(`${srv}/api/user/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          educationalMode: val,
          ai: {
            hierarchy: {
              extensions: {
                mode: val ? 'edu' : 'open',
              },
            },
          },
        }),
      }).catch(() => {});
    }
    return;
  }

  await persistAgentState({ [key]: val });
  setStatus(val
    ? (id === 'toggleSeeScreen' ? '👁 See screen: ON — the agent receives the screen with each chat message.'
                                 : '✅ Study Mode: ON — the agent may act with permission mode.')
    : (id === 'toggleSeeScreen' ? 'See screen: OFF — chat messages carry no screen.'
                                 : 'Study Mode: OFF — the agent will only talk, never act.'));
}

Object.keys(modelToggles).forEach((id) => {
  const el = modelToggles[id];
  if (!el) return;
  el.addEventListener('change', () => {
    handleToggleChange(id, el.checked);
  });
});

if (chatToggleEdu) {
  chatToggleEdu.addEventListener('click', async () => {
    const st = await readAgentState();
    const cur = st[EDUCATIONAL_MODE_KEY] === undefined ? EDUCATIONAL_MODE_DEFAULT : !!st[EDUCATIONAL_MODE_KEY];
    await handleToggleChange('toggleEducationalMode', !cur);
    syncInChatControls(await readAgentState());
  });
}

if (chatToggleSee) {
  chatToggleSee.addEventListener('click', async () => {
    const st = await readAgentState();
    const cur = st[SEE_SCREEN_KEY] === undefined ? SEE_SCREEN_DEFAULT : !!st[SEE_SCREEN_KEY];
    await handleToggleChange('toggleSeeScreen', !cur);
    syncInChatControls(await readAgentState());
  });
}

if (chatToggleExecute) {
  chatToggleExecute.addEventListener('click', async () => {
    const st = await readAgentState();
    const cur = st[EXECUTE_KEY] === undefined ? EXECUTE_DEFAULT : !!st[EXECUTE_KEY];
    await handleToggleChange('toggleExecute', !cur);
    syncInChatControls(await readAgentState());
  });
}

// ── Collapsible study-settings block (above the chat session) ───────────────
// Folded state is remembered across popup opens so a user who prefers a bare
// chat keeps it that way. The collapsed header still shows the one-line digest
// (permission mode · screen · study mode) rendered by syncInChatControls.
async function applyChatControlsCollapsed(collapsed) {
  if (!chatControlsBar || !chatControlsToggle) return;
  chatControlsBar.classList.toggle('collapsed', !!collapsed);
  chatControlsToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}
if (chatControlsToggle) {
  chrome.storage.local.get([CHAT_CONTROLS_COLLAPSED_KEY])
    .then((st) => applyChatControlsCollapsed(st[CHAT_CONTROLS_COLLAPSED_KEY] === true))
    .catch(() => {});
  chatControlsToggle.addEventListener('click', async () => {
    const st = await chrome.storage.local.get([CHAT_CONTROLS_COLLAPSED_KEY]);
    const next = st[CHAT_CONTROLS_COLLAPSED_KEY] !== true;
    await applyChatControlsCollapsed(next);
    chrome.storage.local.set({ [CHAT_CONTROLS_COLLAPSED_KEY]: next }).catch(() => {});
  });
}

// ── Jurisdiction picker ──────────────────────────────────────────────────────
// The tab list is rebuilt every time the panel opens, never cached: tabs open
// and close constantly, and a stale row would let the user tick a tab that no
// longer exists.
async function renderJurisdictionPicker() {
  if (!tabJurisdictionList) return;
  const st = await readAgentState();
  const juris = normalizeJurisdiction(st[JURISDICTION_KEY]);
  const chosen = Array.isArray(juris) ? new Set(juris) : null;

  document.querySelectorAll('.juris-mode-btn').forEach((b) => {
    const on = (b.dataset.juris === 'all' && juris === 'all')
      || (b.dataset.juris === 'active' && juris === JURISDICTION_DEFAULT);
    b.classList.toggle('active', on);
  });

  const tabs = await listDriveableTabs();
  tabJurisdictionList.textContent = '';
  if (!tabs.length) {
    const p = document.createElement('div');
    p.className = 'juris-tab-empty';
    p.textContent = 'No driveable tabs open — chrome:// and extension pages cannot be driven.';
    tabJurisdictionList.appendChild(p);
    return;
  }
  for (const t of tabs) {
    const row = document.createElement('label');
    row.className = 'juris-tab-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.tabId = String(t.id);
    box.checked = juris === 'all' || (chosen ? chosen.has(t.id) : Boolean(t.active));
    const title = document.createElement('span');
    title.className = 'juris-tab-title';
    title.textContent = driveTabLabel(t);
    row.appendChild(box);
    row.appendChild(title);
    tabJurisdictionList.appendChild(row);
  }
}

// Ticking boxes always produces an explicit id list. "All open tabs" stays a
// LIVE rule instead — a tab opened after the choice is still inside it, which
// is what "all tabs it can see" has to mean.
async function saveJurisdictionFromChecks() {
  if (!tabJurisdictionList) return;
  const ids = Array.from(tabJurisdictionList.querySelectorAll('input[type=checkbox]'))
    .filter((b) => b.checked)
    .map((b) => Number(b.dataset.tabId))
    .filter((n) => Number.isInteger(n) && n > 0);
  await persistAgentState({ [JURISDICTION_KEY]: ids.length ? ids : JURISDICTION_DEFAULT });
  await refreshJurisdictionChip();
  document.querySelectorAll('.juris-mode-btn').forEach((b) => b.classList.remove('active'));
}

async function refreshJurisdictionChip() {
  if (!chatToggleTabs) return;
  const st = await readAgentState();
  const juris = normalizeJurisdiction(st[JURISDICTION_KEY]);
  let count = 0;
  if (juris === 'all') {
    try { count = (await listDriveableTabs()).length; } catch { count = 0; }
  }
  const lbl = chatToggleTabs.querySelector('.chip-title');
  if (lbl) lbl.textContent = jurisdictionChipLabel(juris, count);
  // The chip reads "active" only when the agent is looking past the one tab it
  // would have used anyway — otherwise the highlight means nothing.
  chatToggleTabs.classList.toggle('active', juris !== JURISDICTION_DEFAULT);
}

function setJurisdictionPanelOpen(open) {
  if (!tabJurisdictionPanel) return;
  tabJurisdictionPanel.hidden = !open;
  if (chatToggleTabs) chatToggleTabs.setAttribute('aria-expanded', open ? 'true' : 'false');
}

if (chatToggleTabs) {
  chatToggleTabs.addEventListener('click', async () => {
    const open = tabJurisdictionPanel && tabJurisdictionPanel.hidden;
    if (open) await renderJurisdictionPicker();
    setJurisdictionPanelOpen(open);
  });
}
if (btnCloseJurisdiction) {
  btnCloseJurisdiction.addEventListener('click', () => setJurisdictionPanelOpen(false));
}
if (tabJurisdictionList) {
  tabJurisdictionList.addEventListener('change', (e) => {
    if (e.target && e.target.type === 'checkbox') saveJurisdictionFromChecks();
  });
}
document.querySelectorAll('.juris-mode-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const val = btn.dataset.juris === 'all' ? 'all' : JURISDICTION_DEFAULT;
    await persistAgentState({ [JURISDICTION_KEY]: val });
    await renderJurisdictionPicker();
    await refreshJurisdictionChip();
  });
});

if (chatQuickPause) {
  chatQuickPause.addEventListener('click', () => {
    pauseAgentAction();
  });
}

if (chatEffortSlider) {
  chatEffortSlider.addEventListener('input', () => {
    const val = clampEffortScore(chatEffortSlider.value);
    if (chatEffortVal) chatEffortVal.innerText = `${val}`;
    if (effortScoreSlider) effortScoreSlider.value = val;
    if (effortScoreVal) effortScoreVal.innerText = `${val}`;
    const info = effortModelInfo(val);
    if (modelEffortEl) modelEffortEl.innerText = `effort ${val}`;
    if (modelNameEl) modelNameEl.innerText = info.label;
    if (chatModelIndicator) chatModelIndicator.innerText = info.label;
    if (chatModelBadge) chatModelBadge.innerText = info.label;
    if (modelTierEl) modelTierEl.innerText = `(${info.tier})`;
  });

  chatEffortSlider.addEventListener('change', async () => {
    const val = clampEffortScore(chatEffortSlider.value);
    const info = effortModelInfo(val);
    await persistAgentState({
      [EFFORT_KEY]: val,
      [MODEL_KEY]: info.model,
      [MODEL_TIER_KEY]: info.tier,
    });
    setStatus(`⚡ Effort score set to ${val} (${info.label}).`);
    syncInChatControls(await readAgentState());

    clearTimeout(effortPatchDebounceTimer);
    effortPatchDebounceTimer = setTimeout(async () => {
      const { server, public_id } = await chrome.storage.local.get(['server', 'public_id']);
      const srv = (serverInput.value.trim() || server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
      const t = await authToken();
      if (public_id && t) {
        fetch(`${srv}/api/user/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ ai: { effortScore: val } }),
        }).catch(() => {});
      }
    }, 400);
  });
}

// Effort score slider interactive updates
if (effortScoreSlider) {
  effortScoreSlider.addEventListener('input', () => {
    const val = clampEffortScore(effortScoreSlider.value);
    if (effortScoreVal) effortScoreVal.innerText = `${val}`;
    const info = effortModelInfo(val);
    if (modelEffortEl) modelEffortEl.innerText = `effort ${val}`;
    if (modelNameEl) modelNameEl.innerText = info.label;
    if (chatModelIndicator) chatModelIndicator.innerText = info.label;
    if (modelTierEl) modelTierEl.innerText = `(${info.tier})`;
  });

  effortScoreSlider.addEventListener('change', async () => {
    const val = clampEffortScore(effortScoreSlider.value);
    const info = effortModelInfo(val);
    await persistAgentState({
      [EFFORT_KEY]: val,
      [MODEL_KEY]: info.model,
      [MODEL_TIER_KEY]: info.tier,
    });
    setStatus(`⚡ Effort score set to ${val} (${info.label}).`);

    clearTimeout(effortPatchDebounceTimer);
    effortPatchDebounceTimer = setTimeout(async () => {
      const { server, public_id } = await chrome.storage.local.get(['server', 'public_id']);
      const srv = (serverInput.value.trim() || server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
      const t = await authToken();
      if (public_id && t) {
        fetch(`${srv}/api/user/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ ai: { effortScore: val } }),
        }).catch(() => {});
      }
    }, 300);
  });
}

// ── Approval inbox (09-02): the open popup is the approval surface. We signal
// popup-alive with a runtime Port (MV3 service workers can't see the popup
// any other way); incoming APPROVAL_PROMPT renders the shared card —
// #approvalApprove / #approvalReject / #approvalNeutral / #approvalApproveAuto
// answer APPROVAL_RESPONSE. Prompts queue: one card at a time.
const POPUP_PORT_NAME = 'helpotron-popup';
const pendingApprovals = []; // [{reqId, title, summary, viaServer?, onDecision?}]
// Set by "Approve + always" on a screen-control card: stops manual mode
// re-asking for every keystroke inside one popup session. Deliberately not
// persisted — a fresh session asks again.
let screenControlSessionAllowed = false;
let approvalPort = null;
const APPROVAL_HELPER_DEFAULT = 'Approve = let it act · Reject = stop it · Neutral = don’t do it, just send your note.';
const APPROVAL_NEUTRAL_HINT = 'Say something first — Neutral needs your note';
let approvalHelperTimer = null;

function renderNextApproval() {
  const card = document.getElementById('approvalCard');
  const titleEl = document.getElementById('approvalTitle');
  const textEl = document.getElementById('approvalText');
  if (!card || !titleEl || !textEl) return;
  const item = pendingApprovals[0];
  if (!item) {
    card.style.display = 'none';
    syncApprovalDock();
    return;
  }
  titleEl.innerText = item.title;
  textEl.innerText = item.summary;
  // Fresh prompt: reset the answer state (input note + previous status line).
  const input = document.getElementById('approvalInput');
  const statusLine = document.getElementById('approvalStatus');
  const helper = document.getElementById('approvalHelper');
  if (input) {
    input.value = '';
    input.setAttribute('aria-invalid', 'false');
  }
  if (statusLine) statusLine.hidden = true;
  if (helper) {
    helper.classList.remove('a-helper--warn');
    helper.textContent = APPROVAL_HELPER_DEFAULT;
  }
  // The card is a fixed dock (see .approval-dock), so it is reachable from
  // every view. It used to be a child of the Agent Controls accordion inside
  // #viewLauncher, so an approval raised while the user was on the Study Buddy
  // tab rendered into a display:none subtree and was never seen — even though
  // the status line underneath said it was waiting.
  card.style.display = 'block';
  syncApprovalDock();
}

// The dock holds the card AND the answered-status line. It stays up while
// either is showing, and hides only when both are empty.
function syncApprovalDock() {
  const dock = document.getElementById('approvalDock');
  if (!dock) return;
  const card = document.getElementById('approvalCard');
  const statusLine = document.getElementById('approvalStatus');
  const cardUp = !!card && card.style.display !== 'none';
  const statusUp = !!statusLine && !statusLine.hidden;
  dock.hidden = !(cardUp || statusUp);
}

// Shared answer path: decision is 'allow' | 'deny' | 'neutral' (or the legacy
// boolean from answerApproval(reqId, true|false) callers), note is the optional
// typed text ('' fine for allow/deny — REQUIRED for neutral), opts carries
// {autoAdd} for the Approve + auto-add button.
function answerApproval(reqId, decision, note, opts) {
  const d = (decision === 'allow' || decision === 'deny' || decision === 'neutral')
    ? decision
    : (decision ? 'allow' : 'deny'); // legacy boolean stays supported
  const text = String(note || '').trim();
  const autoAdd = Boolean(opts && opts.autoAdd);
  const ix = pendingApprovals.findIndex((p) => p.reqId === reqId);
  const viaServer = ix >= 0 ? Boolean(pendingApprovals[ix].viaServer) : false;
  const onDecision = ix >= 0 ? pendingApprovals[ix].onDecision : null;
  if (ix >= 0) {
    pendingApprovals.splice(ix, 1);
  }
  // Local prompts (screen control in manual mode, 09-08). The actions are
  // already in hand on this side — there is nothing to resume server-side, so
  // the card just gates the dispatch. Nothing runs unless the user says allow.
  if (typeof onDecision === 'function') {
    Promise.resolve(onDecision(d, text, { autoAdd })).catch(() => {});
    showApprovalStatus(d === 'allow'
      ? (autoAdd ? '✅ Allowed — won’t ask again this session.' : '✅ Allowed the agent action.')
      : d === 'deny' ? '⛔ Rejected — nothing ran on your screen.'
      : '⚪ Neutral — nothing ran; the agent got your note.');
    renderNextApproval();
    return;
  }
  // Server-channel prompts (the /api/extension/agent_chat permission gate)
  // answer straight to /api/extension/approval/respond; broker prompts keep
  // the runtime-message settle path below.
  if (viaServer) {
    chrome.storage.local.get(['server', 'session_token', 'token'])
      .then(async (st) => {
        const srv = (st.server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
        const t = st.session_token || st.token || '';
        try {
          const res = await fetch(`${srv}/api/extension/approval/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify({
              req_id: reqId,
              decision: d,
              ...(text ? { text } : {}),
              auto_add: autoAdd,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showApprovalStatus(`⚠️ Could not send your decision (HTTP ${res.status}${data.detail ? ' — ' + data.detail : ''})`);
          } else if (d === 'deny') {
            showApprovalStatus('⛔ Rejected the agent action.');
          } else if (d === 'neutral') {
            showApprovalStatus('⚪ Neutral — the agent got your note.');
          } else if (autoAdd) {
            showApprovalStatus('✅ Allowed — added to auto-approved actions.');
          } else {
            showApprovalStatus('✅ Allowed the agent action.');
          }
          // If the executed action produced further drive actions, run them.
          const next = data && data.execution_result && Array.isArray(data.execution_result.control_actions)
            ? data.execution_result.control_actions
            : (Array.isArray(data && data.control_actions) ? data.control_actions : null);
          if (next && next.length) {
            setStatus(`Executing ${next.length} action(s) after approval…`);
            await executeReturnedActions(next).catch(() => {});
          }
        } catch (err) {
          showApprovalStatus(`⚠️ Could not reach the server: ${String(err).slice(0, 90)}`);
        }
        renderNextApproval();
      })
      .catch(() => {});
    return;
  }
  const msg = { act: 'APPROVAL_RESPONSE', reqId, decision: d };
  if (text) msg.text = text; // optional for allow/deny; neutral is gated before this call
  if (autoAdd) msg.autoAdd = true;
  chrome.runtime.sendMessage(msg).catch(() => {});
  showApprovalStatus(d === 'allow'
    ? (autoAdd ? '✅ Allowed the agent action — added to auto-approved actions.'
               : '✅ Allowed the agent action.')
    : d === 'deny' ? '⛔ Rejected the agent action.'
    : '⚪ Neutral — the agent got your note.');
  renderNextApproval();
}

let approvalStatusTimer = null;
function showApprovalStatus(text) {
  const card = document.getElementById('approvalCard');
  const statusLine = document.getElementById('approvalStatus');
  if (card) card.style.display = 'none';
  if (statusLine) {
    statusLine.innerText = text;
    statusLine.hidden = false;
  }
  syncApprovalDock();
  clearTimeout(approvalStatusTimer);
  approvalStatusTimer = setTimeout(() => {
    if (statusLine) statusLine.hidden = true;
    syncApprovalDock();
  }, 4500);
}

// Neutral REQUIRES a note: an empty Neutral click must not send — flag the
// input, explain inline, and only send once text is present (trimmed non-empty).
function answerFromButton(decision, opts) {
  const p = pendingApprovals[0];
  if (!p) return;
  const input = document.getElementById('approvalInput');
  const helper = document.getElementById('approvalHelper');
  const text = input ? String(input.value || '') : '';
  if (decision === 'neutral' && !text.trim()) {
    if (input) {
      input.focus();
      input.setAttribute('aria-invalid', 'true');
    }
    if (helper) {
      helper.classList.add('a-helper--warn');
      helper.textContent = APPROVAL_NEUTRAL_HINT;
      clearTimeout(approvalHelperTimer);
      approvalHelperTimer = setTimeout(() => {
        helper.classList.remove('a-helper--warn');
        helper.textContent = APPROVAL_HELPER_DEFAULT;
      }, 3500);
    }
    return;
  }
  answerApproval(p.reqId, decision, text, opts);
}

const approvalButtons = [
  ['approvalApprove', 'allow', null],
  ['approvalReject', 'deny', null],
  ['approvalNeutral', 'neutral', null],
  ['approvalApproveAuto', 'allow', { autoAdd: true }],
];
for (const [id, decision, opts] of approvalButtons) {
  const el = document.getElementById(id);
  if (!el) continue; // surface without the shared card (e.g. agent_mode shell)
  el.addEventListener('click', () => answerFromButton(decision, opts));
}

// ── General popup paint & behavior ───────────────────────────────────────────
// ── What's new: release notifications (09-03) ────────────────────────────────
// The server remembers every extension release (auto-synced from manifest.json);
// unread ones render here as a notification and are acked per user on "Got it"
// (server-side receipt when signed in + local sentinel as an offline fallback).
const WHATSNEW_SEEN_KEY = 'whatsnew_last_seen_version';

function versionLessEq(a, b) {
  const pa = String(a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  }
  return true;
}

async function loadWhatsNew() {
  const banner = document.getElementById('whatsNewBanner');
  const body = document.getElementById('whatsNewBody');
  if (!banner || !body) return;
  const srv = (serverInput.value.trim() || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  const st = await chrome.storage.local.get(['session_token', 'token', WHATSNEW_SEEN_KEY]);
  const cred = st.session_token || st.token;
  let releases = [];
  try {
    const res = await fetch(`${srv}/api/extension/releases`, {
      headers: cred ? { Authorization: `Bearer ${cred}` } : {},
    });
    if (res.ok) releases = (await res.json()).releases || [];
  } catch { /* fall through to the /version fallback below */ }

  // Fallback: the public /api/extension/version endpoint always carries the
  // latest release's notes (2.7.0 included) even when the releases feed is
  // empty or the caller is anonymous — the banner must never silently die.
  if (!releases.length) {
    try {
      const verRes = await fetch(`${srv}/api/extension/version`);
      if (verRes.ok) {
        const ver = await verRes.json();
        if (ver && ver.latest_version) {
          releases = [{
            id: null, // no server-side read receipt for the synthesized row
            version: ver.latest_version,
            title: 'Update installed',
            notes: Array.isArray(ver.release_notes) ? ver.release_notes.join('\n') : String(ver.release_notes || ''),
            is_major: !!ver.is_critical_update,
            read: false,
          }];
        }
      }
    } catch { /* server unreachable — banner stays hidden */ }
  }
  if (!releases.length) return;

  const myVer = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '0.0.0';
  const seenLocal = st[WHATSNEW_SEEN_KEY] || '0.0.0';
  const unread = releases.filter(
    (r) => versionLessEq(r.version, myVer) && !r.read && !versionLessEq(r.version, seenLocal)
  );
  if (!unread.length) return;

  banner.style.display = 'block';
  body.innerHTML = '';
  // Headline only; the notes live behind "Details" so the banner costs one row
  // instead of a third of the popup.
  const headline = document.getElementById('whatsNewHeadline');
  if (headline) {
    const top = unread[0];
    headline.textContent = unread.length === 1
      ? `v${top.version} — ${top.title || 'Update installed'}`
      : `v${top.version} and ${unread.length - 1} more update${unread.length === 2 ? '' : 's'}`;
    headline.title = headline.textContent;
  }
  // Newest first; "…and N more" so catch-up stays honest without a scroll wall.
  const shown = unread.slice(0, 4);
  const more = unread.length - shown.length;
  shown.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'whatsnew-item';
    const badge = document.createElement('span');
    badge.className = r.is_major ? 'whatsnew-badge whatsnew-badge--major' : 'whatsnew-badge';
    badge.textContent = r.is_major ? `v${r.version} · MAJOR` : `v${r.version}`;
    const title = document.createElement('div');
    title.className = 'whatsnew-title';
    title.textContent = r.title || `Helpotron Extension v${r.version}`;
    card.appendChild(badge);
    card.appendChild(title);
    if (r.notes) {
      const notes = document.createElement('div');
      notes.className = 'whatsnew-notes';
      notes.innerText = r.notes;
      card.appendChild(notes);
    }
    body.appendChild(card);
  });
  if (more > 0) {
    const moreEl = document.createElement('div');
    moreEl.className = 'whatsnew-more';
    moreEl.innerText = `…and ${more} more update${more === 1 ? '' : 's'} — sign in to see them all`;
    body.appendChild(moreEl);
  }

  const expandBtn = document.getElementById('btnWhatsNewExpand');
  const expandLabel = document.getElementById('whatsNewExpandLabel');
  if (expandBtn) {
    expandBtn.onclick = () => {
      const open = expandBtn.getAttribute('aria-expanded') === 'true';
      expandBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.hidden = open;
      if (expandLabel) expandLabel.textContent = open ? 'Details' : 'Hide';
    };
  }

  document.getElementById('btnWhatsNewDismiss').onclick = async () => {
    banner.style.display = 'none';
    await chrome.storage.local.set({ [WHATSNEW_SEEN_KEY]: unread[0].version });
    if (cred) {
      for (const r of unread) {
        if (typeof r.id !== 'number') continue; // synthesized /version row has no receipt
        await fetch(`${srv}/api/extension/releases/${r.id}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cred}` },
        }).catch(() => {});
      }
    }
  };
}

async function init() {
  // ONE batched storage read — everything paints from these snapshots.
  const st = await chrome.storage.local.get([
    'server', 'public_id', 'token', 'session_token',
    'update_available', 'latest_version', CRAWL_CACHE_KEY,
    SEE_SCREEN_KEY, EXECUTE_KEY, MODE_KEY, EFFORT_KEY, MODEL_KEY, MODEL_TIER_KEY, EDUCATIONAL_MODE_KEY,
    JURISDICTION_KEY,
  ]);
  serverInput.value = st.server || 'https://helpotron.dpdns.org';
  publicIdInput.value = st.public_id || '';
  publicIdInput.placeholder = 'your Helpotron username';
  const loggedIn = !!(st.public_id && (st.token || st.session_token));

  const accountChip = document.getElementById('accountChip');
  if (accountChip) {
    const label = accountChip.querySelector('span');
    if (label) label.textContent = (st.public_id && st.public_id !== 'Guest') ? `@${st.public_id}` : 'Guest';
  }
  if (!loggedIn) {
    setStatus('⚠️ Sign in to sync — tap the account chip above.');
  }

  // CHAT options: instant paint from local state, then server sync after paint.
  await applyAgentStateToUI(st);



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
      const srv = serverInput.value.trim() || 'https://helpotron.dpdns.org';
      chrome.tabs.create({ url: `${srv}/api/extension/download` });
    });
  }

  // Instant paint: last-known crawl progress + results.
  if (st[CRAWL_CACHE_KEY]) renderCrawlStatus(st[CRAWL_CACHE_KEY]);

  // Deferred past first paint: crawl re-poll + backend agent-settings sync + release notifications.
  requestAnimationFrame(() => {
    pollCrawlStatus();
    syncAgentSettingsFromServer();
    loadWhatsNew();
  });
}

// ── Scrape option 1: current thing only (focused tab) ────────────────────────
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
    const keys = Object.keys(all);
    if (keys.length > 40) delete all[keys[0]];
    await chrome.storage.local.set({ [LAST_SCRAPE_KEY]: all });
  } catch { /* storage best-effort */ }
}

function showOpenAssignment(assignmentId) {
  if (!assignmentId) return;
  openAssignmentBtn.style.display = 'block';
  openAssignmentBtn.innerText = `📖 Open bubble #${assignmentId} in Helpotron`;
  openAssignmentBtn.dataset.assignmentId = String(assignmentId);
}

openAssignmentBtn?.addEventListener('click', () => {
  const id = openAssignmentBtn.dataset.assignmentId;
  if (!id) return;
  const srv = (serverInput.value.trim() || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  chrome.tabs.create({ url: `${srv}/#assignment=${id}` });
  setStatus(`📖 Opening bubble #${id} in Helpotron…`);
});

document.getElementById('btnScrapeCurrent')?.addEventListener('click', async () => {
  hideUnparseable();
  openAssignmentBtn.style.display = 'none';
  const tabId = await activeTabId();
  if (!tabId) { setStatus('❌ No focused tab to scrape.'); return; }
  setStatus('🔍 Reading the focused tab (waiting for load, expanding content, hashing files)…');
  const resp = await chrome.runtime.sendMessage({ action: 'startScrape', tabId }).catch((e) => ({ ok: false, error: String(e) }));
  if (resp?.ok) {
    const bits = [];
    if (resp.promptLen) bits.push(`${resp.promptLen} chars of content`);
    if (resp.filesFound) bits.push(`${resp.filesFound} files found (${resp.filesUploaded || 0} uploaded to dump, ${resp.filesRecorded || 0} URL+hash saved)`);
    const detail = bits.length ? ` — ${bits.join(', ')}` : '';
    setStatus(`✅ Saved to Helpotron: ${resp.title}${detail} — bubble #${resp.assignment_id}`);
    await rememberScrape(tabId, resp);
    showOpenAssignment(resp.assignment_id);
  } else if (resp?.unparseable) {
    setStatus('❌ Nothing could be collected — no content and no files found.');
    showUnparseable(resp.error);
  } else {
    setStatus(`❌ ${resp?.error || 'Extraction failed'}`);
  }
});

// ── Scrape option 2: everything on the tab (site crawl, results revealed) ────
const btnStartCrawl = document.getElementById('btnScrapeSite');
const btnStopCrawl = document.getElementById('stopCrawl');
const crawlProgressEl = document.getElementById('crawlProgress');
const crawlResultsWrap = document.getElementById('crawlResultsWrap');
const crawlResultsEl = document.getElementById('crawlResults');
let crawlPollTimer = null;

function renderCrawlResults(results) {
  if (!crawlResultsEl) return;
  crawlResultsEl.innerHTML = '';
  const list = Array.isArray(results) ? results : [];
  if (list.length === 0) {
    crawlResultsWrap.style.display = 'none';
    return;
  }
  crawlResultsWrap.style.display = 'flex';
  list.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'crawl-result-row';
    const title = document.createElement('div');
    title.className = 'r-title';
    title.innerText = String(r.title || r.url || 'page');
    const meta = document.createElement('div');
    meta.className = 'r-meta';
    if (r.status === 'saved') {
      const ok = document.createElement('span');
      ok.className = 'r-ok';
      ok.innerText = `✓ saved #${r.assignment_id || '?'}`;
      meta.appendChild(ok);
      if (r.promptLen) {
        const p = document.createElement('span');
        p.innerText = `${r.promptLen} chars`;
        meta.appendChild(p);
      }
      const f = r.files || {};
      if (f.found) {
        const fl = document.createElement('span');
        fl.innerText = `${f.found} files (${f.uploaded || 0}↑)`;
        meta.appendChild(fl);
      }
    } else if (r.status === 'unparseable') {
      const u = document.createElement('span');
      u.className = 'r-fail';
      u.innerText = '✗ unparseable';
      meta.appendChild(u);
    } else {
      const f = document.createElement('span');
      f.className = 'r-fail';
      f.innerText = `✗ ${r.error || 'failed'}`;
      meta.appendChild(f);
    }
    row.appendChild(title);
    row.appendChild(meta);
    crawlResultsEl.appendChild(row);
  });
}

function renderCrawlStatus(s) {
  if (!s || !s.phase || s.phase === 'idle') {
    btnStartCrawl.style.display = '';
    btnStopCrawl.style.display = 'none';
    crawlProgressEl.style.display = 'none';
    crawlResultsWrap.style.display = crawlResultsEl.children.length ? 'flex' : 'none';
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
  renderCrawlResults(s.results);
}

async function pollCrawlStatus() {
  const resp = await chrome.runtime.sendMessage({ action: 'crawlStatus' }).catch(() => null);
  const state = resp && resp.ok ? resp : { phase: 'idle' };
  renderCrawlStatus(state);
  if (state.phase && state.phase !== 'idle') {
    chrome.storage.local.set({ [CRAWL_CACHE_KEY]: state }).catch(() => {});
  }
  if (state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'stopped' && state.phase !== 'failed') {
    crawlPollTimer = setTimeout(pollCrawlStatus, 2000);
  } else {
    crawlPollTimer = null;
  }
}

btnStartCrawl?.addEventListener('click', async () => {
  hideUnparseable();
  const tabId = await activeTabId();
  if (!tabId) { setStatus('❌ No focused tab to crawl.'); return; }
  setStatus('🌐 Scanning the tab site links & index pages… (robots-respecting)');
  const resp = await chrome.runtime.sendMessage({ action: 'startCrawl', tabId }).catch((e) => ({ ok: false, error: String(e) }));
  if (resp?.ok) {
    setStatus(`🌐 Queued ${resp.total} pages of ${resp.scope} — scraping slowly; the Status line shows page-by-page results. You can close the popup.`);
    pollCrawlStatus();
  } else {
    setStatus(`❌ ${resp?.error || 'Failed to start site crawl'}`);
  }
});

btnStopCrawl?.addEventListener('click', async () => {
  setStatus('⏹ Stopping site crawl…');
  const resp = await chrome.runtime.sendMessage({ action: 'stopCrawl' });
  setStatus(resp?.ok ? '⏹ Crawl stopped.' : `❌ ${resp?.error || 'No crawl running'}`);
  pollCrawlStatus();
});

btnOpenDataLake?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openDataLake' });
});

// ── Login (account chip -> panel) ─────────────────────────────────────────────
document.getElementById('accountChip')?.addEventListener('click', () => {
  const panel = document.getElementById('loginPanel');
  const chip = document.getElementById('accountChip');
  if (!panel || !chip) return;
  const open = panel.hidden;
  panel.hidden = !open;
  chip.setAttribute('aria-expanded', open ? 'true' : 'false');
});

// Show/hide the password. Typing a long passphrase blind into a 320px popup is
// how sign-ins fail twice and get abandoned; the field goes back to hidden when
// the panel closes so a shoulder-surfable password is never left on screen.
(() => {
  const input = document.getElementById('password');
  const btn = document.getElementById('togglePassword');
  if (!input || !btn) return;
  const icon = btn.querySelector('use');

  const paint = (shown) => {
    input.type = shown ? 'text' : 'password';
    btn.setAttribute('aria-pressed', shown ? 'true' : 'false');
    const label = shown ? 'Hide password' : 'Show password';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    icon?.setAttribute('href', shown ? '#i-eye-off' : '#i-eye');
  };

  btn.addEventListener('click', () => {
    const shown = input.type === 'password';
    paint(shown);
    // Focus back in the field with the caret at the end — the toggle is a
    // detour in the middle of typing, not the end of it.
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* not supported on this type */ }
  });

  document.getElementById('accountChip')?.addEventListener('click', () => {
    if (document.getElementById('loginPanel')?.hidden) paint(false);
  });
})();

document.getElementById('saveSettings')?.addEventListener('click', async () => {
  const srv = serverInput.value.trim() || 'https://helpotron.dpdns.org';
  const pid = publicIdInput.value.trim();
  const pwd = document.getElementById('password')?.value;

  // Captcha-present servers can't be logged into from MV3 (remote scripts
  // banned) — validate any synced web session, else route to the website.
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
          syncAgentSettingsFromServer();
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
      // A gateway that cannot reach the API answers 5xx with an EMPTY body, so
      // res.json() throws and the catch below reports "Connection error:
      // SyntaxError: Unexpected end of JSON input" — which names neither the
      // status nor the host. Parse defensively and report what really came back.
      let data = {};
      try { data = JSON.parse(await res.text()) || {}; } catch { data = {}; }
      if (!res.ok && !data.detail && !data.message) {
        setStatus(`❌ Server error ${res.status} from ${srv} — that address answered but is not serving the Helpotron API. Check the SERVER field.`);
        return;
      }
      if (res.ok && data.token) {
        await chrome.storage.local.set({
          server: srv,
          public_id: data.public_id || pid,
          token: data.token,
          session_token: data.session_token || '',
        });
        setStatus('✅ Logged in & token saved');
        syncAgentSettingsFromServer();
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

  await chrome.storage.local.set({ server: srv, public_id: pid });
  setStatus('✅ Settings saved');
});

// Live-sync: after a website handoff (captcha login) the popup re-reads
// identity + agent settings without a manual reopen.
if (chrome && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.public_id || changes.session_token || changes.token)) {
      init();
    }
  });
}

// ── Launcher shell: two option cards, sub-options revealed under each ────────
(function initShell() {
  document.querySelectorAll('.option-card').forEach((card) => {
    const panelId = card.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    const toggle = () => {
      const open = card.getAttribute('aria-expanded') === 'true';
      card.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (panel) panel.hidden = open;
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  const optsBtn = document.getElementById('btnOptions');
  if (optsBtn) {
    optsBtn.addEventListener('click', () => {
      switchView('settings');
    });
  }

  // View Navigation Tabs
  const navTabs = {
    launcher: document.getElementById('tabNavLauncher'),
    chat: document.getElementById('tabNavChat'),
    type: document.getElementById('tabNavType'),
    settings: document.getElementById('tabNavSettings'),
  };
  const viewPanels = {
    launcher: document.getElementById('viewLauncher'),
    chat: document.getElementById('viewChat'),
    type: document.getElementById('viewType'),
    settings: document.getElementById('viewSettings'),
  };

  function switchView(viewName) {
    Object.keys(navTabs).forEach((key) => {
      const tab = navTabs[key];
      const panel = viewPanels[key];
      const active = key === viewName;
      if (tab) {
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      if (panel) {
        panel.classList.toggle('hidden', !active);
      }
    });

    if (viewName === 'chat') {
      fetchChatThreads();
      loadPopupChatHistory();
      const input = document.getElementById('popupChatInput');
      if (input) setTimeout(() => input.focus(), 80);
    } else if (viewName === 'type') {
      loadAssignmentsForLaunch();
      detectDocTabs();
      loadLaunchConfig();
    } else if (viewName === 'settings') {
      refreshSettingsView();
    }
  }

  if (navTabs.launcher) navTabs.launcher.addEventListener('click', () => switchView('launcher'));
  if (navTabs.chat) navTabs.chat.addEventListener('click', () => switchView('chat'));
  if (navTabs.type) navTabs.type.addEventListener('click', () => switchView('type'));
  if (navTabs.settings) navTabs.settings.addEventListener('click', () => switchView('settings'));

  const agentBtn = document.getElementById('btnAgentMode');
  const openChatBtn = document.getElementById('btnOpenChat');
  if (agentBtn) agentBtn.addEventListener('click', () => switchView('chat'));
  if (openChatBtn) openChatBtn.addEventListener('click', () => switchView('chat'));

  const btnFullAgentTab = document.getElementById('btnFullAgentTab');
  if (btnFullAgentTab) {
    btnFullAgentTab.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('agent_mode.html') });
    });
  }

  const chip = document.getElementById('accountChip');
  if (chip) {
    chrome.storage.local.get('public_id', (stCache) => {
      const label = chip.querySelector('span');
      if (!label) return;
      const pid = (stCache.public_id || '').trim();
      label.textContent = (pid && pid !== 'Guest') ? `@${pid}` : 'Guest';
    });
  }

  // Embedded Settings Controls
  function refreshSettingsView() {
    chrome.storage.local.get(['public_id', 'session_token', 'token'], (st) => {
      const pid = (st.public_id || '').trim();
      const connected = !!(pid && (st.session_token || st.token));
      const nameEl = document.getElementById('settingsAccountName');
      const statusEl = document.getElementById('settingsAccountStatus');
      const avatarEl = document.getElementById('settingsAvatar');
      const btnAuth = document.getElementById('btnOpenWebAuth');

      if (nameEl) nameEl.textContent = connected ? `@${pid}` : 'Guest';
      if (statusEl) statusEl.textContent = connected ? 'Active session connected' : 'Sign in to sync your scrapes & chat';
      if (avatarEl) avatarEl.textContent = (pid ? pid[0] : 'S').toUpperCase();
      if (btnAuth) btnAuth.textContent = connected ? 'Connected' : 'Sign in';
    });

    const storageArea = (chrome && chrome.storage && chrome.storage.sync) || (chrome && chrome.storage && chrome.storage.local);
    if (storageArea) {
      storageArea.get(['ext_theme', 'ext_accent'], (st) => {
        const safeSt = st || {};
        const currentTheme = safeSt.ext_theme || 'dark';
        const currentAccent = safeSt.ext_accent || 'teal';
        document.querySelectorAll('#popupThemeSeg [data-theme-pick]').forEach((b) => {
          b.classList.toggle('selected', b.dataset.themePick === currentTheme);
        });
        document.querySelectorAll('#viewSettings [data-accent]').forEach((b) => {
          b.classList.toggle('selected', b.dataset.accent === currentAccent);
        });
      });
    }
  }

  document.querySelectorAll('#popupThemeSeg [data-theme-pick]').forEach((b) => {
    b.addEventListener('click', () => {
      const theme = b.dataset.themePick;
      const sArea = (chrome && chrome.storage && chrome.storage.sync) || (chrome && chrome.storage && chrome.storage.local);
      if (sArea) sArea.set({ ext_theme: theme });
      document.querySelectorAll('#popupThemeSeg [data-theme-pick]').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.themePick === theme);
      });
    });
  });

  document.querySelectorAll('#viewSettings [data-accent]').forEach((b) => {
    b.addEventListener('click', () => {
      const accent = b.dataset.accent;
      const sArea = (chrome && chrome.storage && chrome.storage.sync) || (chrome && chrome.storage && chrome.storage.local);
      if (sArea) sArea.set({ ext_accent: accent });
      document.querySelectorAll('#viewSettings [data-accent]').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.accent === accent);
      });
    });
  });

  const btnOpenWebAuth = document.getElementById('btnOpenWebAuth');
  if (btnOpenWebAuth) {
    btnOpenWebAuth.addEventListener('click', async () => {
      const { server } = await chrome.storage.local.get('server');
      const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
      chrome.tabs.create({ url: srv });
    });
  }

  const btnOpenFullOptionsTab = document.getElementById('btnOpenFullOptionsTab');
  if (btnOpenFullOptionsTab) {
    btnOpenFullOptionsTab.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    });
  }
})();

// ── Embedded Agent Chat Controller ──────────────────────────────────────────
const CHAT_KEY = 'helpotron_chat';
const chatMessagesEl = document.getElementById('popupChatMessages');
const chatInputEl = document.getElementById('popupChatInput');
const chatFormEl = document.getElementById('popupChatForm');
const chatTokenBanner = document.getElementById('chatTokenBanner');
const chatTokenMsg = document.getElementById('chatTokenMsg');
const btnRefreshChat = document.getElementById('btnRefreshChat');
let chatBusy = false;

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

// Server-rendered HTML injection (thin-wrapper, 2026-09-14). The server's
// /api/extension/render turns markdown+LaTeX into HTML; the client no longer
// ships a KaTeX bundle or a markdown/math renderer. sanitizeHtml is defensive:
// the server renderer already escapes raw HTML, but strip <script> and inline
// event handlers anyway so injected content can never execute.
function sanitizeHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = String(html);
  div.querySelectorAll('script, iframe, object, embed, link, meta, style').forEach((n) => n.remove());
  div.querySelectorAll('*').forEach((n) => {
    for (const attr of Array.from(n.attributes || [])) {
      if (attr.name.toLowerCase().startsWith('on') || (attr.name.toLowerCase() === 'href' && String(attr.value).trim().toLowerCase().startsWith('javascript:'))) {
        n.removeAttribute(attr.name);
      }
    }
  });
  return div.innerHTML;
}

// Render a chat message body. When the server sent reply_html, inject it
// (sanitized); otherwise fall back to plain text so a missing field can never
// blank a message. The copy button always copies the raw text.
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

function addPopupChatMsg(sender, text, html) {
  if (!chatMessagesEl) return null;
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
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return div;
}

function renderPopupChatHistory(msgs) {
  if (!chatMessagesEl) return;
  chatMessagesEl.innerHTML = '';
  if (!msgs || msgs.length === 0) {
    addPopupChatMsg('agent', "Hi! I'm your Helpotron companion. Ask questions about your coursework, or tell me what to do on this page.");
    return;
  }
  msgs.forEach((m) => addPopupChatMsg(m.sender === 'user' ? 'user' : 'agent', m.text, m.html || ''));
}

let currentThreadId = 0;
let currentThreadTitle = 'current chat';
let currentThreadPinned = false;
let chatThreadsList = [];

const currentThreadTitleEl = document.getElementById('currentThreadTitle');
const btnNewChat = document.getElementById('btnNewChat');
const btnToggleThreads = document.getElementById('btnToggleThreads');
const btnCloseThreads = document.getElementById('btnCloseThreads');
const threadsDrawer = document.getElementById('threadsDrawer');
const threadsListEl = document.getElementById('threadsList');
const btnRenameThread = document.getElementById('btnRenameThread');
const btnPinThread = document.getElementById('btnPinThread');

function updateThreadUI() {
  if (currentThreadTitleEl) {
    currentThreadTitleEl.textContent = currentThreadTitle || (currentThreadId === 0 ? 'current chat' : `Chat #${currentThreadId}`);
  }
  if (btnPinThread) {
    btnPinThread.innerHTML = currentThreadPinned
      ? '<svg class="ic ic--xs" style="color:var(--primary)"><use href="#i-pin" /></svg>'
      : '<svg class="ic ic--xs"><use href="#i-pin" /></svg>';
    btnPinThread.title = currentThreadPinned ? 'Unpin conversation' : 'Pin conversation';
  }
}

async function fetchChatThreads() {
  const { server } = await chrome.storage.local.get('server');
  const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  const t = await authToken();
  if (!t) return;
  try {
    const res = await fetch(`${srv}/api/agent/threads`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    chatThreadsList = data.threads || [];
    renderThreadsDrawer();
    const cur = chatThreadsList.find((th) => th.id === currentThreadId);
    if (cur) {
      currentThreadTitle = cur.title || (cur.id === 0 ? 'current chat' : `Chat #${cur.id}`);
      currentThreadPinned = !!cur.pinned;
      updateThreadUI();
    }
  } catch (e) {
    // Network failure
  }
}

function renderThreadsDrawer() {
  if (!threadsListEl) return;
  threadsListEl.innerHTML = '';
  if (chatThreadsList.length === 0) {
    threadsListEl.innerHTML = '<div class="thread-item active">Current conversation</div>';
    return;
  }
  chatThreadsList.forEach((th) => {
    const div = document.createElement('div');
    const isActive = th.id === currentThreadId;
    div.className = `thread-item ${isActive ? 'active' : ''}`;
    
    const titleSpan = document.createElement('span');
    titleSpan.style.flex = '1';
    titleSpan.style.overflow = 'hidden';
    titleSpan.style.textOverflow = 'ellipsis';
    titleSpan.style.whiteSpace = 'nowrap';
    titleSpan.textContent = th.title || (th.id === 0 ? 'current chat' : `Chat #${th.id}`);
    div.appendChild(titleSpan);

    if (th.pinned) {
      const pinIcon = document.createElement('span');
      pinIcon.className = 'pin-indicator';
      pinIcon.innerHTML = '📌';
      div.appendChild(pinIcon);
    }

    div.addEventListener('click', () => {
      currentThreadId = th.id;
      currentThreadTitle = th.title || (th.id === 0 ? 'current chat' : `Chat #${th.id}`);
      currentThreadPinned = !!th.pinned;
      updateThreadUI();
      if (threadsDrawer) threadsDrawer.classList.add('hidden');
      loadPopupChatHistory();
    });

    threadsListEl.appendChild(div);
  });
}

if (btnToggleThreads) {
  btnToggleThreads.addEventListener('click', () => {
    if (!threadsDrawer) return;
    const isHidden = threadsDrawer.classList.contains('hidden');
    if (isHidden) {
      threadsDrawer.classList.remove('hidden');
      fetchChatThreads();
    } else {
      threadsDrawer.classList.add('hidden');
    }
  });
}

if (btnCloseThreads) {
  btnCloseThreads.addEventListener('click', () => {
    if (threadsDrawer) threadsDrawer.classList.add('hidden');
  });
}

if (btnNewChat) {
  btnNewChat.addEventListener('click', async () => {
    const { server } = await chrome.storage.local.get('server');
    const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
    const t = await authToken();
    if (!t) {
      setStatus('⚠️ Sign in on Helpotron to create new chat threads.');
      return;
    }
    try {
      setStatus('Creating new conversation thread…');
      const res = await fetch(`${srv}/api/agent/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ title: 'New chat' }),
      });
      if (res.ok) {
        const data = await res.json();
        const newThread = (data && data.thread) || {};
        currentThreadId = newThread.id || 0;
        currentThreadTitle = newThread.title || 'New chat';
        currentThreadPinned = false;
        updateThreadUI();
        if (chatMessagesEl) chatMessagesEl.innerHTML = '';
        addPopupChatMsg('agent', "Hi! I'm your Helpotron companion. Ask questions about your coursework, or tell me what to do on this page.");
        setStatus(`✨ Switched to new conversation: ${currentThreadTitle}`);
        fetchChatThreads();
      } else {
        setStatus('❌ Failed to create new conversation.');
      }
    } catch (e) {
      setStatus(`❌ Connection error: ${String(e)}`);
    }
  });
}

if (btnRenameThread) {
  btnRenameThread.addEventListener('click', async () => {
    const newTitle = prompt('Rename this conversation:', currentThreadTitle);
    if (!newTitle || !newTitle.trim()) return;
    const titleClean = newTitle.trim().slice(0, 120);
    const { server } = await chrome.storage.local.get('server');
    const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
    const t = await authToken();
    if (!t) return;
    try {
      const res = await fetch(`${srv}/api/agent/threads/${currentThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ title: titleClean }),
      });
      if (res.ok) {
        currentThreadTitle = titleClean;
        updateThreadUI();
        fetchChatThreads();
        setStatus(`✅ Renamed conversation to “${titleClean}”.`);
      }
    } catch (e) {
      setStatus(`❌ Rename failed: ${String(e)}`);
    }
  });
}

if (btnPinThread) {
  btnPinThread.addEventListener('click', async () => {
    const nextPin = !currentThreadPinned;
    const { server } = await chrome.storage.local.get('server');
    const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
    const t = await authToken();
    if (!t) return;
    try {
      const res = await fetch(`${srv}/api/agent/threads/${currentThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ pinned: nextPin }),
      });
      if (res.ok) {
        currentThreadPinned = nextPin;
        updateThreadUI();
        fetchChatThreads();
        setStatus(nextPin ? '📌 Conversation pinned.' : 'Conversation unpinned.');
      }
    } catch (e) {
      setStatus(`❌ Pin toggle failed: ${String(e)}`);
    }
  });
}

// CSS viewport of the tab the agent will drive. Falls back to the screen size
// only when the page cannot be queried (no host permission, chrome:// page).
async function activeTabViewport() {
  const fallback = { width: window.screen.width || 1280, height: window.screen.height || 800 };
  try {
    // Same trap as activeTabForDrive: {currentWindow:true} inside a popped-out
    // popup measures the POPUP, so the server was clamping page coordinates to
    // the chat window's size and every click landed short.
    const tab = await activeTabForDrive();
    if (!tab || !tab.id || !chrome.scripting) return fallback;
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ width: window.innerWidth, height: window.innerHeight }),
    });
    const v = res && res[0] && res[0].result;
    if (v && v.width > 0 && v.height > 0) return v;
  } catch { /* not scriptable — fall through */ }
  return fallback;
}

function captureActiveTabFrame(windowId) {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(
      windowId === undefined ? null : windowId,
      { format: 'jpeg', quality: 70 },
      (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          resolve(null);
        } else {
          resolve(dataUrl);
        }
      },
    );
  });
}

// captureVisibleTab can only ever photograph the ACTIVE tab of a window, so a
// jurisdiction that includes background tabs has to go through CDP. Attaches,
// shoots, detaches — the same debugger the drive already uses. This is also the
// fallback when captureVisibleTab is refused for lack of a host permission: the
// manifest lists the study sites, the `debugger` permission has no such limit.
async function captureBackgroundTabFrame(tabId) {
  if (!chrome.debugger) return null;
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;
    const shot = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
      format: 'jpeg', quality: 70,
    });
    if (shot && shot.data) return `data:image/jpeg;base64,${shot.data}`;
  } catch {
    // DevTools open on the target, another debugger attached, a fully occluded
    // renderer that cannot produce a frame. Not fatal: the turn continues with
    // one fewer screen and the caller records the tab as unseen.
  } finally {
    if (attached) await chrome.debugger.detach({ tabId }).catch(() => {});
  }
  return null;
}

// One frame per jurisdiction tab, plus the labels that tell the model which
// screen is which. Only the first MAX_JURISDICTION_FRAMES are photographed —
// the server drops frames past its own cap — but EVERY tab in scope is still
// reported, marked captured:false when it has no frame. Reporting only the
// photographed ones would tell the model "4 tabs in scope" while the burst
// runs in ten, which is exactly the mismatch this labelling exists to stop.
async function captureJurisdictionFrames(targets, activeTab, shouldInjectSom = false) {
  const images = [];
  const tabs = [];
  let primaryViewport = null;
  let primaryElements = [];
  for (const t of targets) {
    let frame = null;
    if (images.length < MAX_JURISDICTION_FRAMES) {
      let elements = [];
      if (shouldInjectSom && window.HelpotronElements && t.id) {
        try {
          elements = await window.HelpotronElements.collectInteractiveElements(t.id);
          if (elements && elements.length) {
            await window.HelpotronElements.injectSetOfMarks(t.id, elements);
            await new Promise((r) => setTimeout(r, 60));
          }
        } catch (e) {}
      }

      const sameWindowActive = t.active && (!activeTab || t.windowId === activeTab.windowId);
      frame = sameWindowActive ? await captureActiveTabFrame(t.windowId) : null;
      if (!frame) frame = await captureBackgroundTabFrame(t.id);

      if (shouldInjectSom && window.HelpotronElements && t.id) {
        try {
          await window.HelpotronElements.removeSetOfMarks(t.id);
        } catch (e) {}
      }

      if (frame) {
        // captureVisibleTab / Page.captureScreenshot return DEVICE pixels
        // (CSS x devicePixelRatio), while the DOM element list and the mouse
        // dispatch are CSS. On any display whose scale factor is not 1 those
        // are different spaces and every model coordinate is off by exactly
        // that ratio — the click lands somewhere other than where it was
        // aimed. Resize the frame to the tab's own CSS viewport so one image
        // pixel IS one CSS pixel and the model, the DOM list, the server's
        // clamp and the click all speak the same space.
        const vp = (window.HelpotronElements && typeof window.HelpotronElements.getTabViewport === 'function')
          ? await window.HelpotronElements.getTabViewport(t.id).catch(() => null)
          : null;
        if (vp) {
          if (window.HelpotronElements && typeof window.HelpotronElements.normalizeFrame === 'function') {
            frame = await window.HelpotronElements.normalizeFrame(frame, vp.width, vp.height).catch(() => frame);
          }
          // The single viewport the server clamps against must be the DRIVE
          // tab's (the one the user is on), not whichever tab the capture
          // loop happened to photograph first.
          const isPrimary = t.active && (!activeTab || t.windowId === activeTab.windowId);
          if (isPrimary || !primaryViewport) {
            primaryViewport = { width: vp.width, height: vp.height };
            if (elements && elements.length) primaryElements = elements;
          }
        }
        images.push(frame);
      }
    }
    tabs.push({ title: driveTabLabel(t), url: String(t.url || ''), captured: Boolean(frame) });
  }
  return { images, tabs, viewport: primaryViewport, elements: primaryElements };
}

const KEY_MAP = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  Home: { key: 'Home', code: 'Home', vk: 36 },
  End: { key: 'End', code: 'End', vk: 35 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 },
};

let lastCursorPos = { x: 400, y: 300 };
const VIRTUAL_CURSOR_ID = '__helpotron_agent_cursor__';

// The server clamps against the frame it was given; the tab can have resized or
// navigated since, so clamp again against the LIVE viewport before dispatching.
// Without this a stale coordinate lands off-screen and the click silently
// misses (CDP accepts out-of-bounds points without erroring).
async function readViewport(tabId) {
  try {
    const res = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: '({w: window.innerWidth, h: window.innerHeight})',
      returnByValue: true,
    });
    const v = res && res.result && res.result.value;
    if (v && v.w > 0 && v.h > 0) return { w: v.w, h: v.h };
  } catch { /* fall through to the default below */ }
  return { w: 1280, h: 800 };
}

function clampToViewport(x, y, vp) {
  const cx = Math.max(0, Math.min(vp.w - 1, Math.round(Number(x) || 0)));
  const cy = Math.max(0, Math.min(vp.h - 1, Math.round(Number(y) || 0)));
  return { x: cx, y: cy };
}

// The click coordinates come from a vision model reading a screenshot, so they
// routinely land a few pixels off — inside the right control, or on the padding
// just outside it. The click then dispatches at the model's guess and the page
// does nothing, which looks exactly like "the cursor moved but the click
// missed". This pre-pass asks the PAGE what is actually under each coordinate
// and, when that is (or is inside) a real interactive element, moves the click
// to that element's true centre.
//
// Deliberately conservative: if the point hits no interactive element the
// original coordinates are kept untouched, so canvas/map/text clicks and any
// control the selector list does not know about behave exactly as before.
const SNAP_TARGET_SELECTOR = [
  'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
  'summary', 'label', '[role="button"]', '[role="link"]', '[role="tab"]',
  '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
  '[role="textbox"]', '[role="combobox"]', '[role="searchbox"]', '[role="option"]',
  '[role="treeitem"]', '[contenteditable="true"]', '[contenteditable=""]', '[onclick]',
  'g-more-button', 'g-raised-button', 'g-flat-button',
  '[jsaction*="click"]', '[jsaction*="trigger:"]', '[aria-expanded]',
  '[data-action]', '[data-ved]',
].join(',');

async function snapActionsToElements(tabId, actions) {
  if (!chrome.debugger || !Array.isArray(actions) || !actions.length) return actions;
  const probes = actions.map((op) => (
    op && op.x !== undefined && op.y !== undefined
      ? { x: Number(op.x), y: Number(op.y) }
      : null
  ));
  if (!probes.some(Boolean)) return actions;
  try {
    const res = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: `(() => {
        const SEL = ${JSON.stringify(SNAP_TARGET_SELECTOR)};
        const probes = ${JSON.stringify(probes)};
        const hits = [];

        function matchInteractive(el) {
          let n = el, guard = 0;
          while (n && n.nodeType === 1 && guard++ < 8) {
            try {
              if (n.matches && n.matches(SEL)) return n;
              const cs = window.getComputedStyle(n);
              if (cs && cs.cursor === 'pointer' && n.tagName !== 'BODY' && n.tagName !== 'HTML') {
                const r = n.getBoundingClientRect();
                if (r.width >= 10 && r.height >= 10 && r.width < 900 && r.height < 500) return n;
              }
            } catch (e) {}
            n = n.parentElement;
          }
          return null;
        }

        for (const p of probes) {
          if (!p) { hits.push(null); continue; }
          let el = null;
          try { el = document.elementFromPoint(p.x, p.y); } catch (e) { el = null; }
          let hit = matchInteractive(el);

          // Proximity scan if exact point landed on whitespace, padding, or text container
          if (!hit) {
            const offsets = [
              [0, -10], [0, 10], [-15, 0], [15, 0],
              [-12, -10], [12, -10], [-12, 10], [12, 10],
              [0, -20], [0, 20], [-25, 0], [25, 0],
              [-20, -18], [20, -18], [-20, 18], [20, 18],
              [0, -35], [0, 35], [-40, 0], [40, 0]
            ];
            for (const [dx, dy] of offsets) {
              const qx = p.x + dx;
              const qy = p.y + dy;
              if (qx < 0 || qy < 0 || qx >= window.innerWidth || qy >= window.innerHeight) continue;
              let qEl = null;
              try { qEl = document.elementFromPoint(qx, qy); } catch (e) {}
              const cand = matchInteractive(qEl);
              if (cand) {
                const r = cand.getBoundingClientRect();
                const distX = Math.max(r.left - p.x, 0, p.x - r.right);
                const distY = Math.max(r.top - p.y, 0, p.y - r.bottom);
                if (Math.hypot(distX, distY) <= 45) {
                  hit = cand;
                  break;
                }
              }
            }
          }

          if (!hit) { hits.push(null); continue; }

          // Ensure hit element is brought into view if partially offscreen
          try {
            const initialR = hit.getBoundingClientRect();
            if (initialR.top < 0 || initialR.bottom > window.innerHeight) {
              hit.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
            }
          } catch (e) {}

          const r = hit.getBoundingClientRect();
          if (!r || r.width <= 0 || r.height <= 0) { hits.push(null); continue; }
          hits.push({
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
          });
        }
        return hits;
      })()`,
      returnByValue: true,
    });
    const hits = res && res.result && res.result.value;
    if (!Array.isArray(hits)) return actions;
    return actions.map((op, i) => {
      const hit = hits[i];
      if (!hit || !op) return op;
      return { ...op, x: hit.x, y: hit.y };
    });
  } catch {
    return actions;
  }
}

// ── Live DOM element registry ──────────────────────────────────────────────────────────────────
// Defined in element_registry.js (loaded by popup.html). Kept in ONE place
// because the list built at capture time and the list re-read at dispatch
// time must agree, or a ref silently points at the wrong element.
const collectInteractiveElements = (...a) => (window.HelpotronElements?.collectInteractiveElements ? window.HelpotronElements.collectInteractiveElements(...a) : (window.collectInteractiveElements ? window.collectInteractiveElements(...a) : Promise.resolve([])));
const resolveActionRefs = (...a) => (window.HelpotronElements?.resolveActionRefs ? window.HelpotronElements.resolveActionRefs(...a) : (window.resolveActionRefs ? window.resolveActionRefs(...a) : Promise.resolve(a[0])));
const getTabViewport = (...a) => (window.HelpotronElements?.getTabViewport ? window.HelpotronElements.getTabViewport(...a) : (window.getTabViewport ? window.getTabViewport(...a) : Promise.resolve(null)));
const normalizeFrame = (...a) => (window.HelpotronElements?.normalizeFrame ? window.HelpotronElements.normalizeFrame(...a) : (window.normalizeFrame ? window.normalizeFrame(...a) : Promise.resolve(a[0])));

// ── Virtual Visible Second Cursor Overlay on Screen ─────────────────────────
async function initVirtualCursor(tabId) {
  if (!chrome.debugger) return;
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
      // Generation token: removeVirtualCursor schedules a delayed removal;
      // re-initializing (fast retry / next burst) bumps the token so the
      // stale removal can never delete the cursor a NEW burst is driving.
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
  }).catch(() => {});
}

async function moveVirtualCursor(tabId, x, y) {
  if (!chrome.debugger) return;
  await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
    expression: `(() => {
      const cur = document.getElementById('${VIRTUAL_CURSOR_ID}');
      if (cur) {
        cur.style.transform = 'translate(' + ${Math.round(x)} + 'px, ' + ${Math.round(y)} + 'px)';
      }
    })()`
  }).catch(() => {});
}

async function animateVirtualCursorClick(tabId) {
  if (!chrome.debugger) return;
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
  }).catch(() => {});
}

async function setVirtualCursorAction(tabId, actionText) {
  if (!chrome.debugger) return;
  await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
    expression: `(() => {
      const txt = document.getElementById('__helpotron_cursor_text__');
      if (txt) txt.textContent = ${JSON.stringify(actionText)};
    })()`
  }).catch(() => {});
}

async function removeVirtualCursor(tabId) {
  if (!chrome.debugger) return;
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
  }).catch(() => {});
}

async function checkPagePauseFlag(tabId) {
  if (!chrome.debugger) return false;
  try {
    const res = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: 'Boolean(window.__helpotron_pause__)',
      returnByValue: true,
    });
    return Boolean(res && res.result && res.result.value);
  } catch {
    return false;
  }
}

// ── Agent Action Execution & Instant Pause Controller ────────────────────────
let isAgentActionPaused = false;
let isAgentActionRunning = false;
let activeActionTabId = null;

function showAgentActiveBar(desc) {
  isAgentActionRunning = true;
  isAgentActionPaused = false;
  retryPending = false;
  const bar = document.getElementById('agentActiveBar');
  const d = document.getElementById('agentActiveDesc');
  const btn = document.getElementById('btnPauseAgentAction');
  const btnTxt = document.getElementById('btnPauseAgentText');
  const hBtn = document.getElementById('btnHeaderPause');
  if (bar) {
    bar.style.display = 'flex';
    bar.classList.remove('paused');
  }
  if (d) d.textContent = desc || 'Agent driving screen…';
  if (btn) {
    btn.onclick = null;  // drop a RETRY handler left by a failed attach
    btn.className = 'btn btn--danger btn--sm';
    if (btnTxt) btnTxt.textContent = 'PAUSE';
  }
  if (hBtn) hBtn.style.display = 'inline-flex';
  if (chatQuickPause) chatQuickPause.style.display = 'inline-flex';
}

function updateAgentActiveDesc(desc) {
  const d = document.getElementById('agentActiveDesc');
  if (d) d.textContent = desc;
}

function setAgentActionPausedState() {
  isAgentActionPaused = true;
  const bar = document.getElementById('agentActiveBar');
  const d = document.getElementById('agentActiveDesc');
  const btn = document.getElementById('btnPauseAgentAction');
  const btnTxt = document.getElementById('btnPauseAgentText');
  const hBtn = document.getElementById('btnHeaderPause');
  if (bar) {
    bar.classList.add('paused');
  }
  if (d) d.textContent = '⏸ Paused by user (Esc pressed)';
  if (btn) {
    btn.className = 'btn btn--secondary btn--sm';
    if (btnTxt) btnTxt.textContent = 'CANCEL';
  }
  if (hBtn) hBtn.style.display = 'none';
  if (chatQuickPause) chatQuickPause.style.display = 'none';
  setStatus('⏸ Agent action paused. Press Cancel or issue a new instruction.');
}

function hideAgentActiveBar() {
  isAgentActionRunning = false;
  isAgentActionPaused = false;
  const bar = document.getElementById('agentActiveBar');
  const hBtn = document.getElementById('btnHeaderPause');
  if (bar) bar.style.display = 'none';
  if (hBtn) hBtn.style.display = 'none';
  if (chatQuickPause) chatQuickPause.style.display = 'none';
}

let pauseBarVisible = false; // bar is up in a paused/can-cancel state
let retryPending = false;    // bar is up with a RETRY button (attach failed)

function syncPauseBarVisible() {
  const bar = document.getElementById('agentActiveBar');
  pauseBarVisible = !!(bar && bar.style.display !== 'none' && bar.style.display !== '');
}

async function pauseAgentAction() {
  // RETRY mode: the button's own onclick re-runs the burst. Cancel it here
  // (Escape / stop) — never race a detach against the retry attach.
  if (retryPending) {
    retryPending = false;
    hideAgentActiveBar();
    setStatus('Retry cancelled.');
    return;
  }
  // Both paths must stay live even after the burst has finished unwinding:
  // executeReturnedActions resets isAgentActionRunning in `finally` but
  // leaves the paused bar up — CANCEL has to keep working, never a dead bar.
  syncPauseBarVisible();
  if (!isAgentActionRunning && !pauseBarVisible) return;
  if (!isAgentActionPaused) {
    // Pause immediately
    isAgentActionPaused = true;
    setAgentActionPausedState();
    // Pin the tab id before any await: the burst's `finally` can null
    // activeActionTabId while these run, which would detach the WRONG
    // (null) tab and leak the live debugger onto the real one.
    const tId = activeActionTabId;
    if (tId) {
      await removeVirtualCursor(tId).catch(() => {});
      await chrome.debugger.detach({ tabId: tId }).catch(() => {});
    }
  } else {
    // Already paused -> cancel / hide bar
    hideAgentActiveBar();
    setStatus('Agent action stopped.');
  }
}

const btnPauseEl = document.getElementById('btnPauseAgentAction');
const btnHeaderPauseEl = document.getElementById('btnHeaderPause');
if (btnPauseEl) btnPauseEl.addEventListener('click', pauseAgentAction);
if (btnHeaderPauseEl) btnHeaderPauseEl.addEventListener('click', pauseAgentAction);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isAgentActionRunning) {
    pauseAgentAction();
  }
});

// Every CDP call in a burst goes through here: once the user pauses we detach
// immediately, so in-flight commands reject with "Debugger is not attached".
// That is expected, not a failure — swallow it instead of aborting the run.
async function cdp(tabId, method, params) {
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params);
  } catch (err) {
    if (isAgentActionPaused) return null;
    throw err;
  }
}

// Set per burst from `drivingUnseen`. When the drive tab is one the user cannot
// see, the human-like glide is not merely pointless — it is the difference
// between "it works" and "nothing happens". Chrome blocks
// Input.dispatchMouseEvent for a fixed 5s on a NON-ACTIVE tab, because the
// hidden renderer never acks the event. Measured 2026-09-08, headless AND
// headful: 5.00s per mouse event on a background tab, 5-17ms on the same tab
// once activated; Runtime.evaluate and Input.insertText stay at 1-2ms either
// way. A 30-95 point glide therefore costs 2.5-8 MINUTES per click.
let driveIsUnseen = false;

async function glideMouseTo(tabId, targetX, targetY) {
  // Nobody is watching this pointer, so jump straight to the target: the same
  // click lands off one dispatch instead of 30-95.
  if (driveIsUnseen) {
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(targetX),
      y: Math.round(targetY),
      button: 'none',
      buttons: 0,
    }).catch(() => {});
    await moveVirtualCursor(tabId, targetX, targetY);
    lastCursorPos = { x: targetX, y: targetY };
    return;
  }
  const points = humanMovePoints(lastCursorPos.x, lastCursorPos.y, targetX, targetY);
  for (let i = 1; i < points.length; i++) {
    if (isAgentActionPaused) break;
    const pt = points[i];
    const prev = points[i - 1];
    const dt = Math.max(8, Math.min(45, Math.round(pt.t - prev.t)));
    await new Promise((r) => setTimeout(r, dt));
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      button: 'none',
      buttons: 0,
    }).catch(() => {});
    await moveVirtualCursor(tabId, pt.x, pt.y);
    lastCursorPos = { x: pt.x, y: pt.y };
  }
  if (!isAgentActionPaused) {
    await moveVirtualCursor(tabId, targetX, targetY);
    lastCursorPos = { x: targetX, y: targetY };
  }
}

// Which tab the last burst ran in — used to reset the glide origin so the
// visible cursor can never appear to fly in from another page's coordinates.
let lastBurstTabId = null;

// ── Drivable Tab Selection ───────────────────────────────────────────────────
// Chrome refuses chrome.debugger.attach on protected schemes (chrome://,
// edge://, about:, chrome-extension://, devtools://, view-source:, data: …)
// with "Not allowed to attach to this tab". The agent may therefore only ever
// attach to a real web page. Every burst starts by PICKING the drive tab:
// the active tab when *it* is drivable, otherwise the most recently accessed
// drivable tab anywhere (background tabs included) — the user is switched to
// it so they can see what is being driven.

function isDriveableUrl(url) {
  const u = String(url || '').toLowerCase();
  // Protected + extension-internal schemes: debugger attach is hard-blocked
  // by Chrome. Fail the pick BEFORE any attach attempt.
  if (/^(chrome|chrome-extension|chromium|edge|about|devtools|view-source|data|javascript|blob|extensions|moz-extension|opera|vivaldi|brave|settings|options|webextension):/.test(u)) return false;
  return /^(https?|file):\/\//.test(u);
}

function isDriveableTab(tab) {
  return Boolean(tab && tab.id && isDriveableUrl(tab.url));
}

// The tab the USER is looking at — never the surface this popup is drawn on.
//
// 09-08 bug: a popped-out popup is itself a chrome window, so inside it
// {active:true, currentWindow:true} returns the popup's OWN extension page.
// That answer was accepted as "the active tab", failed isDriveableTab, and sent
// the run to a pickDriveTab fallback that chose whichever normal tab had been
// touched most recently. That is how "type apple sauce", asked from a plain
// google tab, landed in a Google Doc — a tab the user never put in scope.
//
// So: trust {currentWindow:true} only when it hands back a real web tab (the
// action popup and the side panel both belong to the user's browser window),
// and otherwise ask for the last focused NORMAL window explicitly. What comes
// back is the user's tab whether or not it can be driven; refusing an
// undriveable tab is the caller's job, and substituting a different one is
// nobody's.
async function activeTabForDrive() {
  let tab = null;
  try {
    const list = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = (list && list[0]) || null;
  } catch { tab = null; }
  if (isDriveableTab(tab)) return tab;

  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'], populate: true });
    const act = win && (win.tabs || []).find((t) => t.active);
    if (act) return act;
  } catch { /* windowTypes unsupported on this build — keep what we have */ }

  return tab;
}

function driveTabLabel(tab) {
  if (!tab) return 'page';
  if (tab.title && tab.title.trim()) return tab.title.trim();
  try { return new URL(tab.url).hostname || tab.url; } catch { return String(tab.url || 'page'); }
}

// ── 09-08 jurisdiction: the set of tabs this turn may see and drive ──────────
// Owner ask: "add a jurisdiction where u can choose 1 or multiple tabs, or all
// tabs it can see, and execute in at once". Stored as 'active' | 'all' | an
// array of tab ids. Tab ids die with their tab, so a stored list is a WISH,
// never a guarantee — every read re-validates it against the live tab list and
// silently drops what is gone. An empty result falls back to the single-tab
// pick, which is the behaviour that existed before this feature.

function normalizeJurisdiction(raw) {
  if (raw === 'all') return 'all';
  if (Array.isArray(raw)) {
    const ids = raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
    return ids.length ? ids : JURISDICTION_DEFAULT;
  }
  return JURISDICTION_DEFAULT;
}

// Every tab the agent could drive, ordered the way the user sees them
// (window, then tab strip position) so a multi-tab run is predictable.
async function listDriveableTabs() {
  let hits = [];
  try { hits = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch { hits = []; }
  return (hits || [])
    .filter(isDriveableTab)
    .sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
}

// The tabs this turn acts on. `activeTab` is the caller's already-resolved
// active tab (avoids a second query); pass null to let this resolve it.
//
// Returns { tabs, dropped, reason }. `dropped` is how many in-scope tabs the cap
// cut. `reason` is why the set came back empty — because an empty set now means
// the turn STOPS. It used to mean "go find some other tab", which is how a run
// scoped to one tab ended up acting in another. A tab the user did not put in
// scope is out of bounds even when it is the only driveable tab open.
async function resolveJurisdictionTabs(activeTab) {
  const st = await readAgentState();
  const juris = normalizeJurisdiction(st[JURISDICTION_KEY]);
  const active = activeTab || await activeTabForDrive();
  const cap = (list) => ({
    tabs: list.slice(0, MAX_JURISDICTION_TABS),
    dropped: Math.max(0, list.length - MAX_JURISDICTION_TABS),
    reason: '',
  });

  if (juris === 'all') {
    const all = await listDriveableTabs();
    if (all.length) return cap(all);
    return { tabs: [], dropped: 0, reason: 'no driveable web page tab is open' };
  }

  if (Array.isArray(juris)) {
    // Tab ids die with their tab, so the stored list is re-validated every read.
    const picked = (await listDriveableTabs()).filter((t) => juris.includes(t.id));
    if (picked.length) return cap(picked);
    return {
      tabs: [], dropped: 0,
      reason: 'the tabs you picked under Tabs are closed — pick again, or set it back to "this tab"',
    };
  }

  // Default scope is this tab and only this tab.
  if (isDriveableTab(active)) return { tabs: [active], dropped: 0, reason: '' };
  return {
    tabs: [], dropped: 0,
    reason: active
      ? `the tab you are on (${driveTabLabel(active)}) cannot be driven — chrome://, extension and settings pages are off limits. Switch to a normal web page, or use the Tabs chip to choose one.`
      : 'no active tab found',
  };
}

// What the approval card names as the target. Same resolver the drive uses, so
// the card cannot promise a different page than the one that gets driven.
async function jurisdictionTargetSummary() {
  const { tabs, dropped, reason } = await resolveJurisdictionTabs(null);
  if (!tabs.length) return reason || 'no tab in scope';
  const names = tabs.map(driveTabLabel);
  const head = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
  return dropped ? `${head} (${dropped} more past the ${MAX_JURISDICTION_TABS}-tab limit)` : head;
}

function jurisdictionChipLabel(juris, count) {
  if (juris === 'all') return `Tabs: all${count ? ` (${count})` : ''}`;
  if (Array.isArray(juris)) return `Tabs: ${juris.length} picked`;
  return 'Tabs: this one';
}

// A failed attach used to end in a hidden bar and a one-line status the user
// could do nothing about. Now the bar stays up with a live RETRY button.
function offerActionRetry(actions, reason) {
  if (isAgentActionPaused || retryPending) {
    // The user paused/cancelled while the burst was still winding up (an
    // in-flight attach rejected after the pause detach). Never resurrect a
    // RETRY bar on top of a paused bar — the pause already cleaned up.
    hideAgentActiveBar();
    if (isAgentActionPaused) setStatus('⏸ Agent action paused.');
    return;
  }
  const bar = document.getElementById('agentActiveBar');
  const desc = document.getElementById('agentActiveDesc');
  const btn = document.getElementById('btnPauseAgentAction');
  const btnTxt = document.getElementById('btnPauseAgentText');
  isAgentActionRunning = false;
  isAgentActionPaused = false;
  retryPending = true;
  activeActionTabId = null; // no burst owns a tab right now
  if (bar) {
    bar.style.display = 'flex';
    bar.classList.add('paused');
  }
  if (desc) desc.textContent = `Could not attach to this tab — ${reason || 'unknown reason'}`;
  if (btn) {
    btn.className = 'btn btn--primary btn--sm';
    if (btnTxt) btnTxt.textContent = 'RETRY';
    btn.onclick = async () => {
      btn.onclick = null;
      retryPending = false;
      hideAgentActiveBar();
      // Re-run the WHOLE pick, not just the attach: the failure may have been
      // a chrome:// target, a closed tab, DevTools, or another debugger — the
      // active tab may also have changed while the user was looking at RETRY.
      await executeReturnedActions(actions);
    };
  }
  setStatus('⚠️ Could not drive this tab — press RETRY, or switch to a normal web page first.');
}

// Drive ONE tab. Split out of executeReturnedActions on 09-08 so a jurisdiction
// of several tabs runs the same burst through each of them without duplicating
// the attach/clamp/detach discipline. Returns a verdict instead of touching the
// status line — the caller owns the summary, because with N tabs no single tab
// gets to speak for the run.
//   {status: 'ok'|'paused'|'attach_failed'|'error', ran, error, label}
async function driveActionsInTab(driveTab, actions, ctx) {
  const { activeTab = null, index = 0, total = 1 } = ctx || {};
  const many = total > 1;
  const step = many ? `[tab ${index + 1}/${total}] ` : '';

  // Belt & braces: re-check the scheme immediately before attach.
  if (!isDriveableUrl(driveTab.url)) {
    return { status: 'attach_failed', ran: 0, label: driveTabLabel(driveTab),
             error: 'target is not a driveable web page' };
  }

  // Show the user the page being driven — but ONLY from a surface that can
  // survive doing so. A browser-action popup document is destroyed the
  // moment focus leaves it, so tabs.update({active:true}) /
  // windows.update({focused:true}) here kill THIS document mid-await: the
  // burst never reaches chrome.debugger.attach below, nothing is ever typed,
  // and the UI just vanishes ("typing only closed the extension"). Driving a
  // background tab over CDP works fine, so from the ephemeral popup we drive
  // in place and label it. Persistent surfaces (popped-out window, side
  // panel) still switch to the tab so the user can watch it happen.
  const needsFocusSwitch = !driveTab.active || (activeTab && activeTab.id !== driveTab.id);
  const drivingUnseen = Boolean(needsFocusSwitch) && !isPersistentSurface;
  driveIsUnseen = drivingUnseen;
  if (needsFocusSwitch && isPersistentSurface) {
    await chrome.tabs.update(driveTab.id, { active: true }).catch(() => {});
  }
  if (isPersistentSurface && activeTab && driveTab.windowId !== activeTab.windowId) {
    await chrome.windows.update(driveTab.windowId, { focused: true }).catch(() => {});
  }
  const fresh = (await chrome.tabs.get(driveTab.id).catch(() => null)) || driveTab;
  const label = driveTabLabel(fresh);

  activeActionTabId = driveTab.id;
  showAgentActiveBar(
    `${step}${drivingUnseen ? 'Driving (background tab)' : 'Driving'}: ${label} — ${actions.length} action(s)…`
  );

  try {
    try {
      // A leaked debugger from a PRIOR burst on this tab (popup destroyed
      // mid-await, or a run that errored before its finally-detach) makes the
      // next attach fail with "Another debugger is already attached" — the
      // RETRY re-runs the whole pick and hits the same wall forever. Detach
      // first, best-effort: if DevTools holds it, detach rejects and we catch,
      // which is fine because that is genuinely undoable by the user anyway.
      await chrome.debugger.detach({ tabId: driveTab.id }).catch(() => {});
      await chrome.debugger.attach({ tabId: driveTab.id }, '1.3');
    } catch (attachErr) {
      // Attach fails when DevTools is open on the target, on the Web Store,
      // during a pending navigation, or when another debugger holds it. The
      // caller decides what to do — with one tab that is a RETRY bar, with
      // several it is a skip so the remaining tabs still run.
      return { status: 'attach_failed', ran: 0, label,
               error: String(attachErr && attachErr.message || attachErr) };
    }

    // The user can pause (Esc) in the gap between pick and attach; the pause
    // already detached the in-flight session. Honor it instead of driving a
    // dead/never-attached session.
    if (isAgentActionPaused) {
      await removeVirtualCursor(driveTab.id).catch(() => {});
      await chrome.debugger.detach({ tabId: driveTab.id }).catch(() => {});
      // A verdict, not a bare return: the caller reads .status off this, and the
      // caller owns the status line (with several tabs no single tab speaks for
      // the run). Returning undefined here threw on the very next line.
      return { status: 'paused', ran: 0, label };
    }

    // A ref-based op carries no coordinates: resolve it against the live DOM
    // first so it joins the coordinate path below like any other click.
    actions = await resolveActionRefs(driveTab.id, actions);

    // Clamp every coordinate against the LIVE viewport, and start the glide
    // from the middle of THIS tab so the cursor never enters from a stale
    // position left behind by a previous page.
    const vp = await readViewport(driveTab.id);
    actions = actions.map((op) => {
      if (op && op.x !== undefined && op.y !== undefined) {
        const c = clampToViewport(op.x, op.y, vp);
        return { ...op, x: c.x, y: c.y };
      }
      return op;
    });
    // Vision coordinates are a pixel guess; snap each one onto the real
    // interactive element under it before anything is dispatched, so a
    // near-miss lands on the control instead of beside it. Non-interactive
    // points are left exactly as they were.
    actions = await snapActionsToElements(driveTab.id, actions);
    if (lastBurstTabId !== driveTab.id) {
      lastCursorPos = { x: Math.round(vp.w / 2), y: Math.round(vp.h / 2) };
      lastBurstTabId = driveTab.id;
    }

    await initVirtualCursor(driveTab.id);

    // With a multi-tab jurisdiction the raw "Action 2/4: Clicking…" no longer
    // says WHERE — keep the tab in front of the user for every step.
    const say = (n, what) => updateAgentActiveDesc(`${step}Action ${n}/${actions.length}: ${what}`);

    for (let idx = 0; idx < actions.length; idx++) {
      if (isAgentActionPaused) break;
      const pagePaused = await checkPagePauseFlag(driveTab.id);
      if (pagePaused) {
        setAgentActionPausedState();
        break;
      }

      const op = actions[idx];
      const stepNum = idx + 1;

      if (op.op === 'move' && op.x !== undefined && op.y !== undefined) {
        say(stepNum, `Moving to (${Math.round(op.x)}, ${Math.round(op.y)})`);
        await setVirtualCursorAction(driveTab.id, 'Moving…');
        await glideMouseTo(driveTab.id, op.x, op.y);
      } else if (op.op === 'click' && op.x !== undefined && op.y !== undefined) {
        say(stepNum, `Clicking (${Math.round(op.x)}, ${Math.round(op.y)})`);
        await setVirtualCursorAction(driveTab.id, 'Moving…');
        await glideMouseTo(driveTab.id, op.x, op.y);
        if (isAgentActionPaused) break;
        await setVirtualCursorAction(driveTab.id, 'Clicking…');
        await animateVirtualCursorClick(driveTab.id);
        await new Promise((r) => setTimeout(r, 60));
        const btn = op.button === 'right' ? 'right' : 'left';
        const btns = btn === 'right' ? 2 : 1;
        await cdp(driveTab.id, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: Math.round(op.x), y: Math.round(op.y), button: btn, buttons: btns, clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 60 + Math.random() * 40));
        await cdp(driveTab.id, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: Math.round(op.x), y: Math.round(op.y), button: btn, buttons: 0, clickCount: 1,
        });
      } else if (op.op === 'dblclick' && op.x !== undefined && op.y !== undefined) {
        say(stepNum, `Double-clicking (${Math.round(op.x)}, ${Math.round(op.y)})`);
        await setVirtualCursorAction(driveTab.id, 'Moving…');
        await glideMouseTo(driveTab.id, op.x, op.y);
        if (isAgentActionPaused) break;
        await setVirtualCursorAction(driveTab.id, 'Double-clicking…');
        await animateVirtualCursorClick(driveTab.id);
        for (let c = 1; c <= 2; c++) {
          await cdp(driveTab.id, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: Math.round(op.x), y: Math.round(op.y), button: 'left', buttons: 1, clickCount: c,
          });
          await new Promise((r) => setTimeout(r, 45));
          await cdp(driveTab.id, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: Math.round(op.x), y: Math.round(op.y), button: 'left', buttons: 0, clickCount: c,
          });
          await new Promise((r) => setTimeout(r, 45));
        }
      } else if (op.op === 'type' && op.text) {
        say(stepNum, 'Typing text…');
        await setVirtualCursorAction(driveTab.id, 'Typing…');
        // Clear field first unless explicitly instructed not to, preventing accumulated duplicate text
        if (op.clear !== false) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: driveTab.id },
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
            // Hardware-level select-all + Backspace via CDP
            await cdp(driveTab.id, 'Input.dispatchKeyEvent', {
              type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2,
            }).catch(() => {});
            await cdp(driveTab.id, 'Input.dispatchKeyEvent', {
              type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2,
            }).catch(() => {});
            await cdp(driveTab.id, 'Input.dispatchKeyEvent', {
              type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
            }).catch(() => {});
            await cdp(driveTab.id, 'Input.dispatchKeyEvent', {
              type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
            }).catch(() => {});
          } catch {}
        }
        await cdp(driveTab.id, 'Input.insertText', { text: String(op.text) });
        // Dispatch synthetic input and change events for React/Vue/Angular
        try {
          await chrome.scripting.executeScript({
            target: { tabId: driveTab.id },
            func: (txt) => {
              const el = document.activeElement;
              if (el && 'value' in el) {
                if (!el.value) el.value = txt;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            },
            args: [String(op.text)],
          }).catch(() => {});
        } catch {}
      } else if (op.op === 'key' && op.key) {
        say(stepNum, `Key: ${op.key}…`);
        await setVirtualCursorAction(driveTab.id, `Key: ${op.key}`);
        const k = KEY_MAP[op.key];
        if (k) {
          await cdp(driveTab.id, 'Input.dispatchKeyEvent', {
            type: 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
          });
          if (op.key === 'Enter') {
            await cdp(driveTab.id, 'Input.dispatchKeyEvent', {
              type: 'char', text: '\r',
            }).catch(() => {});
          }
          await new Promise((r) => setTimeout(r, 40));
          await cdp(driveTab.id, 'Input.dispatchKeyEvent', {
            type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
          });
          if (op.key === 'Enter') {
            // Trigger form submission or click search button if Enter alone did not navigate
            try {
              await chrome.scripting.executeScript({
                target: { tabId: driveTab.id },
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
        }
      } else if (op.op === 'scroll' && (op.deltaX || op.deltaY)) {
        say(stepNum, 'Scrolling…');
        await setVirtualCursorAction(driveTab.id, 'Scrolling…');
        const sxy = clampToViewport(
          op.x !== undefined ? op.x : lastCursorPos.x,
          op.y !== undefined ? op.y : lastCursorPos.y,
          vp
        );
        await cdp(driveTab.id, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: Math.round(sxy.x), y: Math.round(sxy.y),
          deltaX: Math.trunc(op.deltaX || 0), deltaY: Math.trunc(op.deltaY || 0),
        });
      }
      await new Promise((r) => setTimeout(r, 180));
    }

    await removeVirtualCursor(driveTab.id);
    await chrome.debugger.detach({ tabId: driveTab.id }).catch(() => {});
    if (isAgentActionPaused) return { status: 'paused', ran: 0, label };
    return { status: 'ok', ran: actions.length, label, unseen: drivingUnseen };
  } catch (err) {
    await removeVirtualCursor(driveTab.id).catch(() => {});
    await chrome.debugger.detach({ tabId: driveTab.id }).catch(() => {});
    return { status: 'error', ran: 0, label, error: String(err) };
  } finally {
    activeActionTabId = null;
  }
}

async function executeReturnedActions(actions) {
  if (!chrome.debugger) {
    setStatus('⚠️ Cannot execute: debugger API unavailable.');
    return;
  }

  // The jurisdiction decides the targets. Default 'active' resolves to exactly
  // the one tab this used to drive, so the single-tab path is unchanged; 'all'
  // or a picked list runs the SAME burst through each tab in turn, re-clamped
  // against that tab's own live viewport (a coordinate valid in a 1280-wide tab
  // is not valid in a 700-wide one).
  const activeTab = await activeTabForDrive();
  const { tabs: targets, dropped: overCap, reason } = await resolveJurisdictionTabs(activeTab);
  if (!targets.length) {
    // Stop and say why. The old fallback drove the most recently used tab
    // instead, which meant the run silently left the scope the user set.
    offerActionRetry(actions, reason || 'no tab in scope could be driven');
    return;
  }

  const done = [];
  const skipped = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      if (isAgentActionPaused) break;
      const r = await driveActionsInTab(targets[i], actions, {
        activeTab, index: i, total: targets.length,
      });
      if (r.status === 'ok') done.push(r);
      else if (r.status === 'paused') break;
      else skipped.push(r);
    }
  } finally {
    isAgentActionRunning = false;
    activeActionTabId = null;
  }

  if (isAgentActionPaused) {
    setStatus('⏸ Agent action paused.');
    return;
  }
  // Every target failed to attach: same dead end as before, same live RETRY.
  if (!done.length) {
    const why = skipped.length === 1
      ? (skipped[0].error || 'unknown reason')
      : `none of the ${targets.length} tabs could be driven (${skipped[0] && skipped[0].error || 'unknown reason'})`;
    offerActionRetry(actions, why);
    return;
  }

  const n = actions.length;
  const missed = skipped.length ? ` ${skipped.length} tab(s) skipped: ${skipped.map((s) => s.label).join(', ')}.` : '';
  // Say it when the cap cut the scope down — "all tabs" that quietly means 16
  // is worse than 16 tabs and a sentence about it.
  const capped = overCap ? ` ${overCap} more tab(s) were in scope but past the ${MAX_JURISDICTION_TABS}-tab limit.` : '';
  if (done.length === 1) {
    setStatus(done[0].unseen
      ? `✓ Drove ${done[0].label} in the background — ${n} action(s). Press ⧉ Keep open to watch it happen.${missed}${capped}`
      : `✓ Drove ${done[0].label} — ${n} action(s) executed with visible cursor.${missed}${capped}`);
  } else {
    setStatus(`✓ Drove ${done.length} tabs — ${n} action(s) each: ${done.map((d) => d.label).join(', ')}.${missed}${capped}`);
  }
  hideAgentActiveBar();
}

async function loadPopupChatHistory() {
  const cacheKey = `${CHAT_KEY}_t${currentThreadId}`;
  const cached = (await chrome.storage.local.get([CHAT_KEY, cacheKey]))[currentThreadId === 0 ? CHAT_KEY : cacheKey];
  if (cached && cached.length) renderPopupChatHistory(cached);

  const { server } = await chrome.storage.local.get('server');
  const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  const t = await authToken();
  if (!t) return;

  try {
    const res = await fetch(`${srv}/api/extension/agent_chat/history?thread_id=${currentThreadId}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const msgs = ((data && data.chat) || []).map((m) => ({ sender: m.sender, text: m.text }));
    if (msgs.length) {
      renderPopupChatHistory(msgs);
      chrome.storage.local.set({ [currentThreadId === 0 ? CHAT_KEY : cacheKey]: msgs }).catch(() => {});
    }
  } catch {
    // Offline or server unreachable — cached messages remain visible
  }
}

if (btnRefreshChat) {
  btnRefreshChat.addEventListener('click', () => {
    fetchChatThreads();
    loadPopupChatHistory();
  });
}

if (chatFormEl && chatInputEl) {
  chatFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInputEl.value.trim();
    if (!text || chatBusy) return;

    chatInputEl.value = '';
    addPopupChatMsg('user', text);
    chatBusy = true;
    if (chatTokenBanner) chatTokenBanner.style.display = 'none';

    const typingNode = addPopupChatMsg('agent', 'Thinking…');
    const { server } = await chrome.storage.local.get('server');
    const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
    const t = await authToken();

    if (!t) {
      if (typingNode) typingNode.querySelector('span:last-child').textContent = '⚠️ Sign in on Helpotron first to chat with the agent.';
      chatBusy = false;
      return;
    }

    try {
      const agentState = await readAgentState();
      const seeScreen = agentState[SEE_SCREEN_KEY] !== undefined ? agentState[SEE_SCREEN_KEY] : SEE_SCREEN_DEFAULT;
      let images = [];
      let tabRefs = [];
      let elements = [];
      // The server clamps returned control coordinates against THIS box, so it
      // has to be the drive tab's CSS viewport. It used to send the whole
      // screen (e.g. 2560x1440 for a 1200x800 tab), which let coordinates far
      // outside the page survive clamping and land on nothing.
      let viewport = await activeTabViewport();

      let screenError = null;
      if (seeScreen) {
        // One path for every scope, single tab included. The old single-tab
        // branch called captureVisibleTab with no window id, which means "the
        // current window" — inside a popped-out popup that is the popup itself,
        // so the model was handed a picture of the chat window instead of the
        // page it was being asked about. Going through the jurisdiction always
        // means the frames come from the tabs the run will actually drive.
        const active = await activeTabForDrive();
        const { tabs: targets, reason } = await resolveJurisdictionTabs(active);
        const executeOn = agentState[EXECUTE_KEY] !== undefined ? agentState[EXECUTE_KEY] : EXECUTE_DEFAULT;
        if (!targets.length) {
          screenError = reason || (active ? `the tab you are on (${driveTabLabel(active)}) cannot be driven or captured — browser internal pages are restricted. Switch to a normal web page.` : 'no active tab found');
          setStatus(`⚠️ Screen capture: ${screenError}`);
        } else {
          const shot = await captureJurisdictionFrames(targets, active, Boolean(executeOn));
          images = shot.images;
          tabRefs = shot.tabs;
          if (shot.elements && shot.elements.length) {
            elements = shot.elements;
          }
          // The frames were just normalized into the drive tab's CSS viewport,
          // so that is the box the server must clamp against. Prefer it over the
          // pre-capture read — the tab can be resized between the two.
          if (shot.viewport) viewport = shot.viewport;
          if (!images.length) {
            screenError = 'screen capture returned no frames (tab may be restricted, DevTools open, or occluded)';
            setStatus(`⚠️ Screen capture: ${screenError}`);
          }
        }
      }

      const eduMode = agentState[EDUCATIONAL_MODE_KEY] !== undefined ? agentState[EDUCATIONAL_MODE_KEY] : EDUCATIONAL_MODE_DEFAULT;
      const permMode = agentState[MODE_KEY] || MODE_DEFAULT;
      // The server gates the model's screen/execute directives on THESE two
      // flags (routes_extension.py: sees_can_see = bool(seescreen) and images;
      // can_execute = bool(execute)). Omitting them made the model announce
      // "the See screen toggle is off" while the toggle was visibly ON, and
      // refuse to act on the page.
      const executeOn = agentState[EXECUTE_KEY] !== undefined ? agentState[EXECUTE_KEY] : EXECUTE_DEFAULT;

      // The page's own element list — exact measured coordinates, not a vision
      // guess. Gathered only when the run may actually act, so a look-only turn
      // pays no extra tokens; an empty list leaves the vision path untouched.
      if (executeOn && (!elements || !elements.length)) {
        try {
          const driveTab = await activeTabForDrive();
          if (driveTab && driveTab.id !== undefined && driveTab.id !== null) {
            elements = await collectInteractiveElements(driveTab.id);
          }
        } catch (e) { elements = []; }
      }

      const bodyPayload = {
        text,
        thread_id: currentThreadId,
        agent_mode: true,
        educational_mode: eduMode,
        permission_mode: permMode,
        seescreen: !!seeScreen,
        execute: !!executeOn,
      };
      if (images.length) bodyPayload.images = images;
      if (screenError) bodyPayload.screen_error = screenError;
      if (tabRefs.length) bodyPayload.tabs = tabRefs;
      if (viewport) bodyPayload.viewport = viewport;
      if (elements.length) bodyPayload.elements = elements.slice(0, 5000);

      const ctrl = new AbortController();
      const fetchTimer = setTimeout(() => ctrl.abort(), 75000);
      let res;
      try {
        res = await fetch(`${srv}/api/extension/agent_chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${t}`,
          },
          body: JSON.stringify(bodyPayload),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(fetchTimer);
      }

      const data = await res.json().catch(() => ({}));
      if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);

      if (data && data.status === 'insufficient_tokens') {
        if (chatTokenBanner && chatTokenMsg) {
          chatTokenMsg.textContent = data.message || 'Insufficient tokens for agent actions.';
          chatTokenBanner.style.display = 'flex';
        }
        addPopupChatMsg('agent', '⚠️ Insufficient tokens — visit your Helpotron account to replenish tokens.');
      } else if (data && data.status === 'permission_required') {
        // Server permission gate (09-07): the action needs the user's decision
        // before the agent can execute. Renders the shared card; the answer
        // posts straight to /api/extension/approval/respond (viaServer entry).
        const ap = (data.approval_request && data.approval_request.req_id)
          ? data.approval_request
          : (data.permission_request
              ? { req_id: data.permission_request.id, title: data.permission_request.title, summary: data.permission_request.description }
              : null);
        if (ap) {
          pendingApprovals.push({ reqId: String(ap.req_id), title: ap.title || 'Permission required', summary: ap.summary || 'The agent is waiting for your decision.', viaServer: true });
          while (pendingApprovals.length > 5) pendingApprovals.shift();
          renderNextApproval();
          setStatus('⚠️ The agent needs your approval before it can act.');
        }
      } else if (res.ok) {
        const reply = (typeof data.reply === 'string' ? data.reply : data.reply?.text) || data.message || 'Done.';
        addPopupChatMsg('agent', reply, data.reply_html || '');
        // Persist message to local chat mirror
        const cacheKey = currentThreadId === 0 ? CHAT_KEY : `${CHAT_KEY}_t${currentThreadId}`;
        const st = await chrome.storage.local.get(cacheKey);
        const list = (st[cacheKey] || []).slice(-70);
        list.push({ sender: 'user', text, timestamp: new Date().toISOString() });
        list.push({ sender: 'agent', text: reply, timestamp: new Date().toISOString() });
        chrome.storage.local.set({ [cacheKey]: list }).catch(() => {});

        // Check for control actions execution
        const actions = Array.isArray(data.control_actions) ? data.control_actions : null;
        const execInfo = data.execution && typeof data.execution === 'object' ? data.execution : null;
        if (actions && actions.length) {
          if (!executeOn) {
            setStatus(`Agent proposed ${actions.length} action(s) — Study Mode is OFF, so actions were skipped.`);
          } else if (data.control_requires_approval && !screenControlSessionAllowed) {
            // Manual mode (09-08): the agent does NOT touch the screen until
            // the user says so. The card carries the real ops, so "Approve"
            // is an informed click, not a blank cheque.
            const reqId = `screenctl-${Date.now()}`;
            pendingApprovals.push({
              reqId,
              title: 'Approve screen control?',
              // Name the tabs the run will REALLY touch — the same jurisdiction
              // the drive resolves. This used to name a tab picked by the old
              // most-recently-used fallback, so the card could promise one page
              // and the burst land on another.
              summary: data.control_summary
                ? `${data.control_summary}\n\nOn: ${await jurisdictionTargetSummary()}`
                : `The agent wants to run ${actions.length} action(s) on your screen.`,
              onDecision: async (decision, note, opts) => {
                if (decision !== 'allow') {
                  setStatus('Screen control rejected — nothing ran.');
                  return;
                }
                if (opts && opts.autoAdd) screenControlSessionAllowed = true;
                setStatus(`Executing ${actions.length} action(s) after approval…`);
                await executeReturnedActions(actions);
              },
            });
            while (pendingApprovals.length > 5) pendingApprovals.shift();
            renderNextApproval();
            addPopupChatMsg('agent', `⚠️ Action ready: "${data.control_summary || 'Screen control'}". Click **Approve** on the card below to execute, or switch Permissions to **Automatic** or **YOLO** in study settings above to act automatically.`);
            setStatus('⚠️ Waiting on your approval below before touching the screen.');
          } else {
            setStatus(`Executing ${actions.length} action(s) proposed by agent…`);
            await executeReturnedActions(actions);
          }
        } else if (execInfo && execInfo.status === 'failed' && execInfo.detail) {
          // Never leave the agent's prose ("I'm typing that for you now") as
          // the only account of a turn where nothing actually ran (09-08).
          addPopupChatMsg('agent', `⚠️ ${execInfo.detail}`);
          setStatus('No action ran — see the note above.');
        }
      } else {
        const errDetail = data.detail;
        let errText = `HTTP ${res.status}`;
        if (typeof errDetail === 'string') {
          errText = errDetail;
        } else if (Array.isArray(errDetail)) {
          errText = errDetail.map((d) => (d && d.msg) || JSON.stringify(d)).join('; ');
        } else if (errDetail && typeof errDetail === 'object') {
          errText = errDetail.message || errDetail.msg || JSON.stringify(errDetail);
        }
        addPopupChatMsg('agent', `⚠️ Error: ${errText}`);
      }
    } catch (err) {
      if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);
      addPopupChatMsg('agent', `⚠️ Connection error: ${String(err).slice(0, 100)}`);
    } finally {
      chatBusy = false;
    }
  });

  // Enter to send (Shift+Enter for newline)
  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatFormEl.dispatchEvent(new Event('submit'));
    }
  });
}

// ── Launch to Doc Controller ─────────────────────────────────────────────────
const ltdAssignmentSelect = document.getElementById('ltdAssignmentSelect');
const ltdTextInput = document.getElementById('ltdTextInput');
const ltdWordCount = document.getElementById('ltdWordCount');
const ltdTabSelect = document.getElementById('ltdTabSelect');
const btnRefreshAssignments = document.getElementById('btnRefreshAssignments');
const btnRefreshDocTabs = document.getElementById('btnRefreshDocTabs');
const btnStartLaunchToDoc = document.getElementById('btnStartLaunchToDoc');
const ltdActiveCard = document.getElementById('ltdActiveCard');
const ltdProgressFill = document.getElementById('ltdProgressFill');
const ltdTypingPct = document.getElementById('ltdTypingPct');
const ltdTypingStatus = document.getElementById('ltdTypingStatus');
const btnPauseTyping = document.getElementById('btnPauseTyping');
const btnCancelTyping = document.getElementById('btnCancelTyping');
const btnHumanizeLtd = document.getElementById('btnHumanizeLtd');

let typingState = {
  active: false,
  paused: false,
  // The cadence is chosen by PRESET ID, not by raw wpm/typo numbers: the server
  // owns what each preset means, so this panel and the typing engine can never
  // disagree about what "Academic" is.
  presetId: 'academic',
  targetTabId: null,
};

function updateLtdWordCount() {
  if (!ltdTextInput || !ltdWordCount) return;
  const val = ltdTextInput.value.trim();
  const words = val ? val.split(/\s+/).length : 0;
  ltdWordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
}

if (ltdTextInput) {
  ltdTextInput.addEventListener('input', updateLtdWordCount);
}

if (btnHumanizeLtd) {
  btnHumanizeLtd.addEventListener('click', async () => {
    const text = ltdTextInput ? ltdTextInput.value.trim() : '';
    if (!text) {
      setStatus('⚠️ Enter or paste draft text to humanize first.');
      return;
    }
    const { server } = await chrome.storage.local.get(['server']);
    const srv = (serverInput.value.trim() || server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
    const t = await authToken();
    if (!t) {
      setStatus('🔒 Please log in before humanizing.');
      return;
    }
    const orig = btnHumanizeLtd.innerHTML;
    btnHumanizeLtd.disabled = true;
    btnHumanizeLtd.innerHTML = '<span>Humanizing…</span>';
    try {
      const res = await fetch(`${srv}/api/assignment/humanize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
      const data = await res.json();
      const out = (data && data.content) ? String(data.content) : text;
      if (ltdTextInput) ltdTextInput.value = out;
      updateLtdWordCount();
      setStatus(`✨ Humanized ${out.split(/\s+/).filter(Boolean).length} words — ready to type.`);
    } catch (e) {
      setStatus(`⚠️ Humanize failed — ${e.message}`);
    } finally {
      btnHumanizeLtd.disabled = false;
      btnHumanizeLtd.innerHTML = orig;
    }
  });
}

// The cadence menu is rendered from the server's config (renderCadencePresets).
// The click handler is delegated from the container rather than bound per button
// so a re-render cannot orphan it, and the id falls back to the static markup's
// wpm attribute when the server is unreachable.
function presetIdFromButton(btn) {
  if (btn.dataset.preset) return btn.dataset.preset;
  const wpm = Number(btn.dataset.wpm);
  if (wpm === 48) return 'careful';
  if (wpm === 85) return 'fast';
  return 'academic';
}

function selectCadence(btn) {
  const seg = document.getElementById('ltdCadenceSeg');
  if (seg) seg.querySelectorAll('.ltd-preset').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  typingState.presetId = presetIdFromButton(btn);
}

const ltdCadenceSeg = document.getElementById('ltdCadenceSeg');
if (ltdCadenceSeg) {
  ltdCadenceSeg.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.ltd-preset');
    if (btn) selectCadence(btn);
  });
}

// Draw the cadence menu from the server's presets. This is the point of moving
// the logic server-side: adding a cadence or re-tuning one is a deploy, not an
// extension release.
function renderCadencePresets(presets) {
  const seg = document.getElementById('ltdCadenceSeg');
  if (!seg || !Array.isArray(presets) || !presets.length) return;
  seg.innerHTML = '';
  presets.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-btn ltd-preset' + (p.default ? ' active' : '');
    btn.dataset.preset = p.id || '';
    btn.dataset.wpm = String(p.wpm != null ? p.wpm : '');
    btn.dataset.typo = String(p.typo_rate != null ? p.typo_rate : '');
    btn.title = p.title || p.label || '';
    btn.textContent = p.label || p.id || '';
    if (p.sub) {
      const sub = document.createElement('span');
      sub.className = 'seg-sub';
      sub.textContent = p.sub;
      btn.appendChild(sub);
    }
    seg.appendChild(btn);
  });
  const active = seg.querySelector('.ltd-preset.active') || seg.querySelector('.ltd-preset');
  if (active) selectCadence(active);
}

// Pull the UI contract (presets, copy, hint) from the server. Best-effort: on
// any failure the hardcoded markup stays, so the panel still works offline.
async function loadLaunchConfig() {
  const { server } = await chrome.storage.local.get('server');
  const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  const t = await authToken();
  if (!t) return;
  try {
    const res = await fetch(`${srv}/api/launch-to-doc/config`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg && Array.isArray(cfg.presets)) renderCadencePresets(cfg.presets);
    const hint = document.querySelector('.launch-doc-panel .field-hint');
    if (hint && cfg && cfg.ui && cfg.ui.no_docs_tab_hint) hint.textContent = cfg.ui.no_docs_tab_hint;
  } catch {
    // keep the static markup
  }
}

async function loadAssignmentsForLaunch() {
  if (!ltdAssignmentSelect) return;
  ltdAssignmentSelect.innerHTML = '<option value="">Loading assignments…</option>';

  const { server } = await chrome.storage.local.get('server');
  const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  const t = await authToken();

  if (!t) {
    ltdAssignmentSelect.innerHTML = '<option value="">Please sign in to load assignments</option>';
    return;
  }

  try {
    const res = await fetch(`${srv}/api/assignments`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = data.assignments || [];

    ltdAssignmentSelect.innerHTML = '';
    if (list.length === 0) {
      ltdAssignmentSelect.innerHTML = '<option value="">No assignments found</option>';
      return;
    }

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '— Choose an assignment to type —';
    ltdAssignmentSelect.appendChild(defaultOpt);

    list.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = String(a.id);
      opt.textContent = `${a.title || 'Untitled'} (#${a.id})`;
      ltdAssignmentSelect.appendChild(opt);
    });
  } catch (e) {
    ltdAssignmentSelect.textContent = `Could not load (${String(e).slice(0, 30)})`;
  }
}

if (ltdAssignmentSelect) {
  ltdAssignmentSelect.addEventListener('change', async () => {
    const aid = ltdAssignmentSelect.value;
    if (!aid) return;

    const { server } = await chrome.storage.local.get('server');
    const srv = (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
    const t = await authToken();
    if (!t) return;

    try {
      setStatus(`Loading text payload for assignment #${aid}…`);
      const res = await fetch(`${srv}/api/assignment/${aid}/launch-doc-payload`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload && payload.text && ltdTextInput) {
          ltdTextInput.value = payload.text;
          updateLtdWordCount();
          setStatus(`Loaded ${payload.word_count || 0} words for “${payload.title || 'assignment'}”.`);
        }
      }
    } catch {
      // Keep existing custom text
    }
  });
}

async function detectDocTabs() {
  if (!ltdTabSelect) return;
  ltdTabSelect.innerHTML = '<option value="">Detecting open doc tabs…</option>';

  const resp = await chrome.runtime.sendMessage({ action: 'getGDocsTabs' }).catch(() => null);
  const tabs = (resp && resp.tabs) || [];

  ltdTabSelect.innerHTML = '';
  const newTabOpt = document.createElement('option');
  newTabOpt.value = 'new';
  newTabOpt.textContent = '➕ Open new Google Doc (docs.new)';
  ltdTabSelect.appendChild(newTabOpt);

  tabs.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = String(t.id);
    opt.textContent = `📄 ${t.title || t.app || 'Document'} (${t.app})`;
    if (t.active) opt.selected = true;
    ltdTabSelect.appendChild(opt);
  });
}

if (btnRefreshAssignments) btnRefreshAssignments.addEventListener('click', loadAssignmentsForLaunch);
if (btnRefreshDocTabs) btnRefreshDocTabs.addEventListener('click', detectDocTabs);

if (btnStartLaunchToDoc) {
  btnStartLaunchToDoc.addEventListener('click', async () => {
    const text = (ltdTextInput ? ltdTextInput.value : '').trim();
    if (!text) {
      setStatus('⚠️ Please enter or select assignment text to type.');
      return;
    }

    const selectedTab = ltdTabSelect ? ltdTabSelect.value : 'new';
    const targetId = selectedTab === 'new' ? null : Number(selectedTab);
    const selectedAssignId = ltdAssignmentSelect ? Number(ltdAssignmentSelect.value) || null : null;

    setStatus('🚀 Launching to doc… focusing tab and starting humanized typing stream.');
    if (ltdActiveCard) ltdActiveCard.style.display = 'flex';
    if (ltdProgressFill) ltdProgressFill.style.width = '0%';
    if (ltdTypingPct) ltdTypingPct.textContent = '0%';
    if (ltdTypingStatus) ltdTypingStatus.textContent = 'Initializing typing engine…';

    typingState.active = true;
    typingState.paused = false;

    const resp = await chrome.runtime.sendMessage({
      action: 'launchToDoc',
      payload: {
        text,
        tabId: targetId,
        presetId: typingState.presetId,
        assignmentId: selectedAssignId,
      },
    }).catch((e) => ({ ok: false, error: String(e) }));

    if (resp && resp.ok) {
      typingState.targetTabId = resp.tabId;
      setStatus(`✅ Typing started in tab #${resp.tabId}`);
      if (ltdTypingStatus) ltdTypingStatus.textContent = 'Typing into document…';
    } else {
      setStatus(`❌ Launch failed: ${(resp && resp.error) || 'unknown error'}`);
      if (ltdActiveCard) ltdActiveCard.style.display = 'none';
      typingState.active = false;
    }
  });
}

if (btnPauseTyping) {
  btnPauseTyping.addEventListener('click', async () => {
    const action = typingState.paused ? 'resumeTyping' : 'pauseTyping';
    await chrome.runtime.sendMessage({ action, tabId: typingState.targetTabId }).catch(() => {});
    typingState.paused = !typingState.paused;
    btnPauseTyping.querySelector('span').textContent = typingState.paused ? 'Resume' : 'Pause';
    if (ltdTypingStatus) ltdTypingStatus.textContent = typingState.paused ? 'Paused' : 'Typing into document…';
  });
}

if (btnCancelTyping) {
  btnCancelTyping.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'cancelTyping', tabId: typingState.targetTabId }).catch(() => {});
    if (ltdActiveCard) ltdActiveCard.style.display = 'none';
    typingState.active = false;
    setStatus('⏹ Typing cancelled.');
  });
}

// Listen for typing progress broadcasts from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && (msg.action === 'BROADCAST_TYPING_PROGRESS' || msg.action === 'TYPING_PROGRESS')) {
    const p = msg.payload || msg;
    // content.js getStatus() reports the field as `percentage`; an older
    // payload used `percent`. A payload that had neither would silently stall
    // the bar at 0% forever, so read whichever is present.
    if (p && (p.percentage !== undefined || p.percent !== undefined)) {
      const pct = Math.round(Number(p.percentage !== undefined ? p.percentage : p.percent));
      if (ltdProgressFill) ltdProgressFill.style.width = `${pct}%`;
      if (ltdTypingPct) ltdTypingPct.textContent = `${pct}%`;
      if (pct >= 100) {
        if (ltdTypingStatus) ltdTypingStatus.textContent = 'Completed!';
        setTimeout(() => {
          if (ltdActiveCard) ltdActiveCard.style.display = 'none';
          typingState.active = false;
        }, 2500);
      }
    }
  }
});

// ── Approval inbox wiring ────────────────────────────────────────────────────
function initApprovalInbox() {
  // Opening a port marks this popup alive for the approval broker.
  try {
    approvalPort = chrome.runtime.connect({ name: POPUP_PORT_NAME });
    approvalPort.onDisconnect.addListener(() => { approvalPort = null; });
  } catch (e) { /* broker falls back to notifications */ }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'APPROVAL_PROMPT') {
      pendingApprovals.push({
        reqId: String(msg.reqId || ''),
        title: msg.title || 'Helpotron agent is waiting',
        summary: msg.summary || 'Allow this agent action?',
      });
      while (pendingApprovals.length > 5) pendingApprovals.shift(); // cap the queue
      renderNextApproval();
    } else if (msg && msg.action === 'unparseable_report') {
      showUnparseable(msg.reason);
    }
  });
}

initApprovalInbox();
init();

