/* ────────────────────────────────────────────────────────────────────────────
 * AnonymousLanding.jsx — signed-out marketing state.
 *
 * Auth gate (08-28): contains NO authenticated data and NO dashboard
 * internals. Anonymous visitors only ever see this page.
 *
 * Redesign 09-01 (Stitch iteration2 — helpotron_landing_page/code.html):
 *   · Ported onto the STITCH DESIGN TOKENS (@theme inline roles) so it renders
 *     the "Premium Co-pilot" scheme — dark by default (the app's theme),
 *     light sheet under [data-theme="light"]. One markup, both themes.
 *   · Header/nav per the design: logo lockup, Features · Guide · Pricing,
 *     Sign in / Get Started, and a working mobile menu (was a dead button in
 *     the reference export — implemented here, no placeholders).
 *   · Aurora accents (landing-atmos / text-aurora) removed; the design's
 *     translucent tone blobs + gradient span (primary→secondary) replace them.
 *   · The LipScrollZoominAnimation interlude is GONE. It produced a pinned
 *     white cinematic that at 390px read as a giant engulfing white "heart"
 *     blocking the page between hero and features — the mobile appearance bug.
 *     The Stitch landing has no such interlude; the page flows hero → product
 *     → features → pricing now, on every viewport.
 *   · Kept everything real from the pre-redesign page: Pricing reads
 *     GET /api/plans (never hardcoded), the public GuideView modal, auth
 *     intents (login/signup), privacy wiring, the honest trust chips, the
 *     product depiction (restyled into the design's mac-chrome frame).
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useState } from 'react';
import {
  Layers, Brain, History as HistoryIcon, ArrowRight, ShieldCheck,
  Puzzle, Sparkles, Check, FileText, BookOpen, X, Menu, PlayCircle,
  AlertTriangle,
} from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';
const CookieBanner = React.lazy(() => import('./CookieBanner.jsx'));
const GuideView = React.lazy(() => import('./GuideView.jsx'));
const PrivacyPolicyView = React.lazy(() => import('./PrivacyPolicyView.jsx'));
const TermsOfServiceView = React.lazy(() => import('./TermsOfServiceView.jsx'));
const ExtensionInstallView = React.lazy(() => import('./ExtensionInstallView.jsx'));
const TestingAccessModal = React.lazy(() => import('./TestingAccessModal.jsx'));

const FALLBACK_PLANS = [
  {
    id: 'trial',
    name: 'Free Trial',
    tagline: '7-day starter trial with 15,000 task tokens — unlocked after 2FA and a $0.01 payment verification. New accounts start at 0 tokens.',
    price_cents: 0,
    price_monthly: 0,
    monthly_task_tokens: 15000,
    is_trial: true,
    is_testing: false,
    available: false,
    unavailable_reason: 'Not available yet — the 1¢ verification opens at launch.',
    requires_2fa: true,
    requires_1c_payment: true,
    popular: false,
  },
  {
    id: 'testing',
    name: 'Testing',
    tagline: 'Free 15,000 task tokens for people evaluating the platform and reporting issues. Tell the developer who you are — approval is manual.',
    price_cents: 0,
    price_monthly: 0,
    monthly_task_tokens: 15000,
    is_trial: false,
    is_testing: true,
    available: true,
    unavailable_reason: '',
    requires_2fa: false,
    requires_1c_payment: false,
    requires_approval: true,
    popular: false,
  },
  {
    id: 'basic',
    name: 'Basic',
    tagline: '30,000 task tokens / month for steady coursework.',
    price_cents: 1000,
    price_monthly: 10,
    monthly_task_tokens: 30000,
    is_trial: false,
    is_testing: false,
    available: false,
    unavailable_reason: 'Not available yet — paid plans open at launch.',
    requires_2fa: false,
    requires_1c_payment: false,
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: '100,000 task tokens / month for a full semester load.',
    price_cents: 2000,
    price_monthly: 20,
    monthly_task_tokens: 100000,
    is_trial: false,
    is_testing: false,
    available: false,
    unavailable_reason: 'Not available yet — paid plans open at launch.',
    requires_2fa: false,
    requires_1c_payment: false,
    popular: false,
  },
  {
    id: 'elite',
    name: 'Elite',
    tagline: '270,000 task tokens / month for heavy research and multi-agent work.',
    price_cents: 4000,
    price_monthly: 40,
    monthly_task_tokens: 270000,
    is_trial: false,
    is_testing: false,
    available: false,
    unavailable_reason: 'Not available yet — paid plans open at launch.',
    requires_2fa: false,
    requires_1c_payment: false,
    popular: false,
  },
];

const FEATURES = [
  {
    Icon: Layers,
    title: 'Subject bubbles',
    body: 'Imported coursework sorts itself into per-subject bubbles, each with its own agent workspace — instead of one undifferentiated pile.',
  },
  {
    Icon: Brain,
    title: 'An agent per assignment',
    body: 'Every assignment gets a dedicated thread with its own files and memory, so context never bleeds between a lab report and an essay.',
  },
  {
    Icon: HistoryIcon,
    title: 'An honest completion ledger',
    body: 'Mark work completed and keep a timestamped record of what you actually submitted, with undo. Your own audit trail.',
  },
];

const STEPS = [
  { n: '01', title: 'Create an account', body: 'A public ID and a password. No email, no card.' },
  { n: '02', title: 'Bring your coursework', body: 'Paste an assignment dump, or let the browser extension capture it.' },
  { n: '03', title: 'Work and mark complete', body: 'Bubbles group it, your agent drafts, the ledger records it.' },
];

/* Primary / secondary action styles — Stitch design tokens (09-01).
   The design's hover pair is bg-primary-container + text-on-primary-container;
   on light and dark sheets both resolve correctly. */
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-title-md text-body-md font-semibold transition-all shadow-sm active:scale-95 cursor-pointer';
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-surface text-on-surface font-title-md text-body-md font-semibold border border-outline-variant/50 hover:bg-surface-container-low transition-all active:scale-95 cursor-pointer';

