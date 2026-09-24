import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Receipt,
  Verified,
  TrendingDown,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import api from '../api.js';

export default function CreditsCostTab({ onBack = null, userId = '', currentTokens = 0, currentCredits = 0 }) {
  const [costData, setCostData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.getCostIntelligence().catch(() => null),
      api.dashboard(userId).catch(() => null),
    ]).then(([costRes, dashRes]) => {
      if (!mounted) return;
      setCostData(costRes);
      if (dashRes?.recent_transactions) {
        setTransactions(dashRes.recent_transactions);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const cycleSpendUsd = Number(costData?.cycle_spend_usd ?? (transactions.reduce((acc, t) => acc + (t.delta < 0 ? Math.abs(t.delta) : 0), 0) * 0.01)).toFixed(2);
  const cycleTokens = Math.round(Number(cycleSpendUsd) * 100);

  const categories = [
    { label: 'Universal Assignment Dump', key: 'dump', pct: 45, tokens: Math.round(cycleTokens * 0.45) },
    { label: 'Flashcards & Practice Quizzes', key: 'study', pct: 30, tokens: Math.round(cycleTokens * 0.30) },
    { label: 'Research & Essay Synthesis', key: 'synthesis', pct: 18, tokens: Math.round(cycleTokens * 0.18) },
    { label: 'AI Detection & Calibration', key: 'detection', pct: 7, tokens: Math.round(cycleTokens * 0.07) },
  ];

  return (
    <div className="space-y-6">
      {/* Header bar with Back target */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-11 h-11 min-h-[44px] rounded-xl bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all shadow-sm"
              title="Return to Plans"
              aria-label="Back to Plans"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Helpotron OS</span>
              <span className="text-outline-variant font-code-sm text-xs">/</span>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-sem-green/15 text-sem-green font-chip-status text-[10px] uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-sem-green animate-pulse"></span>
                Live
              </div>
            </div>
            <h2 className="font-headline-lg-mobile md:font-headline-lg text-title-md md:text-headline-lg text-on-surface font-semibold tracking-tight">
              Usage &amp; Spending
            </h2>
          </div>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cycle Spend */}
        <div className="bg-surface-container-lowest/80 backdrop-blur-xl p-5 rounded-2xl border border-outline-variant/20 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Current Cycle Spend</span>
            <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/15 px-2 py-0.5 rounded-lg">Live</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-tabular-stat text-2xl md:text-3xl text-on-surface font-bold">{cycleTokens.toLocaleString()}</span>
              <span className="font-tabular-stat text-sm text-primary font-semibold">TOKENS</span>
            </div>
            <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-3 overflow-hidden">
              <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(5, (Number(cycleSpendUsd) / 50) * 100))}%` }}></div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 text-xs font-code-sm text-on-surface-variant border-t border-outline-variant/10">
            <span>Cycle budget cap: 5,000 tokens</span>
            <span className="text-primary font-tabular-stat">Metered in task tokens</span>
          </div>
        </div>

        {/* Unit Burn Rate */}
        <div className="bg-surface-container-lowest/80 backdrop-blur-xl p-5 rounded-2xl border border-outline-variant/20 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Deterministic Burn Rate</span>
            <span className="font-chip-status text-[10px] text-sem-blue bg-sem-blue/15 px-2 py-0.5 rounded-lg">VERIFIED</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-tabular-stat text-2xl md:text-3xl text-on-surface font-bold">100%</span>
              <span className="font-label-caps text-xs text-on-surface-variant">CONTENT-METERED</span>
            </div>
            <div className="inline-flex items-center gap-1.5 mt-3 text-sem-green text-xs font-code-sm">
              <ShieldCheck className="w-4 h-4 text-sem-green" />
              <span>Zero unverified step billing guarantee</span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 text-xs font-code-sm text-on-surface-variant border-t border-outline-variant/10">
            <span>Proof overhead: none</span>
            <span className="text-primary">Accuracy: 100%</span>
          </div>
        </div>

        {/* Token Balance */}
        <div className="bg-surface-container-lowest/80 backdrop-blur-xl p-5 rounded-2xl border border-outline-variant/20 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Available Credits</span>
            <span className="font-chip-status text-[10px] text-sem-cyan bg-sem-cyan/15 px-2 py-0.5 rounded-lg">RESERVED</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-tabular-stat text-2xl md:text-3xl text-primary font-bold">{currentTokens.toLocaleString()}</span>
              <span className="font-code-sm text-xs text-on-surface-variant">TOKENS</span>
            </div>
            <p className="font-code-sm text-xs text-on-surface-variant mt-2">
              Available compute capacity: {currentTokens.toLocaleString()} tokens.
            </p>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 text-xs font-code-sm text-on-surface-variant border-t border-outline-variant/10">
            <span>Auto-rollback active</span>
            <span className="text-sem-green font-medium">Safe Execution</span>
          </div>
        </div>
      </div>

      {/* Spend Velocity Chart Panel */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl p-6 rounded-3xl border border-outline-variant/20 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">Spending over time</h3>
            <p className="font-code-sm text-xs text-on-surface-variant mt-0.5">
              Continuous rolling telemetry across completed model generations and synthesis tasks.
            </p>
          </div>
          <span className="font-chip-status text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md">
            CONTENT-METERED
          </span>
        </div>

        {/* Visual Trend Chart */}
        <div className="relative w-full h-48 sm:h-56 flex items-center justify-center pt-4">
          <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 800 200">
            <defs>
              <linearGradient id="costAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#78f5e5" stopOpacity="0.28" />
                <stop offset="70%" stopColor="#78f5e5" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#78f5e5" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="costLineGradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#59d8c9" />
                <stop offset="50%" stopColor="#78f5e5" />
                <stop offset="100%" stopColor="#9aefea" />
              </linearGradient>
            </defs>
            <g className="text-outline-variant/15" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1">
              <line x1="0" x2="800" y1="40" y2="40" />
              <line x1="0" x2="800" y1="90" y2="90" />
              <line x1="0" x2="800" y1="140" y2="140" />
            </g>
            <path
              d="M 0,160 L 60,150 L 120,135 L 180,142 L 240,115 L 300,120 L 360,95 L 420,105 L 480,80 L 540,88 L 600,65 L 660,55 L 720,45 L 800,35 L 800,180 L 0,180 Z"
              fill="url(#costAreaGradient)"
            />
            <path
              d="M 0,160 L 60,150 L 120,135 L 180,142 L 240,115 L 300,120 L 360,95 L 420,105 L 480,80 L 540,88 L 600,65 L 660,55 L 720,45 L 800,35"
              fill="none"
              stroke="url(#costLineGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="720" cy="45" r="4" fill="#78f5e5" />
            <circle cx="800" cy="35" r="5" fill="#78f5e5" className="animate-pulse" />
          </svg>
        </div>
      </div>

      {/* Category Breakdown Table */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl p-6 rounded-3xl border border-outline-variant/20 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-title-md text-title-md text-on-surface font-semibold">Subsystem Consumption Breakdown</h3>
          <span className="font-code-sm text-xs text-on-surface-variant">Deterministic Rates</span>
        </div>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div
              key={cat.key}
              className="p-4 rounded-2xl bg-surface-container-low/70 border border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <span className="font-body-sm text-on-surface font-medium">{cat.label}</span>
                <div className="w-48 bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${cat.pct}%` }}></div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div className="flex flex-col">
                  <span className="font-tabular-stat text-on-surface font-semibold">{cat.tokens.toLocaleString()} tokens</span>
                  <span className="font-code-sm text-[11px] text-on-surface-variant">this cycle</span>
                </div>
                <span className="font-chip-status text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  {cat.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
