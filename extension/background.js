// Helpotron Universal Extension Service Worker
// Multi-Platform Scraping, Subagent Automation, and Data Lake Integration

// Pure crawl logic (scope/robots/index parsing/payload builder) lives in a
// shared module so the node test harness can unit-test the real code.
importScripts('crawl-core.js');

// First-run onboarding (09-01): the design package ships a 3-step welcome page;
// open it once, on install only (never on update).
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

const DEFAULT_SERVER = 'http://localhost:8000';

async function getServer() {
  const localData = await chrome.storage.local.get('server');
  const syncData = await chrome.storage.sync.get('server');
  return localData.server || syncData.server || DEFAULT_SERVER;
}

async function getPublicId() {
  const { public_id } = await chrome.storage.local.get('public_id');
  return public_id || '';
}

async function getAuthToken() {
  // session_token (server-issued, DB-backed, 7-day sliding) is the primary
  // credential; the 24h JWT `token` remains as fallback for pre-update saves.
  const { session_token, token } = await chrome.storage.local.get(['session_token', 'token']);
  return session_token || token || '';
}

async function authHeaders() {
  const tok = await getAuthToken();
  return tok ? { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }
             : { 'Content-Type': 'application/json' };
}

// 08-26: an unauthenticated extension must NEVER send scraped data — it has to
// land on the right account. Returns an {ok:false,error} refusal when the
// popup hasn't been logged in; null = proceed.
async function requireLoggedIn() {
  const { public_id, session_token, token } = await chrome.storage.local.get(['public_id', 'session_token', 'token']);
  if (!public_id || (!session_token && !token)) {
    return {
      ok: false,
      error: 'Not logged in — open the Helpotron extension popup, enter your Helpotron username & password in Settings, then save. Scraping is disabled until then.',
    };
  }
  return null;
}

async function syncAssignments(assignment) {
  const blocked = await requireLoggedIn();
  if (blocked) return blocked;
  const server = await getServer();
  const public_id = await getPublicId();
  const res = await fetch(`${server}/api/assignments`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ public_id, ...assignment }),
  });
  return { ok: res.ok, status: res.status };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postAssignment(payload) {
  const server = await getServer();
  const resp = await fetch(`${server}/api/assignments`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) return { ok: false, error: `Server returned ${resp.status}` };
  return { ok: true, json: await resp.json() };
}

// Scrape + save one tab (shared by the single-page scrape and the crawl).
// opts.deep=true (quick-scrape path) drives the page like a human first:
// wait for the load event, expand collapsed sections, scroll for lazy
// content, settle, THEN extract, and finally sha256 + stream every
// downloadable file into the assignment dump flow. The crawl keeps quick
// mode (its 23s batch budget cannot afford per-page deep drives).
const DEEP_B64_CAP = 6_000_000; // matches content.js b64Cap (08-28: 2MB was too small for PDFs/packets)

async function scrapeAndSaveTab(tabId, opts) {
  const options = opts || {};
  // 1. Real scrape: never promise data the page hasn't painted yet — the user
  //    clicks the icon right after navigating; wait for the tab to finish.
  await waitTabComplete(tabId, 15000);
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
  let data = null;
  if (options.deep) {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__helpotron_deep_scrape_universal ? window.__helpotron_deep_scrape_universal() : null),
    });
    data = res?.[0]?.result;
  } else {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : null),
    });
    data = res?.[0]?.result;
  }

  const files = (data && data.files) || [];
  const filesWithMeta = (data && data.filesWithMeta) || [];
  const promptLen = data && data.prompt ? data.prompt.trim().length : 0;
  const rubricLen = data && data.rubric ? data.rubric.trim().length : 0;

  // 2. HARD zero-content guard: the popup must NEVER report success for a
  //    scrape that collected nothing (that was the "quick scrape did nothing"
  //    bug — a bubble got created with a bare title and zero content).
  if (!data || (promptLen < 20 && rubricLen < 20 && files.length === 0)) {
    return {
      ok: false,
      unparseable: true,
      error: '⚠️ Nothing could be collected from this page — no assignment text and no downloadable files were found. If the page is still loading, wait a second and scrape again; protected webviews can be submitted to the Data Lake instead.',
    };
  }

  const blocked = await requireLoggedIn();
  if (blocked) return blocked;
  const public_id = await getPublicId();
  // Initial meta record: hashes are known now, upload/dump status is filled
  // below (a second upsert refreshes the same bubble afterwards).
  const metaForServer = filesWithMeta.map((f) => ({
    url: f.url || '',
    filename: f.filename || 'file',
    size: f.size || 0,
    sha256: f.sha256 || '',
    content_type: f.contentType || '',
    uploaded: false,
    upload_error: f.error || '',
  }));
  const payload = buildAssignmentPayload({ ...data, files_meta: metaForServer }, public_id);
  // 08-28 fix: an instruction-scrape run must land on the SAME bubble the
  // chatbox pinned (assignment_id) and carry its instruction, so the FIRST
  // upsert already targets the right assignment instead of only the second one.
  if (options.assignmentId) payload.assignment_id = options.assignmentId;
  if (options.instruction) payload.instruction = String(options.instruction).slice(0, 4000);

  // 3. Never return success with nothing collected — upload actual files into
  //    the assignment dump flow (bytes available, ≤ cap) and save URL+hash
  //    records for the rest on the bubble.
  const res = await postAssignment(payload);
  if (!res.ok) return { ok: false, error: res.error };
  const assignmentId = res.json.assignment_id;

  const finalMeta = [];
  let metaPayload = null;
  let uploaded = 0;
  let recorded = 0;
  for (const f of filesWithMeta) {
    const rec = {
      url: f.url || '',
      filename: f.filename || 'file',
      size: f.size || 0,
      sha256: f.sha256 || '',
      content_type: f.contentType || '',
      uploaded: false,
      dump_id: null,
      upload_error: '',
    };
    if (f.b64) {
      const up = await uploadScrapedFile(assignmentId, rec.filename, f.b64);
      if (up.ok) { uploaded += 1; rec.uploaded = true; rec.dump_id = up.dump_id; }
      else { rec.upload_error = up.error || 'dump upload failed'; recorded += 1; }
    } else {
      recorded += 1;
      rec.upload_error = f.error
        ? `not downloadable (${f.error}) — URL + hash saved`
        : (f.size > DEEP_B64_CAP ? 'file too large to stream — URL + hash saved' : 'URL + hash saved');
    }
    finalMeta.push(rec);
  }
  // Second upsert: same bubble (assignment_id + canvas_id both match) now
  // carries the truth — which files actually made it into the dump flow.
  if (finalMeta.length) {
    const metaPayload = { ...payload, assignment_id: assignmentId, files_meta: finalMeta };
    await postAssignment(metaPayload);
  }

  const displayedTitle = res.json.subject ? `${data.title} (${res.json.subject})` : data.title;
  return {
    ok: true,
    assignment_id: assignmentId,
    title: displayedTitle,
    promptLen,
    filesFound: files.length,
    filesUploaded: uploaded,
    filesRecorded: recorded,
    deep: data.deep || null,
    payload: metaPayload || payload,
    data,
  };
}

