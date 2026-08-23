// DEMO MODE mock layer — hardcoded sample data so the design can be previewed
// with everything populated, without needing real credits, real payments, or a
// live LLM. Mock responses are ONLY returned while demo mode is ON (toggle in
// the bottom-right corner; persisted in localStorage). When demo mode is OFF
// every request goes straight to the real backend — no mock data anywhere.
// All content below is fake demo content (course names, people, cards are
// invented samples); the on-screen DEMO badge labels it as such.

const DEMO_KEY = 'helpotron_demo_mode';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isDemoMode() {
  // Demo mode is the default experience (absent key = on): a fresh visitor
  // sees the fully populated design preview immediately. Only an explicit
  // 'off' (via the toggle) routes everything to the live backend.
  try {
    return localStorage.getItem(DEMO_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setDemoMode(on) {
  try {
    localStorage.setItem(DEMO_KEY, on ? 'on' : 'off');
  } catch { /* storage unavailable — mode just won't persist */ }
}

// ─── sample dataset ────────────────────────────────────────────────────────

const DEMO_ASSIGNMENTS = [
  { id: 101, title: 'Essay: Operant Conditioning in the Classroom', course: 'PSY 210 — Developmental Psychology', instructor: 'Prof. Rivera', due_date: '2026-08-28', status: 'materials_ready', progress: 65, ai_risk: 0.03, urgency: 'normal' },
  { id: 102, title: 'Problem Set 7: Integration Techniques', course: 'MAT 201 — Calculus II', instructor: 'Dr. Okafor', due_date: '2026-08-25', status: 'tracked', progress: 20, ai_risk: 0.42, urgency: 'high' },
  { id: 103, title: 'Lab Report: Titration of Acetic Acid', course: 'CHE 110 — General Chemistry', instructor: 'Dr. Lin', due_date: '2026-09-02', status: 'materials_ready', progress: 40, ai_risk: 0.08, urgency: 'normal' },
  { id: 104, title: 'Annotated Bibliography: Cold War Historiography', course: 'HIS 340 — United States History', instructor: 'Prof. Adeyemi', due_date: '2026-09-05', status: 'tracked', progress: 10, ai_risk: 0.18, urgency: 'low' },
  { id: 105, title: 'Video Response: Symbolism in Beloved', course: 'ENG 220 — African American Literature', instructor: 'Dr. Carter', due_date: '2026-08-22', status: 'submitted', progress: 100, ai_risk: 0.0, urgency: 'done' },
  { id: 106, title: 'Group Presentation: Neural Networks 101', course: 'CSC 305 — Artificial Intelligence', instructor: 'Prof. Nwosu', due_date: '2026-09-10', status: 'tracked', progress: 5, ai_risk: 0.35, urgency: 'normal' },
];

const DEMO_FLASHCARDS = [
  { q: 'What is operant conditioning?', a: 'Learning through consequences — reinforcement and punishment shape behavior (Skinner).' },
  { q: 'Define a definite integral.', a: 'The signed area under a curve f(x) from a to b, written ∫ₐᵇ f(x) dx.' },
  { q: 'What does titration measure?', a: 'The concentration of an unknown solution by reacting it with a standard solution of known molarity.' },
  { q: 'What is the Socratic method?', a: 'Dialogue-driven questioning used to draw out understanding rather than lecturing answers.' },
  { q: 'What is a neural network?', a: 'A layered model of interconnected nodes (neurons) that learns patterns from data via weights and biases.' },
  { q: 'What was the Cold War?', a: 'A 1947–1991 ideological standoff between the US and USSR, fought mainly through proxy conflicts.' },
  { q: 'What is a thesis statement?', a: 'The central argument of an essay, usually one sentence near the end of the introduction.' },
  { q: 'Define entropy.', a: 'A measure of disorder in a system; ΔS > 0 for spontaneous processes at constant temperature.' },
];

const DEMO_QUIZ = [
  { id: 1, question: 'Which of the following best describes operant conditioning?', options: ['Learning by observing others', 'Learning through consequences', 'Learning through pure repetition', 'Learning via classical pairing'], correct: 1, explanation: 'Operant conditioning (Skinner) is behavior modified by reinforcement and punishment.' },
  { id: 2, question: '∫₀¹ 2x dx equals:', options: ['0', '1', '2', '4'], correct: 1, explanation: 'The antiderivative is x², evaluated from 0 to 1 → 1.' },
  { id: 3, question: 'In titration, the equivalence point is reached when:', options: ['The indicator permanently changes color', 'Moles of titrant equal moles of analyte', 'The pH reaches exactly 7', 'The solution begins to boil'], correct: 1, explanation: 'Equivalence = stoichiometrically equal amounts of titrant and analyte have reacted.' },
];

const DEMO_GUIDE = {
  sections: [
    { title: 'Unit 1 — Memory & Conditioning', points: ['Classical vs operant conditioning: stimuli, responses, and reinforcement schedules', 'Working memory model (Baddeley): central executive, phonological loop, visuospatial sketchpad', 'Spaced repetition beats cramming — evidence and study-plan implications'] },
    { title: 'Unit 2 — Applications in the Classroom', points: ['Positive reinforcement vs negative punishment: concrete classroom examples', 'Token economies and how to fade them out', 'Ethical limits: aversive techniques and learned helplessness'] },
    { title: 'Unit 3 — Exam Strategy', points: ['Practice-testing effect: retrieval practice over re-reading', 'Cue-dependent forgetting and context reinstatement', 'Build a 3-week spaced review calendar before finals'] },
  ],
};

const DEMO_SUMMARY = 'This lecture covers learning theory, from classical conditioning (Pavlov) through operant conditioning (Skinner), including reinforcement schedules, extinction, and modern classroom applications such as token economies. Key takeaway: retrieval practice and spacing outperform passive review for long-term retention.';

const DEMO_TRANSACTIONS = [
  { delta: 12840.0, reason: 'Elite plan subscription — monthly allocation', created_at: '2026-08-01T09:00:00-04:00' },
  { delta: -2.0, reason: 'Study guide generation — PSY 210', created_at: '2026-08-05T18:22:00-04:00' },
  { delta: -1.0, reason: 'Flashcards (10) — MAT 201', created_at: '2026-08-07T20:11:00-04:00' },
  { delta: -2.0, reason: 'Practice test — CHE 110', created_at: '2026-08-09T16:45:00-04:00' },
  { delta: -0.5, reason: 'Summary — HIS 340', created_at: '2026-08-12T14:03:00-04:00' },
  { delta: 500.0, reason: 'Cashapp top-up +$50', created_at: '2026-08-15T12:30:00-04:00' },
];

const DEMO_LEADERBOARD = [
  { public_id: 'RoniDev', credits_used: 15000, credits_formatted: '15,000.0', streak_days: 12 },
  { public_id: 'sam_w', credits_used: 12480, credits_formatted: '12,480.0', streak_days: 9 },
  { public_id: 'maya_o', credits_used: 10992, credits_formatted: '10,992.0', streak_days: 7 },
  { public_id: 'study_bot', credits_used: 9340, credits_formatted: '9,340.0', streak_days: 5 },
  { public_id: 'newton_fan', credits_used: 7710, credits_formatted: '7,710.0', streak_days: 3 },
];

const DEMO_BUBBLES = [
  { id: 1, title: 'PSY 210 — Developmental Psych', description: 'Lectures, essays, and exam prep for Developmental Psychology.', color: '#8b5cf6' },
  { id: 2, title: 'MAT 201 — Calculus II', description: 'Problem sets, integration techniques, and office-hours notes.', color: '#06b6d4' },
  { id: 3, title: 'CHE 110 — General Chemistry', description: 'Lab reports, titrations, and stoichiometry drills.', color: '#10b981' },
];

const DEMO_HISTORY = [
  { id: 201, title: 'Essay: Operant Conditioning in the Classroom', course: 'PSY 210 — Developmental Psychology', status: 'materials_ready', due_date: '2026-08-28', score: null },
  { id: 202, title: 'Quiz 4: Social Development', course: 'PSY 210 — Developmental Psychology', status: 'submitted', due_date: '2026-08-15', score: 92 },
  { id: 203, title: 'Midterm: Integration Techniques', course: 'MAT 201 — Calculus II', status: 'submitted', due_date: '2026-07-30', score: 88 },
  { id: 204, title: 'Lab Report: Redox Reactions', course: 'CHE 110 — General Chemistry', status: 'submitted', due_date: '2026-07-22', score: 95 },
];

const DEMO_MEMORY = [
  { id: 'm1', text: 'User is an undergraduate psychology major who finds calculus tough but writes strong essays.', created_at: '2026-08-18T09:12:00-04:00' },
  { id: 'm2', text: 'Prefers study guides over flashcards; reviews best in the evening (after 8pm).', created_at: '2026-08-19T21:30:00-04:00' },
  { id: 'm3', text: 'MAT 201 Integration exam is on 08-25 — highest priority right now.', created_at: '2026-08-21T14:02:00-04:00' },
  { id: 'm4', text: 'Wants natural, first-person academic tone in drafts — no overly formal language.', created_at: '2026-08-22T08:47:00-04:00' },
];

const DEMO_AGENT_FILES = [
  { id: 'f1', file_name: 'essay-style-rule.md', kind: 'rule', size_bytes: 2140, created_at: '2026-08-20T11:05:00-04:00' },
  { id: 'f2', file_name: 'flashcard-generator.skill.md', kind: 'skill', size_bytes: 5200, created_at: '2026-08-20T11:06:00-04:00' },
  { id: 'f3', file_name: 'weekly-review.automation.json', kind: 'automation', size_bytes: 980, created_at: '2026-08-21T09:20:00-04:00' },
  { id: 'f4', file_name: 'atlas-personality.md', kind: 'personality', size_bytes: 1560, created_at: '2026-08-21T18:44:00-04:00' },
];

function dashboardPayload(publicId = 'RoniDev') {
  return {
    status: 'success',
    public_id: publicId,
    plan: 'Elite',
    credits: 12840,
    monthly_credits: 20000,
    settings: { theme: 'dark', default_course: 'PSY 210', demo: true },
    discount_balance: 0,
    pagination: { limit: 50, offset: 0 },
    user: {
      public_id: publicId,
      tier: 'Elite',
      credits_remaining: 12840,
      credits_formatted: '12,840.0',
      tokens_processed: 128400000,
    },
    telemetry: {
      health: 'Nominal',
      uptime_pct: 99.98,
      active_worker: 'Overlord Orchestrator',
      active_assignments: DEMO_ASSIGNMENTS.length,
      evasion_success_rate: '99.8%',
    },
    roi_stats: {
      study_hours_saved: 48.5,
      estimated_tutor_savings_usd: 1450.0,
      hourly_cost_equivalent: 0.41,
    },
    assignments: DEMO_ASSIGNMENTS,
    materials: [
      { id: 501, kind: 'flashcards', topic: 'Operant Conditioning — PSY 210', content: DEMO_FLASHCARDS.slice(0, 4), created_at: '2026-08-05T18:22:00-04:00' },
      { id: 502, kind: 'study_guide', topic: 'Integration Techniques — MAT 201', content: DEMO_GUIDE, created_at: '2026-08-05T18:30:00-04:00' },
      { id: 503, kind: 'practice_test', topic: 'Titration & Stoichiometry — CHE 110', content: DEMO_QUIZ, created_at: '2026-08-09T16:45:00-04:00' },
    ],
    recent_transactions: DEMO_TRANSACTIONS,
  };
}

// Material payloads for the generators — hardcoded fake content per kind.
export function mockMaterialFor(kind, count = 10) {
  if (kind === 'flashcards') return { kind: 'flashcards', content: DEMO_FLASHCARDS.slice(0, Math.min(count, DEMO_FLASHCARDS.length)), created_at: new Date().toISOString(), model_used: 'demo-mode' };
  if (kind === 'practice_test') return { kind: 'practice_test', content: DEMO_QUIZ, created_at: new Date().toISOString(), model_used: 'demo-mode' };
  if (kind === 'study_guide') return { kind: 'study_guide', content: DEMO_GUIDE, created_at: new Date().toISOString(), model_used: 'demo-mode' };
  return { kind: 'summary', content: DEMO_SUMMARY, created_at: new Date().toISOString(), model_used: 'demo-mode' };
}

// Simulated SSE generation: 4 progress steps, then the hardcoded material.
export async function mockGenerateStream(kind, body, onProgress) {
  const steps = ['Parsing syllabus', 'Extracting key concepts', `Generating ${kind === 'practice_test' ? 'quiz' : kind === 'study_guide' ? 'study guide' : kind === 'summary' ? 'summary' : 'flashcards'}`, 'Verifying accuracy'];
  for (let i = 0; i < steps.length; i++) {
    if (typeof onProgress === 'function') onProgress({ step: i + 1, total: 4, label: steps[i] });
    await sleep(400);
  }
  return mockMaterialFor(kind, body?.count);
}

// ─── endpoint registry ─────────────────────────────────────────────────────

// Path match → handler(method, parsedUrl, body). Returns a JSON payload or
// null to pass the request through to the real backend.
const ROUTES = [
  { match: /^\/api\/dashboard(\/.*)?$/, handle: (m, u) => dashboardPayload(u.pathname.split('/').filter(Boolean).pop() || u.params.public_id || 'RoniDev') },
  { match: /^\/api\/credits\/.+/, handle: () => ({ plan: 'Elite', credits: 12840 }) },
  { match: /^\/api\/me$/, handle: () => ({ message: 'Authenticated (demo)', public_id: 'RoniDev', plan: 'Elite', credits: 12840, authenticated: true }) },
  { match: /^\/api\/health$/, handle: () => ({ status: 'ok' }) },
  { match: /^\/api\/user\/settings$/, handle: (m) => (m === 'PATCH' ? { status: 'ok', settings: { theme: 'dark', demo: true } } : { settings: { theme: 'dark', default_course: 'PSY 210', notifications: true, demo: true } }) },
  { match: /^\/api\/user\/models$/, handle: () => ({ models: [
    { id: 'fast_economical', name: 'Fast & Economical', min_effort: 1, recommended_use: 'Transcription, OCR, rapid drafts' },
    { id: 'balanced', name: 'Balanced', min_effort: 350, recommended_use: 'Standard coursework synthesis' },
    { id: 'flagship', name: 'Flagship', min_effort: 750, recommended_use: 'Deep reasoning and final-quality writing' },
  ] }) },
  { match: /^\/api\/user\/academic-levels$/, handle: () => ({ levels: ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'] }) },
  { match: /^\/api\/user\/effort-score\/resolve/, handle: () => ({ score: 720, level: 'excellent' }) },
  { match: /^\/api\/user\/leaderboard(\/alias)?$/, handle: () => ({ leaderboard: DEMO_LEADERBOARD, alias: 'RoniDev' }) },
  { match: /^\/api\/assignments\/cards$/, handle: () => ({ cards: DEMO_ASSIGNMENTS }) },
  { match: /^\/api\/status\/.+/, handle: () => ({ assignments: DEMO_ASSIGNMENTS }) },
  { match: /^\/api\/materials\/[^/]+\/([a-z_-]+)/, handle: (m, u) => { const kind = u.pathname.split('/').pop(); return { materials: [{ id: 600, kind, topic: 'Sample material (demo)', content: mockMaterialFor(kind).content, created_at: new Date().toISOString() }], kind }; } },
  { match: /^\/api\/(study-guide|flashcards|practice-test|summary)$/, handle: (m, u, body) => mockMaterialFor(u.pathname.split('/').pop()) },
  { match: /^\/api\/payments$/, handle: (m, u, body) => { const cents = Number(body?.amount_cents || 0); return { payment_id: `demo_${Date.now()}`, status: 'manual', credits: 12840 + cents / 10 }; } },
  { match: /^\/api\/checkout$/, handle: () => ({ message: 'Checkout is disabled in demo mode (sample data only)', session_id: null }) },
  { match: /^\/api\/datalake\/microcredits\/history/, handle: () => ({ records: [{ id: 1, action: 'quiz_solved', points: 25, created_at: '2026-08-10T19:00:00-04:00' }, { id: 2, action: 'peer_review', points: 15, created_at: '2026-08-11T10:12:00-04:00' }, { id: 3, action: 'streak_bonus', points: 10, created_at: '2026-08-12T08:45:00-04:00' }], total_earned: 50 }) },
  { match: /^\/api\/datalake\/microcredits\/redeem/, handle: () => ({ status: 'ok', redeemed: 50 }) },
  { match: /^\/api\/referrals\/stats/, handle: () => ({ codes: ['RIVERA-8F2K-91QZ-77HT-3BDX'], redemptions: 3, earnings: 1500 }) },
  { match: /^\/api\/referrals\/code/, handle: () => ({ code: 'RIVERA-8F2K-91QZ-77HT-3BDX' }) },
  { match: /^\/api\/referrals\/generate/, handle: () => ({ code: 'RIVERA-8F2K-91QZ-77HT-3BDX' }) },
  { match: /^\/api\/admin\/costs\/summary/, handle: () => ({ total_spend_usd: 128.4, today_spend_usd: 2.15, avg_cost_per_task_usd: 0.41, budget_usd: 200 }) },
  { match: /^\/api\/admin\/costs\/users/, handle: () => ({ users: [{ public_id: 'RoniDev', total_usd: 61.2, tasks: 148 }, { public_id: 'sam_w', total_usd: 42.8, tasks: 96 }, { public_id: 'maya_o', total_usd: 24.4, tasks: 61 }] }) },
  { match: /^\/api\/admin\/analytics/, handle: () => ({ users: 3, assignments: DEMO_ASSIGNMENTS.length, materials: 12, revenue_usd: 128.4, mrr_usd: 97 }) },
  { match: /^\/api\/admin\/users/, handle: () => ({ users: [{ public_id: 'RoniDev', plan: 'Elite', credits: 12840, created_at: '2026-07-01T00:00:00-04:00' }, { public_id: 'sam_w', plan: 'Pro', credits: 4200, created_at: '2026-07-12T00:00:00-04:00' }] }) },
  { match: /^\/api\/admin\/user\/[^/]+\/credits/, handle: () => ({ status: 'ok', credits: 12840 }) },
  { match: /^\/api\/features\/stats$/, handle: () => ({ streak_days: 12, xp: 4820, level: 14, badges: ['Early Bird', 'Consistent Scholar', 'Quiz Master'] }) },
  { match: /^\/api\/features\/calendar\/deadlines$/, handle: () => ({ deadlines: DEMO_ASSIGNMENTS.map((a) => ({ assignment: a.title, course: a.course, due: a.due_date })) }) },
  { match: /^\/api\/features\/recommend$/, handle: () => ({ recommendation: { focus: 'MAT 201 — Problem Set 7 is due soonest; your integration accuracy is 71%.', suggested_study_minutes: 45 } }) },
  { match: /^\/api\/features\/theme$/, handle: (m) => (m === 'POST' ? { message: 'Theme updated (demo)', theme: 'dark' } : { theme: 'dark' }) },
  { match: /^\/api\/agent\/mode$/, handle: (m) => (m === 'POST' ? { mode: 'auto', is_session_override: true } : { mode: 'auto', permissions_granted: ['generate_materials', 'submit_drafts'] }) },
  { match: /^\/api\/agent\/permissions\/pending$/, handle: () => ({ pending: [] }) },
  { match: /^\/api\/agent\/permissions\/rules$/, handle: (m) => (m === 'POST' || m === 'DELETE' ? { status: 'ok' } : { rules: [{ action: 'submit_drafts', allowed: true }] }) },
  { match: /^\/api\/user\/custom-subjects/, handle: (m) => (m === 'POST' || m === 'DELETE' ? { status: 'ok' } : { subjects: ['PSY 210', 'MAT 201', 'CHE 110', 'HIS 340'] }) },
  { match: /^\/api\/user\/custom-bubbles/, handle: (m) => (m === 'POST' || m === 'DELETE' ? { status: 'ok', bubbles: DEMO_BUBBLES } : { bubbles: DEMO_BUBBLES }) },
  { match: /^\/api\/user\/styles$/, handle: (m) => (m === 'POST' || m === 'DELETE' ? { status: 'ok' } : { styles: [{ id: 1, name: 'Analytical prose', preview: 'Concise topic sentences, evidence-first structure.' }] }) },
  { match: /^\/api\/user\/trio/, handle: (m) => (m === 'POST' || m === 'DELETE' ? { status: 'ok' } : { rules: [{ id: 1, context: 'short_answer', style: 'analytical' }] }) },
  { match: /^\/api\/user\/assignment-history/, handle: () => ({ history: DEMO_HISTORY }) },
  { match: /^\/api\/simulation\/status$/, handle: () => ({ enabled: false, mode: 'inactive' }) },
  { match: /^\/api\/simulation\/seed$/, handle: () => ({ status: 'ok' }) },
  { match: /^\/api\/extension\/version$/, handle: () => ({ version: '1.0.0', latest: '1.0.0' }) },
  { match: /^\/api\/extension\/check-update/, handle: () => ({ up_to_date: true, latest: '1.0.0' }) },

  // ── Study Analytics (was unmocked → 401s against the real backend) ──────
  { match: /^\/api\/analytics(\?|$)/, handle: () => {
    const iso = (d) => d.toISOString().slice(0, 10);
    const days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
    return {
      total_study_time_minutes: 642,
      total_study_time_hours: 10.7,
      materials_studied: 14,
      total_materials_generated: 23,
      average_score: 86.4,
      session_count: 31,
      material_breakdown: { flashcards: 8, study_guide: 5, practice_test: 6, summary: 4 },
      recent_activity: {
        [days(6)]: 45, [days(5)]: 90, [days(4)]: 0, [days(3)]: 120,
        [days(2)]: 65, [days(1)]: 180, [days(0)]: 142,
      },
      kind_study_time: { flashcards: 210, study_guide: 168, practice_test: 190, summary: 74 },
      assignment_count: 6,
    };
  } },
  { match: /^\/api\/analytics\/activity/, handle: () => {
    const rows = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const base = Math.abs(Math.sin(i * 1.7)) * 95 + 5;
      rows.push({
        date: d.toISOString().slice(0, 10),
        time_minutes: Math.round(base),
        sessions: 1 + (i % 3),
        average_score: Math.round(70 + Math.abs(Math.cos(i * 0.9)) * 25),
      });
    }
    return rows;
  } },
  { match: /^\/api\/analytics\/value/, handle: () => ({
    study_hours: 10.7,
    monthly_cost: 40,
    cost_per_hour: 3.74,
    tutor_savings: 495.0,
  }) },

  // ── Study Clusters (was unmocked → 401s) ─────────────────────────────────
  { match: /^\/api\/groups\/my/, handle: () => ({ groups: [
    { id: 1, course: 'CS 504', name: 'Algorithms Sync Node', members: 4 },
    { id: 2, course: 'BIO 220', name: 'Cell Bio Study Cluster', members: 6 },
    { id: 3, course: 'ECO 101', name: 'Microeconomics Pod', members: 3 },
  ] }) },

  // ── My Agent: memory + files (Experience Rewrite, 08-22) ─────────────────
  // NOTE: /api/agent/chat/compact MUST precede the bare /api/agent/chat route
  // (ROUTES is first-match-wins).
  { match: /^\/api\/agent\/chat\/compact$/, handle: () => ({ status: 'ok', message: 'Chat history compacted (demo)' }) },
  { match: /^\/api\/agent\/memory$/, handle: (m) => {
    if (m === 'POST') return { status: 'ok', entry: { id: `m_${Date.now()}`, text: 'Memory entry added (demo)', created_at: new Date().toISOString() }, entries: DEMO_MEMORY };
    if (m === 'PUT') return { status: 'ok', entries: DEMO_MEMORY };
    return { entries: DEMO_MEMORY };
  } },
  { match: /^\/api\/agent\/memory\/[^/]+$/, handle: () => ({ status: 'ok', entries: DEMO_MEMORY }) },
  { match: /^\/api\/agent\/files$/, handle: () => ({ files: DEMO_AGENT_FILES }) },
  { match: /^\/api\/agent\/files\/[^/]+$/, handle: () => ({ status: 'ok' }) },

  // ── Overlord / agent chat: canned bot reply ──────────────────────────────
  { match: /^\/api\/agent\/chat/, handle: (m, u, body) => {
    const text = (body && (body.message || body.prompt)) || '';
    return {
      reply: text
        ? `(demo) Overlord received: "${String(text).slice(0, 120)}" — it would parse this request, pick the right study tools, and stream progress here. Sample data mode is on.`
        : '(demo) Overlord online. Drop a document or ask for flashcards, a quiz, or a study guide — sample responses are enabled.',
      action: 'acknowledged',
      mode: 'auto',
    };
  } },
  { match: /^\/api\/agent\/command$/, handle: () => ({ status: 'ok', action: 'queued' }) },
  { match: /^\/api\/agent\/permission\/respond/, handle: () => ({ status: 'ok' }) },

  // ── Account data tools ────────────────────────────────────────────────────
  { match: /^\/api\/user\/data\/export-all/, handle: () => ({ status: 'ok', export_url: null, note: 'Demo mode: data export is simulated.' }) },
  { match: /^\/api\/user\/data\/soft-reset/, handle: () => ({ status: 'ok', note: 'Demo mode: soft reset simulated.' }) },
  { match: /^\/api\/user\/data\/permanent-delete-request/, handle: () => ({ status: 'ok', note: 'Demo mode: deletion request simulated.' }) },
  { match: /^\/api\/user\/fake-writing-history\/simulate/, handle: () => ({ status: 'ok', history: DEMO_HISTORY }) },
  { match: /^\/api\/discount$/, handle: () => ({ status: 'ok', discount: 0.15 }) },
  { match: /^\/api\/simulation\/toggle/, handle: () => ({ status: 'ok', enabled: true, mode: 'demo' }) },

  // ── Admin panel (visible when logged in as RoniDev) ───────────────────────
  { match: /^\/api\/admin\/moderation(\?|$)/, handle: () => ({ items: [], pending_count: 0 }) },
  { match: /^\/api\/admin\/moderation\/[^/]+\/action/, handle: () => ({ status: 'ok' }) },
  { match: /^\/api\/admin\/system-health/, handle: () => ({
    status: 'healthy',
    uptime_seconds: 86400 * 3,
    queue_depth: 0,
    workers: { orchestrator: 'idle', executor: 'idle', watcher: 'armed' },
  }) },
  { match: /^\/api\/admin\/model-metrics(\?|$)/, handle: () => ({ metrics: [], cost_by_tier: { fast: 41.2, balanced: 58.9, flagship: 28.3 }, budget_usd: 200 }) },
  { match: /^\/api\/admin\/model-metrics\/override/, handle: () => ({ status: 'ok' }) },
  { match: /^\/api\/admin\/bulk-operations/, handle: () => ({ status: 'ok', processed: 0 }) },
];

/**
 * Demo-mode request interceptor. Returns a mock Response-like payload for
 * registered endpoints, or null when the endpoint isn't mocked (those go to
 * the real backend unchanged). Never called unless demo mode is ON.
 */
export async function resolveDemoRequest(method, url, bodyRaw) {
  if (!isDemoMode()) return null;
  let pathname;
  let params;
  try {
    const u = new URL(url, 'http://localhost');
    pathname = u.pathname;
    params = u.searchParams;
  } catch {
    pathname = url.split('?')[0];
    params = new URLSearchParams(url.split('?')[1] || '');
  }
  let body = null;
  if (typeof bodyRaw === 'string' && bodyRaw) {
    try { body = JSON.parse(bodyRaw); } catch { body = null; }
  }
  for (const route of ROUTES) {
    if (route.match.test(pathname)) {
      const json = route.handle(method, { pathname, params }, body);
      if (json !== undefined && json !== null) {
        await sleep(140); // small delay so spinners/loading states still read naturally
        return json;
      }
    }
  }
  return null;
}
