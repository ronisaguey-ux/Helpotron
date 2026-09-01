/* ────────────────────────────────────────────────────────────────────────────
 * GuideView.jsx — the Guide section: every feature, what it does, and how
 * to use it (08-31, owner request). Reference-first: the landing view is a
 * scannable index — header line, a three-term glossary, jump chips (with a
 * suggested starting point), and one collapsed card per feature. Cards start
 * collapsed so the page reads as a table of contents, not a wall of text;
 * clicking a section opens its plain-words explanation + numbered steps.
 * ────────────────────────────────────────────────────────────────────────── */
import React from 'react';
import {
  GraduationCap, Brain, Inbox, BookOpen, PenLine, Database, CreditCard,
  Share2, BarChart3, Puzzle, MessageSquare, ArrowRight,
} from 'lucide-react';
import SectionCard from './SectionCard.jsx';

const TERMS = [
  { term: 'Credits', gloss: 'what AI generation costs.' },
  { term: 'Tokens', gloss: 'a budget the admin grants for heavy jobs.' },
  { term: 'Referral', gloss: 'an invite code that discounts a friend’s order.' },
];

const SECTIONS = [
  {
    id: 'guide-start', icon: GraduationCap, title: 'Create your account', chip: 'Getting started',
    what: 'Sign up with a public ID and a password — no email and no card. Your dashboard shows every assignment as a bubble, grouped by subject.',
    steps: [
      'Pick a public ID (3–64 chars, letters/numbers/_/-) and a password (8+ chars, at least one letter and one number).',
      'Log in — you land on your dashboard. Add coursework manually or capture it with the browser Extension.',
      'Track spending in Credits & Billing; if you run out of tokens, use Message Admin to request more.',
    ],
  },
  {
    id: 'guide-agent', icon: Brain, title: 'My Agent', chip: 'My Agent',
    what: 'Your AI assistant for coursework. Pick an assignment and chat — it drafts sections, humanizes writing, analyzes rubrics, and answers questions about the material.',
    steps: [
      'Open My Agent from the sidebar and choose a conversation (each assignment has its own).',
      'Ask anything about the assignment, or let the agent suggest the next action (draft, humanize, rubric analysis).',
      'Approve actions in the pending-actions panel — or enable “Always auto-approve” in Settings → AI and it runs them for you.',
      'Tune Model Effort to balance depth vs. speed, and pin important threads to keep them on top.',
    ],
  },
  {
    id: 'guide-dump', icon: Inbox, title: 'Assignment Dump', chip: 'Assignment Dump',
    what: 'Dump any coursework file — PDF, Word, slide decks (real slide text is read), lecture audio (auto-transcribed), images, or videos — or paste the text, and the AI pairs it with the right assignment or creates a new bubble.',
    steps: [
      'Open Assignment Dump and drop a file, record audio, or paste the assignment text.',
      'Pick the matching assignment (or let the AI match it) — unmatched dumps become a new bubble.',
      'Choose what you want from it: Flashcards, Practice quiz, Study guide, Summary, or “Do it for me”.',
      'Generation uses 5 tokens from your budget and lands in Library when done. Long files are handled in parts, so nothing is cut off.',
    ],
  },
  {
    id: 'guide-library', icon: BookOpen, title: 'Library', chip: 'Library',
    what: 'Every generated study material in one place — flashcards, practice tests with multiple choice + explanations, study guides, and summaries — filed under the assignment they came from.',
    steps: [
      'Open Library and pick a saved material, or search by course/name.',
      'Practice cards include the correct answer and an explanation for each question.',
      'Open the owning assignment from a card to keep working from the same study material.',
    ],
  },
  {
    id: 'guide-launch', icon: PenLine, title: 'Launch to Doc', chip: 'Launch to Doc',
    what: 'Turn an assignment bubble into a real Google Doc — the essay or answer is typed into a fresh Doc (docs.new) with human-typing realism instead of a copy-paste dump.',
    steps: [
      'Install the browser extension (see Extension view), then open an assignment card.',
      'Click “Launch to Doc”, pick a typing speed, and open the new Google Doc tab.',
      'Fine-tune realism under “9 Dimensions” — keystroke jitter, micro-backspaces, false starts, fatigue, typo rate, pauses — to match how a real student types.',
      'Watch it type, review, and submit. The Doc is yours — no tracking.',
    ],
  },
  {
    id: 'guide-datalake', icon: Database, title: 'Data Lake & Micro-Credits', chip: 'Data Lake',
    what: 'Contribute class material (text or file) to the anonymized Academic Data Lake. An AI reviewer classifies it and estimates 0–25 credits; once the admin reviews and implements the idea, the real micro-credits hit your spendable balance.',
    steps: [
      'Open Data Lake and submit your material — the entry is stored under an anonymous ID, never your public ID.',
      'Read the Estimated Score right away; the entry sits in Pending until reviewed.',
      'Approved + implemented entries earn Actual Award credits on your balance (review typically takes a day or two).',
      'Opt in/out of the lake anytime in your settings; opt-out never deletes submissions already in review.',
    ],
  },
  {
    id: 'guide-credits', icon: CreditCard, title: 'Credits & Tokens', chip: 'Credits & Tokens',
    what: 'Two budgets. Credits pay for AI generations — a study guide costs a couple. Tokens are a separate budget the admin grants for heavy work, like finalizing a dump (5 tokens per run).',
    steps: [
      'Open Credits for your balance, plan, and cost history.',
      'Top up credits with a payment when you need more generation volume.',
      'Tokens appear next to credits in the top bar and in Billing — when running low, Message Admin.',
    ],
  },
  {
    id: 'guide-referral', icon: Share2, title: 'Referral Codes', chip: 'Referrals',
    what: 'Invite classmates with a single-use 40-character code. The friend gets a one-time discount on their order at redemption — 30% for a new user, 15% for an existing one — and you earn compute credits for every successful redemption.',
    steps: [
      'Open Credits → Referrals and issue a code (each code is single-use and attributed to you).',
      'Share the code with a classmate or a friend.',
      'When they redeem it at checkout, their order is discounted and your credits are credited automatically.',
    ],
  },
  {
    id: 'guide-ext', icon: Puzzle, title: 'Browser Extension', chip: 'Extension',
    what: 'The bridge between your browser and Helpotron: it captures coursework from your Canvas/class pages into the dashboard and powers Launch to Doc.',
    steps: [
      'Open the Extension view, download the build, and install (Chrome/Edge/Brave: load unpacked; Firefox: temporary add-on).',
      'Open a class page — the extension detects assignments and sends them to your dashboard.',
      'Keep it installed; “Launch to Doc” and assignment capture both need it.',
    ],
  },
  {
    id: 'guide-insights', icon: BarChart3, title: 'Insights', chip: 'Insights',
    what: 'Progress analytics: how you are doing across subjects, what has been completed, and what the app recommends next.',
    steps: [
      'Open Insights from the sidebar; charts update as assignments turn in.',
      'Use the recommendations to decide what to start next.',
    ],
  },
  {
    id: 'guide-admin', icon: MessageSquare, title: 'Message Admin', chip: 'Message Admin',
    what: 'A direct channel to the admin — use it for token requests, bug reports, or anything the guide does not answer.',
    steps: [
      'Open Message Admin and write your message.',
      'Expect a reply in the same place; serious issues get an admin popup notice.',
    ],
  },
];

