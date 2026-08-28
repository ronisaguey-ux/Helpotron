// export target: web/src/components/AnalyticsDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api.js';
import { BarChart3, Clock, DollarSign, BookOpen, Activity, TrendingUp, RefreshCw, Sparkles } from 'lucide-react';
import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import LiquidGlassCard from '@/components/kokonutui/liquid-glass-card';
import ParticleButton from '@/components/kokonutui/particle-button';

const GlassCard = ({ className = '', children }) => (
  <div className={`glass-panel rounded-2xl p-5 border border-white/10 ${className}`}>{children}</div>
);

// Minutes studied in the trailing 7 days, computed from the analytics
// recent_activity map (real DB data, never a fallback).
const weekMinutes = (a) => {
  const days = a?.recent_activity || {};
  return Object.values(days).reduce((sum, m) => sum + (Number(m) || 0), 0);
};

/* Demo fallback — shown when live analytics can't load (no session token
 * on localhost or the backend is unreachable). */
const DEMO_ANALYTICS = {
  total_study_time_hours: 42.5, materials_studied: 38, session_count: 21, average_score: 88,
  recent_activity: { today: 60, '1d_ago': 40, '2d_ago': 75, '3d_ago': 30 },
  material_breakdown: { 'Study guides': 14, Flashcards: 12, 'Practice quizzes': 8, Summaries: 4 },
};
const DEMO_ACTIVITY = [
  { date: '2026-08-16', time_minutes: 75 }, { date: '2026-08-18', time_minutes: 40 },
  { date: '2026-08-20', time_minutes: 60 }, { date: '2026-08-21', time_minutes: 95 },
  { date: '2026-08-23', time_minutes: 55 },
];
const DEMO_VALUE_METRICS = { study_hours: 34, monthly_cost: 12, cost_per_hour: 0.35, tutor_savings: 320 };

const Stat = ({ label, value, sub = '', icon: Icon, iconColor = 'text-cyan-400' }) => (
  <div className="glass-panel rounded-xl p-5 border border-white/5">
    <div className="flex items-center justify-between text-slate-400 mb-1 text-xs font-mono">
      <span>{label}</span>
      {Icon && <Icon className={`w-4 h-4 ${iconColor}`} />}
    </div>
    <div className="text-2xl font-bold font-mono text-white mt-1">{value}</div>
    {sub && <div className="text-[11px] font-mono text-emerald-400 mt-1">{sub}</div>}
  </div>
);

export function AnalyticsDashboard({ userId, onExplainWithAgent }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [valueMetrics, setValueMetrics] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

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
      setDemoMode(false);
    } catch (e) {
      // No session token / offline (e.g. localhost without auth): show the
      // demo view rather than a raw API error.
      if (e.status === 401 || e.name === 'TypeError' || /Not authenticated|Failed to fetch|network error/i.test(e.message || '')) {
        setDemoMode(true);
        setAnalytics(DEMO_ANALYTICS);
        setActivity(DEMO_ACTIVITY);
        setValueMetrics(DEMO_VALUE_METRICS);
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

  if (loading) return <GlassCard className="text-center font-mono text-cyan-400 text-xs py-8">Loading Neural Analytics & Telemetry…</GlassCard>;
  if (error) return <GlassCard className="text-rose-400 font-mono text-xs">{error}</GlassCard>;
  if (!analytics) return <GlassCard className="font-mono text-xs text-slate-400">No analytics data yet. Start studying to see insights!</GlassCard>;

  return (
    <div className="space-y-6">
      {demoMode && (
        <div className="rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 leading-relaxed">
          Live analytics unavailable (no session token on this browser) — showing demo data. Sign in to see your own numbers.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Study Time" value={`${(analytics.total_study_time_hours ?? 0).toFixed(1)}h`} sub={`${weekMinutes(analytics)}m in the last 7 days`} icon={Clock} iconColor="text-cyan-400" />
        <Stat label="Materials Studied" value={analytics.materials_studied ?? 0} sub={`${analytics.total_materials_generated ?? 0} generated total`} icon={BookOpen} iconColor="text-indigo-400" />
        <Stat label="Study Sessions" value={analytics.session_count ?? 0} sub={`avg score ${analytics.average_score != null ? `${analytics.average_score}%` : '—'}`} icon={Activity} iconColor="text-emerald-400" />
        <Stat label="Tutor Cost Saved" value={valueMetrics?.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : '—'} sub={valueMetrics?.monthly_cost != null ? `vs $${Math.round(valueMetrics.monthly_cost)}/mo live cost` : 'no cost data yet'} icon={DollarSign} iconColor="text-amber-400" />
      </div>

      {valueMetrics && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3 text-sm font-mono text-cyan-300 font-bold">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Autonomous ROI & Cost Metrics</span>
            <button
              type="button"
              onClick={() => onExplainWithAgent?.('academic_progress_summary')}
              className="ml-auto flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-200 font-sans transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3" /> Explain My Progress with Agent
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Hours Saved</span>
              <strong className="text-white text-base">{valueMetrics.study_hours != null ? `${valueMetrics.study_hours}h` : '—'}</strong>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Monthly Cost</span>
              <strong className="text-white text-base">{valueMetrics.monthly_cost != null ? `$${valueMetrics.monthly_cost}` : '—'}</strong>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Cost Per Hour</span>
              <strong className="text-cyan-300 text-base">{valueMetrics.cost_per_hour != null ? `$${valueMetrics.cost_per_hour}` : '—'}</strong>
            </div>
            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
              <span className="text-slate-400 block text-[10px] uppercase">Est. Tutor Savings</span>
              <strong className="text-emerald-300 text-base">{valueMetrics.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : '—'}</strong>
            </div>
          </div>
        </GlassCard>
      )}

      {activity && activity.length > 0 && (
        <LiquidGlassCard className="rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-4 text-sm font-mono text-cyan-300 font-bold">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span>Telemetry Activity (Last 30 Days)</span>
            </div>
            <ParticleButton
              onClick={loadData}
              className="px-3 py-1.5 text-xs font-mono text-cyan-300 border border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/10 rounded-lg transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </ParticleButton>
          </div>
          <AreaChart
            data={activity.map((d) => ({ date: d.date, time_minutes: Number(d.time_minutes) || 0 }))}
            xDataKey="date"
            aspectRatio="16 / 5"
            className="mt-2"
          >
            <Area dataKey="time_minutes" strokeWidth={2} />
          </AreaChart>
        </LiquidGlassCard>
      )}

      {analytics.material_breakdown && Object.keys(analytics.material_breakdown).length > 0 && (
        <GlassCard>
          <h3 className="font-mono text-xs text-slate-300 font-bold uppercase mb-3">Synthesized Materials Breakdown</h3>
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            {Object.entries(analytics.material_breakdown).map(([kind, count]) => (
              <span key={kind} className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-cyan-300">
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

