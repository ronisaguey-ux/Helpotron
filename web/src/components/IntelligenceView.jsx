/* ────────────────────────────────────────────────────────────────────────────
 * IntelligenceView.jsx — Academic Progress, Recommendations, and
 * Cost Intelligence (what your effort level costs). AI Lab lives in the
 * AI Workspace; this view carries the insight layer.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { SUBJECT_PROGRESS, RECOMMENDATIONS, WEEK_STATS, COST_FORECAST, demoEnabled, loadSettings, EFFORT_SCORES } from '../demoData.js';
import { Badge, Progress, Tabs, EmptyState, SectionHeader, StatCard } from './ui/os.jsx';

export default function IntelligenceView({ onGoTo, initialTab, embedded }) {
  const [tab, setTab] = useState(initialTab || 'progress');
  const demo = demoEnabled();
  const settings = loadSettings();

  const progress = demo ? SUBJECT_PROGRESS : [];
  const stats = demo ? WEEK_STATS : [];
  const recs = demo ? RECOMMENDATIONS : [];
  const forecast = demo ? COST_FORECAST : null;

  const strongest = [...progress].sort((a, b) => b.score - a.score)[0];
  const weakest = [...progress].sort((a, b) => a.score - b.score)[0];

  /* Cost intelligence (user-side): effort level → projected monthly burn.
     Based on the user's own recent activity shape (wallet usage), scaled
     by the effort multiplier: low 0.6×, balanced 1.0×, high 1.6×. */
  const effortMultiplier = { low: 0.6, balanced: 1.0, high: 1.6 }[settings.ai.effort] ?? 1.0;
  const monthlyBurn = Math.round(2341 * effortMultiplier);

  return (
    <div className="space-y-5">
      {!embedded && (
        <Tabs
          tabs={[
            { key: 'progress', label: 'Academic Progress' },
            { key: 'recommendations', label: 'Recommendations' },
            { key: 'cost', label: 'Cost Intelligence' },
          ]}
          active={tab}
          onChange={setTab}
        />
      )}

      {/* ── ACADEMIC PROGRESS ────────────────────────────────────────────── */}
      {tab === 'progress' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} delay={i * 0.04} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 clean-card p-5">
              <SectionHeader title="Subject scores" subtitle="Your current strength per subject" />
              {progress.length === 0 ? (
                <EmptyState title="No progress data yet" />
              ) : (
                <div className="space-y-5">
                  {progress.map((s) => (
                    <div key={s.subject}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-300 font-medium">{s.subject}</span>
                        <span className="text-slate-500">
                          <Badge color={s.level === 'Expert' ? 'purple' : s.level === 'Advanced' ? 'blue' : 'slate'}>{s.level}</Badge>
                          <span className="ml-2 font-mono">{s.score}%</span>
                          <span className={`ml-2 font-mono ${s.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{s.trend}</span>
                        </span>
                      </div>
                      <Progress value={s.score} color={s.score >= 85 ? 'from-emerald-500 to-teal-400' : s.score >= 70 ? 'from-amber-500 to-orange-400' : 'from-rose-500 to-red-400'} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {strongest && (
                <div className="clean-card p-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Strongest subject</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-emerald-400" width={18} height={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{strongest.subject}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{strongest.score}% · {strongest.trend}</div>
                    </div>
                  </div>
                </div>
              )}
              {weakest && (
                <div className="clean-card p-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Needs attention</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
                      <TrendingDown className="w-4 h-4 text-rose-400" width={18} height={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{weakest.subject}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{weakest.score}% · {weakest.trend}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoTo('study')}
                    className="mt-3 w-full py-2 rounded-lg bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/25 text-[11px] font-semibold text-rose-300 transition cursor-pointer"
                  >
                    Start a drill session →
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── RECOMMENDATIONS ──────────────────────────────────────────────── */}
      {tab === 'recommendations' && (
        recs.length === 0 ? (
          <EmptyState title="No recommendations yet" body="Recommendations are generated from your activity — finish some assignments first." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recs.map((r) => (
              <div key={r.id} className="clean-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{r.icon}</span>
                  <span className="text-sm font-semibold text-white">{r.title}</span>
                  <Badge color={r.priority === 'high' ? 'red' : 'amber'} className="ml-auto">{r.priority}</Badge>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{r.body}</p>
                <button
                  type="button"
                  onClick={() => onGoTo(r.target)}
                  className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  {r.action} →
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── COST INTELLIGENCE ────────────────────────────────────────────── */}
      {tab === 'cost' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <StatCard label="Your monthly AI burn" value={`${monthlyBurn.toLocaleString()} cr`} sub={`at ${settings.ai.effort} effort (${effortMultiplier}× scale)`} />
            <StatCard label="Hours saved this month" value="14.2h" sub="≈ 4.1 hours per assignment" />
            <StatCard label="Cost per study guide" value="~38 cr" sub="includes retrieval + generation" />
          </div>

          <div className="clean-card p-5">
            <SectionHeader title="How effort affects cost" subtitle="The same work at each effort level — what you'd pay" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { level: 'Low', mult: 0.6, color: 'green', detail: 'Mechanical work goes to the fast engine. Best for OCR, transcription, flashcards.' },
                { level: 'Balanced', mult: 1.0, color: 'blue', detail: 'A mix: routine writing uses the balanced engine, complex reasoning escalates.' },
                { level: 'High', mult: 1.6, color: 'purple', detail: 'Complex reasoning and research get the flagship engine. Best for proofs and deep research.' },
              ].map((row) => {
                const active = settings.ai.effort === row.level.toLowerCase();
                return (
                  <div key={row.level} className={`p-4 rounded-xl border transition ${active ? 'border-blue-500/40 bg-blue-500/8' : 'border-white/6 bg-slate-950/40'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{row.level} effort</span>
                      {active && <Badge color="blue">active</Badge>}
                    </div>
                    <div className="text-lg font-bold text-slate-200 mt-1 font-mono">~{Math.round(2341 * row.mult).toLocaleString()} cr/mo</div>
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">{row.detail}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-600 mt-3">
              Your effort setting is the only thing that controls routing — Helpotron automatically picks the right engine for each task. Change it in <button type="button" onClick={() => onGoTo('settings')} className="text-blue-300 hover:text-blue-200 cursor-pointer">Settings → AI & Intelligence</button>.
            </p>
          </div>

          {forecast && (
            <div className="clean-card p-5">
              <SectionHeader title="Platform cost forecast" subtitle="Admin view of projected AI spend (demo)" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/40 border border-white/6">
                  <div className="text-[10px] text-slate-500">Current monthly</div>
                  <div className="text-xl font-bold text-white mt-1 font-mono">${forecast.currentMonthly.toLocaleString()}</div>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/25">
                  <div className="text-[10px] text-amber-300/80">Projected</div>
                  <div className="text-xl font-bold text-amber-300 mt-1 font-mono">${forecast.projected.toLocaleString()}</div>
                  <div className="text-[10px] text-amber-400/60 mt-1">+{Math.round((forecast.projected / forecast.currentMonthly - 1) * 100)}%</div>
                </div>
                <div className="p-4 rounded-xl bg-rose-500/8 border border-rose-500/25">
                  <div className="text-[10px] text-rose-300/80">Worst case</div>
                  <div className="text-xl font-bold text-rose-300 mt-1 font-mono">${forecast.worstCase.toLocaleString()}</div>
                  <div className="text-[10px] text-rose-400/60 mt-1">+{Math.round((forecast.worstCase / forecast.currentMonthly - 1) * 100)}%</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-amber-300 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {forecast.weeklyTrend}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
