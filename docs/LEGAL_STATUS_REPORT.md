# 🏛️ Helpotron Institutional Legal Audit & Compliance Status Report

**Date:** August 31, 2026  
**Subject:** Full-Spectrum Privacy, Terms of Service, Consumer Protection & AI Governance Audit  
**Target Codebase:** `/home/roni/Roni_workspace/helpotron`  
**Governing Jurisdiction:** State of Louisiana, United States of America  

---

> [!IMPORTANT]
> **Legal Disclaimer:** This report, the accompanying Privacy Policy, and Terms of Service are drafted from exhaustive technical audits and regulatory research across GDPR, CCPA/CPRA, US State Privacy Laws, EU AI Act, TCPA/A2P 10DLC, FTC Act §5, FERPA, and contract law. They do not constitute formal legal counsel. A qualified attorney licensed in Louisiana should review final text prior to execution of binding investor or institutional agreements.

---

## 1. Executive Summary & Audit Baseline

An end-to-end technical analysis of Helpotron's codebase (`server/`, `web/src/`, `extension/`) was conducted to evaluate the platform's actual data processing against statutory privacy mandates and contractual exposure.

### Current Architecture Summary:
- **Backend:** FastAPI (Python 3.14 / Uvicorn) with SQLite WAL / SQLAlchemy ORM.
- **Frontend:** React 18, Vite 6, Tailwind CSS, Lucide icons, `@visx` charts.
- **Chrome Extension:** Manifest V3 extension extracting Canvas DOM / assignment context and injecting human-like keystroke pacing for accessibility.
- **Identity & Auth:** JWT tokens (`HS256`), password hashing (`scrypt`/`PBKDF2-HMAC-SHA256` with unique salts), Email Verification (SMTP), TOTP Authenticator apps (`pyotp`), SMS 2FA (`Twilio REST API`).
- **AI Model Pipeline:** Multi-model inference gateway via OpenRouter (`deepseek-v4-flash-vision`, `deepseek-v4-pro-vision`, `google/gemini-3.1-flash-lite`, `google/gemini-3.8-flash`, `qwen/qwen-2.5-72b-instruct`, `nvidia/nemotron-3-nano-30b-a3b`).
- **Data Ingestion & Extraction:** Canvas LMS course/assignment scraping, audio transcription, file uploads (`.pdf`, `.docx`, `.txt`, `.py`), universal dump items, user-curated study sets.
- **Monetization & Economy:** Stripe Checkout / Subscriptions, internal virtual microcredits ledger (`CreditTransaction`), referral bonus engine (`Referral`).
- **Telemetry & Logs:** Access log rotating buffer, API usage telemetry (`ApiUsageLog`), autonomous data lake feedback (`DataSubmission`).

---

## 2. Statutory Gap Analysis & Inaccuracies in Legacy Disclosures

| Area | Legacy Disclosure / Assumption | Actual Code Reality | Legal Risk & Statutory Exposure | Remediation Implemented |
|---|---|---|---|---|
| **FERPA Status** | Stated full "FERPA 34 CFR Part 99 Institutional Compliance" | Helpotron is a consumer-facing, direct-to-student app without formal Institutional LEA/School District Contracts (34 CFR § 99.31(a)(1)(i)). | Claiming statutory institutional FERPA compliance without school LEA contracts exposes the company to FTC § 5 deceptive marketing claims. | Re-framed as **Student Self-Service Study Assistant**; user warrants authority to upload study material. |
| **Data Retention** | "Zero-Data-Retention (ZDR) Standards" claimed in banner | Database stores assignments, transcripts, drafts, and dump items persistently across 22 tables. | False ZDR claim violates FTC Act § 5 and CPRA § 1798.100. | Replaced with explicit **16-Category Data Lifecycle & Retention Schedule** matching database schemas. |
| **Account Erasure** | Article 17 Erasure claimed | Delete endpoint `/user/account` existed in logic but was missing route registration in `server/privacy.py`. | Failed GDPR Art. 17 / CCPA § 1798.105 deletion rights. | Activated `@router.delete("/user/account")` cascading erasure across all 15 child tables. |
| **SMS 2FA / TCPA** | Phone numbers collected for 2FA & free trials without formal TCPA consent record | `server/auth_2fa.py` and `server/trial_service.py` dispatch SMS verification via Twilio without explicit opt-in checkbox logging. | TCPA statutory damages ($500–$1,500 per text) and Twilio A2P 10DLC carrier filtering. | Drafted explicit **TCPA A2P 10DLC 2FA Consent Clause** with STOP/HELP handling and non-marketing warranty. |
| **Virtual Credits** | Simple "Compute Credits" mention | Internal ledger issues credits for referrals, trials, and purchases. | Unclear virtual currency status risks state money transmission or gift card expiration laws (CARD Act / UCC). | Formatted as **Non-Refundable, Non-Transferable, Revocable Limited Software License** with $0 cash value. |
| **AI Disclaimers** | Informal "academic integrity" note | Platform generates synthesis, summaries, math execution, and humanized text. | Potential liability for AI hallucinations, academic honor code violations, and EU AI Act Art. 50 transparency. | Formatted comprehensive **EU AI Act Synthetic Content Disclosures**, no-advice disclaimers, and honor code indemnification. |
| **Arbitration & Venue** | Incomplete dispute clause | No formal class action waiver or AAA/JAMS arbitration rules specified. | Class litigation risk and unpredictable multi-state jurisdiction. | Drafted enforceable **Mandatory Binding Arbitration, Class Action Waiver, 30-Day Opt-Out, and Louisiana Choice of Law**. |

