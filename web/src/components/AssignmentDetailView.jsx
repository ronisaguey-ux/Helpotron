import React, { useEffect, useRef, useState } from 'react';
import { Users, Circle, Clock, Paperclip, BookOpen, Brain, Sparkles, EyeOff, Send, RefreshCw, AlertCircle, Keyboard, Download, Compass, CheckCircle2, Archive, ArrowRight } from 'lucide-react';
import api from '../api.js';
import LaunchToDocModal from './LaunchToDocModal.jsx';
import { getAssignmentBucket } from '../lib/assignmentBuckets.js';

const SUBAGENT_STATUS_LABEL = {
  completed: 'COMPLETE',
  running: 'WORKING',
  in_progress: 'WORKING',
  pending: 'WAITING',
  failed: 'FAILED',
};

/* Direction picker choices (09-01): the canonical set the backend accepts
 * (direction ∈ do_it_for_me|study_guide|quiz|flashcards|summary|custom). The
 * server may send its own list via the direction endpoint — those win. */
const DIRECTION_OPTIONS = [
  { value: 'do_it_for_me', label: 'Do it for me' },
  { value: 'study_guide', label: 'Study guide' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'flashcards', label: 'Flashcards' },
  { value: 'summary', label: 'Summary' },
  { value: 'custom', label: 'Something else' },
];

/* Aurora semantic chip tints (scoped): .aurora-chip keeps its glass pill
   base from index.css; these modifiers recolor it for status semantics. */
const AURORA_CHIP_TINTS = `
.aurora-chip.ok      { background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.32); color: #6ee7b7; }
.aurora-chip.info    { background: rgba(34,211,238,0.13); border-color: rgba(34,211,238,0.30); color: #67e8f9; }
.aurora-chip.danger  { background: rgba(244,63,94,0.14); border-color: rgba(244,63,94,0.32); color: #fda4af; }
.aurora-chip.tight   { padding: 0.15rem 0.6rem; font-size: 0.75rem; }
`;

