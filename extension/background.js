// Helpotron Universal Extension Service Worker
// Multi-Platform Scraping, Subagent Automation, and Data Lake Integration

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

async function authHeaders() {
  const { token } = await chrome.storage.local.get('token');
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
               : { 'Content-Type': 'application/json' };
}

// 08-26: an unauthenticated extension must NEVER send scraped data — it has to
// land on the right account. Returns an {ok:false,error} refusal when the
// popup hasn't been logged in; null = proceed.
async function requireLoggedIn() {
  const { public_id, token } = await chrome.storage.local.get(['public_id', 'token']);
  if (!public_id || !token) {
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

  if (message.action === 'activateAgent') {
    activateAgent(message.tabId).then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
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

  if (message.action === 'openDataLake') {
    getServer().then((srv) => {
      chrome.tabs.create({ url: srv });
      sendResponse({ ok: true });
    });
    return true;
  }
});

let agentSocket = null;
let agentSessionId = null;
let targetTabId = null;

async function activateAgent(chosenTabId) {
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

  const resp = await fetch(`${server}/api/agent/start`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ public_id }),
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

async function executeTabCommand(tabId, command) {
  try {
    // SAFETY (operator 08-26): never let the agent click/fill forms on LMS
    // pages (Canvas, Google Classroom, ...) — that is automation Canvas and
    // friends flag as scraping/automation. Read-only extraction stays allowed;
    // assignments get collected via the popup's explicit Scrape button.
    const lmsHosts = /(instructure\.com|classroom\.google\.com|blackboard|brightspace|d2l\.com|moodle\.com|schoology\.com|notion\.)/i;
    let tabUrl = '';
    try { tabUrl = (await chrome.tabs.get(tabId)).url || ''; } catch (e) { /* tab gone */ }
    if (tabUrl && lmsHosts.test(tabUrl) && (command.action === 'click' || command.action === 'fill_input')) {
      return { success: false, error: 'Auto-clicking is blocked on learning platforms — use the popup Scrape button for assignments.' };
    }
    const fnMap = {
      click: (selector) => {
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Element not found' };
        el.click();
        return { success: true, clicked: selector };
      },
      extract_text: (selector) => {
        const el = selector ? document.querySelector(selector) : document.body;
        return { success: true, text: el ? el.innerText.slice(0, 8000) : '' };
      },
      fill_input: (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) return { success: false, error: 'Input element not found' };
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, filled: selector };
      },
      scroll_down: () => {
        window.scrollBy(0, window.innerHeight);
        return { success: true, scrolled: window.scrollY };
      },
    };

    const action = fnMap[command.action];
    if (!action) return { success: false, error: `Unknown command: ${command.action}` };

    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      func: action,
      args: command.args || [],
    });
    return injection?.[0]?.result || { success: false, error: 'Script injection returned no result.' };
  } catch (err) {
    return { success: false, error: String(err) };
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
    // Ensure content.js is injected even on non-matching domains
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__helpotron_scrape_universal ? window.__helpotron_scrape_universal() : null),
    });
    const data = results?.[0]?.result;

    if (!data || (!data.title && !data.prompt)) {
      return {
        ok: false,
        unparseable: true,
        error: '⚠️ Helpotron was unable to parse structured assignment data from this page (e.g. protected webview or no syllabus/rubric detected). Submit to Data Lake for micro-credits!',
      };
    }

    const blocked = await requireLoggedIn();
    if (blocked) return blocked;
    const server = await getServer();
    const public_id = await getPublicId();
    const resp = await fetch(`${server}/api/assignments`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        public_id,
        title: data.title,
        due_date: data.dueDate,
        prompt: data.prompt,
        file_urls: data.files || [],
        rubric: data.rubric || '',
      }),
    });
    if (!resp.ok) return { ok: false, error: `Server returned ${resp.status}` };
    const body = await resp.json();
    return { ok: true, assignment_id: body.assignment_id, title: data.title };
  } catch (e) {
    return {
      ok: false,
      unparseable: true,
      error: `⚠️ Unable to read page: ${String(e)}. You can submit this page format to the Data Lake to earn micro-credits!`,
    };
  }
}

async function ingestScrapedAssignment(assignment) {
  try {
    const blocked = await requireLoggedIn();
    if (blocked) return blocked;  // never upload under a missing/unverified account
    const server = await getServer();
    const public_id = await getPublicId();
    await fetch(`${server}/api/assignments`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        public_id,
        title: assignment.title || 'Scraped Coursework',
        due_date: assignment.due_date || '',
        prompt: assignment.prompt || '',
        file_urls: assignment.file_urls || [],
        rubric: assignment.rubric || '',
      }),
    });
  } catch (e) {
    console.error('Failed to ingest assignment:', e);
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
  });
}
