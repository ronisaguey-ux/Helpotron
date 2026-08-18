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

export default function MessageAdminView({ userId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await api.getMyAdminMessages();
      if (res && res.messages) {
        setMessages(res.messages);
      }
    } catch (e) {
      console.warn('Failed to load admin messages:', e);
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
          <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Direct Channel to Admin</h1>
            <p className="text-xs text-slate-400">
              Send private inquiries, bug reports, feature suggestions, or custom parser feedback directly to Platform Admin.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchMessages}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ─── Compose Message Form ────────────────────────────────────────── */}
      <div className="clean-card p-6 rounded-3xl bg-slate-950/60 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-400" />
            Compose Message to Admin
          </h2>
          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Direct Encrypted Dispatch
          </span>
        </div>

        <form onSubmit={handleSendMessage} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-slate-400 block mb-1">Subject Header</label>
              <input
                type="text"
                placeholder="e.g. Urgent LMS scraping format inquiry / Bug report"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Inquiry Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
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
            <label className="text-slate-400 block mb-1">Message Content</label>
            <textarea
              rows={4}
              placeholder="Describe your inquiry, request, or issue with as much detail as possible..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-[11px] text-slate-500 font-mono">
              Sent directly to Admin inbox · Expected response: 24–48h
            </div>
            <button
              type="submit"
              disabled={sending || !messageText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-semibold transition cursor-pointer shadow-md shadow-blue-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Dispatching…' : 'Send Message to Admin'}</span>
            </button>
          </div>
        </form>

        {statusNotice && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-mono">
            {statusNotice}
          </div>
        )}
      </div>

      {/* ─── Conversation History Feed ──────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            Previous Messages & Admin Replies ({messages.length})
          </h2>
        </div>

        {loading ? (
          <div className="clean-card p-12 text-center text-xs text-blue-400 font-mono flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading messages with Admin…
          </div>
        ) : messages.length === 0 ? (
          <div className="clean-card rounded-3xl p-12 text-center border-dashed border-white/10 space-y-2">
            <MessageSquare className="w-8 h-8 text-slate-500 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No previous messages</h3>
            <p className="text-xs text-slate-500">
              When you send a message to Admin, conversation logs and replies will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className="clean-card p-5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-3 text-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold mr-2">
                      {m.category}
                    </span>
                    <span className="font-semibold text-white text-sm">{m.subject}</span>
                  </div>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      m.status === 'replied'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {m.status === 'replied' ? '💬 Replied by Admin' : '📨 Queued for Review'}
                  </span>
                </div>

                {/* User Message */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-white/5 text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {m.message}
                </div>

                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>Sent {m.created_at}</span>
                </div>

                {/* Admin Reply Box */}
                {m.admin_reply && (
                  <div className="mt-3 p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-blue-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-blue-400" />
                        Admin Reply
                      </span>
                      {m.replied_at && <span className="text-[10px] text-slate-400 font-mono">{m.replied_at}</span>}
                    </div>
                    <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{m.admin_reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