export default function GuideView({ onGoTo }) {
  const go = (key) => onGoTo && onGoTo(key);
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-3">
      {/* Header: one line, the glossary, and the jump row */}
      <SectionCard
        id="guide-intro"
        padding="p-6 sm:p-8"
        className="space-y-4"
        header={
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)] shrink-0" aria-hidden="true">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Guide</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Every feature in plain words — click any section to open it.
              </p>
            </div>
          </div>
        }
      >
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--text-muted)]">
          {TERMS.map((t) => (
            <div key={t.term} className="flex gap-1.5">
              <dt className="font-semibold text-[var(--text-secondary)]">{t.term}</dt>
              <dd>{t.gloss}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-1.5" role="navigation" aria-label="Guide sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const primary = s.id === 'guide-start';
            return (
              <button
                key={s.chip}
                type="button"
                onClick={() => jump(s.id)}
                className={
                  primary
                    ? 'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition cursor-pointer'
                    : 'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] transition cursor-pointer'
                }
              >
                <Icon className="w-3 h-3" /> {s.chip}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* One card per feature — starts collapsed, expands on click */}
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        return (
          <SectionCard
            key={s.id}
            id={s.id}
            defaultOpen={false}
            padding="p-6 sm:p-8"
            className="scroll-mt-6"
            header={
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)] shrink-0" aria-hidden="true">
                  <Icon className="w-4 h-4" />
                </div>
                <h2 className="min-w-0 text-base font-bold text-[var(--text-primary)] tracking-tight">{s.title}</h2>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.what}</p>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">How to use it</h3>
                <ol className="space-y-1.5">
                  {s.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                      <span className="font-mono text-[11px] font-bold text-[var(--accent)] mt-0.5 shrink-0 tabular-nums">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </SectionCard>
        );
      })}

      {/* Still stuck */}
      <SectionCard
        id="guide-help"
        className="space-y-3"
        title="Still stuck?"
        subtitle="The agent knows the app, and the admin can grant tokens or fix anything."
        padding="p-6 sm:p-8"
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => go('message_admin')}
            className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold px-4 py-2 transition cursor-pointer glow-accent"
          >
            <MessageSquare className="w-4 h-4" /> Message Admin <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => go('agent')}
            className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-primary)] text-sm font-semibold px-4 py-2 transition cursor-pointer"
          >
            <Brain className="w-4 h-4" /> Ask My Agent <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
