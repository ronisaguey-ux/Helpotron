# AI Detectors API Key Requirements & Configuration Guide

This document lists the required API keys for Helpotron's multi-engine AI detection evasion pipeline, where to obtain each key, and how to configure them in your environment.

---

## 🔑 Quick Reference Table

| Detector | Environment Variable | Portal / Key Dashboard | Header / Auth Method | Default Fallback |
| :--- | :--- | :--- | :--- | :--- |
| **Pangram** | `PANGRAM_API_KEY` | [api.pangram.com](https://api.pangram.com) | `x-api-key: <KEY>` | Enabled (Placeholder) |
| **Sapling** | `SAPLING_API_KEY` | [sapling.ai/docs/api](https://sapling.ai/docs/api) | `{"key": "<KEY>"}` in JSON | Enabled (Placeholder) |
| **Originality.ai** | `ORIGINALITY_API_KEY` | [app.originality.ai/api-keys](https://app.originality.ai) | `X-OAI-API-KEY: <KEY>` | Enabled (Placeholder) |
| **Copyleaks** | `COPYLEAKS_API_KEY` | [copyleaks.com/developers](https://api.copyleaks.com) | `Authorization: Bearer <KEY>` | Enabled (Placeholder) |
| **Copyleaks Email**| `COPYLEAKS_EMAIL` | [copyleaks.com/developers](https://api.copyleaks.com) | Account email for token auth | Optional |
| **Winston AI** | `WINSTON_API_KEY` | [app.gowinston.ai/api](https://app.gowinston.ai) | `Authorization: Bearer <KEY>` | Enabled (Placeholder) |

---

## 🛠️ How to Configure

1. Open your `.env` file in `/home/roni/Roni_workspace/helpotron/.env` (or copy from `.env.example`).
2. Add or replace your keys:

```bash
# AI Content Detectors
PANGRAM_API_KEY=your_pangram_api_key_here
SAPLING_API_KEY=your_sapling_api_key_here
ORIGINALITY_API_KEY=your_originality_ai_key_here
COPYLEAKS_API_KEY=your_copyleaks_api_key_here
COPYLEAKS_EMAIL=your_copyleaks_email_here
WINSTON_API_KEY=your_winston_ai_key_here
```

3. Restart the Helpotron server (`server/main.py`).

---

## 🛡️ Pipeline Integration Details

- **`server/config.py`**: Loads and exposes `config.pangram_api_key`, `config.sapling_api_key`, `config.originality_api_key`, `config.copyleaks_api_key`, and `config.winston_api_key`.
- **`server/detectors.py`**:
  - `PangramDetector`: Hits `https://api.pangram.com/v1/detect`.
  - `SaplingDetector`: Hits `https://api.sapling.ai/api/v1/aidetect`.
  - `OriginalityAIDetector`: Hits `https://api.originality.ai/api/v1/scan/ai`.
  - `CopyleaksDetector`: Hits `https://api.copyleaks.com/v3/education/submit`.
  - `WinstonAIDetector`: Hits `https://api.gowinston.ai/v2/ai-content-detection`.
- **Graceful Fallback**: If any API key is missing or unset, the detector safely bypasses the external call with a pass score so local development and offline testing never break.
