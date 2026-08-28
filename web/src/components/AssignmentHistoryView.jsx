import React, { useState, useEffect } from 'react';
import api from '../api.js';
import SectionCard from './SectionCard.jsx';
import NewAssignmentModal from './NewAssignmentModal.jsx';
import {
  History as HistoryIcon,
  Search,
  Download,
  Filter,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Archive,
  BookOpen,
  Award,
  Calendar,
  ExternalLink,
  Plus,
} from 'lucide-react';

export default function AssignmentHistoryView({ userId, onSelectAssignment }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [exportNotice, setExportNotice] = useState('');
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [createNotice, setCreateNotice] = useState('');

  const fetchHistory = async (subj) => {
    setLoading(true);
    try {
      const res = await api.getAssignmentHistory(subj === 'ALL' ? null : subj);
      if (res && res.history) {
        setHistoryList(res.history);
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(subjectFilter);
  }, [userId, subjectFilter]);

  const handleExportCsv = () => {
    if (historyList.length === 0) return;
    const headers = ['Assignment Title', 'Course / Subject', 'Instructor', 'Grade', 'Score (%)', 'AI Detection Risk', 'Completed Date', 'Status'];
    const rows = historyList.map((h) => [
      `"${(h.title || '').replace(/"/g, '""')}"`,
      `"${(h.course || '').replace(/"/g, '""')}"`,
      `"${(h.teacher_name || '').replace(/"/g, '""')}"`,
      `"${h.grade_letter || 'Not graded'}"`,
      h.score_predicted != null ? h.score_predicted : '',
      h.detector_score != null ? `"${(h.detector_score * 100).toFixed(0)}%"` : '""',
      `"${h.completed_at || ''}"`,
      `"${h.status || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `helpotron_assignment_history_${userId}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice('✅ Assignment history exported as CSV.');
    setTimeout(() => setExportNotice(''), 4000);
  };

  const filteredHistory = historyList.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.course || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.teacher_name && item.teacher_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  // Honest aggregates over REAL ledger data only (operator 08-27): null/absent
  // grades and detector scores count as "not graded" / "not checked" — no
  // fabricated A/92 defaults anywhere.
  const gradedScores = historyList
    .map((h) => (h.score_predicted != null && Number.isFinite(Number(h.score_predicted)) ? Number(h.score_predicted) : null))
    .filter((n) => n != null);
  const gradedCount = gradedScores.length;
  const avgScore = gradedCount > 0 ? Math.round(gradedScores.reduce((a, b) => a + b, 0) / gradedCount) : null;
  const detectorScores = historyList
    .map((h) => (h.detector_score != null && Number.isFinite(Number(h.detector_score)) ? Number(h.detector_score) : null))
    .filter((n) => n != null);
  const avgDetector = detectorScores.length > 0 ? Math.round((detectorScores.reduce((a, b) => a + b, 0) / detectorScores.length) * 100) : null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ─── Header Banner ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm">
            <HistoryIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Assignment History & Submission Archive</h2>
            <p className="text-xs text-slate-400">
              Permanent verified ledger of all synthesized and submitted coursework across all semesters.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewAssignment(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Assignment</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={historyList.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 transition cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV Ledger</span>
          </button>

          <button
            type="button"
            onClick={() => fetchHistory(subjectFilter)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-mono">
          {exportNotice}
        </div>
      )}
      {createNotice && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-300 font-mono">
          {createNotice}
        </div>
      )}

      {/* ─── Metric Summary Cards (honest, computed from ledger contents) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SectionCard id="history-total-completed" padding="p-4" className="rounded-2xl bg-slate-900/60 border border-white/10" header={
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Assignments in Ledger</span>
            <BookOpen className="w-4 h-4 text-blue-400" />
          </div>
        }>
          <div className="text-2xl font-bold text-white font-mono">{historyList.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {historyList.length} assignment{historyList.length === 1 ? '' : 's'} on record
          </div>
        </SectionCard>

        <SectionCard id="history-average-grade" padding="p-4" className="rounded-2xl bg-slate-900/60 border border-white/10" header={
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Average Recorded Score</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
        }>
          {avgScore != null ? (
            <>
              <div className="text-2xl font-bold text-amber-300 font-mono">{avgScore}%</div>
              <div className="text-[11px] text-slate-400 mt-1">Across {gradedCount} graded assignment{gradedCount === 1 ? '' : 's'}</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-400 font-mono">Not graded</div>
              <div className="text-[11px] text-slate-400 mt-1">Scores are recorded when an instructor publishes grades</div>
            </>
          )}
        </SectionCard>

        <SectionCard id="history-ai-risk" padding="p-4" className="rounded-2xl bg-slate-900/60 border border-white/10" header={
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Average AI Detection Risk</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
        }>
          {avgDetector != null ? (
            <>
              <div className="text-2xl font-bold text-emerald-300 font-mono">{avgDetector}%</div>
              <div className="text-[11px] text-slate-400 mt-1">Average detection score on file</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-400 font-mono">Not checked</div>
              <div className="text-[11px] text-slate-400 mt-1">No detector scores recorded for these assignments</div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ─── Search & Subject Filter Bar ───────────────────────────────── */}
      <div className="clean-card p-4 rounded-2xl bg-slate-950/60 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search assignments by title, subject, or teacher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full sm:w-48 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Subjects & Modules</option>
            <option value="Mathematics">Mathematics</option>
            <option value="English">English & Literature</option>
            <option value="History">History & Social Studies</option>
            <option value="Computer Science">Computer Science</option>
            <option value="Biology">Biology & Life Sciences</option>
            <option value="Psychology">Psychology</option>
          </select>
        </div>
      </div>

      {/* ─── Archive Table ────────────────────────────────────────────── */}
      {loading ? (
        <div className="clean-card p-12 text-center text-xs text-blue-400 font-mono flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading assignment history ledger…
        </div>
      ) : filteredHistory.length === 0 ? (
        <SectionCard id="history-empty" padding="p-12" className="rounded-3xl text-center border-dashed border-white/10 space-y-3" title="No historical assignments found">
          <Archive className="w-10 h-10 text-slate-500 mx-auto" />
          <div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              New assignments are created with the “New Assignment” button above, and once they are turned in they
              record permanently into this archive. Completed coursework shows up here automatically.
            </p>
          </div>
        </SectionCard>
      ) : (
        <div className="clean-card rounded-2xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-white/10 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Assignment Title</th>
                  <th className="py-3.5 px-4">Subject / Course</th>
                  <th className="py-3.5 px-4">Instructor</th>
                  <th className="py-3.5 px-4">Grade Output</th>
                  <th className="py-3.5 px-4">AI Evasion Check</th>
                  <th className="py-3.5 px-4">Date Completed</th>
                  <th className="py-3.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredHistory.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onSelectAssignment && item.id != null && onSelectAssignment({
                      id: item.id,
                      name: item.title,
                      title: item.title,
                      subject: item.course,
                      teacher_name: item.teacher_name,
                      status: item.status,
                    })}
                    className={`transition-colors ${onSelectAssignment && item.id != null ? 'hover:bg-white/[0.04] cursor-pointer group' : 'hover:bg-white/[0.02]'}`}
                    title={onSelectAssignment && item.id != null ? 'Open assignment in workspace' : undefined}
                  >
                    <td className="py-4 px-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span className={onSelectAssignment && item.id != null ? 'group-hover:text-blue-300 group-hover:underline underline-offset-2' : ''}>
                          {item.title}
                        </span>
                        {onSelectAssignment && item.id != null && (
                          <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-blue-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-slate-300 font-mono text-[11px]">
                      {item.course || '—'}
                    </td>
                    <td className="py-4 px-4 text-slate-400">
                      {item.teacher_name || '—'}
                    </td>
                    <td className="py-4 px-4">
                      {item.grade_letter || item.score_predicted != null ? (
                        <span className="font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          {item.grade_letter || `${Math.round(item.score_predicted)}%`}
                          {item.grade_letter && item.score_predicted != null ? ` (${Math.round(item.score_predicted)}%)` : ''}
                        </span>
                      ) : (
                        <span className="font-mono text-slate-500 px-1 italic">Not graded</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {item.detector_score != null ? (
                        <span className="inline-flex items-center gap-1 font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                          <ShieldCheck className="w-3 h-3" />
                          {(item.detector_score * 100).toFixed(0)}% AI Risk
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-slate-500 px-2 py-0.5 text-[11px]">
                          <ShieldCheck className="w-3 h-3" />
                          Not checked
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-slate-400 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.completed_at || '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {item.status || 'Tracked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── New Assignment modal (operator 08-28) ──────────────────────── */}
      {showNewAssignment && (
        <NewAssignmentModal
          onClose={() => { setShowNewAssignment(false); setCreateNotice(''); }}
          onCreated={({ assignment_id, rubric_saved }) => {
            setShowNewAssignment(false);
            setCreateNotice(`✅ Assignment #${assignment_id} created${rubric_saved ? ' with rubric' : ''}. It now lives in your workspace and will appear in this ledger once turned in.`);
            setTimeout(() => setCreateNotice(''), 6000);
            fetchHistory(subjectFilter);
          }}
        />
      )}
    </div>
  );
}
