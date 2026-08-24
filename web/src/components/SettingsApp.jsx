// export target: web/src/components/SettingsApp.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * SettingsApp.jsx — the settings workspace (replaces the 126 KB modal).
 * Shell: two-pane layout (section list → section page), progressive
 * disclosure (Simple / Advanced / Expert), live persistence to the OS
 * settings store. Appearance ships with a live preview panel.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import { Check, ChevronRight, Palette, Bot, GraduationCap, PenLine, Zap, Bell, Shield, CreditCard, Puzzle, Keyboard, BarChart3, FlaskConical, Accessibility, Globe, Wrench, User } from 'lucide-react';
import { loadSettings, saveSettings, EFFORT_SCORES, DEFAULT_SETTINGS } from '../demoData.js';
import { Badge, Toggle, Slider } from './ui/os.jsx';
import { SettingsSections } from './SettingsSections.jsx';
import SectionCard from './SectionCard.jsx';
import ScopedSetting, { SCOPE_LEVELS } from './ScopedSetting.jsx';

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
            <div className="text-[8px] mt-1" style={{ color: sub }}>Biology draft is ready.</div>
            <div className="h-1.5 rounded-full mt-2" style={{ width: '80%', background: `linear-gradient(90deg, ${accentBg.replace('bg-', '#')}cc, ${accentBg.replace('bg-', '#')}44)` }} />
          </div>
          <div className="rounded-lg" style={{ background: light ? '#f1f5f9' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}`, padding: densityPad }}>
            <div className="text-[9px] font-semibold" style={{ color: text }}>Credits</div>
            <div className="text-[8px] font-mono mt-1" style={{ color: accentText }}>10,029</div>
            <div className="text-[7px] mt-1" style={{ color: sub }}>projected 9,659</div>
          </div>
          <div className="col-span-2 rounded-lg" style={{ background: light ? '#f1f5f9' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}`, padding: densityPad }}>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentBg }} />
              <div className="text-[8px] font-semibold" style={{ color: text }}>Calculus Problem Set</div>
              <span className="ml-auto text-[7px] px-1 rounded" style={{ background: 'rgba(245,158,11,0.2)', color: '#d97706' }}>due tomorrow</span>
            </div>
            <div className="h-1 rounded-full mt-1.5" style={{ width: '55%', background: 'rgba(245,158,11,0.35)' }} />
          </div>
          <div className="rounded-lg" style={{ background: light ? '#f1f5f9' : 'rgba(255,255,255,0.04)', border: `1px solid ${border}`, padding: densityPad }}>
            <div className="text-[8px] font-semibold" style={{ color: text }}>Study streak</div>
            <div className="text-[10px] font-black mt-1" style={{ color: accentText }}>12 days</div>
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
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 font-semibold'
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
function AppearanceSection({ s, set }) {
  const a = s.appearance;
  return (
    <div className="space-y-6">
      <ChipRow label="Theme" options={THEMES} value={a.theme} onChange={(v) => set('appearance.theme', v)} />
      <ChipRow label="Accent" options={ACCENTS} value={a.accent} onChange={(v) => set('appearance.accent', v)} />
      <ChipRow label="Interface density" options={DENSITIES} value={a.density} onChange={(v) => set('appearance.density', v)} />
      <ChipRow label="Animation" options={ANIMATIONS} value={a.animation} onChange={(v) => set('appearance.animation', v)} />
      <ChipRow label="Background" options={BACKGROUNDS} value={a.background} onChange={(v) => set('appearance.background', v)} />
      <ChipRow label="UI style" options={UI_STYLES} value={a.uiStyle} onChange={(v) => set('appearance.uiStyle', v)} />
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-medium text-slate-300">Font size</div>
          <div className="text-xs font-mono font-bold text-blue-300">
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
          className="w-full accent-blue-500 cursor-pointer"
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

function EffortSlider({ value, onChange }) {
  const n = Number(value || 500);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-slate-300">AI Effort</div>
        <div className="text-xs font-mono font-bold text-blue-300">{n} <span className="text-[10px] text-slate-500">/ 1000</span></div>
      </div>
      <input
        type="range"
        min={1}
        max={1000}
        step={1}
        value={n}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500 cursor-pointer"
        aria-label="AI effort score between 1 and 1000"
      />
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>1 — cheap & fast</span>
        <span className="text-slate-400">500 — balanced</span>
        <span>1000 — flagship research</span>
      </div>
    </div>
  );
}

function AISection({ s, set, scoped, setVariants, subjectRefs }) {
  const ai = s.ai;
  const aiEffort = Number(ai.effortScore ?? EFFORT_SCORES[ai.effort] ?? 500);
  const setEffort = (v) => {
    set('ai.effortScore', v);
    set('ai.effort', v <= 250 ? 'low' : v <= 750 ? 'balanced' : 'high');
  };
  return (
    <div className="space-y-7">
      {/* Effort — the one control that matters */}
      <ScopedSetting
        path="ai.effort"
        title="AI effort"
        variants={scoped['ai.effort']}
        setVariants={setVariants}
        slider={{ min: 1, max: 1000, step: 1 }}
        refs={subjectRefs}
        refPlaceholder="e.g. Biology"
        description="Low effort = fast cheap engines on mechanical work. High effort = flagship research engines on hard problems. Best per course, not globally."
      >
        <EffortSlider value={aiEffort} onChange={setEffort} />
      </ScopedSetting>

      <ScopedSetting
        path="ai.autoRouting"
        title="Auto routing"
        variants={scoped['ai.autoRouting']}
        setVariants={setVariants}
        values={[{ key: true, label: 'On' }, { key: false, label: 'Off' }]}
        refs={subjectRefs}
        description="Lets Helpotron route each task to the engine its difficulty deserves. Override per subject if a particular course always needs one."
      >
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/6">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 p-4 rounded-xl bg-slate-950/40 border border-white/6">
          {INTELLIGENCE.map((f) => (
            <Slider key={f.key} label={f.label} value={ai[f.key]} onChange={(v) => set(`ai.${f.key}`, v)} format={(v) => v} />
          ))}
        </div>
      </div>

      {/* Routing by task (tier labels, never model names) */}
      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Task routing</div>
        <p className="text-[11px] text-slate-500 mb-3">How each task type is routed at your current effort level.</p>
        <div className="rounded-xl overflow-hidden border border-white/8">
          {[
            ['OCR', 'Fast tier', 'green'],
            ['Transcription', 'Fast tier', 'green'],
            ['Summarization', 'Fast tier', 'green'],
            ['Writing', 'Balanced tier', 'blue'],
            ['Image analysis', 'Balanced tier', 'blue'],
            ['Research', ai.effort === 'high' ? 'Flagship tier' : 'Balanced tier', ai.effort === 'high' ? 'purple' : 'blue'],
            ['Reasoning', ai.effort === 'high' ? 'Flagship tier' : 'Balanced tier', ai.effort === 'high' ? 'purple' : 'blue'],
          ].map(([task, tier, color], i) => (
            <div key={task} className={`flex items-center justify-between px-4 py-2.5 ${i % 2 ? 'bg-slate-950/40' : ''} text-xs`}>
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
                  ai.personality === p ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 font-semibold' : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
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
const fontScaleMultiplier = (score) => 0.6 + Math.max(0, Math.min(100, Number(score) || 50)) * 0.008; // 1→0.61, 50→1.0, 100→1.4
export function applyFontScale(score) {
  const m = fontScaleMultiplier(score);
  document.documentElement.style.fontSize = `${16 * 1.1 * m}px`;
  document.documentElement.style.setProperty('--font-scale', String(m));
}

export function SettingsApp({ userId, onGoTo }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [section, setSection] = useState('appearance');
  const [savedFlash, setSavedFlash] = useState(false);
  const [search, setSearch] = useState('');
  const [presetConfirm, setPresetConfirm] = useState(null);

  /* Live font scaling as the slider moves. */
  useEffect(() => {
    applyFontScale(settings.appearance?.fontScale);
  }, [settings.appearance?.fontScale]);

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

  const current = SECTIONS.find((s) => s.key === section);
  const q = search.trim().toLowerCase();
  const visibleSections = SECTIONS.filter((sec) => !q || `${sec.label} ${sec.desc}`.toLowerCase().includes(q));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
      {/* Section list */}
      <SectionCard id="settings-nav" padding="p-3" className="h-fit" header={
        <div className="px-2 pb-3 border-b border-white/8">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Quick preset</div>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(PROFILE_PRESETS).map(([k, p]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPresetConfirm(k)}
                title={p.tagline}
                className="w-full px-2.5 py-2 rounded-lg text-[11px] font-medium transition cursor-pointer bg-white/4 text-slate-300 hover:text-slate-100 hover:bg-white/10"
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
        </div>
      }>

        <div className="px-2 pt-2 pb-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="clean-input w-full px-3 py-2 text-[11px] outline-none"
          />
        </div>

        <nav className="space-y-0.5 pr-1">
          {['simple', 'advanced', 'expert'].map((tier) => {
            const items = visibleSections.filter((sec) => sec.tier === tier);
            if (items.length === 0) return null;
            return (
              <div key={tier}>
                <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{tier}</span>
                  <span className="flex-1 h-px bg-white/6" />
                </div>
                {items.map((sec) => {
                  const Icon = sec.icon;
                  const active = section === sec.key;
                  return (
                    <button
                      key={sec.key}
                      type="button"
                      onClick={() => setSection(sec.key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                        active ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-medium truncate">{sec.label}</span>
                        <span className="block text-[9px] text-slate-500 truncate">{sec.desc}</span>
                      </span>
                      {active && <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {visibleSections.length === 0 && (
            <div className="px-3 py-6 text-center text-[10px] text-slate-600">No settings match “{search}”</div>
          )}
        </nav>
      </SectionCard>

      {/* Section page */}
      <SectionCard id="settings-section" padding="p-6" className="min-w-0" header={
        <div className="flex items-center justify-between w-full border-b border-white/8">
          <div>
            <div className="flex items-center gap-2">
              <current.icon className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">{current.label}</h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{current.desc}</p>
          </div>
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

        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {section === 'appearance' && <AppearanceSection s={settings} set={set} />}
            {section === 'ai' && <AISection s={settings} set={set} scoped={scoped} setVariants={setVariants} subjectRefs={subjectRefs} />}
            {section !== 'appearance' && section !== 'ai' && (
              <SettingsSections section={section} s={settings} set={set} scoped={scoped} setVariants={setVariants} subjectRefs={subjectRefs} userId={userId} onGoTo={onGoTo} />
            )}
          </motion.div>
        </AnimatePresence>
      </SectionCard>
    </div>
  );
}

// module-level timer handle so the save flash never leaks
const settingsApp = { _t: null };

export default SettingsApp;
