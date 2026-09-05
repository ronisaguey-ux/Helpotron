/* ────────────────────────────────────────────────────────────────────────────
 * MyAgentView.jsx — ONE personal agent that does everything (08-22).
 * Identity (name, personality, instructions, user/agent avatars), execution
 * modes (manual / auto / yolo + auto-approved actions), an effort scale
 * (1–1000) that drives model routing, a chat that can be asked for anything,
 * a permanent memory (add / edit / delete) the agent always reads, and
 * files (skill / rule / automation / personality) uploaded into the agent.
 * Admins additionally see an admin tools block — same agent, wider reach.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Send, Paperclip, Mic, ShieldCheck, Shield, Flame, RefreshCw,
  Trash2, Plus, Cpu, Database, FileText, Upload, Camera, ChevronDown, ChevronUp, User as UserIcon, Undo2, Pin, Pencil,
  Settings2, ArrowUpRight, Sparkles, Keyboard, GraduationCap, Copy, Check,
} from 'lucide-react';
import api, { getCsrfToken } from '../api.js';
import { loadSettings, saveSettings, EFFORT_SCORES } from '../demoData.js';
import { Badge, EmptyState, timeAgo } from './ui/os.jsx';
import { normalizeCards, computeAssignmentEvents, formatAssignmentEvent, EVENT_META } from '../lib/assignmentEvents.js';
import { AgentAvatar } from './ui/AgentAvatar.jsx';
import SectionCard from './SectionCard.jsx';
import AgentConfigsSidebar, { DEFAULT_IDENTITIES, DEFAULT_SKILLS } from './AgentConfigsSidebar.jsx';
import LaunchToDocModal from './LaunchToDocModal.jsx';
import PermissionModal from './PermissionModal.jsx';

const FILE_KINDS = [
  { key: 'skill', label: 'Skill', icon: '🧩', hint: 'Teach the agent new abilities (.md/.txt)' },
  { key: 'rule', label: 'Rule', icon: '📏', hint: 'Always-follow behavioral rules (.md/.txt)' },
  { key: 'automation', label: 'Automation', icon: '⚙️', hint: 'Scheduled or trigger workflows (.json/.md)' },
  { key: 'personality', label: 'Personality', icon: '🎭', hint: 'Tone, voice and values (.md/.txt)' },
];

const MODE_META = {
  manual: { label: 'Manual', icon: Shield, cls: 'bg-blue-600/20 border-blue-500/40 text-blue-300' },
  auto: { label: 'Auto-Pilot', icon: ShieldCheck, cls: 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' },
  yolo: { label: 'YOLO', icon: Flame, cls: 'bg-amber-600/20 border-amber-500/40 text-amber-300' },
};

const effortBucket = (v) => (v <= 300 ? 'Low' : v <= 700 ? 'Balanced' : 'High');
// 1-10 UI scale maps to the 1-1000 backend contract: score = x100, buckets <=3/<=7/8+.
const fmt = (n) => Number(n || 0).toLocaleString();

function AvatarUpload({ url, onUpload, label, initial }) {
  const ref = useRef(null);
  return (
    <div className="relative shrink-0 group">
      <div className="w-14 h-14 rounded-[var(--radius-md)] overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] border border-[var(--border-subtle)] flex items-center justify-center text-2xl">
        {url
          ? <img src={url} alt={label} className="w-full h-full object-cover" />
          : <span>{initial}</span>}
      </div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        aria-label={`Upload ${label}`}
        title={`Upload ${label} (PNG/JPG)`}
        className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface)] flex items-center justify-center transition cursor-pointer opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Camera className="w-3 h-3" />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
      />
    </div>
  );
}

function ThinkingBubble({ thinking, setThinking }) {
  if (!thinking?.visible || !thinking?.text) return null;
  const isMin = !!thinking.minimized;
  return (
    <div className="w-full sm:max-w-[80ch] my-2 transition-all duration-200">
      {isMin ? (
        <button
          type="button"
          onClick={() => setThinking((prev) => ({ ...prev, minimized: false }))}
          aria-expanded="false"
          aria-label="Expand thinking reasoning"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/40 text-on-surface-variant hover:text-on-surface text-xs font-mono shadow-sm transition cursor-pointer"
        >
          <span>💭 Thinking…</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      ) : (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setThinking((prev) => ({ ...prev, minimized: true }));
          }}
          className="rounded-2xl bg-surface-container-high border border-outline-variant/40 p-3 shadow-md focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 mb-2">
            <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
              <span>💭</span>
              <span className="font-mono text-[11px] font-semibold text-primary">Model Reasoning</span>
              <span className="text-[10px] text-on-surface-variant/70 animate-pulse">Live</span>
            </div>
            <button
              type="button"
              onClick={() => setThinking((prev) => ({ ...prev, minimized: true }))}
              aria-expanded="true"
              aria-label="Minimize thinking reasoning"
              className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
          <div
            className="max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-on-surface-variant whitespace-pre-wrap select-text pr-1"
            ref={(el) => {
              if (el && !el._userScrolled) {
                el.scrollTop = el.scrollHeight;
              }
            }}
            onScroll={(e) => {
              const el = e.currentTarget;
              el._userScrolled = el.scrollHeight - el.scrollTop - el.clientHeight > 20;
            }}
          >
            {thinking.text}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyAgentView({ userId = '', userCredits, onGoTo = () => {}, onTokenBalance = () => {}, onOpenAssignment = () => {} }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null); // null = the original chat (key 0)
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: 'I\'m your personal agent — ask me to do anything: draft work, generate materials, change settings, edit an assignment, plan your day, or manage my own memory and files.',
      time: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [launchToDocTarget, setLaunchToDocTarget] = useState(null);

  /* ── CONFIGS sidebar (operator 08-28): SEE / ADD / SELECT every custom
   * agent config. At xl+ it is DOCKED as a third grid column — non-modal, so
   * the chat beside it stays visible and interactive — and it may therefore
   * default open. Below xl there is no room to dock, so the same panel opens
   * as a modal slide-over drawer and defaults CLOSED: a drawer covering the
   * chat on load hides the view the user actually navigated to (QA 08-31).
   * Toggled anytime via ⚙ Configs in the chat header or the panel's own
   * Minimize control. ──────────────────────────────────────────────────── */
  const [configsOpen, setConfigsOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  );
  /* Responsive breakpoint — matchMedia state so the grid can re-flow when the
   * window crosses xl (1280) without relying on CSS alone. */
  const [isXL, setIsXL] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  );
  useEffect(() => {
    const mqXl = window.matchMedia('(min-width: 1280px)');
    const onXl = () => {
      setIsXL(mqXl.matches);
      /* Shrinking past xl would turn a docked column into a modal drawer that
       * suddenly covers the chat, so hand the space back instead. */
      if (!mqXl.matches) setConfigsOpen(false);
    };
    mqXl.addEventListener('change', onXl);
    return () => mqXl.removeEventListener('change', onXl);
  }, []);
  /* Drawer mode: Escape closes the configs overlay. Only while it is actually
   * modal (below xl) — at xl the panel is a docked column and Escape there
   * would collapse a panel the user never opened as a dialog. */
  useEffect(() => {
    if (!(configsOpen && !isXL)) return;
    const onKey = (e) => { if (e.key === 'Escape') setConfigsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [configsOpen, isXL]);
  /* operator 08-28: collapse the prompt composer to a slim bar (header toggle) */
  const [promptMinimized, setPromptMinimized] = useState(false);

  /* ── voice: native Web Speech API (reliable, zero-dependency, works everywhere) ── */
  const [recording, setRecording] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [copiedMsgId, setCopiedMsgId] = useState(null); // which message just got copied (flash "Copied")
  const copyTimer = useRef(null);

  /* Copy one chat message to the clipboard — available on agent AND user
   * bubbles. Falls back to a hidden textarea when the async clipboard API is
   * unavailable (insecure context). */
  function copyMessage(id, text) {
    if (!text) return;
    const markCopied = () => {
      setCopiedMsgId(id);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedMsgId(null), 1200);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(markCopied).catch(markCopied);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* best effort */ }
      document.body.removeChild(ta);
      markCopied();
    }
  }
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  function toggleRecord() {
    if (recording) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setRecording(false);
      return;
    }

    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const sr = new SpeechRecognition();
        sr.continuous = false;
        sr.interimResults = false;
        sr.lang = 'en-US';
        sr.onresult = (e) => {
          const transcript = e.results[0]?.[0]?.transcript || '';
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };
        sr.onerror = (e) => {
          console.warn('SpeechRecognition error:', e);
          setRecording(false);
        };
        sr.onend = () => setRecording(false);
        recognitionRef.current = sr;
        sr.start();
        setRecording(true);
        return;
      } catch (err) {
        console.warn('Speech recognition init failed:', err);
      }
    }
    alert('Voice dictation is not supported in this browser.');
  }

  function speakText(messageId, text) {
    if (!text || typeof window === 'undefined') return;

    // If currently speaking this message, toggle stop
    if (speakingMessageId === messageId) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setSpeakingMessageId(null);
      return;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanText = text
        .replace(/[*_#`[\]()]/g, ' ')
        .replace(/https?:\/\/\S+/g, 'link')
        .replace(/\s+/g, ' ')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 1200));
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);
      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Speech synthesis is not supported in this browser.');
    }
  }
  const [mode, setMode] = useState('auto');
  const [autoApprove, setAutoApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState({ visible: false, minimized: false, text: '' });
  const [effort, setEffort] = useState(500);
  const [autoApproveThis, setAutoApproveThis] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [autoList, setAutoList] = useState(() =>
    settings.ai?.autoApprovedActions?.length ? [...settings.ai.autoApprovedActions] : ['humanize', 'analyze_rubric', 'draft_section']
  );
  // Identities Management (Presets + User Custom Personas)
  const [agentNameDraft, setAgentNameDraft] = useState(() => settings.ai?.aiName || 'Atlas');
  useEffect(() => {
    setAgentNameDraft(settings.ai?.aiName || 'Atlas');
  }, [settings.ai?.aiName]);

  const [identities, setIdentities] = useState(() => {
    try {
      const saved = localStorage.getItem('helpotron.agent.custom_identities');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeIdentityId, setActiveIdentityId] = useState(() => {
    try {
      return localStorage.getItem('helpotron.agent.active_identity_id') || null;
    } catch {
      return null;
    }
  });

  // Skills Management (Presets + User Custom Skills)
  const [skills, setSkills] = useState(() => {
    try {
      const saved = localStorage.getItem('helpotron.agent.custom_skills');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeSkillIds, setActiveSkillIds] = useState(() => {
    try {
      const saved = localStorage.getItem('helpotron.agent.active_skill_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [memory, setMemory] = useState([]);
  const [memoryText, setMemoryText] = useState('');
  const [files, setFiles] = useState([]);
  const [fileKind, setFileKind] = useState('skill');
  const [viewFile, setViewFile] = useState(null); // { name, kind, content } viewer
  const [renameOpenId, setRenameOpenId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingPermissions, setPendingPermissions] = useState([]);
  const [permOpenId, setPermOpenId] = useState(null); // which pending id the full popup shows
  const shownPermsRef = useRef(new Set());            // ids already auto-popped
  const dismissedPermsRef = useRef(new Set());        // ids the user closed/reopened manually
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  /* Recent agent actions (ledger) — rollback surface. */
  useEffect(() => {
    let alive = true;
    (async () => {
      // Only fetch when a session exists (localStorage 'token') — otherwise the
      // auth-gated call 401s and just spams the console.
      if (!localStorage.getItem('token')) return;
      setLedgerLoading(true);
      try {
        const res = await api.getAgentActions();
        if (alive) setLedger(res?.actions || []);
      } catch {
        /* not authenticated / demo mode — ledger stays empty and hidden */
      } finally {
        if (alive) setLedgerLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ── Assignment bubbles — per-assignment chat + file drop (08-26) ────── */
  const [assignments, setAssignments] = useState([]);
  const [bubbleChats, setBubbleChats] = useState({});
  const [bubbleInputs, setBubbleInputs] = useState({});
  const [bubbleOpen, setBubbleOpen] = useState({});
  const [bubbleBusy, setBubbleBusy] = useState({});
  const bubbleFileRef = useRef(null);
  const bubbleFileTarget = useRef(null);

  /* Assignment lifecycle watcher (operator 08-28): everywhere else the cards
   * payload is a one-shot mount-time snapshot — that is how a "ghost"
   * assignment survives a deletion or turn-in done in another view. Here the
   * snapshot is re-pulled on a timer and on tab focus, deduped/normalized,
   * and diffed against the previous snapshot. The resulting events (NEW
   * ASSIGNMENT / DUE SOON / SUBMITTED) are pushed into the chat as distinct
   * assignment bubbles. Each event type is announced ONCE per session (seen
   * keys), so a repeated poll never duplicates a bubble. */
  const assignmentEventsAnnouncedRef = useRef(new Set()); // "type:id" keys
  const assignmentsBaselineRef = useRef(null);            // Map<id, card> — last snapshot
  const turnedInIdsRef = useRef(new Set());               // ids in the turn-in history
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function pushAssignmentBubble(event) {
    const info = formatAssignmentEvent(event);
    setMessages((prev) => [...prev, {
      id: `evt_${Date.now()}_${Math.random()}`,
      sender: 'assistant',
      kind: 'assignment',
      eventType: info.type,
      assignment: { ...event.card },
      text: info.headline,
      detail: info.detail,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
  }

  async function refreshAssignmentsData({ firstLoad = false } = {}) {
    try {
      const [cardsRes, turnedInRes] = await Promise.all([
        api.assignmentCards().catch(() => null),
        api.getTurnedInAssignments().catch(() => null),
      ]);
      if (!mountedRef.current) return;
      if (!cardsRes?.cards || !Array.isArray(cardsRes.cards)) return;
      const normalized = normalizeCards(cardsRes.cards);
      const turnedInIds = new Set(
        (turnedInRes?.history || []).map((h) => h.id ?? h.assignment_id)
          .filter((id) => id != null).map(String)
      );
      // Ghost filter: a turned-in assignment belongs to history, not to the
      // active bubble list — the cards payload does not exclude it server-side.
      setAssignments(normalized.filter((c) => !turnedInIds.has(String(c.id))));
      const events = computeAssignmentEvents({
        prev: firstLoad ? null : assignmentsBaselineRef.current,
        cards: normalized,
        turnedInIds,
        prevTurnedInIds: turnedInIdsRef.current,
      });
      let pushed = 0;
      for (const evt of events) {
        const key = `${evt.type}:${evt.card.id}`;
        if (assignmentEventsAnnouncedRef.current.has(key)) continue;
        assignmentEventsAnnouncedRef.current.add(key);
        if (pushed >= 8) continue; // flood guard — the baseline still records the batch
        pushed += 1;
        pushAssignmentBubble(evt);
      }
      assignmentsBaselineRef.current = new Map(normalized.map((c) => [c.id, c]));
      turnedInIdsRef.current = turnedInIds;
      if (firstLoad && normalized.length > 0) {
        setBubbleOpen((prev) => ({ ...prev, [normalized[0].id]: true }));
        loadBubbleHistory(normalized[0].id);
      }
    } catch (e) { /* demo / offline — the bubbles section simply keeps its last state */ }
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    refreshAssignmentsData({ firstLoad: true });
    const interval = setInterval(() => refreshAssignmentsData(), 45000);
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') refreshAssignmentsData();
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('focus', refreshOnReturn);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('focus', refreshOnReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBubbleHistory(id) {
    try {
      const d = await api.get(`/api/agent/chat/${id}`);
      if (d?.chat?.length) setBubbleChats((prev) => ({ ...prev, [id]: d.chat }));
    } catch { /* history is auth-gated; skip silently */ }
  }

  function toggleBubble(id) {
    setBubbleOpen((prev) => {
      const next = !prev[id];
      if (next) loadBubbleHistory(id);
      return { ...prev, [id]: next };
    });
  }

  function pushBubble(id, sender, text) {
    setBubbleChats((prev) => ({
      ...prev,
      [id]: [
        ...(prev[id] || []),
        { id: `local_${Date.now()}_${Math.random()}`, sender, text, timestamp: new Date().toISOString() },
      ],
    }));
  }

  async function sendBubbleMessage(id) {
    const query = (bubbleInputs[id] || '').trim();
    if (!query || bubbleBusy[id]) return;
    setBubbleInputs((p) => ({ ...p, [id]: '' }));
    pushBubble(id, 'user', query);
    setBubbleBusy((p) => ({ ...p, [id]: true }));
    try {
      const res = await api.agentChat({ assignment_id: id, text: query, session_mode_override: mode });
      pushBubble(id, 'overlord', res?.reply || res?.message || '✅ Done.');
    } catch (e) {
      pushBubble(id, 'overlord', `⚠️ Couldn't reach the agent right now (${e.message}).`);
    } finally {
      setBubbleBusy((p) => ({ ...p, [id]: false }));
    }
  }

  /* Drop file INTO the bubble: /api/dump/upload with assignment_id FormData
   * field — the dump engine binds it (manual_assignment_id) and extracts the
   * text into that assignment's context. The success confirmation is a chat
   * message in the bubble (client-rendered; the file itself persists
   * server-side with matched_assignment_id). */
  async function handleBubbleFile(e) {
    const f = e.target.files?.[0];
    const id = bubbleFileTarget.current;
    e.target.value = '';
    if (!f || !id) return;
    pushBubble(id, 'user', `📎 ${f.name} (attaching to this assignment…)`);
    setBubbleBusy((p) => ({ ...p, [id]: true }));
    try {
      const form = new FormData();
      form.append('file', f);
      form.append('assignment_id', String(id));
      const res = await api.uploadDumpFile(form);
      const attached = res?.status === 'success' && (res.matched_assignment_id === id || res.item_status === 'manual_routed');
      pushBubble(id, 'overlord', attached
        ? `File ${f.name} added ✓ — extracted and attached to this assignment.`
        : `File ${f.name} was extracted, but I couldn't attach it to this assignment.`);
    } catch (err) {
      pushBubble(id, 'overlord', `⚠️ File upload failed: ${err.message}`);
    } finally {
      setBubbleBusy((p) => ({ ...p, [id]: false }));
      bubbleFileTarget.current = null;
    }
  }

  async function undoAction(actionId) {
    try {
      const res = await api.undoAgentAction(actionId);
      pushAssistant(`⏪ ${res?.message || 'Rolled back.'}`);
    } catch (e) {
      pushAssistant(`⚠️ Couldn't roll back: ${e.message}`);
    }
    try {
      const res = await api.getAgentActions();
      setLedger(res?.actions || []);
    } catch {
      /* ignore refresh failures */
    }
  }
  const [compactMsg, setCompactMsg] = useState('');
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatInputRef = useRef(null);
  const effortTimer = useRef(null);

  const persist = (next) => { setSettingsState(next); saveSettings(next); };
  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(settings));
    const keys = path.split('.');
    let obj = next;
    while (keys.length > 1) { obj = obj[keys.shift()]; }
    obj[keys[0]] = value;
    persist(next);
    // Mirror into the server settings store (best-effort; local store is source of truth)
    api.updateSettings({ ai: next.ai }).catch(() => {});
  };

  useEffect(() => { loadThreads(); }, []);
  /* Load the surviving legacy conversation (key 0) at mount — without this the
   * feed always starts at the intro line, looking like history was deleted. */
  useEffect(() => {
    api.agentChatHistory(0).then((res) => {
      const chat = res?.chat || [];
      if (Array.isArray(chat) && chat.length) {
        setMessages(chat.map((m) => ({
          id: m.id || Date.now() + Math.random(),
          sender: m.sender === 'user' ? 'user' : 'assistant',
          text: m.text || '',
          time: (m.timestamp || '').slice(11, 16),
        })));
      }
    }).catch(() => {});
  }, []);
  /* ── initial load: mode, effort, memory, files, permission poll ───────── */
  useEffect(() => {
    const ai = settings.ai || {};
    setMode(ai.mode || 'auto');
    // UI effort is 1–10; backend storage is 1–1000 (÷100 here).
    setEffort(Math.max(1, Math.min(10, Math.round((ai.effortScore || EFFORT_SCORES[ai.effort] || 500) / 100))));
    setAutoApprove(ai.autoApprove !== false);
    api.agentMode().then((d) => d?.operation_mode && setMode(d.operation_mode)).catch(() => {});
    api.getAgentMemory().then((d) => setMemory(d.entries || [])).catch(() => {});
    api.listAgentFiles().then((d) => setFiles(d.files || [])).catch(() => {});
    /* Permission popup (09-01, Bob): any pending id the user hasn't already
     * seen or dismissed auto-opens the FULL modal. The chat response path
     * handles the immediate case; this covers pending requests from earlier
     * (e.g. a page reload with a still-pending action). */
    const pollPerms = () => {
      api.agentPermissionsPending()
        .then((d) => {
          const list = d.pending || [];
          setPendingPermissions(list);
          const next = list.find(
            (p) => !shownPermsRef.current.has(p.id) && !dismissedPermsRef.current.has(p.id)
          );
          if (next) {
            shownPermsRef.current.add(next.id);
            setPermOpenId(next.id);
          }
        })
        .catch((e) => {
          /* Dead/expired session (401) or ban (403): stop polling so a stale
           * signed-out tab doesn't spam 401s into the access log forever
           * (08-30, burst-detector noise). A fresh sign-in remounts this view
           * and restarts the poll. */
          if (e && (e.status === 401 || e.status === 403)) clearInterval(poll);
          /* transient network — next tick retries */
        });
    };
    const poll = setInterval(pollPerms, 12000);
    pollPerms();
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const ai = settings.ai || {};
  const agentName = ai.aiName || 'Atlas';

  /* ── execution modes + auto-approved actions ──────────────────────────── */
  async function handleSwitchMode(next) {
    setMode(next);
    const updated = { ...settings, ai: { ...settings.ai, mode: next } };
    persist(updated);
    try {
      await api.setAgentMode(next);
      await api.updateSettings({ operation_mode: next, ai: { ...settings.ai, mode: next } });
    } catch (e) { /* session override already applied client-side */ }
    pushAssistant(`⚙️ Execution mode updated to: ${next.toUpperCase()}`);
  }

  /* Educational Mode quick toggle (08-26 gate): flips the top-level per-user
   * switch locally and mirrors it to the server settings store so the
   * backend mode_for_node gate agrees with the UI. */
  function toggleEducationalMode() {
    const next = settings.educationalMode === false;
    const updated = { ...settings, educationalMode: next };
    persist(updated);
    api.updateSettings({ educationalMode: next }).catch(() => {});
  }

  /* Auto-approved actions list: persisted to settings + backend. */
  function saveAutoList(next) {
    setAutoList(next);
    const updated = { ...settings, ai: { ...settings.ai, autoApprovedActions: next } };
    persist(updated);
    api.updateSettings({ ai: updated.ai }).catch(() => {});
  }

  async function handleAutoApprove(v) {
    setAutoApprove(v);
    const updated = { ...settings, ai: { ...settings.ai, autoApprove: v } };
    persist(updated);
    try {
      await api.updateSettings({
        auto_approved_actions: v ? ['humanize', 'analyze_rubric', 'draft_section'] : [],
        ai: { ...settings.ai, autoApprove: v },
      });
    } catch (e) { /* local store persists regardless */ }
  }

  /* ── effort scale (UI 1–10 → backend 1–1000, ×100): debounced ────────── */
  function handleEffort(v) {
    const val = Number(v);              // 1-10 UI value
    const score = Math.round(val * 100); // backend contract 1-1000
    const bucket = val <= 3 ? 'low' : val <= 7 ? 'balanced' : 'high';
    setEffort(score);
    clearTimeout(effortTimer.current);
    effortTimer.current = setTimeout(() => {
      const updated = { ...settings, ai: { ...settings.ai, effortScore: score, effort: bucket } };
      persist(updated);
      api.updateSettings({ effort_score: score, ai: updated.ai }).catch(() => {});
    }, 400);
  }

  function pushAssistant(text) {
    setMessages((prev) => [...prev, {
      id: Date.now() + Math.random(),
      sender: 'assistant',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
  }

  /* ── action-result side effects (09-01): an executed tool call can ask the
   * view to switch (select_settings → Settings page via onGoTo) or hand over a
   * real download (export_assignment_data → export_url). ───────────────── */
  function handleActionResult(res) {
    const exec = res && res.execution;
    if (!exec) return;
    if (exec.navigate_to) onGoTo(exec.navigate_to);
    if (exec.export_url) window.open(exec.export_url, '_blank', 'noopener');
  }

  /* ── chat: one agent, any request ─────────────────────────────────────── */
  async function sendMessage(text) {
    const query = (text || input).trim();
    if (!query) return;
    setMessages((prev) => [...prev, {
      id: Date.now(), sender: 'user', text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
    setInput('');
    setBusy(true);
    setThinking({ visible: false, minimized: false, text: '' });

    let streamedSuccess = false;
    try {
      const streamRes = await api.agentChatStream(
        {
          assignment_id: 0,
          text: query,
          session_mode_override: mode,
          thread_id: activeThread ?? undefined,
        },
        (evt) => {
          if (evt.type === 'reasoning' && evt.delta) {
            setThinking((prev) => ({ visible: true, minimized: prev.minimized, text: prev.text + evt.delta }));
          }
        }
      );
      if (streamRes && (streamRes.status === 'success' || streamRes.type === 'done')) {
        const replyText = streamRes.reply || '✅ Done.';
        setThinking({ visible: false, minimized: false, text: '' });
        pushAssistant(replyText);
        streamedSuccess = true;
      }
    } catch {
      // streaming fallback to standard agentChat
    }

    if (!streamedSuccess) {
      setThinking({ visible: false, minimized: false, text: '' });
      try {
        const res = await api.agentChat({
          assignment_id: 0,
          text: query,
          session_mode_override: mode,
          thread_id: activeThread ?? undefined,
        });
        // Live token balance (08-27): the chat response carries the post-charge
        // balance — reflect it in the top-bar widget immediately, no refresh.
        if (res && res.token_balance != null) onTokenBalance(Number(res.token_balance) || 0);
        // reply may be a plain string OR the message object (gate/status replies)
        const replyRaw = res?.reply ?? res?.message;
        const replyText = typeof replyRaw === 'string' ? replyRaw : (replyRaw?.text || '✅ Done.');
        pushAssistant(replyText);
        handleActionResult(res);
        // Full permission popup ON THE SPOT (09-01 fix): the chat response
        // itself carries the pending request — show it now instead of waiting
        // for the 12s poll (the old behavior left only a quiet inline banner).
        if (res?.permission_request?.id) {
          const pr = res.permission_request;
          setPendingPermissions((prev) => (prev.some((p) => p.id === pr.id) ? prev : [pr, ...prev]));
          shownPermsRef.current.add(pr.id);
          setPermOpenId(pr.id);
        }
      } catch (e) {
        /* The api layer throws the raw response body; pull the server's own
         * "message" out so users see "An unexpected server error occurred."
         * instead of a wall of JSON (09-01, seen live on prod). */
        const raw = (e && e.message) || '';
        const pretty = raw.trim().startsWith('{')
          ? (() => { try { return JSON.parse(raw).message || raw; } catch { return raw; } })()
          : raw;
        pushAssistant(`⚠️ The agent couldn't reach the backend right now (${pretty}). In demo mode responses are simulated.`);
      }
    }

    setBusy(false);
    loadThreads(); // refresh updated_at / auto-title
  }

  /* ── composer paperclip (operator 08-28): images/pdf/docs/txt are uploaded
   * as the REAL file — the server OCR/extracts them and the agent sees the
   * content. Other kinds (audio/video/unknown) fall back to the old
   * filename-text message. The typed input goes WITH the file, and survives a
   * failed send. ──────────────────────────────────────────────────────────── */
  async function handleComposerAttach(f) {
    const typed = input.trim();
    const textKind = /\.(png|jpe?g|webp|gif|pdf|docx?|txt|md)$/i.test(f.name);
    if (!textKind) { // not a readable-attach kind — old behavior
      sendMessage(`Process this file and tell me what you found: ${f.name}`);
      return;
    }
    setMessages((prev) => [...prev, {
      id: Date.now(), sender: 'user', text: `📎 ${f.name}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      if (typed) fd.append('text', typed);
      const res = await api.agentChatAttach(fd);
      if (res && res.token_balance != null) onTokenBalance(Number(res.token_balance) || 0);
      const replyRaw = res?.reply ?? res?.message;
      const replyText = typeof replyRaw === 'string' ? replyRaw : (replyRaw?.text || '✅ Done.');
      pushAssistant(replyText);
      handleActionResult(res);
      setInput(''); // the typed text went with the attachment
    } catch (e) {
      setBusy(false);
      await sendMessage(`Process this file and tell me what you found: ${f.name}`);
      if (typed) setInput(typed); // keep the user's typed text (sendMessage cleared it)
    } finally {
      setBusy(false);
      loadThreads();
    }
  }

  /* ── chat threads: histories, new chat, switching (operator 08-26) ───── */
  async function loadThreads() {
    try {
      const res = await api.agentThreads();
      setThreads(res?.threads || []);
    } catch { /* ignore */ }
  }

  const timeShort = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  async function renameThread(t) {
    const title = renameDraft.trim();
    if (!title) { setRenameOpenId(null); return; }
    try {
      await api.request(`/api/agent/threads/${t.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      setRenameOpenId(null);
      await loadThreads();
    } catch (e) { /* ignore */ }
  }

  async function togglePin(t) {
    try {
      await api.request(`/api/agent/threads/${t.id}`, { method: 'PATCH', body: JSON.stringify({ pinned: !t.pinned }) });
      await loadThreads();
    } catch (e) { /* ignore */ }
  }

  async function deleteThread(t) {
    try {
      await api.request(`/api/agent/threads/${t.id}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((x) => x.id !== t.id));
      if (activeThread === t.id) {
        // Deleting the open thread — fall back to the current conversation.
        await openThread({ id: 0 });
        await loadThreads();
      } else {
        await loadThreads();
      }
    } catch (e) {
      pushAssistant(`⚠️ Couldn't delete that chat: ${e.message}`);
    }
  }

  async function newChat() {
    try {
      const res = await api.agentThreadCreate();
      const t = res?.thread;
      if (!t) return;
      setActiveThread(t.id);
      setMessages([{
        id: Date.now(), sender: 'assistant', text: "I'm your personal agent — ask me to do anything: draft work, generate materials, change settings, edit an assignment, plan your day, or manage my own memory and files.", time: 'Just now',
      }]);
      await loadThreads();
    } catch (e) {
      pushAssistant(`⚠️ Couldn't create a new chat: ${e.message}`);
    }
  }

  async function openThread(t) {
    setActiveThread(t.id);
    try {
      const res = await api.agentChatHistory(t.id);
      const chat = res?.chat || [];
      const clean = (Array.isArray(chat) ? chat : []).map((m) => ({
        id: m.id || Date.now() + Math.random(),
        sender: m.sender === 'user' ? 'user' : 'assistant',
        text: m.text || '',
        time: (m.timestamp || '').slice(11, 16),
      }));
      setMessages(clean.length ? clean : [{
        id: Date.now(), sender: 'assistant', text: "I'm your personal agent — ask me to do anything: draft work, generate materials, change settings, edit an assignment, plan your day, or manage my own memory and files.", time: 'Just now',
      }]);
    } catch (e) {
      pushAssistant(`⚠️ Couldn't load that chat: ${e.message}`);
    }
  }

  async function handleCompact() {
    setCompactMsg('Compacting…');
    try {
      const res = await api.compactAgentChat();
      setCompactMsg('');
      pushAssistant(res?.message || '🧹 Chat history compacted — the agent kept the key context and dropped old filler.');
    } catch (e) {
      setCompactMsg('');
      pushAssistant('⚠️ Compaction failed — the backend is unreachable.');
    }
  }

  /* ── Identity & Skill Management Handlers (CRUD + Selection) ───────── */
  function handleSelectIdentity(identity) {
    if (!identity) return;
    setActiveIdentityId(identity.id);
    try { localStorage.setItem('helpotron.agent.active_identity_id', identity.id); } catch {}
    set('ai.personality', identity.persona);
    set('ai.instructions', identity.instructions);
    pushAssistant(`🎭 Switched active persona to **${identity.name}** (${identity.icon}). Personality and instructions have been updated.`);
  }

  function handleAddIdentity(newId) {
    setIdentities((prev) => {
      const next = [...prev, newId];
      try { localStorage.setItem('helpotron.agent.custom_identities', JSON.stringify(next)); } catch {}
      return next;
    });
    handleSelectIdentity(newId);
  }

  function handleDeleteIdentity(id) {
    setIdentities((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try { localStorage.setItem('helpotron.agent.custom_identities', JSON.stringify(next)); } catch {}
      return next;
    });
    if (activeIdentityId === id) {
      setActiveIdentityId(null);
      try { localStorage.removeItem('helpotron.agent.active_identity_id'); } catch {}
      set('ai.personality', 'Coach');
      set('ai.instructions', 'Explain like you are a patient coach. Check my understanding before moving on.');
      pushAssistant('🎭 Active persona deleted — personality reset to the default Coach.');
    }
  }

  function handleUpdateIdentity(updatedId) {
    if (!updatedId?.id) return;
    setIdentities((prev) => {
      const next = prev.map((item) => (item.id === updatedId.id ? { ...item, ...updatedId } : item));
      try { localStorage.setItem('helpotron.agent.custom_identities', JSON.stringify(next)); } catch {}
      return next;
    });
    if (activeIdentityId === updatedId.id) {
      set('ai.personality', updatedId.persona);
      set('ai.instructions', updatedId.instructions);
    }
    pushAssistant(`🎭 Updated identity **${updatedId.name}**.`);
  }

  function handleToggleSkill(skillId) {
    setActiveSkillIds((prev) => {
      const next = prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId];
      try { localStorage.setItem('helpotron.agent.active_skill_ids', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function handleSelectSkill(skill) {
    if (skill.promptTemplate) {
      setInput((prev) => (prev ? `${prev}\n\n${skill.promptTemplate}` : skill.promptTemplate));
      setTimeout(() => {
        chatInputRef.current?.focus();
        chatInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }

  function handleAddSkill(newSkill) {
    setSkills((prev) => {
      const next = [...prev, newSkill];
      try { localStorage.setItem('helpotron.agent.custom_skills', JSON.stringify(next)); } catch {}
      return next;
    });
    handleToggleSkill(newSkill.id);
  }

  function handleUpdateSkill(updatedSkill) {
    if (!updatedSkill?.id) return;
    setSkills((prev) => {
      const next = prev.map((item) => (item.id === updatedSkill.id ? { ...item, ...updatedSkill } : item));
      try { localStorage.setItem('helpotron.agent.custom_skills', JSON.stringify(next)); } catch {}
      return next;
    });
    pushAssistant(`⚡ Updated skill **${updatedSkill.name}**.`);
  }

  function handleDeleteSkill(skillId) {
    setSkills((prev) => {
      const next = prev.filter((item) => item.id !== skillId);
      try { localStorage.setItem('helpotron.agent.custom_skills', JSON.stringify(next)); } catch {}
      return next;
    });
    setActiveSkillIds((prev) => prev.filter((id) => id !== skillId));
  }

  function handleSaveAgentName(name) {
    const finalName = (name || '').trim() || 'Atlas';
    setAgentNameDraft(finalName);
    set('ai.aiName', finalName);
    pushAssistant(`✨ Agent name updated to **${finalName}**.`);
  }

  /* ── permanent memory ─────────────────────────────────────────────────── */
  async function addMemory() {
    const text = memoryText.trim();
    if (!text) return;
    setMemoryText('');
    try {
      const res = await api.appendAgentMemory(text);
      const entry = res?.entry || { id: `m_${Date.now()}`, text, created_at: new Date().toISOString() };
      setMemory((prev) => [...prev, entry]);
      pushAssistant(`🧠 Remembered: “${text.slice(0, 80)}${text.length > 80 ? '…' : ''}”`);
    } catch (e) { /* keep input */ }
  }

  async function handleUpdateMemory(id, newText) {
    const text = (newText || '').trim();
    if (!text) return;
    setMemory((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
    try {
      await api.deleteAgentMemory(id);
      const res = await api.appendAgentMemory(text);
      if (res?.entry) {
        setMemory((prev) => prev.map((m) => (m.id === id ? res.entry : m)));
      }
    } catch (e) { /* keep local update */ }
  }

  async function deleteMemory(id) {
    setMemory((prev) => prev.filter((m) => m.id !== id));
    try { await api.deleteAgentMemory(id); } catch (e) { /* optimistic */ }
  }

  /* operator 08-28: pick a saved memory → load it into the prompt box */
  function useMemory(m) {
    setInput(m.text);
    chatInputRef.current?.focus();
    chatInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* operator 08-28: SELECT semantics for the CONFIGS sidebar — load any
   * config (identity / file) into the prompt box and focus it. */
  function selectConfig(text) {
    if (!text) { chatInputRef.current?.focus(); return; }
    setInput(text);
    chatInputRef.current?.focus();
    chatInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* operator 08-28: identity SAVE from the sidebar — same path as the
   * Identity section (set() persists locally + mirrors to the server). */
  function savePersonality(v) {
    if ((v || '') === (ai.personality || '')) return;
    set('ai.personality', v);
    pushAssistant(`🎭 Personality updated — that's how ${agentName} will act now.`);
  }

  function saveInstructions(v) {
    if ((v || '') === (ai.instructions || '')) return;
    set('ai.instructions', v);
    pushAssistant('📋 Instructions updated — I\'ll follow them from now on.');
  }

  /* operator 08-28: file → prompt box (SELECT) — fetch the full content
   * (same endpoint as openFile) and load it in so the user can talk
   * about/with it. */
  async function useFileInPrompt(f) {
    try {
      const res = await api.get(`/api/agent/files/${f.id}`);
      const content = res?.file?.content || '';
      selectConfig(`📎 ${f.file_name}\n\n${content}`);
    } catch (e) {
      selectConfig(`📎 ${f.file_name}`);
    }
  }

  /* operator 08-28: prompt box grows with the text instead of staying tiny */
  function autosizeChat(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }
  useEffect(() => { autosizeChat(chatInputRef.current); }, [input]);

  /* ── files (skill / rule / automation / personality) ──────────────────── */
  /* operator 08-28: kindOverride lets the CONFIGS sidebar upload straight
   * into a specific kind group without touching the shared fileKind state. */
  async function handleUploadFile(e, kindOverride) {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind = kindOverride || fileKind;
    setBusy(true);
    try {
      const res = await api.uploadAgentFile(f, kind);
      const file = res?.file || { id: `f_${Date.now()}`, file_name: f.name, kind, size_bytes: f.size, created_at: new Date().toISOString() };
      setFiles((prev) => [...prev, file]);
      pushAssistant(`📎 Loaded “${f.name}” as a ${kind}. It's live — ask me to use it.`);
    } catch (err) {
      pushAssistant(`⚠️ Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function openFile(f) {
    try {
      const res = await api.get(`/api/agent/files/${f.id}`);
      setViewFile(res?.file || { file_name: f.file_name, kind: f.kind, content: '(missing)' });
    } catch (e) {
      setViewFile({ file_name: f.file_name, kind: f.kind, content: `⚠️ couldn't read: ${e.message}` });
    }
  }

  async function deleteFile(id) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    try { await api.deleteAgentFile(id); } catch (e) { /* optimistic */ }
  }

  /* ── avatars (user + agent, PNG/JPG) ──────────────────────────────────── */
  async function handleAvatarUpload(file, kind) {
    try {
      const res = await api.uploadAvatar(file, kind);
      const url = res?.url || '';
      if (!url) return;
      if (kind === 'user') {
        set('profile.avatarUrl', url);
      } else {
        set('ai.avatarUrl', url);
      }
      pushAssistant(kind === 'user' ? '👤 Profile picture updated.' : '🖼️ Agent avatar updated.');
    } catch (err) {
      pushAssistant(`⚠️ Avatar upload failed: ${err.message}`);
    }
  }

  async function handlePermissionAction(permId, decision, feedback = '') {
    let res;
    try {
      res = await api.agentPermissionRespond({
        permission_id: permId,
        decision,
        comment: feedback.trim() || undefined,
      });
    } catch (e) {
      /* Rethrow so the popup can show the error strip (its own catch) rather
       * than silently succeeding while the action stays pending (09-01). */
      throw new Error(e?.message || 'The approval could not be sent. Try again.');
    }
    if (decision === 'always_approve') {
      const next = [...new Set([...autoList, pending?.action_type].filter(Boolean))];
      saveAutoList(next);
    }
    /* Agent-side settings the action applied (09-01, Bob): the server returns
     * the full post-execution settings — push them through the normal persist
     * path so localStorage, MyAgent and AppShell all agree and the font/theme
     * change applies LIVE. Without this the approve closed the popup while the
     * UI kept its old values: "i clicked approve and it didnt work". */
    const execRes = res?.execution_result;
    if (execRes?.settings) persist(execRes.settings);
    if (execRes?.message) {
      pushAssistant(execRes.status === 'failed'
        ? `⚠️ Approval sent, but the action didn't apply: ${execRes.message}`
        : `✅ ${execRes.message}`);
    }
    setAutoApproveThis(false);
    setPermOpenId((cur) => (cur === permId ? null : cur));
    setPendingPermissions((prev) => prev.filter((p) => p.id !== permId));
  }

  const fileKindMeta = FILE_KINDS.find((k) => k.key === fileKind) || FILE_KINDS[0];
  const pending = pendingPermissions[0];
  const modalPermission = pendingPermissions.find((p) => p.id === permOpenId) || null;

  const renderThreadRow = (t) => (
    <div key={t.id} className={`group rounded-[var(--radius-md)] transition border ${
      activeThread === t.id
        ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.40)]'
        : t.pinned
          ? 'border-amber-500/30 bg-amber-500/[0.05]'
          : 'border-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)]'
    }`}>
      <button type="button" onClick={() => openThread(t)} className="w-full text-left px-2.5 py-2 flex items-center gap-2">
        <span className="text-sm">{t.pinned ? '📌' : '💬'}</span>
        <span className="flex-1 min-w-0">
          <span className={`block text-[11px] font-semibold truncate ${activeThread === t.id ? 'text-[var(--accent)]' : t.pinned ? 'text-amber-200' : 'text-[var(--text-secondary)]'}`}>
            {renameOpenId === t.id ? (
              <input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') renameThread(t); if (e.key === 'Escape') setRenameOpenId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-[var(--bg-surface)] border border-[rgba(139,92,246,0.4)] rounded px-1.5 py-0.5 text-[11px] text-white outline-none"
                autoFocus
              />
            ) : t.title}
          </span>
          <span className="block text-[9px] text-[var(--text-muted)]" title={t.last_message_at || t.updated_at || ''}>{timeShort(t.last_message_at || t.updated_at)}</span>
        </span>
      </button>
      <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1.5 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition">
        {renameOpenId !== t.id && (
          <button
            type="button"
            onClick={() => { setRenameOpenId(t.id); setRenameDraft(t.title); }}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer"
            title="Rename chat"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => togglePin(t)}
          className={`p-1 transition cursor-pointer ${t.pinned ? 'text-amber-300' : 'text-[var(--text-muted)] hover:text-[var(--accent)]'}`}
          title={t.pinned ? 'Unpin' : 'Pin chat'}
        >
          <Pin className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => deleteThread(t)}
          className="p-1 text-[var(--text-muted)] hover:text-red-400 transition cursor-pointer"
          title="Delete chat"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  const allIdentitiesList = identities;
  const currentIdentity = identities.find((id) => id.id === activeIdentityId) || null;

  /* Configs panel props — shared by drawer and sidebar */
  const configsSidebarProps = {
    ai,
    identities,
    activeIdentityId,
    onSelectIdentity: handleSelectIdentity,
    onAddIdentity: handleAddIdentity,
    onDeleteIdentity: handleDeleteIdentity,
    onSaveAgentName: handleSaveAgentName,
    onUpdateIdentity: handleUpdateIdentity,
    skills,
    activeSkillIds,
    onToggleSkill: handleToggleSkill,
    onAddSkill: handleAddSkill,
    onUpdateSkill: handleUpdateSkill,
    onDeleteSkill: handleDeleteSkill,
    onSelectSkill: handleSelectSkill,
    memory,
    memoryText,
    setMemoryText,
    addMemory,
    onUpdateMemory: handleUpdateMemory,
    deleteMemory,
    useMemory,
    files,
    fileKinds: FILE_KINDS,
    handleUploadFile,
    openFile,
    deleteFile,
    useFileInPrompt,
    selectConfig,
    savePersonality,
    saveInstructions,
    onCollapse: () => setConfigsOpen(false),
  };

  return (
    <div className="space-y-6">
      {/* ── Top Bar Panel: Identity + Mode + Quick Actions ── */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <AvatarUpload
            url={ai.avatarUrl || '/My_Agent_logo.jpeg'}
            initial="🧠"
            label="agent avatar"
            onUpload={(f) => handleAvatarUpload(f, 'agent')}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative flex items-center">
                <input
                  value={agentNameDraft}
                  onChange={(e) => setAgentNameDraft(e.target.value)}
                  onBlur={() => handleSaveAgentName(agentNameDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.target.blur();
                    }
                  }}
                  aria-label="Agent name"
                  title="Click to rename your agent (press Enter to save)"
                  className="bg-surface-container-low hover:bg-surface-container focus:bg-surface-container-lowest border border-outline-variant/30 focus:border-primary rounded-xl px-3 py-1 font-headline-lg text-title-md text-on-surface outline-none min-w-[120px] max-w-[240px] transition cursor-text"
                />
              </div>
              <span className="font-label-caps text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/15 text-primary flex items-center gap-1.5 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Ready
              </span>
              <span className="font-label-caps text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-medium">
                ⚡ {Math.max(1, Math.round(effort / 100))}/10 ({effortBucket(effort)})
              </span>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1 line-clamp-2">
              Ask anything, draft papers, transcribe lectures.
            </p>
          </div>
        </div>

        {/* Active Identity Pill + Execution Mode + Drawer Trigger + New Chat */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {/* Quick Active Identity Selector */}
          {currentIdentity ? (
            <button
              type="button"
              onClick={() => setConfigsOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-secondary-container/20 text-secondary border border-secondary/30 flex items-center gap-2 cursor-pointer font-label-caps text-xs uppercase tracking-wider hover:bg-secondary-container/30 transition"
              title="Active Agent Identity — Click to switch or customize"
            >
              <span>{currentIdentity.icon}</span>
              <span className="truncate max-w-[140px]">{currentIdentity.name}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>
          ) : null}

          <div className="bg-surface-container-low p-1 rounded-2xl border border-outline-variant/30 flex items-center gap-1">
            {Object.entries(MODE_META).map(([k, m]) => {
              const Icon = m.icon;
              const isActive = mode === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleSwitchMode(k)}
                  className={`px-3.5 py-1.5 rounded-xl font-label-caps text-xs uppercase tracking-wider flex items-center gap-1.5 transition ${
                    isActive
                      ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {m.label}
                </button>
              );
            })}
          </div>

          {/* Educational Mode quick toggle — same gate as Settings ▸ AI & Intelligence */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.educationalMode !== false}
            onClick={toggleEducationalMode}
            title="Educational Mode — On: school-only help. Off: open chat about anything."
            className={`px-3.5 py-2 rounded-xl border font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
              settings.educationalMode !== false
                ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Edu Mode
            <span className={`relative w-7 h-4 rounded-full transition-colors duration-200 ${settings.educationalMode !== false ? 'bg-primary' : 'bg-surface-container-highest'}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200 ${settings.educationalMode !== false ? 'left-[15px]' : 'left-0.5'}`} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setConfigsOpen(!configsOpen)}
            aria-pressed={configsOpen}
            className={`px-3.5 py-2 rounded-xl border font-label-caps text-xs uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
              configsOpen
                ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Configs ({allIdentitiesList.length + skills.length + memory.length + files.length})
          </button>

          <button
            type="button"
            onClick={newChat}
            className="px-4 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-caps text-xs uppercase tracking-wider font-semibold flex items-center gap-2 transition cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> New Chat
          </button>
        </div>
      </div>

      {/* ── Pending Permission Banner (if any action requires confirmation) ── */}
      {pending && (
        <div className="panel p-4 border-amber-500/40 bg-amber-500/10 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              ⚠️ Action pending approval: <span className="font-mono">{pending.action_type}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">Assignment #{pending.assignment_id}</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">{pending.description || 'The agent requested permission to perform this action on your behalf.'}</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => { dismissedPermsRef.current.delete(pending.id); setPermOpenId(pending.id); }}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] border border-amber-500/40 text-amber-300 hover:bg-amber-500/15 text-xs font-semibold transition cursor-pointer"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => handlePermissionAction(pending.id, autoApproveThis ? 'always_approve' : 'approve').catch(() => {})}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => handlePermissionAction(pending.id, 'reject').catch(() => {})}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              Reject
            </button>
            <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoApproveThis}
                onChange={(e) => setAutoApproveThis(e.target.checked)}
                className="accent-[var(--accent)] w-3.5 h-3.5 cursor-pointer"
              />
              <span>Always auto-approve {pending.action_type}</span>
            </label>
          </div>
        </div>
      )}

      {/* ── Main Workspace Grid: Threads Rail + Chat Canvas (+ docked Configs at xl) ── */}
      <div
        className={`grid grid-cols-1 gap-4 h-[calc(100vh-14rem)] min-h-[580px] ${
          configsOpen && isXL
            ? 'lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_440px]'
            : 'lg:grid-cols-[240px_minmax(0,1fr)]'
        }`}
      >
        {/* Left Rail: Threads List & Quick Effort Slider */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-4 flex flex-col justify-between overflow-hidden shadow-sm">
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            <div className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant px-2 py-1 flex items-center justify-between">
              <span>Conversations</span>
              <span className="font-tabular-stat text-xs">{threads.length}</span>
            </div>

            <div className="space-y-1">
              {threads.length === 0 && (
                <div className="font-body-sm text-xs text-on-surface-variant p-3 text-center italic">
                  No previous chats. Start a new topic!
                </div>
              )}
              {threads.some((t) => t.pinned) && (
                <>
                  <div className="font-label-caps text-[10px] text-primary font-semibold uppercase px-2 pt-1">📌 Pinned</div>
                  {threads.filter((t) => t.pinned).map((t) => renderThreadRow(t))}
                </>
              )}
              {threads.filter((t) => !t.pinned).map((t) => renderThreadRow(t))}
            </div>
          </div>

          {/* Quick Effort Slider at Bottom of Rail */}
          <div className="pt-3 border-t border-outline-variant/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Model Effort</span>
              <span className="font-tabular-stat font-bold text-primary">{Math.max(1, Math.round(effort / 100))}/10</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={Math.max(1, Math.round(effort / 100))}
              onChange={(e) => handleEffort(e.target.value)}
              aria-label="Effort level"
              className="w-full accent-primary cursor-pointer"
            />
          </div>
        </div>

        {/* Right Canvas: Message Stream + Floating Composer */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-0 flex flex-col overflow-hidden shadow-sm">
          {/* Active Chat Header */}
          <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <AgentAvatar
                size="sm"
                status={busy ? 'working' : 'ready'}
                src={ai.avatarUrl || '/My_Agent_logo.jpeg'}
              />
              <span className="font-title-md text-sm text-on-surface truncate">
                {activeThread ? threads.find((t) => t.id === activeThread)?.title || 'Current Chat' : `Chat with ${agentName}`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCompact}
                disabled={!!compactMsg}
                className="px-2.5 py-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-white transition cursor-pointer flex items-center gap-1.5"
                title="Compact conversation history"
              >
                <RefreshCw className={`w-3 h-3 ${compactMsg ? 'animate-spin' : ''}`} />
                <span>{compactMsg || 'Compact'}</span>
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div ref={listRef} className="flex-1 min-h-0 p-5 overflow-y-auto space-y-3.5">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              const isAssignmentBubble = m.kind === 'assignment';
              const evtMeta = EVENT_META[m.eventType] || EVENT_META.created;

              if (isAssignmentBubble) {
                /* (09-01) the assignment card opens the assignment's full
                   bubble workspace (same surface AssignmentCardDashboard uses).
                   Previously the only action routed to the bare dashboard grid,
                   losing the card ("navigated back to dashboard"). */
                const openBubbleAssign = () => {
                  if (m.assignment && m.assignment.id != null) onOpenAssignment(m.assignment);
                  else onGoTo('overview');
                };
                return (
                  <div key={m.id} className="w-full flex flex-col items-start">
                    <div
                      role={m.assignment && m.assignment.id != null ? 'button' : undefined}
                      tabIndex={m.assignment && m.assignment.id != null ? 0 : undefined}
                      onClick={openBubbleAssign}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBubbleAssign(); }
                      }}
                      className={`w-full sm:max-w-[85%] rounded-[var(--radius-lg)] border border-[rgba(139,92,246,0.35)] bg-gradient-to-br from-[rgba(139,92,246,0.14)] via-[var(--bg-surface)] to-[rgba(34,211,238,0.10)] p-3.5 space-y-2 ${m.assignment && m.assignment.id != null ? 'cursor-pointer hover:border-[rgba(139,92,246,0.6)] transition-colors focus:outline-none focus-visible:border-[rgba(139,92,246,0.8)]' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{evtMeta.icon}</span>
                        <span className="chip chip-accent text-[10px] font-mono">{evtMeta.label}</span>
                        <span className="ml-auto text-[10px] text-[var(--text-muted)] font-mono">{m.time}</span>
                      </div>
                      <div className="text-xs font-semibold text-white leading-relaxed">{m.text}</div>
                      {m.detail && <div className="text-xs text-[var(--text-muted)]">{m.detail}</div>}
                      <div className="pt-1 flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLaunchToDocTarget({
                              assignment: m.assignment,
                              text: m.assignment?.prompt || m.text || '',
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-sm)] bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-sm transition cursor-pointer border border-violet-400/30"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-violet-200" /> Launch to Doc
                        </button>
                        {m.assignment && m.assignment.id != null ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenAssignment(m.assignment);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] text-slate-300 text-xs font-semibold border border-[var(--border-subtle)] transition cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" /> Open Assignment
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onGoTo('overview');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] text-slate-300 text-xs font-semibold border border-[var(--border-subtle)] transition cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" /> View in Dashboard
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80ch] min-w-0 break-words rounded-[var(--radius-lg)] px-4 py-3 text-xs leading-relaxed border ${
                    isUser
                      ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.30)] text-white'
                      : 'panel text-slate-200'
                  }`}>
                    {m.text}
                  </div>
                  <div className="flex items-center gap-2.5 mt-1 px-1 text-[10px] text-[var(--text-muted)]">
                    <span>{m.time}</span>
                    {m.text && (
                      <button
                        type="button"
                        onClick={() => copyMessage(m.id, m.text)}
                        className={`transition cursor-pointer flex items-center gap-1 text-[10px] ${
                          copiedMsgId === m.id
                            ? 'text-emerald-400 font-semibold'
                            : 'hover:text-[var(--accent)] text-[var(--text-muted)]'
                        }`}
                        title="Copy this message"
                      >
                        {copiedMsgId === m.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedMsgId === m.id ? 'Copied' : 'Copy'}
                      </button>
                    )}
                    {!isUser && m.text && (
                      <>
                        <button
                          type="button"
                          onClick={() => speakText(m.id, m.text)}
                          className={`transition cursor-pointer flex items-center gap-1 text-[10px] ${
                            speakingMessageId === m.id
                              ? 'text-amber-400 font-semibold animate-pulse'
                              : 'hover:text-[var(--accent)] text-[var(--text-muted)]'
                          }`}
                          title={speakingMessageId === m.id ? 'Stop audio' : 'Listen to this reply'}
                        >
                          {speakingMessageId === m.id ? '⏹ Stop' : '🔊 Listen'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLaunchToDocTarget({ text: m.text })}
                          className="hover:text-violet-300 text-violet-400/90 transition cursor-pointer flex items-center gap-1 text-[10px]"
                          title="Launch this response to Google Doc with assistive typing"
                        >
                          <Sparkles className="w-3 h-3" /> Launch to Doc
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <ThinkingBubble thinking={thinking} setThinking={setThinking} />

            {busy && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] w-fit animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-2)]" />
                <span>{agentName} is thinking & generating…</span>
              </div>
            )}
          </div>

          {/* Bottom Floating Composer */}
          <div className="p-4 border-t border-outline-variant/30 bg-surface-container-lowest">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex items-end gap-2 bg-surface-container-low border border-outline-variant/30 rounded-2xl px-4 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary transition"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach file"
                title="Attach document or media"
                className="text-on-surface-variant hover:text-primary transition cursor-pointer p-1.5"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleRecord}
                aria-label={recording ? 'Stop recording' : 'Record voice'}
                className={`text-on-surface-variant hover:text-primary transition cursor-pointer p-1.5 ${recording ? 'text-error animate-pulse' : ''}`}
                title={recording ? 'Stop voice recording' : 'Dictate message'}
              >
                <Mic className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleComposerAttach(f);
                  e.target.value = '';
                }}
              />
              <textarea
                ref={chatInputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) sendMessage();
                  }
                }}
                placeholder={`Message ${agentName} (Enter to send, Shift+Enter for newline)…`}
                aria-label="Agent prompt input"
                className="flex-1 min-w-0 bg-transparent border-none text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none resize-none leading-relaxed py-1.5 max-h-[160px] overflow-y-auto"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy}
                aria-label="Send prompt"
                className="p-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container disabled:opacity-30 transition cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* ── Configs, docked as a third column at xl ──────────────────────
         * At xl there is room to show the panel beside the chat, so it is a
         * non-modal column: the chat stays visible AND interactive. Below xl
         * the same panel becomes the modal drawer rendered after this grid. */}
        {configsOpen && isXL && (
          <aside
            aria-label="Agent configurations"
            className="hidden xl:flex min-h-0 min-w-0 flex-col animate-fadeIn"
          >
            <AgentConfigsSidebar {...configsSidebarProps} onCollapse={() => setConfigsOpen(false)} />
          </aside>
        )}
      </div>

      {/* ── Slide-Over Drawer for Memory & Skills (below xl only) ──────────
       * Modal here is the right call: under 1280px there is no room to dock,
       * so the panel takes over with a dismissable scrim. At xl the docked
       * column above replaces it entirely — never both. */}
      {configsOpen && !isXL && (
        <div className="fixed inset-0 z-50 flex justify-end animate-fadeIn xl:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfigsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Agent configurations"
            className="relative w-full max-w-lg bg-[var(--bg-base)] border-l border-[var(--border-subtle)] h-full flex flex-col shadow-2xl z-10"
          >
            <AgentConfigsSidebar {...configsSidebarProps} onCollapse={() => setConfigsOpen(false)} />
          </div>
        </div>
      )}

      {/* File viewer modal */}
      {viewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => setViewFile(null)}>
          <div className="panel w-full max-w-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
              <div className="text-sm font-bold text-white flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span className="truncate">{viewFile.file_name}</span>
                <span className="chip chip-neutral text-[10px]">{viewFile.kind}</span>
              </div>
              <button type="button" onClick={() => setViewFile(null)} className="text-[var(--text-muted)] hover:text-white transition cursor-pointer">✕</button>
            </div>
            <div className="overflow-y-auto p-4 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
              {viewFile.content}
            </div>
          </div>
        </div>
      )}

      {/* Launch to Doc Accessibility Modal */}
      <LaunchToDocModal
        isOpen={!!launchToDocTarget}
        assignment={launchToDocTarget?.assignment}
        initialText={launchToDocTarget?.text || ''}
        onClose={() => setLaunchToDocTarget(null)}
      />

      {/* Full Permission Approval Popup (09-01, Bob's Stitch design) */}
      {modalPermission && (
        <PermissionModal
          permission={modalPermission}
          onDecision={handlePermissionAction}
          onClose={() => {
            setPermOpenId((cur) => {
              if (cur) dismissedPermsRef.current.add(cur);
              return null;
            });
          }}
        />
      )}
    </div>
  );
}
