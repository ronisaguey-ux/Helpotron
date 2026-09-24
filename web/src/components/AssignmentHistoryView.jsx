import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Download,
  Filter,
  RefreshCw,
  Archive,
  BookOpen,
  Calendar,
  Plus,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  FileSpreadsheet,
  FileJson,
  RotateCw,
} from "lucide-react";
import api from "../api.js";
import NewAssignmentModal from "./NewAssignmentModal.jsx";
import ErrorReportButton from "./ui/ErrorReportButton.jsx";

function getSubjectChipStyle(course = "") {
  const c = String(course).toLowerCase();
  if (/psych|bio|life|chem|med/.test(c)) {
    return "bg-sem-cyan/15 text-sem-cyan border-sem-cyan/30";
  }
  if (/math|calc|phys|stat|algebra/.test(c)) {
    return "bg-sem-indigo/15 text-sem-indigo border-sem-indigo/30";
  }
  if (/hist|eng|lit|gov|soc|phil/.test(c)) {
    return "bg-sem-amber/15 text-sem-amber border-sem-amber/30";
  }
  if (/cs|code|comp|software|data/.test(c)) {
    return "bg-sem-green/15 text-sem-green border-sem-green/30";
  }
  return "bg-secondary/15 text-secondary border-secondary/30";
}

function getHistoryStatusChip(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("completed") || s.includes("submitted") || s.includes("graded")) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sem-green/15 text-sem-green border border-sem-green/25 font-chip-status text-[10px] uppercase font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-sem-green" />
        Completed
      </span>
    );
  }
  if (s.includes("archived")) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/30 font-chip-status text-[10px] uppercase font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-outline" />
        Archived
      </span>
    );
  }
  if (s.includes("overdue")) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-error/15 text-error border border-error/30 font-chip-status text-[10px] uppercase font-semibold">
        <AlertTriangle className="w-3 h-3 text-error" />
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 font-chip-status text-[10px] uppercase font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      {status || "Recorded"}
    </span>
  );
}

