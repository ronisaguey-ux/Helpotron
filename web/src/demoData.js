/* ────────────────────────────────────────────────────────────────────────────
 * demoData.js — Helpotron OS demo dataset (Experience Rewrite, 08-22)
 * ----------------------------------------------------------------------------
 * Single source of truth for the OS shell screens: the event engine, activity
 * timeline, notifications, automation center, library, calendar, admin
 * control center, cost intelligence, system map and the settings store.
 *
 * Everything is gated on the demo flag (localStorage helpotron_demo_mode).
 * Demo is an explicit opt-in ('true'/'on'): when absent or 'off' the views
 * render real backend data / graceful empty states instead of fake data.
 * NOTE: demo must NEVER default ON — a fresh visitor seeing the canned shell
 * masquerading as the app was a phantom-pass incident (see GATES.md).
 * ────────────────────────────────────────────────────────────────────────── */

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ago = (ms) => iso(now() - ms);
const inFuture = (ms) => iso(now() + ms);

/* Demo fixtures never bake an operator name — they personalize to whoever is
 * testing (fallback 'demo-user'). Live mode is unaffected (demoData only
 * surfaces when demoEnabled()). */
const demoAlias = () => {
  try {
    return localStorage.getItem('public_id') || localStorage.getItem('helpotron_public_id') || 'demo-user';
  } catch {
    return 'demo-user';
  }
};

export function demoEnabled() {
  try {
    const v = localStorage.getItem('helpotron_demo_mode');
    return v === 'true' || v === 'on';
  } catch (e) {
    return false;
  }
}

/* ── Event engine ────────────────────────────────────────────────────────────
 * One event model powers activity, notifications, admin audit, dashboard.
 *   { id, type, actor, timestamp, resource, metadata, status, visibility }
 * ────────────────────────────────────────────────────────────────────────── */
export const EVENTS = demoEnabled() ? [
  { id: 'ev-001', type: 'assignment.drafted', actor: 'system', timestamp: ago(18 * 60_000), resource: 'assignment:bio-42', metadata: { title: 'Biology Lab Report', course: 'BIO 201' }, status: 'completed', visibility: 'user' },
  { id: 'ev-002', type: 'material.found', actor: 'system', timestamp: ago(41 * 60_000), resource: 'assignment:bio-42', metadata: { title: 'Biology Lab Report', sources: 3 }, status: 'completed', visibility: 'user' },
  { id: 'ev-003', type: 'assignment.created', actor: 'user', timestamp: ago(55 * 60_000), resource: 'assignment:calc-17', metadata: { title: 'Calculus Problem Set', course: 'MATH 152' }, status: 'completed', visibility: 'user' },
  { id: 'ev-004', type: 'material.missing', actor: 'system', timestamp: ago(3 * HOUR), resource: 'assignment:calc-17', metadata: { title: 'Calculus Problem Set', missing: 'textbook excerpts' }, status: 'open', visibility: 'user' },
  { id: 'ev-005', type: 'study.session', actor: 'user', timestamp: ago(5 * HOUR), resource: 'study:flashcards-english', metadata: { title: 'English Essay Flashcard Drill', minutes: 22 }, status: 'completed', visibility: 'user' },
  { id: 'ev-006', type: 'credit.spend', actor: 'system', timestamp: ago(6 * HOUR), resource: 'credits', metadata: { amount: 84, reason: 'Biology analysis' }, status: 'completed', visibility: 'user' },
  { id: 'ev-007', type: 'assignment.review', actor: 'system', timestamp: ago(8 * HOUR), resource: 'assignment:eng-9', metadata: { title: 'English Essay', progress: 42 }, status: 'open', visibility: 'user' },
  { id: 'ev-008', type: 'automation.run', actor: 'system', timestamp: ago(9 * HOUR), resource: 'automation:auto-transcribe', metadata: { name: 'Auto-Transcribe Lectures', result: 'success' }, status: 'completed', visibility: 'user' },
  { id: 'ev-009', type: 'assignment.completed', actor: 'user', timestamp: ago(26 * HOUR), resource: 'assignment:psy-8', metadata: { title: 'Psychology Reflection', course: 'PSY 101' }, status: 'completed', visibility: 'user' },
  { id: 'ev-010', type: 'credit.topup', actor: 'user', timestamp: ago(2 * DAY), resource: 'credits', metadata: { amount: 0, reason: 'No plan — dev/beta account, zero balance' }, status: 'completed', visibility: 'user' },
  { id: 'ev-011', type: 'study.recommendation', actor: 'system', timestamp: ago(3 * DAY), resource: 'study:calculus', metadata: { title: 'Calculus refresher recommended', reason: 'no study in 4 days' }, status: 'completed', visibility: 'user' },
  { id: 'ev-012', type: 'assignment.drafted', actor: 'system', timestamp: ago(4 * DAY), resource: 'assignment:chem-3', metadata: { title: 'Chemistry Lab Write-Up', course: 'CHEM 110' }, status: 'completed', visibility: 'user' },
] : [];