---

## 3. Comprehensive Data Category Inventory

### Granular Data Inventory & Retention Schedule:

| # | Data Category | Database Table / Storage | Data Elements Collected | Retention Schedule | Lawful Basis (GDPR Art. 6) |
|---|---|---|---|---|---|
| **1** | **Account Identity** | `users` | Public ID, Telegram ID (optional), role, creation timestamp | Duration of active account + 30 days post-deletion | Art. 6(1)(b) Contract Performance |
| **2** | **Authentication Credentials** | `users`, `user_sessions`, `password_resets` | Password hash (`scrypt`), cryptographic salt, active session JWTs, reset tokens | Hashes: Account lifetime. Sessions: 30 days. Resets: 15 minutes | Art. 6(1)(f) Legitimate Interests (Security) |
| **3** | **Two-Factor & Phone Verification** | `claimed_trial_phones`, In-Memory Store | E.164 formatted phone number, 6-digit OTP, TOTP secret (`pyotp`) | Trial phone hashes: 365 days (anti-abuse). OTPs: 15-minute TTL | Art. 6(1)(a) Consent / Art. 6(1)(f) Fraud Prevention |
| **4** | **Coursework & Assignments** | `assignments` | Canvas assignment ID, title, course name, due date, grade, rubric, raw HTML, extracted text | Duration of active account or user-initiated deletion | Art. 6(1)(b) Contract Performance |
| **5** | **Study Materials & Artifacts** | `study_materials`, `drafts` | Generated flashcards, summaries, quiz Q&As, writing drafts, Anki decks | Duration of active account or user-initiated deletion | Art. 6(1)(b) Contract Performance |
| **6** | **Audio & Lecture Transcripts** | `transcripts` | Audio file pointers, text transcriptions, AI lecture summaries, speaker labels | Duration of active account or user-initiated deletion | Art. 6(1)(b) Contract Performance |
| **7** | **AI Agent Interactions** | `agent_chat_threads`, `agent_chat_messages`, `agent_actions` | Chat history, system instructions, token consumption, autonomous tools triggered | 90 days rolling window or immediate account deletion | Art. 6(1)(b) Contract Performance |
| **8** | **Agent Customization Files** | `agent_files` | Custom skills, persona markdown, uploaded reference documents | Duration of active account or user-initiated deletion | Art. 6(1)(b) Contract Performance |
| **9** | **User Settings Cascade** | `user_settings`, `user_settings_scopes` | Hierarchical preference parameters across task/teacher/course levels | Duration of active account | Art. 6(1)(b) Contract Performance |
| **10** | **Billing & Transactions** | `payments`, `credit_transactions` | Stripe Checkout session ID, customer ID, subscription ID, amount cents, credit ledger entries | 7 years (statutory tax/accounting compliance) | Art. 6(1)(c) Legal Obligation |
| **11** | **Referral Tracking** | `referrals` | Referrer user ID, referee user ID, reward credit allocations, referral timestamps | 2 years post-referral completion | Art. 6(1)(f) Legitimate Interests |
| **12** | **Social Study Collaboration** | `study_groups`, `group_memberships`, `shared_materials` | Study group titles, member rosters, shared note references | Maintained while group is active; wiped upon account deletion | Art. 6(1)(b) Contract Performance |
| **13** | **Institutional Organizations** | `organizations` | School/team name, seat count, admin ID, domain settings | Duration of organization contract + 90 days | Art. 6(1)(b) Contract Performance |
| **14** | **Data Lake Contributions** | `data_submissions` | Opt-in anonymized assignment text, humanizer score feedback | Retained in pseudonymized form; wiped upon request | Art. 6(1)(a) Explicit Consent |
| **15** | **Browser Extension Context** | LocalStorage / `universal_dump_items` | Chrome tab URLs, DOM assignment nodes, keystroke pace preferences | Stored locally in browser; synced items deleted upon account erasure | Art. 6(1)(b) Contract Performance |
| **16** | **Security & Access Telemetry** | `api_usage_logs`, rotating disk logs | Client IP address (truncated), User-Agent, request endpoint, latency, error status | 30 days rolling automatic rotation | Art. 6(1)(f) Network Security |

