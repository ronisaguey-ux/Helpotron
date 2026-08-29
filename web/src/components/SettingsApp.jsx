// export target: web/src/components/SettingsApp.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * SettingsApp.jsx — the settings workspace (replaces the 126 KB modal).
 * Shell: two-pane layout (section list → section page), progressive
 * disclosure (Simple / Advanced / Expert), live persistence to the OS
 * settings store. Appearance ships with a live preview panel.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import { Check, ChevronDown, Palette, Bot, GraduationCap, PenLine, Zap, Bell, Shield, CreditCard, Puzzle, Keyboard, BarChart3, FlaskConical, Accessibility, Globe, Wrench, User, Trash2 } from 'lucide-react';
import { loadSettings, saveSettings, EFFORT_SCORES, DEFAULT_SETTINGS } from '../demoData.js';
import { Badge, Toggle, Slider } from './ui/os.jsx';
import { SettingsSections } from './SettingsSections.jsx';
import AdminPanels from './AdminPanels.jsx';
import api from '../api.js';
import SectionCard from './SectionCard.jsx';
import ScopedSetting, { SCOPE_LEVELS, APP_PLACES, PLACE_LEVELS } from './ScopedSetting.jsx';

const SECTIONS = [
  { key: 'account', label: 'Account', icon: User, desc: 'Name, avatar, plan', tier: 'simple' },
  { key: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme, accent, density, background, UI style', tier: 'simple' },
  { key: 'ai', label: 'AI & Intelligence', icon: Bot, desc: 'Effort, personality, routing, intelligence profile', tier: 'simple' },
  { key: 'academic', label: 'Academic Profile', icon: GraduationCap, desc: 'Education, subjects, learning style, goals', tier: 'simple' },
  { key: 'writing', label: 'Writing & Output', icon: PenLine, desc: 'Writing DNA, saved profiles, citation style', tier: 'simple' },
  { key: 'notifications', label: 'Notifications', icon: Bell, desc: 'What tells you about what', tier: 'simple' },
  { key: 'privacy', label: 'Privacy & Security', icon: Shield, desc: 'Data usage, export, delete', tier: 'simple' },
  { key: 'billing', label: 'Credits & Billing', icon: CreditCard, desc: 'Balance, plans, invoices', tier: 'simple' },
  { key: 'automation', label: 'Automation', icon: Zap, desc: 'Permissions, safety controls, approval gates', tier: 'advanced' },
  { key: 'integrations', label: 'Integrations', icon: Puzzle, desc: 'Canvas, Drive, Notion, Telegram', tier: 'advanced' },
  { key: 'extension', label: 'Browser Extension', icon: Keyboard, desc: 'Recorder, auto-capture, badge', tier: 'advanced' },
  { key: 'shortcuts', label: 'Shortcuts', icon: Keyboard, desc: 'Palette, search, wallet', tier: 'advanced' },
  { key: 'accessibility', label: 'Accessibility', icon: Accessibility, desc: 'Motion, contrast, text size', tier: 'advanced' },
  { key: 'data', label: 'Data & Analytics', icon: BarChart3, desc: 'Digest, streaks, accuracy tracking', tier: 'advanced' },
  { key: 'language', label: 'Language & Region', icon: Globe, desc: 'Locale, timezone, units', tier: 'advanced' },
  { key: 'experimental', label: 'Experimental', icon: FlaskConical, desc: 'Unstable but exciting', tier: 'expert' },
  { key: 'advanced', label: 'Advanced', icon: Wrench, desc: 'Debug, config, raw JSON', tier: 'expert' },
];

/* Operator/admin view (operator 08-27): when the account is an admin, Settings
 * shows ONLY the Control Center — no Account/Billing/Study user sections. */
const ADMIN_SECTIONS = [
  { key: 'control-center', label: 'Control Center', icon: Shield, desc: 'System-wide operations', tier: 'simple' },
];

/* Pre-configured behavior profiles. Applying one RESETS everything behavioral
 * (identity — profile, subjects, learning style, goals — and saved writing
 * profiles are preserved) and clears all scoped overrides. Users tweak on top. */
const PROFILE_PRESETS = {
  budget: {
    label: 'Budget',
    tagline: 'Cheapest possible on everything — saves money no matter what.',
    settings: {
      appearance: { theme: 'dark', accent: 'blue', density: 'compact', animation: 'none', background: 'flat', uiStyle: 'minimal' },
      ai: {
        effortScore: 80, effort: 'low', autoRouting: true, creativity: 20, reasoning: 20,
        conciseness: 95, rigor: 40, sourceDepth: 20, originality: 20, temperature: 0.3,
        tokenBudget: 2048, fallbackEnabled: false, subsetting: false,
        personality: 'Minimalist', aiName: 'Helpotron',
        instructions: 'Be fast and concise. Use the cheapest engine that can do the task. No extra detail, no elaboration.',
      },
      writing: { tone: 40, vocabulary: 35, sentenceComplexity: 35, formality: 50, voice: 40, profile: 'My normal essay', style: 'APA' },
      automation: {
        autoRun: false, autoFetch: true, autoTranscribe: true, autoDraft: false, autoOrganize: false,
        autoNotify: true, autoSubmit: false,
        requireApproval: { submit: true, messages: true, bigSpend: true, premium: true, modify: true },
      },
      privacy: { analytics: false, dataLake: false, anonymous: true, exportAll: false },
      integrations: { canvas: true, gdrive: false, notion: false, telegram: false, calendar: false },
      extension: { recorder: true, autoCapture: false, badge: true },
      shortcuts: { palette: 'mod+k', search: 'mod+shift+f', newAssignment: 'mod+n', wallet: 'mod+shift+c' },
      data: { weeklyDigest: false, streakReminders: false, accuracyTracking: false },
      experimental: { ocrBeta: false, edgeEval: false, newUI: true },
      accessibility: { reducedMotion: false, highContrast: false, largeText: false, dyslexiaFriendly: false, screenReader: true },
      language: { locale: 'en-US', timezone: 'auto', measurement: 'imperial' },
      advanced: { debugMode: false, apiLogging: false, configJson: '{}' },
    },
  },
  balanced: {
    label: 'Balanced',
    tagline: 'The middle ground — solid performance at a sensible price.',
    settings: {
      appearance: { theme: 'dark', accent: 'blue', density: 'comfortable', animation: 'full', background: 'aurora', uiStyle: 'glass' },
      ai: {
        effortScore: 480, effort: 'balanced', autoRouting: true, creativity: 72, reasoning: 88,
        conciseness: 61, rigor: 94, sourceDepth: 91, originality: 78, temperature: 0.7,
        tokenBudget: 4096, fallbackEnabled: true, subsetting: true,
        personality: 'Coach', aiName: 'Atlas',
        instructions: 'Explain like you are a patient coach. Check my understanding before moving on.',
      },
      writing: { tone: 50, vocabulary: 60, sentenceComplexity: 55, formality: 70, voice: 65, profile: 'My normal essay', style: 'APA' },
      automation: {
        autoRun: true, autoFetch: true, autoTranscribe: true, autoDraft: true, autoOrganize: true,
        autoNotify: true, autoSubmit: false,
        requireApproval: { submit: true, messages: true, bigSpend: true, premium: true, modify: false },
      },
      privacy: { analytics: true, dataLake: true, anonymous: true, exportAll: false },
      integrations: { canvas: true, gdrive: false, notion: false, telegram: true, calendar: false },
      extension: { recorder: true, autoCapture: true, badge: true },
      shortcuts: { palette: 'mod+k', search: 'mod+shift+f', newAssignment: 'mod+n', wallet: 'mod+shift+c' },
      data: { weeklyDigest: true, streakReminders: true, accuracyTracking: true },
      experimental: { ocrBeta: false, edgeEval: false, newUI: true },
      accessibility: { reducedMotion: false, highContrast: false, largeText: false, dyslexiaFriendly: false, screenReader: true },
      language: { locale: 'en-US', timezone: 'auto', measurement: 'imperial' },
      advanced: { debugMode: false, apiLogging: false, configJson: '{}' },
    },
  },
  power: {
    label: 'Power',
    tagline: 'Maximum quality everywhere — flagship engine, deepest research, burns tokens faster.',
    settings: {
      appearance: { theme: 'graphite', accent: 'emerald', density: 'spacious', animation: 'full', background: 'mesh', uiStyle: 'glass' },
      ai: {
        effortScore: 1000, effort: 'high', autoRouting: false, creativity: 95, reasoning: 100,
        conciseness: 40, rigor: 100, sourceDepth: 100, originality: 95, temperature: 0.9,
        tokenBudget: 8192, fallbackEnabled: true, subsetting: true,
        personality: 'Researcher', aiName: 'Atlas',
        instructions: 'Aim for depth, rigor and originality. Use the flagship model, go deep in research, spare no token.',
      },
      writing: { tone: 65, vocabulary: 85, sentenceComplexity: 70, formality: 60, voice: 70, profile: 'My normal essay', style: 'APA' },
      automation: {
        autoRun: true, autoFetch: true, autoTranscribe: true, autoDraft: true, autoOrganize: true,
        autoNotify: true, autoSubmit: true,
        requireApproval: { submit: false, messages: false, bigSpend: true, premium: true, modify: false },
      },
      privacy: { analytics: true, dataLake: true, anonymous: true, exportAll: false },
      integrations: { canvas: true, gdrive: true, notion: true, telegram: true, calendar: true },
      extension: { recorder: true, autoCapture: true, badge: true },
      shortcuts: { palette: 'mod+k', search: 'mod+shift+f', newAssignment: 'mod+n', wallet: 'mod+shift+c' },
      data: { weeklyDigest: true, streakReminders: true, accuracyTracking: true },
      experimental: { ocrBeta: true, edgeEval: true, newUI: true },
      accessibility: { reducedMotion: false, highContrast: false, largeText: false, dyslexiaFriendly: false, screenReader: true },
      language: { locale: 'en-US', timezone: 'auto', measurement: 'imperial' },
      advanced: { debugMode: false, apiLogging: true, configJson: '{}' },
    },
  },
};

const THEMES = ['dark', 'light', 'system', 'oled', 'midnight', 'graphite'];
const ACCENTS = ['blue', 'purple', 'emerald', 'amber', 'rose', 'cyan', 'custom'];
const DENSITIES = ['compact', 'comfortable', 'spacious'];
const ANIMATIONS = ['full', 'reduced', 'none'];
const BACKGROUNDS = ['flat', 'gradient', 'aurora', 'mesh', 'glass', 'noise'];
const UI_STYLES = ['minimal', 'glass', 'dense', 'soft', 'terminal'];

/* Live preview panel — renders a mini app tinted by the chosen appearance */
function AppearancePreview({ a }) {
  const accentBg = { blue: 'bg-blue-500', purple: 'bg-purple-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500', custom: 'bg-fuchsia-500' }[a.accent] || 'bg-blue-500';
  const accentText = { blue: 'text-blue-300', purple: 'text-purple-300', emerald: 'text-emerald-300', amber: 'text-amber-300', rose: 'text-rose-300', cyan: 'text-cyan-300', custom: 'text-fuchsia-300' }[a.accent] || 'text-blue-300';
  const light = a.theme === 'light';
  const oled = a.theme === 'oled';
  const bg = light ? '#e2e8f0' : oled ? '#000000' : a.theme === 'midnight' ? '#0b1020' : a.theme === 'graphite' ? '#14171f' : '#0f172a';
  const surface = light ? '#ffffff' : 'rgba(255,255,255,0.05)';
  const border = light ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)';
  const text = light ? '#0f172a' : '#f1f5f9';
  const sub = light ? '#64748b' : '#94a3b8';
  const densityPad = a.density === 'compact' ? 'p-1.5' : a.density === 'spacious' ? 'p-4' : 'p-2.5';

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ background: bg, padding: 14 }}>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: border, background: surface }}>
        {/* mini topbar */}
        <div className="flex items-center gap-2" style={{ padding: 8, borderBottom: `1px solid ${border}` }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: accentBg }} />
          <span className="text-[10px] font-black tracking-widest" style={{ color: text }}>HELPOTRON</span>
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-md" style={{ background: accentBg, color: '#fff' }}>⌘K</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" style={{ padding: 10 }}>
          <div className="col-span-2 rounded-lg" style={{ padding: densityPad, background: light ? '#f1f5f9' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}` }}>
            <div className="text-[9px] font-semibold" style={{ color: text }}>Good afternoon.</div>
            <div className="text-[8px] mt-1" style={{ color: sub }}>Assignment brief ready.</div>
            <div className="h-1.5 rounded-full mt-2" style={{ width: '80%', background: `linear-gradient(90deg, ${accentBg.replace('bg-', '#')}cc, ${accentBg.replace('bg-', '#')}44)` }} />
          </div>
          <div className="rounded-lg" style={{ background: light ? '#f1f5f9' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}`, padding: densityPad }}>
            <div className="text-[9px] font-semibold" style={{ color: text }}>Credits</div>
            <div className="text-[8px] font-mono mt-1" style={{ color: accentText }}>0</div>
            <div className="text-[7px] mt-1" style={{ color: sub }}>projected 0</div>
          </div>
          <div className="col-span-2 rounded-lg" style={{ background: light ? '#f1f5f9' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}`, padding: densityPad }}>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentBg }} />
              <div className="text-[8px] font-semibold" style={{ color: text }}>Assignment brief</div>
              <span className="ml-auto text-[7px] px-1 rounded" style={{ background: 'rgba(245,158,11,0.2)', color: '#d97706' }}>due soon</span>
            </div>
            <div className="h-1 rounded-full mt-1.5" style={{ width: '55%', background: 'rgba(245,158,11,0.35)' }} />
          </div>
          <div className="rounded-lg" style={{ background: light ? '#f1f5f9' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}`, padding: densityPad }}>
            <div className="text-[8px] font-semibold" style={{ color: text }}>Study streak</div>
            <div className="text-[10px] font-black mt-1" style={{ color: accentText }}>—</div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-[8px] px-1" style={{ color: sub }}>
        <span>UI style: {a.uiStyle}</span>
        <span>Background: {a.background}</span>
        <span>Animation: {a.animation}</span>
      </div>
    </div>
  );
}