/* Admin-side events (same engine, different visibility) */
export const ADMIN_EVENTS = demoEnabled() ? [
  { id: 'ae-001', type: 'user.registered', actor: 'user', timestamp: ago(8 * 60_000), resource: 'user:x72a', metadata: { user: 'StudyLover42' }, status: 'completed', visibility: 'admin' },
  { id: 'ae-002', type: 'payment.received', actor: 'user', timestamp: ago(12 * 60_000), resource: 'payment:pay-991', metadata: { user: 'QuinnC', amount: 24.99 }, status: 'completed', visibility: 'admin' },
  { id: 'ae-003', type: 'ai.job.started', actor: 'system', timestamp: ago(16 * 60_000), resource: 'job:j-884', metadata: { kind: 'study_guide' }, status: 'running', visibility: 'admin' },
  { id: 'ae-004', type: 'automation.failed', actor: 'system', timestamp: ago(47 * 60_000), resource: 'automation:run-402', metadata: { name: 'Auto-Submit Drafts', error: 'timeout after 60s' }, status: 'open', visibility: 'admin' },
  { id: 'ae-005', type: 'user.registered', actor: 'user', timestamp: ago(2 * HOUR), resource: 'user:x73b', metadata: { user: 'NightOwl99' }, status: 'completed', visibility: 'admin' },
  { id: 'ae-006', type: 'payment.received', actor: 'user', timestamp: ago(3 * HOUR), resource: 'payment:pay-992', metadata: { user: 'StudyLover42', amount: 0.0 }, status: 'completed', visibility: 'admin' },
  { id: 'ae-007', type: 'ai.job.failed', actor: 'system', timestamp: ago(5 * HOUR), resource: 'job:j-885', metadata: { kind: 'practice_test', error: 'rate limit' }, status: 'open', visibility: 'admin' },
  { id: 'ae-008', type: 'user.flagged', actor: 'system', timestamp: ago(7 * HOUR), resource: 'user:x12c', metadata: { user: 'GhostWriterX', flag: 'possible academic abuse' }, status: 'open', visibility: 'admin' },
] : [];

/* ── Notifications (derived stream + system preferences) ─────────────────── */
export const NOTIFICATIONS = demoEnabled() ? [
  { id: 'n-1', category: 'assignments', title: 'Draft ready', body: 'Biology Lab Report draft is ready for review.', timestamp: ago(18 * 60_000), read: false, channel: 'in-app' },
  { id: 'n-2', category: 'assignments', title: 'Materials missing', body: 'Calculus Problem Set needs your textbook excerpts.', timestamp: ago(3 * HOUR), read: false, channel: 'in-app' },
  { id: 'n-3', category: 'credits', title: 'Large spend', body: 'Biology analysis consumed 84 credits.', timestamp: ago(6 * HOUR), read: false, channel: 'in-app' },
  { id: 'n-4', category: 'study', title: 'Streak reminder', body: 'You haven’t studied Calculus in 4 days.', timestamp: ago(3 * DAY), read: true, channel: 'in-app' },
  { id: 'n-5', category: 'automation', title: 'Run completed', body: 'Auto-Transcribe Lectures finished successfully.', timestamp: ago(9 * HOUR), read: true, channel: 'in-app' },
  { id: 'n-6', category: 'assignments', title: 'Deadline approaching', body: 'Biology Lab Report is due today at 11:59 PM.', timestamp: ago(1 * DAY), read: true, channel: 'email' },
] : [];

export const NOTIFICATION_PREFS = demoEnabled() ? {
  assignments: { 'assignment.completed': true, 'draft.ready': true, 'materials.missing': true, 'deadline.approaching': true },
  automation: { 'run.started': true, 'run.completed': true, 'run.failed': true },
  credits: { 'low.credits': true, 'large.spend': true, 'monthly.summary': false },
  study: { 'streak.reminder': true, 'study.recommendation': true },
  channels: { browser: true, email: false, telegram: true, inapp: true },
} : {};

