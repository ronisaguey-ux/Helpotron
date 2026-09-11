# HELPOTRON OS v4 — FRONTEND DESIGN OVERHAUL SPEC
### (Google Stitch regeneration brief — UI/UX ONLY · COMPLETE SCREEN INVENTORY)
**Date:** 2026-09-05 · **Source:** 10-agent full teardown of every surface + Stitch v3 export · **Scope:** every screen, every modal, every sub-panel, every state, every variant — phones, tablets, desktops.

---

## 0. HOW TO USE THIS DOCUMENT

- **Frontend only.** No backend, no APIs, no data models, no migrations — everything Stitch draws is here; server-side work lives separately in the agy master plan (written after the Stitch designs arrive).
- **§1–2** = the GLOBAL DESIGN LANGUAGE + the RESPONSIVE & STATE RULES. Paste once into Stitch before any screen ("use the global design language from my previous message" for everything after).
- **§3** = THE COMPLETE SCREEN INVENTORY — **65+ screens**, organized in families (3.1 … 3.24). Every routable view, every modal, every tab, every sub-panel gets an entry with: anatomy, **variants**, **states**, buttons, **mobile + tablet** spec. Major screens carry a paste-ready REGEN PROMPT; every screen carries its state list.
- **§4** = the 3-LEVEL CONFIG EXPERIENCE (global → subject → assignment) · **§5** = Settings keep/move/delete · **§6** = honesty fixes · **§7** = bug list incl. mobile/tablet · **§8** = component inventory · **§9** = Stitch generation order.

**Universal instruction for every screen:** for each screen, Stitch must return it at **390px (phone), 768px (tablet portrait), 1024px (tablet landscape / small laptop), 1440px (desktop)** — and each return must render the screen in its **empty, loading, and populated** states plus **dark AND light** theme. If a brief doesn't repeat this, it's implied.

---

## 1. THE GLOBAL DESIGN LANGUAGE (paste into Stitch first)

### 1.1 The overhaul look — "LUMINOUS GLASS"

A **complete overhaul**: legacy Aurora styling (`surface-glass-strong`, `clean-card`, gradient cards, scattered hex colors, 5 button styles) is deleted everywhere. One coherent, premium identity:

- **Canvas:** deep near-black (`bg-background`) with **two fixed ambient glows** behind content (primary @ ~7% top-left, secondary @ ~5% bottom-right, 600px blur). Light theme: soft teal glow at 40% strength.
- **Glass depth:** panels = `bg-surface-container-lowest/70 + backdrop-blur-xl`, 1px `border-outline-variant/20`, hairline top inner highlight (`inset 0 1px 0 rgba(255,255,255,.05)` dark / `.04` light). Interactive cards: hover lift 1px + border to /50.
- **Light as accent:** primary sparingly — typography accents, active states, key CTAs. The one page-KEY CTA carries a soft glow (`0 0 24px primary/25`).
- **Mono numerals as product signature:** credits, tokens, scores, prices, timestamps, percentages — JetBrains Mono tabular (`font-tabular-stat`).
- **One illustration family:** curved-stroke line art (Stitch export style) for empties/heroes/success — drawn SVG paths, single accent color, no fills.
- **Micro-interactions:** press 0.98 on buttons, spotlight rows, sliding segmented thumb, shimmer skeletons, spring toasts. ≤150ms; all killed under `data-motion="reduced"`.
- **Rhythm:** header (display-xl + one-line sub) → action row → content; 24–32px gaps; max 2 card nesting levels; 8px grid.
- **Two modes:** dark default (hero-grade); light = faithful translation, never a broken afterthought.

### 1.2 Role tokens (the ONLY color vocabulary)

M3 classes from `@theme inline`; resolve per theme automatically:
- Surfaces: `bg-background`, `bg-surface`, `bg-surface-bright`, `bg-surface-dim`, `bg-surface-container-lowest/-low/-container/-high/-highest`
- Text: `text-on-surface`, `text-on-surface-variant`, `text-on-background` · Lines: `border-outline`, `border-outline-variant`
- Brand: `bg-primary`, `text-primary`, `bg-primary-container`, `text-on-primary`, `text-on-primary-container`, `bg-primary-container/10`
- Support: `secondary`/`tertiary` + containers, `error`/`error-container`/`on-error`
- Semantic (8 pairs): `sem-amber`, `sem-blue`, `sem-green`, `sem-cyan`, `sem-indigo`, `sem-deepgreen`, `sem-gray`, `sem-slate` (text- / bg-/15 / border-/25)
- Charts: `--chart-1..5`, `--chart-line-primary`, `--chart-grid`, `--chart-tooltip-*`

**HARD RULES:** Zero `dark:` variants (CSS vars + `data-theme` only). Zero hex/rgba literals in components. ONE primary brand — M3 teal (`--st-primary`); purple (`var(--accent)`) and blue (`#2563eb`) buttons regenerated as M3 primary/secondary. No gradient card backgrounds (ambient glows only). No emoji as icons. No AI-generated imagery.

### 1.3 Typography

| Role | Face | Size/line/weight | Use |
|---|---|---|---|
| `text-display-xl` | Hanken Grotesk | 48/56/700, -0.02em | Landing H1, page heroes |
| `text-display-xl-mobile` | Hanken Grotesk | ~36 | Hero at ≤640px |
| `font-headline-lg` | Hanken Grotesk | 32/40/600 | Page H2s |
| `font-title-md` | Inter | 20/28/600 | Topbar title, card titles |
| `font-body-md` | Inter | 16/24 | Body, inputs (16px mandatory — iOS zoom) |
| `font-body-sm` | Inter | 14/20 | Secondary, meta |
| `font-label-caps` | JetBrains Mono | 12/16/500, +.05em, UPPER | Buttons, nav, chips |
| `font-tabular-stat` | JetBrains Mono | 14 | ALL numbers |
| `font-code-sm` | JetBrains Mono | 11 | Provenance, mono data |

No raw `font-sans/font-mono`, no `tracking-wider` beside label-caps, no inline `clamp()` (mobile sizes are tokens).

### 1.4 Radii, spacing, targets

`rounded-3xl` panels · `rounded-2xl` cards/icon tiles · `rounded-xl` buttons/inputs · `rounded-lg` chips · `rounded-full` avatars/dots/pills. 4px spacing grid; mobile margin 16, desktop 32; content max **1200px** (`page-max`); `page-pad` (`p-4 md:p-6`). Everything interactive ≥44×44px; inputs ≥44px tall; bottom bars/sheets ≥48px. Focus: 2px primary outline, 2px offset, `:focus-visible`.

### 1.5 One component per job (build once, use everywhere)

| Primitive | Spec | Replaces |
|---|---|---|
| **Button** | 5 variants: `primary` (glow on page-KEY), `secondary`, `ghost`, `danger`, `primary-soft`; sizes sm/lg; loading spinner; `min-h-[44px]`; `aria-busy`; press 0.98 | blue ui/Button + ~40 raw buttons |
| **Tabs/ModeControl** | M3 `role=tablist` bar; selected thumb slides; 44px; `aria-selected` | 4 competing tab idioms |
| **StatusChip** | `rounded-lg px-2 py-0.5 inline-flex gap-1.5 font-label-caps text-[10px] uppercase` + **6px dot**; one STATUS_CHIP map (11 statuses) | 5 private chip sets |
| **EmptyState** | 64px icon circle + curved-stroke illustration + title + body + optional CTA in `rounded-3xl bg-surface-container-lowest p-12` | 4 divergent shapes |
| **DialogShell** | `bg-black/60 backdrop-blur-sm` + `rounded-3xl bg-surface-container-lowest border shadow-2xl`; icon-tile + title + X; sticky footer; **focus trap + restore + Escape + aria-modal** (template: LaunchToDocModal) | every untrapped modal |
| **WalletLine** | Coins + mono credits (+ token count) — ONE component | 4 duplicate renderings |
| **AvatarWidget** | rounded-full; `avatarUrl` when set else first letter; 40px/44px hit | letter-only avatars |
| **Kbd** · **StatusDot** | mono 10px key chip · 6px sem dot | raw kbd; decorative dots |
| **MobileSheet** | bottom-sheet state machine (see §2.6): drag handle, scrim, snap/close thresholds, trap, drag-dismiss; `rounded-t-3xl max-h-82dvh` | full-screen drawers/panels |
| **StickyBar** | variant A global 5-slot / B detail 3-action / C chat composer; glass + `pb-safe` | ad-hoc fixed bars |
| **ChipScroller** | horizontal scroll + edge fades + snap + active-into-view | ad-hoc scroll rows |

