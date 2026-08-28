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
          className="bg-blue-500/70 rounded-sm flex-1 min-w-[4px]"
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Monitors</h2>
          <span className="text-xs text-gray-500">
            persistent collectors · traffic · activity · data lake · cost
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {updatedAt && (
            <span>
              updated {updatedAt.toLocaleTimeString()} · refreshes every {REFRESH_MS / 1000}s
            </span>
          )}
          <button
            type="button"
            onClick={load}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition cursor-pointer"
            aria-label="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/15 border border-rose-500/30 text-rose-200 px-4 py-2 rounded-lg text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Traffic */}
        <SectionCard title="Traffic" icon={<Wifi className="w-4 h-4" />}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">{fmt(traff.total_requests)}</div>
              <div className="text-[11px] text-gray-500">reqs total</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(traff.requests_last_window)}</div>
              <div className="text-[11px] text-gray-500">last 60s</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{traff.requests_per_min || 0}/m</div>
              <div className="text-[11px] text-gray-500">rate</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Status codes</div>
            <div className="flex h-3 rounded overflow-hidden">
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
                    className={c === '2' ? 'bg-emerald-500/80' : c === '3' ? 'bg-sky-500/80' : c === '4' ? 'bg-amber-500/80' : 'bg-rose-500/80'}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
              {Object.keys(status).length === 0 && (
                <div className="bg-gray-700 flex-1" />
              )}
            </div>
            <div className="flex gap-3 mt-2 text-[11px] text-gray-500">
              <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/80 mr-1" />2xx</span>
              <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-500/80 mr-1" />3xx</span>
              <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-500/80 mr-1" />4xx</span>
              <span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500/80 mr-1" />5xx</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Top endpoints</div>
            {(traff.top_endpoints || []).slice(0, 6).map((e) => {
              const pct = Math.min(100, (e.count / (traff.total_requests || 1)) * 100);
              return (
                <div key={e.endpoint} className="flex items-center gap-2 text-xs py-1">
                  <code className="text-gray-400 truncate max-w-[220px]">{e.endpoint}</code>
                  <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
                    <div className="bg-blue-500/70 h-full rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-gray-500 w-14 text-right">{fmt(e.count)}</span>
                </div>
              );
            })}
            {(!traff.top_endpoints || traff.top_endpoints.length === 0) && (
              <div className="text-xs text-gray-600">waiting for traffic…</div>
            )}
          </div>
        </SectionCard>

        {/* Activity */}
        <SectionCard title="Activity" icon={<Activity className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">{fmt(act.study_sessions_24h)}</div>
              <div className="text-[11px] text-gray-500">study sessions 24h</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(act.study_sessions)}</div>
              <div className="text-[11px] text-gray-500">sessions all-time</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(act.assignments_24h)}</div>
              <div className="text-[11px] text-gray-500">assignments 24h</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(act.assignments)}</div>
              <div className="text-[11px] text-gray-500">assignments all-time</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(act.study_materials)}</div>
              <div className="text-[11px] text-gray-500">study materials</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(act.transcripts)}</div>
              <div className="text-[11px] text-gray-500">transcripts</div>
            </div>
          </div>
          <div className="mt-4 text-[11px] text-gray-500 flex items-center gap-1">
            <Server className="w-3 h-3" /> uptime {Math.floor((overview?.uptime_seconds || 0) / 3600)}h {Math.floor(((overview?.uptime_seconds || 0) % 3600) / 60)}m
          </div>
        </SectionCard>

        {/* Data Lake */}
        <SectionCard title="Data Lake" icon={<Database className="w-4 h-4" />}>
          <div className="space-y-2">
            {dlRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-xs py-1 border-b border-gray-800/60 last:border-0">
                <span className="text-gray-400">{r.label}</span>
                <span className="flex items-center gap-2">
                  {r.delta > 0 && (
                    <span className="text-emerald-400 text-[11px]">+{fmt(r.delta)}</span>
                  )}
                  <span className="font-semibold">{r.value}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Total entries over time
            </div>
            <Sparkline values={dlSeries} />
          </div>
        </SectionCard>

        {/* Cost */}
        <SectionCard title="API Cost" icon={<Coins className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">${(cost.cost_usd_24h ?? 0).toFixed(4)}</div>
              <div className="text-[11px] text-gray-500">spent 24h</div>
            </div>
            <div>
              <div className="text-2xl font-bold">${(cost.cost_usd ?? 0).toFixed(4)}</div>
              <div className="text-[11px] text-gray-500">spent all-time</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(cost.calls_24h)}</div>
              <div className="text-[11px] text-gray-500">API calls 24h</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmt(cost.calls)}</div>
              <div className="text-[11px] text-gray-500">calls all-time</div>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-[11px] text-gray-500">
            <span>{fmt(cost.input_tokens)} in-tokens</span>
            <span>{fmt(cost.output_tokens)} out-tokens</span>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
