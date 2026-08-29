/* ────────────────────────────────────────────────────────────────────────────
 * AnonymousLanding.jsx — signed-out marketing state (auth-gate audit 08-28).
 * Shown when the session probe confirms no active session (or skips it).
 * Deliberately contains NO authenticated data and NO dashboard internals:
 * the authenticated shell and every data view live behind the auth gate,
 * so anonymous visitors only ever see this page.
 * ────────────────────────────────────────────────────────────────────────── */
import React from 'react';
import {
  Layers, Brain, History as HistoryIcon,
  ArrowRight, ShieldCheck, GraduationCap, Puzzle, Sparkles,
} from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';
import { TypewriterEffect } from './ui/typewriter-effect.jsx';
import { MovingBorderButton } from './ui/moving-border.jsx';
import { BentoGrid, BentoGridItem } from './ui/bento-grid.jsx';
import { BackgroundBeams } from './ui/background-beams.jsx';

const FEATURES = [
  {
    Icon: Layers,
    title: 'Assignment Bubbles & Sub-Agent Teams',
    body: 'Scraped and imported assignments organize themselves into subject bubbles, each with its own AI sub-agent workspace.',
  },
  {
    Icon: Brain,
    title: 'My Agent Workspace',
    body: 'A per-assignment AI agent with its own chat thread, files and permanent memory — capture, understand, execute.',
  },
  {
    Icon: HistoryIcon,
    title: 'Turn-In Ledger & Credits',
    body: 'Mark assignments turned in and keep a real historical ledger of everything submitted, with timestamps and undo. Track usage and credits at a glance, and manage your plan from one clear account view.',
  },
];

const STEPS = [
  { n: '01', title: 'Create your free account', body: 'Pick a public ID and a password — that is all you need to unlock the workspace.' },
  { n: '02', title: 'Import your coursework', body: 'Paste an assignment dump or let the browser extension capture scraped assignments.' },
  { n: '03', title: 'Generate, organize and turn in', body: 'Bubbles group your work by subject; your agent drafts, and the ledger keeps everything honest.' },
];

/* Aurora glass button primitives (login-page scope only — Button.jsx owns the
 * app chrome; this page predates it and is consumed by the appearance engine
 * through var(--…) tokens). */
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition cursor-pointer glow-accent';
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-semibold transition cursor-pointer';

export default function AnonymousLanding({ onOpenAuth = null, onOpenPrivacy = null }) {
  const openAuth = () => { if (onOpenAuth) onOpenAuth(); };

  return (
    <div id="main-content" className="min-h-screen text-[var(--text-primary)] font-sans antialiased selection:bg-[var(--accent-subtle)] selection:text-[var(--text-primary)]">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      {/* Mobile perf (08-28): backdrop-blur-xl repaints the underlying canvas
          on every scroll frame (~5ms/frame on low-end phones). Above sm the
          background is already 76% opaque color-mix, so blur adds little — use
          it only on larger screens. */}
      <header
        className="sticky top-0 z-40 border-b border-[var(--border-subtle)] sm:backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--bg-base) 76%, transparent)' }}
      >
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer select-none" aria-label="helpotron ACADEMIC OS">
            <AnimatedLogo size="md" wordmarkClassName="hidden sm:flex" />
            <span className="hidden sm:inline text-[10px] font-bold tracking-wider text-[var(--text-muted)]">HELPOTRON</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openAuth}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={openAuth}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition cursor-pointer glow-accent whitespace-nowrap"
            >
              Create free account
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero (Aceternity background beams behind the copy, 08-28) ───────── */}
      <section className="relative max-w-[900px] mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-24 text-center space-y-7 overflow-hidden">
        <BackgroundBeams className="[mask-size:80px] opacity-70" />
        <div className="relative z-10 space-y-7">
        <span className="aurora-chip text-xs">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-2)]" /> Your autonomous academic operating system
        </span>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight max-w-3xl mx-auto">
          Every assignment, organized.{' '}
          <TypewriterEffect
            words={[
              { text: 'Every', className: 'text-aurora' },
              { text: 'deadline,', className: 'text-aurora' },
              { text: 'handled.', className: 'text-aurora' },
            ]}
            className="inline-block text-3xl sm:text-5xl font-extrabold tracking-tight"
            cursorClassName="bg-[var(--accent)]"
          />
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-muted)] max-w-xl mx-auto leading-relaxed">
          Helpotron captures your coursework, organizes it into subject bubbles, and turns
          in assignment work with a per-assignment AI agent — while keeping a real,
          honest ledger of what you submitted.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <MovingBorderButton
            type="button"
            onClick={openAuth}
            borderRadius="0.75rem"
            duration={2600}
            containerClassName="h-11 w-auto px-6"
            className="h-full w-auto bg-[var(--accent-subtle)]/[0.15] text-xs sm:text-sm font-semibold text-white"
            borderClassName="bg-[radial-gradient(var(--accent)_40%,transparent_60%)]"
          >
            <span className="inline-flex items-center gap-2">Create free account <ArrowRight className="w-4 h-4" /></span>
          </MovingBorderButton>
          <button
            type="button"
            onClick={openAuth}
            className={`${BTN_SECONDARY} px-6 py-3`}
          >
            Sign in <GraduationCap className="w-4 h-4" />
          </button>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Your workspace unlocks after a one-time sign-in — nothing personal is shown before that.
        </p>
        </div>
      </section>

      {/* ── Features (Aceternity bento grid, 08-28) ─────────────────────────── */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        {/* 08-29 mobile audit: fixed `md:auto-rows-[13rem]` clipped the third
            feature card (222-char body) at every md+ width — 229px box vs
            336–402px content at 768. minmax lets the row grow; 3 columns now
            only claim space where they actually fit (lg+), so the md tablet
            range stacks the cards like mobile instead of squeezing them. */}
        <BentoGrid className="max-w-[1200px] md:auto-rows-[minmax(13rem,auto)] lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <BentoGridItem
              key={title}
              title={title}
              description={body}
              icon={<Icon className="w-5 h-5 text-[var(--accent)]" />}
              header={
                <div className="flex flex-1 items-start justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-3">
                  <div className="w-11 h-11 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-subtle)] flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  <div className="h-1.5 w-16 rounded-full bg-gradient-to-r from-[var(--accent)] via-transparent to-[var(--accent-2)] opacity-70" />
                </div>
              }
            />
          ))}
        </BentoGrid>
      </section>

      {/* ── Final CTA (how-it-works steps grouped into the closing panel) ──── */}
      <section className="max-w-[900px] mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="clean-card p-6 sm:p-10 text-center space-y-7">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Three steps to a self-driving coursework pipeline
          </h2>
          <ol className="space-y-3 text-left">
            {STEPS.map(({ n, title, body }) => (
              <li key={n} className="flex gap-4 items-start p-4 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <span className="text-sm font-mono font-bold text-[var(--accent)] bg-[var(--accent-subtle)] px-2.5 py-1 rounded-[var(--radius-sm)]">{n}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{body}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-[var(--border-subtle)] pt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={openAuth}
              className={`${BTN_PRIMARY} px-6 py-3`}
            >
              Create free account <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={openAuth}
              className={`${BTN_SECONDARY} px-6 py-3`}
            >
              Sign in <GraduationCap className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-8 pt-4 border-t border-[var(--border-subtle)]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <AnimatedLogo size="sm" wordmarkClassName="hidden sm:flex" />
            <span>© 2026 Helpotron Automator · Built for students</span>
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
    </div>
  );
}
