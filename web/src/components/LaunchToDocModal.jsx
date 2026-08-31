import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Keyboard,
  Sparkles,
  Play,
  Pause,
  Square,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
  Settings2,
  RefreshCw,
  Gauge,
  Sliders,
} from 'lucide-react';
import api from '../api.js';

export default function LaunchToDocModal({
  isOpen,
  onClose,
  assignment = null,
  initialText = '',
}) {
  const [targetTabId, setTargetTabId] = useState('');
  const [openTabs, setOpenTabs] = useState([]);
  const [detectingTabs, setDetectingTabs] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);

  // Content state
  const [text, setText] = useState(initialText || '');
  const [loadingPayload, setLoadingPayload] = useState(false);
  const [copied, setCopied] = useState(false);

  // Typing config state
  const [wpm, setWpm] = useState(65);
  const [naturalPauses, setNaturalPauses] = useState(true);
  const [jitter, setJitter] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Live typing progress state
  const [typingState, setTypingState] = useState({
    isTyping: false,
    isPaused: false,
    percentage: 0,
    wordsTyped: 0,
    totalWords: 0,
    status: 'idle', // idle | typing | paused | completed | cancelled | error
    error: null,
  });

  const assignmentTitle = assignment?.title || assignment?.name || 'Assignment';
  const assignmentId = assignment?.id || null;

  // 1. Detect Extension & Google Docs tabs via postMessage bridge
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setDetectingTabs(true);

    const handleMessage = (e) => {
      if (!mounted || !e.data) return;
      if (e.data.type === 'HELPOTRON_EXTENSION_READY' || e.data.type === 'HELPOTRON_PONG') {
        setExtensionConnected(true);
      } else if (e.data.type === 'HELPOTRON_GDOCS_TABS_RESULT') {
        setDetectingTabs(false);
        const tabs = e.data.tabs || [];
        setOpenTabs(tabs);
        if (tabs.length > 0) {
          const active = tabs.find((t) => t.active) || tabs[0];
          setTargetTabId(String(active.id));
        } else {
          setTargetTabId('new');
        }
        setExtensionConnected(true);
      } else if (e.data.type === 'HELPOTRON_TYPING_PROGRESS') {
        const p = e.data.payload || {};
        setTypingState((prev) => ({
          ...prev,
          isTyping: p.status === 'typing' || p.status === 'started',
          isPaused: p.status === 'paused',
          percentage: p.percentage || 0,
          wordsTyped: p.wordsTyped || 0,
          totalWords: p.totalWords || 0,
          status: p.status || prev.status,
          error: p.error || null,
        }));
      }
    };

    window.addEventListener('message', handleMessage);

    // Ping extension
    window.postMessage({ type: 'HELPOTRON_PING' }, '*');
    window.postMessage({ type: 'HELPOTRON_GET_GDOCS_TABS', requestId: Date.now() }, '*');

    const timeout = setTimeout(() => {
      if (mounted) setDetectingTabs(false);
    }, 1500);

    return () => {
      mounted = false;
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeout);
    };
  }, [isOpen]);

  // 2. Fetch/Prepare text content for the assignment
  useEffect(() => {
    if (!isOpen) return;

    if (initialText) {
      setText(initialText);
      return;
    }

    if (!assignmentId) {
      setText(assignment?.prompt || assignment?.description || '');
      return;
    }

    let cancelled = false;
    setLoadingPayload(true);

    api.assignmentFullView(assignmentId)
      .then((data) => {
        if (cancelled) return;
        const assign = data?.assignment || {};
        const materials = data?.materials || [];
        
        // Priority: Finalized work -> Generated material/solution -> Prompt
        let chosenText = assign.do_it_work || '';
        if (!chosenText && materials.length > 0) {
          const textMat = materials.find((m) => m.content_text || m.content);
          if (textMat) chosenText = textMat.content_text || textMat.content;
        }
        if (!chosenText) {
          chosenText = assign.prompt || assignment?.prompt || '';
        }
        setText(chosenText);
      })
      .catch(() => {
        if (!cancelled) setText(assignment?.prompt || '');
      })
      .finally(() => {
        if (!cancelled) setLoadingPayload(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, assignmentId, initialText]);

  if (!isOpen) return null;

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estMinutes = Math.max(1, Math.round(wordCount / wpm));

  const handleStartTyping = () => {
    if (!text.trim()) return;

    setTypingState({
      isTyping: true,
      isPaused: false,
      percentage: 0,
      wordsTyped: 0,
      totalWords: wordCount,
      status: 'typing',
      error: null,
    });

    const chosenId = targetTabId && targetTabId !== 'new' ? Number(targetTabId) : null;

    window.postMessage({
      type: 'HELPOTRON_LAUNCH_TO_DOC',
      requestId: Date.now(),
      payload: {
        tabId: chosenId,
        text,
        wpm: Number(wpm) || 65,
        naturalPauses,
        jitter,
        title: assignmentTitle,
        assignmentId,
      },
    }, '*');
  };

  const handlePauseResume = () => {
    const nextAction = typingState.isPaused ? 'resumeTyping' : 'pauseTyping';
    window.postMessage({
      type: 'HELPOTRON_CONTROL_TYPING',
      action: nextAction,
      tabId: targetTabId && targetTabId !== 'new' ? Number(targetTabId) : null,
    }, '*');
    setTypingState((prev) => ({ ...prev, isPaused: !prev.isPaused }));
  };

  const handleCancel = () => {
    window.postMessage({
      type: 'HELPOTRON_CONTROL_TYPING',
      action: 'cancelTyping',
      tabId: targetTabId && targetTabId !== 'new' ? Number(targetTabId) : null,
    }, '*');
    setTypingState((prev) => ({
      ...prev,
      isTyping: false,
      isPaused: false,
      status: 'cancelled',
    }));
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-to-doc-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[var(--bg-canvas)] border border-[rgba(139,92,246,0.35)] rounded-[var(--radius-lg)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-gradient-to-r from-[rgba(139,92,246,0.12)] via-transparent to-[rgba(6,182,212,0.08)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="launch-to-doc-title" className="text-base font-bold text-white">
                  Launch to Doc
                </h2>
                <span className="chip chip-accent text-[10px] font-mono tracking-wide">
                  ♿ Accessibility Assistive Tool
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Simulates natural, human-paced assistive typing directly into your open Google Doc.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-[var(--text-muted)] hover:text-white p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-[var(--text-secondary)]">
          {/* Target Assignment Pill */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 truncate">
              <FileText className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="font-semibold text-white truncate">{assignmentTitle}</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)] shrink-0">
              <span>{wordCount} words</span>
              <span>•</span>
              <span>~{estMinutes} min typing time</span>
            </div>
          </div>

          {/* Active Typing In-Progress Card */}
          {typingState.isTyping && (
            <div className="p-4 rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-950/40 via-slate-900 to-slate-950 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-ping" />
                  <span className="font-bold text-white text-sm">
                    {typingState.isPaused ? 'Typing Paused' : `Typing into Google Doc at ${wpm} WPM…`}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-violet-300">
                  {typingState.percentage}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                  style={{ width: `${typingState.percentage}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                <span>
                  Typed {typingState.wordsTyped} of {typingState.totalWords || wordCount} words
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePauseResume}
                    className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {typingState.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {typingState.isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-1.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold border border-rose-500/30 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" /> Stop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Completed Message */}
          {typingState.status === 'completed' && (
            <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 flex items-center gap-3 text-emerald-200">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-white text-sm">Assistive Typing Completed!</div>
                <div className="text-xs text-emerald-300/90 mt-0.5">
                  The assignment content was successfully typed into your Google Doc at your cursor location.
                </div>
              </div>
            </div>
          )}

          {/* Section 1: Target Google Doc Tab Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-white uppercase tracking-wider">
              1. Select Google Docs Tab
            </label>
            <div className="relative">
              <select
                value={targetTabId}
                onChange={(e) => setTargetTabId(e.target.value)}
                disabled={typingState.isTyping}
                className="w-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 transition cursor-pointer disabled:opacity-50"
              >
                {detectingTabs ? (
                  <option value="">Detecting open Google Docs tabs…</option>
                ) : openTabs.length > 0 ? (
                  <>
                    {openTabs.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        📄 {t.title || 'Google Doc'} {t.active ? '(Active Tab)' : ''}
                      </option>
                    ))}
                    <option value="new">➕ Open New Google Doc (docs.new)</option>
                  </>
                ) : (
                  <option value="new">✨ Open New Google Doc (docs.new)</option>
                )}
              </select>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
              <span>💡</span>
              <span>Make sure your Google Doc is open in another tab and click where you want the typing to start.</span>
            </p>
          </div>

          {/* Section 2: Typing Cadence & Accessibility Controls */}
          <div className="space-y-3 p-4 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-violet-400" />
                <span className="font-bold text-white text-xs uppercase tracking-wider">
                  2. Typing Cadence & Speed
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/30">
                {wpm} WPM ({wpm <= 45 ? 'Gentle' : wpm <= 75 ? 'Natural' : 'Brisk'})
              </span>
            </div>

            {/* WPM Slider */}
            <div className="space-y-1.5">
              <input
                type="range"
                min="30"
                max="120"
                step="5"
                value={wpm}
                onChange={(e) => setWpm(Number(e.target.value))}
                disabled={typingState.isTyping}
                className="w-full accent-violet-500 cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                <span>30 WPM (Slow & Steady)</span>
                <span>65 WPM (Natural Average)</span>
                <span>120 WPM (Fast)</span>
              </div>
            </div>

            {/* Preset Buttons */}
            <div className="flex gap-2 pt-1">
              {[
                { label: 'Gentle (40 WPM)', val: 40 },
                { label: 'Natural (65 WPM)', val: 65 },
                { label: 'Brisk (90 WPM)', val: 90 },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => setWpm(p.val)}
                  disabled={typingState.isTyping}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                    wpm === p.val
                      ? 'bg-violet-600/30 border-violet-500 text-violet-200'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Advanced Natural Rhythm Toggles */}
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={naturalPauses}
                  onChange={(e) => setNaturalPauses(e.target.checked)}
                  disabled={typingState.isTyping}
                  className="rounded border-slate-700 text-violet-500 focus:ring-violet-500"
                />
                <span className="text-xs">Natural pauses at punctuation, commas, and paragraph breaks</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={jitter}
                  onChange={(e) => setJitter(e.target.checked)}
                  disabled={typingState.isTyping}
                  className="rounded border-slate-700 text-violet-500 focus:ring-violet-500"
                />
                <span className="text-xs">Variable keystroke rhythm (organic motor timing)</span>
              </label>
            </div>
          </div>

          {/* Section 3: Content Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-white uppercase tracking-wider">
                3. Assignment Text to Type
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            </div>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={typingState.isTyping}
              placeholder="Enter or review the content to be typed into Google Docs…"
              className="w-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-violet-500 font-sans resize-y max-h-[220px]"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[var(--bg-surface-elevated)] hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-[var(--border-subtle)] transition cursor-pointer"
          >
            {typingState.isTyping ? 'Close Panel (Typing Continues)' : 'Close'}
          </button>

          <div className="flex items-center gap-2">
            {!typingState.isTyping ? (
              <button
                type="button"
                onClick={handleStartTyping}
                disabled={!text.trim()}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-violet-600/30 flex items-center gap-2 transition cursor-pointer disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch to Doc</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePauseResume}
                className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
              >
                {typingState.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                <span>{typingState.isPaused ? 'Resume Typing' : 'Pause Typing'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
