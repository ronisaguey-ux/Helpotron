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

async function syncAssignments(assignment) {
  const server = await getServer();
  const public_id = await getPublicId();
  const res = await fetch(`${server}/api/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      chrome.tabs.create({ url: `${srv}/#datalake` });
      sendResponse({ ok: true });
    });
    return true;
  }
});

let agentSocket = null;
let agentSessionId = null;
let targetTabId = null;

async function activateAgent(chosenTabId) {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_id }),
  });
  if (!resp.ok) return { ok: false, error: `Server error: ${resp.status}` };
  const body = await resp.json();
  agentSessionId = body.session_id;
  connectAgentSocket(server, agentSessionId);
  return { ok: true, session_id: agentSessionId };
}

function connectAgentSocket(server, sessionId) {
  const wsUrl = server.replace(/^http/, 'ws') + `/ws/agent/${sessionId}`;
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
            ok: result.ok,
            error: result.error,
            result: result.result,
          })
        );
      } else if (msg.type === 'finished') {
        console.log('[helpotron] agent finished:', msg.summary);
        if (msg.assignment && msg.assignment.title) {
          await ingestScrapedAssignment(msg.assignment);
        }
        ws.close();
        agentSocket = null;
      } else if (msg.type === 'unparseable') {
        console.warn('[helpotron] website unparseable:', msg.reason);
        chrome.runtime.sendMessage({
          action: 'unparseable_report',
          reason: msg.reason,
        }).catch(() => {});
        ws.close();
        agentSocket = null;
      }
    } catch (e) {
      console.error('[helpotron] Universal agent bridge error:', e);
    }
  };
  ws.onclose = () => {
    agentSocket = null;
  };
}

async function executeTabCommand(tabId, command) {
  if (!tabId) return { ok: false, error: 'No active tab ID available' };

  if (command.action === 'navigate') {
    await chrome.tabs.update(tabId, { url: command.url });
    await new Promise((r) => setTimeout(r, 3500));
    return { ok: true, result: { url: command.url } };
  }

  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: runPageCommand,
      args: [command],
    });
    return { ok: true, result: res?.[0]?.result ?? {} };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Runs inside the target page execution context
function runPageCommand(cmd) {
  switch (cmd.action) {
    case 'read_page': {
      const text = (document.body ? document.body.innerText : '').slice(0, 30000);
      const links = Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => a.href && !a.href.startsWith('javascript:'))
        .map((a) => ({ text: (a.innerText || '').trim().slice(0, 80), href: a.href }))
        .slice(0, 120);

      // Extract metadata
      const isDRM = document.querySelector('canvas:only-child, embed[type="application/pdf"], iframe[src*="protected"]');
      const isCoursework = Boolean(
        document.querySelector('h1, h2, table, .rubric, #assignment_description, .user_content, .c3I1v')
      );

      return {
        text,
        links,
        url: location.href,
        title: document.title,
        is_drm_protected: Boolean(isDRM && text.length < 100),
        has_coursework_markers: isCoursework,
      };
    }
    case 'inspect_dom': {
      const el = document.querySelector(cmd.selector);
      if (!el) return { error: `Element not found: ${cmd.selector}` };
      return { html: el.outerHTML.slice(0, 5000), text: el.innerText.slice(0, 2000) };
    }
    case 'extract_rubric': {
      const rubrics = Array.from(document.querySelectorAll('table, .rubric, .rubric-table'))
        .map((t) => t.innerText.trim())
        .filter(Boolean);
      return { rubrics };
    }
    case 'extract_files': {
      const files = Array.from(document.querySelectorAll('a[download], a[href$=".pdf"], a[href$=".docx"], a[href*="drive.google"]'))
        .map((a) => a.href)
        .slice(0, 50);
      return { files };
    }
    case 'click': {
      const el = document.querySelector(cmd.selector);
      if (!el) return { error: `Element not found for selector: ${cmd.selector}` };
      el.click();
      return { clicked: cmd.selector };
    }
    case 'type': {
      const el = document.querySelector(cmd.selector);
      if (!el) return { error: `Element not found: ${cmd.selector}` };
      el.value = cmd.text || '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { typed: true };
    }
    case 'scroll': {
      window.scrollBy(0, cmd.direction === 'down' ? 800 : -800);
      return { scrolled: cmd.direction };
    }
    default:
      return { error: `Unknown action: ${cmd.action}` };
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

    const server = await getServer();
    const public_id = await getPublicId();
    const resp = await fetch(`${server}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const server = await getServer();
    const public_id = await getPublicId();
    await fetch(`${server}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const resp = await fetch(`${server}/api/agent/${agentSessionId}`);
  if (!resp.ok) return { ok: false, error: `Server: ${resp.status}` };
  return { ok: true, active: true, ...(await resp.json()) };
}

// ─── Periodic Extension Update Checker ────────────────────────────────────────

const CURRENT_VERSION = '2.0.0';

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

// Run version check on startup and every 30 minutes
checkForExtensionUpdate();
setInterval(checkForExtensionUpdate, 30 * 60 * 1000);

