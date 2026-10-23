import React, { useState, useEffect } from 'react';
import api from '../api.js';
import {
  MessageSquare,
  Send,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  User,
  Shield,
  MessageCircle,
} from 'lucide-react';
import SectionCard from './SectionCard.jsx';

export default function MessageAdminView({ userId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');
  const [loadError, setLoadError] = useState('');

  const fetchMessages = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.getMyAdminMessages();
      if (res && res.messages) {
        setMessages(res.messages);
      }
    } catch (e) {
      console.warn('Failed to load admin messages:', e);
      setLoadError("Couldn't load your messages with Admin. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [userId]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setSending(true);
    setStatusNotice('');
    try {
      const res = await api.sendMessageToAdmin({
        subject: subject.trim() || 'Direct Inquiry to Admin',
        category,
        message: messageText.trim(),
      });
      setStatusNotice(res.message || '✅ Message delivered directly to Admin.');
      setMessageText('');
      setSubject('');
      await fetchMessages();
      setTimeout(() => setStatusNotice(''), 5000);
    } catch (err) {
      console.error('Send error:', err);
      setStatusNotice('❌ Failed delivering message to admin. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] flex items-center justify-center text-[var(--accent)]">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Direct Channel to Admin</h1>
            <p className="text-xs text-[var(--text-muted)]">
              Send private inquiries, bug reports, feature suggestions, or custom parser feedback directly to Platform Admin.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchMessages}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs bg-white/5 hover:bg-[var(--color-surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--accent)]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ─── Compose Message Form ────────────────────────────────────────── */}
      <SectionCard id="msgadmin-compose" padding="p-6" className="space-y-4" header={
        <div className="flex items-center justify-between w-full">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-[var(--accent)]" />
            Compose Message to Admin
          </h2>
          <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Direct Encrypted Dispatch
          </span>
        </div>
      }>

        <form onSubmit={handleSendMessage} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="msgadmin-subject" className="text-[var(--text-secondary)] block mb-1">Subject Header</label>
              <input
                id="msgadmin-subject"
                type="text"
                placeholder="e.g. Urgent LMS scraping format inquiry / Bug report"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="clean-input w-full px-3.5 py-2 text-white outline-none"
              />
            </div>
            <div>
              <label htmlFor="msgadmin-category" className="text-[var(--text-secondary)] block mb-1">Inquiry Category</label>
              <select
                id="msgadmin-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="clean-input w-full px-3 py-2 text-white outline-none"
              >
                <option value="general">General Question</option>
                <option value="bug_report">Bug / Error Report</option>
                <option value="feature_request">Feature Suggestion</option>
                <option value="academic">Academic Calibration</option>
                <option value="billing">Credits & Billing</option>
                <option value="datalake">Data Lake Feedback</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="msgadmin-message" className="text-[var(--text-secondary)] block mb-1">Message Content</label>
            <textarea
              id="msgadmin-message"
              rows={4}
              placeholder="Describe your inquiry, request, or issue with as much detail as possible..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="clean-input w-full p-3 text-white outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
            <div className="text-xs text-[var(--text-muted)] font-mono">
              Sent directly to Admin inbox · Expected response: 24–48h
            </div>
            <button
              type="submit"
              disabled={sending || !messageText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white font-semibold transition cursor-pointer shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_4px_18px_rgba(139,92,246,0.30)]"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Dispatching…' : 'Send'}</span>
            </button>
          </div>
        </form>

        {statusNotice && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-[var(--radius-md)] text-xs text-emerald-300 font-mono">
            {statusNotice}
          </div>
        )}
      </SectionCard>

      {/* ─── Conversation History Feed ──────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[var(--accent)]" />
            Previous Messages & Admin Replies ({messages.length})
          </h2>
        </div>

        {loading ? (
          <div className="clean-card p-12 text-center text-xs text-[var(--accent)] font-mono flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading messages with Admin…
          </div>
        ) : loadError ? (
          <div role="alert" className="clean-card p-6 text-xs text-red-400 flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <button type="button" onClick={fetchMessages} className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer">
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <SectionCard id="msgadmin-empty" padding="p-10" className="rounded-3xl text-center border-dashed border-white/10 space-y-2" title="No previous messages">
            <MessageSquare className="w-9 h-9 text-[var(--text-muted)] mx-auto" />
            <p className="text-xs text-[var(--text-muted)]">
              When you send a message to Admin, conversation logs and replies will appear here.
            </p>
          </SectionCard>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <SectionCard
                key={m.id}
                id={`msgadmin-message-${m.id}`}
                className="space-y-3 text-xs"
                header={
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] text-[var(--accent)] text-[10px] font-semibold mr-2">
                        {m.category}
                      </span>
                      <span className="font-semibold text-white text-sm">{m.subject}</span>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border shrink-0 ${
                        m.status === 'replied'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'replied' ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden="true" />
                      {m.status === 'replied' ? 'Replied by Admin' : 'Queued for Review'}
                    </span>
                  </div>
                }
              >

                {/* User Message */}
                <div className="p-3.5 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                  {m.message}
                </div>

                <div className="text-[10px] text-[var(--text-muted)] font-mono flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>Sent {m.created_at}</span>
                </div>

                {/* Admin Reply Box */}
                {m.admin_reply && (
                  <div className="mt-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.28)] space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[var(--accent)] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        Admin Reply
                      </span>
                      {m.replied_at && <span className="text-[10px] text-[var(--text-muted)] font-mono">{m.replied_at}</span>}
                    </div>
                    <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{m.admin_reply}</p>
                  </div>
                )}
              </SectionCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
