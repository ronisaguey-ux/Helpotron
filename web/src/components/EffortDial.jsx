/**
 * EffortDial.jsx — session effort, 1–10.
 *
 * History, so this does not get "improved" back:
 *   - It used to be three locked buttons (Low / Balanced / High at 300/600/900),
 *     so only three settings were reachable.
 *   - It then showed a per-level "~200 tokens/turn"-style readout. Those numbers
 *     were never measured — they were invented for the UI — and a fabricated
 *     cost figure next to a real slider is worse than no figure at all. Removed.
 *
 * What is left is the control and the fact the router actually needs: a level of
 * 1–10. `server/llm.py` accepts the level directly (`if es <= 10: level =
 * clamp(1, 10, es)`), and `parse_effort_score` scales a level by 100 for the
 * stored score, so the number shown here is the number the router uses.
 */
import React from 'react';
import { Gauge, Cpu } from 'lucide-react';

/** Plain names for the ten levels — no cost claims attached. */
export const EFFORT_LEVELS = [
  { level: 1, label: 'Minimal' },
  { level: 2, label: 'Minimal' },
  { level: 3, label: 'Low' },
  { level: 4, label: 'Low' },
  { level: 5, label: 'Balanced' },
  { level: 6, label: 'Balanced' },
  { level: 7, label: 'High' },
  { level: 8, label: 'High' },
  { level: 9, label: 'Max' },
  { level: 10, label: 'Max' },
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
  modelBadge = '',
}) {
  const level = normaliseEffortLevel(score);
  const entry = effortEntryFor(level);

  return (
    <div className="flex flex-col gap-unit-3 pt-unit-3 bg-surface-container-low/60 border border-outline-variant/20 rounded-xl p-unit-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-micro-2">
          <Gauge className="w-4 h-4 text-primary" />
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
            Effort
          </span>
        </div>
        <span className="font-chip-status text-chip-status text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded uppercase">
          {level} / 10
        </span>
      </div>

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

      <span className="font-body-sm text-xs text-on-surface-variant">
        {entry.label}
      </span>

      {modelBadge ? (
        <div className="flex items-center gap-micro-2 p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/15">
          <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-code-sm text-code-sm text-on-surface-variant truncate">
            {modelBadge}
          </span>
        </div>
      ) : null}
    </div>
  );
}