/* ── Automations ──────────────────────────────────────────────────────────── */
export const AUTOMATIONS = demoEnabled() ? [
  { id: 'auto-1', name: 'Auto-Transcribe Lectures', description: 'New uploaded recordings are transcribed and routed to study tools.', trigger: 'file.uploaded', enabled: true, lastRun: ago(9 * HOUR), runs: 42 },
  { id: 'auto-2', name: 'Draft Generator', description: 'Generates a draft for any assignment with complete materials.', trigger: 'materials.ready', enabled: true, lastRun: ago(18 * 60_000), runs: 87 },
  { id: 'auto-3', name: 'Material Scout', description: 'Fetches sources (textbook excerpts, papers) when materials are missing.', trigger: 'materials.missing', enabled: true, lastRun: ago(3 * HOUR), runs: 31 },
  { id: 'auto-4', name: 'Deadline Watchdog', description: 'Notifies 24h/6h/1h before a deadline.', trigger: 'deadline.approaching', enabled: false, lastRun: ago(2 * DAY), runs: 15 },
  { id: 'auto-5', name: 'Flashcard Builder', description: 'Turns every completed draft into a spaced-repetition deck.', trigger: 'draft.ready', enabled: false, lastRun: ago(5 * DAY), runs: 9 },
] : [];

export const RUNS = demoEnabled() ? [
  { id: 'run-410', automation: 'Draft Generator', started: ago(18 * 60_000), duration: '1m 42s', status: 'success', credits: 42 },
  { id: 'run-411', automation: 'Auto-Transcribe Lectures', started: ago(9 * HOUR), duration: '58s', status: 'success', credits: 12 },
  { id: 'run-412', automation: 'Material Scout', started: ago(3 * HOUR), duration: '4m 10s', status: 'success', credits: 18 },
  { id: 'run-413', automation: 'Deadline Watchdog', started: ago(2 * DAY), duration: '2s', status: 'skipped', credits: 0 },
  { id: 'run-414', automation: 'Draft Generator', started: ago(3 * DAY), duration: '2m 04s', status: 'failed', credits: 0 },
] : [];

export const SCHEDULES = demoEnabled() ? [
  { id: 'sch-1', name: 'Weekly Study Digest', cadence: 'Every Sunday 20:00', next: inFuture(2 * DAY), enabled: true },
  { id: 'sch-2', name: 'Material Scout sweep', cadence: 'Every 6 hours', next: inFuture(4 * HOUR), enabled: true },
  { id: 'sch-3', name: 'Streak Check-In', cadence: 'Daily 18:00', next: inFuture(10 * HOUR), enabled: false },
] : [];

export const TEMPLATES = demoEnabled() ? [
  { id: 'tpl-1', name: 'Lecture-to-Flashcards', description: 'Transcribe → summarize → build a deck in one flow.', steps: 3, uses: 128 },
  { id: 'tpl-2', name: 'Essay Pipeline', description: 'Materials → outline → draft → review.', steps: 4, uses: 96 },
  { id: 'tpl-3', name: 'Exam Prep Sprint', description: 'Practice test → weak-spot drill → second test.', steps: 3, uses: 74 },
  { id: 'tpl-4', name: 'Lab Write-Up', description: 'Observations → analysis → report draft.', steps: 3, uses: 61 },
] : [];

export const RECIPES = demoEnabled() ? [
  { id: 'rec-1', name: 'Never Miss a Deadline', description: 'Deadline Watchdog + Draft Generator + Auto-Notify.', automations: ['auto-4', 'auto-2'], popularity: 214 },
  { id: 'rec-2', name: 'Zero-Credit Lecture Day', description: 'Transcribe + Flashcard Builder only (cheapest engines).', automations: ['auto-1', 'auto-5'], popularity: 150 },
  { id: 'rec-3', name: 'Honors Research Loop', description: 'Material Scout + Draft Generator at high effort.', automations: ['auto-3', 'auto-2'], popularity: 98 },
] : [];

