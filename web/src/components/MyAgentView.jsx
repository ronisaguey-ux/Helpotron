/**
 * MyAgentView.jsx — Master Agent Co-Pilot Canvas & Workspace (Stitch v6 / Family 3.6).
 * Chat-first simplification, glass composer, single segmented mode control, identity switcher,
 * threads rail with effort dial, configs sidebar (4 tabs), permission modal, and honest event bubbles.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send, Paperclip, Mic, ShieldCheck, Shield, Zap, RefreshCw, Trash2, Plus,
  SlidersHorizontal, ChevronDown, ChevronUp, Bot, Sparkles, StopCircle,
  FileText, ExternalLink, ArrowRight, BookOpen, Clock, AlertCircle
} from 'lucide-react';
import api from '../api.js';
import { loadSettings, saveSettings } from '../demoData.js';
import { normalizeCards, computeAssignmentEvents } from '../lib/assignmentEvents.js';
import { deriveAssignmentEvent, HONEST_EVENT_CHIPS, formatTokenMetric } from '../lib/agentEvents.js';
import { PRESET_PERSONAS, DEFAULT_IDENTITIES, DEFAULT_SKILLS } from '../lib/agentPresets.js';
import ModeControl from './ModeControl.jsx';
import IdentityPill from './IdentityPill.jsx';
import ThreadsRail from './ThreadsRail.jsx';
import AgentConfigsSidebar from './AgentConfigsSidebar.jsx';
import PermissionModal from './PermissionModal.jsx';
import LaunchToDocModal from './LaunchToDocModal.jsx';
import ChatBubble from './ChatBubble.jsx';
import ThinkingBubble from './ThinkingBubble.jsx';

export default function MyAgentView({
  userId = null,
  onGoTo = () => {},
  onTokenBalance = () => {},
  onOpenAssignment = () => {},
}) {
  // ── Settings & Identity State ──
  const [settings, setSettings] = useState(() => loadSettings());
  const [mode, setMode] = useState(() => settings.operation_mode || settings.ai?.mode || 'auto');
  const [effortScore, setEffortScore] = useState(() => Number(settings.effort_score || 600));
  const [activeIdentityId, setActiveIdentityId] = useState(() => settings.ai?.persona_id || 'scholar');
  const [identities, setIdentities] = useState(() => settings.ai?.identities || []);
  const [skills, setSkills] = useState(() => DEFAULT_SKILLS);
  const [activeSkillIds, setActiveSkillIds] = useState(() => ['z3_prover', 'latex_derivations', 'humanizer_cadence']);
  const [memory, setMemory] = useState([]);
  const [memoryText, setMemoryText] = useState('');
  const [files, setFiles] = useState([]);

  // ── Threads State ──
  const [threads, setThreads] = useState([
    { id: 1, title: 'CS-441 Raft Invariant Synthesis', messages_count: 14, tokens: 9410 },
    { id: 2, title: 'BIO-309 Chiral Inversion Reactions', messages_count: 8, tokens: 4280 },
    { id: 3, title: 'MATH-202 Topology Manifolds', messages_count: 5, tokens: 2150 },
  ]);
  const [activeThreadId, setActiveThreadId] = useState(1);

  // ── Chat Stream State ──
  const [messages, setMessages] = useState([
    {
      id: 'm1',
      role: 'user',
      text: 'Synthesize the Raft consensus safety invariant proofs and prepare the submission package for CS-441. Verify joint consensus state bounds before generating the deliverable monograph.',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'm2',
      role: 'agent',
      text: "I've synthesized the Raft consensus safety proof tree. Both leader completeness and state machine safety have been rigorously verified with deterministic induction steps. You can launch the final draft into Docs below.",
      timestamp: new Date(Date.now() - 3500000).toISOString(),
      tokens: 840,
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingState, setThinkingState] = useState({ visible: false, text: '', tokens: 0 });
  const [abortController, setAbortController] = useState(null);

  // ── Permissions & Modals ──
  const [pendingPermissions, setPendingPermissions] = useState([]);
  const [activePermission, setActivePermission] = useState(null);
  const [showConfigsSidebar, setShowConfigsSidebar] = useState(false);
  const [launchToDocTarget, setLaunchToDocTarget] = useState(null);

  // ── Lifecycle & Assignment Events (45s Polling) ──
  const [assignmentEvents, setAssignmentEvents] = useState([]);
  const prevCardsRef = useRef(null);
  const chatScrollRef = useRef(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, thinkingState, assignmentEvents, scrollToBottom]);

  // Load initial backend state
  useEffect(() => {
    let mounted = true;

    // Load mode
    api.agentMode?.()
      .then((d) => {
        if (mounted && d?.operation_mode) setMode(d.operation_mode);
      })
      .catch(() => {});

    // Load threads
    api.agentThreads?.()
      .then((res) => {
        if (mounted && Array.isArray(res?.threads) && res.threads.length > 0) {
          setThreads(res.threads);
          setActiveThreadId(res.threads[0].id);
        }
      })
      .catch(() => {});

    // Load memory & files
    api.getAgentMemory?.()
      .then((d) => {
        if (mounted && Array.isArray(d?.entries)) setMemory(d.entries);
      })
      .catch(() => {});

    api.listAgentFiles?.()
      .then((d) => {
        if (mounted && Array.isArray(d?.files)) setFiles(d.files);
      })
      .catch(() => {});

    // Check pending permissions
    api.agentPermissionsPending?.()
      .then((res) => {
        if (mounted && Array.isArray(res?.pending)) {
          setPendingPermissions(res.pending);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  // 45s Assignment Lifecycle Poller
  useEffect(() => {
    let mounted = true;

    async function pollAssignments() {
      try {
        const [cardsRes, turnedInRes] = await Promise.all([
          api.assignmentCards?.().catch(() => null),
          api.getTurnedInAssignments?.().catch(() => null),
        ]);

        if (!mounted || !cardsRes) return;

        const rawCards = Array.isArray(cardsRes) ? cardsRes : cardsRes.cards || [];
        const normalized = normalizeCards(rawCards);

        const turnedInList = Array.isArray(turnedInRes) ? turnedInRes : turnedInRes?.assignments || [];
        const turnedInIds = new Set(turnedInList.map((a) => String(a.id || a.assignment_id)));

        // Compute events
        const events = computeAssignmentEvents({
          prev: prevCardsRef.current,
          cards: normalized,
          turnedInIds,
        });

        if (events && events.length > 0) {
          setAssignmentEvents((prev) => [...prev, ...events]);
        }

        prevCardsRef.current = new Map(normalized.map((c) => [String(c.id), c]));
      } catch (e) {
        console.warn('Assignment polling error:', e);
      }
    }

    pollAssignments();
    const interval = setInterval(pollAssignments, 45000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // ── Mode & Effort Handlers ──
  const handleModeChange = async (nextMode) => {
    setMode(nextMode);
    try {
      await api.setAgentMode?.(nextMode);
      const updated = { ...settings, operation_mode: nextMode, ai: { ...(settings.ai || {}), mode: nextMode } };
      setSettings(updated);
      saveSettings(updated);
    } catch (e) {
      console.warn('Failed to update mode:', e);
    }
  };

  const handleEffortChange = async (score) => {
    setEffortScore(score);
    try {
      const updated = { ...settings, effort_score: score, ai: { ...(settings.ai || {}), effort_score: score } };
      setSettings(updated);
      saveSettings(updated);
      await api.updateSettings?.({ effort_score: score });
    } catch (e) {
      console.warn('Failed to update effort score:', e);
    }
  };

  // ── Thread Handlers ──
  const handleSelectThread = async (threadId) => {
    setActiveThreadId(threadId);
    try {
      const history = await api.agentChatHistory?.(threadId);
      if (Array.isArray(history?.messages)) {
        setMessages(
          history.messages.map((m) => ({
            id: m.id || `msg_${Date.now()}_${Math.random()}`,
            role: m.role || (m.is_user ? 'user' : 'agent'),
            text: m.text || m.content || '',
            timestamp: m.timestamp || m.created_at,
            tokens: m.tokens,
          }))
        );
      }
    } catch (e) {
      console.warn('Failed to fetch thread history:', e);
    }
  };

  const handleCreateThread = async () => {
    try {
      const res = await api.agentThreadCreate?.();
      const newThread = res?.thread || {
        id: Date.now(),
        title: `Thread #${threads.length + 1}`,
        messages_count: 0,
        tokens: 0,
      };
      setThreads((prev) => [newThread, ...prev]);
      setActiveThreadId(newThread.id);
      setMessages([]);
    } catch (e) {
      const fallback = {
        id: Date.now(),
        title: `Thread #${threads.length + 1}`,
        messages_count: 0,
        tokens: 0,
      };
      setThreads((prev) => [fallback, ...prev]);
      setActiveThreadId(fallback.id);
      setMessages([]);
    }
  };

  const handleRenameThread = async (threadId, newTitle) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t))
    );
    try {
      await api.request?.(`/api/agent/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (e) {
      console.warn('Failed to rename thread:', e);
    }
  };

  const handleDeleteThread = async (threadId) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) {
      const remaining = threads.filter((t) => t.id !== threadId);
      if (remaining.length > 0) {
        handleSelectThread(remaining[0].id);
      } else {
        handleCreateThread();
      }
    }
    try {
      await api.request?.(`/api/agent/threads/${threadId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Failed to delete thread:', e);
    }
  };

  // ── Send Prompt & Execution Stream ──
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const query = inputQuery.trim();
    if (!query || isStreaming) return;

    const userMsg = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsStreaming(true);
    setStreamingText('');
    setThinkingState({ visible: true, text: 'Exploring state transitions and verifying proof bounds...', tokens: 120 });

    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Check if streaming is available
      if (api.agentChatStream) {
        await api.agentChatStream({
          text: query,
          thread_id: activeThreadId,
          mode,
          effort: effortScore,
          persona: activeIdentityId,
          signal: controller.signal,
          onThinking: (chunk) => {
            setThinkingState((prev) => ({
              ...prev,
              visible: true,
              text: (prev.text + ' ' + chunk).trim(),
              tokens: prev.tokens + 15,
            }));
          },
          onDelta: (delta) => {
            setStreamingText((prev) => prev + delta);
          },
        });
      } else {
        // Direct chat fallback
        const res = await api.agentChat?.({
          text: query,
          thread_id: activeThreadId,
          session_mode_override: mode,
          effort_score: effortScore,
          persona: activeIdentityId,
        });
        const reply = res?.reply || res?.message || 'Synthesis complete.';
        setMessages((prev) => [
          ...prev,
          {
            id: `agent_${Date.now()}`,
            role: 'agent',
            text: reply,
            timestamp: new Date().toISOString(),
            tokens: res?.tokens_used || 420,
          },
        ]);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'error',
            isError: true,
            text: `Agent execution interrupted: ${err.message || 'Network timeout.'}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      if (streamingText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent_${Date.now()}`,
            role: 'agent',
            text: streamingText,
            timestamp: new Date().toISOString(),
            tokens: 650,
          },
        ]);
      }
      setIsStreaming(false);
      setStreamingText('');
      setAbortController(null);
    }
  };

  const handleStopExecution = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsStreaming(false);
    setThinkingState((prev) => ({ ...prev, visible: false }));
  };

  // ── Permission Decision Handler ──
  const handlePermissionDecision = async (permId, decision, feedback) => {
    try {
      await api.agentPermissionRespond?.({
        permission_id: permId,
        decision,
        comment: feedback || undefined,
      });
      setPendingPermissions((prev) => prev.filter((p) => p.id !== permId));
      setActivePermission(null);
    } catch (e) {
      console.warn('Failed to respond to permission:', e);
      throw e;
    }
  };

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0] || { title: 'CS-445 / BIO-309 Synthesis Co-Pilot' };

  return (
    <div className="relative w-full overflow-hidden max-w-page-max-width mx-auto px-gutter-desktop py-gutter-desktop">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-12 w-80 h-80 rounded-full bg-secondary/5 blur-3xl pointer-events-none" />

      {/* Main 12-Column Grid (§3.6.1 / §3.6.4) */}
      <div className="grid grid-cols-12 gap-unit-6 relative z-10">
        {/* Left Column: Threads Rail + Effort Dial */}
        <ThreadsRail
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onCreateThread={handleCreateThread}
          onRenameThread={handleRenameThread}
          onDeleteThread={handleDeleteThread}
          effortScore={effortScore}
          onEffortChange={handleEffortChange}
          modelBadge="Claude 3.5 Sonnet + Z3 SMT Prover"
        />

        {/* Center/Main Column: Chat Canvas & Controls */}
        <main className="col-span-12 lg:col-span-8 xl:col-span-9 flex flex-col gap-unit-4 min-h-[640px] justify-between">
          {/* Topbar Control Bar (§3.6.2 & §3.6.3) */}
          <header className="p-unit-3 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-lg flex flex-wrap items-center justify-between gap-unit-3">
            {/* Title / Topic context */}
            <div className="flex flex-col min-w-0">
              <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
                Autonomous Session
              </span>
              <h1 className="font-title-md text-title-md font-semibold text-on-surface truncate">
                {activeThread.title}
              </h1>
            </div>

            {/* Mode Control & Pending Badge */}
            <div className="flex items-center gap-unit-3 flex-wrap">
              <ModeControl
                mode={mode}
                onChange={handleModeChange}
                pendingCount={pendingPermissions.length}
                onOpenPending={() => {
                  if (pendingPermissions.length > 0) {
                    setActivePermission(pendingPermissions[0]);
                  }
                }}
              />

              {/* Identity Pill Trigger & Switcher */}
              <IdentityPill
                identities={identities}
                activeIdentityId={activeIdentityId}
                onSelectIdentity={(id) => {
                  setActiveIdentityId(id);
                  const updated = { ...settings, ai: { ...(settings.ai || {}), persona_id: id } };
                  setSettings(updated);
                  saveSettings(updated);
                }}
                onNewIdentity={() => setShowConfigsSidebar(true)}
              />

              {/* Config Matrix Toggle Button */}
              <button
                type="button"
                onClick={() => setShowConfigsSidebar((prev) => !prev)}
                className="h-11 px-unit-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface flex items-center gap-micro-2 transition-all shadow-sm cursor-pointer"
                title="Open Agent Configurations Matrix"
              >
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                <span className="font-label-caps text-label-caps uppercase hidden sm:inline">
                  Configs
                </span>
              </button>
            </div>
          </header>

          {/* Chat Stream Workspace */}
          <div
            ref={chatScrollRef}
            className="flex-1 flex flex-col gap-unit-4 overflow-y-auto p-unit-4 rounded-2xl bg-surface-container-lowest/50 border border-outline-variant/20 shadow-inner max-h-[560px]"
          >
            {/* Render Messages */}
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                onRetry={() => {
                  setInputQuery(msg.text);
                  handleSendMessage();
                }}
              />
            ))}

            {/* Active Streaming Thinking Bubble */}
            {thinkingState.visible && (
              <ThinkingBubble
                thought={thinkingState.text}
                isStreaming={isStreaming}
                onStop={handleStopExecution}
                tokens={thinkingState.tokens}
              />
            )}

            {/* In-Flight Streaming Delta Response */}
            {isStreaming && streamingText && (
              <ChatBubble
                message={{
                  role: 'agent',
                  text: streamingText,
                  timestamp: new Date().toISOString(),
                }}
              />
            )}

            {/* Assignment & Moment Event Bubbles (§3.6.7) */}
            {assignmentEvents.map((evt, idx) => {
              const chip = evt.chip || HONEST_EVENT_CHIPS.assignment_created;
              const assign = evt.assignment || {};

              return (
                <div
                  key={`evt_${idx}`}
                  className={`w-full pl-4 md:pl-8 border-l-2 ${chip.borderClass} transition-all my-2`}
                >
                  <div className="p-unit-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/25 shadow-md hover:border-outline-variant/40 transition-all flex flex-col gap-unit-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/15 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-chip-status text-[11px] font-semibold px-2 py-0.5 rounded uppercase ${chip.textAccentClass} ${chip.bgGlowClass}`}
                        >
                          {chip.chipStatus}
                        </span>
                        <h4 className="font-headline-lg text-body-md font-semibold text-on-surface truncate">
                          {assign.title || assign.name || 'Coursework Assignment'}
                        </h4>
                      </div>
                      <span className="font-code-sm text-xs text-outline">
                        {assign.subject_code || assign.course || 'CS-441'}
                      </span>
                    </div>

                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {assign.prompt || assign.description || 'Assignment deliverable registered into synthesis pipeline.'}
                    </p>

                    {/* Interactive Moment Action Buttons (Strict min 44px) */}
                    <div className="flex flex-wrap items-center gap-unit-3 pt-2">
                      <button
                        type="button"
                        onClick={() => onOpenAssignment(assign)}
                        className="h-11 px-unit-4 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center gap-2 shadow-[0_0_18px_rgba(89,216,201,0.25)] hover:shadow-[0_0_24px_rgba(89,216,201,0.4)] transition-all cursor-pointer"
                      >
                        <span>Open Assignment Detail</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      {assign.draft_text && (
                        <button
                          type="button"
                          onClick={() => setLaunchToDocTarget({ assignment: assign, text: assign.draft_text })}
                          className="h-11 px-unit-4 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/25 text-on-surface font-label-caps text-label-caps transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <FileText className="w-4 h-4 text-primary" />
                          <span>View Working Draft</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Glass Composer Bar (§3.6.1) */}
          <div className="sticky bottom-0 z-30 p-unit-3 rounded-2xl bg-surface-container-lowest/85 backdrop-blur-xl border border-outline-variant/30 shadow-2xl">
            <form onSubmit={handleSendMessage} className="flex items-center gap-unit-3">
              {/* Attachment Button (44px min target) */}
              <button
                type="button"
                className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                title="Attach source, proof script, or assignment file"
              >
                <Paperclip className="w-5 h-5 text-outline" />
              </button>

              {/* Text Prompt Input */}
              <div className="flex-1 relative flex items-center">
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder="Ask Co-Pilot to synthesize theorems, verify proof trees, or draft monographs..."
                  className="w-full h-12 px-unit-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest transition-all"
                />
                <div className="absolute right-3 hidden sm:flex items-center gap-1 font-code-sm text-code-sm text-outline">
                  <span>Enter</span>
                  <span className="text-outline-variant">to send</span>
                </div>
              </div>

              {/* Voice Transcription Mic Button */}
              <button
                type="button"
                className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                title="Toggle audio telemetry transcription"
              >
                <Mic className="w-5 h-5" />
              </button>

              {/* Glowing Circular Send / Stop Button */}
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopExecution}
                  className="w-11 h-11 rounded-full bg-error text-on-error flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(239,68,68,0.4)] hover:shadow-[0_0_28px_rgba(239,68,68,0.6)] active:scale-95 transition-all cursor-pointer"
                  title="Stop Execution"
                >
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputQuery.trim()}
                  className="w-11 h-11 rounded-full bg-primary hover:bg-primary-fixed text-on-primary flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(89,216,201,0.4)] hover:shadow-[0_0_28px_rgba(89,216,201,0.6)] active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Transmit to Prover Pipeline"
                >
                  <Send className="w-5 h-5 text-on-primary" />
                </button>
              )}
            </form>
          </div>
        </main>
      </div>

      {/* Flyout Configs Sidebar (Drawer) */}
      {showConfigsSidebar && (
        <div className="fixed inset-y-0 right-0 z-50 flex animate-in slide-in-from-right duration-200">
          <AgentConfigsSidebar
            ai={settings.ai}
            identities={identities}
            activeIdentityId={activeIdentityId}
            onSelectIdentity={(id) => {
              setActiveIdentityId(id);
              const updated = { ...settings, ai: { ...(settings.ai || {}), persona_id: id } };
              setSettings(updated);
              saveSettings(updated);
            }}
            onAddIdentity={(newId) => {
              const next = [...identities, newId];
              setIdentities(next);
              const updated = { ...settings, ai: { ...(settings.ai || {}), identities: next } };
              setSettings(updated);
              saveSettings(updated);
            }}
            skills={skills}
            activeSkillIds={activeSkillIds}
            onToggleSkill={(skillId) => {
              setActiveSkillIds((prev) =>
                prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
              );
            }}
            onAddSkill={(skill) => setSkills((prev) => [...prev, skill])}
            memory={memory}
            memoryText={memoryText}
            setMemoryText={setMemoryText}
            addMemory={async (txt) => {
              try {
                const res = await api.appendAgentMemory?.(txt);
                setMemory((prev) => [...prev, res?.entry || { id: Date.now(), text: txt }]);
              } catch (e) {
                setMemory((prev) => [...prev, { id: Date.now(), text: txt }]);
              }
            }}
            deleteMemory={async (id) => {
              setMemory((prev) => prev.filter((m) => m.id !== id));
              try {
                await api.deleteAgentMemory?.(id);
              } catch (e) {}
            }}
            files={files}
            handleUploadFile={async (file, kind) => {
              try {
                const res = await api.uploadAgentFile?.(file, kind);
                setFiles((prev) => [...prev, res?.file || { id: Date.now(), name: file.name, kind }]);
              } catch (e) {}
            }}
            deleteFile={async (id) => {
              setFiles((prev) => prev.filter((f) => f.id !== id));
              try {
                await api.deleteAgentFile?.(id);
              } catch (e) {}
            }}
            onCollapse={() => setShowConfigsSidebar(false)}
          />
        </div>
      )}

      {/* Autonomous Action Permission Modal (§3.6.6) */}
      {activePermission && (
        <PermissionModal
          permission={activePermission}
          onDecision={handlePermissionDecision}
          onClose={() => setActivePermission(null)}
        />
      )}

      {/* Launch To Doc Modal */}
      {launchToDocTarget && (
        <LaunchToDocModal
          isOpen={!!launchToDocTarget}
          assignment={launchToDocTarget.assignment}
          initialText={launchToDocTarget.text || ''}
          onClose={() => setLaunchToDocTarget(null)}
        />
      )}
    </div>
  );
}
