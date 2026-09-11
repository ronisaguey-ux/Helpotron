# Stitch iteration 3 — Helpotron "Study OS" final polish package

**You delivered iteration 2 (12 screens + `dark_tokens.json` + `motion_tokens.json` + `DESIGN.md`) — it was audited against the real product. Verdict: the foundation is ACCEPTED. `assignment_detail`, `my_agent`, and `study_tools` are excellent (direction picker, permission modes, permission-approval cards, tool-activity cards, flashcard flip, quiz flow — all faithful to the product). Do NOT redesign these — this round FIXES gaps and ADDS the one genuinely new feature. Keep the SAME design system (same token names, same class vocabulary: `font-label-caps`, `text-body-sm`, `bg-surface-container-lowest`, `rounded-3xl`, etc.) — extend it, never rename.**

**Product context (unchanged):** AI academic study copilot for students 16–30 ("Premium Co-pilot"). Calm, trustworthy, premium. React + Vite; everything expressible as design tokens / component specs / per-screen HTML.

---

## 1. DELIVERABLE 1 — Dark mode, complete (CRITICAL — the app is dark-first today)

Your iteration-2 screens render light-only; only `dashboard` and `assignment_detail` even have `html class="dark"`. The shipping app defaults to dark. Fix:

1. **Complete the dark token sheet.** 35 of 46 roles delivered. Fill the 11 missing, derived with the SAME logic you used for the delivered 35 (show the rule, one line per role in the pairing map):
   `on-background`, `secondary-fixed`, `on-secondary-fixed`, `secondary-fixed-dim`, `on-secondary-fixed-variant`, `tertiary-container`, `on-tertiary-container`, `tertiary-fixed`, `on-tertiary-fixed`, `tertiary-fixed-dim`, `on-tertiary-fixed-variant`.
2. **Every screen dual-scheme.** Every one of the 12 screens gets `html class="h-full antialiased dark"` and **a `dark:` variant for EVERY surface/text/border class it uses** — built from the dark sheet, class-for-class (`bg-surface-container-lowest` → `dark:bg-surface-container-lowest`, `text-on-surface-variant` → `dark:text-on-surface-variant`, …). No surface may be left light-only. Land on `dark:` variants, not hex swaps.
3. **Full light→dark pairing map** — one mechanical table, ALL 46 roles (your iteration-2 `mapping` was a 6-row example; make it complete).
4. Re-render `screen.png` for each screen in **dark AND light** — two images per screen, `screen_dark.png` + `screen_light.png`.

## 2. DELIVERABLE 2 — NEW: Import from any URL (the one new feature — get this exactly right)

A student pastes a **link + a short description** of an assignment and the system scrapes the page and builds the assignment. Design the surface (it has no design yet):

- **Import Assignment** surface, two variants: (a) a **modal** (opened from "New Study Session" and from the dashboard empty-state CTA), (b) a **card** on the dashboard empty state / active-subjects header.
- Contents, in order:
  1. Caps label + title "Import Assignment from URL".
  2. **URL field** (label above field, ghost input, 1px border, 2px accent focus ring) + placeholder like `https://canvas.example.com/courses/…/assignments/…`.
  3. **Description textarea** (optional — "Paste the assignment description if the page is unclear; the agent will read it if the page is thin").
  4. Primary button **"Scrape & Import"** → while scraping: **loading skeleton** + status line ("Reading page… / Extracting title, due date, instructions…" — sequential, with the `label-caps` mono style and a subtle progress pulse).
  5. **Extracted-fields preview** after scrape: title (editable), due date, guessed subject (`Subject: Biology 101` with an auto-route chip "Auto-routed: Biology 101"), instructions/full-text collapsed to 2 lines with expand, source URL. Fields are editable before confirm.
  6. Confirm row: **"Create Assignment"** (primary) + "Cancel". On confirm → success state: "Added to Biology 101 — In Progress" with a link to the bubble.
- Error state: scrape-failed card (error roles, Retry + "Try pasting description manually").
- Token-pure; statuses/actions stay in the existing product vocabulary.

## 3. DELIVERABLE 3 — Settings screen: complete it

Your iteration-2 settings shows Theme / Accent Color / UI Density only — the product has 20+ settings. Fill the `Personalization` tab with ALL of these, **each row visually labeled with its EXACT key** (mono `label-caps` key label + control):

- `display.theme` (light/dark/system), `display.custom_color` (swatches + custom picker), `display.font_size`, `display.compact_mode` (toggle)
- `appearance.theme`, `appearance.accent` (teal/indigo/all swatches), `appearance.density` (standard/compact), `appearance.animation` (toggle), `appearance.background`, `appearance.uiStyle`, `appearance.fontScale` (**slider 1–100 with a live type-scale preview** — mockUI font at 100% / 130% / 160% beside it)
- `accessibility.reducedMotion`, `accessibility.highContrast`, `accessibility.largeText`, `accessibility.dyslexiaFriendly`, `accessibility.screenReader` (toggle rows, grouped under an "Accessibility" sub-heading)
- Language + timezone rows.
And complete the other tabs: **Account** (plan, credits, tokens, payment history, referral), **Connections** (Telegram — connected state: "Connected as @username · Last synced · Disconnect"), **Privacy** (data export — formats incl. LaTeX/markdown/JSON — and delete account).

