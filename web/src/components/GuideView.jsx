/* ────────────────────────────────────────────────────────────────────────────
 * GuideView.jsx — the Guide section: every feature, what it does, and how
 * to use it (v2, 09-05, mission A1 regeneration pass). Reference-first, same
 * pattern: the landing header is a scannable index — one line, a short
 * glossary, jump chips (with a suggested starting point), then one collapsed
 * card per feature area. Each card carries a plain-words explanation
 * ("what"), numbered steps ("how to use it"), and a short "Pro tips" list.
 * A separate FAQ / troubleshooting card closes the page, and a "Still stuck?"
 * card (hidden pre-signup) points at Message Admin and My Agent.
 * Every claim maps to real code: the assignment workspace's direction picker
 * and 3-stage pipeline, My Agent's modes/effort/permissions/configs, Launch
 * to Doc's 9-dimension realism controls, the extension's real capabilities,
 * and Settings' real sections. Nothing described here is invented.
 * ────────────────────────────────────────────────────────────────────────── */
import React from 'react';
import {
  GraduationCap, Brain, Inbox, BookOpen, PenLine, Database, CreditCard,
  Share2, BarChart3, Puzzle, MessageSquare, ArrowRight, History, Gauge,
  Compass, ShieldCheck, Settings2, HelpCircle,
} from 'lucide-react';
import SectionCard from './SectionCard.jsx';

const TERMS = [
  { term: 'Credits', gloss: 'discount money — $1.00 each, applied at checkout. Earn them with payments, referrals, and data-lake rewards.' },
  { term: 'Tokens', gloss: 'your usage meter — every task spends a fixed amount sized to the work it does.' },
  { term: 'Micro-credits', gloss: 'Data Lake points; 1,000 convert into 1 credit ($1.00 off).' },
  { term: 'Public ID', gloss: 'your handle — sign up with it and a password; no email needed.' },
];

