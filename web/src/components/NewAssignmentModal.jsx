/* ────────────────────────────────────────────────────────────────────────────
 * NewAssignmentModal.jsx — "New Assignment" creation modal for the
 * Assignments view (operator 08-28: the session-backed POST /assignments
 * route existed but the UI had no in-app path to reach it; the only
 * creators were the browser extension and the agent).
 *
 * Schema (server/server/assignments.py → AssignmentIn):
 *   title     : str          (required)
 *   prompt    : str          (default "")
 *   rubric    : not part of AssignmentIn — the canonical rubric slot is
 *               Assignment.progress["rubric"] (the same slot the extension
 *               contract writes and /assignment/{id}/full-view reads). A
 *               two-step write keeps the documented contract: create via
 *               POST /assignments, then PATCH /api/assignments/{id} with
 *               {"progress": {"rubric": ...}} (deep-merge) when the user
 *               supplied one.
 *   due_date  : 'YYYY-MM-DD' (matches the extension/mock format)
 *   file_urls : []           (no attachments in this flow)
 *
 * Requests mirror api.js exactly (session cookie + cookie-first CSRF token
 * in X-CSRF-Token + X-Public-ID + Bearer) — but this module needs the HTTP
 * status and the Retry-After header on 429, which the shared client's
 * throw-new-Error(message) path discards. The mirror lives here so the
 * shared client file stays untouched.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, FileText, Loader2, Link2 } from 'lucide-react';
import { getServer, getUserId } from '../api.js';
import { isDemoMode, resolveDemoRequest } from '../mock.js';

/* cookie-first CSRF read — same order and fallback as api.js getCsrfToken() */
function readCsrfCookie() {
  const name = 'csrf_token=';
  const decoded = decodeURIComponent(document.cookie);
  for (const part of decoded.split(';')) {
    const p = part.trim();
    if (p.indexOf(name) === 0) return p.slice(name.length);
  }
  return localStorage.getItem('helpotron_csrf_token') || null;
}

export class AssignmentApiError extends Error {
  constructor(message, { status = 0, retryAfter = null } = {}) {
    super(message);
    this.name = 'AssignmentApiError';
    this.status = status;
    this.retryAfter = retryAfter; // seconds (Retry-After header), null when absent
  }
}

/** Session-authenticated JSON request mirroring api.js header/credential rules. */
async function assignmentRequest(method, path, body) {
  const url = `${getServer() || ''}${path}`;
  const rawBody = body != null ? JSON.stringify(body) : null;

  // Demo mode: an endpoint registered in mock.js answers from sample data;
  // unmocked endpoints fall through to the real network — exactly the
  // fallthrough behavior of api.js request().
  if (isDemoMode()) {
    const demo = await resolveDemoRequest(method, url, rawBody);
    if (demo !== null && demo !== undefined) return demo;
  }

  const headers = { 'Content-Type': 'application/json' };
  const userId = getUserId();
  if (userId) headers['X-Public-ID'] = userId;
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'TRACE') {
    const csrf = readCsrfCookie();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: rawBody,
  }).catch((e) => {
    throw new AssignmentApiError(`Could not reach the server (${e.message}).`,
      { status: 0 });
  });

  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!response.ok) {
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    // HTML gateway/error pages must never render into the UI as source.
    let message = ct.includes('text/html')
      ? `The server gateway returned ${response.status} (temporarily unavailable). Try again in a few seconds.`
      : (data && data.detail ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : text || `HTTP ${response.status}`);
    const retryRaw = response.headers.get('Retry-After');
    const retryAfter = retryRaw ? parseInt(retryRaw, 10) : null;
    if (response.status === 429) {
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : response.headers.get('Retry-After');
      message = `Rate limited (429). ${wait ? `Retry after ${wait}s.` : 'Please wait a moment and try again.'}` +
        (data && data.detail && !String(data.detail).startsWith('Rate limit') ? ` — ${data.detail}` : '');
    }
    throw new AssignmentApiError(message, { status: response.status, retryAfter });
  }

  if (data && data.csrf_token) {
    localStorage.setItem('helpotron_csrf_token', data.csrf_token);
  }
  return data;
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'block font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1.5';

