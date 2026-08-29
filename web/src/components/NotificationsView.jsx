/* ────────────────────────────────────────────────────────────────────────────
 * NotificationsView.jsx — the notification system: stream, filters by
 * category, mark-read persistence, and delivery-channel attribution.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { NOTIFICATIONS, demoEnabled } from '../demoData.js';
import { Badge, Tabs, EmptyState, timeAgo } from './ui/os.jsx';

const CATEGORY_LABELS = {
  assignments: { icon: '📝', color: 'blue' },
  automation: { icon: '⚙️', color: 'purple' },
  credits: { icon: '🪙', color: 'amber' },
  study: { icon: '🎯', color: 'cyan' },
};

const READ_KEY = 'helpotron_notifications_read';

function loadRead() {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));
  } catch (e) {
    return new Set();
  }
}

export default function NotificationsView() {
  const [filter, setFilter] = useState('all');
  const [read, setRead] = useState(loadRead);
  const demo = demoEnabled();
  const items = demo ? NOTIFICATIONS : [];

  const markRead = (id) => {
    const next = new Set(read);
    next.add(id);
    setRead(next);
    try { localStorage.setItem(READ_KEY, JSON.stringify([...next])); } catch (e) { /* ignore */ }
  };

  const markAllRead = () => {
    const next = new Set(items.map((n) => n.id));
    setRead(next);
    try { localStorage.setItem(READ_KEY, JSON.stringify([...next])); } catch (e) { /* ignore */ }
  };

  const filtered = filter === 'all' ? items : items.filter((n) => n.category === filter);
  const unread = items.filter((n) => !read.has(n.id)).length;

  return (
    <div className="space-y-4">
      <div className="clean-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs
          tabs={[
            { key: 'all', label: `All (${items.length})` },
            ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ key: k, label: `${v.icon} ${k[0].toUpperCase() + k.slice(1)}` })),
          ]}
          active={filter}
          onChange={setFilter}
        />
        <button
          type="button"
          onClick={markAllRead}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer"
        >
          <CheckCheck className="w-3.5 h-3.5" /> Mark all read
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🔕" title="Nothing here" body="No notifications in this category. The system keeps you quiet until something matters." />
      ) : (
        <div className="clean-card p-0 overflow-hidden">
          {filtered.map((n) => {
            const cat = CATEGORY_LABELS[n.category] || { icon: '✦', color: 'slate' };
            const isRead = read.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n.id)}
                className={`w-full flex items-start gap-4 px-5 py-4 text-left border-b border-white/5 last:border-0 transition hover:bg-white/3 cursor-pointer ${
                  isRead ? 'opacity-60' : ''
                }`}
              >
                <span className={`mt-0.5 w-9 h-9 rounded-xl border flex items-center justify-center text-sm shrink-0 ${
                  cat.color === 'blue' ? 'bg-blue-500/10 border-blue-500/25'
                    : cat.color === 'purple' ? 'bg-purple-500/10 border-purple-500/25'
                    : cat.color === 'amber' ? 'bg-amber-500/10 border-amber-500/25'
                    : cat.color === 'cyan' ? 'bg-cyan-500/10 border-cyan-500/25'
                    : 'bg-white/5 border-white/10'
                }`}>
                  {cat.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs ${isRead ? 'text-slate-400' : 'text-white font-semibold'}`}>{n.title}</span>
                    {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
                    <Badge color="slate" className="ml-auto">{n.channel}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{n.body}</p>
                  <div className="text-[10px] text-slate-600 mt-1.5">{timeAgo(n.timestamp)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {unread > 0 && (
        <div className="text-[11px] text-slate-500 px-1">
          {unread} unread · preferences live in <span className="text-[var(--accent)]">Settings → Notifications</span>
        </div>
      )}
    </div>
  );
}
