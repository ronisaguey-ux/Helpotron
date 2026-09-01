import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Gauge, Activity, Database, Coins, RefreshCw, TrendingUp, Server, Wifi,
} from 'lucide-react';
import SectionCard from './SectionCard.jsx';

const REFRESH_MS = 30000;

function fmt(v) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString();
}

/* Tiny dependency-free sparkline: bars from a value series. */
function Sparkline({ values, height = 36 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values) || 1;
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="bg-primary/60 rounded-sm flex-1 min-w-[4px]"
          style={{ height: `${Math.max(6, (v / max) * height)}px` }}
          title={fmt(v)}
        />
      ))}
    </div>
  );
}

export default function MonitorsView({ userId = '' }) {
  const [overview, setOverview] = useState(null);
  const [history, setHistory] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [ov, hi] = await Promise.all([
        fetch('/api/monitors/overview').then((r) => r.json()),
        fetch('/api/monitors/history?limit=48').then((r) => r.json()),
      ]);
      setOverview(ov);
      setHistory(hi.snapshots || []);
      setUpdatedAt(new Date());
      setError('');
    } catch (e) {
      console.warn('monitors fetch failed', e);
      setError('Could not reach the monitors API — is the server up?');
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const traff = overview?.traffic || {};
  const dl = overview?.datalake || {};
  const act = overview?.activity || {};
  const cost = overview?.cost || {};
  const dlSeries = history
    .map((h) => h?.datalake_counts)
    .filter(Boolean)
    .map((d) => d.operational_events + d.user_feedback + d.microcredit_submissions + (d.humanized_samples || 0));
  const status = traff.status_counts || {};
  const statusTotal = Object.values(status).reduce((a, b) => a + b, 0) || 1;

  const dlRows = [
    { label: 'Operational events', value: fmt(dl.operational_events), delta: dl.deltas_last_window?.operational_events },
    { label: 'User feedback', value: fmt(dl.user_feedback), delta: dl.deltas_last_window?.user_feedback },
    { label: 'Microcredit submissions', value: fmt(dl.microcredit_submissions), delta: dl.deltas_last_window?.microcredit_submissions },
    { label: 'Humanized samples', value: fmt(dl.humanized_samples), delta: dl.deltas_last_window?.humanized_samples },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-headline-lg text-title-md text-on-surface">Monitors</h2>
            <p className="font-body-sm text-xs text-on-surface-variant min-w-0 truncate">
              Persistent telemetry collectors · traffic · activity · data lake · API cost
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-on-surface-variant min-w-0">
          {updatedAt && (
            <span className="font-tabular-stat text-tabular-stat min-w-0 truncate">
              Updated {updatedAt.toLocaleTimeString()} · refreshes every {REFRESH_MS / 1000}s
            </span>
          )}
          <button
            type="button"
            onClick={load}
            className="p-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/30 transition cursor-pointer"
            aria-label="Refresh now"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4 text-primary" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-error/15 border border-error/30 text-error px-4 py-2.5 rounded-xl text-xs font-label-caps uppercase">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 [&>*]:min-w-0">
        {/* Traffic */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 font-title-md text-title-md text-on-surface">
            <Wifi className="w-4 h-4 text-primary" />
            <span>Traffic</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="min-w-0">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(traff.total_requests)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">reqs total</div>
            </div>
            <div className="min-w-0">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(traff.requests_last_window)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">last 60s</div>
            </div>
            <div className="min-w-0">
              <div className="font-tabular-stat text-2xl font-bold text-primary truncate">{traff.requests_per_min || 0}/m</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">rate</div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-outline-variant/20">
            <div className="font-label-caps text-[11px] uppercase tracking-wider text-on-surface-variant mb-2">Status codes</div>
            <div className="flex h-3 rounded-full overflow-hidden bg-surface-container-high">
              {['2', '3', '4', '5'].map((c) => {
                const n = Object.entries(status)
                  .filter(([k]) => k.startsWith(c))
                  .reduce((a, [, v]) => a + v, 0);
                if (!n) return null;
                const pct = (n / statusTotal) * 100;
                return (
                  <div
                    key={c}
                    title={`${c}xx: ${fmt(n)}`}
                    className={c === '2' ? 'bg-primary' : c === '3' ? 'bg-secondary' : c === '4' ? 'bg-amber-500' : 'bg-error'}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
              {Object.keys(status).length === 0 && (
                <div className="bg-surface-container flex-1" />
              )}
            </div>
            <div className="flex gap-4 mt-2 font-label-caps text-[11px] text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" />2xx</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary" />3xx</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />4xx</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-error" />5xx</span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-outline-variant/20">
            <div className="font-label-caps text-[11px] uppercase tracking-wider text-on-surface-variant mb-2">Top endpoints</div>
            {(traff.top_endpoints || []).slice(0, 6).map((e) => {
              const pct = Math.min(100, (e.count / (traff.total_requests || 1)) * 100);
              return (
                <div key={e.endpoint} className="flex items-center gap-2 text-xs py-1.5 min-w-0">
                  <code className="text-on-surface truncate min-w-0 basis-[45%] max-w-[220px] font-mono text-[11px]" title={e.endpoint}>{e.endpoint}</code>
                  <div className="flex-1 min-w-0 h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-tabular-stat text-on-surface-variant w-14 shrink-0 text-right">{fmt(e.count)}</span>
                </div>
              );
            })}
            {(!traff.top_endpoints || traff.top_endpoints.length === 0) && (
              <div className="font-body-sm text-xs text-on-surface-variant">waiting for traffic…</div>
            )}
          </div>
        </div>

        {/* Activity */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 font-title-md text-title-md text-on-surface">
            <Activity className="w-4 h-4 text-primary" />
            <span>Activity</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(act.study_sessions_24h)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">study sessions 24h</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(act.study_sessions)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">sessions all-time</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(act.assignments_24h)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">assignments 24h</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(act.assignments)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">assignments all-time</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(act.study_materials)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">study materials</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(act.transcripts)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">transcripts</div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-outline-variant/20 text-xs text-on-surface-variant flex items-center gap-1.5 min-w-0 font-label-caps uppercase">
            <Server className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">uptime {Math.floor((overview?.uptime_seconds || 0) / 3600)}h {Math.floor(((overview?.uptime_seconds || 0) % 3600) / 60)}m</span>
          </div>
        </div>

        {/* Data Lake */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 font-title-md text-title-md text-on-surface">
            <Database className="w-4 h-4 text-primary" />
            <span>Data Lake</span>
          </div>
          <div className="space-y-3">
            {dlRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-outline-variant/20 last:border-0 min-w-0">
                <span className="text-on-surface-variant font-body-sm min-w-0 truncate" title={r.label}>{r.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {r.delta > 0 && (
                    <span className="font-label-caps text-xs text-primary font-semibold">+{fmt(r.delta)}</span>
                  )}
                  <span className="font-tabular-stat font-bold text-on-surface">{r.value}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-outline-variant/20">
            <div className="font-label-caps text-[11px] uppercase tracking-wider text-on-surface-variant mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" /> Total entries over time
            </div>
            <Sparkline values={dlSeries} />
          </div>
        </div>

        {/* Cost */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 font-title-md text-title-md text-on-surface">
            <Coins className="w-4 h-4 text-primary" />
            <span>API Cost</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">${(cost.cost_usd_24h ?? 0).toFixed(4)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">spent 24h</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">${(cost.cost_usd ?? 0).toFixed(4)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">spent all-time</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(cost.calls_24h)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">API calls 24h</div>
            </div>
            <div className="min-w-0 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <div className="font-tabular-stat text-2xl font-bold text-on-surface truncate">{fmt(cost.calls)}</div>
              <div className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-1">calls all-time</div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-outline-variant/20 flex justify-between gap-2 font-tabular-stat text-xs text-on-surface-variant">
            <span className="min-w-0 truncate">{fmt(cost.input_tokens)} in-tokens</span>
            <span className="min-w-0 truncate">{fmt(cost.output_tokens)} out-tokens</span>
          </div>
        </div>
      </div>
    </div>
  );
}
