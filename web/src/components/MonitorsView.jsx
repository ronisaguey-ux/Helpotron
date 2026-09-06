import React, { useState, useCallback } from "react";
import {
  Gauge,
  Activity,
  Database,
  RefreshCw,
  TrendingUp,
  Wifi,
  Check,
  MessageSquare,
  AlertCircle,
  Clock,
  Coins,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import api from "../api.js";
import { usePoll30 } from "../lib/usePoll30.js";
import {
  fmt,
  formatUptime,
  deriveTrafficMetrics,
  parseDataLakeCounts,
} from "../lib/monitors.js";

export default function MonitorsView({ userId = "" }) {
  const [activeTab, setActiveTab] = useState("feedback"); // "feedback" (default) | "traffic" | "datalake"
  const [actionFeedback, setActionFeedback] = useState("");
  const [resolvingId, setResolvingId] = useState(null);

  // Polling fetch function
  const fetchMonitorsData = useCallback(async () => {
    const [ovRes, hiRes, fbRes] = await Promise.all([
      fetch("/api/monitors/overview").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/monitors/history?limit=48").then((r) => (r.ok ? r.json() : { snapshots: [] })).catch(() => ({ snapshots: [] })),
      api.listFeedback({ limit: 50 }).catch(() => ({ feedback: [] })),
    ]);

    // Owner 09-06: the v4 fallback fabricated fake anomalies ("Z3 Invariant
    // Timeout ...", "usr_99x_quant") whenever the backend had none. Real
    // feedback only — an empty queue renders as an honest empty state.
    const feedbackList = Array.isArray(fbRes?.feedback) ? fbRes.feedback : [];

    return {
      overview: ovRes,
      history: hiRes?.snapshots || [],
      feedback: feedbackList,
    };
  }, []);

  // 30s background poll: indicator dims without re-shimmering
  const { data, isInitialLoading, isPolling, lastUpdated, error, refetch } = usePoll30(
    fetchMonitorsData,
    { intervalMs: 30000 }
  );

  const overview = data?.overview;
  const feedback = data?.feedback || [];
  const trafficMetrics = deriveTrafficMetrics(overview?.traffic || {});
  const dataLakeMetrics = parseDataLakeCounts(overview?.datalake || {});

  // Handle Resolve & Credit Back Tokens (44px button per spec)
  const handleResolveFeedback = async (item, creditTokens = false) => {
    setResolvingId(item.id);
    setActionFeedback("");
    try {
      if (item.id && !item.id.startsWith("fb_")) {
        await api.updateFeedbackStatus(item.id, "resolved");
      }
      if (creditTokens && item.user_id && item.refund_tokens > 0) {
        try {
          await api.adminAdjustCredits(item.user_id, item.refund_tokens, "Anomaly refund via Monitors");
        } catch (e) {
          console.warn("Could not credit user:", e);
        }
      }

      if (data) {
        data.feedback = data.feedback.map((f) =>
          f.id === item.id ? { ...f, status: "resolved" } : f
        );
      }

      setActionFeedback(
        creditTokens && item.refund_tokens > 0
          ? `Resolved anomaly #${item.id} & credited ${item.refund_tokens} tokens to ${item.user_id}`
          : `Acknowledged & resolved item #${item.id}`
      );
      setTimeout(() => setActionFeedback(""), 4000);
    } catch (err) {
      console.warn("Feedback resolution failed:", err);
      setActionFeedback("Could not update feedback status.");
    } finally {
      setResolvingId(null);
    }
  };

  const openFeedbackCount = feedback.filter((f) => f.status !== "resolved").length;

  return (
    <div className="space-y-6">
      {/* Header Area (Spec 3.20.1) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low text-[11px] font-code-sm text-primary">
              <span className={`w-1.5 h-1.5 rounded-full bg-primary ${isPolling ? "opacity-40 animate-pulse" : ""}`} />
              LIVE · POLLS EVERY 30S
            </span>
          </div>
          <h1 className="font-headline-lg text-2xl md:text-3xl text-on-surface font-semibold tracking-tight">
            Monitors &amp; System Health
          </h1>
          <p className="font-body-md text-xs text-on-surface-variant mt-1 max-w-2xl">
            Feedback triage, live traffic rates, and data lake counters.
          </p>
        </div>

        {/* Quick Context & Polling Status Bar */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="h-10 px-3.5 rounded-xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 flex items-center gap-2 text-xs font-code-sm text-on-surface-variant shadow-sm">
            <span
              className={`w-2 h-2 rounded-full transition-opacity duration-300 ${
                isPolling ? "bg-primary opacity-30 animate-ping" : "bg-sem-green opacity-100"
              }`}
              title={isPolling ? "Refreshing in background…" : "Live telemetry connected"}
            />
            <span>
              {isPolling
                ? "Refreshing…"
                : lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Polling (30s)"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isPolling}
            className="h-10 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 transition cursor-pointer"
            title="Refresh monitors now"
          >
            <RefreshCw className={`w-4 h-4 ${isPolling ? "animate-spin text-primary" : "text-on-surface-variant"}`} />
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-code-sm text-primary">
          {actionFeedback}
        </div>
      )}

      {/* Primary Navigation Tabs (Feedback-first) */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30">
        <button
          type="button"
          onClick={() => setActiveTab("feedback")}
          className={`h-10 px-5 rounded-xl font-label-caps text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === "feedback"
              ? "bg-surface-container text-on-surface shadow-sm font-semibold"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container/40"
          }`}
        >
          <AlertCircle className={`w-4 h-4 ${activeTab === "feedback" ? "text-sem-amber" : "text-outline"}`} />
          <span>Priority Triage Queue</span>
          {openFeedbackCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-sem-amber/20 text-sem-amber text-[10px] font-code-sm font-semibold">
              {openFeedbackCount} NEEDS ATTENTION
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("traffic")}
          className={`h-10 px-5 rounded-xl font-label-caps text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === "traffic"
              ? "bg-surface-container text-on-surface shadow-sm font-semibold"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container/40"
          }`}
        >
          <Activity className={`w-4 h-4 ${activeTab === "traffic" ? "text-primary" : "text-outline"}`} />
          <span>Live Traffic</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("datalake")}
          className={`h-10 px-5 rounded-xl font-label-caps text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === "datalake"
              ? "bg-surface-container text-on-surface shadow-sm font-semibold"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container/40"
          }`}
        >
          <Database className={`w-4 h-4 ${activeTab === "datalake" ? "text-secondary" : "text-outline"}`} />
          <span>Data Lake &amp; Fleet Nodes</span>
        </button>
      </div>

      {/* TAB 1: PRIORITY TRIAGE QUEUE (DEFAULT PER FEEDBACK-FIRST DIRECTIVE) */}
      {activeTab === "feedback" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-sem-amber/15 flex items-center justify-center text-sem-amber">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-title-md text-sm font-semibold text-on-surface">
                  Operator Priority Triage Queue
                </h2>
                <p className="font-body-sm text-[11px] text-on-surface-variant">
                  Learner bug reports, invariant timeouts, and automated credit refunds.
                </p>
              </div>
            </div>
            <span className="font-code-sm text-[11px] text-on-surface-variant">
              AUTO-REFRESH: 30s POLLING
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {feedback.map((item) => {
              const isResolved = item.status === "resolved";
              const isHigh = item.severity === "high" || item.category === "bug";
              const isMed = item.severity === "medium" || item.category === "warning";

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isResolved
                      ? "bg-surface-container-lowest/40 border-outline-variant/20 opacity-60"
                      : isHigh
                      ? "bg-surface-container-lowest/80 backdrop-blur-xl border-error/30 shadow-sm"
                      : isMed
                      ? "bg-surface-container-lowest/80 backdrop-blur-xl border-sem-amber/30 shadow-sm"
                      : "bg-surface-container-lowest/80 backdrop-blur-xl border-outline-variant/30 shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`mt-1 flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                        isResolved
                          ? "bg-outline"
                          : isHigh
                          ? "bg-error ring-4 ring-error/20 animate-pulse"
                          : isMed
                          ? "bg-sem-amber"
                          : "bg-primary"
                      }`}
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-chip-status text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md ${
                            isHigh
                              ? "bg-error/15 text-error"
                              : isMed
                              ? "bg-sem-amber/15 text-sem-amber"
                              : "bg-primary/15 text-primary"
                          }`}
                        >
                          {isHigh ? "HIGH SEVERITY" : isMed ? "MEDIUM SEVERITY" : "ANOMALY SIGNAL"}
                        </span>
                        <span className="font-code-sm text-xs text-on-surface-variant">
                          #{item.id}
                        </span>
                        <span className="text-outline text-xs">·</span>
                        <span className="font-code-sm text-xs text-on-surface-variant">
                          {item.created_at || "Recent"}
                        </span>
                        <span className="text-outline text-xs">·</span>
                        <span className="font-code-sm text-xs text-primary font-medium">
                          {item.user_id || "Data Lake Pipeline"}
                        </span>
                      </div>

                      <div className="font-title-md text-xs font-semibold text-on-surface truncate">
                        {item.title || item.subject || item.message}
                      </div>

                      <p className="font-body-sm text-xs text-on-surface-variant line-clamp-2">
                        {item.message || item.text || item.details}
                      </p>
                    </div>
                  </div>

                  {/* 44px Resolve Action Button (Spec Requirement) */}
                  <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                    {!isResolved ? (
                      <>
                        {item.refund_tokens > 0 ? (
                          <button
                            type="button"
                            disabled={resolvingId === item.id}
                            onClick={() => handleResolveFeedback(item, true)}
                            className="h-11 px-4 rounded-xl bg-primary text-on-primary hover:bg-primary-fixed-dim font-label-caps text-xs font-semibold flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] transition active:scale-[0.98] cursor-pointer"
                          >
                            <Coins className="w-4 h-4" />
                            <span>Resolve &amp; Credit Back {item.refund_tokens} Tok</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={resolvingId === item.id}
                            onClick={() => handleResolveFeedback(item, false)}
                            className="h-11 px-4 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-caps text-xs font-medium flex items-center gap-2 transition cursor-pointer"
                          >
                            <Check className="w-4 h-4 text-sem-green" />
                            <span>Acknowledge &amp; Resolve</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="h-11 px-4 rounded-xl bg-surface-container-low text-on-surface-variant font-code-sm text-xs inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-sem-green" />
                        <span>Resolved</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 2: CLUSTER THROUGHPUT & INVARIANT SIGNALS */}
      {activeTab === "traffic" && (
        <section className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="font-title-md text-sm font-semibold text-on-surface">
                Live API Traffic
              </h2>
            </div>
            <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant">
              <span>POLL:</span>
              <span className="text-on-surface font-medium">EVERY 30 SECONDS</span>
            </div>
          </div>

          {/* Real Metrics Grid (owner 09-06: every number comes from
              /api/monitors/overview — no fabricated fallbacks) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Requests per minute */}
            <div className="p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-semibold">
                  Requests / minute
                </span>
                <TrendingUp className="w-3.5 h-3.5 text-sem-green" />
              </div>
              <div className="font-tabular-stat text-2xl font-bold text-on-surface mt-1">
                {trafficMetrics.ratePerSec !== null ? Number(trafficMetrics.ratePerSec).toFixed(1) : "—"}{" "}
                <span className="font-code-sm text-xs text-on-surface-variant font-normal">req/s</span>
              </div>
              <div className="font-code-sm text-[11px] text-on-surface-variant mt-1">
                {trafficMetrics.total !== null ? `${fmt(trafficMetrics.total)} total requests` : "No traffic data yet"}
              </div>
            </div>

            {/* Uptime */}
            <div className="p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-semibold">
                  API Uptime
                </span>
                <span className="w-2 h-2 rounded-full bg-sem-green" />
              </div>
              <div className="font-tabular-stat text-2xl font-bold text-on-surface mt-1">
                {formatUptime(overview?.uptime_seconds)}
              </div>
              <div className="font-code-sm text-[11px] text-on-surface-variant mt-1">
                Since server start
              </div>
            </div>

            {/* Error rate */}
            <div className="p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-semibold">
                  Error rate (5xx+)
                </span>
                <span className={`w-2 h-2 rounded-full ${trafficMetrics.errorRateData.tier === "outline" ? "bg-outline" : trafficMetrics.errorRateData.tier}`} />
              </div>
              <div className="font-tabular-stat text-2xl font-bold text-on-surface mt-1">
                {trafficMetrics.errorRateData.formatted}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-chip-status text-[10px] font-semibold ${
                  trafficMetrics.errorRateData.tier === "outline"
                    ? "bg-surface-container-high text-on-surface-variant"
                    : `bg-${trafficMetrics.errorRateData.tier}/15 text-${trafficMetrics.errorRateData.tier}`
                }`}>
                  {trafficMetrics.errorRateData.statusLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Real request-volume graph from /api/monitors/history snapshots
              (owner 09-06: the previous handmade SVG claimed "MEAN: 81.6 REQ/S" —
              invented. This plots actual snapshots, or says it is still collecting.) */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-code-sm text-on-surface-variant">
              <span>REQUEST VOLUME · LAST {Math.max(history.length, 0)} SNAPSHOTS (30s POLL)</span>
            </div>
            <div className="w-full h-28 bg-surface-container-low/40 rounded-xl p-3 flex items-center justify-center border border-outline-variant/20">
              {history.length > 1 ? (
                <svg className="w-full h-full text-primary" fill="none" preserveAspectRatio="none" viewBox="0 0 1000 100">
                  <defs>
                    <linearGradient id="trafficGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="#59d8c9" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#59d8c9" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {(() => {
                    const vals = history
                      .map((h) => Number(h?.traffic?.requests_last_window ?? h?.traffic?.requests_per_min ?? 0))
                      .filter((v) => Number.isFinite(v));
                    const max = Math.max(...vals, 1);
                    const pts = vals.map((v, idx) => [
                      (idx / (vals.length - 1)) * 1000,
                      92 - (v / max) * 80,
                    ]);
                    const line = pts.map(([x, y], idx) => `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
                    const area = `${line} L 1000 100 L 0 100 Z`;
                    return (
                      <>
                        <path d={area} fill="url(#trafficGradient)" />
                        <path d={line} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <span className="font-code-sm text-[11px] text-on-surface-variant">
                  Still collecting snapshots — check back in a minute.
                </span>
              )}
            </div>
            <div className="flex justify-between font-code-sm text-[10px] text-outline px-1">
              <span>Oldest snapshot</span>
              <span>Now</span>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: DATA LAKE & SERVICE STATUS */}
      {activeTab === "datalake" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Data Lake Ingestion Feed */}
          <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-title-md text-sm font-semibold text-on-surface">
                    Data Lake Counters
                  </h3>
                  <p className="font-body-sm text-[11px] text-on-surface-variant">
                    Real feedback and submission counts from the server.
                  </p>
                </div>
              </div>
              <span className="font-chip-status text-[10px] px-2 py-0.5 rounded-full bg-sem-green/15 text-sem-green font-semibold">
                LIVE
              </span>
            </div>

            <div className="space-y-2.5">
              {dataLakeMetrics.map((m) => (
                  <div key={m.label} className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-sem-green shrink-0" />
                      <div className="min-w-0">
                        <span className="font-body-sm text-xs text-on-surface font-medium truncate block">
                          {m.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-code-sm text-xs text-primary font-medium block">
                        {m.value}
                      </span>
                      <span className="font-code-sm text-[10px] text-outline block">
                        {m.delta === null ? "no delta data" : `last window: ${m.delta}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between text-xs font-code-sm text-on-surface-variant">
                <span>Counts are cumulative since tracking started</span>
                <span className="text-primary font-medium">Live data</span>
              </div>
            </div>

          {/* Live service status — real numbers from /api/monitors/overview
              (owner 09-06: the v4 "fleet matrix" claimed a 67B local model with
              88.4GB VRAM, a "BAA enclave", WebGPU pods and 3 active pods. None
              of it existed — replaced with the actual API metrics.) */}
          <div className="rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-title-md text-sm font-semibold text-on-surface">
                    Live Service Status
                  </h3>
                  <p className="font-body-sm text-[11px] text-on-surface-variant">
                    {formatUptime(overview?.uptime_seconds)} uptime ·{" "}
                    {trafficMetrics.ratePerSec !== null ? Number(trafficMetrics.ratePerSec).toFixed(1) : "—"} req/s
                  </p>
                </div>
              </div>
              <span className={`font-chip-status text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                trafficMetrics.errorRateData.tier === "outline"
                  ? "bg-surface-container-high text-on-surface-variant"
                  : `bg-${trafficMetrics.errorRateData.tier}/15 text-${trafficMetrics.errorRateData.tier}`
              }`}>
                {trafficMetrics.errorRateData.statusLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Top endpoints (real) */}
              <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 space-y-2">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-semibold block">
                  Most requested endpoints
                </span>
                {(overview?.traffic?.top_endpoints || []).slice(0, 5).map((ep) => (
                  <div key={ep.endpoint} className="flex items-center justify-between font-code-sm text-[11px] text-on-surface-variant">
                    <span className="truncate">{ep.endpoint}</span>
                    <span className="text-on-surface font-medium ml-2">{ep.count}</span>
                  </div>
                ))}
                {(overview?.traffic?.top_endpoints || []).length === 0 && (
                  <span className="font-code-sm text-[11px] text-on-surface-variant">No traffic recorded yet.</span>
                )}
              </div>

              {/* Status counts (real) */}
              <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 space-y-2">
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase font-semibold block">
                  Response status counts
                </span>
                {Object.entries(overview?.traffic?.status_counts || {}).map(([code, count]) => (
                  <div key={code} className="flex items-center justify-between font-code-sm text-[11px] text-on-surface-variant">
                    <span>HTTP {code}</span>
                    <span className="text-on-surface font-medium">{count}</span>
                  </div>
                ))}
                {Object.keys(overview?.traffic?.status_counts || {}).length === 0 && (
                  <span className="font-code-sm text-[11px] text-on-surface-variant">No responses recorded yet.</span>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-between text-xs font-code-sm text-on-surface-variant">
              <span>Last snapshot: {overview?.ts ? new Date(overview.ts).toLocaleTimeString() : "—"}</span>
              <span className="text-primary font-medium">Live data</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
