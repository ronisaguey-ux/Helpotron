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

export const IntelligenceView = ({ onGoTo }) => {
  const [state, setState] = useState({ loading: true, error: null, analytics: null });

  useEffect(() => {
    let alive = true;
    api.get('/api/insights/snapshot')
      .then((res) => {
        if (!alive) return;
        setState({ loading: false, error: null, analytics: res?.study_activity || null });
      })
      .catch((err) => {
        if (!alive) return;
        setState({ loading: false, error: err?.message || 'Could not load insights', analytics: null });
      });
    return () => { alive = false; };
  }, []);

  const insights = deriveInsights(state.analytics);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <h2 className="text-2xl font-bold">Academic Insights</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Computed from your recorded sessions, materials and scores.
        </p>
      </div>

      {state.loading && (
        <div className="clean-card p-8 text-center text-sm text-[var(--text-muted)]">
          Loading your activity…
        </div>
      )}

      {!state.loading && state.error && (
        <div className="clean-card p-6 text-sm text-rose-300" role="status">
          {state.error}
        </div>
      )}

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

      {insights.length > 0 && (
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