// ── Scrape tool (08-28): tab → {title, url, text} as chat/prompt context ─────
// Given one tab, extract page content (title, URL, visible text / main content)
// through the SAME parser the popup Scrape and the agent's read_page tool use
// (content.js __helpotron_scrape_universal) and format it as compact scraped
// context for the extension agent chat. It never saves an assignment — the
// context is for the agent's prompt/notes, a real "Scrape" run persists it.
const SCRAPE_CONTEXT_CHAT_CAP = 4_400; // under agent_chat's 5_000-char text limit, leaving room for user edits

function formatScrapeContext(d) {
  const lines = [];
  lines.push(`📄 Scraped page: ${d.title || 'Untitled page'}`);
  lines.push(`URL: ${d.url || ''}`);
  if (d.platform) lines.push(`Platform: ${d.platform}`);
  const md = d.meta || {};
  if (md.courseName) lines.push(`Course: ${md.courseName}`);
  if (md.subject) lines.push(`Subject: ${md.subject}`);
  if (d.dueDate) lines.push(`Due: ${d.dueDate}`);
  // File URLs ride BEFORE the (potentially huge) page text so the truncation
  // marker never hides them — the mass of the text is what gets cut.
  if ((d.files || []).length) {
    lines.push('');
    lines.push(`— Files (${d.files.length} on page) —`);
    lines.push(d.files.slice(0, 25).map((f) => `- ${f}`).join('\n'));
  }
  // Rubric (criteria/points — usually short) precedes the page-text body so it
  // survives the cap; the cut falls on the largest mass (the prompt text).
  if ((d.rubric || '').trim()) {
    lines.push('');
    lines.push('— Rubric —');
    lines.push(d.rubric.trim());
  }
  lines.push('');
  lines.push('— Page content —');
  lines.push((d.prompt || '').trim() || '(no readable text found)');
  const full = lines.join('\n');
  if (full.length <= SCRAPE_CONTEXT_CHAT_CAP) return full;
  // Cap includes the marker: total stays under the chat text limit even when
  // the page text needs cutting — the cut is always explicitly marked.
  const marker = '\n[…scrape context truncated at ' + SCRAPE_CONTEXT_CHAT_CAP +
    ' chars — run a real Scrape for the full page]';
  return full.slice(0, Math.max(1, SCRAPE_CONTEXT_CHAT_CAP - marker.length)) + marker;
}

async function scrapeTabContext(chosenTabId) {
  let tabId = chosenTabId ? Number(chosenTabId) : null;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0]?.id;
  }
  if (!tabId) return { ok: false, error: 'No tab selected' };
  try {
    await waitTabComplete(tabId, 15000);
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : null),
    });
    const d = res?.[0]?.result;
    if (!d) return { ok: false, error: 'Scrape script not available on this tab — pick a loaded http(s) page.' };
    const text = formatScrapeContext(d);
    return { ok: true, title: d.title || '', url: d.url || '', chars: text.length, text };
  } catch (e) {
    return { ok: false, error: `Unable to read page: ${String(e).slice(0, 160)}` };
  }
}

// Push one scraped file into the assignment dump/upload flow. Auth caveat
// (08-28): routes_dump /api/dump/upload authenticates with the cookie or the
// signed JWT only — the extension's opaque session_token Bearer is rejected —
// so prefer the 24h JWT saved at login and fall back to the session token.
async function dumpAuthHeaders() {
  const { token, session_token } = await chrome.storage.local.get(['token', 'session_token']);
  const auth = token || session_token || '';
  return auth ? { Authorization: `Bearer ${auth}` } : {};
}

