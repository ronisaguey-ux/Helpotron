# Helpotron — Capabilities Reference (SUPPOSED Behavior)

**Purpose:** This file is the intended-behavior spec ("what it is SUPPOSED to do") for every
feature/function in Helpotron. It is written for a review swarm that diffs *supposed* vs
*actual* and fixes the gaps.

**Build date:** 2026-09-04 · **Repo state at authoring:** main @ `2e4dcc4`
**Layout:** `server/` (FastAPI backend) · `web/src/` (SPA frontend) · `extension/` (MV3 browser extension)

**Tag legend (per feature):**
- `live` — implemented and reachable.
- `partial` — works, but only in demo mode / only partly wired / only one of the claimed paths exists.
- `doc-only` — described in README/CHANGELOG/UI copy; no code path behind it (or copy overshoots).
- `known-known-gap` — deliberately empty/shell today (honest fallback), or stub file.
- `broken` — code exists but mismatches its own contract (see Discrepancy Register).

---

## PART A — BACKEND (`server/`)

### A.1 App core & middleware stack
- **SUPPOSED:** FastAPI app in `server/main.py:228`, served by uvicorn on :8000; all routers
  registered (`include_router`, main.py:360–382); global middleware stack (main.py:311–335):
  `RateLimitMiddleware`, `CSRFMiddleware`, `MonitorMiddleware`, `SecurityHeadersMiddleware`,
  `MemoryBudgetMiddleware` (memguard) plus a rate-limit/queue middleware (memory-budget queue
  state surfaced to the UI via the `helpotron:queue` window event — frontend QueueNoticeBanner).
  Every API request is rate-limited, CSRF-protected (with Bearer/session exceptions), monitored,
  and stamped with security headers.
- **WHERE:** `server/main.py`, `server/csrf.py`, `server/memguard.py`, `server/monitors.py`,
  `server/access_log.py`.
- **TAGS:** live

### A.2 Auth, accounts, 2FA, recovery
- **SUPPOSED:** Signup (`POST /api/signup`) requires username + password (8+ chars, letter+number)
  + confirm + Terms/FERPA/GDPR consent, then auto-login; login (`POST /api/login`) supports a
  `2fa_required` stage (12-digit code; method totp/email/sms); Cloudflare Turnstile is
  client-side UX only — the server re-verifies the token on every login and denies captcha-less
  attempts with 403; `/api/logout` revokes the session; `/api/me`, `/api/users/{public_id}`,
  `/api/status/{public_id}` serve profile/status; `/api/csrf` issues the CSRF token; 2FA setup
  endpoints (totp secret shown / email / sms, verify, disable) live in `auth_2fa.py` + router
  (`auth_2fa_router`); recovery flow (`routes_recovery.py`, `/api/recovery/*`): email code,
  phone code (cards greyed out when contact not set), "Ask the developer" pings operator on
  Telegram; 6-digit code, 30-minute validity, old password not needed; verify sets the new
  password and signs out all other sessions.
- **WHERE:** `server/auth.py`, `server/auth_2fa.py`, `server/captcha.py`, `server/csrf.py`,
  `server/routes_recovery.py`, main.py auth routes.
- **TAGS:** live

### A.3 Dashboard & credits ledger
- **SUPPOSED:** `GET /api/dashboard` (+ `/api/dashboard/{public_id}`) returns live balance,
  tokens, plan, assignment cards, recent transactions; `/api/credits/{public_id}` and
  `/api/credits/balance` expose the credits ledger; credits are granted/consumed atomically with
  ledger rows (from top-ups, trial, referral, admin grants, pay-in, generation spend, humanizer,
  detection costs); `cost_control.py` / `cost_tracking.py` enforce spend guardrails (user budget,
  auto-refill note, cost-intelligence stats); `credits_compat.py` / `credits_patch.py` keep
  legacy credit paths compatible.
- **WHERE:** `server/credits.py`, `server/credits_patch.py`, `server/credits_compat.py`,
  `server/cost_control.py`, `server/cost_tracking.py`, main.py dashboard/credits routes.
- **TAGS:** live

### A.4 Assignments, subagent teams, turn-in, grades
- **SUPPOSED:** `GET/POST /api/assignments`, `GET/PUT/DELETE /api/assignments/{assignment_id}`
  (title, due date, prompt, rubric; rubric PATCHed into `progress.rubric`); subagent progress
  truthfully reported via `/api/assignments/{assignment_id}/subagent-team` (`subagent_progress`
  per agent: COMPLETE/WORKING/WAITING/FAILED + %); turn-in ledger:
  `POST /api/assignments/{assignment_id}/turn-in` (+ `false` = move back), `GET
  /api/assignments/turned-in`, `/api/assignments/turned-in-count`; history with honest metrics
  (real gradedScores or "Not graded"; detector scores or "Not checked"); `grades.py`; Anki
  exporter (`anki_exporter.py`) and FSRS v5 scheduler (`fsrs_scheduler.py`).
- **WHERE:** `server/assignments.py`, `server/assignment_team.py`, `server/assignment_turnin.py`,
  `server/grades.py`, `server/anki_exporter.py`, `server/fsrs_scheduler.py`, main.py.
- **TAGS:** live (see register R-06 for exporter claims, R-02 for plan numbers)

### A.5 Assignment Dump (universal dump)
- **SUPPOSED:** `POST /api/dump` multi-file upload (PDF/DOCX/TXT/MP3/WAV/M4A/FLAC/JPG/PNG/TIFF/
  MP4/MOV), paste-text, and in-browser MediaRecorder lecture recording; extraction produces
  `extracted_text`, optional `overlord_notes`; `GET /api/dump` list with filter tabs
  all/matched/unmatched/audio-video; `POST /api/dump/{id}/finalize` with action
  flashcards/practice_quiz/study_guide/summary/do_it (surfaces `insufficient_tokens`); batch
  "Dump All" do_it; `POST /api/dump/{id}/route` (route to existing assignment or create new);
  delete tolerant of 404 ("already gone"); auto-match to assignments (`auto_routed` /
  `matched` / `manual_routed` / `finalized` provenance labels).
- **WHERE:** `server/assignment_dump.py`, `server/dump_router` (register at main.py:379),
  main.py `/api/dump`.
- **TAGS:** live

### A.6 Assignment direction picker
- **SUPPOSED:** `GET /api/assignment/{id}/direction` (server wins, else canonical
  DIRECTION_OPTIONS do_it_for_me/study_guide/quiz/flashcards/summary/custom);
  `POST /api/assignment/{id}/direction` persists choice with optional custom text; custom
  request returns `datalake_requested` flag + `dispatch_note` shown verbatim in the UI.
- **WHERE:** `server/assignment_direction.py`, `server/routes_assignment_direction.py`.
- **TAGS:** live

### A.7 Study generation engine (guide/flashcards/test/summary/drafts)
- **SUPPOSED:** `POST /api/study-guide`, `/api/flashcards`, `/api/practice-test`,
  `/api/summary` generate study material from assignment materials; `/api/draft/generate`,
  `/api/draft/{draft_id}`, `/api/draft/{draft_id}/retry` manage drafts;
  `/api/generate/stream/{kind}` streams generation; `/api/materials/{public_id}/{kind}` serves
  generated materials (study guides/summaries as text, flashcards as Q/A, practice tests as MC +
  short answer with explanations/model answers/`model_used` chip). Execution goes through
  `engine/harness.py` + `engine/sandbox.py` (sandboxed compute; all math runs in the sandbox —
  standing owner rule).
- **WHERE:** `server/engine/`, main.py generator routes, `server/default_styles.py`,
  `server/draft.py`.
- **TAGS:** live

