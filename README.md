# Helpotron — Academic Study Operating System

> An AI-native study operating system and agent co-pilot designed for high-school students: personalized agent tutoring, multi-modal assignment tracking, verifiable math sandboxing, credit-governed tool execution, and browser extension scraping.

---

## 1. What Helpotron Is

**Helpotron** is a comprehensive academic co-pilot and study operating system built specifically for high-school students. Rather than acting as a generic chatbot or answer generator, Helpotron is an instructional study OS that actively guides learning, prevents academic dishonesty, and helps students master complex subjects.

Key pillars of the platform:
- **My Agent Instructional Co-Pilot**: A personal, persistent AI companion operating under strict academic guardrails. It coaches students step-by-step through Socratic inquiry rather than giving away homework answers or offering unvetted life advice.
- **Assignment Tracking & Active Subjects**: Real-time status tracking, due dates, priority buckets, FSRS-based spaced repetition study material generation, and an immutable submission ledger.
- **Universal Material Ingestion (Assignment Dump)**: Multimodal drag-and-drop ingestion of lecture audio, handwritten notes, whiteboard photos, worksheets, and documents with automatic classification and assignment linking.
- **Predictable Compute & Credits Economy**: Transparent, bounded tool execution budgets ($5 Basic, $15 Pro, $30 Elite, and a verified $0 Free Trial) backed by a double-entry credit ledger and single-use referral engine.
- **Browser Extension & URL Scraping**: Chrome Manifest V3 extension and standalone scraping sidecar enabling students to capture assignments directly from school LMS portals (Canvas, Google Classroom) into their workspace.

---

## 2. Repository Map

```
helpotron/
├── web/                   # Vite + React 19 Frontend application
│   ├── src/
│   │   ├── components/    # AppShell, MyAgentView, AssignmentCardDashboard, etc.
│   │   ├── api.js         # Centralized HTTP & SSE streaming API client
│   │   ├── index.css      # Material Design 3 (M3) design tokens and CSS theme
│   │   └── demoData.js    # Offline demo state and fixtures
│   └── package.json       # Frontend dependencies and Vite build scripts
├── server/                # FastAPI Python Backend application
│   ├── tests/             # Pytest test suite (unit, integration, and security tests)
│   ├── database.py        # SQLAlchemy 2.0 ORM models & session management
│   ├── main.py            # FastAPI entry point, middleware & lifespan setup
│   ├── agent_prompt.py    # Strict educational system prompt builder
│   ├── llm.py             # OpenRouter LLM router, streaming & model policy
│   ├── payments.py        # Payment tiers ($5 / $15 / $30) & billing
│   └── math_executor.py   # Deterministic Python math evaluation sandbox
├── extension/             # Chrome Manifest V3 Browser Extension
│   ├── manifest.json      # MV3 extension configuration
│   ├── background.js      # Service worker & message passing
│   ├── content.js         # DOM scraping & capture injection
│   └── popup.html / .js   # Extension popup interface & agent status
├── scrape_sidecar/        # Standalone Playwright URL scraper service
│   ├── app.py             # FastAPI service for deep web assignment scraping
│   └── requirements.txt   # Sidecar dependencies (Playwright, ScrapeGraphAI)
└── sweep-reports/         # Comprehensive security and vulnerability sweep audits
```

---

## 3. Quick Start

### Prerequisites
- Python 3.11+ (or Python 3.12/3.14 with virtual environment)
- Node.js 18+ and npm 9+
- OpenRouter API Key for LLM model routing

### 1. Backend Setup
```bash
cd server

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with necessary secrets
# OPENROUTER_API_KEY="your_openrouter_api_key_here"
# SESSION_SECRET="generate-a-secure-random-string-min-32-chars"
# CSRF_SECRET="generate-another-secure-random-string"
# DATABASE_URL="sqlite:///./helpotron.db"
# ENVIRONMENT="development"

# Start FastAPI server on port 8000
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd web

# Install node dependencies
npm install

# Start Vite dev server on port 5173
npm run dev
```

