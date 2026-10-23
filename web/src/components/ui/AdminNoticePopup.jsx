/* ────────────────────────────────────────────────────────────────────────────
 * AdminNoticePopup.jsx — admin → user direct notices (operator 08-28).
 * Polls /api/user/admin-notices every 20s while signed in; each notice pops
 * ONCE per user (09-01, owner report — the same broadcast kept re-showing
 * across reloads/remounts because read state was only persisted on manual
 * dismiss). The moment a notice is shown its id is POSTed to the existing
 * read endpoint (admin_notice_reads row / read_at stamp), so a reload or a
 * later poll can never re-show it; the manual X / "Got it" dismiss stays for
 * UX and re-posts as a failsafe. Multiple queued notices: oldest first, one
 * at a time, single popup instance.
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
  const shownRef = useRef(new Set()); // ids POSTed read on show/dismiss (09-01): a
  // failed POST can't make this mount re-show a dismissed / displayed notice

  const current = visible || queue[0] || null;

  useEffect(() => {
    if (!isLoggedIn) return;
    const poll = async () => {
      try {
        const res = await api.myAdminNotices();
        const unread = (res.unread || []);
        if (unread.length === 0) return;
        setQueue((prev) => {
          // Dedupe against shown/dismissed ids, the notice on screen AND the
          // queue (refs, not the closed-over state, so a poll that runs while
          // a notice is on screen cannot re-enqueue it and re-pop it after
          // dismissal).
          const seen = new Set([
            ...shownRef.current,
            ...(visibleRef.current ? [visibleRef.current.id] : []),
            ...prev.map((n) => n.id),
          ]);
          const fresh = unread.filter((n) => !seen.has(n.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch (e) {
        /* Dead/expired session: stop polling so a signed-out tab doesn't spam
         * 401s into the access log every 20s (08-30, burst-detector noise).
         * A fresh sign-in remounts this component and restarts the poll. */
        if (e && e.status === 401) {
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        /* transient network — next tick retries */
      }
    };
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  /* Promote the queue's head into `visible` when nothing is showing, and
   * persist read state the instant it is shown (09-01): the server-side
   * per-user read state is the guarantee that survives a reload, so the same
   * notice is never re-shown — dismiss already POSTs too (idempotent). */
  useEffect(() => {
    visibleRef.current = visible;
    if (!visible && queue.length > 0) {
      const next = queue[0];
      setVisible(next);
      setQueue((prev) => prev.slice(1));
      shownRef.current.add(next.id);
      api.markAdminNoticesRead([next.id]).catch(() => {});
    }
  }, [queue, visible]);

  const dismiss = async () => {
    const n = current;
    setVisible(null);
    if (n) {
      shownRef.current.add(n.id);
      try { await api.markAdminNoticesRead([n.id]); } catch (e) { /* non-fatal */ }
    }
  };

  useEffect(() => {
    if (!current) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        dismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current]);

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
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
