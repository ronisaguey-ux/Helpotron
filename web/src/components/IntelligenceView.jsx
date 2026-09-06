import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  Clock,
  Target,
  BookOpen,
  ArrowRight,
  Sparkles,
  Award,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import api from "../api.js";

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
      id: "volume",
      icon: Clock,
      title: `${hours} ${hours === 1 ? "hour" : "hours"} studied across ${sessions} ${sessions === 1 ? "session" : "sessions"}`,
      detail:
        daysActive > 0
          ? `${Math.round(recentMinutes)} minutes over ${daysActive} active ${daysActive === 1 ? "day" : "days"} in the last week.`
          : "No sessions recorded in the last seven days.",
    });
  }

  if (typeof avg === "number") {
    out.push({
      id: "score",
      icon: Target,
      title: `Average score ${Math.round(avg)}%`,
      detail: `Mean across the ${sessions} scored ${sessions === 1 ? "session" : "sessions"} on record.`,
    });
  }

  const breakdown = a.material_breakdown || {};
  const kinds = Object.entries(breakdown).sort((x, y) => y[1] - x[1]);
  if (kinds.length > 0) {
    const [topKind, topCount] = kinds[0];
    out.push({
      id: "materials",
      icon: BookOpen,
      title: `${a.total_materials_generated || 0} study ${a.total_materials_generated === 1 ? "material" : "materials"} generated`,
      detail: `Most common: ${String(topKind).replace(/_/g, " ")} (${topCount}).`,
    });
  }

  if (daysActive === 0 && sessions > 0) {
    out.push({
      id: "gap",
      icon: TrendingUp,
      title: "No study activity this week",
      detail: "Your last recorded session is more than seven days old.",
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
      label: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      minutes: (recent && recent[key]) || 0,
    });
  }
  return days;
}

function StatusBlock({ loading, error, onRetry }) {
  if (loading) {
    return (
      <div className="p-8 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/30 text-center text-xs font-code-sm text-on-surface-variant">
        Loading telemetry snapshot…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-error/15 border border-error/30 text-xs font-code-sm text-error flex items-center justify-between">
        <span>{error}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-error font-semibold underline cursor-pointer"
          >
            Retry
          </button>
        )}
      </div>
    );
  }
  return null;
}