### 3. Offline Demo Mode
Helpotron includes a complete offline Demo Mode. Toggle demo mode in the interface using the `DemoModeToggle` component in the header/sidebar, or by setting `localStorage.setItem("helpotron_demo_mode", "true")`. 
- **Frontend Fixtures**: `web/src/demoData.js` provides rich, offline sample assignments, study cards, and mock conversations.
- **Backend Simulator**: `server/mock_activity_simulator.py` simulates background activity, telemetry, and grading updates without consuming external API credits.

---

## 4. Frontend Architecture

The frontend is built with **React 19** and **Vite**, prioritizing low-latency reactivity, accessibility, and clean component boundaries.

- **App Shell (`web/src/components/AppShell.jsx`)**: The master responsive layout housing the desktop sidebar, mobile navigation drawer, command palette (Ctrl/Cmd+K), and primary call-to-action button ("New Study Session") that immediately invokes the `NewAssignmentModal`.
- **Material 3 Design Tokens (`web/src/index.css`)**: Built with Tailwind CSS and CSS custom properties implementing standard Google Material Design 3 token semantics:
  - Surfaces: `bg-surface`, `bg-surface-container-low`, `bg-surface-container-lowest`, `bg-surface-container-high`
  - Text: `text-on-surface`, `text-on-surface-variant`
  - Primaries & Accents: `bg-primary`, `text-primary`, `text-on-primary`
  - Status Indicators: Semantic color roles with 15% tinted pill containers (`bg-sem-green/15 text-sem-green`, `bg-sem-amber/15 text-sem-amber`, `bg-sem-red/15 text-sem-red`, `bg-sem-blue/15 text-sem-blue`, `bg-sem-purple/15 text-sem-purple`).
  - Themes: Dark theme default with instant toggle support via `[data-theme="light"]` attribute on `<html>`. No hardcoded hex values or duplicate `dark:` modifiers.
- **API Request Layer (`web/src/api.js`)**: Robust `fetch` wrapper handling base URLs, Bearer token authentication, CSRF tokens on mutating requests, and standard error decoding.
  - **Server-Sent Events (SSE)**: `generateStream(endpoint, payload, onEvent)` and `agentChatStream(data, onEvent)` handle streaming LLM responses and live reasoning streams over `ReadableStream`.
- **Custom Visualizations (`web/src/components/charts/`)**: Handcrafted, dependency-free SVG charts (progress rings, bar charts, sparklines) ensuring instant load times without heavy charting library overhead.

---

## 5. Backend Architecture & Server Modules

The backend is structured as a modular **FastAPI** application with clear boundaries between routing, business logic, LLM coordination, security, and persistence.

