/* ────────────────────────────────────────────────────────────────────────────
 * ActivityView.jsx — full event timeline (the event engine made visible).
 * Groups events by day; every major entity surfaces here.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useMemo } from 'react';
import { EVENTS, ADMIN_EVENTS, demoEnabled } from '../demoData.js';
import { Timeline, eventIcon, timeAgo, clockTime, EmptyState } from './ui/os.jsx';

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

export default function ActivityView({ admin = false }) {
  const demo = demoEnabled();
  const events = demo ? (admin ? ADMIN_EVENTS : EVENTS) : [];

  const byDay = useMemo(() => {
    const groups = {};
    for (const e of [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))) {
      const label = dayLabel(e.timestamp);
      (groups[label] = groups[label] || []).push(e);
    }
    return groups;
  }, [events]);

  if (events.length === 0) {
    return <EmptyState title="No activity yet" body="Events from your assignments, automations, credits and study sessions will show up here." />;
  }

  return (
    <div className="space-y-6">
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
