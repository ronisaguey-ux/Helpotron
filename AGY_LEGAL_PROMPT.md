# Prompt for AGY — Helpotron Privacy Policy + ToS overhaul (deep legal research)

> Copy everything below the line into AGY. It is fully self-contained (repo path + context included).

---

ANALYZE THE WHOLE PROJECT AND REBUILD OUR LEGAL DOCUMENTS — PRIVACY POLICY + TERMS OF SERVICE

You are a senior privacy/consumer-law researcher and legal drafter. Our project: **Helpotron** — an AI academic assistant web app (folder `/home/roni/Roni_workspace/helpotron`, backend FastAPI in `server/`, frontend React in `web/src/`). It generates study guides, summaries, flashcards, and transcripts from lecture material, has an AI "My Agent" chat, Canvas assignment tracking, turn-in workflows, a referral program, a credits/tokens economy, Stripe payments, SMS 2FA via Twilio, Cloudflare Turnstile captcha, Cloudflare tunnel/CDN, and a "Data Lake" feedback system. Current docs to replace: `web/src/components/PrivacyPolicyModal.jsx`, `web/src/components/TermsOfServiceView.jsx` (and their content data files).

STEP 1 — FULL PROJECT ANALYSIS (read the code):
- Enumerate EVERY personal data category collected, stored, processed, or transmitted (accounts, passwords hashing, phone numbers, emails, transcripts of lectures, uploaded files, assignments, agent chat messages, usage logs, payment metadata, IPs, device/browser signals, cookies/localStorage/sessionStorage, data lake feedback, referrer identities).
- Map every third party and what it receives (Cloudflare CDN/tunnel/WAF, Cloudflare Turnstile, Twilio SMS, Stripe payments, DeepSeek/LLM APIs, email/SMTP, hosting, analytics, any telemetry).
- Map every user-facing feature with legal exposure (AI-generated content, academic integrity, referrals, credits/tokens, purchases (not yet live), SMS opt-in for 2FA (not marketing), account deletion, data export, minor users, student use).

STEP 2 — DEEP LEGAL RESEARCH (cite law + regulation by name; use current 2026 law):
- GDPR/UK GDPR (lawful bases, DPAs, breach 72h, rights, international transfers, Schrems II, EU AI Act exposure for LLM features), CCPA/CPRA and all US state consumer laws (CO/VT/CT/UT/VA/OR/DE/NJ etc.), Canada PIPEDA, children: COPPA/FERPA-adjacent student-data concerns in education tools, parental consent, age gates.
- FTC standards: deceptive practices, dark patterns, testimonials, auto-renewal, unsubscribe, CAN-SPAM.
- SMS/TCPA: A2P 10DLC, express written consent for SMS, STOP/START/HELP handling, Twilio compliance, no marketing texts without opt-in (our SMS is only 2FA login codes — keep it that way, write the consent language).
- Payments: Stripe terms, PCI scope, refunds/chargebacks, virtual-credits disclosure ("no cash value"), merchant-of-record issues, don't-hold-customer-funds statements.
- IP: user content ownership, license to us, AI output ownership/disclosure, DMCA takedown procedure.
- Contract law: arbitration + class-action waiver + jury waiver (state-by-state validity, carve-outs), limitation of liability, indemnification, force majeure, entire agreement, severability, survival, assignability, changes-to-terms notice, governing law (Louisiana, USA unless told otherwise), venue.
- Data lifecycle: retention schedule, deletion/export rights, security safeguards, incident response, breach notification obligations by state.
- AI-specific: accuracy/limitation disclaimers, no-legal/medical/financial-advice, hallucination warnings, educational-use-only, liability for AI-generated material, disclosure of automated processing.

STEP 3 — DELIVERABLES (monolithic, comprehensive, plain-English but exhaustive, written to be ENFORCEABLE — never promise what the code can't do):
1. Complete rewrite of the Privacy Policy (~4,000–8,000 words): data inventory table, purposes, lawful bases, retention, sharing (full third-party schedule with links), cookies/localStorage table, security, international transfers, state-specific rights tables (CA + all), minors/students, SMS consent + STOP language, AI processing disclosure, data subject request procedures (and add the endpoints we must build to honor them: export + delete), breach notice.
2. Complete rewrite of the Terms of Service (~4,000–8,000 words): account rules, credits/tokens (non-refundable, no cash value, abuse rules), AI output disclaimers, acceptable use, academic integrity note, referrals (abuse, jurisdiction limits), payments (when they go live), arbitration/class-action waiver with all required carve-outs, liability cap, IP licenses, termination, changes.
3. A "legal status report": what in the CURRENT product policy/ToS is now inaccurate, what legal gaps exist, and a prioritized checklist of ENGINEERING changes needed to make the drafted promises true (e.g., export/delete endpoints, consent records, retention jobs, DPA pages), each with effort estimate.
4. Sources cited inline (reg. names, sections, and links).

OUTPUT: single markdown document set (or one file with parts), ready to paste into the app. Do NOT give legal advice as a lawyer — add a note that a licensed attorney should review before publishing anything that binds us.

IMPORTANT: the app currently collects the minimum it needs; do NOT recommend more data collection than necessary, and flag anything in the code that collects data silently.
