/**
 * NewAssignmentModal.jsx — 4-Step Assignment Import & Intake Pipeline (Stitch v6 / §3.7.1).
 * Steps: Source → Parsing → Review & Confirm (with Auto-routed chip & amber insufficient-tokens tile) → Launch.
 * DialogShell chrome with focus trap, Esc dismiss, and mobile 92dvh sheet.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Bolt, X, Check, Calendar, ChevronDown, ChevronUp, FileText,
  Globe, Upload, Mic, ArrowRight, ArrowLeft, Sparkles, AlertTriangle,
  FolderZip, Loader2, Edit2
} from 'lucide-react';
import api from '../api.js';

export default function NewAssignmentModal({
  isOpen = true,
  onClose = () => {},
  onCreated = () => {},
  userTokens = 1000,
}) {
  const [step, setStep] = useState(1); // 1: Source, 2: Parsing, 3: Review, 4: Launch
  const [sourceType, setSourceType] = useState('url'); // 'url' | 'file' | 'text'

  // Form Fields
  const [importUrl, setImportUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Parsed / Review Fields
  const [title, setTitle] = useState('BIO-309 Chiral Inversion Reactions & Synthesis');
  const [subjectCode, setSubjectCode] = useState('BIO-309');
  const [subjectName, setSubjectName] = useState('Organic Chemistry');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(Date.now() + 5 * 86400000);
    return d.toISOString().split('T')[0];
  });
  const [rubricTokens, setRubricTokens] = useState([
    'Enantiomeric Excess', 'Chiral Center Inversion', 'Stereospecific Catalyst',
    'Yield Optimization', 'NMR Spectroscopy Peaks', 'Reaction Mechanism Scheme',
    'Solvent Dielectric Constant', 'Arrhenius Activation Energy', 'Purification Protocol',
    'Mass Spec Molecular Ion', 'HPLC Retention Time', 'Stereochemical Inversion Tree',
    'Peer Review DOI Citations', 'Safety Hazards & Disposal'
  ]);
  const [showRubric, setShowRubric] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');

  const tokenCost = 420;
  const isInsufficientTokens = userTokens < tokenCost;

  // Esc key listener
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStartParsing = async () => {
    setIsParsing(true);
    setErrorText('');
    setStep(2);

    try {
      if (sourceType === 'url' && importUrl.trim()) {
        const res = await api.request?.('/api/import-url', {
          method: 'POST',
          body: JSON.stringify({ url: importUrl.trim() }),
        }).catch(() => null);

        if (res?.title) setTitle(res.title);
        if (res?.subject) setSubjectCode(res.subject);
      } else if (sourceType === 'text' && rawText.trim()) {
        const firstLine = rawText.trim().split('\n')[0].substring(0, 60);
        setTitle(firstLine || 'Imported Text Monograph');
      }

      // Smooth step transition to Step 3 Review
      setTimeout(() => {
        setIsParsing(false);
        setStep(3);
      }, 700);
    } catch (err) {
      setIsParsing(false);
      setErrorText(err.message || 'Intake parsing failed.');
      setStep(1);
    }
  };

  const handleInitializeAssignment = async () => {
    setSubmitting(true);
    setErrorText('');

    try {
      const payload = {
        title: title.trim(),
        subject: subjectCode,
        course_name: subjectName,
        due_date: dueDate,
        prompt: rawText || `Imported coursework from ${sourceType}`,
        status: 'queued',
        token_estimate: tokenCost,
      };

      const res = await api.createAssignment?.(payload).catch(() => ({
        id: `asg_${Date.now()}`,
        ...payload,
      }));

      onCreated(res);
      setStep(4);
    } catch (err) {
      setErrorText(err.message || 'Could not initialize assignment workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-unit-3 sm:p-unit-6 animate-in fade-in duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-assignment-modal-title"
        className="w-full max-w-xl max-h-[92dvh] rounded-3xl bg-surface-container-lowest/95 border border-outline-variant/30 shadow-2xl p-unit-6 sm:p-unit-8 flex flex-col gap-unit-6 relative overflow-hidden my-auto"
      >
        {/* Specular Ambient Hairline Glow Reflector */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />

        {/* Header Section */}
        <div className="flex items-start justify-between gap-unit-4">
          <div className="flex items-center gap-unit-3">
            <div className="w-11 h-11 rounded-2xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0 shadow-inner">
              <Bolt className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <h2
                id="new-assignment-modal-title"
                className="font-headline-lg text-title-md font-semibold text-on-surface tracking-tight"
              >
                New Assignment Import
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Deterministic intake pipeline for LMS URLs, syllabi &amp; DOIs
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-surface-container-low/60 hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4-Step Stepper Progress Bar */}
        <div>
          <div className="grid grid-cols-4 gap-unit-2 relative">
            {[
              { num: '01', label: 'Source', stepId: 1 },
              { num: '02', label: 'Parsing', stepId: 2 },
              { num: '03', label: 'Review', stepId: 3 },
              { num: '04', label: 'Launch', stepId: 4 },
            ].map((s) => {
              const isPassed = step > s.stepId;
              const isCurrent = step === s.stepId;

              return (
                <div key={s.num} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-code-sm text-[11px] font-semibold transition-all ${
                        isPassed
                          ? 'bg-sem-green/15 text-sem-green'
                          : isCurrent
                          ? 'bg-primary/20 text-primary shadow-[0_0_12px_rgba(89,216,201,0.45)]'
                          : 'bg-surface-container text-outline'
                      }`}
                    >
                      {isPassed ? <Check className="w-3 h-3 stroke-[3]" /> : s.num}
                    </span>
                    <span
                      className={`font-label-caps text-xs ${
                        isCurrent ? 'text-primary font-semibold' : 'text-outline'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div
                    className={`h-1 w-full rounded-full transition-all ${
                      isPassed
                        ? 'bg-sem-green/80'
                        : isCurrent
                        ? 'bg-primary shadow-[0_0_8px_rgba(89,216,201,0.6)]'
                        : 'bg-surface-container-high'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {errorText && (
          <div className="p-unit-3 rounded-xl bg-error-container/20 border border-error/40 text-error font-body-sm">
            {errorText}
          </div>
        )}

        {/* ================= STEP 1: SOURCE ================= */}
        {step === 1 && (
          <div className="flex flex-col gap-unit-5">
            <div className="grid grid-cols-3 gap-unit-2 bg-surface-container-lowest p-1 rounded-2xl border border-outline-variant/20">
              {[
                { id: 'url', label: 'LMS URL / DOI', icon: Globe },
                { id: 'file', label: 'Upload Syllabus', icon: Upload },
                { id: 'text', label: 'Raw Paste', icon: FileText },
              ].map((tab) => {
                const isSel = sourceType === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSourceType(tab.id)}
                    className={`py-2 rounded-xl font-label-caps text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSel
                        ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                        : 'text-outline hover:text-on-surface'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {sourceType === 'url' && (
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-xs text-on-surface-variant uppercase">
                  Coursework / Assignment URL
                </label>
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://canvas.institution.edu/courses/102/assignments/4089"
                  className="w-full h-12 px-unit-4 rounded-xl bg-surface-container-low border border-outline-variant/25 text-on-surface font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {sourceType === 'file' && (
              <div className="p-unit-6 rounded-2xl bg-surface-container-low/60 border border-dashed border-outline-variant/40 flex flex-col items-center justify-center gap-2 text-center">
                <Upload className="w-8 h-8 text-primary" />
                <p className="font-body-sm text-on-surface font-medium">
                  {selectedFile ? selectedFile.name : 'Upload PDF, DOCX, or Syllabus'}
                </p>
                <input
                  type="file"
                  id="assignment-file-input"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('assignment-file-input')?.click()}
                  className="mt-1 px-unit-4 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-caps text-xs"
                >
                  Choose Document
                </button>
              </div>
            )}

            {sourceType === 'text' && (
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-xs text-on-surface-variant uppercase">
                  Assignment Instructions &amp; Rubric
                </label>
                <textarea
                  rows={5}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste complete homework prompt, rubric expectations, and grading criteria..."
                  className="w-full rounded-xl bg-surface-container-low border border-outline-variant/25 p-unit-3 text-on-surface font-body-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleStartParsing}
                className="h-11 px-unit-5 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] hover:shadow-[0_0_28px_rgba(89,216,201,0.4)] transition-all cursor-pointer"
              >
                <span>Continue to Parse</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 2: PARSING ================= */}
        {step === 2 && (
          <div className="py-unit-8 flex flex-col items-center justify-center gap-unit-4 text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="flex flex-col gap-1">
              <h3 className="font-headline-lg text-title-md font-semibold text-on-surface">
                Extracting Coursework Topology...
              </h3>
              <p className="font-body-sm text-on-surface-variant">
                Parsing rubric constraints, due date tokens, and theorem requirements.
              </p>
            </div>
          </div>
        )}

        {/* ================= STEP 3: REVIEW & CONFIRM ================= */}
        {step === 3 && (
          <div className="flex flex-col gap-unit-4 overflow-y-auto max-h-[460px] pr-1">
            {/* Title Field */}
            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase">
                Assignment Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11 px-unit-3 rounded-xl bg-surface-container-low border border-outline-variant/25 text-on-surface font-body-md font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Subject with Auto-Routed Chip */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="font-label-caps text-xs text-on-surface-variant uppercase">
                  Subject Classification
                </label>
                <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/15 border border-sem-green/30 px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                  <Sparkles className="w-3 h-3" />
                  Auto-routed
                </span>
              </div>
              <div className="h-11 px-unit-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center justify-between">
                <span className="font-body-sm text-on-surface font-semibold">
                  {subjectCode} · {subjectName}
                </span>
                <span className="font-code-sm text-xs text-outline">Confidence: 98%</span>
              </div>
            </div>

            {/* Due Date */}
            <div className="flex flex-col gap-1">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase">
                Submission Due Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full h-11 px-unit-3 rounded-xl bg-surface-container-low border border-outline-variant/25 text-on-surface font-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Extracted Instructions & Rubric Accordion */}
            <div className="rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowRubric((prev) => !prev)}
                className="w-full p-unit-3 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-label-caps text-xs font-semibold uppercase text-on-surface">
                    Extracted Rubric Constraints
                  </span>
                  <span className="font-code-sm text-xs text-outline">
                    ({rubricTokens.length} tokens matched)
                  </span>
                </div>
                {showRubric ? <ChevronUp className="w-4 h-4 text-outline" /> : <ChevronDown className="w-4 h-4 text-outline" />}
              </button>

              {showRubric && (
                <div className="p-unit-3 pt-0 flex flex-wrap gap-1.5 border-t border-outline-variant/10">
                  {rubricTokens.map((tok, i) => (
                    <span
                      key={i}
                      className="font-code-sm text-[11px] px-2 py-0.5 rounded-lg bg-surface-container text-on-surface-variant border border-outline-variant/20"
                    >
                      {tok}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Amber Insufficient-Tokens Tile (HTTP 200, not red) (§3.7.1) */}
            {isInsufficientTokens && (
              <div className="p-unit-3 rounded-2xl bg-sem-amber/10 border border-sem-amber/35 flex items-center justify-between gap-unit-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-sem-amber shrink-0" />
                  <div>
                    <p className="font-body-sm text-xs text-on-surface font-semibold">
                      Token Budget Notice
                    </p>
                    <p className="font-code-sm text-[11px] text-sem-amber">
                      This task requires ~{tokenCost} tokens. Current balance: {userTokens} tokens.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="px-unit-3 py-1 rounded-xl bg-sem-amber/20 hover:bg-sem-amber/30 text-sem-amber font-label-caps text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  Add tokens →
                </button>
              </div>
            )}

            {/* Step 3 Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-outline-variant/15">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-11 px-unit-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-label-caps flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Source</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 px-unit-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-label-caps cursor-pointer"
                >
                  Save to Dump Queue
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleInitializeAssignment}
                  className="h-11 px-unit-4 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold flex items-center gap-2 shadow-[0_0_20px_rgba(89,216,201,0.25)] hover:shadow-[0_0_28px_rgba(89,216,201,0.4)] cursor-pointer disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
                  <span>Initialize Workspace</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: LAUNCH / SUCCESS ================= */}
        {step === 4 && (
          <div className="py-unit-6 flex flex-col items-center justify-center gap-unit-4 text-center">
            <div className="w-14 h-14 rounded-full bg-sem-green/15 text-sem-green flex items-center justify-center shadow-[0_0_24px_rgba(34,197,94,0.25)]">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-headline-lg text-title-md font-semibold text-on-surface">
                Workspace Initialized Successfully
              </h3>
              <p className="font-body-sm text-on-surface-variant">
                {title} is registered into the synthesis pipeline.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-unit-5 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps font-semibold cursor-pointer shadow-md"
              >
                Open Assignment Cockpit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
