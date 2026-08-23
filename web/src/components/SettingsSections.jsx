/* ────────────────────────────────────────────────────────────────────────────
 * SettingsSections.jsx — the remaining settings pages (everything except
 * Appearance and AI, which live in SettingsApp.jsx). Each section is a real
 * form bound to the OS settings store.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useRef, useState } from 'react';
import { Download, Trash2, KeyRound, ExternalLink, Camera } from 'lucide-react';
import { Toggle, Slider, Badge, Progress } from './ui/os.jsx';
import api from '../api.js';

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'clean-input w-full px-3 py-2 text-xs outline-none';

/* ── ACCOUNT ─────────────────────────────────────────────────────────────── */
function AccountSection({ s, set, userId }) {
  return (
    <div className="space-y-5 max-w-md">
      <div className="flex items-center gap-4 pb-4 border-b border-white/8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl font-black text-white overflow-hidden">
          {s.profile.avatarUrl
            ? <img src={s.profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            : (s.profile.displayName?.[0] || 'R')}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{s.profile.displayName || userId}</div>
          <div className="text-[11px] text-slate-500 font-mono">{userId}</div>
          <Badge color="purple" className="mt-1">Elite plan</Badge>
        </div>
      </div>
      <Field label="Display name">
        <input value={s.profile.displayName} onChange={(e) => set('profile.displayName', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Email" hint="Managed by your sign-in provider.">
        <input value={`${userId || 'you'}@helpotron.app`} readOnly className={`${inputCls} opacity-50`} />
      </Field>
      <Field label="Password">
        <button type="button" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer">
          <KeyRound className="w-3.5 h-3.5" /> Change password
        </button>
      </Field>
    </div>
  );
}

/* ── ACADEMIC PROFILE ────────────────────────────────────────────────────── */
function AcademicSection({ s, set }) {
  const updateSubject = (subject, level) => {
    const next = JSON.parse(JSON.stringify(s.subjects));
    next[subject] = level;
    set('subjects', next);
  };
  /* Per-subject cover image (PNG/JPG → api.uploadAvatar kind='subject') */
  const subjectImgRefs = useRef({});
  const uploadSubjectImage = async (subject, file) => {
    const res = await api.uploadAvatar(file, 'subject', subject).catch(() => null);
    const url = res?.url || (file ? URL.createObjectURL(file) : '');
    if (!url) return;
    const next = { ...(s.subjectImages || {}), [subject]: url };
    set('subjectImages', next);
  };
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
        <Field label="Education level">
          <select value={s.profile.educationLevel} onChange={(e) => set('profile.educationLevel', e.target.value)} className={inputCls + ' cursor-pointer'}>
            {['High School', 'Undergraduate', 'Graduate', 'Professional'].map((l) => <option key={l} className="bg-slate-900">{l}</option>)}
          </select>
        </Field>
        <Field label="Major">
          <input value={s.profile.major} onChange={(e) => set('profile.major', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Year">
          <select value={s.profile.year} onChange={(e) => set('profile.year', e.target.value)} className={inputCls + ' cursor-pointer'}>
            {['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'].map((y) => <option key={y} className="bg-slate-900">{y}</option>)}
          </select>
        </Field>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Subjects & skill levels</div>
        <div className="space-y-2 max-w-lg">
          {Object.entries(s.subjects).map(([subject, level]) => (
            <div key={subject} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-950/40 border border-white/6">
              <button
                type="button"
                onClick={() => subjectImgRefs.current[subject]?.click()}
                title="Upload a subject image (PNG/JPG)"
                aria-label={`Upload image for ${subject}`}
                className="w-9 h-9 shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center text-base cursor-pointer hover:border-blue-500/50 transition group relative"
              >
                {s.subjectImages?.[subject]
                  ? <img src={s.subjectImages[subject]} alt="" className="w-full h-full object-cover" />
                  : <span>📚</span>}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/50 flex items-center justify-center transition opacity-0 group-hover:opacity-100">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </span>
              </button>
              <input
                ref={(el) => { subjectImgRefs.current[subject] = el; }}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadSubjectImage(subject, f);
                  e.target.value = '';
                }}
              />
              <span className="text-xs text-slate-200 flex-1">{subject}</span>
              <select
                value={level}
                onChange={(e) => updateSubject(subject, e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 outline-none cursor-pointer"
                aria-label={`${subject} level`}
              >
                {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map((l) => <option key={l} className="bg-slate-900">{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Learning style</div>
        <div className="space-y-4 max-w-md">
          {Object.entries(s.learningStyle).map(([style, v]) => (
            <Slider key={style} label={style} value={v} onChange={(nv) => set('learningStyle', { ...s.learningStyle, [style]: nv })} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Goals</div>
        <div className="space-y-2.5 max-w-md">
          {[
            ['gpa', `Maintain ${s.profile.goalGpa || '3.7+'} GPA`],
            ['writing', 'Improve writing'],
            ['gradSchool', 'Prepare for graduate school'],
            ['research', 'Research publication'],
          ].map(([key, label]) => (
            <Toggle key={key} checked={s.goals[key]} onChange={(v) => set('goals', { ...s.goals, [key]: v })} label={label} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── WRITING & OUTPUT (Writing DNA) ──────────────────────────────────────── */
function WritingSection({ s, set }) {
  return (
    <div className="space-y-7">
      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Writing DNA</div>
        <p className="text-[11px] text-slate-500 mb-4">The five axes that define how Helpotron writes for you.</p>
        <div className="space-y-5 max-w-md p-4 rounded-xl bg-slate-950/40 border border-white/6">
          <Slider label="Tone — Academic → Casual" value={s.writing.tone} onChange={(v) => set('writing.tone', v)} format={(v) => (v < 40 ? 'Academic' : v < 70 ? 'Balanced' : 'Casual')} />
          <Slider label="Vocabulary — Simple → Advanced" value={s.writing.vocabulary} onChange={(v) => set('writing.vocabulary', v)} format={(v) => (v < 40 ? 'Simple' : v < 70 ? 'Mixed' : 'Advanced')} />
          <Slider label="Sentence complexity — Simple → Complex" value={s.writing.sentenceComplexity} onChange={(v) => set('writing.sentenceComplexity', v)} format={(v) => (v < 40 ? 'Simple' : v < 70 ? 'Mixed' : 'Complex')} />
          <Slider label="Formality — Casual → Formal" value={s.writing.formality} onChange={(v) => set('writing.formality', v)} format={(v) => (v < 40 ? 'Casual' : v < 70 ? 'Standard' : 'Formal')} />
          <Slider label="Voice — Passive → Active" value={s.writing.voice} onChange={(v) => set('writing.voice', v)} format={(v) => (v < 40 ? 'Passive' : v < 70 ? 'Mixed' : 'Active')} />
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Saved profiles</div>
        <p className="text-[11px] text-slate-500 mb-3">Switch per assignment — pick the voice that fits.</p>
        <div className="flex flex-wrap gap-1.5">
          {s.writing.profiles.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set('writing.profile', p)}
              className={`px-3 py-1.5 rounded-lg text-[11px] transition cursor-pointer border ${
                s.writing.profile === p ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 font-semibold' : 'bg-white/4 text-slate-400 border-white/8 hover:text-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <Field label="Citation style" hint="Applied to generated drafts and study materials.">
        <select value={s.writing.style} onChange={(e) => set('writing.style', e.target.value)} className={inputCls + ' max-w-xs cursor-pointer'}>
          {['APA', 'MLA', 'Chicago', 'Harvard', 'IEEE'].map((st) => <option key={st} className="bg-slate-900">{st}</option>)}
        </select>
      </Field>
    </div>
  );
}

/* ── AUTOMATION ──────────────────────────────────────────────────────────── */
function AutomationSection({ s, set }) {
  return (
    <div className="space-y-7 max-w-lg">
      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Automation permissions</div>
        <div className="space-y-3">
          {[
            ['autoRun', 'Auto-run assignments', 'Start the pipeline when an assignment is captured.'],
            ['autoFetch', 'Auto-fetch materials', 'Find textbook excerpts and sources when materials are missing.'],
            ['autoTranscribe', 'Auto-transcribe', 'New recordings are transcribed immediately.'],
            ['autoDraft', 'Auto-generate drafts', 'Produce drafts as soon as materials are ready.'],
            ['autoOrganize', 'Auto-organize files', 'Sort uploads into course folders.'],
            ['autoNotify', 'Auto-notify', 'Tell you when something happens.'],
            ['autoSubmit', 'Auto-submit', 'Submit completed work directly to your LMS.'],
          ].map(([key, label, desc]) => (
            <Toggle key={key} checked={s.automation[key]} onChange={(v) => set('automation', { ...s.automation, [key]: v })} label={label} description={desc} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Safety controls</div>
        <p className="text-[11px] text-slate-500 mb-3">Require approval before:</p>
        <div className="space-y-3 p-4 rounded-xl bg-slate-950/40 border border-white/6">
          {[
            ['submit', 'Submitting assignments'],
            ['messages', 'Sending messages'],
            ['bigSpend', 'Spending more than 100 credits'],
            ['premium', 'Using flagship engines'],
            ['modify', 'Modifying saved work'],
          ].map(([key, label]) => (
            <Toggle key={key} checked={s.automation.requireApproval[key]} onChange={(v) => set('automation', { ...s.automation, requireApproval: { ...s.automation.requireApproval, [key]: v } })} label={label} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── NOTIFICATIONS ───────────────────────────────────────────────────────── */
function NotificationsSection({ s, set }) {
  const groups = [
    ['assignments', 'Assignments', [['assignment.completed', 'Assignment completed'], ['draft.ready', 'Draft ready'], ['materials.missing', 'Materials missing'], ['deadline.approaching', 'Deadline approaching']]],
    ['automation', 'Automation', [['run.started', 'Run started'], ['run.completed', 'Run completed'], ['run.failed', 'Run failed']]],
    ['credits', 'Credits', [['low.credits', 'Low credits'], ['large.spend', 'Large spend'], ['monthly.summary', 'Monthly summary']]],
    ['study', 'Study', [['streak.reminder', 'Streak reminder'], ['study.recommendation', 'Study recommendation']]],
  ];
  const setGroup = (group, key, v) => set('notifications', { ...s.notifications, [group]: { ...s.notifications[group], [key]: v } });
  const setChannel = (ch, v) => set('notifications', { ...s.notifications, channels: { ...s.notifications.channels, [ch]: v } });

  return (
    <div className="space-y-7 max-w-lg">
      {groups.map(([gkey, label, toggles]) => (
        <div key={gkey}>
          <div className="text-xs font-medium text-slate-300 mb-3">{label}</div>
          <div className="space-y-3">
            {toggles.map(([key, tlabel]) => (
              <Toggle key={key} checked={s.notifications[gkey]?.[key]} onChange={(v) => setGroup(gkey, key, v)} label={tlabel} />
            ))}
          </div>
        </div>
      ))}
      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Delivery channels</div>
        <div className="space-y-3">
          {[['browser', 'Browser'], ['inapp', 'In-app'], ['email', 'Email'], ['telegram', 'Telegram']].map(([key, label]) => (
            <Toggle key={key} checked={s.notifications.channels?.[key]} onChange={(v) => setChannel(key, v)} label={label} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── PRIVACY & SECURITY ──────────────────────────────────────────────────── */
function PrivacySection({ s, set, onGoTo }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="space-y-7 max-w-lg">
      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Data usage</div>
        <div className="space-y-3">
          <Toggle checked={s.privacy.analytics} onChange={(v) => set('privacy', { ...s.privacy, analytics: v })} label="Usage analytics" description="Help us improve Helpotron with anonymized usage patterns." />
          <Toggle checked={s.privacy.dataLake} onChange={(v) => set('privacy', { ...s.privacy, dataLake: v })} label="Contribute to the Data Lake" description="Anonymized materials that power the free training pool (you earn micro-credits)." />
          <Toggle checked={s.privacy.anonymous} onChange={(v) => set('privacy', { ...s.privacy, anonymous: v })} label="Strict anonymity" description="Never attach your profile to contributed materials." />
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Your data</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Export all data
          </button>
          <button type="button" onClick={() => onGoTo && onGoTo('privacy')} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer">
            <ExternalLink className="w-3.5 h-3.5" /> Read the privacy policy
          </button>
          <button
            type="button"
            onClick={() => setDeleting(!deleting)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Request account deletion
          </button>
        </div>
        {deleting && (
          <div className="mt-3 p-4 rounded-xl bg-rose-500/8 border border-rose-500/25 text-[11px] text-rose-200 space-y-2">
            Deleting your account erases all assignments, materials, credits and study history. This cannot be undone.
            <div className="flex gap-2">
              <button type="button" className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer">Confirm deletion</button>
              <button type="button" onClick={() => setDeleting(false)} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-[11px] transition cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CREDITS & BILLING ───────────────────────────────────────────────────── */
function BillingSection({ onGoTo }) {
  return (
    <div className="space-y-5 max-w-lg">
      <div className="p-4 rounded-xl bg-slate-950/40 border border-white/6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-white">Elite plan</div>
            <div className="text-[11px] text-slate-500 mt-0.5">$9.99 / month · 12,000 credits</div>
          </div>
          <Badge color="purple">active</Badge>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Monthly credits</span><span className="font-mono">10,029 / 12,000</span></div>
          <Progress value={84} color="from-amber-500 to-orange-400" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onGoTo && onGoTo('billing')} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer">Open plans & top-ups</button>
        <button type="button" className="px-4 py-2.5 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white transition cursor-pointer">View invoices</button>
      </div>
      <div className="text-[10px] text-slate-600">Payments process through your chosen provider (cashapp / zelle / venmo) as manual allocations — see Plans & Credits for the full history.</div>
    </div>
  );
}

/* ── INTEGRATIONS ────────────────────────────────────────────────────────── */
function IntegrationsSection({ s, set }) {
  return (
    <div className="space-y-4 max-w-lg">
      {[
        ['canvas', 'Canvas', '🔴', 'Sync assignments, rubrics and grades from your LMS.', true],
        ['gdrive', 'Google Drive', '🟢', 'Import files directly from Drive.', false],
        ['notion', 'Notion', '⚫', 'Push study notes to your Notion workspace.', false],
        ['telegram', 'Telegram', '🔵', 'Get notifications and quick answers in Telegram.', true],
        ['calendar', 'Calendar', '📅', 'Mirror deadlines into your calendar.', false],
      ].map(([key, label, icon, desc, connected]) => (
        <div key={key} className="flex items-center gap-4 p-4 rounded-xl bg-slate-950/40 border border-white/6">
          <span className="text-lg">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white">{label}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">{desc}</div>
          </div>
          {connected ? (
            <Badge color="green">connected</Badge>
          ) : (
            <button type="button" className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 hover:bg-blue-600 hover:text-white transition cursor-pointer">
              Connect
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── EXTENSION ───────────────────────────────────────────────────────────── */
function ExtensionSection({ s, set }) {
  return (
    <div className="space-y-4 max-w-lg">
      <div className="p-4 rounded-xl bg-slate-950/40 border border-white/6 flex items-center gap-4">
        <span className="text-2xl">🧩</span>
        <div className="flex-1">
          <div className="text-xs font-semibold text-white">Helpotron Extension v2.0</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Captures assignments from your LMS as you browse.</div>
        </div>
        <Badge color="blue">installed</Badge>
      </div>
      <div className="space-y-3">
        <Toggle checked={s.extension.recorder} onChange={(v) => set('extension', { ...s.extension, recorder: v })} label="Audio recorder" description="Record lectures directly from the extension popup." />
        <Toggle checked={s.extension.autoCapture} onChange={(v) => set('extension', { ...s.extension, autoCapture: v })} label="Auto-capture assignments" description="Watch for assignment pages and capture them automatically." />
        <Toggle checked={s.extension.badge} onChange={(v) => set('extension', { ...s.extension, badge: v })} label="Status badge" description="Show capture progress on the extension icon." />
      </div>
    </div>
  );
}

/* ── SHORTCUTS ───────────────────────────────────────────────────────────── */
function ShortcutsSection({ s, set }) {
  const rows = [
    ['palette', 'Open command palette'],
    ['search', 'Global search'],
    ['newAssignment', 'New assignment'],
    ['wallet', 'Open credit wallet'],
  ];
  return (
    <div className="space-y-3 max-w-md">
      {rows.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-950/40 border border-white/6">
          <span className="text-xs text-slate-200">{label}</span>
          <kbd className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
            {s.shortcuts[key]}
          </kbd>
        </div>
      ))}
    </div>
  );
}

/* ── DATA & ANALYTICS ────────────────────────────────────────────────────── */
function DataSection({ s, set }) {
  return (
    <div className="space-y-3 max-w-lg">
      <Toggle checked={s.data.weeklyDigest} onChange={(v) => set('data', { ...s.data, weeklyDigest: v })} label="Weekly digest" description="A Sunday summary of your week, delivered in-app." />
      <Toggle checked={s.data.streakReminders} onChange={(v) => set('data', { ...s.data, streakReminders: v })} label="Streak reminders" description="A nudge when you haven't studied in a few days." />
      <Toggle checked={s.data.accuracyTracking} onChange={(v) => set('data', { ...s.data, accuracyTracking: v })} label="Accuracy tracking" description="Score practice results to tune recommendations." />
    </div>
  );
}

/* ── EXPERIMENTAL ────────────────────────────────────────────────────────── */
function ExperimentalSection({ s, set }) {
  return (
    <div className="space-y-3 max-w-lg">
      <div className="mb-1 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-[10px] text-amber-300">
        These features are unstable and may change or break. They're gated by feature flags for everyone else.
      </div>
      <Toggle checked={s.experimental.ocrBeta} onChange={(v) => set('experimental', { ...s.experimental, ocrBeta: v })} label="OCR beta pipeline" description="New document-extraction engine, 12% rollout." />
      <Toggle checked={s.experimental.edgeEval} onChange={(v) => set('experimental', { ...s.experimental, edgeEval: v })} label="Edge evaluation" description="Score drafts against exemplars before review." />
      <Toggle checked={s.experimental.newUI} onChange={(v) => set('experimental', { ...s.experimental, newUI: v })} label="New Settings UI" description="You're looking at it." />
    </div>
  );
}

/* ── ACCESSIBILITY ───────────────────────────────────────────────────────── */
function AccessibilitySection({ s, set }) {
  return (
    <div className="space-y-3 max-w-lg">
      <Toggle checked={s.accessibility.reducedMotion} onChange={(v) => set('accessibility', { ...s.accessibility, reducedMotion: v })} label="Reduced motion" description="Minimize animations and transitions." />
      <Toggle checked={s.accessibility.highContrast} onChange={(v) => set('accessibility', { ...s.accessibility, highContrast: v })} label="High contrast" description="Stronger borders and text contrast." />
      <Toggle checked={s.accessibility.largeText} onChange={(v) => set('accessibility', { ...s.accessibility, largeText: v })} label="Larger text" description="Scale interface text up 20%." />
      <Toggle checked={s.accessibility.dyslexiaFriendly} onChange={(v) => set('accessibility', { ...s.accessibility, dyslexiaFriendly: v })} label="Dyslexia-friendly" description="Wider spacing and a readable font." />
      <Toggle checked={s.accessibility.screenReader} onChange={(v) => set('accessibility', { ...s.accessibility, screenReader: v })} label="Screen-reader mode" description="Full ARIA labeling and live regions." />
    </div>
  );
}

/* ── LANGUAGE & REGION ───────────────────────────────────────────────────── */
function LanguageSection({ s, set }) {
  return (
    <div className="space-y-4 max-w-md">
      <Field label="Language & locale">
        <select value={s.language.locale} onChange={(e) => set('language', { ...s.language, locale: e.target.value })} className={inputCls + ' cursor-pointer'}>
          {[['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['zh', '中文']].map(([v, label]) => <option key={v} value={v} className="bg-slate-900">{label}</option>)}
        </select>
      </Field>
      <Field label="Timezone">
        <select value={s.language.timezone} onChange={(e) => set('language', { ...s.language, timezone: e.target.value })} className={inputCls + ' cursor-pointer'}>
          {['auto', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC'].map((tz) => <option key={tz} className="bg-slate-900">{tz}</option>)}
        </select>
      </Field>
    </div>
  );
}

/* ── ADVANCED ────────────────────────────────────────────────────────────── */
function AdvancedSection({ s, set, onGoTo }) {
  const [showJson, setShowJson] = useState(false);
  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-3">
        <Toggle checked={s.advanced.debugMode} onChange={(v) => set('advanced', { ...s.advanced, debugMode: v })} label="Debug mode" description="Show request IDs and timing in the UI." />
        <Toggle checked={s.advanced.apiLogging} onChange={(v) => set('advanced', { ...s.advanced, apiLogging: v })} label="API logging" description="Log every request to the console (developer use)." />
      </div>
      <button
        type="button"
        onClick={() => setShowJson(!showJson)}
        className="px-3.5 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer"
      >
        {showJson ? 'Hide' : 'Show'} raw configuration (JSON)
      </button>
      {showJson && (
        <pre className="p-4 rounded-xl bg-black/50 border border-white/8 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-64">
          {JSON.stringify(s, null, 2)}
        </pre>
      )}
      <button type="button" className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-300 hover:bg-rose-500/20 transition cursor-pointer">
        Reset all settings to defaults
      </button>
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/40 border border-white/6">
        <div>
          <div className="text-xs text-slate-200 font-medium">Data Lake</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Anonymized training pool — the dataset that improves every future agent.</div>
        </div>
        <button
          type="button"
          onClick={() => onGoTo && onGoTo('datalake')}
          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer"
        >
          Open →
        </button>
      </div>
    </div>
  );
}

/* ── Dispatcher ──────────────────────────────────────────────────────────── */
export function SettingsSections({ section, s, set, userId, onGoTo }) {
  switch (section) {
    case 'account': return <AccountSection s={s} set={set} userId={userId} />;
    case 'academic': return <AcademicSection s={s} set={set} />;
    case 'writing': return <WritingSection s={s} set={set} />;
    case 'automation': return <AutomationSection s={s} set={set} />;
    case 'notifications': return <NotificationsSection s={s} set={set} />;
    case 'privacy': return <PrivacySection s={s} set={set} onGoTo={onGoTo} />;
    case 'billing': return <BillingSection onGoTo={onGoTo} />;
    case 'integrations': return <IntegrationsSection s={s} set={set} />;
    case 'extension': return <ExtensionSection s={s} set={set} />;
    case 'shortcuts': return <ShortcutsSection s={s} set={set} />;
    case 'data': return <DataSection s={s} set={set} />;
    case 'experimental': return <ExperimentalSection s={s} set={set} />;
    case 'accessibility': return <AccessibilitySection s={s} set={set} />;
    case 'language': return <LanguageSection s={s} set={set} />;
    case 'advanced': return <AdvancedSection s={s} set={set} onGoTo={onGoTo} />;
    default: return null;
  }
}