async function uploadScrapedFile(assignmentId, filename, b64) {
  try {
    const server = await getServer();
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append('file', new Blob([bin]), filename);
    form.append('assignment_id', String(assignmentId));
    const resp = await fetch(`${server}/api/dump/upload`, {
      method: 'POST',
      headers: await dumpAuthHeaders(),
      body: form,
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: `${resp.status} ${body.detail || ''}`.trim() };
    return { ok: true, dump_id: body.dump_id, matched_assignment_id: body.matched_assignment_id };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}

// Persist a chatbox instruction onto an (already scraped) assignment bubble so
// a follow-up message continues the scrape with full context. The payload is
// the FULL last-scrape payload — upsert matches the same row by assignment_id.
async function persistInstruction(payload, assignmentId, instruction) {
  if (!payload || !assignmentId || !instruction) return { ok: false, error: 'missing payload/assignment/instruction' };
  const res = await postAssignment({ ...payload, assignment_id: assignmentId, instruction });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, assignment_id: res.json.assignment_id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'untrusted sender' });
    return;
  }
  if (message.action === 'SYNC_ASSIGNMENTS') {
    syncAssignments(message.assignment).then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (message.action === 'getTabs') {
    chrome.tabs.query({}, (tabs) => {
      sendResponse({
        ok: true,
        tabs: tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.active })),
      });
    });
    return true;
  }

  if (message.action === 'startScrape') {
    startScrape(message.tabId).then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'persistInstruction') {
    persistInstruction(message.payload, message.assignmentId, message.instruction)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'startCrawl') {
    startCrawl(message.tabId).then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'stopCrawl') {
    stopCrawl().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'crawlStatus') {
    crawlStatus().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, phase: 'idle', error: String(e) }));
    return true;
  }

  if (message.action === 'activateAgent') {
    activateAgent(message.tabId).then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'scrapeContext') {
    // Scrape tool (08-28): extract {title, url, page text} of one tab as
    // scraped CONTEXT for the agent chat prompt (no assignment save).
    scrapeTabContext(message.tabId).then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'scrapeWithInstruction') {
    // assignmentId (08-28): the chatbox message continues the scrape of the
    // SAME bubble when the target tab was already quick-scraped — the agent
    // session links its transcript to that assignment.
    activateAgent(message.tabId, message.instruction || '', message.assignmentId || null)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'agentStatus') {
    agentStatus().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'startRecording') {
    chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') }, (tab) => {
      sendResponse({ ok: true, tabId: tab?.id });
    });
    return true;
  }

  if (message.action === 'getGDocsTabs' || message.action === 'getEditableTabs') {
    chrome.tabs.query({}, (tabs) => {
      const filtered = (tabs || []).filter((t) => {
        if (!t.url) return false;
        const u = t.url.toLowerCase();
        return u.includes('docs.google.com') ||
               u.includes('mail.google.com') ||
               u.includes('notion.so') ||
               u.includes('notion.site') ||
               u.includes('office.com') ||
               u.includes('live.com') ||
               u.includes('blackboard') ||
               u.includes('instructure.com') ||
               u.includes('brightspace') ||
               u.includes('moodle');
      });

      // Fallback: if no specific editor tabs found, include active tabs
      const list = filtered.length > 0 ? filtered : (tabs || []).filter((t) => t.url && !t.url.startsWith('chrome://'));

      sendResponse({
        ok: true,
        tabs: list.map((t) => {
          let app = 'Web Document';
          const u = (t.url || '').toLowerCase();
          if (u.includes('docs.google.com')) app = 'Google Docs';
          else if (u.includes('mail.google.com')) app = 'Gmail';
          else if (u.includes('notion.')) app = 'Notion';
          else if (u.includes('office.com') || u.includes('live.com')) app = 'Word Online';
          else if (u.includes('instructure') || u.includes('blackboard') || u.includes('moodle')) app = 'LMS Editor';

          return {
            id: t.id,
            title: t.title || app,
            url: t.url,
            app: app,
            active: t.active,
            windowId: t.windowId,
          };
        }),
      });
    });
    return true;
  }

  if (message.action === 'launchToDoc') {
    launchToDoc(message.payload)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'pauseTyping') {
    controlTypingInTabs('PAUSE_ASSISTIVE_TYPING', message.tabId)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'resumeTyping') {
    controlTypingInTabs('RESUME_ASSISTIVE_TYPING', message.tabId)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'cancelTyping') {
    controlTypingInTabs('CANCEL_ASSISTIVE_TYPING', message.tabId)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (message.action === 'BROADCAST_TYPING_PROGRESS' || message.action === 'TYPING_PROGRESS') {
    // Broadcast progress to all open Helpotron web app tabs
    broadcastTypingProgress(message.payload || message);
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'openDataLake') {
    getServer().then((srv) => {
      chrome.tabs.create({ url: srv });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.action === 'storeSession') {
    // 08-31: the web app can now log in with a Turnstile captcha, which the
    // extension popup cannot render (MV3 bans remote scripts). After a web
    // login the page posts HELPOTRON_SESSION_HANDOFF through the content
    // script, landing here so the popup keeps working with the same account.
    const p = message.payload || {};
    const patch = {};
    if (p.public_id) patch.public_id = p.public_id;
    if (p.session_token) patch.session_token = p.session_token;
    if (p.token) patch.token = p.token;
    if (p.server) patch.server = p.server;
    if (patch.public_id && patch.session_token) {
      chrome.storage.local.set(patch).then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
    } else {
      sendResponse({ ok: false, error: 'Missing public_id or session_token' });
    }
    return true;
  }
});

async function launchToDoc(payload) {
  let targetTabId = payload && payload.tabId ? Number(payload.tabId) : null;

  if (!targetTabId) {
    const docsTabs = await chrome.tabs.query({ url: '*://docs.google.com/*' });
    if (docsTabs.length > 0) {
      targetTabId = docsTabs[0].id;
    } else {
      const newTab = await chrome.tabs.create({ url: 'https://docs.new' });
      targetTabId = newTab.id;
      await waitTabComplete(targetTabId, 15000);
    }
  }

  const tab = await chrome.tabs.get(targetTabId).catch(() => null);
  if (tab) {
    await chrome.tabs.update(targetTabId, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
  }

  // Ensure content script is ready
  await chrome.scripting.executeScript({ target: { tabId: targetTabId }, files: ['content.js'] }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));

  // NOTE: An earlier revision could optionally attach chrome.debugger here for
  // "OS-level input", but nothing in the codebase ever set useDebugger and the
  // engine always typed via the DOM event path anyway. The dead attach leaked:
  // it was never detached, which locks DevTools on the tab until the tab
  // closes. Removed entirely — if a real debugger-driven input path is ever
  // implemented, it must pair attach with detach on complete/cancel/error.

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(targetTabId, {
      action: 'START_ASSISTIVE_TYPING',
      payload: {
        text: payload.text || '',
        wpm: payload.wpm || 65,
        naturalPauses: payload.naturalPauses !== false,
        jitter: payload.jitter !== false,
        typoRate: payload.typoRate !== undefined ? payload.typoRate : 0.02,
        falseStartRate: payload.falseStartRate !== undefined ? payload.falseStartRate : 0.015,
        title: payload.title || 'Assignment Document',
        assignmentId: payload.assignmentId || null,
        targetApp: payload.targetApp || 'universal',
      },
    }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message, tabId: targetTabId });
      } else {
        resolve({ ok: true, tabId: targetTabId, ...resp });
      }
    });
  });
}

