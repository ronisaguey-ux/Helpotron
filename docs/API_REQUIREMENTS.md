# 🔑 Helpotron API Requirements & Environment Configuration

This document outlines all external API keys, service integrations, credentials, and environment variables required to run Helpotron, along with setup instructions for each provider.

---

## 📋 Master Environment Variables Table

| Category | Variable Name | Purpose | Where to Obtain / Recommended Provider | Status / Default |
| :--- | :--- | :--- | :--- | :--- |
| **LLM & Inference** | `OMNIROUTE_API_BASE`<br>`OMNIROUTE_API_KEY` | DeepSeek V4 Flash routing & model failover | Local OmniRoute proxy (`localhost:20128`) | Pre-configured |
| **LLM & Inference** | `DEEPSEEK_API_KEY` | Direct DeepSeek API fallback | [platform.deepseek.com](https://platform.deepseek.com) | Optional Fallback |
| **Security & Auth** | `SESSION_SECRET` | Cookie session signing | Generate with `openssl rand -hex 32` | Required in prod |
| **Security & Auth** | `JWT_SECRET` | Authentication tokens | Generate with `openssl rand -hex 32` | Required |
| **Security & Auth** | `TOTP_SECRET` | Base32 secret for Authenticator apps | Base32 string (e.g. `JBSWY3DPEHPK3PXP`) | Auto-generated per user |
| **Email & Verification**| `EMAIL_HOST`<br>`EMAIL_PORT`<br>`EMAIL_USER`<br>`EMAIL_PASSWORD` | 6-digit email signup verification & Email 2FA | **Gmail**: App Passwords<br>**SendGrid**: `smtp.sendgrid.net` (port 587)<br>**Mailgun** / **AWS SES** | Graceful mock if unset |
| **Email & Verification**| `EMAIL_FROM`<br>`EMAIL_USE_TLS` | Sender display email and TLS toggle | Your domain email (e.g. `noreply@yourdomain.com`) | Default `true` |
| **SMS 2FA** | `TWILIO_ACCOUNT_SID`<br>`TWILIO_AUTH_TOKEN`<br>`TWILIO_PHONE_NUMBER` | 6-digit SMS 2FA code delivery | [twilio.com/console](https://www.twilio.com/console) | Optional backup |
| **AI Detectors** | `PANGRAM_API_KEY` | Pangram AI Evasion checking | [api.pangram.com](https://api.pangram.com) | Placeholder / Fallback |
| **AI Detectors** | `SAPLING_API_KEY` | Sapling AI Detector API | [sapling.ai/docs/api](https://sapling.ai/docs/api) | Placeholder / Fallback |
| **AI Detectors** | `ORIGINALITY_API_KEY` | Originality.ai Content scan | [app.originality.ai](https://app.originality.ai) | Placeholder / Fallback |
| **AI Detectors** | `COPYLEAKS_API_KEY`<br>`COPYLEAKS_EMAIL` | Copyleaks LMS/Education detector | [api.copyleaks.com](https://api.copyleaks.com) | Placeholder / Fallback |
| **AI Detectors** | `WINSTON_API_KEY` | Winston AI Content Detector | [app.gowinston.ai](https://app.gowinston.ai) | Placeholder / Fallback |
| **Payments** | `STRIPE_SECRET_KEY`<br>`STRIPE_WEBHOOK_SECRET` | Stripe card checkout | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com) | Manual offline fallback |
| **Telegram** | `TELEGRAM_BOT_TOKEN` | Instant assignment push & alerts | Telegram [@BotFather](https://t.me/BotFather) | Required for bot |

---

## 🔐 1. User Verification & 2FA Setup Guide

### A. Email Verification (15-Minute Expiration)
- **Flow**: When a user registers, a 6-digit numeric verification code is generated with a 15-minute TTL.
- **Provider Setup**:
  - **Option 1 (Gmail)**: Enable 2-Step Verification on your Google Account $\rightarrow$ Security $\rightarrow$ **App Passwords** $\rightarrow$ Generate 16-character password $\rightarrow$ set `EMAIL_USER=your_email@gmail.com`, `EMAIL_PASSWORD=xxxx xxxx xxxx xxxx`, `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`.
  - **Option 2 (SendGrid)**: Create an API key with Mail Send permissions $\rightarrow$ set `EMAIL_HOST=smtp.sendgrid.net`, `EMAIL_PORT=587`, `EMAIL_USER=apikey`, `EMAIL_PASSWORD=SG.your_key`.

---

### B. TOTP Authenticator 2FA (Google Authenticator, Authy, 1Password)
- **Flow**:
  1. Client calls `POST /api/auth/2fa/setup` with `method: "totp"`.
  2. Backend generates a Base32 secret and standard `otpauth://totp/Helpotron:user?secret=...` URI.
  3. User scans the QR code in Google Authenticator or Authy.
  4. User submits the rotating 6-digit code to `POST /api/auth/2fa/verify-setup` to activate.

---

### C. SMS 2FA (Twilio Backup)
- **Flow**:
  1. Client calls `POST /api/auth/2fa/setup` with `method: "sms"` and `phone_number: "+1..."`.
  2. Backend dispatches a 6-digit numeric code via Twilio Programmable Messaging API.
  3. User verifies the code via `POST /api/auth/2fa/verify-setup`.
- **Provider Setup**:
  - Sign up at [twilio.com](https://www.twilio.com).
  - Copy **Account SID** and **Auth Token** from your Twilio Console.
  - Buy a Twilio phone number with SMS capability and set `TWILIO_PHONE_NUMBER`.

---

## 🛡️ 2. AI Detectors Configuration

Configure the 5 multi-engine detector keys in `.env` for production stealth validation:

```bash
PANGRAM_API_KEY=your_pangram_key
SAPLING_API_KEY=your_sapling_key
ORIGINALITY_API_KEY=your_originality_key
COPYLEAKS_API_KEY=your_copyleaks_key
COPYLEAKS_EMAIL=your_copyleaks_email
WINSTON_API_KEY=your_winston_key
```

*(If unconfigured, Helpotron uses local heuristic burstiness and syntactic perplexity scoring without blocking execution)*.

---

## 🚀 Quick Setup Instructions

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your keys and secrets.
3. Start the backend:
   ```bash
   .venv/bin/uvicorn server.main:app --port 8000 --reload
   ```
