// export target: web/src/components/AnalyticsDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api.js';
import { BarChart3, Clock, DollarSign, BookOpen, Activity, TrendingUp, RefreshCw, Sparkles } from 'lucide-react';
import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import { XAxis } from '@/components/charts/x-axis';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';

const GlassCard = ({ className = '', children }) => (
  <div className={`glass-panel rounded-[var(--radius-lg)] p-5 ${className}`}>{children}</div>
);

// Minutes studied in the trailing 7 days, computed from the analytics
// recent_activity map (real DB data, never a fallback).
const weekMinutes = (a) => {
  const days = a?.recent_activity || {};
  return Object.values(days).reduce((sum, m) => sum + (Number(m) || 0), 0);
};

const Stat = ({ label, value, sub = '', icon: Icon, iconColor = 'text-[var(--accent)]' }) => (
  <div className="glass-panel rounded-[var(--radius-lg)] p-5">
    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1 text-xs">
      <span>{label}</span>
      {Icon && <Icon className={`w-4 h-4 ${iconColor}`} />}
    </div>
    <div className="text-2xl font-bold text-white mt-1">{value}</div>
    {sub && <div className="text-xs text-emerald-400 mt-1">{sub}</div>}
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

  if (loading) return <GlassCard className="text-center text-[var(--accent)] text-xs py-8">Loading live analytics…</GlassCard>;
  if (error) return <GlassCard className="text-rose-400 text-xs">{error}</GlassCard>;
  if (!analytics || (analytics.session_count === 0 && analytics.total_study_time_hours === 0)) {
    return (
      <div className="clean-card p-10 text-center space-y-3">
        <Activity className="w-9 h-9 text-[var(--text-muted)] mx-auto" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">No Study Activity Recorded Yet</h3>
        <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
          Complete an assignment, study flashcards, or generate practice tests with your agent to see your real study hours and performance metrics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Study Time" value={`${(analytics.total_study_time_hours ?? 0).toFixed(1)}h`} sub={`${weekMinutes(analytics)}m in the last 7 days`} icon={Clock} iconColor="text-[var(--accent)]" />
        <Stat label="Materials Studied" value={analytics.materials_studied ?? 0} sub={`${analytics.total_materials_generated ?? 0} generated total`} icon={BookOpen} iconColor="text-indigo-400" />
        <Stat label="Study Sessions" value={analytics.session_count ?? 0} sub={`avg score ${analytics.average_score != null ? `${analytics.average_score}%` : '—'}`} icon={Activity} iconColor="text-emerald-400" />
        <Stat label="Tutor Cost Saved" value={valueMetrics?.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : '—'} sub={valueMetrics?.monthly_cost != null ? `vs $${Math.round(valueMetrics.monthly_cost)}/mo live cost` : 'no cost data yet'} icon={DollarSign} iconColor="text-amber-400" />
      </div>

      {valueMetrics && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3 text-sm text-[var(--text-secondary)] font-semibold">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Autonomous ROI & Cost Metrics</span>
            <button
              type="button"
              onClick={() => onExplainWithAgent?.('academic_progress_summary')}
              className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] text-[var(--accent)] transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3" /> Explain My Progress with Agent
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">Hours Saved</span>
              <strong className="text-white text-base">{valueMetrics.study_hours != null ? `${valueMetrics.study_hours}h` : '—'}</strong>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">Monthly Cost</span>
              <strong className="text-white text-base">{valueMetrics.monthly_cost != null ? `$${valueMetrics.monthly_cost}` : '—'}</strong>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">Cost Per Hour</span>
              <strong className="text-[var(--accent)] text-base">{valueMetrics.cost_per_hour != null ? `$${valueMetrics.cost_per_hour}` : '—'}</strong>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] block text-[10px] uppercase">Est. Tutor Savings</span>
              <strong className="text-emerald-300 text-base">{valueMetrics.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : '—'}</strong>
            </div>
          </div>
        </GlassCard>
      )}

      {activity && activity.length > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between gap-2 mb-4 text-sm text-[var(--text-secondary)] font-semibold">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--accent)]" />
              <span>Telemetry Activity (Last 30 Days)</span>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs bg-white/5 hover:bg-[var(--color-surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] flex items-center gap-1.5 transition cursor-pointer"
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
                { color: 'var(--chart-line-primary)', label: 'Minutes studied', value: point.time_minutes ?? 0 },
              ]}
            />
          </AreaChart>
        </GlassCard>
      )}

      {analytics.material_breakdown && Object.keys(analytics.material_breakdown).length > 0 && (
        <GlassCard>
          <h3 className="text-xs text-[var(--text-muted)] font-semibold uppercase mb-3">Synthesized Materials Breakdown</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(analytics.material_breakdown).map(([kind, count]) => (
              <span key={kind} className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                {kind}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

export default AnalyticsDashboard;