| Module | Description & Primary Purpose |
| :--- | :--- |
| `access_log.py` | Persistent access, latency, and error logging across all API endpoints. |
| `admin.py` | Core administrative endpoints for user lookup, account management, and role delegation. |
| `admin_advanced.py` | Advanced admin services: bulk operations, system health reports, and moderation queue. |
| `agent_actions.py` | My Agent action ledger tracking tool invocations with 1-click student rollback. |
| `agent_files.py` | Persistent agent file storage for user skills, rules, study rubrics, and custom prompts. |
| `agent_memory.py` | Agent memory persistence engine managing structured user preferences and notes. |
| `agent_prompt.py` | Canonical educational system prompt builder with strict school-only refusal guardrails. |
| `agent_session.py` | Browser agent session coordination for real-time Chrome extension co-browsing. |
| `analytics.py` | Study habits analytics, mastery metrics, and user engagement aggregations. |
| `anki_exporter.py` | Spaced-repetition export engine packaging study cards into Anki 2.1 `.apkg` decks. |
| `assignment_direction.py` | Assignment lifecycle coordinator managing status buckets and Data Lake fallback routes. |
| `assignment_dump.py` | Universal Assignment Dump engine for multimodal ingestion, OCR, and smart routing. |
| `assignments.py` | CRUD operations for student assignments with strict tenant ownership validation. |
| `assignment_team.py` | Multi-agent assignment solver coordinating researcher, analyst, and reviewer subagents. |
| `assignment_turnin.py` | Assignment turn-in submission tracker with immutable timestamps and proof artifacts. |
| `auth.py` | Authentication utilities: JWT issuance, PBKDF2 password hashing, and session management. |
| `auth_2fa.py` | Two-Factor Authentication (TOTP) enforcement for account security and purchases. |
| `canvas_sync.py` | Background LMS sync engine pulling courses, assignments, and deadlines from Canvas LMS. |
| `capabilities.py` | Dynamic capability inspection reporting enabled LLM engines, models, and features. |
| `captcha.py` | Cloudflare Turnstile CAPTCHA verification for registration and login endpoints. |
| `config.py` | Centralized environment and settings configuration using Pydantic Settings. |
| `cost_control.py` | Per-user token consumption budget controller preventing unexpected compute costs. |
| `cost_tracking.py` | Granular per-request LLM API cost ledger and administrative financial analytics. |
| `credits.py` | Double-entry task token & credit transaction accounting and balance manager. |
| `credits_compat.py` | Backward-compatibility translation layer for legacy credit charge signatures. |
| `credits_patch.py` | Runtime credit calculation and cost monkey-patches for task execution. |
| `csrf.py` | Signed Double-Submit CSRF token generator and request verification middleware. |
| `database.py` | SQLAlchemy 2.0 declarative models, database engine initialization, and session fixtures. |
| `datalake.py` | Anonymous rubric, submission, and study artifact training data repository. |
| `default_styles.py` | Preset writing styles categorized by reading level and academic target. |
| `detectors.py` | Multi-engine AI detection integration assessing essay originality and synthetic patterns. |
| `draft.py` | Assignment draft generation pipeline with iterative AI detection scoring and feedback. |
| `export.py` | Universal document exporter producing Markdown, PDF, CSV, and formatted study packages. |
| `features.py` | Feature-flag registry controlling experimental student tools and collaborative hubs. |
| `file_utils.py` | Secure file path sanitization preventing path traversal and unsafe upload handling. |
| `fsrs_scheduler.py` | Free Spaced Repetition Scheduler (FSRS v5) algorithm calculating review intervals. |
| `gdocs_exporter.py` | Google Docs humanized streaming exporter simulating authentic document revisions. |
| `grades.py` | Grade calculation engine tracking GPA impacts and target score trajectories. |
| `humanize_skill.py` | Skill definition orchestrating Kimhons pattern scrubbing and readability pacing. |
| `humanizer.py` | Multi-pattern academic humanizer eliminating synthetic LLM vocabulary and rhythm markers. |
| `llm.py` | OpenRouter model router, token pricing matrix, unified `call_llm`, and `stream_llm`. |
| `mailer.py` | Transactional email delivery service for password resets and notification alerts. |
| `main.py` | FastAPI application factory, CORS policies, exception handlers, and route inclusion. |
| `math_engine.py` | Safe mathematical expression parser and AST-validated arithmetic evaluator. |
| `math_executor.py` | Sandboxed Python math execution engine ensuring deterministic calculation proofs. |
| `memguard.py` | In-memory budget and payload ceiling guard preventing RAM exhaustion on file dumps. |
| `mock_activity_simulator.py`| Simulation engine generating synthetic study sessions, uploads, and peer data for demos. |
| `model_tiering.py` | Dynamic effort-level to model router mapping student requirements to optimal engines. |
| `moderation.py` | Content safety moderation screener filtering harmful, abusive, or out-of-scope inputs. |
| `monitors.py` | Persistent platform health monitors tracking latency, error rates, and queue depths. |
| `orchestrator.py` | Master assignment orchestrator delegating research and structuring tasks to subagents. |
| `overlord_agent.py` | Overlord agent managing active tool permissions, sandboxes, and student execution modes. |
| `payments.py` | Subscription tier definitions ($5/$15/$30), billing endpoints, and checkout sessions. |
| `plans.py` | Canonical single-source-of-truth plan catalogue, monthly allowances, and pricing specs. |
| `privacy.py` | Privacy policies and GDPR Article 17 automated data erasure routines. |
| `ratelimit.py` | Token-bucket sliding-window rate limiter keyed by client IP and authenticated identity. |
| `recovery.py` | Password recovery service generating secure, time-delimited reset tokens. |
| `referral.py` | 40-character single-use cryptographically verified referral reward engine. |
| `routes_admin_advanced.py` | Endpoints for advanced admin monitoring, system metrics, and content triage. |
| `routes_agent_actions.py` | Endpoints exposing My Agent's immutable action ledger and rollback triggers. |
| `routes_analytics.py` | API endpoints serving historical study metrics and mastery distributions. |
| `routes_assignment_direction.py` | Endpoints for directing assignment solving workflows and study strategies. |
| `routes_auth_2fa.py` | Endpoints for TOTP setup, barcode generation, validation, and recovery codes. |
| `routes_datalake.py` | Endpoints for submitting anonymous study data, appraisals, and microcredit payout. |
| `routes_dump.py` | Endpoints for multi-file assignment dumping, OCR status, and automatic routing. |
| `routes_export.py` | Endpoints providing one-click export downloads for assignments and flashcard sets. |
| `routes_extension.py` | Endpoints for browser extension update notifications, version check, and zip packages. |
| `routes_features.py` | Endpoints querying active tenant feature flags and collaborative study modules. |
| `routes_hygiene.py` | Data sanitization and tenant partition hygiene verification endpoints. |
| `routes_import_url.py` | Secure gatekeeper endpoint for importing assignments from arbitrary URLs via sidecar. |
| `routes_math.py` | Endpoints for running sandboxed Python calculations and receiving verifiable proofs. |
| `routes_monitors.py` | Endpoints serving live infrastructure health metrics and historical operational snapshots. |
| `routes_organization.py`| Multi-tenant organization and school classroom management endpoints. |
| `routes_overlord.py` | Endpoints for agent chat, streaming chat (`/api/agent/chat/stream`), and mode controls. |
| `routes_recovery.py` | Endpoints managing the user-facing password reset request and verification flow. |
| `routes_referral.py` | Endpoints for claiming referral rewards and generating subscriber referral codes. |
| `routes_simulation.py` | Endpoints for starting, stopping, and inspecting the mock demo activity simulator. |
| `routes_study_groups.py` | Collaborative study group rooms, shared notes, and peer study tools endpoints. |
| `routes_telegram_agent.py`| Endpoints linking Telegram accounts to a user's persistent My Agent instance. |
| `routes_trial.py` | Endpoints for SMS verification and one-time Free Trial credit allocation. |
| `routes_user_settings.py`| Endpoints managing student learning personas, writing tone, and accessibility settings. |
| `routes_voice.py` | Endpoints interfacing with local Voicebox voice synthesis and audio playback. |
| `screen_vision.py` | Vision analysis engine inspecting screenshots and diagrams for homework context. |
| `security.py` | Centralized security utilities: password hashing, admin checks, and token decoding. |
| `ssrf.py` | Strict SSRF defense ensuring outbound requests target safe, public non-loopback IPs. |
| `study_groups.py` | Collaborative group logic, shared deck syncing, and group member management. |
| `study_tools.py` | Automatic generation pipelines for flashcards, practice quizzes, and summary notes. |
| `subagents.py` | Specialized subagent definitions (Researcher, Synthesizer, Formatter) and execution logic. |
| `telegram_agent_link.py` | Persistent state synchronizer bridging Telegram bot messages to the user's agent. |
| `telegram_bot.py` | Standalone long-polling Telegram bot process allowing study on mobile chat. |
| `transcription.py` | Audio transcription service transforming lecture recordings into indexed study notes. |
| `trial_service.py` | Free trial phone number verification and duplicate abuse prevention service. |
| `user_settings_service.py`| Core service managing multi-tiered user preferences, citation styles, and goals. |