---

## 4. Third-Party Subprocessor Directory & Cross-Border Transfers

| Subprocessor | Corporate Entity & Location | Processing Role | Data Shared | Transfer Mechanism |
|---|---|---|---|---|
| **OpenRouter** | OpenRouter, Inc. (California, USA) | AI Gateway & Inference Dispatch | Prompt text, coursework context, token caps | EU Standard Contractual Clauses (SCCs) / DPA |
| **DeepSeek AI** | DeepSeek Technology Co. (USA Gateway / Global) | Mathematical Reasoning & Code Execution | Anonymized math/coding prompt payloads | API Terms (Zero Training Mandate) / SCCs |
| **Google Cloud** | Google LLC (California, USA) | Audio Transcription & Vision Inference | Audio streams, image payloads for OCR | EU-US Data Privacy Framework / ISO 27001 |
| **Cloudflare** | Cloudflare, Inc. (California, USA) | CDN, DDoS Protection, WAF, Turnstile Captcha | IP address, browser headers, Turnstile tokens | EU-US Data Privacy Framework / SOC 2 Type II |
| **Twilio** | Twilio Inc. (California, USA) | SMS 2FA Authentication Delivery | E.164 formatted phone number, 6-digit OTP | Twilio Binding Corporate Rules (BCRs) / SCCs |
| **Stripe** | Stripe, Inc. (California, USA / Ireland) | Payment Gateway & Subscription Billing | Payment card metadata (tokenized), email, billing address | PCI-DSS Level 1 Service Provider / BCRs |

---

## 5. Prioritized Engineering Compliance Checklist

### 🟢 Priority 1: Statutory Core (Immediate / Completed)
1. **Self-Service Erasure Route (`DELETE /user/account`)**:
   - **Status:** **COMPLETE** ([`server/privacy.py`](file:///home/roni/Roni_workspace/helpotron/server/privacy.py)). Cascades across all 15 child tables.
2. **Circular Foreign Key Resolution**:
   - **Status:** **COMPLETE** ([`server/database.py`](file:///home/roni/Roni_workspace/helpotron/server/database.py)). Configured `use_alter=True` on `users.organization_id`.
3. **Database Test Suite Verification**:
   - **Status:** **COMPLETE**. Verified **33/33 tests passing**.

### 🟡 Priority 2: Data Subject Access & Portability (Target: 1 Week)
1. **Automated JSON/Zip Data Export Endpoint (`GET /api/v1/user/export`)**:
   - **Requirement:** GDPR Art. 20 / CCPA § 1798.130 data portability package containing all user assignments, study cards, transcripts, and transaction receipts in a password-protected zip file.
   - **Estimated Effort:** 4 hours.
2. **Explicit TCPA Consent Logging on Registration / 2FA Enrollment**:
   - **Requirement:** Store `sms_consent_timestamp` and `sms_consent_ip` in `users.settings` when a phone number is registered for 2FA.
   - **Estimated Effort:** 2 hours.

### 🔵 Priority 3: Governance & Lifecycle Automation (Target: 2 Weeks)
1. **Access Log & Telemetry Pruning Cron**:
   - **Requirement:** Automated daily cleanup script to purge `api_usage_logs` and raw access files older than 30 days.
   - **Estimated Effort:** 2 hours.
2. **Cookie & Local Storage Preferences Banner**:
   - **Requirement:** Refine frontend cookie modal to allow explicit toggling of non-essential analytical storage.
   - **Estimated Effort:** 3 hours.
