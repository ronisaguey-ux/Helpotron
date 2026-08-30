import React, { useState } from 'react';
import { Bot, Sparkles, Send, Paperclip, Undo2, Shield, ShieldCheck, Flame, History, FileText, Settings, Play } from 'lucide-react';

const MODE_META = {
  manual: { label: 'Manual', icon: Shield },
  auto: { label: 'Auto-Pilot', icon: ShieldCheck },
  yolo: { label: 'YOLO', icon: Flame },
};

export const AIWorkspace = ({ user, activeScope, onExecuteAction, onRollbackAction }) => {
  const [mode, setMode] = useState('auto');
  const [actionLedger, setActionLedger] = useState([]);
  const [activeArtifacts, setActiveArtifacts] = useState([]);

  return (
    <div className="h-full flex flex-col max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Agent Header & Mode Controller */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.30)] flex items-center justify-center text-[var(--accent)]">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-aurora">My Agent</h2>
              <span className="aurora-chip"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ready</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Universal Natural Language Control Plane for Helpotron</p>
          </div>
        </div>

        {/* Execution Mode Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-1 rounded-[var(--radius-md)]">
          {Object.entries(MODE_META).map(([k, m]) => {
            const Icon = m.icon;
            return (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`text-xs px-2.5 py-1 rounded-[var(--radius-sm)] flex items-center gap-1.5 transition-colors border ${
                  mode === k
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[rgba(139,92,246,0.35)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Ledger & Undo Ribbon */}
      {actionLedger.length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <History className="h-4 w-4 text-[var(--accent)]" />
            <span className="font-semibold text-[var(--text-primary)]">Latest Agent Action:</span>
            <span className="text-[var(--text-muted)]">{actionLedger[0].description}</span>
          </div>
          <button
            onClick={() => onRollbackAction(actionLedger[0].id)}
            className="flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300 hover:underline"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo Action
          </button>
        </div>
      )}
    </div>
  );
};
export default AIWorkspace;
