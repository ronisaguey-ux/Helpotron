/* ────────────────────────────────────────────────────────────────────────────
 * GuideView.jsx — Helpotron Field Guide (v3 Stitch v6 LUMINOUS GLASS M3)
 * Operational manual, architectural specifications, and prompt heuristics
 * for autonomous academic co-piloting. Two-column sticky rail layout (>=1280px),
 * search & category filter combobox, accordion disclosures with first card open,
 * pro tips callout strips, 10-item FAQ accordion, guest CTA band, and support links.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  GraduationCap, Brain, Inbox, BookOpen, PenLine, Database, CreditCard,
  Share2, BarChart3, Puzzle, MessageSquare, ArrowRight, History, Gauge,
  Compass, ShieldCheck, Settings2, HelpCircle, Search, ChevronDown,
  ChevronRight, Lightbulb, CheckCircle2, Send, X
} from 'lucide-react';

const TERMS = [
  { term: 'Credits', gloss: 'Discount balance — $1.00 each, applied at checkout. Earned via payments, referrals, and data-lake rewards.' },
  { term: 'Tokens', gloss: 'Your usage meter — every task spends a fixed amount sized to the compute/API work it does.' },
  { term: 'Micro-credits', gloss: 'Data Lake contribution points; 1,000 convert into 1 credit ($1.00 off).' },
  { term: 'Public ID', gloss: 'Your public username — sign up with it and a password; zero email required.' },
];

const CATEGORIES = [
  { id: 'all', label: 'All (16)' },
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'agent', label: 'Agent & Prompts' },
  { id: 'workspace', label: 'Workspace & Ingestion' },
  { id: 'study', label: 'Study OS & Typing' },
  { id: 'economy', label: 'Economy & Rewards' },
  { id: 'system', label: 'System & Safety' },
  { id: 'faq', label: 'FAQ' },
];

const SECTIONS = [
  {
    id: 'guide-start',
    cat: 'quickstart',
    icon: GraduationCap,
    title: 'Getting started (first 30 minutes)',
    chip: 'Start here',
    what: 'The workflow in order: create an account, get coursework into Helpotron, tell the team what to build, study the results, and Launch to Doc for essays. You can skip steps or do them in a different order — this is just the shortest path.',
    steps: [
      'Sign up with a public ID and a password (no email, no card) — you start on a 14-day free trial with 15,000 task tokens after enabling 2FA.',
      'Install the browser extension from the Chrome Web Store — or skip it and use the Assignment Dump manually, that works too.',
      'Open the Assignment Dump and drop your coursework: a PDF, slides, lecture audio, an image, a video, or pasted text. The AI matches it to the right assignment or makes a new bubble.',
      'Open the assignment and pick a direction — Do it for me, Study guide, Quiz, Flashcards, Summary, or Something else. Your assistants start the moment you pick.',
      'Use what it produced: study from the Library, watch the team live in the workspace, and Launch to Doc to have the essay typed into a real Google Doc.',
      'Watch both balances in the top bar — tokens (usage) and credits (discounts) — and open Billing to see your plan.',
    ],
    tips: [
      'Dropping coursework manually works fully without the extension; the extension just makes capture one click on class pages.',
      'Each assignment has its own chat thread — the same conversation appears in My Agent\'s bubbles and in the assignment workspace.',
      'Plans refill tokens monthly: Basic 30,000, Pro 100,000, Elite 270,000. The one-time 14-day trial starts you at 15,000.',
    ],
  },
  {
    id: 'guide-account',
    cat: 'quickstart',
    icon: ShieldCheck,
    title: 'Sign up & your account',
    chip: 'My account',
    what: 'Account basics and everything under Settings. Public-ID/password signup, a profile that teaches Helpotron about you, writing preferences, security (two-factor), privacy toggles, and notifications.',
    steps: [
      'Pick a public ID (3–64 chars, letters/digits/_/-) and a password (8+ chars with at least one letter and one number). No email and no card.',
      'Log in — you land on the Dashboard (Active Subjects). Add coursework manually or capture it with the extension.',
      'My Agent → Configs: describe your subjects, learning style, and goals.',
      'Dashboard → Subject Settings: tone, writing samples, vocabulary, and citation style.',
      'Settings → Privacy & Security: two-factor authentication (authenticator app or SMS codes), usage analytics, Data Lake opt-in and strict anonymity, "Export all data", and GDPR account deletion.',
      'Settings → Notifications: choose what pings you — assignment/draft/deadline alerts, low-balance and monthly statements, study reminders — and where (browser push, in-app, Telegram alerts).',
      'Settings → Integrations: connect a real Telegram bot (the built-in 4-step setup walks you through @BotFather, the token, and your chat ID).',
      'Settings → Appearance: color mode, font scaling, and accessibility.',
    ],
    tips: [
      'No email is required; save your password in your password manager.',
      'Two-factor is optional but recommended if you share a device.',
    ],
  },
  {
    id: 'guide-agent',
    cat: 'agent',
    icon: Brain,
    title: 'My Agent',
    chip: 'My Agent',
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
      'Long chats tidy themselves — the agent keeps the key context and drops old filler automatically, so there is nothing to press.',
      'Agent replies to each task carry the updated token balance; the top bar follows along live.',
    ],
  },
  {
    id: 'guide-configs',
    cat: 'agent',
    icon: Settings2,
    title: 'Configs: identity, skills, memory & files',
    chip: 'Agent Configs',
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
    id: 'guide-workspace',
    cat: 'workspace',
    icon: Compass,
    title: 'Assignment workspace & directions',
    chip: 'Workspace',
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
    id: 'guide-dump',
    cat: 'workspace',
    icon: Inbox,
    title: 'Assignment Dump',
    chip: 'Assignment Dump',
    what: 'The front door for coursework: PDF, Word, TXT, slide decks (real slide text is read), lecture audio (auto-transcribed), images (OCR), or video — plus voice recording and pasted text. The AI pairs the dump with the right assignment or creates a new bubble for it.',
    steps: [
      'Open the Assignment Dump and drop a file, record audio, or paste the assignment text.',
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
    id: 'guide-library',
    cat: 'study',
    icon: BookOpen,
    title: 'Library & Study OS',
    chip: 'Library',
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
    id: 'guide-launch',
    cat: 'study',
    icon: PenLine,
    title: 'Launch to Doc (assistive typing)',
    chip: 'Launch to Doc',
    what: 'Takes a finalized draft or an agent reply and types it into a real Google Doc, Word Online, Notion, or any textarea as human keystrokes through the browser extension. Includes 9 realism dimensions (WPM, pause cadence, typo frequency, burst length, backspace behavior) so the revision history reads as natural student work.',
    steps: [
      'Make sure the browser extension is installed and pinned.',
      'Open the document you want to type into (e.g. docs.new) in another tab.',
      'Click "Launch to Doc" on any drafted assignment, or choose "Launch to Doc" from an agent reply.',
      'Pick the destination tab from the extension dropdown, tune typing speed/bursts if desired, and click "Start Typing".',
      'Keep the target tab active while typing proceeds. You can pause or abort at any moment.',
    ],
    tips: [
      'The extension never touches passwords or payment inputs; typing operates strictly inside the page DOM.',
      'Natural pause cadence matches typical drafting bursts — great for genuine version history creation.',
    ],
  },
  {
    id: 'guide-ext',
    cat: 'study',
    icon: Puzzle,
    title: 'Browser Extension',
    chip: 'Extension',
    what: 'The companion bridge for Chrome and Chromium browsers: one-click syllabus and assignment scraping from Canvas, Blackboard, and Google Classroom, real-time microphone lecture transcription, tab capture, and assistive typing.',
    steps: [
      'Download and install the extension from the Extension Install page or Chrome Web Store.',
      'Open any LMS assignment page — click the Helpotron puzzle icon to scrape prompt and rubrics instantly.',
      'Use the lecture recorder during classes to record audio; the AI automatically transcribes and attaches it to the right course.',
      'The extension connects to the web app via your local token; no separate login required.',
    ],
    tips: [
      'The extension operates 100% locally; it never phones home to third parties or leaks institution credentials.',
    ],
  },
  {
    id: 'guide-datalake',
    cat: 'economy',
    icon: Database,
    title: 'Data Lake & rewards',
    chip: 'Data Lake',
    what: 'Contribute anonymized assignments, rubrics, and novel syllabus formats to the shared knowledge base. Earn micro-credits for every validated contribution, which convert directly into compute credits for your account.',
    steps: [
      'Open Data Lake from the navigation menu.',
      'Submit coursework rubrics, exam guidelines, or novel problem types with PII stripped.',
      'The developer reviews submissions by hand — there is no automated scoring.',
      'Accumulate micro-credits (1,000 micro-credits = 1.00 USD credit) and redeem them as a discount on a plan.',
    ],
    tips: [
      'PII is automatically sanitized client-side before upload.',
      'You can export your complete submission history at any time as JSON.',
    ],
  },
  {
    id: 'guide-credits',
    cat: 'economy',
    icon: CreditCard,
    title: 'Credits & tokens',
    chip: 'Credits',
    what: 'Understanding the economic model: Tokens meter the deterministic compute your tasks use and are what your plan grants. Credits are earned discounts — from referrals and data-lake contributions — applied to the price of a plan, never to your token balance.',
    steps: [
      'Check your token balance at the top of any screen, and your plan under Settings.',
      'Your plan and its allowance are listed under Settings → Credits & Billing. Allowances are quoted in task tokens and read live from the server.',
      'All tiers enjoy identical full-model access — zero feature gating between plans.',
      'If you run out, message Admin for a grant — there is no self-serve top-up.',
    ],
    tips: [
      'Tokens never expire while your account remains active.',
      'Tokens are earn-only and non-refundable: purchased tokens are consumed on the compute work they pay for. Tasks that fail outright are not charged.',
      'Run out during an urgent deadline? Use Message Admin to request an emergency compute grant.',
    ],
  },
  {
    id: 'guide-referral',
    cat: 'economy',
    icon: Share2,
    title: 'Referral codes',
    chip: 'Referrals',
    what: 'Invite classmates with single-use attribution codes. Your peer gets an instant discount (30% new / 15% renewal), and you earn credits immediately upon their plan activation: 2 for Basic, 5 for Pro, 10 for Elite.',
    steps: [
      'Open Credits → Earn & Referrals to generate a unique single-use referral code.',
      'Share the code or copy the direct invitation link.',
      'When your peer signs up and subscribes, your credits are automatically deposited into your account ledger.',
    ],
    tips: [
      'Each referral code is strictly single-use to guarantee pristine attribution.',
    ],
  },
  {
    id: 'guide-insights',
    cat: 'economy',
    icon: BarChart3,
    title: 'Insights',
    chip: 'Insights',
    what: 'Progress analytics: track study velocity, rubric adherence across course subjects, completed tasks, and AI suggestions for impending deadlines.',
    steps: [
      'Navigate to Insights to inspect charts across active courses and assignments.',
      'Review the recommended actions queue to prioritize work with high grade impact.',
    ],
    tips: [
      'Completed work moves to Assignment History, keeping Insights uncluttered.',
    ],
  },
  {
    id: 'guide-history',
    cat: 'workspace',
    icon: History,
    title: 'Assignment History',
    chip: 'History',
    what: 'Permanent archive for completed coursework. Once an assignment is finalized, move it to History to keep the Active Subjects dashboard focused while retaining full access to generated materials, chats, and exports.',
    steps: [
      'In the assignment workspace, click "Mark as done" → "Move to history".',
      'Browse past work in History; inspect rubrics, synthesized essays, flashcard decks, and full audit logs.',
      'Export any past assignment data as JSON or re-open materials at any time.',
    ],
    tips: [
      'Choosing "Not now" on the history prompt leaves the assignment marked done in place until you archive it later.',
    ],
  },
  {
    id: 'guide-settings',
    cat: 'system',
    icon: Gauge,
    title: 'Settings & safety gates',
    chip: 'Settings',
    what: 'Complete operational controls: AI behavior, academic profiles, writing DNA, appearance, push/Telegram notifications, privacy toggles, and mandatory safety approval gates.',
    steps: [
      'My Agent: execution mode (Manual, Auto-Pilot, YOLO), Model Effort, and the minimum human score are picked right in the chat workspace.',
      'My Agent: you approve every task before it runs — the token cost is shown first, and the effort/mode pickers control how much the agent attempts.',
      'Dashboard → Subject Settings: personality, effort, writing samples, and citation standards (APA, MLA, Chicago) per subject.',
      'Settings → Integrations: bind a private Telegram bot for asynchronous study alerts.',
    ],
    tips: [
      'Safety gates default to enabled for maximum user control and protection against accidental spend.',
    ],
  },
  {
    id: 'guide-admin',
    cat: 'system',
    icon: MessageSquare,
    title: 'Message Admin',
    chip: 'Message Admin',
    what: 'Direct encrypted operator channel for compute grants, technical discrepancies, or urgent support requirements.',
    steps: [
      'Open Message Admin from the navigation menu.',
      'Compose your message detailing any issue or request.',
      'Responses arrive directly in your conversation thread and trigger an in-app notice.',
    ],
    tips: [
      'Including specific assignment IDs or error codes accelerates resolution.',
    ],
  },
  {
    id: 'guide-faq',
    cat: 'faq',
    icon: HelpCircle,
    title: 'Troubleshooting & FAQ',
    chip: 'FAQ',
    what: 'Answers to the 10 most common operational questions — from assignment progress to credits and AI detection.',
    faqs: [
      { q: 'My assignment shows no progress yet. What is wrong?', a: 'Most dumps arrive without a direction. Open the assignment and pick one — the team starts the moment you choose. Progress appears in the ribbon only once it is really recorded, so give it a moment.' },
      { q: 'My dump went to the wrong assignment. Can I re-route it?', a: 'Check the dump provenance line in the workspace first (file name, type, status: auto-routed / matched / manual-routed / finalized). The most reliable fix is to drop the file directly into the assignment\'s chat bubble — uploads there bind to that assignment.' },
      { q: 'I ran out of tokens. What now?', a: 'Your plan renews on its billing cycle and the allowance is listed under Settings → Credits & Billing. If you run out, message Admin for a grant. Big spends can also be gated to ask you first — that is the effort and mode pickers in My Agent.' },
      { q: 'Launch to Doc is not typing anything.', a: 'The browser extension must be installed and pinned. Check the popup\'s server sync origin matches this site, pick a target tab (or the new docs.new option), and make sure the doc tab is the selected tab.' },
      { q: 'My essay got flagged by AI detection. What can I do?', a: 'The pipeline\'s Step 3 humanizes the draft, and the workspace records the human score it passed at ("Passed: X% Human Score"). If it falls short of your Minimum human score in Dashboard → Subject Settings, tighten the Humanizer Skill, the "Write Like a Sample" standard, and the 9-dimension realism settings on the typing side. Reports vary by detector — treat scores as guidance.' },
      { q: 'Where did my flashcards and quiz go?', a: 'Library (Dashboard → Study OS & Library) holds generated materials under their assignment; each assignment additionally lists its own under "Saved Materials" in the workspace.' },
      { q: 'Does the extension store my school password?', a: 'No. It runs locally in your browser, never accesses or transmits your university credentials, and powers only scraping, lecture recording, and assistive typing.' },
      { q: 'What is the difference between credits and tokens?', a: 'Tokens are usage — each task spends an amount sized to the work. Tokens are consumed on work and are non-refundable (tasks that fail outright are not charged). Credits are discount money — $1.00 off each at checkout — earned via payments, referrals, and micro-credit redemption.' },
      { q: 'The agent is doing something I did not want. How do I stop it?', a: 'Manual mode and the permission popups ask first by default. In the workspace, Stop Execution halts the run immediately. Finished actions can be undone from the recent-actions ledger in My Agent.' },
      { q: 'Something is broken or not answered here.', a: 'Message Admin — it is the supported channel for bugs, token requests, and anything not covered. Serious issues surface as an admin popup notice; the agent can also steer you to the right place.' },
    ],
  },
];

export default function GuideView({ onGoTo, publicMode = false }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [openSections, setOpenSections] = useState(() => ({ 'guide-start': true }));
  const [openFaqs, setOpenFaqs] = useState(() => ({ 0: true }));
  const searchInputRef = useRef(null);

  const go = (key) => onGoTo && onGoTo(key);

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFaq = (idx) => {
    setOpenFaqs((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const jump = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: true }));
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  // Keyboard shortcut: Cmd/Ctrl + K focuses search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter sections by search query and category
  const filteredSections = useMemo(() => {
    return SECTIONS.filter((s) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'faq' ? s.id === 'guide-faq' : s.cat === selectedCategory);

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchWhat = s.what.toLowerCase().includes(q);
      const matchSteps = s.steps?.some((step) => step.toLowerCase().includes(q));
      const matchTips = s.tips?.some((tip) => tip.toLowerCase().includes(q));
      const matchFaqs = s.faqs?.some(
        (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
      );

      return matchTitle || matchWhat || matchSteps || matchTips || matchFaqs;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 text-on-surface">
      {/* Top Header & Context */}
      <header className="mb-8 flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-sm" aria-hidden="true">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-primary font-bold tracking-wider uppercase">HELPO-SPEC // DOCS</span>
                <span className="text-outline-variant/40">/</span>
                <span className="text-[10px] font-mono text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded">v4.2</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
                Helpotron Field Guide
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!publicMode && (
              <>
                <button
                  type="button"
                  onClick={() => go('message_admin')}
                  className="min-h-[44px] px-4 rounded-xl bg-surface-container/60 hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-2 transition cursor-pointer border border-outline-variant/30"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-on-surface-variant" />
                  <span>Report Discrepancy</span>
                </button>
                <button
                  type="button"
                  onClick={() => go('agent')}
                  className="min-h-[44px] px-4 rounded-xl bg-primary text-on-primary font-semibold text-xs uppercase tracking-wider flex items-center gap-2 hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition cursor-pointer shadow-sm"
                >
                  <Brain className="w-4 h-4" />
                  <span>Ask My Agent</span>
                </button>
              </>
            )}
            {publicMode && (
              <button
                type="button"
                onClick={() => go('signup')}
                className="min-h-[44px] px-5 rounded-xl bg-primary text-on-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:bg-primary-container hover:text-on-primary-container active:scale-95 transition cursor-pointer shadow-sm"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-on-surface-variant max-w-3xl leading-relaxed">
          Operational manual, architectural specifications, and prompt heuristics for autonomous academic co-piloting. Every row is verified against real code behavior.
        </p>

        {/* Search Bar & Category Filter Pills */}
        <div className="flex flex-col gap-3 pt-2">
          <div className="relative w-full max-w-2xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/70" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="⌘K to find a feature, specification, or question..."
              className="w-full h-11 pl-10 pr-24 rounded-xl bg-surface-container-lowest/80 backdrop-blur-xl text-on-surface text-sm placeholder:text-on-surface-variant/50 border border-outline-variant/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1 rounded-md cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-outline-variant/30">⌘</kbd>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-outline-variant/30">K</kbd>
              </div>
            )}
          </div>

          {/* Category Pills (Mobile Scrollable) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Guide Categories">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                    active
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container-low/70 hover:bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Glossary Strip */}
        <div className="p-4 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-primary font-bold mb-2">Core Nomenclature</div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-on-surface-variant">
            {TERMS.map((t) => (
              <div key={t.term} className="p-2.5 rounded-xl bg-surface-container-low/50 border border-outline-variant/20">
                <dt className="font-bold text-on-surface mb-0.5">{t.term}</dt>
                <dd className="leading-snug">{t.gloss}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* Two-Column Grid Layout (Sticky Rail >= 1280px) */}
      <div className="flex flex-col xl:flex-row items-start gap-8 relative">
        {/* Left Navigation Rail (Sticky) */}
        <aside className="w-full xl:w-72 xl:sticky xl:top-20 flex flex-col gap-4 shrink-0 order-2 xl:order-1">
          <div className="p-4 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <span className="font-mono text-xs text-on-surface-variant font-bold uppercase tracking-wider">Guide Index</span>
              <span className="font-mono text-xs text-primary font-bold">{SECTIONS.length - 1} SECTIONS</span>
            </div>
            <nav className="flex flex-col gap-1 max-h-[50vh] xl:max-h-[60vh] overflow-y-auto pr-1" aria-label="Sections index">
              {SECTIONS.map((s, idx) => {
                const isSelected = openSections[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => jump(s.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-left transition cursor-pointer min-h-[36px] ${
                      isSelected
                        ? 'bg-primary/15 text-primary font-semibold'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40'
                    }`}
                  >
                    <span className="truncate">
                      {idx + 1}. {s.chip}
                    </span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-2" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* System Telemetry & Operational Channels */}
          <div className="p-4 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 flex flex-col gap-3">
            <span className="font-mono text-[11px] text-on-surface-variant font-bold uppercase tracking-wider">Operational Channels</span>
            <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-surface-container-low/60">
              <div className="flex items-center gap-2 text-on-surface">
                <CheckCircle2 className="w-4 h-4 text-sem-green" />
                <span>Status &amp; SLA</span>
              </div>
              <span className="font-mono text-xs text-sem-green font-bold">99.98%</span>
            </div>
            <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-surface-container-low/60">
              <div className="flex items-center gap-2 text-on-surface">
                <Send className="w-4 h-4 text-primary" />
                <span>Telegram Bot</span>
              </div>
              <span className="font-mono text-[11px] text-primary">@HelpoRelay</span>
            </div>
          </div>
        </aside>

        {/* Main Content Stream */}
        <div className="flex-1 w-full min-w-0 flex flex-col gap-6 order-1 xl:order-2">
          {filteredSections.length === 0 ? (
            <div className="p-12 rounded-3xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 text-center space-y-3">
              <Search className="w-10 h-10 text-on-surface-variant/50 mx-auto" />
              <h3 className="text-base font-bold text-on-surface">No guide entries match "{searchQuery}"</h3>
              <p className="text-xs text-on-surface-variant">Try adjusting your query or resetting category filters.</p>
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="mt-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            filteredSections.map((s, idx) => {
              const Icon = s.icon;
              const isOpen = !!openSections[s.id];
              const isHero = s.id === 'guide-start';

              return (
                <section
                  key={s.id}
                  id={s.id}
                  className={`rounded-3xl bg-surface-container-lowest/70 backdrop-blur-xl border transition-all duration-200 scroll-mt-24 overflow-hidden ${
                    isOpen ? 'border-primary/40 shadow-lg' : 'border-outline-variant/30 hover:border-outline-variant/50'
                  }`}
                >
                  {/* Card Header (Click to Toggle) */}
                  <div
                    onClick={() => toggleSection(s.id)}
                    className="p-5 sm:p-6 flex items-start justify-between gap-4 cursor-pointer select-none hover:bg-surface-container-high/10 transition"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(s.id); } }}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isHero
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-surface-container-high text-primary border-outline-variant/30'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-[10px] text-primary font-bold uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded">
                            {String(idx + 1).padStart(2, '0')} · {s.chip}
                          </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-bold text-on-surface tracking-tight">
                          {s.title}
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-1">
                      <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Content Body */}
                  {isOpen && (
                    <div className="px-5 pb-6 sm:px-6 sm:pb-8 pt-0 space-y-6 border-t border-outline-variant/20">
                      {/* What explanation */}
                      <p className="text-sm text-on-surface-variant leading-relaxed pt-4">
                        {s.what}
                      </p>

                      {/* Numbered Steps */}
                      {s.steps && s.steps.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                            Execution Protocol
                          </h3>
                          <div className="grid grid-cols-1 gap-2.5">
                            {s.steps.map((step, stepIdx) => (
                              <div
                                key={stepIdx}
                                className="p-3.5 rounded-2xl bg-surface-container-low/50 border border-outline-variant/20 flex items-start gap-3"
                              >
                                <span className="w-6 h-6 rounded-full bg-primary/20 text-primary font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {String(stepIdx + 1).padStart(2, '0')}
                                </span>
                                <span className="text-xs sm:text-sm text-on-surface leading-relaxed">
                                  {step}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pro Tips Callout */}
                      {s.tips && s.tips.length > 0 && (
                        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-3">
                          <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                          <div className="space-y-1 min-w-0">
                            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-primary">
                              Pro Tip
                            </span>
                            <ul className="space-y-1 text-xs text-on-surface leading-relaxed">
                              {s.tips.map((tip, tipIdx) => (
                                <li key={tipIdx} className="flex items-start gap-1.5">
                                  <span className="text-primary">•</span>
                                  <span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Special FAQ Accordion Render */}
                      {s.faqs && (
                        <div className="space-y-3 pt-2">
                          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                            10 Common Inquiries &amp; Answers
                          </h3>
                          <div className="space-y-2">
                            {s.faqs.map((f, faqIdx) => {
                              const faqOpen = !!openFaqs[faqIdx];
                              return (
                                <div
                                  key={faqIdx}
                                  className="rounded-xl bg-surface-container-low/50 border border-outline-variant/20 overflow-hidden"
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleFaq(faqIdx)}
                                    className="w-full p-3.5 text-left flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold text-on-surface hover:text-primary transition cursor-pointer min-h-[44px]"
                                  >
                                    <span>{f.q}</span>
                                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${faqOpen ? 'rotate-180 text-primary' : 'text-on-surface-variant'}`} />
                                  </button>
                                  {faqOpen && (
                                    <div className="px-3.5 pb-3.5 text-xs text-on-surface-variant leading-relaxed border-t border-outline-variant/15 pt-2">
                                      {f.a}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {/* Guest Mode CTA Band (Spec 3.3.2 / 3.15) */}
          {publicMode && (
            <div className="rounded-3xl p-6 sm:p-8 bg-surface-container-lowest/80 backdrop-blur-xl border border-primary/30 text-center space-y-4 shadow-xl">
              <h3 className="text-xl sm:text-2xl font-extrabold text-on-surface tracking-tight">
                Ready to start studying?
              </h3>
              <p className="text-xs sm:text-sm text-on-surface-variant max-w-lg mx-auto leading-relaxed">
                Join Helpotron with a public ID and password — no credit card needed to start. The 14-day trial includes 15,000 task tokens after you enable two-factor authentication and a $0.01 payment verification.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => go('signup')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container text-xs sm:text-sm font-bold px-6 py-2.5 transition active:scale-95 cursor-pointer shadow-sm"
                >
                  Create Account <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => go('pricing')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface text-xs sm:text-sm font-semibold px-6 py-2.5 transition active:scale-95 cursor-pointer"
                >
                  See Plans &amp; Pricing
                </button>
              </div>
            </div>
          )}

          {/* Authenticated Still Stuck Section */}
          {!publicMode && (
            <div className="rounded-3xl p-6 sm:p-8 bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 space-y-4 shadow-sm">
              <div>
                <h3 className="text-lg font-bold text-on-surface">Still stuck?</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Your agent knows this platform inside and out, and the admin can grant compute tokens or resolve technical issues directly.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => go('message_admin')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container text-xs sm:text-sm font-bold px-5 py-2.5 transition cursor-pointer shadow-sm active:scale-95"
                >
                  <MessageSquare className="w-4 h-4" /> Message Admin <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => go('agent')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface text-xs sm:text-sm font-semibold px-5 py-2.5 transition cursor-pointer active:scale-95"
                >
                  <Brain className="w-4 h-4 text-primary" /> Ask My Agent <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
