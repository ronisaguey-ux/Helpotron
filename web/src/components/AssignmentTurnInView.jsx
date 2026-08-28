// Turn In & Assignment History (feature 08-27)
// "Mark assignments as turned in — when that happens, the assignment
// automatically moves into the assignment history."
// Self-contained section: active assignments with a "Turn in" button, and a
// history list of turned-in assignments with their real turn-in timestamp.
// Undo puts the assignment back in the active list. No grades are shown or
// fabricated here — history only ever contains REAL turned-in assignments.
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api.js';
import SectionCard from './SectionCard.jsx';
import {
  History as HistoryIcon,
  Send,
  RotateCcw,
  Calendar,
  BookOpen,
  Archive,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

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
      setError('Could not load assignments (server offline or not signed in).');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists, userId]);

  const handleTurnIn = async (assignment) => {
    const label = assignment.title || `assignment #${assignment.id}`;
    if (!window.confirm(`Turn in "${label}"? It will move into your assignment history.`)) return;
    setActionId(assignment.id);
    try {
      await api.turnInAssignment(assignment.id, true);
      await fetchLists();
    } catch (e) {
      setError('Turn-in failed — please try again.');
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
      setError('Undo failed — please try again.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <SectionCard
      id="turn-in-history"
      padding="p-5"
      className="rounded-3xl bg-slate-950/60 border border-white/10 space-y-5"
      header={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <HistoryIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Turn In &amp; Assignment History
                <span className="text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/25 px-2 py-0.5 rounded-full">
                  {historyList.length} turned in
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Turn an assignment in to move it out of active and into your history ledger.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchLists}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
        </div>
      }
    >
      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-mono">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-blue-400 font-mono flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Loading assignments…
        </div>
      ) : (
        <>
          {/* ─── Active assignments ─────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              Active Assignments ({activeList.length})
            </h4>

            {activeList.length === 0 ? (
              <div className="p-5 rounded-2xl border border-dashed border-white/10 text-center text-xs text-slate-500">
                No active assignments — everything is either turned in or not on file yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {activeList.map((a) => (
                  <div
                    key={a.id}
                    className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-blue-500/30 transition flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{a.title || '(untitled)'}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {a.due_date || 'No deadline'}
                          </span>
                          {(a.progress && (a.progress.course || a.progress.subject)) && (
                            <span>{(a.progress.course || a.progress.subject) || ''}</span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/25">
                        {a.status || 'tracked'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTurnIn(a)}
                      disabled={actionId === a.id}
                      className="self-end flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                    >
                      {actionId === a.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Turn in
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Assignment history (turned in) ─────────────────────── */}
          <div>
            <h4 className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <HistoryIcon className="w-3.5 h-3.5 text-slate-400" />
              Assignment History ({historyList.length})
            </h4>

            {historyList.length === 0 ? (
              <div className="p-6 rounded-2xl border border-dashed border-white/10 text-center space-y-2">
                <Archive className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-400">Nothing turned in yet</p>
                <p className="text-[11px] text-slate-500">
                  Assignments you turn in will appear here with their turn-in timestamp.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/70 border-b border-white/10 text-slate-400 font-mono text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Assignment</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3">Turned In</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">History Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {historyList.map((h) => (
                        <tr key={h.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-3 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[240px]">{h.title || '(untitled)'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                            {h.due_date || '—'}
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                            {formatDate(h.turned_in_at)}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                              {h.status || 'tracked'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleUndo(h)}
                              disabled={actionId === h.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                            >
                              {actionId === h.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              Move back
                            </button>
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
    </SectionCard>
  );
}
