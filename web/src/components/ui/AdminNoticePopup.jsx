/* ────────────────────────────────────────────────────────────────────────────
 * AdminNoticePopup.jsx — admin → user direct notices (operator 08-28).
 * Polls /api/user/admin-notices every 20s while signed in; when an unread
 * notice exists, pops a dismissible card top-right of the screen (z-index
 * above everything). Dismissing marks it read server-side so it never
 * re-appears. Multiple queued notices: oldest first, one at a time.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useRef, useState } from 'react';
import { Mail, X } from 'lucide-react';
import api from '../../api.js';

const POLL_MS = 20000;

export default function AdminNoticePopup({ isLoggedIn }) {
  const [queue, setQueue] = useState([]);
  const [visible, setVisible] = useState(null);
  const pollRef = useRef(null);
  const visibleRef = useRef(null); // mirrors `visible` for the poll closure

  const current = visible || queue[0] || null;

  useEffect(() => {
    if (!isLoggedIn) return;
    const poll = async () => {
      try {
        const res = await api.myAdminNotices();
        const unread = (res.unread || []);
        if (unread.length === 0) return;
        setQueue((prev) => {
          // Dedupe against BOTH the shown notice and the queue (ref, not the
          // closed-over state, so a poll that runs while a notice is on
          // screen cannot re-enqueue it and re-pop it after dismissal).
          const seen = new Set([...(visibleRef.current ? [visibleRef.current.id] : []), ...prev.map((n) => n.id)]);
          const fresh = unread.filter((n) => !seen.has(n.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch (e) {
        /* transient 401/network — next tick retries */
      }
    };
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  /* Promote the queue's head into `visible` when nothing is showing. */
  useEffect(() => {
    visibleRef.current = visible;
    if (!visible && queue.length > 0) {
      setVisible(queue[0]);
      setQueue((prev) => prev.slice(1));
    }
  }, [queue, visible]);

  const dismiss = async () => {
    const n = current;
    setVisible(null);
    if (n) {
      try { await api.markAdminNoticesRead([n.id]); } catch (e) { /* non-fatal */ }
    }
  };

  if (!current) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-[max(1rem,env(safe-area-inset-top,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[9999] w-[min(92vw,380px)] rounded-xl border border-[var(--border-hover)] bg-[var(--bg-surface-elevated)] shadow-2xl overflow-hidden"
    >
      <div className="h-1 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" />
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-subtle)] flex items-center justify-center">
            <Mail className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold tracking-wider text-[var(--accent)] uppercase">Message from Admin</div>
            <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{current.subject}</div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss message"
            className="flex h-10 w-10 -m-1.5 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words max-h-[min(40vh,10rem)] overflow-y-auto">
          {current.message}
        </p>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center min-h-10 px-4 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
