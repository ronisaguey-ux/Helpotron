// Server-backed logic for the extension (owner 2026-09-17).
//
// The extension is a PURE UI. It captures the screen, dispatches primitive
// input through Chrome's debugger, and renders what it is told. It does not
// decide what is allowed.
//
// Why the decisions moved: the crawl scope/robots rules used to live here as
// pure functions, which meant the security boundary was enforced by code the
// user's browser owned — a stale or modified extension could loosen it, and
// every rule change needed a store review to ship. On the server the same rules
// are one deploy away and cannot be edited by the client.
//
// The motion curve and the attribution payload moved for a different reason:
// both had drifted between two implementations, and only one of them could be
// fixed at a time.
//
// LOADING: this is a CLASSIC script (global functions), not an ES module. The
// MV3 service worker runs background.js as a classic worker, which cannot use
// `import()`, and Firefox loads background.js as an EVENT PAGE where
// importScripts does not exist either — so the dual load below mirrors the
// pattern crawl-core.js used. Modules (agent_mode.js) and classic pages
// (popup.js) read these globals from a preceding <script> tag.
//
// Every call carries the user's API key (chrome.storage `api_key`) and every
// failure is returned as a value, never thrown — these sit on the path of a
// live agent and must degrade rather than break it.

(function () {
  'use strict';

  async function _base() {
    const { server } = await chrome.storage.local.get('server');
    return (server || 'https://helpotron.dpdns.org').replace(/\/+$/, '');
  }

  async function _key() {
    const { api_key } = await chrome.storage.local.get('api_key');
    return api_key || '';
  }

  async function _post(path, body, timeoutMs = 15000) {
    const [base, key] = await Promise.all([_base(), _key()]);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) return { ok: false, status: res.status, error: `server ${res.status}` };
      return { ok: true, ...(await res.json()) };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    } finally {
      clearTimeout(t);
    }
  }

  // ── UI copy ───────────────────────────────────────────────────────────────
  // Spinner verbs and the busy notice are server-owned so wording changes do not
  // need a new extension build. The popup caches the payload in storage.

  async function fetchBootstrap() {
    const [base, key] = await Promise.all([_base(), _key()]);
    try {
      const res = await fetch(`${base}/api/extension/bootstrap`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Motion ────────────────────────────────────────────────────────────────
  // A humanlike pointer path. Returns the same {x, y, t} samples the local
  // implementation did, so callers are unchanged.

  async function humanMovePoints(fromX, fromY, toX, toY, opts = {}) {
    const r = await _post('/api/extension/mouse-path', {
      from_x: fromX, from_y: fromY, to_x: toX, to_y: toY, stops: opts.stops || null,
    });
    if (r.ok && Array.isArray(r.points) && r.points.length) return r.points;
    // A straight interpolation keeps the cursor moving if the server is briefly
    // unreachable. This is the one client-side fallback that is safe: the shape
    // of a pointer path is cosmetic, not a rule.
    return [
      { x: fromX, y: fromY, t: 0 },
      { x: toX, y: toY, t: 1 },
    ];
  }

  // ── Crawl policy ──────────────────────────────────────────────────────────
  // One call answers everything the crawl used to work out locally: whether the
  // URL is a course page, what robots says, which discovered links may be
  // visited, and which listings to open next.

  async function crawlPlan({ url, robotsText = '', html = '', crawlPath = '', candidateLinks = null }) {
    const r = await _post('/api/extension/crawl/plan', {
      url, robots_text: robotsText, html, crawl_path: crawlPath,
      candidate_links: candidateLinks,
    });
    if (!r.ok) return { ok: false, error: r.error || 'crawl plan unavailable' };
    return r;
  }

  // ── Attribution ───────────────────────────────────────────────────────────
  // The payload the server stores against an assignment, built server-side so
  // the dedupe key and the routing cannot drift from what the server expects.

  async function buildAssignmentPayload(data) {
    const r = await _post('/api/extension/crawl/payload', { data });
    if (r.ok && r.payload) return r.payload;
    return null;
  }

  // ── Queue / load ──────────────────────────────────────────────────────────
  // Live machine load and queue depth, so the UI can narrate a long wait. The
  // task is never cancelled — it waits for the machine to have room.

  async function fetchQueueStatus() {
    const [base, key] = await Promise.all([_base(), _key()]);
    try {
      const res = await fetch(`${base}/api/extension/queue`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Error text ────────────────────────────────────────────────────────────
  // Owner report (2026-09-23): "the errors literally just flash random backend
  // code on my screen". FastAPI returns `detail` as an ARRAY for validation
  // failures, and `typeof [] === 'object'`, so every naive `data.detail` render
  // either prints the literal JSON or the string "[object Object]". Neither is
  // a sentence a person can act on.
  //
  // This turns any server error payload into one short, human line. It never
  // returns markup, JSON or a traceback: if the only thing available looks like
  // code, it falls back to a plain sentence about the status code.

  const _STATUS_TEXT = {
    400: 'That request was not understood.',
    401: 'Your API key is missing, expired or was deleted. Reconnect in Settings.',
    403: 'Your account is not allowed to do that.',
    404: 'That item no longer exists.',
    409: 'That conflicts with something already saved.',
    413: 'That is too large to send.',
    422: 'Some of the details sent were not valid.',
    429: 'Too many requests — wait a moment and try again.',
    500: 'The server hit an internal error.',
    502: 'The server is restarting. Try again shortly.',
    503: 'Helpotron is temporarily unavailable. Try again shortly.',
    504: 'The server took too long to answer.',
  };

  // Reject anything that reads as machine output rather than a message.
  function _looksHuman(s) {
    if (typeof s !== 'string') return false;
    const t = s.trim();
    if (t.length < 3) return false;
    if (t.length > 240) return false;
    if (/[[\]{}<>]/.test(t)) return false;            // JSON, HTML, python dicts
    if (/^https?:\/\//i.test(t)) return false;         // a bare URL is not a message
    if (/Traceback|Error:|Exception|\bat [a-z]+\.[a-z]+\(/i.test(t)) return false;
    if (/^[A-Z0-9_]{6,}$/.test(t)) return false;       // ERROR_CODE_STYLE
    if (/\n/.test(t)) return false;                    // multi-line = a dump
    return true;
  }

  function humanErrorText(detail, status) {
    const fallback = _STATUS_TEXT[status] || (status ? `Something went wrong (HTTP ${status}).` : 'Something went wrong.');

    // A plain string message is the common, useful case.
    if (typeof detail === 'string') return _looksHuman(detail) ? detail.trim() : fallback;

    // FastAPI validation errors arrive as a list of {loc, msg, type}. The `msg`
    // is the only part written for a human; `loc` names the field, which is the
    // detail that actually helps ("the `title` field is required").
    if (Array.isArray(detail)) {
      const parts = [];
      for (const item of detail) {
        const msg = item && typeof item === 'object' ? (item.msg || item.message) : item;
        if (!_looksHuman(msg)) continue;
        // loc is like ["body","title"] → "title"; skip the body/query marker.
        let field = '';
        if (item && Array.isArray(item.loc)) {
          const bits = item.loc.filter((x) => x !== 'body' && x !== 'query' && x !== 'path' && typeof x === 'string');
          field = bits.length ? ` (${bits[bits.length - 1]})` : '';
        }
        parts.push(msg.trim() + field);
        if (parts.length === 3) break;
      }
      return parts.length ? parts.join('; ') : fallback;
    }

    // Nested objects vary; try the usual message keys before giving up.
    if (detail && typeof detail === 'object') {
      for (const k of ['message', 'msg', 'error', 'reason', 'detail']) {
        if (typeof detail[k] === 'string' && _looksHuman(detail[k])) return detail[k].trim();
      }
      return fallback;
    }

    return fallback;
  }

  const SL = {
    fetchBootstrap, humanMovePoints, crawlPlan,
    buildAssignmentPayload, fetchQueueStatus,
    humanErrorText, looksHumanMessage: _looksHuman,
  };

  // Classic script: publish to the global scope so the worker, the event page
  // and the popup all see one implementation.
  if (typeof globalThis !== 'undefined') globalThis.HelpotronSL = SL;
  // Module consumers may import() this file; the named bindings are attached so
  // both styles work without a second copy of the code.
  if (typeof module !== 'undefined' && module.exports) module.exports = SL;
})();

// Module-style export block, ignored by classic <script> / importScripts loads.
// (Guarded by typeof: a bare `export` would be a syntax error in a classic
// script, so the module consumers read the global instead.)
