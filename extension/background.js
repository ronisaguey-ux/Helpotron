// Helpotron service worker: Canvas scraping, recording upload, server sync.

const DEFAULT_SERVER = 'http://localhost:8000';

async function getServer() {
  const { server } = await chrome.storage.local.get('server');
  return server || DEFAULT_SERVER;
}

async function getPublicId() {
  const { public_id } = await chrome.storage.local.get('public_id');
  return public_id || 'dev-user';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScrape') {
    startScrape().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response
  }
  if (message.action === 'startRecording') {
    startRecording().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (message.action === 'activateAgent') {
    activateAgent().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (message.action === 'agentStatus') {
    agentStatus().then((r) => sendResponse(r)).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});

// ─── browser agent bridge ──────────────────────────────────────────────────

let agentSocket = null;
let agentSessionId = null;

async function activateAgent() {
  const server = await getServer();
  const public_id = await getPublicId();
  const tabs = await chrome.tabs.query({ url: 'https://*.instructure.com/*' });
  const canvasTab = tabs.find((t) => t.active) || tabs[0];
  if (!canvasTab) return { ok: false, error: 'No Canvas tab open — open the assignment first' };

  const resp = await fetch(`${server}/api/agent/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_id }),
  });
  if (!resp.ok) return { ok: false, error: `Server: ${resp.status}` };
  const body = await resp.json();
  agentSessionId = body.session_id;
  connectAgentSocket(server, agentSessionId);
  return { ok: true, session_id: agentSessionId };
}

function connectAgentSocket(server, sessionId) {
  const wsUrl = server.replace(/^http/, 'ws') + `/ws/agent/${sessionId}`;
  const ws = new WebSocket(wsUrl);
  agentSocket = ws;
  ws.onopen = () => console.log(`[helpotron] agent ${sessionId} connected`);
  ws.onmessage = async (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'command') {
        const result = await executeTabCommand(msg.command);
        ws.send(JSON.stringify({ type: 'result', command_id: msg.command_id, ok: result.ok, error: result.error, result: result.result }));
      } else if (msg.type === 'finished') {
        console.log('[helpotron] agent finished:', msg.summary);
        ws.close();
        agentSocket = null;
      }
    } catch (e) {
      console.error('[helpotron] bridge error', e);
    }
  };
  ws.onclose = () => { agentSocket = null; };
}

async function executeTabCommand(command) {
  const tabs = await chrome.tabs.query({ url: 'https://*.instructure.com/*' });
  const tab = tabs.find((t) => t.active) || tabs[0];
  if (!tab) return { ok: false, error: 'no canvas tab' };

  if (command.action === 'navigate') {
    await chrome.tabs.update(tab.id, { url: command.url });
    await new Promise((r) => setTimeout(r, 4000)); // let the page settle
    return { ok: true, result: { url: command.url } };
  }
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runPageCommand,
      args: [command],
    });
    return { ok: true, result: res?.[0]?.result ?? {} };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Runs INSIDE the Canvas page. Self-contained (no closures over extension APIs).
function runPageCommand(cmd) {
  switch (cmd.action) {
    case 'read_page': {
      const text = (document.body ? document.body.innerText : '').slice(0, 30000);
      const links = Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => a.href && !a.href.startsWith('javascript'))
        .map((a) => ({ text: (a.innerText || '').trim().slice(0, 80), href: a.href }))
        .slice(0, 120);
      return { text, links, url: location.href, title: document.title };
    }
    case 'click': {
      const el = document.querySelector(cmd.selector);
      if (!el) return { error: `no element for ${cmd.selector}` };
      el.click();
      return { clicked: cmd.selector };
    }
    case 'type': {
      const el = document.querySelector(cmd.selector);
      if (!el) return { error: `no element for ${cmd.selector}` };
      el.value = cmd.text || '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { typed: true };
    }
    case 'scroll': {
      window.scrollBy(0, cmd.direction === 'down' ? 800 : -800);
      return { scrolled: cmd.direction };
    }
    default:
      return { error: `unknown action ${cmd.action}` };
  }
}

async function agentStatus() {
  if (!agentSessionId) return { ok: true, active: false };
  const server = await getServer();
  const resp = await fetch(`${server}/api/agent/${agentSessionId}`);
  if (!resp.ok) return { ok: false, error: `Server: ${resp.status}` };
  return { ok: true, active: true, ...(await resp.json()) };
}

async function startScrape() {
  const tabs = await chrome.tabs.query({ url: 'https://*.instructure.com/*' });
  const canvasTab = tabs.find((t) => t.active) || tabs[0];
  if (!canvasTab) return { ok: false, error: 'No Canvas tab open' };

  const results = await chrome.scripting.executeScript({
    target: { tabId: canvasTab.id },
    func: () => window.__helpotron_read_assignment ? window.__helpotron_read_assignment() : null,
  });
  let data = results?.[0]?.result;
  if (!data) {
    // fallback: run the extractor inline
    const fallback = await chrome.scripting.executeScript({
      target: { tabId: canvasTab.id },
      func: () => {
        const t = document.querySelector('.ig-title')?.innerText?.trim() || document.title;
        return { title: t, dueDate: '', prompt: '', files: [], canvasId: null };
      },
    });
    data = fallback?.[0]?.result;
  }
  if (!data || !data.title) return { ok: false, error: 'Could not read the page' };

  const server = await getServer();
  const public_id = await getPublicId();
  const resp = await fetch(`${server}/api/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      public_id,
      canvas_id: data.canvasId,
      title: data.title,
      due_date: data.dueDate,
      prompt: data.prompt,
      file_urls: data.files || [],
    }),
  });
  if (!resp.ok) return { ok: false, error: `Server said ${resp.status}` };
  const body = await resp.json();
  return { ok: true, assignment_id: body.assignment_id, title: data.title };
}

async function startRecording() {
  const server = await getServer();
  const public_id = await getPublicId();

  // Check that the server is reachable first — fail fast with a clear message.
  try {
    const probe = await fetch(`${server}/health`);
    if (!probe.ok) return { ok: false, error: `Server at ${server} not healthy` };
  } catch {
    return { ok: false, error: `Server at ${server} unreachable — is it running?` };
  }

  // Pop a standalone recording tab; it will post its blob to the server itself.
  const popupUrl = chrome.runtime.getURL('recorder.html');
  chrome.tabs.create({ url: `${popupUrl}?server=${encodeURIComponent(server)}&public_id=${encodeURIComponent(public_id)}` });
  return { ok: true };
}
