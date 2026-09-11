# Stitch iteration 2 — Helpotron "Study OS" full redesign package

**You already produced `helpotron_dashboard.html` for this project — it is accepted as the foundation. This is iteration 2: fix its gaps and complete the product. Keep the SAME design system you established (same token names, same class vocabulary: `font-label-caps`, `text-body-sm`, `bg-surface-container-lowest`, `rounded-3xl`, etc.) — this round extends it, it does not replace it. Product context:** AI academic study copilot for students 16–30 ("Premium Co-pilot"). Calm, trustworthy, premium. Functionality stays 1:1 (same routes, actions, statuses — no new billing, no new features). Stack: React + Vite; everything must be expressible as design tokens / component specs / per-screen HTML.

## 1. DELIVERABLE 1 — Dark scheme (missing entirely)

Your token sheet shipped light values only, and your `dark:` classes point at light role names. Give the complete **dark token sheet** (`dark-tokens.json`), derived with Material-3 rules on this teal/indigo scheme (primary #00685f / secondary #4648d4), with real dark roles for EVERY role:

`background, surface, surface-bright, surface-dim, surface-container-lowest/low/container/high/highest, on-surface, on-surface-variant, on-background, outline, outline-variant, primary, on-primary, primary-container, on-primary-container, primary-fixed, on-primary-fixed, primary-fixed-dim, on-primary-fixed-variant (+ full secondary & tertiary fixed/fixed-dim sets), error, on-error, error-container, on-error-container, inverse-surface, inverse-on-surface, inverse-primary, surface-tint`.

Also give the **light→dark pairing map** in one table so the mapping is mechanical.

## 2. DELIVERABLE 2 — Motion tokens + micro-interactions (currently only a card hover)

- `motion-tokens.json`: durations (fast 120ms, medium 180ms, standard 240ms), easings (ease-out, a standard emphasized curve), and the rule: all motion must have `prefers-reduced-motion` fallbacks.
- Specify 6–8 small micro-interactions as spec snippets (CSS/JS tokens, NOT big effects): sidebar active-item indicator slide + fill, nav item press, card hover lift (keep yours), status-chip color/size transition, pending-count badge pulse (subtle, 1 pulse), credits number tick-up on change, button press scale 0.98, skeleton shimmer keyframes. For each: selector, transition, duration, easing, reduced-motion behavior.

## 3. DELIVERABLE 3 — ALL remaining screens, same system (biggest gap)

Redesign each in the same vocabulary. Filename pattern `helpotron_<screen>.html`. Per screen: full-fidelity HTML **+ a state map** (default / loading skeleton / empty / error / each status variant):

1. `landing` — hero + one-line value prop + product screenshot slot; nav (Features, Pricing, Guide, Sign in); feature grid (study guides, flashcards, practice quizzes, summaries, AI essay drafting, lecture transcription, sheet-image OCR, doc export incl. LaTeX, Canvas sync); "How it works" (import → choose → agent works → export); pricing (credit/token model, per-task costs, referral + discount tiers, welcome bonuses); Guide modal (credits vs tokens, 1000:1 Data Lake micro-credit conversion, privacy note); footer.
2. `auth` — sign up / log in (username+password, Turnstile captcha slot); then 2FA: 6-digit TOTP screen + SMS code alternative with opt-out/resend; clear error states.
3. `assignment_detail` — status ribbon (pending_approval / in_progress / completed / archived / paused / not_started / tracked / submitted / graded); the **direction picker** as the hero card: 6 choices (Do it for me / Study guide / Quiz / Flashcards / Summary / Something else + textarea, note: unmet requests go to the Data Lake); dispatch/progress panel (subagent activity records, dispatch notes, steps); result output (draft, guide, deck, quiz, summary with LaTeX/markdown); Launch to Doc; Export JSON; Mark as done; Move to history.
4. `my_agent` — app-like full-height chat: streaming typing, tool-call activity cards (see_settings, change_settings, draft, study_guide, quiz, flashcards, summary, export_assignment_data, request_feature…) with running/error chips; **manual / auto / yolo** permission-mode selector; permission-request cards (Approve / Deny); sandboxed math answer block; Telegram-connect state; inline subagent progress.
5. `history` — "Submission Ledger": clean list of archived assignments, statuses, export per row.
6. `insights` — usage/engagement summary cards (credits spent, materials generated, study streaks), calm and glanceable.
7. `monitors` — operator system-health panel (API/preview status, uptime, event feed, telegram-wake monitors).
8. `control_center` — Data Lake feedback inbox: entries with delete-single + clear-all.
9. `settings` — Personalization (theme/light/dark/oled/midnight/graphite, accent color picker, background, UI style, density, animation toggle, **font scale slider 1–100 shown live**, accessibility: reduced motion, high contrast, large text, dyslexia-friendly, screen reader; language, timezone) + Account (plan, credits, tokens, payment history, referral) + Connections (Telegram) + Privacy/data export. Layout must visually expose the setting rows in these exact keys: `display {theme, custom_color, font_size, compact_mode}`, `appearance {theme, accent, density, animation, background, uiStyle, fontScale 1-100}`, `accessibility {reducedMotion, highContrast, largeText, dyslexiaFriendly, screenReader}`.
10. `payments` — top-up via Stripe, discount balance, receipts, credit/token breakdown.
11. `study_outputs` — flashcards deck (flip interaction), practice quiz (question-by-question), guide/summary rendered document.
12. `dump_cards` — extension-scraped assignment cards: collapsible/minimizable, subject auto-route hint.
13. `error_states` — 404 page, error card, offline banner.

## 4. DELIVERABLE 4 — States & edge handling (be explicit)

- Loading skeleton per component type (card, list, chat bubble, table) — skeleton tokens (base color from your surface/container family, same radii).
- Error card variant (uses your error roles) with Retry.
- Empty states per section — not only subject bubbles.
- Offline banner (should sit under the app top bar; uses outline/error roles).
- Long-title truncation rule (1–2 lines with ellipsis), overdue due-date styling (error roles), status chip for each of the 9 statuses with its color role (pending=amber… you choose from your palette; keep semantic mapping in the state map).

## 5. DELIVERABLE 5 — Accessibility spec (contract demands WCAG AA)

- Semantic structure (header/nav/main/section landmarks), heading order.
- Visible focus rings: 2px outline in accent color, 2px offset — shown on every interactive element in the HTML.
- aria-label / aria-label pattern for every icon-only button; aria-current for active nav.
- AA contrast check on every text/background pair (list any that need darker variants).
- ≥44px touch targets on mobile; keyboard navigation for the bottom nav; `aria-live` region for streaming chat and for status changes.

## 6. Keep-compatible rules

- Keep every token key and class name from iteration 1 (add, never rename — the codebase will adopt them mechanically).
- Status vocabulary fixed: pending_approval, in_progress, completed, archived, paused, not_started, tracked, submitted, graded.
- Settings shapes fixed (see #9). No new billing/features.
- Icons: keep using one system — but list icon *intent* per element (e.g. `icon:add`, `icon:export`, `icon:check`) so a single icon library can map cleanly; never emoji as icons.
- Deliver as: `dark-tokens.json`, `motion-tokens.json`, 13 `helpotron_*.html` files, `component-variants.md` (variants/sizes/states), and a 1-page `redesign-rationale.md` (what changed vs iteration 1 and why).
