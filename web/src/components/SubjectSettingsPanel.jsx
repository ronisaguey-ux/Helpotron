import React, { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  RotateCcw,
  Check,
  Plus,
  Trash2,
  FileText,
  ShieldAlert,
  Sparkles,
  Award,
  Zap,
} from 'lucide-react';
import { loadSettings, saveSettings } from '../lib/settings.js';

const PERSONALITY_OPTIONS = [
  { id: 'global', label: 'Default (Global Preference)' },
  { id: 'the_scholar', label: 'The Scholar (Rigorous Proofs & Citations)' },
  { id: 'the_editor', label: 'The Editor (Structural Polish & Flow)' },
  { id: 'the_coach', label: 'The Coach (Step-by-Step Socratic Guidance)' },
];

const EFFORT_LEVELS = [
  { id: 'low', label: 'Low', tokens: '~400 tokens/run' },
  { id: 'low_mid', label: 'Low-Mid', tokens: '~800 tokens/run' },
  { id: 'balanced', label: 'Balanced', tokens: '~1,100 tokens/run' },
  { id: 'high_mid', label: 'High-Mid', tokens: '~1,420 tokens/run' },
  { id: 'high', label: 'High', tokens: '~2,200 tokens/run' },
];

const GLOBAL_DEFAULTS = {
  educational_mode: true,
  personality: 'the_scholar',
  human_score_min: 85,
  effort: 'balanced',
  writing_samples: ['Lab_Report_Format_v3.pdf', 'Syllabus_Conventions.md'],
  rules: ['Enforce standard citation format for all course references'],
};

/**
 * SubjectSettingsPanel Component — Stitch Screen 3.4.2 Specification
 * 
 * Level 1 disclosure inline configuration for a subject module.
 * Features 6 three-state config widgets (§4.3):
 *  1. Educational Mode (segmented)
 *  2. Agent Personality (select)
 *  3. Minimum Human Score (stepper + slider 50-100)
 *  4. Model Effort Dial (5-level segmented)
 *  5. Writing Style Examples (list editor)
 *  6. Subject-Specific Rules (list editor)
 */