function ChipRow({ label, options, value, onChange }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-300 mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-3 py-1.5 rounded-lg text-[11px] capitalize transition cursor-pointer border ${
              value === o
                ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] border-[var(--accent)] font-semibold'
                : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200 hover:bg-white/8'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Section: Appearance (the "insane" one) ─────────────────────────────── */
/* Every field is wrapped in a ScopedSetting so it can get VARIANT CONFIGS
 * applied to different app places (e.g. dark on Dashboard, light on Settings).
 * The whole panel is the "expand into the full menu" view (operator 08-28). */
function AppearanceSection({ s, set, scoped, setVariants }) {
  const a = s.appearance;
  /* Each field's ScopedSetting gets the Global row wired to the real base
   * value, so editing Global here == using the main control (operator 08-28). */
  const scopedFor = (path) => {
    const field = path.split('.')[1];
    return {
      path,
      variants: scoped?.[path],
      setVariants,
      globalValue: a[field],
      onGlobalChange: (v) => set(`appearance.${field}`, v),
    };
  };
  return (
    <div className="space-y-6">
      <ScopedSetting title="Theme" levels={PLACE_LEVELS} refs={APP_PLACES} values={THEMES} currentValue={a.theme}
        description="Pick the theme that runs app-wide, or add a variant config to run a different theme in specific places." {...scopedFor('appearance.theme')}>
        <ChipRow label="Theme" options={THEMES} value={a.theme} onChange={(v) => set('appearance.theme', v)} />
      </ScopedSetting>
      <ScopedSetting title="Accent" levels={PLACE_LEVELS} refs={APP_PLACES} values={ACCENTS} currentValue={a.accent}
        description="The accent color used for highlights and active states — or per-place variant configs." {...scopedFor('appearance.accent')}>
        <ChipRow label="Accent" options={ACCENTS} value={a.accent} onChange={(v) => set('appearance.accent', v)} />
      </ScopedSetting>
      <ScopedSetting title="Interface density" levels={PLACE_LEVELS} refs={APP_PLACES} values={DENSITIES} currentValue={a.density}
        description="How much breathing room the interface gives you — or per-place variant configs." {...scopedFor('appearance.density')}>
        <ChipRow label="Interface density" options={DENSITIES} value={a.density} onChange={(v) => set('appearance.density', v)} />
      </ScopedSetting>
      <ScopedSetting title="Animation" levels={PLACE_LEVELS} refs={APP_PLACES} values={ANIMATIONS} currentValue={a.animation}
        description="Motion level of the interface — or per-place variant configs." {...scopedFor('appearance.animation')}>
        <ChipRow label="Animation" options={ANIMATIONS} value={a.animation} onChange={(v) => set('appearance.animation', v)} />
      </ScopedSetting>
      <ScopedSetting title="Background" levels={PLACE_LEVELS} refs={APP_PLACES} values={BACKGROUNDS} currentValue={a.background}
        description="The canvas behind the app — flat, gradient, aurora, mesh, glass or noise — or per-place variant configs." {...scopedFor('appearance.background')}>
        <ChipRow label="Background" options={BACKGROUNDS} value={a.background} onChange={(v) => set('appearance.background', v)} />
      </ScopedSetting>
      <ScopedSetting title="UI style" levels={PLACE_LEVELS} refs={APP_PLACES} values={UI_STYLES} currentValue={a.uiStyle}
        description="Minimal, glass, dense, soft or terminal — or per-place variant configs." {...scopedFor('appearance.uiStyle')}>
        <ChipRow label="UI style" options={UI_STYLES} value={a.uiStyle} onChange={(v) => set('appearance.uiStyle', v)} />
      </ScopedSetting>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-medium text-slate-300">Font size</div>
          <div className="text-xs font-mono font-bold text-[var(--accent)]">
            {a.fontScale ?? 50} <span className="text-[10px] text-slate-500">/ 100</span>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={a.fontScale ?? 50}
          onChange={(e) => set('appearance.fontScale', Number(e.target.value))}
          className="w-full accent-[var(--accent)] cursor-pointer"
          aria-label="Font size score between 1 and 100"
        />
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>1 — tiny asf</span>
          <span className="text-slate-400">50 — default</span>
          <span>100 — massive</span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
          Scales every text size proportionally — nothing gets flattened to the same size.
        </p>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Live preview</div>
        <AppearancePreview a={a} />
      </div>
    </div>
  );
}

/* ── Section: AI & Intelligence (control center) ────────────────────────── */
const INTELLIGENCE = [
  { key: 'creativity', label: 'Creativity' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'conciseness', label: 'Conciseness' },
  { key: 'rigor', label: 'Academic rigor' },
  { key: 'sourceDepth', label: 'Source depth' },
  { key: 'originality', label: 'Originality' },
];

const PERSONALITIES = ['Professional', 'Friendly', 'Strict', 'Socratic', 'Coach', 'Researcher', 'Tutor', 'Minimalist'];

function EffortSlider({ value, onChange, locked }) {
  // UI scale 1–10 (operator 08-26); backend contract stays 1–1000 (×100).
  // locked (operator 08-27, demo mode): server forces effort="auto" — the
  // slider is disabled and the stored/user-set score is ignored entirely.
  const n = Math.max(1, Math.min(10, Math.round(Number(value || 500) / 100)));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-slate-300">AI Effort</div>
        {locked
          ? <div className="text-xs font-mono font-bold text-amber-300">AUTO <span className="text-[10px] text-slate-500">(demo)</span></div>
          : <div className="text-xs font-mono font-bold text-[var(--accent)]">{n} <span className="text-[10px] text-slate-500">/ 10</span></div>}
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={n}
        disabled={locked}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full accent-[var(--accent)] ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label="AI effort score between 1 and 10"
      />
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>1 — cheap & fast</span>
        <span className="text-slate-400">5 — balanced</span>
        <span>10 — flagship research</span>
      </div>
    </div>
  );
}


