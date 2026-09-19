import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Bell,
  BellOff,
  X,
  Check,
} from "lucide-react";
import api from "../../api.js";

/**
 * UserCalendar — a calendar you can actually use (owner 2026-09-19).
 *
 * Owner: *"the academic deadline callender doesn't even work, u cant click on any
 * date, or add stuff to dates ... just have a text box with title and description
 * per day, and just have the user describe in plain text what they want, agents
 * will deal with it"*.
 *
 * The old component was READ-ONLY: it plotted assignment due dates from the
 * cards endpoint. No date was clickable, nothing could be added, and it was
 * named "Academic Deadlines" while showing none of the user's own plans.
 *
 * This one is the inverse. Every day is clickable, and what you write is plain
 * language — a title and a description. There is deliberately no event type, no
 * priority and no reminder schedule: the agent reads the description and decides
 * what to do with it ("start the essay two days early", "nag me if I haven't
 * begun"). The bell means "remind me about this", which is the whole reason to
 * put something on a calendar rather than in a note.
 *
 * Assignment due dates are still shown, as read-only chips, so the calendar
 * remains the one place that answers "what's coming up".
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Local YYYY-MM-DD. `toISOString()` would shift the day for anyone west of
 * UTC — the classic off-by-one that puts a deadline on the wrong date. */
