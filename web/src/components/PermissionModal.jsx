/**
 * PermissionModal.jsx — Autonomous Action Approval Gate (Stitch v6 / §3.6.6).
 * Scoped grant sheet with focus trap, ESC/Enter keybindings, AST diff preview,
 * and 4 standardized action decisions.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert, X, ChevronDown, ChevronUp, Check, Zap, AlertCircle,
  FileCode, Send, CornerDownLeft, Ban, Loader2
} from 'lucide-react';

export const SETTING_LABELS = {
  agent_name: 'agent name', name: 'agent name',
  personality: 'personality', instructions: 'instructions',
  effort_score: 'effort score', operation_mode: 'operation mode',
  auto_approved_actions: 'auto-approved actions',
  school_name: 'school', major: 'major', goal: 'goal',
  font_size: 'font size', font_scale: 'font scale', fontScale: 'font scale',
  theme: 'theme', accent: 'accent color', density: 'density',
  compact_mode: 'compact mode', uiStyle: 'UI style', ui_style: 'UI style',
  animation: 'animations', background: 'background',
  custom_color: 'custom color', language: 'language', timezone: 'timezone',
  reducedMotion: 'reduced motion', reduced_motion: 'reduced motion',
  highContrast: 'high contrast', high_contrast: 'high contrast',
  largeText: 'large text', large_text: 'large text',
  dyslexiaFriendly: 'dyslexia-friendly mode', dyslexia_friendly: 'dyslexia-friendly mode',
  screenReader: 'screen reader', screen_reader: 'screen reader',
};

export default function PermissionModal({
  permission = {},
  onDecision = () => {},
  onClose = () => {},
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsText, setInstructionsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const modalRef = useRef(null);

  const permId = permission.id || permission.action_id || 'unknown';
  const actionType = permission.action_type || permission.type || 'Operational Side Effect';
  const description = permission.description || permission.message || 'Agent requested execution permission.';
  const payload = permission.payload || permission.changes || {};
  const scope = permission.scope || permission.subject || 'All Subjects';
  const interruptNum = permission.interrupt_id || String(permId).slice(-4) || '84';
  const computeTokens = permission.tokens || 420;
  const computeUsd = (computeTokens * 0.00001).toFixed(4);

  // Focus trap and keyboard listeners
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAction('deny');
      } else if (e.key === 'Enter' && !showInstructions && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleAction('approve');
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && showInstructions) {
        e.preventDefault();
        handleAction('feedback');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showInstructions, instructionsText]);

  async function handleAction(decision) {
    if (submitting) return;
    setSubmitting(true);
    setErrorText('');
    try {
      if (decision === 'feedback') {
        await onDecision(permId, 'deny', instructionsText);
      } else {
        await onDecision(permId, decision, instructionsText);
      }
    } catch (err) {
      setErrorText(err?.message || 'Failed to submit decision. Please retry.');
      setSubmitting(false);
    }
  }

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const hasPayload = payload && Object.keys(payload).length > 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-unit-3 sm:p-unit-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleAction('deny');
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-modal-title"
        className="w-full max-w-xl rounded-3xl bg-surface-container-lowest/95 border border-outline-variant/30 shadow-[0_0_48px_rgba(0,0,0,0.5)] p-unit-5 sm:p-unit-6 flex flex-col gap-unit-5 relative overflow-hidden transition-transform duration-150 animate-in zoom-in-95"
      >
        {/* Inner specular highlight */}
        <div className="absolute inset-0 pointer-events-none rounded-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />

        {/* Header */}
        <div className="flex items-start gap-unit-4 relative">
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-sem-amber/10 border border-sem-amber/30 flex items-center justify-center text-sem-amber shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <ShieldAlert className="w-6 h-6 stroke-[2]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-micro-2 mb-1 flex-wrap">
              <span className="font-chip-status text-chip-status uppercase px-unit-2 py-0.5 rounded-md bg-sem-amber/15 text-sem-amber border border-sem-amber/20 font-medium tracking-wider">
                Interrupt Gated
              </span>
              <span className="font-code-sm text-code-sm text-on-surface-variant font-medium">
                INTERRUPT #{interruptNum}
              </span>
            </div>
            <h2
              id="permission-modal-title"
              className="font-headline-lg text-title-md text-on-surface tracking-tight font-semibold"
            >
              Autonomous Action Approval Gate
            </h2>
          </div>

          <button
            type="button"
            aria-label="Deny and Close dialog"
            onClick={() => handleAction('deny')}
            disabled={submitting}
            className="w-8 h-8 rounded-lg bg-surface-container/60 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorText && (
          <div className="p-unit-3 rounded-xl bg-error-container/20 border border-error/40 text-error font-body-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}

        {/* Request Context Plain English Box */}
        <div className="bg-surface-container-low/70 border border-outline-variant/20 rounded-2xl p-unit-4 flex flex-col gap-unit-3">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Agent is requesting permission to execute an operational action:
          </p>
          <p className="font-body-md text-body-md text-on-surface font-medium">
            {description}
          </p>

          {/* Key Meta Telemetry Grid */}
          <div className="flex flex-col gap-micro-2 pt-micro-1">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between py-1.5 px-unit-3 rounded-lg bg-surface-container-lowest/60 gap-1">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                Action Target
              </span>
              <span className="font-body-sm text-body-sm text-on-surface font-medium text-right sm:text-left truncate">
                {actionType}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 px-unit-3 rounded-lg bg-surface-container-lowest/60">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                Target Scope
              </span>
              <span className="font-code-sm text-code-sm text-primary font-medium tracking-tight truncate">
                {scope}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 px-unit-3 rounded-lg bg-surface-container-lowest/60">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                Compute Cost
              </span>
              <div className="flex items-center gap-micro-2">
                <span className="font-tabular-stat-md text-tabular-stat-md text-on-surface">
                  {computeTokens} Tokens
                </span>
                <span className="font-code-sm text-code-sm text-outline">
                  (${computeUsd} USD)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between py-1.5 px-unit-3 rounded-lg bg-surface-container-lowest/60">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                Risk Tier
              </span>
              <span className="font-chip-status text-chip-status text-sem-amber uppercase font-semibold">
                Elevated Network I/O
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible AST Diff / Payload Inspection */}
        {hasPayload && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setShowDiff((prev) => !prev)}
              className="flex items-center justify-between px-unit-3 py-2 rounded-xl bg-surface-container-low/50 hover:bg-surface-container-low border border-outline-variant/15 text-xs text-on-surface-variant transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-outline" />
                <span className="font-code-sm">Payload Inspection (AST diff)</span>
              </div>
              <div className="flex items-center gap-1 text-outline">
                <span>{showDiff ? 'Hide' : 'Inspect'}</span>
                {showDiff ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>
            {showDiff && (
              <pre className="p-unit-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 font-code-sm text-code-sm text-on-surface-variant overflow-x-auto max-h-40 leading-relaxed">
                <code>{payloadString}</code>
              </pre>
            )}
          </div>
        )}

        {/* Collapsible Feedback / Instruction Box */}
        {showInstructions && (
          <div className="flex flex-col gap-unit-2 p-unit-3 rounded-2xl bg-surface-container-low/80 border border-outline-variant/30 animate-in fade-in duration-150">
            <label htmlFor="permission-instructions" className="font-code-sm text-code-sm text-outline uppercase tracking-wider">
              Revised Instructions for Agent:
            </label>
            <textarea
              id="permission-instructions"
              value={instructionsText}
              autoFocus
              onChange={(e) => setInstructionsText(e.target.value)}
              placeholder="Specify revised compiler flags, target file destination, or alternate instructions..."
              rows={3}
              className="w-full rounded-xl bg-surface-container-lowest border border-outline-variant/25 p-unit-3 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex justify-end gap-unit-2 mt-1">
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="h-8 px-unit-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-label-caps transition-colors cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={submitting || !instructionsText.trim()}
                onClick={() => handleAction('feedback')}
                className="h-8 px-unit-3 rounded-lg bg-primary-container text-on-primary-container font-label-caps text-label-caps font-semibold transition-colors hover:brightness-105 cursor-pointer disabled:opacity-50"
              >
                Submit Instructions (⌘⏎)
              </button>
            </div>
          </div>
        )}

        {/* §3.6.6 4 Standardized Action Buttons */}
        <div className="flex flex-col gap-unit-2 pt-micro-1">
          {/* Button 1: Primary Key CTA (with teal field glow) */}
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleAction('approve')}
            className="h-11 w-full rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center justify-center gap-unit-2 shadow-[0_0_24px_rgba(89,216,201,0.25)] hover:shadow-[0_0_32px_rgba(89,216,201,0.4)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-on-primary" />
            ) : (
              <Check className="w-4 h-4 stroke-[2.5]" />
            )}
            <span>Approve &amp; Execute</span>
            <span className="font-code-sm text-code-sm bg-on-primary/15 px-1.5 py-0.5 rounded text-on-primary font-normal">
              ↵ Enter
            </span>
          </button>

          {/* Button 2: Secondary Scoped Auto-Approve */}
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleAction('always_approve')}
            className="h-11 w-full rounded-xl bg-surface-container-high/60 hover:bg-surface-container-high border border-outline-variant/25 text-on-surface font-label-caps text-label-caps flex items-center justify-center gap-unit-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <span>Always Auto-Approve for {scope}</span>
          </button>

          {/* Split Row for Deny & Write Instructions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-unit-2">
            {/* Button 3: Ghost Danger Deny */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleAction('deny')}
              className="h-11 px-unit-4 rounded-xl bg-surface-container-low/40 hover:bg-error-container/20 border border-outline-variant/20 hover:border-error/40 text-on-surface hover:text-error font-label-caps text-label-caps flex items-center justify-center gap-unit-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
              <span>Deny Action</span>
              <span className="font-code-sm text-code-sm opacity-60">Esc</span>
            </button>

            {/* Button 4: Write Instructions Toggle */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowInstructions((prev) => !prev)}
              className="h-11 px-unit-4 rounded-xl bg-surface-container-low/40 hover:bg-surface-container-high border border-outline-variant/20 text-on-surface font-label-caps text-label-caps flex items-center justify-center gap-unit-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4 text-primary" />
              <span>{showInstructions ? 'Hide Instructions' : 'Write Instructions'}</span>
            </button>
          </div>
        </div>

        {/* Honest Cooldown Notice */}
        <p className="font-code-sm text-[11px] text-outline text-center mt-micro-1">
          Decisions are logged to the audit ledger. You can revoke auto-approvals in Settings anytime.
        </p>
      </div>
    </div>
  );
}
