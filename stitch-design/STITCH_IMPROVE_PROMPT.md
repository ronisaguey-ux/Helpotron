 ROLE

  You are a staff-level team compressed into one agent: security engineer +
  backend architect + full-stack engineer + unit-economics analyst. You audit
  the entire T2B repo, fix every real issue you find (not recommendations — the


backend architect + full-stack engineer + unit-economics analyst. You audit
the entire T2B repo, fix every real issue you find (not recommendations — the
fix itself), rebuild the backend where it is drifting or duplicated, turn the
Stitch design export into a production website wired to the real API, and
finish with a profitability model for a bootstrapped, unknown brand. The repo
must be left better, tested, runnable, and documented — measured, not
asserted.

WHAT THE REPO IS (map — read everything, not just this list)

AGENT_PROMPTS/         (READ-ONLY — the prompts that produced this work)
frontend/stitch/       raw Google Stitch export: DESIGN.md (tokens + toolchain),
                       PRD (brand/screens), 12 screen exports (code.html + screen.png)
docs/                  prior audits & plans (Claude/DeepSeek/Kimi 6_26–6_30) —
                       mine them for known issues, verify each, do not rediscover
roofing-lead-bot/      the product (Flask 3.1 + waitress, SQLite, httpx async,
                       OpenRouter LLM, Whapi, Stripe, Calendly, FindYMail, Apollo,
                       rate limiter, circuit breaker, verticals: roofing/hvac/solar)
  src/                 parallel architecture (config/api_control_center.py,
                       api/webhooks.py FastAPI-style, core/orchestrator.py,
                       llm/router.py, modules/…) — see the drift findings below
  tests/               pytest suite (state_store; extend massively)
  .env.example         the ONLY env template
verify/verify_*.py     the owner's acceptance scripts (must keep passing)

OWNER DIRECTIVES — channel stack CHANGE (authoritative, overrides PRD)

1. WhatsApp/Whapi is DETECTED IN THE CODEBASE — REMOVE IT COMPLETELY.
   No Whapi, no whatsapp_messaging.py WhatsApp semantics, no #25D366 channel
   green, no "on WhatsApp" copy. The channels are now:
   - Twilio — SMS and EMAIL verification (Twilio Verify / SendGrid or
     Twilio email APIs). The twilio official Python SDK is authorized.
   - Telegram Bot (created via @BotFather) — the mobile TEXTING channel
     where T2B's AI sales agent holds the lead conversation. Use
     python-telegram-bot (or raw Bot API via httpx if you justify it);
     long-polling vs webhook: pick, implement, and document (webhook needs
     public HTTPS + secret-token validation — which the infra supports).
   - SMS doubles as the acquisition spike: outbound SMS invite with a
     Telegram deep-link (https://t.me/<bot>?start=<lead_token>) so a
     lead can upgrade the conversation from one SMS to a free forever
     Telegram thread. Implement and measure it.
2. The AI conversation engine (ai_conversation.py, src/llm/router.py,
   closing/intent flows) is channel-agnostic in concept: refactor it so
   adapters (telegram | sms) sit behind one ChannelAdapter interface with
   the same intent classifier + Stripe/Calendly payloads. Keep the state
   machine; migrate the phone-keyed state_store to support telegram
   chat_id keys (migration, not a rewrite).

PHASE 1 — SECURITY HARD AUDIT (find AND fix)

Cover each item; for each finding: reproduction → fix → regression test:
- Webhook auth: Whapi HMAC currently; replace with Twilio
  X-Twilio-Signature (SHA1 HMAC with auth token — implement with the SDK's
  RequestValidator) AND Telegram secret-token/webhook validation; replay
  resistance, timestamp windows.
- Secrets: env-only, fail-fast, validated formats (pydantic-settings or
  the existing dataclass pattern — pick ONE); zero secrets in logs, traces,
  error payloads, HTML; .env never committed (add to .gitignore + verify);
  .env.example is the only template and uses sk-placeholder values.
- Input: every endpoint — parameterized SQL everywhere, Pydantic schemas
  on every request/response, control-char + prompt-injection filtering in
  LLM inputs, size limits, content-type enforcement, no eval.
- Auth/tenancy: the dashboard API you will build must have real auth
  (Argon2/bcrypt password hashing — pick the OSS lib with the best standing;
  session or JWT-decide with a written reason), per-user data isolation,
  CSRF protection for cookies, rate limits (login/lookup/OTP), account lockout,
  OTP (email/SMS via Twilio) with TTL + attempt caps — T2B's "email + phone
  ownership" story.
- Abuse economics: OTP/verification abuse, SMS/Telegram spam budgets per
  user, free-tier abuse of the LLM (cap tokens/daily), Stripe webhook
  idempotency + event signature verification.
- Infra: CORS, security headers (a Talisman-style header set or manual),
  no debug mode in prod, waitress thread tuning + timeout, SQLite WAL + busy
  timeouts + backup routine, log redaction, /health without info leak.
- Dependency hygiene: run pip-audit-style CVE scan; pin ranges;
  remove unused deps (this repo is over-imported); report the full surface.
- PII/GDPR: what is stored, retention, deletion request handler, consent
  language in the new frontend forms (checkbox with link), data export.

PHASE 2 — BACKEND REBUILD/DE-RISK

Known drift (verify, then fix — this is the #1 structural defect):
- TWO parallel config systems: config.py:APIKeys AND
  src/config/api_control_center.py:APIControlCenter (same keys, different
  names, both instantiate at import, both fail-fast). Choose one for the
  whole app (a single Settings via pydantic-settings recommended) and
  delete the other; every module imports the canonical one.
- TWO routing stacks: Flask app.py (webhook + rate limiter) AND FastAPI-
  style src/api/webhooks.py (Request, BackgroundTasks — FastAPI
  signatures but the repo does NOT depend on FastAPI, so those files cannot
  even run; they are dead code or import-broken). Purpose: one HTTP
  framework (Flask stays — waitress + existing routing; or migrate all to
  FastAPI + uvicorn if you can justify with real numbers). Remove/replace the
  dead stack, keep src/core orchestration where sound.
- main.py is a stub. Give it a real role (CLI entry: migrate, run,
  import-csv, dry-run) with argparse, or delete it.
- Reconcile async story: one event loop for httpx; sync Flask callers get the
  documented bridge; no per-request loops; no thread explosion.
- SQLite: schema versioning + migration runner (the repo has
  migrate_state.py — audit it), seed/backup scripts, indexes on hot columns,
  proper transaction scopes in state_store.py.
- Add the missing API surface the frontend needs (all real, no mock-only):
  POST /api/auth/register|login|request-otp|verify-otp, GET /api/leads
  (+detail), POST /api/leads/{id}/action (mark hot/export/delete),
  GET /api/usage, GET /api/subscription, GET/POST /api/settings
  (telegram bot connect + twilio number), GET /api/health (already exists).
  Auth-gated except health/auth. OpenAPI docs (Flask: flasgger-free —
  either self-doc or use an OSS plugin with a written reason).

PHASE 3 — FRONTEND: ANALYZE THE STITCH DESIGNS, THEN BUILD THE SITE

First, a real DESIGN AUDIT (this is a deliverable, frontend/design-audit.md):
- frontend/stitch/ has 12 exports (landing/pricing/how-it-works/auth/
  dashboard × desktop/mobile/animated). Check: token consistency across all
  exports vs DESIGN.md (drift list), Tailwind CDN + Google Fonts at runtime
  (must become self-contained), duplicated CSS blocks across pages, Material
  Symbols vs inline-SVG (PRD says inline SVG — reconcile), dark-only (DESIGN.md
  sheet is dark class — but there IS no light sheet: decide dark-only
  product (recommended, matches sheet) or add a light marketing variant and
  justify), mobile sizes, a11y (labels, focus, contrast, aria on menus),
  animated variants vs prefers-reduced-motion, the WhatsApp-green/hints
  sweep (AMENDMENT: replace with Telegram/Twilio channel cues), and the
  PRD copy that says "WhatsApp focus" — new copy proves the channel story.

Then BUILD the production site per the design's own toolchain decision
(vanilla HTML/CSS+JS custom properties, NO build step, mock=1 client —
from DESIGN.md; if you deviate, write the reason):
- frontend/ root: index.html, pricing.html, how-it-works.html, contact.html,
  app/ (dashboard: leads table w/ search/filter/sort + detail panel with the
  AI conversation transcript + actions), auth/ (login.html, signup.html),
  assets/ (css, js, svg), + the README (serve instructions, page map, tokens,
  mock-vs-wired table).
- api.js client: window.T2B_API_BASE || "/api", full CRUD wrappers,
  ?mock=1 labeled demo mode (obviously-fake sample data), configurable to
  hit the real endpoints you built in Phase 2; wire dashboard/auth to live
  endpoints; login → session/Auth header handling.
- Accessibility: semantic HTML, labeled inputs, focus-visible, skip links,
  keyboard-operable tables/menus/modals, Escape + focus trap on modals,
  4.5:1 contrast. No console.log in prod paths. No hardcoded prices or
  invented testimonials — pricing must be rendered from GET /api/plans
  (build that endpoint from pricing.py semantics; when the API is down the
  site shows an honest "pricing unavailable" state, never stale numbers).

PHASE 4 — PROFITABILITY: DIRT-CHEAP ACQUISITION → PRICE LADDER (own deliverable: docs/PROFITABILITY_MODEL.md)

The owner is unknown/bootstrapped and must acquire customers dirt cheap, then
raise prices once the brand has traction. Produce a real working model, not
prose:
1. Unit economics per artifact: cost per sourced lead (Apollo/FindYMail
   calls — see Phase 5 for their open-source replacement), cost per SMS sent
   (Twilio rates for the decision markets), cost per LLM classification
   (OpenRouter cheapest route, tokens per conversation, per-message cost),
   Telegram = free, Stripe fees, hosting. Produce a per-lead-delivered COGS
   and a breakeven CAC per pricing tier.
2. Current pricing sanity: $10/$30/$80 leads; Starter 5×$10=$20/mo,
   5×$30=$40/mo, 5×$80=$100/mo; free tier = 1 lead + 75% off premium. Score
   it: what does it cost YOU to serve each tier, what margin is left, where
   is the funnel leak, and what the free tier really costs in LLM/SMS.
3. Dirt-cheap acquisition plan (concrete, costs per channel):
   cold SMS/Telegram outreach outbound (cost per 1000 sends vs expected
   conversion), small-vendor communities (Facebook groups, Reddit r/Roofing,
   local trade associations — free), referral program design (the repo already
   has referral.py — wire it with real mechanics + caps that prevent abuse),
   content/SEO for "roofing leads" queries, and a "$1 first lead then $30"
   loss-leader mechanic IF the unit economics support it (prove with numbers
   in the model; tune the numbers so a $10 lead delivered costs you < $9 and
   the funnel conversion still works).
4. Price ladder (explicit): phase A penetration pricing targets + margins
   → phase B (e.g. at N customers/steady funnel) price escalations — give
   concrete triggers (cohort CAC, LTV/CAC ≥ 3, churn < X%) and the new price
   set at each rung with margin tables. Include: what NOT to discount
   (never free leads at scale), grandfathering policy, and the "unknown-brand
   trust" plays (money-back guarantee, sample lead screenshot, review-able
   history) that convert more cheaply than ad spend.
5. Volume math + runway: best/worst case for month 1–12 at the CAC mix;
   what monthly revenue is required to cover infra + your time; the kill
   criteria (if X isn't true by month Y, pivot).

PHASE 5 — OPEN-SOURCE-FIRST: DEEP GITHUB RESEARCH (own deliverable: docs/OSS_RESEARCH.md)

"Almost all functionality must come from open-source git tools/repos; as few
third-party paid dependencies as possible." Do real research (GitHub API,
stars, last commit, license, Python versions, adoption) on every category and
produce a decision matrix — per candidate: what it does, stars/last-release/
license, integration cost (days), runtime cost, verdict: ADOPT / ADAPT / SKIP
with one-line justification:

- Lead sourcing/enrichment: Apollo + FindYMail are paid per-call. Research
  open-source alternatives and free/OSS enrichment pipelines (e.g., OSS
  search/scrape stack, public-registry normalizers, email-pattern + SMTP
  verification OSS libs, n8n-style OSS automation, free B2B datasets). The
  goal: cut per-lead sourcing cost toward zero. Recommend the exact stack.
- LLM: keep OpenRouter (cheapest capable route) or OSS-run models
  (vLLM/Ollama — only if the hardware/budget math beats API, show it);
  structured-output + retry + telemetry OSS tooling; token-cost-aware router.
- Messaging: telegram OSS libs (+ a Twilio SDK note), SMS fallbacks,
  phone-verification OSS if it beats Twilio Verify on cost for your volume.
- Auth/security: password hashing (argon2-cffi vs bcrypt — verdict),
  sessions (itsdangerous vs PyJWT — verdict), OTP, rate limiting OSS.
- Data: SQLAlchemy vs raw sqlite3 vs SQLModel (current repo is raw
  sqlite3 — is the migration worth it? real answer), migrations (Alembic vs
  hand-rolled — verdict), SQLite hardening extensions.
- Payments: stripe-python (official, keep) + webhook OSS helpers;
  subscription/renewal logic in-repo vs OSS billing libs (cashctrl-style).
- Observability/ops: structlog vs logging, sentry OSS alternative
  (glitchtip/self-hosted), health checks, backups (litestream!),
  deployment (Docker compose, Caddy with auto-TLS, systemd), CI (GitHub
  Actions: ruff, mypy, pytest, pip-audit, bandit).
- Dev quality: ruff/mypy/pytest pre-commit stack, and WHICH of the repo's
  roll-your-own utilities (rate limiter, circuit breaker, error handler,
  tracing) should be replaced by battle-tested OSS libs (and which are
  genuinely simpler in-house — rate limiter probably hand-rolled is fine,
  circuit breaker → tenacity? verdicts, not vibes).
- Frontend: design tokens tooling, static-site helpers, chart/markdown
  OSS (only if the dashboard needs them — no bloat).

Add the total: list every REMAINING third-party dependency (libs + paid APIs)
after this pass, each with its monthly cost estimate and the OSS reason it
could not be replaced. The target: paid external APIs ≤ 4 (LLM, Twilio,
Stripe, email — and the email one should be Twilio too), everything else OSS.

PHASE 6 — TESTS, CI, VERIFICATION (hard gates, no skip)

- Extend pytest: unit tests per fixed bug + per new endpoint (auth, leads,
  usage, settings), adapter tests for Telegram/Twilio with mocked transports,
  rate limiter, circuit breaker, LLM router (mocked), pricing, referral caps.
- verify/verify_*.py must ALL still pass (they are the owner's acceptance
  checks — run them; report per-script results).
- CI-ready: .github/workflows/ci.yml (lint → type → test → CVE scan →
  build), Dockerfile + docker-compose.yml (app + a containerized DB or
  volume), pre-commit config (ruf/mypy/bandit if OSS research recommends).
- Run everything and paste the final outputs (test summary line, lint exit,
  verify_* exit codes, screenshot paths) in SUMMARY.md.

OUTPUT CONTRACT

- SUMMARY.md at repo root: audit findings table (severity/status/evidence),
  what changed (changelog with file lists per phase), channel migration
  report (what WhatsApp paths were removed/renamed, what replaced them),
  final dependency list + cost table, profitability model summary, test/CI
  evidence, and "Run it" (5 commands: install, migrate, seed, dev serve,
  test). Everything else lands per the phases above.
- Update README_T2B.md only where it contradicts the shipped reality
  (channel stack, new modules); README.md likewise. AGENT_PROMPTS/ is
  READ-ONLY — never edit it.
- Work on a fix/audit-2026-09 BRANCH — NEVER push to master directly.
  Commit in logical per-phase commits with clear messages. The final
  SUMMARY.md must state the branch + head SHA.

HARD RULES

- NO placeholders/TODO/fake-completion anywhere — every fix is real, every
  endpoint responds, every UI control does something. If something cannot be
  done (API key needed to demo, etc.), make it run with mock=1/.env.example
  values and say exactly that in SUMMARY.md.
- NEVER print, log, or commit a real secret; never write a real key into any
  file; .env stays untracked.
- Never invent prices, testimonials, metrics, or "95% accuracy" claims —
  every number in every doc must be derived (model output) or sourced.
- Do not rewrite history; keep it reviewable. Efficiency matters more than
  cleverness: simpler code that works outranks any cleverness.
- When two repo docs disagree, the code is the truth, and you note the
  discrepancy in SUMMARY.md.

FINAL REPORT (to your operator, ≤ 600 words)

Findings count by severity | channel migration summary | dependency cut list
(old paid → OSS, with monthly cost delta) | profitability headline (CAC per
tier, margin after Phase A price set, month-6 revenue projection) | test/verify
evidence | the one thing you'd fix next if you had another session.

— END OF PROMPT 2 —
  fix itself), rebuild the backend where it is drifting or duplicated, turn the
  Stitch design export into a production website wired to the real API, and
  finish with a profitability model for a bootstrapped, unknown brand. The repo
  must be left better, tested, runnable, and documented — measured, not
  asserted.

  WHAT THE REPO IS (map — read everything, not just this list)

  AGENT_PROMPTS/         (READ-ONLY — the prompts that produced this work)
  frontend/stitch/       raw Google Stitch export: DESIGN.md (tokens + toolchain),
                         PRD (brand/screens), 12 screen exports (code.html + screen.png)
  docs/                  prior audits & plans (Claude/DeepSeek/Kimi 6_26–6_30) —
                         mine them for known issues, verify each, do not rediscover
  roofing-lead-bot/      the product (Flask 3.1 + waitress, SQLite, httpx async,
                         OpenRouter LLM, Whapi, Stripe, Calendly, FindYMail, Apollo,
                         rate limiter, circuit breaker, verticals: roofing/hvac/solar)
    src/                 parallel architecture (config/api_control_center.py,
                         api/webhooks.py FastAPI-style, core/orchestrator.py,
                         llm/router.py, modules/…) — see the drift findings below
    tests/               pytest suite (state_store; extend massively)
    .env.example         the ONLY env template
  verify/verify_*.py     the owner's acceptance scripts (must keep passing)

  OWNER DIRECTIVES — channel stack CHANGE (authoritative, overrides PRD)

  1. WhatsApp/Whapi is DETECTED IN THE CODEBASE — REMOVE IT COMPLETELY.
     No Whapi, no whatsapp_messaging.py WhatsApp semantics, no #25D366 channel
     green, no "on WhatsApp" copy. The channels are now:
     - Twilio — SMS and EMAIL verification (Twilio Verify / SendGrid or
       Twilio email APIs). The twilio official Python SDK is authorized.
     - Telegram Bot (created via @BotFather) — the mobile TEXTING channel
       where T2B's AI sales agent holds the lead conversation. Use
       python-telegram-bot (or raw Bot API via httpx if you justify it);
       long-polling vs webhook: pick, implement, and document (webhook needs
       public HTTPS + secret-token validation — which the infra supports).
     - SMS doubles as the acquisition spike: outbound SMS invite with a
       Telegram deep-link (https://t.me/<bot>?start=<lead_token>) so a
       lead can upgrade the conversation from one SMS to a free forever
       Telegram thread. Implement and measure it.
  2. The AI conversation engine (ai_conversation.py, src/llm/router.py,
     closing/intent flows) is channel-agnostic in concept: refactor it so
     adapters (telegram | sms) sit behind one ChannelAdapter interface with
     the same intent classifier + Stripe/Calendly payloads. Keep the state
     machine; migrate the phone-keyed state_store to support telegram
     chat_id keys (migration, not a rewrite).

  PHASE 1 — SECURITY HARD AUDIT (find AND fix)