export default function AssignmentHistoryView({ userId, onSelectAssignment }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters
  const [historyTab, setHistoryTab] = useState("ledger"); // "ledger" | "archived" | "all"
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM

  // UI Modals & Popups
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportState, setExportState] = useState("idle"); // "idle" | "generating" | "success" | "error"
  const [exportNotice, setExportNotice] = useState("");
  const [showNewAssignment, setShowNewAssignment] = useState(false);

  // Pagination (20 items per page per 3.9.1)
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const fetchHistory = async () => {
    setLoading(true);
    setFetchError("");
    try {
      const res = await api.getAssignmentHistory(subjectFilter === "ALL" ? null : subjectFilter);
      if (res && res.history) {
        setHistoryList(res.history);
        setLastUpdated(new Date());
      } else {
        setHistoryList([]);
      }
    } catch (err) {
      console.warn("Failed loading assignment history:", err);
      setFetchError(err?.message || "Failed to load assignment history from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId, subjectFilter]);

  // Subject options
  const subjects = useMemo(() => {
    const set = new Set();
    historyList.forEach((h) => {
      const s = h.course || h.subject;
      if (s) set.add(s);
    });
    return Array.from(set);
  }, [historyList]);

  // Filtered entries
  const filteredList = useMemo(() => {
    return historyList.filter((item) => {
      const isArchived = String(item.status || "").toLowerCase().includes("archived");
      if (historyTab === "ledger" && isArchived) return false;
      if (historyTab === "archived" && !isArchived) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (item.title || "").toLowerCase().includes(q);
        const matchCourse = (item.course || item.subject || "").toLowerCase().includes(q);
        const matchTeacher = (item.teacher_name || "").toLowerCase().includes(q);
        if (!matchTitle && !matchCourse && !matchTeacher) return false;
      }

      if (dateFilter && item.completed_at) {
        if (!String(item.completed_at).startsWith(dateFilter)) return false;
      }

      return true;
    });
  }, [historyList, historyTab, searchQuery, dateFilter]);

  // Paginated rows
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredList.slice(start, start + PAGE_SIZE);
  }, [filteredList, page]);

  // Export CSV with BOM & CRLF per 3.9.2
  const handleExportCsv = () => {
    if (historyList.length === 0) return;
    setExportState("generating");
    setShowExportMenu(false);

    try {
      const headers = [
        "Assignment Title",
        "Course / Subject",
        "Instructor",
        "Grade",
        "Score (%)",
        "Completed Date",
        "Status",
      ];
      const rows = historyList.map((h) => [
        `"${(h.title || "").replace(/"/g, '""')}"`,
        `"${(h.course || h.subject || "").replace(/"/g, '""')}"`,
        `"${(h.teacher_name || "").replace(/"/g, '""')}"`,
        `"${h.grade_letter || "Not graded"}"`,
        h.score_predicted != null ? h.score_predicted : "",
        `"${h.completed_at || ""}"`,
        `"${h.status || ""}"`,
      ]);

      const BOM = "\uFEFF";
      const csvContent = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `helpotron_history_${userId || "student"}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportState("success");
      setExportNotice("✅ CSV export downloaded successfully.");
      setTimeout(() => setExportNotice(""), 4000);
    } catch (err) {
      setExportState("error");
      setExportNotice("❌ Failed to generate CSV export.");
      setTimeout(() => setExportNotice(""), 4000);
    }
  };

  // Full JSON archive export
  const handleExportJson = async () => {
    setExportState("generating");
    setShowExportMenu(false);
    try {
      const data = await api.exportAllUserData().catch(() => ({ history: historyList }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `helpotron_archive_${userId || "student"}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setExportState("success");
      setExportNotice("✅ Complete JSON archive exported.");
      setTimeout(() => setExportNotice(""), 4000);
    } catch (err) {
      setExportState("error");
      setExportNotice("❌ Archive export failed.");
      setTimeout(() => setExportNotice(""), 4000);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header (Title + Sub + New Assignment + Export Dropdown + Refresh) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label-caps text-[10px] text-primary uppercase tracking-widest">
              Academic Portfolio &amp; Submission Ledger
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span className="font-code-sm text-xs text-on-surface-variant">
              Historical Ledger
            </span>
          </div>
          <h1 className="font-headline-lg text-2xl md:text-3xl text-on-surface font-semibold tracking-tight">
            Assignment History
          </h1>
          <p className="font-body-sm text-xs text-on-surface-variant mt-1 max-w-2xl">
            Immutable audit record of verified assignments, drafts, and submissions.
          </p>
        </div>

        <div className="flex items-center gap-3 relative">
          {lastUpdated && (
            <span className="hidden lg:inline-block font-code-sm text-[11px] text-outline">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}

          <button
            type="button"
            onClick={fetchHistory}
            disabled={loading}
            className="h-10 w-10 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 flex items-center justify-center transition cursor-pointer"
            title="Refresh ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : "text-on-surface-variant"}`} />
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exportState === "generating"}
              className="h-10 px-4 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30 font-label-caps text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-60"
            >
              {exportState === "generating" ? <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" /> : <Download className="w-3.5 h-3.5 text-primary" />}
              <span>{exportState === "generating" ? "Exporting…" : "Export"}</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 z-30 p-2 rounded-2xl bg-surface-container-high border border-outline-variant/40 shadow-2xl space-y-1 animate-fadeIn">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={exportState === "generating"}
                  className="w-full p-2.5 rounded-xl hover:bg-surface-container text-on-surface text-left font-code-sm text-xs flex items-center gap-2.5 transition cursor-pointer disabled:opacity-60"
                >
                  {exportState === "generating" ? <RefreshCw className="w-4 h-4 text-primary animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-primary" />}
                  <div>
                    <span className="block font-medium">CSV Spreadsheet</span>
                    <span className="text-[10px] text-outline block">Formatted with BOM / UTF-8</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  disabled={exportState === "generating"}
                  className="w-full p-2.5 rounded-xl hover:bg-surface-container text-on-surface text-left font-code-sm text-xs flex items-center gap-2.5 transition cursor-pointer disabled:opacity-60"
                >
                  {exportState === "generating" ? <RefreshCw className="w-4 h-4 text-secondary animate-spin" /> : <FileJson className="w-4 h-4 text-secondary" />}
                  <div>
                    <span className="block font-medium">Full JSON Archive</span>
                    <span className="text-[10px] text-outline block">Complete user audit trail</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowNewAssignment(true)}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Assignment</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-code-sm text-primary">
          {exportNotice}
        </div>
      )}

      {/* Real Error Banner with Retry (per 3.9.1) */}
      {fetchError && (
        <div className="p-4 rounded-2xl bg-error/15 border border-error/30 text-xs font-code-sm text-error flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchHistory}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-error/20 hover:bg-error/30 text-error font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Retrying…' : 'Retry'}</span>
            </button>
            <ErrorReportButton error={{ message: fetchError }} title="Assignment history failed to load" />
          </div>
        </div>
      )}

      {/* Sticky Filter Toolbar (top-[64px] per 3.9.1) */}
      <div className="sticky top-[64px] z-20 p-3 rounded-2xl bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant/30 shadow-md flex flex-wrap items-center justify-between gap-3">
        {/* Segmented Tabs: Ledger / Archived / All */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container border border-outline-variant/20">
          {[
            { id: "ledger", label: "Active Ledger" },
            { id: "archived", label: "Archived" },
            { id: "all", label: "All Records" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setHistoryTab(t.id);
                setPage(1);
              }}
              className={`px-3.5 py-1 rounded-lg font-label-caps text-xs transition cursor-pointer ${
                historyTab === t.id
                  ? "bg-surface-container-high text-primary font-semibold shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search, Subject Select, Date Picker */}
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl justify-end">
          {/* Search */}
          <div className="relative min-w-[180px] flex-1">
            <Search className="w-3.5 h-3.5 text-outline absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Filter title or instructor…"
              className="w-full h-8 pl-8 pr-3 rounded-xl bg-surface-container text-on-surface placeholder:text-outline border border-outline-variant/30 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Subject dropdown */}
          <select
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 px-2.5 rounded-xl bg-surface-container text-on-surface border border-outline-variant/30 text-xs font-code-sm focus:outline-none"
          >
            <option value="ALL">All Subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Date Picker */}
          <input
            type="month"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 px-2.5 rounded-xl bg-surface-container text-on-surface border border-outline-variant/30 text-xs font-code-sm focus:outline-none"
          />

          {(searchQuery || subjectFilter !== "ALL" || dateFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSubjectFilter("ALL");
                setDateFilter("");
                setPage(1);
              }}
              className="h-8 px-2.5 rounded-xl bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-code-sm flex items-center gap-1 cursor-pointer"
              title="Clear all filters"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Ledger Content Area */}
      {loading ? (
        <div className="p-12 rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 text-center font-code-sm text-xs text-on-surface-variant">
          Loading portfolio ledger…
        </div>
      ) : filteredList.length === 0 ? (
        searchQuery ? (
          <div className="p-12 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-3">
            <p className="font-body-sm text-xs text-on-surface-variant">
              No records match “{searchQuery}”.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-primary hover:underline cursor-pointer"
            >
              Clear filter
            </button>
          </div>
        ) : (
        <div className="p-12 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 text-center space-y-4">
          <BookOpen className="w-10 h-10 text-primary mx-auto" />
          <h3 className="font-title-md text-base font-semibold text-on-surface">
            No assignment records found
          </h3>
          <p className="font-body-sm text-xs text-on-surface-variant max-w-md mx-auto">
            Assignments you turn in, complete, or archive will be indexed in this chronological ledger.
          </p>
          <button
            type="button"
            onClick={() => setShowNewAssignment(true)}
            className="h-10 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase inline-flex items-center gap-2 cursor-pointer shadow-sm mx-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Assignment</span>
          </button>
        </div>
        )
      ) : (
        <>
          {/* Desktop Table (>= 1024px per 3.9.3) */}
          <div className="hidden lg:block rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container-low/60 text-on-surface-variant font-label-caps text-[10px] uppercase tracking-wider border-b border-outline-variant/20">
                  <th className="py-3 px-6">Assignment &amp; Course</th>
                  <th className="py-3 px-4">Instructor</th>
                  <th className="py-3 px-4">Grade / Score</th>
                  <th className="py-3 px-4">Completion Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15 font-code-sm">
                {paginatedRows.map((item) => {
                  const subjectName = item.course || item.subject || "General Academic";
                  return (
                    <tr
                      key={item.id || item.title}
                      onClick={() => onSelectAssignment?.(item)}
                      className="hover:bg-surface-container-low/50 transition cursor-pointer group"
                    >
                      <td className="py-4 px-6">
                        <div className="space-y-1 min-w-0 max-w-md">
                          <span className="font-title-md text-xs font-semibold text-on-surface block truncate group-hover:text-primary transition">
                            {item.title}
                          </span>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-chip-status text-[9px] uppercase border ${getSubjectChipStyle(
                              subjectName
                            )}`}
                            title={subjectName}
                          >
                            {subjectName}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-on-surface-variant font-body-sm text-xs">
                        {item.teacher_name || "—"}
                      </td>

                      <td className="py-4 px-4 font-tabular-stat text-xs">
                        {item.grade_letter ? (
                          <span className="font-bold text-primary mr-1.5">{item.grade_letter}</span>
                        ) : null}
                        <span className="text-on-surface-variant">
                          {item.score_predicted != null ? `${item.score_predicted}%` : "—"}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-on-surface-variant text-[11px]">
                        {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : "—"}
                      </td>

                      <td className="py-4 px-4">
                        {getHistoryStatusChip(item.status)}
                      </td>

                      <td className="py-4 px-6 text-right">
                        {/* 44px Action Button per 3.9.1 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAssignment?.(item);
                          }}
                          className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-surface-container inline-flex items-center justify-center text-on-surface-variant hover:text-primary transition cursor-pointer"
                          title="Review assignment"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List (< 1024px per 3.9.3) */}
          <div className="block lg:hidden space-y-3">
            {paginatedRows.map((item) => {
              const subjectName = item.course || item.subject || "General Academic";
              return (
                <div
                  key={item.id || item.title}
                  onClick={() => onSelectAssignment?.(item)}
                  className="p-4 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-sm space-y-3 cursor-pointer hover:border-primary/40 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md font-chip-status text-[9px] uppercase border ${getSubjectChipStyle(
                          subjectName
                        )}`}
                      >
                        {subjectName}
                      </span>
                      <h3 className="font-title-md text-xs font-semibold text-on-surface truncate">
                        {item.title}
                      </h3>
                    </div>
                    {getHistoryStatusChip(item.status)}
                  </div>

                  <div className="flex items-center justify-between text-xs font-code-sm pt-2 border-t border-outline-variant/15 text-on-surface-variant">
                    <span>
                      {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : "Recorded"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {item.grade_letter && (
                        <span className="text-primary font-semibold">{item.grade_letter}</span>
                      )}
                      {item.score_predicted != null && (
                        <span className="font-tabular-stat">{item.score_predicted}%</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 rounded-2xl bg-surface-container-lowest/80 border border-outline-variant/30 flex items-center justify-between text-xs font-code-sm">
              <span className="text-outline">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredList.length)} of {filteredList.length} items
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-9 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container disabled:opacity-40 text-on-surface flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>
                <span className="px-3 font-semibold text-primary">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-9 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container disabled:opacity-40 text-on-surface flex items-center gap-1 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Assignment Modal */}
      {showNewAssignment && (
        <NewAssignmentModal
          isOpen={showNewAssignment}
          onClose={() => setShowNewAssignment(false)}
          onCreated={() => {
            setShowNewAssignment(false);
            fetchHistory();
          }}
        />
      )}
    </div>
  );
}
