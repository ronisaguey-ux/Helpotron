/* ────────────────────────────────────────────────────────────────────────────
 * PermissionModal.jsx — FULL permission approval popup (09-01, Bob).
 * Design source: stitch-permission/permission_approval_* (Bob's Stitch
 * screens) — desktop centered card + mobile bottom sheet, error/busy and
 * write-something-else states included. Ported 1:1 onto the app's M3 tokens
 * (index.css STITCH DESIGN TOKENS) — same role names the screens use.
 *
 * Why it exists: before this, a pending agent action surfaced only as a small
 * inline banner 12s after the fact, showing a mode-generic line — never WHAT
 * the agent was about to do. Now the popup appears immediately (the chat
 * response itself carries the permission request) with the concrete change
 * list and all four real decisions the backend supports.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  TriangleAlert, X, ArrowRight, Infinity as InfinityIcon, PenLine, Ban,
  CheckCircle2, Send, XCircle, ShieldCheck, Type, SlidersHorizontal, Loader2,
} from 'lucide-react';

// Mirrors the server's _SETTING_LABELS (overlord_agent.py) so the popup can
// render "font scale → 1" instead of "fontScale: 1".
const SETTING_LABELS = {
  agent_name: 'agent name', name: 'agent name',
  personality: 'personality', instructions: 'instructions',
  effort_score: 'effort score', operation_mode: 'operation mode',
  auto_approved_actions: 'auto-approved actions',
  school_name: 'school', major: 'major', goal: 'goal',
  font_size: 'font size', font_scale: 'font scale', fontScale: 'font scale',
  theme: 'theme', accent: 'accent color', density: 'density',
  compact_mode: 'compact mode', uiStyle: 'UI style', ui_style: 'UI style',
  animation: 'animations', background: 'background',
  custom_color: 'custom color', language: 'language', timezone: 'timezone',
  reducedMotion: 'reduced motion', reduced_motion: 'reduced motion',
  highContrast: 'high contrast', high_contrast: 'high contrast',
  largeText: 'large text', large_text: 'large text',
  dyslexiaFriendly: 'dyslexia-friendly mode', dyslexia_friendly: 'dyslexia-friendly mode',
  screenReader: 'screen reader', screen_reader: 'screen reader',
};

const humanizeKey = (k) =>
  String(k)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const formatValue = (v) => {
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
};

// Bob's design bolds the change count inside the description line
// ("Apply **1** setting change: …"). Bold the first number run, like his
// <span class="text-on-surface font-bold">1</span>.
const renderDescription = (text) => {
  const s = String(text || '');
  const m = s.match(/^(.*?)(\d+)(.*)$/s);
  if (!m) return s;
  return (
    <>
      {m[1]}
      <span className="text-on-surface font-bold">{m[2]}</span>
      {m[3]}
    </>
  );
};

// What the action will actually do, as visible rows. change_settings renders
// its settings sub-dict with friendly labels; every other action falls back to
// a generic key → value list (skipping the echoed request text).
function usePayloadRows(permission) {
  return useMemo(() => {
    const payload = (permission && permission.payload) || {};
    const rows = [];
    if (permission?.action_type === 'change_settings') {
      const settings = payload.settings;
      if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
        for (const [k, v] of Object.entries(settings)) {
          rows.push({ label: SETTING_LABELS[k] || humanizeKey(k), value: formatValue(v), icon: Type });
        }
      }
    }
    if (rows.length === 0) {
      for (const [k, v] of Object.entries(payload)) {
        if (k === 'text') continue; // the user's own words — already in the chat
        rows.push({ label: SETTING_LABELS[k] || humanizeKey(k), value: formatValue(v), icon: SlidersHorizontal });
      }
    }
    return rows;
  }, [permission]);
}

export default function PermissionModal({ permission, onDecision, onClose }) {
  const [mode, setMode] = useState('decide'); // 'decide' | 'replace'
  const [comment, setComment] = useState('');
  const [replacement, setReplacement] = useState('');
  const [busy, setBusy] = useState(''); // '' | the decision being submitted
  const [error, setError] = useState('');
  const approveRef = useRef(null);
  const rows = usePayloadRows(permission);

  useEffect(() => {
    approveRef.current?.focus();
  }, [permission?.id, mode]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || busy) return;
      if (mode === 'replace') { setMode('decide'); setReplacement(''); return; }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, busy, onClose]);

  const decide = async (decision, text) => {
    setBusy(decision);
    setError('');
    try {
      await onDecision(permission.id, decision, text || '');
    } catch (e) {
      setError(e?.message || 'The approval could not be sent. Try again.');
      setBusy('');
    }
  };

  const actionLabel = (permission?.action_type || 'action').replace(/_/g, ' ');
  const title = permission?.title || `Permission Required: ${actionLabel}`;
  const description = permission?.description || `The agent wants your permission to ${actionLabel}.`;
  const reqText = (permission?.payload && permission.payload.text) || '';

  const busyCls = 'disabled:opacity-50 disabled:cursor-not-allowed';
  const spinner = (decision, label) =>
    busy === decision ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin" /> {label}...
      </>
    ) : null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="perm-modal-title" aria-describedby="perm-modal-desc">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-container-lowest/60 backdrop-blur-sm"
        onMouseDown={() => { if (!busy) onClose(); }}
      />

      {/* ── Desktop centered card (md+) ───────────────────────────────── */}
      <div className="hidden md:flex absolute inset-0 items-center justify-center p-md pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl bg-surface-container-low/90 backdrop-blur-xl rounded-xl border border-outline-variant shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55),0_0_20px_rgba(245,158,11,0.10)] overflow-hidden flex flex-col max-h-[90vh] animate-fadeIn">
          {/* Header */}
          <header className="p-lg border-b border-outline-variant flex items-start gap-md">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-surface-container-high border border-amber-500/30 flex items-center justify-center text-amber-500">
              <TriangleAlert className="w-7 h-7" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-sm mb-xs flex-wrap">
                <span className="font-label-caps text-label-caps font-semibold text-amber-500 border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 rounded-sm uppercase">
                  {actionLabel}
                </span>
                {permission?.assignment_id != null && (
                  <span className="font-code-sm text-code-sm text-outline-variant">ref #{permission.assignment_id}</span>
                )}
              </div>
              <h2 id="perm-modal-title" className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface leading-8">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!!busy}
              aria-label="Close permission dialog"
              className={`text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-md hover:bg-surface-container-high ${busy ? 'opacity-50' : ''} cursor-pointer`}
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Body */}
          <div className="p-lg flex flex-col gap-lg overflow-y-auto custom-scrollbar">
            {mode === 'replace' ? (
              <>
                <div>
                  <div className="mb-sm">
                    <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">Proposed Action</span>
                  </div>
                  <div className="bg-surface-dim border-l-2 border-tertiary p-md rounded-r-lg">
                    <div className="flex items-start gap-sm mb-sm">
                      <PenLine className="w-4 h-4 text-tertiary mt-0.5 shrink-0" />
                      <span className="font-code-sm text-code-sm text-on-surface break-all">
                        {reqText || `The agent proposed to ${actionLabel}.`}
                      </span>
                    </div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant pl-7">
                      {description}
                    </div>
                  </div>
                </div>
                <div className="border-t border-outline-variant/30 pt-lg flex flex-col gap-xs">
                  <label htmlFor="perm-replacement" className="block font-label-caps text-label-caps text-primary mb-sm">
                    What should the agent do instead?
                  </label>
                  <div className="bg-surface-container-low border border-outline-variant rounded-lg p-sm focus-glow transition-all duration-200">
                    <textarea
                      id="perm-replacement"
                      value={replacement}
                      onChange={(e) => setReplacement(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && replacement.trim()) {
                          e.preventDefault();
                          decide('write_something_else', replacement.trim());
                        }
                      }}
                      placeholder="E.g., Just show me the proposed changes first before applying them..."
                      rows={4}
                      className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-on-surface font-body-md text-body-md resize-none placeholder:text-outline"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <p id="perm-modal-desc" className="font-body-lg text-body-lg text-on-surface-variant">
                  {renderDescription(description)}
                </p>

                {rows.length > 0 && (
                  <div className="border border-outline-variant rounded-lg bg-surface-container-highest/30 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.label}-${i}`} className={`border-b border-outline-variant last:border-b-0 hover:bg-surface-container-high/50 transition-colors ${i > 0 ? '' : ''}`}>
                            <td className="py-sm px-md font-body-md text-body-md text-on-surface border-r border-outline-variant w-1/2">
                              {r.label}
                            </td>
                            <td className="py-sm px-md font-code-sm text-code-sm text-secondary w-1/2 flex items-center gap-sm">
                              <ArrowRight className="w-4 h-4 text-outline-variant" />
                              {r.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-col gap-xs">
                  <label htmlFor="perm-comment" className="font-label-caps text-label-caps text-outline">
                    Instruction Override (Optional)
                  </label>
                  <div className="relative focus-glow transition-all duration-200 rounded-lg">
                    <textarea
                      id="perm-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add an instruction for the agent..."
                      rows={3}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-md text-on-surface font-body-sm text-body-sm placeholder:text-outline-variant focus:outline-none focus:ring-0 focus:border-secondary resize-none"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Inline error strip (error/busy state design) */}
          {error && (
            <div className="bg-error px-lg py-sm flex items-center gap-sm">
              <XCircle className="w-4 h-4 text-on-error shrink-0" />
              <span className="font-body-sm text-body-sm text-on-error font-semibold">{error}</span>
            </div>
          )}

          {/* Footer */}
          <footer className="p-lg border-t border-outline-variant bg-surface-container-low flex flex-wrap items-center justify-between gap-md">
            {mode === 'replace' ? (
              <div className="flex justify-end gap-md w-full">
                <button
                  type="button"
                  onClick={() => { setMode('decide'); setReplacement(''); }}
                  disabled={!!busy}
                  className={`px-md py-sm rounded-lg font-label-caps text-label-caps font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors border border-transparent cursor-pointer ${busyCls}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => decide('write_something_else', replacement.trim())}
                  disabled={!!busy || !replacement.trim()}
                  className={`px-lg py-sm rounded-lg font-label-caps text-label-caps font-semibold bg-sem-green text-on-sem-green hover:bg-sem-deepgreen transition-colors flex items-center gap-xs shadow-[0_0_15px_rgba(124,227,139,0.2)] cursor-pointer ${busyCls}`}
                >
                  {spinner('write_something_else', 'Sending') || (<><Send className="w-4 h-4" /> Send Instead</>)}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-sm flex-wrap">
                  <button
                    type="button"
                    onClick={() => decide('always_approve', comment)}
                    disabled={!!busy}
                    title={`Always auto-approve "${permission?.action_type}" from now on`}
                    className={`px-md py-sm rounded-sm border border-amber-500/50 text-amber-500 font-label-caps text-label-caps font-semibold hover:bg-amber-500/10 transition-colors duration-200 flex items-center gap-xs cursor-pointer ${busyCls}`}
                  >
                    {spinner('always_approve', 'Saving') || (<><InfinityIcon className="w-4 h-4" /> ALWAYS ALLOW</>)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('replace')}
                    disabled={!!busy}
                    className={`px-md py-sm rounded-sm text-primary font-label-caps text-label-caps font-semibold hover:bg-surface-container-high transition-colors duration-200 flex items-center gap-xs cursor-pointer ${busyCls}`}
                  >
                    <PenLine className="w-4 h-4" /> WRITE SOMETHING ELSE
                  </button>
                </div>
                <div className="flex gap-sm">
                  <button
                    type="button"
                    onClick={() => decide('reject', '')}
                    disabled={!!busy}
                    className={`px-md py-sm rounded-sm bg-error/10 border border-error/50 text-error font-label-caps text-label-caps font-semibold hover:bg-error hover:text-on-error transition-colors duration-200 flex items-center gap-xs cursor-pointer ${busyCls}`}
                  >
                    {spinner('reject', 'Rejecting') || (<><Ban className="w-4 h-4" /> REJECT</>)}
                  </button>
                  <button
                    type="button"
                    ref={approveRef}
                    onClick={() => decide('approve', comment)}
                    disabled={!!busy}
                    className={`px-md py-sm rounded-sm bg-sem-green text-on-sem-green font-label-caps text-label-caps hover:bg-sem-deepgreen transition-colors duration-200 flex items-center gap-xs font-bold shadow-[0_0_10px_rgba(124,227,139,0.3)] cursor-pointer ${busyCls}`}
                  >
                    {spinner('approve', 'Approving') || (<><CheckCircle2 className="w-4 h-4" /> APPROVE</>)}
                  </button>
                </div>
              </>
            )}
          </footer>
        </div>
      </div>

      {/* ── Mobile bottom sheet (<md) ──────────────────────────────────── */}
      <div className="md:hidden absolute inset-0 bg-black/60" onMouseDown={() => { if (!busy) onClose(); }} />
      <div className="md:hidden absolute bottom-0 left-0 right-0 glassy-navy rounded-t-2xl border-t border-l border-r border-surface-container-high shadow-2xl flex flex-col max-h-[88dvh] animate-slideUp">
        {/* Drag handle */}
        <div className="w-full flex justify-center pt-sm pb-2">
          <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
        </div>

        {/* Header */}
        <div className="px-gutter pb-lg pt-sm flex flex-col items-center border-b border-surface-container-high">
          <div className="bg-tertiary-container/30 p-md rounded-full mb-md border border-tertiary-fixed/20">
            <TriangleAlert className="w-8 h-8 text-tertiary-fixed" />
          </div>
          <h2 id="perm-modal-title-mobile" className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface text-center mb-xs">
            Permission Required
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant text-center max-w-[280px] leading-relaxed">
            {description}
          </p>
        </div>

        {/* Changes */}
        <div className="px-gutter py-lg overflow-y-auto flex-1 custom-scrollbar">
          {mode === 'replace' ? (
            <div className="flex flex-col gap-xs">
              <label htmlFor="perm-replacement-m" className="block font-label-caps text-label-caps text-primary mb-sm">
                What should the agent do instead?
              </label>
              <div className="bg-surface-container-low border border-outline-variant rounded-lg p-sm focus-within:border-secondary transition-all duration-200">
                <textarea
                  id="perm-replacement-m"
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  rows={4}
                  placeholder="E.g., Just show me the proposed changes first before applying them..."
                  className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-on-surface font-body-md text-body-md resize-none placeholder:text-outline"
                />
              </div>
            </div>
          ) : (
            <>
              <h3 className="font-label-caps text-label-caps text-outline mb-sm uppercase tracking-wider">Requested Changes</h3>
              <div className="bg-surface-container-low border border-surface-container-high rounded-lg overflow-hidden flex flex-col">
                {rows.length === 0 ? (
                  <div className="bg-surface-container-low p-md flex justify-between items-center">
                    <span className="font-code-sm text-code-sm text-on-surface-variant">{description}</span>
                  </div>
                ) : rows.map((r, i) => (
                  <div key={`${r.label}-m-${i}`} className={`bg-surface-container-low p-md flex justify-between items-center gap-sm ${i > 0 ? 'border-t border-surface-container-highest/50' : ''}`}>
                    <div className="flex items-center gap-sm min-w-0">
                      <r.icon className="w-5 h-5 text-outline-variant shrink-0" />
                      <span className="font-code-sm text-code-sm text-on-surface-variant">{r.label}</span>
                    </div>
                    <div className="flex items-center gap-sm shrink-0">
                      <span className="font-code-sm text-code-sm text-secondary">{r.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {mode === 'replace' && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-md leading-relaxed">
              {description}
            </p>
          )}

          {error && (
            <div className="bg-error px-lg py-sm flex items-center gap-sm mt-lg rounded-lg">
              <XCircle className="w-4 h-4 text-on-error shrink-0" />
              <span className="font-body-sm text-body-sm text-on-error font-semibold">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-gutter pb-xl pt-md flex flex-col gap-sm border-t border-surface-container-high bg-surface-container-lowest/50">
          {mode === 'replace' ? (
            <>
              <button
                type="button"
                onClick={() => decide('write_something_else', replacement.trim())}
                disabled={!!busy || !replacement.trim()}
                className={`w-full bg-sem-green text-on-sem-green font-label-caps text-label-caps font-semibold py-md rounded-sm hover:bg-sem-deepgreen transition-colors flex items-center justify-center gap-sm cursor-pointer ${busyCls}`}
              >
                {spinner('write_something_else', 'Sending') || (<><Send className="w-4 h-4" /> Send Instead</>)}
              </button>
              <button
                type="button"
                onClick={() => { setMode('decide'); setReplacement(''); }}
                disabled={!!busy}
                className={`w-full bg-transparent border border-surface-container-high text-on-surface font-label-caps text-label-caps font-semibold py-md rounded-sm hover:bg-surface-container-high transition-colors cursor-pointer ${busyCls}`}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => decide('approve', comment)}
                disabled={!!busy}
                className={`w-full bg-sem-green text-on-sem-green font-label-caps text-label-caps font-semibold py-md rounded-sm hover:bg-sem-deepgreen transition-colors flex items-center justify-center gap-sm cursor-pointer ${busyCls}`}
              >
                {spinner('approve', 'Approving') || (<><CheckCircle2 className="w-4 h-4" /> APPROVE</>)}
              </button>
              <button
                type="button"
                onClick={() => decide('reject', '')}
                disabled={!!busy}
                className={`w-full bg-transparent border border-surface-container-high text-on-surface font-label-caps text-label-caps font-semibold py-md rounded-sm hover:bg-surface-container-high transition-colors flex items-center justify-center gap-sm cursor-pointer ${busyCls}`}
              >
                {spinner('reject', 'Rejecting') || (<><Ban className="w-4 h-4" /> REJECT</>)}
              </button>
              <button
                type="button"
                onClick={() => decide('always_approve', comment)}
                disabled={!!busy}
                title={`Always auto-approve "${permission?.action_type}" from now on`}
                className={`w-full bg-transparent border border-surface-container-high text-primary font-label-caps text-label-caps font-semibold py-md rounded-sm hover:bg-primary/10 transition-colors flex items-center justify-center gap-sm cursor-pointer ${busyCls}`}
              >
                {spinner('always_approve', 'Saving') || (<><ShieldCheck className="w-4 h-4" /> ALWAYS ALLOW</>)}
              </button>
              <button
                type="button"
                onClick={() => setMode('replace')}
                disabled={!!busy}
                className={`w-full bg-transparent text-outline-variant font-body-sm text-body-sm py-sm mt-xs hover:text-on-surface transition-colors underline decoration-outline-variant/50 underline-offset-4 cursor-pointer ${busyCls}`}
              >
                Write something else
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
