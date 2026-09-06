/**
 * EffortDial.jsx — Session Effort Dial (Low / Balanced / High) (Stitch v6 / §3.6.4).
 * Single canonical effort dial per session with tokens/turn readout and prover badge.
 */
import React from 'react';
import { Gauge, Cpu } from 'lucide-react';

export const EFFORT_LEVELS = [
  { id: 'low', label: 'Low', score: 300, scoreDisplay: '3/10', tokensPerTurn: '300 tokens/turn', pct: 30 },
  { id: 'balanced', label: 'Balanced', score: 600, scoreDisplay: '6/10', tokensPerTurn: '840 tokens/turn', pct: 60 },
  { id: 'high', label: 'High', score: 900, scoreDisplay: '9/10', tokensPerTurn: '1,800 tokens/turn', pct: 90 },
];

export function getEffortLevelFromScore(score = 600) {
  if (score <= 350) return EFFORT_LEVELS[0];
  if (score >= 750) return EFFORT_LEVELS[2];
  return EFFORT_LEVELS[1];
}

export default function EffortDial({
  score = 600,
  onChange = () => {},
  disabled = false,
  modelBadge = 'Claude 3.5 Sonnet + Z3 SMT Prover',
}) {
  const currentLevel = getEffortLevelFromScore(score);

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
          Dynamic
        </span>
      </div>

      {/* Segmented Dial Control (Low | Balanced | High) */}
      <div
        role="radiogroup"
        aria-label="Effort Level Dial"
        className="grid grid-cols-3 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/25 gap-1"
      >
        {EFFORT_LEVELS.map((lvl) => {
          const isSelected = lvl.id === currentLevel.id;
          return (
            <button
              key={lvl.id}
              role="radio"
              type="button"
              id={`effort-radio-${lvl.id}`}
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(lvl.score)}
              className={`py-1.5 text-center font-label-caps text-label-caps rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'text-on-primary-container bg-primary-container font-semibold shadow-[0_0_12px_rgba(89,216,201,0.2)]'
                  : 'text-outline hover:text-on-surface hover:bg-surface-container-high/30'
              }`}
            >
              {lvl.label}
            </button>
          );
        })}
      </div>

      {/* Effort Telemetry Readout */}
      <div className="flex flex-col gap-1 px-1">
        <div className="flex justify-between items-baseline">
          <span className="font-tabular-stat-md text-tabular-stat-md text-on-surface font-semibold">
            {currentLevel.label} ({currentLevel.scoreDisplay})
          </span>
          <span className="font-code-sm text-code-sm text-primary">
            {currentLevel.tokensPerTurn}
          </span>
        </div>
        {/* Subtle Progress Track Indicator */}
        <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mt-1">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(89,216,201,0.5)]"
            style={{ width: `${currentLevel.pct}%` }}
          />
        </div>
      </div>

      {/* Prover Model Badge */}
      <div className="flex items-center gap-micro-2 p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/15 mt-1">
        <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-code-sm text-code-sm text-on-surface-variant truncate">
          {modelBadge}
        </span>
      </div>
    </div>
  );
}
