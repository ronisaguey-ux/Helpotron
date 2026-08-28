// Complete Assignment Workspace with Subagent Team, Task Graph & Context Dock
// (operator 08-27: the hardcoded sample SUBAGENTS / TASKS / "next action"
// mock was removed — everything renders from the real card payload and the
// /api/assignment/{id}/full-view response, with honest empty states.)
import React, { useEffect, useRef, useState } from 'react';
import { Users, CheckCircle2, Circle, Clock, MessageSquare, Paperclip, BookOpen, Brain, Sparkles, EyeOff, Send, RefreshCw } from 'lucide-react';
import api from '../api.js';

const SUBAGENT_STATUS_LABEL = {
  completed: 'COMPLETE',
  running: 'WORKING',
  in_progress: 'WORKING',
  pending: 'WAITING',
  failed: 'FAILED',
};

export const AssignmentWorkspace = ({ assignment, userId, onBack }) => {
  const [full, setFull] = useState(null);
  const [fullMaterials, setFullMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
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

  if (!assignment) {
    return (
      <div className="max-w-7xl mx-auto p-6 text-center text-xs text-slate-400">
        No assignment selected. <button className="text-blue-300 cursor-pointer" onClick={onBack}>Go back</button>
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

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto p-6 space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{title}</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">{course}</span>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-[11px] font-mono text-slate-400 hover:text-white transition cursor-pointer underline underline-offset-2"
              >
                ← Back to dashboard
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Due: {due} • Teacher: {teacher} • Status: {status}
          </p>
        </div>
      </div>

      {/* Subagent Team Live Ribbon — REAL progress from the assignment row */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-primary shrink-0" /> Subagent Team
        </h3>
        {subagents.length === 0 ? (
          <div className="p-4 rounded-lg border bg-card/40 text-xs text-muted-foreground space-y-2">
            {loading ? (
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 shrink-0" /> Loading sub-agent activity…
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 shrink-0 text-primary" />
                  {/* Honest empty state (operator 08-28): a fresh auto-routed
                      assignment has ZERO real activity — say why, and show the
                      dump provenance instead of a bug-looking bare line. */}
                  <span>
                    No sub-agent activity recorded for this assignment yet
                    {dumpInfo
                      ? <span className="text-muted-foreground/80"> — {dumpRouteLabel} your Assignment Dump (id {dumpInfo.id}){subject ? ` · ${subject}` : ''}, and no study tool has been generated for it.</span>
                      : subject
                        ? <span className="text-muted-foreground/80"> ({subject}) — nothing has been generated for it yet.</span>
                        : '.'}
                  </span>
                </div>
                {dumpInfo && (
                  <div className="text-[10px] font-mono text-muted-foreground/80 leading-relaxed">
                    {dumpInfo.file_name || `Dump #${dumpInfo.id}`} · {dumpInfo.file_type || 'document'} · status: {dumpInfo.status}{' '}
                    {dumpInfo.status === 'auto_routed' && <span className="text-muted-foreground/60">(auto-routed — no action requested yet)</span>}
                  </div>
                )}
                <div className="text-[11px] leading-relaxed">
                  {dumpInfo && dumpInfo.requested_action
                    ? <>You requested <span className="font-mono text-primary">{dumpInfo.requested_action}</span> — it shows up here the moment the team finishes it.</>
                    : <>Next steps: finalize your dump — flashcards / study guide / summary / do-it — or ask your agent in this bubble to start. Progress and tools appear here the moment they really happen.</>}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {subagents.map((agent, i) => {
              const statusLabel = SUBAGENT_STATUS_LABEL[agent.status] || String(agent.status || 'PENDING').toUpperCase();
              const progress = Math.max(0, Math.min(100, Number(agent.progress) || 0));
              return (
                <div key={i} className="p-3 rounded-lg border bg-card/60 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{agent.agent || 'Agent'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                      statusLabel === 'COMPLETE' ? 'bg-emerald-500/10 text-emerald-500' :
                      statusLabel === 'WORKING' ? 'bg-blue-500/10 text-blue-500' :
                      statusLabel === 'FAILED' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
                    }`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1">
                    <div className="bg-primary h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">{progress}% complete</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Talk to the sub-agent team (operator 08-28): the same composer
            pattern as MyAgentView's assignment bubbles — real thread history,
            real reply from the agent, no fabricated messages. */}
        <div className="mt-3" ref={teamChatRef}>
          {teamChat.length > 0 ? (
            <div className="max-h-44 overflow-y-auto space-y-1.5 mb-2 pr-1">
              {teamChat.map((m) => (
                <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap ${
                    m.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800/80 border border-white/5 text-slate-200'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/70 mb-2">This bubble is fresh — ask the agent team to start, or finalize your dump.</p>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-card/40 px-2.5 py-1 focus-within:border-primary/50 transition">
            <input
              ref={teamInputRef}
              type="text"
              value={teamInput}
              onChange={(e) => setTeamInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeamMessage(); } }}
              placeholder="Message the agent team about this assignment…"
              aria-label={`Message the ${title || `assignment ${assignment.id}`} team`}
              className="flex-1 bg-transparent border-none text-[11px] text-slate-100 placeholder-muted-foreground focus:outline-none"
            />
            <button
              type="button"
              onClick={sendTeamMessage}
              disabled={!teamInput.trim() || teamBusy}
              aria-label={`Send message to the ${title || `assignment ${assignment.id}`} team`}
              className="p-1.5 rounded-md bg-primary text-white hover:bg-primary/80 disabled:opacity-30 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          {teamBusy && (
            <div className="flex items-center gap-1.5 text-[10px] text-blue-400 mt-1.5">
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
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-primary shrink-0" /> Prompt
          </h3>
          <div className="p-4 rounded-lg border bg-card/40 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap min-h-[80px]">
            {prompt || 'No prompt recorded for this assignment yet.'}
          </div>
        </section>
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Circle className="w-4 h-4 text-primary shrink-0" /> Rubric
          </h3>
          <div className="p-4 rounded-lg border bg-card/40 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap min-h-[80px]">
            {full && full.rubric ? full.rubric : 'No rubric attached yet.'}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Paperclip className="w-4 h-4 text-primary shrink-0" /> Attached Files
          </h3>
          {attachedFiles.length === 0 ? (
            <div className="p-4 rounded-lg border bg-card/40 text-xs text-muted-foreground">
              No files attached to this assignment yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {attachedFiles.map((f, i) => (
                <li key={i} className="p-2.5 rounded-lg border bg-card/40 text-xs text-muted-foreground font-mono flex items-center gap-2">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-primary shrink-0" /> Saved Materials
          </h3>
          {materials.length === 0 ? (
            <div className="p-4 rounded-lg border bg-card/40 text-xs text-muted-foreground">
              No study materials generated for this assignment yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {materials.map((m) => (
                <li key={m.id} className="p-2.5 rounded-lg border bg-card/40 text-xs font-mono text-muted-foreground flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 text-primary" /> {m.kind}
                  <span className="text-[10px] text-muted-foreground/70 ml-auto">
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5" />
        Sub-agent, rubric, dump and chat data is loaded live from the server — it reflects only activity that was really recorded. (operator 08-28)
      </div>
    </div>
  );
};
export { AssignmentWorkspace as AssignmentDetailView };
export default AssignmentWorkspace;