---

## 6. System Prompt Architecture

The system prompt builder in `server/agent_prompt.py` enforces Helpotron's pedagogical mission and ethical boundaries:

- **Operational Modes (`mode_for_node`)**: The system operates in two core modes:
  - `educational` (default): Socratic tutoring, concept breakdowns, guided questioning, and direct refusal of non-academic life how-tos.
  - `open`: General study assistance when explicitly configured by authorized users for unrestricted academic exploration.
- **Strict School-Only Refusal Block (`edu_block`)**:
  - The agent is hard-coded to refuse non-school life advice (personal relationships, fitness routines, life coaching, car repair, home remedies). When asked for life advice, it delivers a strict, polite 1-to-2 sentence redirection to academic coursework.
  - **Operator 08-28 Greeting Carve-Out**: Greetings ("hi", "hey", "good morning"), conversational pleasantries ("how are you?", "thanks"), and direct questions about the agent itself ("who are you?", "what can you do?") are **never** treated as off-topic. The agent responds warmly in its chosen persona tone and gently invites the student to share what they are studying today.
- **Agent Persona Customization (`agent_persona_block`)**: Live per-request injection of `settings.ai.personality` (e.g. "Coach", "Socratic Tutor", "Strict Professor") and custom student instructions (`settings.ai.instructions`). When an identity is deleted, it cleanly resets to the default Coach persona.
- **Personal Agent Files (`agent_files_block`)**: Injects user-defined study rules, custom rubrics, and subject cheat-sheets stored in `agent_files.py`.
- **Sandbox-Math Standing Rule**: The agent is explicitly prohibited from computing multi-step arithmetic or complex mathematical steps in its head. It must delegate math to the deterministic Python sandbox (`server/math_executor.py`) to guarantee computational accuracy.
- **Model Identity & Learning Caps**: The agent accurately discloses its underlying model routing and maintains strict guardrails preventing students from bypassing grade-level reading guidelines.

