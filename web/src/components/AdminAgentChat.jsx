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
      push('agent', `⚠️ The agent couldn't reach the backend right now (${e.message}). In demo mode responses are simulated.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="clean-card p-5 flex flex-col" style={{ height: 'clamp(480px, calc(100vh - 13rem), 720px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-white/8">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white flex items-center gap-2">
            Admin Agent
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold text-emerald-300 uppercase tracking-wider">Auto-approve</span>
          </div>
          <div className="text-[10px] text-slate-500">Full platform control in plain language — every action is audited.</div>
        </div>
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
              <Bot className="w-5 h-5 text-rose-400" />
            </div>
            <div className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
              Ask for anything admin — <b className="text-slate-300">look up users, adjust credits, check system health, run platform operations</b>.
              The agent resolves it and executes with your admin identity.
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] min-w-0 space-y-1 ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
                m.sender === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-slate-950/60 border border-white/8 text-slate-200 rounded-bl-md'
              }`}>
                {m.text}
              </div>
              {m.execution && (
                <div className="w-full rounded-xl border border-white/8 bg-slate-950/50">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-mono text-slate-400 cursor-pointer hover:text-white transition"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.execution.status === 'failed' ? 'bg-rose-500' : 'bg-emerald-400'}`} />
                    <span className="truncate flex-1">executed: {m.execution.action || 'task'}</span>
                    {expanded === m.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {expanded === m.id && (
                    <div className="px-3 pb-2.5 text-[10px] font-mono text-slate-500 leading-relaxed border-t border-white/6 pt-2 space-y-1">
                      <div>action: {m.execution.action || '—'}</div>
                      <div>status: {m.execution.status ?? '—'}</div>
                      <div className="text-slate-400">{m.execution.message || m.execution.result_text || '—'}</div>
                    </div>
                  )}
                </div>
              )}
              <div className={`text-[9px] text-slate-600 font-mono px-1 ${m.sender === 'user' ? 'text-right' : ''}`}>{m.time}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-slate-500 font-mono">
            <span className="w-3 h-3 border-2 border-slate-600 border-t-cyan-400 rounded-full animate-spin" />
            Agent is working…
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-1.5 pb-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => send(s)}
            className="px-2.5 py-1 rounded-lg bg-white/4 border border-white/8 text-[10px] text-slate-300 hover:bg-blue-600 hover:text-white hover:border-blue-500 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask the admin agent… (e.g. “give RoniDev 100 credits”)"
          className="clean-input flex-1 px-3.5 py-2.5 text-[12px] outline-none"
          aria-label="Message the admin agent"
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={busy || !input.trim()}
          className="px-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
