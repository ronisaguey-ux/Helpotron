/* ────────────────────────────────────────────────────────────────────────────
 * ActivityView.jsx — merged HOME event destination (Experience Rewrite, 08-22).
 * Two modes: the full event timeline (grouped by day, filterable by
 * category) and the notification stream (NotificationsView embedded).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react';
import { EVENTS, ADMIN_EVENTS, demoEnabled } from '../demoData.js';
import { Timeline, eventIcon, timeAgo, clockTime, EmptyState } from './ui/os.jsx';
import NotificationsView from './NotificationsView.jsx';

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

export default function ActivityView({ admin = false, initialMode = 'timeline' }) {
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
      <div className="flex gap-1">
        {[['timeline', '⚡ Timeline'], ['notifications', '🔔 Notifications']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition cursor-pointer border ${
              mode === k ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
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
              onClick={() => setFilter(c.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] transition cursor-pointer ${
                filter === c.key ? 'bg-white/12 text-white font-semibold' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
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
        {controls}
        <NotificationsView />
      </div>
    );
  }

  if (Object.keys(byDay).length === 0) {
    return (
      <div className="space-y-5">
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
      {controls}
      {Object.entries(byDay).map(([day, dayEvents]) => (
        <div key={day}>
          <div className="text-[10px] font-bold tracking-widest text-slate-500 mb-3">{day}</div>
          <div className="clean-card p-5">
            <Timeline
              items={dayEvents}
              renderIcon={(e) => {
                const { icon, cls } = eventIcon(e.type);
                return <span className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center text-[9px] ${cls}`}>{icon}</span>;
              }}
              renderTitle={(e) => (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-200 font-medium">{e.metadata?.title || e.type}</span>
                  <span className="text-[10px] font-mono text-slate-600">{clockTime(e.timestamp)}</span>
                  {e.status === 'open' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25">OPEN</span>}
                  {e.status === 'running' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/25 animate-pulse">RUNNING</span>}
                </div>
              )}
              renderMeta={(e) => (
                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{e.type.replace('.', ' · ')}</span>
                  {e.metadata?.course && <span className="text-slate-600">{e.metadata.course}</span>}
                  {e.metadata?.sources && <span className="text-slate-600">{e.metadata.sources} sources found</span>}
                  {e.metadata?.amount && <span className="font-mono text-slate-500">{e.metadata.amount > 0 ? '+' : ''}{e.metadata.amount}</span>}
                  {e.metadata?.user && <span className="text-slate-600">{e.metadata.user}</span>}
                  <span className="ml-auto text-slate-700">{timeAgo(e.timestamp)}</span>
                </div>
              )}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