async function controlTypingInTabs(action, specificTabId) {
  if (specificTabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(Number(specificTabId), { action }, (resp) => {
        resolve({ ok: true, ...resp });
      });
    });
  }

  const tabs = await chrome.tabs.query({});
  for (const t of tabs || []) {
    chrome.tabs.sendMessage(t.id, { action }).catch(() => {});
  }
  return { ok: true };
}

function broadcastTypingProgress(payload) {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs || []) {
      if (
        t.url &&
        (t.url.includes('localhost') ||
          t.url.includes('127.0.0.1') ||
          t.url.includes('helpotron.dpdns.org'))
      ) {
        chrome.tabs.sendMessage(t.id, {
          action: 'BROADCAST_TYPING_PROGRESS',
          payload,
        }).catch(() => {});
      }
    }
  });
}

let agentSocket = null;
let agentSessionId = null;
let targetTabId = null;
// Session context (08-28 fix): the instruction + pinned bubble of the CURRENT
// run — the real capture on `finished` reuses them so the scrape lands on the
// SAME bubble the chatbox was talking about, with the instruction persisted.
let sessionInstruction = '';
let sessionAssignmentId = null;

async function activateAgent(chosenTabId, instruction, assignmentId) {
  const blocked = await requireLoggedIn();
  if (blocked) return blocked;
  const server = await getServer();
  const public_id = await getPublicId();

  if (chosenTabId) {
    targetTabId = Number(chosenTabId);
  } else {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = tabs[0]?.id;
  }

  if (!targetTabId) return { ok: false, error: 'No browser tab selected for AI scraping.' };
  sessionInstruction = instruction || '';
  sessionAssignmentId = assignmentId ? Number(assignmentId) : null;

  const resp = await fetch(`${server}/api/agent/start`, {
    method: 'POST',
    headers: await authHeaders(),
    // Optional instruction (mini chatbox "Scrape with this instruction"):
    // becomes the scraper agent's mission constraint (e.g. 'only scrape algebra').
    // assignmentId pins the session to the bubble the instruction belongs to.
    body: JSON.stringify({ public_id, instruction: sessionInstruction, assignment_id: sessionAssignmentId }),
  });
  if (!resp.ok) return { ok: false, error: `Server error: ${resp.status}` };
  const body = await resp.json();
  agentSessionId = body.session_id;
  connectAgentSocket(server, agentSessionId);
  return { ok: true, session_id: agentSessionId };
}

async function connectAgentSocket(server, sessionId) {
  const { token } = await chrome.storage.local.get('token');
  const wsUrl = server.replace(/^http/, 'ws') + `/ws/agent/${sessionId}?token=${encodeURIComponent(token || '')}`;
  const ws = new WebSocket(wsUrl);
  agentSocket = ws;
  ws.onopen = () => console.log(`[helpotron] Universal agent ${sessionId} connected on tab ${targetTabId}`);
  ws.onmessage = async (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'command') {
        const result = await executeTabCommand(targetTabId, msg.command);
        ws.send(
          JSON.stringify({
            type: 'result',
            command_id: msg.command_id,
            result,
          })
        );
      } else if (msg.type === 'finished') {
        // The agent decided collection is complete (08-28 fix): this was the ONLY
        // terminal event and it was previously IGNORED — the LLM's "assignment"
        // never reached the server, so the instruction scrape saved nothing.
        // The authoritative capture is the REAL deep scrape of the tab (full
        // page text, never the LLM's truncated re-transcription, plus file
        // sha256 + dump upload); the agent's own dict is only a fallback.
        const agentAssignment = msg.assignment || {};
        const deep = await scrapeAndSaveTab(targetTabId, {
          deep: true,
          assignmentId: sessionAssignmentId,
          instruction: sessionInstruction,
        });
        if (!deep.ok) {
          console.warn('[helpotron] finished: deep scrape failed — falling back to agent payload', deep.error || '');
          await ingestScrapedAssignment(agentAssignment, sessionInstruction, sessionAssignmentId);
        } else {
          console.log(`[helpotron] finished: deep scrape saved bubble #${deep.assignment_id} (${deep.promptLen} chars, ${deep.filesFound} files, ${deep.filesUploaded} uploaded)`);
        }
      } else if (msg.type === 'unparseable') {
        // The agent is honest about DRM/obfuscated pages — nothing to save.
        console.warn('[helpotron] agent reported unparseable:', msg.reason || 'unknown');
      }
    } catch (err) {
      console.error('[helpotron] ws parse error:', err);
    }
  };
  ws.onerror = (e) => console.warn('[helpotron] agent socket error:', e);
  ws.onclose = () => {
    console.log(`[helpotron] agent socket ${sessionId} closed`);
    agentSocket = null;
  };
}

