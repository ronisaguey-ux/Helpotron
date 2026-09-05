import React, { useState, useEffect } from 'react';
import api from '../api.js';
import NewAssignmentModal from './NewAssignmentModal.jsx';
import Button from './Button';
import {
  Search,
  Download,
  Filter,
  RefreshCw,
  Archive,
  BookOpen,
  Award,
  Calendar,
  ExternalLink,
  Plus,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

function getSubjectChipStyle(course = '') {
  const c = String(course).toLowerCase();
  if (/psych|bio|life|chem|med/.test(c)) {
    return 'bg-sem-cyan/10 text-sem-cyan border-sem-cyan/25';
  }
  if (/math|calc|phys|stat|algebra/.test(c)) {
    return 'bg-sem-indigo/10 text-sem-indigo border-sem-indigo/25';
  }
  if (/hist|eng|lit|gov|soc|phil/.test(c)) {
    return 'bg-sem-amber/10 text-sem-amber border-sem-amber/25';
  }
  if (/cs|code|comp|software|data/.test(c)) {
    return 'bg-sem-green/10 text-sem-green border-sem-green/25';
  }
  return 'bg-secondary-container/10 text-secondary border-secondary/20';
}

function getHistoryStatusChip(status = '') {
  const s = String(status).toLowerCase();
  if (s.includes('completed') || s.includes('submitted') || s.includes('graded')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sem-green/15 text-sem-green border border-sem-green/25 font-medium font-label-caps text-[11px] uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-sem-green" />
        Completed
      </span>
    );
  }
  if (s.includes('archived')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/30 font-medium font-label-caps text-[11px] uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-outline" />
        Archived
      </span>
    );
  }
  if (s.includes('overdue')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error-container/20 text-error border border-error/30 font-medium font-label-caps text-[11px] uppercase">
        <AlertTriangle className="w-3 h-3 text-error" />
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/25 font-medium font-label-caps text-[11px] uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      {status || 'Recorded'}
    </span>
  );
}