export default function NewAssignmentModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [rubric, setRubric] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | creating | saving_rubric
  const [createdId, setCreatedId] = useState(null);
  // Import-from-link tab (feature #79): shown only when the operator has the
  // flag on (/api/public-config → import_from_url_enabled).
  const [importEnabled, setImportEnabled] = useState(false);
  const [tab, setTab] = useState('manual'); // manual | link
  const [impUrl, setImpUrl] = useState('');
  const [impDesc, setImpDesc] = useState('');
  const [importPhase, setImportPhase] = useState('idle'); // idle | importing
  const titleRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${getServer() || ''}/api/public-config`, { credentials: 'include' });
        const d = await r.json();
        if (alive && d && d.import_from_url_enabled) setImportEnabled(true);
      } catch { /* flag intentionally default-off on failure */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && (phase === 'idle' || phase === 'saving_rubric') && importPhase === 'idle') onClose();
    };
    window.addEventListener('keydown', onKey);
    titleRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, importPhase]);

  const busy = phase === 'creating' || phase === 'saving_rubric';
  const canSubmit = title.trim().length > 0 && !busy;

  const createAssignment = async () => {
    setError('');
    setPhase('creating');
    try {
      const res = await assignmentRequest('POST', '/api/assignments', {
        title: title.trim(),
        prompt,
        due_date: dueDate || null,
        file_urls: [],
      });
      const id = res?.assignment_id;
      if (id == null) {
        setPhase('idle');
        setError('Server accepted the assignment but returned no id. Reload the list to check.');
        return;
      }
      setCreatedId(id);
      // Rubric lives in progress.rubric — the canonical slot read by
      // /assignment/{id}/full-view. Deep-merge via the existing PATCH.
      if (rubric.trim()) {
        setPhase('saving_rubric');
        try {
          await assignmentRequest('PATCH', `/api/assignments/${id}`, { progress: { rubric: rubric.trim() } });
          window.dispatchEvent(new CustomEvent('helpotron:assignment-created', { detail: { assignment_id: id, title: title.trim() } }));
          onCreated({ assignment_id: id, title: title.trim(), rubric_saved: true });
        } catch (e) {
          setPhase('saving_rubric');
          setError(`Assignment #${id} was created, but saving its rubric failed: ${e.message}`);
        }
        return;
      }
      window.dispatchEvent(new CustomEvent('helpotron:assignment-created', { detail: { assignment_id: id, title: title.trim() } }));
      onCreated({ assignment_id: id, title: title.trim(), rubric_saved: false });
    } catch (e) {
      setPhase('idle');
      setError(e.message || 'Creation failed.');
    }
  };

  const retryRubric = async () => {
    if (createdId == null || !rubric.trim() || busy) return;
    setError('');
    setPhase('saving_rubric');
    try {
      await assignmentRequest('PATCH', `/api/assignments/${createdId}`, { progress: { rubric: rubric.trim() } });
      window.dispatchEvent(new CustomEvent('helpotron:assignment-created', { detail: { assignment_id: createdId, title: title.trim() } }));
      onCreated({ assignment_id: createdId, title: title.trim(), rubric_saved: true });
    } catch (e) {
      setPhase('saving_rubric');
      setError(`Still could not save the rubric: ${e.message}`);
    }
  };

  /** Import-from-link (#79): one POST — the API scrapes (sidecar + graph),
   * routes the subject, and lands the assignment in the bubble. */
  const importFromUrl = async () => {
    setError('');
    setImportPhase('importing');
    try {
      const res = await assignmentRequest('POST', '/api/assignments/import-from-url', {
        url: impUrl.trim(),
        description: impDesc.trim(),
      });
      // Zero-token accounts get a 200 with status insufficient_tokens (same
      // shape as the dump finalize gate) — surface the detail, not an error.
      if (res && res.status === 'insufficient_tokens') {
        setImportPhase('idle');
        setError(res.detail || 'Insufficient tokens to import from a link.');
        return;
      }
      const id = res && res.assignment_id;
      if (id == null) {
        setImportPhase('idle');
        setError('The scrape finished but no assignment id came back. Try again.');
        return;
      }
      window.dispatchEvent(new CustomEvent('helpotron:assignment-created', { detail: { assignment_id: id, title: res.title || impUrl.trim(), subject: res.subject } }));
      onCreated({
        assignment_id: id,
        title: res.title || impUrl.trim(),
        subject: res.subject,
        imported: true,
        rubric_saved: false,
      });
    } catch (e) {
      setImportPhase('idle');
      setError(e.message || 'Import failed.');
    }
  };

  const closeAllowed = phase !== 'creating' && importPhase !== 'importing';

  return (
    <div
      className="fixed inset-0 z-[100] flex p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto aurora-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-assignment-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget && closeAllowed) onClose(); }}
    >
      {/* Modal chrome */}
      <style>{`@keyframes aurora-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes aurora-panel-in { from { opacity: 0; transform: translateY(12px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
.aurora-modal-backdrop { animation: aurora-backdrop-in 0.18s ease-out both }
.aurora-modal-panel { animation: aurora-panel-in 0.22s ease-out both }`}</style>
      <div className="m-auto w-full max-w-xl bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 sm:p-8 space-y-5 text-on-surface shadow-2xl aurora-modal-panel">
        <div className="flex items-center justify-between">
          <h3 id="new-assignment-title" className="font-headline-lg text-title-md text-on-surface flex items-center gap-3">
            <span className="w-9 h-9 rounded-2xl bg-primary/15 flex items-center justify-center text-primary">
              <FileText className="w-4 h-4" />
            </span>
            New Assignment
          </h3>
          <button
            type="button"
            onClick={() => onClose()}
            disabled={!closeAllowed}
            className="text-outline hover:text-on-surface disabled:opacity-40 cursor-pointer transition p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {importEnabled && (
          <div
            className="flex gap-1 p-1 rounded-2xl bg-surface-container-low border border-outline-variant/30"
            role="tablist"
            aria-label="Assignment creation mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'manual'}
              onClick={() => setTab('manual')}
              className={`flex-1 px-3 py-2 rounded-xl font-label-caps text-xs uppercase tracking-wider transition cursor-pointer ${
                tab === 'manual'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Create manually
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'link'}
              onClick={() => setTab('link')}
              className={`flex-1 px-3 py-2 rounded-xl font-label-caps text-xs uppercase tracking-wider transition cursor-pointer ${
                tab === 'link'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Import from link
            </button>
          </div>
        )}

        {tab === 'manual' ? (
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) createAssignment(); }}
        >
          <div>
            <label htmlFor="na-title" className={labelCls}>Title *</label>
            <input
              id="na-title"
              ref={titleRef}
              type="text"
              maxLength={500}
              placeholder="e.g. Essay: Symbolism in Beloved"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="na-due" className={labelCls}>Due date (optional)</label>
            <input
              id="na-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="na-prompt" className={labelCls}>Prompt / instructions (optional)</label>
            <textarea
              id="na-prompt"
              rows={5}
              placeholder="Paste the full assignment instructions, links, or what the instructor expects."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className={`${inputCls} resize-y`}
            />
          </div>

          <div>
            <label htmlFor="na-rubric" className={labelCls}>Rubric / grading criteria (optional)</label>
            <textarea
              id="na-rubric"
              rows={4}
              maxLength={500000}
              placeholder="Grading criteria, point breakdown, or rubric table the agent should follow."
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              className={`${inputCls} resize-y`}
            />
          </div>

          {error && (
            <div className="p-3 bg-error/15 border border-error/30 rounded-xl text-xs text-error font-mono whitespace-pre-wrap" role="alert">
              {error}
              {phase === 'saving_rubric' && createdId != null && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={retryRubric}
                    className="px-3 py-1 bg-error/20 hover:bg-error/30 text-error rounded-lg border border-error/30 font-label-caps text-xs uppercase cursor-pointer"
                  >
                    Retry rubric save
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={!closeAllowed}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant font-label-caps text-xs uppercase tracking-wider transition disabled:opacity-40 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 rounded-xl font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{phase === 'creating' ? 'Creating…' : phase === 'saving_rubric' ? 'Saving rubric…' : 'Create Assignment'}</span>
            </button>
          </div>
        </form>
        ) : importPhase === 'importing' ? (
          <div className="py-10 flex flex-col items-center justify-center gap-6 text-center animate-fadeIn">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 border-4 border-surface-container-high rounded-full" />
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <Link2 className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <div className="font-title-md text-sm font-semibold text-on-surface flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Reading portal page structure…
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Extracting assignment instructions, due dates, and grading rubrics.
              </p>
            </div>
            <div className="w-full max-w-xs space-y-2.5 opacity-40">
              <div className="h-2 bg-on-surface-variant/30 rounded-full animate-pulse w-full" />
              <div className="h-2 bg-on-surface-variant/30 rounded-full animate-pulse w-4/5 mx-auto" />
              <div className="h-2 bg-on-surface-variant/30 rounded-full animate-pulse w-3/5 mx-auto" />
            </div>
          </div>
        ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (impUrl.trim().length >= 8 && importPhase === 'idle') importFromUrl(); }}
        >
          <div>
            <label htmlFor="na-url" className={labelCls}>Assignment link *</label>
            <div className="relative">
              <input
                id="na-url"
                type="url"
                maxLength={2048}
                placeholder="https://yourclassportal.example.com/assignment/123"
                value={impUrl}
                onChange={(e) => setImpUrl(e.target.value)}
                className={inputCls}
              />
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1.5">
              Paste the page that holds the assignment — a class portal, syllabus page, or
              public doc. Helpo reads it, pulls the instructions, and drops it in the right
              subject bubble.
            </p>
          </div>

          <div>
            <label htmlFor="na-impdesc" className={labelCls}>What is it? (optional)</label>
            <textarea
              id="na-impdesc"
              rows={3}
              maxLength={5000}
              placeholder="e.g. APUSH essay on the Cold War, due Thursday"
              value={impDesc}
              onChange={(e) => setImpDesc(e.target.value)}
              className={`${inputCls} resize-y`}
            />
            <p className="font-body-sm text-xs text-on-surface-variant mt-1.5">
              A quick note makes the scrape smarter, and stands in for the page if the
              portal hides the text. Scraping can take up to a minute.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-error/15 border border-error/30 rounded-xl text-xs text-error font-mono whitespace-pre-wrap" role="alert">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={!closeAllowed}
              className="px-4 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant font-label-caps text-xs uppercase tracking-wider transition disabled:opacity-40 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={impUrl.trim().length < 8 || importPhase !== 'idle'}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 rounded-xl font-label-caps text-xs uppercase tracking-wider font-semibold transition cursor-pointer shadow-sm"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Import Assignment</span>
            </button>
          </div>
        </form>
        )}

        <p className="font-body-sm text-xs text-on-surface-variant">
          Assignments you create appear in the workspace and cards; they land in this ledger after being marked completed.
        </p>
      </div>
    </div>
  );
}
