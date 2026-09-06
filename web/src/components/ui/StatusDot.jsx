import React from 'react';

const STATUS_COLOR_MAP = {
  amber: 'bg-sem-amber',
  blue: 'bg-sem-blue',
  green: 'bg-sem-green',
  cyan: 'bg-sem-cyan',
  indigo: 'bg-sem-indigo',
  deepgreen: 'bg-sem-deepgreen',
  gray: 'bg-sem-gray',
  slate: 'bg-sem-slate',
  error: 'bg-error',
  primary: 'bg-primary',
  // Convenience status aliases
  pending: 'bg-sem-amber',
  active: 'bg-sem-blue',
  running: 'bg-sem-blue',
  completed: 'bg-sem-green',
  success: 'bg-sem-green',
  offline: 'bg-sem-slate',
  inactive: 'bg-sem-gray',
};

/**
 * StatusDot — LUMINOUS GLASS 6px Semantic Dot (Stitch v6)
 */
export default function StatusDot({
  status = 'primary',
  pulse = false,
  className = '',
  'aria-label': ariaLabel,
}) {
  const colorClass = STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP.primary;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${pulse ? 'relative' : ''} ${className}`}
      aria-label={ariaLabel}
      role={ariaLabel ? 'status' : undefined}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colorClass}`} />
      {pulse && (
        <span
          className={`absolute -inset-0.5 rounded-full ${colorClass} opacity-60 animate-ping`}
        />
      )}
    </span>
  );
}

export { StatusDot };
