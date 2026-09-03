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
} from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';
import GuideView from './GuideView.jsx';

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

/* ── Pricing ─────────────────────────────────────────────────────────────────
 * Reads GET /api/plans. Renders nothing at all if the call fails: quoting a
 * stale hardcoded price is worse than quoting none, and a visitor who sees no
 * pricing block is strictly better off than one who is quoted a number the
 * checkout will contradict. */
function Pricing({ onOpenAuth }) {
  const [plans, setPlans] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/plans', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.plans?.length) setPlans(d.plans); })
      .catch(() => { /* offline or backend down — section stays hidden */ });
    return () => { alive = false; };
  }, []);

  if (!plans) return null;

  const fmt = (n) => n.toLocaleString();

  return (
    <section id="pricing" className="max-w-[1100px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
      <div className="text-center space-y-2 mb-10">
        <h2 className="font-headline-lg text-headline-lg tracking-tight">Start free. Upgrade only for volume.</h2>
        <p className="text-body-md text-on-surface-variant max-w-[60ch] mx-auto">
          Every plan includes every feature. The only difference is how much you can run each month.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`card-lift p-5 flex flex-col gap-4 rounded-2xl bg-surface-container-lowest relative ${
              p.popular ? 'border-primary/50' : ''
            }`}
          >
            {/* Badges sit IN the header row. They used to hang off the card at
                -top-2.5, one on the left edge and one on the right, so the SMS
                badge floated in the gutter between two cards and read as
                belonging to neither (08-30). */}
            <div className="flex items-start justify-between gap-2 min-h-[1.5rem]">
              <div className="text-sm font-semibold text-on-surface">{p.name}</div>
              {p.popular && (
                <span className="font-label-caps text-label-caps text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">Most popular</span>
              )}
              {p.requires_sms && (
                <span className="font-label-caps text-label-caps text-[10px] px-2 py-0.5 rounded-full bg-sem-green/15 text-sem-green shrink-0">SMS verified</span>
              )}
            </div>
            {/* Price directly under the name in every card. It previously sat
                below a free-text tagline of wildly different lengths, so the
                one number a visitor compares across the row was never on the
                same baseline twice. */}
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight text-on-surface">
                ${p.price_monthly % 1 === 0 ? p.price_monthly : p.price_monthly.toFixed(2)}
              </span>
              <span className="text-xs text-on-surface-variant">/{p.is_trial ? '7 days' : 'mo'}</span>
            </div>
            <div className="text-xs text-on-surface-variant leading-relaxed">{p.tagline}</div>
            {/* mt-auto pins the differentiator + CTA to a common bottom edge. */}
            <div className="text-xs text-on-surface-variant border-t border-outline-variant/30 pt-3 mt-auto">
              <div className="font-semibold text-on-surface font-tabular-stat">{fmt(p.monthly_task_tokens || p.monthly_credits)} task tokens</div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className={`${p.popular ? BTN_PRIMARY : (p.is_trial ? 'inline-flex items-center justify-center rounded-xl bg-sem-deepgreen hover:bg-sem-green text-on-sem-deepgreen hover:text-on-sem-deepgreen font-title-md text-body-md font-semibold transition-all active:scale-95 cursor-pointer' : BTN_SECONDARY)} w-full px-4 py-2.5`}
            >
              {p.is_trial ? 'Start free trial' : p.price_cents === 0 ? 'Start free' : `Choose ${p.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-start justify-center gap-2 text-xs text-on-surface-variant max-w-[62ch] mx-auto">
        <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-secondary" aria-hidden="true" />
        <span>
          <span className="font-mono">1 task token = $0.01</span> of usage (transcription, multi-agent
          passes, vision). Credits apply as <span className="font-mono">$1.00</span> off at checkout.
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
  /* Mobile menu (09-01): the reference export shipped a menu button with no
     menu; this one is real — closes on Escape / link click / outside tap. */
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!guideOpen && !menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setGuideOpen(false); setMenuOpen(false); } };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [guideOpen, menuOpen]);

  const navLinks = [
    { label: 'Features', onClick: () => { setMenuOpen(false); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); } },
    { label: 'Guide', onClick: () => { setMenuOpen(false); setGuideOpen(true); } },
    { label: 'Pricing', onClick: () => { setMenuOpen(false); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); } },
  ];

  return (
    <div id="main-content" className="min-h-screen bg-background text-on-surface font-body-md antialiased selection:bg-primary-container selection:text-on-primary-container">
      {/* ── Top bar (design: fixed header, translucent + blur, shadow past 20px) */}
      <header
        id="main-header"
        className="fixed top-0 w-full z-40 border-b border-outline-variant/30 transition-all duration-300 bg-surface/80 backdrop-blur-md"
      >
        <div className="max-w-[1440px] mx-auto px-container-padding h-16 flex items-center justify-between gap-3">
          {/* Brand lockup — one logo + wordmark. AnimatedLogo renders the real
              logo (HelpoTron_logo.jpeg via the app's asset). */}
          <a href="#main-content" className="flex items-center gap-3 min-w-0" aria-label="Helpotron home">
            <AnimatedLogo size="md" wordmarkClassName="hidden" />
            <span className="font-headline-lg text-[22px] font-bold text-primary tracking-tight whitespace-nowrap">Helpotron</span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main">
            <button type="button" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer">Features</button>
            <button type="button" onClick={() => setGuideOpen(true)} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer">Guide</button>
            <button type="button" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors cursor-pointer">Pricing</button>
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

      {/* ── Hero (design: pt-32 pb-20 / md:pt-40 md:pb-28, tone blobs,
             badge chip, gradient headline, dual CTA, dashboard mockup) */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden max-w-[1440px] mx-auto px-container-padding">
        {/* Abstract background elements — Stitch's translucent tone blobs,
            far subtler than the old aurora, no animation cost. */}
        <div className="absolute top-16 right-0 w-1/2 h-[420px] sm:h-[500px] bg-primary-container/10 rounded-full blur-[100px] -z-10 translate-x-1/4 -translate-y-1/4 pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-24 left-0 w-1/3 h-[400px] bg-secondary-container/10 rounded-full blur-[80px] -z-10 -translate-x-1/4 translate-y-1/4 pointer-events-none" aria-hidden="true" />

        <div className="flex flex-col items-center text-center max-w-4xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant/30 mb-6">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span className="font-label-caps text-label-caps text-on-surface-variant">Helpotron OS 2.0 is Live</span>
          </div>

          {/* Fluid size: the design's 48px display-xl hyphen-splits "Co-pilot"
              at 390px; clamp keeps the design size on desktop and 30-34px on
              phones, and balance stops single-word orphans (09-01). */}
          <h1
            className="font-display-xl text-display-xl text-on-surface mb-6 leading-tight"
            style={{ fontSize: 'clamp(1.9rem, 7vw, 3rem)', textWrap: 'balance' }}
          >
            Your Academic <span className="whitespace-nowrap">Co-pilot,</span>{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Redefined</span>
          </h1>

          <p className="font-body-md text-body-md sm:text-[18px] text-on-surface-variant max-w-2xl mb-8 sm:mb-10 leading-relaxed">
            Helpotron captures your coursework, sorts it into subject bubbles, and gives
            every assignment its own AI agent — while keeping an honest ledger of what
            you actually completed.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button type="button" onClick={() => openAuth('signup')} className={`${BTN_PRIMARY} px-8 py-3.5 w-full sm:w-auto`}>
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </button>
            {/* No demo reel exists yet, so this is "See how it works" — it
                scrolls to the real feature section instead of a fake video. */}
            <button type="button" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className={`${BTN_SECONDARY} px-8 py-3.5 w-full sm:w-auto`}>
              <PlayCircle className="w-4 h-4" /> See how it works
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-body-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-sem-green" /> No credit card</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-sem-green" /> No email required</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-sem-green" /> Nothing personal shown before sign-in</span>
          </div>
        </div>

        {/* High-fidelity dashboard mockup — the design frames it max-w-5xl
            with a glow; the contents are the real product's depiction. */}
        <div className="relative w-full max-w-5xl mx-auto z-10">
          <ProductPreview />
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="max-w-[1100px] mx-auto px-container-padding py-16 sm:py-24">
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
      <Pricing onOpenAuth={openAuth} />

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

      {/* ── Footer (design: bg-surface-dim, brand + ©, legal links) ─────────── */}
      <footer className="bg-surface-dim border-t border-outline-variant/20">
        <div className="max-w-[1440px] mx-auto w-full py-8 px-container-padding flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <AnimatedLogo size="sm" showWordmark={false} />
            <span className="font-headline-lg text-[20px] font-bold text-primary">Helpotron</span>
            <span className="text-body-sm text-on-surface-variant ml-2">© 2026 Helpotron Study OS. All rights reserved.</span>
          </div>
          <div className="flex flex-wrap gap-6 items-center">
            {onOpenPrivacy && (
              <button type="button" onClick={onOpenPrivacy} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary hover:underline transition-all cursor-pointer">
                Privacy Policy
              </button>
            )}
            {onOpenPrivacy && (
              <button type="button" onClick={onOpenPrivacy} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary hover:underline transition-all cursor-pointer">
                Terms of Service
              </button>
            )}
            <button type="button" onClick={() => setGuideOpen(true)} className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary hover:underline transition-all cursor-pointer">
              Help Center
            </button>
            <span className="inline-flex items-center gap-1 text-body-sm text-on-surface-variant"><Puzzle className="w-3 h-3" /> extension + web</span>
          </div>
        </div>
      </footer>

      {/* ── Public guide modal (pre-signup access) ─────────────────────────── */}
      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Helpotron guide"
          onClick={() => setGuideOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl mt-2 sm:mt-6 rounded-2xl border border-outline-variant/30 bg-surface shadow-2xl overflow-hidden"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-on-surface">
                <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" /> Guide
              </span>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close guide"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 sm:p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
              <GuideView publicMode onGoTo={() => { setGuideOpen(false); openAuth('signup'); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