/* ── Library / files / saved / calendar ───────────────────────────────────── */
export const LIBRARY = demoEnabled() ? [
  { id: 'f-1', name: 'mitochondria_notes.pdf', kind: 'pdf', size: '1.2 MB', course: 'BIO 201', uploaded: ago(6 * DAY), pages: 14 },
  { id: 'f-2', name: 'bio_unit_4.pdf', kind: 'pdf', size: '3.4 MB', course: 'BIO 201', uploaded: ago(6 * DAY), pages: 42 },
  { id: 'f-3', name: 'calc_problem_set_07.pdf', kind: 'pdf', size: '820 KB', course: 'MATH 152', uploaded: ago(2 * DAY), pages: 8 },
  { id: 'f-4', name: 'essay_rubric.docx', kind: 'doc', size: '44 KB', course: 'ENG 210', uploaded: ago(1 * DAY), pages: 2 },
  { id: 'f-5', name: 'lecture_0819_audio.webm', kind: 'audio', size: '18 MB', course: 'PSY 101', uploaded: ago(3 * DAY), duration: '48 min' },
  { id: 'f-6', name: 'lab_notebook_scan.png', kind: 'image', size: '2.1 MB', course: 'CHEM 110', uploaded: ago(5 * DAY), pages: 1 },
] : [];

export const SAVED = demoEnabled() ? [
  { id: 's-1', kind: 'study_guide', title: 'Biology Unit 4 Study Guide', course: 'BIO 201', savedAt: ago(1 * DAY) },
  { id: 's-2', kind: 'flashcards', title: 'English Essay Vocab Deck', course: 'ENG 210', savedAt: ago(2 * DAY) },
  { id: 's-3', kind: 'practice_test', title: 'Calculus Midterm Practice Test', course: 'MATH 152', savedAt: ago(4 * DAY) },
] : [];

export const CALENDAR = demoEnabled() ? (() => {
  const d = new Date();
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const items = [
    { date: startOfToday, title: 'Biology Lab Report', course: 'BIO 201', kind: 'due', status: 'draft_ready' },
    { date: startOfToday + DAY, title: 'Calculus Problem Set', course: 'MATH 152', kind: 'due', status: 'materials_missing' },
    { date: startOfToday + 3 * DAY, title: 'English Essay', course: 'ENG 210', kind: 'due', status: 'in_progress' },
    { date: startOfToday + 5 * DAY, title: 'Chemistry Lab Write-Up', course: 'CHEM 110', kind: 'due', status: 'tracked' },
    { date: startOfToday + 7 * DAY, title: 'Psychology Reflection', course: 'PSY 101', kind: 'due', status: 'completed' },
    { date: startOfToday - DAY, title: 'Psychology Reflection', course: 'PSY 101', kind: 'completed', status: 'completed' },
    { date: startOfToday, title: 'Study: Biology Flashcards', course: 'BIO 201', kind: 'study', status: 'scheduled' },
    { date: startOfToday + 2 * DAY, title: 'Study: Calculus Drill', course: 'MATH 152', kind: 'study', status: 'scheduled' },
  ];
  return items;
})() : [];

/* ── Intelligence / recommendations ─────────────────────────────────────── */
export const SUBJECT_PROGRESS = demoEnabled() ? [
  { subject: 'Computer Science', level: 'Expert', score: 94, trend: '+2.1%' },
  { subject: 'Biology', level: 'Advanced', score: 87, trend: '+0.8%' },
  { subject: 'English', level: 'Intermediate', score: 78, trend: '-1.4%' },
  { subject: 'Calculus', level: 'Intermediate', score: 71, trend: '-3.2%' },
] : [];

export const RECOMMENDATIONS = demoEnabled() ? [
  { id: 'r-1', icon: '📚', title: 'Calculus refresher', body: 'You haven’t studied Calculus in 4 days. A 20-minute drill session would stop the slide.', action: 'Start drill', target: 'study', priority: 'high' },
  { id: 'r-2', icon: '✍️', title: 'Review your Biology draft', body: 'The draft is ready and due today. Review now while sources are fresh.', action: 'Open draft', target: 'assignment', priority: 'high' },
  { id: 'r-3', icon: '🎧', title: 'Upload last lecture', body: 'PSY 101 lecture 08/19 is still in your recordings. Auto-transcribe will do the rest.', action: 'Upload', target: 'dump', priority: 'medium' },
] : [];

export const WEEK_STATS = demoEnabled() ? [
  { label: 'Assignments completed', value: 14, sub: 'this week' },
  { label: 'AI hours saved', value: '8.4h', sub: 'vs manual work' },
  { label: 'Study time', value: '6.2h', sub: 'across 4 subjects' },
  { label: 'Average completion', value: '92%', sub: 'quality score' },
] : [];