### A.8 AI detection & humanizer
- **SUPPOSED:** `POST /api/ai/detect` scores text with detectors: sapling, winston_ai, pangram
  (Winston costs 1 credit/word; unconfigured keys skipped; up to 2 redrafts keeping best score;
  `min_human` threshold 50–95); `POST /api/assignment/humanize` rewrites with the unified
  Humanizer rulebook (burstiness, banned vocabulary, em-dash budget, pattern strip,
  audit-revise loop) via `humanize_skill.py`; detection standard is a per-scope setting
  (global + per subject/assignment, `ai.detection.enabled`).
- **WHERE:** `server/detectors.py`, `server/humanizer.py`, `server/humanize_skill.py`,
  main.py `/api/ai/detect`.
- **TAGS:** live (3 detectors shipped — UI/README claims 5, see register R-04)

### A.9 My Agent (Overlord)
- **SUPPOSED:** One personal agent; `POST /api/agent/start` creates a session,
  `GET /api/agent/{session_id}` continues it (overlord router); agent chat
  (`/api/agent/chat`, `/api/agent/chat/{id}` per-assignment thread, `session_mode_override`,
  `thread_id`, `assignment_id:0` global thread); threads CRUD (`/api/agent/threads`,
  `PATCH /api/agent/threads/{id}` rename, pin, delete); compact (`/api/agent/chat/compact`);
  memory (`server/agent_memory.py`: get/append/delete → loaded into prompt via `useMemory`);
  files (`server/agent_files.py`: kinds skill/rule/automation/personality, useFileInPrompt);
  prompt assembly (`agent_prompt.py`); action ledger (`server/agent_actions.py` +
  `agent_actions_router`, `/api/agent/actions`, undo); permissions (`/api/agent/permissions`
  pending/approve/reject/always-approve, defaults `['humanize','analyze_rubric','draft_section']`);
  tiering (`model_tiering.py`, `llm.py`); sandboxed tool execution via `engine/harness.py`;
  orchestrator (`server/orchestrator.py`) wires effort scores, modes manual/auto-pilot/yolo,
  educational mode, task routing.
- **WHERE:** `server/overlord_agent.py`, `server/orchestrator.py`, `server/agent_session.py`,
  `server/agent_memory.py`, `server/agent_files.py`, `server/agent_actions.py`,
  `server/agent_prompt.py`, `server/engine/`, `server/model_tiering.py`, `server/llm.py`.
- **TAGS:** live

### A.10 Analytics & insights
- **SUPPOSED:** `/api/analytics?public_id=` (stat cards, 30-day area chart, material breakdown),
  `/api/analytics/activity?days=30`, `/api/analytics/value` (ROI/cost metrics: hours saved,
  monthly cost, cost per hour, tutor savings); `GET /api/insights/snapshot` → `study_activity`
  + `next_best_action`; derived observations must only be literally-true (volume, score,
  materials, 7-day gap) — honest "Nothing to recommend — yet" when nothing holds.
- **WHERE:** `server/analytics.py`, `server/orchestrator.py` (snapshot), main.py.
- **TAGS:** live

### A.11 Data Lake & micro-credits
- **SUPPOSED:** `datalake_router` (`/api/datalake`): submit text/files → estimated 0–25
  micro-credit score with subagent classification, auto title, reasoning; actual credits only
  after review + implementation (2+ business days); 1,000 micro-credits = 1 credit; history with
  Category/Status (Pending Review/Implemented)/Est. Score/Actual Award/date.
- **WHERE:** `server/datalake.py`, `server/datalake_storage/`, main.py datalake router.
- **TAGS:** live (no redeem control shipped; see register R-13)

### A.12 Payments, plans, pricing, referrals, trial
- **SUPPOSED:** `GET /api/plans` (no auth, `credentials:'omit'`; never caches stale prices),
  `/api/discount` (referral discount pct), `/api/public-config`; `POST /api/checkout`, `/api/payments`,
  `POST /api/stripe/webhook` (Stripe receipts); the shipped user-facing purchase path is the
  custom 2FA checkout: initiate → `POST /api/payments/challenge`
  (`sendPurchaseChallenge`) → `verifyPurchaseChallenge({public_id, password, method, code,
  destination, plan, amount_cents, discount_credits_used})`; credits granted on success;
  top-up path `POST /api/payments` with `provider:'cashapp'`; referral
  (`routes_referral.py`, `/api/referrals`): 40-digit single-use code generation (gated on active
  subscription), redeem (`POST /api/referrals/redeem` — real server validation, shows rejection
  reasons), stats (is_subscribed, rules: referrer earns 2/5/10 credits on Basic/Pro/Elite
  purchases), history, delete unredeemed; trial (`routes_trial.py`, `/api/trial`): status,
  request SMS code, verify SMS → claim 7-day free trial with 100 Task Tokens.
- **WHERE:** `server/plans.py`, `server/payments.py`, `server/credits.py`,
  `server/routes_referral.py`, `server/routes_trial.py`, main.py.
- **TAGS:** live, with copy/real-billing gaps (register R-01, R-02, R-03, R-10)

### A.13 Admin surfaces
- **SUPPOSED:** `admin_router` + `admin_advanced_router` (`/api/admin/*`), role-gated:
  users search/list (`/api/admin/users`, `/api/admin/search`), per-user ops
  (`/api/admin/user/{public_id}/kick` · `tempban` · `ban` · `unban` · `plan` · `credits` ·
  `welcome-tokens` · `reset-password` · `act` [session swap + reload as user]), bulk operations
  (`POST /api/admin/bulk-operations`), cost & usage (`adminCostsSummary`, per-user multipliers),
  analytics, check (system health), moderation queue, model scorecards + per-model override,
  system map (`/api/admin/system-map` nodes + status), message inbox
  (list/reply/delete/clear), notices (`/api/admin/notices`, poll feed + mark read),
  `/api/draft/{draft_id}/admin`.
- **WHERE:** `server/admin.py`, `server/admin_advanced.py`, `server/draft.py`,
  `server/moderation.py`, `server/monitors.py`.
- **TAGS:** live (R-09: `/api/admin/ai-economics` doc-only; R-05: `/api/draft/{id}/admin` logs only)

### A.14 Telegram integration
- **SUPPOSED:** Global product bot (server-side service) + per-user link
  (`telegram_agent_router`, `/api/telegram-agent/status|connect|disconnect` — 1 credit per
  instruction); `features_router` (`/api/features/telegram/inspect` BotFather token check,
  `/find-chat`, `/configure`, `/test`, `/disconnect`); the ops bot carries admin/user notices
  and messaging to the operator.
- **WHERE:** `server/features.py`, `server/telegram_agent`-related router, `server/routes_features.py`.
- **TAGS:** live

