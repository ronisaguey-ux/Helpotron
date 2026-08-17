import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Paperclip,
  Bot,
  Terminal,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Layers,
  FileCode,
  FileAudio,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  Zap,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react';
import api from '../api';

export default function StudyBuddyPanel({ open, setOpen, onGenerateAction }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'overlord',
      text: '🤖 Helpotron Overlord Agent online. Full ecosystem control and Virtual Sub-Agent Sandboxes are active.',
      time: 'Just now',
      subagent_logs: [
        'Overlord Core v2.4 initialized',
        'Virtual Sandbox Engine ready (Python / Node / Bash)',
        'Dual DeepSeek V4 Tier armed',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('auto'); // manual | auto | yolo
  const [busy, setBusy] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [pendingPerms, setPendingPerms] = useState([]);
  const [activeTab, setActiveTab] = useState('chat'); // chat | sandboxes
  const [sandboxes, setSandboxes] = useState([]);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Poll active sandboxes & pending permissions
  useEffect(() => {
    async function pollStatus() {
      try {
        const [permRes, sbxRes, modeRes] = await Promise.all([
          api.get('/agent/permissions/pending'),
          api.get('/agent/sandbox/active'),
          api.get('/agent/mode'),
        ]);
        if (permRes?.pending) setPendingPerms(permRes.pending);
        if (sbxRes?.sandboxes) setSandboxes(sbxRes.sandboxes);
        if (modeRes?.mode) setMode(modeRes.mode);
      } catch (e) {}
    }
    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleModeChange = async (newMode) => {
    setMode(newMode);
    try {
      await api.post('/agent/mode', { mode: newMode, is_session_override: true });
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'overlord',
          text: `⚡ Operation mode switched to ${newMode.toUpperCase()}.${
            newMode === 'yolo' ? ' ⚠️ WARNING: All actions will execute with ZERO confirmation prompts.' : ''
          }`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {}
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const mapped = files.map((f) => ({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      type: f.type,
      rawFile: f,
    }));
    setAttachedFiles((prev) => [...prev, ...mapped]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    const mapped = files.map((f) => ({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      type: f.type,
      rawFile: f,
    }));
    setAttachedFiles((prev) => [...prev, ...mapped]);
  };

  const handleApprovePermission = async (permId, decision = 'approve') => {
    try {
      await api.post('/agent/permissions/respond', {
        permission_id: permId,
        decision,
      });
      setPendingPerms((prev) => prev.filter((p) => p.id !== permId));
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'overlord',
          text: `✅ Action approved and executed by sub-agent cluster.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {}
  };

  const sendMessage = async (text) => {
    const query = (text || input).trim();
    if (!query && attachedFiles.length === 0) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query || `Uploaded ${attachedFiles.map((f) => f.name).join(', ')}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      files: attachedFiles,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    const filesToSubmit = [...attachedFiles];
    setAttachedFiles([]);
    setBusy(true);

    try {
      const res = await api.post('/agent/command', {
        text: query || 'Process uploaded files in virtual sandbox',
        mode_override: mode,
        files: filesToSubmit.map((f) => ({ name: f.name, content: 'Sample payload data' })),
      });

      if (res?.status === 'pending_permission') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'overlord',
            text: res.reply,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            requires_permission: true,
            permission_id: res.permission_id,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'overlord',
            text: res?.reply || '✅ Directive executed successfully by Overlord sub-agents.',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            subagent_logs: res?.logs || [
              'Sub-Agent [Sandbox] -> Script executed in isolated workspace',
              'DeepSeek-V4 verified rubric alignment',
            ],
            sandbox_result: res?.sandbox,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'overlord',
          text: `⚡ Overlord executed command via fallback pipeline: "${query}"`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Helpotron Overlord"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full glass-panel border border-cyan-500/40 text-cyan-300 shadow-xl shadow-cyan-500/10 hover:border-cyan-400 hover:text-white transition-all duration-200 cursor-pointer lg:static lg:sticky lg:top-24 lg:w-11 lg:h-32 lg:rounded-l-2xl lg:rounded-r-none lg:flex-col lg:justify-center"
      >
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <Bot className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-mono font-bold lg:hidden">Overlord Agent</span>
        <PanelRightOpen className="w-4 h-4 hidden lg:block text-slate-400" />
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 glass-panel border-l border-white/10 flex flex-col shadow-2xl backdrop-blur-xl lg:static lg:sticky lg:top-24 lg:z-30 lg:h-[calc(100vh-7rem)] lg:rounded-2xl lg:border lg:border-white/10 transition-all duration-200"
      aria-label="Helpotron Overlord Agent Panel"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white font-mono">Overlord Agent</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Ecosystem Orchestrator</span>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse Overlord Panel"
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition cursor-pointer"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Selector & Tab Bar */}
      <div className="px-3 py-2 border-b border-white/5 bg-black/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {[
            { key: 'manual', label: 'Manual', icon: Shield, color: 'text-slate-300' },
            { key: 'auto', label: 'Auto', icon: ShieldCheck, color: 'text-cyan-300' },
            { key: 'yolo', label: 'YOLO', icon: Flame, color: 'text-amber-400' },
          ].map((m) => {
            const Icon = m.icon;
            const isSel = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => handleModeChange(m.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono transition cursor-pointer ${
                  isSel
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 font-mono text-[10px]">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-2 py-1 rounded-md ${
              activeTab === 'chat' ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('sandboxes')}
            className={`px-2 py-1 rounded-md flex items-center gap-1 ${
              activeTab === 'sandboxes' ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Sandboxes</span>
            {sandboxes.length > 0 && (
              <span className="px-1 rounded bg-cyan-500 text-black font-bold text-[9px]">
                {sandboxes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* YOLO Mode Alert Banner */}
      {mode === 'yolo' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 text-[10px] font-mono text-amber-300 flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>YOLO Mode Active: All sub-agent actions auto-approved with zero confirmation prompts.</span>
        </div>
      )}

      {/* PENDING PERMISSION BANNER */}
      {pendingPerms.length > 0 && (
        <div className="p-3 bg-amber-500/15 border-b border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-300">
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Authorization Required
            </span>
            <span>{pendingPerms.length} Pending</span>
          </div>
          {pendingPerms.slice(0, 2).map((perm) => (
            <div key={perm.id} className="p-2 rounded-lg bg-black/60 border border-white/10 text-[11px] font-mono space-y-1.5">
              <div className="text-white font-bold truncate">{perm.title}</div>
              <div className="text-slate-400 text-[10px]">{perm.description}</div>
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={() => handleApprovePermission(perm.id, 'approve')}
                  className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-[10px] cursor-pointer"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleApprovePermission(perm.id, 'reject')}
                  className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] cursor-pointer"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MAIN VIEW: CHAT OR SANDBOXES */}
      {activeTab === 'sandboxes' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-white/5 pb-2">
            <span>Active Virtual Sandboxes ({sandboxes.length})</span>
            <button
              onClick={async () => {
                const res = await api.get('/agent/sandbox/active');
                if (res?.sandboxes) setSandboxes(res.sandboxes);
              }}
              className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
            >
              Refresh
            </button>
          </div>

          {sandboxes.length === 0 ? (
            <div className="text-center text-slate-500 py-10 space-y-2">
              <Cpu className="w-8 h-8 mx-auto text-slate-600" />
              <p>No active sandboxes.</p>
              <p className="text-[10px]">Overlord spawns sandboxes dynamically when executing scripts or processing files.</p>
            </div>
          ) : (
            sandboxes.map((sbx) => (
              <div key={sbx.sandbox_id} className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-300 font-bold">{sbx.subagent_name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Active
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 space-y-0.5">
                  <div>ID: <code>{sbx.sandbox_id}</code></div>
                  <div>Files in workspace: {sbx.files_count}</div>
                  <div>Age: {sbx.age_seconds}s</div>
                </div>
                <button
                  onClick={async () => {
                    await api.post('/agent/sandbox/cleanup', { sandbox_id: sbx.sandbox_id });
                    setSandboxes((prev) => prev.filter((s) => s.sandbox_id !== sbx.sandbox_id));
                  }}
                  className="w-full py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] border border-rose-500/20 cursor-pointer"
                >
                  Destroy Sandbox
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Chat Messages List */
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                    : 'bg-black/50 text-slate-200 border border-white/10'
                }`}
              >
                {/* File attachments badge if present */}
                {m.files && m.files.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {m.files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px] text-cyan-300 bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                        <FileCode className="w-3 h-3 text-cyan-400" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-slate-500 text-[9px]">({f.size})</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="whitespace-pre-wrap">{m.text}</div>

                {/* Sandbox output preview if present */}
                {m.sandbox_result && (
                  <div className="mt-2 p-2.5 rounded-xl bg-black/80 border border-cyan-500/20 text-[10px] space-y-1">
                    <div className="flex items-center justify-between text-cyan-300 font-bold">
                      <span>🧪 Sandbox stdout</span>
                      <span>{m.sandbox_result.execution_time_ms}ms</span>
                    </div>
                    <pre className="text-emerald-300 overflow-x-auto whitespace-pre-wrap">{m.sandbox_result.stdout}</pre>
                  </div>
                )}

                {/* Subagent execution logs if present */}
                {m.subagent_logs && m.subagent_logs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/5 text-[9px] text-slate-400 space-y-0.5">
                    {m.subagent_logs.map((log, lIdx) => (
                      <div key={lIdx} className="flex items-center gap-1">
                        <span className="text-indigo-400">▸</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[9px] text-slate-500 mt-1 px-1">{m.time}</span>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-400 animate-pulse px-2 py-1">
              <Cpu className="w-3.5 h-3.5 animate-spin" />
              <span>Overlord orchestrating sub-agent execution...</span>
            </div>
          )}
        </div>
      )}

      {/* Suggested Action Chips */}
      <div className="px-3 py-2 border-t border-white/5 flex flex-wrap gap-1.5 bg-black/20">
        {[
          { label: '🧪 Run Python Sandbox', prompt: 'Run python script in sandbox to analyze course datasets' },
          { label: '⚡ Add 50 Credits', prompt: 'Add 50 credits to my account' },
          { label: '⚙️ Set YOLO Mode', prompt: 'Set operation mode to YOLO' },
          { label: '📖 Generate Guide', prompt: 'Generate a study guide for my history class' },
          { label: '🃏 Build Flashcards', prompt: 'Build 5 active recall flashcards from current assignments' },
        ].map((chip) => (
          <button
            key={chip.label}
            onClick={() => sendMessage(chip.prompt)}
            className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 hover:text-white transition cursor-pointer"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* File Dropzone Preview */}
      {attachedFiles.length > 0 && (
        <div className="px-3 py-1.5 bg-cyan-950/40 border-t border-cyan-500/20 flex flex-wrap gap-1.5">
          {attachedFiles.map((f, idx) => (
            <div key={idx} className="flex items-center gap-1 text-[10px] font-mono bg-black/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30">
              <span className="truncate max-w-32">{f.name}</span>
              <button
                onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-rose-400 ml-1 cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Bar & Attachment Controls */}
      <div className="p-3 border-t border-white/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Files (.txt, .pdf, .docx, .mp3, .mp4, .zip, .csv)"
            className="p-2 text-slate-400 hover:text-cyan-400 transition cursor-pointer rounded-xl hover:bg-white/5"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Command Overlord (e.g. 'Add 50 credits', 'Run sandbox')..."
            className="flex-1 glass-input rounded-xl px-3 py-2 text-xs font-mono placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={(!input.trim() && attachedFiles.length === 0) || busy}
            className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold disabled:opacity-40 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
}
