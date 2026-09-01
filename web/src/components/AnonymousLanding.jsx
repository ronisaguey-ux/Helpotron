/* ────────────────────────────────────────────────────────────────────────────
 * AnonymousLanding.jsx — signed-out marketing state.
 *
 * Auth gate (08-28): contains NO authenticated data and NO dashboard
 * internals. Anonymous visitors only ever see this page.
 *
 * Conversion + perf rewrite (08-29). What changed and why:
 *
 *  · Zero `motion` imports. The old page pulled TypewriterEffect,
 *    BackgroundBeams and MovingBorderButton, which dragged framer-motion
 *    (140 KB) into the anonymous critical path to animate decoration. The
 *    typewriter also withheld the headline for ~1.5s — the single most
 *    important sentence on the site arrived last. Everything here is CSS.
 *
 *  · The three feature cards used to render a large empty bordered box
 *    containing a duplicate copy of the card's own icon and a meaningless
 *    gradient bar. That box occupied the most valuable space on the page and
 *    said nothing. It is now a real depiction of the product.
 *
 *  · Pricing exists. There was previously no price anywhere in the signed-out
 *    experience — visitors were asked to create an account before learning
 *    what the thing costs. Numbers come from GET /api/plans (server/plans.py),
 *    never hardcoded here, so marketing copy cannot drift from billing.
 *
 *  · One brand lockup instead of three, and one primary action per section.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useState } from 'react';
import {
  Layers, Brain, History as HistoryIcon, ArrowRight, ShieldCheck,
  Puzzle, Sparkles, Check, FileText, BookOpen, X,
} from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';
import GuideView from './GuideView.jsx';
import { LipScrollZoominAnimation } from './ui/lip-scroll-zoomin-animation.jsx';

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

const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition cursor-pointer glow-accent';
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-primary)] text-sm font-semibold transition cursor-pointer';

/* ── Product depiction ───────────────────────────────────────────────────────
 * A faithful, static rendering of the real workspace built from the same
 * design tokens as the app — not a screenshot. Screenshots of this product
 * would contain real student coursework, so shipping one publicly is a
 * privacy problem; the course names below are generic by construction.
 * Decorative: the surrounding copy carries the meaning for screen readers. */
