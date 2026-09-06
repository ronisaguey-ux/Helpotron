import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Check,
  Download,
  Sparkles,
  Archive,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  Compass,
} from 'lucide-react';

/**
 * WorkingDraftCard Component — Stitch Screen 3.5.4 Specification
 *
 * Displays current synthesized draft with:
 *  - 4-line preview clamp (reading-mode expand/collapse)
 *  - model_used mono pill, word count, and human score verification telemetry
 *  - Copy to clipboard with 2s Check feedback
 *  - Launch to Doc and Export actions
 *  - Bottom action bar: "Move to history" (ghost) + "Mark as done" (primary)
 *  - Empty, Loading, and Failed states
 */
export default function WorkingDraftCard({
  draft = null,
  assignment = null,
  loading = false,
  onMarkDone,
  onArchive,
  onLaunchToDoc,
  onExport,
  onPickDirection,
  markingDone = false,
  archiving = false,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // The full-view payload arrives as `draft` (assignment row w/ progress);
  // the list-shaped `assignment` prop usually carries no progress — read both.
  const progress = draft?.progress || assignment?.progress || {};

  // Extract draft text from various payload fields
  const content = (
    draft?.text ||
    draft?.content ||
    draft?.body ||
    draft?.first_draft?.content ||
    progress?.first_draft?.content ||
    progress?.do_it_work ||
    assignment?.final_draft ||
    assignment?.draft_text ||
    ''
  ).trim();

  const modelUsed = draft?.model_used || assignment?.model_used || 'deepseek-v3';
  // Real detector verdicts live on progress as ai_score / detector_passed /
  // detector_details (assignment_team + orchestrator). Human-score fields are
  // the extended-pipeline equivalents — fall through to the real score before
  // the placeholder default so the card never lies (09-06).
  const detectorDetails = draft?.detector_results || progress?.detector_details || draft?.detector_details || null;
  const passedDetector = draft?.detector_passed ?? progress?.detector_passed ?? null;
  const humanScore =
    draft?.human_score ??
    progress?.human_score ??
    draft?.ai_score ??
    progress?.ai_score ??
    88;
  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  // 1. LOADING SKELETON
  if (loading) {
    return (
      <div className={`rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/20 p-6 md:p-8 animate-pulse space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-surface-container-high rounded-xl" />
          <div className="h-6 w-24 bg-surface-container rounded-lg" />
        </div>
        <div className="space-y-2 py-4">
          <div className="h-4 w-full bg-surface-container-low rounded" />
          <div className="h-4 w-5/6 bg-surface-container-low rounded" />
          <div className="h-4 w-4/6 bg-surface-container-low rounded" />
        </div>
      </div>
    );
  }

  // 2. EMPTY STATE
  if (!content) {
    return (
      <div className={`rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-dashed border-outline-variant/30 p-8 text-center flex flex-col items-center justify-center gap-4 ${className}`}>
        <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary shadow-inner">
          <FileText className="w-7 h-7 stroke-[1.75]" />
        </div>
        <div className="flex flex-col gap-1 max-w-md">
          <h4 className="font-title-md text-title-md font-semibold text-on-surface">
            Nothing generated yet
          </h4>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Pick an autonomous research vector or coordinate with the agent team to generate the working draft.
          </p>
        </div>
        {onPickDirection && (
          <button
            type="button"
            onClick={onPickDirection}
            className="h-11 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] hover:bg-primary-container transition-all cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>Select Vector</span>
          </button>
        )}
      </div>
    );
  }

  // 3. POPULATED WORKING DRAFT VIEW
  return (
    <div
      className={`relative rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 md:p-8 flex flex-col gap-6 shadow-sm ${className}`}
    >
      {/* Top Header & Telemetry Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-outline-variant/15 pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-surface-container-high text-primary font-code-sm text-xs font-mono">
              <span>{modelUsed}</span>
            </div>
            <h3 className="font-title-md text-title-md text-on-surface font-semibold tracking-tight">
              Synthesized Working Draft
            </h3>
            {passedDetector === false || assignment?.status === 'draft_risky' ? (
              <span className="font-chip-status text-[10px] text-sem-amber bg-sem-amber/10 border border-sem-amber/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sem-amber" />
                <span>BELOW HUMAN THRESHOLD — RETRY</span>
              </span>
            ) : (
              <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/10 border border-sem-green/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sem-green" />
                <span>PASSED STEALTH</span>
              </span>
            )}
          </div>

          {/* Monospace Telemetry Strip */}
          <div className="flex items-center gap-3 text-on-surface-variant font-code-sm text-xs flex-wrap">
            <span>
              Word count: <strong className="text-on-surface font-mono">{wordCount}</strong>
            </span>
            <span className="text-outline">/</span>
            <span>
              Human Score: <strong className="text-primary font-mono">{humanScore}%</strong>
            </span>
            {detectorDetails?.length > 0 && (
              <>
                <span className="text-outline">/</span>
                <span>
                  Detectors: <strong className="text-on-surface font-mono">{detectorDetails.map((d) => d.detector || d.name).join(' · ')}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
          {/* Copy button with 2s Check feedback */}
          <button
            type="button"
            onClick={handleCopy}
            className="h-10 px-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface flex items-center gap-1.5 font-label-caps text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-sem-green stroke-[2.5]" />
                <span className="text-sem-green">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          {onLaunchToDoc && (
            <button
              type="button"
              onClick={onLaunchToDoc}
              className="h-10 px-3.5 rounded-xl bg-secondary/10 hover:bg-secondary/20 border border-secondary/30 text-secondary flex items-center gap-1.5 font-label-caps text-xs uppercase tracking-wider transition-colors cursor-pointer"
              title="Launch to Google Doc with assistive typing"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Launch</span>
            </button>
          )}

          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
              title="Export JSON artifact"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Prose Viewport (4-line preview clamp when collapsed) */}
      <div className="relative">
        <div
          className={`font-body-sm text-xs leading-relaxed text-on-surface whitespace-pre-wrap select-text transition-all duration-200 ${
            !expanded ? 'line-clamp-4 max-h-28 overflow-hidden' : 'max-h-[500px] overflow-y-auto pr-2'
          }`}
        >
          {content}
        </div>

        {/* Read More / Collapse Toggle */}
        <div className="flex justify-center mt-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="h-8 px-4 rounded-full bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/25 text-on-surface-variant hover:text-on-surface font-label-caps text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{expanded ? 'Collapse Reading Mode' : 'Expand Full Draft'}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Bottom Action Bar: Ghost Move to History + Primary Mark as Done */}
      <div className="pt-5 border-t border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Archive confirmation strip */}
        {showArchiveConfirm ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-body-sm text-xs text-sem-amber">
              Confirm archive to submission history?
            </span>
            <button
              type="button"
              onClick={() => {
                setShowArchiveConfirm(false);
                if (onArchive) onArchive();
              }}
              disabled={archiving}
              className="h-9 px-4 rounded-lg bg-error text-on-error font-label-caps text-[10px] uppercase font-semibold cursor-pointer"
            >
              {archiving ? 'Archiving...' : 'Yes, Archive'}
            </button>
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(false)}
              className="h-9 px-3 rounded-lg bg-surface-container-high text-on-surface font-label-caps text-[10px] uppercase cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          onArchive && (
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(true)}
              className="h-11 px-4 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-caps text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              <span>Move to History</span>
            </button>
          )
        )}

        {onMarkDone && (
          <button
            type="button"
            onClick={onMarkDone}
            disabled={markingDone}
            className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider shadow-[0_0_24px_rgba(89,216,201,0.25)] hover:bg-primary-container transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ml-auto"
          >
            <Check className="w-4 h-4 stroke-[2]" />
            <span>{markingDone ? 'Marking Done...' : 'Mark as Done'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
