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
    <div className="panel space-y-4">
      <div className="panel-head flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="panel-head__title">System map &amp; subsystem nodes</span>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Operational subsystem node health &amp; p95 latency.</p>
        </div>
        <button
          type="button"
          onClick={loadNodes}
          className="p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] border border-transparent transition cursor-pointer"
          aria-label="Refresh node telemetry"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="panel-body">
        {state === 'loading' ? (
          <div className="empty-state">
            <span className="empty-state__icon"><RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /></span>
            <p>Loading live node telemetry…</p>
          </div>
        ) : state === 'error' ? (
          <div className="group text-center p-6 space-y-2">
            <div className="text-rose-400 text-xs">Could not reach the node telemetry endpoint.</div>
            <button type="button" onClick={loadNodes} className="text-[var(--accent)] hover:text-[var(--accent-hover)] underline text-xs cursor-pointer">Retry</button>
          </div>
        ) : nodes.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon"><Cpu className="w-4 h-4" aria-hidden="true" /></span>
            <p>No subsystem nodes reported yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {nodes.map((n) => (
              <div key={n.name} className="group p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{n.name}</div>
                  <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">Latency: {n.p95_latency_ms != null ? `${n.p95_latency_ms}ms` : 'N/A'}</div>
                </div>
                <span
                  className={`chip ${
                    n.status === 'operational'
                      ? 'chip-emerald'
                      : 'chip-amber'
                  } shrink-0`}
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
    </div>
  );
}

const TABS = [
  { key: 'users', label: 'Users & Operations', Icon: Users },
  { key: 'system_map', label: 'System Map', Icon: Cpu },
  { key: 'agent', label: 'Admin Agent', Icon: Bot },
];

export default function AdminPanels({ userId = '' }) {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="space-y-6">
      <div className="os-scroll overflow-x-auto">
      <div className="segmented w-max" role="tablist" aria-label="Control Center sections">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            role="tab"
            aria-selected={activeTab === key}
            className="seg-item"
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      </div>

      {activeTab === 'users' && <AdminAdvancedDashboard userId={userId} />}
      {activeTab === 'system_map' && <SystemMapPanel />}
      {activeTab === 'agent' && <AdminAgentChat />}
    </div>
  );
}
