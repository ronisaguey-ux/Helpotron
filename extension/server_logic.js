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

  const SL = {
    fetchBootstrap, humanMovePoints, crawlPlan,
    buildAssignmentPayload, fetchQueueStatus,
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
