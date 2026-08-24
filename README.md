# Helpotron — Autonomous Multi-Agent Academic Orchestration Platform

![Helpotron Platform](https://img.shields.io/badge/Helpotron-v1.0.0-blue?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python)
![Tests](https://img.shields.io/badge/Tests-121%20Passed-emerald?style=for-the-badge)

---

## 🌟 Executive Overview

**Helpotron** is an AI-native academic productivity and study operating system centered around the user's personal, configurable AI agent (**My Agent**).

Helpotron eliminates repetitive busywork and optimizes study efficiency through:
- **Centralized Capability-Based Model Router**: Intelligent multi-model router in `server/llm.py` dynamically mapping tasks to ultra-cost-efficient workers (`nemotron`, `qwen-2.5-72b`, `mistral-nemo`), vision models (`deepseek-v4-flash-vision`, `deepseek-v4-pro-vision`), and flagship reasoning models (`deepseek-r1`, `gemini-3.7-flash`).
- **Pure Effort-Based Abstraction**: Zero model pickers in normal UI — users configure Effort (Low, Medium, Advanced, Auto-Routing).
- **Unified My Agent Control Plane**: Single canonical agent assistant managing settings, assignments, contextual study tools, and memories with an immutable Action Ledger & 1-Click Undo.
- **Universal Scoped Settings**: Deterministic 6-tier configuration hierarchy (Global → Subject → Class → Teacher → Assignment → Task) with Effective Configuration Inspector.
- **Signature Assignment Workspace**: Visible subagent team telemetry (`Researcher`, `Analyst`, `Reviewer`), real-time progress bars, interactive task DAGs, and contextual study tools (FSRS v5 Spaced Repetition, Anki 2.1 exporter).
- **Solo-Developer Mission Control**: Rebuilt Admin Command Center with 6-domain IA, 3-mode System Map (Overview, Live, Investigate), Developer Intelligence, and AI Economics telemetry (`/api/admin/ai-economics`).
- **Universal Material Ingestion (Assignment Dump)**: Drag-and-drop ingestion of documents, audio lectures, whiteboard photos, and videos with autonomous AI assignment routing.
- **Multi-Engine AI Integrity Suite**: Cross-verification against 5 commercial AI detectors (Pangram, Sapling, Originality.ai, Copyleaks, Winston AI).
- **Empirical Data Lake & Micro-Credits**: Anonymized peer rubric contributions rewarded with spendable platform credits (0–25 cr).
- **Single-Use 40-Digit Referral Engine**: Cryptographically secure referral codes for active subscribers (+50 cr / referral).
- **Mandatory 2FA Purchase Protection & GDPR Erasure**: Two-factor authenticated checkout for subscriptions and top-ups, plus GDPR Article 17 cascading account erasure.


---

## 🏛️ System Architecture

```
                                  ┌─────────────────────────────────────────┐
                                  │           React 19 Frontend             │
                                  │      (Vite + Tailwind + Lucide)         │
                                  └────────────────────┬────────────────────┘
                                                       │  REST / JSON
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │          FastAPI Server Core            │
                                  │          (Python 3.11+ / ASGI)          │
                                  └──────┬─────────────┬─────────────┬──────┘
                                         │             │             │
                    ┌────────────────────┴─────┐       │       ┌─────┴───────────────────┐
                    ▼                          ▼       │       ▼                         ▼
         ┌─────────────────────┐    ┌────────────────┐ │ ┌──────────────┐     ┌──────────────────┐
         │ Universal Dump Eng. │    │ Overlord Agent │ │ │ Cost Engine  │     │ Data Lake Agent  │
         │ - Gemini 3.1 Audio  │    │ - Rubric Match │ │ │ - User Mult. │     │ - Auto Appraisal │
         │ - Gemini 3.7 Vision │    │ - Sub-Sandboxes│ │ │ - Margins    │     │ - Micro-Credits  │
         └─────────────────────┘    └────────────────┘ │ └──────────────┘     └──────────────────┘
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │     SQLAlchemy ORM + SQLite/Postgres    │
                                  └─────────────────────────────────────────┘
```

---

## 💳 Subscription Plans, Pricing & Business Economics

### Feature Equality Guarantee
> 💡 **All features, multi-agent tools, audio transcription engines, vision OCR, and AI detectors are 100% unlocked on all plans.**
> Subscription tiers differ exclusively by **monthly token compute capacity**, giving every student access to the complete suite.

### Plan Matrix & Profit Margins (Internal Specification)

| Subscription Tier | Monthly Price | Annual Price | Monthly Task Tokens | Standard LLM Tokens | Target Profit Margin | Provider API Budget | Target Use Profile |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Basic** | **$10 / mo** | $100 / yr | **500 Tokens** | **~3,000,000 Tokens** | **70% Margin** ($7.00 profit) | **$3.00 / month** | Standard homework, 5 hrs audio transcription, flashcards & rubric extraction |
| **Pro** (Most Popular)| **$20 / mo** | $200 / yr | **2,000 Tokens** | **~12,000,000 Tokens** | **50% Margin** ($10.00 profit) | **$10.00 / month** | Heavy multimodal labs, 25 hrs audio transcription, multi-pass detector evasion |
| **Elite** | **$40 / mo** | $400 / yr | **6,000 Tokens** | **~40,000,000 Tokens** | **30% Margin** ($12.00 profit) | **$28.00 / month** | Power researchers, 80 hrs audio transcription, unlimited Gemini 3.7 Flash deep passes |

*Note: Profit margin percentages are maintained strictly for platform operations and administrative cost analytics; they are not displayed on user-facing pricing cards.*

---

## 🧠 Model Tiering & Effort Level Matrix

Helpotron dynamically routes tasks based on the user's configured **Effort Level (1–10)** in Settings:

```
+-----------------------------------------------------------------------------------------------+
| Effort Level | Selected Model         | Target Capabilities                       | Base Cost |
|--------------|------------------------|-------------------------------------------|-----------|
| 1 – 4 (Low)  | Gemini 3.1 Flash-Lite  | Audio transcription, OCR, rapid drafting  | $0.50/1M  |
| 5 – 7 (Med)  | Balanced (Lite + 3.7)  | Lite for ingestion, 3.7 for humanization  | Blended   |
| 8 – 10 (High)| Gemini 3.7 Flash       | Deep cognitive reasoning & 5-detector pass| $2.50/1M  |
+-----------------------------------------------------------------------------------------------+
```

---

## 🛡️ Core Capabilities & Modules

### 1. 📤 Universal Assignment Dump & Overlord AI Routing
- Accepts any file format: PDF, DOCX, TXT, MD, MP3, WAV, M4A, FLAC, JPG, PNG, TIFF, MP4, MOV.
- Integrated Web Audio API direct in-browser lecture recorder.
- **Overlord Semantic NLP Matching**: Analyzes extracted text and matches against active assignments with confidence scoring ($\ge 60\%$ auto-linked, with 1-click manual override).

### 2. 🎙️ Gemini 3.1 Flash-Lite Audio Transcription
- Converts raw classroom audio/video lectures into clean, formatted Markdown.
- Automatically inserts timestamps `[MM:SS]`, detects speaker changes, builds section headers (`## Key Concepts`), and compiles bulleted `### Core Takeaways`.

### 3. 🔍 AI Detector Multi-Engine Integrity Suite
- Simultaneously checks coursework across 5 commercial AI detectors:
  1. **Pangram Cadence** ($0.0020/call)
  2. **Sapling Academic** ($0.0015/call)
  3. **Originality.ai 3.0** ($0.0030/call)
  4. **Copyleaks Enterprise** ($0.0040/call)
  5. **Winston AI** ($0.0020/call)
- Generates evasion heatmaps and automated sentence-level humanization rewrites.

### 4. 🗄️ Empirical Data Lake & Micro-Credits
- Anonymous pool for teacher quirks, grading rubrics, exam guidelines, and feedback.
- Autonomous subagent appraises submissions with an **Estimated Score (0–25 cr)** without premature balance inflation.
- Credits are awarded as spendable balance upon official verification and pipeline ingestion.

### 5. 🎟️ 40-Digit Single-Use Referral Engine
- Cryptographically random 40-digit single-use codes (e.g., `HLP-4A9B...`).
- Issuing restricted to active subscribers to protect against abuse.
- Single-use validation awards $+50\text{ cr}$ discount credit to the issuing account upon redemption.

### 6. 🔐 Mandatory 2FA Purchase Protection
- Requires verification (Email or SMS TOTP code + password) for all plan purchases and credit top-ups.
- Prevents accidental charges and unauthorized account modifications.

### 7. 📊 PowerPoint & Google Slides Pure-Gemini Engine
- Automatically detects presentation assignments (from Canvas data dumps, `.pptx`, `.ppt`, `.gslides`, pitch decks).
- **Nemotron & DeepSeek Subagent Bypass**: Bypasses general LLM subagents and routes tasks exclusively to Google Gemini.
- **Configurable Model Distribution Slider**: User configures the exact percentage ratio between **Gemini 3.1 Flash-Lite** (slide outlines, topic ingestion, speaker notes) and **Gemini 3.7 Flash** (visual layout instructions, cognitive narrative flow, design consistency).

### 8. ⌨️ Fake Writing History & Typing Cadence Replay
- Generates realistic keystroke timelines, typing intervals (30–120 WPM), and incremental version snapshots (3–20 revisions).
- Eliminates copy-paste audit flags by creating an authentic Google Docs / Canvas LMS revision trail with natural thinking pauses.

### 9. 💰 Admin Cost Controls & Per-User Token Multipliers
- Admin "Cost & Usage" panel displaying total API costs, model breakdown, 7-day trends, top-cost users, and profit margins.
- Ability to set custom per-user token multipliers ($0.5\times$ for testers, $1.0\times$ default, $1.5\times$ premium, $2.0\times$ heavy usage).

---

## 🔑 Environment Variables & API Key Directory

Create a `.env` file in the root directory (see [`.env.example`](file:///.env.example)):

```bash
# Server & Origin
PORT=8000
WEB_ORIGIN=http://localhost:5173
PRODUCTION_MODE=false
ADMIN_PUBLIC_ID=RoniDev

# Google Gemini & LLMs
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_FLASH_LITE_MODEL=gemini-3.1-flash-lite
GEMINI_FLASH_MODEL=gemini-3.7-flash
PRIMARY_MODEL=deepseek-v4-flash
OPENAI_API_KEY=your_openai_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Audio Transcription
WHISPER_API_KEY=your_whisper_api_key_here

# AI Detectors
PANGRAM_API_KEY=your_pangram_api_key_here
SAPLING_API_KEY=your_sapling_api_key_here
ORIGINALITY_API_KEY=your_originality_api_key_here
COPYLEAKS_API_KEY=your_copyleaks_api_key_here
COPYLEAKS_EMAIL=your_copyleaks_email_here
WINSTON_API_KEY=your_winston_api_key_here

# Payments (Stripe & PayPal)
STRIPE_API_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret

# Security & 2FA
SESSION_SECRET=helpotron_super_secret_session_key_min_32_chars
JWT_SECRET=helpotron_super_secret_jwt_signing_key_min_32_chars
TOTP_SECRET=JBSWY3DPEHPK3PXP

# Telegram Notifications
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ADMIN_CHAT_ID=your_telegram_chat_id
```

---

## 🗃️ Database Schema Overview

The database uses SQLite (or PostgreSQL in production) via SQLAlchemy ORM:
- **`users`**: User identity, plan tier (`basic`, `pro`, `elite`), credit balance, `token_cost_multiplier`, `monthly_budget_usd`, `default_effort_level`, and TOTP secrets.
- **`assignments`**: Coursework items, titles, prompts, teacher quirks, due dates, statuses, and multi-agent progress states.
- **`study_materials`**: Flashcards, practice tests, study guides, and summaries generated from coursework.
- **`api_usage_logs`**: Ledger recording every LLM call, audio transcription, vision OCR, and detector run with token counts, base cost, user multiplier, and charged cost.
- **`universal_dump_items`**: Uploaded dump files, extracted markdown transcripts, OCR text, and Overlord auto-routing links.
- **`data_lake_entries`**: Empirical rubrics, submission notes, subagent classifications, and estimated vs awarded micro-credits.
- **`referral_codes`**: 40-digit randomized single-use referral codes, owner IDs, redemption statuses, and referee links.
- **`admin_messages`**: Encrypted user inquiries and admin direct replies.
- **`purchase_2fa_challenges`**: Short-lived OTP codes for checkout validation.

---

## 🚀 Installation & Quickstart

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- FFmpeg (for local audio processing)

### 2. Backend Setup
```bash
# Clone the repository
git clone https://github.com/ronisaguey-ux/Helpotron.git
cd Helpotron

# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r server/requirements.txt

# Configure environment
cp .env.example .env

# Launch FastAPI backend server
.venv/bin/uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup
```bash
# Navigate to web directory
cd web

# Install frontend dependencies
npm install

# Start Vite development server
npm run dev

# Or build production bundle
npm run build
```

---

## 🧪 Testing Suite

Run the comprehensive pytest suite covering all 87 tests:

```bash
# Run all unit tests
.venv/bin/pytest server/tests/

# Run specific test modules
.venv/bin/pytest server/tests/test_cost_dump_transcription.py
.venv/bin/pytest server/tests/test_referrals_and_admin_portal.py
.venv/bin/pytest server/tests/test_datalake.py
```

---

## 🛰️ Multi-Agent Coordination & Communication Rules

Helpotron integrates multiple autonomous agents with enforced communication standards:
- **Telegram Outbound Aliases**:
  - `agy: ` — Antigravity Agent
  - `main: ` — Claude Code Orchestrator
  - `webchat: ` — DeepSeek Webchat Gateway
- **Drift Self-Healing**:
  - `/clean` — Refusal scrubbing & session restoration
  - `/autoclean` — Continuous background drift daemon
  - `/cleanreframe` — Dynamic context rotation and prompt refinement

---

## 📄 License & Compliance

Helpotron is distributed under the MIT License. All student data ingested into the Data Lake is anonymized prior to indexing. Full privacy disclosures are accessible via the in-app Privacy Policy view.