function ProductPreview() {
  const bubbles = [
    { subject: 'Organic Chemistry', count: 4, tone: 'var(--accent)' },
    { subject: 'US History', count: 2, tone: 'var(--accent-2)' },
    { subject: 'Calculus II', count: 3, tone: '#a78bfa' },
  ];
  return (
    <div aria-hidden="true" className="panel p-4 sm:p-5 space-y-4 select-none">
      {/* window chrome */}
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        <span className="ml-2 text-[11px] font-mono text-[var(--text-muted)]">helpotron.workspace</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.05fr_1fr]">
        {/* left: subject bubbles */}
        <div className="space-y-2.5">
          <div className="section-label">Bubbles</div>
          {bubbles.map(({ subject, count, tone }) => (
            <div
              key={subject}
              className="group flex items-center gap-3 p-2.5"
            >
              <span
                className="h-8 w-8 shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, ' + tone + ' 18%, transparent)' }}
              >
                <Layers className="w-4 h-4" style={{ color: tone }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-[var(--text-primary)] truncate">{subject}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{count} open</span>
              </span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
            </div>
          ))}
        </div>

        {/* right: agent thread + ledger */}
        <div className="space-y-2.5">
          <div className="section-label">Assignment agent</div>
          <div className="group p-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--text-muted)]" />
              <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Lab report — reaction mechanisms
              </span>
            </div>
            <div className="space-y-1.5 pl-5">
              <span className="block h-1.5 rounded-full bg-[var(--border-subtle)] w-[92%]" />
              <span className="block h-1.5 rounded-full bg-[var(--border-subtle)] w-[78%]" />
              <span className="block h-1.5 rounded-full bg-[var(--border-subtle)] w-[85%]" />
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 pl-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="text-[10px] font-mono text-[var(--text-muted)]">drafting…</span>
            </div>
          </div>
          <div className="group flex items-center gap-2 p-2.5">
            <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span className="text-[11px] text-[var(--text-secondary)] flex-1 min-w-0 truncate">
              Essay draft — completed
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">14:02</span>
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
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Start free. Upgrade only for volume.</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Every plan includes every feature. The only difference is how much you can run each month.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`panel p-5 flex flex-col gap-4 relative ${
              p.popular ? 'border-[rgba(139,92,246,0.4)] shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_12px_40px_rgba(139,92,246,0.18)]' : ''
            }`}
          >
            {/* Badges sit IN the header row. They used to hang off the card at
                -top-2.5, one on the left edge and one on the right, so the SMS
                badge floated in the gutter between two cards and read as
                belonging to neither (08-30). */}
            <div className="flex items-start justify-between gap-2 min-h-[1.5rem]">
              <div className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</div>
              {p.popular && (
                <span className="chip chip-accent text-[10px] py-0.5 shrink-0">Most popular</span>
              )}
              {p.requires_sms && (
                <span className="chip chip-emerald text-[10px] py-0.5 shrink-0">SMS verified</span>
              )}
            </div>
            {/* Price directly under the name in every card. It previously sat
                below a free-text tagline of wildly different lengths, so the
                one number a visitor compares across the row was never on the
                same baseline twice. */}
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                ${p.price_monthly % 1 === 0 ? p.price_monthly : p.price_monthly.toFixed(2)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">/{p.is_trial ? '7 days' : 'mo'}</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] leading-relaxed">{p.tagline}</div>
            {/* mt-auto pins the differentiator + CTA to a common bottom edge. */}
            <div className="text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3 mt-auto">
              <div className="font-semibold text-[var(--text-primary)] font-mono">{fmt(p.monthly_task_tokens || p.monthly_credits)} task tokens</div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className={`${p.popular ? BTN_PRIMARY : (p.is_trial ? 'px-4 py-2.5 rounded-[var(--radius-sm)] text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition' : BTN_SECONDARY)} w-full px-4 py-2.5 cursor-pointer`}
            >
              {p.is_trial ? 'Start free trial' : p.price_cents === 0 ? 'Start free' : `Choose ${p.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-start justify-center gap-2 text-xs text-[var(--text-muted)] max-w-[62ch] mx-auto">
        <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--accent-2)]" aria-hidden="true" />
        <span>
          <span className="font-mono">1 task token = $0.01</span> of usage (transcription, multi-agent
          passes, vision). Credits apply as <span className="font-mono">$1.00</span> off at checkout.
        </span>
      </p>

      <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-w-[900px] mx-auto">
        {(plans[0]?.capabilities || []).map((c) => (
          <li key={c} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
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

  /* Public guide (09-01? no — 08-31, owner request "add the guide in the
     front page before users sign up, currently its gated behind a sign up
     wall"): any visitor can read the full feature guide before creating an
     account. Static content only — no authed fetches, so the auth gate
     (08-28: anonymous = zero dashboard internals) is preserved. */
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (!guideOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setGuideOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [guideOpen]);

  return (
    <div id="main-content" className="landing-atmos min-h-screen text-[var(--text-primary)] font-sans antialiased selection:bg-[var(--accent-subtle)] selection:text-[var(--text-primary)]">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      {/* Mobile perf (08-28): backdrop-blur-xl repaints the underlying canvas
          on every scroll frame (~5ms/frame on low-end phones). Above sm the
          background is already 76% opaque color-mix, so blur adds little. */}
      <header
        className="sticky top-0 z-40 border-b border-[var(--border-subtle)] sm:backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 76%, transparent)' }}
      >
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 h-14 flex items-center gap-3">
          {/* One lockup. AnimatedLogo already renders the wordmark — the page
              used to print "HELPOTRON" a second time right beside it. */}
          <AnimatedLogo size="md" wordmarkClassName="hidden sm:flex" />
          <div className="ml-auto flex items-center gap-2">
            <a
              href="#pricing"
              className="hidden sm:inline-flex px-3 py-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold transition"
            >
              Pricing
            </a>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold transition cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> Guide
            </button>
            <button
              type="button"
              onClick={() => openAuth('login')}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuth('signup')}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition cursor-pointer glow-accent whitespace-nowrap"
            >
              Start free
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-16">
        <div className="max-w-[980px] mx-auto text-center space-y-6">
          {/* Static headline: readable on first paint. The previous typewriter
              revealed this line a word at a time and delayed the page's whole
              value proposition behind an animation. Size is fluid rather than a
              step scale so neither clause can break mid-phrase between 768 and
              1440 (08-30); inline because it is one deliberate override. */}
          <h1
            className="font-extrabold tracking-tight leading-[1.05]"
            style={{ fontSize: 'clamp(2rem, 5.2vw, 3.75rem)', textWrap: 'balance' }}
          >
            <span className="block">Every assignment, organized.</span>
            <span className="block text-aurora">Every deadline, handled.</span>
          </h1>
          <p className="text-base sm:text-lg text-[var(--text-muted)] max-w-[62ch] mx-auto leading-relaxed">
            Helpotron captures your coursework, sorts it into subject bubbles, and gives
            every assignment its own AI agent — while keeping an honest ledger of what
            you actually completed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <button type="button" onClick={() => openAuth('signup')} className={`${BTN_PRIMARY} px-7 py-3.5 text-base w-full sm:w-auto`}>
              Start free <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => openAuth('login')} className={`${BTN_SECONDARY} px-6 py-3.5 w-full sm:w-auto`}>
              Sign in
            </button>
          </div>
          {/* Honest and unusually strong: signup genuinely collects only a
              public ID and a password — no email field, no card. */}
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> No credit card
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> No email required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Nothing personal shown before sign-in
            </span>
          </p>
        </div>

        {/* Show the product instead of describing it. */}
        <div className="mt-12 sm:mt-16 max-w-[900px] mx-auto">
          <ProductPreview />
        </div>
      </section>

      {/* ── Cinematic interlude (08-31): pinned scroll-driven lip-mask zoom
          video from the owner's component brief (gsap/ScrollTrigger). Sits
          between the conversion hero and the feature grid: intro statement →
          pinned ~260% scrub zoom → outro, all on the white brand canvas. */}
      <LipScrollZoominAnimation />

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="max-w-[1100px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-8">
          What you actually get
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="panel p-5 space-y-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] border border-[rgba(139,92,246,0.30)]">
                <Icon className="w-5 h-5 text-[var(--accent)]" />
              </span>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing (real numbers, from the billing table) ──────────────────── */}
      <Pricing onOpenAuth={openAuth} />

      {/* ── How it works + closing CTA ──────────────────────────────────────── */}
      <section className="max-w-[900px] mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="panel p-6 sm:p-10 text-center space-y-7">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Three steps to a self-driving coursework pipeline</h2>
          <ol className="grid gap-3 sm:grid-cols-3 text-left">
            {STEPS.map(({ n, title, body }) => (
              <li key={n} className="group p-4 space-y-1.5">
                <span className="inline-block text-xs font-mono font-bold text-[var(--accent)] bg-[var(--accent-subtle)] px-2 py-0.5 rounded-[var(--radius-sm)]">{n}</span>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="text-xs text-[var(--text-muted)] leading-relaxed">{body}</div>
              </li>
            ))}
          </ol>
          {/* One action. This block previously offered two buttons that both
              opened the same dialog. */}
          <div className="border-t border-[var(--border-subtle)] pt-7">
            <button type="button" onClick={() => openAuth('signup')} className={`${BTN_PRIMARY} px-7 py-3.5 text-base`}>
              Start free <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="max-w-[1100px] mx-auto px-4 sm:px-6 pb-8 pt-4 border-t border-[var(--border-subtle)]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <AnimatedLogo size="sm" showWordmark={false} />
            <span>© 2026 Helpotron Automator</span>
          </div>
          <div className="flex items-center gap-4">
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Privacy Policy &amp; Terms
              </button>
            )}
            <span className="inline-flex items-center gap-1"><Puzzle className="w-3 h-3" /> extension + web</span>
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
            className="w-full max-w-3xl mt-2 sm:mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <BookOpen className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" /> Guide
              </span>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close guide"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
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
