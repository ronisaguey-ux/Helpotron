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
  UploadCloud,
  FileCode,
  Zap,
} from 'lucide-react';
import api from '../api.js';

export default function LaunchToDocModal({
  isOpen,
  onClose,
  assignment = null,
  initialText = '',
}) {
  const [targetTabId, setTargetTabId] = useState('');
  const [targetApp, setTargetApp] = useState('gdocs'); // 'gdocs' | 'gmail' | 'notion' | 'universal'
  const [openTabs, setOpenTabs] = useState([]);
  const [detectingTabs, setDetectingTabs] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);

  // Content state
  const [text, setText] = useState(initialText || '');
  const [loadingPayload, setLoadingPayload] = useState(false);
  const [copied, setCopied] = useState(false);

  // Realism Preset state
  const [preset, setPreset] = useState('academic'); // academic | gentle | brisk | motor
  const [wpm, setWpm] = useState(65);
  const [typoRate, setTypoRate] = useState(2.0); // %
  const [falseStarts, setFalseStarts] = useState(true);
  const [naturalPauses, setNaturalPauses] = useState(true);
  const [jitter, setJitter] = useState(true);
  const [burstRhythm, setBurstRhythm] = useState(true);
  const [fatigueCurve, setFatigueCurve] = useState(true);
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

  // Handle Preset Change
  const applyPreset = (newPreset) => {
    setPreset(newPreset);
    if (newPreset === 'gentle') {
      setWpm(35);
      setTypoRate(2.5);
      setFalseStarts(true);
      setNaturalPauses(true);
      setJitter(true);
      setFatigueCurve(true);
    } else if (newPreset === 'academic') {
      setWpm(65);
      setTypoRate(1.8);
      setFalseStarts(true);
      setNaturalPauses(true);
      setJitter(true);
      setBurstRhythm(true);
      setFatigueCurve(true);
    } else if (newPreset === 'brisk') {
      setWpm(95);
      setTypoRate(1.0);
      setFalseStarts(false);
      setNaturalPauses(true);
      setJitter(false);
      setBurstRhythm(true);
      setFatigueCurve(false);
    } else if (newPreset === 'motor') {
      setWpm(50);
      setTypoRate(3.0);
      setFalseStarts(true);
      setNaturalPauses(true);
      setJitter(true);
      setFatigueCurve(true);
    }
  };

  /* QA 08-31 a11y: this dialog is `aria-modal`, but nothing moved focus into
   * it, Escape did not dismiss it, and Tab walked straight out into the page
   * behind the overlay — measured: on open, document.activeElement was still
   * <body>. A keyboard or screen-reader user had no way in and no way out but
   * the X button. Move focus in on open, keep Tab inside, close on Escape, and
   * hand focus back to whatever opened the dialog. */
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    restoreFocusRef.current = document.activeElement;

    const SELECTOR =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
      'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      [...(panelRef.current?.querySelectorAll(SELECTOR) || [])].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );

    // land on the panel itself rather than the close button, so the dialog's
    // heading is what a screen reader announces first
    panelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const back = restoreFocusRef.current;
      if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
    };
  }, [isOpen, onClose]);

  // 1. Detect Extension & Google Docs / Editor tabs via postMessage bridge
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
          isTyping: p.isTyping || p.status === 'typing' || p.status === 'started',
          isPaused: p.isPaused || p.status === 'paused',
          percentage: p.progressPct || p.percentage || 0,
          wordsTyped: p.wordsTyped || 0,
          totalWords: p.totalWords || 0,
          status: p.isTyping ? 'typing' : (p.progressPct >= 100 ? 'completed' : prev.status),
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
        
        let chosenText = assign.do_it_work || '';
        if (!chosenText && materials.length > 0) {
          const textMat = materials.find((m) => m.content_text || m.content);
          if (textMat) chosenText = textMat.content_text || textMat.content;
        }
        if (!chosenText) chosenText = assign.prompt || '';

        setText(chosenText);
      })
      .catch(() => {
        if (cancelled) return;
        setText(assignment?.prompt || '');
      })
      .finally(() => {
        if (!cancelled) setLoadingPayload(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, assignmentId, initialText]);

  // 3. Action Handlers
  const handleLaunch = () => {
    if (!text.trim()) return;

    setTypingState({
      isTyping: true,
      isPaused: false,
      percentage: 0,
      wordsTyped: 0,
      totalWords: text.split(/\s+/).filter(Boolean).length,
      status: 'typing',
      error: null,
    });

    window.postMessage({
      type: 'HELPOTRON_LAUNCH_TO_DOC',
      requestId: Date.now(),
      payload: {
        tabId: targetTabId && targetTabId !== 'new' ? Number(targetTabId) : null,
        text: text,
        wpm: Number(wpm),
        naturalPauses: naturalPauses,
        jitter: jitter,
        typoRate: typoRate / 100.0,
        falseStartRate: falseStarts ? 0.015 : 0.0,
        burstRhythm: burstRhythm,
        fatigueCurve: fatigueCurve,
        title: assignmentTitle,
        assignmentId: assignmentId,
        targetApp: targetApp,
      },
    }, '*');
  };

  const handlePause = () => {
    window.postMessage({
      type: 'HELPOTRON_CONTROL_TYPING',
      action: 'pause',
      tabId: targetTabId && targetTabId !== 'new' ? Number(targetTabId) : null,
    }, '*');
    setTypingState((prev) => ({ ...prev, isPaused: true, status: 'paused' }));
  };

  const handleResume = () => {
    window.postMessage({
      type: 'HELPOTRON_CONTROL_TYPING',
      action: 'resume',
      tabId: targetTabId && targetTabId !== 'new' ? Number(targetTabId) : null,
    }, '*');
    setTypingState((prev) => ({ ...prev, isPaused: false, status: 'typing' }));
  };

  const handleCancel = () => {
    window.postMessage({
      type: 'HELPOTRON_CONTROL_TYPING',
      action: 'cancel',
      tabId: targetTabId && targetTabId !== 'new' ? Number(targetTabId) : null,
    }, '*');
    setTypingState((prev) => ({
      ...prev,
      isTyping: false,
      isPaused: false,
      status: 'cancelled',
    }));
  };

  const handleCopyFallback = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (re) => {
      setText(re.target?.result || '');
    };
    reader.readAsText(file);
  };

  /* ARIA radiogroup keyboard model. `role="radio"` promises arrow-key
   * navigation with a roving tabindex — Tab enters the group once and lands on
   * the checked option, arrows move between options. Declaring the role without
   * this behaviour would be worse than plain buttons, so it is implemented for
   * both choosers. */
  const onRadioKeyDown = (e, ids, currentId, select) => {
    const NEXT = ['ArrowRight', 'ArrowDown'];
    const PREV = ['ArrowLeft', 'ArrowUp'];
    if (![...NEXT, ...PREV, 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = ids.indexOf(currentId);
    const at = e.key === 'Home' ? 0
      : e.key === 'End' ? ids.length - 1
      : NEXT.includes(e.key) ? (i + 1) % ids.length
      : (i - 1 + ids.length) % ids.length;
    const nextId = ids[at];
    select(nextId);
    e.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelector(`[data-radio-id="${nextId}"]`)
      ?.focus();
  };

  if (!isOpen) return null;

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedMins = Math.max(1, Math.round(wordCount / (wpm || 65)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-modal-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-2xl bg-[var(--bg-surface)] border border-violet-500/30 rounded-2xl shadow-2xl shadow-violet-950/40 overflow-hidden flex flex-col max-h-[90vh] outline-none @container"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-gradient-to-r from-violet-950/40 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 id="launch-modal-title" className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                Launch to Doc
                <span className="text-[10px] font-semibold font-mono uppercase px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  Assistive Typing Engine
                </span>
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Autonomous human-like typing simulation for students with motor or cognitive disabilities
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/5 transition"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Assignment Context Banner */}
          <div className="flex flex-col @sm:flex-row @sm:items-center @sm:justify-between gap-2 p-3.5 rounded-xl bg-white/[0.03] border border-[var(--border-subtle)] text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="font-semibold text-[var(--text-primary)] truncate">
                {assignmentTitle}
              </span>
            </div>
            <div className="flex items-center gap-2 text-violet-300/80 font-mono text-[11px] shrink-0">
              <span>{wordCount} words</span>
              <span>•</span>
              <span>~{estimatedMins} min at {wpm} WPM</span>
            </div>
          </div>

          {/* Target App & Tab Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span id="launch-target-label" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-violet-400" />
                Target Editor &amp; Tab
              </span>
              {extensionConnected ? (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3 h-3" /> Extension Ready (v2.2.0)
                </span>
              ) : (
                <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                  <AlertCircle className="w-3 h-3" /> Standalone Mode
                </span>
              )}
            </div>

            <div
              role="radiogroup"
              aria-labelledby="launch-target-label"
              className="grid grid-cols-2 @sm:grid-cols-4 gap-2 mb-2"
            >
              {[
                { id: 'gdocs', label: 'Google Docs', icon: '📄' },
                { id: 'gmail', label: 'Gmail', icon: '✉️' },
                { id: 'notion', label: 'Notion', icon: '📝' },
                { id: 'universal', label: 'Active Field', icon: '⌨️' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={targetApp === item.id}
                  data-radio-id={item.id}
                  tabIndex={targetApp === item.id ? 0 : -1}
                  onKeyDown={(e) =>
                    onRadioKeyDown(e, ['gdocs', 'gmail', 'notion', 'universal'], targetApp, setTargetApp)}
                  onClick={() => setTargetApp(item.id)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                    targetApp === item.id
                      ? 'bg-violet-600/20 border-violet-500/50 text-violet-200'
                      : 'bg-white/[0.02] border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-white/5'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <select
              value={targetTabId}
              onChange={(e) => setTargetTabId(e.target.value)}
              disabled={detectingTabs}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-violet-500/60 disabled:opacity-50"
            >
              {openTabs.length > 0 ? (
                openTabs.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.active ? '👉 ' : ''}[{t.app || 'Tab'}] {t.title || 'Document'}
                  </option>
                ))
              ) : (
                <option value="new">✨ Open New Google Doc (docs.new)</option>
              )}
              <option value="new">➕ Open New Google Doc tab (docs.new)</option>
            </select>
          </div>

          {/* Realism Preset Switcher */}
          <div className="space-y-2">
            <span id="launch-preset-label" className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-violet-400" />
              Accessibility Cadence Preset
            </span>
            <div
              role="radiogroup"
              aria-labelledby="launch-preset-label"
              className="grid grid-cols-2 @sm:grid-cols-4 gap-2"
            >
              {[
                { id: 'academic', label: 'Natural Academic', wpm: 65, desc: 'Balanced 65 WPM' },
                { id: 'gentle', label: 'Gentle RSI Relief', wpm: 35, desc: 'Slow 35 WPM' },
                { id: 'brisk', label: 'Brisk Pro', wpm: 95, desc: 'Fast 95 WPM' },
                { id: 'motor', label: 'Motor Assist', wpm: 50, desc: 'High Variance' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={preset === p.id}
                  data-radio-id={p.id}
                  tabIndex={preset === p.id ? 0 : -1}
                  onKeyDown={(e) =>
                    onRadioKeyDown(e, ['academic', 'gentle', 'brisk', 'motor'], preset, applyPreset)}
                  onClick={() => applyPreset(p.id)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    preset === p.id
                      ? 'bg-violet-600/20 border-violet-500/50 text-white ring-1 ring-violet-500/30'
                      : 'bg-white/[0.02] border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-white/5'
                  }`}
                >
                  <div className="text-xs font-bold">{p.label}</div>
                  <div className="text-[10px] text-violet-300 font-mono mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Speed (WPM) Slider */}
          <div className="space-y-2 p-4 rounded-xl bg-white/[0.02] border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)]">Typing Speed</span>
              <span className="font-mono font-bold text-violet-400 text-sm">{wpm} WPM</span>
            </div>
            <input
              type="range"
              aria-label="Typing speed in words per minute"
              aria-valuetext={`${wpm} words per minute`}
              min="20"
              max="130"
              step="5"
              value={wpm}
              onChange={(e) => setWpm(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
              <span>20 WPM (RSI/Fatigue)</span>
              <span>65 WPM (Human Average)</span>
              <span>130 WPM (Brisk)</span>
            </div>
          </div>

          {/* 9 Realism Dimensions Drawer */}
          <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] text-xs font-semibold text-[var(--text-secondary)] transition"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-violet-400" />
                <span>Fine-Tuned Realism Controls (9 Dimensions)</span>
              </div>
              <span className="text-[11px] text-violet-400 font-mono">
                {showAdvanced ? 'Hide −' : 'Customize +'}
              </span>
            </button>

            {showAdvanced && (
              <div className="p-4 bg-black/20 border-t border-[var(--border-subtle)] space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2.5 text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={naturalPauses}
                      onChange={(e) => setNaturalPauses(e.target.checked)}
                      className="rounded accent-violet-500"
                    />
                    <span>Punctuation &amp; Paragraph Pauses</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={jitter}
                      onChange={(e) => setJitter(e.target.checked)}
                      className="rounded accent-violet-500"
                    />
                    <span>Gaussian Keystroke Jitter</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={falseStarts}
                      onChange={(e) => setFalseStarts(e.target.checked)}
                      className="rounded accent-violet-500"
                    />
                    <span>False Starts &amp; Micro-Backspaces</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={burstRhythm}
                      onChange={(e) => setBurstRhythm(e.target.checked)}
                      className="rounded accent-violet-500"
                    />
                    <span>Syllable Burst Rhythm</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fatigueCurve}
                      onChange={(e) => setFatigueCurve(e.target.checked)}
                      className="rounded accent-violet-500"
                    />
                    <span>Fatigue Curve Simulation</span>
                  </label>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-secondary)]">Realistic Neighbor Typo Rate:</span>
                    <span className="font-mono text-violet-400 font-bold">{typoRate}%</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Realistic neighbour typo rate, percent"
                    aria-valuetext={`${typoRate} percent`}
                    min="0"
                    max="6"
                    step="0.5"
                    value={typoRate}
                    onChange={(e) => setTypoRate(Number(e.target.value))}
                    className="w-full accent-violet-500 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Text Preview & File Upload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-violet-400" />
                Text to Type ({wordCount} words)
              </span>
              <label className="text-[11px] text-violet-400 hover:text-violet-300 cursor-pointer flex items-center gap-1">
                <UploadCloud className="w-3.5 h-3.5" />
                Load .txt/.md File
                <input type="file" accept=".txt,.md,.json" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Paste or write the assignment text to type into Google Docs…"
              className="w-full p-3 rounded-xl bg-black/40 border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-violet-500/60 custom-scrollbar resize-none"
            />
          </div>

          {/* Live Typing Status & Progress Bar */}
          {typingState.isTyping && (
            <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/40 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-semibold text-violet-200">
                    {typingState.isPaused ? 'Typing Paused' : `Typing autonomously at ${wpm} WPM…`}
                  </span>
                </div>
                <span className="font-mono font-bold text-violet-300">
                  {typingState.percentage}% ({typingState.wordsTyped}/{typingState.totalWords} w)
                </span>
              </div>

              <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${typingState.percentage}%` }}
                />
              </div>

              <div className="flex justify-end gap-2">
                {typingState.isPaused ? (
                  <button
                    type="button"
                    onClick={handleResume}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                  >
                    <Play className="w-3.5 h-3.5" /> Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
                >
                  <Square className="w-3.5 h-3.5" /> Stop
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-black/20 flex flex-col @sm:flex-row @sm:items-center @sm:justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyFallback}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-white/5 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--text-muted)] hover:text-white transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleLaunch}
              disabled={!text.trim() || typingState.isTyping}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-700/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4 text-violet-200" />
              Launch Typing Engine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
