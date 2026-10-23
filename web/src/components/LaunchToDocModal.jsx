/**
 * LaunchToDocModal.jsx — Humanized Typing Stream & Google Docs Exporter (Stitch v6 / §3.7.2).
 * Supports 3 Cadence Presets (Hesitant / Thinker, Flowing Academic, Rapid Draft),
 * 10s preview test, real-time typing simulation, focus trap, and Enter submission.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Play, Pause, Square, ExternalLink, CheckCircle2,
  AlertCircle, X, Copy, Check, Sparkles, Gauge, Loader2, ArrowRight
} from 'lucide-react';
import api from '../api.js';

export const CADENCE_PRESETS = [
  {
    id: 'hesitant',
    label: 'Hesitant / Thinker',
    wpm: 45,
    typoRate: 3.2,
    description: 'Frequent cognitive pauses, clause re-reads, and deliberate typing pace.',
  },
  {
    id: 'academic',
    label: 'Flowing Academic',
    wpm: 65,
    typoRate: 1.8,
    description: 'Steady scholarly rhythm with natural pauses and occasional typo corrections.',
  },
  {
    id: 'rapid',
    label: 'Rapid Draft',
    wpm: 85,
    typoRate: 2.2,
    description: 'High-speed drafting with quick corrections and continuous sentence flow.',
  },
];

// ── Website → Extension bridge ───────────────────────────────────────────────
// The WEBSITE is the brain and the extension is the hands. This hands a fully
// composed launch command to the extension, which only performs the browser
// mechanics (find/create the doc tab, focus it, type). The extension's content
// script relays window.postMessage <-> chrome.runtime, so no externally_
// connectable manifest entry is needed.
//
// Because the command is composed here (from the server's plan endpoint), the
// whole feature — cadence, doc target, typo rate — is adjustable from the site
// without shipping a new extension build.
function postToExtension(type, payload, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const requestId = `ltd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let done = false;

    const onMessage = (event) => {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.requestId !== requestId) return;
      if (d.type !== 'HELPOTRON_LAUNCH_TO_DOC_RESULT' && d.type !== 'HELPOTRON_CONTROL_TYPING_RESULT') return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve(d.result || { ok: false, error: 'the extension returned no result' });
    };

    window.addEventListener('message', onMessage);
    window.postMessage({ type, requestId, payload }, '*');

    // The extension may simply not be installed; never hang the UI on it.
    setTimeout(() => {
      if (done) return;
      window.removeEventListener('message', onMessage);
      resolve({ ok: false, error: 'no response from the Helpotron extension — install or enable it, then try again.' });
    }, timeoutMs);
  });
}

export default function LaunchToDocModal({
  isOpen = true,
  onClose = () => {},
  assignment = null,
  initialText = '',
}) {
  const [text, setText] = useState(initialText || '');
  const [selectedPreset, setSelectedPreset] = useState('academic');
  const [wpm, setWpm] = useState(65);
  const [typoRate, setTypoRate] = useState(1.8);

  const [previewRunning, setPreviewRunning] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewText, setPreviewText] = useState('');

  const [streamActive, setStreamActive] = useState(false);
  const [streamPercent, setStreamPercent] = useState(0);
  const [streamError, setStreamError] = useState('');
  const [copied, setCopied] = useState(false);
  const [docUrl, setDocUrl] = useState('');
  // The cadence menu is the SERVER's, not this file's. The local list is only a
  // fallback until the config arrives (or if the site is unreachable).
  const [presets, setPresets] = useState(CADENCE_PRESETS);

  const modalRef = useRef(null);

  // Real typing progress relayed from the extension while it types, plus the
  // server-owned cadence menu. Both best-effort: the modal still works without.
  useEffect(() => {
    function onMessage(event) {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.type !== 'HELPOTRON_TYPING_PROGRESS') return;
      const outer = d.payload || {};
      const inner = outer.payload || outer;
      const pct = Number(inner.percentage ?? inner.percent ?? inner.progress);
      if (Number.isFinite(pct)) setStreamPercent(Math.max(0, Math.min(100, Math.round(pct))));
      if (inner.state === 'finished' || inner.status === 'finished' || pct >= 100) setStreamActive(false);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.request?.('/api/launch-to-doc/config')
      .then((cfg) => {
        if (cancelled || !cfg || !Array.isArray(cfg.presets) || !cfg.presets.length) return;
        setPresets(cfg.presets.map((p) => ({
          id: p.id,
          label: p.label,
          wpm: p.wpm,
          // the server stores a rate (0.018); this panel shows a percentage (1.8)
          typoRate: Math.round(Number(p.typo_rate || 0) * 1000) / 10,
          description: p.title || p.sub || '',
        })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Esc and Enter shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isOpen) {
        e.preventDefault();
        handleStartStream();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (presetId) => {
    setSelectedPreset(presetId);
    const p = presets.find((cp) => cp.id === presetId);
    if (p) {
      setWpm(p.wpm);
      setTypoRate(p.typoRate);
    }
  };

  const handle10sPreview = () => {
    if (previewRunning) return;
    setPreviewRunning(true);
    setPreviewProgress(0);
    setPreviewText('');

    const sample = (text || 'Assistive typing for students ensures organic writing history.').substring(0, 120);
    let i = 0;
    const interval = setInterval(() => {
      if (i < sample.length) {
        setPreviewText((prev) => prev + sample[i]);
        setPreviewProgress(Math.round(((i + 1) / sample.length) * 100));
        i++;
      } else {
        clearInterval(interval);
        setPreviewRunning(false);
      }
    }, 75);
  };

  const handleStartStream = async () => {
    setStreamActive(true);
    setStreamPercent(0);
    setDocUrl('');
    setStreamError('');

    try {
      // 1. The SERVER composes the command: which text, which cadence, where it
      //    goes, and a clamped typing config. Nothing about the launch is decided
      //    in the browser any more.
      const plan = await api.request('/api/launch-to-doc/plan', {
        method: 'POST',
        body: JSON.stringify({
          assignment_id: assignment?.id ?? null,
          preset_id: selectedPreset,
          text: text || '',
        }),
      });

      if (!plan || plan.status !== 'success' || !plan.text) {
        throw new Error((plan && plan.detail) || 'the server did not return a launch plan');
      }

      // 2. The EXTENSION is the hands: hand it the command verbatim and let it
      //    type. It decides nothing, so the site stays in control of behaviour.
      const result = await postToExtension('HELPOTRON_LAUNCH_TO_DOC', plan);

      if (!result || !result.ok) {
        throw new Error((result && result.error) || 'the extension could not start typing');
      }

      setStreamActive(true);
      setStreamPercent(0);
    } catch (e) {
      setStreamError(String((e && e.message) || e));
      setStreamActive(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-unit-3 sm:p-unit-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-doc-modal-title"
        className="w-full max-w-xl max-h-[92dvh] rounded-3xl bg-surface-container-lowest/95 border border-outline-variant/30 shadow-2xl p-unit-6 flex flex-col gap-unit-5 relative overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-unit-3 border-b border-outline-variant/15 pb-4">
          <div className="flex items-center gap-unit-3">
            <div className="w-11 h-11 rounded-2xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0 shadow-inner">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 id="launch-doc-modal-title" className="font-headline-lg text-title-md font-semibold text-on-surface">
                Launch to Doc · Humanized Typing Stream
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Streams content with organic revision snapshots &amp; zero AI metadata.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Cadence Presets (§3.7.2) */}
        <div className="flex flex-col gap-2">
          <label className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
            Typing Speed & Style
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-unit-2">
            {presets.map((preset) => {
              const isSelected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`p-unit-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-primary-container/20 border-primary text-on-surface shadow-sm'
                      : 'bg-surface-container-low/60 hover:bg-surface-container-low border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-body-sm text-xs font-semibold text-on-surface">
                      {preset.label}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <span className="font-code-sm text-[11px] text-outline">
                    {preset.wpm} WPM · {preset.typoRate}% typos
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Telemetry & Controls Grid */}
        <div className="grid grid-cols-2 gap-unit-3 bg-surface-container-low/60 p-unit-4 rounded-2xl border border-outline-variant/20">
          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-[10px] text-outline uppercase">Speed Adjustment</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={30}
                max={110}
                value={wpm}
                onChange={(e) => setWpm(Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <span className="font-tabular-stat-md text-xs font-semibold w-12 text-right">
                {wpm} WPM
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-label-caps text-[10px] text-outline uppercase">Typo Probability</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.1}
                value={typoRate}
                onChange={(e) => setTypoRate(Number(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <span className="font-tabular-stat-md text-xs font-semibold w-12 text-right">
                {typoRate}%
              </span>
            </div>
          </div>
        </div>

        {/* 10s Test Preview Sandbox */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-unit-4 flex flex-col gap-unit-2">
          <div className="flex items-center justify-between">
            <span className="font-code-sm text-xs text-outline uppercase">
              Simulator Sandbox {previewRunning && `(${previewProgress}%)`}
            </span>
            <button
              type="button"
              disabled={previewRunning}
              onClick={handle10sPreview}
              className="px-unit-3 py-1 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/25 text-on-surface font-label-caps text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {previewRunning ? 'Typing Preview...' : 'Test Preview 10s'}
            </button>
          </div>
          <p className="font-mono text-xs text-on-surface-variant min-h-[40px] leading-relaxed bg-surface-container-low/40 p-2.5 rounded-xl border border-outline-variant/15">
            {previewText || 'Click "Test Preview 10s" to simulate live typing speed with backspaces and pauses.'}
            {previewRunning && <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse" />}
          </p>
        </div>

        {/* Streaming Status / Link */}
        {streamPercent > 0 && (
          <div className="p-unit-3 rounded-2xl bg-sem-green/10 border border-sem-green/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-sem-green" />
              <span className="font-body-sm text-xs text-on-surface font-medium">
                {streamPercent < 100 ? `Streaming into Google Doc (${streamPercent}%)...` : 'Document Replay Ready!'}
              </span>
            </div>
            {docUrl && (
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-label-caps text-xs text-primary flex items-center gap-1 hover:underline"
              >
                <span>Open Google Doc</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {/* Launch failure — the plan or the extension could not start typing.
            Surfaced explicitly: the old flow faked a progress bar, so a real
            failure used to look like success. */}
        {streamError && (
          <div className="p-unit-3 rounded-2xl bg-sem-red/10 border border-sem-red/30 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-sem-red shrink-0" />
            <span className="font-body-sm text-xs text-on-surface">{streamError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-unit-3 pt-unit-3 border-t border-outline-variant/15">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-unit-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-label-caps transition-colors cursor-pointer"
          >
            Cancel (Esc)
          </button>

          <button
            type="button"
            disabled={streamActive}
            onClick={handleStartStream}
            className="h-11 px-unit-5 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] hover:shadow-[0_0_28px_rgba(89,216,201,0.4)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            {streamActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            <span>Start Humanized Typing Stream</span>
          </button>
        </div>
      </div>
    </div>
  );
}
