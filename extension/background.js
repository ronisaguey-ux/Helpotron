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
});

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