/* ── Credits / wallet ────────────────────────────────────────────────────── */
export const WALLET = demoEnabled() ? {
  balance: 0,
  addedThisMonth: 0,
  usedThisMonth: 0,
  projected: 0,
  usage: [
    { id: 'w-1', reason: 'Biology analysis', amount: -84, model: 'Flagship tier', tokens: 12430, operation: 'Multi-document analysis (3 sources, 2 documents, 1 draft)', at: ago(6 * HOUR) },
    { id: 'w-2', reason: 'Essay generation', amount: -42, model: 'Balanced tier', tokens: 6890, operation: 'Draft generation from rubric + notes', at: ago(1 * DAY) },
    { id: 'w-3', reason: 'OCR', amount: -8, model: 'Fast tier', tokens: 1240, operation: 'lab_notebook_scan.png text extraction', at: ago(1 * DAY) },
    { id: 'w-4', reason: 'Flashcard drill', amount: -6, model: 'Fast tier', tokens: 900, operation: 'Spaced repetition review session', at: ago(5 * HOUR) },
    { id: 'w-5', reason: 'Lecture transcription', amount: -12, model: 'Fast tier', tokens: 2100, operation: '48-minute audio transcription', at: ago(3 * DAY) },
  ],
} : null;

/* ── Admin datasets ──────────────────────────────────────────────────────── */
export const SYSTEM_STATUS = demoEnabled() ? [
  { name: 'API', status: 'operational', detail: '99.98% uptime' },
  { name: 'AI', status: 'operational', detail: 'p95 latency 1.9s' },
  { name: 'Database', status: 'operational', detail: 'replica lag 120ms' },
  { name: 'Extension', status: 'operational', detail: 'v2.0 rollout 82%' },
  { name: 'Storage', status: 'warning', detail: '82% of quota used' },
] : [];

export const ADMIN_TODAY = demoEnabled() ? {
  users: 1284, active: 382, assignments: 4912, aiRuns: 8291, creditsUsed: 182000, revenue: 2481,
} : null;

export const ADMIN_ATTENTION = demoEnabled() ? [
  { severity: 'error', text: '3 failed automations in the last hour' },
  { severity: 'warn', text: '12 users near credit limit' },
  { severity: 'warn', text: 'Flagship tier latency +18% WoW' },
  { severity: 'warn', text: 'Storage approaching threshold (82%)' },
] : [];

export const ADMIN_USERS = demoEnabled() ? [
  { id: 'u-1', publicId: demoAlias(), plan: 'none', status: 'active', credits: 0, assignments: 184, aiRuns: 472, spend: 31.84, joinedDaysAgo: 43, subjects: ['CS', 'Math', 'Bio', 'English'], tags: ['power-user', 'beta'], flags: [] },
  { id: 'u-2', publicId: 'StudyLover42', plan: 'none', status: 'active', credits: 0, assignments: 97, aiRuns: 251, spend: 18.20, joinedDaysAgo: 88, subjects: ['Math', 'Physics'], tags: [], flags: [] },
  { id: 'u-3', publicId: 'QuinnC', plan: 'none', status: 'active', credits: 0, assignments: 210, aiRuns: 688, spend: 42.10, joinedDaysAgo: 120, subjects: ['Bio', 'Chem', 'Med'], tags: ['beta'], flags: [] },
  { id: 'u-4', publicId: 'NightOwl99', plan: 'none', status: 'active', credits: 0, assignments: 23, aiRuns: 41, spend: 2.05, joinedDaysAgo: 12, subjects: ['History'], tags: [], flags: ['near-credit-limit'] },
  { id: 'u-5', publicId: 'GhostWriterX', plan: 'none', status: 'flagged', credits: 0, assignments: 62, aiRuns: 310, spend: 24.60, joinedDaysAgo: 34, subjects: ['English', 'History'], tags: [], flags: ['possible academic abuse'] },
  { id: 'u-6', publicId: 'CalcSurvivor', plan: 'none', status: 'suspended', credits: 0, assignments: 8, aiRuns: 12, spend: 0.80, joinedDaysAgo: 5, subjects: ['Math'], tags: [], flags: ['suspended'] },
] : [];