function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AcademicCalendar({ onSelectAssignment }) {
  const today = useMemo(() => new Date(), []);
  const [monthOffset, setMonthOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const [dueDates, setDueDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", remind: true });

  const viewDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.request("/api/calendar/entries", { method: "GET" });
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Assignment due dates, read-only — the calendar should still answer
  // "what is coming up" for real coursework.
  useEffect(() => {
    let cancelled = false;
    api.assignmentCards?.()
      .then((res) => {
        if (cancelled) return;
        const cards = res?.cards || res;
        if (Array.isArray(cards)) {
          setDueDates(cards.filter((c) => c && c.due_date).map((c) => ({
            id: c.id,
            title: c.title || c.name || "Assignment",
            due_date: c.due_date,
            raw: c,
          })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const byDate = useMemo(() => {
    const map = {};
    for (const e of entries) {
      (map[e.entry_date] = map[e.entry_date] || []).push(e);
    }
    return map;
  }, [entries]);

  const dueByDate = useMemo(() => {
    const map = {};
    for (const d of dueDates) {
      const key = String(d.due_date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      (map[key] = map[key] || []).push(d);
    }
    return map;
  }, [dueDates]);

  // Monday-first grid, padded to whole weeks.
  const cells = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // make Monday index 0
    const out = [];
    for (let i = 0; i < lead; i += 1) out.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [viewDate]);

  const openDay = (date) => {
    setSelectedDate(toKey(date));
    setForm({ title: "", description: "", remind: true });
    setError("");
  };

  const saveEntry = async () => {
    if (!selectedDate) return;
    if (!form.title.trim()) {
      setError("Give it a title so you know what it is later.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.request("/api/calendar/entries", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          entry_date: selectedDate,
          remind: form.remind,
        }),
      });
      setForm({ title: "", description: "", remind: true });
      await loadEntries();
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id) => {
    try {
      await api.request(`/api/calendar/entries/${id}`, { method: "DELETE" });
      await loadEntries();
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  };

  const toggleRemind = async (entry) => {
    try {
      await api.request(`/api/calendar/entries/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ remind: !entry.remind }),
      });
      await loadEntries();
    } catch (e) {
      setError(String((e && e.message) || e));
    }
  };

  const todayKey = toKey(today);
  const selectedEntries = selectedDate ? (byDate[selectedDate] || []) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <h2 className="font-title-md text-sm font-semibold text-on-surface">Calendar</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m - 1)}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            className="h-11 px-4 rounded-xl text-on-surface font-label-caps text-xs uppercase tracking-wider hover:bg-surface-container transition cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m + 1)}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <p className="font-body-sm text-xs text-on-surface-variant">
        Click any day to add a note. Write what you want in plain words — your agent
        reads it and handles it, including reminding you on Telegram.
      </p>

      {error && (
        <div className="rounded-xl border border-error/30 bg-error-container/20 px-3 py-2 font-body-sm text-xs text-error">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 overflow-hidden">
        <div className="px-4 py-3 border-b border-outline-variant/20">
          <span className="font-title-md text-sm font-semibold text-on-surface">
            {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
          </span>
        </div>

        <div className="grid grid-cols-7 border-b border-outline-variant/15">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center font-label-caps text-[10px] uppercase tracking-wider text-outline">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            if (!date) {
              return <div key={`pad_${idx}`} className="min-h-[84px] border-b border-r border-outline-variant/10 bg-surface-container-low/20" />;
            }
            const key = toKey(date);
            const dayEntries = byDate[key] || [];
            const dayDue = dueByDate[key] || [];
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;
            return (
              <button
                key={key}
                type="button"
                onClick={() => openDay(date)}
                className={`min-h-[84px] p-1.5 text-left border-b border-r border-outline-variant/10 transition cursor-pointer align-top ${
                  isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
                  : isToday ? "bg-surface-container/60"
                  : "hover:bg-surface-container/40"
                }`}
                aria-label={`Add or view notes for ${key}`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-code-sm text-[11px] ${
                  isToday ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant"
                }`}>
                  {date.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayDue.slice(0, 2).map((d) => (
                    <div key={`due_${d.id}`} className="truncate font-code-sm text-[10px] text-sem-amber">
                      ⏰ {d.title}
                    </div>
                  ))}
                  {dayEntries.slice(0, 2).map((e) => (
                    <div key={`e_${e.id}`} className="truncate font-code-sm text-[10px] text-primary">
                      {e.remind ? "🔔" : "•"} {e.title}
                    </div>
                  ))}
                  {dayEntries.length + dayDue.length > 4 && (
                    <div className="font-code-sm text-[10px] text-outline">
                      +{dayEntries.length + dayDue.length - 4} more
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day editor */}
      {selectedDate && (
        <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-title-md text-sm font-semibold text-on-surface">
              {selectedDate}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
              aria-label="Close day editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {selectedEntries.length > 0 && (
            <div className="space-y-2">
              {selectedEntries.map((e) => (
                <div key={e.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-body-md text-sm text-on-surface font-semibold truncate">{e.title}</div>
                      {e.description && (
                        <div className="font-body-sm text-xs text-on-surface-variant mt-0.5 whitespace-pre-wrap">{e.description}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleRemind(e)}
                        title={e.remind ? "Reminder on — click to turn off" : "Reminder off — click to turn on"}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition cursor-pointer ${
                          e.remind ? "text-primary hover:bg-primary/10" : "text-outline hover:bg-surface-container"
                        }`}
                      >
                        {e.remind ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEntry(e.id)}
                        title="Delete"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <input
              type="text"
              value={form.title}
              onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
              placeholder="Title — e.g. Start the history essay"
              className="w-full h-11 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition"
            />
            <textarea
              value={form.description}
              onChange={(ev) => setForm((f) => ({ ...f, description: ev.target.value }))}
              placeholder="Describe it in plain words — what it is, and what you want done. Your agent will handle it."
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface text-sm focus:outline-none focus:border-primary transition resize-y"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, remind: !f.remind }))}
                className={`h-11 px-3 rounded-xl font-label-caps text-[11px] uppercase tracking-wider flex items-center gap-2 transition cursor-pointer border ${
                  form.remind
                    ? "border-primary/40 text-primary bg-primary/10"
                    : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {form.remind ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                {form.remind ? "Remind me" : "No reminder"}
              </button>
              <button
                type="button"
                onClick={saveEntry}
                disabled={saving}
                className="h-11 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold flex items-center gap-2 transition disabled:opacity-60 cursor-pointer"
              >
                {saving ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Your notes, soonest first — the calendar's table of contents. */}
      <div className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-caps text-[11px] uppercase tracking-wider text-on-surface-variant">
            Your notes
          </span>
          {loading && <span className="font-code-sm text-[10px] text-outline">loading…</span>}
        </div>
        {entries.length === 0 && !loading ? (
          <p className="font-body-sm text-xs text-on-surface-variant">
            Nothing yet. Click a day above and write what you want to happen.
          </p>
        ) : (
          <div className="space-y-1.5">
            {[...entries]
              .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
              .slice(0, 40)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelectedDate(e.entry_date)}
                  className="w-full text-left rounded-xl px-3 py-2 hover:bg-surface-container/50 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-code-sm text-[11px] text-outline shrink-0">{e.entry_date}</span>
                    <span className="font-body-sm text-xs text-on-surface truncate">{e.title}</span>
                    {e.remind && <Bell className="w-3 h-3 text-primary shrink-0" />}
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
