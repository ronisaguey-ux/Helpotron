/* ────────────────────────────────────────────────────────────────────────────
 * DestructiveConfirmModal.jsx — Critical System Gateway (§6.15 & §6.18)
 * Standardized LUMINOUS GLASS M3 destructive confirmation dialog.
 * Replaces window.confirm/alert with an accessible, focus-trapped modal.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X, ShieldAlert } from 'lucide-react';

export default function DestructiveConfirmModal({
  isOpen = false,
  title = 'Critical System Action',
  description = 'This operation is irreversible and will permanently mutate or purge the selected records.',
  confirmLabel = 'Confirm Deletion',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  requireMatchString = null,
}) {
  const [matchValue, setMatchValue] = React.useState('');
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setMatchValue('');
      return;
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isBlocked = requireMatchString && matchValue !== requireMatchString;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="destructive-title"
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md select-none animate-[fade-in_150ms_ease-out]"
    >
      <div className="relative w-full max-w-md p-6 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-2xl border border-error/40 shadow-2xl space-y-5">
        {/* Spec Header Tag */}
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-error" />
            <span className="font-mono text-[10px] font-bold text-error uppercase tracking-wider">
              Please confirm
            </span>
          </div>
          <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
            Cannot be undone
          </span>
        </div>

        {/* Dialog Core Content */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-error/15 border border-error/30 flex items-center justify-center text-error shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            <h3 id="destructive-title" className="text-base font-bold text-on-surface tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Optional string verification input */}
        {requireMatchString && (
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-mono text-on-surface-variant">
              Type <strong className="text-error">{requireMatchString}</strong> to confirm:
            </label>
            <input
              type="text"
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder={requireMatchString}
              className="w-full h-10 px-3 rounded-xl bg-surface-container-low text-xs font-mono text-on-surface border border-error/30 focus:outline-none focus:ring-1 focus:ring-error"
            />
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition cursor-pointer active:scale-95 border border-outline-variant/30"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            disabled={Boolean(isBlocked)}
            onClick={onConfirm}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-error text-on-error hover:bg-error/90 font-bold text-xs uppercase tracking-wider transition cursor-pointer active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
