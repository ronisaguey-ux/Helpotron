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
  onLaunchToDoc = null,
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
      className="relative group bg-surface-container-low hover:bg-surface-container rounded-2xl border border-outline-variant/30 hover:border-outline-variant/60 p-5 transition-all duration-200 card-lift overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/* Corner Accent Edge */}
      <div className="absolute top-0 right-0 w-12 h-12 overflow-hidden pointer-events-none">
        <div
          className={`absolute transform rotate-45 w-16 h-1.5 -top-1 -right-4 ${
            isUrgent
              ? 'bg-error'
              : isCompleted
              ? 'bg-primary'
              : 'bg-secondary'
          }`}
        />
      </div>

      {/* Header Info */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-label-caps text-[10px] px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant uppercase tracking-wider font-medium">
              {displayCourse}
            </span>
            {teacherName && (
              <span className="font-body-sm text-[11px] text-on-surface-variant truncate max-w-[140px]">
                {teacherName}
              </span>
            )}
          </div>
          <h3 className="font-title-md text-title-md text-on-surface group-hover:text-primary transition-colors line-clamp-2 leading-snug">
            {displayTitle}
          </h3>
        </div>
      </div>

      {/* Details Row */}
      <div className="grid grid-cols-2 gap-2 my-3.5 py-2.5 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 font-tabular-stat text-xs">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Clock className="w-3.5 h-3.5 text-outline" />
          <span className="truncate">Due: {dueDate || 'No deadline'}</span>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Zap className="w-3.5 h-3.5 text-secondary" />
          <span>AI Risk: {detectorRisk != null ? `${(detectorRisk * 100).toFixed(0)}%` : 'Not checked'}</span>
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
        <div className="flex items-center gap-1.5">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary font-label-caps text-[10px] uppercase font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> {status}
            </span>
          ) : isInProgress ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary font-label-caps text-[10px] uppercase font-semibold">
              <Sparkles className="w-3.5 h-3.5 animate-spin" /> {status}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 font-label-caps text-[10px] uppercase font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Pending Execution
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Launch to Doc Assistive Typing button */}
          {typeof onLaunchToDoc === 'function' && (
            <button
              type="button"
              aria-label={`Launch ${displayTitle} to Google Doc with assistive typing`}
              title="Launch to Google Doc (Assistive Typing for Accessibility)"
              onClick={(e) => { e.stopPropagation(); onLaunchToDoc(e); }}
              className="flex items-center gap-1 font-label-caps text-xs text-secondary hover:text-on-primary hover:bg-secondary rounded-lg px-2.5 py-1.5 transition cursor-pointer border border-secondary/30 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Launch to Doc</span>
            </button>
          )}

          {/* Chat bubble */}
          {typeof onChat === 'function' && (
            <button
              type="button"
              aria-label={`Chat with the agent team about ${displayTitle}`}
              title="Chat with the agent team about this assignment"
              onClick={(e) => { e.stopPropagation(); onChat(e); }}
              className="flex items-center gap-1 font-label-caps text-xs text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg px-2.5 py-1.5 transition cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Chat
            </button>
          )}

          <button
            type="button"
            aria-label={`Inspect and execute assignment: ${displayTitle}`}
            className="flex items-center gap-1 font-label-caps text-xs text-on-surface-variant group-hover:text-primary transition-colors group-hover:translate-x-0.5 rounded-lg px-2 py-1.5"
          >
            Open <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