---

## 7. LLM Routing & Credits Economy

Helpotron integrates an intelligent, multi-model capability router in `server/llm.py`:

### Model Routing Strategy
- Tasks are routed dynamically based on student **Effort Level** (1–10) and task type (text, vision OCR, audio transcription, or reasoning).
- Primary models:
  - `google/gemini-3.1-flash-lite`: Ultra-fast, cost-efficient model for basic summaries, quiz generation, and audio transcription.
  - `qwen/qwen-2.5-72b-instruct`: Balanced instruction-following engine for drafting and study guides.
  - `google/gemini-3.7-flash` & `deepseek/deepseek-r1`: Flagship reasoning engines utilized for complex STEM problem decomposition, literature analysis, and deep Socratic tutoring.
- Prohibited model prefixes and paid-key safety guards are enforced to prevent unbudgeted upstream spend.

### Verified Subscription & Token Economics
Computed and verified deterministically via sandbox execution:

| Tier | Monthly Price | Monthly Task Tokens | Tool/API Value | Unit Token Cost | Features & Capabilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Free Trial** | **$0.00** | **100 tokens** | $1.00 compute | $0.0100 / token | 7-day starter access; SMS phone verification required (1 per number). |
| **Basic** | **$5.00** | **500 tokens** | $5.00 compute | $0.0100 / token | Core study tools, assignment tracking, flashcard decks, standard tutoring. |
| **Pro** *(Popular)* | **$15.00** | **1,500 tokens** | $15.00 compute | $0.0100 / token | Deep reasoning passes, audio lecture transcription, multi-agent solver. |
| **Elite** | **$30.00** | **3,000 tokens** | $30.00 compute | $0.0100 / token | High-capacity research, unlimited study packages, priority sidecar scraping. |

- **Task Token Equivalence**: 1 Task Token = 1 cent ($0.01) of tool or API compute cost.
- **Referral Rewards**: Active subscribers can generate unique 40-digit referral codes:
  - Inviter Reward: **50 credits** ($0.50 value)
  - Invitee Reward: **25 credits** ($0.25 value)
- **Data Lake Microcredits**: Students can anonymously share rubrics and study notes:
  - 1,000 Microcredits = 1 Standard Credit = $0.01
  - Maximum single-submission appraisal: **25 microcredits** ($0.00025)

---

## 8. Security Model & Architecture

Helpotron was engineered under a defense-in-depth security paradigm. Every release is audited via security sweeps documented in `sweep-reports/helpotron-sweep.md`.

