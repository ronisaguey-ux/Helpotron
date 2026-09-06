/**
 * statusChips.js — Canonical 11-status semantic token matrix (§3.4.4)
 * 
 * Strict single-token bindings with 6px calibrated optical emitters.
 * Invariant: Never output pseudo "Drafting" for not_started or paused.
 */

export const STATUS_MATRIX = {
  pending_approval: {
    key: 'pending_approval',
    label: 'PENDING APPROVAL',
    textClass: 'text-sem-amber',
    bgClass: 'bg-sem-amber/10',
    borderClass: 'border-sem-amber/25',
    dotClass: 'bg-sem-amber shadow-[0_0_8px_rgba(245,158,11,0.6)]',
    pulse: false,
    definition: 'Awaiting operator verification prior to synth cycle',
  },
  not_started: {
    key: 'not_started',
    label: 'NOT STARTED',
    textClass: 'text-on-surface',
    bgClass: 'bg-surface-container-high',
    borderClass: 'border-outline-variant/40',
    dotClass: 'bg-outline',
    pulse: false,
    definition: 'Task initiated in queue; no generation has started',
  },
  in_progress: {
    key: 'in_progress',
    label: 'IN PROGRESS',
    textClass: 'text-sem-blue',
    bgClass: 'bg-sem-blue/10',
    borderClass: 'border-sem-blue/30',
    dotClass: 'bg-sem-blue shadow-[0_0_8px_rgba(59,130,246,0.6)]',
    pulse: true,
    definition: 'Active inference node executing context generation',
  },
  paused: {
    key: 'paused',
    label: 'PAUSED',
    textClass: 'text-sem-slate',
    bgClass: 'bg-sem-slate/15',
    borderClass: 'border-sem-slate/30',
    dotClass: 'bg-sem-slate',
    pulse: false,
    definition: 'Temporarily suspended via operator control or token backpressure',
  },
  humanizing: {
    key: 'humanizing',
    label: 'HUMANIZING',
    textClass: 'text-sem-cyan',
    bgClass: 'bg-sem-cyan/10',
    borderClass: 'border-sem-cyan/30',
    dotClass: 'bg-sem-cyan shadow-[0_0_8px_rgba(6,182,212,0.6)]',
    pulse: true,
    definition: 'Syntactic variation & cadence humanization pipeline',
  },
  ready_for_review: {
    key: 'ready_for_review',
    label: 'READY FOR REVIEW',
    textClass: 'text-sem-amber',
    bgClass: 'bg-sem-amber/15',
    borderClass: 'border-sem-amber/35',
    dotClass: 'bg-sem-amber',
    pulse: false,
    definition: 'Synthesis completed; operator sign-off required',
  },
  completed: {
    key: 'completed',
    label: 'COMPLETED',
    textClass: 'text-sem-green',
    bgClass: 'bg-sem-green/10',
    borderClass: 'border-sem-green/30',
    dotClass: 'bg-sem-green',
    pulse: false,
    definition: 'Payload artifact verified and localized to memory core',
  },
  submitted: {
    key: 'submitted',
    label: 'SUBMITTED',
    textClass: 'text-sem-cyan',
    bgClass: 'bg-sem-cyan/10',
    borderClass: 'border-sem-cyan/30',
    dotClass: 'bg-sem-cyan',
    pulse: false,
    definition: 'Dispatched downstream to recipient endpoint',
  },
  graded: {
    key: 'graded',
    label: 'GRADED',
    textClass: 'text-sem-deepgreen',
    bgClass: 'bg-sem-deepgreen/15',
    borderClass: 'border-sem-deepgreen/35',
    dotClass: 'bg-sem-deepgreen',
    pulse: false,
    definition: 'Academic score or rubric evaluation confirmed',
  },
  tracked: {
    key: 'tracked',
    label: 'TRACKED',
    textClass: 'text-sem-indigo',
    bgClass: 'bg-sem-indigo/15',
    borderClass: 'border-sem-indigo/35',
    dotClass: 'bg-sem-indigo',
    pulse: false,
    definition: 'Observability thread monitoring real-time telemetry',
  },
  archived: {
    key: 'archived',
    label: 'ARCHIVED',
    textClass: 'text-sem-gray',
    bgClass: 'bg-sem-gray/15',
    borderClass: 'border-sem-gray/30',
    dotClass: 'bg-sem-gray',
    pulse: false,
    definition: 'Frozen historical state, read-only cold store',
  },
};

/**
 * Normalizes any status input to one of the canonical 11 matrix configs.
 * Strict invariant: Never return "Drafting" for not_started or paused.
 */
export function getStatusConfig(status = '') {
  if (!status) return STATUS_MATRIX.not_started;

  const s = String(status).toLowerCase().trim().replace(/[\s-]+/g, '_');

  if (STATUS_MATRIX[s]) {
    return STATUS_MATRIX[s];
  }

  // Exact / prefix matching
  if (s === 'not_started' || s === 'notstarted' || s === 'unstarted' || s === 'queued' || s === 'unassigned') {
    return STATUS_MATRIX.not_started;
  }
  if (s.includes('pend') || s === 'pending') {
    return STATUS_MATRIX.pending_approval;
  }
  if (s.includes('ready') || s.includes('review')) {
    return STATUS_MATRIX.ready_for_review;
  }
  if (s.includes('human')) {
    return STATUS_MATRIX.humanizing;
  }
  if (s.includes('prog') || s.includes('run') || s.includes('draft') || s.includes('execut') || s.includes('generat')) {
    return STATUS_MATRIX.in_progress;
  }
  if (s.includes('pause') || s.includes('suspend') || s.includes('hold')) {
    return STATUS_MATRIX.paused;
  }
  if (s.includes('grade')) {
    return STATUS_MATRIX.graded;
  }
  if (s.includes('submit')) {
    return STATUS_MATRIX.submitted;
  }
  if (s.includes('complet') || s.includes('done') || s.includes('finish')) {
    return STATUS_MATRIX.completed;
  }
  if (s.includes('track') || s.includes('monitor')) {
    return STATUS_MATRIX.tracked;
  }
  if (s.includes('archive') || s.includes('hist')) {
    return STATUS_MATRIX.archived;
  }

  // Fallback default: neutral NOT STARTED per spec §3.4.4
  return STATUS_MATRIX.not_started;
}

export default STATUS_MATRIX;
