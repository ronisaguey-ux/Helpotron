import React, { useState } from 'react';
import {
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  FileText,
  Paperclip,
  Award,
  BookOpen,
  Check,
  RotateCcw,
  Sparkles,
  Shield,
  Layers,
} from 'lucide-react';

const CITATION_STYLES = ['APA 7th', 'MLA 9th', 'Chicago Author-Date', 'IEEE', 'ACS'];

const GATING_OPTIONS = [
  { id: 'submit_lms', label: 'Submit to LMS' },
  { id: 'send_messages', label: 'Send messages' },
  { id: 'big_spend', label: 'Big spend (>100 tokens)' },
  { id: 'flagship_model', label: 'Flagship model invocation' },
];

/**
 * AssignmentConfigPanel Component — Stitch Screens 3.5.6 & 3.5.7 Specification
 *
 * Level 2 Scoped Configuration Panel for an individual Assignment Node.
 * Displays:
 *  - Provenance Trail: Default → Subject → Assignment
 *  - Summary line with collapsed/expanded accordion
 *  - "Ask me before" action gating chips
 *  - Citation style selector & Effort dial
 *  - Prompt, Rubric, Attached Files, and Generated Materials cards
 */
export default function AssignmentConfigPanel({
  assignment,
  fullData = null,
  materials = [],
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const [citationStyle, setCitationStyle] = useState('APA 7th');
  const [activeGating, setActiveGating] = useState(
    new Set(['submit_lms', 'big_spend'])
  );

  const subjectTitle = assignment?.subject || 'Subject Module';
  const promptText = assignment?.prompt || fullData?.prompt || 'No explicit prompt instructions provided.';
  const rubricText = assignment?.rubric || fullData?.rubric || null;
  const attachedFiles = fullData?.attached_files || assignment?.attached_files || [];

  const toggleGating = (id) => {
    setActiveGating((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className={`rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 overflow-hidden shadow-sm transition-all ${className}`}
    >
      {/* Header Bar Accordion Trigger */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-surface-container-low/50 transition-colors select-none"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
            <SlidersHorizontal className="w-5 h-5 stroke-[1.75]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                Assignment Configuration & Context
              </h3>
              <span className="font-chip-status text-[10px] text-primary bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full uppercase">
                LEVEL 2 SCOPE
              </span>
            </div>
            {/* Summary Line */}
            <p className="font-code-sm text-xs text-on-surface-variant mt-0.5">
              Citation: {citationStyle} · Gated: {activeGating.size} rules · Inherits {subjectTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* Provenance Trail Chips */}
          <div className="hidden md:flex items-center gap-1 font-code-sm text-[11px] text-on-surface-variant bg-surface-container-high/60 px-3 py-1 rounded-xl">
            <span>Global</span>
            <span>→</span>
            <span className="text-on-surface font-medium truncate max-w-[120px]">{subjectTitle}</span>
            <span>→</span>
            <span className="text-primary font-semibold">Assignment</span>
          </div>

          <div className="p-2 rounded-xl text-on-surface-variant hover:text-on-surface bg-surface-container-high/40">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded Configuration & Context Sections */}
      {expanded && (
        <div className="px-6 pb-6 pt-2 border-t border-outline-variant/15 flex flex-col gap-6 animate-fadeIn">
          {/* 1. "ASK ME BEFORE" INTERACTION GATING CHIPS (§3.5.6) */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                Autonomous Safety Gating (&quot;Ask Me Before&quot;)
              </label>
              <span className="font-code-sm text-[11px] text-primary">
                {activeGating.size} ACTIVE GATES
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {GATING_OPTIONS.map((gate) => {
                const isChecked = activeGating.has(gate.id);
                return (
                  <button
                    key={gate.id}
                    type="button"
                    onClick={() => toggleGating(gate.id)}
                    className={`h-10 px-4 rounded-xl border font-label-caps text-xs flex items-center gap-2 transition-all cursor-pointer ${
                      isChecked
                        ? 'bg-sem-amber/15 border-sem-amber/40 text-sem-amber shadow-sm font-semibold'
                        : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <Shield className={`w-3.5 h-3.5 ${isChecked ? 'text-sem-amber' : 'text-outline'}`} />
                    <span>{gate.label}</span>
                    {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. CITATION TOPOLOGY PICKER */}
          <div className="flex flex-col gap-2">
            <label className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              Academic Citation Topology
            </label>
            <div className="flex flex-wrap gap-2">
              {CITATION_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setCitationStyle(style)}
                  className={`h-9 px-3 rounded-lg border font-code-sm text-xs transition-colors cursor-pointer ${
                    citationStyle === style
                      ? 'bg-primary/15 border-primary/40 text-primary font-semibold'
                      : 'bg-surface-container-lowest border-outline-variant/25 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* 3. PROMPT & RUBRIC CONTEXT CARDS (§3.5.7) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Prompt Card */}
            <div className="p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-xs text-primary uppercase font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Assignment Prompt</span>
                </span>
                <span className="font-code-sm text-[10px] text-on-surface-variant">SOURCE SPEC</span>
              </div>
              <p className="font-body-sm text-xs text-on-surface leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                {promptText}
              </p>
            </div>

            {/* Rubric Card */}
            <div className="p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-xs text-secondary uppercase font-semibold flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" />
                  <span>Evaluation Rubric</span>
                </span>
                <span className="font-code-sm text-[10px] text-on-surface-variant">CRITERIA</span>
              </div>
              {rubricText ? (
                <p className="font-body-sm text-xs text-on-surface leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                  {rubricText}
                </p>
              ) : (
                <p className="font-code-sm text-xs text-on-surface-variant italic my-auto py-2">
                  No rubric provided. Standard academic grading rubrics apply.
                </p>
              )}
            </div>
          </div>

          {/* 4. ATTACHED FILES & MATERIALS CARDS (§3.5.7) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Files Card */}
            <div className="p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-xs text-on-surface-variant uppercase font-semibold flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attached Source Files ({attachedFiles.length})</span>
                </span>
              </div>
              {attachedFiles.length === 0 ? (
                <p className="font-code-sm text-xs text-on-surface-variant italic py-1">
                  No files attached to this node.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {attachedFiles.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-container-lowest text-xs font-code-sm">
                      <span className="truncate">{typeof file === 'string' ? file : file.name || `File ${i + 1}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Materials Card */}
            <div className="p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-xs text-on-surface-variant uppercase font-semibold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Synthesized Artifacts ({materials.length})</span>
                </span>
              </div>
              {materials.length === 0 ? (
                <p className="font-code-sm text-xs text-on-surface-variant italic py-1">
                  No artifacts generated yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                  {materials.map((mat, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-container-lowest text-xs font-code-sm">
                      <span className="truncate">{mat.title || mat.kind || `Material #${i + 1}`}</span>
                      <span className="text-[10px] text-outline ml-2">{mat.kind || 'Doc'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-right pt-2 border-t border-outline-variant/15">
            <span className="font-code-sm text-xs text-on-surface-variant">
              Editing here overrides {subjectTitle} for this assignment only.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
