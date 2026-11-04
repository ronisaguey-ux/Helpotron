import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Clock,
  DollarSign,
  BookOpen,
  Activity,
  TrendingUp,
  RefreshCw,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import api from "../api.js";
import { AreaChart } from "@/components/charts/area-chart";
import { Area } from "@/components/charts/area";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";

const GlassCard = ({ className = "", children }) => (
  <div className={`bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 rounded-3xl p-6 shadow-sm ${className}`}>
    {children}
  </div>
);

// Minutes studied in the trailing 7 days
const weekMinutes = (a) => {
  const days = a?.recent_activity || {};
  return Object.values(days).reduce((sum, m) => sum + (Number(m) || 0), 0);
};

export function AnalyticsDashboard({ userId, onExplainWithAgent }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [valueMetrics, setValueMetrics] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [a, act, vm] = await Promise.all([
        api.get(`/analytics?public_id=${userId || ""}`),
        api.get(`/analytics/activity?public_id=${userId || ""}&days=30`),
        api.get(`/analytics/value?public_id=${userId || ""}`),
      ]);
      setAnalytics(a);
      setActivity(act || []);
      setValueMetrics(vm);
    } catch (e) {
      if (e.status === 401 || /Not authenticated|Failed to fetch|network error/i.test(e.message || "")) {
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
        setError("");
      } else {
        setError(e.message || "Failed to load analytics");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Loading skeleton state per 3.8.1
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-6 rounded-3xl bg-surface-container-lowest/60 border border-outline-variant/20 h-28 space-y-3">
              <div className="w-20 h-3 bg-surface-container-high rounded-full" />
              <div className="w-12 h-6 bg-surface-container-high rounded-lg" />
            </div>
          ))}
        </div>
        <div className="p-8 rounded-3xl bg-surface-container-lowest/60 border border-outline-variant/20 h-64 flex items-center justify-center text-xs font-code-sm text-on-surface-variant">
          Loading visx telemetry stream…
        </div>
      </div>
    );
  }

  // Real error state with Retry
  if (error) {
    return (
      <div className="p-6 rounded-3xl bg-error/15 border border-error/30 text-xs font-code-sm text-error flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-1.5 rounded-xl bg-error/20 hover:bg-error/30 text-error font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // Honest Empty state
  if (!analytics || (analytics.session_count === 0 && analytics.total_study_time_hours === 0)) {
    return (
      <div className="bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 rounded-3xl px-6 py-10 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto">
          <Activity className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="font-title-md text-base font-semibold text-on-surface">
          No study activity recorded yet
        </h3>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Study habits and completion trends will appear here as you work through assignments and review flashcards.
        </p>
        <button
          type="button"
          onClick={() => onExplainWithAgent?.("academic_progress_summary")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider transition cursor-pointer shadow-sm mx-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Start with Agent</span>
        </button>
      </div>
    );
  }

  // Prepare chart dataset (if all zero, ensure flat baseline + dots)
  const chartData = activity.length > 0
    ? activity.map((d) => ({ date: d.date, time_minutes: Number(d.time_minutes) || 0 }))
    : [
        { date: "Day 1", time_minutes: 0 },
        { date: "Day 15", time_minutes: 0 },
        { date: "Day 30", time_minutes: 0 },
      ];

  return (
    <div className="space-y-6">
      {/* Sticky Mini-KPI Row (grid-cols-2 mobile sticky, mono numerals per 3.8.1) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 sticky top-16 md:static z-10">
        <div className="p-4 sm:p-6 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-[10px] sm:text-xs uppercase tracking-wider">
            <span>Study Time</span>
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
          </div>
          <div className="font-tabular-stat text-xl sm:text-3xl font-bold text-on-surface mt-2">
            {(analytics.total_study_time_hours ?? 0).toFixed(1)}h
          </div>
          <span className="font-code-sm text-[10px] sm:text-xs text-on-surface-variant mt-1 truncate">
            {weekMinutes(analytics)}m in last 7 days
          </span>
        </div>

        <div className="p-4 sm:p-6 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-[10px] sm:text-xs uppercase tracking-wider">
            <span>Materials</span>
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-secondary" />
          </div>
          <div className="font-tabular-stat text-xl sm:text-3xl font-bold text-on-surface mt-2">
            {analytics.materials_studied ?? 0}
          </div>
          <span className="font-code-sm text-[10px] sm:text-xs text-on-surface-variant mt-1 truncate">
            {analytics.total_materials_generated ?? 0} total generated
          </span>
        </div>

        <div className="p-4 sm:p-6 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-[10px] sm:text-xs uppercase tracking-wider">
            <span>Sessions</span>
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
          </div>
          <div className="font-tabular-stat text-xl sm:text-3xl font-bold text-on-surface mt-2">
            {analytics.session_count ?? 0}
          </div>
          <span className="font-code-sm text-[10px] sm:text-xs text-on-surface-variant mt-1 truncate">
            avg score {analytics.average_score != null ? `${analytics.average_score}%` : "—"}
          </span>
        </div>

        <div className="p-4 sm:p-6 rounded-3xl bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-[10px] sm:text-xs uppercase tracking-wider">
            <span>Tutor Saved</span>
            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sem-amber" />
          </div>
          <div className="font-tabular-stat text-xl sm:text-3xl font-bold text-sem-amber mt-2">
            {valueMetrics?.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : "—"}
          </div>
          <span className="font-code-sm text-[10px] sm:text-xs text-on-surface-variant mt-1 truncate">
            {valueMetrics?.monthly_cost != null ? `$${Math.round(valueMetrics.monthly_cost)}/mo cost` : "no cost data"}
          </span>
        </div>
      </div>

      {/* Visx Area Chart Container */}
      <GlassCard>
        <div className="flex items-center justify-between gap-2 mb-4 text-sm text-on-surface font-semibold">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="font-title-md text-sm font-semibold text-on-surface">
              Telemetry Activity (Last 30 Days)
            </h2>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="h-9 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30 flex items-center gap-1.5 font-label-caps text-[11px] uppercase transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-primary" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Chart with 16/7 mobile aspect ratio & touchAction pan-y per 3.8.1 */}
        <div
          role="img"
          aria-label="30-day telemetry activity area chart"
          style={{ touchAction: "pan-y" }}
          className="w-full"
        >
          <AreaChart
            data={chartData}
            xDataKey="date"
            aspectRatio="16 / 7"
            className="mt-2"
            margin={{ top: 12, right: 8, bottom: 26, left: 8 }}
          >
            <Area dataKey="time_minutes" strokeWidth={2} />
            <XAxis numTicks={5} tickerHalfWidth={44} />
            <ChartTooltip
              rows={(point) => [
                { color: "var(--chart-line-primary, #59d8c9)", label: "Minutes studied", value: point.time_minutes ?? 0 },
              ]}
            />
          </AreaChart>
        </div>
      </GlassCard>

      {/* Autonomous ROI & Cost Breakdown */}
      {valueMetrics && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-4 text-sm text-on-surface font-semibold flex-wrap">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-title-md text-sm text-on-surface">Autonomous ROI &amp; Productivity Metrics</span>
            <button
              type="button"
              onClick={() => onExplainWithAgent?.("academic_progress_summary")}
              className="ml-auto flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary border border-primary/20 font-label-caps uppercase transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Explain Progress</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[10px] uppercase mb-1">Hours Saved</span>
              <strong className="text-on-surface font-tabular-stat text-lg font-bold">
                {valueMetrics.study_hours != null ? `${valueMetrics.study_hours}h` : "—"}
              </strong>
            </div>
            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[10px] uppercase mb-1">Monthly Expense</span>
              <strong className="text-on-surface font-tabular-stat text-lg font-bold">
                {valueMetrics.monthly_cost != null ? `$${valueMetrics.monthly_cost}` : "—"}
              </strong>
            </div>
            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[10px] uppercase mb-1">Cost Per Hour</span>
              <strong className="text-primary font-tabular-stat text-lg font-bold">
                {valueMetrics.cost_per_hour != null ? `$${valueMetrics.cost_per_hour}` : "—"}
              </strong>
            </div>
            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30">
              <span className="text-on-surface-variant block font-label-caps text-[10px] uppercase mb-1">Tutor Savings</span>
              <strong className="text-primary font-tabular-stat text-lg font-bold">
                {valueMetrics.tutor_savings != null ? `$${Math.round(valueMetrics.tutor_savings)}` : "—"}
              </strong>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Synthesized Materials Breakdown */}
      {analytics.material_breakdown && Object.keys(analytics.material_breakdown).length > 0 && (
        <GlassCard>
          <h3 className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider mb-3">
            Synthesized Materials Breakdown
          </h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(analytics.material_breakdown).map(([kind, count]) => (
              <span key={kind} className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-code-sm text-xs">
                {kind.replace("_", " ")}: <strong className="font-tabular-stat text-primary font-bold ml-1">{count}</strong>
              </span>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

export default AnalyticsDashboard;
