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
import {
  Send, Paperclip, ShieldCheck, Shield, Flame, RefreshCw,
  Trash2, Plus, Cpu, Database, FileText, Upload, Camera, User as UserIcon,
} from 'lucide-react';
import api from '../api.js';
import { loadSettings, saveSettings, AGENT_PERSONALITIES, EFFORT_SCORES } from '../demoData.js';
import { Badge, timeAgo } from './ui/os.jsx';
import { AgentAvatar } from './ui/AgentAvatar.jsx';
import SectionCard from './SectionCard.jsx';

const FILE_KINDS = [
  { key: 'skill', label: 'Skill', icon: '🧩', hint: 'Teach the agent new abilities (.md/.txt)' },
  { key: 'rule', label: 'Rule', icon: '📏', hint: 'Always-follow behavioral rules (.md/.txt)' },
  { key: 'automation', label: 'Automation', icon: '⚙️', hint: 'Scheduled or trigger workflows (.json/.md)' },
  { key: 'personality', label: 'Personality', icon: '🎭', hint: 'Tone, voice and values (.md/.txt)' },
];

const QUICK_ACTIONS = [
  { label: '🧠 Summarize my workload', prompt: 'Summarize my current workload and tell me what to prioritize.' },
  { label: '🎯 Flashcards, weakest subject', prompt: 'Generate flashcards for my weakest subject.' },
  { label: '✍️ Draft my essay', prompt: 'Draft the next section of my current essay assignment.' },
  { label: '📅 Plan my week', prompt: 'Plan my study week around my deadlines.' },
  { label: '🔍 What should I do?', prompt: 'What should I do right now?' },
];

