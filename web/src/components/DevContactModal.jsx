import React, { useState, useEffect, useRef } from 'react';
import { X, MessageCircle, Send, Loader2, Paperclip } from 'lucide-react';
import { api } from '../api.js';

export default function DevContactModal() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef(null);
  const scrollRef = useRef(null);

  const loadHistory = async () => {
    try {
      const res = await api.getMyAdminMessages();
      setHistory(res?.messages || []);
      setLoaded(true);
    } catch (e) { /* not critical */ }
  };

  useEffect(() => {
    if (open && !loaded) loadHistory();
  }, [open, loaded]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, open]);

  const send = async () => {
    if (!message.trim() && !attachment) { setToast('Write a message first'); return; }
    setSending(true);
    try {
      await api.sendMessageToAdmin({ subject: 'Chat with the developer', category, message: message.trim() || '(attachment only)' }, attachment);
      setToast('✅ Delivered — the developer replies here.');
      setMessage('');
      setAttachment(null);
      loadHistory();
    } catch (e) {
      setToast(`⚠️ Could not send: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Message the developer"
        title="Message the developer"
        className="fixed bottom-16 md:bottom-6 left-4 z-40 w-11 h-11 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white glow-accent flex items-center justify-center transition cursor-pointer"
      >
        <MessageCircle className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full md:max-w-md surface-glass-strong rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[var(--accent)]" />
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Talk to the developer</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-slate-500 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 px-5 py-4 space-y-3 overflow-y-auto min-h-[220px] max-h-[46vh]">
              {!loaded && <div className="text-center text-[11px] text-slate-500 py-8">Loading your conversation…</div>}
              {loaded && history.length === 0 && (
                <div className="text-center text-[11px] text-slate-500 py-8">
                  No messages yet. Say hi — the developer replies here in this chat.
                </div>
              )}
              {history.map((m) => {
                const cat = { general: 'General', bug: 'Bug', access: 'Access', billing: 'Payments' }[m.category] || m.category;
                return (
                  <div key={m.id}>
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--accent)] opacity-90 px-3.5 py-2 text-[12px] text-white whitespace-pre-wrap">
                        {m.message}
                        <div className="text-[9px] text-white/80 mt-1 flex items-center gap-1.5">
                          <span>{cat}</span>
                          <span>· {(m.created_at || '').slice(5, 16)}</span>
                        </div>
                      </div>
                    </div>
                    {m.admin_reply && (
                      <div className="flex justify-start mt-1.5">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] px-3.5 py-2 text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap">
                          {m.admin_reply}
                          <div className="text-[9px] text-emerald-400/80 mt-1">↳ developer</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {toast && <div className="px-5 text-[11px] text-[var(--accent-2)] pb-1">{toast}</div>}

            <div className="border-t border-[var(--border-subtle)] px-4 py-3 flex items-center gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Message topic"
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-2 py-2 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                title="Topic"
              >
                <option value="general">General</option>
                <option value="bug">Bug</option>
                <option value="access">Access / tokens</option>
                <option value="billing">Payments</option>
              </select>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Type a message…"
                aria-label="Type a message to the developer"
                className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-[var(--accent)] outline-none"
              />
              {attachment && (
                <span className="text-[10px] text-emerald-300 max-w-[80px] truncate" title={attachment.name}>📎 {attachment.name}</span>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach a file"
                title="Attach a file"
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-[var(--border-subtle)] text-slate-300 flex items-center justify-center transition cursor-pointer"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="w-9 h-9 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white flex items-center justify-center transition cursor-pointer"
                aria-label="Send"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
