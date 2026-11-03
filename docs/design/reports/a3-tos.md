# A3 — Terms of Service Rewrite (Helpotron)

Component rewritten: /home/roni/Roni_workspace/helpotron/web/src/components/TermsOfServiceView.jsx
(`cd /home/roni/Roni_workspace/helpotron/web && npm run build` → green, 11.84s, TermsOfServiceView chunk built.)

## 1. Real billing/refund facts verified in code (file:line)

| Fact | Evidence |
|---|---|
| Credit = 1 task token = $0.01 of actual AI/tool spend | server/credits.py:30-33 (`calculate_task_token_cost`: 1 token = $0.01) |
| Task costs: flashcards/summary/agent chat 1; study guide/quiz 2; humanizer draft 3; lecture transcribe 5; assignment solve 5; browser subagent 10; code analysis 3 | server/credits.py:10-21 (TASK_COSTS) |
| Plans & prices: Basic $5/mo → 300 credits; Pro $15/mo → 1000; Elite $30/mo → 2700; Trial 100 | server/payments.py:25-26 (TIER_CREDITS/TIER_PRICE_CENTS); server/plans.py:53-74 PLAN_COPY |
| Trial: 7-day, one-time, SMS-verified, 1 per phone number | server/plans.py:58; server/routes_trial.py |
| Paid plans are Stripe SUBSCRIPTIONS that auto-renew monthly; tier credit grant added on each successful renewal invoice | server/payments.py:61 (mode="subscription"), 65 (trial_period_days 7), 126-139 (invoice.payment_succeeded → credit grant) |
| Cancel → plan downgraded to "basic", status "canceled"; no auto refund | server/payments.py:150-158 (customer.subscription.deleted) |
| Credits added only for captured (verified) payments; manual providers (CashApp/Zelle/Venmo/PayPal) are "pending" | server/payments.py:17, 189-200 |
| Failed tasks auto-refund the deducted credits | server/credits.py:113, 161-169 (charge_with_rollback / refund) |
| NO real automated refund of paid money — `refund_unused` is a stub returning a canned message; no self-service refund path, no policy code | server/payments.py:231-233 |
| Credits are per-account; no cash value, transfer or cash-out path anywhere in code | server/credits.py, server/payments.py (whole-module) |
| Elite = unmetered (token gate skipped) | server/credits.py:77-79 (is_usage_unlimited) |
| Purchases may require 2FA before checkout (config flag) | server/main.py:1799-1808 (_purchase_2fa_required) |
| Account deletion: GDPR Art. 17 cascade delete (assignments, transcripts, materials, credit ledger, payments, sessions); datalake anonymized; user row deleted → credits gone | server/routes_user_settings.py:1003-1043 |
| Full data export available (manifest JSON: profile, settings, materials, assignments, datalake) | server/routes_user_settings.py:469-470; web/src/api.js:633 (exportAllUserData) |
| Referral discount exists (30% new / 15% existing user order discount, consumed on one order); Data Lake micro-credits 1000:1 | server/payments.py:180-228; server/main.py:1673-1684 |
| NO minimum-age gate in auth flow (signup = public_id + password + Turnstile + rate limit) | server/main.py:998-1029 |

Honesty fixes vs old ToS: removed fabricated "Mandatory Binding Arbitration (AAA)" clause, invented "$100 USD" liability cap, invented jurisdictional-venue language, and "$0.00 cash value / non-refundable" overclaims that no code enforces. No promise of undetectable AI anywhere.

## 2. What I wrote

Single-file rewrite, same component skeleton (default export `TermsOfServiceView({ onBack })`, `useState('all')` filter, SectionCard rendering, header card + jump buttons + contact footer, existing palette tokens). 13 numbered sections:

1. **Acceptance & Eligibility** — agreement by use; must be legally able to contract or have guardian permission; per-person account; trial 1-per-phone.
2. **What the Service Does** — honest description: capture your own materials, AI agent produces study guides/quizzes/flashcards/summaries/drafts/assignment help; AI outputs are AI-generated, not humanized, not guaranteed undetectable; can be wrong; not professional advice.
3. **Academic Integrity** — user must follow their institution's honor codes/syllabi; user's obligations (no proctored-exam use, disclose where required, full responsibility); Helpotron disclaims liability for disciplinary outcomes.
4. **Account Responsibilities** — creds security, 2FA recommended, no sharing, accuracy, data export + account deletion rights.
5. **Credits, Billing, Renewals & Refunds** — REAL rules: token = $0.01 tool cost; per-task costs; plan line (Trial 100 / Basic 300 $5 / Pro 1000 $15 / Elite 2700 $30 + unmetered); auto-renewing subscriptions, monthly grants on renewal; manual providers pending-until-verified; 2FA-gated checkout; credits no cash value, failed-task auto-refund; no automated money refunds — review via support, law applies; cancel → downgrade to Basic, balance retained; deletion/termination → balance forfeited.
6. **Acceptable Use & Prohibited Conduct** — no academic dishonesty, no scraping/harvesting third-party sites (extension is for YOUR pages), no bypassing access controls, no sublicensing/reverse-engineering, no reselling output, no spam/rate-limit evasion, no sensitive third-party data.
7. **Your Content — Ownership & License** — user owns their coursework/material; limited license to us to store/process/transcribe/run inference + opt-in anonymized Data Lake (micro-credits 1000:1); generated study materials assigned to user; export/delete rights.
8. **Intellectual Property & Third-Party Materials** — we own app/extension/software/brand; revocable personal license, no sublicensing; third-party providers (OpenRouter/DeepSeek/Google/Stripe/Twilio/Cloudflare) governed by their terms; copyright queries → buisness@rssytemsweb.com.
9. **Disclaimers & Warranty** — AS IS / AS AVAILABLE; no accuracy/uptime/"undetectability" warranty; no professional advice; features may change.
10. **Limitation of Liability** — no indirect/consequential damages (lost grades/data/disciplinary costs); aggregate cap = greater of (a) amount paid in prior 12 months, (b) legal minimum; jurisdiction caveat.
11. **Suspension & Termination** — user can delete anytime; we may suspend for breach/fraud/non-payment; notice where feasible; no credit value returned on termination; savings clause self-described.
12. **Changes to These Terms** — updates with "Last updated" date; material changes notified in-app/email; continued use = acceptance; no retroactive erosion.
13. **Governing Law** — neutral placeholder per mission: Louisiana (company HQ) laws, no conflict-of-law rules; mandatory consumer-protection laws of user's residence still apply; severability; entire-agreement. Deliberately NO arbitration/venue/class-waiver fabrication.

Unused `ChevronRight` import removed. Contact: buisness@rssytemsweb.com + buisness@rssytemsweb.com (both already referenced in existing PrivacyPolicy.jsx).

## 3. Regeneration spec contribution (Stitch rebuild of the ToS page)

**Structure:**
- Sticky hero header: icon tile (scale glyph), H1 "Terms of Service & End-User License Agreement", one-line meta (Last updated · Company · city), Back-to-dashboard button right-aligned on desktop; stacks on mobile.
- Below hero: 1-2 sentence plain-English "what this covers" intro paragraph.
- Jump bar: "View All Sections" pill + 13 pill buttons (section number + short label), wrap on mobile, active = filled indigo. On mobile make it a horizontally scrollable pill row (overflow-x-auto, sticky under any app header). Use SectionCard's existing treatment (dark translucent card, white border, 2xl radius).
- 13 content sections, each: icon glyph in section accent color + "N. Title"; body = text-xs/sm paragraph + optional highlighted sub-panel (tinted border + tinted bg per accent color) holding the bullet lists. Keep the accent-color system (emerald/purple/amber/rose/cyan/indigo/yellow/violet/sky) — it doubles as a key on jump pills.
- Final contact block: centered glass-panel card, mono line for company legal, mailto links for buisness@rssytemsweb.com and buisness@rssytemsweb.com.
- Mobile: single column, max-w-5xl container, tap targets ≥ 40px, no horizontal scrolling except the pill bar; keep text-xs/sm hierarchy so 13 sections stay scannable; consider collapsing sections into <details> accordions on mobile (jump pills scroll-to-anchor).

**Content rules for regeneration:** keep the exact 13-section schema and all real semantics (tokens = $0.01 tool cost, plan prices/credits, auto-renew + cancel-to-basic, no-cash-value credits, failed-task auto-refund, no automated money refunds, forfeiture on deletion, per-school academic policy responsibility, no undetectability claim, neutral governing law). Do not invent arbitration clauses, venue, or refund promises.
