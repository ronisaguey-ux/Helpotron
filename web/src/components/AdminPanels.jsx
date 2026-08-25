import React, { useState } from 'react';
import { Users, Shield, Cpu, Box, Activity, DollarSign, Power, RotateCcw, AlertTriangle, HelpCircle } from 'lucide-react';

export function User360Panel({ user, isMockMode = false, onAction, onExplainWhy }) {
  const [tab, setTab] = useState('overview');
  const healthStatus = user?.health_score || (isMockMode ? 'Normal' : 'No Data');
  const errorCount = user?.error_count != null ? user.error_count : (isMockMode ? 0 : '--');
  
  return (
    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{user?.email || (isMockMode ? 'student@university.edu' : 'No user selected')}</h3>
          <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 mt-0.5">
            User Health: {healthStatus} • {errorCount} Errors
            <button onClick={() => onExplainWhy && onExplainWhy('user_health')} className="text-slate-500 hover:text-blue-400"><HelpCircle className="w-3 h-3" /></button>
          </span>
        </div>
        <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          {['overview', 'activity', 'usage', 'config', 'actions'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 text-xs rounded capitalize ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SystemMapPanel({ telemetryData, isMockMode = false, onInspectNode, onExplainWhy }) {
  // EXACTLY 3 modes: overview, live, investigate (no 7 layers)
  const [mode, setMode] = useState('overview');
  
  const nodes = telemetryData?.nodes || (isMockMode ? [
    { name: 'FastAPI Gateway', status: 'operational', p95_latency_ms: 12.4 },
    { name: 'SQLite WAL Database', status: 'operational', p95_latency_ms: 2.1 },
    { name: 'OpenRouter Dispatcher', status: 'operational', p95_latency_ms: 340.0 },
    { name: 'Storage Sandbox', status: 'operational', p95_latency_ms: 4.2 }
  ] : []);

  return (
    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            System Map & Subsystem Nodes 
            <button onClick={() => onExplainWhy && onExplainWhy('system_map')} className="text-slate-500 hover:text-blue-400"><HelpCircle className="w-3.5 h-3.5" /></button>
          </h3>
          <p className="text-xs text-slate-400">Operational node telemetry (Overview • Live • Investigate)</p>
        </div>
        <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          {['overview', 'live', 'investigate'].map(m => (
            <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 text-xs rounded capitalize ${mode === m ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>{m}</button>
          ))}
        </div>
      </div>
      {nodes.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">No live node telemetry connected. Enable Mock Preview Mode to view sample architecture.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {nodes.map(n => (
            <div key={n.name} onClick={() => onInspectNode && onInspectNode(n.name)} className="p-3 rounded-lg bg-slate-950 hover:bg-slate-850 border border-slate-800 cursor-pointer flex items-center justify-between transition-colors">
              <div>
                <div className="text-xs font-semibold text-white">{n.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Latency: {n.p95_latency_ms ? `${n.p95_latency_ms}ms` : 'N/A'}</div>
              </div>
              <span className="text-xs font-bold text-emerald-400">● {n.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default User360Panel;
