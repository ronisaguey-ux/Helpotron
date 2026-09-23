// Unified API client for Helpotron with automatic X-Public-ID and CSRF header handling.
import { isDemoMode, resolveDemoRequest, mockGenerateStream } from './mock.js';
import { humanError } from './lib/errors.js';

const DEFAULT_SERVER = '';

export function getServer() {
  const saved = localStorage.getItem('helpotron_server');
  if (saved && (saved.startsWith('http://') || saved.startsWith('https://'))) {
    if (typeof window !== 'undefined' && saved.includes(window.location.host)) {
      return '';
    }
    return saved;
  }
  return '';
}

export function getUserId() {
  return localStorage.getItem('public_id') || localStorage.getItem('helpotron_public_id') || '';
}

export function setServer(server) {
  localStorage.setItem('helpotron_server', server);
}

export function setUserId(id) {
  if (id) {
    localStorage.setItem('public_id', id);
    localStorage.setItem('helpotron_public_id', id);
  } else {
    localStorage.removeItem('public_id');
    localStorage.removeItem('helpotron_public_id');
  }
}

/* Session-presence check for the app's auth gate (08-28).
 * The server's helpotron_session cookie is HttpOnly, so JS cannot read it.
 * The readable side-effects of a successful login are the csrf_token cookie
 * (set on login, deleted on logout — see server/csrf.py) and the local
 * auth artifacts (public_id / token). When NONE of them exist there is
 * provably no user session in this browser, so the /api/me probe is skipped
 * entirely and a signed-out visitor causes zero authenticated requests
 * (clean console — no expected-401 flood). */
export function hasSessionIndicator() {
  try {
    if (localStorage.getItem('token')) return true;
  } catch (e) { /* storage unavailable — fall through to cookie check */ }
  if (getUserId()) return true;
  try {
    const parts = decodeURIComponent(document.cookie).split(';');
    return parts.some((part) => part.trim().indexOf('csrf_token=') === 0);
  } catch (e) {
    return false;
  }
}

function getBaseUrl() {
  return getServer();
}

export function getCsrfToken() {
  // The COOKIE is the authority — the server rotates it on login/session, so
  // the localStorage copy goes stale and every POST/ PATCH with it bounces
  // 403 ("CSRF token invalid"). Cookie-first (operator 08-26).
  const name = 'csrf_token=';
  const decoded = decodeURIComponent(document.cookie);
  const parts = decoded.split(';');
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i].trim();
    if (part.indexOf(name) === 0) {
      return part.slice(name.length);
    }
  }
  return localStorage.getItem('helpotron_csrf_token') || null;
}

/* CSRF self-heal (operator 09-01, Logan's demo-mode chat): the csrf_token
 * cookie used to be browser-session-only while helpotron_session lives 7
 * days — a browser restart kept the login, dropped the token, and EVERY
 * state-changing request bounced 403 "CSRF token missing" (the My Agent chat
 * silently fell back to demo-mode replies). Mint a fresh token once when the
 * session is present, and callers retry the original request after it. */
