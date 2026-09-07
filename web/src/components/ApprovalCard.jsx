/**
 * ApprovalCard.jsx — Agent-approval card for the public chat surface.
 *
 * Site parity with the extension's approval card (extension/popup.html +
 * agent_mode.html): the SAME decision set — Approve / Reject / Neutral /
 * Approve + auto-add — the SAME one optional note input ("Say something…"),
 * and the same helper line. Shared contract ids are kept (#approvalCard,
 * #approvalTitle, #approvalText, #approvalApprove, #approvalReject,
 * #approvalNeutral, #approvalApproveAuto, #approvalInput, #approvalHelper)
 * so the two surfaces stay visually and semantically one feature.
 *
 * Contract (my-agent lane): every decision button submits its decision plus
 * whatever note text is in the input (empty text is fine for Approve / Reject
 * / Approve+auto-add; Neutral REQUIRES a note — empty Neutral is blocked with
 * an inline hint and the input is focused). Decisions go through the existing
 * approval protocol — POST /api/agent/permission/respond with
 * { permission_id, decision: allow|deny|neutral, text, autoAdd? } — where the
 * server-side decision handling is the backend lane's contract.
 *
 * Neutral means NEITHER: the action is NOT performed; the agent only gets the
 * typed note as feedback.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, Ban, CircleOff, Zap, ShieldAlert } from 'lucide-react';

const APPROVAL_HELPER_DEFAULT =
  'Approve = let it act · Reject = stop it · Neutral = don’t do it, just send your note.';
const APPROVAL_NEUTRAL_HINT = 'Say something first — Neutral needs your note';

export default function ApprovalCard({
  request = {},
  onDecision = async () => {},
}) {
  const permId = request.id || request.permission_id || 'unknown';
  const rawTitle = request.title || 'The agent wants to act';
  // "Permission Required: <action>" — strip the prefix like AdminAgentChat does.
  const title = rawTitle.replace(/^Permission Required:\s*/i, '');
  const actionType = request.action_type || request.type || 'Agent Action';
  const description = request.description || request.message || 'Agent requested execution permission.';

  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState(false);
  const [errorText, setErrorText] = useState('');
  const inputRef = useRef(null);
  const hintTimer = useRef(null);

  useEffect(() => () => clearTimeout(hintTimer.current), []);

  function flashHint() {
    setHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 3500);
  }

  async function decide(decision, opts) {
    const trimmed = note.trim();
    if (decision === 'neutral' && !trimmed) {
      // Neutral ONLY sends the note — no note, no send (extension parity).
      flashHint();
      if (inputRef.current) inputRef.current.focus();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setErrorText('');
    try {
      await onDecision(permId, decision, trimmed, opts);
    } catch (err) {
      setErrorText(err?.message || 'Failed to record your decision — please retry.');
      setSubmitting(false);
    }
  }

  return (
    <div
      id="approvalCard"
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="approvalTitle"
      className="approval-card flex flex-col gap-unit-3 w-full max-w-2xl my-3 p-unit-4 rounded-2xl bg-primary-container/10 border border-primary/40 shadow-[0_0_24px_rgba(89,216,201,0.12)]"
    >
      {/* Title row (mirrors .a-title: shield + mono uppercase primary) */}
      <div className="a-title flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 text-sem-amber" />
        <span
          id="approvalTitle"
          className="font-code-sm text-code-sm font-medium uppercase tracking-wider text-primary"
        >
          {title}
        </span>
      </div>

      {/* Request summary (mirrors .a-text) */}
      <div className="a-text flex flex-col gap-1">
        <span className="font-code-sm text-code-sm font-medium uppercase tracking-wider text-outline">
          {actionType}
        </span>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
          {description}
        </p>
      </div>

      {errorText && (
        <p className="font-body-sm text-body-sm text-error" role="alert">
          {errorText}
        </p>
      )}

      {/* Note input row — one optional note shared by every decision button */}
      <div className="a-input-row flex flex-col gap-1.5">
        <label
          htmlFor="approvalInput"
          className="a-input-label font-code-sm text-[10px] font-medium uppercase tracking-wider text-on-surface-variant"
        >
          Say something&hellip;
        </label>
        <input
          id="approvalInput"
          ref={inputRef}
          type="text"
          value={note}
          autoComplete="off"
          placeholder="Optional note to the agent"
          aria-invalid={hint || undefined}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              decide('allow');
            }
          }}
          className={`w-full h-11 px-unit-3 rounded-xl bg-surface-container-lowest font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 transition-all border ${
            hint
              ? 'border-error/70 focus:ring-error focus:border-error'
              : 'border-outline-variant/30 focus:ring-primary focus:border-primary/50'
          }`}
        />
      </div>

      {/* Decision buttons (mirrors .a-actions: Approve primary, Reject secondary,
          Neutral ghost, Approve + auto-add ghost full-width with AUTO badge) */}
      <div className="a-actions flex flex-wrap gap-unit-2">
        <button
          id="approvalApprove"
          type="button"
          disabled={submitting}
          onClick={() => decide('allow')}
          className="btn btn--primary h-10 px-unit-3 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(89,216,201,0.25)] hover:shadow-[0_0_24px_rgba(89,216,201,0.4)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          <Check className="w-4 h-4 stroke-[2.5] shrink-0" />
          <span>Approve</span>
        </button>

        <button
          id="approvalReject"
          type="button"
          disabled={submitting}
          onClick={() => decide('deny')}
          className="btn btn--secondary h-10 px-unit-3 rounded-xl bg-surface-container-high/60 hover:bg-surface-container-high border border-outline-variant/25 text-on-surface font-label-caps text-label-caps flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          <Ban className="w-4 h-4 shrink-0 text-error" />
          <span>Reject</span>
        </button>

        <button
          id="approvalNeutral"
          type="button"
          disabled={submitting}
          onClick={() => decide('neutral')}
          className="btn btn--ghost h-10 px-unit-3 rounded-xl bg-surface-container-low/40 hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          <CircleOff className="w-4 h-4 shrink-0" />
          <span>Neutral</span>
        </button>

        <button
          id="approvalApproveAuto"
          type="button"
          disabled={submitting}
          onClick={() => decide('allow', { autoAdd: true })}
          className="btn btn--ghost approval-auto h-10 px-unit-3 rounded-xl bg-surface-container-low/40 hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 w-full sm:w-auto sm:min-w-[210px]"
        >
          <Zap className="w-4 h-4 shrink-0 text-primary" />
          <span>Approve &amp; auto-add</span>
          <span className="a-auto-badge font-code-sm text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full text-primary bg-primary/20">
            AUTO
          </span>
        </button>
      </div>

      {/* One-line helper (mirrors .a-helper; warn state on blocked Neutral) */}
      <p
        id="approvalHelper"
        className={`a-helper font-code-sm text-[10px] uppercase tracking-wider ${
          hint ? 'a-helper--warn text-error font-semibold' : 'text-on-surface-variant'
        }`}
      >
        {hint ? APPROVAL_NEUTRAL_HINT : APPROVAL_HELPER_DEFAULT}
      </p>
    </div>
  );
}
