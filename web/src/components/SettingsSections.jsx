/**
 * SettingsSections.jsx — Bare-bones 6-Section Settings Panels (Stitch v6 / §3.18).
 * Sections: Account | Appearance & Display | Notifications | Privacy & Security | Credits | Integrations.
 * Strict LUMINOUS GLASS M3 tokens, live preview tile, and Telegram real flow.
 */
import React, { useEffect, useState, Suspense } from 'react';

// Insights is a large view (~83 KB) that most settings visits never open, so it is
// loaded on demand rather than folded into the settings bundle.
const InsightsView = React.lazy(() => import('./InsightsView.jsx'));
import {
  User, Moon, Sun, Laptop, Bell, Shield, CreditCard, Send,
  Key, Copy, Check, CheckCircle2, AlertCircle, Trash2, ExternalLink, ScanSearch, Camera, Pencil, X, Loader2
} from 'lucide-react';
// `api` was referenced by handleManageBilling but never imported, so that
// call threw ReferenceError into its own catch and showed the generic
// "Could not open the billing portal" — a code bug wearing an error message.
import api from '../api.js';
import AppearancePreview from './AppearancePreview.jsx';
import TelegramIntegration from './TelegramIntegration.jsx';
import TwoFactorSetup from './TwoFactorSetup.jsx';
import ApiKeysPanel from './ApiKeysPanel.jsx';
import AvatarCropper from './AvatarCropper.jsx';

/**
 * Build a settings delta for the nested AI block.
 *
 * SettingsApp's mergeSettings only merges ONE level deep, so sending
 * `{ ai: { detection: {...} } }` would replace the whole `ai` object and wipe
 * the user's effort, style and humanizer choices with it. This spreads every
 * level from the current settings so only the intended leaf changes.
 */
export function setHumanizerSettings(settings, patch) {
  const ai = settings?.ai && typeof settings.ai === 'object' ? settings.ai : {};
  const detection = ai.detection && typeof ai.detection === 'object' ? ai.detection : {};
  return {
    ai: {
      ...ai,
      ...(patch.humanizer !== undefined ? { humanizer: patch.humanizer } : {}),
      ...(patch.detection ? { detection: { ...detection, ...patch.detection } } : {}),
    },
  };
}