---

## 2. GLOBAL CONVENTIONS

- **Scaffold utils:** `page-pad`, `page-max` (1200px), `page-title`, `page-sub` — kills the 7 competing widths/gutters (1400/1248/1440/7xl/6xl/4xl).
- **Card hover:** `border-outline-variant/20 → /50 transition-all` + 1px lift — and ONLY under `(hover: hover) and (pointer: fine)`; touch uses pressed state.
- **Error (one rule):** inline strip `bg-error-container/15 border-error/30 rounded-xl p-3 text-error font-code-sm` + optional Retry. `alert()`/`confirm()` banned; silent catches banned.
- **Loading (one rule):** shimmer skeletons for content; label-caps + spinner for actions.
- **Notices (one rule):** `role="status"` toast bottom-right 4s (primary/40 or error border).

### 2.6 RESPONSIVE & TOUCH MATRIX (the rulebook for every screen)

**Breakpoint ladder** (Tailwind defaults; our meanings):

| Scope | Width | Device | Rules |
|---|---|---|---|
| `base` | 320–389 | iPhone SE / small Androids / folded-outer | single column; sheets; no hover; 16px inputs; `pb-safe` everywhere |
| `sm` | 390–767 | standard phones + phone landscape | 2-col begins where sensible; bottom bar; composer adaptive (see landscape) |
| `md` | 768–1023 | **large phones, iPad mini / 8" tablet portrait** | dashboard 3-col grid arrives; sidebar compact (icons) OR bottom bar — pick ONE pattern per page: **bottom bar stays, sidebar stays hidden until lg**; card grids 2–3 col; tables → cards |
| `lg` | 1024–1279 | **iPad Air/Pro 10.9–12.9" landscape, small laptops (some touch)** | FULL sidebar + topbar search pill; bottom bar hides; **POINTER COEXISTENCE RULE**: hover styles must never gate information (no hover-only tooltips; both touch and mouse work); 44px targets even with a pointer — Apple pencil/fingers are common |
| `xl` | 1280–1535 | desktop standard | 3-pane layouts allowed (My Agent configs sidebar at xl) |
| `2xl` | 1536+ | wide desktop | content capped at 1200px; grid max 4 col |

**Orientation & keyboard:**
- **Phone landscape (≤820px tall):** bottom bar keeps all slots but compresses to `py-1.5`; sheets cap at `75dvh`; hero sections center-left, no two-pane stacking; the floating composer must ride ABOVE the on-screen keyboard (`visualViewport` listeners; viewport meta `interactive-widget=resizes-content`) — never under it, never covering the input's caret.
- **Tablet split-view / Stage Manager:** nothing fixed-width; all layouts fluid (percent/grid, no absolute anchor positions).

**Pointer & touch:**
- Hover effects ONLY under `(hover: hover) and (pointer: fine)`; touch gets `:active` pressed states instead.
- No hover-dependent information: tooltips always paired with inline labels; icons always have `aria-label`.
- Tap targets ≥44px with ≥8px separation; larger on iOS (48px bars).
- Long-press reserved for native; all primary actions are single-tap.

**Safe areas & chrome physics:**
- `viewport-fit=cover`; every bottom-attached element (bottom bar, action bar, composer, sheets) gets `pb-[env(safe-area-inset-bottom)]`; topbar `pt-[env(safe-area-inset-top)]` on notched devices; sheets/drawers respect left/right insets in landscape notch.
- Sticky headers: shadow appears on scroll (threshold 8px); anchors get `scroll-margin-top` = header height + 8.

**The MOBILE COMPONENT STATE MACHINES** (every one designed, every one of these states on the component = a Stitch frame):
1. **Bottom sheet:** `closed → dragging → snapping (close if dragged >40% or flung down, else spring open) → open`; internal drag with header dim at top; scrim tap / Escape / back-button / ✕ close; focus trap while open; `aria-modal`; when content is long: header sticky + body scroll + footer pinned INSIDE the sheet; heights per use (`max-h-[82dvh]` configs, `80dvh` permission, `92dvh` import flow).
2. **Bottom bar (variant A):** idle → item active (`aria-current`) → lifted (blur + border on scroll) → More-popover open; never hidden; 5 slots fixed order; ≥48px.
3. **Detail action bar (variant B):** replaces A on detail screens; 3 equal ≥48px glass buttons; states per button (loading/disabled/success).
4. **Chat composer (variant C):** collapsed → focused → keyboard-lifted (rides visualViewport) → streaming (send becomes Stop; toolbar disabled) → error line + Retry row → mic states (idle/recording/pulse/unsupported-hidden); attachment tray open/closed; `pb-safe`.
5. **Drawer:** closed → opening (spring) → open + scrim → closing; scroll-lock; `aria-expanded` on trigger; close on nav/scrim/Escape; focus returns to trigger.
6. **Chip scroller:** resting → edge fades → active chip auto-scrolled into view → snap to nearest chip; no hover on touch.
7. **Disclosure (accordion/collapsible):** collapsed/expanded + `aria-expanded` + chevron rotate + scroll-into-view on open + first item open by default.
8. **Sticky mobile header:** default → compact after scroll (title + primary icon only) — no oversized chrome.

### 2.7 UNIVERSAL STATE CHECKLIST (minimum for EVERY screen)

Every screen/component must design **all applicable** of: `loading (skeleton)` · `loaded/populated` · `empty` (with CTA) · `error` (+ Retry) · `partial` (some sections failed) · `stale` (data older than X shown with timestamp) · `offline` (banner; last-known data still visible) · `unauthorized/expired` · `permission-denied` · `demo-mode` (labeled ribbon on demo data) · `read-only` (views vs modifiers) · `busy/disabled` (in-flight actions) · `success` (post-action confirmation) · `long-content` (truncation + expand) · `huge` (20+ rows: pagination, not infinite scroll) · keyboard-focus pass · dark AND light · reduced-motion. Instance role variants: guest / new-user / trial / active / admin — each screen lists which apply.

---

## 3. THE COMPLETE SCREEN INVENTORY

### 3.1 CHROME & NAVIGATION

#### 3.1.1 App Shell frame
**Anatomy:** topbar 64px sticky glass · sidebar 256px (fixed, z-40) · main `page-max page-pad pb-24 md:pb-12`. **Variants:** sidebar expanded / collapsed–90px (persist `helpotron_sidebar_collapsed`, chevron control with floating badge when collapsed) / admin (Admin divider) / mobile (→ 3.1.2). **States:** scrolled (topbar shadow), offline (mono dot in footer), light/dark, keyboard-focus pass, active nav auto-scrolled into view. **Buttons:** NEW STUDY SESSION (primary, glow) · per-nav 44px · collapse chevron · avatar. **Mobile/tablet:** <lg → drawer + bottom bar (§3.1.2/3); lg+ full sidebar; iPad pointer = hover works but rows stay 44px.
**REGEN PROMPT:** see 3.1.2 combined prompt below.

#### 3.1.2 Mobile drawer (slide-over)
**States (machine §2.6.5):** closed / spring-opening / open+scrim / closing; per-row hover (fine-pointer only) + pressed; brand area; CTA full-width; footer (WalletLine chip → Billing, Privacy, Sign out); row click = close→navigate; focus return to hamburger. **Variants:** with/without WalletLine (guest: Sign in row instead). **Tablet:** same at <lg; ≥lg never rendered.

#### 3.1.3 Mobile bottom bar (variant A)
**States:** idle · per-item active (`bg-primary-container text-on-primary-container font-semibold`, NO scale) · lifted (blur on scroll) · More popover open (sheet above, `aria-expanded`) · disabled item (admin-only: hidden entirely). Items: Home / Agent / Insights / History / More — each `min-h-[44px] min-w-[44px]` (fix: 4/5 are <44 today). **Variants:** standard 5-slot; "review pending" amber dot on Home when a pending_approval exists (honest badge, not fake).

#### 3.1.4 Quick-settings popover
**Anatomy:** `w-80 rounded-2xl bg-surface-container-low border shadow-2xl`, 120ms pop, trap+restore. **Variants:** desktop popover / mobile sheet (≤sm: MobileSheet, height-fit). **States:** avatar+name+public_id row · WalletLine · Theme segmented (Dark/Light/Auto) · **AI effort segmented (Low/Balanced/High — the one per-session dial)** · divider · Settings / Notifications / Privacy / Sign out (error hover) · build-id mono footer. **Excluded:** phone editor, avatar upload, academic level. **Buttons:** 44px rows; segmented 40px.