export const FEATURE_FLAGS = demoEnabled() ? [
  { id: 'ff-1', name: 'New Assignment UI', rollout: 'everyone', on: true, owner: 'product' },
  { id: 'ff-2', name: 'AI Router v2', rollout: 'everyone', on: true, owner: 'infra' },
  { id: 'ff-3', name: 'Study Buddy 2.0', rollout: 'off', on: false, owner: 'product' },
  { id: 'ff-4', name: 'Experimental OCR', rollout: '12%', on: true, owner: 'ml' },
  { id: 'ff-5', name: 'New Settings', rollout: '50%', on: true, owner: 'product' },
] : [];

export const EXPERIMENTS = demoEnabled() ? [
  { id: 'ex-1', name: 'Assignment Dashboard v2', control: 48, variantA: 52, metrics: { completion: '+18%', timeToTask: '-24%', retention: '+7%' }, status: 'running', startedDaysAgo: 14 },
  { id: 'ex-2', name: 'Onboarding Funnel v3', control: 50, variantA: 50, metrics: { activation: '+11%', firstGen: '-18%' }, status: 'running', startedDaysAgo: 9 },
  { id: 'ex-3', name: 'Credit Display: Currency', control: 55, variantA: 45, metrics: { topups: '+6%', supportTickets: '-12%' }, status: 'analyzing', startedDaysAgo: 21 },
] : [];

export const AUDIT_LOG = demoEnabled() ? [
  { id: 'al-1', at: ago(38 * 60_000), actor: demoAlias(), action: 'granted 500 credits', target: 'user:NightOwl99' },
  { id: 'al-2', at: ago(2 * HOUR), actor: demoAlias(), action: 'changed model routing', target: 'research → Flagship tier' },
  { id: 'al-3', at: ago(5 * HOUR), actor: 'System', action: 'feature flag changed', target: 'Experimental OCR → 12%' },
  { id: 'al-4', at: ago(8 * HOUR), actor: demoAlias(), action: 'broadcast published', target: 'Scheduled downtime notice' },
  { id: 'al-5', at: ago(1 * DAY), actor: 'QuinnC', action: 'promo code created', target: 'WELCOME50' },
  { id: 'al-6', at: ago(2 * DAY), actor: 'System', action: 'maintenance mode toggled', target: 'on → off (12 min)' },
] : [];

export const AI_ROOM = demoEnabled() ? [
  { tier: 'Fast tier', requests: 14293, latency: 1.2, cost: 42, tasks: ['OCR', 'Transcription', 'Summarization', 'Flashcards'] },
  { tier: 'Balanced tier', requests: 6421, latency: 2.3, cost: 63, tasks: ['Writing', 'Image analysis', 'Study guides'] },
  { tier: 'Flagship tier', requests: 4821, latency: 3.8, cost: 87, tasks: ['Research', 'Reasoning', 'Math proofs'] },
] : [];

export const ROUTING_RULES = demoEnabled() ? [
  { task: 'OCR', tier: 'Fast tier' },
  { task: 'Transcription', tier: 'Fast tier' },
  { task: 'Summarization', tier: 'Fast tier' },
  { task: 'Writing', tier: 'Balanced tier' },
  { task: 'Image analysis', tier: 'Balanced tier' },
  { task: 'Research', tier: 'Flagship tier' },
  { task: 'Reasoning', tier: 'Flagship tier' },
] : [];

export const COST_FORECAST = demoEnabled() ? {
  currentMonthly: 2184, projected: 2941, worstCase: 4122, margin: 0.68,
  weeklyTrend: '+17% Flagship tier usage WoW',
  perPlan: [
    { plan: 'Basic', users: 812, cost: 412, costPerUser: 0.51 },
    { plan: 'Pro', users: 342, cost: 894, costPerUser: 2.61 },
    { plan: 'Elite', users: 130, cost: 878, costPerUser: 6.75 },
  ],
  perFeature: [
    { feature: 'Draft generation', runs: 4210, cost: 612 },
    { feature: 'Study guides', runs: 1890, cost: 288 },
    { feature: 'Transcription', runs: 3020, cost: 174 },
    { feature: 'OCR / vision', runs: 1502, cost: 92 },
  ],
} : null;

