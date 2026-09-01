# Google Stitch redesign prompt — Helpotron "Study OS"

**Reference site:** https://helpotron.dpdns.org (also local preview http://127.0.0.1:5173). Visit the main public URL first, then the logged-in views.

---

## 1. What this is

Helpotron is an **AI academic-assistance "Study OS"** for college/high-school students. A student imports their real assignments (Canvas sync or by hand), and an AI agent — "My Agent" — does the work with them at every step: draft essays, generate study guides, flashcards, practice quizzes, summaries, transcribe lectures, read assignment sheet images (OCR), and export finished work to documents. Users pick exactly what they want done per assignment (do-it-for-me / study guide / quiz / flashcards / summary / something else), watch it progress through a lifecycle (pending approval → in progress → completed → archived history), and can export all their data as JSON. It is a paid product (credits + tokens billing, Stripe, discounts/referrals). Currently live with real users.

## 2. Audience & personality

Students aged 16–30 who are stressed about deadlines and drowning in coursework. The product must feel like a **calm, trustworthy, premium academic co-pilot** — smart, organized, effortless — never like a toy, never like an ad, never like a hacker tool. Personality: precise, supportive, quietly confident. Copy should be short, human, no hype, no emoji-as-decoration in UI chrome.

## 3. Full screen inventory (redesign ALL of these — functionality must survive 1:1)

**Public (no login):**
1. **Landing page** — hero with one-line value prop + product screenshot of the dashboard; nav: Features, Pricing, Guide, Sign in; feature grid (study guides, flashcards, practice quizzes, summaries, AI essay drafting, lecture transcription, image/OCR of assignment sheets, document export incl. LaTeX, Canvas sync); "How it works" (import → choose what you want → agent works → export); pricing section (credit/token model, per-task costs, referral + discount tiers, welcome bonuses); a **Guide modal** (accessible dialog explaining the product, credits vs tokens, 1000:1 Data Lake micro-credit conversion, privacy note); footer.
2. **Sign up / Log in** — username + password, CAPTCHA (Turnstile), then **2FA** (6-digit TOTP screen, SMS code option with opt-out/resend), clear error states.

**Logged in:**
3. **Dashboard — subject bubbles.** Assignments are auto-grouped by subject into large "bubble" cards (e.g., Chemistry, English). Each bubble header: subject name + an **export-all-bubble** button. Inside, four sections: **Pending approval** / **In progress** / **Completed** / plus an archived/history entry point. Each assignment tile: title, due date, status chip, per-assignment **export** button, and one-tap primary action. Empty sections need friendly, directional empty states (not dead space).
4. **Assignment detail** — status ribbon; the **direction picker** card ("Pick what you want for this assignment"): 6 choices (Do it for me / Study guide / Quiz / Flashcards / Summary / Something else + textarea, with a note that unmet requests go to the Data Lake); a **dispatch/progress panel** showing agent work (subagent activity records, dispatch notes, steps); the **result output** (draft, guide, deck, quiz, summary — with LaTeX/markdown rendering); **Launch to Doc**; **Export JSON**; **Mark as done**; **Move to history** (archive).
5. **Analysis history** — "Submission Ledger" / Archived tab: clean list of archived assignments, statuses, export per row.
6. **My Agent chat** — the centerpiece. Full-height chat with the agent: streaming/humanized typing, tool-call activity cards (`see_settings`, `change_settings`, `draft`, `study_guide`, `quiz`, `flashcards`, `summary`, `export_assignment_data`, `request_feature`, …) with running/error status chips; **manual / auto / yolo** permission-mode selector; permission-request cards (Approve / Deny) in manual+auto; sandboxed math answer blocks; Telegram-bot connect state; inline subagent progress.
7. **Insights** — usage/engagement analytics (credits spent, materials generated, study streaks) presented as calm, glanceable summary cards.
8. **Monitors** — live system health panel (API/preview status, uptime, event feed, telegram-wake monitors) for the operator on the same account.
9. **Control Center inbox** — Data Lake feedback entries (feature requests, bug reports) with delete-single and clear-all.
10. **Settings** — Personalization: theme (light/dark), accent color, background, UI style, density/compact, animation toggle, font size (small/medium/large), accessibility (reduced motion, high contrast, large text, dyslexia-friendly, screen reader), language, timezone. Account: plan, credits and tokens balances, payment history, referral status. Connections: Telegram. Privacy/data export.
11. **Payments** — top-up via Stripe, discount balance, receipts, credit/token breakdown.
12. **Study tool outputs** — flashcards deck (flip interaction), practice quiz (question-by-question), study guide/summary rendered documents.
13. **Assignment dump cards** (extension-scraped items) — collapsible/minimizable cards with subject auto-route.
14. **Error, 404, offline/empty** states everywhere.

