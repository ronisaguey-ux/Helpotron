import React from 'react';

/**
 * 11-status matrix for LUMINOUS GLASS Design System
 * Spec: 8 semantic status pairs (composed of text, bg- / 15, border- / 25) + error & primary
 */
export const STATUS_MATRIX = {
  pending_approval: {
    key: 'pending_approval',
    label: 'PENDING APPROVAL',
    textClass: 'text-sem-amber',
    bgClass: 'bg-sem-amber/15',
    borderClass: 'border-sem-amber/25',
    dotClass: 'bg-sem-amber',
    pulse: false,
  },
  in_progress: {
    key: 'in_progress',
    label: 'IN PROGRESS',
    textClass: 'text-sem-blue',
    bgClass: 'bg-sem-blue/15',
    borderClass: 'border-sem-blue/25',
    dotClass: 'bg-sem-blue',
    pulse: false,
  },
  running: {
    key: 'running',
    label: 'RUNNING',
    textClass: 'text-sem-blue',
    bgClass: 'bg-sem-blue/15',
    borderClass: 'border-sem-blue/25',
    dotClass: 'bg-sem-blue',
    pulse: true,
  },
  draft_ready: {
    key: 'draft_ready',
    label: 'DRAFT READY',
    textClass: 'text-sem-green',
    bgClass: 'bg-sem-green/15',
    borderClass: 'border-sem-green/25',
    dotClass: 'bg-sem-green',
    pulse: false,
  },
  completed: {
    key: 'completed',
    label: 'COMPLETED',
    textClass: 'text-sem-green',
    bgClass: 'bg-sem-green/15',
    borderClass: 'border-sem-green/25',
    dotClass: 'bg-sem-green',
    pulse: false,
  },
  humanizing: {
    key: 'humanizing',
    label: 'HUMANIZING',
    textClass: 'text-sem-cyan',
    bgClass: 'bg-sem-cyan/15',
    borderClass: 'border-sem-cyan/25',
    dotClass: 'bg-sem-cyan',
    pulse: true,
  },
  monitored: {
    key: 'monitored',
    label: 'MONITORED',
    textClass: 'text-sem-indigo',
    bgClass: 'bg-sem-indigo/15',
    borderClass: 'border-sem-indigo/25',
    dotClass: 'bg-sem-indigo',
    pulse: false,
  },
  graded: {
    key: 'graded',
    label: 'GRADED',
    textClass: 'text-sem-deepgreen',
    bgClass: 'bg-sem-deepgreen/15',
    borderClass: 'border-sem-deepgreen/25',
    dotClass: 'bg-sem-deepgreen',
    pulse: false,
  },
  archived: {
    key: 'archived',
    label: 'ARCHIVED',
    textClass: 'text-sem-gray',
    bgClass: 'bg-sem-gray/15',
    borderClass: 'border-sem-gray/25',
    dotClass: 'bg-sem-gray',
    pulse: false,
  },
  paused: {
    key: 'paused',
    label: 'PAUSED',
    textClass: 'text-sem-slate',
    bgClass: 'bg-sem-slate/15',
    borderClass: 'border-sem-slate/25',
    dotClass: 'bg-sem-slate',
    pulse: false,
  },
  failed: {
    key: 'failed',
    label: 'FAILED',
    textClass: 'text-error',
    bgClass: 'bg-error-container/20',
    borderClass: 'border-error/30',
    dotClass: 'bg-error',
    pulse: false,
  },
};

/**
 * Normalizes any status input to one of the 11 matrix configs
 */
export function getStatusConfig(status = '') {
  const s = String(status).toLowerCase().trim().replace(/[\s-]+/g, '_');

  if (STATUS_MATRIX[s]) {
    return STATUS_MATRIX[s];
  }

  // Fuzzy matches
  if (s.includes('pend') || s.includes('review') || s.includes('wait') || s.includes('due')) {
    return STATUS_MATRIX.pending_approval;
  }
  if (s.includes('run') || s.includes('execut')) {
    return STATUS_MATRIX.running;
  }
  if (s.includes('prog') || s.includes('activ') || s.includes('start')) {
    return STATUS_MATRIX.in_progress;
  }
  if (s.includes('draft') || s.includes('ready')) {
    return STATUS_MATRIX.draft_ready;
  }
  if (s.includes('grade')) {
    return STATUS_MATRIX.graded;
  }
  if (s.includes('complet') || s.includes('submit') || s.includes('done') || s.includes('pass')) {
    return STATUS_MATRIX.completed;
  }
  if (s.includes('human')) {
    return STATUS_MATRIX.humanizing;
  }
  if (s.includes('monitor') || s.includes('track')) {
    return STATUS_MATRIX.monitored;
  }
  if (s.includes('pause') || s.includes('suspend') || s.includes('hold')) {
    return STATUS_MATRIX.paused;
  }
  if (s.includes('fail') || s.includes('err') || s.includes('overdue') || s.includes('reject')) {
    return STATUS_MATRIX.failed;
  }
  if (s.includes('archive') || s.includes('old') || s.includes('histor')) {
    return STATUS_MATRIX.archived;
  }

  // Fallback default
  return {
    key: s || 'unknown',
    label: (status || 'UNKNOWN').toUpperCase(),
    textClass: 'text-on-surface-variant',
    bgClass: 'bg-surface-container-high',
    borderClass: 'border-outline-variant/30',
    dotClass: 'bg-outline',
    pulse: false,
  };
}

/**
 * StatusChip Component
 * Spec: rounded-lg px-2 py-0.5 inline-flex gap-1.5 font-label-caps text-[10px] uppercase + 6px dot
 */
export function StatusChip({ status, label, pulse: pulseOverride, className = '' }) {
  const config = getStatusConfig(status);
  const displayLabel = label || config.label;
  const isPulse = pulseOverride !== undefined ? pulseOverride : config.pulse;

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border select-none',
        'font-mono text-[10px] font-medium uppercase tracking-wider',
        config.textClass,
        config.bgClass,
        config.borderClass,
        className,
      ].filter(Boolean).join(' ')}
    >
      <span className="relative flex items-center justify-center shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
        {isPulse && (
          <span className={`absolute -inset-0.5 rounded-full ${config.dotClass} opacity-60 animate-ping`} />
        )}
      </span>
      <span>{displayLabel}</span>
    </span>
  );
}

export default StatusChip;