export const SYSTEM_MAP = demoEnabled() ? [
  { id: 'users', label: 'Users', level: 0, status: 'operational', metrics: { active: 382, sessions: 1290 } },
  { id: 'gateway', label: 'API Gateway', level: 0, status: 'operational', metrics: { rps: 14.2, p95: '210ms' } },
  { id: 'assignments', label: 'Assignment', level: 1, status: 'operational', metrics: { queue: 3 } },
  { id: 'router', label: 'AI Router', level: 1, status: 'warning', metrics: { latency: '+18%', queue: 12 } },
  { id: 'storage', label: 'Storage', level: 1, status: 'warning', metrics: { used: '82%', free: '41 GB' } },
  { id: 'fast', label: 'Fast tier', level: 2, status: 'operational', metrics: { p95: '1.2s', err: '0.2%' } },
  { id: 'balanced', label: 'Balanced tier', level: 2, status: 'operational', metrics: { p95: '2.3s', err: '0.4%' } },
  { id: 'flagship', label: 'Flagship tier', level: 2, status: 'warning', metrics: { p95: '3.8s', err: '1.1%' } },
  { id: 'queue', label: 'Worker Queue', level: 2, status: 'operational', metrics: { depth: 7, throughput: '3.1/s' } },
] : [];

export const MAINTENANCE = demoEnabled() ? {
  mode: 'normal', // normal | maintenance | read_only | degraded | emergency
  message: 'Helpotron will be briefly unavailable tonight 02:00–02:15 for scheduled maintenance.',
} : { mode: 'normal', message: '' };

/* ── Settings store (OS-level persistence) ───────────────────────────────── */
const SETTINGS_KEY = 'helpotron_os_settings_v1';

export const DEFAULT_SETTINGS = {
  profile: { displayName: '', educationLevel: 'Undergraduate', major: 'Computer Science', year: 'Junior', goalGpa: '3.7+' },
  subjects: { Mathematics: 'Advanced', 'Computer Science': 'Expert', English: 'Intermediate', Biology: 'Advanced', Calculus: 'Intermediate' },
  learningStyle: { Visual: 80, 'Hands-on': 60, Reading: 90, Discussion: 50 },
  goals: { gpa: true, writing: true, gradSchool: false, research: false },
  appearance: {
    theme: 'dark', accent: 'blue', density: 'comfortable', animation: 'full',
    background: 'aurora', uiStyle: 'glass', fontScale: 50,
  },
  ai: {
    effort: 'balanced', autoRouting: true, creativity: 72, reasoning: 88, conciseness: 61,
    rigor: 94, sourceDepth: 91, originality: 78, temperature: 0.7, tokenBudget: 4096,
    fallbackEnabled: true, subsetting: false,
    personality: 'Coach', aiName: 'Atlas',
    instructions: 'Explain like you are a patient coach. Check my understanding before moving on.',
  },
  writing: {
    tone: 35, vocabulary: 60, sentenceComplexity: 55, formality: 70, voice: 65,
    profile: 'My normal essay',
    profiles: ['My normal essay', 'AP English', 'College research paper', 'Discussion post', 'Lab report', 'Personal statement'],
    style: 'APA',
  },
  automation: {
    autoRun: true, autoFetch: true, autoTranscribe: true, autoDraft: true, autoOrganize: true, autoNotify: true, autoSubmit: false,
    requireApproval: { submit: true, messages: true, bigSpend: true, premium: true, modify: false },
  },
  notifications: { ...NOTIFICATION_PREFS },
  privacy: { analytics: true, dataLake: true, anonymous: true, exportAll: false },
  integrations: { canvas: true, gdrive: false, notion: false, telegram: true, calendar: false },
  extension: { recorder: true, autoCapture: true, badge: true },
  shortcuts: { palette: 'mod+k', search: 'mod+shift+f', newAssignment: 'mod+n', wallet: 'mod+shift+c' },
  data: { weeklyDigest: true, streakReminders: true, accuracyTracking: true },
  experimental: { ocrBeta: false, edgeEval: false, newUI: true },
  accessibility: { reducedMotion: false, highContrast: false, largeText: false, dyslexiaFriendly: false, screenReader: true },
  language: { locale: 'en-US', timezone: 'auto', measurement: 'imperial' },
  advanced: { debugMode: false, apiLogging: false, configJson: '{}' },
  /* scoped: hierarchical setting variants. Key = setting path (e.g. 'ai.effort'),
   * value = array of { id, scope: {level: 'subject'|'class'|'assignment'|'task', ref}, value }.
   * Most-specific scope wins when resolving (task > assignment > class > subject). */
  scoped: {},
  displayMode: 'simple', // simple | advanced | expert (progressive disclosure)
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return deepMerge({ ...DEFAULT_SETTINGS }, parsed);
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    /* AppShell listens and re-applies appearance/accessibility centrally —
     * keeping one owner for <html> attributes avoids cross-component fights. */
    window.dispatchEvent(new CustomEvent('helpotron:settings-changed', { detail: settings }));
  } catch (e) { /* storage unavailable — ignore */ }
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const p = patch[k];
    if (p && typeof p === 'object' && !Array.isArray(p) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], p);
    } else {
      out[k] = p;
    }
  }
  return out;
}

