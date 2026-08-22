/* ────────────────────────────────────────────────────────────────────────────
 * LibraryView.jsx — Files, Saved materials, and the academic Calendar.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import { Calendar as CalendarIcon, Bookmark, FileText } from 'lucide-react';
import { LIBRARY, SAVED, CALENDAR, demoEnabled } from '../demoData.js';
import { Badge, Tabs, EmptyState, SectionHeader, timeAgo } from './ui/os.jsx';

const KIND_ICON = { pdf: '📕', doc: '📘', audio: '🎧', image: '🖼️' };

function CalendarGrid() {
  const demo = demoEnabled();
  const [monthOffset, setMonthOffset] = useState(0);
  if (!demo || CALENDAR.length === 0) return <EmptyState title="No calendar events" body="Assignments and study sessions will appear here." />;

  const base = new Date();
  const year = base.getFullYear();
  const month = base.getMonth() + monthOffset;
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const eventsFor = (d) => CALENDAR.filter((c) => {
    const dt = new Date(c.date);
    return dt.getFullYear() === year && dt.getMonth() === month && dt.getDate() === d;
  });

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = firstDay.toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <div className="clean-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-blue-400" /> {monthName}
        </h3>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setMonthOffset(monthOffset - 1)} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-xs text-slate-300 hover:bg-white/10 transition cursor-pointer" aria-label="Previous month">←</button>
          <button type="button" onClick={() => setMonthOffset(0)} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-xs text-slate-300 hover:bg-white/10 transition cursor-pointer">Today</button>
          <button type="button" onClick={() => setMonthOffset(monthOffset + 1)} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/8 text-xs text-slate-300 hover:bg-white/10 transition cursor-pointer" aria-label="Next month">→</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-[10px] font-semibold text-slate-500 mb-1.5">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const events = eventsFor(d);
          const isToday = `${year}-${month}-${d}` === todayStr;
          return (
            <div
              key={d}
              className={`min-h-[74px] rounded-xl border p-1.5 transition ${
                isToday ? 'border-blue-500/40 bg-blue-500/8' : 'border-white/5 bg-slate-950/40'
              }`}
            >
              <div className={`text-[10px] font-semibold ${isToday ? 'text-blue-300' : 'text-slate-500'}`}>{d}</div>
              <div className="space-y-1 mt-1">
                {events.map((e) => (
                  <div
                    key={e.title + d}
                    title={`${e.title} · ${e.course}`}
                    className={`px-1 py-0.5 rounded text-[8px] font-medium truncate ${
                      e.kind === 'study'
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20'
                        : e.status?.startsWith('completed')
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 line-through opacity-70'
                          : e.status === 'draft_ready'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                            : 'bg-blue-500/15 text-blue-300 border border-blue-500/20'
                    }`}
                  >
                    {e.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LibraryView() {
  const [tab, setTab] = useState('files');
  const demo = demoEnabled();
  const files = demo ? LIBRARY : [];
  const saved = demo ? SAVED : [];

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { key: 'files', label: `Files (${files.length})` },
          { key: 'saved', label: `Saved (${saved.length})` },
          { key: 'calendar', label: 'Calendar' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'files' && (
        files.length === 0 ? (
          <EmptyState icon="🗂️" title="Your library is empty" body="Upload lectures, PDFs, rubrics and scans — Helpotron turns them into study material." actionLabel="Upload materials" onAction={() => { /* dump view */ window.location.hash = ''; }} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((f) => (
              <div key={f.id} className="clean-card p-5 space-y-3 hover:border-blue-500/25 transition group">
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{KIND_ICON[f.kind] || '📄'}</span>
                  <Badge color="slate">{f.kind}</Badge>
                </div>
                <div>
                  <div className="text-xs font-semibold text-white truncate group-hover:text-blue-200 transition">{f.name}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{f.course} · {f.size}{f.pages ? ` · ${f.pages} pages` : ''}{f.duration ? ` · ${f.duration}` : ''}</div>
                </div>
                <div className="text-[10px] text-slate-600">uploaded {timeAgo(f.uploaded)}</div>
                <button type="button" className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-[11px] text-slate-300 hover:bg-blue-600 hover:text-white transition cursor-pointer">
                  <FileText className="w-3 h-3" /> Open in AI Workspace
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'saved' && (
        saved.length === 0 ? (
          <EmptyState icon="🔖" title="Nothing saved yet" body="Save study guides, decks and tests here for quick access." />
        ) : (
          <div className="space-y-2">
            {saved.map((s) => (
              <div key={s.id} className="clean-card px-5 py-4 flex items-center gap-4 hover:border-blue-500/25 transition">
                <span className="text-xl">{s.kind === 'flashcards' ? '🃏' : s.kind === 'practice_test' ? '📝' : '📖'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white">{s.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{s.course} · saved {timeAgo(s.savedAt)}</div>
                </div>
                <Badge color="blue">{s.kind.replace('_', ' ')}</Badge>
                <Bookmark className="w-4 h-4 text-amber-400 shrink-0" />
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'calendar' && (
        <>
          <CalendarGrid />
          <div className="clean-card p-5">
            <SectionHeader title="Upcoming" subtitle="Everything with a date" />
            {CALENDAR.filter((c) => c.kind === 'due' && !c.status?.startsWith('completed')).length === 0 ? (
              <EmptyState title="Nothing upcoming" body="No open due dates in range." />
            ) : (
              <div className="space-y-2">
                {CALENDAR.filter((c) => c.kind === 'due' && !c.status?.startsWith('completed'))
                  .sort((a, b) => a.date - b.date)
                  .map((c, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-950/40 border border-white/6">
                      <div className="w-10 text-center shrink-0">
                        <div className="text-sm font-bold text-white">{new Date(c.date).getDate()}</div>
                        <div className="text-[9px] uppercase text-slate-500">{new Date(c.date).toLocaleDateString([], { month: 'short' })}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-200 truncate">{c.title}</div>
                        <div className="text-[10px] text-slate-500">{c.course}</div>
                      </div>
                      <Badge color={c.status === 'draft_ready' ? 'amber' : 'slate'}>{c.status.replace('_', ' ')}</Badge>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
