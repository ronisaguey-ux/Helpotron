/* ────────────────────────────────────────────────────────────────────────────
 * AnonymousLanding.jsx — signed-out marketing state (auth-gate audit 08-28).
 * Shown when the session probe confirms no active session (or skips it).
 * Deliberately contains NO authenticated data and NO dashboard internals:
 * the authenticated shell and every data view live behind the auth gate,
 * so anonymous visitors only ever see this page.
 * ────────────────────────────────────────────────────────────────────────── */
import React from 'react';
import {
  Layers, Brain, History as HistoryIcon, CreditCard,
  ArrowRight, ShieldCheck, GraduationCap, Puzzle, Sparkles,
} from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';

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
    title: 'Turn-In & History Ledger',
    body: 'Mark assignments turned in and keep a real historical ledger of everything submitted, with timestamps and undo.',
  },
  {
    Icon: CreditCard,
    title: 'Credits, Tokens & Plans',
    body: 'Track usage and credits at a glance, and manage your plan from one clear account view.',
  },
];

const STEPS = [
  { n: '01', title: 'Create your free account', body: 'Pick a public ID and a password — that is all you need to unlock the workspace.' },
  { n: '02', title: 'Import your coursework', body: 'Paste an assignment dump or let the browser extension capture scraped assignments.' },
  { n: '03', title: 'Generate, organize and turn in', body: 'Bubbles group your work by subject; your agent drafts, and the ledger keeps everything honest.' },
];

export default function AnonymousLanding({ onOpenAuth = null, onOpenPrivacy = null }) {
  const openAuth = () => { if (onOpenAuth) onOpenAuth(); };

  return (
    <div id="main-content" className="min-h-screen bg-[var(--bg-base)] text-slate-100 font-sans antialiased selection:bg-blue-500/30 selection:text-blue-200">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#090d16]/85 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer select-none" aria-label="helpotron ACADEMIC OS">
            <AnimatedLogo size="md" />
            <span className="hidden sm:inline text-[10px] font-bold tracking-wider text-slate-500">HELPOTRON</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openAuth}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={openAuth}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer shadow-lg shadow-blue-900/40"
            >
              Create free account
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="max-w-[900px] mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center space-y-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-mono">
          <Sparkles className="w-3.5 h-3.5" /> Your autonomous academic operating system
        </span>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight max-w-3xl mx-auto">
          Every assignment, organized. <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Every deadline, handled.</span>
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
          Helpotron captures your coursework, organizes it into subject bubbles, and turns
          in assignment work with a per-assignment AI agent — while keeping a real,
          honest ledger of what you submitted.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={openAuth}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-2xl transition cursor-pointer shadow-xl shadow-blue-900/40"
          >
            Create free account <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={openAuth}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-semibold rounded-2xl border border-white/10 transition cursor-pointer"
          >
            Sign in <GraduationCap className="w-4 h-4" />
          </button>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Your workspace unlocks after a one-time sign-in — nothing personal is shown before that.
        </p>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="p-5 rounded-3xl bg-slate-950/60 border border-white/10 hover:border-blue-500/40 transition-all duration-200 space-y-3 hover:-translate-y-0.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Icon className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-sm font-bold text-white">{title}</h2>
              <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="max-w-[900px] mx-auto px-4 sm:px-6 pb-16">
        <h2 className="text-center text-lg font-bold text-white mb-6">Three steps to a self-driving coursework pipeline</h2>
        <div className="space-y-3">
          {STEPS.map(({ n, title, body }) => (
            <div key={n} className="flex gap-4 items-start p-4 rounded-2xl bg-slate-950/40 border border-white/8">
              <span className="text-sm font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">{n}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-8 pt-4 border-t border-white/5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <AnimatedLogo size="sm" />
            <span>© 2026 Helpotron Automator · Built for students</span>
          </div>
          <div className="flex items-center gap-4">
            {onOpenPrivacy && (
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="text-slate-500 hover:text-slate-300 transition cursor-pointer"
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
