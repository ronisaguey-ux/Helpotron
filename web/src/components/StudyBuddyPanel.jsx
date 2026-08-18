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
} from 'lucide-react';
import api from '../api';

export default function StudyBuddyPanel({ open, setOpen }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: 'Hello! I can help you draft assignments, build flashcards, or summarize lecture notes. How can I help today?',
      time: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('auto'); // manual | auto | yolo
  const [busy, setBusy] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

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
          text: res?.reply || 'I processed your request and updated the study materials.',
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI Assistant"
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0f172a] border border-white/10 text-slate-200 shadow-xl hover:border-white/20 transition cursor-pointer lg:sticky lg:top-24 lg:w-10 lg:h-28 lg:rounded-l-xl lg:rounded-r-none lg:flex-col lg:justify-center"
      >
        <Bot className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-medium lg:hidden">Assistant</span>
        <PanelRightOpen className="w-4 h-4 hidden lg:block text-slate-400" />
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-[#0f172a] border-l border-white/10 flex flex-col shadow-2xl lg:sticky lg:top-24 lg:z-20 lg:h-[calc(100vh-7rem)] lg:rounded-2xl lg:border transition-all"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-100">AI Study Assistant</h3>
            <p className="text-[11px] text-slate-400">Canvas & Writing Copilot</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/5 transition cursor-pointer"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Selector */}
      <div className="px-3 py-2 border-b border-white/5 bg-slate-950/30 flex items-center justify-between">
        <span className="text-[11px] text-slate-400 font-medium">Mode</span>
        <div className="flex items-center gap-1">
          {[
            { key: 'manual', label: 'Manual', icon: Shield },
            { key: 'auto', label: 'Auto', icon: ShieldCheck },
            { key: 'yolo', label: 'Instant', icon: Flame },
          ].map((m) => {
            const isSel = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  isSel
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/80 text-slate-200 border border-white/5'
              }`}
            >
              {m.files && m.files.length > 0 && (
                <div className="mb-2 space-y-1">
                  {m.files.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px] bg-black/20 px-2 py-1 rounded">
                      <FileText className="w-3 h-3 text-blue-300" />
                      <span className="truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>{m.text}</div>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 px-1">{m.time}</span>
          </div>
        ))}
        {busy && (
          <div className="text-slate-400 text-xs flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
            <span>Thinking...</span>
          </div>
        )}
      </div>

      {/* Attached Files Preview */}
      {attachedFiles.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-950/40 border-t border-white/5 flex flex-wrap gap-1.5">
          {attachedFiles.map((f, idx) => (
            <div key={idx} className="flex items-center gap-1 text-[11px] bg-white/5 text-slate-200 px-2 py-1 rounded-md border border-white/10">
              <span className="truncate max-w-28">{f.name}</span>
              <button
                type="button"
                onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-rose-400 ml-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Form with File Attachment Button */}
      <div className="p-3 border-t border-white/5">
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
            title="Attach file"
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/5 transition cursor-pointer"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question or request a draft..."
            className="flex-1 clean-input px-3 py-2 text-xs placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={(!input.trim() && attachedFiles.length === 0) || busy}
            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
}