export function SettingsSections({
  section = 'all',
  settings = {},
  set = () => {},
  userId = 'usr_0941',
  plan = 'pro',
  credits = 1000,
  tokenBalance = 1000,
  isAdmin = false,
  onGoTo = () => {},
  // Switches SETTINGS sections (unlike onGoTo, which navigates app views).
  // Added for the Account → API Keys cross-link: the keys panel is a sibling
  // section, not a route, so navigating a view there would land on a 404.
  onSelectSection = () => {},
}) {
  const [copiedId, setCopiedId] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState('');

  /* The live tier catalogue.
   *
   * These were previously a hardcoded array with pre-migration token numbers
   * left behind by the 100x token-unit change (100 tokens = 1 cent) and by the
   * trial moving to 14 days. The settings page was therefore advertising
   * allowances a payment does not deposit, which is worse than showing nothing:
   * it is a price list that is simply wrong.
   *
   * GET /api/plans is the single source of truth (server/plans.py), so this reads
   * it instead of keeping a second copy. Any tier number in a component is a bug
   * on a timer — that is the whole lesson.
   */
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    if (section !== 'all' && section !== 'credits') return undefined;
    let alive = true;
    fetch('/api/plans', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && Array.isArray(d?.plans)) setPlans(d.plans); })
      .catch(() => { /* leave the grid out rather than invent tiers */ });
    return () => { alive = false; };
  }, [section]);

  /* "Manage Billing" means managing the SUBSCRIPTION — payment method, invoices,
   * cancellation. The in-app plans tab can do none of those, so it opens the
   * Stripe-hosted portal. When there is nothing to manage (no Stripe customer,
   * or payments not configured in this environment) it says so and falls back to
   * the plans tab, instead of a button that silently does something else. */
  const handleManageBilling = async () => {
    setBillingBusy(true);
    setBillingMsg('');
    try {
      const res = await api.billingPortal();
      if (res?.portal_url) {
        window.open(res.portal_url, '_blank', 'noopener,noreferrer');
        return;
      }
      setBillingMsg(res?.message || 'No subscription to manage yet.');
      onGoTo?.('billing');
    } catch (e) {
      setBillingMsg(e?.message || 'Could not open the billing portal.');
      onGoTo?.('billing');
    } finally {
      setBillingBusy(false);
      setTimeout(() => setBillingMsg(''), 6000);
    }
  };
  const [clearedCache, setClearedCache] = useState(false);

  // ── Account profile (owner 2026-09-21) ─────────────────────────────────────
  // Display name and avatar are cosmetic; the public ID is the login identifier,
  // so it is edited through its own confirm-with-password flow.
  const [profile, setProfile] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);
  // Owner 2026-10-22: a picked file opens a crop/zoom dialog instead of being
  // uploaded raw — nothing is sent until the square is framed.
  const [cropFile, setCropFile] = useState(null);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [idDraft, setIdDraft] = useState('');
  const [idPassword, setIdPassword] = useState('');
  const [showIdEditor, setShowIdEditor] = useState(false);

  useEffect(() => {
    if (section !== 'all' && section !== 'account') return undefined;
    let alive = true;
    api.getProfile()
      .then((d) => {
        if (!alive) return;
        setProfile(d);
        setNameDraft(d?.display_name || '');
        setIdDraft(d?.public_id || '');
      })
      .catch(() => { if (alive) setProfileErr('Could not load your account details.'); });
    return () => { alive = false; };
  }, [section]);

  const flash = (ok, text) => {
    setProfileMsg(ok ? text : '');
    setProfileErr(ok ? '' : text);
    setTimeout(() => { setProfileMsg(''); setProfileErr(''); }, 6000);
  };

  const handleAvatarPick = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      flash(false, 'Choose a PNG or JPG image.');
      return;
    }
    setCropFile(file);
  };

  const handleAvatarCropped = async (blob) => {
    if (!blob) return;
    setProfileBusy(true);
    try {
      // The upload endpoint writes the file AND records the URL on the account,
      // so there is no second call to make it stick.
      const cropped = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const res = await api.uploadAvatar(cropped, 'user');
      setProfile((p) => ({ ...(p || {}), avatar_url: res.url }));
      setCropFile(null);
      flash(true, 'Profile picture updated.');
    } catch (e) {
      flash(false, e?.message || 'Could not upload that image. PNG or JPG, max 5 MB.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setProfileBusy(true);
    try {
      // An empty string is the explicit "remove it" signal the endpoint accepts.
      await api.updateProfile({ avatar_url: '' });
      setProfile((p) => ({ ...(p || {}), avatar_url: '' }));
      flash(true, 'Profile picture removed.');
    } catch (e) {
      flash(false, e?.message || 'Could not remove the picture.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSaveName = async () => {
    setProfileBusy(true);
    try {
      const res = await api.updateProfile({ display_name: nameDraft });
      setProfile((p) => ({ ...(p || {}), display_name: res.display_name }));
      setNameDraft(res.display_name || '');
      flash(true, 'Display name saved.');
    } catch (e) {
      flash(false, e?.message || 'Could not save your display name.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangePublicId = async () => {
    setProfileBusy(true);
    try {
      const res = await api.changePublicId(idDraft.trim(), idPassword);
      setProfile((p) => ({ ...(p || {}), public_id: res.public_id }));
      setIdDraft(res.public_id);
      setIdPassword('');
      setShowIdEditor(false);
      flash(true, res.message || 'Public ID updated.');
    } catch (e) {
      flash(false, e?.message || 'Could not change your public ID.');
    } finally {
      setProfileBusy(false);
    }
  };

  // Appearance settings are nested (settings.appearance.*); fontScale is
  // stored either as legacy 0–50 (default 50 = 100%) or as a multiplier.
  const rawFontScale = Number(settings.appearance?.fontScale ?? 50);
  const normFontScale = Number.isFinite(rawFontScale) && rawFontScale > 0
    ? (rawFontScale > 2 ? rawFontScale / 50 : rawFontScale)
    : 1;
  const shownFontScale = Math.min(1.4, Math.max(0.8, normFontScale));

  const handleCopyId = () => {
    navigator.clipboard.writeText(userId || 'usr_0941');
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('helpotron.cache');
      sessionStorage.clear();
      setClearedCache(true);
      setTimeout(() => setClearedCache(false), 2000);
    } catch (e) {}
  };

  return (
    <div className="flex flex-col gap-unit-6">
      {cropFile ? (
        <AvatarCropper
          file={cropFile}
          busy={profileBusy}
          onCancel={() => { if (!profileBusy) setCropFile(null); }}
          onDone={handleAvatarCropped}
        />
      ) : null}

      {/* ================= SECTION 1: ACCOUNT IDENTITY ================= */}
      {(section === 'all' || section === 'account') && (
        <section id="section-account" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
          <div className="flex items-center gap-unit-3 border-b border-outline-variant/15 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-title-md text-title-md font-semibold text-on-surface">
                Account Identity
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Cryptographic user identifier and account security controls.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-unit-4">
            {/* The ONE public-ID surface. It used to be a read-only card here and
                a second, editable copy further down — two displays of one value,
                which is the duplication this page keeps growing. */}
            <div className="flex flex-col gap-1.5 p-unit-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20">
              <span className="font-label-caps text-xs text-outline uppercase tracking-wider">
                Public ID — what you sign in with
              </span>
              <div className="flex items-center justify-between gap-2">
                <span
                  id="profilePublicId"
                  className="font-code-sm text-sm text-on-surface font-semibold truncate"
                >
                  {profile?.public_id || userId || '—'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                    title="Copy public ID"
                  >
                    {copiedId ? <Check className="w-4 h-4 text-sem-green" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    id="profileChangeIdBtn"
                    onClick={() => {
                      setIdDraft(profile?.public_id || '');
                      setIdPassword('');
                      setShowIdEditor(true);
                    }}
                    disabled={profile && profile.can_change_public_id === false}
                    title={
                      profile && profile.can_change_public_id === false
                        ? 'This account has no password set, so its ID cannot be changed here.'
                        : 'Change your public ID'
                    }
                    className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {showIdEditor && (
                <div className="flex flex-col gap-2 mt-2 p-3 rounded-xl bg-surface-container-lowest border border-primary/30">
                  <input
                    id="profileNewId"
                    type="text"
                    maxLength={64}
                    value={idDraft}
                    onChange={(e) => setIdDraft(e.target.value)}
                    placeholder="New public ID"
                    className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 font-code-sm text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary/60"
                  />
                  <input
                    id="profileIdPassword"
                    type="password"
                    value={idPassword}
                    onChange={(e) => setIdPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && idPassword && idDraft.trim()) handleChangePublicId(); }}
                    placeholder="Your current password"
                    autoComplete="current-password"
                    className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 font-body-sm text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary/60"
                  />
                  <p className="font-code-sm text-[10px] text-on-surface-variant">
                    3–64 characters, letters/numbers/hyphens/underscores. Your password is
                    required because this is your login identifier — you will sign in with
                    the new one from then on.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowIdEditor(false); setIdPassword(''); }}
                      className="h-9 px-3 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer font-label-caps text-[11px] uppercase tracking-wider"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      id="profileConfirmIdBtn"
                      onClick={handleChangePublicId}
                      disabled={profileBusy || !idPassword || !idDraft.trim()}
                      className="h-9 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-[11px] uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {profileBusy ? 'Saving…' : 'Change ID'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 p-unit-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20">
              <span className="font-label-caps text-xs text-outline uppercase tracking-wider">
                Active Tier Subscription
              </span>
              <div className="flex items-center justify-between">
                <span className="font-chip-status text-xs font-semibold px-2.5 py-1 rounded-full uppercase bg-primary-container text-on-primary-container">
                  {String(plan).toUpperCase()} PLAN
                </span>
                <span className="font-code-sm text-xs text-outline">Verified</span>
              </div>
            </div>
          </div>

          {/* ── Profile: picture, display name, public ID (owner 2026-09-21) ── */}
          <div className="flex flex-col gap-unit-4 p-unit-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20">
            <span className="font-label-caps text-xs text-outline uppercase tracking-wider">
              Profile
            </span>

            {/* Picture */}
            <div className="flex items-center gap-unit-4">
              <div className="relative shrink-0">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Your profile picture"
                    className="w-16 h-16 rounded-2xl object-cover border border-outline-variant/30"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant font-title-md text-xl font-semibold uppercase">
                    {String(profile?.public_id || userId || '?').slice(0, 1)}
                  </div>
                )}
                {profileBusy && (
                  <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-on-primary" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <input
                  id="profileAvatarInput"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Reset the input so picking the SAME file twice still fires
                    // a change event — otherwise a rejected-then-retried upload
                    // silently does nothing.
                    e.target.value = '';
                    handleAvatarPick(f);
                  }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="profileAvatarInput"
                    className="h-9 px-3 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors flex items-center gap-2 cursor-pointer font-label-caps text-[11px] uppercase tracking-wider"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Upload picture</span>
                  </label>
                  {profile?.avatar_url && (
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      disabled={profileBusy}
                      className="h-9 px-3 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors cursor-pointer font-label-caps text-[11px] uppercase tracking-wider disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <span className="font-code-sm text-[10px] text-outline">
                  PNG or JPG, up to 5 MB.
                </span>
              </div>
            </div>

            {/* Display name */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="profileDisplayName"
                className="font-label-caps text-xs text-outline uppercase tracking-wider"
              >
                Display name
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="profileDisplayName"
                  type="text"
                  maxLength={64}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="How your name appears in the app"
                  className="flex-1 h-10 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 font-body-sm text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary/60"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={profileBusy || nameDraft === (profile?.display_name || '')}
                  className="h-10 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-[11px] uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
              <span className="font-code-sm text-[10px] text-outline">
                Shown in the app. This is not what you sign in with.
              </span>
            </div>

            {profileMsg && (
              <p className="font-body-sm text-xs text-primary flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{profileMsg}</span>
              </p>
            )}
            {profileErr && (
              <p className="font-body-sm text-xs text-error flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{profileErr}</span>
              </p>
            )}
          </div>

          {/* API keys are a real thing and have their own section under Account —
              this used to claim they were "not provisioned", which stopped being
              true on 2026-09-17 when htk_ keys shipped. */}
          <div className="flex items-center justify-between p-unit-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 gap-unit-3">
            <div className="flex items-center gap-unit-3 min-w-0">
              <Key className="w-5 h-5 text-on-surface-variant shrink-0" />
              <div className="min-w-0">
                <span className="font-body-sm text-xs text-on-surface font-medium block">
                  API Keys
                </span>
                <span className="font-code-sm text-xs text-outline truncate block">
                  Create and revoke keys for the browser extension under{' '}
                  <button
                    type="button"
                    onClick={() => onSelectSection('apikeys')}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    Account → API Keys
                  </button>
                  .
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= SECTION 2: APPEARANCE & DISPLAY ================= */}
      {(section === 'all' || section === 'appearance') && (
        <section id="section-appearance" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
          <div className="flex items-center gap-unit-3 border-b border-outline-variant/15 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-title-md text-title-md font-semibold text-on-surface">
                Appearance &amp; Display
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Theme, font scaling, and accessibility controls.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-unit-5">
            {/* Left Column Controls */}
            <div className="lg:col-span-6 flex flex-col gap-unit-4">
              {/* Theme Selector */}
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-xs text-outline uppercase tracking-wider">
                  Color Mode
                </label>
                <div className="grid grid-cols-2 gap-unit-2 bg-surface-container-low p-1 rounded-2xl border border-outline-variant/20">
                  {[
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'light', label: 'Light', icon: Sun },
                  ].map((t) => {
                    const isSel = (settings.appearance?.theme || 'dark') === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => set({ theme: t.id, appearance: { theme: t.id } })}
                        className={`py-2 rounded-xl font-label-caps text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isSel
                            ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                            : 'text-outline hover:text-on-surface'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Scale Slider */}
              <div className="flex flex-col gap-2 p-unit-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <label className="font-label-caps text-xs text-outline uppercase tracking-wider">
                    Interface Font Scale
                  </label>
                  <span className="font-code-sm text-xs font-semibold text-primary">
                    {Math.round(shownFontScale * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-unit-3">
                  <input
                    type="range"
                    min={0.85}
                    max={1.25}
                    step={0.05}
                    value={shownFontScale}
                    onChange={(e) => set({ appearance: { fontScale: Number(e.target.value) } })}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              </div>

              {/* Accessibility Toggles */}
              <div className="flex flex-col gap-2">
                {[
                  { key: 'highContrast', label: 'High Contrast Mode', desc: 'Enhanced border delineation and increased text contrast' },
                  { key: 'reducedMotion', label: 'Reduced Motion', desc: 'Disable ambient background blurs and non-critical pulse animations' },
                  { key: 'dyslexiaFriendly', label: 'OpenDyslexic Typeface', desc: 'Weighted letter shapes to enhance readability' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/15 cursor-pointer hover:bg-surface-container-low transition-colors"
                  >
                    <div className="flex flex-col pr-2">
                      <span className="font-body-sm text-xs font-semibold text-on-surface">
                        {item.label}
                      </span>
                      <span className="font-code-sm text-[11px] text-outline">
                        {item.desc}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!(settings.accessibility && settings.accessibility[item.key])}
                      onChange={(e) => set({ accessibility: { [item.key]: e.target.checked } })}
                      className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Right Column: Live AppearancePreview Tile (§3.18.1) */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <AppearancePreview
                theme={settings.appearance?.theme || 'dark'}
                fontScale={shownFontScale}
                highContrast={!!(settings.accessibility && settings.accessibility.highContrast)}
                reducedMotion={!!(settings.accessibility && settings.accessibility.reducedMotion)}
                dyslexiaFriendly={!!(settings.accessibility && settings.accessibility.dyslexiaFriendly)}
              />
            </div>
          </div>
        </section>
      )}

      {/* ================= SECTION 3: NOTIFICATION CHANNELS ================= */}
      {(section === 'all' || section === 'notifications') && (
        <section id="section-notifications" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
          <div className="flex items-center gap-unit-3 border-b border-outline-variant/15 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-title-md text-title-md font-semibold text-on-surface">
                Notification Channels
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Manage email alerts, in-app auditory chimes, and system toasts.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {[
              { key: 'notifyEmail', label: 'Email Digest Notifications', desc: 'Daily coursework status and upcoming deadline summaries' },
              { key: 'notifyInApp', label: 'In-App Telemetry Banners', desc: 'Live alerts when agent completes proof derivations or doc exports' },
              { key: 'notifySound', label: 'Auditory Telemetry Feedback', desc: 'Subtle sound feedback on tool completions and approvals' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/15 cursor-pointer hover:bg-surface-container-low transition-colors"
              >
                <div className="flex flex-col pr-2">
                  <span className="font-body-sm text-xs font-semibold text-on-surface">
                    {item.label}
                  </span>
                  <span className="font-code-sm text-[11px] text-outline">
                    {item.desc}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings[item.key] !== false}
                  onChange={(e) => set({ [item.key]: e.target.checked })}
                  className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ================= SECTION: API KEYS ================= */}
      {(section === 'all' || section === 'apikeys') && <ApiKeysPanel />}

      {/* ================= SECTION: AI DETECTION & HUMANIZER ================= */}
      {(section === 'all' || section === 'humanizer') && (
        <section id="section-humanizer" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
          <div className="flex items-center gap-unit-3 border-b border-outline-variant/15 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <ScanSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-title-md text-title-md font-semibold text-on-surface">
                AI Detection &amp; Humanizer
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Humanization is applied as part of your work. The included detectors run on
                every pass and cost a fraction of a token; the external verification tier is
                opt-in and costs more per scan.
              </p>
            </div>
          </div>

          {/* Humanizer toggle — the rewrite engine runs only when this is on. */}
          <label className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/15 cursor-pointer hover:bg-surface-container-low transition-colors">
            <div className="flex flex-col pr-2">
              <span className="font-body-sm text-xs font-semibold text-on-surface">
                Humanizer
              </span>
              <span className="font-code-sm text-[11px] text-outline">
                Rewrites drafts to read as human-written. Costs task tokens, measured
                from the work each pass actually does.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings?.ai?.humanizer !== 'off'}
              onChange={(e) => set(setHumanizerSettings(settings, { humanizer: e.target.checked ? 'on' : 'off' }))}
              className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
            />
          </label>

          {/* Included detectors — selectable, always available, and METERED.
              They used to be labelled "Free". They are not: running them consumes
              CPU, which costs real money, and "local" would describe where they
              execute rather than anything the user experiences. They are cheap,
              not free (owner 2026-09-21). */}
          <div className="flex flex-col gap-2">
            <span className="font-label-caps text-[11px] text-outline uppercase tracking-wider">
              Included detectors
            </span>
            {[
              {
                key: 'zippy',
                label: 'ZipPy',
                desc: 'Compression heuristic. Compares your draft against a corpus of '
                  + 'machine-written and human-written text to see which it reads closer to. '
                  + 'Best at catching text that is fluent but was generated wholesale.',
              },
              {
                key: 'roberta_onnx',
                label: 'RoBERTa',
                desc: 'Trained classifier. Judges the draft as a whole and returns an '
                  + 'AI-likelihood. Slower than the heuristics, so it is consulted only when '
                  + 'the faster checks disagree — genuinely ambiguous drafts, not every pass.',
              },
              {
                key: 'cadence',
                label: 'Cadence & burstiness',
                desc: 'Rhythm analysis. Measures how much sentence length and structure vary. '
                  + 'Human writing swings between short and long; generated text sits in a '
                  + 'narrow band. Always runs — it is the baseline the other detectors are '
                  + 'read against, and it costs almost nothing.',
              },
            ].map((d) => {
              const toggleable = d.key !== 'cadence';
              const on = toggleable
                ? (settings?.ai?.detection?.detectors?.[d.key] ?? true)
                : true;
              return (
                <label
                  key={d.key}
                  className={`flex items-start justify-between gap-unit-3 p-unit-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/10 ${
                    toggleable ? 'cursor-pointer hover:bg-surface-container-low transition-colors' : ''
                  }`}
                >
                  <div className="flex flex-col pr-2">
                    <span className="font-body-sm text-xs font-semibold text-on-surface">
                      {d.label}
                    </span>
                    <span className="font-code-sm text-[11px] text-outline leading-relaxed">
                      {d.desc}
                    </span>
                  </div>
                  {toggleable ? (
                    <input
                      type="checkbox"
                      data-detector-toggle={d.key}
                      checked={on}
                      onChange={(e) => set(setHumanizerSettings(settings, {
                        detection: {
                          detectors: {
                            ...(settings?.ai?.detection?.detectors || {}),
                            [d.key]: e.target.checked,
                          },
                        },
                      }))}
                      className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary cursor-pointer shrink-0"
                    />
                  ) : (
                    <span className="font-code-sm text-[10px] mt-0.5 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/20 shrink-0">
                      Always on
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {/* Paid tier — explicit opt-in. */}
          <label className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/15 cursor-pointer hover:bg-surface-container-low transition-colors">
            <div className="flex flex-col pr-2">
              <span className="font-body-sm text-xs font-semibold text-on-surface">
                Paid detection verification
              </span>
              <span className="font-code-sm text-[11px] text-outline">
                Adds the external detectors (Pangram, Sapling) on top of the included
                ones. Each scan costs noticeably more per call, so this is off unless you turn it on.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings?.ai?.detection?.paid_verification === 'on'}
              onChange={(e) => set(setHumanizerSettings(settings, {
                detection: { paid_verification: e.target.checked ? 'on' : 'off' },
              }))}
              className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
            />
          </label>

          <div className="flex items-center gap-2 p-unit-3 rounded-xl bg-primary-container/10 border border-primary/20">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span className="font-code-sm text-[11px] text-on-surface-variant">
              Humanization itself is already accurate without external checks. Turn this on only if
              you want a second opinion from the paid detectors.
            </span>
          </div>
        </section>
      )}

      {/* ================= SECTION 4: PRIVACY & SECURITY ================= */}
      {(section === 'all' || section === 'privacy') && (
        <section id="section-privacy" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
          <div className="flex items-center gap-unit-3 border-b border-outline-variant/15 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-title-md text-title-md font-semibold text-on-surface">
                Privacy &amp; Security
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Multi-factor authentication, active session revocation, and data hygiene.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-unit-4">
            <div className="p-unit-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col justify-between gap-unit-3 sm:col-span-2">
              <TwoFactorSetup s={settings} set={set} />
            </div>

            <div className="p-unit-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col justify-between gap-unit-3">
              <div>
                <span className="font-body-sm text-xs font-semibold text-on-surface block">
                  Local Storage &amp; Session Hygiene
                </span>
                <span className="font-code-sm text-[11px] text-outline block mt-0.5">
                  Purge cached thread drafts and local temporary files.
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearCache}
                className="h-9 px-unit-3 rounded-xl bg-surface-container hover:bg-error-container/20 text-on-surface-variant hover:text-error border border-outline-variant/25 font-label-caps text-xs transition-colors flex items-center gap-1.5 self-start cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearedCache ? 'Cache Cleared!' : 'Clear Local Cache'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ================= SECTION 5: CREDITS READ-ONLY ================= */}
      {(section === 'all' || section === 'credits') && (
        <section id="section-credits" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
          <div className="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <div className="flex items-center gap-unit-3">
              <div className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-title-md text-title-md font-semibold text-on-surface">
                  Credits &amp; Billing Ledger
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Deterministic token balances and current plan rates.
                </p>
              </div>
            </div>

            {billingMsg && (
              <p className="font-code-sm text-[10px] text-sem-amber max-w-[240px] text-right">{billingMsg}</p>
            )}
            <button
              type="button"
              onClick={handleManageBilling}
              disabled={billingBusy}
              className="h-9 px-unit-3 rounded-xl bg-primary text-on-primary font-label-caps text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60"
            >
              <span>{billingBusy ? 'Opening…' : 'Manage Billing'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Balance first — what you have is the question this page answers. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-unit-3">
            <div className="p-unit-4 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-primary uppercase tracking-wider">
                Task tokens
              </span>
              <span className="font-tabular-stat-md text-2xl font-semibold text-on-surface">
                {Number(tokenBalance ?? 0).toLocaleString()}
              </span>
              <span className="font-code-sm text-[10px] text-on-surface-variant">
                Tokens meter the compute your tasks use. 100 tokens = 1¢ of service.
              </span>
            </div>
            <div className="p-unit-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col gap-1">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                Current plan
              </span>
              <span className="font-tabular-stat-md text-2xl font-semibold text-on-surface capitalize">
                {plan || 'none'}
              </span>
              <span className="font-code-sm text-[10px] text-on-surface-variant">
                Credits are earned discounts, not tokens — they come from referrals and
                data-lake contributions.
              </span>
            </div>
          </div>

          {/* The tier table, read live from /api/plans. */}
          {plans.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-unit-3">
              {plans.map((tier) => {
                const isCurrent = String(plan || '').toLowerCase() === String(tier.id || '').toLowerCase();
                const allowance = Number(tier.monthly_task_tokens ?? 0).toLocaleString();
                // A one-time grant is not a monthly allowance: the server does not
                // claim the trial or Testing renews, and neither does this.
                const cadence = tier.is_trial
                  ? 'for the 14-day trial'
                  : tier.is_testing
                    ? 'never expires'
                    : '/ month';
                return (
                  <div
                    key={tier.id}
                    className={`p-unit-4 rounded-2xl border flex flex-col gap-1.5 ${
                      isCurrent
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-surface-container-low/60 border-outline-variant/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-body-md text-sm font-semibold text-on-surface">
                        {tier.name}
                      </span>
                      {isCurrent ? (
                        <span className="font-chip-status text-[9px] text-primary font-bold uppercase shrink-0">
                          Current
                        </span>
                      ) : !tier.available ? (
                        <span className="font-chip-status text-[9px] text-on-surface-variant uppercase shrink-0">
                          Not available yet
                        </span>
                      ) : null}
                    </div>
                    <span className="font-tabular-stat-md text-sm font-semibold text-primary">
                      {tier.price_cents > 0 ? `$${(tier.price_cents / 100).toFixed(0)} / month` : 'Free'}
                    </span>
                    <span className="font-code-sm text-[11px] text-on-surface">
                      {allowance} task tokens <span className="text-outline">{cadence}</span>
                    </span>
                    {tier.tagline && (
                      <span className="font-body-sm text-[11px] text-on-surface-variant leading-snug">
                        {tier.tagline}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ================= SECTION 6: INTEGRATIONS ================= */}
      {/* ================= SECTION: INSIGHTS =================
          Moved here from the top-level nav (owner 2026-09-19). Same view, same
          data — it just no longer owns a product area. */}
      {(section === 'insights') && (
        <section id="section-insights" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm">
          <Suspense
            fallback={
              <div className="p-8 text-center font-code-sm text-xs text-on-surface-variant">
                Loading insights…
              </div>
            }
          >
            <InsightsView userId={userId} onGoTo={onGoTo} />
          </Suspense>
        </section>
      )}

      {(section === 'all' || section === 'integrations') && (
        <section id="section-integrations" className="rounded-3xl bg-surface-container-lowest/80 border border-outline-variant/30 p-unit-6 shadow-sm flex flex-col gap-unit-5">
          <TelegramIntegration
            preferences={settings}
            onChange={(delta) => set(delta)}
          />
        </section>
      )}
    </div>
  );
}