## 4. What's wrong today (your job: fix with design)

- Vibe-coded and clunky: inconsistent spacing, mixed border radii, crowded cards, mismatched button styles, several dead or cramped states, weak visual hierarchy, nested bubbles and repeating chrome, small touch targets, no coherent motion, dark mode feels bolted-on, landing page reads generic.
- It piles everything on the dashboard at once (bubbles + sections + chips) with no hierarchy of attention.
- No clear "what do I do next" affordance after an assignment is created (the direction picker must feel like the hero action).

## 5. Design direction — "professional makeover"

- **One coherent design system**, executed consistently: a neutral, calm surface palette with a single **user-adjustable accent** (users already pick their color) + semantic status colors (pending = amber, in progress = blue, completed = green, archived = gray/neutral).
- **Typography**: one modern sans (e.g., Inter/Söhne-class) with a strict 4-step scale; tabular numbers for balances/dates; strong headings, clean UI labels. Document-friendly serif or mono accent for LaTeX/render content.
- **Layout & spacing**: strict spacing grid (4/8/12/16/24/32/48/64), consistent 12–16px radii, soft restrained shadows, generous whitespace, max-width content columns, sticky contextual headers. The dashboard should breathe: bubble = card with section grouping; assignment tile = quiet, scannable, one primary action.
- **Hierarchy of attention**: direction picker = hero CTA inside the assignment; chat = app-like pane with its own chrome; secondary features (monitors, inbox, insights) = calm, tool-like surfaces, not toy widgets.
- **Motion**: subtle, purposeful (120–200ms ease-out, 1–2 elevation/enter transitions, skeleton loading); must respect reduced-motion.
- **Dark mode**: first-class, full parity, token-driven.
- **Accessibility**: WCAG AA contrast, visible focus rings, ≥44px touch targets, keyboard-operable everything, screen-reader labels on icon buttons, dyslexia-friendly/font-size accommodations honored by the design.
- **Responsive/mobile**: full mobile layout (students + the owner use phones), priority stacking, bottom-sheet or tabbed nav on small screens, large tap targets, sticky action bars.
- Icons: one consistent icon library, thin/regular weight, never emoji as icons.

## 6. Integration contract (so the design can become code later, 1:1)

- Stack is **React + Vite**; design output must be expressible as: CSS variables / design tokens, component specs, per-screen layouts, and a state map.
- Settings are stored and applied from these exact shapes (the redesign must keep these keys): `display { theme, custom_color, font_size, compact_mode }`, `appearance { theme, accent, density, animation, background, uiStyle, fontScale 1-100 }`, `accessibility { reducedMotion, highContrast, largeText, dyslexiaFriendly, screenReader }`. Theme = light/dark toggle; accent = user-chosen color; font_size small/medium/large maps to fontScale 35/50/65.
- Every screen keeps its full existing functionality: same routes, same API calls, same export/JSON downloads, same lifecycle actions (choose direction, mark done, archive), same SSE progress events, same auth flow (JWT + CSRF header + cookies), same permission-mode behavior in the agent.
- Status vocabulary stays: pending_approval, in_progress, completed, archived (+ paused/not_started/tracked/submitted/graded). Buckets: pending / in_progress / completed / archived.
- No new billing, no new features: the redesign is the product; improvement is visual/UX, not scope.

## 7. Deliverables

1. Design token sheet (colors incl. accent system + dark mode, type scale, radii, spacing, shadows, motion durations/easings) ready to become CSS variables.
2. Complete per-screen redesigns for every view in section 3 (highest fidelity for: landing, dashboard+bubbles, assignment detail + direction picker, My Agent chat, settings, payments).
3. Component inventory with variants, sizes, states (hover/active/disabled/loading/empty/error) and a usage map per screen.
4. Responsive rules for desktop → tablet → mobile.
5. Accessibility & motion notes embedded per component.
6. A short "redesign rationale" (what changed and why) so implementation can follow intent, not just pixels.
