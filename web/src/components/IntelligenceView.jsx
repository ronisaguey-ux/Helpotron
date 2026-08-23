/* ────────────────────────────────────────────────────────────────────────────
 * IntelligenceView.jsx — Academic Progress and Recommendations, powered by
 * real /api/analytics data (never hardcoded). Demo mode (explicit opt-in)
 * shows the canned preview data from demoData.js.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import api from '../api.js';
import { SUBJECT_PROGRESS, RECOMMENDATIONS, WEEK_STATS, demoEnabled } from '../demoData.js';
import { Badge, Progress, EmptyState, SectionHeader, StatCard } from './ui/os.jsx';

/* Real-data rules engine: recommendations are DERIVED from the analytics
   payload. Nothing is hardcoded — every rule reads actual numbers. */
function deriveRecommendations(a) {
  const recs = [];
  const push = (id, icon, title, body, action, target, priority) =>
    recs.push({ id, icon, title, body, action, target, priority });

  const sessions = a.session_count ?? 0;
  const avg = a.average_score;
  const studied = a.materials_studied ?? 0;
  const recent = Object.values(a.recent_activity || {}).reduce((s, m) => s + (Number(m) || 0), 0);
  const timeByKind = a.kind_study_time || {};
  const totalTime = Object.values(timeByKind).reduce((s, m) => s + (Number(m) || 0), 0);

  if (sessions === 0) {
    push('r-start', '🚀', 'Start your first study session',
      'You have no study sessions yet. Generate a study guide or flashcards to begin building your progress.',
      'Start studying', 'study', 'high');
  } else {
    if (avg != null && avg < 70) {
      push('r-score', '📉', `Average score is ${avg}%`,
        'Your average session score is below 70%. A focused practice-test drill will bring it up.',
        'Run a practice test', 'study', 'high');
    }
    if (recent === 0) {
      push('r-dormant', '😴', 'No study activity this week',
        'Your last study session is more than 7 days ago. A short session today restarts your streak.',
        'Open study tools', 'study', 'high');
    }
  }
  if (studied === 0 && sessions > 0) {
    push('r-materials', '📚', 'Study materials not generating',
      'Your sessions haven\'t produced study materials yet. Generate a guide or summary to feed your progress.',
      'Generate materials', 'study', 'medium');
  }
  if (totalTime > 0) {
    const top = Object.entries(timeByKind).sort((x, y) => y[1] - x[1])[0];
    const share = top[1] / totalTime;
    if (share > 0.7) {
      push('r-balance', '⚖️', `${top[0]} dominates your time`,
        `${top[0]} is ${Math.round(share * 100)}% of your study time. Mixing in other material types builds a wider base.`,
        'Explore study tools', 'study', 'medium');
    }
  }
  if ((a.assignment_count ?? 0) > 0) {
    push('r-assign', '✍️', `${a.assignment_count} assignments in your history`,
      'Review your assignment history to keep drafts, submissions and scores organized.',
      'Open history', 'history', 'low');
  }
  if (recs.length === 0) {
    push('r-clear', '🎉', 'You\'re on track',
      'No gaps detected in your recent activity. Keep the streak going.',
      'Back to dashboard', 'overview', 'low');
  }
  return recs;
}