/** Academic Progress panel — stats, last-7-days activity bars, observations. */
export function ProgressPanel({ a, insights, loading, error, onRetry }) {
  if (loading || error) return <StatusBlock loading={loading} error={error} onRetry={onRetry} />;

  const days = lastSevenDays(a?.recent_activity);
  const maxMin = Math.max(...days.map((d) => d.minutes), 1);
  const weekMinutes = days.reduce((s, d) => s + d.minutes, 0);
  const stats = [
    { label: "Study Sessions", value: a?.session_count ?? 0 },
    { label: "Hours Studied", value: `${(a?.total_study_time_hours ?? 0).toFixed(1)}h` },
    { label: "Average Score", value: typeof a?.average_score === "number" ? `${Math.round(a.average_score)}%` : "—" },
    { label: "Materials Synthesized", value: a?.total_materials_generated ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {/* 4 Mini-KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(({ label, value }) => (
          <div key={label} className="p-4 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm">
            <span className="font-tabular-stat text-xl sm:text-2xl font-bold text-on-surface block">
              {value}
            </span>
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block mt-1">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Last 7 Days Activity Bar Chart */}
      <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-title-md text-sm font-semibold text-on-surface">
            7-Day Activity Continuity
          </h3>
          {weekMinutes > 0 ? (
            <span className="font-code-sm text-xs text-primary">
              {Math.round(weekMinutes)} minutes total
            </span>
          ) : (
            <span className="font-code-sm text-xs text-on-surface-variant">
              0 min this week
            </span>
          )}
        </div>

        <div className="flex items-end gap-2 h-36 pt-2">
          {days.map((d) => {
            const heightPct = Math.max((d.minutes / maxMin) * 100, 8);
            return (
              <div key={d.key} className="flex-1 h-full flex flex-col justify-end gap-1.5">
                <div className="flex-1 flex items-end rounded-xl bg-surface-container-low overflow-hidden p-1">
                  {d.minutes > 0 ? (
                    <div
                      className="w-full bg-primary rounded-lg transition-all duration-500 shadow-[0_0_12px_rgba(89,216,201,0.25)]"
                      style={{ height: `${heightPct}%` }}
                    />
                  ) : (
                    <div className="w-full h-1 bg-surface-container-highest rounded-full" />
                  )}
                </div>
                <p className="font-label-caps text-[10px] text-on-surface-variant text-center uppercase">
                  {d.label}
                </p>
                <p className="font-code-sm text-[10px] text-outline text-center -mt-1">
                  {d.minutes}m
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Observations Grid */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-label-caps text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider">
            Empirical Activity Observations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map(({ id, icon: Icon, title, detail }) => (
              <div
                key={id}
                className="p-4 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="font-title-md text-xs font-semibold text-on-surface truncate">
                    {title}
                  </p>
                  <p className="font-body-sm text-xs text-on-surface-variant">
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Recommendations panel — real next best action + honest derived suggestions. */
export function RecommendationsPanel({ a, next, onGoTo, loading, error, onRetry }) {
  if (loading || error) return <StatusBlock loading={loading} error={error} onRetry={onRetry} />;

  const recs = [];
  const sessions = a?.session_count || 0;
  const daysActive = Object.keys(a?.recent_activity || {}).length;

  if (next) {
    recs.push({
      id: "next",
      icon: ArrowRight,
      title: next.title,
      detail: `${next.rationale}${next.due_date ? ` · Due ${next.due_date}` : ""}`,
      action: "Open Assignment",
      target: "overview",
    });
  }

  if (sessions > 0 && daysActive === 0) {
    recs.push({
      id: "gap",
      icon: TrendingUp,
      title: "No study activity in the last 7 days",
      detail: `${sessions} ${sessions === 1 ? "session is" : "sessions are"} on record. A quick review will preserve memory retention.`,
      action: "Review Materials",
      target: "library",
    });
  }

  const avg = a?.average_score;
  if (typeof avg === "number" && avg < 70) {
    recs.push({
      id: "score",
      icon: Target,
      title: `Average diagnostic score is ${Math.round(avg)}%`,
      detail: "Below the 70% threshold — review your flashcard sets and retry missed quiz questions.",
      action: "Open Study Tools",
      target: "library",
    });
  }

  if (recs.length === 0) {
    return (
      <div className="p-8 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-3">
        <Sparkles className="w-8 h-8 text-primary mx-auto" />
        <h3 className="font-title-md text-sm font-semibold text-on-surface">
          All recommendations cleared
        </h3>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
          No pressing actions or gaps detected. Continue completing assignments and review sessions to generate fresh insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {recs.map((r) => {
          const Icon = r.icon || Sparkles;
          return (
            <div
              key={r.id}
              className="p-5 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm flex flex-col justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-1 min-w-0">
                  <h4 className="font-title-md text-xs font-semibold text-on-surface">
                    {r.title}
                  </h4>
                  <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                    {r.detail}
                  </p>
                </div>
              </div>

              {r.action && (
                <button
                  type="button"
                  onClick={() => onGoTo?.(r.target || "overview")}
                  className="h-9 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-label-caps text-xs flex items-center justify-between transition cursor-pointer self-end w-full sm:w-auto"
                >
                  <span>{r.action}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function IntelligenceView({ userId, onGoTo, panel }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSnapshot = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/analytics?public_id=${userId || ""}`);
      setData(res);
    } catch (e) {
      setError(e.message || "Could not load intelligence data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshot();
  }, [userId]);

  const insights = deriveInsights(data);

  if (panel === "progress") {
    return (
      <ProgressPanel
        a={data}
        insights={insights}
        loading={loading}
        error={error}
        onRetry={loadSnapshot}
      />
    );
  }

  if (panel === "recommendations") {
    return (
      <RecommendationsPanel
        a={data}
        next={null}
        onGoTo={onGoTo}
        loading={loading}
        error={error}
        onRetry={loadSnapshot}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ProgressPanel
        a={data}
        insights={insights}
        loading={loading}
        error={error}
        onRetry={loadSnapshot}
      />
      <RecommendationsPanel
        a={data}
        next={null}
        onGoTo={onGoTo}
        loading={loading}
        error={error}
        onRetry={loadSnapshot}
      />
    </div>
  );
}
