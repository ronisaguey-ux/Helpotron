# 🤖 Helpotron Automator

AI-powered **academic companion & assignment automation platform**. Built from lecture transcripts, Canvas assignment prompts, and student writing styles with continuous multi-engine AI detection evasion.

```
┌────────────────────────── USER LAYER ──────────────────────────┐
│  Stealth Extension   Telegram Bot   Web Dashboard   Recorder  │
└──────────────┬──────────────┬──────────────┬──────────────────┘
               └──────────────┼──────────────┘
                              ▼
┌───────────────────── CLOUD ORCHESTRATION ─────────────────────┐
│                     FastAPI backend                           │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Assignment│  │ Transcription│  │ Study-material        │    │
│  │ Tracker   │──▶ (Whisper)    │──▶ generators           │    │
│  └─────┬─────┘  └──────────────┘  │  guide / flashcards / │    │
│        │                          │  practice test /      │    │
│        ▼                          │  2-min summary        │    │
│  ┌──────────────────────┐         └──────────────────────┘    │
│  │ Sub-Agent Pipeline   │──▶ Multi-Engine AI Humanizer        │
│  │ Decomposition Engine │    (Perplexity & Burstiness Loop)   │
│  └──────────────────────┘    Pangram · Sapling · Originality  │
│                              Copyleaks · Winston AI           │
│  Credits · atomic rollback · Telegram direct document push    │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────── SELF-IMPROVEMENT PIPELINE ──────────────────┐
│        audit → cross-eval → execution (pipeline/run.py)       │
└────────────────────────────────────────────────────────────────┘
```

---

## 🌟 Core Features

### 1. 🛡️ Multi-Engine AI Detection Evasion & Perplexity Humanizer
- **8-Engine Detector Registry**: Evaluates submissions across **Pangram, Sapling, Originality.ai, Copyleaks, Winston AI**, Perplexity Cadence, and Statistical Burstiness.
- **Burstiness & Lexical Diversity Optimizer**: Synthesizes natural sentence length variance and vocabulary diversity to guarantee human classification thresholds.
- **Iterative Refinement Loop**: `/api/assignment/humanize` continuously mutates text cadence until passing stealth requirements.

### 2. 🤖 Sub-Agent Decomposition & Task Execution Engine
- **Rubric Decomposition**: Breaks complex multi-part assignments and grading rubrics into modular sub-tasks (argument synthesis, citation verification, body drafting).
- **Orchestrated Subagents**: Coordinates specialized agents to fulfill each rubric criterion before final compilation.

### 3. 🕵️ Canvas DOM Stealth Scraper & Anti-Telemetry Guard
- **MutationObserver Integration**: Observes Canvas DOM changes asynchronously without triggering aggressive polling or LMS telemetry flags.
- **Multi-LMS Domain Support**: Matches `*.instructure.com` and `canvas.*.edu` portals for assignment prompts, rubrics, and downloadable assets.

### 4. 📱 Telegram One-Click Direct Delivery & Document Push
- **Instant File Streaming**: Delivers completed deliverables (`.docx`, `.pdf`, `.zip`) directly to the student's linked Telegram chat upon clearing AI evasion checks.
- **Interactive Bot Commands**: `/status`, `/ready`, `/summary`, `/credits`, `/pause`, `/resume`, `/admin`.

### 5. 💳 Fail-Safe Credit Deduction & Atomic Transaction Rollback
- **Atomic Credit Safety**: Quotas are preserved with rollback closures—if an LLM call or evasion pass fails, credits are automatically refunded to the user's account.
- **Pricing Tiers**: Basic ($10/mo), Pro ($20/mo), Elite ($40/mo).

### 6. 📚 Comprehensive Study Generators & Analytics
- **Lecture Transcription**: Whisper API / local faster-whisper transcription.
- **Study Guides, Flashcards, Practice Tests & 2-Min Summaries**.
- **Analytics Dashboard, Study Groups & Referral Rewards**.

---

## 🚀 Quickstart

```bash
# 1. Backend Setup
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
cp .env.example .env             # configure keys (Telegram, OpenAI/Whisper, AI Detectors...)
.venv/bin/uvicorn server.main:app --port 8000 --reload

# 2. Telegram Bot (Separate Worker)
.venv/bin/python -m server.telegram_bot

# 3. Web Dashboard
cd web && npm install && npm run dev     # http://localhost:5173

# 4. Run Test Suite
.venv/bin/python -m pytest server/tests/
```

**Browser Extension**: Open `chrome://extensions` → Developer mode → **Load unpacked** → Select `extension/`.

---

## 📡 API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/assignments` | Upsert scraped assignment & rubric |
| `POST` | `/api/assignment/humanize` | Multi-engine humanizer & evasion loop |
| `POST` | `/api/agent/start` | Launch Canvas browser collection agent |
| `WS` | `/ws/agent/{session_id}` | Extension ↔ agent WebSocket bridge |
| `POST` | `/api/transcribe` | Audio file / lecture recording → transcript |
| `POST` | `/api/study-guide` | Generate reading-level tuned study guide |
| `POST` | `/api/flashcards` | Generate active recall flashcards |
| `POST` | `/api/practice-test` | Generate MCQ & short answer practice exam |
| `POST` | `/api/summary` | 2-minute "read before class" summary |
| `POST` | `/api/draft/generate` | Generate initial assignment draft |
| `POST` | `/api/draft/{id}/retry` | Regenerate draft with style tuning |
| `GET` | `/api/credits/{user}` | Check real-time credit balance |
| `POST` | `/api/payments` | Credit top-up (Stripe, Cash App, Zelle, PayPal) |
| `POST` | `/api/refund` | Pro-rata refund calculation |
| `GET` | `/api/analytics/dashboard` | User engagement & assignment stats |

---

## 🔑 AI Detector API Keys

Refer to [`docs/ai_detectors_api_requirements.md`](docs/ai_detectors_api_requirements.md) for full configuration details.

```bash
# Add to .env:
PANGRAM_API_KEY=your_key
SAPLING_API_KEY=your_key
ORIGINALITY_API_KEY=your_key
COPYLEAKS_API_KEY=your_key
COPYLEAKS_EMAIL=your_email
WINSTON_API_KEY=your_key
```

---

## 🔗 Companion Repositories & Toolchain

1. **[`drift-clean`](https://github.com/ronisaguey-ux/drift-clean.git)** — AI session sanitizer and drift interceptor.
2. **[`Insane-Custum-Claude-Settings`](https://github.com/ronisaguey-ux/Insane-Custum-Claude-Settings.git)** — Claude Code settings and security hooks.
3. **[`webchat-to-api-harness`](https://github.com/ronisaguey-ux/webchat-to-api-harness.git)** — Multi-provider webchat gateway with token interception.
