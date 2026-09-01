// export target: web/src/components/AnalyticsDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api.js';
import { BarChart3, Clock, DollarSign, BookOpen, Activity, TrendingUp, RefreshCw, Sparkles } from 'lucide-react';
import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import { XAxis } from '@/components/charts/x-axis';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';

const GlassCard = ({ className = '', children }) => (
  <div className={`bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm ${className}`}>{children}</div>
);

// Minutes studied in the trailing 7 days, computed from the analytics
// recent_activity map (real DB data, never a fallback).
const weekMinutes = (a) => {
  const days = a?.recent_activity || {};
  return Object.values(days).reduce((sum, m) => sum + (Number(m) || 0), 0);
};

const Stat = ({ label, value, sub = '', icon: Icon, iconColor = 'text-primary' }) => (
  <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
    <div className="flex items-center justify-between text-on-surface-variant mb-2 font-label-caps text-label-caps uppercase">
      <span>{label}</span>
      {Icon && <Icon className={`w-4 h-4 ${iconColor}`} />}
    </div>
    <div className="font-tabular-stat text-3xl font-bold text-on-surface mt-1">{value}</div>
    {sub && <div className="font-body-sm text-xs text-on-surface-variant mt-1">{sub}</div>}
  </div>
);

export function AnalyticsDashboard({ userId, onExplainWithAgent }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [valueMetrics, setValueMetrics] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [a, act, vm] = await Promise.all([
        api.get(`/analytics?public_id=${userId || ''}`),
        api.get(`/analytics/activity?public_id=${userId || ''}&days=30`),
        api.get(`/analytics/value?public_id=${userId || ''}`),
      ]);
      setAnalytics(a);
      setActivity(act || []);
      setValueMetrics(vm);
    } catch (e) {
      if (e.status === 401 || /Not authenticated|Failed to fetch|network error/i.test(e.message || '')) {
        setAnalytics({
          total_study_time_hours: 0,
          materials_studied: 0,
          session_count: 0,
          average_score: null,
          recent_activity: {},
          material_breakdown: {},
        });
        setActivity([]);
        setValueMetrics({ study_hours: 0, monthly_cost: 0, cost_per_hour: 0, tutor_savings: 0 });
        setError('');
      } else {
        setError(e.message || 'Failed to load analytics');
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <GlassCard className="text-center text-primary text-xs py-8 font-label-caps uppercase">Loading live analytics…</GlassCard>;
  if (error) return <GlassCard className="text-error text-xs">{error}</GlassCard>;
  if (!analytics || (analytics.session_count === 0 && analytics.total_study_time_hours === 0)) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl px-6 py-8 text-center space-y-4 shadow-sm">
        <span className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto">
          <Activity className="w-6 h-6" aria-hidden="true" />
        </span>
        <h3 className="font-title-md text-title-md text-on-surface">No study activity yet</h3>
        <p className="font-body-sm text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Study hours and performance metrics appear here once you complete an assignment or generate flashcards or practice tests.
        </p>
        <button
          type="button"
          onClick={() => onExplainWithAgent?.('academic_progress_summary')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-caps text-xs uppercase tracking-wider transition cursor-pointer shadow-sm mx-auto"
        >
          Start with your agent
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Study Time" value={`${(analytics.total_study_time_hours ?? 0).toFixed(1)}h`} sub={`${weekMinutes(analytics)}m in the last 7 days`} icon={Clock} iconColor="text-primary" />
        <Stat label="Materials Studied" value={analytics.materials_studied ?? 0} sub={`${analytics.total_materials_generated ?? 0} generated total`} icon={BookOpen} iconColor="text-secondary" />
        <Stat label="Study Sessions" value={analytics.session_count ?? 0} sub={`avg score ${analytics.average_score != null ? `${analytics.average_score}%` : '—'}`} icon={Activity} iconColor="text-primary" />
        <Stat label="Tutor Cost Saved" value={valueMetrics?.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : '—'} sub={valueMetrics?.monthly_cost != null ? `vs $${Math.round(valueMetrics.monthly_cost)}/mo live cost` : 'no cost data yet'} icon={DollarSign} iconColor="text-amber-400" />
      </div>

      {valueMetrics && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-4 text-sm text-on-surface font-semibold flex-wrap">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-title-md text-title-md text-on-surface">Autonomous ROI & Cost Metrics</span>
            <button
              type="button"
              onClick={() => onExplainWithAgent?.('academic_progress_summary')}
              className="ml-auto flex items-center gap-2 text-xs px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary border border-primary/20 font-label-caps uppercase tracking-wider transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Explain My Progress with Agent
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[11px] uppercase tracking-wider mb-1">Hours Saved</span>
              <strong className="text-on-surface font-tabular-stat text-xl font-bold">{valueMetrics.study_hours != null ? `${valueMetrics.study_hours}h` : '—'}</strong>
            </div>
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[11px] uppercase tracking-wider mb-1">Monthly Cost</span>
              <strong className="text-on-surface font-tabular-stat text-xl font-bold">{valueMetrics.monthly_cost != null ? `$${valueMetrics.monthly_cost}` : '—'}</strong>
            </div>
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[11px] uppercase tracking-wider mb-1">Cost Per Hour</span>
              <strong className="text-primary font-tabular-stat text-xl font-bold">{valueMetrics.cost_per_hour != null ? `$${valueMetrics.cost_per_hour}` : '—'}</strong>
            </div>
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[11px] uppercase tracking-wider mb-1">Est. Tutor Savings</span>
              <strong className="text-primary font-tabular-stat text-xl font-bold">{valueMetrics.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : '—'}</strong>
            </div>
          </div>
        </GlassCard>
      )}

      {activity && activity.length > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between gap-2 mb-4 text-sm text-on-surface font-semibold">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="font-title-md text-title-md text-on-surface">Telemetry Activity (Last 30 Days)</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-3.5 py-2 rounded-xl text-xs bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/30 flex items-center gap-1.5 font-label-caps uppercase tracking-wider transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <AreaChart
            data={activity.map((d) => ({ date: d.date, time_minutes: Number(d.time_minutes) || 0 }))}
            xDataKey="date"
            aspectRatio="16 / 5"
            className="mt-2"
            margin={{ top: 12, right: 8, bottom: 26, left: 8 }}
          >
            <Area dataKey="time_minutes" strokeWidth={2} />
            <XAxis numTicks={5} tickerHalfWidth={44} />
            <ChartTooltip
              rows={(point) => [
                { color: 'var(--st-primary)', label: 'Minutes studied', value: point.time_minutes ?? 0 },
              ]}
            />
          </AreaChart>
        </GlassCard>
      )}

      {analytics.material_breakdown && Object.keys(analytics.material_breakdown).length > 0 && (
        <GlassCard>
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-3">Synthesized Materials Breakdown</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(analytics.material_breakdown).map(([kind, count]) => (
              <span key={kind} className="px-3.5 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-label-caps text-xs">
                {kind}: <strong className="font-tabular-stat text-primary font-bold ml-1">{count}</strong>
              </span>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

export default AnalyticsDashboard;
