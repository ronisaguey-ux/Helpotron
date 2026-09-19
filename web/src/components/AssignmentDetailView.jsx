import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Download,
  Archive,
  Check,
  Send,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  Bot,
  User,
} from 'lucide-react';
import api from '../api.js';
import StatusChip from './StatusChip.jsx';
import DueChip from './DueChip.jsx';
import DirectionPicker from './DirectionPicker.jsx';
import AgentTimeline from './AgentTimeline.jsx';
import WorkingDraftCard from './WorkingDraftCard.jsx';
import AssignmentConfigPanel from './AssignmentConfigPanel.jsx';
import ChatBubble from './ChatBubble.jsx';
import ThinkingBubble from './ThinkingBubble.jsx';
import { getAssignmentBucket } from '../lib/assignmentBuckets.js';

/**
 * AssignmentDetailView Component — Stitch Screen 3.5.1 Specification
 *
 * Comprehensive Bento Workspace for an active assignment node:
 *  - Cockpit header with breadcrumbs, ID mono pill, StatusChip, DueChip, and quick actions
 *  - Left Column: DirectionPicker (3.5.2), Team Chat Stream with ThinkingBubble (3.5.5), Level-2 Config Panel (3.5.6 & 3.5.7)
 *  - Right Column: Agent Execution Timeline with 3-state Stop (3.5.3), Working Draft Card (3.5.4)
 *  - Sticky action bar on mobile viewport
 */
