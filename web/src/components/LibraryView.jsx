/* ────────────────────────────────────────────────────────────────────────────
 * LibraryView.jsx — Files, Saved materials, and the academic Calendar.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Bookmark, FileText, Bot } from 'lucide-react';
import { LIBRARY, SAVED, CALENDAR, demoEnabled } from '../demoData.js';
import { Badge, Tabs, EmptyState, SectionHeader, timeAgo } from './ui/os.jsx';
import { api } from '../api.js';
import SectionCard from './SectionCard.jsx';

const KIND_ICON = { pdf: '📕', doc: '📘', audio: '🎧', image: '🖼️' };
const MAT_META = {
  study_guide: { icon: '📗', label: 'Study Guide' },
  flashcards: { icon: '🃏', label: 'Flashcards' },
  practice_test: { icon: '📝', label: 'Practice Test' },
  summary: { icon: '📄', label: 'Summary' },
  solution: { icon: '✅', label: 'Solution' },
};

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
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between w-full">
        <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-primary" /> {monthName}
        </h3>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setMonthOffset(monthOffset - 1)} className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer" aria-label="Previous month">←</button>
          <button type="button" onClick={() => setMonthOffset(0)} className="px-3.5 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-label-caps text-xs uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer">Today</button>
          <button type="button" onClick={() => setMonthOffset(monthOffset + 1)} className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer" aria-label="Next month">→</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 font-label-caps text-label-caps uppercase text-on-surface-variant mb-1.5">
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
              className={`min-h-[74px] rounded-xl border p-2 transition ${
                isToday ? 'border-primary bg-primary/10' : 'border-outline-variant/20 bg-surface-container-low'
              }`}
            >
              <div className={`font-tabular-stat text-xs font-semibold ${isToday ? 'text-primary' : 'text-on-surface-variant'}`}>{d}</div>
              <div className="space-y-1 mt-1">
                {events.map((e) => (
                  <div
                    key={e.title + d}
                    title={`${e.title} · ${e.course}`}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-medium truncate ${
                      e.kind === 'study'
                        ? 'bg-primary/15 text-primary border border-primary/20'
                        : e.status?.startsWith('completed')
                          ? 'bg-primary/15 text-primary border border-primary/20 line-through opacity-70'
                          : e.status === 'draft_ready'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                            : 'bg-secondary/15 text-secondary border border-secondary/20'
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

export default function LibraryView({ user, onOpenAssignmentBubble, onOpenWorkspace }) {
  const [tab, setTab] = useState('files');
  const [mats, setMats] = useState([]);
  const demo = demoEnabled();
  const files = demo ? LIBRARY : [];
  const saved = demo ? SAVED : [];

  const handleOpenBubble = onOpenAssignmentBubble || onOpenWorkspace;

  // Real saved materials (08-27): study guides/flashcards/etc. generated by
  // the agent or the Assignment Dump land here — the previous tab only ever
  // showed demo data.
  useEffect(() => {
    if (!user?.public_id) return;
    api.materialsFor(user.public_id)
      .then((r) => setMats(Array.isArray(r?.materials) ? r.materials : []))
      .catch(() => setMats([]));
  }, [user?.public_id]);

  return (
    <div className="space-y-6">
      {/* Study OS Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-label-caps text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/20 font-semibold">
              Study OS
            </span>
          </div>
          <h2 className="font-headline-lg text-title-md md:text-headline-lg text-on-surface">Study OS & Library</h2>
          <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
            Master core concepts, review generated study materials, lecture files, and academic schedules.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-lowest border border-primary/20 text-xs text-primary shadow-sm shrink-0 self-start sm:self-auto">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-label-caps text-label-caps">AI Copilot Ready</span>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'files', label: `Files (${files.length})` },
          { key: 'saved', label: `Saved (${saved.length})` },
          { key: 'materials', label: `My Materials (${mats.length})` },
          { key: 'calendar', label: 'Calendar' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'files' && (
        files.length === 0 ? (
          <EmptyState icon="🗂️" title="Your library is empty" body="Upload lectures, PDFs and scans — Helpotron turns them into study material." actionLabel="Upload materials" onAction={() => { /* dump view */ window.location.hash = ''; }} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
            {files.map((f) => (
              <div key={`library-file-${f.id}`} className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm h-full flex flex-col justify-between group hover:border-primary/40 transition">
                <div className="w-full">
                  <div className="aspect-[16/9] max-h-40 w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low flex flex-col items-center justify-center gap-2 mb-4">
                    <span className="text-4xl leading-none" aria-hidden="true">{KIND_ICON[f.kind] || '📄'}</span>
                    <span className="font-label-caps text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-primary/15 text-primary font-semibold">{f.kind}</span>
                  </div>
                  <div className="font-title-md text-sm text-on-surface line-clamp-2 min-h-[2.6em] group-hover:text-primary transition">{f.name}</div>
                  <div className="font-body-sm text-xs text-on-surface-variant line-clamp-1 mt-1">{f.course} · {f.size}{f.pages ? ` · ${f.pages} pages` : ''}{f.duration ? ` · ${f.duration}` : ''}</div>
                  <div className="font-tabular-stat text-[11px] text-on-surface-variant mt-1">uploaded {timeAgo(f.uploaded)}</div>
                </div>
                <div className="mt-4 pt-3 border-t border-outline-variant/20">
                  <button type="button" onClick={handleOpenBubble} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-label-caps text-xs uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer">
                    <Bot className="w-3.5 h-3.5 text-primary" /> Open in Bubble
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'saved' && (
        saved.length === 0 ? (
          <EmptyState icon="🔖" title="Nothing saved yet" body="Save study guides, decks and tests here for quick access." />
        ) : (
          <div className="space-y-3">
            {saved.map((s) => (
              <div key={s.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl px-5 py-4 flex items-center gap-4 transition hover:border-primary/40 shadow-sm">
                <span className="text-2xl">{s.kind === 'flashcards' ? '🃏' : s.kind === 'practice_test' ? '📝' : '📖'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-on-surface">{s.title}</div>
                  <div className="font-tabular-stat text-[11px] text-on-surface-variant mt-0.5">{s.course} · saved {timeAgo(s.savedAt)}</div>
                </div>
                <span className="font-label-caps text-xs uppercase px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface-variant border border-outline-variant/30">
                  {s.kind.replace('_', ' ')}
                </span>
                <Bookmark className="w-4 h-4 text-primary shrink-0" />
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'materials' && (
        mats.length === 0 ? (
          <EmptyState icon="🃏" title="No materials yet" body="Generate a study guide, flashcards or practice test — saved materials appear here." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-stretch">
            {mats.map((m) => {
              const meta = MAT_META[m.kind] || { icon: '📄', label: m.kind.replace('_', ' ') };
              const content = m.content;
              const parsed =
                typeof content === 'string'
                  ? (() => { try { return JSON.parse(content); } catch { return content; } })()
                  : content;
              const cards = m.kind === 'flashcards' && Array.isArray(parsed) ? parsed.filter((c) => c && (c.q || c.front)) : null;
              const quiz = m.kind === 'practice_test' && (Array.isArray(parsed) || (parsed && typeof parsed === 'object' && (parsed.multiple_choice || parsed.short_answer))) ? parsed : null;
              return (
                <div key={`mat-${m.id}`} id={`library-material-${m.id}`} className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm h-[480px] flex flex-col overflow-hidden hover:border-primary/40 transition">
                  <div className="w-full shrink-0">
                    <div className="aspect-[16/9] max-h-36 w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low flex flex-col items-center justify-center gap-1.5 mb-3">
                      <span className="text-3xl leading-none" aria-hidden="true">{meta.icon}</span>
                      <span className="font-label-caps text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-primary/15 text-primary font-semibold">{meta.label}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-title-md text-sm font-semibold text-on-surface line-clamp-1 truncate">{meta.label}</span>
                      <div className="flex items-center gap-2 font-tabular-stat text-[10px] text-on-surface-variant shrink-0">
                        {m.model_used && <span className="px-1.5 py-0.5 rounded-full bg-surface-container-low border border-outline-variant/30 font-mono">{m.model_used}</span>}
                        {m.created_at && <span>saved {timeAgo(m.created_at)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-4 pt-3 border-t border-outline-variant/20">
                    {cards ? (
                      <div className="space-y-3">
                        {cards.map((c, i) => (
                          <div key={i} className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-3.5 space-y-1.5">
                            <div className="font-label-caps text-xs font-semibold text-primary">Card {i + 1}</div>
                            <div className="font-title-md text-xs font-semibold text-on-surface">{String(c.q ?? c.front ?? '')}</div>
                            <div className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed pt-1 border-t border-outline-variant/10">{String(c.a ?? c.back ?? '')}</div>
                          </div>
                        ))}
                        {cards.length === 0 && (
                          <p className="font-body-sm text-xs text-on-surface-variant">This deck is empty.</p>
                        )}
                      </div>
                    ) : quiz ? (
                      <div className="space-y-3">
                        {(Array.isArray(parsed) ? parsed : [
                          ...(parsed.multiple_choice || []).map((q) => ({ type: 'mc', ...q })),
                          ...(parsed.short_answer || []).map((q) => ({ type: 'sa', ...q })),
                        ]).map((q, i) => (
                          <div key={i} className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-3.5 space-y-2">
                            <div className="font-label-caps text-xs font-semibold text-secondary">Question {i + 1}</div>
                            <div className="font-title-md text-xs font-semibold text-on-surface">{String(q.q ?? q.question ?? '')}</div>
                            {q.options && Array.isArray(q.options) && (
                              <div className="space-y-1 pt-1">
                                {q.options.map((o, j) => (
                                  <div key={j} className={`px-2.5 py-1.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                                    q.answer_index === j || q.answer === j
                                      ? 'border-primary bg-primary/10 text-primary font-medium'
                                      : 'border-outline-variant/20 bg-surface-container-lowest/50 text-on-surface-variant'
                                  }`}>
                                    <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[9px] font-mono shrink-0">
                                      {String.fromCharCode(65 + j)}
                                    </span>
                                    <span>{o}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {q.explanation && <div className="text-[10px] text-on-surface-variant bg-surface-container-lowest/60 p-2 rounded-xl border border-outline-variant/20">💡 {q.explanation}</div>}
                            {q.model_answer && <div className="font-body-sm text-[11px] text-on-surface-variant">Model answer: <span className="text-on-surface font-mono">{q.model_answer}</span></div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="font-mono text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap">{String(content ?? '')}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'calendar' && (
        <>
          <CalendarGrid />
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-title-md text-title-md text-on-surface">Upcoming Deadlines</h3>
              <span className="font-label-caps text-xs uppercase text-on-surface-variant tracking-wider">Academic Timeline</span>
            </div>
            {CALENDAR.filter((c) => c.kind === 'due' && !c.status?.startsWith('completed')).length === 0 ? (
              <EmptyState title="Nothing upcoming" body="No open due dates in range." />
            ) : (
              <div className="space-y-2">
                {CALENDAR.filter((c) => c.kind === 'due' && !c.status?.startsWith('completed'))
                  .sort((a, b) => a.date - b.date)
                  .map((c, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-container-low border border-outline-variant/20 hover:border-primary/30 transition">
                      <div className="w-10 text-center shrink-0">
                        <div className="font-tabular-stat text-sm font-bold text-on-surface">{new Date(c.date).getDate()}</div>
                        <div className="font-label-caps text-[9px] uppercase text-on-surface-variant">{new Date(c.date).toLocaleDateString([], { month: 'short' })}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-title-md text-xs text-on-surface truncate">{c.title}</div>
                        <div className="font-body-sm text-[10px] text-on-surface-variant">{c.course}</div>
                      </div>
                      <span className={`font-label-caps text-xs uppercase px-2.5 py-1 rounded-full font-semibold ${
                        c.status === 'draft_ready' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20' : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/30'
                      }`}>
                        {c.status.replace('_', ' ')}
                      </span>
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