### A.15 Extension backend endpoints
- **SUPPOSED:** `extension_router` + `extension_public_router`: session auth for the extension
  (login handoff from web session — the extension never needs to re-enter credentials),
  `/api/extension/version`, `/api/extension/releases` (+ read ack for What's New),
  `/api/extension/download` (zip, filename `helpotron-extension-v{version}.zip`),
  `/api/extension/agent_chat` (same thread as popup/web bubble chats); "Activate" browser-agent
  broker routes.
- **WHERE:** `server/routes_features.py` (extension routes), `server/features.py`,
  main.py extension router registration.
- **TAGS:** live

### A.16 Sidecars: voice, math, hygiene, orgs, study groups, simulation, exporter
- **SUPPOSED:** `/api/voice` (voice input/synthesis), `/api/transcribe` (lecture audio →
  transcript; used by extension recorder + web Record Lecture); `/api/math` + `math_engine.py`
  + `math_executor.py` — ALL math executed via bash/python in the sandbox, never eyeballed
  (owner standing rule); `/api/hygiene` (session hygiene/cleanup); `organization_router`
  (`/api/organizations`); `study_groups_router` (`/api/groups`); `simulation_router`
  (`/api/simulation` + `mock_activity_simulator.py`); `export_router` (`/api/export`) with
  `gdocs_exporter.py`, `anki_exporter.py`, `export.py`/`exports/`.
- **WHERE:** `server/routes_voice.py`, `server/routes_math.py`, `server/math_engine.py`,
  `server/math_executor.py`, `server/routes_hygiene.py`, `server/routes_study_groups.py`,
  `server/routes_monitors.py`, `server/simulation_router`/`mock_activity_simulator.py`,
  `server/export.py`, `server/gdocs_exporter.py`, `server/anki_exporter.py`.
- **TAGS:** live (R-06 exporter claims, R-11 orphaned sidecar)

### A.17 Orphaned / plan-only backend
- **SUPPOSED:** N/A — these exist but have no live path: `canvas_sync.py` (CanvasSync engine —
  written, no routes registered, documented as planned), `capabilities.py` (stub:
  `class Capabilities: pass` — no capability query surface), `scrape_sidecar` (bytecode-only
  orphan; source deleted), `src llm`-style dual tiering (`model_tiering.py` configured as
  "configurable model distribution" — no UI slider).
- **WHERE:** `server/canvas_sync.py`, `server/capabilities.py`, `server/scrape_sidecar*`,
  `server/model_tiering.py`.
- **TAGS:** known-known-gap / doc-only

## Backend discrepancy register (supposed vs actual)

| # | Item | Supposed | Actual / finding |
|---|------|----------|------------------|
| R-01 | Payments "Stripe & PayPal real checkout" (README/CHANGELOG) | Real Stripe Checkout + webhooks + PayPal | UI says "Payments not available yet — prototype"; top-up posts `provider:'cashapp'`; purchase flow = custom password+2FA challenge. `/api/stripe/webhook` exists but no live Checkout session UI. |
| R-02 | Plan token allocations | One truth per plan | Three numbers coexist: UI 300/1,000/2,700 · README 500/2,000/6,000 · CHANGELOG 300/600/1,500. UI wins, but docs/README and the low-credit banner (30/100/280) use different scales. |
| R-03 | Referral economics | ONE rule | README + PricingDashboard copy: "+50 cr/referral" to issuer, redeemer +10. Shipped: issuer 2/5/10 by tier (ReferralSection PLAN_REWARDS), redeem reply +10. Copy-level conflict. |
| R-04 | AI detectors | 5 (README): Pangram, Sapling, Originality.ai 3.0, Copyleaks, Winston | Shipped toggles: sapling / winston_ai / pangram only. |
| R-05 | `/api/draft/{id}/admin` | Draft admin capability | Logs only; no state change. |
| R-06 | Exporter claims (README "Anki 2.1 exporter, FSRS v5") | Export surfaces in UI | `anki_exporter.py`/`fsrs_scheduler.py` exist, no Anki export UI in Library/Materials; gdocs export only via assignment export. |
| R-07 | Trial grant | Trial claim grants the documented amount | Trial docstring says 500; verify flow calls `onTopUp(100)` → posts a 100-cent 'cashapp' top-up rather than granting 100 tokens. |
| R-08 | CanvasSync / capabilities / scraper | Feature surfaces | `canvas_sync.py` no routes; `capabilities.py` is an empty stub; `scrape_sidecar` bytecode-only source-deleted orphan. |
| R-09 | `/api/admin/ai-economics` | Economics dashboard | doc-only — no such endpoint behavior verified; register in swarm as known-known-gap. |
| R-10 | Trial credits vs docs | Docs "5 credits / $150 value" | Free tier grants 100 Task Tokens (UI) — doc/prose conflict. |
| R-11 | Voice/math/hygiene exposure | Product surfaces | Math + hygiene are sidecar routers used by the SPA; voice routes present; no standalone docs. Verify against UI before claiming parity. |

*(Note: R-01..R-11 were confirmed by the 2026-09-04 backend sweep; swarm should re-verify each before fixing.)*

---

## PART B — WEB FRONTEND (`web/src/`)

### F.01 SPA shell, state-machine router, ⌘K palette
- **SUPPOSED:** App.jsx routes every view (landing, history/dashboard, agent, library, dump,
  datalake, insights, credits, settings, monitors, automation, admin, guide, extension,
  msg-admin, privacy, terms, not-found) without react-router; guards PUBLIC_PATHS for signed-out
  users; aliases legacy view ids (LEGACY_VIEWS); deep-links `#assignment=<id>`; back/forward
  stack; lazy-loads views with `lazyWithRetry` inside an ErrorBoundary; gates admin by role;
  low-credit banner; mandatory privacy modal; ⌘K palette. AppShell renders topbar
  (credits/tokens badge, MOCK toggle, Demo), sidebar NAV_TREE, QuickSettings, build-stamp.
- **WHERE:** `web/src/App.jsx`, `web/src/components/AppShell.jsx`,
  `web/src/components/CommandPalette.jsx`.
- **TAGS:** live

### F.02 Command palette (⌘K)
- **SUPPOSED:** Global Ctrl+K palette searching entities (assignments, files, study, activity,
  users, settings, views) with grouping, recent items (`helpotron_palette_recent`, max 4), slash
  commands (`/assignment`, `/study`, `/run`, `/settings`, `/admin`, `/agent`, `/insights`,
  `/credits`), arrow/Enter navigation.
- **WHERE:** `web/src/components/CommandPalette.jsx`.
- **TAGS:** partial — entity search index comes from demoData, so search returns [] in live
  mode; slash commands always work.

### F.03 Auth modal (signup/login/2FA/Turnstile + extension session handoff)
- **SUPPOSED:** Create Account / Sign In tabs; signup: username, 8+ char password
  (letter+number), confirm, Terms/FERPA/GDPR consent, auto-login; login handles `2fa_required`
  (12-digit code totp/email/sms); Turnstile is client UX only — server re-verifies; successful
  web login posts session (public_id, session_token, server) via `HELPOTRON_SESSION_HANDOFF`
  window message to content script for the extension; mandatory mode disables Escape/close;
  iOS auto-zoom avoided; pointer-events armed on animationend with 4.5s fallback.
- **WHERE:** `web/src/components/AuthModal.jsx`.
- **TAGS:** live

### F.04 Mandatory legal gate + cookie banner
- **SUPPOSED:** Post-signup "Step 2 of 2 · Confirm consent" modal: Terms of Service / FERPA
  Privacy / GDPR Rights / AI Subprocessors (OpenRouter, Google Cloud/DeepMind, DeepSeek, Stripe,
  Twilio, Cloudflare) / Tokens & Billing; explicit Accept click; decline handled; cannot be
  closed. CookieBanner: Accept/Reject persisted (`helpotron_cookie_consent`), reserves scroll
  space (`cookie-banner-visible`).
- **WHERE:** `web/src/components/PrivacyPolicyModal.jsx`,
  `web/src/components/CookieBanner.jsx`.
- **TAGS:** live

### F.05 Anonymous landing (signed-out, pricing from `/api/plans`)
- **SUPPOSED:** Sticky header (Features/Guide/Pricing), hero "Your Academic Co-pilot,
  Redefined" + "Helpotron OS 2.0 is Live", ProductPreview mockup, FEATURES trio, STEPS,
  footer (privacy/terms modals + Help Center); pricing from `GET /api/plans` with
  `credentials:'omit'` — renders nothing on failure (never stale); capability chips from
  `plans[0].capabilities`; GuideView pre-signup via `publicMode`.
- **WHERE:** `web/src/components/AnonymousLanding.jsx`,
  `web/src/components/GuideView.jsx`.
- **TAGS:** live

### F.06 Guide
- **SUPPOSED:** Scannable index: intro card, glossary (Credits $1.00 off each / Tokens /
  Referral), jump chips emitting `helpotron:open-section`, 11 collapsed SectionCards (account,
  My Agent, Assignment Dump, Library, Launch to Doc, Data Lake & Micro-Credits, Credits &
  Tokens, Referral Codes, Browser Extension, Insights, Message Admin) with plain-words
  descriptions + numbered steps; "Still stuck?" (signed-in only).
- **WHERE:** `web/src/components/GuideView.jsx`.
- **TAGS:** live (steps oversell vs code — see register D-14/D-15)

### F.07 Assignment dashboard (Subject Bubbles)
- **SUPPOSED:** 6 DEFAULT_SUBJECT_BUBBLES (math/english/history/cs/biology/psychology) +
  "All Course Assignments" + custom bubbles (form title/desc/color/icon;
  `api.addCustomBubble`/`deleteCustomBubble`); counts via `matchCardToBubble` keyword regex over
  subject/class_code/name; per-bubble Export (`api.exportAssignmentData({bubble})`);
  workspace splits by `getAssignmentBucket` (completed/in_progress/pending/archived — archived
  excluded from bubbles, linked to History); ghost guard hides turned-in cards
  (`turnedInIds` from `api.getTurnedInAssignments()`); "AI Multimodal" chip on
  video/lecture/presentation titles; header actions Export All (`api.exportAllUserData` →
  `helpotron_complete_user_export_*.json`), Soft Reset (`api.softResetData`), Permanent Delete
  (type "DELETE PERMANENTLY"; `api.permanentDeleteRequest` with notify_email/notify_sms),
  History tab (`api.getAssignmentHistory(subjectFilter)`); mounts LaunchToDocModal.
- **WHERE:** `web/src/components/AssignmentCardDashboard.jsx`,
  `web/src/components/AssignmentCard.jsx`.
- **TAGS:** live

### F.08 Assignment workspace/detail
- **SUPPOSED:** Opens `api.assignmentFullView(id)` + `api.agentChatHistory(id)`; chat sends to
  the SAME thread as MyAgentView bubble chats (`api.agentChat({assignment_id, text})`); when
  pending + no direction: picker from `api.getAssignmentDirection(id)` (server wins) else
  canonical DIRECTION_OPTIONS; `api.chooseAssignmentDirection(id, direction, customText)` —
  custom shows "Request sent to Data Lake" when `res.datalake_requested`, `dispatch_note`
  verbatim; Subagent Team ribbon mirrors `subagent_progress` (COMPLETE/WORKING/WAITING/FAILED +
  %); Mark Completed (`api.markAssignmentDone`), Archive (confirm), export
  (`api.exportAssignmentData({assignment_id})`); panels prompt/rubric/attached_files/saved
  materials; provenance from `full.dump_info` labels.
- **WHERE:** `web/src/components/AssignmentDetailView.jsx`
  (exports AssignmentWorkspace + AssignmentDetailView).
- **TAGS:** live

### F.09 Launch to Doc modal
- **SUPPOSED:** Pings the extension (HELPOTRON_PING / HELPOTRON_GET_GDOCS_TABS; PONG/READY,
  GDOCS_TABS_RESULT, TYPING_PROGRESS); Target radio gdocs/gmail/notion/universal + tab select
  (detected tabs or "new" → docs.new); content auto-filled from do_it work → first text material
  → prompt (or initialText); presets Natural Academic 65 WPM / Gentle RSI Relief 35 / Brisk Pro
  95 / Motor Assist 50; WPM slider 20–130; 9 realism dimensions (punctuation pauses, gaussian
  keystroke jitter, false starts & micro-backspaces, syllable burst rhythm, fatigue curve +
  neighbor typo rate 0–6%); .txt/.md upload; Copy to Clipboard; live progress card
  (words, word-count, est minutes, Pause/Resume/Stop via HELPOTRON_CONTROL_TYPING); a11y focus
  trap; badge "Extension Ready (v2.2.0)" vs "Standalone Mode".
- **WHERE:** `web/src/components/LaunchToDocModal.jsx`; browser-side engine in
  `extension/content.js` + `extension/background.js`.
- **TAGS:** live (badge version hardcoded v2.2.0 — doc-only nit)

### F.10 Assignment Turn-In view
- **SUPPOSED:** Active list (`api.listAssignments(false)`) + history ledger
  (`api.getTurnedInAssignments()`); "Mark as Completed" (`api.turnInAssignment(id, true)`,
  confirm) moves row with real `turned_in_at`; "Move back" (`false`) undoes; per-row Launch to
  Doc. No fabricated grades anywhere.
- **WHERE:** `web/src/components/AssignmentTurnInView.jsx`.
- **TAGS:** live

### F.11 Assignment History
- **SUPPOSED:** Ledger from `api.getAssignmentHistory(subject)`; honest metrics (Total
  Completed, Average Recorded Score over real gradedScores else "Not graded", Average AI
  Detection Risk else "Not checked"); search + subject filter; client-side CSV export incl.
  detector_score; Archived tab (client-side filter of `api.assignmentCards()` on
  status==='archived'); "New Assignment" opens NewAssignmentModal.
- **WHERE:** `web/src/components/AssignmentHistoryView.jsx`,
  `web/src/components/NewAssignmentModal.jsx`.
- **TAGS:** live

### F.12 New Assignment modal
- **SUPPOSED:** Title*, optional due date, prompt, rubric; POSTs `/api/assignments` then PATCHes
  `progress.rubric` via a local request mirror (`assignmentRequest`) preserving HTTP status +
  Retry-After for 429s with a friendly rate-limit message; rubric save failure leaves the
  assignment created with a Retry rubric button; `onCreated({assignment_id, title,
  rubric_saved})`.
- **WHERE:** `web/src/components/NewAssignmentModal.jsx`.
- **TAGS:** live

### F.13 Assignment Dump view
- **SUPPOSED:** Multi-file drag/drop or browse (FormData file + user_id →
  `api.uploadDumpFile`); supported list PDF/DOCX/TXT/MP3/WAV/M4A/FLAC/JPG/PNG/TIFF/MP4/MOV;
  paste-text dump (wrapped .txt, char counter); "Record Lecture" via MediaRecorder (webm →
  same pipeline); filter tabs all/matched/unmatched/audio-video
  (`api.getDumpList(userId)` + `api.dashboard()` picker); cards: file-type icon, size KB,
  extracted_text preview, overlord_notes, auto-match confidence badge, lifecycle chips;
  finalize buttons per item (`api.finalizeDumpItem(id, action)` for
  flashcards/practice_quiz/study_guide/summary/do_it; surfaces insufficient_tokens; opens Work
  drawer); "Dump All" batch do_it; Route Item modal (`api.routeDumpItem({assignment_id or
  create_new + new_assignment_title})`); delete optimistic + 404-tolerant with server-message
  rollback; matched cards click through to owning bubble.
- **WHERE:** `web/src/components/AssignmentDumpView.jsx`.
- **TAGS:** live

### F.14 My Agent (the ONE agent)
- **SUPPOSED:** Identity card (avatar upload `api.uploadAvatar(file,'agent')`, name edit →
  `ai.aiName`), effort pill 1–10 (`effortScore /100`; buckets Low/Balanced/High), mode switcher
  Manual/Auto-Pilot/YOLO (`api.setAgentMode` + `api.updateSettings({operation_mode, ai})`), Edu
  Mode toggle (`educationalMode`); Configs drawer (agent-sidebar at wide widths, modal
  <1280px); Threads rail (New `api.agentThreadCreate`, rename `PATCH /api/agent/threads/{id}`,
  pin, delete → thread 0 fallback, quick effort ×100 400ms debounce); chat canvas
  (`api.agentChat({assignment_id:0, text, session_mode_override, thread_id})` — token balance
  update, inline `permission_request` handling, navigate_to/export_url side-effects),
  Enter-to-send auto-grow, busy indicator, copy, TTS via speechSynthesis, Launch to Doc on any
  reply, voice dictation (webkitSpeechRecognition), composer attach (`api.agentChatAttach`;
  png/jpg/webp/gif/pdf/docx/txt/md else filename-text fallback), Compact
  (`api.compactAgentChat`); lifecycle watcher (45s + focus refetch; `normalizeCards` +
  `computeAssignmentEvents` → inline event bubbles, announced once/session, flood-guard 8);
  per-assignment bubble chats (`GET /api/agent/chat/{id}`, `api.agentChat({assignment_id})`,
  file-drop `api.uploadDumpFile`); memory (`api.getAgentMemory`/`appendAgentMemory`/
  `deleteAgentMemory`); agent files (`api.listAgentFiles`, `uploadAgentFile(f, kind)` kinds
  skill/rule/automation/personality, viewer, delete, useFileInPrompt); identities/skills
  client-side (localStorage `helpotron.agent.custom_identities`/`active_identity_id`/
  `custom_skills`/`active_skill_ids`; DEFAULT_IDENTITIES/DEFAULT_SKILLS empty arrays — "No
  custom identities yet"); action ledger (`api.getAgentActions`, `undoAction` →
  `api.undoAgentAction`) with undo ribbon; permission polling 12s
  (`api.agentPermissionsPending`; stops on 401/403) with inline banner + PermissionModal;
  auto-approve list default `['humanize','analyze_rubric','draft_section']`.
- **WHERE:** `web/src/components/MyAgentView.jsx` (1739 L),
  `web/src/components/AgentConfigsSidebar.jsx`, `web/src/components/PermissionModal.jsx`,
  `web/src/components/AIWorkspace.jsx` (stub — never rendered).
- **TAGS:** live (AIWorkspace.jsx = dead code)

### F.15 Permission modal
- **SUPPOSED:** Centered card (desktop) / bottom sheet (mobile): action_type, assignment ref,
  description with bolded change count, payload rows with SETTING_LABELS for change_settings
  keys (agent_name/personality/effort_score/operation_mode/font size/theme/accent etc.);
  decisions APPROVE / REJECT / ALWAYS ALLOW / WRITE SOMETHING ELSE (replacement textarea);
  Instruction Override comment; busy/error states; Esc handling; auto-focus approve.
- **WHERE:** `web/src/components/PermissionModal.jsx`.
- **TAGS:** live

### F.16 Scoped settings widget
- **SUPPOSED:** A setting can have per-scope variants: five scope levels
  (place/subject/class/assignment/task; place gets APP_PLACES dropdown); variants stored
  `settings.scoped[path]=[{id, scope:{level,ref}, value}]`; `resolveScopedValue`/
  `effectiveValue` most-specific-wins (task > assignment > class > subject > place); collapsed
  row = global control, expanded = value editor + scope picker + Apply, existing variants list
  edit/delete, duplicate-scope clash detection. Used by AI Detection Standard, Humanizer Skill,
  Sample Voice selection.
- **WHERE:** `web/src/components/ScopedSetting.jsx`, consumed in `SettingsApp.jsx`.
- **TAGS:** live (helpers exported; not enforced as a resolution layer anywhere client-side)

### F.17 Settings workspace
- **SUPPOSED:** Collapsible accordion with search + "Saved" flash; profile presets
  Budget/Balanced/Power (confirm reset; preserves identity/subjects/learningStyle/goals/writing
  profiles; clears `scoped`). Sections: account (plan badge, pfp `api.uploadAvatar(file,'user')`,
  display name, read-only email, phone, Change password ≥8 chars, Forgot → RecoveryFlowModal),
  appearance (theme dark/light/system/oled/midnight/graphite, accent incl. custom, density,
  animations, background, UI style, fontScale 1–100, AppearancePreview + exported
  applyAppearance/applyAccessibility/applyFontScale), AI (Edu Mode + server mirror, AI name,
  persona chips Tutor/Strict Grader/Socratic Coach/Researcher/Professional/Minimalist,
  instructions, EffortSlider 1–10 ×100, Automatic Task Routing toggle, AI Detection Standard
  ScopedSetting — `ai.detection.enabled`, `min_human` 50–95, detectors sapling/winston_ai/
  pangram, Winston 1 credit/word, ≤2 redrafts best score; SampleVoicePanel "Write Like a
  Sample" (paste/.txt/.md ≤30,000 chars, global toggle, per subject/assignment variants);
  Humanizer Skill ScopedSetting + unified rulebook (burstiness, banned vocabulary, em-dash
  budget, pattern strip, audit-revise loop); intelligence sliders creativity/reasoning/
  conciseness/rigor/sourceDepth/originality; TelegramAgentCard
  `api.telegramAgentStatus/Connect/Disconnect`, 1 credit/instruction), academic (level/major/
  year, subjects + per-subject cover upload, learning style sliders, goals), writing (5 sliders
  tone/vocabulary/sentenceComplexity/formality/voice, saved profile chips, citation style
  APA/MLA/Chicago/Harvard/IEEE), notifications (event groups + channels
  browser/inapp/email/telegram), privacy (inline 2FA TwoFactorSetup, data usage toggles
  analytics/dataLake/anonymous, export all, privacy link, delete account confirmed with
  reload), automation (autoRun/autoFetch/autoTranscribe/autoDraft/autoOrganize/autoNotify +
  requireApproval gates submit/messages/bigSpend>100 tokens/premium/modify), integrations (REAL
  Telegram 4-step: BotFather link + script, token paste `POST /api/features/telegram/inspect`,
  say-hi + `/find-chat`, chat radio, `/configure`, `/test`, `/disconnect`, "Sending to chat
  {id} · bot {bot_hint}"; Canvas/Google Drive/Notion rows explicitly "Planned — not built yet"),
  extension (static "v2.0" card + capture toggles with no wiring), shortcuts (static kbd list),
  accessibility (reducedMotion/highContrast/largeText/dyslexiaFriendly/screenReader), data
  (weeklyDigest/streakReminders/accuracyTracking), experimental (ocrBeta "12% rollout"/
  edgeEval/newUI + DemoModeToggle), advanced (debugMode/apiLogging, raw config JSON viewer,
  Reset all `api.softResetData`, Data Lake link). Admin sees normal sections + Control Center.
- **WHERE:** `web/src/components/SettingsApp.jsx`, `web/src/components/SettingsSections.jsx`,
  `web/src/components/TwoFactorSetup.jsx`.
- **TAGS:** live (D-09/D-10: inert extension + shortcuts sections, v2.0 label)

### F.18 Recovery flow
- **SUPPOSED:** Email code / phone code (cards greyed when contact unset; inline save via
  `api.recoverySetContact`; masked display from `api.recoveryOptions(publicId)`); "Ask the
  developer" pings operator on Telegram; `api.recoveryRequest(publicId, method)` sends 6-digit
  code (30-min validity, no old password needed); `api.recoveryVerify({public_id, new_password,
  code})` sets new password; success notes all other sessions signed out; portal-to-body render
  (backdrop-filter containment fix).
- **WHERE:** `web/src/components/RecoveryFlowModal.jsx`.
- **TAGS:** live

### F.19 Credits hub (Plans & Top-ups + Earn Credits)
- **SUPPOSED:** Plans & Top-ups = BillingView (prototype notice "Payments not available yet —
  free beta"; balance/tokens/plan from `api.dashboard`; referral discount pct; transaction
  history `recent_transactions`; `handleTopUp` → `api.pay({provider:'cashapp', amount_cents})`;
  referral redemption via real `POST /api/referrals/redeem` with server rejection reasons;
  monthly/annual toggle ("Save 20%"); 2FA Checkout: initiate → modal with plan summary,
  username/password, Email/SMS channel, `api.sendPurchaseChallenge`, `api.verifyPurchaseChallenge({...})`
  → success receipt + `onTopUp(credits_added)`; Free Trial SMS card (`api.getTrialStatus`,
  `api.requestTrialSms`, `api.verifyTrialSms` → "Claim 7-Day Free Trial" with 100 Task Tokens);
  Cost Intelligence & Guardrails (`api.getCostIntelligence` — cost/assignment, most-used effort
  tier, spent vs limit colored progress, spend-by-subject chips, auto-refill note). Earn
  Credits = ReferralSection + CreditLeaderboard.
- **WHERE:** `web/src/components/CreditsView.jsx`, `web/src/components/BillingView.jsx`,
  `web/src/components/CreditsPricingDashboard.jsx` (tiers Basic $10/300 tokens, Pro $20/1,000,
  Elite $40/2,700; ALL_PLATFORM_FEATURES; CostIntelligenceSection).
- **TAGS:** live with partials (D-13: "Referral Discount Credits" hardcoded $0.00 + "Apply at
  Checkout" dead; R-07: trial verify onTopUp(100) posts 100-cent cashapp top-up; D-14: annual
  "Save 20%" ≈ 17% arithmetic)

### F.20 Referral program
- **SUPPOSED:** 40-digit single-use codes: banner + copy box, "Issue Code" gated on active
  subscription (`getReferralStats().is_subscribed`), metrics (Codes Issued / Successful
  Redemptions / Reward Rule 2/5/10 for Basic/Pro/Elite), redeem form (`api.redeemReferralCode`),
  issued-codes history (truncated token, single-use badge, redeemed status + per-plan reward,
  created date; Copy + Delete for unredeemed only).
- **WHERE:** `web/src/components/ReferralSection.jsx`.
- **TAGS:** live (R-03 copy conflict)

### F.21 Credit leaderboard
- **SUPPOSED:** "Credits Used" leaderboard (`api.getLeaderboard`): rank / credits used / alias
  cards ("—" until real data), alias editor + opt-in (`api.updateLeaderboardAlias({alias,
  opt_in})`) with dice randomizer, micro-credits cell from
  `api.getMicrocreditsHistory(userId).balance`, Global Standings table (search, rank medals,
  relative-expended bars, self row highlighted), "Academic Study Milestones" strip (Study
  Streak / Quiz Practice / Study Packs Built "—" until real activity; Micro-Credits real). No
  social feeds/friend requests.
- **WHERE:** `web/src/components/CreditLeaderboard.jsx`.
- **TAGS:** live (D-13 milestones hardcoded "—")

### F.22 Data Lake & Micro-Credits
- **SUPPOSED:** Text or files (drag/drop or browse; list PDF/Word/TXT/CSV/images/audio):
  `api.submitDataLakeMicrocredits({data_content, metadata:{file_name, file_count, files}})`
  returns estimated 0–25 micro-credit score with subagent classification, auto title,
  reasoning (actual credits only after review+implementation, 2+ business days; 1,000
  micro-credits = 1 credit); history table (Category, Status Pending Review/Implemented, Est.
  Score, Actual Award 0 until implemented, date).
- **WHERE:** `web/src/components/DataLakeView.jsx`.
- **TAGS:** live

### F.23 Insights
- **SUPPOSED:** Merged INTELLIGENCE destination, 3 tabs: Overview = AnalyticsDashboard
  (`/analytics?public_id=`, `/analytics/activity?days=30`, `/analytics/value` — Total Study
  Time/Materials Studied/Study Sessions/Tutor Cost Saved; "Autonomous ROI & Cost Metrics"
  Hours Saved/Monthly Cost/Cost Per Hour/Est. Tutor Savings; 30-day AreaChart via custom charts
  lib; material breakdown chips; empty → `onExplainWithAgent('academic_progress_summary')`);
  Academic Progress + Recommendations = IntelligenceView (`GET /api/insights/snapshot` →
  study_activity + next_best_action; `deriveInsights` emits only literally-true observations;
  ProgressPanel zero-filled 7-day UTC bars; RecommendationsPanel: server next best action, gap
  rec, avg<70 rec, ≥60% single-kind mix rec, else "Nothing to recommend — yet").
- **WHERE:** `web/src/components/InsightsView.jsx`, `web/src/components/AnalyticsDashboard.jsx`,
  `web/src/components/IntelligenceView.jsx`, `web/src/components/charts/`.
- **TAGS:** live

### F.24 Activity timeline + notifications stream
- **SUPPOSED:** HOME events destination: timeline grouped by day with category filter
  (all/assignment/study/credit/automation/system) + embedded notifications stream; events from
  demoData EXCEPT gated by `demoEnabled()` — live mode renders empty "No activity yet" (no API
  exists); NotificationsView: category tabs + mark-read/mark-all-read persisted locally
  (`helpotron_notifications_read`), channel badges — demo-only data in live mode.
- **WHERE:** `web/src/components/ActivityView.jsx`,
  `web/src/components/NotificationsView.jsx`, `web/src/demoData.js`.
- **TAGS:** partial / demo-only in live mode (known-known-gap: no notifications API client)

### F.25 Library
- **SUPPOSED:** Files (demo-gated LIBRARY cards: kind icon, size/pages/duration, timeAgo,
  "Open in Bubble"), Saved (demo-gated SAVED study-guide/flashcards/test rows) — both render
  empty states live; My Materials REAL (`api.materialsFor(user.public_id)`: study guides/
  summaries text, flashcards Q/A, practice tests MC + short answer with correct answers
  highlighted, explanations, model answers, model_used chip); Calendar demo-gated (grid + Upcoming
  due list).
- **WHERE:** `web/src/components/LibraryView.jsx`.
- **TAGS:** partial (files/saved/calendar demo-only; materials live)

### F.26 Automation Center
- **SUPPOSED:** Five tabs — Automations (trigger badge, runs, lastRun, enabled Toggle persisted
  to localStorage only), Runs (status, duration, −credits), Schedules (cadence + next-run +
  Toggle that does nothing), Templates (steps/uses), Recipes (bundled badges, popularity) — ALL
  demo-gated; live mode empty states everywhere.
- **WHERE:** `web/src/components/AutomationCenter.jsx`.
- **TAGS:** partial (UI-only demo feature; no backend API; toggles drive nothing)

### F.27 Monitors
- **SUPPOSED:** Admin/user telemetry, auto-refresh 30s: Traffic (total reqs, last 60s, rate,
  status-code bar 2xx/3xx/4xx/5xx, top endpoints), Activity (sessions/assignments/study
  materials/transcripts/uptime), Data Lake (operations, feedback, microcredit submissions,
  humanized samples + 48-history sparkline), API Cost ($ 24h/all-time, calls, in/out tokens);
  `GET /api/monitors/overview`, `/api/monitors/history?limit=48`; "Updated {time} · refreshes
  every 30s"; error banner on unreachable.
- **WHERE:** `web/src/components/MonitorsView.jsx`, `server/routes_monitors.py`.
- **TAGS:** live (fetches are unauthenticated — intended? verify per D-15)

### F.28 Message Admin + dev chat bubble
- **SUPPOSED:** Compose subject/category (general, bug_report, feature_request, academic,
  billing, datalake) → `api.sendMessageToAdmin`; history feed (`api.getMyAdminMessages()`) with
  status chips ("Replied by Admin"/"Queued for Review"), admin_reply boxes, timestamps; "Expected
  response: 24-48h". DevContactModal: floating bubble → chat-style history (same admin
  messages API), categories (General/Bug/Access/Billing), file attachment, Enter-to-send.
- **WHERE:** `web/src/components/MessageAdminView.jsx`,
  `web/src/components/DevContactModal.jsx`.
- **TAGS:** live

### F.29 Extension install view
- **SUPPOSED:** Download zip (`${server}/api/extension/download`,
  `helpotron-extension-v{version}.zip` from `api.getExtensionVersion()`, fallback 2.0.1),
  version badge, "Manifest V3 Ready", "100% Local & Private", server sync origin copy pill;
  browser tabs Chromium (3 steps) / Firefox (about:debugging temporary add-on) / Safari (Xcode
  import); four capability cards (Universal LMS Auto-Scraper, Launch to Doc with 9 realism
  dimensions, Live Lecture Audio Recorder, Autonomous In-Browser Subagent); FAQ (never stores
  school credentials; how to update).
- **WHERE:** `web/src/components/ExtensionInstallView.jsx`.
- **TAGS:** partial (D-08: Safari build, extension-side lecture recorder, scraper-directive
  claims are doc-only per DESIGN-UX deferrals)

### F.30 Admin Control Center
- **SUPPOSED:** Role-gated; 3 tabs: Users & Operations (AdminAdvancedDashboard: A–Z groups,
  fuzzy search, bulk-ops {user_ids, plan, delta_credits, ban_status, tags_to_add} → POST
  `/api/admin/bulk-operations`; per-row Kick/Temp-ban/Ban-Unban/Delete/Act-as/notice/change
  password; Cost & Usage + per-user multiplier; Inquiries inbox reply/delete/clear; Model
  Scorecards + override; Moderation queue; System Health; Storage Control), System Map
  (`api.adminSystemMapNodes` — name/p95/operational|non-operational), Admin Agent (chat with
  `session_mode_override:'auto'` — server detects admin, resolves intent; execution blocks with
  expandable action detail; suggestion chips). AdminNoticePopup polls `api.myAdminNotices()`
  every 20s, shows queued notices once (marks read on show AND dismiss, dedup refs, stops on
  401).
- **WHERE:** `web/src/components/AdminPanels.jsx`,
  `web/src/components/AdminAdvancedDashboard.jsx`, `web/src/components/AdminAgentChat.jsx`,
  `web/src/components/ui/AdminNoticePopup.jsx`.
- **TAGS:** live

### F.31 Demo mode / mock layer / misc chrome
- **SUPPOSED:** DemoModeToggle flips `helpotron_demo_mode` ('on'/'true' = demo; explicit opt-in,
  never ON by default) + reloads; `mock.js` intercepts API calls only in demo mode, falls
  through to network for unmocked endpoints; demoData supplies EVENTS/NOTIFICATIONS/AUTOMATIONS/
  LIBRARY/CALENDAR/SLASH_COMMANDS/searchIndex/DEFAULT_SETTINGS/EFFORT_SCORES/
  AGENT_PERSONALITIES; QueueNoticeBanner surfaces memory-budget queue state
  (`helpotron:queue`/`helpotron:queue-clear` — "Task is in Queue, will be completed
  momentarily…"); Terms/Privacy in-app pages with collapsible sections; NotFound.
- **WHERE:** `web/src/components/DemoModeToggle.jsx`,
  `web/src/components/QueueNoticeBanner.jsx`, `web/src/mock.js`, `web/src/demoData.js`,
  `web/src/components/TermsOfServiceView.jsx`, `web/src/components/PrivacyPolicyView.jsx`,
  `web/src/components/NotFound.jsx`.
- **TAGS:** live

---

## PART C — BROWSER EXTENSION (`extension/`)

### E.01 Manifest (MV3, v2.5.2 "Helpotron Academic Companion")
- **SUPPOSED:** Chrome/Edge/Brave MV3 + Firefox via `browser_specific_settings.gecko` (id
  helpotron-companion@ronisaguey-ux.dev, min FF 121). Permissions: storage, activeTab, tabs,
  scripting, alarms, tabCapture, desktopCapture, notifications; optional debugger (asked only
  when Execute first enabled); host_permissions: Canvas/Instructure, Classroom, Blackboard,
  Brightspace/D2L, Moodle, Schoology, docs.google, mail.google, notion, office.com/live.com,
  helpotron.dpdns.org, localhost. Popup popup.html; options_ui open_in_tab; background
  service_worker; ONE content script on all LMS + office + helpotron hosts at document_idle;
  CSP script-src 'self'.
- **WHERE:** `extension/manifest.json`.
- **TAGS:** live

### E.02 Popup launcher (Scrape / Chat)
- **SUPPOSED:** 2-card launcher: SCRAPE → "current thing" or "everything on the tab" (Stop
  crawl during crawl; progress role=status; per-page results list; unparseable-page error card
  with reason + "Open Data Lake"; success card "Open bubble in Helpotron"); CHAT → See-screen
  toggle (attach current screen to every message), Execute toggle (click/type/scroll; gated by
  mode; never credentials), 3-way permission mode Manual/Automatic/YOLO with hint, vision model
  line (effort NNN · DeepSeek V4 Flash Vision · tier), "Open agent chat"; approval card
  (role=alertdialog: agent wants to act / Deny / Allow) — the open popup IS the approval
  surface; account chip → login panel (Server/Public ID/Password + Save & Connect; security-check
  accounts sync from web sign-in); Update banner; What's New banner.
- **WHERE:** `extension/popup.html`, `extension/popup.js`, `extension/popup.css`,
  `extension/theme.js`.
- **TAGS:** live

### E.03 Background service worker — scrape/upload/hash/crawl
- **SUPPOSED:** Reads active tab via content.js scrapers; builds assignment payload (title, url,
  prompt/rubric, course + platform metadata, file links with size + SHA-256 where available);
  computes file hash; uploads via session-authenticated API (X-Public-ID + Bearer + CSRF);
  unparseable pages with a reason; responds to scrape current/site/stop; reports crawl results
  page-by-page. Full-course crawl (`crawl-core.js`): robots.txt check first (refuse when course
  path disallowed), throttled BFS same-site with scope, per-page progress, stoppable.
- **WHERE:** `extension/background.js`, `extension/content.js`, `extension/crawl-core.js`.
- **TAGS:** live

### E.04 Content scripts — platform scrapers + deep scrape + transcript capture
- **SUPPOSED:** On LMS/office hosts, detects platform (Canvas, Google Classroom, Blackboard,
  Brightspace, Moodle, Schoology, generic web) and extracts assignment material: prompt, rubric,
  due dates, points, files, page text; "deep scrape" pulls nested detail pages (assignment
  pages, modules) + link metadata; lecture/audio transcripts captured into dump item. On
  helpotron pages: session-handoff + Launch-to-Doc bridge only (never scrapes).
- **WHERE:** `extension/content.js`, `extension/background.js`.
- **TAGS:** live

### E.05 Agent mode (standalone tab) — screen capture + vision + gated execution
- **SUPPOSED:** Full chat/vision console: capture chip (none/drive tab), mode chip, see-screen
  chip, execute chip; Select tab (tabCapture), Pick screen (desktopCapture), Look (vision
  analysis of current frame without acting), Control switch, Stop; control banner + Resume
  driving button; live <video> preview with Grab frame/Clear; newest frame attached to every
  message; chat mirrored locally and to account (same `/api/extension/agent_chat` thread as
  popup chat + web bubble chats); vision output panel; action log; status line; consent overlay
  at launch. Directives: 15-action cap (whole list dropped, never partial — never >15),
  coordinates clamped to frame viewport, credential-field blocks (sign-in, one-time codes, card
  numbers), never downloads, read-only on learning platforms, per-action permission through
  broker.
- **WHERE:** `extension/agent_mode.html`, `extension/agent_mode.js`, `extension/background.js`,
  `extension/content.js`.
- **TAGS:** live

### E.06 Approval broker (popup card ↔ notifications, TTL 60s, deny default)
- **SUPPOSED:** Pending request stored 60s; surfaced as popup approval card if open, else
  chrome notification with Allow/Deny; includes action_type, assignment ref, description,
  payload summary; no answer within TTL → denied by default; never acts on denied; "Always
  auto-approve" per action type from web agent settings; wait-state banner + resumed-session
  messaging on the agent page.
- **WHERE:** `extension/background.js`, `extension/popup.js`, `extension/agent_mode.js`.
- **TAGS:** live

### E.07 Launch to Doc — assistive typing realism engine
- **SUPPOSED:** Receives {tabId, text, wpm, realism dims, title, assignmentId, targetApp};
  opens/targets Google Doc (docs.new or existing), Gmail, Notion, or universal editor; generates
  human-typed keystrokes: base WPM with bigram physical-distance slowdowns, shift/capitalization
  overhead, syllable burst rhythm, punctuation breathing pauses, cognitive thinking breaks,
  gaussian keystroke jitter, progressive fatigue curve, spatial typos + false starts with
  micro-backspaces; streams TYPING_PROGRESS; honors Pause/Resume/Stop
  (HELPOTRON_CONTROL_TYPING); user mouse/keyboard interrupt halts session (no auto-resume).
- **WHERE:** `extension/content.js` (GoogleDocsAssistiveTypingEngine/DripWriter,
  docs/ACCESSIBILITY_TYPING_ENGINE.md), `extension/background.js`, `extension/mouse_path.js`.
- **TAGS:** live

### E.08 Options page
- **SUPPOSED:** Theme picker + accent swatches via chrome.storage.sync (ext_theme/ext_accent);
  account panel (avatar initial, "Connected: @pid", last-sync, disconnect + sign-in links;
  storage.local never syncs credentials); privacy/terms links.
- **WHERE:** `extension/options.html`, `extension/options.js`, `extension/theme.js`,
  `extension/design.css`.
- **TAGS:** live (capture/privacy toggles claimed in comments sync'd but not wired — partial)

### E.09 First-run onboarding
- **SUPPOSED:** Opens once on install (no nag logic): reflects real account state
  (Connected: @pid / Not connected); exits "Sign in to Helpotron" (opens server URL) or
  Done/close.
- **WHERE:** `extension/onboarding.html`, `extension/onboarding.js`.
- **TAGS:** live

### E.10 Update checker + release notifications + handoff
- **SUPPOSED:** 30-min alarm check of `/api/extension/version`; newer → green "NEW" toolbar
  badge + popup update banner (version + Get → download zip); What's New fetches
  `/api/extension/releases`, unread rows in `#whatsNewBody`, "Got it" POSTs read ack; session
  handoff: web login postMessage → content script → background storeSession (captcha-gated
  accounts never log in inside the popup); server/credentials in storage.local.
- **WHERE:** `extension/background.js`, `extension/popup.js`, `web/src/components/AuthModal.jsx`.
- **TAGS:** live

### E.11 Recorder page (dormant)
- **SUPPOSED:** Standalone recording tab: getUserMedia mic → MediaRecorder webm → canvas
  waveform + timer → `POST /api/transcribe` with public_id; "Transcribed N chars (M min).
  Study tools generated in dashboard!". Per DESIGN-UX deferrals the popup entry point was
  removed (still reachable if opened directly); the active record path is the web app's "Record
  Lecture" in AssignmentDumpView.
- **WHERE:** `extension/recorder.html`, `extension/recorder.js`.
- **TAGS:** partial

### E.12 What's-New / release flow
- **SUPPOSED:** manifest bump → release row served by backend (`/api/extension/version` +
  `/api/extension/releases`); 30-min alarm compares installed vs latest → badge + banner; popup
  shows unread rows; "Got it" marks read server-side; badge/banner only re-shows for truly
  unread releases.
- **WHERE:** `extension/background.js`, `extension/popup.js`/`popup.html`,
  `web/src/components/ExtensionInstallView.jsx`, `EXTENSION_SETUP_GUIDE.md` (§Updates).
- **TAGS:** live

---

## PART D — FULL DISCREPANCY REGISTER (supposed vs actual, from 09-04 sweep)

| # | Item | Supposed | Actual / finding |
|---|------|----------|------------------|
| D-01 | Plan token allocations | One truth per plan | UI 300/1,000/2,700 · README 500/2,000/6,000 · CHANGELOG 300/600/1,500 · banner thresholds 30/100/280. Only UI numbers user-visible. |
| D-02 | Real checkout | Stripe/PayPal charged | Prototype allocation: banner "not available yet", cashapp provider, custom 2FA challenge flow. |
| D-03 | Referral rewards | One rule | UI 2/5/10 + redeemer +10; README + PricingDashboard "+50 cr". |
| D-04 | 5 AI detectors | README list | UI toggles only sapling/winston_ai/pangram. |
| D-05 | Revision-snapshot typing (README "Fake Writing History … 3–20 revisions") | Doc version history | Live keystroke realism only; no code creates GDocs revision snapshots. |
| D-06 | "3-mode System Map (Overview, Live, Investigate)"; "Anki 2.1 exporter, FSRS v5" | README | Single-mode SystemMapPanel; no Anki export UI. |
| D-07 | Extension feature claims | Install view copy | "Live Lecture Audio Recorder" in extension (removed; recorder.html dormant; real path = web Record Lecture); "Autonomous In-Browser Subagent — natural-language scraper directives" (none; instruction only via chat); Safari/Xcode package (none); "CWS-submission-ready v2.5.1" vs tree v2.5.2 + zips 2.5.1/2.5.2 at root. |
| D-08 | Version labels | One version | ExtensionInstallView server value (fallback 2.0.1) vs Settings card static "v2.0" vs LaunchToDocModal hardcoded "v2.2.0" vs GUIDE "v2.5.1" vs manifest 2.5.2. |
| D-09 | Settings extension + shortcuts sections | Wired | ExtensionSection toggles persist to settings only; ShortcutsSection lists mod+k/mod+shift+f/mod+n/mod+shift+c but only ⌘K is bound. |
| D-10 | Demo-gated surfaces in live mode | Functioning features in README/Guide | ActivityView timeline, NotificationsView stream, LibraryView Files/Saved, AutomationCenter (all tabs), CommandPalette entity search — demo-only, empty live. |
| D-11 | AIWorkspace.jsx | Component | Dead code, never rendered. |
| D-12 | Leaderboard + pricing milestones | Real data | Study Streak/Quiz Practice/Study Packs "—"; "Referral Discount Credits" $0.00 + dead "Apply at Checkout" checkbox. |
| D-13 | Proofreading/arithmetic nits | Correct copy | Annual "Save 20%" ≈ 17%; "+25 cr/-… " credit vs micro-credit notation (0–25, 1000:1; 2/5/10); Guide §Data Lake "Redeem earned micro-credits" — no redeem control in DataLakeView; Guide §Launch "typed into a fresh Doc (docs.new)" — only for gdocs target. |
| D-14 | Honest-failover behaviors (intended, worth keeping): | | optimistic dump delete with rollback; unauthenticated `/api/monitors` fetches; NewAssignmentModal Retry-After mirror; never stale pricing; "Not graded"/"—"/"Nothing to recommend — yet". |

---

## PART E — NOTES FOR THE SWARM

1. **Priority attack surface:** D-01 (three-number pricing), R-01/R-02/D-02 (payment theater vs
   wired payment intent), D-07/D-08 (version drift), R-07 (trial top-up bug), R-05 (draft admin
   log-only), R-08 (stubs/orphans), D-10 (demo shells presented as features).
2. **Intentional design by owner:** sandbox-math rule (all computation via bash/py in sandbox),
   honest no-fabrication contracts (records, scores, milestones), demo mode NEVER default-on,
   extension never scrapes helpotron pages, no social features.
3. **Verify before fixing:** each register row says where it was seen; re-read the live code
   path before changing copy or wiring.