/* ── Product depiction ───────────────────────────────────────────────────────
 * A faithful, static rendering of the real workspace built from the same
 * design tokens as the app — not a screenshot. Screenshots of this product
 * would contain real student coursework, so shipping one publicly is a
 * privacy problem; the course names below are generic by construction.
 * Decorative: the surrounding copy carries the meaning for screen readers.
 * Rested 09-01 into the design's dashboard frame (mac chrome + glow). */
function ProductPreview() {
  const bubbles = [
    { subject: 'Organic Chemistry', count: 4, tone: 'var(--color-primary)' },
    { subject: 'US History', count: 2, tone: 'var(--color-secondary)' },
    { subject: 'Calculus II', count: 3, tone: 'var(--color-primary)' },
  ];
  const stats = [
    { label: 'Assignments', value: '12' },
    { label: 'Completed', value: '7' },
    { label: 'In progress', value: '3' },
  ];
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl overflow-hidden border border-outline-variant/20 bg-surface-container-lowest select-none"
      style={{ boxShadow: '0 20px 40px -10px rgba(0,104,95,0.15), 0 0 20px rgba(70,72,212,0.05)' }}
    >
      {/* mac-style window header */}
      <div className="h-8 bg-surface-container-low border-b border-outline-variant/20 flex items-center px-4 gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-outline-variant/50" />
        <span className="ml-2 font-mono text-[11px] text-on-surface-variant truncate">helpotron.study_os</span>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* stat strip (design mockup cards) */}
        <div className="grid grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="h-auto py-3 px-3 bg-surface-container-low rounded-lg border border-outline-variant/20 text-center">
              <div className="font-tabular-stat text-tabular-stat text-on-surface font-bold">{s.value}</div>
              <div className="text-[10px] text-on-surface-variant mt-0.5 truncate">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-[1.05fr_1fr]">
          {/* left: subject bubbles */}
          <div className="space-y-2.5">
            <div className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">Bubbles</div>
            {bubbles.map(({ subject, count, tone }) => (
              <div
                key={subject}
                className="group flex items-center gap-3 p-3 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-colors"
              >
                <span className="h-8 w-8 shrink-0 rounded-xl flex items-center justify-center bg-primary/15 text-primary">
                  <Layers className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-on-surface truncate">{subject}</span>
                  <span className="block text-[11px] text-on-surface-variant">{count} open</span>
                </span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
              </div>
            ))}
          </div>

          {/* right: agent thread + ledger */}
          <div className="space-y-2.5">
            <div className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">Assignment agent</div>
            <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/20 space-y-2.5">
              <div className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-on-surface-variant" />
                <span className="text-[11px] text-on-surface leading-relaxed">
                  Lab report — reaction mechanisms
                </span>
              </div>
              <div className="space-y-1.5 pl-5">
                <span className="block h-1.5 rounded-full bg-outline-variant/40 w-[92%]" />
                <span className="block h-1.5 rounded-full bg-outline-variant/40 w-[78%]" />
                <span className="block h-1.5 rounded-full bg-outline-variant/40 w-[85%]" />
              </div>
              <div className="flex items-center gap-1.5 pt-0.5 pl-5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-mono text-on-surface-variant">drafting…</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-surface-container-low border border-outline-variant/20">
              <Check className="w-3.5 h-3.5 shrink-0 text-sem-green" />
              <span className="text-[11px] text-on-surface flex-1 min-w-0 truncate">
                Essay draft — completed
              </span>
              <span className="text-[10px] font-mono text-on-surface-variant shrink-0">14:02</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pricing (never-die honest failure line, Spec 3.3.1) ──────────────────────
 * Reads GET /api/plans. If offline or network blips, falls back to standard
 * catalogue ($0, $10, $20, $40) with an honest muted status indicator. */
