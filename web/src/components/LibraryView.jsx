/* ────────────────────────────────────────────────────────────────────────────
 * LibraryView.jsx — Files, Saved materials, and the academic Calendar.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Bookmark, FileText } from 'lucide-react';
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
    <SectionCard id="library-calendar" header={
      <div className="flex items-center justify-between w-full">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-[var(--accent)]" /> {monthName}
        </h3>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setMonthOffset(monthOffset - 1)} className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:border-[rgba(139,92,246,0.35)] transition cursor-pointer" aria-label="Previous month">←</button>
          <button type="button" onClick={() => setMonthOffset(0)} className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:border-[rgba(139,92,246,0.35)] transition cursor-pointer">Today</button>
          <button type="button" onClick={() => setMonthOffset(monthOffset + 1)} className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:border-[rgba(139,92,246,0.35)] transition cursor-pointer" aria-label="Next month">→</button>
        </div>
      </div>
    }>
      <div className="grid grid-cols-7 gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">
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
              className={`min-h-[74px] rounded-[var(--radius-md)] border p-1.5 transition ${
                isToday ? 'border-[rgba(139,92,246,0.6)] bg-[var(--accent-subtle)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
              }`}
            >
              <div className={`text-[10px] font-semibold ${isToday ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{d}</div>
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
    </SectionCard>
  );
}

export default function LibraryView({ user, onOpenWorkspace }) {
  const [tab, setTab] = useState('files');
  const [mats, setMats] = useState([]);
  const demo = demoEnabled();
  const files = demo ? LIBRARY : [];
  const saved = demo ? SAVED : [];

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
    <div className="space-y-5">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {files.map((f) => (
              <SectionCard id={`library-file-${f.id}`} className="h-full flex flex-col overflow-hidden transition group" header={
                <div className="w-full">
                  <div className="aspect-[16/9] max-h-44 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-gradient-to-br from-[rgba(139,92,246,0.14)] via-[var(--bg-surface)] to-[rgba(34,211,238,0.10)] flex flex-col items-center justify-center gap-1.5">
                    <span className="text-4xl leading-none" aria-hidden="true">{KIND_ICON[f.kind] || '📄'}</span>
                    <span className="aurora-chip">{f.kind}</span>
                  </div>
                </div>
              }>
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.6em] group-hover:text-[var(--accent)] transition">{f.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)] line-clamp-1">{f.course} · {f.size}{f.pages ? ` · ${f.pages} pages` : ''}{f.duration ? ` · ${f.duration}` : ''}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">uploaded {timeAgo(f.uploaded)}</div>
                  <div className="mt-auto">
                    <button type="button" onClick={onOpenWorkspace} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:border-[rgba(139,92,246,0.4)] transition cursor-pointer">
                      <FileText className="w-3 h-3" /> Open in AI Workspace
                    </button>
                  </div>
                </div>
              </SectionCard>
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
              <div key={s.id} className="clean-card px-5 py-4 flex items-center gap-4 transition">
                <span className="text-xl">{s.kind === 'flashcards' ? '🃏' : s.kind === 'practice_test' ? '📝' : '📖'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{s.title}</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.course} · saved {timeAgo(s.savedAt)}</div>
                </div>
                <Badge color="slate">{s.kind.replace('_', ' ')}</Badge>
                <Bookmark className="w-4 h-4 text-[var(--accent-2)] shrink-0" />
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'materials' && (
        mats.length === 0 ? (
          <EmptyState icon="🃏" title="No materials yet" body="Generate a study guide, flashcards or practice test — saved materials appear here." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
            {mats.map((m) => {
              const meta = MAT_META[m.kind] || { icon: '📄', label: m.kind.replace('_', ' ') };
              // content arrives pre-parsed for flashcards/practice_test; be
              // defensive for rows stored as JSON strings.
              const content = m.content;
              const parsed =
                typeof content === 'string'
                  ? (() => { try { return JSON.parse(content); } catch { return content; } })()
                  : content;
              const cards = m.kind === 'flashcards' && Array.isArray(parsed) ? parsed.filter((c) => c && (c.q || c.front)) : null;
              const quiz = m.kind === 'practice_test' && (Array.isArray(parsed) || (parsed && typeof parsed === 'object' && (parsed.multiple_choice || parsed.short_answer))) ? parsed : null;
              return (
                <SectionCard key={`mat-${m.id}`} id={`library-material-${m.id}`} className="h-[460px] flex flex-col overflow-hidden transition" header={
                  <div className="w-full">
                    <div className="aspect-[16/9] max-h-44 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-gradient-to-br from-[rgba(139,92,246,0.14)] via-[var(--bg-surface)] to-[rgba(34,211,238,0.10)] flex flex-col items-center justify-center gap-1.5">
                      <span className="text-4xl leading-none" aria-hidden="true">{meta.icon}</span>
                      <span className="aurora-chip">{meta.label}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1 truncate">{meta.label}</span>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] shrink-0">
                        {m.model_used && <span className="px-1.5 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono">{m.model_used}</span>}
                        {m.created_at && <span>saved {timeAgo(m.created_at)}</span>}
                      </div>
                    </div>
                  </div>
                }>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {cards ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {cards.map((c, i) => (
                          <div key={i} className="rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-1.5">
                            <div className="text-xs font-semibold text-[var(--accent)]">Q{i + 1}. {String(c.q ?? c.front ?? '')}</div>
                            <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{String(c.a ?? c.back ?? '')}</div>
                          </div>
                        ))}
                        {cards.length === 0 && (
                          <p className="text-xs text-[var(--text-muted)] col-span-full">This deck is empty.</p>
                        )}
                      </div>
                    ) : quiz ? (
                      <div className="space-y-2.5">
                        {(Array.isArray(parsed) ? parsed : [
                          ...(parsed.multiple_choice || []).map((q) => ({ type: 'mc', ...q })),
                          ...(parsed.short_answer || []).map((q) => ({ type: 'sa', ...q })),
                        ]).map((q, i) => (
                          <div key={i} className="rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-1.5">
                            <div className="text-xs font-semibold text-[var(--accent-2)]">Q{i + 1}. {String(q.q ?? q.question ?? '')}</div>
                            {q.options && Array.isArray(q.options) && (
                              <ol className="text-[11px] text-[var(--text-secondary)] list-decimal pl-4 space-y-0.5">
                                {q.options.map((o, j) => (
                                  <li key={j} className={q.answer_index === j || q.answer === j ? 'text-emerald-300' : ''}>{o}</li>
                                ))}
                              </ol>
                            )}
                            {q.explanation && <div className="text-[10px] text-[var(--text-muted)]">💡 {q.explanation}</div>}
                            {q.model_answer && <div className="text-[11px] text-[var(--text-secondary)]">Model answer: {q.model_answer}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-mono">{String(content ?? '')}</p>
                    )}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )
      )}

      {tab === 'calendar' && (
        <>
          <CalendarGrid />
          <SectionCard id="library-upcoming" header={<SectionHeader title="Upcoming" subtitle="Everything with a date" />}>
            {CALENDAR.filter((c) => c.kind === 'due' && !c.status?.startsWith('completed')).length === 0 ? (
              <EmptyState title="Nothing upcoming" body="No open due dates in range." />
            ) : (
              <div className="space-y-2">
                {CALENDAR.filter((c) => c.kind === 'due' && !c.status?.startsWith('completed'))
                  .sort((a, b) => a.date - b.date)
                  .map((c, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="w-10 text-center shrink-0">
                        <div className="text-sm font-bold text-[var(--text-primary)]">{new Date(c.date).getDate()}</div>
                        <div className="text-[9px] uppercase text-[var(--text-muted)]">{new Date(c.date).toLocaleDateString([], { month: 'short' })}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-[var(--text-secondary)] truncate">{c.title}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{c.course}</div>
                      </div>
                      <Badge color={c.status === 'draft_ready' ? 'amber' : 'slate'}>{c.status.replace('_', ' ')}</Badge>
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
