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
const MODE_KEY = 'helpotron_agent_mode';
const EFFORT_KEY = 'helpotron_agent_effort';
const MODEL_KEY = 'helpotron_agent_model';
const MODEL_TIER_KEY = 'helpotron_agent_model_tier';
const EDUCATIONAL_MODE_KEY = 'helpotron_educational_mode';

const SEE_SCREEN_DEFAULT = true;
const EXECUTE_DEFAULT = false;
const MODE_DEFAULT = 'manual';
const EFFORT_DEFAULT = 500; // backend fallback when unauthenticated/offline
const EDUCATIONAL_MODE_DEFAULT = true;
const MODELS = ['manual', 'auto', 'yolo'];

const modelToggles = {
  toggleSeeScreen: document.getElementById('toggleSeeScreen'),
  toggleExecute: document.getElementById('toggleExecute'),
  toggleEducationalMode: document.getElementById('toggleEducationalMode'),
};
const effortScoreSlider = document.getElementById('effortScoreSlider');
const effortScoreVal = document.getElementById('effortScoreVal');
const chatModelIndicator = document.getElementById('chatModelIndicator');
const modeBtns = Array.from(document.querySelectorAll('.mode-btn'));
const modeHintEl = document.getElementById('modeHint');
const modelEffortEl = document.getElementById('modelEffort');
const modelNameEl = document.getElementById('modelName');
const modelTierEl = document.getElementById('modelTier');
let effortFromServer = null; // true once GET /api/user/settings succeeded
let effortPatchDebounceTimer = null;

function setStatus(text) {
  statusEl.innerText = text;
  statusEl.hidden = !text;
}

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
  if (s <= 300) return { tier: 'lite', label: 'Gemini 3.1 Flash Lite', model: 'google/gemini-3.1-flash-lite' };
  if (s <= 500) return { tier: 'mid_lower', label: 'DeepSeek V4 Flash Vision', model: 'deepseek/deepseek-v4-flash-vision' };
  if (s <= 700) return { tier: 'mid_upper', label: 'Gemini 3.7 Flash', model: 'google/gemini-3.7-flash' };
  return { tier: 'pro', label: 'DeepSeek V4 Pro Vision', model: 'deepseek/deepseek-v4-pro-vision' };
}

async function persistAgentState(patch) {
  await chrome.storage.local.set(patch);
}

async function readAgentState() {
  return await chrome.storage.local.get([
    SEE_SCREEN_KEY, EXECUTE_KEY, MODE_KEY, EFFORT_KEY, MODEL_KEY, MODEL_TIER_KEY, EDUCATIONAL_MODE_KEY,
  ]);
}