// Read-only tab tools available to the agent session (TOOL_DOC in
// agent_session.py). 08-28 fix: the dispatcher previously mapped NONE of the
// declared tools (read_page/inspect_dom/extract_rubric/extract_files/type/
// scroll/navigate all hit "Unknown command"), the agent's args were read as an
// args-ARRAY when they arrive FLAT in the command object, and the result
// contract was inverted (extension returned `success`, server read `ok`) —
// so the agent's observations were constant "ok:false, {}" and its saved
// assignment was scraped from NOTHING.
async function injectContentScraper(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
}

// Extension-side result contract for the WS bridge: {ok, result, error}.
function okResult(payload) {
  return { ok: true, result: payload || {}, error: null };
}

async function executeTabCommand(tabId, command) {
  try {
    // SAFETY (operator 08-26): never let the agent click/fill forms on LMS
    // pages (Canvas, Google Classroom, ...) — that is automation Canvas and
    // friends flag as scraping/automation. Read-only extraction stays allowed;
    // assignments get collected via the popup's explicit Scrape button.
    const lmsHosts = /(instructure\.com|classroom\.google\.com|blackboard|brightspace|d2l\.com|moodle\.com|schoology\.com|notion\.)/i;
    let tabUrl = '';
    try { tabUrl = (await chrome.tabs.get(tabId)).url || ''; } catch (e) { /* tab gone */ }
    const isLms = !!(tabUrl && lmsHosts.test(tabUrl));
    if (isLms && (command.action === 'click' || command.action === 'fill_input' || command.action === 'type')) {
      return { ok: false, result: {}, error: 'Auto-clicking is blocked on learning platforms — use the popup Scrape button for assignments.' };
    }

    // Args normalization (08-28 fix): the server sends the command as
    // {"action": <tool>, **args} — the tool's args are FLAT on the command.
    // Accept all three shapes: flat, {args: {...}}, and legacy {args: [...]}.
    let a = {};
    if (Array.isArray(command.args)) a = { args: command.args };
    else if (command.args && typeof command.args === 'object') a = command.args;
    const fxArgs = (a && typeof a === 'object' && !Array.isArray(a)) ? a : {};

    // ── Rich read-only tools (inject content.js globals, run the REAL
    //    parsers the popup Scrape button uses — identical extraction shape).
    if (command.action === 'read_page') {
      await injectContentScraper(tabId);
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : null),
      });
      const d = res?.[0]?.result;
      if (!d) return { ok: false, result: {}, error: 'Scrape script not available in this tab.' };
      // FULL content rides in `prompt`/`rubric` (the parser caps at 1M with an
      // explicit marker); the server bounds what the LLM sees per observation.
      return okResult({
        url: d.url || '',
        title: d.title || '',
        due_date: d.dueDate || '',
        prompt: d.prompt || '',
        rubric: d.rubric || '',
        file_count: (d.files || []).length,
        files: d.files || [],
        meta: d.meta || {},
      });
    }
    if (command.action === 'scrape') {
      // Compact scrape tool (08-28): {title, url, text} shape — the same
      // extraction, tuned as a lightweight page-text scrape for the agent.
      await injectContentScraper(tabId);
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : null),
      });
      const d = res?.[0]?.result;
      if (!d) return { ok: false, result: {}, error: 'Scrape script not available in this tab.' };
      return okResult({
        url: d.url || '',
        title: d.title || '',
        text: d.prompt || d.rubric || '',
        platform: d.platform || '',
      });
    }
    if (command.action === 'inspect_dom') {
      await injectContentScraper(tabId);
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => (sel && window.__helpotron_inspect_dom ? window.__helpotron_inspect_dom(sel) : { error: 'Missing selector' }),
        args: [fxArgs.selector || ''],
      });
      return okResult(res?.[0]?.result || {});
    }
    if (command.action === 'extract_rubric') {
      await injectContentScraper(tabId);
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => (window.__helpotron_extract_rubric ? window.__helpotron_extract_rubric(sel || '') : { rubrics: [] }),
        args: [fxArgs.selector || ''],
      });
      return okResult(res?.[0]?.result || { rubrics: [] });
    }
    if (command.action === 'extract_files') {
      await injectContentScraper(tabId);
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (window.__helpotron_extract_file_links ? window.__helpotron_extract_file_links() : []),
      });
      const links = res?.[0]?.result || [];
      return okResult({ file_urls: links, file_count: links.length });
    }

    // ── Navigate within the same origin (syllabus/assignment links only).
    //    The page reloads; the agent's next read_page sees the new page.
    if (command.action === 'navigate') {
      const url = String(fxArgs.url || '');
      if (!url) return { ok: false, result: {}, error: 'navigate requires a url' };
      try {
        const u = new URL(url);
        const cur = new URL(tabUrl || url);
        if (u.origin !== cur.origin) {
          return { ok: false, result: {}, error: 'navigation limited to the current origin' };
        }
        await chrome.tabs.update(tabId, { url: u.href });
        await waitTabComplete(tabId, 15000);
        return okResult({ navigated: u.href, url: u.href });
      } catch (e) {
        return { ok: false, result: {}, error: `navigate failed: ${String(e).slice(0, 120)}` };
      }
    }

    // ── Element plumbing (DOM-local, same-origin page only).
    const fnMap = {
      click: (args) => {
        const sel = args.selector || '';
        const el = sel ? document.querySelector(sel) : null;
        if (!el) return { ok: false, result: {}, error: 'Element not found' };
        el.click();
        return okResult({ clicked: sel });
      },
      type: (args) => {
        const sel = args.selector || '';
        const el = sel ? document.querySelector(sel) : null;
        if (!el) return { ok: false, result: {}, error: 'Input element not found' };
        el.value = (args.text != null ? String(args.text) : '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return okResult({ filled: sel });
      },
      extract_text: (args) => {
        const sel = args.selector || '';
        const el = sel ? document.querySelector(sel) : document.body;
        // FULL innerText — no 8k slice. The server caps the observation it
        // feeds the agent (MAX_PAGE_CHARS); the stored content never depended
        // on this (the deep scrape is authoritative), so full text only helps.
        return okResult({ text: el ? el.innerText || '' : '' });
      },
      scroll_down: (args) => {
        window.scrollBy(0, window.innerHeight);
        return okResult({ scrolled: window.scrollY });
      },
    };

    const action = fnMap[command.action] || fnMap[command.action === 'scroll' ? 'scroll_down' : command.action === 'fill_input' ? 'type' : command.action];
    if (!action) return { ok: false, result: {}, error: `Unknown command: ${command.action}` };

    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      func: action,
      args: [fxArgs],
    });
    return injection?.[0]?.result || { ok: false, result: {}, error: 'Script injection returned no result.' };
  } catch (err) {
    return { ok: false, result: {}, error: String(err) };
  }
}

