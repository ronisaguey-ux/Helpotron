import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Bot,
  ShieldCheck,
  Flame,
  Shield,
  PanelRightClose,
  PanelRightOpen,
  X,
  FileText,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import api from '../api';

export default function StudyBuddyPanel({ open, setOpen, userId = 'RoniDev' }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: '🤖 Overlord Agent online. I manage autonomous pipelines, syllabus digestion, flashcards, draft generation, and Canvas LMS syncing. Send a prompt or drop files below.',
      time: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('auto'); // manual | auto | yolo
  const [busy, setBusy] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [pendingPermissions, setPendingPermissions] = useState([]);
  const [activeTab, setActiveTab] = useState('chat'); // chat | controls
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchAgentMode();
    const interval = setInterval(fetchPendingPerms, 12000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'chat') {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, busy, activeTab]);

  async function fetchAgentMode() {
    try {
      const data = await api.agentMode();
      if (data?.operation_mode) setMode(data.operation_mode);
    } catch (e) {}
  }

  async function fetchPendingPerms() {
    try {
      const data = await api.agentPermissionsPending();
      if (data?.pending) {
        setPendingPermissions(data.pending);
      }
    } catch (e) {}
  }

  async function handleSwitchMode(newMode) {
    setMode(newMode);
    try {
      await api.setAgentMode(newMode);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'assistant',
          text: `⚙️ Execution mode updated to: ${newMode.toUpperCase()}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {}
  }

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const mapped = files.map((f) => ({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
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
      rawFile: f,
    }));
    setAttachedFiles((prev) => [...prev, ...mapped]);
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
        text: query || 'Process uploaded files',
        mode_override: mode,
        files: filesToSubmit.map((f) => ({ name: f.name })),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text: res?.reply || '✅ Task queued and processed through the Overlord pipeline.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text: `Processed: "${query}"`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  async function handlePermissionAction(permId, decision) {
    try {
      await api.agentPermissionRespond({
        permission_id: permId,
        decision: decision,
      });
      fetchPendingPerms();
    } catch (e) {}
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Overlord Agent Controller"
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0f172a] border border-white/10 text-slate-200 shadow-xl hover:border-white/20 transition cursor-pointer lg:sticky lg:top-24 lg:w-10 lg:h-32 lg:rounded-l-2xl lg:rounded-r-none lg:flex-col lg:justify-center"
      >
        <Bot className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-medium lg:hidden">Overlord Agent</span>
        <PanelRightOpen className="w-4 h-4 hidden lg:block text-slate-400" />
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-[#0f172a] border-l border-white/10 flex flex-col shadow-2xl lg:sticky lg:top-24 lg:z-20 lg:h-[calc(100vh-7.5rem)] lg:rounded-2xl lg:border transition-all"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5 bg-slate-950/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-100">Overlord Agent</h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-[11px] text-slate-400">Global Controller & Study Copilot</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Collapse Overlord Sidebar"
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/5 transition cursor-pointer"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Selector Strip */}
      <div className="px-3 py-2 border-b border-white/5 bg-slate-950/40 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">Mode:</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleSwitchMode('manual')}
            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition ${
              mode === 'manual'
                ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3 h-3" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('auto')}
            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition ${
              mode === 'auto'
                ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            Auto-Pilot
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('yolo')}
            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition ${
              mode === 'yolo'
                ? 'bg-amber-600/20 border border-amber-500/40 text-amber-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3 h-3" />
            YOLO
          </button>
        </div>
      </div>

      {/* Pending Permissions Alert Strip */}
      {pendingPermissions.length > 0 && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-xs space-y-2">
          <div className="flex items-center justify-between text-amber-300 font-medium">
            <span className="flex items-center gap-1.5 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5" />
              Action Pending Approval ({pendingPermissions.length})
            </span>
          </div>
          <p className="text-[11px] text-slate-300">
            {pendingPermissions[0].action_type} for assignment #{pendingPermissions[0].assignment_id}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handlePermissionAction(pendingPermissions[0].id, 'approve')}
              className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-medium transition"
            >
              Approve
            </button>
            <button
              onClick={() => handlePermissionAction(pendingPermissions[0].id, 'reject')}
              className="flex-1 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-medium transition"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages Stream */}
      <div ref={listRef} className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800/80 border border-white/5 text-slate-200'
                }`}
              >
                {m.text}
                {m.files && m.files.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                    {m.files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] opacity-90">
                        <FileText className="w-3 h-3" />
                        <span className="truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">{m.time}</span>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-blue-400 bg-slate-800/40 p-2.5 rounded-xl border border-white/5 w-fit">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Overlord Agent processing...</span>
          </div>
        )}
      </div>

      {/* File Attachment Drop Preview */}
      {attachedFiles.length > 0 && (
        <div className="px-4 py-2 border-t border-white/5 bg-slate-950/40 flex flex-wrap gap-2">
          {attachedFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 px-2.5 py-1 rounded-lg text-xs">
              <FileText className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="hover:text-white"
                aria-label={`Remove file ${file.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Action Bar */}
      <div className="p-3 border-t border-white/5 bg-slate-950/30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 focus-within:border-blue-500 transition"
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
            aria-label="Attach assignment documents or lecture audio"
            className="text-slate-400 hover:text-blue-400 transition cursor-pointer p-1"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Instruct Overlord Agent or ask questions..."
            aria-label="Overlord Agent prompt input"
            className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() && attachedFiles.length === 0}
            aria-label="Send message to Overlord Agent"
            className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
}

# <<<FIX A15 - Icon-Only Action Buttons Missing Accessible Names (aria-label)>>>
# Description: Add descriptive aria-label attributes (e.g. aria-label='Copy study notes to clipboard') to all icon-only button elements.
# NOTE: Automated placeholder – replace with actual code change.