- **Session Authentication & Instant Epoch Revocation**: Secure HTTP-only session cookies with PBKDF2 password hashing. Sessions store a `session_epoch`; when a user changes their password or clicks "Log out all devices", their epoch increments, instantly invalidating all existing session tokens.
- **Signed Double-Submit CSRF Defense**: State-changing endpoints require signed CSRF tokens generated via `server/csrf.py`. Bearer-authenticated API clients (e.g. extension, mobile) are safely exempted.
- **Two-Factor Authentication (2FA)**: Full TOTP implementation (`server/auth_2fa.py`) with secure QR codes and backup recovery codes. 2FA is required for sensitive operations and checkout flows.
- **Rate Limiting**: Sliding-window token-bucket rate limiter (`server/ratelimit.py`) preventing credential brute-forcing and API abuse.
- **Server-Side Request Forgery (SSRF) Protection**: `server/ssrf.py` rigorously validates every outbound URL before scraping, strictly blocking loopback addresses (`127.0.0.1`, `localhost`), internal private RFC1918 subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), AWS/cloud metadata services (`169.254.169.254`), and IPv6 equivalents.
- **In-Memory Budget Guard (`memguard.py`)**: Strict ceiling on file uploads and payload extraction to prevent denial-of-service via memory exhaustion.
- **Secrets Management**: Absolute prohibition against hardcoded secrets or API keys in source control; all credentials are loaded via environment variables (`SESSION_SECRET`, `CSRF_SECRET`, `OPENROUTER_API_KEY`).

---

## 9. Computational Math Sandbox

To guarantee mathematical truth and eliminate LLM hallucinations, Helpotron strictly implements **Bob's Standing Rule**:
> *"All non-trivial mathematical evaluations must be executed deterministically in a computational sandbox with runnable code artifacts."*

- **Sandbox Architecture (`server/math_executor.py` + `math_engine.py`)**:
  - Code execution is isolated using a restricted Python environment that strips dangerous built-ins (`__import__`, `open`, `eval`, `exec`, `os`, `sys`).
  - Evaluates algebraic equations, calculus derivatives, and statistical formulas with timeout constraints and memory caps.
  - Generates verifiable proof artifacts that are attached directly to the student's assignment workspace.

---

## 10. Credits, Billing & Honest Presentation

Helpotron adheres to a strict honesty rule across all user interfaces:
- **Zero Fabricated Claims**: No fake social proof, no fake user testimonials, no synthetic Stripe badges, and no misleading "1000 tokens/sec" counters.
- **Transparent Ledger**: Every credit deduction is recorded in the `credit_transactions` database table with the exact task name, timestamp, and resulting balance.
- **Prototype Checkout Notice**: In development and unconfigured environments, checkout options transparently display prototype mode notices rather than pretending to complete real banking transactions.

---

## 11. Browser Extension (Chrome MV3)

The Helpotron Chrome Extension (`extension/`) is built on **Chrome Manifest V3**:
- **Assignment Ingestion**: Extracts assignments, homework rubrics, and reading attachments from Google Classroom and Canvas LMS with a single click.
- **Version Tracking & Release Notes**: Incrementing the version in `extension/manifest.json` activates the internal `PRESET_RELEASE_NOTES` dictionary, rendering a "What's New" modal on update.
- **Chrome Web Store Compliance**: Reviewed and hardened against CWS requirements (see `extension/CWS_APPROVAL_REVIEW.md`). Operates with minimal permissions (`activeTab`, `storage`, `alarms`).
- **CDP Verification Recipe**: Validated in headless test runs using Chrome DevTools Protocol (`--remote-debugging-port`) for automated regression testing.

---

## 12. Web Scraping Sidecar

For web assignments on arbitrary URLs, Helpotron runs a dedicated scraping sidecar (`scrape_sidecar/`):
- **Isolation**: Runs Playwright and ScrapeGraphAI in an isolated process at `127.0.0.1:9778`.
- **Security Gatekeeper (`server/routes_import_url.py`)**: The primary FastAPI server acts as the trusted gatekeeper. It checks authentication, enforces SSRF validations, verifies the `IMPORT_FROM_URL_ENABLED` setting, and deducts appropriate task credits before calling `SIDECAR_URL`.
- **Pipeline Integration**: The scraped text and images are funneled through the standard `UniversalDumpItem` ingestion pipeline, seamlessly generating assignment bubbles.

