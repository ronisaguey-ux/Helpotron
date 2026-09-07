# B1 — App Shell + Global Chrome: v4 Teardown & Regeneration Spec

**Agent B1 (read-only) · Helpotron redesign mission · 2026-09-05**
**Scope:** AppShell.jsx (sidebar, topbar, mobile drawer, bottom bar, footer, credits pill, quick-settings, notification bell), CommandPalette.jsx, NotificationsView.jsx (adjacent, shares the panel's data model), NotFound.jsx.
**Design source of truth:** Google Stitch v3 export shell screen —
`/home/roni-saguey/stitch_helpotron_study_os_redesign (2)/stitch_helpotron_study_os_redesign/helpotron_dashboard_dark_default_1/code.html` (+ `screen.png`).
**Token authority:** `/home/roni/Roni_workspace/helpotron/web/src/index.css` `@theme inline` block (lines 1580–1723), Stitch sheets `:root` (1433–1504) / `[data-theme="light"]` (1507–1578).

> ### Veracity rules used throughout
> Every claim below cites `file:line`. No invented features. Where the repo deviates from the Stitch v3 export, the deviation is called out as a *delta* with the export class verbatim.

---

## 0. Token & class inventory available to the shell (verified against index.css)

- **Colors (role classes resolve per `data-theme`):** `bg-background bg-surface bg-surface-bright bg-surface-dim bg-surface-container-lowest/low/container/high/highest`, `text-on-surface text-on-surface-variant text-on-background`, `text/border-outline outline-variant`, `bg/text-primary primary-container on-primary on-primary-container`, `secondary/tertiary/error` + container variants, `inverse-surface/on-surface`. Semantic status roles: `text-sem-* / bg-sem-*/15` (amber, blue, green, cyan, indigo, deepgreen, gray, slate) at 1631–1638. Opacity modifiers (`bg-primary/10`, `bg-error-container/20`, `border-outline-variant/30`) compile.
- **Type (Stitch sheet, rem-based):** `font-headline-lg text-headline-lg` (32px/2.5/600/-0.01em), `text-headline-lg-mobile` (24px), `title-md` (20px), `body-md` (16px), `body-sm` (14px), `label-caps` (12px/16px/500/0.05em, JetBrains Mono), `tabular-stat` (14px, JetBrains Mono), `display-xl` (48px). Families: Hanken Grotesk (display/headline), Inter (title/body), JetBrains Mono (label-caps/tabular-stat). All are var-backed so `applyFontScale` (root font-size) scales them.
- **Spacing steps:** `--spacing-xs 4px, sm 8px, md 16px, lg 24px, xl 32px, container-padding 24px, margin-mobile 16px, margin-desktop 32px, gutter 16px` (1641–1651). Named widths re-pinned to Tailwind defaults (1666–1675 — do NOT use `max-w-sm` for a spacing meaning).
- **Radius scale (Stitch spec):** `rounded-3xl` containers, `rounded-2xl` inner cards, `rounded-xl` buttons/inputs, `rounded-lg` chips, `rounded-full` avatars.
- **Ratios:** h-16 topbar (64px), sidebar w-64 (256px), container spacing 24px, content margins 16px mobile / 32px desktop, max content width repo = 1400px (export = 1200px).
- **Hard rules:** lucide-react icons only; no emoji as icons; no AI-generated imagery (brand logo `/HelpoTron_logo.jpeg` is an existing product asset — keep); **never use `dark:` variants** — the repo themes via CSS vars + `data-theme` (`applyAppearance`, SettingsApp.jsx:1015–1030); `@custom-variant dark (&:is(.dark *))` (index.css:4) never matches because `.dark` is never applied (`classList.add('dark')` appears nowhere; only `appearance-live` at SettingsApp.jsx:1028). Two `<kbd>`-/cyan-ish residual systems (Aurora `clean-card`, `surface-glass-strong`, `slate-*`, `[var(--accent)]`) still live in the palette and NotificationsView — v4 must sweep them.

---

## 1. Current anatomy — Desktop sidebar (AppShell.jsx:674–802)

| # | Part | Code | Ink |
|---|------|------|-----|
| A1 | Brand block | 675–718 | `<aside>` fixed w-64 (collapsed w-20), `bg-surface-container-low border-r border-outline-variant/30 z-40 py-6 gap-4`; brand tile `w-10 h-10 rounded-2xl bg-primary` containing `<img src="/HelpoTron_logo.jpeg">`; wordmark `font-headline-lg text-lg font-bold text-primary` "Helpotron OS"; tagline `font-label-caps text-label-caps text-on-surface-variant` "Premium Co-pilot"; collapse chevron button (Collapsed: whole block becomes a centered logo tile that expands) |
| A2 | CTA | 720–744 | `w-full bg-primary text-on-primary rounded-xl py-3 px-4 gap-2 shadow-sm min-h-[44px] focus:ring-2 focus:ring-primary` + `<Plus>` + `font-label-caps text-label-caps uppercase tracking-wider font-semibold` "New Study Session" (collapsed: 40px square Plus tile, `title` tooltip). Opens `NewAssignmentModal` (879–888) |
| A3 | Nav | 746–771 | `<nav aria-label="Primary" class="flex-1 overflow-y-auto px-3 space-y-1">`; 10 user items + 2 admin (getNavItems, 30–47): Dashboard, My Agent, Insights, History, Settings, Drop Assignment, Data Lake, Billing, Extension, Guide + Control Center, Monitors (admin). Row: `min-h-[44px] rounded-xl py-2.5 font-label-caps text-label-caps uppercase tracking-wider text-xs`, expanded `px-3` / collapsed `justify-center px-0`. Selected: `bg-surface-container text-on-surface font-semibold border-l-4 border-primary`. Idle: `text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low border-l-4 border-transparent`. `aria-current="page"`, `title` tooltip when collapsed |
| A4 | Footer user chip | 773–801 | `border-t border-outline-variant/30 pt-4`; avatar `w-8 h-8 rounded-full bg-primary-container` with first letter of `public_id`; name `font-body-sm text-body-sm` + credits line `font-body-sm text-xs`; click → settings (expanded); collapsed → plain centered avatar dot |

### Problems (desktop sidebar)
- **P1 accent-bar direction is inverted vs the export.** Export (code.html:133): selected = `text-primary bold border-r-4 border-primary bg-primary-container/10` — right-edge accent, primary-colored text, container tint. Repo (759): left-edge `border-l-4`, `text-on-surface`, `bg-surface-container`. Users see a different selected language than every Stitch screen regenerated after.
- **P2 hover surface differs from export** — export `hover:bg-surface-container-high` (139); repo uses `hover:bg-surface-container-low` (760) in the aside but `bg-surface-container` in the mobile drawer (620) — same component, two hover sites.
- **P3 export rows are full-bleed** (`px-container-padding py-3`, no rounding); repo nests an inner `px-3` inset + `rounded-xl` (747–755). Net effect: the export's right-edge accent bar is flush against the sidebar border in the export; in the repo the accent bar floats 12px in and is clipped by row rounding.
- **P4 A1 logo tile is `rounded-2xl` + JPEG; export uses `rounded-full` + letter "H" in `bg-primary-container`** (code.html:120). Delta vs export (export circle, container color, no photo). Keep the JPEG? (product asset, allowed) — but decide one and stop mixing: the topbar **never** renders the tile at all.
- **P5 `tracking-wider` duplicates the token** — `text-label-caps` already ships 0.05em letter-spacing (index.css:1718); the extra class is noise but harmless; spec below drops it.
- **P6 collapse state is ephemeral** (useState only, 343) — reverts on reload; and in collapsed mode the expand affordance is the logo tile itself (705–716), which reads as decoration, not a control.
- **P7 12 rows × 44px + brand + CTA + chip ≈ 780px** — on 768–800px-tall viewports the nav scrolls (`overflow-y-auto`), the selected row can be off-screen, and the scrollbar is the unstyled default (index.css styles only webkit thumb with stale violet rgba — below). No `scroll-margin`, no auto-scroll-to-active.
- **P8 Duplicate wallet data**: topbar credits pill (464–478) + sidebar chip credits line (790) + mobile drawer credits row (633–645) + quick-settings token line (104) all render credits/tokens.

## 2. Mobile slide-over drawer (AppShell.jsx:548–672)

- Overlay `fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden`; panel `fixed inset-y-0 left-0 w-72 bg-surface-container-low border-r p-4 flex flex-col justify-between overflow-y-auto`, spring slide `x:-100%→0` (damping 25).
- Blocks: brand header (logo tile + wordmark + tagline + X close) → full-width CTA (593–603) → nav list (606–628; same rows as desktop, `border-l-4`…) → footer (632–668): credits chip (`bg-surface-container border` mono), Privacy Policy, Sign out.
- Empty of: user identity chip (desktop has one, drawer doesn't), settings shortcut, search shortcut — asymmetries with the desktop aside.

## 3. Topbar (AppShell.jsx:404–546)

`<header class="sticky top-0 z-30 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-md"><div class="w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-3">`
- **Left:** hamburger (md:hidden, 440–420, 3× `w-4 h-0.5` spans) → `<h1 class="font-headline-lg text-lg sm:text-headline-lg font-bold text-on-background truncate">` `{current?.label ?? "Dashboard"}` (422–424) → back/forward pair `hidden lg:flex` (427–448), 32px targets, `disabled:opacity-30`.
- **Right cluster:** compact search trigger (454–462, `p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30`, 44px, icon `Search` 18px, no text) → credits pill (465–478, `rounded-full bg-surface-container-low border px-4 py-2 min-h-[44px]`: `Coins` + `font-tabular-stat text-tabular-stat font-medium` "Credits: N" + hidden sm:inline token count) → `NotificationBell` (481) → avatar button (484–495, `w-10 h-10 rounded-full bg-primary-container`, first letter of public_id, `hover:ring-2 ring-primary`, `aria-haspopup="menu"`) or "Sign in" button (536–543, only ever shown if shell renders logged-out — it never does; the auth gate (App.jsx:650–659) unmounts AppShell when signed out, so the `:else` branch is dead code).
- **Quick-settings popover (49–232):** `w-64 p-4` card anchored `absolute top-full right-0 mt-2`; contents: identity row (avatar + name + public_id + token/credit mono line), **Theme segmented (dark/light/Auto)**, **AI Effort segmented (Low/Balanced/High)**, **Academic level select**, **Phone number input + Save**, **Profile picture Add/Change/Remove + hidden file input + live error box**, Notifications On/Off Badge, full-width "Full Settings" Button (primary), then footer: Privacy Policy, Sign out, `build {__BUILD_ID__}`.
- Chevrons: `ChevronLeft` imports at 14; note `Bell` and `Home` etc.

### Problems (topbar)
- **P9 Title is 32px at ≥640px** (`sm:text-headline-lg` 422) inside a 64px bar — the export uses `font-title-md text-title-md` (20px) for the desktop page title (code.html:177). Crowded next to the 44px right cluster.
- **P10 Wrong title for 8 views** — `current?.label ?? "Dashboard"`: `study`, `activity`, `library`, `automation`, `inbox`, `message_admin`, `terms`, `privacy` are not in `getNavItems` (30–47), so their topbar reads "Dashboard". (Routable per App.jsx:244–263 + 810/823/840.)
- **P11 Search button is bare** — icon-only, no visible hint of the ⌘K affordance (aria-label + title only). At `lg:` the hover affordance is a color swap. The export has no search at all — the button is a repo addition and deserves its own standard treatment, not a cut-down icon button.
- **P12 Credits pill: `rounded-full` vs export `rounded-xl`** (code.html:179–182), and the aria-label concatenates four fields into a run-on (469).
- **P13 Avatar never renders `profile.avatarUrl`** — the topbar letter (494) and the sidebar chip (782–783) ignore the uploaded avatar that QuickSettings itself displays (96–97). Uploaded avatar invisible until you open the menu.
- **P14 Popover controls** — `aria-haspopup="menu"` but the content is a form (inputs, selects, segmented buttons). No `role`, no focus trap, no focus restore; phone edit and avatar upload are full Settings features living inside a 256px popover (crowding: 8 controls stacked, all at `text-[10px]/[11px]`).
- **P15 Credits/usage shown 3×+`** (see P8).

## 4. Notification bell + panel (AppShell.jsx:235–335)

- Trigger: 44px `p-2.5 rounded-xl` icon button, `aria-label="Notifications (N unread)"`, badge `absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[9px] font-bold`.
- Panel: desktop `sm:absolute sm:right-0 sm:mt-2 sm:w-80`; mobile `fixed left-3 right-3 top-20` **plus** a `fixed inset-0 bg-black/40 backdrop-blur-xs sm:hidden` scrim. Surface `bg-surface-container-low border-outline-variant/30 rounded-2xl shadow-2xl`, 12ms open animation.
- Header row: "Notifications" + `Badge` unread + X close (292–306). List `max-h-72 overflow-y-auto`: row = dot (`w-2 h-2`, `bg-outline` read / `bg-primary` unread), title `text-xs`, body `text-[11px] line-clamp-2`, mono `timeAgo · channel`; click on a row does nothing (no mark-read handler). Footer button "View all notifications →" → `onNavigate("activity")` (324).
- Empty state: "You're all caught up ✦" (309).

### Problems (bell)
- **P16 No mark-read.** Rows are inert; unread computed fresh from `NOTIFICATIONS` demo flags (238) each render — the badge never decrements.
- **P17 Two disconnected read-state systems.** The bell reads demo `n.read`; NotificationsView reads a **separate** `helpotron_notifications_read` localStorage set (NotificationsView.jsx:17–23, 33–44). Marking all read in the view does not clear the bell badge and vice versa.
- **P18 "View all" misroutes.** `onOpenAll` → `onNavigate("activity")`; ActivityView defaults to `mode='timeline'` (ActivityView.jsx:51) — the notifications stream needs a second click on the `🔔 Notifications` tab. (`notifications` legacy alias → `['activity','notifications']` exists at App.jsx:216 but the bell doesn't use it: `onOpenAll` must pass the tab.)
- **P19 Live mode = permanently dead feature.** `NOTIFICATIONS = demoEnabled() ? [...] : []` (demoData.js:74); there is **no notifications endpoint** in `server/main.py` (grep: only the DevContact "admin notified" at 2070). In prod the badge never appears and the panel always says "You're all caught up ✦" — with no escape hatch to preferences.
- **P20 Unread chip style**: 9px text, badge without a ring — on the blurry topbar it reads as a dot; also N≥100 renders "100" in 16px min-width (overflow ok but cramped).

## 5. Command palette (CommandPalette.jsx, 177 lines; rendered at App.jsx:665, ⌘K/⌘+K handler App.jsx:308–317; opens via `setPaletteOpen(true)`; note: pressing ⌘K while open does not toggle)

- Surface: `fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm` + `pt-[12vh] px-4`; panel `w-full max-w-xl surface-glass-strong rounded-[var(--radius-lg)] shadow-2xl shadow-black/50` — i.e., **Aurora-era classes**: `surface-glass-strong` = hardcoded `rgba(13,15,32,0.86)` + `blur(28px)` + `border var(--border-subtle)` (index.css:870–877); text colors `text-white / text-slate-500/400/300/200`; `[var(--accent-*)]`.
- Input row: `px-4 py-3 border-b border-[var(--border-subtle)]`, leading glyph is the **`🔎` emoji** (108), input `text-sm text-white placeholder:text-slate-500`, trailing `Kbd>esc`.
- Results `max-h-[46vh]`: group headers `text-[10px] font-semibold uppercase tracking-wider text-slate-500`; row = 24px glyph slot (`Clock` for recents, `>` or `→` text glyphs otherwise), title `text-xs`, subtitle `text-[10px] text-slate-500`; selected row `bg-[var(--accent-subtle)] border-l-2 border-[var(--accent)]` + trailing `CornerDownLeft`.
- Data: `index = demoEnabled() ? searchIndex() : []` (45) — **prod index is always empty** (searchIndex returns [] unless demo, demoData.js:392–395). Slash query (`/` prefix) filters `SLASH_COMMANDS` (17 entries, demoData.js:423–441: assignment, study, run, settings, admin, agent, insights, credits, home, history, activity, library, drop, datalake, extension, guide, monitors). Empty query → localStorage recents (`helpotron_palette_recent`, max 4, kind/title/target). `Enter`/click → `pushRecent` + `onNavigate(target)`.
- Empty state: `No results for "q". Try /assignment, /study, /settings…` (123–125). Footer hint: `↑ ↓ navigate · ↵ open · Slash commands: /assignment /study /run /settings /admin` (167–171).

### Problems (palette)
- **P21 Wrong token system** — `surface-glass-strong` is *hardcoded dark* (rgba(13,15,32,0.86)) so in light theme the palette stays a dark dialog over a light app; `text-slate-*` and `bg-slate-*` are not in the M3 sheet; `[var(--radius-lg)]` (20px) vs Stitch radius (3xl 24px for containers).
- **P22 Emoji icon** — `🔎` violates the lucide-only policy; the `>`/`→` glyphs are text, not icons; `"✦"` in bell empty state likewise.
- **P23 Prod = search dead** — live mode index `[]`: every non-slash query produces "No results"; the empty-state copy recommends `/study /settings` but omits the other 14 commands, and the footer hint lists 5 (one stale: `/run` label "Run an automation" is fine but `/assignment` → target `history`, labeled "Create assignment" — lands on History, not a create modal, i.e. misleading).
- **P24 No role gating** — `/admin` and `/monitors` are offered to non-admins (nav hides them, palette doesn't).
- **P25 Accessibility** — no `role="dialog"`/`aria-modal`, no focus trap, no focus restore to the trigger; `selected` index can be -1 when results empty (74–81: ArrowDown on empty → `Math.min(s+1, -1)` = -1).
- **P26 Discoverability** — empty query shows only recents; no `/` hint row, no "Recent" group header, and the keyboard hint bar is the only place slash mode is signaled.
- **P27 Recents de-dup** is title-only → different kinds with equal titles collide (minor).

## 6. Mobile bottom bar (AppShell.jsx:833–875)

`fixed bottom-0 z-40 bg-surface/95 backdrop-blur-md border-t px-4 pt-2 pb-safe` → 5 slots: Home / Agent / Insights / History + "More" (hamburger glyph). Item = `flex flex-col px-4 py-1 rounded-xl`, 20px icon + 10px label-caps label `mt-1`; selected `bg-primary-container text-on-primary-container scale-90 font-semibold`; idle `text-on-surface-variant hover:bg-surface-container-highest`. Matches export (code.html:304–320) closely (export selected has `min-h-[44px] min-w-[44px]` on the `<a>`; repo omits the 44px class on 4 of the 5 items — touch target comes only from padding ≈ 40px tall).

### Problem
- **P28** — 44px touch target not guaranteed (items ~40px high); `scale-90` on the selected tab causes a 1px baseline jump between states (no layout shift guard); More button has no `aria-pressed`/`aria-current` notion of drawer state.

## 7. Footer (AppShell.jsx:811–830)

`<footer role="contentinfo" class="border-t border-outline-variant/20 text-on-surface-variant text-[11px] text-center px-4 pt-3 pb-20 md:pb-4">` — "© 2026 Helpotron Academic Companion · Privacy Policy · Terms of Service" (underline links → `onNavigate("privacy"/"terms")`).
- P29: `pb-20 md:pb-4` is a hand-tuned clearance hack for the bottom bar — clearance should live once (on `main`), not twice (main already has `pb-24 md:pb-12`, 805). Footer is the only place with `text-[11px]` instead of a token class.

## 8. NotFound (NotFound.jsx, 65 lines; mounted at App.jsx:607 as a **full-screen overlay that replaces the whole app**, before the shell)

- Cover: `fixed inset-0 z-[90] bg-background`; dot grid (radial-gradient, currentColor at 15%); two glow blobs (`bg-primary/10` 120px blur, `bg-secondary/10`); centered `max-w-lg bg-surface-container-lowest border-outline-variant/30 rounded-3xl shadow` card; orbit motif (spinner border + `animate-ping` + Compass icon in `bg-surface-container-high`), `font-display-xl text-display-xl text-primary` "404", `font-title-md text-title-md` "Lost in the stacks?", copy `font-body-md text-body-sm text-on-surface-variant`, single primary button "Back to dashboard" (Home icon).
- Assessment: best-conforming surface of the batch (roles correct, no emoji, code-only artwork, layered surfaces). Deltas vs v3 export `helpotron_error_states` screen (same export root) are minor — P30: single action (no Search/Help secondary), `animate-ping` + `animate-spin` have no reduced-motion guard (`data-motion=reduced` hooks exist at SettingsApp.jsx:1037 but are not consumed here).

## 9. NotificationsView (adjacent — the panel's destination; NotificationsView.jsx, 116 lines, embedded in ActivityView at 109)

- Entirely Aurora-era: `clean-card`, `bg-white/3`, `white/4`, `text-slate-300/400/500/600`, `[var(--accent)]`; **emoji category icons** `📝 ⚙️ 🪙 🎯` (11–14) and `🔕` empty state (70); read rows `opacity-60`; separate read store (P17); footer hint text.
- P31: third styling language inside the shell (M3 shell, Aurora palette/activity, slate panel) — regeneration should port this to M3 roles so the bell panel and the view match 1:1.

---

## 10. Consolidated v4 problem list (regeneration targets)

| ID | One-liner | Fix direction |
|----|-----------|---------------|
| P1/P2/P3 | Nav selected/hover language ≠ export (bar side, colors, rounding) | Export-standard rows |
| P4 | Brand tile vs export tile mismatch; no single brand-chip component | One `BrandTile` |
| P5/P9/P12 | `tracking-wider` dup; 32px topbar title; pill `rounded-full` | Token discipline; title-md |
| P6 | Collapse not persisted, expand affordance = logo | Persist `localStorage`; explicit chevron |
| P7+P28 | Off-screen active nav row; bottom bar <44px | scrollIntoView; 44px min |
| P8/P15 | Wallet info ×4 surfaces; popover is a settings form | One `WalletSummary`; popover = 3 links |
| P10 | 8 views show "Dashboard" title | `TITLE_MAP` for all routable views |
| P11 | Bare search button | Text+⌘K affordance at lg+ |
| P13 | Uploaded avatar invisible in chrome | Avatar component reads avatarUrl |
| P14/P25 | No dialogs semantics / focus trap / restore | Per-surface spec |
| P16/P17/P18/P19 | Bell: no mark-read, 2 read stores, misroute, dead in prod | Single read store; `activity:notifications` tab; prod empty-state with prefs escape |
| P20 | Badge style | Ring + 10px |
| P21/P22/P26/P31 | Palette/NotificationsView: Aurora tokens, emoji, dead prod search | Full M3 port; lucide |
| P23/P24/P27 | Slash: stale/fixed hints, no role gating, misleading /assignment | Dynamic footer; gate admin cmds |
| P29/P30 | Footer clearance hack; reducer-motion guards | One clearance; `data-motion` guard |

---

## 11. REGENERATION SPEC — v4 (Google Stitch input)

**Global constraints (apply to every surface below):**
1. Class vocabulary = the index.css `@theme inline` roles only (`bg-surface-*`, `text-on-*`, `outline-*`, `primary/secondary/tertiary/error` + containers, `font/label/title/body/headline/display/tabular-stat`). **Zero `dark:` classes** (theme = CSS vars), zero `slate-*`, zero `clean-card`, zero `[var(--border-subtle)]`, zero hex literals.
2. Icons: lucide-react only, stroke 1.75, sized 16/18/20. No text glyphs as icons. Keep `/HelpoTron_logo.jpeg` (existing brand asset, not AI-generated) in the brand tile; all decorative art = CSS/SVG.
3. Radii: 3xl panel surfaces, 2xl cards, xl buttons/inputs, lg chips, full avatars. Touch min 44×44. Focus: 2px `outline` in `primary`, 2px offset, on `:focus-visible` (export convention, code.html:127/133/183).
4. Theme handling: no per-screen `data-theme` — the app sets `data-theme`/`data-accent`/`data-motion` on `<html>` (SettingsApp.jsx:1015–1040); components must consume the role vars and honor `data-motion="reduced"` (pause/cancel `animate-ping`, `animate-spin`, shimmer).
5. Spacing: use the sheet steps (`gutter`16 / `md`16 / `lg`24 / `container-padding`24 / `xl`32); mobile content margin `margin-mobile`16, desktop `margin-desktop`32; max content width 1200px (dot export) — recommend dropping repo's 1400px to match the export.
6. Motion: 120–150ms ease-out for popovers; 200ms for panels; spring for the drawer (stiffness 250/damping 25, existing); all guarded by reduced-motion.

### 11.1 Shell frame
- Layout column: `md:pl-64` when expanded / `md:pl-20` collapsed; `<main id="main-content" class="min-w-0 w-full p-margin-mobile md:p-margin-desktop pb-24 md:pb-12">` + `max-w-[1200px] mx-auto` (keep repo's single clearance here; footer drops its own pb hack).
- Topbar: `sticky top-0 z-30 h-16 bg-surface/80 backdrop-blur-md border-b border-outline-variant/20 px-4 md:px-6` (unchanged, export-identical).

### 11.2 Desktop sidebar — expanded (w-64) & collapsed (w-20) variants
**Structure:** `aside fixed left-0 top-0 h-full flex flex-col bg-surface-container-low border-r border-outline-variant/30 z-40` with `py-6 gap-4` (keep).

- **A1 Brand block.** One component both states. Expanded: `px-6 flex items-center justify-between`; tile `w-10 h-10 rounded-2xl bg-primary overflow-hidden shadow-sm` + `<img src="/HelpoTron_logo.jpeg">` (keep rounded-2xl + JPEG: it's THIS product's established identity; document the deliberate delta from the export's rounded-full letter tile); wordmark `font-headline-lg text-lg font-bold text-primary leading-tight` "Helpotron OS"; tagline `font-label-caps text-label-caps text-on-surface-variant` "Premium Co-pilot". **Collapse control**: 32px ghost button (`text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg`) with `ChevronLeft`, `aria-label="Collapse sidebar"` (keep) — is always present in expanded state. Collapsed: the tile becomes the expand control `w-10 h-10` + `rounded-2xl` + a **small floating chevron** `ChevronRight` badge at the tile's top-right (`-top-1 -right-1 w-4 h-4 rounded-full bg-surface-container-high border`) so the affordance is explicit (fixes P6 floor), `aria-label="Expand sidebar"`.
- **A2 CTA.** Expanded: `w-full bg-primary text-on-primary rounded-xl py-3 px-4 flex items-center justify-center gap-2 shadow-sm min-h-[44px]` + `Plus` 16 + label `font-label-caps text-label-caps uppercase font-semibold` "New Study Session" (drop redundant `tracking-wider`). Hover `hover:bg-primary-container` (export, code.html:127). Focus ring per global §11.0.4. Collapsed: `w-10 h-10 rounded-xl` Plus tile, same hover, `aria-label`.
- **A3 Nav.** `<nav aria-label="Primary" class="flex-1 overflow-y-auto scroll-mt-2 px-3">` rows — export-standard: `flex items-center gap-4 px-3 py-3 min-h-[44px] rounded-xl font-label-caps text-label-caps uppercase`, no extra tracking, 18px lucide icon, label `truncate`. **Selected**: `text-primary font-bold bg-primary-container/10 border-r-4 border-primary` (export, code.html:133). **Idle**: `text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-r-4 border-transparent` (export 139). `aria-current="page"` on selected. Hover→pressed motion: `transition-colors` only (no scale).
  - Auto-scroll: on mount/active-change `scrollIntoView({ block: 'nearest' })` for the active row; hide scrollbar margin (`.sidebar-scroll` utility: overflow-y auto, `scrollbar-width: thin`).
  - Collapsed rows: `justify-center px-0`, icon 18px, `title` tooltip, same min height, selected shows `bg-primary-container/10` tint + **a left inset 3px `bg-primary` bar** (rail mode uses the left bar to avoid crouding the rail edge — 4px wide, `rounded-full`), or simpler: keep `border-r-4` (it sits 12px from the rail edge; acceptable and consistent — spec: keep `border-r-4` both states for one less variant).
  - order (9 user-level is fine, unchanged): Dashboard, My Agent, Insights, History, Settings, Drop Assignment, Data Lake, Billing, Extension, Guide → admin group appended under an `Admin` divider (`mt-4 pt-4 border-t border-outline-variant/20` + `px-3 pb-1 font-label-caps text-label-caps text-on-surface-variant/60` "Admin"): Control Center, Monitors.
- **A4 Footer user chip.** One component: `px-6 pt-4 border-t border-outline-variant/30`. Row: avatar `w-8 h-8 rounded-full bg-primary-container text-on-primary-container` — **renders `profile.avatarUrl` if set via `img object-cover`, else first letter** (fix P13); name `font-body-sm text-body-sm text-on-surface truncate` (public_id); sub `font-body-sm text-xs text-on-surface-variant` = wallet line — **single `WalletLine` source**: `` `${credits.toLocaleString()} credits` + (unlimited ? ` · ∅/∞ (Unlimited)` in `font-tabular-stat`) `` — no second copy of tokens here (topbar carries tokens; see 11.4). Click → settings. Collapsed: centered 32px avatar only.
- **States:** everything defined for default/hover/focus/selected; collapse persisted via `localStorage('helpotron_sidebar_collapsed')`.

### 11.3 Mobile drawer (≤md)
- Overlay + panel (spring slide, existing 250/25) unchanged; panel `w-72 md:hidden bg-surface-container-low border-r border-outline-variant/30 p-4 flex flex-col overflow-y-auto`.
- Blocks, in order: (1) brand header = same brand block (11.2 A1, expanded form) + 32px X close; (2) A2 CTA full width; (3) nav (11.2 A3 rows, expanded form, same selected/hovering); (4) `mt-auto` footer: `WalletLine` as a full-width chip `bg-surface-container border border-outline-variant/30 rounded-xl px-3 py-2.5 min-h-[44px]` (Coins icon + mono values, click → Billing) — *replaces* the current two-text row; Privacy; Sign out (error text). (5) **Add** an identity strip at the very top under the brand? No — keep the drawer lean; identity lives in the bottom chip row: user first line `font-body-sm` + "Guest/Sign in" only when logged out (shell only mounts authed — keep spec honest: render identity line only if `isLoggedIn`; drawer is authed-only today).
- All targets ≥44px; clicking any row closes the drawer then navigates.

### 11.4 Topbar
- Left: hamburger 44px (`md:hidden`, existing 3-span glyph fine) → **page title**: `font-title-md text-title-md font-semibold text-on-surface truncate` at **all** breakpoints (fix P9 — mobile can use `text-headline-lg-mobile` if a 20px title feels weak at 360px; spec: 20px at ≥md, 24px on mobile — do NOT go to 32px). Title source: `TITLE_MAP = { overview: 'Dashboard', agent: 'My Agent', insights: 'Insights', history: 'History', settings: 'Settings', dump: 'Drop Assignment', datalake: 'Data Lake', credits: 'Billing', extension: 'Extension', guide: 'Guide', admin: 'Control Center', monitors: 'Monitors', study: 'Study Tools', activity: 'Activity', library: 'Library', automation: 'Automation', inbox: 'Scraped Assignments', message_admin: 'Message Admin', terms: 'Terms of Service', privacy: 'Privacy Policy' }` — one lookup, covers all routable views (fix P10; keep `?? 'Dashboard'` fallback).
- Back/forward: keep `hidden lg:flex`, 32px, `disabled:opacity-30`, hover `bg-surface-container-high`.
- Right cluster `gap-2 sm:gap-3`, all `shrink-0`:
  - **Search trigger**: at `lg+` render-labeled: `flex items-center gap-2 px-4 h-11 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container` + `Search` 16 + `font-label-caps text-label-caps` "Search" + `<Kbd>⌘K</Kbd>` spacer (kbd = `font-code-sm text-[10px] bg-surface-container-high border-outline-variant/30 rounded-md px-1.5 py-0.5`). Below lg: 44px icon-only square (same classes, "Search anything… (⌘K)" aria-label) — fix P11.
  - **Wallet pill**: `flex items-center gap-2 px-4 py-2 h-11 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-outline/50` (export rounded-xl — fix P12) with `Coins` 16 primary + `font-tabular-stat text-tabular-stat font-medium text-on-surface` `Credits: {credits}` + divider `h-4 w-px bg-outline-variant/40 hidden sm:inline-flex` + token count `font-tabular-stat text-tabular-stat text-on-surface-variant hidden sm:inline` ("Unlimited" or `N tokens`); single aria-label: `"{credits} credits, {tokens} tokens — open wallet"`.
  - **NotificationBell** — see 11.6.
  - **Avatar**: `w-10 h-10 rounded-full bg-primary-container text-on-primary-container border border-outline-variant/30 hover:ring-2 hover:ring-primary`; **shows avatarUrl via img object-cover when set, else initial**; 44px min hit (add `p-0 min-h-[44px] min-w-[44px]` semantics or wrap—spec: keep 40px visual with a 44px hit area via `relative` :after, simplest: `min-w-[44px] min-h-[44px]`).
- **Quick-settings (form → menu, fixes P14/P15/P8):** panel `w-80 max-w-[calc(100vw-32px)] absolute top-full right-0 mt-2 rounded-2xl bg-surface-container-low border-outline-variant/30 shadow-2xl` + 12ms pop.
  1. Header: avatar (36, avatarUrl-aware) + name (`font-body-sm font-semibold`) + public_id (`font-code-sm text-[10px] text-on-surface-variant mono`).
  2. WalletLine row (mono, single source).
  3. `Theme` segmented: 3 buttons `px-3 py-2 rounded-lg text-[11px]`; selected `bg-primary text-on-primary font-semibold`, unselected `text-on-surface-variant hover:bg-surface-container-high` (labels Dark/Light/Auto).
  4. `AI effort` segmented (Low/Balanced/High, same control) — **keep** (it's the one setting users flip per session).
  5. Divider; link rows (44px): Settings (lucide `Settings`), Notifications (`Bell`, → `activity:notifications`), Privacy (`ShieldCheck`), Sign out (`LogOut`, error text `hover:bg-error-container/20`); build id mono 9px footer.
  - **Moved OUT to Settings/Profile:** phone editor, avatar upload, academic level, notifications on/off badge — the popover becomes a shortcut menu (cut crowding; controls already exist in SettingsApp).
  - A11y: `aria-haspopup="dialog"`, Escape + click-outside close (keep), focus first control on open, restore focus to avatar on close.

### 11.5 Command palette (M3 port)
- Overlay `fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4`; panel `w-full max-w-xl bg-surface-container-low border-outline-variant/30 rounded-3xl overflow-hidden shadow-2xl` (theme-aware — fixes P21); open/close 140ms ease-out; `role="dialog" aria-modal="true" aria-label="Command palette"`; focus trap; focus restore.
- Input row `px-4 py-3.5 border-b border-outline-variant/20 gap-3`: `Search` 18 `text-on-surface-variant`, input `flex-1 bg-transparent outline-none text-body-md text-on-surface placeholder:text-on-surface-variant/60` (placeholder "What do you want to do?"), trailing Kbd `esc` (styling per 11.4 search kbd).
- Sections:
  - **Header hints (new, fixes P26):** first group when query is empty = "Suggestions" — `Recent` (up to 4, `Clock` 14 icon, mono `recent` tag) then `Commands` (first 4 slash commands, each `Terminal`/`Slash` lucide icon 14) with a `font-label-caps` group header. After `|`-less query: filtered index items (live mode: none — see empty state).
  - Row: 24px icon slot (lucide: `Clock` recents, `Terminal` commands, `FileText` search hits), title `font-body-sm text-body-sm truncate` (selected `text-on-surface`, else `text-on-surface-variant`), subtitle `font-code-sm text-[10px] text-on-surface-variant/70 truncate`; selected row `bg-primary/10 border-l-2 border-primary` + trailing `CornerDownLeft` 14 `text-primary`. Hover = select. `max-h-[46vh]`.
  - **Empty state** (fix P23): lucide `SearchX` 24 in `bg-surface-container-high rounded-full w-12 h-12` + `font-body-md font-semibold` "No matches for “q”" + `font-body-sm text-on-surface-variant` "In live mode search covers what's on this screen — try a slash command instead." + two example kbd chips `/study` `/settings`… keep it short.
  - **Footer** `px-4 py-2 border-t border-outline-variant/20 font-code-sm text-[10px] text-on-surface-variant gap-3`: `↑ ↓ navigate · ↵ open · esc close` + right side `{SLASH_COMMANDS.length} slash commands — type /` (dynamic — fixes P23/P27; the hardcoded 5-command list dies).
- Data logic (keep, note fixes): empty query → recents first; `/` prefix → SLASH_COMMANDS filter, **hide `admin`/`monitors` when !isAdmin** (param in, fixes P24); re-name `/assignment` label to "Go to assignment history" or retarget a create modal (spec: retarget copy, keep target). Keyboard: Enter respecting `selected`; guard `results.length` before ArrowDown so selected never goes negative (fix P25). ⌘K while open → toggle close (App.jsx:310 handler gains `setPaletteOpen(o => !o)` — cross-file note; B1 read-only).

### 11.6 Notification bell + panel (single source of truth, fixes P16–P20)
- Trigger: 44px, `Bell` 18, badge `absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-bold ring-2 ring-surface` (ring = 2px surface for separation — fix P20), `aria-label` with live count.
- State model (spec, not code): one `unreadIds` store (localStorage `helpotron_notifications_read`, the existing key NotificationsView writes) — bell reads it; opening the panel does **not** mark; clicking a row marks read (dot → `bg-outline`, title → base weight) and syncs the badge; "Mark all" exists in the view.
- Panel: desktop `sm:w-80 sm:right-0 sm:mt-2`; mobile `fixed left-3 right-3 top-20` + scrim (keep). `bg-surface-container-low border-outline-variant/30 rounded-2xl shadow-2xl + 120ms pop`. Header: `font-body-sm font-semibold` "Notifications" + `Badge`-style unread chip **in M3** (`bg-primary/10 text-primary rounded-lg px-2 py-0.5 font-label-caps text-[10px]` — replaces legacy Badge slate/green classes) + 32px X ghost.
- List `max-h-72 overflow-y-auto`: row = dot `w-2 h-2 rounded-full` (unread `bg-primary`, read `bg-outline`) + title `font-body-sm` (unread = on-surface medium; read = on-surface-variant) + body `text-[11px] text-on-surface-variant line-clamp-2` + mono `font-code-sm text-[10px] text-on-surface-variant/70` `timeAgo · channel`; unread row also `bg-primary/5`? — no: keep clean; hover `bg-surface-container` (both states), row press marks read. Row click = mark-read only (no navigation in the spec'd product today).
- **Empty vs no-data (fix P19):** *demo* mode empty: "You're all caught up ✦" (keep copy, drop the glyph → lucide `CheckCircle2` 16 inline or plain text). *Live* mode: `BellOff` icon + "No notifications yet — we'll ping you here when a draft is ready." + secondary link row "Manage preferences →" = `Settings → Notifications` (`onNavigate('settings')`), and no unread chip.
- Footer: "View all notifications →" **must** go to `activity:notifications` (pass the tab — bell's `onOpenAll` becomes `() => onNavigate('activity', 'notifications')`; App.jsx handleSelectView already supports tab, App.jsx:547–557 — fixes P18).

### 11.7 Mobile bottom bar
- Slots: Home / Agent / Insights / History / More — keep (export parity). Each item `flex flex-col items-center justify-center rounded-xl px-4 py-1 min-h-[44px] min-w-[44px]` (add the min classes the export had, code.html:305 — fixes P28), icon 20, label `font-label-caps text-[10px] mt-1`. Selected: `bg-primary-container text-on-primary-container font-semibold` **without `scale-90`** (or keep scale but on an inner span so hit area is stable — spec: drop scale; container tint alone matches export and removes the 1px jump). Idle: `text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface`. `aria-current="page"` (keep). More: `aria-expanded={mobileMenuOpen}` + opens the drawer (keep). `pb-safe` (keep). Reduced motion: no-op (transition-colors only).

### 11.8 Footer
- `font-code-sm text-[11px] text-on-surface-variant text-center px-4 py-4` (drop `pb-20 md:pb-4` — main owns clearance, fix P29), links hover `text-on-surface underline underline-offset-2`. Keep 3 items + © 2026. Optional 4th: "Help" → guide (don't invent; keep 3).

### 11.9 NotFound polish (small)
- Keep composition; change: `animate-ping`/`animate-spin` → `[data-motion="reduced"] .animate-spin, [data-motion="reduced"] .animate-ping { animation: none }` global (CSS-level, in index.css — one rule for the app, fixes P30); add secondary action "Try ⌘K" — no: keep single CTA, but add a subtle `font-code-sm` line "P.S. ⌘K searches everything" (copy only). Fix `font-body-md text-body-sm` line to `font-body-sm text-body-sm` (P31 typo-class tidying). Roles: fine as-is; ensure the card `role="main"` moves to the view root (already 13).

### 11.10 NotificationsView M3 port (so panel & view match)
- `clean-card` → `bg-surface-container-lowest border-outline-variant/20 rounded-2xl`; `bg-white/3` rows → `hover:bg-surface-container`; text slate → `text-on-surface`/`text-on-surface-variant`; category emoji → lucide icons in M3 tint tiles (`bg-sem-blue/15 text-sem-blue`, etc.); `opacity-60` read → `text-on-surface-variant` title + softer (`text-on-surface-variant/60` body); `Badge` → M3 chip; footer hint stays (textual).

### 11.11 New/changed files for the implementer
- Components (replacement targets, no renames needed): `AppShell.jsx` (all of 11.2–11.8), `CommandPalette.jsx` (11.5), `NotificationBell` (extract to own file — currently inside AppShell.jsx:235), `QuickSettings` (11.4 shortened), `Badge`/`Kbd` in `ui/os.jsx` get M3 color keys (add `tint` variant; don't break 40+ call sites).
- Cross-file notes (B1 read-only): App.jsx:310 ⌘K toggle; App.jsx:665 palette moved above shell (already) with `isAdmin` prop; AppShell "View all" tab pass (11.6); `TITLE_MAP` in AppShell.
- index.css additions: `.kbd`, `.sidebar-scroll`, reduced-motion kill (11.9), remove or re-point `.surface-glass-strong` consumers (palette is the only one — grep verified) — keep the class for other legacy modals but palette stops using it.

---

## 12. What NOT to change (stability guard)
- Data flows: `getNavItems` keys, `SLASH_COMMANDS` targets, `handleSelectView` mapping, `NewAssignmentModal` launch path (AppShell 879–888), palette recents storage key, view-enter animation (index.css:846), sidebar spring constants, branding copy "Helpotron OS / Premium Co-pilot", export-identical h-16/z-order/backdrop, 44px rule.
- Do not add a second search to the topbar, no theme switcher in the topbar cluster (it lives in quick settings), no new nav items, no notifications API contract beyond what exists (live-mode UI must degrade to the 11.6 empty state, not fake data).

---

*Compiled by B1 from: AppShell.jsx (891 lines), CommandPalette.jsx, NotFound.jsx, NotificationsView.jsx, ActivityView.jsx, ui/os.jsx, demoData.js, App.jsx, index.css §§1433–1735, and the Stitch v3 export shell `helpotron_dashboard_dark_default_1/code.html`. All claims cite live rows; nothing is inferred from screenshots alone.*
