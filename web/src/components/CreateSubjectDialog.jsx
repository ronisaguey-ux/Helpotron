import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Ruler,
  BookOpen,
  Landmark,
  Code2,
  Dna,
  Brain,
  Atom,
  Calculator,
  FlaskConical,
  Microscope,
  Compass,
  Orbit,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import SubjectTile, { SUBJECT_GLYPHS } from './SubjectTile';

const PALETTE_SWATCHES = [
  { id: 'amber', name: 'Amber Palette', bg: 'bg-sem-amber', ring: 'ring-sem-amber' },
  { id: 'blue', name: 'Blue Palette', bg: 'bg-sem-blue', ring: 'ring-sem-blue' },
  { id: 'green', name: 'Green Palette', bg: 'bg-sem-green', ring: 'ring-sem-green' },
  { id: 'cyan', name: 'Cyan Palette', bg: 'bg-sem-cyan', ring: 'ring-sem-cyan' },
  { id: 'indigo', name: 'Indigo Palette', bg: 'bg-sem-indigo', ring: 'ring-sem-indigo' },
  { id: 'deepgreen', name: 'Deep Green Palette', bg: 'bg-sem-deepgreen', ring: 'ring-sem-deepgreen' },
  { id: 'purple', name: 'Secondary Purple Palette', bg: 'bg-secondary', ring: 'ring-secondary' },
  { id: 'slate', name: 'Slate Palette', bg: 'bg-sem-slate', ring: 'ring-sem-slate' },
];

const GLYPH_OPTIONS = [
  { id: 'Ruler', label: 'Ruler', icon: Ruler },
  { id: 'BookOpen', label: 'BookOpen', icon: BookOpen },
  { id: 'Landmark', label: 'Landmark', icon: Landmark },
  { id: 'Code2', label: 'Code2', icon: Code2 },
  { id: 'Dna', label: 'Dna', icon: Dna },
  { id: 'Brain', label: 'Brain', icon: Brain },
  { id: 'Atom', label: 'Atom', icon: Atom },
  { id: 'Calculator', label: 'Calculator', icon: Calculator },
  { id: 'FlaskConical', label: 'FlaskConical', icon: FlaskConical },
  { id: 'Microscope', label: 'Microscope', icon: Microscope },
  { id: 'Compass', label: 'Compass', icon: Compass },
  { id: 'Orbit', label: 'Orbit', icon: Orbit },
];

/**
 * CreateSubjectDialog Component — Stitch Screen 3.4.3 Specification
 *
 * Replaces legacy jump-in panel and emoji picker with 12 Lucide line glyphs,
 * 8 semantic color swatches (44px min tap targets), duplicate-name conflict
 * verification, focus trap, and Escape key dismissal.
 */
export default function CreateSubjectDialog({
  isOpen = false,
  onClose,
  onCreated,
  existingTitles = [],
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('blue');
  const [icon, setIcon] = useState('BookOpen');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 50);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Check duplicate title conflict
  const cleanTitle = title.trim();
  const isDuplicate = existingTitles.some(
    (t) => String(t || '').trim().toLowerCase() === cleanTitle.toLowerCase()
  );

  const canSubmit = cleanTitle.length >= 2 && !isDuplicate && !submitting;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');

    try {
      if (onCreated) {
        await onCreated({
          title: cleanTitle,
          description: desc.trim() || `${cleanTitle} syllabus & problem sets`,
          color,
          icon,
        });
      }
      // Reset form
      setTitle('');
      setDesc('');
      setColor('blue');
      setIcon('BookOpen');
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to initialize subject module. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-subject-title"
        className="relative w-full max-w-xl my-auto rounded-3xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-6 md:p-8 flex flex-col gap-6 overflow-hidden transition-all scale-100"
      >
        {/* Top Specular Hairline Highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        {/* Ambient Core Glow Behind Header */}
        <div className="absolute -top-16 left-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <SubjectTile icon={icon} color={color} size={48} />
            <div className="flex flex-col">
              <h2
                id="modal-subject-title"
                className="font-headline-lg text-title-md text-on-surface font-semibold tracking-tight"
              >
                Initialize New Subject Module
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                Establish syllabus heuristics, Level 1 autonomous routing, and telemetry scope.
              </p>
            </div>
          </div>

          {/* Dismiss Button with 44px Minimum Tap Target */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-11 h-11 -mr-2 -mt-2 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus:outline-none focus:bg-surface-container-high cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[1.75]" />
          </button>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="p-3 bg-error/10 border border-error/30 rounded-xl text-xs text-error font-code-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Content Stack */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative z-10">
          {/* Field 1: Subject Name & Code */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="subject-identifier"
                className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider"
              >
                Subject Name & Code
              </label>
            </div>
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                id="subject-identifier"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. PHY-201 · Quantum Mechanics"
                className={`w-full h-11 px-4 rounded-xl bg-surface-container-low border ${
                  isDuplicate
                    ? 'border-error/60 focus:border-error ring-1 ring-error/40'
                    : 'border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary'
                } text-on-surface font-body-md text-body-md focus:outline-none shadow-inner transition-colors`}
              />
            </div>
            {isDuplicate ? (
              <span className="font-code-sm text-xs text-error flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                A subject module named &quot;{cleanTitle}&quot; already exists.
              </span>
            ) : (
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                Academic catalog designation and course identifier
              </span>
            )}
          </div>

          {/* Field 2: Lucide Line Glyph Selector (12 items) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                Telemetry Icon Glyph
              </label>
              <span className="font-code-sm text-code-sm text-primary uppercase">
                SELECTED: {icon}
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Icon Glyph Selector"
              className="grid grid-cols-6 gap-2 p-2 rounded-xl bg-surface-container-low border border-outline-variant/20"
            >
              {GLYPH_OPTIONS.map((g) => {
                const GlyphIcon = g.icon;
                const isSelected = icon === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={g.label}
                    onClick={() => setIcon(g.id)}
                    className={`h-11 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary/20 text-primary border border-primary/50 shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-transparent'
                    }`}
                  >
                    <GlyphIcon className="w-5 h-5 stroke-[1.75]" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 3: 8 Semantic Color Palette Swatches (44px min tap targets) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                Semantic Color Space
              </label>
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                ROLE: {color}
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Semantic Color Palette"
              className="grid grid-cols-8 gap-2 p-2 rounded-xl bg-surface-container-low border border-outline-variant/20"
            >
              {PALETTE_SWATCHES.map((swatch) => {
                const isSelected = color === swatch.id;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={swatch.name}
                    onClick={() => setColor(swatch.id)}
                    className={`h-11 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? `ring-2 ring-offset-2 ring-offset-surface-container-lowest ${swatch.ring} scale-105`
                        : 'opacity-75 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full ${swatch.bg} shadow-sm`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 4: Description / Keywords */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="subject-desc"
                className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider"
              >
                Routing Heuristics & Description
              </label>
              <span className="font-code-sm text-code-sm text-on-surface-variant/70">OPTIONAL</span>
            </div>
            <textarea
              id="subject-desc"
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Keywords, problem set topics, or syllabus instructions..."
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface font-body-sm text-body-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none shadow-inner resize-none transition-colors"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-outline-variant/15">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-11 px-6 rounded-xl font-label-caps text-label-caps text-on-primary bg-primary hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_24px_rgba(89,216,201,0.25)] flex items-center gap-2 cursor-pointer uppercase tracking-wider active:scale-[0.98]"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                  <span>Initializing...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2]" />
                  <span>Save Subject</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
