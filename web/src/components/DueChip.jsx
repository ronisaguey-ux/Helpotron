import React from 'react';
import { Calendar, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * DueChip Component — LUMINOUS GLASS Temporal Telemetry (§3.4.5)
 *
 * 4 temporal states with vector Lucide icons only:
 *  1. Standard Due: >24h threshold, neutral border + Calendar icon
 *  2. Due Soon / Today: <=24h threshold, sem-amber + Clock icon + amber luminescence
 *  3. Overdue Alert: breached SLA, error class + AlertTriangle icon + glow
 *  4. Submission Verified: turn-in confirmed, sem-green + CheckCircle2 icon
 *
 * Props:
 *  - dueDate: string | Date (ISO string, date string, or timestamp)
 *  - status: string (optional, if completed/submitted triggers verified variant)
 *  - size: 'default' | 'compact'
 *  - className: string
 */
export default function DueChip({
  dueDate = null,
  status = '',
  size = 'default',
  className = '',
}) {
  const isCompact = size === 'compact';
  const statusStr = String(status || '').toLowerCase();
  const isVerified = statusStr.includes('complet') || statusStr.includes('submit') || statusStr.includes('grade');

  if (isVerified) {
    return (
      <div
        className={[
          'inline-flex items-center select-none font-code-sm font-medium rounded-lg border transition-colors',
          isCompact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-xs',
          'bg-sem-green/10 border-sem-green/30 text-sem-green shadow-sm',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <CheckCircle2 className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>Turned In</span>
      </div>
    );
  }

  if (!dueDate) {
    return (
      <div
        className={[
          'inline-flex items-center select-none font-code-sm rounded-lg border',
          isCompact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-xs',
          'bg-surface-container-high/40 border-outline-variant/20 text-on-surface-variant',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Calendar className={`${isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-outline`} />
        <span>No deadline</span>
      </div>
    );
  }

  const d = new Date(dueDate);
  const isValid = !isNaN(d.getTime());
  if (!isValid) {
    return (
      <div
        className={[
          'inline-flex items-center select-none font-code-sm rounded-lg border bg-surface-container-high/60 border-outline-variant/30 text-on-surface-variant',
          isCompact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-xs',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Calendar className={`${isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-outline`} />
        <span>{String(dueDate)}</span>
      </div>
    );
  }

  const now = Date.now();
  const diffMs = d.getTime() - now;
  const isOverdue = diffMs < 0;
  const isDueSoon = !isOverdue && diffMs <= 24 * 60 * 60 * 1000;

  const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  // Overdue variant
  if (isOverdue) {
    const daysPast = Math.max(1, Math.floor(Math.abs(diffMs) / (24 * 60 * 60 * 1000)));
    const text = daysPast === 1 ? `Overdue ${dateLabel} (-1 Day)` : `Overdue ${dateLabel} (-${daysPast} Days)`;
    return (
      <div
        className={[
          'inline-flex items-center select-none font-code-sm font-semibold rounded-lg border transition-colors',
          isCompact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-xs',
          'bg-error/15 border-error/40 text-error shadow-[0_0_14px_rgba(255,180,171,0.15)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <AlertTriangle className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>{text}</span>
      </div>
    );
  }

  // Due Soon / Today variant
  if (isDueSoon) {
    const hoursRemaining = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)));
    const text = hoursRemaining <= 12 ? `Due Today (${hoursRemaining}h)` : `Due Today ${dateLabel}`;
    return (
      <div
        className={[
          'inline-flex items-center select-none font-code-sm font-semibold rounded-lg border transition-colors',
          isCompact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-xs',
          'bg-sem-amber/15 border-sem-amber/40 text-sem-amber shadow-[0_0_12px_rgba(245,158,11,0.2)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Clock className={`${isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-sem-amber`} />
        <span>{text}</span>
      </div>
    );
  }

  // Standard Due variant
  return (
    <div
      className={[
        'inline-flex items-center select-none font-code-sm font-medium rounded-lg border transition-colors',
        isCompact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-xs',
        'bg-surface-container-high/70 border-outline-variant/40 text-on-surface hover:border-outline-variant shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Calendar className={`${isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-on-surface-variant`} />
      <span>Due {dateLabel}</span>
    </div>
  );
}