function Pricing({ onOpenAuth, onApplyTesting }) {
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [isLive, setIsLive] = useState(false);
  // Which tier an unavailable click referred to. Owner 2026-09-18: paid tiers
  // stay visible, but pressing one must say why nothing happened instead of
  // opening a checkout that cannot complete. The button stays ENABLED on
  // purpose — a disabled button explains nothing.
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/plans', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.plans?.length) {
          setPlans(d.plans);
          setIsLive(true);
        }
      })
      .catch(() => {
        // Keeps FALLBACK_PLANS without unmounting or failing
      });
    return () => { alive = false; };
  }, []);

  const handleTierClick = (p) => {
    // `available` is authoritative and comes from the server, which derives it
    // from whether the payment gateway is configured — so these open by
    // themselves at launch with no client change.
    if (p.available === false) {
      setNotice(`${p.name} — ${p.unavailable_reason || 'Not available yet.'}`);
      return;
    }
    setNotice('');
    if (p.is_testing) {
      onApplyTesting();
      return;
    }
    onOpenAuth('signup');
  };

  const fmt = (n) => n.toLocaleString();

  return (
    <section id="pricing" style={{ scrollMarginTop: '88px' }} className="max-w-[1100px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
      <div className="text-center space-y-2 mb-4">
        <h2 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Start free. Upgrade only for volume.</h2>
        <p className="text-body-md text-on-surface-variant max-w-[60ch] mx-auto">
          Every plan includes every feature. The only difference is how much you can run each month.
        </p>
      </div>

      {/* Never-die muted status line */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant font-mono">
            <span className="w-2 h-2 rounded-full bg-sem-green animate-pulse" /> Verified live rates from Helpotron billing gateway
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant font-mono">
            <span className="w-2 h-2 rounded-full bg-outline-variant" /> Standard tier catalogue — confirmed at checkout
          </span>
        )}
      </div>

        {/* "Not available yet" — shown in the page, not a transient toast, so a
            user who pressed a paid tier can read why at their own pace. */}
        {notice && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 mb-6 max-w-[640px] mx-auto px-4 py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`card-lift p-5 flex flex-col gap-4 rounded-2xl bg-surface-container-lowest relative ${
                p.popular ? 'border-primary/50 ring-1 ring-primary/30' : 'border border-outline-variant/30'
              } ${p.available === false ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 min-h-[1.5rem]">
                <div className="text-sm font-semibold text-on-surface">{p.name}</div>
                {p.popular && (
                  <span className="font-label-caps text-label-caps text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary shrink-0 font-semibold">Most popular</span>
                )}
                {p.is_trial && p.available !== false && (
                  <span className="font-label-caps text-label-caps text-[10px] px-2 py-0.5 rounded-full bg-sem-green/15 text-sem-green shrink-0 font-semibold">2FA + 1¢ verify</span>
                )}
                {p.is_testing && (
                  <span className="font-label-caps text-label-caps text-[10px] px-2 py-0.5 rounded-full bg-sem-green/15 text-sem-green shrink-0 font-semibold">Free access</span>
                )}
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold tracking-tight text-on-surface">
                  ${p.price_monthly % 1 === 0 ? p.price_monthly : p.price_monthly.toFixed(2)}
                </span>
                <span className="text-xs text-on-surface-variant">/{p.is_trial ? '7 days' : 'mo'}</span>
              </div>
              <div className="text-xs text-on-surface-variant leading-relaxed">{p.tagline}</div>

              <div className="text-xs text-on-surface-variant border-t border-outline-variant/30 pt-3 mt-auto">
                <div className="font-semibold text-on-surface font-tabular-stat">{fmt(p.monthly_task_tokens || p.monthly_credits)} task tokens</div>
              </div>
              <button
                type="button"
                onClick={() => handleTierClick(p)}
                title={p.available === false ? p.unavailable_reason : undefined}
                className={`${p.popular ? BTN_PRIMARY : (p.is_testing ? 'inline-flex items-center justify-center rounded-xl bg-sem-deepgreen hover:bg-sem-green text-on-sem-deepgreen hover:text-on-sem-deepgreen font-title-md text-body-md font-semibold transition-all active:scale-95 cursor-pointer shadow-sm' : BTN_SECONDARY)} w-full px-4 py-2.5`}
              >
                {p.available === false
                  ? 'Not available yet'
                  : p.is_testing
                    ? 'Apply for free access'
                    : p.is_trial
                      ? 'Start free trial'
                      : p.price_cents === 0 ? 'Start free' : `Choose ${p.name}`}
              </button>
            </div>
          ))}
        </div>


      <p className="mt-6 flex items-start justify-center gap-2 text-xs text-on-surface-variant max-w-[62ch] mx-auto">
        <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-secondary" aria-hidden="true" />
        <span>
          Utilities are metered in task tokens — you always see the token cost of a task before
          you approve it. Credits top up your token allowance when you need more.
        </span>
      </p>

      <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-w-[900px] mx-auto">
        {(plans[0]?.capabilities || []).map((c) => (
          <li key={c} className="flex items-start gap-2 text-xs text-on-surface-variant">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sem-green" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AnonymousLanding({ onOpenAuth = null, onOpenPrivacy = null }) {
  /* `intent` is 'login' or 'signup'. Call sites MUST pass it explicitly —
   * a bare onClick={openAuth} would forward React's event object instead. */
  const openAuth = (intent) => { if (onOpenAuth) onOpenAuth(intent === 'login' ? 'login' : 'signup'); };

  /* Public guide (08-31, owner request "add the guide in the front page before
     users sign up"): any visitor can read the full feature guide before
     creating an account. Static content only — no authed fetches. */
  const [guideOpen, setGuideOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Free Testing-tier application (owner 2026-09-18). Public on purpose: it is
  // the only tier a visitor can start before launch, and requiring a session
  // would exclude the people evaluating the platform.
  const [testingOpen, setTestingOpen] = useState(false);

  // Deep-link navigation handler with pushState
  const navigatePath = (path) => {
    setMenuOpen(false);
    if (path === '/features') {
      setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
      window.history.pushState(null, '', '/features');
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
    } else if (path === '/pricing') {
      setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
      window.history.pushState(null, '', '/pricing');
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    } else if (path === '/guide') {
      setGuideOpen(true); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
      window.history.pushState(null, '', '/guide');
    } else if (path === '/privacy') {
      setPrivacyOpen(true); setGuideOpen(false); setTermsOpen(false); setExtensionOpen(false);
      window.history.pushState(null, '', '/privacy');
    } else if (path === '/terms') {
      setTermsOpen(true); setGuideOpen(false); setPrivacyOpen(false); setExtensionOpen(false);
      window.history.pushState(null, '', '/terms');
    } else if (path === '/extension') {
      setExtensionOpen(true); setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false);
      window.history.pushState(null, '', '/extension');
    } else {
      setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
      if (window.location.pathname !== '/') window.history.pushState(null, '', '/');
    }
  };

  const closeModal = () => {
    setGuideOpen(false);
    setPrivacyOpen(false);
    setTermsOpen(false);
    setExtensionOpen(false);
    setTestingOpen(false);
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname.replace(/\/+$/, '') || '/';
      if (p === '/guide') {
        setGuideOpen(true); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
      } else if (p === '/privacy') {
        setPrivacyOpen(true); setGuideOpen(false); setTermsOpen(false); setExtensionOpen(false);
      } else if (p === '/terms') {
        setTermsOpen(true); setGuideOpen(false); setPrivacyOpen(false); setExtensionOpen(false);
      } else if (p === '/extension') {
        setExtensionOpen(true); setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false);
      } else if (p === '/features') {
        setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
        document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
      } else if (p === '/pricing') {
        setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setGuideOpen(false); setPrivacyOpen(false); setTermsOpen(false); setExtensionOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    handlePopState();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const anyModalOpen = guideOpen || privacyOpen || termsOpen || extensionOpen || menuOpen || testingOpen;
  useEffect(() => {
    if (!anyModalOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [anyModalOpen]);

  const navLinks = [
    { label: 'Features', onClick: () => navigatePath('/features') },
    { label: 'Guide', onClick: () => navigatePath('/guide') },
    { label: 'Pricing', onClick: () => navigatePath('/pricing') },
  ];

  return (
    <div id="main-content" className="min-h-screen bg-background text-on-surface font-body-md antialiased selection:bg-primary-container selection:text-on-primary-container">
      {/* ── Top bar (design: fixed header, translucent + blur, shadow past 20px) */}
      <header
        id="main-header"
        className="fixed top-0 w-full z-40 border-b border-outline-variant/30 transition-all duration-300 bg-surface/80 backdrop-blur-md"
      >
        <div className="max-w-[1440px] mx-auto px-container-padding h-16 flex items-center justify-between gap-3">
          {/* Brand lockup — one logo + wordmark */}
          <a href="#main-content" onClick={(e) => { e.preventDefault(); navigatePath('/'); }} className="flex items-center gap-3 min-w-0" aria-label="Helpotron home">
            <AnimatedLogo size="md" wordmarkClassName="hidden" />
            <span className="font-headline-lg text-[22px] font-bold text-primary tracking-tight whitespace-nowrap">Helpotron</span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main">
            <button type="button" onClick={() => navigatePath('/features')} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer">Features</button>
            <button type="button" onClick={() => navigatePath('/guide')} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer">Guide</button>
            <button type="button" onClick={() => navigatePath('/pricing')} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer">Pricing</button>
          </nav>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-4">
            <button type="button" onClick={() => openAuth('login')} className="font-label-caps text-label-caps text-primary hover:text-primary-container transition-colors cursor-pointer">
              Sign in
            </button>
            <button type="button" onClick={() => openAuth('signup')} className="bg-primary text-on-primary font-label-caps text-label-caps px-6 py-2.5 rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-all shadow-sm active:scale-95 cursor-pointer">
              Get Started
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu panel */}
        {menuOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-outline-variant/30 bg-surface/95 backdrop-blur-md">
            <nav className="px-container-padding py-3 flex flex-col gap-1" aria-label="Mobile">
              {navLinks.map((l) => (
                <button
                  key={l.label}
                  type="button"
                  onClick={l.onClick}
                  className="text-left font-label-caps text-label-caps text-on-surface-variant hover:text-primary hover:bg-surface-container-low px-3 py-3 rounded-lg transition-colors cursor-pointer"
                >
                  {l.label}
                </button>
              ))}
              <div className="flex items-center gap-3 pt-2 pb-1">
                <button type="button" onClick={() => { setMenuOpen(false); openAuth('login'); }} className="flex-1 font-label-caps text-label-caps text-primary border border-primary/40 hover:bg-primary/10 px-4 py-3 rounded-lg transition-colors cursor-pointer">
                  Sign in
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); openAuth('signup'); }} className="flex-1 bg-primary text-on-primary font-label-caps text-label-caps px-4 py-3 rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-all shadow-sm active:scale-95 cursor-pointer">
                  Get Started
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ── Hero (v3 split layout: left copy / right visual) */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden max-w-[1440px] mx-auto px-container-padding">
        {/* Abstract background elements — Stitch's translucent tone blobs */}
        <div className="absolute top-16 right-0 w-1/2 h-[420px] sm:h-[500px] bg-primary-container/10 rounded-full blur-[100px] -z-10 translate-x-1/4 -translate-y-1/4 pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-24 left-0 w-1/3 h-[400px] bg-secondary-container/10 rounded-full blur-[80px] -z-10 -translate-x-1/4 translate-y-1/4 pointer-events-none" aria-hidden="true" />

        <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center mb-12 sm:mb-16">
          {/* Left Column: Copy & Actions */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 mb-6">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
              <span className="font-label-caps text-label-caps text-on-surface-variant font-medium">Academic Co-pilot 2.0</span>
            </div>

            <h1
              className="font-display-xl text-display-xl text-on-surface mb-6 leading-tight tracking-tight"
              style={{ fontSize: 'clamp(2.2rem, 5vw, 3.25rem)', textWrap: 'balance' }}
            >
              Your Academic <span className="whitespace-nowrap">Co-pilot,</span>{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Redefined</span>
            </h1>

            <p className="font-body-md text-body-md sm:text-[18px] text-on-surface-variant max-w-xl mb-8 leading-relaxed">
              Helpotron captures your coursework, sorts it into subject bubbles, and gives
              every assignment its own AI agent — while keeping an honest ledger of what
              you actually completed.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <button type="button" onClick={() => openAuth('signup')} className={`${BTN_PRIMARY} px-8 py-3.5 w-full sm:w-auto`}>
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => navigatePath('/guide')} className={`${BTN_SECONDARY} px-8 py-3.5 w-full sm:w-auto`}>
                <BookOpen className="w-4 h-4 text-primary" /> Read the Guide
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-sem-green" /> No credit card</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-sem-green" /> No email required</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-sem-green" /> Nothing personal before sign-in</span>
            </div>
          </div>

          {/* Right Column: High-fidelity workspace mockup */}
          <div className="lg:col-span-6 relative w-full">
            <ProductPreview />
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" style={{ scrollMarginTop: '88px' }} className="max-w-[1100px] mx-auto px-container-padding py-16 sm:py-24">
        <h2 className="font-headline-lg text-headline-lg tracking-tight text-center mb-10">
          What you actually get
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="card-lift rounded-2xl bg-surface-container-lowest p-5 space-y-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 border border-primary/25">
                <Icon className="w-5 h-5 text-primary" />
              </span>
              <h3 className="font-title-md text-title-md text-on-surface">{title}</h3>
              <p className="text-body-sm text-on-surface-variant leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing (real numbers, from the billing table) ──────────────────── */}
      <Pricing onOpenAuth={openAuth} onApplyTesting={() => setTestingOpen(true)} />

      {/* ── How it works + closing CTA ──────────────────────────────────────── */}
      <section className="max-w-[900px] mx-auto px-container-padding pb-20 sm:pb-24">
        <div className="rounded-3xl bg-surface-container-low border border-outline-variant/30 p-6 sm:p-10 text-center space-y-7">
          <h2 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Three steps to a self-driving coursework pipeline</h2>
          <ol className="grid gap-3 sm:grid-cols-3 text-left">
            {STEPS.map(({ n, title, body }) => (
              <li key={n} className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-4 space-y-1.5">
                <span className="inline-block font-label-caps text-label-caps font-bold text-on-primary bg-primary rounded-md px-2 py-0.5">{n}</span>
                <div className="text-body-md font-semibold text-on-surface">{title}</div>
                <div className="text-body-sm text-on-surface-variant leading-relaxed">{body}</div>
              </li>
            ))}
          </ol>
          <div className="border-t border-outline-variant/30 pt-7">
            <button type="button" onClick={() => openAuth('signup')} className={`${BTN_PRIMARY} px-8 py-3.5`}>
              Start free <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer (design: bg-surface-dim, brand + ©, legal links, Solo Dev Roni) */}
      <footer className="bg-surface-dim border-t border-outline-variant/20">
        <div className="max-w-[1440px] mx-auto w-full py-8 px-container-padding flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <AnimatedLogo size="sm" showWordmark={false} />
              <span className="font-headline-lg text-[20px] font-bold text-primary">Helpotron</span>
            </div>
            <span className="text-body-sm text-on-surface-variant">© 2026 Helpotron Study OS. All rights reserved.</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono font-medium text-primary">
              ⚡ Engineered by Solo Dev Roni
            </span>
          </div>
          <div className="flex flex-wrap gap-5 items-center justify-center">
            <button type="button" onClick={() => navigatePath('/privacy')} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary hover:underline transition-all cursor-pointer">
              Privacy Policy
            </button>
            <button type="button" onClick={() => navigatePath('/terms')} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary hover:underline transition-all cursor-pointer">
              Terms of Service
            </button>
            <button type="button" onClick={() => navigatePath('/guide')} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary hover:underline transition-all cursor-pointer">
              Help Center
            </button>
            <button type="button" onClick={() => navigatePath('/extension')} className="inline-flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary transition-all cursor-pointer">
              <Puzzle className="w-3.5 h-3.5" /> Extension Companion
            </button>
          </div>
        </div>
      </footer>

      {/* ── Public Guide Modal (pre-signup access) ─────────────────────────── */}
      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Helpotron Guide"
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl mt-2 sm:mt-6 rounded-2xl border border-outline-variant/30 bg-surface shadow-2xl overflow-hidden animate-fadeIn"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-on-surface">
                <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" /> Helpotron Knowledge Base &amp; Guide
              </span>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close guide"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 sm:p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
              <React.Suspense fallback={<div className="p-8 text-center text-xs text-on-surface-variant font-mono animate-pulse">Loading…</div>}>
                <GuideView publicMode onGoTo={(intent) => { closeModal(); if (intent === 'pricing') { navigatePath('/pricing'); } else { openAuth(intent || 'signup'); } }} />
              </React.Suspense>
            </div>
          </div>
        </div>
      )}

      {/* ── Public Privacy Policy Modal ────────────────────────────────────── */}
      {privacyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Helpotron Privacy Policy"
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl mt-2 sm:mt-6 rounded-2xl border border-outline-variant/30 bg-surface shadow-2xl overflow-hidden animate-fadeIn"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-on-surface">
                <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" /> Privacy Policy
              </span>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close privacy policy"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 sm:p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
              <React.Suspense fallback={<div className="p-8 text-center text-xs text-on-surface-variant font-mono animate-pulse">Loading…</div>}>
                <PrivacyPolicyView publicMode={false} onBack={closeModal} onGoTo={(intent) => { closeModal(); openAuth(intent || 'signup'); }} />
              </React.Suspense>
            </div>
          </div>
        </div>
      )}

      {/* ── Public Terms of Service Modal ──────────────────────────────────── */}
      {termsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Helpotron Terms of Service"
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl mt-2 sm:mt-6 rounded-2xl border border-outline-variant/30 bg-surface shadow-2xl overflow-hidden animate-fadeIn"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-on-surface">
                <FileText className="w-4 h-4 text-primary" aria-hidden="true" /> Terms of Service
              </span>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close terms of service"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 sm:p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
              <React.Suspense fallback={<div className="p-8 text-center text-xs text-on-surface-variant font-mono animate-pulse">Loading…</div>}>
                <TermsOfServiceView publicMode={false} onBack={closeModal} onGoTo={(intent) => { closeModal(); openAuth(intent || 'signup'); }} />
              </React.Suspense>
            </div>
          </div>
        </div>
      )}

      {/* ── Public Extension Companion Modal ───────────────────────────────── */}
      {extensionOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Helpotron Extension Companion"
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl mt-2 sm:mt-6 rounded-2xl border border-outline-variant/30 bg-surface shadow-2xl overflow-hidden animate-fadeIn"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-on-surface">
                <Puzzle className="w-4 h-4 text-primary" aria-hidden="true" /> Browser Extension Companion
              </span>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close extension companion"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 sm:p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
              <React.Suspense fallback={<div className="p-8 text-center text-xs text-on-surface-variant font-mono animate-pulse">Loading…</div>}>
                <ExtensionInstallView publicMode={true} onBack={closeModal} onGoTo={(intent) => { closeModal(); openAuth(intent || 'signup'); }} />
              </React.Suspense>
            </div>
          </div>
        </div>
      )}

        {/* ── Free Testing-tier application (only tier open before launch) ─── */}
        <TestingAccessModal open={testingOpen} onClose={closeModal} />

        {/* ── Student Privacy & Cookie Choice Banner ────────────────────────── */}
        <React.Suspense fallback={null}>
          <CookieBanner />
        </React.Suspense>
      </div>
    );
  }