/* Map effort label -> score used by the backend routing cascade */
export const EFFORT_SCORES = { low: 100, balanced: 500, high: 900 };

/* ── My Agent (Experience Rewrite, 08-22) ───────────────────────────────── */
export const AGENT_PERSONALITIES = [
  { key: 'Professional', desc: 'Clear, direct, deadline-focused' },
  { key: 'Friendly', desc: 'Warm, encouraging, casual' },
  { key: 'Strict', desc: 'Tough love, no excuses' },
  { key: 'Socratic', desc: 'Answers with guiding questions' },
  { key: 'Coach', desc: 'Motivational, plan-and-execute' },
  { key: 'Researcher', desc: 'Deep citations, rigorous evidence' },
  { key: 'Tutor', desc: 'Step-by-step explanations, checks understanding' },
  { key: 'Minimalist', desc: 'Short answers, zero fluff' },
];

/* ── Command palette / global search index ───────────────────────────────── */
export function searchIndex() {
  const items = [];
  const push = (kind, title, subtitle, target, meta) => items.push({ kind, title, subtitle, target, meta });
  if (!demoEnabled()) return items;
  for (const a of AUTOMATIONS) push('automation', a.name, a.description, 'automation', {});
  for (const t of TEMPLATES) push('template', t.name, t.description, 'automation', {});
  for (const f of LIBRARY) push('file', f.name, `${f.course} · ${f.size}`, 'library', {});
  for (const s of SAVED) push('saved', s.title, s.course, 'library', {});
  for (const n of NOTIFICATIONS) push('notification', n.title, n.body, 'activity', {});
  for (const e of EVENTS) if (e.metadata?.title) push('activity', e.metadata.title, e.type, 'activity', {});
  for (const r of RECOMMENDATIONS) push('recommendation', r.title, r.body, 'overview', {});
  for (const u of ADMIN_USERS) push('user', u.publicId, `${u.plan} · ${u.credits} credits`, 'admin', {});
  push('view', 'Today', 'Your command center', 'overview', {});
  push('view', 'My Agent', 'Chat, memory, files and effort', 'agent', {});
  push('view', 'Assignments', 'All coursework', 'history', {});
  push('view', 'Study Tools', 'Guides, flashcards, tests, summaries', 'study', {});
  push('view', 'Automation Center', 'Automations, runs, schedules, templates', 'automation', {});
  push('view', 'Library', 'Files, saved materials, calendar', 'library', {});
  push('view', 'Activity', 'Everything that happened', 'activity', {});
  push('view', 'Insights', 'Analytics, progress, recommendations, cost', 'insights', {});
  push('view', 'Credit Wallet', 'Balance, plans, earnings', 'credits', {});
  push('view', 'Settings', 'Full settings workspace', 'settings', {});
  push('view', 'Privacy Policy', 'How your data is handled', 'privacy', {});
  push('view', 'Terms of Service', 'Terms of use', 'terms', {});
  push('view', 'Message Admin', 'Direct encrypted channel', 'message_admin', {});
  push('view', 'Data Lake', 'Anonymized training pool', 'datalake', {});
  push('view', 'Guide', 'Every feature & how to use it', 'guide', {});
  push('view', 'Admin Control Center', 'System-wide operations', 'admin', {});
  return items;
}

export const SLASH_COMMANDS = [
  { cmd: '/assignment', label: 'Create assignment', target: 'history' },
  { cmd: '/study', label: 'Open study tools', target: 'study' },
  { cmd: '/run', label: 'Run an automation', target: 'automation' },
  { cmd: '/settings', label: 'Open settings', target: 'settings' },
  { cmd: '/admin', label: 'Admin control center', target: 'admin' },
  { cmd: '/agent', label: 'Open My Agent', target: 'agent' },
  { cmd: '/insights', label: 'Open insights', target: 'insights' },
  { cmd: '/credits', label: 'Credit wallet & plans', target: 'credits' },
];
