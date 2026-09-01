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
  // Archived tab (09-01): archived rows may only exist in the cards payload
  // (they are not part of the turn-in ledger) — pull the cards snapshot and
  // filter client-side on status === 'archived'.
  const [historyTab, setHistoryTab] = useState('ledger'); // 'ledger' | 'archived'
  const [archivedCards, setArchivedCards] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const fetchArchived = async () => {
    setArchivedLoading(true);
    try {
      const data = await api.assignmentCards().catch(() => null);
      const rows = (data && Array.isArray(data.cards)) ? data.cards : [];
      setArchivedCards(rows.filter((c) => String(c.status || '').toLowerCase() === 'archived'));
    } catch (e) {
      console.warn('Failed to load archived assignments:', e);
    } finally {
      setArchivedLoading(false);
    }
  };

  useEffect(() => {
    if (historyTab === 'archived') fetchArchived();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTab, userId]);

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
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Submission Ledger</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Review and analyze your archived study assignments and generated insights.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowNewAssignment(true)}
            variant="primary"
            size="sm"
            className="rounded-xl font-label-caps uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Assignment</span>
          </Button>

          <Button
            onClick={handleExportCsv}
            disabled={historyList.length === 0}
            variant="secondary"
            size="sm"
            className="rounded-xl font-label-caps uppercase tracking-wider"
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
            className={`rounded-xl border border-outline-variant/30 px-2.5 ${loading ? 'cursor-wait' : ''}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
          </Button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl text-xs text-primary font-label-caps uppercase tracking-wider">
          {exportNotice}
        </div>
      )}
      {createNotice && (
        <div className="p-3 bg-secondary/10 border border-secondary/30 rounded-xl text-xs text-secondary font-label-caps uppercase tracking-wider">
          {createNotice}
        </div>
      )}

      {/* ─── Tab: Submission Ledger vs Archived (09-01) ───────────────────── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHistoryTab('ledger')}
          aria-pressed={historyTab === 'ledger'}
          className={`px-4 py-2 rounded-xl text-xs font-label-caps uppercase tracking-wider transition cursor-pointer ${
            historyTab === 'ledger'
              ? 'bg-primary text-on-primary shadow-sm font-semibold'
              : 'border border-outline-variant/30 bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          Submission Ledger
        </button>
        <button
          type="button"
          onClick={() => setHistoryTab('archived')}
          aria-pressed={historyTab === 'archived'}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-label-caps uppercase tracking-wider transition cursor-pointer ${
            historyTab === 'archived'
              ? 'bg-primary text-on-primary shadow-sm font-semibold'
              : 'border border-outline-variant/30 bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Archived{archivedCards.length > 0 ? ` (${archivedCards.length})` : ''}</span>
        </button>
      </div>

      {historyTab === 'archived' ? (
        <>
          {/* ─── Archived tab (09-01) ─────────────────────────────────────── */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-secondary/15 flex items-center justify-center text-secondary">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-title-md text-title-md text-on-surface">Archived Assignments</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Assignments you moved to history from their workspace — openable, revisitable and exportable.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low rounded-full px-3 py-1 text-xs shrink-0">{`${archivedCards.length} archived`}</span>
              <Button
                onClick={fetchArchived}
                disabled={archivedLoading}
                variant="ghost"
                size="sm"
                ariaLabel="Refresh archived assignments"
                title="Refresh archived assignments"
                className={`rounded-xl border border-outline-variant/30 px-2.5 ${archivedLoading ? 'cursor-wait' : ''}`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${archivedLoading ? 'animate-spin text-primary' : ''}`} />
              </Button>
            </div>
          </div>

          {archivedLoading ? (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-12 text-center text-xs text-primary font-label-caps uppercase flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading archived assignments…
            </div>
          ) : archivedCards.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-12 text-center space-y-3">
              <Archive className="w-10 h-10 text-outline mx-auto" />
              <h4 className="font-title-md text-title-md text-on-surface">No archived assignments yet</h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm mx-auto">
                Mark an assignment done and move it to history from its workspace — it stays safely recorded here.
              </p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container-low/50 border-b border-outline-variant/30 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-6">Assignment Title</th>
                      <th className="py-4 px-6">Course</th>
                      <th className="py-4 px-6">Due Date</th>
                      <th className="py-4 px-6">AI Risk</th>
                      <th className="py-4 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm text-on-surface">
                    {archivedCards.map((card) => (
                      <tr
                        key={card.id}
                        onClick={() => onSelectAssignment && card.id != null && onSelectAssignment(card)}
                        className="hover:bg-surface-container-low/50 transition-colors cursor-pointer group"
                      >
                        <td className="py-4 px-6">
                          <div className="font-title-md text-body-md text-on-surface group-hover:text-primary transition-colors flex items-center gap-2">
                            <span>{card.title || card.name || `Assignment #${card.id}`}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-outline group-hover:text-primary" />
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-label-caps text-[11px] px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant uppercase">
                            {card.course || card.subject || 'General'}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-tabular-stat text-tabular-stat text-on-surface-variant">
                          {card.due_date || '—'}
                        </td>
                        <td className="py-4 px-6">
                          {card.score_ai != null ? (
                            <span className="font-label-caps text-[11px] text-primary">
                              {(Number(card.score_ai) * 100).toFixed(0)}% AI Risk
                            </span>
                          ) : (
                            <span className="font-label-caps text-[11px] text-outline">Not checked</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <span className="inline-flex items-center gap-1.5 font-label-caps text-[11px] uppercase text-secondary group-hover:translate-x-0.5 transition-transform">
                            Open <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
      {/* ─── Metric Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs text-on-surface-variant mb-2 font-label-caps uppercase">
            <span>Total Completed</span>
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div className="text-3xl font-bold text-on-surface font-tabular-stat">{historyList.length}</div>
          <div className="font-body-sm text-xs text-on-surface-variant mt-1">Submitted coursework</div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs text-on-surface-variant mb-2 font-label-caps uppercase">
            <span>Average Recorded Score</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          {avgScore != null ? (
            <>
              <div className="text-3xl font-bold text-on-surface font-tabular-stat">{avgScore}%</div>
              <div className="font-body-sm text-xs text-on-surface-variant mt-1">
                {`Across ${gradedCount} graded assignment${gradedCount === 1 ? '' : 's'}`}
              </div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-outline font-tabular-stat">Not graded</div>
              <div className="font-body-sm text-xs text-on-surface-variant mt-1">Scores are recorded when an instructor publishes grades</div>
            </>
          )}
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs text-on-surface-variant mb-2 font-label-caps uppercase">
            <span>Average AI Detection Risk</span>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          {avgDetector != null ? (
            <>
              <div className="text-3xl font-bold text-on-surface font-tabular-stat">{avgDetector}%</div>
              <div className="font-body-sm text-xs text-on-surface-variant mt-1">Average detection score on file</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-outline font-tabular-stat">Not checked</div>
              <div className="font-body-sm text-xs text-on-surface-variant mt-1">No detector scores recorded for these assignments</div>
            </>
          )}
        </div>
      </div>

      {/* ─── Search & Subject Filter Bar ───────────────────────────────── */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
          <input
            type="text"
            placeholder="Search assignments by title, subject, or teacher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-outline shrink-0" />
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full sm:w-56 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3.5 py-2.5 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
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
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-12 text-center text-xs text-primary font-label-caps uppercase flex items-center justify-center gap-2 shadow-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading assignment history ledger…
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-12 text-center space-y-3 shadow-sm">
          <Archive className="w-10 h-10 text-outline mx-auto" />
          <h4 className="font-title-md text-title-md text-on-surface">No historical assignments found</h4>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm mx-auto">
            New assignments record into this archive once completed; finished coursework lands here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low/50 border-b border-outline-variant/30 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="py-4 px-6">Assignment Title</th>
                  <th className="py-4 px-6">Subject / Course</th>
                  <th className="py-4 px-6">Instructor</th>
                  <th className="py-4 px-6">Grade Output</th>
                  <th className="py-4 px-6">AI Evasion Check</th>
                  <th className="py-4 px-6">Date Completed</th>
                  <th className="py-4 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm text-on-surface">
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
                    className={`hover:bg-surface-container-low/50 transition-colors ${onSelectAssignment && item.id != null ? 'cursor-pointer group' : ''}`}
                    title={onSelectAssignment && item.id != null ? 'Open assignment in workspace' : undefined}
                  >
                    <td className="py-4 px-6 font-semibold text-on-surface">
                      <div className="flex items-center gap-2">
                        <span className={onSelectAssignment && item.id != null ? 'group-hover:text-primary transition-colors' : ''}>
                          {item.title}
                        </span>
                        {onSelectAssignment && item.id != null && (
                          <ExternalLink className="w-3.5 h-3.5 text-outline group-hover:text-primary" />
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-label-caps text-[11px] px-2.5 py-1 rounded-full bg-secondary-container/10 text-secondary border border-secondary/20">
                        {item.course || '—'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-on-surface-variant">
                      {item.teacher_name || '—'}
                    </td>
                    <td className="py-4 px-6">
                      {item.grade_letter || item.score_predicted != null ? (
                        <span className="font-tabular-stat font-semibold text-on-surface">
                          {item.grade_letter || `${Math.round(item.score_predicted)}%`}
                          {item.grade_letter && item.score_predicted != null ? ` (${Math.round(item.score_predicted)}%)` : ''}
                        </span>
                      ) : (
                        <span className="font-body-sm text-outline italic text-xs">Not graded</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {item.detector_score != null ? (
                        <span className="inline-flex items-center gap-1.5 font-label-caps text-[11px] text-primary">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {(item.detector_score * 100).toFixed(0)}% AI Risk
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-label-caps text-[11px] text-outline">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Not checked
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-tabular-stat text-tabular-stat text-on-surface-variant">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-outline shrink-0" />
                        <span>{item.completed_at || '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary font-label-caps text-[11px] uppercase font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
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
      </>
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
