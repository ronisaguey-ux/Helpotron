/**
 * overlay.js — Toast & Inline Strip Helpers (Stitch v6 / LUMINOUS GLASS)
 * Implements the single-source notice and error contracts:
 * - Notices: role="status" toast bottom-right 4s with luminous glass styling
 * - Error: inline strip (bg-error-container/15 border-error/30 rounded-xl p-3 text-error font-mono text-[11px])
 * alert() and confirm() are strictly banned; silent catches banned.
 */

// Custom event name for toast triggers
export const TOAST_EVENT = 'helpotron:toast';

/**
 * Dispatches a toast notification to the global toast listener
 * @param {Object} options
 * @param {string} options.title - Toast title
 * @param {string} [options.message] - Supporting description
 * @param {'info'|'success'|'error'} [options.variant='info'] - Semantic variant
 * @param {number} [options.duration=4000] - Duration in ms (default 4s)
 */
export function showToast({ title, message, variant = 'info', duration = 4000 }) {
  if (typeof window === 'undefined') return;
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const detail = { id, title, message, variant, duration };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
  return id;
}

export const toast = {
  info: (title, message, duration) => showToast({ title, message, variant: 'info', duration }),
  success: (title, message, duration) => showToast({ title, message, variant: 'success', duration }),
  error: (title, message, duration) => showToast({ title, message, variant: 'error', duration }),
};

/**
 * Standard inline error strip class names
 * Spec: bg-error-container/15 border-error/30 rounded-xl p-3 text-error font-code-sm
 */
export const ERROR_STRIP_CLASSES =
  'bg-error-container/15 border border-error/30 rounded-xl p-3 text-error font-mono text-[11px] leading-relaxed flex items-start justify-between gap-3';

/**
 * Formats any caught error into an honest, user-actionable message
 */
export function formatErrorMessage(err) {
  if (!err) return 'An unexpected error occurred.';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.detail) return typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
  return 'Operation failed. Please verify connection and retry.';
}
