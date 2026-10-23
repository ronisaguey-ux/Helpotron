// Completed & Assignment History (feature 08-27; relabeled 08-31)
// "Mark assignments as completed — when that happens, the assignment
// automatically moves into the assignment history."
// Self-contained section: active assignments with a "Mark as Completed"
// button, and a history list of completed assignments with their real
// completion timestamp. Undo puts the assignment back in the active list.
// No grades are shown or fabricated here — history only ever contains REAL
// completed assignments.
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api.js';
import SectionCard from './SectionCard.jsx';
import LaunchToDocModal from './LaunchToDocModal.jsx';
import {
  History as HistoryIcon,
  RotateCcw,
  Calendar,
  BookOpen,
  Archive,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

/* Aurora semantic chip tints (scoped): .aurora-chip keeps its glass pill
   base from index.css; these modifiers recolor it for status semantics. */
const AURORA_CHIP_TINTS = `
.aurora-chip.ok    { background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.32); color: #6ee7b7; }
.aurora-chip.tight { padding: 0.15rem 0.6rem; font-size: 0.75rem; }
`;

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AssignmentTurnInView({ userId }) {
  const [activeList, setActiveList] = useState([]);
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const [launchDocItem, setLaunchDocItem] = useState(null);

  const fetchLists = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activeRes, historyRes] = await Promise.all([
        api.listAssignments(false),
        api.getTurnedInAssignments(),
      ]);
      setActiveList((activeRes && activeRes.assignments) || []);
      setHistoryList((historyRes && historyRes.history) || []);
    } catch (e) {
      console.warn('Turn-in view load failed:', e);
      setError('Could not load assignments. Please check your connection or sign in again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists, userId]);

  const handleTurnIn = async (assignment) => {
    const label = assignment.title || `assignment #${assignment.id}`;
    if (!window.confirm(`Mark "${label}" as completed? It will move into your assignment history.`)) return;
    setActionId(assignment.id);
    try {
      await api.turnInAssignment(assignment.id, true);
      await fetchLists();
    } catch (e) {
      setError('Could not mark assignment as completed. Please check your connection and try again.');
    } finally {
      setActionId(null);
    }
  };

  const handleUndo = async (assignment) => {
    const label = assignment.title || `assignment #${assignment.id}`;
    if (!window.confirm(`Move "${label}" back to active assignments?`)) return;
    setActionId(assignment.id);
    try {
      await api.turnInAssignment(assignment.id, false);
      await fetchLists();
    } catch (e) {
      setError('Could not restore assignment. Please check your connection and try again.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <SectionCard
      id="turn-in-history"
      padding="p-5"
      className="space-y-5"
      header={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.25)] flex items-center justify-center text-[var(--accent)]">
              <HistoryIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                Completed &amp; Assignment History
                <span className="aurora-chip tight">
                  {`${historyList.length} completed`}
                </span>
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Mark an assignment as completed to move it out of active and into your history ledger.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchLists}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-[var(--accent)]' : ''}`} />
            Refresh
          </button>
        </div>
      }
    >
      <style>{AURORA_CHIP_TINTS}</style>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[rgba(244,63,94,0.10)] border border-[rgba(244,63,94,0.32)] rounded-[var(--radius-md)] text-xs text-rose-300 font-mono">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--accent)] font-mono flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Loading assignments…
        </div>
      ) : (
        <>
          {/* ─── Active assignments ─────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
              {`Active Assignments (${activeList.length})`}
            </h4>

            {activeList.length === 0 ? (
              <div className="clean-card p-5 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
                <p className="text-xs text-[var(--text-muted)]">
                  No active assignments — everything is either completed or not on file yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {activeList.map((a) => (
                  <div
                    key={a.id}
                    className="p-4 rounded-[var(--radius-md)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] hover:border-[rgba(139,92,246,0.35)] transition flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{a.title || '(untitled)'}</div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {a.due_date || 'No deadline'}
                          </span>
                          {(a.progress && (a.progress.course || a.progress.subject)) && (
                            <span>{(a.progress.course || a.progress.subject) || ''}</span>
                          )}
                        </div>
                      </div>
                      <span className="aurora-chip tight shrink-0">
                        {a.status || 'tracked'}
                      </span>
                    </div>
                    <div className="self-end flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLaunchDocItem(a)}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[11px] font-semibold bg-violet-500/10 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/25 transition cursor-pointer"
                        title="Launch to Google Doc with assistive typing"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-violet-300" />
                        Launch to Doc
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTurnIn(a)}
                        disabled={actionId === a.id}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 text-[11px] font-semibold bg-[rgba(16,185,129,0.15)] hover:bg-[rgba(16,185,129,0.25)] text-emerald-300 border border-[rgba(16,185,129,0.32)] transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      >
                        {actionId === a.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Mark as Completed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Assignment history (completed) ─────────────────────── */}
          <div>
            <h4 className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <HistoryIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              {`Assignment History (${historyList.length})`}
            </h4>

            {historyList.length === 0 ? (
              <div className="clean-card p-6 text-center space-y-2">
                <Archive className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
                <p className="text-xs text-[var(--text-secondary)]">Nothing completed yet</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Assignments you mark as completed appear here with their completion timestamp.
                </p>
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-subtle)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Assignment</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3">Completed</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {historyList.map((h) => (
                        <tr key={h.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-3 font-semibold text-[var(--text-primary)]">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[240px]">{h.title || '(untitled)'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[var(--text-muted)] font-mono text-[11px]">
                            {h.due_date || '—'}
                          </td>
                          <td className="py-3 px-3 text-[var(--text-secondary)] font-mono text-[11px] whitespace-nowrap">
                            {formatDate(h.turned_in_at)}
                          </td>
                          <td className="py-3 px-3">
                            <span className="aurora-chip tight ok">
                              {h.status || 'tracked'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setLaunchDocItem(h)}
                                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[10px] font-semibold bg-violet-500/10 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/25 transition cursor-pointer"
                                title="Launch to Google Doc with assistive typing"
                              >
                                <Sparkles className="w-3 h-3 text-violet-300" />
                                Launch to Doc
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUndo(h)}
                                disabled={actionId === h.id}
                                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[10px] font-medium border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                              >
                                {actionId === h.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                Move back
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Launch to Doc Accessibility Modal */}
      <LaunchToDocModal
        isOpen={!!launchDocItem}
        assignment={launchDocItem}
        onClose={() => setLaunchDocItem(null)}
      />
    </SectionCard>
  );
}
