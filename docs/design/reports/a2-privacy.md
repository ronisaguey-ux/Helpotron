# A2 — Privacy Policy: Research Facts, Content Delivered, Stitch Regeneration Spec

## 1. Fact sheet — actual data practices, verified from code

### Accounts & auth
- Signup = username (public_id) + password + optional Cloudflare Turnstile token. NO email at signup (web/src/api.js:295,299; server/main.py signup).
- Passwords: salted PBKDF2-SHA256, 100,000 iterations (server/security.py:104,110). JWT = 24 h (security.py:42). DB-backed session + cookie `helpotron_session`: 7-day expiry, HttpOnly, SameSite=Lax, Secure when https, CSRF cookie `csrf_token` (security.py:216,224; main.py:971-982). Login response also returns a long-lived `session_token` the extension stores (main.py:990-996).
- Optional: TOTP secret (app 2FA), phone number for SMS 2FA (users.phone_number, database.py:83), Telegram ID (database.py:61).

### Data stored server-side (SQLite, helpotron.db)
- Tables (server/database.py): users, user_sessions, organizations, assignments, agent_actions, agent_files, transcripts, user_settings_scopes/user_settings, study_materials, credit_transactions, payments, moderation_items, data_submissions, drafts, referrals, study_sessions, agent_chat_threads, agent_chat_messages, study_groups, group_memberships, shared_materials, admin_messages, admin_notices, extension_releases, password_resets, api_usage_logs, universal_dump_items, claimed_trial_phones.
- ClaimedTrialPhone rows: phone_hash (SHA-256), phone_masked, user_id, claimed_at, ip_address (database.py:591-598; trial_service.py:55-58,169-171).
- Uploads on disk: uploads/ dir — agent files (agent_files.py:19), assignment dumps (assignment_dump.py:80), avatars, transcripts (transcription.py:28).

### LLM providers — honest answer
- Only ONE real outbound inference call: https://openrouter.ai/api/v1/chat/completions with OPENROUTER_API_KEY (server/llm.py:314,366,533,579). Model roster = DeepSeek (deepseek/deepseek-v4.1-flash), Google Gemini (google/gemini-3.1-flash-lite, gemini-3.8-flash), Nvidia Nemotron, Qwen (llm.py:31-58). Anthropic/Claude/OpenAI/GPT are PROHIBITED (llm.py:45-47).
- GEMINI_API_KEY and DEEPSEEK_API_KEY exist in config.py:55-61 but NO code calls api.deepseek.com or Google directly; transcription is Gemini audio model via OpenRouter (transcription.py:64-101, hard-fails without OPENROUTER_API_KEY).
- Local fallback lanes localhost:8080/8085 only if OpenRouter is down (llm.py:21-25,408-409).
- Screen frames (extension "See screen"): one base64 JPEG ≤1280 px + viewport (routes_extension.py:369-379); VISION_MODEL = deepseek/deepseek-v4.1-flash (screen_vision.py:34).

### Payments — honest answer
- payments.py:17 SUPPORTED_PROVIDERS = {stripe, cashapp, zelle, venmo, paypal}. Stripe Checkout subscriptions used when stripe_secret_key + webhook secret configured (payments.py:29-71); stores stripe_customer_id/subscription_id, webhook grants plan credits + referral rewards (payments.py:74+). Card numbers never on our servers. Manual providers recorded as provider_ref.

### Export / delete — they exist and work
- Export All: GET /api/user/data/export-all → full JSON (settings, custom subjects/bubbles/styles, trio rules, permissions, generated materials, assignment history, datalake contributions) — routes_user_settings.py:468-532.
- Delete account: DELETE /api/user/account (also /api/user/account) — one transaction wiping 15 child tables + user row (privacy.py:42-105).
- Soft reset: POST /api/user/data/soft-reset (settings→defaults, stage archiving, nothing deleted) — routes_user_settings.py:535-592.
- Permanent delete request: ticket-based dispatch, requires typing "DELETE PERMANENTLY" (routes_user_settings.py:595+).
- Assignments/bubbles JSON export + Anki/Quizlet (api.js:524-567; routes_export.py).

### Browser storage (web app)
- localStorage: token (api.js:181), public_id + helpotron_public_id (api.js:26-33), helpotron_csrf_token (api.js:73,91), helpotron_server (api.js:8,22), helpotron_os_settings_v1 (demoData.js:297,345,356), helpotron_terms_accepted_v2 (App.jsx:321,507), helpotron_signup_consent, helpotron.agent.custom_skills/custom_identities/active_skill_ids/active_identity_id. sessionStorage only chunk-retry flags (App.jsx:37,101).
- Settings are mirrored to the server via api.updateSettings PATCH /api/user/settings (SettingsSections.jsx:64-65; api.js:386).

