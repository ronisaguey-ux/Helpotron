/**
 * monitors.js
 * Helpers, formatting, and metric derivation for the Monitors panel.
 *
 * Owner 09-06: all fabricated fallbacks removed. The panel came from the v4
 * "spec 3.20 telemetry" era and fell back to plausible-looking fake numbers
 * (84.2 req/s, 41.2% memory, 48,290 AST units, "+14.2%" deltas) whenever the
 * real payload was missing — fake metrics presented as real ones. Now missing
 * data renders as "—" and deltas are only shown when the server sent them.
 */

export function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString();
}

export function formatPercent(num, decimals = 1) {
  if (num === null || num === undefined || Number.isNaN(num)) return "0.0%";
  return `${Number(num).toFixed(decimals)}%`;
}

export const P95_GLOSSARY_TEXT =
  "p95 latency is the 95th percentile response time: 95% of requests completed faster than this duration. Tail outliers fall in the remaining 5%.";

/**
 * Calculates error rate and status badge tier from status counts.
 */
export function calculateErrorRate(statusCounts = {}, totalFallback = 0) {
  const counts = typeof statusCounts === "object" && statusCounts !== null ? statusCounts : {};
  let total = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  if (total === 0 && totalFallback > 0) total = totalFallback;

  let errorCount = 0;
  for (const [code, count] of Object.entries(counts)) {
    const codeNum = parseInt(code, 10);
    if (codeNum >= 500 || code.toLowerCase().includes("err") || code.toLowerCase().includes("fail")) {
      errorCount += Number(count) || 0;
    }
  }

  // No data yet is not "0.04% healthy" — it is simply unknown.
  const rate = total > 0 ? (errorCount / total) * 100 : null;
  const formatted = rate === null ? "—" : `${rate.toFixed(2)}%`;

  let tier = "outline";
  let statusLabel = rate === null ? "NO DATA" : "STABLE";

  if (rate !== null && rate > 1.0) {
    tier = "error";
    statusLabel = "ELEVATED";
  } else if (rate !== null && rate > 0.1) {
    tier = "sem-amber";
    statusLabel = "MONITORING";
  }

  return {
    errorCount,
    total,
    rate,
    formatted,
    tier,
    statusLabel,
  };
}

/**
 * Derives traffic metrics from the real monitor payload only.
 * Every value the server does not supply stays null (rendered "—").
 */
export function deriveTrafficMetrics(traffic = {}) {
  const total = Number(traffic.total_requests ?? traffic.total ?? null) || null;
  const ratePerMin = Number(traffic.requests_per_min ?? null);
  const ratePerSec =
    Number(traffic.rate_per_sec ?? traffic.req_per_sec ?? null) ??
    (ratePerMin !== null && !Number.isNaN(ratePerMin) ? ratePerMin / 60 : null);
  // p95 / memory pressure are not published by /api/monitors/overview — they
  // stay unknown rather than being invented.
  const p95Latency = (() => {
    const n = Number(traffic.p95_latency_ms ?? traffic.p95_latency);
    return Number.isFinite(n) ? n : null;
  })();
  const memoryPressure = (() => {
    const n = Number(traffic.memory_pressure_pct);
    return Number.isFinite(n) ? n : null;
  })();
  const errorRateData = calculateErrorRate(traffic.status_counts, 0);

  // Owner 2026-09-19: requests the middleware deliberately does NOT count as
  // traffic. Surfaced so the excluded volume is visible rather than vanished.
  const excluded = Number(
    traffic.excluded?.session_polling ?? 0
  ) + Number(traffic.excluded?.background ?? 0);

  return {
    total,
    excluded: Number.isFinite(excluded) ? excluded : 0,
    ratePerSec: ratePerSec === null || Number.isNaN(ratePerSec) ? null : Number(ratePerSec.toFixed(2)),
    ratePerMin,
    p95Latency,
    memoryPressure,
    errorRateData,
  };
}

/**
 * Normalizes Data Lake counts — real server counts only; unknown stays null.
 */
export function parseDataLakeCounts(datalake = {}) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const events = num(datalake.operational_events);
  const feedback = num(datalake.user_feedback);
  const microcredits = num(datalake.microcredit_submissions);
  const humanized = num(datalake.humanized_samples);
  // Owner 2026-09-19: the events figure is now DISTINCT events, not raw rows —
  // the lake held 814 rows but only 274 distinct payloads (540 were a synthetic
  // load run repeating identical scores). The raw count is carried through so
  // the difference can be shown rather than hidden.
  const eventRows = num(datalake.operational_events_rows);
  const eventSynthetic = num(datalake.operational_events_synthetic);

  const deltas = datalake.deltas_last_window || {};
  const delta = (k) => (Number.isFinite(Number(deltas[k])) ? Number(deltas[k]) : null);

  return [
    {
      label: "Operational events",
      value: fmt(events),
      delta: delta("operational_events"),
      note: (eventRows !== null && eventRows !== events)
        ? `${fmt(eventRows)} rows logged, ${fmt(eventSynthetic)} repeat a payload already counted`
        : null,
    },
    { label: "User feedback", value: fmt(feedback), delta: delta("user_feedback") },
    { label: "Microcredit submissions", value: fmt(microcredits), delta: delta("microcredit_submissions") },
    { label: "Humanized samples", value: fmt(humanized), delta: delta("humanized_samples") },
  ];
}

/** Formats seconds as compact human duration, e.g. "4m 12s" / "1h 09m". */
export function formatUptime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
