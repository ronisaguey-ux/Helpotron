import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, ArrowUpRight, Zap, Play, ShieldAlert, Sparkles } from 'lucide-react';

export default function AssignmentCard({
  id,
  title,
  course,
  dueDate,
  status = "Not Started",
  urgency = "normal",
  detectorRisk = 0.02,
  estimatedTime = "1.5 hours",
  scoreAI = 0.0,
  teacherName = "",
  onSelect = () => {},
}) {
  const isUrgent = urgency === "high" || status === "Humanizing";
  const isCompleted = status === "Completed" || status === "Submitted";
  const isInProgress = status === "In Progress" || status === "Humanizing" || status === "Ready for Review";

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
      aria-label={`Select assignment: ${title}`}
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
              {course}
            </span>
            {teacherName && (
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[140px]">
                {teacherName}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors line-clamp-2 leading-snug">
            {title}
          </h3>
        </div>
      </div>

      {/* Details Row */}
      <div className="grid grid-cols-2 gap-2 my-3.5 py-2 px-3 rounded-lg bg-black/40 border border-white/5 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="truncate">Due: {dueDate}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>AI Risk: {(detectorRisk * 100).toFixed(0)}%</span>
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

        <button
          type="button"
          aria-label={`Inspect and execute assignment: ${title}`}
          className="flex items-center gap-1 text-xs font-mono font-medium text-slate-300 group-hover:text-cyan-300 transition-colors group-hover:translate-x-0.5 focus-visible:ring-1 focus-visible:ring-cyan-400 rounded px-1"
        >
          Inspect & Execute <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

# <<<FIX A1 - Inconsistent Typography Scale and Heading Hierarchy>>>
# Description: Standardize typography tokens in index.css with strict modular classes (H1: 2rem/700, H2: 1.5rem/600, H3: 1.25rem/600, body: 1rem/400).
# NOTE: Automated placeholder – replace with actual code change.

# <<<FIX A5 - Subtle Text Fails WCAG AA 4.5:1 Contrast Ratio in Dark Mode>>>
# Description: Elevate muted text in dark mode from text-slate-400 to text-slate-300 or text-slate-200 to achieve 5.8:1 contrast.
# NOTE: Automated placeholder – replace with actual code change.

# <<<FIX D1 - Fragmented Button Component Usage Across Modules>>>
# Description: Refactor all raw button instances to use the centralized Button component with standard variants (primary, secondary, outline, ghost, destructive).
# NOTE: Automated placeholder – replace with actual code change.

# <<<FIX E2 - Touch Targets Less Than 44px on Assignment Action Badges>>>
# Description: Increase minimum padding and touch bounding box to min-h-[44px] min-w-[44px] on all mobile interactive elements.
# NOTE: Automated placeholder – replace with actual code change.

# <<<FIX A13 - Emoji used as interface icons instead of standard SVG set>>>
# Description: Import and render Lucide React SVG icons (<BookOpen />, <Zap />, <FileText />, <Target />) with consistent 20px sizing.
# NOTE: Automated placeholder – replace with actual code change.
