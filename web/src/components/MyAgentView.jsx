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
  Settings2, ArrowUpRight,
} from 'lucide-react';
import api, { getCsrfToken } from '../api.js';
import { loadSettings, saveSettings, EFFORT_SCORES } from '../demoData.js';
import { Badge, EmptyState, timeAgo } from './ui/os.jsx';
import { normalizeCards, computeAssignmentEvents, formatAssignmentEvent, EVENT_META } from '../lib/assignmentEvents.js';
import { AgentAvatar } from './ui/AgentAvatar.jsx';
import SectionCard from './SectionCard.jsx';
import AgentConfigsSidebar from './AgentConfigsSidebar.jsx';

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

export default function MyAgentView({ userId = '', userCredits, onGoTo = () => {}, onTokenBalance = () => {} }) {
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

  /* ── CONFIGS sidebar (operator 08-28): SEE / ADD / SELECT every custom
   * agent config. Renders as a fixed column at xl+, a slide-over drawer at
   * lg (1024-1279) so the chat never gets pinched, and an inline block on
   * small screens. Default open on xl desktops (a drawer covering the chat
   * at load would be worse); toggled anytime via ⚙ Configs in the chat
   * header or the panel's own Minimize control. ───────────────────────── */
  const [configsOpen, setConfigsOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  );
  /* Responsive breakpoints — matchMedia state so the grid can re-flow when
   * the window crosses lg (1024) / xl (1280) without relying on CSS alone. */
  const [isXL, setIsXL] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  );
  const [isLG, setIsLG] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mqXl = window.matchMedia('(min-width: 1280px)');
    const mqLg = window.matchMedia('(min-width: 1024px)');
    const onXl = () => setIsXL(mqXl.matches);
    const onLg = () => setIsLG(mqLg.matches);
    mqXl.addEventListener('change', onXl);
    mqLg.addEventListener('change', onLg);
    return () => { mqXl.removeEventListener('change', onXl); mqLg.removeEventListener('change', onLg); };
  }, []);
  /* Drawer mode: Escape closes the configs overlay. */
  useEffect(() => {
    if (!(configsOpen && !isXL && isLG)) return;
    const onKey = (e) => { if (e.key === 'Escape') setConfigsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [configsOpen, isXL, isLG]);
  /* operator 08-28: collapse the prompt composer to a slim bar (header toggle) */
  const [promptMinimized, setPromptMinimized] = useState(false);

  /* ── voice (08-27): mic dictation + spoken replies via local Voicebox ── */
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef(null);
  const recChunksRef = useRef([]);

  async function toggleRecord() {
    if (recording) {
      mediaRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      recChunksRef.current = [];
      mr.ondataavailable = (e) => recChunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (!blob.size) return;
        try {
          const fd = new FormData();
          fd.append('file', blob, 'rec.webm');
          const csrfHdr = getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {};
          const r = await fetch('/api/voice/transcribe', { method: 'POST', headers: csrfHdr, body: fd });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.text) setInput((prev) => (prev ? `${prev} ${j.text}` : j.text));
          else alert(`Voice: ${j.detail || 'transcription failed'}`);
        } catch (err) {
          alert(`Voicebox unavailable: ${err.message}`);
        }
      };
      mr.start();
      setRecording(true);
    } catch (err) {
      alert(`Mic unavailable: ${err.message}`);
    }
  }

  async function speakText(text) {
    try {
      const r = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {}),
        },
        body: JSON.stringify({ text: text.slice(0, 1200) }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({})))?.detail) || r.statusText);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      new Audio(url).play().catch(() => alert('Could not play the audio'));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      alert(`Voicebox unavailable: ${err.message}`);
    }
  }
  const [mode, setMode] = useState('auto');
  const [autoApprove, setAutoApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [effort, setEffort] = useState(500);
  const [feedbackFor, setFeedbackFor] = useState('');          // '' | 'approve' | 'reject'
  const [approvalFeedback, setApprovalFeedback] = useState('');
  const [autoApproveThis, setAutoApproveThis] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [autoList, setAutoList] = useState(() =>
    settings.ai?.autoApprovedActions?.length ? [...settings.ai.autoApprovedActions] : ['humanize', 'analyze_rubric', 'draft_section']
  );
  const [memory, setMemory] = useState([]);
  const [memoryText, setMemoryText] = useState('');
  const [files, setFiles] = useState([]);
  const [fileKind, setFileKind] = useState('skill');
  const [viewFile, setViewFile] = useState(null); // { name, kind, content } viewer
  const [renameOpenId, setRenameOpenId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingPermissions, setPendingPermissions] = useState([]);
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
    const poll = setInterval(() => {
      api.agentPermissionsPending().then((d) => setPendingPermissions(d.pending || [])).catch(() => {});
    }, 12000);
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
    } catch (e) {
      pushAssistant(`⚠️ The agent couldn't reach the backend right now (${e.message}). In demo mode responses are simulated.`);
    } finally {
      setBusy(false);
      loadThreads(); // refresh updated_at / auto-title
    }
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
    try {
      await api.agentPermissionRespond({
        permission_id: permId,
        decision,
        comment: feedback.trim() || undefined,
      });
    } catch (e) {}
    if (decision === 'always_approve') {
      const next = [...new Set([...autoList, pending?.action_type].filter(Boolean))];
      saveAutoList(next);
    }
    setFeedbackFor('');
    setApprovalFeedback('');
    setPendingPermissions((prev) => prev.filter((p) => p.id !== permId));
  }

  const fileKindMeta = FILE_KINDS.find((k) => k.key === fileKind) || FILE_KINDS[0];
  const pending = pendingPermissions[0];

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

  /* Configs panel props — shared by the xl column, the lg drawer and the
   * small-screen inline block so they always render identically. */
  const configsSidebarProps = {
    ai, memory, memoryText, setMemoryText, addMemory, deleteMemory, useMemory,
    files, fileKinds: FILE_KINDS, handleUploadFile, openFile, deleteFile,
    useFileInPrompt, selectConfig, savePersonality, saveInstructions,
  };

  return (
    <div className="space-y-5">
      {/* ── Identity header: avatar + agent name (08-28) ── */}
      <SectionCard id="myagent-identity" header={
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-4">
            <AvatarUpload
              url={ai.avatarUrl || '/My_Agent_logo.jpeg'}
              initial="🧠"
              label="agent avatar"
              onUpload={(f) => handleAvatarUpload(f, 'agent')}
            />
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <input
                  value={agentName}
                  onChange={(e) => set('ai.aiName', e.target.value)}
                  aria-label="Agent name"
                  className="bg-transparent text-lg font-bold text-[var(--text-primary)] outline-none border-b border-transparent focus:border-[var(--accent)] w-36"
                />
                <span className="aurora-chip">YOUR AGENT</span>
                <span className="aurora-chip" aria-label="Agent online"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /></span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                One agent for everything — ask it to do anything. · effort <span className="text-[var(--accent)] font-mono">{Math.max(1, Math.round(effort / 100))}/10</span> ({effortBucket(effort)})
              </p>
            </div>
          </div>
          {/* Control toolbar (IA 08-28): segmented mode picker (primary) +
           * auto-approve toggle + Manage — two secondaries max on this row. */}
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <div className="flex items-center gap-0.5 p-1 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              {Object.entries(MODE_META).map(([k, m]) => {
                const Icon = m.icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleSwitchMode(k)}
                    className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[10px] font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                      mode === k
                        ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.35)] text-[var(--accent)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border-transparent'
                    }`}
                  >
                    <Icon className="w-3 h-3" /> {m.label}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => handleAutoApprove(e.target.checked)}
                className="accent-[var(--accent)] w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[10px] text-[var(--text-secondary)]">Auto-approve routine</span>
            </label>
            <button
              type="button"
              onClick={() => setListOpen(!listOpen)}
              className={`px-3 py-1.5 rounded-full border text-[10px] font-semibold transition cursor-pointer ${
                listOpen
                  ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.35)] text-[var(--accent)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[rgba(139,92,246,0.35)]'
              }`}
              aria-expanded={listOpen}
            >
              {listOpen ? 'Done' : `Manage (${autoList.length})`}
            </button>
          </div>
          {listOpen && (
            <div className="w-full mt-2 p-3.5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Auto-approved actions — the agent doesn't ask for these
              </div>
              <div className="flex flex-wrap gap-1.5">
                {autoList.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-300"
                  >
                    {a}
                    <button
                      type="button"
                      aria-label={`Remove ${a}`}
                      onClick={() => saveAutoList(autoList.filter((x) => x !== a))}
                      className="w-4 h-4 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {autoList.length === 0 && (
                  <span className="text-[10px] text-[var(--text-muted)] italic">Nothing auto-approved — the agent asks before every action.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="e.g. draft_section, submit, send_message…"
                  className="clean-input flex-1 px-3 py-1.5 text-[11px] outline-none"
                  aria-label="New auto-approved action"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newAction.trim()) {
                      saveAutoList([...new Set([...autoList, newAction.trim()])]);
                      setNewAction('');
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newAction.trim()) {
                      saveAutoList([...new Set([...autoList, newAction.trim()])]);
                      setNewAction('');
                    }
                  }}
                  disabled={!newAction.trim()}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      }>

        {/* Effort scale — quick override for this agent (wins over main Settings) */}
        <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[var(--accent)]" /> Effort (1–10)
            </span>
            <span className="text-[11px] font-mono font-bold text-[var(--accent)]">
              {Math.max(1, Math.round(effort / 100))} <span className="text-[10px] text-[var(--text-muted)]">/ 10 · {effortBucket(effort)}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={Math.max(1, Math.round(effort / 100))}
              onChange={(e) => handleEffort(e.target.value)}
              aria-label="Agent effort score between 1 and 10"
              className="flex-1 accent-[var(--accent)] cursor-pointer"
            />
            <div className="flex gap-1.5">
              {['Low', 'Balanced', 'High'].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleEffort(b === 'Low' ? 1 : b === 'Balanced' ? 5 : 9)}
                  className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-[10px] font-medium transition cursor-pointer border ${
                    effortBucket(effort) === b
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[rgba(139,92,246,0.35)]'
                      : 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            Quick override — sets your agent's effort here, and it wins over the AI effort in main Settings.
            Low = cheap engines do mechanical work, high = flagship engines handle deep reasoning.
          </p>
        </div>
      </SectionCard>

      {/* ── Assignment bubbles — per-assignment chat + file drop ────────── */}
      <SectionCard id="myagent-assignment-bubbles" padding="p-4" header={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Assignment bubbles
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">
            {assignments.length} assignment{assignments.length === 1 ? '' : 's'}
          </span>
        </div>
      }>
        <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
          Each assignment has its own bubble: message the agent team about it, or drop a file in —
          it gets extracted and attached to that assignment.
        </p>

        {assignments.length === 0 && (
          <EmptyState
            icon="📘"
            title="No assignments yet"
            body="Create or dump an assignment first — each one gets its own bubble."
            actionLabel="Open Assignment Dump"
            onAction={() => onGoTo('dump')}
          />
        )}

        {assignments.length > 0 && (
          <div className="space-y-2.5">
            {assignments.map((a) => {
              const open = !!bubbleOpen[a.id];
              const chat = bubbleChats[a.id] || [];
              return (
                <div key={a.id} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleBubble(a.id)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                  >
                    <span className="text-base leading-none">📘</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-[var(--text-primary)] truncate">{a.name || `Assignment #${a.id}`}</span>
                      {/* Ghost guard (08-28): scrape pipelines can leave
                          subject/class/due empty — never render a bare
                          separator line. */}
                      <span className="block text-[10px] text-[var(--text-muted)] truncate">
                        {[a.subject, a.class_code].filter(Boolean).join(' · ') || 'uncategorized'} · due {a.due_date || 'No deadline'}
                      </span>
                    </span>
                    <Badge color={a.status === 'In Progress' ? 'blue' : a.status === 'Submitted' ? 'green' : 'slate'}>
                      {a.status}
                    </Badge>
                    <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>

                  {open && (
                    <div className="border-t border-[var(--border-subtle)] p-3">
                      <div className="max-h-56 overflow-y-auto space-y-2 mb-2.5 pr-1">
                        {chat.length === 0 && (
                          <p className="text-[11px] text-[var(--text-muted)]">
                            This bubble is fresh — message the team about the assignment, or add its materials with 📎.
                          </p>
                        )}
                        {chat.map((m) => {
                          const isUser = m.sender === 'user';

  return (
                            <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[72ch] min-w-0 break-words rounded-2xl px-3.5 py-2 text-[12px] leading-relaxed border ${
                                isUser
                                  ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.30)] text-[var(--text-primary)]'
                                  : 'bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                              }`}>
                                {m.text}
                              </div>
                            </div>
                          );
                        })}
                        {bubbleBusy[a.id] && (
                          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] p-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] w-fit">
                            <RefreshCw className="w-3 h-3 animate-spin text-[var(--accent-2)]" /> {agentName} is working…
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] px-2.5 py-1 focus-within:border-[rgba(139,92,246,0.45)] transition">
                        <button
                          type="button"
                          onClick={() => { bubbleFileTarget.current = a.id; bubbleFileRef.current?.click(); }}
                          aria-label={`Add a file to ${a.name || `assignment ${a.id}`}`}
                          title="Attach a file — extracted and added to this assignment"
                          className="text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer p-1"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                        <input
                          type="text"
                          value={bubbleInputs[a.id] || ''}
                          onChange={(e) => setBubbleInputs((p) => ({ ...p, [a.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBubbleMessage(a.id); } }}
                          placeholder={`Message ${agentName} about this assignment…`}
                          aria-label={`Message the ${a.name || `assignment ${a.id}`} team`}
                          className="flex-1 bg-transparent border-none text-[16px] sm:text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => sendBubbleMessage(a.id)}
                          disabled={!bubbleInputs[a.id]?.trim() || bubbleBusy[a.id]}
                          aria-label={`Send message to the ${a.name || `assignment ${a.id}`} team`}
                          className="p-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 transition cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <input ref={bubbleFileRef} type="file" className="hidden" onChange={handleBubbleFile} />
          </div>
        )}
      </SectionCard>

      {/* ── Pending permission strip ─────────────────────────────────────── */}
      {pending && (
        <SectionCard id="myagent-pending-permission" padding="p-4" className="border-amber-500/35" header={
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              ⚠️ Action pending approval — {pending.action_type}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">Assignment #{pending.assignment_id} · {pending.description || 'the agent wants to act on your behalf'}</p>
          </div>
        }>
          <div className="space-y-2.5">
            {/* Approve (primary) + Reject (danger); the two alternate-action
                variants are row-level ghosts so the strip reads as 2 actions. */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePermissionAction(pending.id, autoApproveThis ? 'always_approve' : 'approve')}
                className="px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition cursor-pointer"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => { setFeedbackFor(feedbackFor === 'approve' ? '' : 'approve'); setApprovalFeedback(''); }}
                className="px-3.5 py-1.5 rounded-[var(--radius-sm)] border border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/15 text-[11px] font-semibold transition cursor-pointer"
              >
                Approve with feedback…
              </button>
              <button
                type="button"
                onClick={() => handlePermissionAction(pending.id, 'reject')}
                className="px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => { setFeedbackFor(feedbackFor === 'reject' ? '' : 'reject'); setApprovalFeedback(''); }}
                className="px-3.5 py-1.5 rounded-[var(--radius-sm)] border border-rose-500/35 text-rose-300 hover:bg-rose-500/15 text-[11px] font-semibold transition cursor-pointer"
              >
                Reject with feedback…
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={autoApproveThis}
                onChange={(e) => setAutoApproveThis(e.target.checked)}
                className="accent-[var(--accent)] w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[10px] text-[var(--text-muted)]">
                Also auto-approve this action type ({pending.action_type}) from now on
              </span>
            </label>
            {feedbackFor && (
              <div className="space-y-2">
                <textarea
                  value={approvalFeedback}
                  onChange={(e) => setApprovalFeedback(e.target.value)}
                  rows={2}
                  placeholder={feedbackFor === 'approve'
                    ? 'Optional instructions to run alongside the action…'
                    : 'Optional note for the agent…'}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] px-3 py-2 text-[11px] text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-muted)]"
                  aria-label="Feedback to send with your decision"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePermissionAction(pending.id, autoApproveThis ? 'always_approve' : feedbackFor, approvalFeedback)}
                    disabled={!approvalFeedback.trim()}
                    className="px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-[11px] font-semibold transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    Send {feedbackFor === 'approve' ? 'approve' : 'reject'} with feedback
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFeedbackFor(''); setApprovalFeedback(''); }}
                    className="px-3 py-1.5 rounded-[var(--radius-sm)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Chat + side panels ───────────────────────────────────────────── */}
      {/* CONFIGS panel: xl+ = fixed column (chat+rail+configs on one row),
       * lg (1024-1279) = slide-over drawer so the chat keeps its width,
       * below lg = inline stacked block (toggled via ⚙ Configs). The chat
       * column is always minmax(0,1fr) so fixed side columns can never
       * pinch it below the available room. */}
      <div className={`grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] ${configsOpen && isXL ? 'xl:grid-cols-[220px_minmax(0,1fr)_300px]' : ''}`}>
        {configsOpen && isXL && (
          <div className="h-[clamp(480px,calc(100vh-16rem),760px)] supports-[height:100dvh]:h-[clamp(480px,calc(100dvh-16rem),760px)] min-w-0">
            <AgentConfigsSidebar {...configsSidebarProps} onCollapse={() => setConfigsOpen(false)} />
          </div>
        )}
        {configsOpen && !isXL && isLG && createPortal(
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fadeIn"
              onClick={() => setConfigsOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 left-0 w-[min(320px,85vw)] p-3 sm:p-4 flex flex-col" role="dialog" aria-label="Agent configs">
              <div className="flex-1 min-h-0">
                <AgentConfigsSidebar {...configsSidebarProps} onCollapse={() => setConfigsOpen(false)} />
              </div>
            </div>
          </div>,
          document.body
        )}
        {configsOpen && !isLG && (
          <div className="h-[clamp(480px,calc(100vh-16rem),760px)] supports-[height:100dvh]:h-[clamp(480px,calc(100dvh-16rem),760px)]">
            <AgentConfigsSidebar {...configsSidebarProps} onCollapse={() => setConfigsOpen(false)} />
          </div>
        )}
        {/* Chat */}
        <SectionCard id="myagent-chat" padding="p-0" className="min-w-0 overflow-hidden flex flex-col h-[clamp(480px,calc(100vh-16rem),760px)] supports-[height:100dvh]:h-[clamp(480px,calc(100dvh-16rem),760px)]" header={
          <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-2.5 min-w-0 shrink">
              <AgentAvatar
                size="sm"
                status={busy ? 'working' : 'ready'}
                src={ai.avatarUrl || '/My_Agent_logo.jpeg'}
              />
              <span className="text-xs font-semibold text-[var(--text-primary)] truncate">Chat with {agentName}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap shrink">
              <span className="hidden 2xl:block"><span className="aurora-chip">{agentName}</span></span>
              <button
                type="button"
                onClick={() => setConfigsOpen(!configsOpen)}
                aria-pressed={configsOpen}
                title={configsOpen ? 'Hide the Configs sidebar' : 'Show the Configs sidebar'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-[10px] font-semibold transition cursor-pointer ${
                  configsOpen
                    ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.35)] text-[var(--accent)]'
                    : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[rgba(139,92,246,0.35)]'
                }`}
              >
                <Settings2 className="w-3 h-3" /> Configs
              </button>
              <button
                type="button"
                onClick={newChat}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-[10px] font-semibold transition cursor-pointer hover:bg-[var(--accent-hover)]"
                title="Start a new conversation"
              >
                <Plus className="w-3 h-3" /> New chat
              </button>
              <button
                type="button"
                onClick={handleCompact}
                disabled={!!compactMsg}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${compactMsg ? 'animate-spin' : ''}`} />
                {compactMsg || 'Compact'}
              </button>
            </div>
          </div>
        }>


          {/* Messages */}
          <div ref={listRef} className="flex-1 min-h-0 p-5 overflow-y-auto space-y-3">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              const isAssignmentBubble = m.kind === 'assignment';
              const evtMeta = EVENT_META[m.eventType] || EVENT_META.created;
              if (isAssignmentBubble) {
                return (
                  <div key={m.id} className="w-full flex flex-col items-start">
                    {/* Assignment bubble (operator 08-28): lifecycle events from the
                        assignment watcher render as own card-style bubble — label,
                        headline, detail and a jump to the dashboard. */}
                    <div className="w-full sm:max-w-[92%] rounded-[var(--radius-lg)] border border-[rgba(139,92,246,0.35)] bg-gradient-to-br from-[rgba(139,92,246,0.16)] via-[var(--bg-surface)] to-[rgba(34,211,238,0.12)] p-3.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base leading-none" aria-hidden="true">{evtMeta.icon}</span>
                        <span className="aurora-chip font-mono font-bold tracking-wider">{evtMeta.label}</span>
                        <span className="ml-auto text-[9px] text-[var(--text-muted)] font-mono">{m.time}</span>
                      </div>
                      <div className="text-[12px] font-semibold text-[var(--text-primary)] leading-relaxed">{m.text}</div>
                      {m.detail && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{m.detail}</div>}
                      <div className="flex items-center gap-2 mt-2.5">
                        <button
                          type="button"
                          onClick={() => onGoTo('overview')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-semibold transition cursor-pointer"
                          title="Open the assignment dashboard"
                        >
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" /> Open in dashboard
                        </button>
                        {m.assignment && (
                          <span className="text-[9px] text-[var(--text-muted)] font-mono truncate max-w-[50%]">
                            Assignment #{m.assignment.id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  {/* Shared aurora bubble language — matches AdminAgentChat exactly */}
                  <div className={`max-w-[72ch] min-w-0 break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed border ${
                    isUser
                      ? 'bg-[var(--accent-subtle)] border-[rgba(139,92,246,0.30)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}>
                    {m.text}
                  </div>
                  {!isUser && m.text && m.text.length <= 1200 && (
                    <button
                      type="button"
                      onClick={() => speakText(m.text)}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] mt-1 transition cursor-pointer"
                      title="Hear this reply (Voicebox TTS)"
                    >
                      🔊 hear
                    </button>
                  )}
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 px-1">{m.time}</span>
                </div>
              );
            })}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--bg-surface-elevated)] p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-2)]" />
                <span>{agentName} is working…</span>
              </div>
            )}
          </div>

          {/* Composer (operator 08-28: minimize toggle lives in this bar so the
              chat header stays at 1 primary + 2 secondary) */}
          <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {promptMinimized ? (
              <button
                type="button"
                onClick={() => { setPromptMinimized(false); setTimeout(() => chatInputRef.current?.focus(), 0); }}
                className="w-full py-2.5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[rgba(139,92,246,0.4)] transition cursor-pointer flex items-center justify-center gap-2"
              >
                <ChevronUp className="w-3.5 h-3.5" /> Prompt box minimized — click to expand
              </button>
            ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex items-end gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] px-3 py-1.5 focus-within:border-[rgba(139,92,246,0.45)] transition"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach a file for the agent"
                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer p-1"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleRecord}
                aria-label={recording ? 'Stop recording' : 'Record a voice message'}
                className={`text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer p-1 ${recording ? 'text-red-400 animate-pulse' : ''}`}
                title={recording ? 'Stop recording' : 'Dictate a message (Voicebox)'}
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
                placeholder={`Ask ${agentName} to do anything…`}
                aria-label="Agent prompt input"
                className="flex-1 min-w-0 bg-transparent border-none text-[16px] sm:text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none leading-relaxed py-1.5 max-h-[240px] overflow-y-auto"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message to agent"
                className="p-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPromptMinimized(true)}
                aria-label="Minimize the prompt box"
                title="Minimize the prompt box"
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition cursor-pointer p-1"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </form>
            )}
          </div>
        </SectionCard>

        {/* Right rail */}
        <div className="space-y-5 min-w-0">
          {/* Chat history (operator 08-26): timestamps, rename, pin */}
          <SectionCard id="myagent-chats" padding="p-3" header={
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 min-w-0">
                <Database className="w-3 h-3 shrink-0" /> <span className="truncate">Chats</span>
              </span>
              <button
                type="button"
                onClick={newChat}
                className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-semibold transition cursor-pointer"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
          }>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {/* No hardcoded "Main chat" entry (operator 08-27): the current
                  conversation (id 0) comes from /api/agent/threads as a regular
                  chat row — rename/pin/delete affordances included. */}
              {threads.some((t) => t.pinned) && (
                <>
                  <div className="text-[9px] text-amber-400/90 uppercase tracking-wider px-1 pt-1.5">📌 Pinned</div>
                  {threads.filter((t) => t.pinned).map((t) => renderThreadRow(t))}
                </>
              )}
              {threads.some((t) => !t.pinned) && (
                <>
                  <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider px-1 pt-1.5">Earlier</div>
                  {threads.filter((t) => !t.pinned).map((t) => renderThreadRow(t))}
                </>
              )}
            </div>
          </SectionCard>

          {/* Identity controls */}
          <SectionCard id="myagent-identity-controls" header={
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 min-w-0">
                <UserIcon className="w-3 h-3 shrink-0" /> <span className="truncate">Identity</span>
              </span>
            </div>
          }>
            <div className="flex items-center gap-3">
              <AvatarUpload
                url={settings.profile?.avatarUrl}
                initial="👤"
                label="your avatar"
                onUpload={(f) => handleAvatarUpload(f, 'user')}
              />
              <div className="text-[11px] text-[var(--text-muted)]">
                <div className="text-xs font-semibold text-[var(--text-primary)]">{settings.profile?.displayName || userId}</div>
                <div className="text-[10px]">Upload PNG/JPG for your profile picture.</div>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">Personality</div>
              <input
                value={ai.personality || ''}
                onChange={(e) => set('ai.personality', e.target.value)}
                placeholder='Type it — e.g. "Calm tutor who checks understanding" or "Sarcastic"'
                aria-label="Agent personality"
                className="clean-input w-full px-3 py-2 text-[11px] outline-none"
              />
              <div className="text-[9px] text-[var(--text-muted)] mt-1">Free text — how the agent should act, in your own words.</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">Instructions</div>
              <textarea
                value={ai.instructions || ''}
                onChange={(e) => set('ai.instructions', e.target.value)}
                rows={3}
                placeholder="How should the agent behave? What do you want it to always remember about how you work?"
                aria-label="Agent instructions"
                className="clean-input w-full px-3 py-2 text-[11px] outline-none resize-none"
              />
            </div>
          </SectionCard>

          {/* Recent agent actions — rollback surface */}
          {ledger.length > 0 && (
            <SectionCard id="myagent-ledger" padding="p-4" header={
              <div className="flex items-center justify-between w-full">
                <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Undo2 className="w-3.5 h-3.5 text-[var(--accent)]" /> Recent actions
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">{ledger.filter((a) => a.status === 'done').length} active</span>
              </div>
            }>
              <div className="space-y-1.5">
                {ledger.slice(0, 8).map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between gap-2 p-2 rounded-[var(--radius-md)] border ${
                      a.status === 'undone'
                        ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-60'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--text-secondary)] truncate font-medium">
                        {a.action_type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        {a.summary || `#${a.id}`}
                        {a.status === 'undone' && <span className="text-emerald-400"> · rolled back</span>}
                      </div>
                    </div>
                    {a.undoable && (
                      <button
                        type="button"
                        onClick={() => undoAction(a.id)}
                        className="shrink-0 px-2 py-1 rounded-[var(--radius-sm)] bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-[10px] font-semibold transition cursor-pointer"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                Every agent action is recorded with an undo snapshot — creations, deletes, settings changes, reads.
                Undoing a read revokes that content: the agent treats it as unseen.
              </div>
            </SectionCard>
          )}

          {/* Permanent memory */}
          <SectionCard id="myagent-memory" header={
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 min-w-0">
                <Database className="w-3 h-3 shrink-0" /> <span className="truncate">Permanent memory</span>
              </span>
              <Badge color={memory.length ? 'blue' : 'slate'}>{memory.length} entries</Badge>
            </div>
          }>
            <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
              The agent always reads this. Add facts about yourself, preferences, deadlines — and it stays forever until you delete it.
              Click any entry (or its arrow) to load it into your prompt box.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto mb-3">
              {memory.length === 0 && <div className="text-[11px] text-[var(--text-muted)] py-2">No memories yet — teach your agent something.</div>}
              {memory.map((m) => (
                <div
                  key={m.id}
                  onClick={() => useMemory(m)}
                  title="Select this memory — loads into your prompt"
                  className="group flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[rgba(139,92,246,0.40)] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{m.text}</p>
                    <div className="text-[9px] text-[var(--text-muted)] mt-1">{timeAgo(m.created_at)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); useMemory(m); }}
                    aria-label="Load this memory into the prompt"
                    title="Load into prompt box"
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteMemory(m.id); }}
                    aria-label="Delete memory entry"
                    className="p-1 text-[var(--text-muted)] hover:text-rose-400 transition cursor-pointer opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMemory()}
                placeholder="Add a memory…"
                aria-label="New memory entry"
                className="clean-input flex-1 px-3 py-2 text-[11px] outline-none"
              />
              <button
                type="button"
                onClick={addMemory}
                aria-label="Save memory"
                className="p-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </SectionCard>

          {/* Files */}
          <SectionCard id="myagent-files" header={
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5 min-w-0">
                <FileText className="w-3 h-3 shrink-0" /> <span className="truncate">Files</span>
              </span>
              <Badge color={files.length ? 'green' : 'slate'}>{files.length} loaded</Badge>
            </div>
          }>
            <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
              Upload skills, rules, automations or personality files — the agent loads them and follows them.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {FILE_KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setFileKind(k.key)}
                  className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[10px] transition cursor-pointer border ${
                    fileKind === k.key
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[rgba(139,92,246,0.35)] font-semibold'
                      : 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {k.icon} {k.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mb-2">{fileKindMeta.hint}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-dashed border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[rgba(139,92,246,0.4)] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer flex items-center justify-center gap-2 mb-3"
            >
              <Upload className="w-3.5 h-3.5" /> Upload {fileKindMeta.label.toLowerCase()} file
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile} />
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {files.length === 0 && <div className="text-[11px] text-[var(--text-muted)] py-2">No files loaded yet.</div>}
              {files.map((f) => {
                const km = FILE_KINDS.find((k) => k.key === f.kind) || FILE_KINDS[0];
                return (
                  <div key={f.id} className="group flex items-center gap-2.5 p-2.5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)] transition">
                    <span className="text-sm leading-none">{km.icon}</span>
                    <button
                      type="button"
                      onClick={() => openFile(f)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                      title={`Read ${f.file_name}`}
                    >
                      <div className="text-[11px] text-[var(--text-secondary)] truncate hover:text-[var(--accent)] transition">{f.file_name}</div>
                      <div className="text-[9px] text-[var(--text-muted)]">{km.label} · {fmt(f.size_bytes)} B · tap to read</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFile(f.id)}
                      aria-label={`Delete file ${f.file_name}`}
                      className="p-1 text-[var(--text-muted)] hover:text-rose-400 transition cursor-pointer opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </SectionCard>

        </div>
      </div>
      {/* File content viewer (operator 08-26) */}
      {viewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => setViewFile(null)}>
          <div className="clean-card surface-glass-strong w-full max-w-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
              <div className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span className="truncate">{viewFile.file_name}</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{viewFile.kind}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* operator 08-28: SELECT this file's content into the prompt box */}
                <button
                  type="button"
                  onClick={() => { selectConfig(`📎 ${viewFile.file_name}\n\n${viewFile.content}`); setViewFile(null); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[10px] font-semibold transition cursor-pointer"
                  title="Load this file into the prompt box"
                >
                  <Send className="w-3 h-3" /> Prompt
                </button>
                <button type="button" onClick={() => setViewFile(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-mono">
              {viewFile.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
