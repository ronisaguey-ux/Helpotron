import React from "react";
import { Flame, Award, Zap } from "lucide-react";

export function MasteryRing({
  percentage = 0,
  size = 48,
  strokeWidth = 4,
  label = "Mastery",
  sublabel = "",
  className = "",
}) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const validPct = Math.min(100, Math.max(0, Number(percentage) || 0));
  const strokeDashoffset = circumference - (validPct / 100) * circumference;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-surface-container-highest"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="text-primary transition-all duration-500 ease-out"
          />
        </svg>
        <span className="absolute font-code-sm text-[10px] font-semibold text-on-surface">
          {Math.round(validPct)}%
        </span>
      </div>
      {(label || sublabel) && (
        <div className="flex flex-col min-w-0">
          {label && (
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider truncate">
              {label}
            </span>
          )}
          {sublabel && (
            <span className="font-code-sm text-xs text-primary font-medium truncate">
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function StreakBadge({ streakDays = 0, className = "" }) {
  // Invariant: ONLY render when real streak exists (>0)
  if (!streakDays || streakDays <= 0) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-sem-amber/10 border border-sem-amber/30 text-sem-amber font-code-sm text-xs shadow-sm ${className}`}
      title={`${streakDays} consecutive days active in study sessions`}
    >
      <Flame className="w-4 h-4 text-sem-amber fill-sem-amber/20 animate-pulse" />
      <span className="font-semibold text-on-surface">
        {streakDays} {streakDays === 1 ? "DAY" : "DAYS"} STREAK
      </span>
    </div>
  );
}

export function DifficultySelector({ difficulty = "medium", onChange }) {
  const levels = [
    { key: "easy", label: "Easy", desc: "Full hints & definitions visible" },
    { key: "medium", label: "Medium", desc: "Standard recall delay" },
    { key: "hard", label: "Hard", desc: "Hints hidden until submission" },
  ];

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container border border-outline-variant/30">
      {levels.map(({ key, label, desc }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange?.(key)}
          title={desc}
          className={`px-3 py-1 rounded-lg text-xs font-label-caps uppercase tracking-wider transition cursor-pointer ${
            difficulty === key
              ? "bg-surface-container-high text-primary font-semibold shadow-sm"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default MasteryRing;