---

## 13. Deployment & Production Operations

### Architecture
- **Web**: React Vite static build served via Nginx or FastAPI static files.
- **Server**: FastAPI running under `uvicorn` ASGI workers on port 8000.
- **Public Gateway**: Production traffic routed through a secure Cloudflare Tunnel (`cloudflared`) to `helpotron.dpdns.org`.

### Production Build & Launch
```bash
# 1. Build frontend production assets
cd web
npm run build

# 2. Launch FastAPI production ASGI server
cd ../server
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 --workers 4 --proxy-headers
```

---

## 14. Data Model (SQLAlchemy ORM)

All persistence is managed via SQLAlchemy 2.0 in `server/database.py`:

| Model Class | Table Name | Purpose |
| :--- | :--- | :--- |
| `User` | `users` | User accounts, credentials, tier, credit balance, and 2FA secrets. |
| `UserSession` | `user_sessions` | Active sessions with `session_epoch` revocation tokens. |
| `Assignment` | `assignments` | Academic assignments, subjects, due dates, status, and instructions. |
| `UniversalDumpItem` | `universal_dump_items` | Raw multimodal ingested items (audio, PDFs, images) pending routing. |
| `CreditTransaction`| `credit_transactions` | Double-entry ledger recording all credit debits, top-ups, and rewards. |
| `AgentChatThread` | `agent_chat_threads` | Conversation threads between students and their My Agent companion. |
| `AgentChatMessage` | `agent_chat_messages` | Individual chat messages, reasoning deltas, and tool outputs. |
| `AgentAction` | `agent_actions` | Action ledger recording agent state changes with 1-click rollback. |
| `AgentFile` | `agent_files` | Custom user files, study rubrics, and persona instructions. |
| `StudySession` | `study_sessions` | Study sessions tracking time spent and topic mastery. |
| `StudyMaterial` | `study_materials` | Generated flashcards, study guides, and practice tests. |
| `DataSubmission` | `data_submissions` | Anonymized data lake submissions with microcredit valuation records. |
| `Referral` | `referrals` | 40-character single-use referral codes and invitation tracking. |
| `StudyGroup` | `study_groups` | Collaborative peer study groups and shared resources. |
| `GroupMembership` | `group_memberships` | Student memberships and roles within study groups. |
| `Payment` | `payments` | Stripe and alternative checkout transaction records. |
| `UserSetting` | `user_settings` | Scoped student settings (tone, effort, personas, accessibility). |

---

## 15. Testing & Quality Assurance

Helpotron includes a comprehensive pytest suite in `server/tests/`:
- **Isolation Guarantee**: Tests must always run in development mode with an isolated SQLite database to protect user data:
  ```bash
  ENVIRONMENT=development DATABASE_URL="sqlite:///./test_helpotron.db" pytest server/tests/ -q
  ```
- **Frontend Verification**:
  ```bash
  cd web && npm run build
  ```
- **AST Integrity Checks**:
  ```bash
  python3 -c "import ast; [ast.parse(open(f).read()) for f in ['server/llm.py', 'server/agent_prompt.py', 'server/routes_overlord.py', 'server/payments.py']]"
  ```

---

## 16. Privacy, Ethics & Legal Compliance

- **Family Educational Rights and Privacy Act (FERPA)**: Student data is strictly tenant-partitioned and never shared between classrooms or organizations without explicit consent.
- **GDPR Article 17 ("Right to be Forgotten")**: The `/api/privacy/erase` endpoint performs complete, cascading erasure of student accounts, assignments, files, and chat logs.
- **Data Lake Anonymization**: All materials contributed to the Data Lake are irreversibly stripped of personally identifiable information (PII) before analysis.

---

## 17. Contribution & Branch Policy

- **Single Branch (`main`)**: All development occurs on the `main` branch.
- **Local Commits Only**: **NEVER push to remote origin or master without explicit operator authorization.** Commits are recorded locally and verified against the test suite prior to staging.
- **Conventional Commits**: Commits follow descriptive prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`).