export function AssignmentDetailView({
  assignment,
  userId = 'student_demo',
  onBack,
  onGoToHistory = null,
}) {
  const [full, setFull] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals & Chat
  // Owner 2026-09-19: "Launch to Doc" is a HAND-OFF, not a typing stream. It
  // records that this assignment is being worked on; the extension then shows
  // it as ready. No modal, no auto-typing.
  const [launching, setLaunching] = useState(false);
  const [launchNotice, setLaunchNotice] = useState('');
  const [launchError, setLaunchError] = useState('');

  const handleLaunchToDoc = async () => {
    setLaunching(true);
    setLaunchError('');
    setLaunchNotice('');
    try {
      const res = await api.request('/api/launch-to-doc/launch', {
        method: 'POST',
        body: JSON.stringify({ assignment_id: assignment?.id ?? null }),
      });
      setLaunchNotice(
        (res && res.message) ||
        'Ready in the extension — open Helpotron there and press Start when you want it typed.'
      );
    } catch (e) {
      setLaunchError(String((e && e.message) || e));
    } finally {
      setLaunching(false);
    }
  };
  const [teamChat, setTeamChat] = useState([]);
  const [teamInput, setTeamInput] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState('');

  // Direction state
  const [directionInfo, setDirectionInfo] = useState(null);
  const [directionLoading, setDirectionLoading] = useState(false);
  const [selectedDirection, setSelectedDirection] = useState(null);

  // Lifecycle states
  const [interrupted, setInterrupted] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [markedDone, setMarkedDone] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');

  const chatBottomRef = useRef(null);

  const assignmentId = assignment?.id;

  // Load assignment full view & chat history
  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.assignmentFullView(assignmentId).catch(() => null),
      api.agentChatHistory(assignmentId).catch(() => null),
      api.getAssignmentDirection(assignmentId).catch(() => null),
    ])
      .then(([fullData, chatData, dirData]) => {
        if (cancelled) return;
        if (fullData?.assignment) setFull(fullData.assignment);
        if (Array.isArray(fullData?.materials)) setMaterials(fullData.materials);

        if (Array.isArray(chatData?.chat)) {
          setTeamChat(chatData.chat);
        } else if (Array.isArray(chatData?.messages)) {
          setTeamChat(chatData.messages);
        }

        if (dirData && typeof dirData === 'object') {
          setDirectionInfo(dirData);
          if (dirData.direction) setSelectedDirection(dirData.direction);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  // Scroll chat into view on update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [teamChat]);

  if (!assignment) {
    return (
      <div className="max-w-7xl mx-auto p-6 md:p-12 animate-fadeIn">
        <div className="rounded-3xl bg-surface-container-lowest border border-outline-variant/30 p-12 text-center flex flex-col items-center gap-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-error/15 text-error flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="font-title-md text-title-md text-on-surface font-semibold">
            No assignment node selected
          </h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm">
            Select an assignment from your home dashboard or course directory to open its workspace.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  const title = full?.name || assignment.name || full?.title || assignment.title || 'Assignment';
  const subject = full?.subject || assignment.subject || '';
  const classCode = full?.class_code || assignment.class_code || '';
  const status = markedDone ? 'completed' : full?.status || assignment.status || 'not_started';
  const dueDate = full?.due_date || assignment.due_date;
  const bucket = markedDone ? 'completed' : directionInfo?.bucket || getAssignmentBucket(status);

  // Direction choice handler
  const handleSelectDirection = async (dir, customText = null) => {
    setSelectedDirection(dir);
    try {
      await api.chooseAssignmentDirection(assignmentId, dir, customText);
      setNotice(`✅ Autonomous research vector set to "${dir.replace(/_/g, ' ')}".`);
      setTimeout(() => setNotice(''), 4000);
      // Refresh state
      const dirData = await api.getAssignmentDirection(assignmentId).catch(() => null);
      if (dirData) setDirectionInfo(dirData);
    } catch (err) {
      setNotice(`❌ Failed to set vector: ${err.message || 'try again.'}`);
      setTimeout(() => setNotice(''), 5000);
    }
  };

  // Stop Execution
  const handleInterrupt = async () => {
    if (!assignmentId) return;
    setInterrupting(true);
    try {
      await api.interruptSubagentTeam(assignmentId, 'Student clicked Stop Execution');
      setInterrupted(true);
      setNotice('⚠️ Pipeline halted. Subagent processes paused.');
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      console.error('Failed to interrupt team:', err);
    } finally {
      setInterrupting(false);
    }
  };

  // Mark as Done
  const handleMarkDone = async () => {
    setMarkingDone(true);
    try {
      await api.markAssignmentDone(assignmentId);
      setMarkedDone(true);
      setNotice('✅ Assignment marked complete and verified.');
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setNotice(`❌ Failed to mark done: ${err.message || 'try again.'}`);
      setTimeout(() => setNotice(''), 4000);
    } finally {
      setMarkingDone(false);
    }
  };

  // Archive to History
  const handleArchive = async () => {
    setArchiving(true);
    try {
      await api.archiveAssignment(assignmentId);
      setNotice('📦 Assignment archived to Submission Ledger.');
      setTimeout(() => {
        if (onGoToHistory) onGoToHistory();
        else onBack();
      }, 1200);
    } catch (err) {
      setNotice(`❌ Failed to archive: ${err.message || 'try again.'}`);
      setTimeout(() => setNotice(''), 4000);
      setArchiving(false);
    }
  };

  // Export JSON
  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportAssignmentData({ assignment_id: assignmentId });
      setNotice('✅ Assignment payload archive exported.');
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setNotice(`❌ Export failed: ${err.message || 'try again.'}`);
      setTimeout(() => setNotice(''), 4000);
    } finally {
      setExporting(false);
    }
  };

  // Send Team Chat Message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const text = teamInput.trim();
    if (!text || teamBusy) return;

    setTeamInput('');
    setTeamError('');
    setTeamBusy(true);

    const optimistic = {
      id: `local_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setTeamChat((prev) => [...prev, optimistic]);

    try {
      const res = await api.agentChat({ assignment_id: assignmentId, text });
      const replyText = res?.reply || res?.message || 'Instruction received. Pipeline updated.';
      setTeamChat((prev) => [
        ...prev,
        {
          id: `reply_${Date.now()}`,
          sender: 'agent',
          text: replyText,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setTeamChat((prev) => prev.filter((m) => m.id !== optimistic.id));
      setTeamError(err.message || 'Could not dispatch message to agent node.');
    } finally {
      setTeamBusy(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-4 md:p-8 space-y-8 animate-fadeIn">
      {/* System Notice Toast */}
      {notice && (
        <div className="p-3.5 bg-primary/10 border border-primary/30 rounded-2xl text-xs text-primary font-label-caps uppercase tracking-wider flex items-center gap-2 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* §3.5.1 HEADER & META COCKPIT */}
      <div className="flex flex-col gap-5 pb-6 border-b border-outline-variant/15">
        {/* Breadcrumb + Ref Code Line */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-label-caps uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Active Subjects</span>
            <span>/</span>
            <span className="text-on-surface truncate max-w-xs">{title}</span>
          </button>

          <div className="flex items-center gap-2 font-code-sm text-xs text-on-surface-variant">
            <span className="bg-surface-container-high px-2.5 py-0.5 rounded-md font-mono text-primary">
              ID // {String(assignmentId).slice(-6)}
            </span>
            {(subject || classCode) && (
              <span className="bg-surface-container-low border border-outline-variant/20 px-2.5 py-0.5 rounded-md text-on-surface">
                {[subject, classCode].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* Title Block & Cockpit Quick Actions Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-3xl">
            <h1 className="font-headline-lg text-2xl md:text-3xl font-bold text-on-surface tracking-tight leading-snug">
              {title}
            </h1>

            {/* Status, Due Date, and Telemetry Badges */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <StatusChip status={status} size="default" />
              <DueChip dueDate={dueDate} status={status} size="default" />
              <span className="font-chip-status text-[10px] text-on-surface-variant bg-surface-container-high/80 px-2.5 py-1 rounded-lg">
                ASSIGNMENT AGENT
              </span>
            </div>
          </div>

          {(launchNotice || launchError) && (
            <div className="w-full flex items-center gap-2 pb-2">
              <span className={`font-body-sm text-xs ${launchError ? 'text-error' : 'text-secondary'}`}>
                {launchError ? `⚠️ ${launchError}` : `✓ ${launchNotice}`}
              </span>
            </div>
          )}

          {/* Desktop Cockpit Quick Actions */}
          <div className="hidden sm:flex items-center gap-2.5 flex-wrap self-start lg:self-center">
            <button
              type="button"
              onClick={handleLaunchToDoc}
              disabled={launching}
              className="h-11 px-4 rounded-xl bg-secondary/15 hover:bg-secondary/25 border border-secondary/30 text-secondary font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              title="Send this assignment to the extension, ready to type"
            >
              <Sparkles className="w-4 h-4" />
              <span>{launching ? 'Launching…' : 'Launch to Doc'}</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="h-11 px-4 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-on-surface font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer"
              title="Export complete assignment JSON"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="h-11 px-4 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-error transition-colors flex items-center gap-2 cursor-pointer font-label-caps text-xs uppercase tracking-wider"
              title="Archive to history"
            >
              <Archive className="w-4 h-4" />
              <span>Archive</span>
            </button>

            <button
              type="button"
              onClick={handleMarkDone}
              disabled={markingDone || markedDone}
              className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider shadow-[0_0_24px_rgba(89,216,201,0.25)] hover:bg-primary-container disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer active:scale-95 font-semibold"
            >
              <Check className="w-4 h-4 stroke-[2]" />
              <span>{markedDone ? 'Completed' : 'Mark as Done'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* CORE WORKSPACE BENTO GRID (12 Cols: Left 7 Cols, Right 5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Direction Matrix + Team Chat Stream + Config Panel (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {/* §3.5.2 6-Tile Direction Picker */}
          <section className="rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 md:p-8 shadow-sm">
            <DirectionPicker
              selectedDirection={selectedDirection}
              onSelectDirection={handleSelectDirection}
              disabled={markedDone}
            />
          </section>

          {/* §3.5.5 Team Bubble Chat Stream */}
          <section className="rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 md:p-8 shadow-sm flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-outline-variant/15 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center">
                  <Bot className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div>
                  <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                    Subagent Team Workspace Thread
                  </h3>
                  <p className="font-code-sm text-xs text-on-surface-variant">
                    Direct interaction lane for prompt refinement and constraint injection
                  </p>
                </div>
              </div>
            </div>

            {/* Chat Messages Feed */}
            <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-2">
              {/* Thinking Bubble at top of thread */}
              <ThinkingBubble
                thought={
                  full?.reasoning_chain ||
                  `Analyzing ${subject || 'coursework'} requirements for "${title}". Formulating structural argument vectors and preparing research proof trees.`
                }
                tokens={142}
                defaultExpanded={false}
              />

              {teamChat.length === 0 ? (
                <div className="py-8 text-center text-xs font-code-sm text-on-surface-variant italic">
                  Session initialized. Send a directive or guideline to instruct the subagent team.
                </div>
              ) : (
                teamChat.map((msg, idx) => (
                  <ChatBubble
                    key={msg.id || idx}
                    message={msg}
                    onRetry={() => handleSendMessage()}
                  />
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Error notice if send failed */}
            {teamError && (
              <div className="p-3 bg-error/10 border border-error/30 rounded-xl text-xs text-error font-code-sm">
                {teamError}
              </div>
            )}

            {/* Message Composer Input */}
            <form onSubmit={handleSendMessage} className="flex gap-2 pt-2 border-t border-outline-variant/15">
              <input
                type="text"
                value={teamInput}
                onChange={(e) => setTeamInput(e.target.value)}
                placeholder={`Instruct the agent team about ${title}...`}
                disabled={teamBusy}
                className="flex-1 h-11 px-4 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-body-sm text-xs focus:border-primary focus:outline-none shadow-inner"
              />
              <button
                type="submit"
                disabled={!teamInput.trim() || teamBusy}
                className="h-11 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
              >
                {teamBusy ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Send</span>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* §3.5.6 & §3.5.7 Level 2 Assignment Settings & Context Cards */}
          <AssignmentConfigPanel
            assignment={assignment}
            fullData={full}
            materials={materials}
          />
        </div>

        {/* RIGHT COLUMN: Agent Timeline + Working Draft Bento (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          {/* §3.5.3 Agent Execution Timeline */}
          <AgentTimeline
            subagents={full?.subagent_progress || []}
            bucket={bucket}
            isInterrupted={interrupted}
            onInterrupt={handleInterrupt}
            interrupting={interrupting}
          />

          {/* §3.5.4 Working Draft Output Card */}
          <WorkingDraftCard
            draft={full}
            assignment={assignment}
            loading={loading}
            onMarkDone={handleMarkDone}
            onArchive={handleArchive}
            onLaunchToDoc={handleLaunchToDoc}
            onExport={handleExport}
            onPickDirection={() => {
              window.scrollTo({ top: 180, behavior: 'smooth' });
            }}
            markingDone={markingDone}
            archiving={archiving}
          />
        </div>
      </div>

      {/* MOBILE STICKY ACTION BAR (Spec 3.5.1 Bar B) */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 p-3 flex items-center justify-between gap-3 shadow-2xl">
        <button
          type="button"
          onClick={handleLaunchToDoc}
          className="h-11 px-3 rounded-xl bg-secondary/15 text-secondary font-label-caps text-xs uppercase tracking-wider flex items-center justify-center border border-secondary/30 flex-1"
        >
          <Sparkles className="w-4 h-4 mr-1.5" />
          <span>Launch</span>
        </button>

        <button
          type="button"
          onClick={handleMarkDone}
          disabled={markingDone || markedDone}
          className="h-11 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 flex-2 font-semibold"
        >
          <Check className="w-4 h-4 stroke-[2]" />
          <span>{markedDone ? 'Done' : 'Mark Done'}</span>
        </button>
      </div>

    </div>
  );
}

export default AssignmentDetailView;
