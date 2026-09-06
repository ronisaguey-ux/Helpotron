import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import api from "../../api.js";

export default function AcademicCalendar({ onSelectAssignment }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchRealAssignments = async () => {
      setLoading(true);
      try {
        const res = await api.assignmentCards().catch(() => null);
        if (!cancelled && res?.cards && Array.isArray(res.cards)) {
          setAssignments(res.cards);
        }
      } catch (err) {
        console.warn("Could not fetch real academic due dates:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchRealAssignments();
    return () => {
      cancelled = true;
    };
  }, []);

  const base = new Date();
  const year = base.getFullYear();
  const month = base.getMonth() + monthOffset;
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  // Filter real assignments by calendar date
  const eventsFor = (d) => {
    return assignments.filter((a) => {
      const dateVal = a.due_date || a.due_at || a.created_at;
      if (!dateVal) return false;
      const dt = new Date(dateVal);
      return dt.getFullYear() === year && dt.getMonth() === month && dt.getDate() === d;
    });
  };

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = firstDay.toLocaleDateString([], { month: "long", year: "numeric" });

  const totalUpcomingCount = assignments.filter((a) => {
    const d = a.due_date || a.due_at;
    return d && new Date(d) >= today;
  }).length;

  return (
    <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-4">
      {/* Calendar Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-title-md text-sm font-semibold text-on-surface flex items-center gap-2">
              {monthName}
            </h3>
            <span className="font-code-sm text-[11px] text-on-surface-variant">
              {totalUpcomingCount > 0 ? `${totalUpcomingCount} upcoming due dates` : "No upcoming deadlines this month"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m - 1)}
            className="h-9 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs text-on-surface-variant hover:text-on-surface transition cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            className="h-9 px-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 font-label-caps text-[11px] uppercase tracking-wider text-on-surface-variant hover:text-on-surface transition cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m + 1)}
            className="h-9 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs text-on-surface-variant hover:text-on-surface transition cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday Header */}
      <div className="grid grid-cols-7 gap-1 font-label-caps text-[10px] uppercase text-on-surface-variant text-center border-b border-outline-variant/15 pb-1.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-semibold">
            {d}
          </div>
        ))}
      </div>

      {/* Grid of Calendar Day Cells */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, idx) => {
          if (d === null) {
            return <div key={`empty-${idx}`} className="min-h-[76px] rounded-xl bg-transparent" />;
          }

          const events = eventsFor(d);
          const isToday = `${year}-${month}-${d}` === todayStr;

          return (
            <div
              key={d}
              className={`min-h-[76px] p-2 rounded-xl border transition-all flex flex-col justify-between ${
                isToday
                  ? "border-primary bg-primary/10 shadow-[0_0_12px_rgba(89,216,201,0.15)] ring-1 ring-primary"
                  : "border-outline-variant/20 bg-surface-container-low/50 hover:bg-surface-container-low"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-tabular-stat text-xs font-semibold ${
                    isToday ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {d}
                </span>
                {events.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </div>

              <div className="space-y-1 mt-1 overflow-hidden">
                {events.slice(0, 2).map((e) => {
                  const isOverdue = e.status === "overdue";
                  return (
                    <div
                      key={e.id || e.title}
                      onClick={() => onSelectAssignment?.(e)}
                      title={`${e.title} (${e.subject || e.course || "General"})`}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-code-sm truncate cursor-pointer transition ${
                        isOverdue
                          ? "bg-error/15 text-error border border-error/30"
                          : "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25"
                      }`}
                    >
                      {e.title}
                    </div>
                  );
                })}
                {events.length > 2 && (
                  <span className="font-code-sm text-[8px] text-outline block">
                    +{events.length - 2} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
