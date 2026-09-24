/**
 * MyAgentView.jsx — Master Agent Co-Pilot Canvas & Workspace (Stitch v6 / Family 3.6).
 * Chat-first simplification, glass composer, single segmented mode control, identity switcher,
 * threads rail with effort dial, configs sidebar (4 tabs), permission modal, and honest event bubbles.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send, Paperclip, Mic, ShieldCheck, Shield, Zap, RefreshCw, Trash2, Plus,
  SlidersHorizontal, ChevronDown, ChevronUp, Bot, Sparkles, StopCircle,
  Pause, Play, X,
  FileText, ExternalLink, ArrowRight, BookOpen, Clock, AlertCircle
} from 'lucide-react';
import api from '../api.js';
import { loadSettings, saveSettings } from '../demoData.js';
// assignmentEvents helpers are no longer used here — the chat no longer
// announces assignment lifecycle events (they rendered fabricated fallback
// copy; see the note where the bubbles used to be rendered).
import { deriveAssignmentEvent, HONEST_EVENT_CHIPS, formatTokenMetric } from '../lib/agentEvents.js';
import { PRESET_PERSONAS, DEFAULT_SKILLS, DEFAULT_IDENTITY_ID } from '../lib/agentPresets.js';
import ModeControl from './ModeControl.jsx';
import ThreadsRail from './ThreadsRail.jsx';
import AgentConfigsSidebar from './AgentConfigsSidebar.jsx';
import ApprovalCard from './ApprovalCard.jsx';
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
  // Blank slate (owner 2026-09-19): a new account starts on no identity and no
  // skills, not on a house style it never chose.
  const [activeIdentityId, setActiveIdentityId] = useState(
    () => settings.ai?.persona_id || DEFAULT_IDENTITY_ID
  );
  const [identities, setIdentities] = useState(() => settings.ai?.identities || []);
  const [skills, setSkills] = useState(() => settings.ai?.skills || DEFAULT_SKILLS);
  // The sidebar computes isEnabled as `active || enabled`; when stored skills
  // exist, seed the active set FROM them so a user-disabled skill does not get
  // pinned back on. With no stored skills there is nothing enabled — the old
  // fallback list named three built-ins that no longer ship (owner 09-19).
  const [activeSkillIds, setActiveSkillIds] = useState(() => {
    const saved = settings.ai?.skills;
    if (saved?.length) return saved.filter((s) => s.enabled).map((s) => s.id);
    return [];
  });
  const [memory, setMemory] = useState([]);
  const [memoryText, setMemoryText] = useState('');
  const [files, setFiles] = useState([]);

  // ── Threads State ──
  // Empty until the server answers — fake seed threads/messages for live
  // accounts were removed 09-06 (honest app: no fabricated conversations).
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);

  // ── Chat Stream State ──
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingState, setThinkingState] = useState({ visible: false, text: '', tokens: 0 });
  // The reasoning of the CURRENT turn. `thinkingState` drives the live bubble,
  // but it is cleared when the reply commits — which used to throw the chain of
  // thought away the moment the answer arrived. This ref survives the commit so
  // the reasoning can be stored ON the message and stay inspectable afterwards.
    const reasoningRef = useRef('');
    const [abortController, setAbortController] = useState(null);
    // Pause vs discard (owner 2026-09-18). Both abort the stream; they differ in
    // whether the partial answer is left resumable. This ref tells the send
    // handler's `finally` which one happened — a ref, not state, because the
    // abort resolves the await and the flag must be readable immediately.
    const pausedIntentRef = useRef(false);
    // The interrupted turn: which bubble to append to, and the text to hand back
    // to the model on resume. Non-null means the composer shows Resume.
    const [pausedTurn, setPausedTurn] = useState(null);

  // ── Permissions & Modals ──
  const [pendingPermissions, setPendingPermissions] = useState([]);
  const [showConfigsSidebar, setShowConfigsSidebar] = useState(false);
  const [launchToDocTarget, setLaunchToDocTarget] = useState(null);
  // Educational mode (09-07): the site chat sends the flag on every agent
  // call so the server-mode system prompts (edu vs open) apply on this
  // surface too; the header chip exposes the stored user preference (server
  // user settings, mirrored to local settings) like the extension popup does.
  const [educationalMode, setEducationalMode] = useState(
    () => (loadSettings()?.educationalMode ?? true) !== false
  );
  // Post-decision status line (extension parity: card hides, status shows).
  const [recentApproval, setRecentApproval] = useState(null);
  const approvalStatusTimer = useRef(null);

  // ── Lifecycle & Assignment Events (45s Polling) ──
  const chatScrollRef = useRef(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, thinkingState, pendingPermissions, scrollToBottom]);

  // Load initial backend state
  useEffect(() => {
    let mounted = true;

    // Load mode
    api.agentMode?.()
      .then((d) => {
        if (mounted && d?.operation_mode) setMode(d.operation_mode);
      })
      .catch(() => {});

    // Load stored settings from server (server is the source of truth;
    // local settings mirror it so preferences, agent name, and flags survive reloads).
    api.getUserSettings?.()
      .then((d) => {
        if (!mounted || !d) return;
        const s = d.settings || d;
        if (s && typeof s === 'object') {
          if (typeof s.educationalMode === 'boolean') {
            setEducationalMode(s.educationalMode);
          }
          const local = loadSettings();
          const merged = {
            ...local,
            ...s,
            ai: {
              ...(local.ai || {}),
              ...(s.ai || {}),
            },
          };
          saveSettings(merged);
          setSettings(merged);
        }
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

    // Load legacy conversation history (key 0) so returning users see their
    // real thread, never a fabricated one.
    api.agentChatHistory?.(0)
      .then((res) => {
        if (mounted && Array.isArray(res?.chat) && res.chat.length > 0) {
          setMessages(
            res.chat.map((m) => ({
              id: m.id || `msg_${Date.now()}_${Math.random()}`,
              role: m.role || m.sender || (m.is_user ? 'user' : 'agent'),
              text: m.text || m.content || '',
              timestamp: m.timestamp || m.created_at,
              tokens: m.tokens,
            }))
          );
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
        // Owner 2026-09-19: this used to also fetch assignment cards and the
        // turned-in list purely to feed the assignment-event bubbles. Those
        // bubbles are gone (they rendered fabricated fallback copy), so the
        // poll now fetches ONLY what it still uses — the permission queue.
        // Dropping the two dead requests also removes two calls per 45s.
        const pendingRes = await api.agentPermissionsPending?.().catch(() => null);

        // Merge freshly-created permission requests into the approval queue
        // (never re-add one the user already answered — merge only new ids).
        if (mounted && pendingRes && Array.isArray(pendingRes.pending)) {
          setPendingPermissions((prev) => {
            const existing = new Set(prev.map((p) => String(p.id)));
            const fresh = pendingRes.pending.filter((p) => !existing.has(String(p.id)));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        }

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

  // ── Identity (persona) selection ──
  // Identity is CONFIGURATION, chosen in the Configs sidebar — it deliberately
  // has no control in the chat header. Applying it writes the persona into the
  // agent's stored settings so it reaches the model on every surface, not just
  // this one.
  //
  // It writes persona_name / persona_instructions rather than personality /
  // instructions: the latter two are the user's OWN agent config (settable by
  // chat), and an identity switch must not silently destroy them. The server
  // composes the persona block from these fields (server/agent_prompt.py).
  //
  // It MUST PATCH the server. `saveSettings` only writes localStorage, and the
  // agent's prompt is built from the server's copy of settings — so a selection
  // that stopped at localStorage looked applied in the UI while the model kept
  // running whatever identity was already on the account. That is the "config
  // selections do not actually update" bug.
  const applyIdentity = (id) => {
    const merged = [
      ...PRESET_PERSONAS,
      ...identities.filter((i) => !PRESET_PERSONAS.some((p) => p.id === i.id)),
    ];
    const persona = merged.find((p) => p.id === id) || null;
    // 'none' is the explicit "no persona" state: it clears the block entirely so
    // the agent answers plainly. An unresolvable id is treated the same way —
    // injecting a character we cannot describe would be worse than none.
    const off = !persona || persona.id === 'none';
    const ai = {
      ...(settings.ai || {}),
      persona_id: id,
      persona_name: off ? '' : (persona.title || persona.name || ''),
      persona_instructions: off ? '' : (persona.instructions || ''),
    };
    setActiveIdentityId(id);
    const updated = { ...settings, ai };
    setSettings(updated);
    saveSettings(updated);
    // The server is what the agent actually reads.
    api.updateSettings?.({ ai }).catch((e) => console.warn('identity save failed:', e));
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
      const records = history?.chat ?? history?.messages ?? [];
      if (Array.isArray(records)) {
        setMessages(
          records.map((m) => ({
            id: m.id || `msg_${Date.now()}_${Math.random()}`,
            role: m.role || m.sender || (m.is_user ? 'user' : 'agent'),
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

  // Pin/unpin a chat. The server already stores `pinned` and returns pinned
  // threads first (routes_overlord.list_chat_threads sorts on it), so this only
  // has to send the flag and keep the rail's own order honest.
  const handlePinThread = async (threadId, pinned) => {
    setThreads((prev) => {
      const next = prev.map((t) => (t.id === threadId ? { ...t, pinned } : t));
      // Pinned first, everything else in the order the server gave us.
      return [...next.filter((t) => t.pinned), ...next.filter((t) => !t.pinned)];
    });
    try {
      await api.request?.(`/api/agent/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned }),
      });
    } catch (e) {
      console.warn('Failed to pin thread:', e);
      // Put it back rather than showing a state the server does not have.
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, pinned: !pinned } : t)));
    }
  };

  // ── Send Prompt & Execution Stream ──
    const handleSendMessage = async (e) => {
      e?.preventDefault();
      const query = inputQuery.trim();
      if (!query || isStreaming) return;

      // Typing a new message while paused is itself a resume (owner 2026-09-18:
      // "either a new message or resume button resumes it"). Clear the paused
      // state so the unfinished bubble stops offering Resume and the agent picks
      // up under the new instruction — the partial stays in the thread as
      // context rather than being thrown away.
      if (pausedTurn) {
        setMessages((prev) => prev.map((m) => (m.id === pausedTurn.msgId ? { ...m, paused: false } : m)));
        setPausedTurn(null);
      }


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

    // Local buffer mirrors streamed deltas (the `streamingText` state var is a
    // stale closure value inside the async finally below, so it cannot be used
    // to persist the completed reply).
    let replyBuffer = '';
    reasoningRef.current = '';
    try {
      // Check if streaming is available
      if (api.agentChatStream) {
        const streamResult = await api.agentChatStream(
          {
            text: query,
            thread_id: activeThreadId ?? 0,
            mode,
            effort: effortScore,
            persona: activeIdentityId,
            educational_mode: educationalMode,
            signal: controller.signal,
          },
          (evt) => {
            if (evt.type === 'reasoning') {
              setThinkingState((prev) => {
                const next = (evt.delta ? `${prev.text} ${evt.delta}` : prev.text).trim();
                reasoningRef.current = next;   // survives the commit below
                return { ...prev, visible: true, text: next, tokens: prev.tokens + 15 };
              });
            } else if (evt.type === 'delta') {
              replyBuffer += evt.delta || '';
              setStreamingText((prev) => prev + (evt.delta || ''));
            }
          }
        );
        if (streamResult?.status === 'unavailable') {
          // The stream lane can't run actions (math/shell queries execute via
          // the sandbox executor). Fall back to the non-streaming lane, which
          // runs the action and returns the reply — the server's documented
          // "seamless fallback" contract.
          const res = await api.agentChat?.({
            text: query,
            thread_id: activeThreadId ?? 0,
            session_mode_override: mode,
            effort_score: effortScore,
            persona: activeIdentityId,
            educational_mode: educationalMode,
          });
          // A permission_required response carries `message` as an OBJECT
          // (not a string) — never hand it to the bubble renderer, or React
          // error #31 unmounts the whole view (09-07 lane4 catch). Pull the
          // notice text when present; the ApprovalCard owns the rest.
          const reply =
            typeof res?.reply === 'string'
              ? res.reply
              : typeof res?.message === 'string'
                ? res.message
                : typeof res?.message?.text === 'string'
                  ? res.message.text
                  : '';
          if (reply) {
            replyBuffer = reply;
            setStreamingText(reply);
          }
          // Approval card: the backend holds the action and returns the
          // request — surface it right under the notice bubble.
          if (res?.status === 'permission_required') {
            enqueuePermissionRequest(res);
            // The chain stopped waiting for a decision — no lingering
            // "Reasoning Chain Generated" bubble behind the card.
            setThinkingState({ visible: false, text: '', tokens: 0 });
          }
        }
      } else {
        // Direct chat fallback
        const res = await api.agentChat?.({
          text: query,
          thread_id: activeThreadId,
          session_mode_override: mode,
          effort_score: effortScore,
          persona: activeIdentityId,
          educational_mode: educationalMode,
        });
        // Same guard as the stream fallback: `message` can be an OBJECT on
        // permission_required — render only strings.
        const reply =
          typeof res?.reply === 'string'
            ? res.reply
            : typeof res?.message === 'string'
              ? res.message
              : typeof res?.message?.text === 'string'
                ? res.message.text
                : '';
        if (reply) {
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
        if (res?.status === 'permission_required') {
          enqueuePermissionRequest(res);
          setThinkingState({ visible: false, text: '', tokens: 0 });
        }
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
        if (replyBuffer) {
          // Same id is reused by Resume so the continuation appends to THIS
          // bubble instead of arriving as a second message.
          const msgId = `agent_${Date.now()}`;
          const wasPaused = pausedIntentRef.current;
          setMessages((prev) => [
            ...prev,
            {
              id: msgId,
              role: 'agent',
              text: replyBuffer,
              timestamp: new Date().toISOString(),
              tokens: 650,
              // Stored on the message so the thinking block stays with the answer
              // instead of disappearing once the turn ends.
              reasoning: reasoningRef.current || '',
              // Marks the bubble as unfinished, so it offers Resume rather than
              // looking like a completed reply that simply stopped mid-sentence.
              paused: wasPaused,
            },
          ]);
          if (wasPaused) {
            setPausedTurn({ msgId, text: replyBuffer, reasoning: reasoningRef.current || '' });
          }
        }
        pausedIntentRef.current = false;
        setIsStreaming(false);
      setStreamingText('');
      setAbortController(null);
      // The reasoning now lives on the committed message (above), so drop the
      // live bubble. Without this the same thinking rendered twice, and a
      // turn with no reply left the bubble stranded.
      setThinkingState({ visible: false, text: '', tokens: 0 });
    }
  };

    const handleStopExecution = () => {
      if (abortController) {
        abortController.abort();
      }
      setIsStreaming(false);
      setThinkingState((prev) => ({ ...prev, visible: false }));
    };

    /** Pause the running turn, keeping what was already written so it can resume.
     *
     * This is the same abort as Stop — the difference is the intent flag, which
     * makes the send handler keep the partial and mark the bubble resumable. */
    const handlePauseExecution = () => {
      pausedIntentRef.current = true;
      if (abortController) {
        abortController.abort();
      }
      setIsStreaming(false);
      setThinkingState((prev) => ({ ...prev, visible: false }));
    };

    /** Throw away a paused turn: drop the partial answer entirely.
     *
     * This is where the old Stop button's behaviour went. Pause made it
     * unreachable directly, and leaving no way to cancel would have been a
     * regression — so "discard" is now an explicit second step. */
    const handleDiscardPaused = () => {
      if (pausedTurn) {
        setMessages((prev) => prev.filter((m) => m.id !== pausedTurn.msgId));
      }
      setPausedTurn(null);
    };

    /** Continue a paused answer from where it stopped.
     *
     * A paused turn is ONE turn: the partial text goes back to the model via
     * `continue_from` (so no user message is recorded and the half-finished
     * answer never enters the thread as a synthetic prompt), and the deltas are
     * appended to the same bubble. */
    const handleResume = async () => {
      const turn = pausedTurn;
      if (!turn || isStreaming) return;

      setPausedTurn(null);
      // Drop the marker first: if the resume fails the bubble must not still
      // claim it has a Resume button wired to a turn we have already consumed.
      setMessages((prev) => prev.map((m) => (m.id === turn.msgId ? { ...m, paused: false } : m)));
      setIsStreaming(true);
      setStreamingText('');
      setThinkingState({ visible: true, text: 'Continuing where it left off…', tokens: 0 });

      const controller = new AbortController();
      setAbortController(controller);
      let appended = '';
      try {
        if (api.agentChatStream) {
          await api.agentChatStream(
            { text: '', continue_from: turn.text, signal: controller.signal },
            (evt) => {
              if (evt.type === 'reasoning' && evt.delta) {
                reasoningRef.current = `${reasoningRef.current || ''}${evt.delta}`;
              } else if (evt.type === 'delta' && evt.delta) {
                appended += evt.delta;
                setMessages((prev) =>
                  prev.map((m) => (m.id === turn.msgId ? { ...m, text: turn.text + appended } : m)),
                );
              }
            },
          );
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              role: 'error',
              isError: true,
              text: `Could not resume the paused answer: ${err?.message || 'unknown error'}`,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } finally {
        setIsStreaming(false);
        setAbortController(null);
        setThinkingState({ visible: false, text: '', tokens: 0 });
      }
    };

  // ── Permission Decision Handler (ApprovalCard) ──
  // Contract (09-07): one note input shared by every decision. Each button
  // sends its decision plus the typed text through the existing approval
  // protocol — POST /api/agent/permission/respond {permission_id, decision:
  // allow|deny|neutral, text?, autoAdd?}. Empty text is allowed for
  // allow/deny; Neutral always carries a note (the card gates that).
  const handlePermissionDecision = async (permId, decision, note, opts) => {
    try {
      const payload = {
        permission_id: permId,
        decision,
        ...(note ? { comment: note, text: note } : {}),
        ...(opts?.autoAdd ? { autoAdd: true } : {}),
      };
      await api.agentPermissionRespond?.(payload);
      setPendingPermissions((prev) => prev.filter((p) => String(p.id) !== String(permId)));
      const autoAddSuffix = opts?.autoAdd ? ' — added to auto-approved actions.' : '';
      setRecentApproval(
        decision === 'allow'
          ? `✅ Allowed the agent action.${autoAddSuffix}`
          : decision === 'deny'
            ? '⛔ Rejected the agent action.'
            : '⚪ Neutral — the agent got your note.'
      );
      clearTimeout(approvalStatusTimer.current);
      approvalStatusTimer.current = setTimeout(() => setRecentApproval(null), 4000);
    } catch (e) {
      console.warn('Failed to respond to permission:', e);
      throw e;
    }
  };

  // ── Educational Mode Toggle (header chip) ──
  const handleToggleEducationalMode = async () => {
    const next = !educationalMode;
    setEducationalMode(next);
    try {
      await api.updateSettings?.({ educationalMode: next });
      const updated = { ...settings, educationalMode: next };
      setSettings(updated);
      saveSettings(updated);
    } catch (e) {
      // Revert on failure — the server preference stays authoritative.
      setEducationalMode(!next);
      console.warn('Failed to update educational mode:', e);
    }
  };

  // Append a freshly-returned permission request to the approval queue.
  const enqueuePermissionRequest = (res) => {
    const perm = res?.permission_request;
    if (!perm || !perm.id) return;
    setPendingPermissions((prev) =>
      prev.some((p) => String(p.id) === String(perm.id)) ? prev : [perm, ...prev]
    );
  };

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0] || { title: 'New chat' };

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
          onPinThread={handlePinThread}
          effortScore={effortScore}
          onEffortChange={handleEffortChange}
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
                  // The approval card renders inline in the chat stream —
                  // bring it into view instead of opening a modal.
                  if (pendingPermissions.length > 0 && chatScrollRef.current) {
                    chatScrollRef.current.scrollTo({
                      top: chatScrollRef.current.scrollHeight,
                      behavior: 'smooth',
                    });
                  }
                }}
              />

              {/* Educational Mode moved into Configs (owner 2026-09-19): it is a
                  setting you choose once, not a per-message control, and having it
                  in the chat header made it look like a send-time toggle. */}

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
            {/* Empty state — honest, no seeded demo conversation */}
            {messages.length === 0 && !thinkingState.visible && !isStreaming && (
              <div className="flex flex-col items-center justify-center text-center py-16 px-4 gap-2">
                <p className="font-body-sm text-sm text-on-surface-variant">
                  No messages yet — ask a question below to start your session.
                </p>
              </div>
            )}

              {/* Render Messages */}
              {messages.map((msg) => (
                <div key={msg.id} className="flex flex-col gap-2">
                  {/* The thinking that produced this reply, kept with it. */}
                  {msg.reasoning ? (
                    <ThinkingBubble thought={msg.reasoning} isStreaming={false} />
                  ) : null}
                  <ChatBubble
                    message={msg}
                    onRetry={() => {
                      setInputQuery(msg.text);
                      handleSendMessage();
                    }}
                  />
                  {/* A paused turn is visibly unfinished, with its own Resume —
                      the user should not have to hunt for the composer button. */}
                  {msg.paused && (
                    <div className="flex items-center gap-2 pl-1">
                      <span className="font-label-caps text-[10px] px-2 py-0.5 rounded-full bg-secondary/15 text-secondary">
                        paused
                      </span>
                      <button
                        type="button"
                        onClick={handleResume}
                        className="font-label-caps text-[11px] px-3 h-7 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        Resume
                      </button>
                      <button
                        type="button"
                        onClick={handleDiscardPaused}
                        className="font-label-caps text-[11px] px-3 h-7 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        Discard
                      </button>
                    </div>
                  )}
                </div>
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
            {/* Assignment-lifecycle event bubbles were rendered here and are
                GONE (owner 2026-09-19: "wtf is this active coursework shit, get
                rid of it").

                They were not just noise — they were showing FABRICATED content.
                `computeAssignmentEvents` (lib/assignmentEvents.js) returns
                events shaped {type, card}, but this block read `evt.chip` and
                `evt.assignment`. BOTH were always undefined, so every event
                rendered the hardcoded `assignment_created` chip and fell
                through to every fallback string at once:

                    title  -> 'Coursework Assignment'
                    code   -> 'CS-441'
                    prompt -> 'Assignment deliverable registered into synthesis pipeline.'

                That is the entire "fake hardcoded" look the owner reported: two
                identical cyan NEW cards with a course code and an invented
                sentence, for real assignment rows that simply do not carry
                those fields.

                Assignments already have a home — the Dashboard and Assignment
                Dump — so they are not re-announced in the chat. If lifecycle
                announcements are ever wanted here, the renderer must read
                `evt.card` and derive the chip from `evt.type`; do NOT restore
                this block as it was. */}

            {/* Approval Card (09-07): the chat-surface approval gate — same
                four decisions + one note input as the extension card.
                Rendered inline in the stream, right under the notice bubble. */}
            {pendingPermissions.length > 0 && (
              <ApprovalCard
                key={`${pendingPermissions[0].id}`}
                request={pendingPermissions[0]}
                onDecision={handlePermissionDecision}
              />
            )}

            {/* Post-decision status line (extension parity: card hides,
                this line takes its place for a few seconds) */}
            {!pendingPermissions.length && recentApproval && (
              <div className="flex justify-center my-2">
                <span
                  id="approvalStatus"
                  role="status"
                  aria-live="polite"
                  className="approval-status inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high/80 border border-outline-variant/30 font-code-sm text-code-sm text-on-surface-variant"
                >
                  {recentApproval}
                </span>
              </div>
            )}
          </div>

          {/* Sticky Glass Composer Bar (§3.6.1) */}
            <div className="sticky bottom-0 z-30 p-unit-3 rounded-2xl bg-surface-container-lowest/85 backdrop-blur-xl border border-outline-variant/30 shadow-2xl">
              {/* Paused banner (outside the form so it stacks above the composer
                  instead of squeezing the input): keeps Resume reachable after
                  scrolling away from the paused bubble, and says plainly that the
                  answer is unfinished rather than letting it read as complete. */}
              {pausedTurn && !isStreaming && (
                <div className="w-full flex items-center justify-between gap-3 mb-2 px-3 py-2 rounded-xl border border-secondary/30 bg-secondary/10">
                  <span className="font-body-sm text-xs text-on-surface-variant">
                    Answer paused — nothing was lost. Resume it, or just type a new message to carry on.
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleResume}
                      className="font-label-caps text-[11px] px-3 h-7 rounded-lg bg-primary text-on-primary hover:bg-primary-fixed transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardPaused}
                      className="font-label-caps text-[11px] px-2 h-7 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition flex items-center gap-1.5 cursor-pointer"
                      title="Discard the paused answer"
                    >
                      <X className="w-3 h-3" />
                      Discard
                    </button>
                  </div>
                </div>
              )}
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
                  placeholder=""
                  aria-label="Message the agent"
                  className="w-full h-12 px-unit-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest transition-all"
                />
                {/* The "Enter to send" hint lived INSIDE this input, absolutely
                    positioned over it, so it collided with the placeholder text
                    and read as mangled copy (owner 2026-09-19: "the ask copilot
                    message is mangled up with the enter to send a message
                    text"). Both are gone: a blank box, no overlay. Enter still
                    sends — it does not need to be advertised in the field. */}
              </div>

              {/* Voice Transcription Mic Button */}
              <button
                type="button"
                className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                title="Toggle audio telemetry transcription"
              >
                <Mic className="w-5 h-5" />
              </button>

                {/* Circular Send / Resume / Pause button.
                    Pause is the streaming action; Resume replaces it once a turn
                    is paused. Discard (a paused turn's cancel) sits beside Resume
                    in the strip above, so cancelling is still reachable. */}
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handlePauseExecution}
                    className="w-11 h-11 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(234,179,8,0.35)] hover:shadow-[0_0_28px_rgba(234,179,8,0.55)] active:scale-95 transition-all cursor-pointer"
                    title="Pause — keep what's written and continue later"
                  >
                    <Pause className="w-5 h-5" />
                  </button>
                ) : pausedTurn ? (
                  <button
                    type="button"
                    onClick={handleResume}
                    className="w-11 h-11 rounded-full bg-primary hover:bg-primary-fixed text-on-primary flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(89,216,201,0.4)] hover:shadow-[0_0_28px_rgba(89,216,201,0.6)] active:scale-95 transition-all cursor-pointer"
                    title="Resume the paused answer"
                  >
                    <Play className="w-5 h-5 text-on-primary" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputQuery.trim()}
                    className="w-11 h-11 rounded-full bg-primary hover:bg-primary-fixed text-on-primary flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(89,216,201,0.4)] hover:shadow-[0_0_28px_rgba(89,216,201,0.6)] active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Send to Agent"
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
                /* The full blob, so the Behaviour tab's per-area overrides can show
                 * the global value they deviate from. */
                settings={settings}
                onSettingsChanged={() => setSettings((s) => ({ ...s }))}
                /* The agent's display name. The greeting ("<name> Agent online")
                 * is rendered server-side from `settings.ai.aiName`, so this must
                 * PATCH the server too — a local-only write would look saved and
                 * then revert on the next reload. */
              onSaveAgentName={(name) => {
                const ai = { ...(settings.ai || {}), aiName: name };
                const updated = { ...settings, ai };
                setSettings(updated);
                saveSettings(updated);
                api.updateSettings?.({ ai }).catch((e) => console.warn('agent name save failed:', e));
              }}
            identities={identities}
            activeIdentityId={activeIdentityId}
            onSelectIdentity={applyIdentity}
              onAddIdentity={(newId) => {
                const next = [...identities, newId];
                setIdentities(next);
                const updated = { ...settings, ai: { ...(settings.ai || {}), identities: next } };
                setSettings(updated);
                saveSettings(updated);
              }}
              /* Deletion that actually persists.
               *
               * Two separate bugs met here (owner report 2026-09-18: "me clicking
               * delete old config didnt last"):
               *   1. The parent never passed these handlers, so the sidebar's
               *      `() => {}` defaults ran — the card re-rendered unchanged and
               *      the delete looked like it silently failed.
               *   2. Presets live in the bundle, not in saved settings, so
               *      removing one has to be recorded as an explicit "hidden" id
               *      or the next render resurrects it from PRESET_PERSONAS.
               * Both are fixed: deletion writes the durable lists below, and the
               * sidebar filters on them.
               */
              onDeleteIdentity={(id) => {
                const isPreset = PRESET_PERSONAS.some((p) => p.id === id);
                const nextIdentities = identities.filter((i) => i.id !== id);
                const ai = { ...(settings.ai || {}), identities: nextIdentities };
                if (isPreset) {
                  // A preset must be remembered as hidden — there is nothing to
                  // remove from `identities`, so without this it comes straight
                  // back from PRESET_PERSONAS on the next render.
                  ai.hidden_identities = Array.from(new Set([...(ai.hidden_identities || []), id]));
                }
                // Clearing an ACTIVE persona is folded into this same write.
                // Calling applyIdentity() here would PATCH again from a stale
                // closure and put the deleted identity straight back on the
                // server — the bug that made deletes look like they didn't last.
                if (activeIdentityId === id) {
                  ai.persona_id = 'none';
                  ai.persona_name = '';
                  ai.persona_instructions = '';
                  setActiveIdentityId('none');
                }
                setIdentities(nextIdentities);
                const updated = { ...settings, ai };
                setSettings(updated);
                saveSettings(updated);
                api.updateSettings?.({ ai }).catch((e) => console.warn('identity delete failed:', e));
              }}
            skills={skills}
            activeSkillIds={activeSkillIds}
            onToggleSkill={(skillId) => {
              // Flip BOTH the active-set and the skill's own enabled flag —
              // the sidebar computes isEnabled as `active || enabled`, so a
              // default-enabled skill also must toggle its flag or it can
              // never be switched off (09-06).
              const nextSkills = skills.map((s) => (s.id === skillId ? { ...s, enabled: !s.enabled } : s));
              setSkills(nextSkills);
              setActiveSkillIds((prev) =>
                prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
              );
              const updated = { ...settings, ai: { ...(settings.ai || {}), skills: nextSkills } };
              setSettings(updated);
              saveSettings(updated);
            }}
              onAddSkill={(skill) => setSkills((prev) => [...prev, skill])}
              /* Delete a skill, durably.
               *
               * `skills` falls back to the hardcoded DEFAULT_SKILLS when the
               * account has none saved, so filtering local state alone would
               * bring the skill back on the next load. Writing the filtered array
               * to `ai.skills` materialises the user's own list, which is what
               * makes the removal stick.
               */
              onDeleteSkill={(skillId) => {
                const nextSkills = skills.filter((s) => s.id !== skillId);
                setSkills(nextSkills);
                setActiveSkillIds((prev) => prev.filter((id) => id !== skillId));
                const ai = { ...(settings.ai || {}), skills: nextSkills };
                const updated = { ...settings, ai };
                setSettings(updated);
                saveSettings(updated);
                api.updateSettings?.({ ai }).catch((e) => console.warn('skill delete failed:', e));
              }}
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
            educationalMode={educationalMode}
            onToggleEducationalMode={handleToggleEducationalMode}
          />
        </div>
      )}

      {/* Autonomous Action approval UI now lives INSIDE the chat stream as the
          inline ApprovalCard (09-07) — the permission modal is no longer used. */}

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
