import React from 'react';
import { STATUS_MATRIX, getStatusConfig } from '../lib/statusChips.js';

export { STATUS_MATRIX, getStatusConfig };

/**
 * StatusChip Component — LUMINOUS GLASS 11-status token matrix (§3.4.4)
 * 
 * Strict single-token bindings with 6px calibrated optical dot.
 * Never outputs pseudo "Drafting" for not_started or paused.
 *
 * Props:
 *  - status: string (e.g. 'pending_approval', 'in_progress', 'completed', etc.)
 *  - label: string (optional override for label text)
 *  - pulse: boolean (optional override for pulsing dot animation)
 *  - size: 'default' | 'compact' (default 'default')
 *  - className: string
 */
export default function StatusChip({
  status = '',
  label = null,
  pulse: pulseOverride = undefined,
  size = 'default',
  className = '',
}) {
  const config = getStatusConfig(status);
  const displayLabel = label || config.label;
  const isPulse = pulseOverride !== undefined ? pulseOverride : !!config.pulse;
  const isCompact = size === 'compact';

  return (
    <div
      className={[
        'inline-flex items-center select-none font-chip-status uppercase tracking-wider',
        isCompact
          ? 'gap-1.5 px-2 py-0.5 rounded-md text-[10px]'
          : 'gap-2 px-2.5 py-1 rounded-lg text-[11px] font-semibold shadow-sm',
        config.textClass,
        config.bgClass,
        'border',
        config.borderClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="relative flex items-center justify-center shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
        {isPulse && (
          <span
            className={`absolute -inset-0.5 rounded-full ${config.dotClass} opacity-60 animate-ping`}
            style={{ animationDuration: '2s' }}
          />
        )}
      </span>
      <span className="truncate">{displayLabel}</span>
    </div>
  );
}