async function startScrape(chosenTabId) {
  let tabId = chosenTabId ? Number(chosenTabId) : null;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0]?.id;
  }
  if (!tabId) return { ok: false, error: 'No tab selected' };

  try {
    // Deep mode: wait-for-load → reveal clicks → lazy-content scroll → settle
    // → extract → file sha256 + dump upload. This is the REAL quick scrape.
    return await scrapeAndSaveTab(tabId, { deep: true });
  } catch (e) {
    return {
      ok: false,
      unparseable: true,
      error: `⚠️ Unable to read page: ${String(e)}. You can submit this page format to the Data Lake to earn micro-credits!`,
    };
  }
}

async function ingestScrapedAssignment(assignment, instruction, assignmentId) {
  // 08-28 fix (was silently swallowing errors and never pinning the bubble):
  // agent-finish fallback — save whatever the agent transcripted, onto the
  // SAME bubble the chatbox pinned, with its instruction.
  try {
    const blocked = await requireLoggedIn();
    if (blocked) return blocked;  // never upload under a missing/unverified account
    const public_id = await getPublicId();
    const payload = buildAssignmentPayload(
      {
        title: assignment.title || 'Scraped Coursework',
        dueDate: assignment.due_date || '',
        prompt: assignment.prompt || '',
        files: assignment.file_urls || [],
        rubric: assignment.rubric || '',
        url: assignment.source_url || '',
        meta: assignment.meta || {},
      },
      public_id
    );
    if (instruction) payload.instruction = String(instruction).slice(0, 4000);
    if (assignmentId || assignment.assignment_id) {
      payload.assignment_id = Number(assignmentId || assignment.assignment_id);
    }
    const res = await postAssignment(payload);
    return { ok: res.ok, assignment_id: res.json?.assignment_id || null, error: res.error || null };
  } catch (e) {
    console.error('Failed to ingest assignment:', e);
    return { ok: false, error: String(e) };
  }
}

async function agentStatus() {
  if (!agentSessionId) return { ok: true, active: false };
  const server = await getServer();
  const resp = await fetch(`${server}/api/agent/${agentSessionId}`, {
    headers: await authHeaders(),
  });
  if (!resp.ok) return { ok: false, error: `Server: ${resp.status}` };
  return { ok: true, active: true, ...(await resp.json()) };
}

// ─── Full-course crawl (08-28) ────────────────────────────────────────────────
// Throttled, scoped, resumable crawl of the user's CURRENT Canvas course:
// discovers the course's own content URLs (from the trigger tab DOM + the
// course index pages), scrapes each through the same parse → server-assignment
// path, dedupes in storage, shows progress on the icon badge, and can be
// stopped from the popup. State lives in chrome.storage.local so a killed
// service worker resumes on the next alarm tick; each alarm batch does at most
// ~23s of work (worker lifetime safe) with 2-5s randomized delays between
// page requests.

const CRAWL_KEY = 'helpotron_crawl';
const CRAWL_ALARM = 'helpotron_crawl_tick';
const CRAWL_BATCH_BUDGET_MS = 23000;
const CRAWL_MAX_QUEUE = 250;
const CRAWL_INDEX_KINDS = ['assignments', 'modules', 'pages', 'quizzes', 'discussion_topics'];
// In-MEMORY tick guard (never persisted): a persisted flag can be left stale
// by a concurrent tick or a worker restart mid-tick, wedging the crawl until a
// manual stop. MV3 kills the worker between events, so memory resets with it
// and a fresh tick always re-reads the storage-resident queue safely.
let crawlTickBusy = false;

async function readCrawlState() {
  return (await chrome.storage.local.get(CRAWL_KEY))[CRAWL_KEY] || null;
}
async function writeCrawlState(state) {
  // A running tick must not resurrect a crawl the user stopped: if a
  // stopping/stopped state is already stored, discard this (in-flight) write.
  const cur = await chrome.storage.local.get(CRAWL_KEY);
  const curPhase = cur && cur[CRAWL_KEY] ? cur[CRAWL_KEY].phase : '';
  if (state.phase === 'running' && ['stopping', 'stopped'].includes(curPhase)) {
    return false;
  }
  await chrome.storage.local.set({ [CRAWL_KEY]: state });
  return true;
}

async function fetchTextSafe(url, timeoutMs = 12000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { credentials: 'omit', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return '';
    return await res.text();
  } catch { return ''; }
}

