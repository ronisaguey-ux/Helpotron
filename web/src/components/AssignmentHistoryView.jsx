import React, { useState, useEffect } from 'react';
import api from '../api.js';
import SectionCard from './SectionCard.jsx';
import NewAssignmentModal from './NewAssignmentModal.jsx';
import Button from './Button';
import {
  History as HistoryIcon,
  Search,
  Download,
  Filter,
  ShieldCheck,
  RefreshCw,
  Archive,
  BookOpen,
  Award,
  Calendar,
  ExternalLink,
  Plus,
} from 'lucide-react';

/* Aurora semantic chip tints (scoped): .aurora-chip keeps its glass pill
   base from index.css; these modifiers recolor it for status semantics. */
const AURORA_CHIP_TINTS = `
.aurora-chip.ok    { background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.32); color: #6ee7b7; }
.aurora-chip.tight { padding: 0.15rem 0.6rem; font-size: 0.75rem; }
`;

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
      <style>{AURORA_CHIP_TINTS}</style>

      {/* ─── Header Banner ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.25)] flex items-center justify-center text-[var(--accent)]">
            <HistoryIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Assignment History & Submission Archive</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Permanent verified ledger of all synthesized and submitted coursework across all semesters.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowNewAssignment(true)}
            variant="primary"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Assignment</span>
          </Button>

          <Button
            onClick={handleExportCsv}
            disabled={historyList.length === 0}
            variant="secondary"
            size="sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </Button>

          <Button
            onClick={() => fetchHistory(subjectFilter)}
            disabled={loading}
            variant="ghost"
            size="sm"
            ariaLabel="Refresh history"
            title="Refresh history"
            className={`px-2.5 ${loading ? 'cursor-wait' : ''}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--accent)]' : ''}`} />
          </Button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-[rgba(16,185,129,0.10)] border border-[rgba(16,185,129,0.32)] rounded-[var(--radius-md)] text-xs text-[#6ee7b7] font-mono">
          {exportNotice}
        </div>
      )}
      {createNotice && (
        <div className="p-3 bg-[rgba(139,92,246,0.10)] border border-[rgba(139,92,246,0.30)] rounded-[var(--radius-md)] text-xs text-[var(--accent)] font-mono">
          {createNotice}
        </div>
      )}

      {/* ─── Metric Summary Cards (honest, computed from ledger contents) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SectionCard id="history-total-completed" padding="p-5" header={
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Assignments in Ledger</span>
            <BookOpen className="w-4 h-4 text-[var(--accent)]" />
          </div>
        }>
          <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">{historyList.length}</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            {`${historyList.length} assignment${historyList.length === 1 ? '' : 's'} on record`}
          </div>
        </SectionCard>

        <SectionCard id="history-average-grade" padding="p-5" header={
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Average Recorded Score</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
        }>
          {avgScore != null ? (
            <>
              <div className="text-2xl font-bold text-amber-300 font-mono">{avgScore}%</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">
                {`Across ${gradedCount} graded assignment${gradedCount === 1 ? '' : 's'}`}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-[var(--text-muted)] font-mono">Not graded</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">Scores are recorded when an instructor publishes grades</div>
            </>
          )}
        </SectionCard>

        <SectionCard id="history-ai-risk" padding="p-5" header={
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Average AI Detection Risk</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
        }>
          {avgDetector != null ? (
            <>
              <div className="text-2xl font-bold text-emerald-300 font-mono">{avgDetector}%</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">Average detection score on file</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-[var(--text-muted)] font-mono">Not checked</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">No detector scores recorded for these assignments</div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ─── Search & Subject Filter Bar ───────────────────────────────── */}
      <div className="clean-card p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search assignments by title, subject, or teacher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] clean-input text-xs font-mono text-[var(--text-primary)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full sm:w-48 clean-input rounded-[var(--radius-md)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none"
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
        <div className="clean-card p-12 text-center text-xs text-[var(--accent)] font-mono flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading assignment history ledger…
        </div>
      ) : filteredHistory.length === 0 ? (
        <SectionCard id="history-empty" padding="p-12" className="text-center space-y-3" title="No historical assignments found">
          <Archive className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
          <div>
            <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mt-1">
              New assignments record into this archive once completed; finished coursework lands here automatically.
            </p>
          </div>
        </SectionCard>
      ) : (
        <div className="clean-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono text-[11px]">
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
              <tbody className="divide-y divide-[var(--border-subtle)]">
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
                    className={`transition-colors ${onSelectAssignment && item.id != null ? 'hover:bg-white/5 cursor-pointer group' : 'hover:bg-white/5'}`}
                    title={onSelectAssignment && item.id != null ? 'Open assignment in workspace' : undefined}
                  >
                    <td className="py-4 px-4 font-semibold text-[var(--text-primary)]">
                      <div className="flex items-center gap-2">
                        <span className={onSelectAssignment && item.id != null ? 'group-hover:text-[var(--accent)] group-hover:underline underline-offset-2' : ''}>
                          {item.title}
                        </span>
                        {onSelectAssignment && item.id != null && (
                          <ExternalLink className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent)]" />
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[var(--text-secondary)] font-mono text-[11px]">
                      {item.course || '—'}
                    </td>
                    <td className="py-4 px-4 text-[var(--text-muted)]">
                      {item.teacher_name || '—'}
                    </td>
                    <td className="py-4 px-4">
                      {item.grade_letter || item.score_predicted != null ? (
                        <span className="aurora-chip tight font-mono font-bold">
                          {item.grade_letter || `${Math.round(item.score_predicted)}%`}
                          {item.grade_letter && item.score_predicted != null ? ` (${Math.round(item.score_predicted)}%)` : ''}
                        </span>
                      ) : (
                        <span className="font-mono text-[var(--text-muted)] px-1 italic">Not graded</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {item.detector_score != null ? (
                        <span className="aurora-chip tight ok">
                          <ShieldCheck className="w-3 h-3" />
                          {(item.detector_score * 100).toFixed(0)}% AI Risk
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-[var(--text-muted)] px-2 py-0.5 text-[11px]">
                          <ShieldCheck className="w-3 h-3" />
                          Not checked
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.completed_at || '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="aurora-chip tight ok">
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
            setCreateNotice(`✅ Assignment #${assignment_id} created${rubric_saved ? ' with rubric' : ''}. It now lives in your workspace and will appear in this ledger once completed.`);
            setTimeout(() => setCreateNotice(''), 6000);
            fetchHistory(subjectFilter);
          }}
        />
      )}
    </div>
  );
}
