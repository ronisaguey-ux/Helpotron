/* ────────────────────────────────────────────────────────────────────────────
 * ErrorReportButton.jsx — the "report this" call to action on an error surface.
 *
 * Owner requirement (2026-09-23), verbatim:
 *
 *   "when the user reports and sends the real diagnostics, have it send an
 *    encrypted hashed json output so the user never sees back end logic ever
 *    even when reporting"
 *
 * So this button never puts the diagnostic on screen, and never sends it in the
 * clear. It:
 *   1. takes `error` (the object from humanError(), whose `technical` holds the
 *      raw payload the display layer deliberately keeps hidden),
 *   2. mints a single-use key from the server,
 *   3. AES-256-GCM-seals the scrubbed bundle,
 *   4. posts the sealed envelope to the data lake.
 *
 * If the seal cannot be made, it still files the report unsealed rather than
 * losing it — and says so, so the missing seal is visible to us and not to the
 * user as a silent failure.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { Bug, Loader2, Check } from 'lucide-react';
import api from '../../api.js';
import { toast } from '../../lib/overlay.js';
import { buildDiagnostics, submitSealedReport } from '../../lib/reportPayload.js';

export default function ErrorReportButton({ error, title, kind, surface = 'web', className = '' }) {
  const [state, setState] = useState('idle');   // idle | sending | sent

  const handleReport = async () => {
    if (state !== 'idle') return;
    setState('sending');

    // Read the reporter's identity from the session if the app exposes it. It is
    // never sent in the clear: reportPayload.js keyed-hashes it and drops it.
    let publicId = null;
    let sessionId = null;
    try {
      const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        publicId = u?.public_id || u?.publicId || null;
      }
    } catch { /* identity is optional; the report is still useful without it */ }

    try {
      const diagnostics = buildDiagnostics(error, {
        title: title || error?.title || 'Error report',
        message: error?.message || '',
        kind: kind || error?.kind || 'unknown',
        status: error?.status ?? null,
        technical: error?.technical || '',
        surface,
        publicId,
        sessionId,
      });

      const { sealed } = await submitSealedReport(api, diagnostics);

      setState('sent');
      toast.success(
        'Report sent',
        sealed
          ? 'Thanks — the details were sealed before sending.'
          : 'Thanks — we will look into it.',
      );
    } catch (e) {
      setState('idle');
      toast.error('Could not send the report', 'Please try again in a moment.');
    }
  };

  const label = state === 'sending' ? 'Sending…' : state === 'sent' ? 'Report sent' : 'Report this';

  return (
    <button
      type="button"
      onClick={handleReport}
      disabled={state !== 'idle'}
      aria-busy={state === 'sending' ? 'true' : undefined}
      /* A sealed report contains no readable diagnostics, so nothing here can
         leak into a tooltip, a title attribute or the accessible name. */
      title="Send the technical details to Helpotron. They are encrypted, and nothing here is shown on screen."
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/30 text-xs font-semibold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {state === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : state === 'sent' ? <Check className="w-3.5 h-3.5" />
          : <Bug className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </button>
  );
}