// Queue items are {url, kind}. kind 'content' = page to scrape+save;
// kind 'index' = listing page opened only for link discovery (the tab's real
// Canvas session renders it, so discovery works even with cookies that a
// service-worker fetch cannot carry).
async function buildCrawlQueue(tabId, scope, triggerUrl) {
  const queue = [];
  const queueSet = new Set();
  const pushQueue = (url, kind) => {
    const canon = (url || '').split('#')[0];
    if (canon && isScopedContentUrl(canon, scope) && !queueSet.has(canon)) {
      queueSet.add(canon);
      queue.push({ url: canon, kind });
    }
  };
  const pushIndex = (url) => {
    const canon = (url || '').split('#')[0];
    if (canon && canon.startsWith(scope.courseUrl) && !queueSet.has(canon)) {
      queueSet.add(canon);
      queue.push({ url: canon, kind: 'index' });
    }
  };

  // 0. The trigger page itself is always first (the user's starting point).
  pushQueue(triggerUrl, 'content');

  // 1. Links visible in the trigger tab's DOM (a module list, syllabus, etc.).
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.collectCourseLinks ? window.collectCourseLinks() : null),
    });
    const got = res?.[0]?.result;
    if (got && got.ok) {
      (got.links || []).forEach((l) => pushQueue(l, 'content'));
      (got.indexLinks || []).forEach((l) => pushIndex(l.split('#')[0]));
    }
  } catch (e) { /* DOM link collection is best-effort */ }

  // 2. Course index pages (assignments/modules/pages/quizzes/discussions):
  // discovery only — their links feed the content crawl.
  for (const kind of CRAWL_INDEX_KINDS) pushIndex(`${scope.courseUrl}/${kind}`);

  return queue;
}

// Enqueue new content links discovered on an index page (dedupe + scope +
// queue cap). Pushed onto state.queue as {url, kind:'content'}.
function enqueueDiscoveredLinks(state, urlList) {
  const queued = new Set((state.queue || []).map((it) => it.url));
  for (const raw of urlList || []) {
    if (state.queue.length >= CRAWL_MAX_QUEUE) break;
    const canon = (raw || '').split('#')[0];
    if (!canon || !isScopedContentUrl(canon, state.scope)) continue;
    if (state.scraped_urls.includes(canon)) continue;
    if (queued.has(canon)) continue;
    queued.add(canon);
    state.queue.push({ url: canon, kind: 'content' });
  }
}

// Paginated index listings (…/assignments?page=2) discovered in a page DOM:
// queued as 'index' (discovery only, never saved as an assignment).
function enqueueDiscoveredIndexes(state, urlList) {
  const queued = new Set((state.queue || []).map((it) => it.url));
  const visited = state.visited_indexes || [];
  for (const raw of urlList || []) {
    if (state.queue.length >= CRAWL_MAX_QUEUE) break;
    const canon = (raw || '').split('#')[0];
    if (!canon || !state.scope || !canon.startsWith(state.scope.courseUrl)) continue;
    if (queued.has(canon) || visited.includes(canon)) continue;
    queued.add(canon);
    state.queue.push({ url: canon, kind: 'index' });
  }
}

function setCrawlBadge(state) {
  if (!chrome.action || !chrome.action.setBadgeText) return;
  const text = state.total > 0 ? `${state.done}/${state.total}` : '…';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#2563EB' });
}

function restoreActionBadge() {
  if (!chrome.action || !chrome.action.setBadgeText) return;
  chrome.storage.local.get('update_available').then(({ update_available }) => {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: update_available ? 'NEW' : '' });
    }
  }).catch(() => {});
}

async function waitTabComplete(tabId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.status === 'complete') return true;
    } catch (e) { return false; /* tab closed */ }
    await sleep(400);
  }
  return false;
}

async function processCrawlPage(state, url) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    state.tabs.push(tab.id);
    await writeCrawlState(state);
    await waitTabComplete(tab.id, 20000);
    const res = await scrapeAndSaveTab(tab.id);
    if (res.unparseable) {
      state.failed += 1;
      state.lastError = `Unparseable: ${url}`;
      return { ok: false, unparseable: true };
    }
    if (!res.ok) {
      state.failed += 1;
      state.lastError = res.error || url;
      return { ok: false, error: res.error };
    }
    state.done += 1;
    state.lastTitle = res.data ? res.data.title : 'page';
    return { ok: true, assignment_id: res.assignment_id };
  } catch (e) {
    state.failed += 1;
    state.lastError = `${url}: ${String(e)}`;
    return { ok: false, error: String(e) };
  } finally {
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* already gone */ }
    }
    state.tabs = (state.tabs || []).filter((id) => id !== tab.id);
    await writeCrawlState(state);
  }
}

// Open an index/listing page in a hidden tab and harvest its course links.
// Uses the tab's real session — the authenticated DOM, not a cookie-less
// fetch. The listing is never saved as an assignment.
async function processCrawlIndex(state, indexUrl) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: indexUrl, active: false });
    state.tabs.push(tab.id);
    await writeCrawlState(state);
    await waitTabComplete(tab.id, 20000);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window.collectCourseLinks ? window.collectCourseLinks() : null),
    });
    const got = res?.[0]?.result;
    if (got && got.ok && got.links) enqueueDiscoveredLinks(state, got.links);
    if (got && got.ok && got.indexLinks) enqueueDiscoveredIndexes(state, got.indexLinks);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `${indexUrl}: ${String(e)}` };
  } finally {
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* already gone */ }
    }
    state.tabs = (state.tabs || []).filter((id) => id !== tab.id);
    await writeCrawlState(state);
  }
}