## 4. DELIVERABLE 4 — Status chip component set (9 statuses)

Iteration-2 screens use only 2 statuses. Give ONE shared status-chip spec (pill, `label-caps` 10–11px, low-opacity bg tint, high-contrast text + dot indicator) with all 9 statuses and semantic colors from your palette: `pending_approval` (amber), `in_progress` (blue), `completed` (green), `archived` (gray), `paused` (slate), `not_started` (outline), `tracked` (indigo), `submitted` (cyan), `graded` (deep green). Include the **overdue due-date style** (error roles) and the chip's hover/press motion (see §8). Show the set as one `component-variants.md` table + a rendered HTML strip.

## 5. DELIVERABLE 5 — Shared states (skeleton / error / empty / offline / focus)

Only 2 empty states exist. Add one shared spec for each, then apply per screen where relevant:

- **Skeletons**: card, list-row, chat-bubble, table variants (same radii; base color from surface-container family; shimmer keyframes; `aria-busy`).
- **Error card** with Retry (error roles).
- **Offline banner** — sits under the top bar, full-width strip (outline/error roles).
- **Empty states** per section with a single next action.
- **Focus rings**: 2px accent outline + 2px offset on every interactive element; **aria-live** regions for streaming chat and status changes; **44px** touch targets; keyboard navigation for the mobile bottom nav.

## 6. DELIVERABLE 6 — Missing screens (4)

1. **`helpotron_control_center`** — Data Lake feedback inbox: entries (title, snippet, subject, time, class label `Data Lake`), per-entry **delete**, **Clear all**, reward/credits explainer row ("Feedback that gets used earns micro-credits — 1000:1 Data Lake conversion").
2. **`helpotron_dump_cards`** — extension-scraped assignment cards: collapsible/minimizable cards, source-site chip, **subject auto-route hint** ("Auto-routed: Chemistry"), place in dashboard structure.
3. **`helpotron_error_states`** — 404 page, error card, offline banner (the three, one file).
4. **`helpotron_2fa`** — post-login: 6-digit TOTP screen AND SMS-code alternative (resend + opt-out note "Reply STOP to disable"), error state for wrong code, one screen showing both paths.

(`sign_in` is accepted as-is including the Turnstile slot and 2FA note.)

## 7. DELIVERABLE 7 — Token hygiene: kill hex literals

`monitors_feedback` has **47** hex-literal classes (`bg-[#…]`, `text-[#…]`), `settings` 17, `assignment_detail` 14, `dashboard` 9, others a few. Replace EVERY one with the role-token class it represents (map `#[0-9a-f]` values into the surface/primary/secondary/error families; list the full mapping in `component-variants.md` so adoption is mechanical). No `bg-[/#]` may remain in any screen.

## 8. DELIVERABLE 8 — Motion completeness

`motion_tokens.json` has 3 interactions (sidebar slide, button press, card lift). Add the missing ones to reach the full set: status-chip color/size transition, pending-count badge pulse (subtle, 1–2 pulses), credits number tick-up on change, skeleton shimmer keyframes, nav-item press. For every interaction: selector, transition, duration, easing, reduced-motion behavior; all with `prefers-reduced-motion` fallbacks. Deliver `motion-tokens.json` v2 with all 8.

## 9. DELIVERABLE 9 — Radius standardization (no drift)

Iteration-2 drifted to `rounded-xl` for big containers. Standardize to the iteration-1 scale and keep class names EXACTLY: **`rounded-3xl`** hero/container surfaces, **`rounded-2xl`** inner cards/icon tiles, **`rounded-xl`** buttons/inputs, **`rounded-lg`** chips/pills, **`rounded-full`** avatars/badges. (The codebase has already adopted these classes — do not re-randomize.)

## 10. Keep-compatible rules (unchanged + reinforced)

- Keep every token key and class name from iterations 1–2 (add, never rename). Including the fixed/container sets.
- Status vocabulary fixed: `pending_approval`, `in_progress`, `completed`, `archived`, `paused`, `not_started`, `tracked`, `submitted`, `graded`.
- Settings shapes fixed (see §3). No new billing/features beyond the Import-from-URL (§2).
- Icons: one system (Material Symbols fine) but label each by intent (`icon:add`, `icon:export`, `icon:check`, `icon:scrape`) so a single library (lucide) maps cleanly; never emoji as icons.
- Deliver as: `dark-tokens.json` v2, `motion-tokens.json` v2, 13→**17** `helpotron_*.html` files (12 existing + control_center, dump_cards, error_states, 2fa — dashboard already counts), each with `screen_light.png` AND `screen_dark.png`, plus `component-variants.md` (status chips, skeletons, states, radius/hex maps), `state-maps.md` (per screen: default/loading/empty/error/status variants), and `redesign-rationale.md` (what changed vs iteration 2, one paragraph per deliverable).
