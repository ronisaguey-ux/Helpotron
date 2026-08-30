import React, { useEffect, useState } from 'react';
import { Users, Cpu, Bot, RefreshCw } from 'lucide-react';
import api from '../api.js';
import AdminAdvancedDashboard from './AdminAdvancedDashboard.jsx';
import AdminAgentChat from './AdminAgentChat.jsx';

export function SystemMapPanel({ telemetryData }) {
  const [nodes, setNodes] = useState(() => telemetryData?.nodes || []);
  const [state, setState] = useState(telemetryData?.nodes ? 'ready' : 'loading');

  const loadNodes = async () => {
    if (telemetryData?.nodes) return; // caller supplied data — don't override
    setState('loading');
    try {
      const res = await api.adminSystemMapNodes();
      setNodes(Array.isArray(res?.nodes) ? res.nodes : []);
      setState('ready');
    } catch (e) {
      console.warn('Failed to fetch system map nodes:', e);
      setNodes([]);
      setState('error');
    }
  };

  useEffect(() => {
    loadNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="clean-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white">System Map &amp; Subsystem Nodes</h3>
          <p className="text-xs text-slate-400">Operational subsystem node health &amp; p95 latency.</p>
        </div>
        <button
          type="button"
          onClick={loadNodes}
          className="p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-raised)] border border-transparent transition cursor-pointer"
          aria-label="Refresh node telemetry"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {state === 'loading' ? (
        <div className="clean-card p-8 text-center text-xs text-[var(--text-muted)]">
          Loading live node telemetry…
        </div>
      ) : state === 'error' ? (
        <div className="clean-card p-8 text-center text-xs space-y-2">
          <div className="text-rose-400">Could not reach the node telemetry endpoint.</div>
          <button type="button" onClick={loadNodes} className="text-[var(--accent)] hover:text-[var(--accent-hover)] underline cursor-pointer">Retry</button>
        </div>
      ) : nodes.length === 0 ? (
        <div className="clean-card p-8 text-center text-xs text-[var(--text-muted)]">
          No subsystem nodes reported yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {nodes.map((n) => (
            <div key={n.name} className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{n.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">Latency: {n.p95_latency_ms != null ? `${n.p95_latency_ms}ms` : 'N/A'}</div>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border shrink-0 ${
                  n.status === 'operational'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
                title={`Node status: ${n.status}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    n.status === 'operational' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                  aria-hidden="true"
                />
                {n.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'users', label: 'Users & Credits', Icon: Users },
  { key: 'system_map', label: 'System Map', Icon: Cpu },
  { key: 'agent', label: 'Admin Agent', Icon: Bot },
];

export default function AdminPanels({ userId = '' }) {
  const [activeTab, setActiveTab] = useState('users');

  /* 08-30 de-clunk: this card used to re-title the page ("Helpotron Platform
   * Admin Control Center") right below the app's own "Control Center" header —
   * three stacked near-identical headings (page → card → Master Admin Panel).
   * The page header already carries the identity, so this is now just the
   * section switch, one slim bar. */
  return (
    <div className="space-y-6">
      <div className="clean-card px-2 py-1.5 flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Control Center sections">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            aria-pressed={activeTab === key}
            role="tab"
            aria-selected={activeTab === key}
            className={`px-3.5 py-2 text-xs font-semibold rounded-[var(--radius-sm)] transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === key
                ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] border border-[rgba(139,92,246,0.35)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 border border-transparent'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <AdminAdvancedDashboard userId={userId} />}
      {activeTab === 'system_map' && <SystemMapPanel />}
      {activeTab === 'agent' && <AdminAgentChat />}
    </div>
  );
}
