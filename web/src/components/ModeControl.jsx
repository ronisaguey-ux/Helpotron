/**
 * ModeControl.jsx — Segmented Agent Execution Mode Control (Stitch v6 / §3.6.2).
 * Supports MANUAL / AUTO-PILOT / YOLO with permission scope and pending approval badge.
 */
import React from 'react';
import { Shield, ShieldCheck, Zap, AlertCircle } from 'lucide-react';

export const EXECUTION_MODES = [
  {
    id: 'manual',
    label: 'MANUAL',
    icon: Shield,
    title: 'Manual Mode: Agent asks before all external side effects and tool invocations.',
  },
  {
    id: 'auto',
    label: 'AUTO-PILOT',
    icon: ShieldCheck,
    title: 'Auto-Pilot Mode: Routine tool executions auto-approved; major side effects require permission.',
  },
  {
    id: 'yolo',
    label: 'YOLO',
    icon: Zap,
    title: 'YOLO Mode: Autonomous execution without interruption gates.',
  },
];

export default function ModeControl({
  mode = 'auto',
  onChange = () => {},
  pendingCount = 0,
  onOpenPending = () => {},
  disabled = false,
}) {
  const normalizedMode = (mode || 'auto').toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-unit-2">
      {/* Segmented Mode Tablist */}
      <div
        role="tablist"
        aria-label="Agent Execution Mode"
        className="flex items-center p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/30"
      >
        {EXECUTION_MODES.map((m) => {
          const isActive = normalizedMode === m.id;
          const isYolo = m.id === 'yolo';

          let activeClass = 'bg-primary-container text-on-primary-container font-semibold shadow-[0_0_18px_rgba(89,216,201,0.25)]';
          if (isYolo) {
            activeClass = 'bg-sem-amber/20 text-sem-amber font-semibold border border-sem-amber/40 shadow-[0_0_18px_rgba(245,158,11,0.2)]';
          }

          let inactiveClass = 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40';
          if (isYolo) {
            inactiveClass = 'text-sem-amber/80 hover:text-sem-amber hover:bg-sem-amber/10';
          }

          return (
            <button
              key={m.id}
              role="tab"
              type="button"
              id={`mode-tab-${m.id}`}
              aria-selected={isActive}
              aria-controls={`mode-panel-${m.id}`}
              title={m.title}
              disabled={disabled}
              onClick={() => onChange(m.id)}
              className={`h-10 px-unit-3 sm:px-unit-4 rounded-lg font-label-caps text-label-caps transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive ? activeClass : inactiveClass
              }`}
            >
              {isActive && m.id === 'auto' && (
                <span className="w-1.5 h-1.5 rounded-full bg-on-primary-container animate-ping" />
              )}
              {isYolo && (
                <Zap className="w-3.5 h-3.5 text-sem-amber shrink-0" />
              )}
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Pending Action Approval Badge (§3.6.2) */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={onOpenPending}
          className="h-10 px-unit-3 rounded-xl bg-sem-amber/15 hover:bg-sem-amber/25 text-sem-amber border border-sem-amber/30 flex items-center gap-micro-2 transition-all cursor-pointer shadow-sm animate-pulse"
          title={`${pendingCount} autonomous action(s) awaiting approval`}
        >
          <AlertCircle className="w-4 h-4 text-sem-amber shrink-0" />
          <span className="font-chip-status text-chip-status font-semibold tracking-wide uppercase">
            {pendingCount} Action{pendingCount > 1 ? 's' : ''} Waiting
          </span>
          <span className="font-code-sm text-code-sm underline font-medium ml-1">Review</span>
        </button>
      )}
    </div>
  );
}