export default function IntelligenceView({ userId, onGoTo, initialTab, embedded, onApplyRecommendation }) {
  const [tab, setTab] = useState(initialTab || 'progress');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const demo = demoEnabled();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const a = await api.get(`/analytics?public_id=${userId || 'RoniDev'}`);
      setAnalytics(a);
    } catch (e) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!demo) loadData();
  }, [demo, loadData]);

  /* ── data source: real analytics when live, demo arrays when opted in ─── */
  const progress = demo ? SUBJECT_PROGRESS : [];
  const stats = demo ? WEEK_STATS : [];
  const recs = demo ? RECOMMENDATIONS : (analytics ? deriveRecommendations(analytics) : []);

  /* live-mode progress bars: real per-kind study time → share of total */
  const timeByKind = analytics?.kind_study_time || {};
  const totalTime = Object.values(timeByKind).reduce((s, m) => s + (Number(m) || 0), 0);
  const kinds = Object.entries(timeByKind)
    .map(([kind, minutes]) => ({
      kind,
      minutes: Number(minutes) || 0,
      share: totalTime > 0 ? (Number(minutes) || 0) / totalTime : 0,
    }))
    .sort((x, y) => y.minutes - x.minutes);

  const strongest = demo
    ? [...progress].sort((a, b) => b.score - a.score)[0]
    : kinds[0];
  const weakest = demo
    ? [...progress].sort((a, b) => a.score - b.score)[0]
    : kinds[kinds.length - 1];

  const liveStats = [
    { label: 'Study sessions', value: analytics?.session_count ?? '—', sub: 'all time' },
    { label: 'Average score', value: analytics?.average_score != null ? `${analytics.average_score}%` : '—', sub: 'across sessions' },
    { label: 'Study time', value: analytics?.total_study_time_hours != null ? `${analytics.total_study_time_hours}h` : '—', sub: 'total tracked' },
    { label: 'Materials', value: `${analytics?.materials_studied ?? 0} studied`, sub: `${analytics?.total_materials_generated ?? 0} generated` },
  ];

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex gap-1.5 flex-wrap">
          {['progress', 'recommendations'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === k ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {k === 'progress' ? 'Academic Progress' : 'Recommendations'}
            </button>
          ))}
        </div>
      )}

      {/* ── ACADEMIC PROGRESS ────────────────────────────────────────────── */}
      {tab === 'progress' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(demo ? stats : liveStats).map((s, i) => (
              <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub} delay={i * 0.04} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 clean-card p-5">
              <SectionHeader title={demo ? 'Subject scores' : 'Study focus by material'} subtitle={demo ? 'Your current strength per subject' : 'Share of your total study time per material type (real data)'} />
              {demo ? (
                progress.length === 0 ? (
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
                )
              ) : loading ? (
                <div className="text-center font-mono text-cyan-400 text-xs py-8">Loading progress…</div>
              ) : error ? (
                <div className="text-rose-400 font-mono text-xs py-8">{error}</div>
              ) : kinds.length === 0 ? (
                <EmptyState title="No study data yet" body="Generate materials and start studying — your focus breakdown appears here." />
              ) : (
                <div className="space-y-5">
                  {kinds.map((k) => (
                    <div key={k.kind}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-300 font-medium capitalize">{k.kind.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500">
                          <span className="font-mono">{Math.round(k.share * 100)}%</span>
                          <span className="ml-2 font-mono text-slate-400">{k.minutes}m</span>
                        </span>
                      </div>
                      <Progress value={Math.round(k.share * 100)} color={k.share >= 0.3 ? 'from-emerald-500 to-teal-400' : k.share >= 0.15 ? 'from-amber-500 to-orange-400' : 'from-rose-500 to-red-400'} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {strongest && (
                <div className="clean-card p-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{demo ? 'Strongest subject' : 'Most studied'}</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-emerald-400" width={18} height={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white capitalize">{demo ? strongest.subject : strongest.kind.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{demo ? `${strongest.score}% · ${strongest.trend}` : `${Math.round(strongest.share * 100)}% · ${strongest.minutes}m`}</div>
                    </div>
                  </div>
                </div>
              )}
              {weakest && (
                <div className="clean-card p-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">{demo ? 'Needs attention' : 'Least studied'}</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
                      <TrendingDown className="w-4 h-4 text-rose-400" width={18} height={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white capitalize">{demo ? weakest.subject : weakest.kind.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{demo ? `${weakest.score}% · ${weakest.trend}` : `${Math.round(weakest.share * 100)}% · ${weakest.minutes}m`}</div>
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
        loading && !demo ? (
          <div className="text-center font-mono text-cyan-400 text-xs py-8">Generating recommendations from your data…</div>
        ) : recs.length === 0 ? (
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
                  onClick={() => { onApplyRecommendation?.(r); onGoTo(r.target); }}
                  className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  {r.action} →
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
