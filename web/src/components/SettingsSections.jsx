/**
 * SettingsSections.jsx — Bare-bones 6-Section Settings Panels (Stitch v6 / §3.18).
 * Sections: Account | Appearance & Display | Notifications | Privacy & Security | Credits | Integrations.
 * Strict LUMINOUS GLASS M3 tokens, live preview tile, and Telegram real flow.
 */
import React, { useState } from 'react';
import {
  User, Moon, Sun, Laptop, Bell, Shield, CreditCard, Send,
  Key, Copy, Check, CheckCircle2, AlertCircle, Trash2, ExternalLink, ScanSearch
} from 'lucide-react';
import AppearancePreview from './AppearancePreview.jsx';
import TelegramIntegration from './TelegramIntegration.jsx';
import TwoFactorSetup from './TwoFactorSetup.jsx';
import ApiKeysPanel from './ApiKeysPanel.jsx';

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
}) {
  const [copiedId, setCopiedId] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState('');

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
            <div className="flex flex-col gap-1.5 p-unit-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20">
              <span className="font-label-caps text-xs text-outline uppercase tracking-wider">
                Public Identifier
              </span>
              <div className="flex items-center justify-between">
                <span className="font-code-sm text-sm text-on-surface font-semibold truncate">
                  {userId || 'usr_syn_0941'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="p-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
                  title="Copy User ID"
                >
                  {copiedId ? <Check className="w-4 h-4 text-sem-green" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
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

          {/* Developer API Key — honest: no per-user API keys are issued yet */}
          <div className="flex items-center justify-between p-unit-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 gap-unit-3">
            <div className="flex items-center gap-unit-3 min-w-0">
              <Key className="w-5 h-5 text-on-surface-variant shrink-0" />
              <div className="min-w-0">
                <span className="font-body-sm text-xs text-on-surface font-medium block">
                  Developer API Key
                </span>
                <span className="font-code-sm text-xs text-outline truncate block">
                  Not provisioned — keys ship with the API program when it launches.
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
                <div className="grid grid-cols-3 gap-unit-2 bg-surface-container-low p-1 rounded-2xl border border-outline-variant/20">
                  {[
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'system', label: 'System', icon: Laptop },
                  ].map((t) => {
                    const isSel = (settings.appearance?.theme || 'dark') === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => set({ appearance: { theme: t.id } })}
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
                Humanization runs on your own machine. Detection is local by default; paid
                verification is opt-in.
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
                Rewrites drafts to read as human-written. Runs locally — no data leaves this machine.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings?.ai?.humanizer !== 'off'}
              onChange={(e) => set(setHumanizerSettings(settings, { humanizer: e.target.checked ? 'on' : 'off' }))}
              className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
            />
          </label>

          {/* Local tier — always on, free, in-process. */}
          <div className="flex flex-col gap-2">
            <span className="font-label-caps text-[11px] text-outline uppercase tracking-wider">
              Included detectors
            </span>
            {[
              { label: 'ZipPy', desc: 'Local compression heuristic' },
              { label: 'RoBERTa-ONNX', desc: 'Local classifier running on this machine' },
              { label: 'Cadence & burstiness', desc: 'Statistical rhythm analysis' },
            ].map((d) => (
              <div
                key={d.label}
                className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/10"
              >
                <div className="flex flex-col pr-2">
                  <span className="font-body-sm text-xs font-semibold text-on-surface">{d.label}</span>
                  <span className="font-code-sm text-[11px] text-outline">{d.desc}</span>
                </div>
                <span className="font-code-sm text-[11px] px-2 py-0.5 rounded-full bg-sem-green/10 text-sem-green border border-sem-green/20">
                  Free
                </span>
              </div>
            ))}
          </div>

          {/* Paid tier — explicit opt-in. */}
          <label className="flex items-center justify-between p-unit-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/15 cursor-pointer hover:bg-surface-container-low transition-colors">
            <div className="flex flex-col pr-2">
              <span className="font-body-sm text-xs font-semibold text-on-surface">
                Paid detection verification
              </span>
              <span className="font-code-sm text-[11px] text-outline">
                Runs the external detectors (Pangram, Sapling) for extra verification. Each scan
                costs credits, so this is off unless you turn it on.
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-unit-3">
            {[
              { label: 'Trial', price: '$0 / 7 days', desc: '150 task tokens' },
              { label: 'Basic', price: '$10 / mo', desc: '300 task tokens' },
              { label: 'Pro', price: '$20 / mo', desc: '1,000 task tokens' },
              { label: 'Elite', price: '$40 / mo', desc: '2,700 task tokens' },
            ].map((tier) => {
              const isCurrent = (plan || 'pro').toLowerCase() === tier.label.toLowerCase();
              return (
                <div
                  key={tier.label}
                  className={`p-unit-3 rounded-2xl border flex flex-col gap-1 ${
                    isCurrent
                      ? 'bg-primary/10 border-primary/40 text-on-surface'
                      : 'bg-surface-container-low/60 border-outline-variant/20 text-on-surface-variant'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-body-sm text-xs font-semibold text-on-surface">
                      {tier.label}
                    </span>
                    {isCurrent && (
                      <span className="font-chip-status text-[9px] text-primary font-bold uppercase">
                        Current
                      </span>
                    )}
                  </div>
                  <span className="font-tabular-stat-md text-sm font-semibold text-primary">
                    {tier.price}
                  </span>
                  <span className="font-code-sm text-[10px] text-outline">
                    {tier.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================= SECTION 6: INTEGRATIONS ================= */}
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
