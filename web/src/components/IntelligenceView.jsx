/**
 * Academic insights derived from the user's own activity.
 *
 * Audit 08-29: this view previously shipped a single hardcoded "recommendation"
 * to every account — "You missed 2 consecutive Biology review sessions",
 * "94% Confidence", "+12% expected quiz performance" — regardless of whether
 * the user studied Biology, had any sessions, or had ever opened the app. None
 * of those numbers came from anywhere. Fabricated telemetry presented as
 * personal analysis is the fastest way to lose a user's trust in every other
 * number the product shows them, so it is gone.
 *
 * Every figure below is computed from /api/insights/snapshot (real sessions,
 * materials and scores). When there is not enough history to say anything
 * true, the view says exactly that instead of inventing a finding.
 *
 * Panel contract (InsightsView tabs): `panel="progress"` renders the Academic
 * Progress view (stats, last-7-days activity, derived observations);
 * `panel="recommendations"` renders Recommendations built only from the real
 * snapshot (next best action + derived suggestions). No panel → the original
 * Academic Insights view.
 */
import React, { useEffect, useState } from 'react';
import { TrendingUp, Clock, Target, BookOpen, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '../api.js';

/** Builds observations that are literally true of the returned numbers. */
function deriveInsights(a) {
  if (!a) return [];
  const out = [];
  const sessions = a.session_count || 0;
  const hours = a.total_study_time_hours || 0;
  const avg = a.average_score;
  const recent = a.recent_activity || {};
  const daysActive = Object.keys(recent).length;
  const recentMinutes = Object.values(recent).reduce((s, m) => s + (m || 0), 0);

  if (sessions > 0) {
    out.push({
      id: 'volume',
      icon: Clock,
      title: `${hours} ${hours === 1 ? 'hour' : 'hours'} studied across ${sessions} ${sessions === 1 ? 'session' : 'sessions'}`,
      detail: daysActive > 0
        ? `${Math.round(recentMinutes)} minutes over ${daysActive} active ${daysActive === 1 ? 'day' : 'days'} in the last week.`
        : 'No sessions recorded in the last seven days.',
    });
  }

  if (typeof avg === 'number') {
    out.push({
      id: 'score',
      icon: Target,
      title: `Average score ${Math.round(avg)}%`,
      detail: `Mean across the ${sessions} scored ${sessions === 1 ? 'session' : 'sessions'} on record.`,
    });
  }

  const breakdown = a.material_breakdown || {};
  const kinds = Object.entries(breakdown).sort((x, y) => y[1] - x[1]);
  if (kinds.length > 0) {
    const [topKind, topCount] = kinds[0];
    out.push({
      id: 'materials',
      icon: BookOpen,
      title: `${a.total_materials_generated || 0} study ${(a.total_materials_generated === 1) ? 'material' : 'materials'} generated`,
      detail: `Most common: ${String(topKind).replace(/_/g, ' ')} (${topCount}).`,
    });
  }

  if (daysActive === 0 && sessions > 0) {
    out.push({
      id: 'gap',
      icon: TrendingUp,
      title: 'No study activity this week',
      detail: 'Your last recorded session is more than seven days old.',
    });
  }

  return out;
}

/** Last 7 UTC days as {key, label, minutes}, zero-filled for silent days. */
function lastSevenDays(recent) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      minutes: (recent && recent[key]) || 0,
    });
  }
  return days;
}

function StatusBlock({ loading, error }) {
  if (loading) {
    return (
      <div className="clean-card p-8 text-center text-sm text-[var(--text-muted)]">
        Loading your activity…
      </div>
    );
  }
  if (error) {
    return (
      <div className="clean-card p-6 text-sm text-rose-300" role="status">
        {error}
      </div>
    );
  }
  return null;
}