export default function SubjectSettingsPanel({
  subject,
  isOpen = false,
  onClose,
  onSettingsChanged,
}) {
  const [configs, setConfigs] = useState(null);
  const [overrides, setOverrides] = useState(new Set());
  const [newSampleInput, setNewSampleInput] = useState('');
  const [showAddSample, setShowAddSample] = useState(false);
  const [newRuleInput, setNewRuleInput] = useState('');
  const [showAddRule, setShowAddRule] = useState(false);

  const subjectId = subject?.id || 'subj_default';

  // Load subject configs from localStorage
  useEffect(() => {
    if (!isOpen) return;
    const settings = loadSettings();
    const stored = settings.subject_configs?.[subjectId] || {};

    const resolved = {
      educational_mode: stored.educational_mode !== undefined ? stored.educational_mode : GLOBAL_DEFAULTS.educational_mode,
      personality: stored.personality !== undefined ? stored.personality : GLOBAL_DEFAULTS.personality,
      human_score_min: stored.human_score_min !== undefined ? stored.human_score_min : GLOBAL_DEFAULTS.human_score_min,
      effort: stored.effort !== undefined ? stored.effort : GLOBAL_DEFAULTS.effort,
      writing_samples: stored.writing_samples !== undefined ? [...stored.writing_samples] : [...GLOBAL_DEFAULTS.writing_samples],
      rules: stored.rules !== undefined ? [...stored.rules] : [...GLOBAL_DEFAULTS.rules],
    };

    const activeOverrides = new Set();
    Object.keys(stored).forEach((k) => {
      if (stored[k] !== undefined) activeOverrides.add(k);
    });

    setConfigs(resolved);
    setOverrides(activeOverrides);
  }, [isOpen, subjectId]);

  if (!isOpen || !configs) return null;

  const overrideCount = overrides.size;

  const persistConfigs = (updatedConfigs, updatedOverrides) => {
    setConfigs(updatedConfigs);
    setOverrides(updatedOverrides);

    const settings = loadSettings();
    if (!settings.subject_configs) settings.subject_configs = {};

    if (updatedOverrides.size === 0) {
      delete settings.subject_configs[subjectId];
    } else {
      const storedForSubject = {};
      updatedOverrides.forEach((key) => {
        storedForSubject[key] = updatedConfigs[key];
      });
      settings.subject_configs[subjectId] = storedForSubject;
    }

    saveSettings(settings);
    if (onSettingsChanged) onSettingsChanged(subjectId, updatedOverrides.size);
  };

  const setFieldOverride = (field, val) => {
    const nextConfigs = { ...configs, [field]: val };
    const nextOverrides = new Set(overrides);
    nextOverrides.add(field);
    persistConfigs(nextConfigs, nextOverrides);
  };

  const resetField = (field) => {
    const nextConfigs = { ...configs, [field]: GLOBAL_DEFAULTS[field] };
    const nextOverrides = new Set(overrides);
    nextOverrides.delete(field);
    persistConfigs(nextConfigs, nextOverrides);
  };

  const handleResetAllToGlobal = () => {
    const nextOverrides = new Set();
    persistConfigs({ ...GLOBAL_DEFAULTS }, nextOverrides);
  };

  const handleAddSample = (e) => {
    e?.preventDefault();
    const s = newSampleInput.trim();
    if (!s) return;
    const nextSamples = [...configs.writing_samples, s];
    setFieldOverride('writing_samples', nextSamples);
    setNewSampleInput('');
    setShowAddSample(false);
  };

  const handleDeleteSample = (idx) => {
    const nextSamples = configs.writing_samples.filter((_, i) => i !== idx);
    setFieldOverride('writing_samples', nextSamples);
  };

  const handleAddRule = (e) => {
    e?.preventDefault();
    const r = newRuleInput.trim();
    if (!r) return;
    const nextRules = [...configs.rules, r];
    setFieldOverride('rules', nextRules);
    setNewRuleInput('');
    setShowAddRule(false);
  };

  const handleDeleteRule = (idx) => {
    const nextRules = configs.rules.filter((_, i) => i !== idx);
    setFieldOverride('rules', nextRules);
  };

  return (
    <div className="w-full relative mb-6 animate-fadeIn">
      <div className="relative rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xl overflow-hidden backdrop-blur-xl">
        {/* Specular Hairline Accent Bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/40 via-sem-amber/50 to-primary/20" />

        {/* Header Bar (§4.3 Disclosure Top Bar) */}
        <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/70 border-b border-outline-variant/20">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
              <SlidersHorizontal className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-label-caps text-label-caps text-on-surface font-semibold tracking-wider">
                  SUBJECT SETTINGS — {String(subject?.title || 'GENERAL').toUpperCase()}
                </span>
                {overrideCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sem-amber/15 text-sem-amber font-chip-status text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-sem-amber animate-ping" />
                    {overrideCount} {overrideCount === 1 ? 'OVERRIDE ACTIVE' : 'OVERRIDES ACTIVE'} VS GLOBAL
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-chip-status text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-outline" />
                    USING GLOBAL DEFAULTS
                  </span>
                )}
              </div>
              <span className="font-code-sm text-xs text-on-surface-variant">
                LEVEL 1 DISCLOSURE · SCOPED AUTONOMOUS TUNING
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              type="button"
              onClick={handleResetAllToGlobal}
              disabled={overrideCount === 0}
              className="h-11 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-40 disabled:cursor-not-allowed text-on-surface font-label-caps text-label-caps transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Reset all subject settings to global defaults"
            >
              <RotateCcw className="w-4 h-4 text-on-surface-variant" />
              <span>Reset to Global</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-6 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps tracking-wider transition-all shadow-[0_0_24px_rgba(89,216,201,0.25)] hover:bg-primary-container flex items-center gap-2 cursor-pointer uppercase active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[2]" />
              <span>Done</span>
            </button>
          </div>
        </div>

        {/* 6-Widget 2-Column Grid Kit (Strict M3 Token Styling, >=44px Controls) */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* WIDGET 1: Educational Mode */}
          <div className="p-5 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface font-semibold tracking-wider">
                  01 // EDUCATIONAL MODE
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Applies recursive heuristic reasoning chains to match genuine student derivation flow.
                </span>
              </div>
              {overrides.has('educational_mode') ? (
                <button
                  type="button"
                  onClick={() => resetField('educational_mode')}
                  className="inline-flex items-center gap-1 font-chip-status text-[10px] text-sem-amber bg-sem-amber/15 hover:bg-sem-amber/25 px-2 py-0.5 rounded-lg whitespace-nowrap cursor-pointer transition-colors"
                  title="Click to reset to global"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sem-amber" />
                  <span>OVERRIDE ✕</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 font-chip-status text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-lg whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-outline" />
                  <span>DEFAULT (INHERITED)</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/20">
              <button
                type="button"
                onClick={() => setFieldOverride('educational_mode', true)}
                className={`h-11 rounded-lg font-label-caps text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  configs.educational_mode
                    ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>ON (Fully Humanized)</span>
              </button>
              <button
                type="button"
                onClick={() => setFieldOverride('educational_mode', false)}
                className={`h-11 rounded-lg font-label-caps text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !configs.educational_mode
                    ? 'bg-surface-container-high text-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>OFF (Raw Output)</span>
              </button>
            </div>
          </div>

          {/* WIDGET 2: Agent Personality */}
          <div className="p-5 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface font-semibold tracking-wider">
                  02 // AGENT PERSONALITY
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Governs rhetorical structure, voice register, proof depth, and citation topology.
                </span>
              </div>
              {overrides.has('personality') ? (
                <button
                  type="button"
                  onClick={() => resetField('personality')}
                  className="inline-flex items-center gap-1 font-chip-status text-[10px] text-sem-amber bg-sem-amber/15 hover:bg-sem-amber/25 px-2 py-0.5 rounded-lg whitespace-nowrap cursor-pointer transition-colors"
                  title="Click to reset to global"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sem-amber" />
                  <span>OVERRIDE ✕</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 font-chip-status text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-lg whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-outline" />
                  <span>DEFAULT (INHERITED)</span>
                </span>
              )}
            </div>

            <div className="relative w-full">
              <select
                value={configs.personality}
                onChange={(e) => {
                  if (e.target.value === 'global') {
                    resetField('personality');
                  } else {
                    setFieldOverride('personality', e.target.value);
                  }
                }}
                className="w-full h-11 px-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface font-body-sm text-body-sm focus:border-primary focus:outline-none cursor-pointer"
              >
                {PERSONALITY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-surface-container-lowest text-on-surface">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* WIDGET 3: Minimum Human Score */}
          <div className="p-5 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface font-semibold tracking-wider">
                  03 // MINIMUM HUMAN SCORE
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Outputs scoring below {configs.human_score_min}% undergo automated iterative humanization.
                </span>
              </div>
              {overrides.has('human_score_min') ? (
                <button
                  type="button"
                  onClick={() => resetField('human_score_min')}
                  className="inline-flex items-center gap-1 font-chip-status text-[10px] text-sem-amber bg-sem-amber/15 hover:bg-sem-amber/25 px-2 py-0.5 rounded-lg whitespace-nowrap cursor-pointer transition-colors"
                  title="Click to reset to global"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sem-amber" />
                  <span>OVERRIDE ✕</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 font-chip-status text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-lg whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-outline" />
                  <span>DEFAULT (INHERITED)</span>
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-tabular-stat text-2xl font-bold text-primary">
                    {configs.human_score_min}%
                  </span>
                  <span className="font-code-sm text-xs text-on-surface-variant">STEALTH INDEX</span>
                </div>
                <div className="flex items-center gap-1 bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setFieldOverride('human_score_min', Math.max(50, configs.human_score_min - 5))}
                    className="w-9 h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface flex items-center justify-center text-lg font-bold transition-all cursor-pointer"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={() => setFieldOverride('human_score_min', Math.min(100, configs.human_score_min + 5))}
                    className="w-9 h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface flex items-center justify-center text-lg font-bold transition-all cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Slider Track */}
              <div className="relative w-full py-1">
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={configs.human_score_min}
                  onChange={(e) => setFieldOverride('human_score_min', Number(e.target.value))}
                  className="w-full accent-primary h-2 bg-surface-container-highest rounded-lg cursor-pointer"
                />
                <div className="flex justify-between font-code-sm text-xs text-on-surface-variant mt-1">
                  <span>50% (Baseline)</span>
                  <span className="text-on-surface font-medium">Target: {configs.human_score_min}%</span>
                  <span>100% (Strict)</span>
                </div>
              </div>
            </div>
          </div>

          {/* WIDGET 4: Model Effort Dial */}
          <div className="p-5 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface font-semibold tracking-wider">
                  04 // MODEL EFFORT DIAL
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Determines inference depth, multi-step tree-of-thought verification, and node cost.
                </span>
              </div>
              {overrides.has('effort') ? (
                <button
                  type="button"
                  onClick={() => resetField('effort')}
                  className="inline-flex items-center gap-1 font-chip-status text-[10px] text-sem-amber bg-sem-amber/15 hover:bg-sem-amber/25 px-2 py-0.5 rounded-lg whitespace-nowrap cursor-pointer transition-colors"
                  title="Click to reset to global"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sem-amber" />
                  <span>OVERRIDE ✕</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 font-chip-status text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-lg whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-outline" />
                  <span>DEFAULT (INHERITED)</span>
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-code-sm text-xs text-primary font-medium uppercase">
                  {EFFORT_LEVELS.find((l) => l.id === configs.effort)?.label || 'Balanced'}
                </span>
                <span className="font-code-sm text-xs text-on-surface-variant">
                  {EFFORT_LEVELS.find((l) => l.id === configs.effort)?.tokens || ''}
                </span>
              </div>

              {/* 5-Level Segmented Slider */}
              <div className="grid grid-cols-5 gap-1 bg-surface-container-lowest p-1 rounded-xl border border-outline-variant/20">
                {EFFORT_LEVELS.map((lvl) => {
                  const isSelected = configs.effort === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setFieldOverride('effort', lvl.id)}
                      className={`h-11 rounded-lg font-code-sm text-xs flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-surface-container-high text-primary font-semibold shadow-sm border border-primary/30'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* WIDGET 5: Writing Style Examples */}
          <div className="p-5 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface font-semibold tracking-wider">
                  05 // WRITING STYLE EXAMPLES
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Calibrates phrasing syntax, passive/active voice ratios, and structural formatting.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSample(!showAddSample)}
                className="h-8 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-caps text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0 uppercase"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Sample</span>
              </button>
            </div>

            {showAddSample && (
              <div className="flex gap-2 animate-fadeIn">
                <input
                  type="text"
                  placeholder="e.g. Research_Paper_Excerpt.pdf or sample link..."
                  value={newSampleInput}
                  onChange={(e) => setNewSampleInput(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddSample}
                  className="h-10 px-4 rounded-xl bg-primary text-on-primary text-xs font-label-caps uppercase tracking-wider cursor-pointer"
                >
                  Add
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {configs.writing_samples.length === 0 ? (
                <div className="p-3 bg-surface-container-lowest rounded-xl text-center text-xs text-on-surface-variant font-code-sm">
                  No sample styles configured for this subject.
                </div>
              ) : (
                configs.writing_samples.map((sample, idx) => (
                  <div
                    key={idx}
                    className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex items-center justify-between group hover:bg-surface-container-low transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-code-sm text-xs text-on-surface truncate">
                        {sample}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSample(idx)}
                      className="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                      title="Delete sample"
                    >
                      <Trash2 className="w-4 h-4 stroke-[1.75]" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* WIDGET 6: Subject-Specific Rules */}
          <div className="p-5 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface font-semibold tracking-wider">
                  06 // SUBJECT-SPECIFIC RULES
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Hard operational constraints strictly enforced on every generation phase.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddRule(!showAddRule)}
                className="h-8 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-caps text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0 uppercase"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Rule</span>
              </button>
            </div>

            {showAddRule && (
              <div className="flex gap-2 animate-fadeIn">
                <input
                  type="text"
                  placeholder="e.g. Enforce IEEE citations or require Python 3.12 syntax..."
                  value={newRuleInput}
                  onChange={(e) => setNewRuleInput(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddRule}
                  className="h-10 px-4 rounded-xl bg-primary text-on-primary text-xs font-label-caps uppercase tracking-wider cursor-pointer"
                >
                  Add
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {configs.rules.length === 0 ? (
                <div className="p-3 bg-surface-container-lowest rounded-xl text-center text-xs text-on-surface-variant font-code-sm">
                  No explicit rules set for this subject.
                </div>
              ) : (
                configs.rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="h-11 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex items-center justify-between group hover:bg-surface-container-low transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ShieldAlert className="w-4 h-4 text-sem-amber shrink-0" />
                      <span className="font-body-sm text-xs text-on-surface truncate">
                        {rule}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(idx)}
                      className="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                      title="Delete rule"
                    >
                      <Trash2 className="w-4 h-4 stroke-[1.75]" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
