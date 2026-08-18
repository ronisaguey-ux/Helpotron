# Helpotron API Requirements & Configuration Guide

This document outlines all third-party API integrations, secret keys, pricing parameters, and configuration steps for running Helpotron with full multi-modal capabilities.

---

## 🔑 Key Directory & Environment Map

All environment variables should be defined in a `.env` file at the root of the Helpotron workspace (or injected via your deployment environment). Reference template: [`.env.example`](file:///.env.example).

| Environment Variable | Required / Optional | Service Provider | Primary Purpose & Usage |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Recommended** | Google AI Studio | Powers **Gemini 3.1 Flash-Lite** (Audio transcription & OCR) and **Gemini 3.7 Flash** (Deep reasoning). |
| `GEMINI_FLASH_LITE_MODEL` | Optional (default: `gemini-3.1-flash-lite`) | Google AI Studio | Economy model ($0.50/1M tokens) for transcription, OCR, initial drafting. |
| `GEMINI_FLASH_MODEL` | Optional (default: `gemini-3.7-flash`) | Google AI Studio | Flagship model ($2.50/1M tokens) for humanization, detector evasion, and grading. |
| `OPENAI_API_KEY` | Optional | OpenAI | Fallback for GPT models and embeddings. |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek | Fast reasoning fallback (`deepseek-v4-flash`). |
| `WHISPER_API_KEY` | Optional | OpenAI / OmniRoute | Whisper-1 audio transcription fallback if Gemini is offline. |
| `PANGRAM_API_KEY` | Optional | Pangram Labs | Multi-engine AI detector verification ($0.0020/call). |
| `SAPLING_API_KEY` | Optional | Sapling.ai | AI detector and grammatical integrity checks ($0.0015/call). |
| `ORIGINALITY_API_KEY` | Optional | Originality.ai | AI detector and plagiarism verification ($0.0030/call). |
| `COPYLEAKS_API_KEY` | Optional | Copyleaks | Enterprise academic detector verification ($0.0040/call). |
| `COPYLEAKS_EMAIL` | Optional | Copyleaks | Account email for Copyleaks token generation. |
| `WINSTON_API_KEY` | Optional | Winston AI | AI content detector verification ($0.0020/call). |
| `STRIPE_API_KEY` | Optional | Stripe | Public publishable key for client checkout widgets. |
| `STRIPE_SECRET_KEY` | Optional | Stripe | Backend API key for processing subscription and credit purchases. |
| `STRIPE_WEBHOOK_SECRET`| Optional | Stripe | Webhook signature secret for handling `invoice.paid` events. |
| `PAYPAL_CLIENT_ID` | Optional | PayPal Developer | Client ID for PayPal Smart Buttons payment gateway. |
| `PAYPAL_SECRET` | Optional | PayPal Developer | Secret key for executing PayPal order capture requests. |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram BotFather | Outbound notifications and multi-agent coordination. |
| `TELEGRAM_ADMIN_CHAT_ID`| Optional | Telegram | Destination chat ID for administrator alerts and approval requests. |
| `DATA_LAKE_DIR` | Optional (default: `./datalake_storage`) | Local Filesystem | Storage path for anonymized empirical rubrics and training samples. |
| `SESSION_SECRET` | **Required** (32+ chars) | Internal | Secret key used to sign and encrypt session cookies. |
| `JWT_SECRET` | **Required** (32+ chars) | Internal | Secret key used for signing JWT authorization tokens. |
| `TOTP_SECRET` | Optional | Internal | Base32 seed for administrative Two-Factor Authentication. |

---

## 🧠 Model Tiering & Effort Level Matrix

Helpotron employs dynamic, cost-aware model tiering driven by the user's **Effort Level (1–10)**:

```
+-----------------------------------------------------------------------------------+
| Effort Level | Selected Model         | Target Use Cases                          | Base Cost / 1M Tokens |
|--------------|------------------------|-------------------------------------------|-----------------------|
| 1 – 4 (Low)  | Gemini 3.1 Flash-Lite  | Lecture transcription, OCR, quick drafts  | $0.50 input / $1.50   |
| 5 – 7 (Med)  | Balanced (Lite + 3.7)  | Lite for drafting, 3.7 for humanization   | Blended               |
| 8 – 10 (High)| Gemini 3.7 Flash       | Deep synthesis, anti-detection evasion    | $2.50 input / $7.50   |
+-----------------------------------------------------------------------------------+
```

---

## 🛡️ Admin Cost Controls & Per-User Pricing

Administrators have access to the **Cost & Usage** panel within the Admin Dashboard:
1. **Per-User Multiplier**:
   - Default: `1.0x`
   - Testers: `0.5x`
   - Premium / High-Load: `1.5x` – `2.0x`
   - Effective user charge: `Base Cost * User Multiplier`
2. **Platform Profit Margins**:
   - Automatically tracks provider API expenses against subscription revenue and user token usage.
3. **Usage Logging**:
   - Every API invocation logs `user_id`, `tool_or_model`, `category`, `input_tokens`, `output_tokens`, and timestamp to `ApiUsageLog`.

---

## 📤 Universal Assignment Dump & Transcription Workflow

1. **User Drops File**: Supports PDF, DOCX, TXT, MD, MP3, WAV, M4A, FLAC, JPG, PNG, TIFF, MP4, MOV.
2. **Audio Processing**: Sent to Gemini 3.1 Flash-Lite producing structured Markdown with timestamps (`[MM:SS]`), speaker labels, and takeaway summaries.
3. **Image / Vision**: Scanned via Gemini 3.7 Flash OCR to extract rubrics and formulas.
4. **Overlord NLP Routing**: Automatically matches extracted text against active user assignments with a confidence score. If $\ge 60\%$, automatically pairs; otherwise queues for 1-click manual routing.

---

## 🚀 Setup Instructions

1. Obtain your Gemini API Key from [Google AI Studio](https://aistudio.google.com/).
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Set `GEMINI_API_KEY=your_actual_key_here`.
4. Start the backend:
   ```bash
   uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
   ```
5. Launch the frontend:
   ```bash
   cd web && npm run dev
   ```