#### 3.1.5 Command palette
**States:** closed/⌘K toggle · open (trap, restore, theme-aware — today hardcoded dark glass) · empty-query (recents ≤4 + slash suggestions) · typing (grouped results) · empty-result (`SearchX` + honest "live mode search covers this screen — try a slash command" + kbd chips) · admin-gated (`/admin`, `/monitors` hidden for non-admin) · footer dynamic `{N} slash commands`. Variants: desktop centered / mobile near-top sheet. **Buttons:** kbd chips; row 44px.

#### 3.1.6 Footer
Mono 11px centered: © 2026 · Privacy Policy · Terms of Service (hover underline). `pb` clearance lives on main, never the footer. Mobile: 2-line wrap.

#### 3.1.7 Notifications — bell panel (popover)
**States:** unread badge (`bg-error` ring-2 ring-surface, count caps 9+) · rows unread (primary 6px dot) / read (outline dot) · row click marks read · **demo empty** ("You're all caught up", CheckCircle2 — no ✦) · **live empty** (`BellOff` + "No notifications yet — we'll ping you here when a draft is ready." + "Manage preferences →") · panel open/closed (trap, esc) · "View all" → activity:notifications. Mobile: `fixed left-3 right-3 top-20` + scrim. **One read store** (`helpotron_notifications_read`) — bell and view agree.

#### 3.1.8 Notifications screen
**Anatomy:** header + tabs (All / Unread / Preferences) + feed rows. **States:** loading/empty(above)/error+Retry/unread-only filter/specify channel chips (in-app/email/Telegram) · long-feed pagination · **Preferences tab = the real Settings notifications panel** (single source). Mobile: cards; tablet: 2-col (feed + prefs rail at lg).

---

### 3.2 AUTH & ACCOUNT ENTRY

#### 3.2.1 Auth modal — Sign in pane
**Anatomy:** two-pane at ≥lg (left brand: tone blobs, logo, "Master your coursework.", trust chips, footer note; right card `max-w-[440px] rounded-2xl p-8`). Mobile: single centered card, small logo, Turnstile BELOW form (widget is wide — pushes submit off-fold today). **Variants (10):** new user / returning user · sign-in vs create-account pane · guest deep-link mode · banned (error panel w/ out-of-pocket support line) · expired session (→ 3.2.5) · trial/plan badge if logged out after lapsed sub. **States:** pristine/typing/focused-visible/submitting (spinner, disabled)/server-error (inline strip + shake on field)/success (transition). **Buttons:** PUBLIC ID field (eye toggle — **never "Username or Email"**), Turnstile chip, full-width h-11 primary "Sign in →", "New to Helpotron? Create an account", "Forgot password?" → Real RecoveryFlowModal (**genuine: the fake reset tab dies**). Keyboard: Enter submits; `autocomplete` attrs.

#### 3.2.2 Create account pane
**Variants:** with/without referral code chip · consent checkbox (required, honest copy) · captcha failure state · email-vs-public-ID copy guard (product = Public ID only). **States:** same input states + consent-invalid inline + duplicate-ID error. Mobile stacked.

#### 3.2.3 2FA — segmented OTP
**Anatomy:** 6 cells `w-12 h-14 font-tabular-stat bg-surface-container-low border-outline-variant rounded-xl focus:border-primary focus:ring-2 ring-primary/50`, inputMode numeric, 3+3 dash, auto-advance + backspace-back + paste-spread, hidden mirror input (state contract). **Variants:** TOTP vs SMS (method caption from real server; **"Hardware / TOTP Synced" fake claim deleted**) · first-time setup (scanner placeholder) · sign-in verify. **States:** typing / full-auto-submit / **error=shake + inline "Wrong code. Please try again."** + "Try again" / resend cooldown 30s (mono countdown) + "Didn't receive a code?" / max-attempts lockout. Mobile: same cells full-width (6×48px), no squeeze.

#### 3.2.4 Recovery flow modal
**States:** channel choice (email / phone / ask-the-developer) → input → sending → sent (honest next-steps) → code → reset → success; error per step; cooldowns; **all wired real, zero fabrications**. Mobile: full-screen sheet.

#### 3.2.5 Session-expiry states
**Variants:** (a) in-app modal "Session expired — log in again" (Lock + primary Sign in) · (b) silent 401 banner for background polls (no modal spam) · (c) full-page re-auth on refresh · each preserves the pending intent (return to the same screen after re-auth).

---

### 3.3 PUBLIC / GUEST

#### 3.3.1 Landing
**Anatomy:** glass header (logo + Features/Guide/Pricing + Sign in + Get Started) · hero (glow + display-xl "Your Academic Co-pilot, Redefined" + gradient accent span; badge "Academic Co-pilot" — **drop "2.0"**; trust chips; floating glass product mock; Start Free Trial glow + Read the Guide) · 3 luminous feature cards (curved-stroke 40px illustrations) · live pricing (3 plans; popular = ring-2 primary/40 + in-card pill; mono token counts; honest "$0.01/token" footnote; **never dies: failures render a muted honest line**) · three-steps band · footer (real links incl. `extension + web` → /extension; "Engineered by Solo Dev Roni" moved here). **Variants:** guest root / deep-link `/features|/pricing|/guide|/terms|/privacy` (real scroll/target + pushState + popstate; `scroll-margin-top 88px`) / post-signup. **States:** hero pristine·scrolled-shadow · pricing loading/failed(honest)/loaded · mock light/dark · reduced-motion (glow static) · mobile: left-aligned, stacked CTAs, 1-col.

#### 3.3.2 Public Guide
= 3.16 in guest mode: CTA band swaps to "Create account" + "See plans"; no shell chrome; same layout rules.

#### 3.3.3 Public Privacy / 3.3.4 Public ToS
= 3.17 / 3.18 layouts in guest mode (max-w-5xl, no shell). **3.3.5 Public Extension** = 3.15 with `public` prop (strips install CTA, keeps copyable pill; honest lanes).

