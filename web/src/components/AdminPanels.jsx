import React, { useEffect, useState } from 'react';
import { Users, Shield, Cpu, Bot, RefreshCw } from 'lucide-react';
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
    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white">System Map &amp; Subsystem Nodes</h3>
          <p className="text-xs text-slate-400">Operational subsystem node health &amp; p95 latency.</p>
        </div>
        <button
          type="button"
          onClick={loadNodes}
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition cursor-pointer"
          aria-label="Refresh node telemetry"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {state === 'loading' ? (
        <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">Loading live node telemetry…</div>
      ) : state === 'error' ? (
        <div className="p-6 text-center text-xs text-rose-400 border border-dashed border-rose-500/30 rounded-lg">
          Could not reach the node telemetry endpoint. <button type="button" onClick={loadNodes} className="underline hover:text-rose-300 cursor-pointer">Retry</button>
        </div>
      ) : nodes.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">No subsystem nodes reported.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {nodes.map((n) => (
            <div key={n.name} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">{n.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Latency: {n.p95_latency_ms != null ? `${n.p95_latency_ms}ms` : 'N/A'}</div>
              </div>
              <span className={`text-xs font-bold ${n.status === 'operational' ? 'text-emerald-400' : 'text-amber-400'}`}>● {n.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'users', label: 'Users & Credits Management', Icon: Users },
  { key: 'system_map', label: 'System Map & Nodes', Icon: Cpu },
  { key: 'agent', label: 'Admin Agent', Icon: Bot },
];

export default function AdminPanels({ userId = '' }) {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap bg-slate-900/60 p-3 rounded-2xl border border-white/10">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Helpotron Platform Admin Control Center
          </h2>
          <p className="text-[11px] text-slate-400">
            Manage user subscription plans, grant credits, inspect live node telemetry, and drive the platform with the admin agent.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/10">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer inline-flex items-center gap-1.5 ${
                activeTab === key ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
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
