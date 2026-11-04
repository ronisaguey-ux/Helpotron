# Helpotron Privacy Policy

Last reviewed: September 5, 2026

Applies to: the Helpotron web app, the Helpotron Academic Companion browser extension, and the service they talk to (helpotron.dpdns.org via a Cloudflare tunnel). Questions: buisness@rs-systems-web.com. A machine-readable version of this policy also lives in the app at Settings → Privacy (the same six sections you see below).

The short version: we keep your study data to run the service. The AI features send your prompts, study content, and (only while you turn it on) screen frames to OpenRouter — which serves DeepSeek and Google Gemini models — to generate your material. We never sell data, there are no ad or analytics trackers, and you can export everything or delete your whole account in two clicks from Settings.

## 1. What we collect, in plain English

Everything below was checked against the running code. "Until you delete the account" means the Delete Account button really wipes the row and everything attached to it in a single transaction.

- Category: Account identity. What we store: your username (public_id), display name, role, plan, credit balance, account creation date. No email address is collected at signup (username + password only). Kept: until you delete the account. Why: to sign you in and manage billing.

- Category: Login security. What we store: a salted PBKDF2-SHA256 password hash (100,000 iterations), your 24-hour login token, a server-side 7-day session, a CSRF token, and (if you set it up) a TOTP secret for app-based two-factor. Kept: sessions expire after 7 days; the password hash stays until deletion. Why: to keep your account secure.

- Category: Phone & SMS. What we store: your phone number if you add SMS two-factor; trial phones are stored only as a salted SHA-256 hash plus a masked number and the IP address that claimed the trial. Kept: until you remove 2FA or delete the account; trial hashes are kept to stop duplicate free-trial claims. Why: to deliver verification codes and prevent abuse.

- Category: Coursework. What we store: assignment titles, prompts, due dates and course names; data synced from Canvas when you connect it; pages you scrape with the extension (page URL and title, prompt and rubric text, file links with SHA-256 hashes, and the file bytes themselves, up to 6 MB per file, when the file can be fetched inside your own login). Kept: until you delete the account. Why: it is the work you asked the agent to do.

- Category: Study materials. What we store: the generated study guides, flashcards, practice tests, summaries, writing drafts, answer sets and Anki/Quizlet exports. Kept: until you delete the account. Why: they are the product.

- Category: Audio & transcripts. What we store: lecture recordings you make with the extension's recorder (your microphone, when you start it) and the transcripts the AI writes from them, plus shared summaries. Kept: until you delete the account. Why: to transcribe and summarize lectures.

- Category: Agent chat & memory. What we store: chat threads and messages, the agent's long-term memory notes, files you upload to the agent, executed agent actions, and (if you connect it) your Telegram link. Kept: until you delete the account. Why: to keep your assistant continuous.

- Category: Screen frames. What we store: one compressed JPEG frame (longest side at most 1280 px) of the tab you selected — but only while the extension's "See screen" switch is on. Kept: used for the current turn only; frames are not stored in your account. Why: to let the agent see the page you are looking at.

- Category: Preferences & settings. What we store: theme, accent, effort level, scoped overrides, custom subjects and bubbles, writing style samples. Saved in your browser and mirrored to your account. Kept: until you delete the account or clear browser data. Why: to remember how you like to work.

- Category: Billing & credits. What we store: Stripe customer and subscription IDs (when Stripe is configured), the credit transaction ledger, and manual payment records (provider, reference, amount). Card numbers never touch our servers. Kept: until you delete the account. Why: to grant and invoice credits.

- Category: Referrals & study groups. What we store: referral codes and reward allocations; study group titles, rosters and shared-material pointers. Kept: until you delete the account or leave the group. Why: to run those features.

- Category: Telemetry & logs. What we store: anonymized data-lake events (AI-detection scores, writing-outcome metrics — emails, phone numbers, IDs and names are redacted in code and your user ID is replaced with a salted hash), an API usage ledger (model, token counts and cost per user — never message contents), and rotating access logs (request line, client IP as seen behind the tunnel, response status). Kept: logs rotate on the server; usage rows until deletion. Why: to improve the product and keep it running.

## 2. AI and third parties

This is the complete list of who receives your data. There are no advertising or analytics third parties: no Meta pixel, no Google Analytics, no ad networks, no data sales. If your content leaves our server it goes to one of these, only to deliver the feature you are using.

- OpenRouter (US) — the AI model gateway. All AI text generation, vision analysis and audio transcription are served through OpenRouter, which provides us with DeepSeek and Google Gemini models. Your prompts, chat messages, assignment content, uploaded study files, transcripts, screen frames and audio are sent there to be processed and the result is returned to you. Helpotron never calls OpenAI or Anthropic models.

- Cloudflare (global edge) — the public host helpotron.dpdns.org is a Cloudflare tunnel into our server; the edge sees proxy metadata (IP address, HTTP headers, TLS details) but no study content. Cloudflare Turnstile also runs the human check on signup/login; the token you solve is verified with Cloudflare.

- Stripe (US/Ireland) — used when Stripe is configured: the checkout page is Stripe's, and we store only the Stripe customer and subscription IDs on our side. Card details never touch our servers.

- Twilio (US) — SMS delivery for two-factor login and phone-based recovery. We send Twilio your phone number and the one-time code only.

- Google — through OpenRouter, Google Gemini models transcribe your audio. Separately, when you use "Launch to Doc", the extension types a draft into a Google Doc you choose: the text goes to Google under YOUR account as ordinary editing in your browser. We never push anything to Google Docs on our side.

- Telegram — only if you connect it. You can link your agent to your own Telegram bot; messages you exchange pass through Telegram's servers. As a recovery fallback, account-recovery requests may notify our operator in the admin Telegram chat.

