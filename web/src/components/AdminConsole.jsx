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
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-[var(--accent)]" /> Roni's Mission Control
          </h1>
          <p className="text-sm text-[var(--text-muted)]">Autonomous operating system • Solo-developer command center</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isMockMode && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
              MOCK PREVIEW MODE ON
            </span>
          )}
          <div className="flex gap-1 p-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-white/4">
            {ADMIN_DOMAINS.map(d => (
              <button key={d.id} onClick={() => setActiveDomain(d.id)} aria-pressed={activeDomain === d.id} className={`px-3 py-1.5 text-xs rounded-[var(--radius-sm)] font-medium transition cursor-pointer ${
                activeDomain === d.id
                  ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] border border-[rgba(139,92,246,0.35)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 border border-transparent'
              }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Pulse Telemetry Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-[var(--radius-lg)] text-xs">
          <div className="text-[var(--text-muted)] flex items-center justify-between">
            System Status
            <button onClick={() => onExplainWhy && onExplainWhy('system_status')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer" aria-label="Explain system status" title="Explain"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <span className={`inline-flex items-center gap-1.5 mt-2 rounded-full px-2.5 py-0.5 text-sm font-bold border ${
            sysStatus === 'Operational'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sysStatus === 'Operational' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} aria-hidden="true" />
            {sysStatus}
          </span>
        </div>
        <div className="glass-panel p-4 rounded-[var(--radius-lg)] text-xs">
          <div className="text-[var(--text-muted)] flex items-center justify-between">
            AI Dispatcher
            <button onClick={() => onExplainWhy && onExplainWhy('ai_dispatcher')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer" aria-label="Explain AI dispatcher" title="Explain"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <span className="inline-flex items-center gap-1.5 mt-2 rounded-full px-2.5 py-0.5 text-sm font-bold border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            {aiSuccess}
          </span>
        </div>
        <div className="glass-panel p-4 rounded-[var(--radius-lg)] text-xs">
          <div className="text-[var(--text-muted)] flex items-center justify-between">
            Active Users
            <button onClick={() => onExplainWhy && onExplainWhy('active_users')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer" aria-label="Explain active users count" title="Explain"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <div className="text-sm font-bold text-white mt-2">{userCount}</div>
        </div>
        <div className="glass-panel p-4 rounded-[var(--radius-lg)] text-xs">
          <div className="text-[var(--text-muted)] flex items-center justify-between">
            Daily AI Spend
            <button onClick={() => onExplainWhy && onExplainWhy('daily_spend')} className="text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer" aria-label="Explain daily AI spend" title="Explain"><HelpCircle className="w-3 h-3" /></button>
          </div>
          <div className="text-sm font-bold text-white mt-2">{spendUsd}</div>
        </div>
      </div>
    </div>
  );
}
export default AdminConsole;
