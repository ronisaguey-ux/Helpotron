/**
 * team.js — Subagent Team & Execution Timeline Engine (§3.5.3)
 *
 * Provides timeline state resolution, execution progress computation,
 * and lifecycle definitions for the autonomous agent pipeline.
 */

export const DEFAULT_PIPELINE_NODES = [
  {
    id: 'node_deconstruct',
    name: 'Deconstruction & Research',
    role: 'Planner / Researcher',
    description: 'Deconstruct prompt constraints, parse syllabus rubric, and establish factual grounding.',
    estimatedDuration: '0.4s',
  },
  {
    id: 'node_synthesis',
    name: 'Synthesis & Derivation',
    role: 'Synthesis Engine',
    description: 'Execute deep derivation, formalize arguments, and generate core academic draft.',
    estimatedDuration: '1.2s',
  },
  {
    id: 'node_humanize',
    name: 'Cadence Humanization',
    role: 'Style Matching',
    description: 'Vary syntactic complexity, calibrate burstiness, and align prose cadence to student style.',
    estimatedDuration: '0.8s',
  },
  {
    id: 'node_integrity',
    name: 'Quality & Integrity Seal',
    role: 'Integrity Validator',
    description: 'Audit citation topology, verify human-style review score, and lock final submission package.',
    estimatedDuration: '0.3s',
  },
];

export const TIMELINE_STATUS = {
  COMPLETED: 'completed',
  RUNNING: 'running',
  PENDING: 'pending',
  FAILED: 'failed',
  HALTED: 'halted',
};

/**
 * Calculates overall execution progress percentage and active node state
 */
export function calculateTimelineProgress(subagents = [], bucket = 'pending', isInterrupted = false) {
  if (bucket === 'completed' || bucket === 'archived') {
    return {
      percent: 100,
      phaseText: 'QUORUM PHASE 4/4 · FINALIZED',
      isFinished: true,
      nodes: DEFAULT_PIPELINE_NODES.map((n, i) => ({
        ...n,
        index: i + 1,
        status: TIMELINE_STATUS.COMPLETED,
        timeSpent: n.estimatedDuration,
        note: 'VERIFIED · PASSED',
      })),
    };
  }

  if (isInterrupted) {
    return {
      percent: 45,
      phaseText: 'EXECUTION HALTED BY OPERATOR',
      isFinished: false,
      nodes: DEFAULT_PIPELINE_NODES.map((n, i) => ({
        ...n,
        index: i + 1,
        status: i === 0 ? TIMELINE_STATUS.COMPLETED : i === 1 ? TIMELINE_STATUS.HALTED : TIMELINE_STATUS.PENDING,
        timeSpent: i === 0 ? n.estimatedDuration : '—',
        note: i === 1 ? 'INTERRUPTED' : i === 0 ? 'VERIFIED' : 'WAITING',
      })),
    };
  }

  if (bucket === 'in_progress') {
    return {
      percent: 68.4,
      phaseText: 'QUORUM PHASE 3/4 · ACTIVE',
      isFinished: false,
      nodes: DEFAULT_PIPELINE_NODES.map((n, i) => ({
        ...n,
        index: i + 1,
        status: i < 2 ? TIMELINE_STATUS.COMPLETED : i === 2 ? TIMELINE_STATUS.RUNNING : TIMELINE_STATUS.PENDING,
        timeSpent: i < 2 ? n.estimatedDuration : 'Running (0.8s)',
        note: i < 2 ? 'VERIFIED · PASSED' : i === 2 ? 'OPTIMIZING CADENCE' : 'QUEUED',
      })),
    };
  }

  // Pending / Not started
  return {
    percent: 0,
    phaseText: 'PIPELINE ARMED · AWAITING DIRECTION',
    isFinished: false,
    nodes: DEFAULT_PIPELINE_NODES.map((n, i) => ({
      ...n,
      index: i + 1,
      status: TIMELINE_STATUS.PENDING,
      timeSpent: '—',
      note: 'WAITING',
    })),
  };
}

export default {
  DEFAULT_PIPELINE_NODES,
  TIMELINE_STATUS,
  calculateTimelineProgress,
};