- Your school's LMS — Canvas, Blackboard, D2L, Brightspace, Moodle, Schoology and the other supported sites. The extension talks to your school's servers using your own session only when you start a capture or sync, it never reads LMS pages in the background, and file fetches happen inside your browser session so your school's cookies apply. Self-hosting note: the same helpotron server is reachable at http://localhost on your machine when you run the local stack, so local dev traffic stays on your machine.

- What stays on your machine: assistive typing (the extension typing a draft into a Google Doc, Gmail, Notion, Word Online or any text field you pick) is done locally by dispatching keystroke events inside the page. Keystrokes — and the contents of password, OTP and card fields — are never transmitted to our server. The extension keeps your login token and a small recent-chat mirror in its own browser storage and syncs only your theme and accent color through your browser profile.

## 3. Storage and retention

Where things live:

- On our server: the account row and every study, chat, transcript, material and payment record live in a SQLite database on our machine. Uploads (agent files, avatars, scraped assignment files, recordings) live in the uploads directory on the same machine. Anonymized data-lake events live as JSON files (PII scrubbed in code before writing, user IDs replaced by salted hashes). Access/error logs live in rotating files under data/logs/.

- In your browser: the web app keeps the login token, your username, a CSRF mirror, your settings object (helpotron_os_settings_v1), a terms-acceptance flag, custom agent skills/identities and any alternate server URL that you configured. Cookies: helpotron_session (HttpOnly, 7 days, SameSite=Lax, Secure when you are on https) and csrf_token. The extension keeps the server URL, username and session token in chrome.storage.local (cleared on sign-out) and only theme + accent color in chrome.storage.sync.

- Retention, honestly stated: login tokens expire after 24 hours; server sessions and the login cookie expire after 7 days; verification codes are single-use and expire within 15-30 minutes. Study content, chats, transcripts, the payments ledger, referrals and settings are kept for as long as you keep the account — there is no silent auto-deletion and there is no rolling 90-day chat window. Free-trial phone numbers are kept only as salted hashes plus a masked form and claim IP, solely to stop duplicate trials. If Stripe is enabled, Stripe keeps its own records under its terms; our copy (IDs only) is deleted with your account.

## 4. Your rights, and the buttons that back them

Two of these rights are working buttons in Settings, and both are wired to server endpoints that do exactly what they say.

- Access and portability: Settings → Data → Export All downloads a JSON export of everything your account holds (settings, materials, assignments, data-lake contributions). You can also export single assignments or subject bubbles, and generate Anki .apkg or Quizlet files.

- Erasure: Settings → Account → Delete Account calls DELETE /api/user/account, which wipes your user row plus every attached table — assignments, transcripts, materials, chat and threads, files, payment and credit ledgers, referrals, study groups and sessions — in one transaction. It is immediate and not reversible.

- Correction: account fields, writing style samples, custom subjects and rule overrides are each editable or removable in Settings.

- Reset without deleting: Settings → Data → Soft Reset restores preferences to defaults and archives unfinished staging. Nothing is deleted and the reset is reversible.

- Formal requests: email buisness@rs-systems-web.com. We will verify ownership and fulfil requests within GDPR (Articles 12-23) and US state-law timelines. Rights include access, rectification, erasure, restriction, portability, objection to telemetry processing, and the right not to be subject to fully-automated decisions. Under US state laws (CCPA/CPRA, Virginia VCDPA, Colorado CPA, Connecticut CTDPA, Texas TDPSA) you have the right to know, delete, correct, port and non-discrimination — and here the delete right is a working button, not a form. We do not sell or share personal data for cross-context behavioral advertising, and no such sharing exists to opt out of.

## 5. Kids and schools

- Minors (COPPA): Helpotron is restricted to people aged 13 and over. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has an account, contact us and we will erase it.

- School records (FERPA): we store only what you bring — assignment pages you choose to scrape, files you upload, and audio you record. The extension reads an LMS page only when you start a capture, never in the background, and it goes to your school's servers with your own credentials when it fetches course files. Your records belong to you; using personal materials for private study review is your responsibility under your institution's policy.

- Academic integrity: Helpotron is built for study review — flashcards, guides, practice tests, and drafts for you to revise. Submitting unreviewed AI output during live proctored exams or otherwise outside your school's policy is prohibited by our Terms of Service. The detector scoring shown in your dashboard is a transparency risk meter, not a concealing tool.

## 6. Security, breach notification, policy changes, contact

- In transit: the entire public site runs through an encrypted Cloudflare tunnel, so no study content travels the internet in plain text.
- Passwords are never stored in plain text — salted PBKDF2-SHA256 with 100,000 iterations.
- Sessions use an HttpOnly, SameSite=Lax cookie plus a server-side 7-day session; state-changing requests carry CSRF tokens; optional TOTP app or SMS two-factor is available.
- Abuse controls: Cloudflare Turnstile on signup/login, rate limiting, per-user cost budgets and approval gates before the agent spends credits or submits work.
- Honest limits: the database and uploads sit on our own machine's disk. We do not claim encryption of data at rest. Access to stored data belongs to the account owner and to the platform operator who keeps the service running.
- Breach notification: if a breach puts your data at risk we will tell you what happened and what we did, following GDPR Article 33 (authorities, within 72 hours) and Article 34 (affected users, without undue delay), and applicable US state breach statutes.
- Policy changes: if this policy changes, the date at the top changes too; if a change reduces your rights we will say so prominently before it takes effect.
- Questions or wishes to exercise any right: buisness@rs-systems-web.com, or use the "message to admin" channel inside the app.
