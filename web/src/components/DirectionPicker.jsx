import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  HelpCircle,
  Layers,
  FileText,
  Compass,
  Check,
  Send,
  Database,
  ArrowRight,
} from 'lucide-react';

export const CANONICAL_DIRECTIONS = [
  {
    value: 'do_it_for_me',
    label: 'Do it for me',
    tag: 'Autonomous',
    description: 'Full autonomous pipeline execution: research, synthesis, proof checking, and cadence humanization.',
    icon: Sparkles,
  },
  {
    value: 'study_guide',
    label: 'Study guide',
    tag: 'Review',
    description: 'Structured conceptual breakdown, essential definitions, and step-by-step problem walkthroughs.',
    icon: BookOpen,
  },
  {
    value: 'quiz',
    label: 'Quiz',
    tag: 'Assessment',
    description: 'Active recall test suite with answer explanations and difficulty calibration.',
    icon: HelpCircle,
  },
  {
    value: 'flashcards',
    label: 'Flashcards',
    tag: 'Spaced Repetition',
    description: 'Spaced repetition deck optimized for key definitions, formulas, and historical dates.',
    icon: Layers,
  },
  {
    value: 'summary',
    label: 'Summary',
    tag: 'Abstract',
    description: 'High-density executive abstract summarizing central theses, methods, and results.',
    icon: FileText,
  },
  {
    value: 'custom',
    label: 'Something else',
    tag: 'Bespoke',
    description: 'Define custom prompt directives or specialized derivation structures.',
    icon: Compass,
    isCustom: true,
  },
];

/**
 * DirectionPicker Component — Stitch Screen 3.5.2 Specification
 *
 * 6-tile responsive matrix (2-col desktop/tablet, horizontal scroller at <=sm).
 * Role="radiogroup" with accessible keyboard navigation and aria-checked states.
 * Features inline custom textarea with honest Data Lake copy.
 */
export default function DirectionPicker({
  selectedDirection = null,
  onSelectDirection,
  disabled = false,
  loading = false,
}) {
  const [customText, setCustomText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleTileClick = (dir) => {
    if (disabled || loading) return;
    if (dir.value === 'custom') {
      setShowCustomInput(true);
      if (selectedDirection !== 'custom') {
        onSelectDirection('custom', customText);
      }
    } else {
      setShowCustomInput(false);
      onSelectDirection(dir.value, null);
    }
  };

  const handleCustomSubmit = (e) => {
    e?.preventDefault();
    if (!customText.trim()) return;
    onSelectDirection('custom', customText.trim());
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Header Info */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_12px_rgba(89,216,201,0.7)]" />
          <span className="font-label-caps text-xs text-primary uppercase tracking-widest font-semibold">
            Execution Path
          </span>
        </div>
        <h3 className="font-title-md text-title-md text-on-surface font-semibold tracking-tight">
          Select Autonomous Research Vector
        </h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Pick an execution template or configure custom instructions for continuous agentic pipeline execution.
        </p>
      </div>

      {/* 2x3 Responsive Matrix (Horizontal scroller on mobile <=sm) */}
      <div
        role="radiogroup"
        aria-label="Autonomous Research Vectors"
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-x-auto pb-1"
      >
        {CANONICAL_DIRECTIONS.map((dir) => {
          const isSelected = selectedDirection === dir.value;
          const Icon = dir.icon;
          const isCustom = dir.isCustom;

          return (
            <div
              key={dir.value}
              role="radio"
              aria-checked={isSelected}
              tabIndex={disabled ? -1 : 0}
              onClick={() => handleTileClick(dir)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTileClick(dir);
                }
              }}
              className={`cursor-pointer group relative p-5 rounded-2xl transition-all duration-150 flex flex-col justify-between min-h-[160px] select-none outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isCustom && !isSelected
                  ? 'bg-surface-container-lowest/50 border border-dashed border-outline-variant/50 hover:border-primary/50'
                  : isSelected
                  ? 'bg-primary/10 border-2 border-primary shadow-[0_0_24px_rgba(89,216,201,0.18)]'
                  : 'bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 hover:border-outline-variant/60 hover:bg-surface-container-low'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]'}`}
            >
              {/* Top Row: Icon + Selection check */}
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-high text-on-surface-variant group-hover:text-primary group-hover:bg-primary/10'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[1.75]" />
                </div>

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                    isSelected
                      ? 'bg-primary border-primary text-on-primary shadow-sm'
                      : 'border-outline-variant/40 bg-surface-container-lowest group-hover:border-outline-variant'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                </div>
              </div>

              {/* Title & Description */}
              <div className="flex flex-col gap-1 mt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-title-md text-base text-on-surface font-semibold group-hover:text-primary transition-colors">
                    {dir.label}
                  </span>
                  <span className="font-chip-status text-[10px] uppercase px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                    {dir.tag}
                  </span>
                </div>
                <p className="font-body-sm text-xs text-on-surface-variant line-clamp-2">
                  {dir.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Textarea Expansion with Honest Data Lake Copy */}
      {(showCustomInput || selectedDirection === 'custom') && (
        <form
          onSubmit={handleCustomSubmit}
          className="p-5 rounded-2xl bg-surface-container-low/60 border border-outline-variant/30 flex flex-col gap-3 animate-fadeIn"
        >
          <div className="flex items-center justify-between">
            <label
              htmlFor="custom-direction-input"
              className="font-label-caps text-xs text-on-surface font-semibold uppercase tracking-wider flex items-center gap-2"
            >
              <Compass className="w-4 h-4 text-primary" />
              <span>Specify Custom Autonomous Trajectory</span>
            </label>
            <span className="font-code-sm text-xs text-primary flex items-center gap-1">
              <Database className="w-3.5 h-3.5" />
              <span>Data Lake Sync</span>
            </span>
          </div>

          <textarea
            id="custom-direction-input"
            rows={3}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="e.g. Provide a 3-part proof by contradiction with formal lemmas and verify against LaTeX..."
            className="w-full p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-sm text-xs focus:border-primary focus:outline-none resize-none shadow-inner"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="font-code-sm text-xs text-on-surface-variant">
              💡 Your request is automatically sent to the Data Lake and we&apos;ll build it.
            </p>
            <button
              type="submit"
              disabled={!customText.trim() || disabled}
              className="h-10 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider shadow-[0_0_16px_rgba(89,216,201,0.25)] hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer self-end sm:self-auto active:scale-95"
            >
              <span>Start</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
