/* ────────────────────────────────────────────────────────────────────────────
 * SettingsApp.jsx — the settings workspace (replaces the 126 KB modal).
 * Shell: two-pane layout (section list → section page), progressive
 * disclosure (Simple / Advanced / Expert), live persistence to the OS
 * settings store. Appearance ships with a live preview panel.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion';
import { Check, ChevronRight, Palette, Bot, GraduationCap, PenLine, Zap, Bell, Shield, CreditCard, Puzzle, Keyboard, BarChart3, FlaskConical, Accessibility, Globe, Wrench, User } from 'lucide-react';
import { loadSettings, saveSettings, EFFORT_SCORES } from '../demoData.js';
import { Badge, Toggle, Slider } from './ui/os.jsx';
import { SettingsSections } from './SettingsSections.jsx';

const SECTIONS = [
  { key: 'account', label: 'Account', icon: User, desc: 'Name, avatar, plan' },
  { key: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme, accent, density, background, UI style' },
  { key: 'ai', label: 'AI & Intelligence', icon: Bot, desc: 'Effort, personality, routing, intelligence profile' },
  { key: 'academic', label: 'Academic Profile', icon: GraduationCap, desc: 'Education, subjects, learning style, goals' },
  { key: 'writing', label: 'Writing & Output', icon: PenLine, desc: 'Writing DNA, saved profiles, citation style' },
  { key: 'automation', label: 'Automation', icon: Zap, desc: 'Permissions, safety controls, approval gates' },
  { key: 'notifications', label: 'Notifications', icon: Bell, desc: 'What tells you about what' },
  { key: 'privacy', label: 'Privacy & Security', icon: Shield, desc: 'Data usage, export, delete' },
  { key: 'billing', label: 'Credits & Billing', icon: CreditCard, desc: 'Balance, plans, invoices' },
  { key: 'integrations', label: 'Integrations', icon: Puzzle, desc: 'Canvas, Drive, Notion, Telegram' },
  { key: 'extension', label: 'Browser Extension', icon: Keyboard, desc: 'Recorder, auto-capture, badge' },
  { key: 'shortcuts', label: 'Shortcuts', icon: Keyboard, desc: 'Palette, search, wallet' },
  { key: 'data', label: 'Data & Analytics', icon: BarChart3, desc: 'Digest, streaks, accuracy tracking' },
  { key: 'experimental', label: 'Experimental', icon: FlaskConical, desc: 'Unstable but exciting' },
  { key: 'accessibility', label: 'Accessibility', icon: Accessibility, desc: 'Motion, contrast, text size' },
  { key: 'language', label: 'Language & Region', icon: Globe, desc: 'Locale, timezone, units' },
  { key: 'advanced', label: 'Advanced', icon: Wrench, desc: 'Debug, config, raw JSON' },
];

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

function AISection({ s, set }) {
  const ai = s.ai;
  return (
    <div className="space-y-7">
      {/* Effort — the one control that matters */}
      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">AI Effort</div>
        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
          The only routing control you need. Low effort = cheap engines do mechanical work. High effort = flagship engines handle complex reasoning. Helpotron picks the right engine for each task automatically.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Object.entries({ low: 'Low', balanced: 'Balanced', high: 'High' }).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set('ai.effort', k)}
              className={`p-4 rounded-xl border text-left transition cursor-pointer ${
                ai.effort === k ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/8 bg-slate-950/40 hover:border-white/15'
              }`}
            >
              <div className="text-xs font-bold text-white">{label}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {k === 'low' && 'Mechanical tasks → fast engine. Best value.'}
                {k === 'balanced' && 'Routine work balanced, complex escalates.'}
                {k === 'high' && 'Research & reasoning → flagship engine.'}
              </div>
              <div className="text-[10px] font-mono text-slate-600 mt-2">effort {EFFORT_SCORES[k]}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-white/6">
          <div>
            <div className="text-xs text-slate-200 font-medium">Auto routing</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Let Helpotron select the optimal engine based on task complexity.</div>
          </div>
          <Toggle checked={ai.autoRouting} onChange={(v) => set('ai.autoRouting', v)} label="Auto routing" />
        </div>
      </div>

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
    </div>
  );
}

/* ── Main settings workspace ─────────────────────────────────────────────── */
export default function SettingsApp({ userId, onGoTo }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const [section, setSection] = useState('appearance');
  const [savedFlash, setSavedFlash] = useState(false);

  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(settings));
    const keys = path.split('.');
    let obj = next;
    while (keys.length > 1) {
      obj = obj[keys.shift()];
    }
    obj[keys[0]] = value;
    setSettingsState(next);
    saveSettings(next);
    setSavedFlash(true);
    clearTimeout(settingsApp._t);
    settingsApp._t = setTimeout(() => setSavedFlash(false), 1200);
  };

  const current = SECTIONS.find((s) => s.key === section);
  const isSimple = settings.displayMode === 'simple';
  const isExpert = settings.displayMode === 'expert';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
      {/* Section list */}
      <div className="clean-card p-3 h-fit sticky top-20">
        {/* Progressive disclosure */}
        <div className="px-2 pb-3 mb-2 border-b border-white/8">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Display mode</div>
          <div className="grid grid-cols-3 gap-1">
            {[['simple', 'Simple'], ['advanced', 'Advanced'], ['expert', 'Expert']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => set('displayMode', k)}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition cursor-pointer ${
                  settings.displayMode === k ? 'bg-blue-600 text-white' : 'bg-white/4 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">
            {isSimple && 'Simple: the essentials — quality, style, level, notifications.'}
            {settings.displayMode === 'advanced' && 'Advanced: routing, temperature, token budgets, fallbacks.'}
            {isExpert && 'Expert: raw configuration and experimental features.'}
          </p>
        </div>

        <nav className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-1">
          {SECTIONS.map((sec) => {
            if (isSimple && ['data', 'experimental', 'advanced', 'shortcuts', 'language'].includes(sec.key)) return null;
            if (isExpert && ['data', 'experimental', 'advanced'].includes(sec.key)) return null;
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
        </nav>
      </div>

      {/* Section page */}
      <div className="clean-card p-6 min-w-0">
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/8">
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

        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {section === 'appearance' && <AppearanceSection s={settings} set={set} />}
            {section === 'ai' && <AISection s={settings} set={set} />}
            {section !== 'appearance' && section !== 'ai' && (
              <SettingsSections section={section} s={settings} set={set} userId={userId} onGoTo={onGoTo} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// module-level timer handle so the save flash never leaks
const settingsApp = { _t: null };