export const AssignmentWorkspace = ({ assignment, userId, onBack, onGoToHistory = null }) => {
  const [full, setFull] = useState(null);
  const [fullMaterials, setFullMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showLaunchToDocModal, setShowLaunchToDocModal] = useState(false);
  // Team bubble chat (operator 08-28): the SAME thread MyAgentView's assignment
  // bubbles use (/api/agent/chat/{assignment_id} + POST /api/agent/chat with
  // assignment_id) — so a message sent here lands in the same conversation.
  const [teamChat, setTeamChat] = useState([]);
  const [teamInput, setTeamInput] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState('');
  // Deep-link to the chat (operator 08-28): the dashboard's chat-bubble button
  // opens this workspace with assignment.focus_chat — scroll to the team-chat
  // composer and focus it so the per-assignment chat is the first thing seen.
  const teamChatRef = useRef(null);
  const teamInputRef = useRef(null);
  // ── Direction picker & lifecycle (09-01) ─────────────────────────────────
  // The picker shows while the assignment sits in the pending bucket with no
  // direction chosen; lifecycle actions (mark done → move to history → link
  // to history) live in the Subagent Team ribbon below.
  const [directionInfo, setDirectionInfo] = useState(null);
  const [directionLoading, setDirectionLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [directionNote, setDirectionNote] = useState('');
  const [directionError, setDirectionError] = useState('');
  const [markedDone, setMarkedDone] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [archiveConfirmDismissed, setArchiveConfirmDismissed] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveDone, setArchiveDone] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!assignment || assignment.id == null) return;
    let cancelled = false;
    setLoading(true);
    api.assignmentFullView(assignment.id)
      .then((data) => {
        if (cancelled) return;
        if (data && data.assignment) setFull(data.assignment);
        if (data && Array.isArray(data.materials)) setFullMaterials(data.materials);
      })
      .catch(() => { /* full view optional — card fields still render */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    // Real bubble history — the same persistent store MyAgentView reads, so
    // messages sent from either view show up in both (operator 08-28).
    api.agentChatHistory(assignment.id)
      .then((data) => { if (!cancelled && data && Array.isArray(data.chat)) setTeamChat(data.chat); })
      .catch(() => { /* history is auth-gated; skip silently */ });
    return () => { cancelled = true; };
  }, [assignment && assignment.id]);

  // focus_chat entry point (operator 08-28): the dashboard's chat-bubble
  // button passes the assignment through with focus_chat — bring the tool to
  // the per-assignment agent chat once the view has painted.
  useEffect(() => {
    if (!assignment || !assignment.focus_chat) return;
    const t = setTimeout(() => {
      teamChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      teamInputRef.current?.focus({ preventScroll: true });
    }, 250);
    return () => clearTimeout(t);
  }, [assignment && assignment.id]);

  // Direction state (09-01): real GET — a 404/not-live-yet is treated as "no
  // direction chosen" and the picker falls back to the client-side bucket
  // mapping, never a hard error.
  useEffect(() => {
    if (!assignment || assignment.id == null) return;
    let cancelled = false;
    setDirectionLoading(true);
    api.getAssignmentDirection(assignment.id)
      .then((data) => {
        if (cancelled) return;
        setDirectionInfo(data && typeof data === 'object' ? data : null);
      })
      .catch(() => { if (!cancelled) setDirectionInfo(null); })
      .finally(() => { if (!cancelled) setDirectionLoading(false); });
    return () => { cancelled = true; };
  }, [assignment && assignment.id]);

  if (!assignment) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="clean-card p-12 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
          <h3 className="text-base font-semibold text-[var(--text-primary)]">No assignment selected</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            Pick an assignment from the dashboard to open its workspace.
          </p>
          <button
            className="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-1.5 text-xs font-semibold transition cursor-pointer"
            onClick={onBack}
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const title = assignment.name || assignment.title || 'Assignment';
  const course = [assignment.subject, assignment.class_code].filter(Boolean).join(' · ') || '—';
  const teacher = assignment.teacher_name || '—';
  const due = assignment.due_date || '—';
  const status = full?.status || assignment.status || 'Not started';
  const subagents = (full && full.subagent_progress) || [];
  const attachedFiles = (full && full.attached_files) || [];
  const materials = fullMaterials || [];
  const prompt = (full && full.prompt) || assignment.prompt || '';
  // Provenance (operator 08-28): full.dump_info is the real UniversalDumpItem
  // row (if any) that created/owns this bubble; subject comes back from the
  // same endpoint (real progress value or empty — never fabricated).
  const subject = full?.subject || assignment.subject || '';
  const dumpInfo = full?.dump_info || null;
  // Truthful phrasing of HOW the dump reached this assignment (real status
  // only — fall back to neutral "routed from" for any other status).
  const DUMP_ROUTE_LABELS = {
    auto_routed: 'auto-routed from',
    matched: 'matched from',
    manual_routed: 'routed from',
    finalized: 'finalized from',
  };
  const dumpRouteLabel = dumpInfo ? (DUMP_ROUTE_LABELS[dumpInfo.status] || 'routed from') : '';
  // Lifecycle bucket (09-01): trust the direction endpoint's bucket when it
  // is present; otherwise mirror the mapping client-side from the assignment
  // status (the cards payload may not carry a bucket field).
  const bucket = directionInfo?.bucket || getAssignmentBucket(status);
  const directionChosen = !!(directionInfo && directionInfo.direction);
  const directionLabel = (DIRECTION_OPTIONS.find((o) => o.value === directionInfo?.direction) || {}).label || directionInfo?.direction || '';
  // Dispatch note: the picker's own response note, or a real server-recorded
  // note from the direction endpoint / full view — whatever genuinely exists.
  const dispatchNote =
    directionNote ||
    (directionInfo && ((directionInfo.progress && directionInfo.progress.dispatch_note) || directionInfo.dispatch_note)) ||
    (full && ((full.progress && full.progress.dispatch_note) || full.dispatch_note)) || '';
  const showDirectionPicker = !directionLoading && bucket === 'pending' && !directionChosen && !archiveDone;
  // Picker buttons: server options win, else the canonical built-in set.
  const directionButtons = (Array.isArray(directionInfo && directionInfo.options) && directionInfo.options.length > 0)
    ? directionInfo.options.map((o) =>
        typeof o === 'string' ? { value: o, label: o.replace(/_/g, ' ') } :
        (o && typeof o === 'object') ? { value: o.value || String(o), label: o.label || String(o.value || o) } : { value: String(o), label: String(o) })
    : DIRECTION_OPTIONS;

  /* ── Talk to the sub-agent team (operator 08-28) ──────────────────────── */
  // Same endpoint as MyAgentView's assignment bubbles — the message goes into
  // the assignment's own chat thread and the agent pipeline picks it up.
  async function sendTeamMessage() {
    const text = teamInput.trim();
    if (!text || teamBusy) return;
    setTeamInput('');
    setTeamError('');
    setTeamBusy(true);
    // Optimistic render (MyAgentView pattern) — removed again if the send fails.
    const optimistic = { id: `local_${Date.now()}`, sender: 'user', text, timestamp: new Date().toISOString() };
    setTeamChat((prev) => [...prev, optimistic]);
    try {
      const res = await api.agentChat({ assignment_id: assignment.id, text });
      const replyText = res?.reply || res?.message || '✅ Message sent.';
      setTeamChat((prev) => [...prev, { id: `local_${Date.now()}_r`, sender: 'overlord', text: replyText, timestamp: new Date().toISOString() }]);
    } catch (e) {
      // Message never reached the server — drop the optimistic bubble and say so.
      setTeamChat((prev) => prev.filter((m) => m.id !== optimistic.id));
      setTeamError(e.message || 'Could not reach the agent.');
    } finally {
      setTeamBusy(false);
    }
  }

  /* ── Direction & lifecycle actions (09-01) ─────────────────────────────── */
  async function refreshDirection() {
    try {
      const d = await api.getAssignmentDirection(assignment.id);
      setDirectionInfo(d || null);
    } catch (e) {
      // 404 = endpoint not live / no direction row — picker falls back to
      // the client-side status-bucket mapping.
      setDirectionInfo(null);
    }
  }

  function refreshFullView() {
    setLoading(true);
    api.assignmentFullView(assignment.id)
      .then((data) => {
        if (data && data.assignment) setFull(data.assignment);
        if (data && Array.isArray(data.materials)) setFullMaterials(data.materials);
      })
      .catch(() => { /* full view optional */ })
      .finally(() => setLoading(false));
  }

  async function handleChooseDirection(direction, customTextValue = null) {
    if (choosing) return;
    setChoosing(true);
    setDirectionError('');
    try {
      const res = await api.chooseAssignmentDirection(assignment.id, direction, customTextValue);
      // Truthful dispatch note: the Data Lake route says so verbatim; else
      // the server's dispatch note/message — never a made-up phrase.
      if (res && res.datalake_requested) setDirectionNote("Request sent to Data Lake — we'll build this.");
      else if (res && res.progress && res.progress.dispatch_note) setDirectionNote(String(res.progress.dispatch_note));
      else if (res && res.message) setDirectionNote(String(res.message));
      setCustomOpen(false);
      setCustomText('');
      refreshDirection();
      refreshFullView();
    } catch (e) {
      setDirectionError(e.message || 'Could not set a direction. Try again.');
    } finally {
      setChoosing(false);
    }
  }

  async function handleMarkDone() {
    if (markingDone) return;
    setMarkingDone(true);
    setDirectionError('');
    try {
      const res = await api.markAssignmentDone(assignment.id);
      setMarkedDone(true);
      if (res && res.message) setDirectionNote((prev) => prev || String(res.message));
      refreshDirection();
      refreshFullView();
    } catch (e) {
      setDirectionError(e.message || 'Could not mark this assignment done. Try again.');
    } finally {
      setMarkingDone(false);
    }
  }

  async function handleMoveToHistory() {
    if (!confirm('Move this assignment to your Assignment History? It leaves the dashboard sections — you can still open and export it there.')) return;
    setArchiving(true);
    setDirectionError('');
    try {
      await api.archiveAssignment(assignment.id);
      setArchiveDone(true);
      setArchiveConfirmDismissed(false);
      refreshDirection();
      refreshFullView();
    } catch (e) {
      setDirectionError(e.message || 'Could not archive this assignment. Try again.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleExportAssignment() {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    try {
      await api.exportAssignmentData({ assignment_id: assignment.id });
    } catch (e) {
      setExportError(e && e.status === 404 ? 'Nothing recorded to export for this assignment yet.' : (e.message || 'Export failed — try again.'));
    } finally {
      setExporting(false);
    }
  }

  /* Shared dump provenance line — the real UniversalDumpItem row, if any. */
  const renderDumpLine = () => dumpInfo ? (
    <div className="text-[10px] font-mono text-[var(--text-muted)]/80 leading-relaxed">
      {dumpInfo.file_name || `Dump #${dumpInfo.id}`} · {dumpInfo.file_type || 'document'} · status: {dumpInfo.status}{' '}
      {dumpInfo.status === 'auto_routed' && <span className="opacity-70">(auto-routed — no action requested yet)</span>}
    </div>
  ) : null;

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto p-6 space-y-6">
      <style>{AURORA_CHIP_TINTS}</style>

      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h2>
            <span className="aurora-chip info font-mono">{course}</span>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-[11px] font-mono text-[var(--text-muted)] hover:text-white transition cursor-pointer underline underline-offset-2"
              >
                ← Back to dashboard
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Due: {due} • Teacher: {teacher} • Status: {status}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            {/* Export assignment (09-01): whole-assignment JSON attachment —
                real fetch + Content-Disposition filename from api.js. */}
            <button
              type="button"
              onClick={handleExportAssignment}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)] text-[var(--text-secondary)] text-xs font-semibold transition cursor-pointer disabled:opacity-40"
            >
              {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Export assignment</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLaunchToDocModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-violet-600/25 transition cursor-pointer border border-violet-400/30"
            >
              <Sparkles className="w-4 h-4 text-violet-200" />
              <span>Launch to Doc</span>
            </button>
          </div>
          {exportError && (
            <p className="text-[11px] text-rose-400 font-mono">⚠️ {exportError}</p>
          )}
        </div>
      </div>

      {/* Direction picker (09-01): real dispatch intent — tell the subagent
          team what to build while the assignment is still pending. */}
      {showDirectionPicker && (
        <section ref={pickerRef} className="glass-panel p-5">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-1.5">
            <Compass className="w-4 h-4 text-[var(--accent)] shrink-0" /> Pick what you want for this assignment
          </h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Tell the subagent team what to build — it starts working the moment you pick.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
            {directionButtons.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => (opt.value === 'custom' ? setCustomOpen((c) => !c) : handleChooseDirection(opt.value))}
                disabled={choosing}
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-3 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition cursor-pointer disabled:opacity-40"
              >
                {opt.label}
              </button>
            ))}
          </div>
          {customOpen && (
            <div className="mt-3 space-y-2">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={3}
                placeholder="Describe what you need — e.g. 'a 3-page essay on the civil war, with citations'…"
                className="w-full clean-input px-3 py-2.5 text-xs text-[var(--text-primary)] resize-y"
              />
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                If what you describe isn&apos;t something the app can do yet, it&apos;s automatically sent to the Data Lake and we&apos;ll build it.
              </p>
              <button
                type="button"
                onClick={() => handleChooseDirection('custom', customText)}
                disabled={!customText.trim() || choosing}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer"
              >
                {choosing && <RefreshCw className="w-3 h-3 animate-spin" />} Send to the team
              </button>
            </div>
          )}
          {choosing && !customOpen && (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--accent)] mt-3">
              <RefreshCw className="w-3 h-3 animate-spin" /> Dispatching to the team…
            </div>
          )}
          {directionError && (
            <p className="text-[11px] text-rose-400 mt-3">⚠️ {directionError}</p>
          )}
          {dispatchNote && (
            <div className="mt-3 p-3 rounded-[var(--radius-md)] bg-[rgba(16,185,129,0.10)] border border-[rgba(16,185,129,0.30)] text-xs text-[#6ee7b7] font-mono leading-relaxed">
              {dispatchNote}
            </div>
          )}
        </section>
      )}

      {/* Subagent Team Live Ribbon — REAL progress from the assignment row */}
      <div className="glass-panel p-5">
        <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-[var(--accent)] shrink-0" /> Subagent Team
        </h3>
        {subagents.length === 0 ? (
          <div className="space-y-2 text-xs text-[var(--text-muted)]">
            {loading ? (
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 shrink-0" /> Loading sub-agent activity…
              </div>
            ) : bucket === 'pending' && !directionChosen ? (
              /* Real call-to-action (09-01): a pending assignment with no
                 direction chosen needs one — never the inert bare line. */
              <>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  <span>Choose a direction to start your subagent team</span>
                </div>
                {renderDumpLine()}
                <button
                  type="button"
                  onClick={() => pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  Pick a direction <ArrowRight className="w-3 h-3" />
                </button>
              </>
            ) : dispatchNote ? (
              <>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-[var(--text-secondary)]">{dispatchNote}</span>
                </div>
                {bucket === 'pending' && directionChosen && (
                  <div className="text-[11px] leading-relaxed opacity-80">
                    The team starts on <span className="font-mono text-[var(--accent)]">{directionLabel}</span> — progress appears here the moment it&apos;s really recorded.
                  </div>
                )}
                {renderDumpLine()}
              </>
            ) : bucket === 'pending' && directionChosen ? (
              /* Direction chosen, note not recorded yet — say what the team
                 is starting on instead of an inert line. */
              <>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-[var(--text-secondary)]">
                    The team starts on <span className="font-mono text-[var(--accent)]">{directionLabel}</span> — progress appears here the moment it&apos;s really recorded.
                  </span>
                </div>
                {renderDumpLine()}
              </>
            ) : bucket === 'completed' ? (
              <>
                {!markedDone && !archiveDone && (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span className="text-[var(--text-secondary)]">Work on this assignment is complete — mark it done, then move it to history.</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleMarkDone}
                      disabled={markingDone}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-[11px] font-semibold transition cursor-pointer"
                    >
                      {markingDone ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Mark as done
                    </button>
                  </>
                )}
                {markedDone && !archiveDone && !archiveConfirmDismissed && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px]">Done — move it to Assignment History?</span>
                    <button
                      type="button"
                      onClick={handleMoveToHistory}
                      disabled={archiving}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-[11px] font-semibold transition cursor-pointer"
                    >
                      {archiving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />} Move to history
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveConfirmDismissed(true)}
                      className="text-[10px] text-[var(--text-muted)] hover:text-white underline underline-offset-2 transition cursor-pointer"
                    >
                      Not now
                    </button>
                  </div>
                )}
                {archiveDone && (
                  <>
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span className="text-emerald-300">Archived — it now lives in your Assignment History.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => (onGoToHistory ? onGoToHistory() : (onBack && onBack()))}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] text-[11px] font-semibold transition cursor-pointer"
                    >
                      View in Assignment History <ArrowRight className="w-3 h-3" />
                    </button>
                  </>
                )}
                {renderDumpLine()}
              </>
            ) : bucket === 'in_progress' ? (
              <>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  <span>The team is working on this assignment — progress appears here as it is recorded.</span>
                </div>
                {renderDumpLine()}
              </>
            ) : bucket === 'archived' ? (
              <>
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-[var(--text-secondary)]">This assignment is archived — it lives in your Assignment History.</span>
                </div>
                <button
                  type="button"
                  onClick={() => (onGoToHistory ? onGoToHistory() : (onBack && onBack()))}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] text-[11px] font-semibold transition cursor-pointer"
                >
                  Open Assignment History <ArrowRight className="w-3 h-3" />
                </button>
              </>
            ) : (
              /* Honest fallback (operator 08-28) — a fresh auto-routed
                 assignment with ZERO real activity: say why, and show the
                 dump provenance instead of a bug-looking bare line. */
              <>
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  <span>
                    No sub-agent activity recorded for this assignment yet
                    {dumpInfo
                      ? <span className="opacity-80"> — {dumpRouteLabel} your Assignment Dump (id {dumpInfo.id}){subject ? ` · ${subject}` : ''}, and no study tool has been generated for it.</span>
                      : subject
                        ? <span className="opacity-80"> ({subject}) — nothing has been generated for it yet.</span>
                        : '.'}
                  </span>
                </div>
                {renderDumpLine()}
                <div className="text-[11px] leading-relaxed">
                  {dumpInfo && dumpInfo.requested_action
                    ? <>You requested <span className="font-mono text-[var(--accent)]">{dumpInfo.requested_action}</span> — it shows up here the moment the team finishes it.</>
                    : <>Next steps: finalize your dump — flashcards / study guide / summary / do-it — or ask your agent in this bubble to start. Progress and tools appear here the moment they really happen.</>}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
          {dispatchNote && (
            <div className="mb-3 p-2.5 rounded-[var(--radius-md)] bg-[rgba(16,185,129,0.10)] border border-[rgba(16,185,129,0.30)] text-[11px] text-[#6ee7b7] font-mono leading-relaxed">
              {dispatchNote}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {subagents.map((agent, i) => {
              const statusLabel = SUBAGENT_STATUS_LABEL[agent.status] || String(agent.status || 'PENDING').toUpperCase();
              const progress = Math.max(0, Math.min(100, Number(agent.progress) || 0));
              return (
                <div key={i} className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">{agent.agent || 'Agent'}</span>
                    <span className={`aurora-chip tight font-mono font-medium ${
                      statusLabel === 'COMPLETE' ? 'ok' :
                      statusLabel === 'WORKING' ? 'info' :
                      statusLabel === 'FAILED' ? 'danger' : ''
                    }`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1">
                    <div className="bg-[var(--accent)] h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">{progress}% complete</div>
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* Talk to the sub-agent team (operator 08-28): the same composer
            pattern as MyAgentView's assignment bubbles — real thread history,
            real reply from the agent, no fabricated messages. */}
        <div className="mt-4" ref={teamChatRef}>
          {teamChat.length > 0 ? (
            <div className="max-h-44 overflow-y-auto space-y-1.5 mb-2 pr-1">
              {teamChat.map((m) => (
                <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-[var(--radius-md)] px-3 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words ${
                    m.sender === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--text-muted)] mb-2">This bubble is fresh — ask the agent team to start, or finalize your dump.</p>
          )}
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 focus-within:border-[var(--accent)] transition">
            <input
              ref={teamInputRef}
              type="text"
              value={teamInput}
              onChange={(e) => setTeamInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeamMessage(); } }}
              placeholder="Message the agent team about this assignment…"
              aria-label={`Message the ${title || `assignment ${assignment.id}`} team`}
              className="flex-1 bg-transparent border-none text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            <button
              type="button"
              onClick={sendTeamMessage}
              disabled={!teamInput.trim() || teamBusy}
              aria-label={`Send message to the ${title || `assignment ${assignment.id}`} team`}
              className="p-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          {teamBusy && (
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--accent)] mt-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" /> Agent team is working…
            </div>
          )}
          {teamError && (
            <p className="text-[10px] text-rose-400 mt-1.5">⚠️ Message not sent — {teamError}</p>
          )}
        </div>
      </div>

      {/* Assignment details — real prompt/rubric/files or honest empty states */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="glass-panel p-5">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-[var(--accent)] shrink-0" /> Prompt
          </h3>
          <div className="text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap break-words min-h-[80px]">
            {prompt || 'No prompt recorded for this assignment yet.'}
          </div>
        </section>
        <section className="glass-panel p-5">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
            <Circle className="w-4 h-4 text-[var(--accent)] shrink-0" /> Rubric
          </h3>
          <div className="text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap break-words min-h-[80px]">
            {full && full.rubric ? full.rubric : 'No rubric attached yet.'}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="glass-panel p-5">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-[var(--accent)] shrink-0" /> Attached Files
          </h3>
          {attachedFiles.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)]">
              No files attached to this assignment yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {attachedFiles.map((f, i) => (
                <li key={i} className="p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs text-[var(--text-secondary)] font-mono flex items-center gap-2">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="glass-panel p-5">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-[var(--accent)] shrink-0" /> Saved Materials
          </h3>
          {materials.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)]">
              No study materials generated for this assignment yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {materials.map((m) => (
                <li key={m.id} className="p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-xs font-mono text-[var(--text-muted)] flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" /> {m.kind}
                  <span className="text-[10px] opacity-70 ml-auto">
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <Sparkles className="w-3.5 h-3.5" />
        Sub-agent, rubric, dump and chat data is loaded live from the server — it reflects only activity that was really recorded. (operator 08-28)
      </div>

      <LaunchToDocModal
        isOpen={showLaunchToDocModal}
        assignment={{ ...(full || {}), ...assignment }}
        onClose={() => setShowLaunchToDocModal(false)}
      />
    </div>
  );
};
export { AssignmentWorkspace as AssignmentDetailView };
export default AssignmentWorkspace;
