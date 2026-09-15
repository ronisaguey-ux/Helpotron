/**
 * EffortDial.jsx — Session Effort, free slider 1–10 (Stitch v6 / §3.6.4).
 *
 * Was three locked buttons (Low / Balanced / High) at scores 300/600/900, so
 * only three settings were reachable. The model router already accepts a level
 * of 1–10 directly (`server/llm.py`: `if es <= 10: level = clamp(1, 10, es)`),
 * so the dial now exposes all ten steps instead of quantising the user's choice
 * to the nearest third.
 */
import React from 'react';
import { Gauge, Cpu } from 'lucide-react';

/** The ten effort levels, with the cost/latency shape each one buys. */
export const EFFORT_LEVELS = [
  { level: 1, label: 'Minimal', tokensPerTurn: '~200 tokens/turn', pct: 10 },
  { level: 2, label: 'Minimal', tokensPerTurn: '~300 tokens/turn', pct: 20 },
  { level: 3, label: 'Low', tokensPerTurn: '~400 tokens/turn', pct: 30 },
  { level: 4, label: 'Low', tokensPerTurn: '~550 tokens/turn', pct: 40 },
  { level: 5, label: 'Balanced', tokensPerTurn: '~750 tokens/turn', pct: 50 },
  { level: 6, label: 'Balanced', tokensPerTurn: '~950 tokens/turn', pct: 60 },
  { level: 7, label: 'High', tokensPerTurn: '~1,200 tokens/turn', pct: 70 },
  { level: 8, label: 'High', tokensPerTurn: '~1,500 tokens/turn', pct: 80 },
  { level: 9, label: 'Max', tokensPerTurn: '~1,800 tokens/turn', pct: 90 },
  { level: 10, label: 'Max', tokensPerTurn: '~2,200 tokens/turn', pct: 100 },
];

/**
 * Normalise any stored effort value to a level of 1–10.
 *
 * Older saves hold a 0–1000 score (300/600/900 from the three-button dial, or a
 * value typed into the old extension slider). Passing one of those straight to a
 * 1–10 slider would peg it at 10 and silently max out every existing user, so
 * the legacy bands are mapped instead — mirroring `server/llm.py` so the number
 * shown here is the number the router actually uses.
 */
export function normaliseEffortLevel(score = 6) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 6;
  if (n <= 10) return Math.max(1, Math.min(10, Math.round(n)));
  if (n <= 150) return 1;
  if (n <= 250) return 2;
  if (n <= 350) return 3;
  if (n <= 450) return 4;
  if (n <= 550) return 5;
  if (n <= 650) return 6;
  if (n <= 750) return 7;
  if (n <= 850) return 8;
  if (n <= 950) return 9;
  return 10;
}

export function effortEntryFor(level) {
  return EFFORT_LEVELS[normaliseEffortLevel(level) - 1] || EFFORT_LEVELS[5];
}

/** Back-compat shim: callers that asked for a "level object" still get one. */
export function getEffortLevelFromScore(score = 6) {
  return effortEntryFor(score);
}

export default function EffortDial({
  score = 6,
  onChange = () => {},
  disabled = false,
  modelBadge = 'DeepSeek V4.1 Flash · effort-routed',
}) {
  const level = normaliseEffortLevel(score);
  const entry = effortEntryFor(level);

  return (
    <div className="flex flex-col gap-unit-3 pt-unit-3 bg-surface-container-low/60 border border-outline-variant/20 rounded-xl p-unit-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-micro-2">
          <Gauge className="w-4 h-4 text-primary" />
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
            Session Effort
          </span>
        </div>
        <span className="font-chip-status text-chip-status text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded uppercase">
          {level} / 10
        </span>
      </div>

      {/* Continuous slider — every step 1–10 is selectable */}
      <input
        type="range"
        id="session-effort-slider"
        min="1"
        max="10"
        step="1"
        value={level}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Session effort level, 1 to 10"
        aria-valuetext={`${level} of 10 — ${entry.label}`}
        className="w-full accent-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between font-code-sm text-[10px] text-outline px-0.5 -mt-1">
        <span>1</span><span>5</span><span>10</span>
      </div>

      {/* Effort Telemetry Readout */}
      <div className="flex flex-col gap-1 px-1">
        <div className="flex justify-between items-baseline">
          <span className="font-tabular-stat-md text-tabular-stat-md text-on-surface font-semibold">
            {entry.label} ({level}/10)
          </span>
          <span className="font-code-sm text-code-sm text-primary">
            {entry.tokensPerTurn}
          </span>
        </div>
        {/* Subtle Progress Track Indicator */}
        <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mt-1">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(89,216,201,0.5)]"
            style={{ width: `${entry.pct}%` }}
          />
        </div>
      </div>

      {/* Model Badge */}
      <div className="flex items-center gap-micro-2 p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/15 mt-1">
        <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-code-sm text-code-sm text-on-surface-variant truncate">
          {modelBadge}
        </span>
      </div>
    </div>
  );
}
