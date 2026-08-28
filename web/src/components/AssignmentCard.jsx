import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, ArrowUpRight, Zap, Play, ShieldAlert, Sparkles, MessageSquare } from 'lucide-react';

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
      className="relative group glass-panel rounded-xl p-5 transition-all duration-300 hover:-translate-y-1 overflow-hidden cursor-pointer border border-white/10 hover:border-cyan-500/40 focus-visible:ring-2 focus-visible:ring-cyan-400 focus:outline-none"
    >
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
            <span className="text-[11px] font-mono uppercase tracking-wide text-cyan-400 font-semibold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              {displayCourse}
            </span>
            {teacherName && (
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[140px]">
                {teacherName}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors line-clamp-2 leading-snug">
            {displayTitle}
          </h3>
        </div>
      </div>

      {/* Details Row */}
      <div className="grid grid-cols-2 gap-2 my-3.5 py-2 px-3 rounded-lg bg-black/40 border border-white/5 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="truncate">Due: {dueDate || 'No deadline'}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>AI Risk: {detectorRisk != null ? `${(detectorRisk * 100).toFixed(0)}%` : 'Not checked'}</span>
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-xs font-mono">
          {isCompleted ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> {status}
            </span>
          ) : isInProgress ? (
            <span className="flex items-center gap-1 text-cyan-400">
              <Sparkles className="w-3.5 h-3.5 animate-spin" /> {status}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" /> Pending Execution
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Chat bubble — opens the per-assignment agent team chat (08-28) */}
          {typeof onChat === 'function' && (
            <button
              type="button"
              aria-label={`Chat with the agent team about ${displayTitle}`}
              title="Chat with the agent team about this assignment"
              onClick={(e) => { e.stopPropagation(); onChat(e); }}
              className="flex items-center gap-1 text-xs font-mono font-medium text-blue-300 hover:text-blue-200 hover:bg-blue-500/10 rounded px-1.5 py-1 transition cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Chat
            </button>
          )}

          <button
            type="button"
            aria-label={`Inspect and execute assignment: ${displayTitle}`}
            className="flex items-center gap-1 text-xs font-mono font-medium text-slate-300 group-hover:text-cyan-300 transition-colors group-hover:translate-x-0.5 focus-visible:ring-1 focus-visible:ring-cyan-400 rounded px-1"
          >
            Inspect & Execute <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}





