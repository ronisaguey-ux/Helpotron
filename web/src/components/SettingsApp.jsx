// export target: web/src/components/SettingsApp.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * SettingsApp.jsx — the settings workspace (replaces the 126 KB modal).
 * Shell: two-pane layout (section list → section page), progressive
 * disclosure (Simple / Advanced / Expert), live persistence to the OS
 * settings store. Appearance ships with a live preview panel.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import { Check, ChevronDown, Palette, Bot, GraduationCap, PenLine, Zap, Bell, Shield, CreditCard, Puzzle, Keyboard, BarChart3, FlaskConical, Accessibility, Globe, Wrench, User, Trash2, Plus, Upload } from 'lucide-react';
import { loadSettings, saveSettings, EFFORT_SCORES, DEFAULT_SETTINGS } from '../demoData.js';
import { Badge, Toggle, Slider } from './ui/os.jsx';
import { SettingsSections } from './SettingsSections.jsx';
import AdminPanels from './AdminPanels.jsx';
import api from '../api.js';
import SectionCard from './SectionCard.jsx';
import ScopedSetting from './ScopedSetting.jsx';

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

/* ── Section: Appearance ─────────────────────────────────────────────────── */
function AppearanceSection({ s, set }) {
  const a = s.appearance || {};

  return (
    <div className="space-y-6">
      <div className="panel p-5 space-y-5">
        <ChipRow
          label="Theme"
          options={THEMES}
          value={a.theme || 'dark'}
          onChange={(v) => set('appearance.theme', v)}
        />
        <ChipRow
          label="Accent Color"
          options={ACCENTS}
          value={a.accent || 'purple'}
          onChange={(v) => set('appearance.accent', v)}
        />
        <ChipRow
          label="Interface Density"
          options={DENSITIES}
          value={a.density || 'comfortable'}
          onChange={(v) => set('appearance.density', v)}
        />
        <ChipRow
          label="Animations"
          options={ANIMATIONS}
          value={a.animation || 'full'}
          onChange={(v) => set('appearance.animation', v)}
        />
        <ChipRow
          label="UI Style"
          options={UI_STYLES}
          value={a.uiStyle || 'glass'}
          onChange={(v) => set('appearance.uiStyle', v)}
        />

        <div className="pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-medium text-slate-200">Font Scale</div>
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
            aria-label="Font size scale between 1 and 100"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Compact (1)</span>
            <span className="text-slate-400">Default (50)</span>
            <span>Large (100)</span>
          </div>
        </div>
      </div>

      <div className="panel p-5 space-y-3">
        <div className="text-xs font-medium text-slate-200">Appearance Preview</div>
        <AppearancePreview a={a} />
      </div>
    </div>
  );
}

/* ── Section: AI & Intelligence ─────────────────────────────────────────── */
const INTELLIGENCE = [
  { key: 'creativity', label: 'Creativity' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'conciseness', label: 'Conciseness' },
  { key: 'rigor', label: 'Academic rigor' },
  { key: 'sourceDepth', label: 'Source depth' },
  { key: 'originality', label: 'Originality' },
];

const PERSONALITIES = ['Tutor', 'Strict Grader', 'Socratic Coach', 'Researcher', 'Professional', 'Minimalist'];

/* The 3 plugged-in AI detectors (operator 08-31) — detector-registry keys,
 * server-side gated on their API keys being configured. */
const DETECTORS = [
  ['sapling', 'Sapling'],
  ['winston_ai', 'Winston AI'],
  ['pangram', 'Pangram'],
];

function EffortSlider({ value, onChange, locked }) {
  const n = Math.max(1, Math.min(10, Math.round(Number(value || 500) / 100)));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-slate-200">Model Effort Level</div>
        <div className="text-xs font-mono font-bold text-[var(--accent)]">
          {n} <span className="text-[10px] text-slate-500">/ 10 · {n <= 3 ? 'Economical' : n <= 7 ? 'Balanced' : 'Flagship'}</span>
        </div>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={n}
        onChange={(e) => onChange(Number(e.target.value) * 100)}
        className="w-full accent-[var(--accent)] cursor-pointer"
        aria-label="AI effort score between 1 and 10"
      />
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>1 — fast & economical</span>
        <span className="text-slate-400">5 — balanced</span>
        <span>10 — deep reasoning flagship</span>
      </div>
    </div>
  );
}