#### 3.3.6 Cookie banner + consent prefs
**States:** visible / dismissed (localStorage only) / accepted-all / necessary-only · revert path (Settings → privacy → "cookie preferences"). **Anatomy:** glass card bottom (`inset-x-4 sm:inset-x-6 rounded-2xl backdrop-blur-xl border p-5 shadow-2xl`); **2 honest buttons** — "Necessary only" secondary + "Accept all" primary (**"Accept All & Support Dev" deleted** — patronage as consent; implies third-party cookies that don't exist); copy "We use essential cookies for sign-in and optional anonymous usage analytics. We never sell student data." **Shows on the anonymous landing too.** Mobile: stacked full-width.

---

### 3.4 HOME DASHBOARD

#### 3.4.1 Dashboard content column
**Anatomy:** header ("Active Subjects" + sub + New Subject secondary + Export all) · per-subject sections · grids. **Variants:** 0 subjects (entirely-empty: big EmptyState + Import Assignment primary) · 1..N subjects · "General & Electives" synthetic section (only when unassigned cards exist) · admin (no change) · new-user (onboarding pointer card + guide link). **States:** first-load skeletons (2–3 section shimmers) · column empty (dashed) · **fetch error = error card + Retry (NEVER six fake-empty subjects)** · partial (one section failed → inline strip, others intact) · stale (last-updated mono line) · card variants: in-progress / pending (red-bordered, full-width Review Now) / due-chip variants (due, overdue red) · dedupe (explicit subject identity — today keyword-heuristics render one card in 2 sections) · **bucket fix: completed is NOT in "IN PROGRESS (N)"** · count line honest `{N} in progress · {M} pending approval` (drop "active"). **Buttons:** per-card Download (spinner), action per `actionLabel()` (Review Now / View Draft / Continue), whole-card clickable (role=button, keyboard), History pointer card. **Mobile:** 1-col; actions 44px; tablet (768): 2-col grid; (1024): 3-col md spec below. **Tablet grid:** `md:grid-cols-3`, In Progress `md:col-span-2`, Pending `md:col-span-1` (fixes ragged half-width hole 768–1023).
**REGEN PROMPT:** "Regenerate the Home content column into LUMINOUS GLASS (dark-first, M3, lucide): 'Active Subjects' header + subtitle + New Subject + export; per-subject section with 48px tinted orb tile (sem colors, Ruler/BookOpen/Landmark/Code2/Dna/Brain, soft glow), honest count line, SUBJECT SETTINGS label-caps button with amber dot when overridden, EXPORT ALL, Trash2 for custom; 11-status chip set with 6px dots; bordered pending cards + full-width Review Now; due chips with red overdue variant; Stitch empty subject state ('Ready to analyze some texts?' + curved icon circle + Import Assignment); fetch-error card + Retry; shimmer skeletons; Submission Ledger pointer card. Also produce: 390px single-column, 768px two-column, 1024px three-column variants, and the empty/error states for each."

#### 3.4.2 Subject settings disclosure (Level 1 config)
**Variants:** collapsed (button + amber dot + 1-line meta "Educational: On · Personality: The Scholar · Min score: 85 · Effort: 6/10" or "Using global defaults") / expanded / per-subject overrides present / clean. **States/components:** 6 widgets (§4.3) each with 3-state chips (Default·Override·Reset), `aria-expanded`, 2-col grid (1-col mobile), Reset-to-Global disabled-when-clean, Done. **Buttons:** SlidersHorizontal 44px label-caps; Reset; Done.

#### 3.4.3 Create-subject dialog
**Variants:** scratch creation · duplicate-name conflict · edit existing. **States:** pristine/typing/invalid(name len)/submitting/server-error/success→new section appears. **Controls:** title · **lucide icon select** (12 glyphs) · **8-color sem palette swatches** (44px) · description · Escape/backdrop/trap (replaces jump-in panel + 7-emoji picker).

#### 3.4.4 StatusChip set (11)
Matrix (6px dot, sem tokens): pending_approval=amber · not_started=neutral · in_progress=blue · paused=slate · humanizing=cyan · ready_for_review=amber · completed=green · submitted=cyan · graded=deepgreen · tracked=indigo · archived=gray · unknown→neutral NOT STARTED. **Never "Drafting" for not_started/paused.** Sizes: default / compact (meta rows). Mobile: truncates safely.

#### 3.4.5 Due/overdue chip
Variants: due (`border-outline-variant/30` + Calendar 14) · today ("Due today" amber) · overdue (`border-error/30 text-error bg-error/10` + AlertTriangle "Overdue Oct 24"). Stacking: with StatusChip row, wraps on mobile.

---

### 3.5 ASSIGNMENT DETAIL ("bubble")

#### 3.5.1 Header + action row
**Variants:** per-status × per-ownership · enrolled vs dropped · archived (banner + View in History) · team vs solo. **States:** overdue chip (real `due_date < today` — missing today), ID mono, course chip, back link. **Buttons:** Export · Launch to Doc · overflow (Archive, config) · Mark as done (primary). Mobile: header stacks; action row → sticky bar B.

#### 3.5.2 Direction picker
**Variants:** none-selected (hero invitation) · selection (completion) · custom tile (dashed → inline textarea + honest copy "…automatically sent to the Data Lake and we'll build it.") · direction-card horizontal overflow at ≤sm (chips scroller). **States:** per-tile default/hover(fine)/selected (`border-2 border-primary bg-primary-container/5`)/pressed/disabled(finished)/focus-visible; `role="radiogroup"` `aria-pressed`. 6 tiles 2-col; 44px+.

#### 3.5.3 Agent activity + timeline + Stop
**Variants:** no team (empty state) · pending-dir ("starts on…") · running · completed · interrupted (halted handle) · failed (error node + Retry). **States:** headline `{overall}%` mono + `h-2` progressbar `aria-valuenow` · vertical timeline nodes (completed primary+Check / running pulse ring / failed error+X / pending empty) — `aria-live="polite"` · Stop Execution 3 states (armed `bg-error/10 hover:bg-error` / Halted / Finished disabled). Mobile: nodes 24px fine; panel full-width.

#### 3.5.4 Working draft card
**Variants:** draft exists (reading-mode: prose, copy→Check 2s, Launch, Export) · materials-only (kind+date+Open rows) · empty ("Nothing generated yet — pick a direction or ask the team." + Pick-a-direction) · failed ("no work generated" — honest, no green toast) · exported (mono confirmation strip) · archived (banner). **States:** loading skeleton · error + Retry · long-content (max-h + expand). **Bottom bar:** ghost "Move to history" + primary "Mark as done" — no native confirm (styled in-card confirm strip on archive).

#### 3.5.5 Chat stream (shared with 3.6.1)
**States (all):** idle · streaming (token chunks) · thinking bubble (mono reasoning, minimize, Stop) · tool-running (mono chips — backend-gated, never fabricated) · paused/stopped · **error bubble** (`bg-error-container/20 text-error` + Retry, retry removes the row) · optimistic bubble (remove-on-fail) · empty (session-start pill) · submitted/complete (agent done chip) · auto-scroll (ArrowDown anchor when scrolled up) · `aria-live` feed. **Variants:** agent vs user vs system-event vs assignment-event (true chips: New blue / Due soon amber / Completed green).

#### 3.5.6 Agent settings panel (Level 2 config)
**Anatomy:** "Agent settings" + summary line ("Effort 5 · Detection on · Writing: Lab report · Inherits Biology") + chevron; collapsed default. **Variants:** inherited-only / subject-override / assignment-override (provenance trail chips `Default → {Subject} → {Assignment}`). **Plus assignment-only widgets:** "Ask me before" chips (Submit to LMS / Send messages / Big spend / Flagship model) · due-subject editor (free text = subject binding) · citation picker · footer "Editing here overrides {subject} for this assignment only."

#### 3.5.7 Prompt / Rubric / Files / Materials cards
**Anatomy:** prompt (source copy + instructions) · rubric (semantics unchanged) · files (clickable when URLs exist) · saved materials. **States:** truncated long text (expand) · missing rubric (honest line, no fake) · empty (dashed + Add) · loading skeleton per card.

---

### 3.6 MY AGENT

#### 3.6.1 Chat canvas + composer
**Anatomy:** header (44px avatar, thread title, Co-pilot Active, THE single MANUAL/AUTO-PILOT/YOLO segment, identity pill + chevron, Compact) · messages · glass composer (attach/mic/autosize/circular send 44px, `pb-safe`). **Variants:** empty thread (session-start pill + suggestion chips) · conversation (readable history) · co-pilot mode (auto-run look) · locked (legacy permissions) · **mobile: composer floats above bottom bar with visualViewport keyboard lift (§2.6.4)** · `promptMinimized` implemented or deleted (dead today). **States:** §3.5.5 full list + typing dots → stream · mic unsupported (hidden, tooltip) · attachments tray · disclaimer line.

#### 3.6.2 Mode control (permission scope)
**Variants:** MANUAL / AUTO-PILOT / YOLO (amber + `hover:bg-error-container/20`) · pending-approval state (amber dot + "1 action waiting — Review" notice line above composer — replaces banner + 12s poll dual) · mode-change confirmation = toast (NOT a transcript bubble). `role="radiogroup"` `aria-checked`. Mobile: inside controls bottom sheet.

#### 3.6.3 Identity pill + switcher
**Variants:** assigned identity (name + mini avatar) · **no-identity → default "Coach" pill (never null-rendered today)** · switching (sheet lists identities + "+ New identity"). States: hover/pressed/focus; switcher closes and updates pill; per-identity subtitle.

#### 3.6.4 Threads rail + effort dial
**Variants:** empty ("Start a new topic!") · 1..N · pinned group · rename mode (**input OUTSIDE the row button — invalid HTML today**) · active (`aria-current`, auto-scroll). **States:** hover fine-pointer/pressed/selected/rename-invalid · delete confirm inline. **Effort dial:** SESSION EFFORT slider rail-bottom, debounce 400ms, mono readout, Low/Balanced/High capsule — **effort appears ONCE** (the read-only header chip dies; resolved model badge renders in chat header). Mobile: rail → ☰ screen.

#### 3.6.5 Configs sidebar — 4 tabs
**Identities tab:** list (avatar, name, summary) · create/edit modal (DialogShell, focus trap) · **3 starter presets ("The Scholar", "The Editor", "The Coach") — DEFAULT_IDENTITIES=[] is a dead end today**. **Skills tab:** toggle chips (real backend skills only) · skill detail rows. **Memories tab:** list + pin + delete · empty honest. **Rules & Files tab:** rule list editor (same list-editor widget as §4.3) · file rows (linked or pending). All tabs: loading/empty/error+Retry states; M3 surfaces; mobile = bottom sheet per tab (drag-dismiss, `max-h-82dvh`).

#### 3.6.6 Permission modal
**Anatomy:** request context (what agent wants, one line, plain English) + 4 buttons (Approve primary / Always auto-approve secondary / Deny ghost-danger / Write something else ghost → textarea). **Variants:** desktop dialog / mobile sheet. **States:** pending · submitted (disable, spinner) · denied (toast) · edit-request (textarea + send). Focus trap + restore.

#### 3.6.7 Assignment/moment event bubbles
**Variants/truth:** created → "New" sem-blue · due → "Due soon" sem-amber · submitted → "Completed" sem-green (**hard-coded "COMPLETED" chip on every bubble is deleted — 2/3 of bubbles lie today**). States: hover/focus/copy.

---

### 3.7 IMPORT & TOOL MODALS

#### 3.7.1 New Assignment — 4-step flow
**Step 1 URL:** Link2 input `pl-10 h-12` + "Additional context (optional)" + helper + footer "Scrape & Import" (Zap). **Step 2 Importing:** 96px double-ring + sequential checklist (Reading page structure… → Extracting instructions & dates… → Routing to subject…, each → CheckCircle2) + skeleton bars + `aria-live` + Cancel (only if abort is real). **Step 3 Review & Confirm (the missing step):** editable Title + Subject select + **"Auto-routed" Wand2 chip** + Due date + collapsible "Extracted Instructions" (mono) — design BOTH draft-loaded / draft-missing states. **Step 4 Success:** teal tile + CheckCircle2 "Assignment Created — Added to {subject}" + primary "View Assignment". **Variants:** Manual tab (unchanged fields) · insufficient-tokens as **amber tile** (`bg-tertiary-container/10` + Coins + "Add tokens →") NOT a red error (it's HTTP 200) · retry-rubric-error (no focus yank to title) · import-disabled (tab skeletons while flag loads). **States:** per-field pristine/valid/invalid · per-step loading/error/retry · success. **Mobile:** full-screen sheet `max-h-[92dvh]` + drag handle, sticky header, `pb-28` body, 50/50 sticky footer `min-h-[48px]` + safe-area, native date picker. **KEEP the hook-safe wrapper** (commit 547193d).

#### 3.7.2 Launch to Doc modal
M3 restyle of the violet legacy surface (DialogShell, trap = reference implementation); realism controls + WPM + cadence presets + honest "local typing, nothing transmitted" copy unchanged. States: idle/configuring/previewing/launching/success + per-control focus.

#### 3.7.3 Route modal (assign from dump / bulk)
Assign item → assignment or subject; skip; states per-row. Mobile sheet variant. No native confirm anywhere.

---

### 3.8 INSIGHTS & ANALYTICS

#### 3.8.1 Insights Overview
**Anatomy:** mini-KPI row (grid-cols-2 mobile sticky; mono numerals) + **the existing custom visx AreaChart (NEVER swap the library — restyle tokens only: `--chart-line-primary` line + 10%→0 gradient fill, `--chart-grid` grid, M3 tooltip, dots)** + GlassCards. **Variants:** overview / academic progress / recommendations tabs (panels kept mounted — today switching refetches Intelligence). **States:** skeleton (today a bare text card) · error + Retry · empty (mini-card inside panel "No telemetry yet" + Refresh) · all-zero (flat baseline + dot) · honest zeros on 401/network · `role="img"` + aria-label + `aria-busy`; mobile aspectRatio 16/7 (16/5 collides at 390px), `touchAction pan-y`. Mobile: KPI row above tabs, charts full-width.

#### 3.8.2 Academic Progress tab
Same chart family; subject chips filter (sem tints); compare overlay per subject (chips multi-select); states same as 3.8.1 + no-data filter (empty state w/ "study more" CTA).

#### 3.8.3 Recommendations tab
Cards (reason + action); states: loading/empty ("come back after a few sessions")/error. Actions route to Dashboard/Detail.

#### 3.8.4 Intelligence view (M3 port)
M3 cards/sem chips (clean-card/slate die; page currently two-tone); same honest copy; states: loading/empty/error; mobile 1-col.

---

### 3.9 HISTORY

#### 3.9.1 Table + toolbar + tabs
**Anatomy:** header (title + sub + New Assignment + Export dropdown + refresh) · filter toolbar (search + subject select + date-range picker + clear) · segmented Ledger/Archived/All · one table. **Variants/props:** ledger / archived (filterable — today it hides search + misses refetch) / all · status filter chips · date range. **States:** loading skeleton rows · **real error banner + Retry (today silent console.warn → stale list)** · empty (EmptyState + New Assignment) · huge (20+: pagination) · stale (last-updated mono) · long subject names (truncate + tooltip + aria-label). **Buttons:** per-row 44px (export / review / archive) · row hover spotlight (fine-pointer). **Sticky toolbar `top-[64px]`.**

#### 3.9.2 Export dropdown
Variants: CSV (BOM + `\r\n`, Blob+URL, dated filename) / Full JSON archive. States: idle/generating (spinner)/success (toast)/error (strip). Mobile: sheet.

#### 3.9.3 Mobile card list
Card = title block + subject chip + date + StatusChip + export icon; no horizontal scroll; 44px actions; tablet 768: still cards (table ≥1024); search sticky; Archived/All chips scroller.

---

### 3.10 LIBRARY / STUDY TOOLS

#### 3.10.1 Files tab
Lucide tiles in 12×12 sem tint (FileText/FileAudio/Image/Video/BookOpen) — emoji dies; "Upload materials" **actually routes to Dump** (today `hash=''` no-op). States: empty (drop CTA), loading, error, grid 2-col mobile / 3-col md / 4-col lg.

#### 3.10.2 Saved tab
Same tiles + saved-date mono + unsave (44px). States: empty honest.

#### 3.10.3 Flashcards player (NEW functionality — today doesn't exist; Stitch `study_tools_v3_1/2` = source)
**States:** front / flip (click/space, **CSS 3D flip + reduced-motion fallback**) / prev-next (←/→) / shuffle toggle (`aria-pressed`) / known-unknown marking (F/1/2) / progress `n/total` mono / all-done summary / empty deck. Glass card + teal accent edge; end-of-deck restart.

#### 3.10.4 Quiz (NEW)
**States:** question → answered-correct (sem-green tint) / answered-wrong (error tint) → explanation reveal → next → summary (score % bar mono) → review list → retry-wrong-only. Difficulty affects hints (§3.10.5). `aria-live` per question.

#### 3.10.5 Difficulty + Mastery + Streak (NEW)
Segmented easy/medium/hard per deck (hard hides hints until submit); per-material mastery ring (SVG donut, primary); streak chip ONLY when real; last-practiced timeAgo mono. States: none-practiced (ring 0), in-progress, mastered.

#### 3.10.6 My Materials cards
Kill fixed `h-[480px]` nested scroll → natural min-h + Expand/Collapse, 4-line preview clamp, "Open study mode" primary, `model_used` mono pill. States: collapsed/expanded/error retry/empty.

#### 3.10.7 Calendar
**Real due dates only — demo events never render in prod**; day cells ≥10px; today ring; pending dot; due overdue tint; empty honest ("No upcoming due dates"); month nav (mobile: week strip).

---

### 3.11 CREDITS & BILLING

#### 3.11.1 Balance strip + tab bar
Balance ALWAYS visible above tabs (topbar copy hidden on mobile — mobile needs it here): big mono number + "N tokens" + refill shortcut. Loading state (today shows 0.00 until resolve).

#### 3.11.2 Plans & Top-ups + checkout
**Full M3 restyle** (worst cross-brand offender: `white/4`, `slate-*`, purple `--accent`, `glow-accent`, `clean-card` die). Tier cards glass `rounded-3xl p-6`; popular `border-primary/40 bg-primary/10` + pill; price `font-tabular-stat text-3xl`; checks sem-green; "NO FEATURE GATING" → sem-deepgreen glass strip; CTA primary glow "Choose Pro" + Lock on premium. Annual → real segmented monthly/yearly. **Prototype notice:** reword "Checkout is a prototype — no payment will be charged" BELOW price terms (today a contradiction sits above "2FA Checkout" CTAs). **Kill fake success:** `handleTopUp` "Top-up initiated" with nothing behind it → honest server-reported state or remove. 2FA checkout modal → DialogShell (steps, trap, Enter submits). **States:** balance loading · top-up pending/error (real) · plan changed (toast) · insufficient (tile). Mobile: tier cards stack, full-width CTAs.

#### 3.11.3 Earn / Referral
M3; real endpoints; honest per-plan rewards (2/5/10) + 30%/15% copy; share row (copy button 44px + feedback); states: not-started / referred-N / earned (mono).

#### 3.11.4 Leaderboard
M3 chips; real data only; own row pinned; states: empty ("no one has earned yet"), loading, ties.

#### 3.11.5 Cost tab
**Wire the dead back-nav target.** Line chart (same chart component) + per-category rows mono; states: no-data honest.

---

### 3.12 DATA LAKE

**Anatomy:** contribution panel (balance mono) · form (title + description + optional attachment) · my entries (table) · valuation panel. **States:** skeleton rows first load (today flashes empty) · **error → inline strip + Retry (no alert())** · submitted success (role=status) · pending status pill (sem-amber "Pending Review", Clock lucide — ✅/⏳ die) · implemented pill (sem-green, CheckCircle2) · **responsive cards on mobile** (title, category chip, status pill, 2×2 mono score grid) · **"Export my entries (.json)" ghost** · honest copy kept (1000 micro-credits = 1 credit; opt-in/out; Pending → awarded when used) · `aria-live` on valuation.

---

### 3.13 ASSIGNMENT DUMP

**Signature: hero dropzone — glass, generous, the front door.** **Anatomy (order):** (1) **Dump card** (dropzone states: idle / drag-over (primary glow ring) / uploading (progress) / error (strip+retry) / success (chip)) + paste/link + record lecture (record idle/recording pulse/stop ≥44px) · (2) Queue list with filters · (3) per-item action sheet (mobile). **Variants:** fresh (CTA "Upload a file to get started" — real, not generic) · populated · all-dumped. **States:** per-item chips (status), per-filter empty (with CTA), card hover standardized (`border-primary/50`; kills `hover:border-primary/40` randomizer), **false-success dead** (finalize returned nothing → honest "no work generated"). **Dump All:** **2-step confirm "Dump all N items for ~$X.XX"** + per-item skip checkboxes + cancel (today one click = unapproved spend incl. unmatched). **Buttons:** shared primitives (8 hand-rolled recipes die); delete = inline sheet (no native confirm); errors inline (no alert ×4); option icons → lucide (PenLine/BookOpen/Brain/Layers); inline `<style>` AURORA_CHIP_TINTS → index.css; toasts → role=status. Mobile: card footers flex-wrap, ≥44px everywhere.

---

### 3.14 EXTENSION INSTALL

**Regenerate entirely in M3/LUMINOUS GLASS** (today: slate-900/white + indigo-violet gradient; hero glass stays dark in light theme). Hero `rounded-3xl` glass + badge trio (`primary/15` Web Store · `sem-green/15` Manifest V3 · `sem-cyan/15` 100% Local) + h1 with teal accent (purple dies). **Version honesty:** ONE live value + skeleton + error state (today hardcoded "v2.5.1" vs "2.0.1" fallback = two sources). **Lanes:** Chrome CWS = real primary; Firefox = "Experimental" card (dev-runtime loader truth); Safari = "Developer preview" or removed (needs Xcode). Steps = 3 M3 cards; FAQ = `<details>` accordions; copyable `chrome://extensions` pill + Server Sync Origin kept. **Public/guest variant** for `/extension` (strips install CTA). Mobile: stacked CTAs, full-width pill.

---

### 3.15 GUIDE

**Content ALREADY REWRITTEN (16 sections + FAQ) — layout regenerates ONLY.** Two-col ≥1280 (sticky left rail 260px, IntersectionObserver marker) + main `max-w-[880px]`; content verbatim (`{id, icon, title, chip, what, steps[], tips[], faqs?}`). **States/controls:** search/filter combobox (⌘K) with "No match" (Message Admin action) · section chips grid + "Start here" pill · first card expanded · accordion cards (40px icon tile, summary, numbered steps, pro tips) · FAQ accordion (10) · CTA band ("Message Admin" primary + "Ask My Agent" secondary; public: Create account + See plans). **Variants:** guest/typed-content-empty. **Mobile:** compact header, sticky chip scroller w/ fade edges, p-5 cards, 32px icons, per-question disclosure, full-width 44px CTAs. Tablet: 2-col card grid 768–1279.

---

### 3.16 PRIVACY

**Content ALREADY REWRITTEN (6 honest sections) — layout regenerates.** 6 sections (§3.15 brief in earlier spec): accordion rows (12) + pinned "Find a field?" filter · provider CARDS (logomark + role + expandable "what they receive") + highlighted **"What stays on your machine"** card · storage tiles + retention timeline (24h/7d/until you delete) · **two big primary buttons (Export my data / Delete my account)** + rights grid · COPPA/FERPA + integrity cards · security checklist + contact. **Never promise more than the code does** (no "zero retention"/"AES-256 at rest"/vendor badges). One-liner: "we store it, we use it, you can delete it". Mobile: sticky horizontal section pills, full-width accordion cards, actions stacked top of §4. Variants: guest (public) vs signed-in (action buttons live).

---

### 3.17 TERMS OF SERVICE

**Content ALREADY REWRITTEN (13 honest sections) — layout regenerates.** Sticky hero (icon tile + H1 + Last updated/Company/city + Back) · 1–2 sentence intro · jump bar (13 accent-coded pills; mobile sticky scroller) · accent glyph + "N. Title" + body + tinted highlight sub-panels · contact glass card (mono legal line, mailto legal@/support@). **All 13 sections + real semantics kept verbatim** (0.01$/token; plan prices/credits; auto-renew + cancel-to-Basic; no cash value; failed-task auto-refund; no automated money refunds — support review, law applies; forfeiture on deletion; school academic policy; no undetectability claim; neutral governing law). Mobile: single col, max-w-5xl, per-section `<details>`.

---

### 3.18 SETTINGS — BARE BONES

**6 sections, ~45 settings (from ~120/17).** §5 matrix drives it. **Anatomy:** one screen, 6 glass section cards (Account · Appearance & Display (**live preview tile** + merged accessibility) · Notifications flat panel (channels + real senders) · Privacy & Security · Credits read-only card · Integrations Telegram flow). **Variants:** new-user (defaults highlighted) · admin (extra link) · guest (none — auth-first). **States:** per-field pristine/invalid/submitting/server-error · save = toast (auto-save with explicit "Saved" mono tick) · reset row. **Mobile:** sections as accordions, preview tile full-width; tablet: 2-col at lg. **The pain:** today 17 sections + nested wizards + quick-configs + AI sliders — ALL complex config moved to §4/§5 destinations; the page becomes calm.
**REGEN PROMPT:** "Regenerate the Settings page as a BARE-BONES 6-section single screen (Account; Appearance & Display with live preview tile; Notifications flat panel; Privacy & Security; Credits & Billing read-only; Integrations Telegram flow). LUMINOUS GLASS, M3 tokens, lucide, 44px targets, label-caps headers, rounded-2xl section cards, calm — no nested subsections beyond single disclosure rows. Also: 390px stacked accordions, 768px two-column."

---

### 3.19 CONTROL CENTER (admin)

**Signature: ops console — Who needs help? What's broken? What am I spending?** 3 tabs: **Users & Operations** (default) / **Cost** / **Tools**. **Users & Ops:** search → **"Needs attention" strip** (open inquiries, pending moderation, near-cap, recent bans) → simplified table (alias, plan chip, mono token statbar, last activity, ONE ⋯ menu — change plan/adjust credits/reset password/ban/delete; destructive grouped in error-container) · **jargon dies** ("act-as-user" behind dev accordion; tempban → "Ban (24h)"). **Cost:** merged (Monitors duplicate dies) — today's spend, per-day sparkline, per-plan cost, plain-English feature costs. **Tools:** 2-col progressive disclosure — Engine status (real nodes or "no telemetry", NEVER demo mock nodes), Model Scorecards, Storage, Inquiries, Agent command box (plain command + help). **Variants:** admin-only / no-data (each tool honest-empty) / moderation flag. **Mobile:** bottom-bar tabs, single-col user cards 88px surface, no bulk ops. **Kill:** "Helpotron Master Admin Panel" chrome, 7-sub-tab flood, SystemMap demo fallback.

---

### 3.20 MONITORS

**Feedback-first** (the daily job): (1) **Feedback & alerts** (queue + resolve 44px + needs-attention chips; default tab) · (2) Traffic one-liner (total/rate/**error %** stat strip; code-bar → error-rate chip) · (3) Data Lake + Activity read-only cards · (4) **Cost removed** (→ Control Center). Plain English everywhere; p95 kept + gloss. 30s auto-poll (no flicker — dim, never re-shimmer). Mobile: 1-col, full-width rows, no hover dependencies.

---

### 3.21 ERROR & EMPTY STATE FAMILY

**Anatomy (kept motif — dot grid + orbit rings + Compass, the best-conforming surface):** `<ErrorState type>`: 404 ("Lost in the stacks?") · network ("Can't reach the helper server" + retry, WifiOff) · 401 ("Session expired — log in again", Lock) · 500/502 ("Our engines hiccuped — retry", RefreshCw). **Variants:** each type × dark/light (dot grid `var(--st-outline)` @0.6 — currentColor breaks in light today) × reduced-motion (rings static) × mobile (p-6, full-width CTA). Secondary "Back to previous page" ghost. `role="main"`.

### 3.22 OVERLAY KITCHEN (global)

Toast (role=status, 4s, spring, stacked max 3) · inline strips (per §2 rule) · demo-mode ribbon (label anywhere demo data shows) · offline banner (mono "You're offline — showing last synced" + retry) · consent banner (§3.3.6) · destructive-confirm overlays (styled, never native). Each with enter/exit states + reduced-motion + safe-area for bottom-anchored variants.

### 3.23 DEMO-MODE PRESENTATION

**Every demo surface (auth'd demo mode, palette "recently used", Library demo tabs, SystemMap mock nodes) gets ONE labeled treatment:** auto ribbon chip (FlaskConical lucide + "Demo data", sem-amber) at the panel corner; live mode NEVER borrows it. Demo shell may demo ANY screen; live shell renders only real states (§3.5.5 rule).

---

## 4. THE 3-LEVEL CONFIG EXPERIENCE (Bob's decree — UI only)

### 4.1 The model

```
Level 0  GLOBAL DEFAULTS — "Defaults" panel, gear on the Dashboard header (NOT in Settings)
   ▼  every field at every level shows its inherited value
Level 1  SUBJECT — per-subject card gear → inline disclosure panel on the Dashboard
   ▼
Level 2  ASSIGNMENT — "Agent settings" section in the assignment bubble
```

**Precedence: assignment > subject > global; one effective value per setting.** The client already resolves scoped values (most-specific-wins) — the UI builds the surfaces below and renders `{value, level}` pairs (cyan "Inherited" vs amber "Override") that come straight from that resolver; the UI never computes precedence itself. All persistence = backend (agy plan).

### 4.2 Config inventory (everything, not just a few)

| Config | Global | Subject | Assignment |
|---|---|---|---|
| Educational Mode (ON = fully humanized / OFF = raw) | ✅ | ✅ | ✅ |
| Agent Personality (identity presets + custom) | ✅ | ✅ | ✅ |
| AI name / custom instructions | ✅ | ✅ | ✅ |
| Model Effort (Low / Balanced / High) | ✅ | ✅ | ✅ |
| Humanizer Skill · AI Detection Standard | ✅ | ✅ | ✅ |
| Minimum Human Score (slider 50–100) | ✅ | ✅ | ✅ |
| Detector chips (Sapling / Pangram) | ✅ | ✅ | ✅ |
| Write Like a Sample · Writing Style Examples | ✅ | ✅ | ✅ |
| Rules list · Writing profile / Citation style | ✅ | ✅ | ✅ |
| Auto-routing | ✅ | ✅ | ✅ |
| Ask me before: Submit to LMS / Send messages / Big spend / Flagship model | — | — | ✅ |
| Due-subject binding (which bubble this belongs to) | — | — | ✅ |
| Subject level (skill) · image · description | — | ✅ | — |

### 4.3 The widget kit (ONE primitive at all 3 levels)

Every row = label-caps label + control + **3-state chip: `Default` (inherited, dimmed) → `Override` (control enabled, accent tint, amber chip) → `Reset` (✕)**. Controls: toggle · chip-row segmented · slider w/ mono readout · select · textarea/list editor. `aria-expanded` disclosure only; controls ≥44px.

**Subject panel** (Dashboard inline, between subject header and grid): "SUBJECT SETTINGS" label-caps + `[Reset to Global]` (disabled when clean) + `[Done]`; 6 widgets 2-col (1-col mobile): Educational Mode segmented (default ON) · Agent Personality select (+ "Default (Global)") · Human Score Minimum stepper+slider 50–100 ("Below this score, output is reworked.") · Writing Style Examples list editor (+Add, Trash2 44px) · Rules list editor · Effort 5-level (LOW/LOW-MID/BALANCED/HIGH-MID/HIGH; hint "Higher effort = better writing, more compute").

**Collapsed affordance:** `[SlidersHorizontal] SETTINGS` 44px + **amber 6px dot when overridden** + 1-line meta (`"Educational: On · Personality: The Scholar · Min score: 85 · Effort: 6/10"` — overridden fields only; else "Using global defaults" + Gear).

**Assignment panel** (bubble): same kit + "Ask me before" chips + citation picker + **provenance trail `Default → {Subject} → {Assignment}`**; collapsed by default + summary + footer "Editing here overrides {subject} for this assignment only."

---

## 5. SETTINGS BARE-BONES — KEEP / MOVE / DELETE MATRIX

| Section / setting | Verdict | Destination |
|---|---|---|
| Account (display name, avatar, phone, password, 2FA, plan badge) | **KEEP** | Settings |
| Appearance (theme, accent, density, animations, background, UI style, font scale) | **KEEP** | Settings |
| Accessibility (5 toggles — real data-* consumers) | **KEEP, merged** | Appearance ("Display & accessibility") |
| Notifications grid (13) | **CUT > 8, merge channels** | Settings flat panel, real senders only |
| Privacy & Security (2FA, data toggles, export, delete) | **KEEP** | Settings (real-behavior toggles only) |
| Credits & Billing summary | **KEEP read-only** | Settings card → Credits view |
| Integrations (Telegram + "Planned") | **KEEP slim** | Settings |
| Extension (3 toggles + hardcoded "v2.0 installed") | **MOVE** | Extension popup's own real UI; Settings = status + link |
| Shortcuts (4 dead rows) | **DELETE** | — |
| Language & Region | **KEEP locale+timezone; DELETE measurement** | Defaults panel |
| Academic Profile (level, major, year, subjects+levels, images, learningStyle, goals) | **MOVE/CUT** | level → Defaults; subjects/levels/images → subject cards; major/year/learningStyle/goals → CUT (zero consumers) |
| Writing DNA 5 axes (tone/vocabulary/complexity/formality/voice) | **MOVE → levels 1+2** | Defaults + subject + assignment |
| Writing profiles + citation style | **MOVE** | Defaults + subject + assignment |
| AI & Intelligence (name, persona, instructions, effort, autoRouting, detection, min_human, detectors, humanizer, style) | **MOVE** | Defaults + subject + assignment (§4) |
| AI intelligence dust (creativity…originality ×6, temperature, tokenBudget, fallbackEnabled, subsetting) | **DELETE** | zero consumers |
| Quick presets (Budget/Balanced/Power) | **MOVE** | Defaults header ("Try a preset" + "resets behavior settings" wording) |
| Automation 12 toggles | **DELETE section; keep concept** | assignment "Ask me before…" chips |
| Data & Analytics (3) · Experimental (3 + DemoMode) · Advanced (debugMode, apiLogging) | **DELETE from user UI** | Control Center (operator) |
| Quick-actions / wizards section | **DELETE** | replaced by preset flow |

**Net: ~45 real settings. Every confusing section leaves Settings and reappears exactly one place, in context (§4).**

---

## 6. HONESTY FIXES (visual/flow — every one is a UI change)

1. **Fake Reset Password tab** (fabricates "code sent" via setTimeout) → real RecoveryFlowModal; tab deleted.
2. **"Hardware / TOTP Synced"** static claim → real method caption.
3. **Hard-coded "COMPLETED" chip** on every My Agent event bubble → eventType map (New / Due soon / Completed).
4. **Bell dead in live mode** → BellOff empty + prefs escape; one read store.
5. **Dead PUBLIC_PATHS** (`/features /pricing /guide /terms /privacy`) → real deep links + `/extension`.
6. **`handleTopUp` fake success** → honest state or remove.
7. **`insufficient_tokens` (HTTP 200) as red error** → amber gate tile + "Add tokens →".
8. **"AI Copilot Ready" always-on pulsing** (no state check) → real state or delete.
9. **Two extension version sources** → one live value + skeleton + error.
10. **CookieBanner "Accept All & Support Dev"** → 2 honest buttons; shows on anonymous landing too.
11. **"Engineered by Solo Dev Roni" in auth card** → landing footer.
12. **Demo data in prod surfaces** (Library tabs, notification lists, SystemMap) → labeled demo or honest empty (§3.23).
13. **Inert "extension + web" footer chip** → real link.
14. **"Payments not available yet — prototype only" above "2FA Checkout" CTAs** → reword + relocate.
15. **Native confirm()/alert() (7+ sites)** → styled confirms + inline strips.
16. **Agent errors as assistant bubbles** → error bubble + Retry.
17. **Mode-change messages spamming the transcript** → toast.
18. **Mark-done/archive native confirm** → styled confirm strip.
19. **Dump All unapproved spend** → 2-step confirm with count + cost.
20. **"Username or Email"** from the Stitch sign-in reference — do NOT adopt (Public ID only).
21. **False-success toast when finalize produces nothing** → honest "no work generated".
22. **"Academic Co-pilot 2.0" badge** → drop the version.
23. **Emoji status glyphs** → lucide icons (user-chosen emoji for custom subjects stays).

---

## 7. FRONTEND BUG LIST

**P0 (visible wrongness / crashes / dead-ends):**
1. [FIXED 547193d — keep the guard while refactoring] NewAssignmentModal Rules-of-Hooks crash.
2. Dashboard bucket OR-bug: completed inside "IN PROGRESS (N)" + inflated counts.
3. `not_started`/`paused` mislabeled "Drafting"; missing paused/tracked rows → exact STATUS_CHIP map.
4. Cards duplicated across 2+ subject sections (keyword heuristics) → explicit subject identity.
5. Silent fetch failures render as empty states (six fake-empty subjects, History stale, Library `catch → []`, detail 500 phantom) → error + Retry.
6. Bell: two disconnected read stores; "View all" wrong tab; prod dead feature.
7. `insufficient_tokens` shown red (HTTP 200).
8. Dump All runs on unmatched items — unapproved spend.
9. AuthModal fake reset tab.
10. Quick-settings shows settings it doesn't contain; palette hardcoded dark glass; palette broken in light theme.

**P1 (consistency / a11y / polish):**
11. Nav selected style inverted vs export (left bar vs right-edge teal beam).
12. Three brand colors, 3 Button layers, ~40 raw buttons, 3 tab idioms, 4 empty shapes, 5 chip sets.
13. Aurora leftovers: `surface-glass-strong`, `clean-card`, `bg-white/3-5`, `text-slate-*`, `[var(--accent)]`, `[var(--border-subtle)]`, gradient CTAs.
14. My Agent: duplicate mode selector, effort ×3, opaque "Configs (7)".
15. Invalid HTML: rename `<input>` nested in thread-row `<button>`.
16. No focus trap/restore: palette, NewAssignment (retry yanks focus), route modal, work drawer, identity/skill modals, 2FA checkout, quick-settings; 2FA lacks segmented cells/resend/inline error.
17. Charts: no `role="img"`/aria/aria-busy; mobile date collision at 16/5.
18. No reduced-motion guards (`animate-ping/spin/pulse`).
19. `md:grid-cols-2` ragged half-width pending column 768–1023px.
20. History table crushes narrow screens; archived tab loses search.
21. **Mobile bottom bar 4/5 items <44px.**
22. Topbar titles 32px crowding; 8 views mislabeled "Dashboard".
23. Library: 480px nested-scroll cards, 8px calendar chips, emoji icons, demo-only tabs, dead upload action.
24. Subject tiles ignore `bubble.color` + emoji; export no spinner; "active" count lies.
25. Create-subject inline panel: no trap, 7-emoji picker, no color/icon alignment.
26. Extension: separate brand, dual versions, misleading Firefox/Safari paths.
27. `@container` query class in CreditsView popover (width breaks at xl if unsupported).
28. Duplicate Cost card (Monitors + Control Center).
29. Loader text via webkit-only scrollbar styling + stale violet; sidebar scroll-margins missing; active row off-screen.
30. `max-w-[1400px]`/1248/1440/7xl/6xl/4xl → one 1200px `page-max`.
31. Missing aria: direction tiles/mode not radiogroup, tables lack captions/`aria-sort`, no `aria-live` on chat/import/valuation.
32. Palette "recently used" shows demo entries in prod.

**P2 (mobile/tablet-specific — new):**
33. No `viewport-fit=cover` / safe-area handling on bars, composer, sheets → content under home indicator.
34. Sheets and drawers don't respect landscape notches (no env-inset L/R).
35. Hotel-pattern: keyboard covers composer on phones; no visualViewport ride.
36. Bottom sheets lack the drag/snap machine + Escape/back dismissal on some surfaces.
37. Tablets 768–1023 stuck between layouts (sidebar off + grid broken + bottom bar full) — the ragged in-between zone.
38. iPad pointer: hover-only actions (cards that open on hover) unusable with finger.
39. Landscape-phone: bottom bar overlaps content; sticky headers double-height.
40. No `scroll-margin-top` on anchor sections under sticky headers.
41. Calendar chips 8px (unreadable on all viewports); touch rows <44px in tables.
42. Long subject/assignment titles break card grids on narrow widths (no truncation contract).

---

## 8. COMPONENT INVENTORY (build once)

`Button` (5 variants, loading) · `Tabs/ModeControl` (sliding thumb) · `StatusChip` + `chips.js` · `EmptyState` (line-art slots) · `StatCard` · `SectionCard` (glass panel) · `DialogShell` (template: LaunchToDocModal) · **`MobileSheet`** (state machine §2.6.1) · **`StickyBar`** (A/B/C variants) · **`ChipScroller`** · `WalletLine` · `AvatarWidget` · `Kbd` · `StatusDot` · `ConfigField` (3-state widget) · `ThinkingBubble` (shared) · `ChatBubble` (+ error variant) · `ModeSegmented` · `SubjectTile` (tinted orb) · `Toast` (role=status) · `Skeleton` (shimmer) · `ErrorState` family · `DemoRibbon` · `OfflineBanner`. Every page uses ONLY these; per-file duplicates die.

---

## 9. STITCH GENERATION ORDER

1. **§1 + §2** — design language + responsive/state rules (context for everything).
2. **§3.1 Chrome** — the canvas every screen sits on (shell, drawer, bottom bar, palette, quick-settings).
3. **§3.2 Auth family** — public entry incl. OTP + recovery + expiry states.
4. **§3.3 Public** — landing, public legal/guide/extension, cookie banner.
5. **§3.4 Dashboard + §4 subject panel** — where the config experience starts.
6. **§3.5 Assignment detail + §4 assignment panel** — bento + timeline.
7. **§3.6 My Agent** — chat-first simplification + permission sheet.
8. **§3.7 Import modals** — the 4-step flow + DialogShell chrome.
9. **§3.18 Settings bare bones** — the clutter collapse.
10. **§3.19–3.20 Admin** — Control Center console + Monitors feedback-first.
11. **§3.8–3.14** — Insights, History, Library tools, Credits, Data Lake, Dump, Extension.
12. **§3.15–3.17** — Guide, Privacy, ToS (content locked; chrome only).
13. **§3.21–3.23** — Error families, overlay kitchen, demo treatment.
14. **Full viewport sweep** — EVERY screen re-verified at 320 / 390 / 768 / 1024 / 1440 + landscape-phone + dark/light + reduced-motion (use the §2.7 checklist as the acceptance gate per screen).

**Per-screen instruction to Stitch:** "For each screen produce: (a) desktop 1440, (b) tablet 1024, (c) tablet-portrait 768, (d) phone 390, and include empty / loading / populated variants and dark + light."

---

## 10. DESIGN CONTRACTS (what must NOT break while overhauling)

- **Charts:** custom visx SVG pipeline — restyle tokens only; never swap libraries.
- **Icons:** lucide-react only; illustrations = SVG line art; `/HelpoTron_logo.jpeg` the only bitmap.
- **Copy of record:** Guide (16 sections), Privacy (6), ToS (13) — rewritten + committed; overhaul changes chrome, never words. Pricing/plan figures, token-cost copy, rewards/discounts + disclaimers stay verbatim.
- **Product identity:** "Helpotron OS / Premium Co-pilot", extension CWS listing URL, real logo.
- **Real-data-only render:** demo always labeled; live never fabricates notifications/events/telemetry/versions/results.
- **Touch & theming:** 44px minimum (48px bars); inputs 16px text; `pb-safe` everywhere bottom-anchored; dark default + faithful light; `data-theme` swap only; zero `dark:`; zero hex literals.
- **Focus & motion:** 2px primary focus ring; ≤150ms micro-interactions; reduced-motion kills all animation globally.
- **Hover contract:** hover effects only under `(hover:hover) and (pointer:fine)`; no hover-only information.

---

*Compiled from 10 grounded teardown reports (design-reports/a1–b7 at /home/roni/Roni_workspace/helpotron/design-reports/). Every claim cites live code file:line in the per-report files. Backend-only items (config persistence, enforcement, contracts) deliberately excluded — they belong to the agy master plan, written after the Stitch designs arrive.*
