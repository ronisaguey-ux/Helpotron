import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, ArrowUpRight, Zap, Sparkles, MessageSquare } from 'lucide-react';

/* Aurora semantic chip tints (scoped): .aurora-chip keeps its glass pill
   base from index.css; these modifiers recolor it for status semantics. */
const AURORA_CHIP_TINTS = `
.aurora-chip.ok    { background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.32); color: #6ee7b7; }
.aurora-chip.info  { background: rgba(34,211,238,0.13); border-color: rgba(34,211,238,0.30); color: #67e8f9; }
.aurora-chip.warn  { background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.32); color: #fcd34d; }
`;

export default function AssignmentCard({
  id,
  title,
  course,
  dueDate,
  status = "Not Started",
  urgency = "normal",
  detectorRisk = null,
  estimatedTime = "",
  scoreAI = null,
  teacherName = "",
  onSelect = () => {},
  onChat = null,
}) {
  const isUrgent = urgency === "high" || status === "Humanizing";
  const isCompleted = status === "Completed" || status === "Submitted";
  const isInProgress = status === "In Progress" || status === "Humanizing" || status === "Ready for Review";
  // Ghost-proof display fallbacks (operator 08-28): scrape pipelines can land
  // assignments with a missing/empty title — the bubble must never render
  // with a blank identity.
  const displayTitle = (title && String(title).trim()) || `Assignment #${id ?? '?'}`;
  const displayCourse = (course && String(course).trim()) || 'General';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(id);
        }
      }}
      aria-label={`Select assignment: ${displayTitle}`}
      className="relative group glass-panel p-5 transition-all duration-300 hover:-translate-y-0.5 overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
    >
      <style>{AURORA_CHIP_TINTS}</style>

      {/* Corner Accent Edge */}
      <div className="absolute top-0 right-0 w-12 h-12 overflow-hidden pointer-events-none">
        <div
          className={`absolute transform rotate-45 bg-gradient-to-r w-16 h-2 -top-1 -right-4 ${
            isUrgent
              ? 'from-rose-500 to-amber-500'
              : isCompleted
              ? 'from-emerald-500 to-teal-400'
              : 'from-cyan-500 to-indigo-500'
          }`}
        />
      </div>

      {/* Header Info */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="aurora-chip info font-mono uppercase tracking-wide">
              {displayCourse}
            </span>
            {teacherName && (
              <span className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-[140px]">
                {teacherName}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 leading-snug">
            {displayTitle}
          </h3>
        </div>
      </div>

      {/* Details Row */}
      <div className="grid grid-cols-2 gap-2 my-3.5 py-2 px-3 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-xs font-mono">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="truncate">Due: {dueDate || 'No deadline'}</span>
        </div>
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>AI Risk: {detectorRisk != null ? `${(detectorRisk * 100).toFixed(0)}%` : 'Not checked'}</span>
        </div>
      </div>

      {/* Card Action Footer — one primary intent + the chat bubble */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5 text-xs font-mono">
          {isCompleted ? (
            <span className="aurora-chip ok">
              <CheckCircle2 className="w-3.5 h-3.5" /> {status}
            </span>
          ) : isInProgress ? (
            <span className="aurora-chip info">
              <Sparkles className="w-3.5 h-3.5 animate-spin" /> {status}
            </span>
          ) : (
            <span className="aurora-chip warn">
              <AlertTriangle className="w-3.5 h-3.5" /> Pending Execution
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Chat bubble — opens the per-assignment agent team chat (08-28) */}
          {typeof onChat === 'function' && (
            <button
              type="button"
              aria-label={`Chat with the agent team about ${displayTitle}`}
              title="Chat with the agent team about this assignment"
              onClick={(e) => { e.stopPropagation(); onChat(e); }}
              className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] rounded-[var(--radius-sm)] px-2 py-1.5 transition cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Chat
            </button>
          )}

          <button
            type="button"
            aria-label={`Inspect and execute assignment: ${displayTitle}`}
            className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors group-hover:translate-x-0.5 focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded-[var(--radius-sm)] px-1.5 py-1.5"
          >
            Open <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
