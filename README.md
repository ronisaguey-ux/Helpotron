# 🤖 Helpotron Automator

AI-powered **study tools** platform. It makes the material understandable — it
does not write assignments for you. Everything generated is built from your
own lecture transcripts and assignment prompts.

```
┌────────────────────────── USER LAYER ──────────────────────────┐
│  Browser extension   Telegram bot   Web dashboard   Recorder  │
└──────────────┬──────────────┬──────────────┬──────────────────┘
               └──────────────┼──────────────┘
                              ▼
┌───────────────────── CLOUD ORCHESTRATION ─────────────────────┐
│                     FastAPI backend                           │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Assignment│  │ Transcription│  │ Study-material        │    │
│  │ tracker   │──▶ (Whisper)    │──▶ generators           │    │
│  └───────────┘  └──────────────┘  │  guide / flashcards / │    │
│                                   │  practice test /      │    │
│                                   │  2-min summary        │    │
│                                   └──────────────────────┘    │
│  Credits · payments · data-discount · Telegram alerts         │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────── SELF-IMPROVEMENT PIPELINE ──────────────────┐
│        audit → cross-eval → execution (pipeline/run.py)       │
└────────────────────────────────────────────────────────────────┘
```

## Features

- **Assignment tracker** — the browser extension reads a Canvas assignment
  (title, due date, prompt, files) into your tracker with one click.
- **Browser collection agent** — hit **Activate Agent** in the extension and a
  DeepSeek agent runs 30 min–1 h inside your own Canvas tab (WebSocket bridge):
  it navigates, clicks, scrolls, and reads pages to gather the full prompt,
  rubric, file descriptions, and related module/lecture content, then saves the
  collection as a transcript (`source: agent`) the study generators can use.
  1 credit per session, **refunded automatically** if it ends with nothing
  collected. Capped at 120 steps / 1 hour; it never submits anything.
- **Lecture transcription** — record a lecture in the extension (or upload an
  audio file) and get a transcript. Whisper API or local faster-whisper.
- **Study guide** — key concepts, definitions, main arguments, sample exam
  questions, tuned to a chosen reading level (9th → sophomore).
- **Flashcards** — Q/A pairs for active recall (JSON for easy import).
- **Practice test** — MCQs with explanations + short answers with model answers.
- **2-minute summary** — the "read this before class" digest: thesis, key
  arguments, standout example, likely questions.
- **Telegram bot** — `/status /ready /summary /credits /pause /resume /admin`;
  alerts when materials are ready, warns at 80% credit usage.
- **Credits** — Basic $10/15cr, Pro $20/40cr, Elite $30/unlimited;
  pay-as-you-go top-ups; 1-credit-per-hour transcription, 0.5 per generation.
- **Data discount program** — opt-in anonymized data → 1% off per submission,
  20% max per purchase, spillover carries over.
- **Self-improvement pipeline** — `pipeline/run.py audit → cross-eval → execute`.

## Quickstart

```bash
# backend
python3 -m venv .venv            # (or: virtualenv .venv)
.venv/bin/pip install -r server/requirements.txt
cp .env.example .env             # set TELEGRAM_BOT_TOKEN, WHISPER_API_KEY…
.venv/bin/uvicorn server.main:app --port 8000

# telegram bot (separate process)
.venv/bin/python -m server.telegram_bot

# web dashboard
cd web && npm install && npm run dev     # http://localhost:5173

# tests
.venv/bin/python -m pytest server/tests/
```

**Browser extension**: chrome://extensions → Developer mode → Load unpacked →
`extension/`. Set your server URL + user id in the popup's Settings. Note:
Canvas runs at `*.instructure.com` — the content script only fires there.

**LLM**: all generation uses the local OmniRoute proxy
(`http://localhost:20128/api/v1`, OpenRouter-compatible) with
`deepseek-v4-flash-free` primary and fallback rotation. Point
`OMNIROUTE_API_BASE` elsewhere in `.env` if you want a different provider.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/assignments` | upsert a scraped assignment |
| `GET /api/status/{user}` | assignment statuses |
| `POST /api/transcribe` | audio upload → transcript (form: `public_id`, `file`) |
| `POST /api/agent/start` | start a browser agent session (charges 1 credit) |
| `GET /api/agent/{session_id}` | agent status snapshot |
| `WS /ws/agent/{session_id}` | extension↔agent command bridge |
| `POST /api/study-guide` · `/api/flashcards` · `/api/practice-test` · `/api/summary` | generate materials |
| `GET /api/materials/{user}/{kind}` | list generated materials |
| `GET /api/dashboard/{user}` | full dashboard payload |
| `GET /api/credits/{user}` | balance |
| `POST /api/payments` | top-up (stripe/cashapp/zelle/venmo/paypal) |
| `POST /api/refund` | 50%-of-unused pro-rata refund |
| `POST /api/discount` | data submission → discount % |
| `PATCH /api/users/{user}` | settings (reading level, tone) |

## Payments note

Stripe is wired for the real SDK when `STRIPE_SECRET_KEY` is set. Cash App /
Zelle / Venmo / PayPal record as **manual-offline** payments — the credit
grant is real, settlement happens outside the system until those APIs are
configured. No dark patterns: refunds are pro-rata 50% of unused value, no
punitive re-pricing.

## Self-improvement pipeline

```bash
.venv/bin/python pipeline/run.py audit        # 3 agents × 2 passes → findings.json
.venv/bin/python pipeline/run.py cross-eval   # adversarial verification → master_plan.md
.venv/bin/python pipeline/run.py execute      # confirmed findings → execution checklist
```

Sized small (semaphore 2, 6 LLM calls per cycle) so it never contends with
other workloads on the same box. Known limitation (2026-08-11): the free-tier
verifier over-rejects under load — confirmed findings are trustworthy, but
rejected ones deserve a human (or paid-model) second look.

## Roadmap

- [x] Backend + API + tests (live-verified end-to-end)
- [x] Browser extension (scrape + recorder)
- [x] Browser collection agent (extension Activate → LLM agent → transcript)
- [x] Telegram bot
- [x] Web dashboard (Vite + React + Tailwind)
- [x] Self-improvement pipeline
- [ ] VPS deploy (systemd units for uvicorn + bot, nginx, Let's Encrypt)
- [ ] Supabase swap (set `DATABASE_URL`)
- [ ] Stripe webhook for real capture
- [ ] Referral system
- [ ] More transcription backends (faster-whisper tuning)