const SECTIONS = [
  {
    id: 'guide-start', icon: GraduationCap, title: 'Getting started (first 30 minutes)', chip: 'Start here',
    what: 'The whole pipeline in order: create an account, get coursework into Helpotron, tell the team what to build, study the results, and Launch to Doc for essays. You can skip steps or do them in a different order — this is just the shortest path.',
    steps: [
      'Sign up with a public ID and a password (no email, no card) — you start on a 7-day free trial with 100 task tokens.',
      'Install the browser extension from the Chrome Web Store — or skip it and use Drop Assignment manually, that works too.',
      'Open Drop Assignment and dump your coursework: a PDF, slides, lecture audio, an image, a video, or pasted text. The AI matches it to the right assignment or makes a new bubble.',
      'Open the assignment and pick a direction — Do it for me, Study guide, Quiz, Flashcards, Summary, or Something else. The subagent team starts the moment you pick.',
      'Use what it produced: study from the Library, watch the team live in the workspace, and Launch to Doc to have the essay typed into a real Google Doc.',
      'Watch both balances in the top bar — tokens (usage) and credits (discounts) — and open Billing to see your plan.',
    ],
    tips: [
      'Dropping coursework manually works fully without the extension; the extension just makes capture one click on class pages.',
      'Each assignment has its own chat thread — the same conversation appears in My Agent\'s bubbles and in the assignment workspace.',
      'Plans refill tokens monthly: Basic 300, Pro 1,000, Elite 2,700. The 7-day trial starts you at 100.',
    ],
  },
  {
    id: 'guide-account', icon: ShieldCheck, title: 'Sign up & your account', chip: 'My account',
    what: 'Account basics and everything under Settings. Public-ID/password signup, a profile that teaches Helpotron about you, writing preferences, security (two-factor), privacy toggles, and notifications.',
    steps: [
      'Pick a public ID (3–64 chars, letters/digits/_/-) and a password (8+ chars with at least one letter and one number). No email and no card.',
      'Log in — you land on the Dashboard (Active Subjects). Add coursework manually or capture it with the extension.',
      'Settings → Academic Profile: your education, subjects, learning style, and goals.',
      'Settings → Writing & Output: writing DNA (tone, vocabulary, sentence complexity, formality, voice), saved profiles, and citation style.',
      'Settings → Privacy & Security: two-factor authentication (authenticator app or SMS codes), usage analytics, Data Lake opt-in and strict anonymity, "Export all data", and GDPR account deletion.',
      'Settings → Notifications: choose what pings you — assignment/draft/deadline alerts, low-balance and monthly statements, study reminders — and where (browser push, in-app, email digests, Telegram bot alerts).',
      'Settings → Integrations: connect a real Telegram bot (the built-in 4-step setup walks you through @BotFather, the token, and your chat ID).',
      'Settings → Appearance: theme, accent, density, background, and UI style.',
    ],
    tips: [
      'Use the top-bar search (⌘K / Ctrl+K) to jump straight to any screen.',
      'Enable 2FA from Settings → Privacy & Security — recovery also works via email or phone code.',
      'Account deletion is real and permanent: it wipes assignments, materials, credits, and history, and anonymizes your data-lake contributions.',
    ],
  },
  {
    id: 'guide-agent', icon: Brain, title: 'My Agent', chip: 'My Agent',
    what: 'One personal agent that does the rest. Pick an assignment or just chat — it drafts sections, humanizes writing, analyzes rubrics and attachments, and answers questions about the material. Execution modes decide how independent it is; the Model Effort slider trades speed for depth.',
    steps: [
      'Start a chat in the main room or open an assignment bubble. Replies stream in; a live "Model Reasoning" box shows its thinking.',
      'Set the mode in the top card: Manual (waits for your say-so), Auto-Pilot (runs your auto-approved actions by itself), or YOLO (full autonomy). Switch anytime.',
      'When the agent wants to act, a permission popup appears — Approve, Deny, or tick "Always auto-approve" to make it a one-time yes for that kind of action (eg. humanize, analyze rubric, draft section).',
      'Slide Model Effort (1–10; Low / Balanced / High) on the left rail to balance depth vs. speed and cost. It applies per conversation.',
      'Use the chat tools: attach a file (images, PDFs, docs are genuinely read), dictate with the microphone, listen to an agent reply, copy it, or Launch it to Doc.',
      'Recent agent actions are listed — the ledger — and each one can be rolled back.',
      'Assignment bubbles appear in the chat as things change (new assignment, due soon, submitted); open the assignment straight from the bubble or Launch to Doc.',
      'The Educational Mode toggle narrows help to schoolwork; switch it off for open conversation about anything.',
    ],
    tips: [
      'An assignment\'s bubble chat and the workspace chat are the same thread — whichever view you use, the conversation persists.',
      'Compact a long chat from the chat header — the agent keeps the key context and drops old filler.',
      'Agent replies to each task carry the updated token balance; the top bar follows along live.',
    ],
  },
  {
    id: 'guide-configs', icon: Settings2, title: 'Configs: identity, skills, memory & files', chip: 'Agent Configs',
    what: 'Shape the agent itself: name, personality and instructions (presets or your own personas), skills you can activate, a permanent memory it always reads, and uploaded files it can follow — skills, rules, automations, and personality files.',
    steps: [
      'Open ⚙ Configs beside the chat — on wide screens it docks as a panel next to the conversation; on smaller screens it slides over as a drawer.',
      'Rename your agent, then set personality and instructions; switch between saved identities or create your own (icon, name, persona, instructions).',
      'Skills: toggle them on/off; selecting a skill loads its prompt template into the composer so you just send it.',
      'Memory: add permanent notes the agent always reads (eg. "I\'m a first-year nursing student — explain simply"). Edit or delete any entry; click a note to load it into the prompt box.',
      'Files: upload .md/.txt skills, always-follow behavioral rules, scheduled or trigger automations, or personality files. Open any file to read it, or load it into the prompt.',
      'Avatars: upload a PNG/JPG for the agent and for yourself.',
    ],
    tips: [
      'Memory is the biggest lever: one accurate note the agent always sees beats re-explaining yourself every chat.',
      'Files and personas stay local in your browser storage unless you connect them to the server settings — the Settings mirror keeps them in sync.',
      'Counts in the Configs button (identities + skills + memory + files) tell you at a glance how much you have defined.',
    ],
  },
  {
    id: 'guide-workspace', icon: Compass, title: 'Assignment workspace & directions', chip: 'Workspace',
    what: 'Mission control for one assignment. Pick what the team should build, watch it work through three stages, chat to redirect it, stop it if it goes wrong, then mark it done and file it in History. The workspace also shows the prompt, rubric, attached files, and the materials it produced.',
    steps: [
      'Open an assignment bubble from the Dashboard to enter its workspace.',
      'New assignment? Pick a direction: Do it for me, Study guide, Quiz, Flashcards, Summary, or Something else — describe it in the text box. If Helpotron can\'t do what you described yet, the request goes to the Data Lake and we build it.',
      'Watch the three stages: Step 1 Reading & Rubric, Step 2 Synthesis & Proofs, Step 3 Lexical Humanizing — the finish line records the human score it passed at.',
      'Follow the subagent team cards: each agent\'s status (WAITING / WORKING / COMPLETE / FAILED) and its progress bar.',
      'Hit Stop Execution if the team is off track — the run halts and you can chat a correction before re-running.',
      'Message the team in the workspace chat ("Message the agent team about this assignment…") — one thread with the assignment bubble in My Agent.',
      'When it\'s done: Mark as done → Move to Assignment History (still openable and exportable), or Export the assignment\'s JSON data.',
    ],
    tips: [
      'Drop a file straight into the workspace/assignment bubble to give the team more source material — the upload binds to that assignment.',
      'The dump provenance line (file name, type, status) shows exactly how the coursework landed: auto-routed, matched, manual-routed, or finalized.',
      'If the direction endpoint has a note, it appears in the live ribbon — read it before assuming nothing is happening.',
    ],
  },
  {
    id: 'guide-dump', icon: Inbox, title: 'Drop Assignment', chip: 'Drop Assignment',
    what: 'The front door for coursework: PDF, Word, TXT, slide decks (real slide text is read), lecture audio (auto-transcribed), images (OCR), or video — plus voice recording and pasted text. The AI pairs the dump with the right assignment or creates a new bubble for it.',
    steps: [
      'Open Drop Assignment and drop a file, record audio, or paste the assignment text.',
      'Pick the matching assignment — or let the AI match it; anything unmatched becomes a new bubble.',
      'Send it with the work you want (flashcards, quiz, study guide, summary, do it for me) or send it bare and pick the direction later in the workspace.',
      'Generation spends tokens sized to the job and lands the materials under the assignment; long files are processed in parts so nothing is cut off.',
    ],
    tips: [
      'Supported kinds: PDF, DOCX, TXT, MP3, WAV, M4A, FLAC, JPG, PNG, TIFF, MP4, MOV — a live status shows when the AI is parsing and transcribing.',
      'Attaching inside an assignment\'s chat bubble is the most direct route: it extracts the text into that assignment\'s context.',
      'Every dump is a real row server-side — the workspace shows its status instead of pretending.',
    ],
  },
  {
    id: 'guide-library', icon: BookOpen, title: 'Library & Study OS', chip: 'Library',
    what: 'Every generated study material in one place — flashcards, practice quizzes (multiple choice + answer + explanation per question), study guides, and summaries — filed under the assignment they came from, plus your own uploaded lectures/PDFs/scans and an upcoming-deadlines calendar.',
    steps: [
      'Open Dashboard → Study OS & Library (the "Study OS & Library" panel), or navigate to Library.',
      'Open a saved material: flip flashcards, answer quiz questions with the explanation shown, follow study guides.',
      'Search or browse by assignment; open the owning assignment from a material to keep working on the same source.',
      'Upload lectures, PDFs, and scans into the library — Helpotron turns them into study material.',
    ],
    tips: [
      'Each assignment also lists its own generated materials under "Saved Materials" in the workspace.',
      'Deadline cards on the Study OS panel keep due dates visible for open work.',
      'If Library is empty, your generated content isn\'t saved yet — generate from the assignment workspace or finalize the dump first.',
    ],
  },
  {
    id: 'guide-launch', icon: PenLine, title: 'Launch to Doc', chip: 'Launch to Doc',
    what: 'Turn a draft or answer into a real Google Doc — typed with human-typing realism instead of a copy-paste dump. Works from assignments, agent replies, and assignment bubbles.',
    steps: [
      'Make sure the browser extension is installed (see the Extension section) — Launch to Doc drives the typing through it.',
      'Click "Launch to Doc": on the assignment card, in the workspace, on a chat reply, or on an assignment bubble in My Agent.',
      'Pick the target — a Google Doc tab you already have open, or a fresh docs.new doc.',
      'Choose a typing speed (WPM) and an accessibility cadence preset.',
      'Open "Fine-Tuned Realism Controls (9 Dimensions)" to tweak individual behaviors: punctuation & paragraph pauses, Gaussian keystroke jitter, false starts & micro-backspaces, burst rhythm, fatigue curve, neighbor typo rate, and more.',
      'Open the Doc tab and watch it type; pause, resume, or cancel from the modal. The finished Doc is yours — no tracking.',
    ],
    tips: [
      'Type into a new docs.new doc to start clean; existing tabs are listed and the active one is marked.',
      'Fine-tune the realism sliders per assignment — a short response, for example, rarely needs a long fatigue curve.',
      'The word count and an estimated typing time are shown before you start.',
    ],
  },
  {
    id: 'guide-ext', icon: Puzzle, title: 'Browser extension', chip: 'Extension',
    what: 'The bridge between your browser and Helpotron. It scrapes assignments off your class pages, records lectures for automatic transcripts, and powers Launch to Doc.',
    steps: [
      'Open the Extension view and install from the Chrome Web Store listing — or download the manual .zip and load unpacked to run the newest build right away.',
      'Install per browser: Chrome/Brave/Edge — chrome://extensions → Developer mode → Load unpacked (pick the extracted folder, never the .zip) and pin Helpotron. Firefox — about:debugging#/runtime/this-firefox → Load Temporary Add-on → manifest.json. Safari — the Xcode project route.',
      'Open a class page: the scraper detects assignments with rubrics, due dates, and prompts from Canvas, Blackboard, Brightspace, and Google Classroom in one click.',
      'Click the puzzle icon to scrape or to run assistive typing; the popup auto-connects to this workspace\'s server origin.',
      'Give the scraper plain-language direction to narrow the job (eg. "only scrape calculus problem sets").',
      'Record lecture audio from a tab for timestamped transcripts — the summaries and flashcards land in your Library.',
    ],
    tips: [
      'The extension is local and private: it never accesses or stores your school login or passwords.',
      'Web Store installs update automatically once a version is approved; manual .zip installs need re-downloading and hitting Reload in chrome://extensions.',
      'The popup shows the server sync origin — if capture fails, check it matches the address in your address bar.',
    ],
  },
  {
    id: 'guide-datalake', icon: Database, title: 'Data Lake & micro-credits', chip: 'Data Lake',
    what: 'Contribute anything that could make Helpotron better — class material, study resources, notes, feedback, ideas, corrections. An AI reviewer classifies it and estimates 0–25 micro-credits; when your entry is actually used, your real points are calculated and rewarded. Redeem 1,000 micro-credits as 1 credit — $1.00 off at checkout.',
    steps: [
      'Open Data Lake and submit almost anything; entries are stored under an anonymous ID, never your public ID.',
      'Read the estimated score right away — the entry sits in Pending until it gets used, then the real points are awarded.',
      'Redeem inside Data Lake: 1,000 micro-credits convert to 1 credit, your discount money.',
      'Opt in or out anytime in Settings → Privacy & Security ("Contribute to the Data Lake", "Strict anonymity"); opting out never deletes submissions already in review.',
    ],
    tips: [
      'Submitting an idea the app can\'t do yet (from the workspace\'s custom direction box) routes it here automatically — "Request sent to Data Lake".',
      'Contributions power the free training pool; if you never want your profile attached, keep strict anonymity on.',
    ],
  },
  {
    id: 'guide-credits', icon: CreditCard, title: 'Credits, tokens & plans', chip: 'Credits & Tokens',
    what: 'Two balances, one job each. Tokens pay for usage — every task spends a fixed amount sized to the work (heavier jobs like transcription and multi-step synthesis cost more). Credits apply as discounts at checkout: $1.00 off each. Plans: 7-day trial (100 task tokens), Basic 300/mo, Pro 1,000/mo, Elite 2,700/mo.',
    steps: [
      'Track both in the top bar — tokens (usage) and credits (discounts).',
      'Every task deducts its cost automatically; a safety gate can require your approval above 100 task tokens.',
      'Open Billing to see your plan, the token balance bar, and top-ups.',
      'Earn credits from payments and referrals, and by redeeming Data Lake micro-credits — they apply as $1.00 off when you check out.',
    ],
    tips: [
      'Task tokens are spent on the real tool API work behind the scenes (LLMs, audio, vision) — that is why costs differ per task.',
      'Run out at an unlucky time? Message Admin and request a grant.',
      'The plan label in Billing shows a real account value (No plan / Free Trial / Basic / Pro / Elite) — and the discount balance line shows exactly how many credits you hold.',
    ],
  },
  {
    id: 'guide-referral', icon: Share2, title: 'Referral codes', chip: 'Referrals',
    what: 'Invite classmates with a single-use 40-character code. The friend gets a one-time discount when they redeem — 30% for a new user, 15% for an existing one — and when they buy a plan with your code, you earn credits: 2 for Basic, 5 for Pro, 10 for Elite.',
    steps: [
      'Open Credits → Referrals and issue a code — each code is single-use and attributed to you.',
      'Share the code with a classmate or friend.',
      'When they redeem it and buy a plan, their order is discounted and your credits land: Basic 2, Pro 5, Elite 10.',
    ],
    tips: [
      'Codes are single-use by design — issue a fresh one per person so attribution stays clean.',
    ],
  },
  {
    id: 'guide-insights', icon: BarChart3, title: 'Insights', chip: 'Insights',
    what: 'Progress analytics: how you are doing across subjects, what has been completed, and what the app recommends next.',
    steps: [
      'Open Insights from the left nav; charts update as assignments turn in.',
      'Use the recommendations to decide what to start next.',
    ],
    tips: [
      'Pair it with Assignment History — past assignments still open and export from there.',
    ],
  },
  {
    id: 'guide-history', icon: History, title: 'Assignment History', chip: 'History',
    what: 'Where assignments go after you finish them: marked done and moved out of the active dashboard, but never lost — open, review, and export them anytime.',
    steps: [
      'In the assignment workspace, press "Mark as done", then "Move to history" (confirm it — it leaves the dashboard sections).',
      'Open History to revisit past assignments; they are still openable and exportable from there.',
      'Turned-in work is tracked separately from active work, so the dashboard always shows what is still open.',
    ],
    tips: [
      '"Not now" on the move prompt leaves the assignment marked done in place until you visit History later.',
    ],
  },
  {
    id: 'guide-settings', icon: Gauge, title: 'Settings & safety gates', chip: 'Settings',
    what: 'Everything configurable: AI behavior, academic and writing profiles, appearance, notifications, privacy/security, integrations — and the approval gates that can require a human click before sensitive actions happen.',
    steps: [
      'Settings → AI & Intelligence: execution mode, auto-approve toggle and the auto-approved actions list, Model Effort, Educational Mode, AI Detection Standard ("Write Like a Sample"), Minimum human score, and Humanizer Skill.',
      'Settings → Safety & Approval Gates: require manual confirmation before submitting coursework to the LMS, sending external notifications or emails, spending more than 100 task tokens, invoking flagship high-compute models, and overwriting finalized drafts.',
      'Settings → Academic Profile, Writing & Output, Appearance, Notifications, Privacy & Security, and Integrations (Telegram) — see the "Sign up & your account" section for the details.',
    ],
    tips: [
      'The gates default to safe: everything on. Turn a gate off only when you trust the pattern and want fewer prompts.',
      'The Minimum human score is the number the humanizing stage is held to — raise it and regenerations aim higher.',
      'Changes made through the agent\'s permissions flow apply live (including appearance changes), so you can simply ask the agent to flip a setting.',
    ],
  },
  {
    id: 'guide-admin', icon: MessageSquare, title: 'Message Admin', chip: 'Message Admin',
    what: 'A direct channel to the admin — use it for token requests, bug reports, or anything the guide does not answer.',
    steps: [
      'Open Message Admin and write your message.',
      'Expect the reply in the same place; serious issues get an admin popup notice.',
    ],
    tips: [
      'When something looks broken, say what you clicked and what you expected — that is enough to reproduce it.',
    ],
  },
  {
    id: 'guide-faq', icon: HelpCircle, title: 'Troubleshooting & FAQ', chip: 'FAQ',
    what: 'The most common questions — from "why is nothing happening" to credits and AI detection.',
    faqs: [
      { q: 'My assignment shows no subagent progress. What is wrong?', a: 'Most dumps arrive without a direction. Open the assignment and pick one — the team starts the moment you choose. Progress appears in the ribbon only once it is really recorded, so give it a moment.' },
      { q: 'My dump went to the wrong assignment. Can I re-route it?', a: 'Check the dump provenance line in the workspace first (file name, type, status: auto-routed / matched / manual-routed / finalized). The most reliable fix is to drop the file directly into the assignment\'s chat bubble — uploads there bind to that assignment.' },
      { q: 'I ran out of tokens. What now?', a: 'Your plan refills monthly (Basic 300, Pro 1,000, Elite 2,700 tokens). Message Admin to request a grant, or open Billing to top up. Big spends can also be gated to ask you first — set that in Settings → Safety & Approval Gates.' },
      { q: 'Launch to Doc is not typing anything.', a: 'The browser extension must be installed and pinned. Check the popup\'s server sync origin matches this site, pick a target tab (or the new docs.new option), and make sure the doc tab is the selected tab.' },
      { q: 'My essay got flagged by AI detection. What can I do?', a: 'The pipeline\'s Step 3 humanizes the draft, and the workspace records the human score it passed at ("Passed: X% Human Score"). If it falls short of your Minimum human score in Settings → AI & Intelligence, tighten the Humanizer Skill, the "Write Like a Sample" standard, and the 9-dimension realism settings on the typing side. Reports vary by detector — treat scores as guidance.' },
      { q: 'Where did my flashcards and quiz go?', a: 'Library (Dashboard → Study OS & Library) holds generated materials under their assignment; each assignment additionally lists its own under "Saved Materials" in the workspace.' },
      { q: 'Does the extension store my school password?', a: 'No. It runs locally in your browser, never accesses or transmits your university credentials, and powers only scraping, lecture recording, and assistive typing.' },
      { q: 'What is the difference between credits and tokens?', a: 'Tokens are usage — each task spends an amount sized to the work. Credits are discount money — $1.00 off each at checkout — earned via payments, referrals, and micro-credit redemption.' },
      { q: 'The agent is doing something I did not want. How do I stop it?', a: 'Manual mode and the permission popups ask first by default. In the workspace, Stop Execution halts the run immediately. Finished actions can be undone from the recent-actions ledger in My Agent.' },
      { q: 'Something is broken or not answered here.', a: 'Message Admin — it is the supported channel for bugs, token requests, and anything not covered. Serious issues surface as an admin popup notice; the agent can also steer you to the right place.' },
    ],
  },
];