const MODE_META = {
  manual: { label: 'Manual', icon: Shield, cls: 'bg-blue-600/20 border-blue-500/40 text-blue-300' },
  auto: { label: 'Auto-Pilot', icon: ShieldCheck, cls: 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' },
  yolo: { label: 'YOLO', icon: Flame, cls: 'bg-amber-600/20 border-amber-500/40 text-amber-300' },
};

const effortBucket = (v) => (v <= 400 ? 'Low' : v < 750 ? 'Balanced' : 'High');
const fmt = (n) => Number(n || 0).toLocaleString();

function AvatarUpload({ url, onUpload, label, initial }) {
  const ref = useRef(null);
  return (
    <div className="relative shrink-0 group">
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 border border-white/15 flex items-center justify-center text-2xl">
        {url
          ? <img src={url} alt={label} className="w-full h-full object-cover" />
          : <span>{initial}</span>}
      </div>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        aria-label={`Upload ${label}`}
        title={`Upload ${label} (PNG/JPG)`}
        className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-slate-800 border border-white/20 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center transition cursor-pointer opacity-0 group-hover:opacity-100"
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

export default function MyAgentView({ userId = 'RoniDev', userCredits }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: 'I\'m your personal agent — ask me to do anything: draft work, generate materials, change settings, edit an assignment, plan your day, or manage my own memory and files.',
      time: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('auto');
  const [autoApprove, setAutoApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [effort, setEffort] = useState(500);
  const [memory, setMemory] = useState([]);
  const [memoryText, setMemoryText] = useState('');
  const [files, setFiles] = useState([]);
  const [fileKind, setFileKind] = useState('skill');
  const [pendingPermissions, setPendingPermissions] = useState([]);
  const [compactMsg, setCompactMsg] = useState('');
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
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

  /* ── initial load: mode, effort, memory, files, permission poll ───────── */
  useEffect(() => {
    const ai = settings.ai || {};
    setMode(ai.mode || 'auto');
    setEffort(ai.effortScore || EFFORT_SCORES[ai.effort] || 500);
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

  /* ── effort scale (1–1000): debounced → settings + backend routing ────── */
  function handleEffort(v) {
    const val = Number(v);
    setEffort(val);
    clearTimeout(effortTimer.current);
    effortTimer.current = setTimeout(() => {
      const bucket = effortBucket(val);
      const updated = { ...settings, ai: { ...settings.ai, effortScore: val, effort: bucket.toLowerCase() } };
      persist(updated);
      api.updateSettings({ effort_score: val, ai: updated.ai }).catch(() => {});
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
      });
      pushAssistant(res?.reply || '✅ Done.');
    } catch (e) {
      pushAssistant(`⚠️ The agent couldn't reach the backend right now (${e.message}). In demo mode responses are simulated.`);
    } finally {
      setBusy(false);
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

  /* ── files (skill / rule / automation / personality) ──────────────────── */
  async function handleUploadFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const res = await api.uploadAgentFile(f, fileKind);
      const file = res?.file || { id: `f_${Date.now()}`, file_name: f.name, kind: fileKind, size_bytes: f.size, created_at: new Date().toISOString() };
      setFiles((prev) => [...prev, file]);
      pushAssistant(`📎 Loaded “${f.name}” as a ${fileKind}. It's live — ask me to use it.`);
    } catch (err) {
      pushAssistant(`⚠️ Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
      e.target.value = '';
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

  async function handlePermissionAction(permId, decision) {
    try { await api.agentPermissionRespond({ permission_id: permId, decision }); } catch (e) {}
    setPendingPermissions((prev) => prev.filter((p) => p.id !== permId));
  }

  const fileKindMeta = FILE_KINDS.find((k) => k.key === fileKind) || FILE_KINDS[0];
  const pending = pendingPermissions[0];

  return (
    <div className="space-y-5">
      {/* ── Identity header ──────────────────────────────────────────────── */}
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
                  className="bg-transparent text-lg font-bold text-white outline-none border-b border-transparent focus:border-blue-500/50 w-36"
                />
                <Badge color="blue">YOUR AGENT</Badge>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                One agent for everything — ask it to do anything. · effort <span className="text-blue-300 font-mono">{effort}</span> ({effortBucket(effort)})
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/40 border border-white/8">
              {Object.entries(MODE_META).map(([k, m]) => {
                const Icon = m.icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleSwitchMode(k)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 border transition cursor-pointer ${mode === k ? m.cls : 'text-slate-400 hover:text-slate-200 border-transparent'}`}
                  >
                    <Icon className="w-3 h-3" /> {m.label}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 pl-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => handleAutoApprove(e.target.checked)}
                className="accent-emerald-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400">Auto-approve routine actions</span>
            </label>
          </div>
        </div>
      }>

        {/* Effort scale */}
        <div className="mt-5 pt-4 border-t border-white/8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" /> Effort scale
            </span>
            <span className="text-[10px] font-mono text-slate-500">1 – 1000</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={1000}
              value={effort}
              onChange={(e) => handleEffort(e.target.value)}
              aria-label="Agent effort scale"
              className="flex-1 accent-blue-500 cursor-pointer"
            />
            <div className="flex gap-1.5">
              {['Low', 'Balanced', 'High'].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleEffort(EFFORT_SCORES[b.toLowerCase()])}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer border ${
                    effortBucket(effort) === b ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'text-slate-500 border-white/8 hover:text-slate-300'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            The only routing control you need: low effort = cheap engines do mechanical work, high effort = flagship engines handle deep reasoning. The agent picks the right engine per task.
          </p>
        </div>
      </SectionCard>

      {/* ── Pending permission strip ─────────────────────────────────────── */}
      {pending && (
        <SectionCard id="myagent-pending-permission" padding="p-4" className="border-amber-500/30 bg-amber-500/8" header={
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              ⚠️ Action pending approval — {pending.action_type}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">Assignment #{pending.assignment_id} · {pending.description || 'the agent wants to act on your behalf'}</p>
          </div>
        }>
          <div className="flex gap-2">
            <button type="button" onClick={() => handlePermissionAction(pending.id, 'approve')} className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition cursor-pointer">Approve</button>
            <button type="button" onClick={() => handlePermissionAction(pending.id, 'reject')} className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer">Reject</button>
          </div>
        </SectionCard>
      )}

      {/* ── Chat + side panels ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
        {/* Chat */}
        <SectionCard id="myagent-chat" padding="p-0" className="overflow-hidden flex flex-col h-[clamp(480px,calc(100vh-13rem),720px)]" header={
          <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AgentAvatar
                size="sm"
                status={busy ? 'working' : 'ready'}
                src={ai.avatarUrl || '/My_Agent_logo.jpeg'}
              />
              <span className="text-xs font-semibold text-white">Chat with {agentName}</span>
            </div>
            <button
              type="button"
              onClick={handleCompact}
              disabled={!!compactMsg}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/8 text-[10px] text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${compactMsg ? 'animate-spin' : ''}`} />
              {compactMsg || 'Compact history'}
            </button>
          </div>
        }>

          {/* Quick actions */}
          <div className="px-5 py-3 border-b border-white/5 flex flex-wrap gap-1.5 bg-slate-950/20">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.label}
                type="button"
                onClick={() => sendMessage(qa.prompt)}
                className="px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/8 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/8 transition cursor-pointer"
              >
                {qa.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 min-h-0 p-5 overflow-y-auto space-y-3">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    isUser ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800/80 border border-white/5 text-slate-200'
                  }`}>
                    {m.text}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{m.time}</span>
                </div>
              );
            })}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-blue-400 bg-slate-800/40 p-2.5 rounded-xl border border-white/5 w-fit">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{agentName} is working…</span>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="p-4 border-t border-white/8 bg-slate-950/30">
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
              className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 focus-within:border-blue-500 transition"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach a file for the agent"
                className="text-slate-400 hover:text-blue-400 transition cursor-pointer p-1"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendMessage(`Process this file and tell me what you found: ${f.name}`);
                  e.target.value = '';
                }}
              />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask ${agentName} to do anything…`}
                aria-label="Agent prompt input"
                className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message to agent"
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </SectionCard>

        {/* Right rail */}
        <div className="space-y-5">
          {/* Identity controls */}
          <SectionCard id="myagent-identity-controls" header={
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <UserIcon className="w-3 h-3" /> Identity
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
              <div className="text-[11px] text-slate-500">
                <div className="text-xs font-semibold text-white">{settings.profile?.displayName || userId}</div>
                <div className="text-[10px]">Upload PNG/JPG for your profile picture.</div>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-300 mb-1.5">Personality</div>
              <div className="flex flex-wrap gap-1.5">
                {AGENT_PERSONALITIES.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.desc}
                    onClick={() => set('ai.personality', p.key)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] transition cursor-pointer border ${
                      ai.personality === p.key ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 font-semibold' : 'text-slate-400 border-white/8 hover:text-slate-200'
                    }`}
                  >
                    {p.key}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-300 mb-1.5">Instructions</div>
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

          {/* Permanent memory */}
          <SectionCard id="myagent-memory" header={
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Permanent memory
              </span>
              <Badge color={memory.length ? 'blue' : 'slate'}>{memory.length} entries</Badge>
            </div>
          }>
            <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
              The agent always reads this. Add facts about yourself, preferences, deadlines — and it stays forever until you delete it.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto mb-3">
              {memory.length === 0 && <div className="text-[11px] text-slate-600 py-2">No memories yet — teach your agent something.</div>}
              {memory.map((m) => (
                <div key={m.id} className="group flex items-start gap-2 p-3 rounded-xl bg-slate-950/40 border border-white/6">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-300 leading-relaxed">{m.text}</p>
                    <div className="text-[9px] text-slate-600 mt-1">{timeAgo(m.created_at)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteMemory(m.id)}
                    aria-label="Delete memory entry"
                    className="p-1 text-slate-600 hover:text-rose-400 transition cursor-pointer opacity-0 group-hover:opacity-100"
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
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </SectionCard>

          {/* Files */}
          <SectionCard id="myagent-files" header={
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> Files
              </span>
              <Badge color={files.length ? 'green' : 'slate'}>{files.length} loaded</Badge>
            </div>
          }>
            <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
              Upload skills, rules, automations or personality files — the agent loads them and follows them.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {FILE_KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setFileKind(k.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] transition cursor-pointer border ${
                    fileKind === k.key ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 font-semibold' : 'text-slate-400 border-white/8 hover:text-slate-200'
                  }`}
                >
                  {k.icon} {k.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-600 mb-2">{fileKindMeta.hint}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-lg bg-white/4 border border-dashed border-white/15 text-[11px] text-slate-400 hover:text-white hover:bg-white/8 transition cursor-pointer flex items-center justify-center gap-2 mb-3"
            >
              <Upload className="w-3.5 h-3.5" /> Upload {fileKindMeta.label.toLowerCase()} file
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadFile} />
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {files.length === 0 && <div className="text-[11px] text-slate-600 py-2">No files loaded yet.</div>}
              {files.map((f) => {
                const km = FILE_KINDS.find((k) => k.key === f.kind) || FILE_KINDS[0];
                return (
                  <div key={f.id} className="group flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950/40 border border-white/6">
                    <span className="text-sm leading-none">{km.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-200 truncate">{f.file_name}</div>
                      <div className="text-[9px] text-slate-600">{km.label} · {fmt(f.size_bytes)} B</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteFile(f.id)}
                      aria-label={`Delete file ${f.file_name}`}
                      className="p-1 text-slate-600 hover:text-rose-400 transition cursor-pointer opacity-0 group-hover:opacity-100"
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
    </div>
  );
}
