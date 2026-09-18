import React, { useState } from 'react';
import { X, FlaskConical, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Application form for the free Testing tier (owner 2026-09-18).
 *
 * Deliberately does NOT authenticate. Testing access exists for people who want
 * to evaluate the platform and report issues, and requiring a working session
 * would exclude anyone whose access is exactly what they are asking for. The
 * account is named by `public_id`, which is a claim, not a credential — the
 * agent verifies the account during triage and the owner approves by hand.
 *
 * The response never says whether the named account exists, so this cannot be
 * used to enumerate accounts.
 */
export default function TestingAccessModal({ open, onClose, initialPublicId = '' }) {
  const [publicId, setPublicId] = useState(initialPublicId);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const submit = async () => {
    if (message.trim().length < 10) {
      setError('Tell the developer who you are and what you want to test (at least 10 characters).');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/recovery/testing-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          public_id: publicId.trim() || 'unknown',
          message: message.trim(),
          contact: contact.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Application failed to send.');
      setDone(true);
    } catch (e) {
      setError(e.message || 'Could not send the application.');
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    onClose();
    // Reset only after the close so the success state does not flicker away.
    setTimeout(() => { setDone(false); setError(''); setSending(false); }, 200);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
      onClick={close}
    >
      <div
        className="w-full md:max-w-md surface-glass-strong rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Apply for testing access</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="text-slate-500 hover:text-white transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center space-y-3">
            <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-400" />
            <p className="text-sm text-[var(--text-primary)] font-medium">Application received.</p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Testing access is granted by hand. You will be notified on the account you named
              if it is approved.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-2 px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                The Testing tier gives you <span className="text-[var(--text-primary)] font-semibold">15,000 free task tokens</span> to
                evaluate the platform and report issues. Tell the developer who you are and what you
                plan to test — access is approved by hand.
              </p>

              <label className="block space-y-1">
                <span className="text-[11px] text-[var(--text-secondary)]">Your helpotron account</span>
                <input
                  value={publicId}
                  onChange={(e) => setPublicId(e.target.value)}
                  placeholder="e.g. student_1042"
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-[var(--accent)] outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-[var(--text-secondary)]">Who you are and what you want to test</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="I'm a CS student testing the assignment dump and the humanizer before launch…"
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-[var(--accent)] outline-none resize-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-[var(--text-secondary)]">Reply-to (optional)</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="email or Telegram handle"
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-[var(--accent)] outline-none"
                />
              </label>

              {error && (
                <div className="flex items-start gap-2 text-[11px] text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border-subtle)] px-5 py-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="px-3.5 py-2 rounded-xl text-xs text-[var(--text-secondary)] hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Send application
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