let _csrfHealInFlight = null;
function healCsrfToken() {
  if (!_csrfHealInFlight) {
    _csrfHealInFlight = (async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/api/csrf`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.csrf_token) {
            localStorage.setItem('helpotron_csrf_token', data.csrf_token);
          }
        }
      } catch (e) { /* best-effort — the original request surfaces the real error */ }
    })();
  }
  return _csrfHealInFlight;
}

/* Blob download helper (09-01): an <a download> click + revoke — the jump
 * the JSON export endpoints need for their attachments. */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Memory-budget queue (08-31, operator) ──────────────────────────────────
// The API runs under a 10G cgroup budget (server/memguard.py). While the
// budget is consumed every NEW request gets 429 {"detail": QUEUE_MESSAGE} —
// the work completes when RAM frees up: we surface the message in the UI and
// retry the same request (the handler never ran, so retries are safe).
export const QUEUE_MESSAGE = 'Task is in Queue, will be completed momentarily';

function queueNotify() {
  try {
    window.dispatchEvent(new CustomEvent('helpotron:queue'));
  } catch (e) { /* no window (SSR/tests) — nothing to notify */ }
}

function queueClear() {
  try {
    window.dispatchEvent(new CustomEvent('helpotron:queue-clear'));
  } catch (e) { /* noop */ }
}

function isQueueError(err) {
  return !!err && err.status === 429 && err.message === QUEUE_MESSAGE;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries fn (backoff 3s → 10s) until RAM frees up; bounded at 10 minutes so
// a genuinely stuck server surfaces as an error instead of a silent spinner.
async function queueRetry(fn) {
  queueNotify();
  const deadline = Date.now() + 10 * 60 * 1000;
  let backoff = 3000;
  while (Date.now() < deadline) {
    await sleep(backoff);
    backoff = Math.min(backoff + 1000, 10000);
    try {
      const result = await fn();
      queueClear();
      return result;
    } catch (err) {
      if (!isQueueError(err)) {
        queueClear();
        throw err;
      }
      // still queued — keep waiting for the next slot
    }
  }
  queueClear();
  const stuck = new Error(`${QUEUE_MESSAGE} (the memory budget is still full — try again shortly.)`);
  stuck.status = 429;
  throw stuck;
}

export async function request(endpoint, options = {}) {
  // Ensure endpoint starts with /api if relative
  let cleanEndpoint = endpoint;
  if (!cleanEndpoint.startsWith('http://') && !cleanEndpoint.startsWith('https://') && !cleanEndpoint.startsWith('/api') && cleanEndpoint.startsWith('/')) {
    cleanEndpoint = `/api${cleanEndpoint}`;
  }
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const userId = getUserId();
  if (userId) {
    headers['X-Public-ID'] = userId;
  }

  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const method = options.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'TRACE') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  try {
    return await doRequest(cleanEndpoint, options, headers);
  } catch (err) {
    // Memory budget consumed (08-31, operator): the handler never ran, so the
    // same request can be retried until RAM frees up — the queue message is
    // surfaced in the UI meanwhile (see QueueNoticeBanner).
    if (isQueueError(err)) {
      return queueRetry(() => doRequest(cleanEndpoint, options, headers));
    }
    // CSRF self-heal (09-01, Logan): 403 missing/invalid = the token cookie
    // was lost on a browser restart while the session survived — mint a
    // fresh one and retry THIS request once (no loop: __csrfRetried).
    if (err.status === 403 && /csrf/i.test(err.message || '') && !options.__csrfRetried) {
      await healCsrfToken();
      return request(cleanEndpoint, { ...options, __csrfRetried: true });
    }
    throw err;
  }
}

// The actual fetch + parse, split out so the budget retry can re-run the same
// request with its original headers/body.
async function doRequest(cleanEndpoint, options, headers) {
  const url = `${getBaseUrl()}${cleanEndpoint}`;
  const method = options.method || 'GET';

  // DEMO MODE: registered endpoints return hardcoded sample data instead of
  // hitting the backend (only while the demo toggle is ON; unmocked endpoints
  // fall through to the real network request below).
  if (isDemoMode()) {
    const demoData = await resolveDemoRequest(method, url, options.body);
    if (demoData !== null && demoData !== undefined) {
      const data = demoData;
      if (data && typeof data === 'object') {
        if (!('data' in data)) {
          Object.defineProperty(data, 'data', {
            get() { return this; },
            enumerable: false,
            configurable: true
          });
        }
      }
      return data;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detail = null;
    const ct = (response.headers.get('content-type') || '').toLowerCase();

    // Parse once, and KEEP the parsed detail on the error. The raw payload is
    // never rendered — `humanError` turns it into a sentence and stashes the
    // original on `err.technical` so the "report this" affordance can attach
    // real diagnostics without the user having to read them.
    try {
      const parsed = JSON.parse(errorText);
      if (parsed && parsed.detail !== undefined) detail = parsed.detail;
      else if (parsed && parsed.message !== undefined) detail = parsed.message;
    } catch {
      // Not JSON. A raw text body is only usable if it reads like a sentence.
      detail = errorText && errorText.length <= 240 ? errorText : null;
    }

    // HTML (Cloudflare/gateway 5xx pages) must NEVER be shown as the message.
    if (ct.includes('text/html')) detail = null;

    const err = new Error(buildApiErrorMessage(response.status, detail));
    err.status = response.status;
    err.detail = detail;                       // raw, for reporting only
    err.human = humanError(err);               // {title,message,hint,canRetry,technical}
    if (response.status === 401 && typeof window !== 'undefined') {
      const isAuthEndpoint =
        cleanEndpoint.includes('/api/login') ||
        cleanEndpoint.includes('/api/signup') ||
        cleanEndpoint.includes('/api/me') ||
        cleanEndpoint.includes('/api/public-config');
      if (!isAuthEndpoint) {
        window.dispatchEvent(
          new CustomEvent('helpotron:session-expired', {
            detail: {
              endpoint: cleanEndpoint,
              isBackground:
                cleanEndpoint.includes('notifications') ||
                cleanEndpoint.includes('telemetry') ||
                cleanEndpoint.includes('monitors'),
            },
          })
        );
      }
    }
    throw err;
  }

  const data = await response.json();
  if (data && data.csrf_token) {
    localStorage.setItem('helpotron_csrf_token', data.csrf_token);
  }

  // Support both raw data and axios-style .data access
  if (data && typeof data === 'object') {
    if (!('data' in data)) {
      Object.defineProperty(data, 'data', {
        get() { return this; },
        enumerable: false,
        configurable: true
      });
    }
  }
  return data;
}

// ── Honest Error Helpers (b1-s4, Stitch v6) ────────────────────────────────
// Re-exported from the canonical module so existing imports keep working. The
// bodies used to live here and both of them JSON.stringified the backend detail
// straight onto the screen; see lib/errors.js for the whole story.
export {
  humanError,
  humanMessage,
  isAuthError,
  isPermissionError,
  isNotFoundError,
  isRateLimitError,
  isServerError,
} from './lib/errors.js';

// The one helper the request path itself needs: a single sentence, never JSON.
function buildApiErrorMessage(status, detail) {
  return humanError({ status, detail }).message;
}

export function getErrorMessage(err, fallback = 'Operation failed. Please try again.') {
  return humanError(err, fallback).message;
}

export function createHonestError(status, message, code = 'API_ERROR') {
  const err = new Error(message || `API error ${status}`);
  err.status = status;
  err.code = code;
  err.timestamp = new Date().toISOString();
  err.human = humanError(err);
  return err;
}

export const api = {
  get: (endpoint, opts = {}) => request(endpoint, { method: 'GET', ...opts }),
  post: (endpoint, data, opts = {}) => request(endpoint, { method: 'POST', body: JSON.stringify(data), ...opts }),
  put: (endpoint, data, opts = {}) => request(endpoint, { method: 'PUT', body: JSON.stringify(data), ...opts }),
  delete: (endpoint, opts = {}) => request(endpoint, { method: 'DELETE', ...opts }),
  request,

  // Auth endpoints
  login: (public_id, password, code = null, turnstile_token = null) => request('/api/login', { method: 'POST', body: JSON.stringify({ public_id, password, code, two_factor_code: code, turnstile_token }) }),
  publicConfig: () => request('/api/public-config', { method: 'GET' }),
  logout: () => request('/api/logout', { method: 'POST' }),
  me: () => request('/api/me', { method: 'GET' }),
  signup: (public_id, password, turnstileToken = null) => request('/api/signup', { method: 'POST', body: JSON.stringify({ public_id, password, turnstile_token: turnstileToken }) }),
  adminCheck: () => request('/api/admin/check', { method: 'GET' }),
  // Owner 2026-09-19: `email` is a real destination now. The server refuses to
  // invent one, so email 2FA must carry the address the user typed.
  setup2FA: (method = 'totp', phone = null, email = null) => request('/api/auth/2fa/setup', { method: 'POST', body: JSON.stringify({ method, phone_number: phone, email }) }),
  verifySetup2FA: (method, code, secret, phone = null, email = null) => request('/api/auth/2fa/verify-setup', { method: 'POST', body: JSON.stringify({ method, code, secret, phone_number: phone, email }) }),
  // Telegram bot ↔ My Agent (08-31, operator): user's own bot token.
  telegramAgentStatus: () => request('/api/telegram-agent/status', { method: 'GET' }),
  telegramAgentConnect: (token) => request('/api/telegram-agent/connect', { method: 'POST', body: JSON.stringify({ token }) }),
  telegramAgentDisconnect: () => request('/api/telegram-agent/disconnect', { method: 'POST', body: JSON.stringify({}) }),
  sendChallenge2FA: (method) => request('/api/auth/2fa/send-challenge', { method: 'POST', body: JSON.stringify({ method }) }),
  disable2FA: (code) => request('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }),
  // Owner 09-06: a redeemable referral code = one-time order discount (30% new
  // user / 15% existing). Never awards tokens.
  referralRedeem: (code) => request('/api/referrals/redeem', { method: 'POST', body: JSON.stringify({ code }) }),

  // Health and data
  health: () => request('/api/health', { method: 'GET' }),
  dashboard: (userId, limit = 50, offset = 0) => request(`/api/dashboard?public_id=${userId}&limit=${limit}&offset=${offset}`, { method: 'GET' }),
  studyGuide: (body) => request('/api/study-guide', { method: 'POST', body: JSON.stringify(body) }),
  flashcards: (body) => request('/api/flashcards', { method: 'POST', body: JSON.stringify(body) }),
  practiceTest: (body) => request('/api/practice-test', { method: 'POST', body: JSON.stringify(body) }),
  summary: (body) => request('/api/summary', { method: 'POST', body: JSON.stringify(body) }),

  // FIX B3: SSE streaming generation with live 4-step progress via /api/generate/stream/{kind}.
  // onProgress(evt) fires per progress frame ({step, total, label}); resolves with the
  // material payload; rejects with the in-band error detail when the stream fails.
  generateStream: async (kind, body, onProgress) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Public-ID': getUserId(),
    };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // DEMO MODE: simulate the SSE stream with hardcoded sample material.
    if (isDemoMode()) {
      return mockGenerateStream(kind, body, onProgress);
    }
    const run = async () => {
      const response = await fetch(`${getBaseUrl()}/api/generate/stream/${kind}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.detail) message = parsed.detail;
        } catch { /* raw body — keep as message */ }
        const err = new Error(message);
        err.status = response.status;
        throw err;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop();
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          if (evt.event === 'progress' && typeof onProgress === 'function') onProgress(evt);
          else if (evt.event === 'done') result = evt.material;
          else if (evt.event === 'error') throw new Error(evt.detail || 'Generation failed');
        }
      }
      if (!result) throw new Error('Generation stream ended without a result');
      return result;
    };
    try {
      return await run();
    } catch (err) {
      if (isQueueError(err)) {
        // Budget consumed (operator 08-31): the SSE handler never started, so
        // re-run the whole stream once RAM frees up.
        return queueRetry(run);
      }
      throw err;
    }
  },
  updateSettings: (settings) => request('/api/user/settings', { method: 'PATCH', body: JSON.stringify(settings) }),

  /* ── Trash (soft delete) ─────────────────────────────────────────────────
   * Deletes are recoverable for a retention window; these are the operations
   * behind the Settings → Trash panel. */
  listTrash: () => request('/api/trash', { method: 'GET' }),
  restoreTrashItem: (id) => request(`/api/trash/${id}/restore`, { method: 'POST' }),
  purgeTrashItem: (id) => request(`/api/trash/${id}`, { method: 'DELETE' }),
  restoreAllTrash: () => request('/api/trash/restore-all', { method: 'POST' }),
  emptyTrash: () => request('/api/trash', { method: 'DELETE' }),
  deleteLibraryMaterial: (id) => request(`/api/library/materials/${id}`, { method: 'DELETE' }),
  billingPortal: () => request('/api/billing/portal', { method: 'POST' }),

  /* ── API keys (extension credential) ─────────────────────────────────────
   * The extension no longer logs in: the user generates a key here and pastes
   * it in. create() returns the plaintext ONCE — it is not recoverable. */
  listApiKeys: () => request('/api/keys', { method: 'GET' }),
  createApiKey: (body) => request('/api/keys', { method: 'POST', body: JSON.stringify(body || {}) }),
  updateApiKey: (id, body) => request(`/api/keys/${id}`, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  deleteApiKey: (id) => request(`/api/keys/${id}`, { method: 'DELETE' }),
  getAgentActions: () => request('/api/agent/actions'),
  undoAgentAction: (actionId) => request(`/api/agent/actions/${actionId}/undo`, { method: 'POST' }),
  pay: (body) => request('/api/payments', { method: 'POST', body: JSON.stringify(body) }),
  discount: (body) => request('/api/discount', { method: 'POST', body: JSON.stringify(body) }),

  // Assignment Cards & Overlord Dashboard
  assignmentCards: () => request('/api/assignments/cards', { method: 'GET' }),
  assignmentFullView: (id) => request(`/api/assignment/${id}/full-view`, { method: 'GET' }),
  launchToDocPayload: (id) => request(`/api/assignment/${id}/launch-doc-payload`, { method: 'GET' }),
  materialsFor: (publicId, kind = 'all') => request(`/api/materials/${publicId}/${kind}`, { method: 'GET' }),
  agentMode: () => request('/api/agent/mode', { method: 'GET' }),
  setAgentMode: (mode) => request('/api/agent/mode', { method: 'POST', body: JSON.stringify({ mode, is_session_override: true }) }),
  agentPermissionsPending: () => request('/api/agent/permissions/pending', { method: 'GET' }),
  agentPermissionRespond: (data) => request('/api/agent/permission/respond', { method: 'POST', body: JSON.stringify(data) }),
  agentPermissionRules: () => request('/api/agent/permissions/rules', { method: 'GET' }),
  addAgentPermissionRule: (rule) => request('/api/agent/permissions/rules', { method: 'POST', body: JSON.stringify({ rule }) }),
  deleteAgentPermissionRule: (rule) => request('/api/agent/permissions/rules/delete', { method: 'POST', body: JSON.stringify({ rule }) }),
  agentChat: (data) => request('/api/agent/chat', { method: 'POST', body: JSON.stringify(data) }),
  agentChatStream: async (data, onEvent) => {
    if (isDemoMode()) {
      if (typeof onEvent === 'function') {
        onEvent({ type: 'reasoning', delta: 'Analyzing study request in demo mode...\n' });
        await new Promise((r) => setTimeout(r, 200));
        onEvent({ type: 'delta', delta: 'Hello! I am your study assistant. How can I help you today?' });
        onEvent({ type: 'done', reply: 'Hello! I am your study assistant. How can I help you today?' });
      }
      return { status: 'success', reply: 'Hello! I am your study assistant. How can I help you today?' };
    }
    const headers = {
      'Content-Type': 'application/json',
      'X-Public-ID': getUserId(),
    };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${getServer()}/api/agent/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(data),
      signal: data?.signal || undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.detail) message = parsed.detail;
      } catch {}
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalReply = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop();
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }
        if (evt.type === 'reasoning') {
          if (typeof onEvent === 'function') onEvent(evt);
        } else if (evt.type === 'delta') {
          finalReply += evt.delta || '';
          if (typeof onEvent === 'function') onEvent(evt);
        } else if (evt.type === 'done') {
          finalReply = evt.reply || finalReply;
          if (typeof onEvent === 'function') onEvent(evt);
          return evt;
        } else if (evt.type === 'unavailable') {
          if (typeof onEvent === 'function') onEvent(evt);
          return { status: 'unavailable', reason: evt.reason };
        } else if (evt.type === 'error') {
          if (typeof onEvent === 'function') onEvent(evt);
          throw new Error(evt.message || 'Streaming error');
        }
      }
    }
    return { status: 'success', reply: finalReply };
  },
  importFromUrl: async (data) => {
    if (isDemoMode()) {
      await new Promise((r) => setTimeout(r, 400));
      return {
        id: Math.floor(Math.random() * 1000) + 100,
        title: data?.title || 'Imported Assignment',
        subject: data?.subject || 'General Study',
        prompt: data?.url || 'Imported from URL',
        status: 'pending',
      };
    }
    return request('/api/assignments/import-from-url', { method: 'POST', body: JSON.stringify(data) });
  },
  // Composer paperclip (operator 08-28): the REAL file goes to the agent —
  // FormData {file, text} → server OCR/extracts and forwards to the chat.
  agentChatAttach: async (formData) => {
    if (isDemoMode()) {
      await new Promise((r) => setTimeout(r, 350));
      return { status: 'success', reply: 'I received your file (demo mode).' };
    }
    const headers = { 'X-Public-ID': getUserId() };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${getServer()}/api/agent/chat/attach`, {
      method: 'POST', credentials: 'include', headers, body: formData,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Attachment send failed');
    return res.json();
  },
  agentThreads: () => request('/api/agent/threads', { method: 'GET' }),
  agentThreadCreate: () => request('/api/agent/threads', { method: 'POST', body: JSON.stringify({}) }),
  agentChatHistory: (key) => request(`/api/agent/chat/${key}`, { method: 'GET' }),
  updateAssignment: (id, updates) => request(`/api/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  getSubagentTeam: (id) => request(`/api/assignments/${id}/subagent-team`, { method: 'GET' }),
  interruptSubagentTeam: (id, reason = 'Interrupted by student') => request(`/api/assignments/${id}/subagent-team/interrupt`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ── Direction picker & lifecycle (09-01): choose what the subagent team
  // should build, mark the work done, archive to history, export as JSON.
  getAssignmentDirection: (id) => request(`/api/assignments/${id}/direction`, { method: 'GET' }),
  chooseAssignmentDirection: (id, direction, customText = null) => request(`/api/assignments/${id}/choose-direction`, { method: 'POST', body: JSON.stringify({ direction, custom_text: customText || null }) }),
  markAssignmentDone: (id) => request(`/api/assignments/${id}/mark-done`, { method: 'POST' }),
  archiveAssignment: (id) => request(`/api/assignments/${id}/archive`, { method: 'POST' }),
  // Export an assignment (or a whole subject bubble — assignments + materials
  // + messages + agent_actions) as a JSON attachment. Needs the raw bytes and
  // the Content-Disposition filename, so it fetches with its own auth headers
  // like the multipart helpers above instead of request() (which json()-parses).
  exportAssignmentData: async ({ assignment_id, bubble } = {}) => {
    const params = new URLSearchParams();
    if (assignment_id != null) params.set('assignment_id', assignment_id);
    else if (bubble) params.set('bubble', bubble);
    if (!params.toString()) throw new Error('Export needs assignment_id or bubble.');
    // DEMO MODE: hand back a small sample export so the button works offline.
    if (isDemoMode()) {
      const payload = {
        exported_at: new Date().toISOString(),
        source: assignment_id != null ? `assignment #${assignment_id}` : `bubble "${bubble}"`,
        assignments: assignment_id != null ? [{ id: assignment_id, demo: true }] : [],
        note: 'Demo-mode export — sign in for real data.',
      };
      triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `helpotron_demo_export_${Date.now()}.json`);
      return { filename: `helpotron_demo_export_${Date.now()}.json`, demo: true };
    }
    const headers = { 'X-Public-ID': getUserId() };
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${getBaseUrl()}/api/assignments/export?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    if (!response.ok) {
      const text = await response.text();
      let message = text || `HTTP ${response.status}`;
      try { const parsed = JSON.parse(text); if (parsed && parsed.detail) message = parsed.detail; } catch { /* raw body is already readable — keep it */ }
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    const disposition = response.headers.get('content-disposition') || '';
    // RFC 5987 filename* (UTF-8'') wins; plain filename= falls back; a
    // sane generated name is the last resort so the download never lands
    // unnamed.
    const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(disposition);
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
    const fallback = `helpotron_export_${assignment_id != null ? `assignment_${assignment_id}` : 'bubble'}_${Date.now()}.json`;
    const filename = ((star ? decodeURIComponent(star[1]) : (plain ? plain[1] : '')) || fallback).trim() || fallback;
    const blob = await response.blob();
    triggerDownload(blob, filename);
    return { filename };
  },

  // Turn-in (08-27): mark an assignment as turned in; it moves into history.
  listAssignments: (history) => request(`/api/assignments${history != null ? `?history=${history}` : ''}`, { method: 'GET' }),
  turnInAssignment: (id, turnedIn = true) => request(`/api/assignments/${id}/turn-in`, { method: 'PATCH', body: JSON.stringify({ turned_in: turnedIn }) }),
  getTurnedInAssignments: () => request('/api/assignments/turned-in', { method: 'GET' }),

  // ── My Agent: permanent memory, files, compaction (Experience Rewrite, 08-22)
  getAgentMemory: () => request('/api/agent/memory', { method: 'GET' }),
  appendAgentMemory: (text) => request('/api/agent/memory', { method: 'POST', body: JSON.stringify({ text }) }),
  replaceAgentMemory: (entries) => request('/api/agent/memory', { method: 'PUT', body: JSON.stringify({ entries }) }),
  deleteAgentMemory: (entryId) => request(`/api/agent/memory/${entryId}`, { method: 'DELETE' }),
  listAgentFiles: () => request('/api/agent/files', { method: 'GET' }),
  deleteAgentFile: (fileId) => request(`/api/agent/files/${fileId}`, { method: 'DELETE' }),
  compactAgentChat: () => request('/api/agent/chat/compact', { method: 'POST' }),
  uploadAgentFile: async (file, kind) => {
    if (isDemoMode()) {
      await new Promise((r) => setTimeout(r, 350));
      return { status: 'ok', file: { id: `f_demo_${Date.now()}`, file_name: file.name, kind, size_bytes: file.size, created_at: new Date().toISOString() } };
    }
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    const headers = { 'X-Public-ID': getUserId() };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`${getServer()}/api/agent/files/upload`, {
      method: 'POST', credentials: 'include', headers, body: form,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Agent file upload failed');
    return res.json();
  },

  // ── Avatar / subject image uploads (PNG/JPG) ──────────────────────────────
  uploadAvatar: async (file, kind, subject) => {
    if (isDemoMode()) {
      await new Promise((r) => setTimeout(r, 350));
      return { status: 'ok', url: URL.createObjectURL(file), kind, subject: subject || null };
    }
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    if (subject) form.append('subject', subject);
    const headers = { 'X-Public-ID': getUserId() };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`${getServer()}/api/uploads/avatar`, {
      method: 'POST', credentials: 'include', headers, body: form,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Avatar upload failed');
    return res.json();
  },
  simulationStatus: () => request('/api/simulation/status', { method: 'GET' }),
  simulationToggle: (enabled) => request('/api/simulation/toggle', { method: 'POST', body: JSON.stringify({ enabled }) }),
  simulationSeed: () => request('/api/simulation/seed', { method: 'POST' }),
  // Settings, Custom Styles, TRIO, Models & Academic Levels
  userSettings: () => request('/api/user/settings', { method: 'GET' }),
  getUserSettings: () => request('/api/user/settings', { method: 'GET' }),
  getAcademicLevels: () => request('/api/user/academic-levels', { method: 'GET' }),
  getAvailableModels: () => request('/api/user/models', { method: 'GET' }),
  resolveEffortScore: (score) => request(`/api/user/effort-score/resolve?score=${score || 500}`, { method: 'GET' }),
  getCustomSubjects: () => request('/api/user/custom-subjects', { method: 'GET' }),
  addCustomSubject: (data) => request('/api/user/custom-subjects', { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomSubject: (id) => request(`/api/user/custom-subjects/${id}`, { method: 'DELETE' }),
  getCustomBubbles: () => request('/api/user/custom-bubbles', { method: 'GET' }),
  addCustomBubble: (data) => request('/api/user/custom-bubbles', { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomBubble: (id) => request(`/api/user/custom-bubbles/${id}`, { method: 'DELETE' }),
  exportAllUserData: () => request('/api/user/data/export-all', { method: 'GET' }),
  softResetData: () => request('/api/user/data/soft-reset', { method: 'POST' }),
  permanentDeleteRequest: (data) => request('/api/user/data/permanent-delete-request', { method: 'POST', body: JSON.stringify(data) }),
  getAssignmentHistory: (subject) => request(`/api/user/assignment-history${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`, { method: 'GET' }),
  getLeaderboard: () => request('/api/user/leaderboard', { method: 'GET' }),
  updateLeaderboardAlias: (data) => request('/api/user/leaderboard/alias', { method: 'POST', body: JSON.stringify(data) }),
  addStyleSample: (data) => request('/api/user/styles', { method: 'POST', body: JSON.stringify(data) }),
  deleteStyleSample: (id) => request(`/api/user/styles/${id}`, { method: 'DELETE' }),
  saveTrioRule: (data) => request('/api/user/trio', { method: 'POST', body: JSON.stringify(data) }),
  deleteTrioRule: (id) => request(`/api/user/trio/${id}`, { method: 'DELETE' }),
  resolveTrioContext: (data) => request('/api/user/trio/resolve', { method: 'POST', body: JSON.stringify(data) }),

  // Data Lake & Micro-Credits
  submitDataLakeMicrocredits: (data) => request('/api/datalake/microcredits/submit', { method: 'POST', body: JSON.stringify(data) }),

  // Mint a single-use key to seal an error report. See lib/reportPayload.js —
  // the key never travels back, only its id does.
  createReportKey: () => request('/api/reports/key', { method: 'POST' }),
  getMicrocreditsHistory: (userId) => request(`/api/datalake/microcredits/history?user_id=${userId}`, { method: 'GET' }),
  redeemMicrocredits: (data) => request('/api/datalake/microcredits/redeem', { method: 'POST', body: JSON.stringify(data) }),
  listFeedback: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/datalake/feedback/list${q ? '?' + q : ''}`, { method: 'GET' });
  },
  updateFeedbackStatus: (id, status) => request(`/api/datalake/feedback/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  deleteDataLakeEntry: (id) => request(`/api/datalake/${id}`, { method: 'DELETE' }),
  exportDataLakeEntries: () => request('/api/datalake/export.json', { method: 'GET' }),

  // Referrals (40-digit single-use codes)
  getReferralCode: () => request('/api/referrals/code', { method: 'GET' }),
  generateReferralCode: () => request('/api/referrals/generate', { method: 'POST' }),
  redeemReferralCode: (code) => request('/api/referrals/redeem', { method: 'POST', body: JSON.stringify({ code }) }),
  getReferralStats: () => request('/api/referrals/stats', { method: 'GET' }),
  deleteReferralCode: (id) => request(`/api/referrals/${id}`, { method: 'DELETE' }),

  // Mandatory 2FA Purchase Authentication
  sendPurchaseChallenge: (data) => request('/api/auth/2fa/purchase-challenge', { method: 'POST', body: JSON.stringify(data) }),
  verifyPurchaseChallenge: (data) => request('/api/auth/2fa/purchase-verify', { method: 'POST', body: JSON.stringify(data) }),

  // Message Admin Direct Channel
  changePassword: (currentPassword, newPassword) => request('/api/user/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }),
  // ── Account profile (owner 2026-09-21) ────────────────────────────────────
  // Display name and avatar are preferences; the public ID is the login
  // identifier, so it goes through its own route that demands the password and
  // refuses an API key outright.
  getProfile: () => request('/api/user/profile', { method: 'GET' }),
  updateProfile: (patch) => request('/api/user/profile', { method: 'PATCH', body: JSON.stringify(patch) }),
  changePublicId: (newPublicId, password) =>
    request('/api/user/profile/public-id', {
      method: 'POST',
      body: JSON.stringify({ new_public_id: newPublicId, password }),
    }),

  // Forgot-password / recovery flow (operator 08-28)
  recoveryOptions: (publicId) => request(`/api/recovery/options?public_id=${encodeURIComponent(publicId)}`, { method: 'GET' }),
  recoveryRequest: (publicId, method) => request('/api/recovery/request', { method: 'POST', body: JSON.stringify({ public_id: publicId, method }) }),
  recoveryVerify: (payload) => request('/api/recovery/verify', { method: 'POST', body: JSON.stringify(payload) }),
  recoverySetContact: (data) => request('/api/recovery/contact', { method: 'POST', body: JSON.stringify(data) }),
  sendMessageToAdmin: (data, file = null) => {
    const fd = new FormData();
    fd.append('subject', data.subject || 'Direct Message to Admin');
    fd.append('category', data.category || 'general');
    fd.append('message', data.message);
    if (file) fd.append('attachment', file);
    const headers = { 'X-Public-ID': getUserId() };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${getBaseUrl()}/api/user/message-admin`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: fd,
    }).then((r) => r.json().then((d) => { if (!r.ok) throw new Error(d.detail || 'send failed'); return d; }));
  },
  getMyAdminMessages: () => request('/api/user/my-admin-messages', { method: 'GET' }),
  getAllAdminMessages: () => request('/api/admin/messages', { method: 'GET' }),
  replyToAdminMessage: (messageId, reply) => request(`/api/admin/messages/${messageId}/reply`, { method: 'POST', body: JSON.stringify({ reply }) }),
  deleteAdminMessage: (messageId) => request(`/api/admin/messages/${messageId}`, { method: 'DELETE' }),
  clearAdminMessages: () => request('/api/admin/messages', { method: 'DELETE' }),

  // Admin endpoints
  adminUsers: () => request('/api/admin/users', { method: 'GET' }),
  adminAnalytics: () => request('/api/admin/analytics', { method: 'GET' }),
  adminAdjustCredits: (userId, amount, reason) => request(`/api/admin/user/${userId}/credits?amount=${amount}&reason=${encodeURIComponent(reason)}`, { method: 'POST' }),
  adminGrantTokens: (userId, amount) => request('/api/admin/tokens/grant', { method: 'POST', body: JSON.stringify({ public_id: userId, amount }) }),
  adminSetTokens: (userId, amount) => request('/api/admin/tokens/set', { method: 'POST', body: JSON.stringify({ public_id: userId, amount }) }),
  adminSetPlan: (userId, plan) => request(`/api/admin/user/${userId}/plan?plan=${plan}`, { method: 'POST' }),
  adminResetPassword: (userId, newPassword) => request(`/api/admin/user/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) }),
  // Control Center: change a user's password without their current one (08-28);
  // optional recovery_code ties the change to an open recovery request.
  adminChangePassword: (userId, newPassword, recoveryCode = null) => request(`/api/admin/user/${userId}/change-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword, recovery_code: recoveryCode || null }) }),
  adminBanUser: (userId) => request(`/api/admin/user/${userId}/ban`, { method: 'POST' }),
  adminUnbanUser: (userId) => request(`/api/admin/user/${userId}/unban`, { method: 'POST' }),
  adminTempBanUser: (userId, hours) => request(`/api/admin/user/${userId}/tempban?hours=${encodeURIComponent(hours)}`, { method: 'POST' }),
  adminKickUser: (userId) => request(`/api/admin/user/${userId}/kick`, { method: 'POST' }),
  adminDeleteUser: (userId) => request(`/api/admin/user/${userId}`, { method: 'DELETE' }),
  adminActAsUser: (userId) => request(`/api/admin/user/${userId}/act`, { method: 'POST' }),
  // Control Center: admin → user direct notice (pops on their screen, 08-28)
  adminNotifyUser: (publicId, message, subject = 'Message from Admin') => request('/api/admin/notify-user', { method: 'POST', body: JSON.stringify({ public_id: publicId, subject, message }) }),
  // User side: poll + dismiss admin notices
  myAdminNotices: () => request('/api/user/admin-notices', { method: 'GET' }),
  markAdminNoticesRead: (noticeIds) => request('/api/user/admin-notices/read', { method: 'POST', body: JSON.stringify({ notice_ids: noticeIds }) }),
  adminSearch: (q) => request(`/api/admin/search?q=${encodeURIComponent(q)}`, { method: 'GET' }),
  // Control Center · System Map: live subsystem node health + p95 latency.
  adminSystemMapNodes: () => request('/api/admin/system-map/nodes', { method: 'GET' }),

  // Cost Monitoring & Per-User Token Multipliers
  adminCostsSummary: () => request('/api/admin/costs/summary', { method: 'GET' }),
  adminUsersCosts: () => request('/api/admin/costs/users', { method: 'GET' }),
  adminSetUserMultiplier: (publicId, multiplier) => request(`/api/admin/costs/users/${publicId}/multiplier`, { method: 'POST', body: JSON.stringify({ multiplier }) }),

  // User Budget, Effort Level & Pre-Flight Cost Estimator
  getUserBudget: (userId) => request(`/api/admin/costs/budget?user_id=${userId}`, { method: 'GET' }),
  getCostIntelligence: () => request('/api/features/costs/intelligence', { method: 'GET' }),
  updateUserBudget: (data, userId) => request(`/api/admin/costs/budget?user_id=${userId}`, { method: 'POST', body: JSON.stringify(data) }),
  estimateTaskCost: (data, userId) => request(`/api/admin/costs/estimate?user_id=${userId}`, { method: 'POST', body: JSON.stringify(data) }),

  // Universal Assignment Dump & Overlord Routing
  uploadDumpFile: async (formData) => {
    const headers = {
      'X-Public-ID': getUserId(),
    };
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
    const res = await fetch(`${getServer()}/api/dump/upload`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Dump upload failed');
    }
    return res.json();
  },
  getDumpList: (userId, status) => request(`/api/dump/list?user_id=${userId}${status ? `&status=${status}` : ''}`, { method: 'GET' }),
  // Dump pasted text (no file) — filed under a subject so an agent can find it.
  uploadDumpText: (payload) => request('/api/dump/upload-text', { method: 'POST', body: JSON.stringify(payload) }),
  // Raw material filed under one subject (the dump list endpoint filters by it).
  listSubjectDumps: (subject, limit = 20) =>
    request(`/api/dump/list?subject=${encodeURIComponent(subject)}&limit=${limit}`, { method: 'GET' }),
  routeDumpItem: (dumpId, payload, userId) => request(`/api/dump/${dumpId}/route?user_id=${userId}`, { method: 'POST', body: JSON.stringify(payload) }),
  finalizeDumpItem: (dumpId, action) => request(`/api/dump/${dumpId}/finalize`, { method: 'POST', body: JSON.stringify({ action }) }),
  batchEstimateDumpItems: (ids = '') => request(`/api/dump/batch/estimate${ids ? `?ids=${encodeURIComponent(ids)}` : ''}`, { method: 'GET' }),
  batchFinalizeDumpItems: (payload) => request('/api/dump/batch/finalize', { method: 'POST', body: JSON.stringify(payload) }),
  deleteDumpItem: (dumpId) => request(`/api/dump/${dumpId}`, { method: 'DELETE' }),

  // Extension Version & Updates
  getExtensionVersion: () => request('/api/extension/version', { method: 'GET' }),
  checkExtensionUpdate: (currentVersion) => request('/api/extension/check-update', { method: 'POST', body: JSON.stringify({ current_version: currentVersion }) }),

  // Free Trial (2FA + 1-cent payment verification, owner 09-06)
  getTrialStatus: () => request('/api/trial/status', { method: 'GET' }),
  verifyTrialPayment: () => request('/api/trial/payment-verify', { method: 'POST' }),
  activateTrial: () => request('/api/trial/activate', { method: 'POST' }),

  // FERPA / GDPR Self-Service Account Deletion
  deleteAccount: () => request('/api/user/account', { method: 'DELETE' }),
};

export default api;
