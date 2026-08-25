import React, { useState } from 'react';
import { Shield, Activity, AlertCircle, Users, Cpu, DollarSign, Terminal, ArrowRight, RotateCcw, HelpCircle } from 'lucide-react';

export const ADMIN_DOMAINS = [
  { id: 'command', label: 'Command' },
  { id: 'people', label: 'People' },
  { id: 'ai', label: 'AI & Agents' },
  { id: 'product', label: 'Product' },
  { id: 'system', label: 'System' },
  { id: 'finance', label: 'Finance' }
];

export function AdminConsole({ telemetry, isMockMode = false, onExecuteOperatorAction, onQueryAdminAgent, onExplainWhy }) {
  const [activeDomain, setActiveDomain] = useState('command');
  const [agentQuery, setAgentQuery] = useState('');

  // Zero-fake-data invariant: when mock mode is off, display real data or explicit '--' / 'Unavailable'
  const sysStatus = telemetry?.system_status || (isMockMode ? 'Operational' : 'Unavailable');
  const aiSuccess = telemetry?.ai_success_rate ? `${telemetry.ai_success_rate}%` : (isMockMode ? '99.4%' : '--');
  const userCount = telemetry?.active_users_count != null ? telemetry.active_users_count : (isMockMode ? 1284 : '--');
  const spendUsd = telemetry?.daily_spend_usd != null ? `$${telemetry.daily_spend_usd.toFixed(2)}` : (isMockMode ? '$18.42' : '--');

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" /> Roni's Mission Control
          </h1>
          <p className="text-sm text-slate-400">Autonomous operating system • Solo-developer command center</p>
        </div>
        <div className="flex items-center gap-3">
          {isMockMode && <span className="text-[11px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">MOCK PREVIEW MODE ON</span>}
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {ADMIN_DOMAINS.map(d => (
              <button key={d.id} onClick={() => setActiveDomain(d.id)} className={`px-3 py-1 text-xs rounded font-medium ${activeDomain === d.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Pulse Telemetry Strip */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <div className="text-slate-400 flex items-center justify-between">
            System Status 
            <button onClick={() => onExplainWhy && onExplainWhy('system_status')} className="text-slate-500 hover:text-blue-400"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <div className={`text-sm font-bold mt-1 ${sysStatus === 'Operational' ? 'text-emerald-400' : 'text-slate-300'}`}>● {sysStatus}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <div className="text-slate-400 flex items-center justify-between">
            AI Dispatcher 
            <button onClick={() => onExplainWhy && onExplainWhy('ai_dispatcher')} className="text-slate-500 hover:text-blue-400"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <div className="text-sm font-bold text-emerald-400 mt-1">● {aiSuccess}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <div className="text-slate-400 flex items-center justify-between">
            Active Users 
            <button onClick={() => onExplainWhy && onExplainWhy('active_users')} className="text-slate-500 hover:text-blue-400"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <div className="text-sm font-bold text-white mt-1">{userCount}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <div className="text-slate-400 flex items-center justify-between">
            Daily AI Spend 
            <button onClick={() => onExplainWhy && onExplainWhy('daily_spend')} className="text-slate-500 hover:text-blue-400"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <div className="text-sm font-bold text-white mt-1">{spendUsd}</div>
        </div>
      </div>
    </div>
  );
}
export default AdminConsole;