export default function GuideView({ onGoTo, publicMode = false }) {
  const go = (key) => onGoTo && onGoTo(key);
  const jump = (id) => {
    // Expand the target section first (SectionCard listens), then scroll to it.
    window.dispatchEvent(new CustomEvent('helpotron:open-section', { detail: id }));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="space-y-3">
      {/* Header: one line, the glossary, and the jump row */}
      <SectionCard
        id="guide-intro"
        padding="p-6 sm:p-8"
        className="space-y-4"
        header={
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0" aria-hidden="true">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-on-surface tracking-tight">Guide</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Every feature in plain words — click any section to open it. Start with "Start here".
              </p>
            </div>
          </div>
        }
      >
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-on-surface-variant">
          {TERMS.map((t) => (
            <div key={t.term} className="flex gap-1.5">
              <dt className="font-semibold text-on-surface">{t.term}</dt>
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
                    ? 'inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-full bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container transition active:scale-95 cursor-pointer shadow-sm'
                    : 'inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 hover:border-outline-variant/50 text-on-surface-variant transition active:scale-95 cursor-pointer'
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
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0" aria-hidden="true">
                  <Icon className="w-4 h-4" />
                </div>
                <h2 className="min-w-0 text-base font-bold text-on-surface tracking-tight">{s.title}</h2>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-on-surface-variant leading-relaxed">{s.what}</p>

              {s.faqs ? (
                <div className="space-y-5">
                  {s.faqs.map((f, i) => (
                    <div key={i} className="space-y-1">
                      <h3 className="text-sm font-semibold text-on-surface leading-snug">{f.q}</h3>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{f.a}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">How to use it</h3>
                    <ol className="space-y-1.5">
                      {s.steps.map((step, i) => (
                        <li key={i} className="flex gap-2 text-sm text-on-surface-variant leading-relaxed">
                          <span className="font-mono text-[11px] font-bold text-primary mt-0.5 shrink-0 tabular-nums">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {s.tips && s.tips.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Pro tips</h3>
                      <ul className="space-y-1.5">
                        {s.tips.map((tip, i) => (
                          <li key={i} className="flex gap-2 text-sm text-on-surface-variant leading-relaxed">
                            <span className="text-primary shrink-0 mt-0.5" aria-hidden="true">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </SectionCard>
        );
      })}

      {/* Guest Mode CTA Band (Spec 3.3.2) */}
      {publicMode && (
        <div className="rounded-2xl p-6 sm:p-8 bg-surface-container-low border border-outline-variant/30 text-center space-y-4 shadow-lg">
          <h3 className="font-headline-lg text-lg sm:text-xl font-bold text-on-surface tracking-tight">
            Ready to start your sovereign study node?
          </h3>
          <p className="text-body-sm text-xs sm:text-sm text-on-surface-variant max-w-lg mx-auto">
            Join Helpotron with a public ID and password. No credit card, no personal email, and 100 free task tokens on your 7-day trial.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => go('signup')}
              className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-title-md text-sm font-semibold px-6 py-2.5 transition active:scale-95 cursor-pointer shadow-sm"
            >
              Create account <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => go('pricing')}
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface font-title-md text-sm font-semibold px-6 py-2.5 transition active:scale-95 cursor-pointer"
            >
              See plans
            </button>
          </div>
        </div>
      )}

      {/* Still stuck — account actions; hidden in publicMode (pre-signup), where
          a visitor has no Message Admin / My Agent yet */}
      {!publicMode && (
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
              className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container text-sm font-semibold px-4 py-2 transition cursor-pointer shadow-sm active:scale-95"
            >
              <MessageSquare className="w-4 h-4" /> Message Admin <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => go('agent')}
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 hover:border-outline-variant/50 text-on-surface text-sm font-semibold px-4 py-2 transition cursor-pointer active:scale-95"
            >
              <Brain className="w-4 h-4 text-primary" /> Ask My Agent <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