/* ── Agent Hierarchy (operator 08-28) — per-surface educational-mode &
 * identity scope. Stored as settings.ai.hierarchy = {node: {mode: 'edu'|
 * 'open', personality, instructions, memories[]}}. Each node is independent,
 * default 'edu'; non-my_agent nodes default to NO own identity — My Agent's
 * personality/instructions/memory/files never apply to them. The my_agent
 * node keeps using the per-user educationalMode switch (My Agent page) so
 * both agree; its identity/memory/files live in the My Agent page. */
const AGENT_HIERARCHY_NODES = [
  { key: 'my_agent', label: 'My Agent', desc: 'The main personal agent (My Agent page & main chat)' },
  { key: 'assignment_team', label: 'Assignment team', desc: 'Per-assignment subagent teams (assignment bubbles)' },
  { key: 'study_tools', label: 'Study tools', desc: 'Flashcards, practice tests, study guides' },
  { key: 'dump_agent', label: 'Dump agent', desc: 'Assignment Dump extraction & routing' },
  { key: 'qa_chat', label: 'Q&A chat', desc: 'Student Q&A chat' },
  { key: 'extensions', label: 'Extensions', desc: 'Browser extension flows' },
];

function AgentHierarchy({ s, set }) {
  const ai = s.ai || {};
  const hierarchy = ai.hierarchy || {};
  const legacyEdu = s.educationalMode !== false ? 'edu' : 'open';

  const nodeCfg = (key) => {
    const c = hierarchy[key];
    return c && typeof c === 'object' ? c : {};
  };
  const nodeMode = (key) => nodeCfg(key).mode || (key === 'my_agent' ? legacyEdu : 'edu');

  const updateNode = (key, patch) => {
    const nextHierarchy = JSON.parse(JSON.stringify(hierarchy || {}));
    nextHierarchy[key] = { ...(nextHierarchy[key] || {}), ...patch };
    set('ai.hierarchy', nextHierarchy);
    // Server (mode_for_node/agent_prompt) reads settings.ai.hierarchy — mirror
    // immediately; PATCH /api/settings merges one level (ai.update).
    api.updateSettings({ ai: { hierarchy: nextHierarchy } }).catch(() => {});
  };

  const setNodeMode = (key, mode) => {
    if (key === 'my_agent') {
      // The per-user switch lives on the My Agent node — keep one source of
      // truth so the My Agent page toggle and this control never disagree.
      const edu = mode === 'edu';
      set('educationalMode', edu);
      api.updateSettings({ educationalMode: edu }).catch(() => {});
      return;
    }
    updateNode(key, { mode });
  };

  const addMemory = (key) => {
    const cfg = nodeCfg(key);
    const text = (cfg._memInput || '').trim();
    if (!text) return;
    const memories = Array.isArray(cfg.memories) ? [...cfg.memories, text] : [text];
    updateNode(key, { memories });
  };
  const delMemory = (key, idx) => {
    const memories = Array.isArray(nodeCfg(key).memories) ? nodeCfg(key).memories.slice() : [];
    memories.splice(idx, 1);
    updateNode(key, { memories });
  };
  const onMemInput = (key, value) => {
    // stash the pending input on the node cfg so it survives re-renders
    updateNode(key, { _memInput: value });
  };

  return (
    <div className="px-4 py-4 rounded-2xl bg-white/4 border border-white/8 space-y-3">
      <div>
        <div className="text-xs font-semibold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] flex items-center justify-center">🧭</span>
          Agent Hierarchy
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
          Which surfaces are in educational mode (school questions only) and how each surface speaks.
          Every node starts <b>Educational</b>; each one is configured independently, and a surface never
          inherits My Agent's identity, memory or files.
        </div>
      </div>

      {AGENT_HIERARCHY_NODES.map((n) => {
        const cfg = nodeCfg(n.key);
        const mode = nodeMode(n.key);
        return (
          <div key={n.key} className="rounded-xl bg-white/4 border border-white/8 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-200 truncate">{n.label}</div>
                <div className="text-[10px] text-slate-500 truncate">{n.desc}</div>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-white/8 bg-white/4 text-[10px] font-semibold shrink-0">
                {[['edu', 'Educational'], ['open', 'Open']].map(([mk, ml]) => (
                  <button
                    key={mk}
                    type="button"
                    onClick={() => setNodeMode(n.key, mk)}
                    className={`px-3 py-1.5 transition cursor-pointer ${
                      mode === mk
                        ? (mk === 'edu' ? 'bg-emerald-600/25 text-emerald-300' : 'bg-amber-600/25 text-amber-300')
                        : 'bg-white/4 text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    {ml}
                  </button>
                ))}
              </div>
            </div>

            {n.key === 'my_agent' ? (
              <p className="text-[10px] text-slate-500 leading-relaxed">
                My Agent's identity, instructions, memory and files live on the <b>My Agent page</b> —
                no duplication here. This switch also mirrors the Educational-only mode toggle above.
              </p>
            ) : (
              <>
                <label className="block text-[10px] text-slate-500">Personality (this surface)</label>
                <input
                  value={cfg.personality || ''}
                  onChange={(e) => updateNode(n.key, { personality: e.target.value })}
                  placeholder="e.g. Socratic, peer tutor, concise…"
                  aria-label={`${n.label} personality`}
                  className="clean-input w-full px-2.5 py-1.5 text-[11px] outline-none"
                />
                <label className="block text-[10px] text-slate-500">Instructions (this surface)</label>
                <textarea
                  value={cfg.instructions || ''}
                  onChange={(e) => updateNode(n.key, { instructions: e.target.value })}
                  rows={2}
                  placeholder="How this surface's agent should behave for the student…"
                  aria-label={`${n.label} instructions`}
                  className="clean-input w-full px-2.5 py-1.5 text-[11px] outline-none resize-none"
                />
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] text-slate-500">Inline memory (this surface)</label>
                    <span className="text-[10px] text-slate-600">{Array.isArray(cfg.memories) ? cfg.memories.length : 0}</span>
                  </div>
                  <div className="space-y-1 mt-1 mb-1.5">
                    {(Array.isArray(cfg.memories) ? cfg.memories : []).map((m, i) => (
                      <div key={i} className="flex items-start gap-2 p-1.5 rounded-lg bg-white/4 border border-white/8">
                        <p className="flex-1 text-[11px] text-slate-300 leading-relaxed">{m}</p>
                        <button
                          type="button"
                          onClick={() => delMemory(n.key, i)}
                          className="p-0.5 text-slate-600 hover:text-rose-400 transition cursor-pointer"
                          aria-label={`Remove memory ${i + 1} for ${n.label}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={cfg._memInput || ''}
                      onChange={(e) => onMemInput(n.key, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addMemory(n.key)}
                      placeholder="Add a memory for this surface…"
                      aria-label={`${n.label} memory`}
                      className="clean-input flex-1 px-2.5 py-1.5 text-[11px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => addMemory(n.key)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold transition cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Agent data manager inside AI & Intelligence (operator 08-26): permanent
 * memory + loaded files, with per-hierarchy scope hints. Uses the same
 * memory/file endpoints as My Agent. */
function AIAgentData() {
  const [mem, setMem] = useState([]);
  const [memText, setMemText] = useState('');
  const [files, setFiles] = useState([]);
  const [openFile, setOpenFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const m = await api.request('/api/agent/memory', { method: 'GET' });
      setMem(m?.entries || []);
      const f = await api.request('/api/agent/files', { method: 'GET' });
      setFiles(f?.files || []);
    } catch { /* auth-gated; hidden naturally */ }
  };
  useEffect(() => { load(); }, []);
  const addMem = async () => {
    const t = memText.trim(); if (!t) return;
    setBusy(true);
    try {
      await api.request('/api/agent/memory', { method: 'POST', body: JSON.stringify({ text: t }) });
      setMemText('');
      await load();
    } catch (e) { alert(e.message || 'Failed to add memory'); }
    finally { setBusy(false); }
  };
  const delMem = async (id) => {
    try { await api.request(`/api/agent/memory/${id}`, { method: 'DELETE' }); await load(); } catch {}
  };
  const delFile = async (id) => {
    try { await api.deleteAgentFile(id); await load(); } catch {}
  };
  const readFile = async (f) => {
    try {
      const res = await api.get(`/api/agent/files/${f.id}`);
      setOpenFile(res?.file || f);
    } catch (e) { alert(e.message || 'Could not read file'); }
  };
  const kindIcon = { skill: '🧩', rule: '📏', automation: '⚙️', personality: '🎭' };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-2.5">
        <div className="text-xs font-semibold text-white flex items-center justify-between">
          <span>🧠 Permanent memory</span>
          <Badge color={mem.length ? 'blue' : 'slate'}>{mem.length}</Badge>
        </div>
        <p className="text-[10px] text-slate-500">Always read by the agent. Applies globally — per-hierarchy scoping is on the AI knobs above.</p>
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {mem.length === 0 && <div className="text-[11px] text-slate-600 py-1">No memories yet.</div>}
          {mem.map((m) => (
            <div key={m.id} className="flex items-start gap-2 p-2 rounded-lg bg-white/4 border border-white/8">
              <p className="flex-1 text-[11px] text-slate-300 leading-relaxed">{m.text}</p>
              <button type="button" onClick={() => delMem(m.id)} className="p-0.5 text-slate-600 hover:text-rose-400 transition cursor-pointer">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={memText} onChange={(e) => setMemText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMem()}
            placeholder="Add a memory…" aria-label="Add a memory" className="clean-input flex-1 px-2.5 py-1.5 text-[11px] outline-none" />
          <button type="button" onClick={addMem} disabled={busy}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-semibold transition cursor-pointer disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
      <div className="rounded-2xl bg-white/4 border border-white/8 p-4 space-y-2.5">
        <div className="text-xs font-semibold text-white flex items-center justify-between">
          <span>📂 Skills, rules & personality</span>
          <Badge color={files.length ? 'green' : 'slate'}>{files.length} loaded</Badge>
        </div>
        <p className="text-[10px] text-slate-500">Files the agent loads and follows. Tap to read, 🗑 to remove.</p>
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {files.length === 0 && <div className="text-[11px] text-slate-600 py-1">No files loaded.</div>}
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/4 border border-white/8">
              <span className="text-sm">{kindIcon[f.kind] || '📄'}</span>
              <button type="button" onClick={() => readFile(f)} className="flex-1 min-w-0 text-left cursor-pointer">
                <span className="block text-[11px] text-slate-200 truncate hover:text-[var(--accent-2)]">{f.file_name}</span>
                <span className="block text-[9px] text-slate-600">{f.kind} · {Number(f.size_bytes || 0).toLocaleString()} B · tap to read</span>
              </button>
              <button type="button" onClick={() => delFile(f.id)} className="p-0.5 text-slate-600 hover:text-rose-400 transition cursor-pointer">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
      {openFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setOpenFile(null)}>
          <div className="clean-card surface-glass-strong w-full max-w-xl max-h-[80vh] flex flex-col rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
              <div className="text-sm font-bold text-white truncate">{openFile.file_name}</div>
              <button type="button" onClick={() => setOpenFile(null)} className="text-slate-400 hover:text-white transition cursor-pointer">✕</button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">{openFile.content}</div>
          </div>
        </div>
      )}
    </div>
  );
}


function AISection({ s, set, scoped, setVariants, subjectRefs }) {
  const ai = s.ai;
  const rawEffort = Number(ai.effortScore ?? EFFORT_SCORES[ai.effort] ?? 500);
  const aiEffort = Math.max(1, Math.min(10, Math.round(rawEffort / 100)));
  const setEffort = (v) => {
    // v is 1–10 on the UI; store ×100 for the backend 1–1000 contract.
    set('ai.effortScore', v * 100);
    set('ai.effort', v <= 3 ? 'low' : v <= 7 ? 'balanced' : 'high');
  };
  return (
    <div className="space-y-7">
      {/* DEMO MODE (operator 08-27): effort is non-overridable during testing.
       * Auto routing is applied as the default for all users — junk prompts
       * drop to the cheap engines, hard problems still escalate. */}
      <div className="flex items-start gap-4 px-4 py-3 rounded-2xl bg-white/4 border border-white/8">
        <div>
          <div className="text-xs font-semibold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] flex items-center justify-center">🧪</span>
            Demo mode
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Auto mode is being applied as the non-overridable default for testing purposes. Every request is routed by difficulty: junk prompts get the cheap-and-fast engines, genuinely hard problems still escalate.
          </div>
        </div>
      </div>

      {/* Educational-only mode (operator 08-26) — guarded behavior via the
       * agent's system prompt; OFF = unrestricted, zero guidance. */}
      <div className="flex items-start justify-between gap-4 px-4 py-3 rounded-2xl bg-white/4 border border-white/8">
        <div>
          <div className="text-xs font-semibold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] flex items-center justify-center">🎓</span>
            Educational-only mode
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            On (default): the agent is prompted to decline slurs, insults and abusive roleplay and stick to studying. Off: zero guidance, fully unrestricted.
          </div>
        </div>
        <Toggle
          checked={s.educationalMode !== false}
          onChange={(v) => {
            set('educationalMode', v);
            // Server reads this on every agent call — mirror it immediately.
            api.updateSettings({ educationalMode: v }).catch(() => {});
          }}
        />
      </div>

      {/* Agent Hierarchy (operator 08-28): per-surface edu-mode + identity
       * scope — one card per node, saved through the normal settings path. */}
      <AgentHierarchy s={s} set={set} />

      {/* Agent data: memory + skills/rules/personality (operator 08-26) */}
      <AIAgentData />

      {/* Effort — the one control that matters. Locked during demo mode
       * (operator 08-27); the server ignores stored/per-subject scores and
       * forces auto routing in llm.call_llm. */}
      <div className="px-4 py-3.5 rounded-2xl bg-white/4 border border-white/8">
        <EffortSlider value={aiEffort} onChange={setEffort} locked />
        <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
          Locked during demo mode. Requests auto-route by difficulty: junk prompts go to the cheap-and-fast engines, hard problems escalate to the flagship ones. Per-subject effort overrides are suspended too.
        </p>
      </div>

      <ScopedSetting
        path="ai.autoRouting"
        title="Auto routing"
        variants={scoped['ai.autoRouting']}
        setVariants={setVariants}
        values={[{ key: true, label: 'On' }, { key: false, label: 'Off' }]}
        refs={subjectRefs}
        globalValue={s.ai?.autoRouting}
        onGlobalChange={(v) => set('ai.autoRouting', v)}
        description="Lets Helpotron route each task to the engine its difficulty deserves. Override per subject if a particular course always needs one."
      >
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/4 border border-white/8">
          <div>
            <div className="text-xs text-slate-200 font-medium">Auto routing</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Let Helpotron select the optimal engine based on task complexity.</div>
          </div>
          <Toggle checked={ai.autoRouting} onChange={(v) => set('ai.autoRouting', v)} label="Auto routing" />
        </div>
      </ScopedSetting>

      {/* Intelligence profile */}
      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Intelligence profile</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 p-4 rounded-xl bg-white/4 border border-white/8">
          {INTELLIGENCE.map((f) => (
            <Slider key={f.key} label={f.label} value={ai[f.key]} onChange={(v) => set(`ai.${f.key}`, v)} format={(v) => v} />
          ))}
        </div>
      </div>

      {/* Routing by task (tier labels, never model names) — demo mode (08-27):
       * routing is auto, so Research/Reasoning show "by difficulty". */}
      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Task routing</div>
        <p className="text-[11px] text-slate-500 mb-3">How each task type is routed during demo mode (auto, by difficulty).</p>
        <div className="rounded-xl overflow-hidden border border-white/8">
          {[
            ['OCR', 'Fast tier', 'green'],
            ['Transcription', 'Fast tier', 'green'],
            ['Summarization', 'Fast tier', 'green'],
            ['Writing', 'Balanced tier', 'blue'],
            ['Image analysis', 'Balanced tier', 'blue'],
            ['Research', 'By difficulty', 'purple'],
            ['Reasoning', 'By difficulty', 'purple'],
          ].map(([task, tier, color], i) => (
            <div key={task} className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? 'bg-white/4' : ''} text-xs`}>
              <span className="text-slate-300">{task}</span>
              <Badge color={color}>{tier}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* AI personality */}
      <ScopedSetting
        path="ai.personality"
        title="AI personality"
        variants={scoped['ai.personality']}
        setVariants={setVariants}
        values={PERSONALITIES}
        refs={subjectRefs}
      >
        <div>
          <div className="text-xs font-medium text-slate-300 mb-2">My AI</div>
          <div className="flex items-center gap-3 mb-3">
            <input
              value={ai.aiName}
              onChange={(e) => set('ai.aiName', e.target.value)}
              className="clean-input px-3 py-2 text-xs w-32 outline-none"
              aria-label="AI name"
            />
            <span className="text-[11px] text-slate-500">is your personal AI.</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PERSONALITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set('ai.personality', p)}
                className={`px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer border ${
                  ai.personality === p ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)] border-[var(--accent)] font-semibold' : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <label className="block text-[11px] text-slate-500 mb-1.5">How should {ai.aiName} interact with you?</label>
          <textarea
            value={ai.instructions}
            onChange={(e) => set('ai.instructions', e.target.value)}
            rows={3}
            className="clean-input w-full px-3 py-2 text-xs outline-none resize-none"
            placeholder="Describe how your AI should behave…"
            aria-label="AI interaction instructions"
          />
        </div>
      </ScopedSetting>
    </div>
  );
}

/* ── Main settings workspace ─────────────────────────────────────────────── */
/* Font size scaling (1-100). Not a uniform resize: every step multiplies the
 * base font size, so all text scales proportionally and 50 = default.
 * Hooked onto the html root font-size so rem-based utilities follow along. */
export function applyFontScale(score) {
  const n = Number(score);
  const m = Number.isFinite(n) && n > 0 ? Math.min(1.6, Math.max(0.8, n / 50)) : 1;
  document.documentElement.style.fontSize = `${16 * m}px`;
  document.documentElement.style.setProperty('--font-scale', String(m));
}

export function applyAppearance(appearance) {
  if (!appearance) return;
  const root = document.documentElement;
  applyFontScale(appearance.fontScale);
  if (appearance.theme) root.setAttribute('data-theme', appearance.theme);
  if (appearance.accent) root.setAttribute('data-accent', appearance.accent);
  if (appearance.density) root.setAttribute('data-density', appearance.density);
  /* Wire the remaining controls (operator 08-26: they were stored but never
   * applied — picks looked dead). */
  if (appearance.animation) root.setAttribute('data-anim', appearance.animation);
  if (appearance.background) root.setAttribute('data-bg', appearance.background);
  if (appearance.uiStyle) root.setAttribute('data-ui', appearance.uiStyle);
  if (appearance.background || appearance.uiStyle || appearance.animation) {
    root.classList.add('appearance-live');
  }
}

/* Accessibility → CSS hooks (operator 08-26). The section existed in the nav
 * but had NO renderer and nothing applied the stored values. */
export function applyAccessibility(acc) {
  if (!acc) return;
  const root = document.documentElement;
  root.setAttribute('data-motion', acc.reducedMotion ? 'reduced' : 'full');
  root.setAttribute('data-contrast', acc.highContrast ? 'high' : 'normal');
  root.setAttribute('data-reading', acc.dyslexiaFriendly ? 'dyslexia' : 'standard');
  root.setAttribute('data-textscale', acc.largeText ? 'large' : 'normal');
  root.setAttribute('data-screenreader', acc.screenReader ? 'on' : 'off');
}

/* Accessibility controls (bound to settings.accessibility, applied live). */
function AccessibilitySection({ s, set }) {
  const items = [
    ['reducedMotion', 'Reduce motion', 'Shorten/disable animations and transitions'],
    ['highContrast', 'High contrast', 'Stronger text & borders for visibility'],
    ['largeText', 'Larger text', 'Bump base font size ~15%'],
    ['dyslexiaFriendly', 'Dyslexia-friendly', 'Extra letter/word spacing, readable line height'],
    ['screenReader', 'Screen-reader support', 'Enhanced focus rings for keyboard/screen readers'],
  ];
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        Applied instantly anywhere in the app (no reload needed). Stored per-account.
      </div>
      {items.map(([key, label, desc]) => (
        <div key={key} className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl bg-white/4 border border-white/8">
          <div>
            <div className="text-xs font-semibold text-white">{label}</div>
            <div className="text-[11px] text-slate-500">{desc}</div>
          </div>
          <Toggle checked={!!s.accessibility?.[key]} onChange={(v) => set(`accessibility.${key}`, v)} />
        </div>
      ))}
    </div>
  );
}

export function SettingsApp({ userId, onGoTo, plan, credits, tokenBalance, isAdmin = false }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [section, setSection] = useState('appearance');
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState('');
  const [presetConfirm, setPresetConfirm] = useState(null);

  /* Appearance/accessibility application moved to AppShell (single owner,
   * resolves per-place variant configs against the active view). */

  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(settings));
    const keys = path.split('.');
    let obj = next;
    while (keys.length > 1) {
      const k = keys.shift();
      if (obj[k] == null || typeof obj[k] !== 'object') obj[k] = {}; // create missing containers (e.g. scoped.*)
      obj = obj[k];
    }
    obj[keys[0]] = value;
    setSettingsState(next);
    saveSettings(next);
    setSavedFlash(true);
    clearTimeout(settingsApp._t);
    settingsApp._t = setTimeout(() => setSavedFlash(false), 1200);
  };

  /* Hierarchical variants: settings.scoped[path] = [{id, scope, value}].
   * Stored as a FLAT map keyed by full dot-path — the dot-walking set()
   * would nest 'ai.effort' into {ai:{effort}} and break scoped[path] reads,
   * so variants get their own writer that writes the key verbatim. */
  const scoped = settings.scoped || {};
  const setVariants = (path, variants) => {
    const next = JSON.parse(JSON.stringify(settings));
    next.scoped = next.scoped || {};
    next.scoped[path] = variants;
    setSettingsState(next);
    saveSettings(next);
    setSavedFlash(true);
    clearTimeout(settingsApp._t);
    settingsApp._t = setTimeout(() => setSavedFlash(false), 1200);
  };
  const subjectRefs = Object.keys(settings.subjects || {});

  /* One-click preset: resets everything behavioral to a tuned profile.
   * Identity (profile, subjects, learning style, goals) and saved writing
   * profiles are preserved; all scoped overrides are cleared. */
  const applyPreset = (key) => {
    const p = PROFILE_PRESETS[key];
    if (!p) return;
    const savedProfiles = settings.writing?.profiles || DEFAULT_SETTINGS.writing.profiles;
    const reset = JSON.parse(JSON.stringify({
      ...DEFAULT_SETTINGS,
      ...p.settings,
      profile: settings.profile,
      subjects: settings.subjects,
      learningStyle: settings.learningStyle,
      goals: settings.goals,
      writing: { ...p.settings.writing, profiles: savedProfiles },
      scoped: {},
    }));
    setSettingsState(reset);
    saveSettings(reset);
    setSavedFlash(true);
    clearTimeout(settingsApp._t);
    settingsApp._t = setTimeout(() => setSavedFlash(false), 1200);
    setPresetConfirm(null);
  };

  /* Operator (08-28): admins see the NORMAL sections too — Control Center
   * lives in the app nav (AppShell 'admin' entry), not as a Settings takeover. */
  const sections = SECTIONS;
  const q = search.trim().toLowerCase();
  const visibleSections = sections.filter((sec) => !q || `${sec.label} ${sec.desc}`.toLowerCase().includes(q));

  /* Collapsed: a setting is just its name. Maximize it and the WHOLE menu
   * opens — every full menu carries variant configs for different places. */
  const renderSectionContent = (key) => {
    if (key === 'control-center') return <AdminPanels userId={userId} />;
    if (key === 'appearance') return <AppearanceSection s={settings} set={set} scoped={scoped} setVariants={setVariants} />;
    if (key === 'accessibility') return <AccessibilitySection s={settings} set={set} />;
    if (key === 'ai') return <AISection s={settings} set={set} scoped={scoped} setVariants={setVariants} subjectRefs={subjectRefs} />;
    return <SettingsSections section={key} s={settings} set={set} scoped={scoped} setVariants={setVariants} subjectRefs={subjectRefs} userId={userId} onGoTo={onGoTo} plan={plan} credits={credits} tokenBalance={tokenBalance} isAdmin={isAdmin} />;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {/* Toolbar: search + quick presets + save flash */}
      <SectionCard id="settings-toolbar" padding="p-4" className="h-fit" header={
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="clean-input flex-1 min-w-[180px] px-3 py-2 text-[11px] outline-none"
          />
          <AnimatePresence>
            {savedFlash && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-semibold text-emerald-300"
              >
                <Check className="w-3 h-3" /> Saved
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      }>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 mr-1">Quick presets</span>
          {Object.entries(PROFILE_PRESETS).map(([k, p]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPresetConfirm(k)}
              title={p.tagline}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition cursor-pointer bg-white/4 text-slate-300 hover:text-slate-100 hover:bg-white/10"
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">
          Budget = cheapest possible. Balanced = cost & performance middle. Power = max quality, burns tokens.
        </p>
        {presetConfirm && (
          <div className="mt-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25">
            <div className="text-[10px] text-rose-200 leading-relaxed">
              Reset ALL settings to <b>{PROFILE_PRESETS[presetConfirm].label}</b>? Every custom value and scoped
              override gets replaced by the preset. Your name, subjects and saved writing profiles stay.
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => applyPreset(presetConfirm)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold transition cursor-pointer"
              >
                Yes, reset everything
              </button>
              <button
                type="button"
                onClick={() => setPresetConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* The settings themselves: a simple name, maximize to the whole menu. */}
      {visibleSections.map((sec) => {
        const Icon = sec.icon;
        const open = section === sec.key;
        return (
          <SectionCard key={sec.key} id={`settings-${sec.key}`} padding="p-0" className="overflow-hidden">
            <button
              type="button"
              onClick={() => setSection(open ? null : sec.key)}
              aria-expanded={open}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition cursor-pointer ${
                open ? 'bg-[var(--accent-subtle)]' : 'hover:bg-white/3'
              }`}
            >
              <span className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center transition ${
                open ? 'bg-[var(--accent)] text-white' : 'bg-white/6 text-slate-300'
              }`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-100">{sec.label}</span>
                <span className="block text-[11px] text-slate-500 truncate">{sec.desc}</span>
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="px-5 pb-5 pt-4 border-t border-white/8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={sec.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {renderSectionContent(sec.key)}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </SectionCard>
        );
      })}
      {visibleSections.length === 0 && (
        <div className="px-3 py-8 text-center text-[11px] text-slate-600">No settings match “{search}”</div>
      )}
    </div>
  );
}

// module-level timer handle so the save flash never leaks
const settingsApp = { _t: null };

export default SettingsApp;
