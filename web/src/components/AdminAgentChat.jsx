/* ────────────────────────────────────────────────────────────────────────────
 * AdminAgentChat.jsx — the dedicated admin "my agent" in the Control Center.
 * Talks to the SAME overlord endpoint as MyAgentView (/api/agent/chat) with
 * session_mode_override='auto': the backend detects the caller is an admin
 * (is_admin / RoniDev / admin) and resolves the intent server-side, so an
 * admin can ask for user lookups, credit adjustments, health checks and
 * platform operations in plain language. Every response + execution result
 * is real backend output — nothing hardcoded.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api.js';
import { formatErrorMessage } from '../lib/overlay.js';
import SectionCard from './SectionCard.jsx';

const SUGGESTIONS = [
  'Look up a user',
  'Check system health',
  'Adjust someone’s credits',
  'Show platform stats',
];

export default function AdminAgentChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function push(sender, text, extra = {}) {
    setMessages((prev) => [...prev, {
      id: Date.now() + Math.random(),
      sender,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...extra,
    }]);
  }

  async function send(text) {
    const query = (text || input).trim();
    if (!query || busy) return;
    push('user', query);
    setInput('');
    setBusy(true);
    try {
      const res = await api.agentChat({
        assignment_id: 0,
        text: query,
        session_mode_override: 'auto',
      });
      if (res?.status === 'permission_required') {
        const title = res.permission_request?.title?.replace(/^Permission Required: /, '') || 'This action';
        push('agent', `⚠️ ${title} needs explicit permission — the backend is holding it in the pending-permission queue. This shouldn't happen in auto mode for routine actions.`);
      } else {
        push('agent', res?.reply || '✅ Done.', res?.execution ? { execution: res.execution } : {});
      }
    } catch (e) {
      push('agent', `⚠️ The agent couldn't reach the backend right now. ${formatErrorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0" style={{ height: 'clamp(480px, calc(100dvh - 13rem), 720px)' }}>
      <SectionCard id="adminagent-chat" className="flex flex-col overflow-hidden h-full" header={
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)]">
          <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center shrink-0" style={{ backgroundImage: 'var(--accent-mix)' }}>
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              Admin Agent
              <span className="aurora-chip"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Auto-approve</span>
            </div>
            <div className="text-xs text-[var(--text-muted)]">Full platform control in plain language — every action is audited.</div>
          </div>
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>
      }>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center">
              <Bot className="w-6 h-6 text-[var(--text-muted)]" />
            </div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Anything admin, in plain language</div>
            <div className="text-[11px] text-[var(--text-muted)] max-w-xs leading-relaxed">
              Look up users, adjust credits, check health — executed with your admin identity.
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] min-w-0 space-y-1 ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
              {/* Shared aurora bubble language — matches MyAgentView exactly */}
              <div className={`max-w-[72ch] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words border ${
                m.sender === 'user'
                  ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.30)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}>
                {m.text}
              </div>
              {m.execution && (
                <div className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] transition"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.execution.status === 'failed' ? 'bg-rose-500' : 'bg-emerald-400'}`} />
                    <span className="truncate flex-1">executed: {m.execution.action || 'task'}</span>
                    {expanded === m.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {expanded === m.id && (
                    <div className="px-3 pb-2.5 text-[11px] font-mono text-[var(--text-muted)] leading-relaxed border-t border-[var(--border-subtle)] pt-2 space-y-1">
                      <div>action: {m.execution.action || '—'}</div>
                      <div>status: {m.execution.status ?? '—'}</div>
                      <div className="text-[var(--text-secondary)]">{m.execution.message || m.execution.result_text || '—'}</div>
                    </div>
                  )}
                </div>
              )}
              <div className={`text-[10px] text-[var(--text-muted)] font-mono px-1 ${m.sender === 'user' ? 'text-right' : ''}`}>{m.time}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-muted)] font-mono w-fit bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
            <span className="w-3 h-3 border-2 border-[var(--border-subtle)] border-t-[var(--accent-2)] rounded-full animate-spin" />
            Agent is working…
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-1.5 px-4 sm:px-5 pb-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => send(s)}
            className="aurora-chip hover:border-[rgba(139,92,246,0.55)] hover:bg-[rgba(139,92,246,0.24)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="flex gap-2 px-4 sm:px-5 pb-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask the admin agent… (e.g. “give a user 100 credits”)"
          className="clean-input flex-1 px-3.5 py-2.5 text-xs outline-none"
          aria-label="Message the admin agent"
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={busy || !input.trim()}
          className="px-3.5 min-h-[44px] flex items-center rounded-[var(--radius-md)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      </SectionCard>
    </div>
  );
}
