// export target: web/src/components/SettingsSections.jsx
/* ────────────────────────────────────────────────────────────────────────────
 * SettingsSections.jsx — the remaining settings pages (everything except
 * Appearance and AI, which live in SettingsApp.jsx). Each section is a real
 * form bound to the OS settings store.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useRef, useState } from 'react';
import { Download, Trash2, KeyRound, ExternalLink, Camera } from 'lucide-react';
import { Toggle, Slider, Badge, Progress } from './ui/os.jsx';
import api from '../api.js';
import TwoFactorSetup from './TwoFactorSetup.jsx';
import ScopedSetting from './ScopedSetting.jsx';
import DemoModeToggle from './DemoModeToggle.jsx';
import RecoveryFlowModal from './RecoveryFlowModal.jsx';

/* Every toggle also accepts hierarchy variants (On/Off per subject/class/…) */
const ON_OFF = [{ key: true, label: 'On' }, { key: false, label: 'Off' }];

function Field({ label, children, hint, id }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'clean-input w-full px-3 py-2 text-xs outline-none';

/* ── ACCOUNT ─────────────────────────────────────────────────────────────── */
/* Plan display metadata — REAL plan from the account, never a hardcoded demo
 * badge. "none" = dev/beta account with no subscription (operator 08-27). */
const PLAN_BADGE = {
  none: ['No plan', 'slate', 'dev/beta — no subscription'],
  basic: ['Basic', 'blue', ''],
  pro: ['Pro', 'amber', ''],
  elite: ['Elite', 'purple', ''],
};

function AccountSection({ s, set, userId, plan, isAdmin }) {
  /* Operator (08-28): the account owner is an ADMIN, not a customer — show
   * the role badge instead of a plan badge on their own account. */
  const [planLabel, planColor] = isAdmin
    ? ['Admin', 'amber', 'account owner — full system access']
    : (PLAN_BADGE[plan] || PLAN_BADGE.none);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwNew2, setPwNew2] = useState('');
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }
  const [pwBusy, setPwBusy] = useState(false);
  const [pfpMsg, setPfpMsg] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const pfpRef = useRef(null);

  const uploadPfp = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPfpMsg('');
    try {
      const res = await api.uploadAvatar(file, 'user');
      set('profile.avatarUrl', res.url);
      // Mirror to the server store (localStorage alone is device-local).
      api.updateSettings({ profile: { ...(s.profile || {}), avatarUrl: res.url } }).catch(() => {});
    } catch (err) {
      setPfpMsg(err.message || 'Upload failed (max 5 MB, PNG/JPG).');
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pwNew !== pwNew2) {
      setPwMsg({ ok: false, text: 'New passwords do not match.' });
      return;
    }
    if (pwNew.length < 8) {
      setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
      return;
    }
    setPwBusy(true);
    try {
      await api.changePassword(pwCur, pwNew);
      setPwMsg({ ok: true, text: 'Password updated. Use your new password next sign-in.' });
      setPwCur(''); setPwNew(''); setPwNew2('');
      setTimeout(() => setPwOpen(false), 1500);
    } catch (err) {
      setPwMsg({ ok: false, text: err.message || 'Failed to change password.' });
    } finally {
      setPwBusy(false);
    }
  };

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
          <Badge color={planColor} className="mt-1">{planLabel}</Badge>
        </div>
      </div>
      <Field label="Profile picture" hint="PNG or JPG, max 5 MB — same pic shows in the topbar and your agent.">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-lg font-black text-white overflow-hidden shrink-0">
            {s.profile.avatarUrl
              ? <img src={s.profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              : (s.profile.displayName?.[0] || 'P')}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => pfpRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition cursor-pointer"
            >
              {s.profile.avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {s.profile.avatarUrl && (
              <button
                type="button"
                onClick={() => set('profile.avatarUrl', '')}
                className="px-3 py-1.5 rounded-lg bg-white/4 border border-white/8 text-[11px] text-slate-400 hover:text-rose-300 transition cursor-pointer"
              >
                Remove
              </button>
            )}
            <input
              ref={pfpRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={uploadPfp}
            />
          </div>
        </div>
        {pfpMsg && <p className="text-[11px] text-rose-300 mt-1.5">⚠️ {pfpMsg}</p>}
      </Field>
      <Field label="Display name" id="settings-display-name">
        <input id="settings-display-name" value={s.profile.displayName} onChange={(e) => set('profile.displayName', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Email" id="settings-email" hint="Managed by your sign-in provider.">
        <input id="settings-email" value={`${userId || 'you'}@helpotron.app`} readOnly className={`${inputCls} opacity-50`} />
      </Field>
      <Field label="Phone number" id="settings-phone" hint="Used for SMS 2FA codes and account recovery.">
        <input
          id="settings-phone"
          type="tel"
          inputMode="tel"
          value={s.profile.phone || ''}
          onChange={(e) => set('profile.phone', e.target.value)}
          placeholder="+1 555 123 4567"
          className={inputCls}
        />
      </Field>
      <Field label="Password">
        {!pwOpen ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" /> Change password
            </button>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              title="Reset via email or phone code — or ask the developer for one. No current password needed."
              className="px-3 py-2 rounded-xl bg-blue-600/15 border border-blue-500/40 text-[11px] text-blue-300 hover:bg-blue-600/25 hover:text-white transition cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
        ) : (
          <form onSubmit={submitPassword} className="space-y-2.5 pt-1">
            <input
              type="password"
              autoComplete="current-password"
              value={pwCur}
              onChange={(e) => setPwCur(e.target.value)}
              placeholder="Current password"
              aria-label="Current password"
              className={inputCls}
              autoFocus
            />
            <input
              type="password"
              autoComplete="new-password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              placeholder="New password (min 8 characters)"
              aria-label="New password"
              className={inputCls}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={pwNew2}
              onChange={(e) => setPwNew2(e.target.value)}
              placeholder="Repeat new password"
              aria-label="Repeat new password"
              className={inputCls}
            />
            {pwMsg && (
              <p className={`text-[11px] ${pwMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{pwMsg.text}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={pwBusy}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-semibold transition cursor-pointer"
              >
                {pwBusy ? 'Saving…' : 'Save new password'}
              </button>
              <button
                type="button"
                onClick={() => { setPwOpen(false); setPwMsg(null); setPwCur(''); setPwNew(''); setPwNew2(''); }}
                className="px-3 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Field>
      <TwoFactorSetup s={s} set={set} />
      <RecoveryFlowModal open={forgotOpen} onClose={() => setForgotOpen(false)} publicId={userId} />
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
  const [subjImgErr, setSubjImgErr] = useState('');
  const uploadSubjectImage = async (subject, file) => {
    setSubjImgErr('');
    try {
      const res = await api.uploadAvatar(file, 'subject', subject);
      const url = res?.url || URL.createObjectURL(file);
      const next = { ...(s.subjectImages || {}), [subject]: url };
      set('subjectImages', next);
    } catch (e) {
      setSubjImgErr(e.message || 'Image upload failed (max 5 MB, PNG/JPG).');
    }
  };
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
        <Field label="Education level" id="settings-edu-level">
          <select id="settings-edu-level" value={s.profile.educationLevel} onChange={(e) => set('profile.educationLevel', e.target.value)} className={inputCls + ' cursor-pointer'}>
            {['High School', 'Undergraduate', 'Graduate', 'Professional'].map((l) => <option key={l} className="bg-slate-900">{l}</option>)}
          </select>
        </Field>
        <Field label="Major" id="settings-major">
          <input id="settings-major" value={s.profile.major} onChange={(e) => set('profile.major', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Year" id="settings-year">
          <select id="settings-year" value={s.profile.year} onChange={(e) => set('profile.year', e.target.value)} className={inputCls + ' cursor-pointer'}>
            {['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'].map((y) => <option key={y} className="bg-slate-900">{y}</option>)}
          </select>
        </Field>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">Subjects & skill levels</div>
        {subjImgErr && (
          <p className="text-[11px] text-rose-300 mb-2">⚠️ {subjImgErr}</p>
        )}
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
function WritingSection({ s, set, scoped, setVariants, subjectRefs }) {
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

      <ScopedSetting
        path="writing.profile"
        title="Saved writing profile"
        variants={scoped['writing.profile']}
        setVariants={setVariants}
        values={s.writing.profiles}
        refs={subjectRefs}
      >
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
      </ScopedSetting>

      <ScopedSetting
        path="writing.style"
        title="Citation style"
        variants={scoped['writing.style']}
        setVariants={setVariants}
        values={['APA', 'MLA', 'Chicago', 'Harvard', 'IEEE']}
        refs={subjectRefs}
      >
        <Field label="Citation style" id="settings-citation-style" hint="Applied to generated drafts and study materials.">
          <select id="settings-citation-style" value={s.writing.style} onChange={(e) => set('writing.style', e.target.value)} className={inputCls + ' max-w-xs cursor-pointer'}>
            {['APA', 'MLA', 'Chicago', 'Harvard', 'IEEE'].map((st) => <option key={st} className="bg-slate-900">{st}</option>)}
          </select>
        </Field>
      </ScopedSetting>
    </div>
  );
}

/* ── AUTOMATION ──────────────────────────────────────────────────────────── */
function AutomationSection({ s, set, scoped, setVariants, subjectRefs }) {
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
            <ScopedSetting
              key={key}
              path={`automation.${key}`}
              title={label}
              variants={scoped[`automation.${key}`]}
              setVariants={setVariants}
              values={ON_OFF}
              refs={subjectRefs}
            >
              <Toggle checked={s.automation[key]} onChange={(v) => set('automation', { ...s.automation, [key]: v })} label={label} description={desc} />
            </ScopedSetting>
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
            <ScopedSetting
              key={key}
              path={`automation.requireApproval.${key}`}
              title={label}
              variants={scoped[`automation.requireApproval.${key}`]}
              setVariants={setVariants}
              values={ON_OFF}
              refs={subjectRefs}
            >
              <Toggle checked={s.automation.requireApproval[key]} onChange={(v) => set('automation', { ...s.automation, requireApproval: { ...s.automation.requireApproval, [key]: v } })} label={label} />
            </ScopedSetting>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── NOTIFICATIONS ───────────────────────────────────────────────────────── */
function NotificationsSection({ s, set, scoped, setVariants, subjectRefs }) {
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
              <ScopedSetting
                key={key}
                path={`notifications.${gkey}.${key}`}
                title={tlabel}
                variants={scoped[`notifications.${gkey}.${key}`]}
                setVariants={setVariants}
                values={ON_OFF}
                refs={subjectRefs}
              >
                <Toggle checked={s.notifications[gkey]?.[key]} onChange={(v) => setGroup(gkey, key, v)} label={tlabel} />
              </ScopedSetting>
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
function PrivacySection({ s, set, scoped, setVariants, subjectRefs, onGoTo }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(s?.privacy?.twoFactorEnabled));
  const [method, setMethod] = useState('totp');
  const [setupStep, setSetupStep] = useState('idle'); // 'idle' | 'configuring' | 'disabling'
  const [secret, setSecret] = useState('');
  const [qrUri, setQrUri] = useState('');
  const [code, setCode] = useState('');
  const [loading2FA, setLoading2FA] = useState(false);
  const [msg2FA, setMsg2FA] = useState({ text: '', type: '' });

  const handleStartSetup = async () => {
    setLoading2FA(true);
    setMsg2FA({ text: '', type: '' });
    try {
      const res = await api.setup2FA(method, s?.profile?.phone || null);
      if (res && res.status === 'success') {
        setSecret(res.secret || '');
        setQrUri(res.qr_uri || '');
        setSetupStep('configuring');
        if (res.message) setMsg2FA({ text: res.message, type: 'info' });
      } else {
        setMsg2FA({ text: res?.detail || 'Could not start 2FA setup', type: 'error' });
      }
    } catch (err) {
      setMsg2FA({ text: err.message || 'Error starting 2FA setup', type: 'error' });
    } finally {
      setLoading2FA(false);
    }
  };

  const handleVerifySetup = async () => {
    if (!code.trim()) return;
    setLoading2FA(true);
    setMsg2FA({ text: '', type: '' });
    try {
      const res = await api.verifySetup2FA(method, code.trim(), secret);
      if (res && res.status === 'success') {
        setTwoFactorEnabled(true);
        setSetupStep('idle');
        setCode('');
        set('privacy', { ...s.privacy, twoFactorEnabled: true, twoFactorMethod: method });
        setMsg2FA({ text: 'Two-Factor Authentication is now active on your account.', type: 'success' });
      } else {
        setMsg2FA({ text: res?.detail || 'Invalid verification code', type: 'error' });
      }
    } catch (err) {
      setMsg2FA({ text: err.message || 'Verification failed. Please check the code.', type: 'error' });
    } finally {
      setLoading2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!code.trim()) return;
    setLoading2FA(true);
    setMsg2FA({ text: '', type: '' });
    try {
      const res = await api.disable2FA(code.trim());
      if (res && res.status === 'success') {
        setTwoFactorEnabled(false);
        setSetupStep('idle');
        setCode('');
        set('privacy', { ...s.privacy, twoFactorEnabled: false });
        setMsg2FA({ text: 'Two-Factor Authentication has been disabled.', type: 'info' });
      } else {
        setMsg2FA({ text: res?.detail || 'Failed to disable 2FA', type: 'error' });
      }
    } catch (err) {
      setMsg2FA({ text: err.message || 'Failed to disable 2FA', type: 'error' });
    } finally {
      setLoading2FA(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await api.delete('/api/user/account');
      window.location.reload();
    } catch (err) {
      setDeleteError(err.message || 'Deletion failed');
    }
  };

  return (
    <div className="space-y-7 max-w-lg">
      {/* 2FA Security Controls */}
      <div className="p-4 rounded-2xl bg-white/4 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-400" />
              Two-Factor Authentication (2FA)
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Secure your account with an extra verification layer on sign in.
            </p>
          </div>
          <Badge color={twoFactorEnabled ? 'emerald' : 'slate'}>
            {twoFactorEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        {msg2FA.text && (
          <div className={`p-2.5 rounded-xl text-xs ${msg2FA.type === 'error' ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300' : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'}`}>
            {msg2FA.text}
          </div>
        )}

        {setupStep === 'idle' && (
          <div className="flex items-center gap-3 pt-1">
            {!twoFactorEnabled ? (
              <button
                type="button"
                onClick={() => setSetupStep('method_select')}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-md shadow-blue-900/30"
              >
                Enable 2FA Protection
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setSetupStep('disabling'); setCode(''); setMsg2FA({ text: '', type: '' }); }}
                className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold transition cursor-pointer"
              >
                Disable 2FA
              </button>
            )}
          </div>
        )}

        {setupStep === 'method_select' && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <label className="block text-xs font-medium text-slate-300">Choose Verification Method:</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'totp', label: 'Authenticator App', desc: 'Google Auth, Authy, 1Password' },
                { key: 'email', label: 'Email Code', desc: 'Delivered to registered email' },
                { key: 'sms', label: 'SMS Message', desc: 'Delivered via text message' },
              ].map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${method === m.key ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-white/4 border-white/8 text-slate-400 hover:text-slate-200'}`}
                >
                  <div className="text-xs font-bold">{m.label}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={loading2FA}
                onClick={handleStartSetup}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loading2FA ? 'Setting up…' : 'Continue Setup →'}
              </button>
              <button
                type="button"
                onClick={() => setSetupStep('idle')}
                className="px-3.5 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {setupStep === 'configuring' && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            {method === 'totp' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-300">
                  Scan this QR code in your Authenticator app (Google Authenticator, Microsoft Authenticator, Authy), or enter the key manually:
                </p>
                <div className="p-3 bg-slate-950 rounded-xl border border-white/10 text-center font-mono text-xs text-blue-400 select-all break-all">
                  {secret}
                </div>
              </div>
            )}
            {method !== 'totp' && (
              <p className="text-xs text-slate-300">
                A 6-digit verification code has been sent via {method.toUpperCase()}.
              </p>
            )}
            <div className="space-y-1.5">
              <label htmlFor="settings-2fa-code" className="text-xs font-semibold text-slate-300">Enter 6-Digit Code to Confirm:</label>
              <input
                id="settings-2fa-code"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-center font-mono text-sm tracking-widest text-white outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={loading2FA || code.length < 6}
                onClick={handleVerifySetup}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loading2FA ? 'Verifying…' : 'Activate 2FA'}
              </button>
              <button
                type="button"
                onClick={() => { setSetupStep('idle'); setCode(''); }}
                className="px-3.5 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {setupStep === 'disabling' && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <p className="text-xs text-slate-300">
              Enter your current 6-digit 2FA security code to confirm turning off 2FA:
            </p>
            <input
              type="text"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-label="6-digit security code to confirm turning off 2FA"
              className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-center font-mono text-sm tracking-widest text-white outline-none focus:border-rose-500"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={loading2FA || code.length < 6}
                onClick={handleDisable2FA}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold transition cursor-pointer"
              >
                {loading2FA ? 'Disabling…' : 'Confirm Turn Off'}
              </button>
              <button
                type="button"
                onClick={() => { setSetupStep('idle'); setCode(''); }}
                className="px-3.5 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Data usage</div>
        <div className="space-y-3">
          <Toggle checked={s.privacy.analytics} onChange={(v) => set('privacy', { ...s.privacy, analytics: v })} label="Usage analytics" description="Help us improve Helpotron with anonymized usage patterns." />
          <ScopedSetting
            path="privacy.dataLake"
            title="Contribute to the Data Lake"
            variants={scoped['privacy.dataLake']}
            setVariants={setVariants}
            values={ON_OFF}
            refs={subjectRefs}
          >
            <Toggle checked={s.privacy.dataLake} onChange={(v) => set('privacy', { ...s.privacy, dataLake: v })} label="Contribute to the Data Lake" description="Anonymized materials that power the free training pool (you earn micro-credits)." />
          </ScopedSetting>
          <Toggle checked={s.privacy.anonymous} onChange={(v) => set('privacy', { ...s.privacy, anonymous: v })} label="Strict anonymity" description="Never attach your profile to contributed materials." />
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-300 mb-3">Your data</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => api.exportAllUserData()} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/4 border border-white/8 text-[11px] text-slate-300 hover:text-white hover:bg-white/8 transition cursor-pointer">
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
            <Trash2 className="w-3.5 h-3.5" /> Request account deletion (GDPR Art. 17)
          </button>
        </div>
        {deleting && (
          <div className="mt-3 p-4 rounded-xl bg-rose-500/8 border border-rose-500/25 text-[11px] text-rose-200 space-y-2">
            Deleting your account erases all assignments, materials, credits and study history, and anonymizes your data lake contributions under GDPR Article 17. This action is permanent.
            {deleteError && <div className="text-rose-400 font-medium">{deleteError}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={handleConfirmDelete} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer">Confirm deletion</button>
              <button type="button" onClick={() => setDeleting(false)} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-[11px] transition cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CREDITS & BILLING ───────────────────────────────────────────────────── */
/* REAL account numbers, not the old hardcoded Elite/12,000/10,029 demo card
 * (operator 08-27: that card told every user they were on an Elite plan). */
const BILLING_META = {
  none: { label: 'No plan', sub: 'Dev / beta account — no subscription', badge: 'slate', limit: 0 },
  basic: { label: 'Basic', sub: 'Allocations settle at product launch', badge: 'blue', limit: 30 },
  pro: { label: 'Pro', sub: 'Allocations settle at product launch', badge: 'amber', limit: 100 },
  elite: { label: 'Elite', sub: 'Allocations settle at product launch', badge: 'purple', limit: 300 },
};

function BillingSection({ onGoTo, plan, credits, tokenBalance }) {
  const meta = BILLING_META[plan] || BILLING_META.none;
  const limit = meta.limit;
  const tk = Number(tokenBalance ?? 0) || 0;
  const cr = Number(credits ?? 0) || 0;
  const pct = limit > 0 ? Math.min(100, Math.round((tk / limit) * 100)) : 0;
  return (
    <div className="space-y-5 max-w-lg">
      <div className="p-4 rounded-xl bg-slate-950/40 border border-white/6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-white">{meta.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{meta.sub}</div>
          </div>
          <Badge color={meta.badge}>{plan && plan !== 'none' ? 'active' : 'beta'}</Badge>
        </div>
        <div className="mt-3">
          {limit > 0 ? (
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Usage tokens left</span>
              <span className="font-mono">{tk.toLocaleString()} / {limit.toLocaleString()}</span>
            </div>
          ) : (
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Usage tokens left</span>
              <span className="font-mono">{tk.toLocaleString()}</span>
            </div>
          )}
          <Progress value={limit > 0 ? pct : 0} color={limit > 0 ? 'from-amber-500 to-orange-400' : 'from-slate-600 to-slate-500'} />
        </div>
        <div className="mt-2 text-[10px] text-slate-600 font-mono">{cr.toLocaleString()} discount credits</div>
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
function DataSection({ s, set, scoped, setVariants, subjectRefs }) {
  return (
    <div className="space-y-3 max-w-lg">
      <ScopedSetting
        path="data.weeklyDigest"
        title="Weekly digest"
        variants={scoped['data.weeklyDigest']}
        setVariants={setVariants}
        values={ON_OFF}
        refs={subjectRefs}
      >
        <Toggle checked={s.data.weeklyDigest} onChange={(v) => set('data', { ...s.data, weeklyDigest: v })} label="Weekly digest" description="A Sunday summary of your week, delivered in-app." />
      </ScopedSetting>
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
      <div className="pt-2 border-t border-white/8">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Demo / mock data
        </div>
        <DemoModeToggle />
        <p className="text-[9px] text-slate-600 mt-1.5">
          For testing only — sample data shown instead of your real account. Stay off.
        </p>
      </div>
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
      <Field label="Language & locale" id="settings-lang-locale">
        <select id="settings-lang-locale" value={s.language.locale} onChange={(e) => set('language', { ...s.language, locale: e.target.value })} className={inputCls + ' cursor-pointer'}>
          {[['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['zh', '中文']].map(([v, label]) => <option key={v} value={v} className="bg-slate-900">{label}</option>)}
        </select>
      </Field>
      <Field label="Timezone" id="settings-timezone">
        <select id="settings-timezone" value={s.language.timezone} onChange={(e) => set('language', { ...s.language, timezone: e.target.value })} className={inputCls + ' cursor-pointer'}>
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
export function SettingsSections({ section, s, set, scoped, setVariants, subjectRefs, userId, onGoTo, plan, credits, tokenBalance, isAdmin }) {
  const scopeProps = { scoped, setVariants, subjectRefs };
  switch (section) {
    case 'account': return <AccountSection s={s} set={set} userId={userId} plan={plan} isAdmin={isAdmin} />;
    case 'academic': return <AcademicSection s={s} set={set} />;
    case 'writing': return <WritingSection s={s} set={set} {...scopeProps} />;
    case 'automation': return <AutomationSection s={s} set={set} {...scopeProps} />;
    case 'notifications': return <NotificationsSection s={s} set={set} {...scopeProps} />;
    case 'privacy': return <PrivacySection s={s} set={set} {...scopeProps} onGoTo={onGoTo} />;
    case 'billing': return <BillingSection onGoTo={onGoTo} plan={plan} credits={credits} tokenBalance={tokenBalance} />;
    case 'integrations': return <IntegrationsSection s={s} set={set} />;
    case 'extension': return <ExtensionSection s={s} set={set} />;
    case 'shortcuts': return <ShortcutsSection s={s} set={set} />;
    case 'data': return <DataSection s={s} set={set} {...scopeProps} />;
    case 'experimental': return <ExperimentalSection s={s} set={set} />;
    case 'accessibility': return <AccessibilitySection s={s} set={set} />;
    case 'language': return <LanguageSection s={s} set={set} />;
    case 'advanced': return <AdvancedSection s={s} set={set} onGoTo={onGoTo} />;
    default: return null;
  }
}

// Dynamic Auto-Routing & Scope Picker Component
export const ScopedSettingRow = ({ label, settingKey, scope, onScopeChange, value, onChange, autoRouting, options }) => {
  const isEffortSetting = settingKey === 'effort_tier';
  const isDisabled = isEffortSetting && autoRouting;

  return (
    <div className="py-4 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{label}</span>
          {isDisabled && (
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
              Auto Routed
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