### Extension (manifest.json v2.6.0)
- Permissions: storage, activeTab, tabs, scripting, alarms, tabCapture, desktopCapture, notifications; optional: debugger (manifest.json:12-24). Host perms: LMS/Google/Notion/Microsoft sites + helpotron.dpdns.org + localhost (manifest.json:25-42).
- Captures: user-initiated scrape → server (URL/title/prompt/rubric/file links+SHA-256, bytes ≤6 MB each ≤25 files); optional course crawl (robots.txt respecting); recorder.html/recorder.js = microphone getUserMedia → audio/webm upload to /api/transcribe (recorder.js:1-2,66,85,110); agent chat with See-screen frames /api/extension/agent_chat; endpoints used: /api/extension/agent_chat(+history), /api/extension/vision, /api/extension/version, /api/transcribe, /api/dump/upload, /api/assignments, /api/agent/* (extension background/agent_mode/recorder).
- Extension storage: chrome.storage.local = server URL, public_id, session_token, token, recent-chat mirror (options.js:28,33,92 — cleared on sign-out); chrome.storage.sync = ext_theme + ext_accent ONLY (options.js:9-12).
- Assistive typing locally dispatches keystrokes; password/OTP/card fields never read, keystrokes never transmitted (manifest is the basis: no clipboardRead; verified content.js dispatch pattern).

### What leaves the machine / other third parties
- Cloudflare: tunnel helpotron.dpdns.org (start_stack.sh:35-37,48) + Turnstile siteverify (captcha.py:19,38-48).
- Twilio SMS 2FA: phone + code → api.twilio.com; +1555/unconfigured = mock (auth_2fa.py:149-190; config.py:109-117). Recovery channels EMAIL/PHONE/DEV — email via SMTP stub (mailer.py:24 is a placeholder; recovery.py:1-19), DEV pings operator's Telegram.
- Telegram: only if user links their own bot token (telegram_agent_link.py:34) or platform bot (telegram_bot.py:26) — traffic to api.telegram.org.
- Google Docs: LaunchToDoc = server returns text payload (routes_overlord.py:340) → extension types it into the user's OWN Google Doc locally (LaunchToDocModal.jsx:197-198 postMessage bridge). Never pushed by our server to Google.
- Canvas: access token used per-request only, not persisted (canvas_sync.py:27-29).

### Telemetry / logs — honest
- Data lake: anonymized telemetry (assignment_evasion, gdocs_export etc., log_telemetry) with PII scrubbed via scrub_pii/anonymize_student_submission and user_id→hashed (datalake.py:40-53,56-73,110-131). monitors.py:7 telemetry has "user ids, no raw payloads, no IPs". Feedback + microcredit submissions are opt-in, deletable.
- Access logs: rotating files data/logs/ via uvicorn handlers (access_log.py:45,83-120) — request line with client IP as seen behind the tunnel; server.log/ad hoc stdout copies exist.
- Privacy UI flags (privacy.analytics/dataLake/anonymous in demoData.js:327) are NOT enforced server-side — grep found no consumer. The new policy does NOT claim a working toggle.

### Claims REMOVED as false/unverifiable (old policy said)
- "OpenRouter/DeepSeek/Google Zero Data Retention / Zero Training Guarantee" (not verifiable in code) → replaced by provider-role statements.
- "90-day rolling chat window" (no such pruning exists) → "kept until account deletion".
- "AES-256 encryption at rest" (no evidence) → honest "no claim of at-rest encryption".
- "Twilio BCRs / PCI-DSS / ISO 27001 / EU-US DPF" vendor legal claims → dropped.
- Entity "Helpotron, LLC (Louisiana)" / "Helpotron Academic Companion Inc." — unverifiable, policy now just says Helpotron.
- "Whisper API" removal: no whisper server call found; transcription = Gemini via OpenRouter.
- "Adobe-like 16-category GDPR inventory" with fake lawful-basis labels → replaced with plain-English category table.

## 2. What I wrote

- /home/roni/Roni_workspace/helpotron/web/src/PrivacyPolicy.jsx — fully rewritten, same default export signature (now `{ onBack, onAgree }`; onAgree accepted-but-unused exactly as before — the real consent buttons live in PrivacyPolicyModal.jsx; onBack still renders the "Back to Dashboard" button). Six tabs: (1) What we collect — searchable 12-row plain-English table with real categories and honest retention; (2) AI & third parties — complete provider table + "what stays on your machine" panel; (3) Storage & retention — server vs browser storage, honest timeline; (4) Your rights — Export/Delete/Soft-reset/DSR cards; (5) Kids & schools — COPPA 13+ and FERPA honest framing; (6) Security & contact — TLS-via-tunnel, PBKDF2, HttpOnly/Lax cookie, honest at-rest statement, breach + change clauses. No images (icons only), no better-design MCP used, plain English only.
- /home/roni/Roni_workspace/helpotron/PRIVACY_POLICY.md — rewritten, mirroring the six sections. NOTE: the route actually serves the repo-root file, not server/PRIVACY_POLICY.md (routes_extension.py:300-301 `_DOC_ROOT = BASE_DIR.parent if (BASE_DIR.parent / 'PRIVACY_POLICY.md').exists() else BASE_DIR` with BASE_DIR = repo root from config.py:10, and the path read at :336). server/PRIVACY_POLICY.md does not exist; creating it would be dead content. Root file updated so /privacy-policy keeps working; verified the server's crude markdown renderer (handles only #/<h1>, ##/<h2>, -/li, html-escapes everything) produces a clean page from the new file (simulated: 1 h1, 6 h2, 39 li). Markdown emphasis/backticks stripped so ** appears as plain text on the served page.

## 3. Contribution to the Stitch regeneration spec — Privacy page

How the page should READ and LOOK when regenerated in Stitch:

- Voice: plain English the whole way. Banned: GDPR article cites in body copy (keep one line "rights under GDPR and US state law" — no Art. numbers), faux-legal weaponized nouns, category codes (CAT-0x) as user-facing labels. Layout shape: 1-liner summary at top ("we store it, we use it, you can delete it") → expandable sections, NOT a legal wall.
- Structure (6 sections, matching the underlying component so regeneration keeps parity):
  1. What we collect & why — first tab. Design: 12 accordion rows (category / what / how long / why) instead of a wide table — table has horizontal scroll issues at 390 px. Search filter stays but becomes a "Find a field?" input pinned above the list.
  2. AI & third parties — provider cards (not table) with icon per provider (OpenRouter, Cloudflare, Stripe, Twilio, Google, Telegram, your school's LMS): logomark, one-line role, expandable "what they receive". A highlighted card "What stays on your machine" (assistive typing = local keystrokes; theme/accent sync only).
  3. Storage & retention — two "where" tiles (On our server / In your browser) + retention timeline as a visual (buttons 24h / 7d / until you delete).
  4. Your rights — action-first: two big primary buttons "Export my data" and "Delete my account" (both wired to real endpoints) with microcopy beneath; a "more rights" grid for access/correction/reset/formal requests.
  5. Kids & schools — two cards (COPPA 13+, FERPA) + academic-integrity note card.
  6. Security & contact — checklist card + contact row (privacy@helpotron.com) + version/date footer.
- Mobile (390 px): sticky section tabs as horizontal pills; accordions as bottom-sheet-expandable cards (full-width, 16 dp radius); the old wide data table DISAPPEARS on mobile (strongest fix — it forced horizontal scroll over 5 columns). No table on mobile at all: convert to stacked accordion. The two big action buttons become full-width, stacked, top of section 4. Footer: last-reviewed date + "also available at /privacy-policy".
- Design language consistency with the rest of the redesign: dark glass surfaces (--bg-surface-elevated), indigo accent for interactive items, emerald/amber accent only for status meaning (emerald = rights/secure, amber = warnings like integrity note). Icon system: lucide, 16-18 px stroke-2, used as section markers only. Typography: header 32-36 px bold tracking-tight; body 13-15 px at 1.6 line-height; data elements mono 11-12 px. Max content width 1080 px, generous 32-40 px vertical rhythm. No gradients as backgrounds (avoid AI-slop look), no stock people images — none used.
- Copy framing note for the designer: the page must never promise more than the code does (no "zero retention", no "AES-256 at rest", no vendor-compliance badges); if a future design wants badges, they must be sourced from the policy's provider table only.

## 4. Files changed
- /home/roni/Roni_workspace/helpotron/web/src/PrivacyPolicy.jsx (rewritten; esbuild-verified 18:04, compiles clean)
- /home/roni/Roni_workspace/helpotron/PRIVACY_POLICY.md (rewritten; served at /privacy-policy — the file the route actually reads)
- No commits, no pushes. Not a git repo per env note, so no git status noise; nothing else touched.