/** Academic Progress panel — stats, last-7-days activity bars, observations. */
function ProgressPanel({ a, insights, loading, error }) {
  if (loading || error) return <StatusBlock loading={loading} error={error} />;

  const days = lastSevenDays(a?.recent_activity);
  const maxMin = Math.max(...days.map((d) => d.minutes), 1);
  const weekMinutes = days.reduce((s, d) => s + d.minutes, 0);
  const stats = [
    { label: 'Sessions', value: a?.session_count ?? 0 },
    { label: 'Hours studied', value: a?.total_study_time_hours ?? 0 },
    { label: 'Average score', value: typeof a?.average_score === 'number' ? `${Math.round(a.average_score)}%` : '—' },
    { label: 'Materials generated', value: a?.total_materials_generated ?? 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <h2 className="text-2xl font-bold">Academic Progress</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Recorded sessions, study time and scores — nothing estimated.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(({ label, value }) => (
          <div key={label} className="clean-card p-4">
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="clean-card p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Last 7 days</h3>
          {weekMinutes > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              {Math.round(weekMinutes)} minutes total
            </span>
          )}
        </div>
        <div className="flex items-end gap-2 h-32">
          {days.map((d) => (
            <div key={d.key} className="flex-1 h-full flex flex-col justify-end gap-1">
              <div className="flex-1 flex items-end rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] overflow-hidden">
                {d.minutes > 0 && (
                  <div
                    className="w-full bg-[var(--accent)] rounded-[var(--radius-sm)]"
                    style={{ height: `${Math.max((d.minutes / maxMin) * 100, 6)}%` }}
                  />
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] text-center">{d.label}</p>
              <p className="text-[10px] text-[var(--text-muted)] text-center -mt-0.5">{d.minutes}m</p>
            </div>
          ))}
        </div>
        {weekMinutes === 0 && (
          <p className="text-xs text-[var(--text-muted)]">No sessions recorded in the last seven days.</p>
        )}
      </div>

      {insights.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">At a glance</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map(({ id, icon: Icon, title, detail }) => (
              <div key={id} className="clean-card p-5 flex items-start gap-3">
                <Icon className="h-4 w-4 mt-0.5 text-[var(--accent)] shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{title}</p>
                  <p className="text-xs text-[var(--text-muted)]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Recommendations panel — real next best action + honest derived suggestions. */
function RecommendationsPanel({ a, next, onGoTo, loading, error }) {
  if (loading || error) return <StatusBlock loading={loading} error={error} />;

  const recs = [];
  const sessions = a?.session_count || 0;
  const daysActive = Object.keys(a?.recent_activity || {}).length;

  if (next) {
    recs.push({
      id: 'next',
      icon: ArrowRight,
      title: next.title,
      detail: `${next.rationale}${next.due_date ? ` · Due ${next.due_date}` : ''}`,
      action: 'Open assignments',
      target: 'assignments',
    });
  }

  if (sessions > 0 && daysActive === 0) {
    recs.push({
      id: 'gap',
      icon: TrendingUp,
      title: 'No study activity in the last 7 days',
      detail: `${sessions} ${sessions === 1 ? 'session is' : 'sessions are'} on record, but none this week — a short review session would keep the streak alive.`,
    });
  }

  const avg = a?.average_score;
  if (typeof avg === 'number' && avg < 70) {
    recs.push({
      id: 'score',
      icon: Target,
      title: `Average score is ${Math.round(avg)}%`,
      detail: 'Below the 70% mark — reopen the assignments behind your weakest sessions and re-take the quiz.',
    });
  }

  const breakdown = a?.material_breakdown || {};
  const kinds = Object.entries(breakdown).sort((x, y) => y[1] - x[1]);
  if (kinds.length >= 2) {
    const [topKind, topCount] = kinds[0];
    const total = kinds.reduce((s, [, c]) => s + c, 0);
    const share = total > 0 ? topCount / total : 0;
    if (share >= 0.6) {
      recs.push({
        id: 'mix',
        icon: BookOpen,
        title: `${Math.round(share * 100)}% of your materials are ${String(topKind).replace(/_/g, ' ')}`,
        detail: `Try another format — varied practice beats repeated passes over the same kind of material.`,
      });
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <h2 className="text-2xl font-bold">Recommendations</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Built from your real sessions, materials and scores — no invented findings.
        </p>
      </div>

      {recs.length === 0 ? (
        <div className="clean-card p-8 text-center space-y-3">
          <Sparkles className="h-6 w-6 mx-auto text-[var(--accent)]" />
          <p className="text-sm font-semibold">Nothing to recommend — yet</p>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Recommendations appear once you have study sessions and open assignments on
            record. If there is nothing to say, this view says so instead of inventing advice.
          </p>
          {onGoTo && (
            <button
              onClick={() => onGoTo('assignments')}
              className="text-xs px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold inline-flex items-center gap-1 transition cursor-pointer"
            >
              Go to assignments <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {recs.map(({ id, icon: Icon, title, detail, action, target }) => (
            <div key={id} className="clean-card p-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Icon className="h-4 w-4 mt-0.5 text-[var(--accent)] shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{title}</p>
                  <p className="text-xs text-[var(--text-muted)]">{detail}</p>
                </div>
              </div>
              {action && onGoTo && (
                <button
                  onClick={() => onGoTo(target)}
                  className="text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold shrink-0 transition cursor-pointer"
                >
                  {action}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const IntelligenceView = ({ onGoTo, panel }) => {
  const [state, setState] = useState({ loading: true, error: null, analytics: null, nextAction: null });

  useEffect(() => {
    let alive = true;
    api.get('/api/insights/snapshot')
      .then((res) => {
        if (!alive) return;
        setState({
          loading: false,
          error: null,
          analytics: res?.study_activity || null,
          nextAction: res?.next_best_action || null,
        });
      })
      .catch((err) => {
        if (!alive) return;
        setState({ loading: false, error: err?.message || 'Could not load insights', analytics: null, nextAction: null });
      });
    return () => { alive = false; };
  }, []);

  if (panel === 'recommendations') {
    return <RecommendationsPanel a={state.analytics} next={state.nextAction} onGoTo={onGoTo} loading={state.loading} error={state.error} />;
  }
  if (panel === 'progress') {
    return <ProgressPanel a={state.analytics} insights={deriveInsights(state.analytics)} loading={state.loading} error={state.error} />;
  }

  const insights = deriveInsights(state.analytics);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <h2 className="text-2xl font-bold">Academic Insights</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Computed from your recorded sessions, materials and scores.
        </p>
      </div>

      {(state.loading || state.error) && <StatusBlock loading={state.loading} error={state.error} />}

      {!state.loading && !state.error && insights.length === 0 && (
        <div className="clean-card p-8 text-center space-y-3">
          <Sparkles className="h-6 w-6 mx-auto text-[var(--accent)]" />
          <p className="text-sm font-semibold">Not enough activity yet</p>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            Insights appear here once you have study sessions on record. Add an
            assignment or generate study material to start building history.
          </p>
          {onGoTo && (
            <button
              onClick={() => onGoTo('assignments')}
              className="text-xs px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold inline-flex items-center gap-1 transition cursor-pointer"
            >
              Go to assignments <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {!state.loading && !state.error && insights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map(({ id, icon: Icon, title, detail }) => (
            <div key={id} className="clean-card p-5 flex items-start gap-3">
              <Icon className="h-4 w-4 mt-0.5 text-[var(--accent)] shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-xs text-[var(--text-muted)]">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default IntelligenceView;