export default function AssignmentHistoryView({ userId, onSelectAssignment }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [exportNotice, setExportNotice] = useState('');
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [createNotice, setCreateNotice] = useState('');
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

  const handleExportAll = async () => {
    try {
      const data = await api.exportAllUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `helpotron_user_archive_${userId}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('✅ Complete user data archive exported.');
      setTimeout(() => setExportNotice(''), 4000);
    } catch (e) {
      setExportNotice('❌ Export failed.');
      setTimeout(() => setExportNotice(''), 4000);
    }
  };

  const handleExportAssignment = async (assignmentId, e) => {
    if (e) e.stopPropagation();
    try {
      await api.exportAssignmentData({ assignment_id: assignmentId });
      setExportNotice(`✅ Assignment #${assignmentId} export downloaded.`);
      setTimeout(() => setExportNotice(''), 4000);
    } catch (err) {
      setExportNotice(`❌ Export failed: ${err.message || 'try again.'}`);
      setTimeout(() => setExportNotice(''), 4000);
    }
  };

  const filteredHistory = historyList.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.course || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.teacher_name && item.teacher_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto p-4 md:p-6">
      {/* ─── Header Banner ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display-xl text-headline-lg-mobile md:text-display-xl text-on-background dark:text-inverse-on-surface mb-1">
            Submission Ledger
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Review and analyze your archived study assignments and generated insights.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setShowNewAssignment(true)}
            variant="primary"
            size="sm"
            className="rounded-xl font-label-caps uppercase tracking-wider text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Assignment</span>
          </Button>

          <Button
            onClick={handleExportCsv}
            disabled={historyList.length === 0}
            variant="secondary"
            size="sm"
            className="rounded-xl font-label-caps uppercase tracking-wider text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>

          <button
            onClick={handleExportAll}
            className="p-2.5 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
            title="Export complete archive"
            aria-label="Export complete archive"
          >
            <Download className="w-4 h-4" />
          </button>

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

      {/* ─── Tab: Submission Ledger vs Archived ───────────────────── */}
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
          {/* ─── Archived tab ─────────────────────────────────────── */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-secondary/15 flex items-center justify-center text-secondary">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-title-md text-title-md text-on-surface">Archived Assignments</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Assignments you moved to history from their workspace — openable, revisitable and exportable.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-tabular-stat text-tabular-stat text-on-surface-variant bg-surface-container-low rounded-full px-3 py-1 text-xs shrink-0">
                {`${archivedCards.length} archived`}
              </span>
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
            <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/30 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface/50 border-b border-outline-variant/40 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                    <tr>
                      <th className="py-4 px-6">Assignment Title</th>
                      <th className="py-4 px-6">Subject</th>
                      <th className="py-4 px-6">Due Date</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Actions</th>
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
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-label-caps text-[11px] uppercase ${getSubjectChipStyle(card.course || card.subject)}`}>
                            {card.course || card.subject || 'General'}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-tabular-stat text-tabular-stat text-on-surface-variant">
                          {card.due_date || '—'}
                        </td>
                        <td className="py-4 px-6">
                          {getHistoryStatusChip(card.status || 'Archived')}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={(e) => handleExportAssignment(card.id, e)}
                            className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-xl transition-colors inline-flex items-center justify-center min-h-[44px] min-w-[44px]"
                            title="Export assignment"
                            aria-label="Export assignment"
                          >
                            <Download className="w-4 h-4" />
                          </button>
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

          {/* ─── Ledger Table Area ────────────────────────────────────────── */}
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
            <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/50 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/40 bg-surface/50">
                      <th className="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Assignment Title</th>
                      <th className="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Subject</th>
                      <th className="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Date</th>
                      <th className="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Status</th>
                      <th className="py-4 px-6 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-body-sm text-on-surface divide-y divide-outline-variant/30">
                    {filteredHistory.map((item) => {
                      const isItemOverdue = String(item.status || '').toLowerCase().includes('overdue');
                      return (
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
                          className={`hover:bg-surface-container-low/50 transition-colors group ${onSelectAssignment && item.id != null ? 'cursor-pointer' : ''}`}
                        >
                          <td className="py-4 px-6">
                            <div className="font-title-md text-body-md text-on-background flex items-center gap-2">
                              <span className={onSelectAssignment && item.id != null ? 'group-hover:text-primary transition-colors font-medium' : 'font-medium'}>
                                {item.title}
                              </span>
                              {onSelectAssignment && item.id != null && (
                                <ExternalLink className="w-3.5 h-3.5 text-outline group-hover:text-primary" />
                              )}
                            </div>
                            {item.teacher_name && (
                              <div className="text-on-surface-variant font-body-sm text-xs mt-0.5">
                                Instructor: {item.teacher_name}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-label-caps text-[11px] uppercase ${getSubjectChipStyle(item.course)}`}>
                              {item.course || 'General'}
                            </span>
                          </td>
                          <td className="py-4 px-6 font-tabular-stat text-tabular-stat text-on-surface-variant">
                            <div className={`flex items-center gap-1.5 ${isItemOverdue ? 'text-error font-medium' : ''}`}>
                              {isItemOverdue ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-error" />
                              ) : (
                                <Calendar className="w-3.5 h-3.5 text-outline" />
                              )}
                              <span>{item.completed_at || '—'}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            {getHistoryStatusChip(item.status)}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={(e) => handleExportAssignment(item.id, e)}
                              className="text-on-surface-variant hover:text-primary transition-colors p-2 min-h-[44px] min-w-[44px] rounded-2xl hover:bg-primary-container/10 focus:outline-none focus:ring-2 focus:ring-primary inline-flex items-center justify-center cursor-pointer"
                              title="Export assignment data"
                              aria-label={`Export assignment #${item.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── New Assignment modal ────────────────────────────────────────── */}
      {showNewAssignment && (
        <NewAssignmentModal
          isOpen={showNewAssignment}
          onClose={() => { setShowNewAssignment(false); setCreateNotice(''); }}
          onCreated={({ assignment_id, rubric_saved, imported, subject }) => {
            setShowNewAssignment(false);
            setCreateNotice(imported
              ? `✅ Imported from the link — assignment #${assignment_id} landed in the ${subject || 'assigned'} bubble.`
              : `✅ Assignment #${assignment_id} created${rubric_saved ? ' with rubric' : ''}. It now lives in your workspace.`);
            setTimeout(() => setCreateNotice(''), 6000);
            fetchHistory(subjectFilter);
          }}
        />
      )}
    </div>
  );
}
