import React from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

const TOAST_VARIANTS = {
  info: {
    border: 'border-primary/30',
    iconColor: 'text-primary',
    Icon: Info,
  },
  success: {
    border: 'border-sem-green/30',
    iconColor: 'text-sem-green',
    Icon: CheckCircle2,
  },
  error: {
    border: 'border-error/30',
    iconColor: 'text-error',
    Icon: AlertCircle,
  },
};

/**
 * Toast — LUMINOUS GLASS Toast Base (Stitch v6)
 * Accessible notification container with glass formulation and variant accents.
 */
export default function Toast({
  id,
  title,
  message,
  variant = 'info',
  onDismiss,
  className = '',
}) {
  const config = TOAST_VARIANTS[variant] || TOAST_VARIANTS.info;
  const IconComponent = config.Icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-start gap-3 p-4 rounded-2xl',
        'bg-surface-container-low/90 backdrop-blur-xl',
        'border shadow-2xl shadow-black/40',
        'transition-all duration-200 animate-[toast-in_180ms_ease-out]',
        config.border,
        className,
      ].filter(Boolean).join(' ')}
    >
      <IconComponent className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconColor}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && <div className="text-sm font-semibold text-on-surface leading-tight">{title}</div>}
        {message && <div className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{message}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(id)}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition cursor-pointer shrink-0"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export { Toast };