/* Sample Voice (08-31, operator): "write like a sample" — add/upload writing
 * samples (paste or .txt/.md), pick a global selection or per subject /
 * assignment variants with 1+ samples each; the agent matches their voice
 * alongside the AI Detection Standard when that's also on. */
function SampleVoicePanel({ s, set, scoped, setVariants, subjectRefs }) {
  const ai = s.ai || {};
  const style = ai.style || {};
  const samples = style.samples || {};
  const sampleList = Object.entries(samples).map(([id, e]) => ({ id, name: e.name || 'Sample', text: e.text || '' }));
  const sel = (style.selection || []);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newText, setNewText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [levelKey, setLevelKey] = useState('subject');
  const [ref, setRef] = useState('');
  const [pick, setPick] = useState([]);
  const [flash, setFlash] = useState(false);

  const flashSave = () => { setFlash(true); setTimeout(() => setFlash(false), 1600); };

  const trimSelection = (list) => list.filter((id) => samples[id]);

  const addSample = () => {
    if (!newText.trim()) return;
    const id = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    set('ai.style', {
      ...style,
      samples: { ...samples, [id]: { name: newName.trim() || 'Sample', text: newText.trim().slice(0, 30000) } },
    });
    setNewName(''); setNewText(''); setShowAdd(false);
    flashSave();
  };

  const removeSample = (id) => {
    const nextSamples = { ...samples }; delete nextSamples[id];
    let next = { ...style, samples: nextSamples, selection: trimSelection(sel.filter((x) => x !== id)) };
    set('ai.style', next);
    // drop the id from every scoped variant of ai.style.samples
    const variants = (scoped['ai.style.samples'] || [])
      .map((v) => ({ ...v, value: Array.isArray(v.value) ? v.value.filter((x) => x !== id) : v.value }))
      .filter((v) => !Array.isArray(v.value) || v.value.length > 0);
    setVariants('ai.style.samples', variants);
    flashSave();
  };

  const toggleGlobal = (id) => {
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    set('ai.style', { ...style, selection: next });
    flashSave();
  };

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setNewText(String(reader.result || '').slice(0, 30000));
    reader.readAsText(f);
    e.target.value = '';
  };

  const openVariant = (v) => {
    setEditingId(v ? v.id : null);
    setLevelKey(v ? v.scope.level : 'subject');
    setRef(v ? v.scope.ref : '');
    setPick(v && Array.isArray(v.value) ? v.value.filter((id) => samples[id]) : []);
    setExpanded(true);
  };

  const applyVariant = () => {
    const r = ref.trim();
    if (!r) return;
    const list = scoped['ai.style.samples'] || [];
    const variant = { id: editingId || ('v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)), scope: { level: levelKey, ref: r }, value: [...pick] };
    const next = [...list];
    if (editingId) {
      const i = next.findIndex((x) => x.id === editingId);
      if (i >= 0) next[i] = variant;
      else next.push(variant);
    } else {
      const clash = next.find((x) => x.scope.level === levelKey && String(x.scope.ref || '').trim().toLowerCase() === r.toLowerCase());
      if (clash) { openVariant(clash); return; }
      next.push(variant);
    }
    setVariants('ai.style.samples', next);
    setExpanded(false); setEditingId(null); setRef(''); setPick([]);
    flashSave();
  };

  const removeVariant = (id) => {
    setVariants('ai.style.samples', (scoped['ai.style.samples'] || []).filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
    flashSave();
  };

  const byId = (id) => sampleList.find((x) => x.id === id);

  return (
    <div className="panel p-5 space-y-3">
      <ScopedSetting
        path="ai.style.enabled"
        variants={(scoped['ai.style.enabled'] || [])}
        setVariants={setVariants}
        levels={[
          { key: 'subject', label: 'Subject' },
          { key: 'assignment', label: 'Assignment' },
        ]}
        values={[{ key: 'on', label: 'On' }, { key: 'off', label: 'Off' }]}
        refs={subjectRefs}
        refPlaceholder="e.g. Biology"
        title="Write Like a Sample"
        currentValue={style.enabled === 'on' ? 'on' : 'off'}
        globalValue={style.enabled === 'on' ? 'on' : 'off'}
        onGlobalChange={(v) => set('ai.style', { ...style, enabled: v === 'on' ? 'on' : 'off' })}
        description="On = the agents match the samples' voice (vocabulary, rhythm, punctuation, structure). Add an override per subject or assignment, or leave Global for every chat."
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-200 font-medium">Write Like a Sample</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              The agent writes in the voice of your samples — add one below, pick it globally or per
              subject/assignment. Works alongside the AI Detection Standard.
            </div>
          </div>
          <Toggle
            checked={style.enabled === 'on'}
            onChange={(v) => set('ai.style', { ...style, enabled: v ? 'on' : 'off' })}
            label="Sample voice"
          />
        </div>
      </ScopedSetting>

      {/* Sample library */}
      <div className="border-t border-[var(--border-subtle)] pt-2 space-y-2">
        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide pb-1">
          Samples ({sampleList.length})
        </div>
        {sampleList.length === 0 && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            No samples yet — add one with the button below, or upload a .txt / .md file. 1 to 3
            samples get injected per chat.
          </p>
        )}
        <div className="space-y-1.5">
          {sampleList.map((sm) => (
            <div key={sm.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[11px]">
              <span className="text-slate-200 font-medium truncate">{sm.name}</span>
              <span className="text-[9px] text-slate-500 shrink-0">{sm.text.length} chars · {sm.text.split(/\s+/).filter(Boolean).length} words</span>
              <span className="flex-1" />
              <span className="text-[9px] font-semibold uppercase tracking-wider shrink-0">
                <span className="text-slate-500">global </span>
                <button type="button"
                  onClick={() => toggleGlobal(sm.id)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition border ${
                    sel.includes(sm.id)
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-semibold'
                      : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
                  }`}
                >
                  {sel.includes(sm.id) ? 'on' : 'off'}
                </button>
              </span>
              <button type="button" aria-label={`Delete sample ${sm.name}`} onClick={() => removeSample(sm.id)}
                className="w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowAdd(!showAdd)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-[var(--border-subtle)] text-[10px] text-slate-400 hover:text-slate-200 hover:border-[rgba(139,92,246,0.45)] hover:bg-white/4 transition cursor-pointer">
            <Plus className="w-3 h-3" /> {showAdd ? 'Close' : 'Add sample'}
          </button>
          <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-[var(--border-subtle)] text-[10px] text-slate-400 hover:text-slate-200 hover:border-[rgba(139,92,246,0.45)] hover:bg-white/4 transition cursor-pointer">
            <Upload className="w-3 h-3" /> Upload .txt / .md
            <input type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={onFile} />
          </label>
          {flash && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> saved</span>}
        </div>
        {showAdd && (
          <div className="p-3 rounded-lg bg-white/3 border border-[var(--border-subtle)] space-y-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              className="clean-input w-full px-3 py-1.5 text-[11px] outline-none" placeholder="Sample name (e.g. My essay style)" aria-label="Sample name" />
            <textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={4}
              className="clean-input w-full px-3 py-1.5 text-[11px] text-white resize-y" placeholder="Paste the writing sample here…" aria-label="Sample text" />
            <div className="flex items-center justify-end gap-2">
              <span className="text-[9px] text-slate-500">{newText.length.toLocaleString()} chars</span>
              <button type="button" onClick={addSample} disabled={!newText.trim()}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                Save sample
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Per-scope sample selection */}
      <div className="border-t border-[var(--border-subtle)] pt-2">
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => { setExpanded(!expanded); if (!expanded) openVariant(null); }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[10px] text-slate-400 hover:text-slate-200 hover:border-[rgba(139,92,246,0.45)] transition cursor-pointer"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Collapse' : 'Pick samples per subject / assignment'}
            {(scoped['ai.style.samples'] || []).length > 0 && !expanded && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">{(scoped['ai.style.samples'] || []).length}</span>
            )}
          </button>
        </div>
        {expanded && (
          <div className="mt-2 p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3"
            onKeyDown={(e) => { if (e.key === 'Escape') { setExpanded(false); setEditingId(null); } }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {editingId ? 'Editing variant' : 'New variant'} — sample selection
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Pick 1 or more samples (none = the global selection applies). Most-specific scope
              wins: assignment &gt; subject &gt; global.
            </p>
            {sampleList.length === 0 ? (
              <p className="text-[10px] text-slate-500">Add a sample first — nothing to pick yet.</p>
            ) : (
              <div className="space-y-1">
                {sampleList.map((sm) => (
                  <label key={sm.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] transition cursor-pointer ${
                    pick.includes(sm.id) ? 'bg-[var(--accent-subtle)] border-[var(--accent)]' : 'bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] hover:border-[rgba(139,92,246,0.4)]'
                  }`}>
                    <input type="checkbox" checked={pick.includes(sm.id)}
                      onChange={() => setPick(pick.includes(sm.id) ? pick.filter((x) => x !== sm.id) : [...pick, sm.id])}
                      className="accent-[var(--accent)]" />
                    <span className="text-slate-200 font-medium truncate">{sm.name}</span>
                    <span className="text-[9px] text-slate-500 shrink-0">{sm.text.length} chars</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <select value={levelKey} onChange={(e) => { setLevelKey(e.target.value); setRef(''); }}
                aria-label="Scope level"
                className="clean-input px-2.5 py-1.5 text-[11px] outline-none bg-[var(--bg-surface-elevated)]">
                <option value="subject">Subject</option>
                <option value="assignment">Assignment</option>
              </select>
              <input value={ref} onChange={(e) => setRef(e.target.value)}
                placeholder={levelKey === 'subject' ? 'e.g. Biology' : 'e.g. Chapter 5 test'}
                list={levelKey === 'subject' && subjectRefs.length ? 'scoped-refs-subjects' : undefined}
                className="clean-input flex-1 min-w-[140px] px-3 py-1.5 text-[11px] outline-none"
                aria-label="Where this selection applies" />
              <button type="button" onClick={applyVariant} disabled={!ref.trim()}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {editingId ? 'Save selection' : '+ Add selection'}
              </button>
            </div>
            {(scoped['ai.style.samples'] || []).length > 0 && (
              <div className="pt-1 border-t border-white/6 space-y-1.5">
                {(scoped['ai.style.samples'] || []).map((v) => (
                  <div key={v.id}
                    className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] transition cursor-pointer ${
                      editingId === v.id ? 'bg-[var(--accent-subtle)] border-[var(--accent)]' : 'bg-[var(--bg-surface-elevated)] border-[var(--border-subtle)] hover:border-[rgba(139,92,246,0.4)]'
                    }`}
                    onClick={() => openVariant(v)}>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">{v.scope.level}</span>
                    <span className="text-slate-200 font-medium truncate">{v.scope.ref}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-[var(--accent)] font-semibold truncate">
                      {Array.isArray(v.value) && v.value.length
                        ? v.value.map((id) => byId(id)?.name).filter(Boolean).join(', ') || `${v.value.length} samples`
                        : 'Global selection'}
                    </span>
                    <span className="flex-1" />
                    <button type="button" aria-label={`Delete selection ${v.scope.ref}`}
                      onClick={(e) => { e.stopPropagation(); removeVariant(v.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded-md text-slate-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AISection({ s, set, scoped, setVariants, subjectRefs }) {
  const ai = s.ai || {};

  return (
    <div className="space-y-6">
      {/* Identity & Personality */}
      <div className="panel p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-200 mb-1.5">AI Assistant Name</label>
            <input
              value={ai.aiName || 'Helpotron'}
              onChange={(e) => set('ai.aiName', e.target.value)}
              className="clean-input w-full px-3 py-2 text-xs text-white"
              aria-label="AI name"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-200 mb-2">Persona & Tone</label>
          <div className="flex flex-wrap gap-1.5">
            {PERSONALITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set('ai.personality', p)}
                className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs transition cursor-pointer border ${
                  ai.personality === p
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[rgba(139,92,246,0.35)] font-semibold'
                    : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-200 mb-1.5">Custom Instructions</label>
          <textarea
            value={ai.instructions || ''}
            onChange={(e) => set('ai.instructions', e.target.value)}
            rows={3}
            className="clean-input w-full px-3 py-2 text-xs text-white resize-y"
            placeholder="Describe how your AI should interact with you and format output…"
            aria-label="AI interaction instructions"
          />
        </div>
      </div>

      {/* Model Effort & Routing */}
      <div className="panel p-5 space-y-4">
        <EffortSlider
          value={ai.effortScore ?? 500}
          onChange={(v) => {
            set('ai.effortScore', v);
            set('ai.effort', v <= 300 ? 'low' : v <= 700 ? 'balanced' : 'high');
          }}
        />

        <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
          <div>
            <div className="text-xs text-slate-200 font-medium">Automatic Task Routing</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Dynamically routes simple queries to fast models and complex assignments to flagship models.</div>
          </div>
          <Toggle
            checked={ai.autoRouting !== false}
            onChange={(v) => set('ai.autoRouting', v)}
            label="Auto routing"
          />
        </div>
      </div>

      {/* AI Detection Standard (08-31, operator): the plugged-in detectors
          with a minimum human score rate — finished replies that miss it are
          redone until they pass (capped, best effort). Same global / subject /
          assignment scope chain as the humanizer. */}
      <div className="panel p-5 space-y-3">
        <ScopedSetting
          path="ai.detection.enabled"
          variants={(scoped['ai.detection.enabled'] || [])}
          setVariants={setVariants}
          levels={[
            { key: 'subject', label: 'Subject' },
            { key: 'assignment', label: 'Assignment' },
          ]}
          values={[{ key: 'on', label: 'On' }, { key: 'off', label: 'Off' }]}
          refs={subjectRefs}
          refPlaceholder="e.g. Biology"
          title="AI Detection Standard"
          currentValue={(ai.detection || {}).enabled === 'on' ? 'on' : 'off'}
          globalValue={(ai.detection || {}).enabled === 'on' ? 'on' : 'off'}
          onGlobalChange={(v) => set('ai.detection', { ...(ai.detection || {}), enabled: v === 'on' ? 'on' : 'off' })}
          description="When on, finished replies are scored by the detectors below — if they don't meet the minimum human rate, the agent redrafts them (up to 2 redrafts, keeps the best score)."
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-200 font-medium">AI Detection Standard</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Score every finished reply with the AI detectors, and redo it until it reads human
                enough. Turn individual detectors on/off below.
              </div>
            </div>
            <Toggle
              checked={(ai.detection || {}).enabled === 'on'}
              onChange={(v) => set('ai.detection', { ...(ai.detection || {}), enabled: v ? 'on' : 'off' })}
              label="Detection"
            />
          </div>
        </ScopedSetting>

        <ScopedSetting
          path="ai.detection.min_human"
          variants={(scoped['ai.detection.min_human'] || [])}
          setVariants={setVariants}
          levels={[
            { key: 'subject', label: 'Subject' },
            { key: 'assignment', label: 'Assignment' },
          ]}
          slider={{ min: 50, max: 95, step: 5 }}
          refs={subjectRefs}
          refPlaceholder="e.g. Biology"
          title="Minimum human score"
          currentValue={Number((ai.detection || {}).min_human ?? 70)}
          globalValue={Number((ai.detection || {}).min_human ?? 70)}
          onGlobalChange={(v) => set('ai.detection', { ...(ai.detection || {}), min_human: Number(v) })}
          description="Replies must score at least this % human (70 = at least 70% human). Higher = stricter standard; more redrafts."
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-200 font-medium">Minimum human score</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Replies below this human-rate get redone until they meet it.
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-[var(--accent)]">
              {(ai.detection || {}).min_human ?? 70}% human
            </span>
          </div>
        </ScopedSetting>

        <div className="border-t border-[var(--border-subtle)] pt-2">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide pb-2">
            Detectors (the ones plugged in)
          </div>
          <div className="space-y-1.5">
            {DETECTORS.map(([key, label]) => (
              <Toggle
                key={key}
                checked={((ai.detection || {}).detectors || {})[key] !== false}
                onChange={(v) =>
                  set('ai.detection', {
                    ...(ai.detection || {}),
                    detectors: { ...((ai.detection || {}).detectors || {}), [key]: !!v },
                  })
                }
                label={label}
              />
            ))}
          </div>
          <p className="text-[9px] text-slate-500 mt-1.5 leading-relaxed">
            In use: Sapling + Pangram (08-31). Winston AI costs 1 credit per word and stays off
            until the account is topped up — flip it on whenever. The two built-in readability
            analyzers always run; detectors without a configured key are skipped automatically.
          </p>
        </div>
      </div>

      {/* Sample Voice (08-31, operator): write like a sample — voice-matched
          generation from user samples, global or per subject/assignment. */}
      <SampleVoicePanel s={s} set={set} scoped={scoped} setVariants={setVariants} subjectRefs={subjectRefs} />

      {/* Humanizer skill (08-30, reworked 08-31 per operator): unified
          AI-humanizer rulebook. Hierarchy is global / subject / assignment —
          the standard settings scope chain, NOT agent surfaces. Overrides
          apply when the agent is working in that subject or assignment. */}
      <div className="panel p-5 space-y-3">
        <ScopedSetting
          path="ai.humanizer"
          variants={(scoped['ai.humanizer'] || [])}
          setVariants={setVariants}
          levels={[
            { key: 'subject', label: 'Subject' },
            { key: 'assignment', label: 'Assignment' },
          ]}
          values={[{ key: 'on', label: 'On' }, { key: 'off', label: 'Off' }]}
          refs={subjectRefs}
          refPlaceholder="e.g. Biology"
          title="Humanizer Skill"
          currentValue={ai.humanizer === 'on' ? 'on' : 'off'}
          globalValue={ai.humanizer === 'on' ? 'on' : 'off'}
          onGlobalChange={(v) => set('ai.humanizer', v === 'on' ? 'on' : 'off')}
          description="Global applies to every chat. Add an override to turn the humanizer on or off for one subject or assignment only (the agent picks the most specific match)."
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-200 font-medium">Humanizer Skill</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Rewrites and generates prose to read human — unified rulebook (burstiness, banned
                vocabulary, em-dash budget, pattern strip, audit-revise loop). Injected into the
                agent's system prompt when it's on for the current chat.
              </div>
            </div>
            <Toggle
              checked={ai.humanizer === 'on'}
              onChange={(v) => set('ai.humanizer', v ? 'on' : 'off')}
              label="Humanizer"
            />
          </div>
        </ScopedSetting>
      </div>

      {/* Intelligence Profile Sliders */}
      <div className="panel p-5 space-y-4">
        <div className="text-xs font-medium text-slate-200">Intelligence Tuning</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {INTELLIGENCE.map((f) => (
            <Slider
              key={f.key}
              label={f.label}
              value={ai[f.key] ?? 70}
              onChange={(v) => set(`ai.${f.key}`, v)}
              format={(v) => v}
            />
          ))}
        </div>
      </div>

      {/* Telegram bot ↔ My Agent (08-31, operator): paste your own bot token
          from @BotFather; the API polls it and turns your messages into My
          Agent instructions (1 credit each), replying with the result. */}
      <TelegramAgentCard />
    </div>
  );
}

/* ── Telegram bot ↔ My Agent ─────────────────────────────────────────────── */

function TelegramAgentCard() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    api.telegramAgentStatus().then(setStatus).catch(() => setStatus(null));
  };
  useEffect(refresh, []);

  const connect = async () => {
    if (!token.trim()) { setError('Paste the bot token first.'); return; }
    setBusy(true); setError('');
    try {
      await api.telegramAgentConnect(token.trim());
      setToken('');
      refresh();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true); setError('');
    try {
      await api.telegramAgentDisconnect();
      refresh();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const connected = !!(status && status.connected);

  return (
    <div className="panel p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-200">Telegram Bot</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Connect your own bot to My Agent — text it a task and the agent does it and
            replies here in Telegram (1 credit per instruction).
          </div>
        </div>
      </div>

      {connected && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${status.status === 'error' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
            {status.status === 'error' ? '● error' : '● connected'}
          </span>
          <span className="text-slate-300">@{status.bot_username}</span>
          <span className="text-slate-500">
            {status.chat_linked ? '· chat linked' : '· waiting for first message — send /start to your bot'}
          </span>
          {status.sessions_run > 0 && <span className="text-slate-500">· {status.sessions_run} instruction{status.sessions_run === 1 ? '' : 's'} run</span>}
        </div>
      )}
      {connected && status.status === 'error' && status.last_error && (
        <p className="text-[11px] text-red-300">{status.last_error}</p>
      )}

      {!connected ? (
        <div className="space-y-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
            placeholder="123456789:AAAA-your-botfather-token"
            className="w-full bg-[var(--bg-surface-elevated)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            aria-label="Telegram bot token"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={connect}
              disabled={busy}
              className="bg-[var(--accent)] text-white text-xs font-semibold rounded-lg px-4 py-2 hover:opacity-85 disabled:opacity-50"
            >
              {busy ? 'Connecting…' : 'Connect bot'}
            </button>
            <button
              onClick={disconnect}
              disabled={busy}
              className="bg-slate-700 text-slate-200 text-xs font-medium rounded-lg px-4 py-2 hover:bg-slate-600 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            No bot yet? In Telegram: <span className="text-slate-400">@BotFather → /newbot → name it → paste the token here.</span>{' '}
            Your token stays on your account only.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={disconnect}
            disabled={busy}
            className="bg-slate-700 text-slate-200 text-xs font-medium rounded-lg px-4 py-2 hover:bg-slate-600 disabled:opacity-50"
          >
            {busy ? 'Disconnecting…' : 'Disconnect bot'}
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-red-300">{error}</p>}
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
    if (key === 'ai') return (
      <div className="space-y-4">
        <div className="clean-card p-4">{quickPresets}</div>
        <AISection s={settings} set={set} scoped={scoped} setVariants={setVariants} subjectRefs={subjectRefs} />
      </div>
    );
    return <SettingsSections section={key} s={settings} set={set} scoped={scoped} setVariants={setVariants} subjectRefs={subjectRefs} userId={userId} onGoTo={onGoTo} plan={plan} credits={credits} tokenBalance={tokenBalance} isAdmin={isAdmin} />;
  };

  /* One-click behavioral presets — rendered inside the AI section with the
   * engine config (08-30 de-clunk: they used to be the first block on the
   * Settings page, above Account, reading as theme chooser buttons). */
  const quickPresets = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
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
    </>
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Toolbar: search + save flash */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="w-full px-4 py-3 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
          />
          <AnimatePresence>
            {savedFlash && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="font-label-caps text-xs uppercase px-3 py-1 rounded-full bg-primary/15 text-primary font-semibold shrink-0"
              >
                <Check className="w-3.5 h-3.5 inline mr-1" /> Saved
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* The settings themselves: a simple name, maximize to the whole menu. */}
      {visibleSections.map((sec) => {
        const Icon = sec.icon;
        const open = section === sec.key;
        return (
          <div key={sec.key} className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl overflow-hidden shadow-sm transition-all duration-150">
            <button
              type="button"
              onClick={() => setSection(open ? null : sec.key)}
              aria-expanded={open}
              className={`w-full flex items-center gap-4 px-6 py-4 text-left transition cursor-pointer ${
                open ? 'bg-surface-container-low/60' : 'hover:bg-surface-container-low/40'
              }`}
            >
              <span className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center transition ${
                open ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-high text-on-surface-variant'
              }`}>
                <Icon className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-title-md text-base text-on-surface">{sec.label}</span>
                <span className="block font-body-sm text-xs text-on-surface-variant truncate mt-0.5">{sec.desc}</span>
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-on-surface-variant transition-transform duration-200 ${open ? 'rotate-180 text-primary' : ''}`} />
            </button>
            {open && (
              <div className="px-6 pb-6 pt-4 border-t border-outline-variant/20 bg-surface-container-lowest">
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
          </div>
        );
      })}
      {visibleSections.length === 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-12 text-center text-on-surface-variant font-body-sm text-xs">
          <p>No settings match “{search}”</p>
        </div>
      )}
    </div>
  );
}

// module-level timer handle so the save flash never leaks
const settingsApp = { _t: null };

export default SettingsApp;