async function crawlTick() {
  const state = await readCrawlState();
  if (!state || !['queued', 'running'].includes(state.phase)) return;
  if (crawlTickBusy) return; // overlapping tick (in-memory: see guard note above)
  crawlTickBusy = true;
  state.phase = 'running';
  await writeCrawlState(state);

  const budgetEnd = Date.now() + CRAWL_BATCH_BUDGET_MS;
  try {
    while (state.queue.length > 0 && Date.now() < budgetEnd) {
      // Honour a stop requested while this tick was mid-flight: even a direct
      // popup message (no writeCrawlState call in between) is visible here.
      const stored = await readCrawlState();
      if (stored && ['stopping', 'stopped'].includes(stored.phase)) {
        state.phase = 'stopped';
        break;
      }
      const item = state.queue.shift();
      const url = item && item.url;
      if (item && item.kind === 'index') {
        // Never re-open a listing (its DOM links back to itself).
        state.visited_indexes = state.visited_indexes || [];
        if (state.visited_indexes.includes(url)) continue;
        state.visited_indexes.push(url);
        await processCrawlIndex(state, url);
        // total grows / shrinks as discovery pans out
        state.total = state.done + state.failed + state.queue.length;
      } else {
        if (state.scraped_urls.includes(url)) continue;
        if (!isScopedContentUrl(url, state.scope)) continue;
        state.scraped_urls.push(url);
        await writeCrawlState(state);
        await processCrawlPage(state, url);
        state.total = state.done + state.failed + state.queue.length;
      }
      if (state.queue.length > 0) {
        await sleep(2000 + Math.floor(Math.random() * 3000)); // polite per-page delay
      }
      setCrawlBadge(state);
    }

    if (state.queue.length === 0) {
      state.phase = 'done';
      state.total = state.done + state.failed;
      await chrome.alarms.clear(CRAWL_ALARM).catch(() => {});
      restoreActionBadge();
    }
  } finally {
    crawlTickBusy = false;
    await writeCrawlState(state);
  }
}

async function startCrawl(chosenTabId) {
  const blocked = await requireLoggedIn();
  if (blocked) return blocked;

  let tabId = chosenTabId ? Number(chosenTabId) : null;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0]?.id;
  }
  if (!tabId) return { ok: false, error: 'No tab selected' };

  const existing = await readCrawlState();
  if (existing && ['queued', 'running'].includes(existing.phase)) {
    return { ok: false, error: 'A course crawl is already running — stop it first, or wait.' };
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.url) return { ok: false, error: 'Cannot read the selected tab URL.' };
  const scope = courseScopeOf(tab.url);
  if (!scope) {
    return { ok: false, error: 'Not a Canvas course page — open any /courses/<id>/ page in the course you want scraped.' };
  }

  // Respect robots.txt for the course path before crawling anything.
  const robots = await fetchTextSafe(`${scope.origin}/robots.txt`, 5000);
  if (robots && !isRobotsAllowed(robots, `/courses/${scope.courseId}/`)) {
    return {
      ok: false,
      error: "robots.txt disallows crawling this course's pages (Disallow: /courses/<id>) — respectful crawl refused.",
    };
  }

  const queue = await buildCrawlQueue(tabId, scope, tab.url);
  if (queue.length === 0) {
    return { ok: false, error: 'No scoped course pages discovered (no assignment/module/page links found).' };
  }

  const state = {
    phase: 'queued',
    scope,
    queue,
    scraped_urls: [],
    total: queue.length,
    done: 0,
    failed: 0,
    lastError: '',
    lastTitle: '',
    tabs: [],
    visited_indexes: [],
    startedAt: Date.now(),
  };
  await writeCrawlState(state);
  setCrawlBadge(state);
  chrome.alarms.create(CRAWL_ALARM, { periodInMinutes: 0.5 }); // 30s ticks (MV3 minimum)
  crawlTick(); // kick off immediately instead of waiting for the first tick
  return { ok: true, total: state.total, scope: scope.courseUrl };
}

async function stopCrawl() {
  const state = await readCrawlState();
  if (!state || !['queued', 'running'].includes(state.phase)) {
    return { ok: false, error: 'No crawl is running.' };
  }
  state.phase = 'stopping';
  state.queue = [];
  await writeCrawlState(state);
  await chrome.alarms.clear(CRAWL_ALARM).catch(() => {});
  const tabs = state.tabs || [];
  for (const tid of tabs) {
    try { await chrome.tabs.remove(tid); } catch (e) { /* already closed */ }
  }
  state.tabs = [];
  state.phase = 'stopped';
  await writeCrawlState(state);
  restoreActionBadge();
  return { ok: true };
}

async function crawlStatus() {
  const state = await readCrawlState();
  if (!state) return { ok: true, phase: 'idle' };
  return {
    ok: true,
    phase: state.phase,
    total: state.total,
    done: state.done,
    failed: state.failed,
    lastTitle: state.lastTitle,
    lastError: state.lastError,
    queued: (state.queue || []).length,
    scope: state.scope ? state.scope.courseUrl : '',
    startedAt: state.startedAt,
  };
}

// ─── Periodic Extension Update Checker ────────────────────────────────────────

const CURRENT_VERSION = chrome.runtime.getManifest().version;

async function checkForExtensionUpdate() {
  try {
    const server = await getServer();
    const resp = await fetch(`${server}/api/extension/version`);
    if (!resp.ok) return;
    const data = await resp.json();
    const latestVersion = data.latest_version;

    if (latestVersion && latestVersion !== CURRENT_VERSION) {
      console.log(`[Helpotron] Update available: v${CURRENT_VERSION} -> v${latestVersion}`);
      
      // Set update badge on extension icon
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: 'NEW' });
        chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Emerald Green
      }

      // Store update status in storage
      await chrome.storage.local.set({
        update_available: true,
        latest_version: latestVersion,
        update_notes: data.release_notes || [],
      });
    } else {
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '' });
      }
      await chrome.storage.local.set({ update_available: false });
    }
  } catch (e) {
    // Server might be offline, ignore silently
  }
}

// Run version check on startup and periodically using alarms
checkForExtensionUpdate();
if (chrome.alarms) {
  chrome.alarms.create('helpotron_update_check', { periodInMinutes: 30 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'helpotron_update_check') checkForExtensionUpdate();
    // Course-crawl tick: process the next throttled batch of pages. A killed
    // worker resumes here because every tick reads the queue from storage.
    if (a.name === CRAWL_ALARM) {
      crawlTick().catch((e) => console.error('[helpotron] crawl tick error:', e));
    }
  });
}
