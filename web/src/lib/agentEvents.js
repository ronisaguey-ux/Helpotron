/**
 * agentEvents.js — Assignment and moment event processing for the agent timeline & chat (Stitch v6 / 3.6.7).
 * Strictly complies with LUMINOUS GLASS M3 tokens and honest state chips.
 */

import { parseDueDate, isDueSoon, isFinalStatus } from './assignmentEvents.js';

export const AGENT_EVENT_TYPES = {
  ASSIGNMENT_CREATED: 'assignment_created',
  ASSIGNMENT_DUE: 'assignment_due',
  ASSIGNMENT_COMPLETED: 'assignment_completed',
  MOMENT_INTERVENTION: 'moment_intervention',
  MOMENT_MILESTONE: 'moment_milestone',
};

export const HONEST_EVENT_CHIPS = {
  assignment_created: {
    label: 'New Assignment',
    chipStatus: 'NEW',
    variant: 'info',
    borderClass: 'border-sem-cyan/40',
    bgGlowClass: 'bg-sem-cyan/10',
    textAccentClass: 'text-sem-cyan',
  },
  assignment_due: {
    label: 'Due Soon',
    chipStatus: 'DUE SOON',
    variant: 'warning',
    borderClass: 'border-sem-amber/40',
    bgGlowClass: 'bg-sem-amber/10',
    textAccentClass: 'text-sem-amber',
  },
  assignment_completed: {
    label: 'Completed',
    chipStatus: 'COMPLETED',
    variant: 'success',
    borderClass: 'border-sem-green/40',
    bgGlowClass: 'bg-sem-green/10',
    textAccentClass: 'text-sem-green',
  },
  moment_intervention: {
    label: 'Action Required',
    chipStatus: 'GATED',
    variant: 'warning',
    borderClass: 'border-sem-amber/40',
    bgGlowClass: 'bg-sem-amber/10',
    textAccentClass: 'text-sem-amber',
  },
  moment_milestone: {
    label: 'Milestone Reached',
    chipStatus: 'MILESTONE',
    variant: 'info',
    borderClass: 'border-primary/40',
    bgGlowClass: 'bg-primary/10',
    textAccentClass: 'text-primary',
  },
};

/**
 * Derives honest lifecycle events from an assignment object.
 */
export function deriveAssignmentEvent(assignment, turnedInIds = new Set()) {
  if (!assignment) return null;

  const idStr = String(assignment.id);
  const isTurnedIn = turnedInIds.has(idStr) || isFinalStatus(assignment.status);

  if (isTurnedIn) {
    return {
      type: AGENT_EVENT_TYPES.ASSIGNMENT_COMPLETED,
      assignment,
      chip: HONEST_EVENT_CHIPS.assignment_completed,
      timestamp: assignment.updated_at || assignment.created_at || new Date().toISOString(),
    };
  }

  if (isDueSoon(assignment.due_date)) {
    return {
      type: AGENT_EVENT_TYPES.ASSIGNMENT_DUE,
      assignment,
      chip: HONEST_EVENT_CHIPS.assignment_due,
      timestamp: assignment.due_date || new Date().toISOString(),
    };
  }

  return {
    type: AGENT_EVENT_TYPES.ASSIGNMENT_CREATED,
    assignment,
    chip: HONEST_EVENT_CHIPS.assignment_created,
    timestamp: assignment.created_at || new Date().toISOString(),
  };
}

/**
 * Formats token figures into compact readability (e.g. 38.4k).
 */
export function formatTokenMetric(tokens) {
  const n = Number(tokens || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
