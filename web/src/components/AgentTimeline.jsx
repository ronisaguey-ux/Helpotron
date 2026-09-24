import React from 'react';
import {
  CheckCircle2,
  Square,
  AlertCircle,
  RefreshCw,
  Clock,
  Zap,
} from 'lucide-react';
import { calculateTimelineProgress, TIMELINE_STATUS } from '../lib/team.js';

/**
 * AgentTimeline Component — Stitch Screen 3.5.3 Specification
 *
 * Displays overall execution % readout (tabular mono) + h-2 progressbar with aria-valuenow,
 * connected vertical timeline nodes with live status indicators, and Stop Execution
 * with 3 operational states (Armed, Halted, Finished).
 */
export default function AgentTimeline({
  subagents = [],
  bucket = 'pending',
  isInterrupted = false,
  onInterrupt,
  interrupting = false,
  className = '',
}) {
  const { percent, phaseText, isFinished, nodes } = calculateTimelineProgress(
    subagents,
    bucket,
    isInterrupted
  );

  return (
    <div
      aria-live="polite"
      className={`rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 md:p-8 flex flex-col gap-6 shadow-sm ${className}`}
    >
      {/* Top Header & Stop Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/15 pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_12px_rgba(168,85,247,0.7)]" />
            <span className="font-label-caps text-xs text-secondary uppercase tracking-widest font-semibold">
              Pipeline Telemetry
            </span>
          </div>
          <h3 className="font-title-md text-title-md text-on-surface font-semibold">
            Autonomous Pipeline Activity
          </h3>
        </div>

        {/* Stop Execution Button: 3 States (Armed / Halted / Finished) */}
        <div>
          {isInterrupted ? (
            <div className="h-11 px-5 rounded-xl bg-error/20 border border-error/40 text-error font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 font-semibold">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span>Pipeline Halted</span>
            </div>
          ) : isFinished ? (
            <div className="h-11 px-5 rounded-xl bg-surface-container-high text-on-surface-variant font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 opacity-60">
              <CheckCircle2 className="w-4 h-4 text-sem-green" />
              <span>Finished</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onInterrupt}
              disabled={interrupting || bucket === 'pending'}
              className="group h-11 px-5 rounded-xl bg-error/10 hover:bg-error text-error hover:text-on-error border border-error/30 active:scale-[0.98] font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Immediately halt all active inference subagent threads"
            >
              <Square className={`w-3.5 h-3.5 fill-current ${interrupting ? 'animate-spin' : ''}`} />
              <span>{interrupting ? 'Stopping...' : 'Stop Execution'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Metric Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-chip-status text-[10px] text-primary bg-primary/10 border border-primary/25 px-2.5 py-0.5 rounded-full font-semibold uppercase">
            {phaseText}
          </span>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="font-tabular-stat text-xl font-bold text-on-surface">
              {percent.toFixed(1)}%
            </span>
            <span className="font-code-sm text-xs text-on-surface-variant">RESOLVED</span>
          </div>
        </div>

        {/* Progress Bar (role="progressbar" aria-valuenow) */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden relative"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 relative ${
              isInterrupted
                ? 'bg-error'
                : isFinished
                ? 'bg-sem-green'
                : 'bg-gradient-to-r from-primary to-secondary'
            }`}
            style={{ width: `${percent}%` }}
          >
            {!isFinished && !isInterrupted && (
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* Vertical Interactive Timeline Nodes with Connecting Spine */}
      <div className="relative flex flex-col gap-4 pt-2">
        {/* Spine Track */}
        <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-outline-variant/20 -translate-x-1/2 pointer-events-none" />

        {nodes.map((node) => {
          const isNodeCompleted = node.status === TIMELINE_STATUS.COMPLETED;
          const isNodeRunning = node.status === TIMELINE_STATUS.RUNNING;
          const isNodeHalted = node.status === TIMELINE_STATUS.HALTED;

          return (
            <div key={node.id} className="flex items-start gap-4 relative group">
              {/* Node Icon Orb */}
              <div
                className={`relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-all ${
                  isNodeCompleted
                    ? 'bg-sem-green/15 border-sem-green/40 text-sem-green shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : isNodeRunning
                    ? 'bg-sem-blue/15 border-sem-blue/50 text-sem-blue shadow-[0_0_16px_rgba(59,130,246,0.25)]'
                    : isNodeHalted
                    ? 'bg-error/15 border-error/40 text-error'
                    : 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
                }`}
              >
                {isNodeCompleted ? (
                  <CheckCircle2 className="w-5 h-5 stroke-[2]" />
                ) : isNodeRunning ? (
                  <div className="relative flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-sem-blue" />
                    <span className="absolute -inset-1 rounded-full bg-sem-blue opacity-75 animate-ping" />
                  </div>
                ) : isNodeHalted ? (
                  <AlertCircle className="w-5 h-5 stroke-[2]" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-outline" />
                )}
              </div>

              {/* Node Details Card */}
              <div className="flex-1 min-w-0 bg-surface-container-low/40 group-hover:bg-surface-container-low/70 border border-outline-variant/15 rounded-2xl p-4 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-label-caps text-[10px] font-semibold uppercase tracking-wider ${
                        isNodeCompleted
                          ? 'text-sem-green'
                          : isNodeRunning
                          ? 'text-sem-blue'
                          : isNodeHalted
                          ? 'text-error'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      Step {node.index} • {node.role}
                    </span>
                    <span className="font-title-md text-sm text-on-surface font-semibold truncate">
                      {node.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant">
                    <span>{node.timeSpent}</span>
                    <span className="w-1 h-1 rounded-full bg-outline-variant" />
                    <span
                      className={
                        isNodeCompleted
                          ? 'text-sem-green font-medium'
                          : isNodeRunning
                          ? 'text-sem-blue font-medium'
                          : isNodeHalted
                          ? 'text-error'
                          : 'text-on-surface-variant'
                      }
                    >
                      {node.note}
                    </span>
                  </div>
                </div>

                <p className="font-body-sm text-xs text-on-surface-variant">
                  {node.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
