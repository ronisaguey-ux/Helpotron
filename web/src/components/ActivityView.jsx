/* ────────────────────────────────────────────────────────────────────────────
 * ActivityView.jsx — merged HOME event destination (Experience Rewrite, 08-22).
 * Two modes: the full event timeline (grouped by day, filterable by
 * category) and the notification stream (NotificationsView embedded).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react';
import { EVENTS, ADMIN_EVENTS, demoEnabled } from '../demoData.js';
import { Timeline, eventIcon, timeAgo, clockTime, EmptyState } from './ui/os.jsx';
import NotificationsView from './NotificationsView.jsx';

/* Aurora semantic chip tints (scoped): .aurora-chip keeps its glass pill
   base from index.css; these modifiers recolor it for status semantics. */
const AURORA_CHIP_TINTS = `
.aurora-chip.info  { background: rgba(34,211,238,0.13); border-color: rgba(34,211,238,0.30); color: #67e8f9; }
.aurora-chip.warn  { background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.32); color: #fcd34d; }
`;

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'assignment', label: 'Assignments' },
  { key: 'study', label: 'Study' },
  { key: 'credit', label: 'Credits' },
  { key: 'automation', label: 'Automation' },
  { key: 'system', label: 'System' },
];

/* Event type prefix → category */
function catMatch(e, filter) {
  if (filter === 'all') return true;
  if (filter === 'assignment') return e.type.startsWith('assignment.');
  if (filter === 'study') return e.type.startsWith('study.');
  if (filter === 'credit') return e.type.startsWith('credit.') || e.type.startsWith('payment.');
  if (filter === 'automation') return e.type.startsWith('automation.') || e.type.startsWith('ai.');
  return e.type.startsWith('user.') || e.type.startsWith('material.');
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startToday - start) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' }).toUpperCase();
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
}

export default function ActivityView({ admin = false, initialMode = 'timeline', onNavigate = null, user = null }) {
  const [mode, setMode] = useState(initialMode === 'notifications' ? 'notifications' : 'timeline');
  const [filter, setFilter] = useState('all');
  const demo = demoEnabled();
  const events = demo ? (admin ? ADMIN_EVENTS : EVENTS) : [];

  const byDay = useMemo(() => {
    const groups = {};
    for (const e of [...events].filter((ev) => catMatch(ev, filter)).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))) {
      const label = dayLabel(e.timestamp);
      (groups[label] = groups[label] || []).push(e);
    }
    return groups;
  }, [events, filter]);

  /* Mode + category controls: single clean-card toolbar */
  const controls = (
    <div className="clean-card p-3 flex flex-wrap items-center gap-2">
      <div className="flex gap-1 p-1 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
        {[['timeline', '⚡ Timeline'], ['notifications', '🔔 Notifications']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={mode === k}
            onClick={() => setMode(k)}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-medium transition cursor-pointer ${
              mode === k ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'timeline' && (
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={filter === c.key}
              onClick={() => setFilter(c.key)}
              className={`rounded-full px-3 py-1 text-[11px] transition cursor-pointer ${
                filter === c.key
                  ? 'aurora-chip px-3 py-1'
                  : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (mode === 'notifications') {
    return (
      <div className="space-y-5">
        <style>{AURORA_CHIP_TINTS}</style>
        {controls}
        <NotificationsView onNavigate={onNavigate} user={user} />
      </div>
    );
  }

  if (Object.keys(byDay).length === 0) {
    return (
      <div className="space-y-5">
        <style>{AURORA_CHIP_TINTS}</style>
        {controls}
        <EmptyState
          title={events.length === 0 ? 'No activity yet' : 'Nothing in this category'}
          body={events.length === 0
            ? 'Events from your assignments, automations, credits and study sessions will show up here.'
            : 'No events match this filter — try another category.'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{AURORA_CHIP_TINTS}</style>
      {controls}
      {Object.entries(byDay).map(([day, dayEvents]) => (
        <div key={day}>
          <div className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] mb-3">{day}</div>
          <div className="clean-card p-5">
            <Timeline
              items={dayEvents}
              renderIcon={(e) => {
                const { icon, cls } = eventIcon(e.type);
                return <span className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center text-[9px] ${cls}`}>{icon}</span>;
              }}
              renderTitle={(e) => (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--text-secondary)] font-medium">{e.metadata?.title || e.type}</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{clockTime(e.timestamp)}</span>
                  {e.status === 'open' && <span className="aurora-chip warn">OPEN</span>}
                  {e.status === 'running' && <span className="aurora-chip info animate-pulse">RUNNING</span>}
                </div>
              )}
              renderMeta={(e) => (
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{e.type.replace('.', ' · ')}</span>
                  {e.metadata?.course && <span className="opacity-70">{e.metadata.course}</span>}
                  {e.metadata?.sources && <span className="opacity-70">{e.metadata.sources} sources found</span>}
                  {e.metadata?.amount && <span className="font-mono text-[var(--text-secondary)]">{e.metadata.amount > 0 ? '+' : ''}{e.metadata.amount}</span>}
                  {e.metadata?.user && <span className="opacity-70">{e.metadata.user}</span>}
                  <span className="ml-auto opacity-60">{timeAgo(e.timestamp)}</span>
                </div>
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