const MODE_HINTS = {
  manual: 'Manual — the agent asks you before EVERY action it wants to take.',
  auto: 'Automatic — the agent acts on its own; you only get asked for risky actions (credentials, deletions/submits, downloads, leaving this site).',
  yolo: 'YOLO — the agent never asks. Passwords, OTP and downloads are still out of reach for the agent — those are hard-blocked.',
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

async function applyAgentStateToUI(st) {
  applyModeToUI(st[MODE_KEY] || MODE_DEFAULT);
  if (modelToggles.toggleSeeScreen) {
    const v = st[SEE_SCREEN_KEY] === undefined ? SEE_SCREEN_DEFAULT : st[SEE_SCREEN_KEY];
    modelToggles.toggleSeeScreen.checked = v;
    modelToggles.toggleSeeScreen.setAttribute('aria-checked', v ? 'true' : 'false');
  }
  if (modelToggles.toggleExecute) {
    const v = st[EXECUTE_KEY] === undefined ? EXECUTE_DEFAULT : st[EXECUTE_KEY];
    modelToggles.toggleExecute.checked = v;
    modelToggles.toggleExecute.setAttribute('aria-checked', v ? 'true' : 'false');
  }
  if (modelToggles.toggleEducationalMode) {
    const v = st[EDUCATIONAL_MODE_KEY] === undefined ? EDUCATIONAL_MODE_DEFAULT : st[EDUCATIONAL_MODE_KEY];
    modelToggles.toggleEducationalMode.checked = v;
    modelToggles.toggleEducationalMode.setAttribute('aria-checked', v ? 'true' : 'false');
  }
  // Effort -> model line (mirror of the backend resolver).
  const score = clampEffortScore(st[EFFORT_KEY] === undefined ? EFFORT_DEFAULT : st[EFFORT_KEY]);
  const info = effortModelInfo(score);
  if (modelEffortEl) modelEffortEl.innerText = `effort ${score}`;
  if (effortScoreVal) effortScoreVal.innerText = `${score}`;
  if (effortScoreSlider) effortScoreSlider.value = score;
  if (modelNameEl) modelNameEl.innerText = info.label;
  if (chatModelIndicator) chatModelIndicator.innerText = info.label;
  if (modelTierEl) modelTierEl.innerText = `(${info.tier})`;
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
    let eduModeVal = EDUCATIONAL_MODE_DEFAULT;
    if (extCfg.mode === 'open' || settings.educationalMode === false) {
      eduModeVal = false;
    } else if (extCfg.mode === 'edu' || settings.educationalMode === true) {
      eduModeVal = true;
    } else if (st[EDUCATIONAL_MODE_KEY] !== undefined) {
      eduModeVal = Boolean(st[EDUCATIONAL_MODE_KEY]);
    }

    effortFromServer = true;
    await persistAgentState({
      [EFFORT_KEY]: score,
      [MODEL_KEY]: info.model,
      [MODEL_TIER_KEY]: info.tier,
      [EDUCATIONAL_MODE_KEY]: eduModeVal,
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

Object.keys(modelToggles).forEach((id) => {
  const el = modelToggles[id];
  if (!el) return;
  el.addEventListener('change', async () => {
    const isEdu = id === 'toggleEducationalMode';
    const isSee = id === 'toggleSeeScreen';
    const key = isEdu ? EDUCATIONAL_MODE_KEY : isSee ? SEE_SCREEN_KEY : EXECUTE_KEY;
    const val = el.checked;

    // Educational mode toggle -> syncs to local storage and backend settings
    if (isEdu) {
      el.setAttribute('aria-checked', val ? 'true' : 'false');
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

    // Execute drives the agent through the browser debugger — an OPTIONAL
    // permission (manifest.json optional_permissions) requested on first use,
    // so the install itself stays permission-light for the store review.
    if (id === 'toggleExecute' && val) {
      let granted = false;
      try {
        granted = await chrome.permissions.request({ permissions: ['debugger'] });
      } catch { granted = false; }
      if (!granted) {
        el.checked = false;
        el.setAttribute('aria-checked', 'false');
        await persistAgentState({ [key]: false });
        setStatus('⚠️ Agent actions need the “debugger” permission — not granted. Execute stays OFF (the agent will only talk, never act).');
        return;
      }
    }
    el.setAttribute('aria-checked', val ? 'true' : 'false');
    await persistAgentState({ [key]: val });
    setStatus(val
      ? (id === 'toggleSeeScreen' ? '👁 See screen: ON — the agent receives the screen with each chat message.'
                                   : '✅ Execute: ON — the agent may act with permission mode.')
      : (id === 'toggleSeeScreen' ? 'See screen: OFF — chat messages carry no screen.'
                                   : 'Execute: OFF — the agent will only talk, never act.'));
  });
});

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
// any other way); incoming APPROVAL_PROMPT renders the card, Allow/Deny
// answer APPROVAL_RESPONSE. Prompts queue: one card at a time.
const POPUP_PORT_NAME = 'helpotron-popup';
const pendingApprovals = []; // [{reqId, title, summary}]
let approvalPort = null;

function renderNextApproval() {
  const card = document.getElementById('approvalCard');
  const titleEl = document.getElementById('approvalTitle');
  const textEl = document.getElementById('approvalText');
  if (!card || !titleEl || !textEl) return;
  const item = pendingApprovals[0];
  if (!item) {
    card.style.display = 'none';
    return;
  }
  titleEl.innerText = item.title;
  textEl.innerText = item.summary;
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function answerApproval(reqId, allowed) {
  const ix = pendingApprovals.findIndex((p) => p.reqId === reqId);
  if (ix >= 0) {
    pendingApprovals.splice(ix, 1);
  }
  chrome.runtime.sendMessage({ action: 'APPROVAL_RESPONSE', reqId, decision: allowed ? 'allow' : 'deny' })
    .catch(() => {});
  setStatus(allowed ? '✅ Allowed the agent action.' : '⛔ Denied the agent action.');
  renderNextApproval();
}

const approveBtnEl = document.getElementById('approveBtn');
const denyBtnEl = document.getElementById('denyBtn');
if (approveBtnEl) {
  approveBtnEl.addEventListener('click', () => {
    const p = pendingApprovals[0];
    if (p) answerApproval(p.reqId, true);
  });
}
if (denyBtnEl) {
  denyBtnEl.addEventListener('click', () => {
    const p = pendingApprovals[0];
    if (p) answerApproval(p.reqId, false);
  });
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
    if (!res.ok) return;
    releases = (await res.json()).releases || [];
  } catch { return; } // server unreachable — banner stays hidden

  const myVer = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '0.0.0';
  const seenLocal = st[WHATSNEW_SEEN_KEY] || '0.0.0';
  const unread = releases.filter(
    (r) => versionLessEq(r.version, myVer) && !r.read && !versionLessEq(r.version, seenLocal)
  );
  if (!unread.length) return;

  banner.style.display = 'block';
  body.innerHTML = '';
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

  document.getElementById('btnWhatsNewDismiss').onclick = async () => {
    banner.style.display = 'none';
    await chrome.storage.local.set({ [WHATSNEW_SEEN_KEY]: unread[0].version });
    if (cred) {
      for (const r of unread) {
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
    setStatus('⚠️ Login required — tap the account chip above, or sign in once on the Helpotron website (session syncs here).');
  }

  // CHAT options: instant paint from local state, then server sync after paint.
  await applyAgentStateToUI(st);

  // Agent-actions permission consistency: if Execute is stored ON but the
  // optional debugger permission is gone (profile reset, revoked, moved to a
  // new browser), flip the toggle back OFF so the UI can't promise actions
  // the browser will refuse.
  if (st[EXECUTE_KEY]) {
    try {
      const has = await chrome.permissions.contains({ permissions: ['debugger'] });
      if (!has) {
        await persistAgentState({ [EXECUTE_KEY]: false });
        if (modelToggles.toggleExecute) {
          modelToggles.toggleExecute.checked = false;
          modelToggles.toggleExecute.setAttribute('aria-checked', 'false');
        }
        setStatus('⚠️ Agent-actions permission was reset — switch Execute on again and approve the prompt.');
      }
    } catch { /* permissions API unavailable — keep stored state */ }
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
      const data = await res.json();
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.public_id || changes.session_token || changes.token)) {
    init();
  }
});

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

    chrome.storage.sync.get(['ext_theme', 'ext_accent'], (st) => {
      const currentTheme = st.ext_theme || 'dark';
      const currentAccent = st.ext_accent || 'teal';
      document.querySelectorAll('#popupThemeSeg [data-theme-pick]').forEach((b) => {
        b.classList.toggle('selected', b.dataset.themePick === currentTheme);
      });
      document.querySelectorAll('#viewSettings [data-accent]').forEach((b) => {
        b.classList.toggle('selected', b.dataset.accent === currentAccent);
      });
    });
  }

  document.querySelectorAll('#popupThemeSeg [data-theme-pick]').forEach((b) => {
    b.addEventListener('click', () => {
      const theme = b.dataset.themePick;
      chrome.storage.sync.set({ ext_theme: theme });
      document.querySelectorAll('#popupThemeSeg [data-theme-pick]').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.themePick === theme);
      });
    });
  });

  document.querySelectorAll('#viewSettings [data-accent]').forEach((b) => {
    b.addEventListener('click', () => {
      const accent = b.dataset.accent;
      chrome.storage.sync.set({ ext_accent: accent });
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

function addPopupChatMsg(sender, text) {
  if (!chatMessagesEl) return null;
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
  msgs.forEach((m) => addPopupChatMsg(m.sender === 'user' ? 'user' : 'agent', m.text));
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

function captureActiveTabFrame() {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 70 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        resolve(null);
      } else {
        resolve(dataUrl);
      }
    });
  });
}

async function executeReturnedActions(actions) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs && tabs[0] ? tabs[0] : null;
  if (!activeTab || !activeTab.id) {
    setStatus('⚠️ Cannot execute actions: active tab not found.');
    return;
  }
  const hasDebugger = await chrome.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
  if (!hasDebugger) {
    setStatus('⚠️ Cannot execute: debugger permission not granted.');
    return;
  }
  try {
    await chrome.debugger.attach({ tabId: activeTab.id }, '1.3');
    for (const op of actions) {
      if (op.op === 'click' && op.x !== undefined && op.y !== undefined) {
        await chrome.debugger.sendCommand({ tabId: activeTab.id }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x: Math.round(op.x), y: Math.round(op.y), button: 'left', clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 60));
        await chrome.debugger.sendCommand({ tabId: activeTab.id }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: Math.round(op.x), y: Math.round(op.y), button: 'left', clickCount: 1,
        });
      } else if (op.op === 'type' && op.text) {
        await chrome.debugger.sendCommand({ tabId: activeTab.id }, 'Input.insertText', { text: String(op.text) });
      } else if (op.op === 'scroll' && (op.deltaX || op.deltaY)) {
        await chrome.debugger.sendCommand({ tabId: activeTab.id }, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: Math.round(op.x || 100), y: Math.round(op.y || 100),
          deltaX: Math.trunc(op.deltaX || 0), deltaY: Math.trunc(op.deltaY || 0),
        });
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await chrome.debugger.detach({ tabId: activeTab.id }).catch(() => {});
    setStatus(`✓ Executed ${actions.length} agent action(s) in active tab.`);
  } catch (err) {
    setStatus(`⚠️ Action execution failed: ${String(err)}`);
    chrome.debugger.detach({ tabId: activeTab.id }).catch(() => {});
  }
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
      let viewport = null;

      if (seeScreen) {
        const frameDataUrl = await captureActiveTabFrame();
        if (frameDataUrl) {
          images = [frameDataUrl];
          viewport = { width: window.screen.width || 1280, height: window.screen.height || 800 };
        }
      }

      const bodyPayload = {
        text,
        thread_id: currentThreadId,
        agent_mode: true,
      };
      if (images.length) bodyPayload.images = images;
      if (viewport) bodyPayload.viewport = viewport;

      const res = await fetch(`${srv}/api/extension/agent_chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json().catch(() => ({}));
      if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);

      if (data && data.status === 'insufficient_tokens') {
        if (chatTokenBanner && chatTokenMsg) {
          chatTokenMsg.textContent = data.message || 'Insufficient tokens for agent actions.';
          chatTokenBanner.style.display = 'flex';
        }
        addPopupChatMsg('agent', '⚠️ Insufficient tokens — visit your Helpotron account to replenish tokens.');
      } else if (res.ok) {
        const reply = (typeof data.reply === 'string' ? data.reply : data.reply?.text) || data.message || 'Done.';
        addPopupChatMsg('agent', reply);
        // Persist message to local chat mirror
        const cacheKey = currentThreadId === 0 ? CHAT_KEY : `${CHAT_KEY}_t${currentThreadId}`;
        const st = await chrome.storage.local.get(cacheKey);
        const list = (st[cacheKey] || []).slice(-70);
        list.push({ sender: 'user', text, timestamp: new Date().toISOString() });
        list.push({ sender: 'agent', text: reply, timestamp: new Date().toISOString() });
        chrome.storage.local.set({ [cacheKey]: list }).catch(() => {});

        // Check for control actions execution
        const actions = Array.isArray(data.control_actions) ? data.control_actions : null;
        if (actions && actions.length) {
          const executeOn = agentState[EXECUTE_KEY] !== undefined ? agentState[EXECUTE_KEY] : EXECUTE_DEFAULT;
          if (executeOn) {
            setStatus(`Executing ${actions.length} action(s) proposed by agent…`);
            await executeReturnedActions(actions);
          } else {
            setStatus(`Agent proposed ${actions.length} action(s) — Execute is OFF, so actions were skipped.`);
          }
        }
      } else {
        addPopupChatMsg('agent', `⚠️ Error: ${data.detail || `HTTP ${res.status}`}`);
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
const ltdCadenceButtons = document.querySelectorAll('.ltd-preset');

let typingState = {
  active: false,
  paused: false,
  wpm: 65,
  typoRate: 0.018,
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

ltdCadenceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    ltdCadenceButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    typingState.wpm = Number(btn.dataset.wpm) || 65;
    typingState.typoRate = Number(btn.dataset.typo) || 0.018;
  });
});

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
    ltdAssignmentSelect.innerHTML = `<option value="">Could not load (${String(e).slice(0, 30)})</option>`;
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
        wpm: typingState.wpm,
        typoRate: typingState.typoRate,
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
    if (p && p.percent !== undefined) {
      const pct = Math.round(Number(p.percent));
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

