# B3 — Home Dashboard (AssignmentCardDashboard.jsx) Design Teardown + Regeneration Spec

**Component:** `/home/roni/Roni_workspace/helpotron/web/src/components/AssignmentCardDashboard.jsx` (697 lines) — the "Active Subjects" dashboard, rendered by `/home/roni/Roni_workspace/helpotron/web/src/App.jsx` (HOME / overview view, `openAssignment` ? detail : dashboard + `<AssignmentTurnInView/>` below).
**Buckets source:** `/home/roni/Roni_workspace/helpotron/web/src/lib/assignmentBuckets.js`.
**Tokens:** `web/src/index.css` — Tailwind-4 `@theme inline` M3 roles (`--color-surface-container-lowest`, `--color-on-surface`, `--color-outline-variant`, …) + 8 semantic pairs (`--color/sem-{amber,blue,green,cyan,indigo,deepgreen,gray,slate}` / `on-sem-*`, lines 1482–1489 light, 1556–1563 dark) + fonts `headline-lg`/`title-md` = Hanken Grotesk, `body-md`/`body-sm` = Inter, `label-caps` = JetBrains Mono (line 1679–1686).
**Reference (Stitch, source of truth):** `helper_dashboard_1/screen.png` (light), `helper_dashboard_dark_default_1/screen.png` (dark) — Stitch shell already supplies sidebar + topbar ("Dashboard" title, "Credits: 1,240" pill, avatar); THIS component supplies only the content column starting at "Active Subjects". Stitch rationale (redesign_rationale.md_1.md Deliverable 4): **status chips must have a dot indicator + label-caps + semantic color**; radius standard: 3xl containers / 2xl cards+icon tiles / xl buttons+inputs / lg chips / full badges.

---

## 1. ANATOMY (current render, top→bottom, with tokens)

```
<div class="space-y-8 max-w-[1200px] mx-auto p-4 md:p-6">
│
├─ [A] Export notice (conditional) — p-3 bg-primary/10 border-primary/30 rounded-xl
│     font-label-caps uppercase text-xs text-primary ("✅ …" / "❌ …")
│
├─ [B] Page header — flex-col sm:flex-row justify-between gap-4
│    ├─ h2 "Active Subjects" — font-headline-lg text-headline-lg text-on-background
│    ├─ p  "Manage and review your study tasks grouped by domain." — font-body-md text-on-surface-variant
│    └─ actions (shrink-0):
│       ├─ Button variant=secondary size=sm rounded-xl font-label-caps uppercase — [Plus] "New Subject"
│       └─ icon-only button 44px — [Download] Export complete user data (title/aria only)
│
├─ [C] Create-subject panel (inline expanding card, NOT modal)
│    rounded-3xl bg-surface-container-lowest border-outline-variant/30 shadow; title-md
│    "🫧 Add a New Custom Subject"; inputs: title (col-span-2), emoji <select> (7 emoji options),
│    description textarea; Cancel (outline) / Save Subject (primary, disabled until title+desc)
│
├─ [D] Subject sections — "space-y-8", one per bubble (6 DEFAULT_SUBJECT_BUBBLES + custom
│    bubbles + synthetic "General & Electives" when unassigned cards exist)
│    section: rounded-3xl bg-surface-container-lowest p-6 md:p-8 border-outline-variant/20
│    shadow-[0_4px_20px_rgba(0,0,0,0.02)]
│    ├─ [D1] Header — flex-col md:flex-row justify-between mb-6, border-b outline-variant/20 pb-4
│    │   ├─ icon tile — w-12 h-12 rounded-2xl bg-secondary/10 text-secondary text-2xl, EMOJI glyph
│    │   ├─ title h3 — font-title-md text-title-md text-on-surface (+ "Custom" pill:
│    │   │     bg-primary-container/15 text-primary rounded-full label-caps 10px)
│    │   ├─ count p — font-body-sm text-on-surface-variant "{N} active {assignment|assignments}"
│    │   └─ actions: [EXPORT ALL] btn — label-caps text-secondary border-secondary/20
│    │         px-4 py-2 rounded-xl (RefreshCw spin while exporting);
│    │         custom-only [Minus] delete icon btn (confirm() destructive)
│    ├─ [D2] Empty subject (subjectCards.length===0)
│    │   rounded-2xl border-dashed outline-variant/50 bg-surface-container-low/50 p-8 center
│    │   ├─ circle w-16 h-16 bg-surface-container-highest text-outline [Plus 8x8]
│    │   ├─ h4 "Ready to study {title}?" — body-md semibold text-on-surface
│    │   ├─ p  "Import an assignment prompt, reading materials, or start a new problem set…" body-sm
│    │   └─ [Import Assignment] primary btn — [Plus] rounded-xl px-6 py-3 → opens NewAssignmentModal
│    └─ [D3] Grid — grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
│        ├─ [D3a] IN PROGRESS — col-span-1 md:col-span-2 lg:col-span-2, space-y-4
│        │   ├─ h4 label "IN PROGRESS (N)" — font-label-caps text-label-caps uppercase tracking-wider
│        │   ├─ empty: bg-surface rounded-2xl dashed p-5 — "No active assignments currently in progress."
│        │   └─ card (per assignment): card-lift bg-surface rounded-2xl p-5 border-outline-variant/20
│        │        flex-col sm:flex-row justify-between (content | actions)
│        │        ├─ status chip (see §4) + due row: [Calendar outline | AlertTriangle error] + text
│        │        │   "Due: Oct 24" / "Overdue: Oct 24" (overdue → text-error font-medium)
│        │        ├─ h5 title — body-md font-semibold text-on-surface hover:text-primary cursor-pointer
│        │        │   truncate, onClick → onSelectAssignment(card)
│        │        ├─ meta "{subject} · {class_code}" — body-sm text-xs mt-0.5 truncate
│        │        └─ actions: [Download] icon btn 44px (bg-surface-container-low) +
│        │            action btn (bg-primary/10 text-primary → hover bg-primary) label per
│        │            actionLabel(): Review Now / View Draft / Continue
│        └─ [D3b] PENDING APPROVAL — col-span-1, space-y-4
│            ├─ h4 label "PENDING APPROVAL" + count badge (bg-error-container text-on-error-container
│            │   w-5 h-5 rounded-full 10px bold) when >0 — NOTE: rendered INSIDE flex with gap-2 but
│            │   is NOT a flex container; badge sits after text via inline flex on h4
│            ├─ empty: bg-surface-bright rounded-2xl dashed p-5 — "No actions awaiting approval"
│            └─ card: bg-surface-bright rounded-2xl p-5 **border-l-4 border-error/50** space-y-3
│                ├─ chip "PENDING APPROVAL" (amber) — duplicated from getStatusBadge by hand
│                ├─ h5 title — body-md semibold line-clamp-2, clickable
│                ├─ p description — body-sm text-xs line-clamp-2 (fallback copy)
│                └─ [Review Now] w-full bg-surface-container-low border-outline-variant/50
│
├─ [E] Pointer row to History — rounded-3xl bg-surface-container-lowest p-6 border, flex-col sm:flex-row
│       [Archive] tile w-12 h-12 bg-surface-container-high text-outline + title-md
│       "Submission Ledger & Archive" + body-sm copy +
│       [View Submission Ledger] btn — bg-surface-container-low text-secondary label-caps + ArrowRight
│
├─ [F] NewAssignmentModal (Import Assignment) — isOpen=showImportModal
└─ [G] LaunchToDocModal — visually hidden (launchToDocAssignment always null in this file)
```

### Live-data wiring
- State: `cards` (normalized via `normalizeCards`), `turnedInIds` Set (ghost filter hides turned-in; they live in the history ledger only), `customBubbles`, `loading`, `showImportModal`, `newBubble*`, `exportNotice`, `bubbleExporting`.
- Refetch triggers: mount (+userId change), `visibilitychange`→visible, window `focus`, and `helpotron:assignment-created` window event.
- Subject matching: substring/keyword heuristic `matchCardToBubble` (subject/class_code/name/description vs bubble title/description + per-subject regex). **A card matching 2+ bubbles renders in 2 sections (duplicated)**; `subj_other` collects unmatched.

---

## 2. VARIANTS & STATES

| # | Variant | State | Current visual |
|---|---------|-------|----------------|
| V1 | Dashboard loading | skeleton | animate-pulse: h-8 w-64 + h-4 w-96 blocks, then 2 × rounded-3xl skeleton section (12×12 tile, 3 rows of bars, 2/3+1/3 grid) |
| V2 | Subject with cards | normal | §D3 two-column grid |
| V3 | Subject with 0 cards | empty | §D2 dashed empty state + Import Assignment CTA |
| V4 | Subject "General & Electives" | synthetic, 0 cards possible | NEVER empty state — only present when unassignedCards>0, and its count uses same `<N> active` copy |
| V5 | Custom subject | non-removable default | + "Custom" pill + delete (Minus) button |
| V6 | In-progress column empty | empty | dashed "No active assignments currently in progress." |
| V7 | Pending column empty | empty | dashed "No actions awaiting approval" |
| V8 | Card overdue | due < now | due row: AlertTriangle error + "Overdue: Oct 24" in text-error font-medium; chip unchanged |
| V9 | Card statuses | see §4 matrix | chip variants |
| V10 | Export per subject | in-flight | Export All button → RefreshCw spin, disabled (bubbleExporting) |
| V11 | Export per assignment | in-flight | NO spinner; immediate call; success/fail only via notice [A] |
| V12 | Export failure | 404 vs other | "nothing recorded for this subject yet." vs err.message |
| V13 | All subjects empty (fresh account) | global empty | Renders V3 six times + history pointer; no dashboard-level hero empty state |
| V14 | Fetch error | load fail | console.error only → falls through to "all empty" sections (misleading; no error UI) |
| V15 | Guest/demo user | isGuest="student_demo" default | identical, no guest differentiation in this component |
| V16 | Zero-credit | — | NOT in this component; credits pill lives in AppShell topbar (Stitch: "Credits: 1,240") — see shell agent |
| V17 | Assignment created | event | refetch; no optimistic render |
| V18 | Turned-in assignment | ghost | hidden from dashboard (ledger only) |

---

## 3. BUTTONS CATALOG (current)

| Button | Style | Tokens | State notes |
|--------|-------|--------|-------------|
| New Subject | secondary sm | rounded-xl, label-caps 12px uppercase, Plus 4×4 | opens inline panel [C]; NOT a modal |
| Export all user data | icon-only 44px | Download 4×4, border outline-variant/30 | label hidden (aria/title only) |
| Export All (per subject) | text-btn | secondary text + border-secondary/20, label-caps, Download 4×4 | min-h-44, focus-ring secondary; spin on busy |
| Delete custom subject | icon-only 44px | **Minus** glyph, hover:text-error hover:bg-error-container/20 | confirm() native; destructive misicon |
| Export assignment | icon-only 44px | bg-surface-container-low, Download | tooltip only |
| View Draft / Continue / Review Now (in-progress card) | primary-soft | bg-primary/10 text-primary → hover:bg-primary hover:text-on-primary, body-md font-medium | label via actionLabel() |
| Review Now (pending card) | full-width neutral | bg-surface-container-low border-outline-variant/50 | min-h-44 |
| Import Assignment (empty subj) | primary lg | px-6 py-3, Plus 4×4 | opens NewAssignmentModal |
| View Submission Ledger | secondary outline | bg-surface-container-low text-secondary label-caps, Archive + ArrowRight | only when onOpenHistory |
| Cancel / Save Subject | outline / primary | label-caps | Save disabled until title+desc |

---

## 4. STATUS CHIP MATRIX — current vs Stitch-standard (10-chip)

Chips today: `rounded-lg`, `px-2 py-0.5`, 10px label-caps uppercase medium, `bg-{sem}/10 text-{sem} border-{sem}/20`. **No dot** (Stitch rationale Delivery 4 demands a dot indicator per chip).

| Bucket | Status string(s) | Stitch chip (source of truth) | Current impl (getStatusBadge) | Mismatch |
|--------|------------------|-------------------------------|-------------------------------|----------|
| pending | pending_approval / pending / tracked | **amber** | amber "Pending Approval" | `tracked` hits fallback gray "Drafting" (should be **indigo**) |
| pending | not_started / not started | outline chip (neutral) | fallback gray "Drafting" — **wrong label for a not-started card in a Pending column** | P3 |
| in_progress | in_progress / processing | **blue** "In Progress" | blue | ok |
| in_progress | paused | **slate** | fallback gray "Drafting" | missing |
| in_progress | humanizing | **cyan** "Humanizing" | cyan | ok |
| in_progress | ready for review | **amber** "Ready for Review" | amber | ok |
| completed | completed | **green** | green | ok |
| completed | submitted | **cyan** | green (collapsed) | missing |
| completed | graded | **sem-deepgreen** | green (collapsed) | missing |
| — | archived | **sem-gray** "Archived" | fallback | archived cards never render (ledger) — fine, but the Stitch chip set should exist for History |
| — | overdue | error/10 text-error | (no chip — only due-row coloring) | consider chip on overdue in-progress cards |

Root cause: substring matching priority + no exact status table. Regeneration MUST map via `getAssignmentBucket()` + an exact `STATUS_CHIP` table (B7's data model), never substrings.

---

## 5. PROBLEMS (ranked; fix in regeneration)

1. **P1 — Section/status mismatch.** `BUBBLE_SECTIONS` declares Completed→In Progress→Pending, but JSX renders only In Progress + Pending, and `in_progress` bucket filter ORs in `completed`: completed cards show a green chip inside an "IN PROGRESS (N)" column, and its count includes them. Counts lie.
2. **P2 — Headline copy mismatch vs Stitch.** Stitch ("Ready to analyze some texts?", "Import an essay prompt, reading assignment, or start a new critical analysis session to populate this subject.", outline-broken icon, bordered error card for pending) differs from current impl ("Ready to study {title}?", filled circle, error-left-border pending card). Regeneration must follow the Stitch screens.
3. **P3 — `not_started` shows gray "Drafting" chip.** Substring fallback mislabels; pending column semantics broken.
4. **P4 — Status chip standard violated.** No dot indicator; submitted/graded collapsed to generic green; tracked/paused → gray.
5. **P5 — `bubble.color` unused.** DEFAULT_SUBJECT_BUBBLES specify `color` (blue/purple/amber/emerald/teal/indigo); every icon tile renders `bg-secondary/10 text-secondary`. Stitch shows per-subject tinted tiles (Advanced Chemistry purple tile, English Literature teal tile).
6. **P6 — Emoji icons.** Icon tile + picker use raw emoji (📐📖🏛️💻🧬🧠; 🫧 wait — source has emojis; picker is 7 emoji). Render varies by OS; Stitch shows vector glyphs. Wire the 6 default bubbles to lucide icons (Ruler/BookOpen/Landmark/Code/Dna/Brain) + keep emoji for user-created.
7. **P7 — Duplicate cards across sections.** `matchCardToBubble` keyword heuristics (e.g. "History of Calculus" → math AND history). B7's data model should assign subject_id per card; visuals must de-dupe (render card under exactly one section).
8. **P8 — md-columns broken.** Grid `md:grid-cols-2` with `col-span-1` pending → between 768–1023px pending column leaves a ragged half-width gap next to an empty column. Use md:grid-cols-3 at all desktop sizes (sticky pending: `md:col-span-1`), or stack pending under in-progress below lg.
9. **P9 — No fetch-error state.** `fetchDashboardData` catch → console only; user sees 6 fake-empty subjects. Need an inline error banner + retry.
10. **P10 — Inconsistent card interaction.** In-progress card: only title is clickable (truncated 1-line); pending card: title + Review Now both clickable, 2-line clamp. Whole card should be a button (or explicit chevron) with consistent semantics/keyboard.
11. **P11 — Per-assignment export invisible.** Icon-only Download, no spinner, no disabled state; Export All user data icon-only in header with no visible label.
12. **P12 — Confusing destructive delete.** `Minus` glyph + native confirm() — no Trash2/alert chip; irregular icon sizes (Minus w-4 h-4).
13. **P13 — Create-subject panel is a jump-in mystery.** Inline expanding card with `animate-fadeIn`, no modal semantics (no Escape/focus trap), 7-emoji selector, no color/icon alignment with Stitch tile system. Should be a proper dialog matching Stitch artifact style (rounded-xl inputs 44px min, label-caps).
14. **P14 — No subject-level config (the Bob spec).** Completely absent. See §7 for the placement spec.
15. **P15 — No subject-level aggregated status summary.** Overdue count per subject invisible until you read rows; no "N overdue" or pending-count chip in subject header.
16. **P16 — Meta count phrasing** `"{subjectCards.length} active assignments"` counts completed → "active" is wrong (P1 sibling).
17. **P17 — PENDING APPROVAL column header has no space-y when empty**… trivial layout: h4 flex items-center gap-2 already, but the count badge uses `bg-error-container` while the empty/dark variant contrast may fail; stick to `bg-error text-on-error` (as Stitch red badge) or error/15.
18. **P18 — Floating stale modals.** `LaunchToDocModal` always closed; `launchToDocAssignment` never set → dead weight (drop in regeneration).
19. **P19 — `max-w-[1200px]`** — smaller than Stitch fluid container; the shell's Dashboard topbar reads as page-wide. Use `max-w-[1248px]`/fluid per Stitch or shell container token.
20. **P20 — Due date chip vs inline text.** Stitch shows bordered chip `[📅 Oct 24]`; current is plain inline text + icon with no radius. Regenerate as bordered due chip.

---

## 6. REGENERATION SPEC — for Google Stitch

Scope: content column ONLY (shell/topbar/sidebar = AppShell agent's job). Follow **dark-default + light** pair of the reference screens; preserve M3 token classes.

### 6.1 Page header (unchanged layout, refined tokens)
- `space-y-8 max-w-[1248px] mx-auto p-4 md:p-6` root.
- h2 `font-headline-lg text-headline-lg text-on-background` **"Active Subjects"**; sub `font-body-md text-body-sm md:text-body-md text-on-surface-variant` **"Manage and review your study tasks grouped by domain."**
- Actions right, shrink-0, gap-2.5, all `min-h-[44px] focus:ring-2 focus:ring-primary`:
  - **New Subject** — `variant=secondary size=sm` rounded-xl, label-caps 12px uppercase, Plus 4×4 → opens the create-subject DIALOG (not inline panel): Stitch modal surface `rounded-3xl bg-surface-container-lowest border-outline-variant/30 p-6`, title-md, title + icon-select + color-select (8 sem colors) + description textarea (focus ring-2 primary), footer Cancel outline / Save primary label-caps; Escape + overlay backdrop close; keyboard focus trap.
  - **Export archive** — visible-label text button (label-caps "EXPORT ALL DATA" with Download 4×4) or keep icon-only but add a visible tooltip anchor; spinner state RefreshCw.

### 6.2 Subject section (per bubble, space-y-8)
- Section: `rounded-3xl bg-surface-container-lowest border border-outline-variant/20 p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.02)]`.
- **Header** — `flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-6 border-b border-outline-variant/20`:
  - Icon tile 12×12 (48px) `rounded-2xl` tinted by subject color: map the 6 bubble hues to sem tokens — Math/blue → `bg-sem-blue/15 text-sem-blue`; English/purple → `bg-sem-indigo/15 text-sem-indigo`; History/amber → `bg-sem-amber/15 text-sem-amber`; CS/emerald → `bg-sem-deepgreen/15 text-sem-deepgreen`; Biology/teal → `bg-sem-cyan/15 text-sem-cyan`; Psych/indigo → `bg-sem-indigo/15 text-sem-indigo`; custom colors pick from the same 8-sem palette; **lucide icons** (Ruler, BookOpen, Landmark, Code2, Dna, Brain) size 24, white-space-safe.
  - Title `font-title-md text-title-md text-on-surface`; **NEW inline config summary meta line** (see §7); count `font-body-sm text-body-sm text-on-surface-variant` **"{N} in progress · {M} pending approval"** (drop misleading "active" incl. completed; render per-column counts).
  - Actions cluster: **[Subject Settings]** gear (SlidersHorizontal or Settings2 lucide, 44px icon-soft w/ label) → toggles §7 panel; **[EXPORT ALL]** label-caps secondary border-secondary/20 as today; custom subjects additionally **[Trash2]** 44px hover:text-error hover:bg-error-container/20.
- **New config panel** → §7.
- **Grid** — `grid grid-cols-1 md:grid-cols-3 gap-6` (fixes P8), two columns:
  - **In Progress** `md:col-span-2 space-y-4`; header `font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider` "IN PROGRESS (N)" (N = exact bucket count, no completed).
  - **Pending Approval** `md:col-span-1 space-y-4`; header + count badge `bg-error text-on-error rounded-full w-5 h-5 text-[10px] font-bold` (Stitch red badge).
  - On `md` breakpoint the pending column is `sticky top-24`-optional; simplest layout: full grid at md+ (3 cols) so nothing is ragged.

### 6.3 Assignment cards

**In-progress card** (per card, `card-lift bg-surface rounded-2xl p-5 border border-outline-variant/20 hover:border-outline-variant/50 transition-all`, `flex flex-col sm:flex-row sm:items-center justify-between gap-4`):
- Row 1: status chip (§6.4, with 6px dot) + **due chip** `rounded-lg border outline-variant/30 px-2 py-0.5 font-body-sm text-xs flex items-center gap-1` — normal: Calendar 3.5×3.5 outline + "Due Oct 24"; overdue: `border-error/30 text-error font-medium bg-error/10` + AlertTriangle 3.5×3.5 + "Overdue Oct 24".
- Title h5 `font-body-md font-semibold text-on-surface truncate` clickable (whole card clickable — role="button" on wrapper; hover:text-primary) → AssignmentDetailView.
- Meta `font-body-sm text-xs text-on-surface-variant mt-0.5 truncate` — `{subject} · {class_code}`.
- Actions: [Download] 44px icon `bg-surface-container-low rounded-xl text-on-surface-variant hover:text-primary` (spinner on export) + action button `px-4 py-2 rounded-xl min-h-[44px] font-body-md font-medium` — `bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition`, label from centralized `actionLabel(status)`:
  - pending/review → **Review Now**
  - humanizing | drafting → **View Draft**
  - else → **Continue**
- **Overdue accent**: 2px top border `border-t-2 border-error/40` OR left error tick; keep AlertTriangle row (recommended: none — due chip suffices per Stitch).

**Pending card** (per Stitch screen: bordered error card, NOT left-border error bar):
`rounded-2xl border border-error/30 p-5 bg-surface-bright space-y-3` (Stitch shows a soft red-bordered card — keep `border-l-4 border-error/50` only if faithful; reference image shows full border), body-sm description `line-clamp-2`, footer `w-full bg-surface-container-low hover:bg-surface-container border border-outline-variant/50 rounded-xl px-4 py-2 min-h-[44px] font-body-sm font-medium text-on-surface` **Review Now**.

### 6.4 Status chips (constant: `rounded-lg px-2 py-0.5 inline-flex items-center gap-1.5 font-label-caps text-[10px] uppercase font-medium`, 6px dot = `w-1.5 h-1.5 rounded-full`)

| Status | Chip tokens | Dot | Label |
|---|---|---|---|
| pending_approval / pending | `bg-sem-amber/10 text-sem-amber border border-sem-amber/20` | sem-amber | PENDING APPROVAL |
| not_started | `bg-surface-container-high/60 text-on-surface-variant border border-outline-variant/30` | outline | NOT STARTED |
| in_progress / processing | `bg-sem-blue/10 text-sem-blue border-sem-blue/20` | sem-blue | IN PROGRESS |
| paused | `bg-sem-slate/10 text-sem-slate border-sem-slate/20` | sem-slate | PAUSED |
| humanizing | `bg-sem-cyan/10 text-sem-cyan border-sem-cyan/20` | sem-cyan | HUMANIZING |
| ready_for_review | `bg-sem-amber/10 text-sem-amber border-sem-amber/20` | sem-amber | READY FOR REVIEW |
| completed | `bg-sem-green/10 text-sem-green border-sem-green/20` | sem-green | COMPLETED |
| submitted | `bg-sem-cyan/10 text-sem-cyan border-sem-cyan/20` | sem-cyan | SUBMITTED |
| graded | `bg-sem-deepgreen/10 text-sem-deepgreen border-sem-deepgreen/20` | sem-deepgreen | GRADED |
| tracked | `bg-sem-indigo/10 text-sem-indigo border-sem-indigo/20` | sem-indigo | TRACKED |
| archived | `bg-sem-gray/10 text-sem-gray border-sem-gray/20` | sem-gray | ARCHIVED |
| overdue overlay | error/10 border-error/30 (only as due-chip, not status chip) | error | OVERDUE |

Table = single `STATUS_CHIP` map keyed by normalized status; resolved through bucket when unknown (unknown → NOT STARTED neutral, never silently "Drafting"). Rendered via one `<StatusChip status/>` component reused in detail/history (B6/B8) for global consistency.

### 6.5 Empty & failure states
- **Empty subject** — EXACT Stitch copy: circle `w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-outline` (icon = subject lucide glyph, not Plus), h4 `**"Ready to analyze some {domain}?"**` (Stitch literal: "Ready to analyze some texts?"), body `"Import an essay prompt, reading assignment, or start a new critical analysis session to populate this subject."`, CTA primary `Plus + Import Assignment` (px-6 py-3 rounded-xl min-h-[44px]).
- **Subject with cards but empty column** — keep dashed placeholders (in-progress: "No active assignments in progress."; pending: "No actions awaiting approval.").
- **Fetch error** (`cardsData===null && !loading`) — new inline error card `rounded-2xl border border-error/30 bg-error/5 p-4 flex items-center gap-3` + [Retry] button; never render empty-state sections on fetch failure.
- **Dashboard global empty** — as V13: Stitch renders helper sections each with empty state; keep that (each subject shows its own empty state), and the synthetic "General & Electives" section must NOT appear when 0 unassigned cards. No additional hero empty state needed.
- **Zero-credit** — out of scope here: credits pill is in AppShell topbar ("Credits: 1,240" + chip). Hand off to shell agent; dashboard itself needs no credit visuals.

### 6.6 History pointer row
Unchanged structure: `rounded-3xl bg-surface-container-lowest p-6 border-outline-variant/20 shadow`, Archive tile 12×12 `bg-surface-container-high text-outline`, title-md **"Submission Ledger & Archive"**, body-sm copy, CTA `bg-surface-container-low hover:bg-surface-container text-secondary label-caps uppercase tracking-wider rounded-xl px-5 py-2.5` + Archive w-4 + ArrowRight w-4 → onOpenHistory. Gate on `onOpenHistory` as today.

### 6.7 Skeleton loading
Keep the exact Stitch shimmer approach: 2–3 section skeletons (12×12 tile, 3 bar rows, 2/3+1/3 grid inside), no navbar skeleton (shell owns chrome). `animate-pulse` consistent with existing `.shimmer`. Do not flash skeleton on refetch while cards exist (only first load): gate `loading` skeleton on `cards.length===0 && loading`.

---

## 7. PER-SUBJECT CONFIG EMBED (Bob spec — VISUAL ONLY; data = B7)

**Principle:** the subject card owns a persistent, per-subject `subject config` — the SAME widgets used per-assignment in the assignment experience (detail view, B-sibling) with **global defaults as base** — exposed reachable from the dashboard in 2 clicks max.

### 7.1 Placement: expandable inline settings panel (recommended) — NOT popover, NOT modal
- **Collapsed affordance** — in the subject header actions cluster, a labeled button: `[SlidersHorizontal 4×4] SETTINGS` (label-caps 12px, 44px min) between EXPORT ALL and delete. When the subject uses **any non-default value**, the button gets a 6px dot `bg-sem-amber` ("has overrides" affordance); when fully global, plain outline.
- **Collapsed state ALSO shows a 1-line config summary** under the subject title (replaces nothing; adds a meta line): `font-body-sm text-xs text-on-surface-variant` — `"Educational: On · Personality: The Scholar · Min score: 85 · Effort: 6/10"`, muted; only render fields with overrides (else `"Using global defaults"` + Gear icon). This makes state visible WITHOUT interaction (state-table below).
- **Expanded state** — a dedicated disclosure panel rendered between the subject header and the grid, animating `max-h`/fade (180ms), `rounded-2xl bg-surface-container-low/60 border border-outline-variant/30 p-5 md:p-6 space-y-5`, header row `font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider` "SUBJECT SETTINGS" + right side `[Reset to Global]` (disabled when no overrides) + `[Done]` or minimize. `aria-expanded` on toggle, Escape collapses. Panel does NOT push the columns off-screen; grid follows below.

### 7.2 Widgets inside the expanded row (same widget kit as assignment-level config — B sibling owns it; here declare the 6 controls + their states)

1. **Educational Mode** — segmented control (2 options, label-caps 12px, min 44px, `bg-surface-container-high rounded-xl p-1`; active seg = `bg-primary text-on-primary shadow-sm`): `ON — fully humanized output` / `OFF — raw output`. Default: ON.
2. **Agent Personality** — `<select>` styled `bg-surface-container-lowest rounded-xl px-3.5 py-2.5 min-h-[44px] border-outline-variant/30`, options from agent identities ("The Scholar", "The Editor", … from MyAgentView identities; first = global default). State: placeholder "Default (Global)" when unset.
3. **Human Score Minimum** — stepper group: minus/plus 44px icon buttons + number input (body-md tabular) + range slider `accent-primary` 50–100 in a `bg-surface-container-high rounded-lg px-2` track; label-caps hint "Below this score, output is reworked." Default: global (85).
4. **Writing Style Examples** — multiline textarea (rows 3, `rounded-xl bg-surface-container-lowest border-outline-variant/30 focus:ring-2 focus:ring-primary resize-y`) + `[+ Add Example]` chip button; renders as bulleted `body-sm` list rows with Trash2 44px delete each. Empty state: dashed placeholder "No examples yet — add a sample sentence or paragraph." + Add button.
5. **Rules** — same list pattern, label-caps "RULES (N)": row editor (input + Add), each row `bg-surface-container rounded-xl px-3 py-2 flex justify-between` + Trash2. Empty: "No rules yet — inherit global rules." + Add.
6. **Effort Score** — 5-point scale (1 = Quick, 5 = Deep; UI 1–10 stored ×100 → 1–1000 backend, reuse MyAgent `effortBucket` thresholds 300/700): row of 5 pill buttons `rounded-xl border-outline-variant/30 font-label-caps`; levels label `LOW / LOW-MID / BALANCED / HIGH-MID / HIGH`; selected = `bg-primary text-on-primary`. ± hint text under: "Higher effort = better writing, more compute."

### 7.3 Config states table

| State | Visual |
|---|---|
| Collapsed, fully global | plain SETTINGS button; meta line "Using global defaults"; panel hidden |
| Collapsed, ≥1 override | SETTINGS button + amber 6px dot; meta line lists overridden fields only, e.g. "Effort: 7/10 · Personality: The Editor" |
| Expanded, global | all widgets read global defaults; "Reset to Global" disabled; footer note `font-body-sm text-xs text-on-surface-variant` "Editing here overrides global defaults for {subject} only." |
| Expanded, overridden | per-widget "override" tag `rounded-full bg-sem-amber/15 text-sem-amber px-2 py-0.5 font-label-caps text-[9px]` on touched widgets; Reset to Global enabled |
| Saving | widget-level spinner (RefreshCw animate-spin 3.5×3.5) inline next to touched control; disabled confirms |
| Per-assignment override | (NOT on dashboard — assignment experience only; dashboard panel always shows subject-level values, badge "subject default" vs "assignment override" not needed here) |

### 7.4 Mobile behavior of the embed
- ≤640px: header actions wrap to their own row (`flex-row justify-between` under the title block); SETTINGS button stays visible and becomes the primary cluster action (icon + "SETTINGS"); EXPORT ALL moves beside it.
- Expanded panel: widgets stack full-width (`grid-cols-1 → md:grid-cols-2` at md+), 44px+ touch targets everywhere, scrolls in-page (no modal), `space-y-4`.
- Meta summary line truncates (`truncate`) to 1 line with full value in `title` attr.
- Bottom of panel gets `w-full [Done]` primary button (md: right-aligned inline) so mobile users have a terminal affordance.

### 7.5 Per-assignment parity note
The same 6 widgets (Educational Mode, Personality, Min Score, Style Examples, Rules, Effort) appear in AssignmentDetailView for the single assignment, top = "Inherit from {Subject}" segmented (default) / "Customize for this assignment" — data contract with B7; visual kit identical, placement left to B6.

---

## 8. Stitch prompt atoms (paste-ready)

"Regenerate the Home content column of Helpotron Study OS (Assist: Dashboard). Keep the existing AppShell frame. Dark-first, M3 `@theme inline` tokens from the project `index.css` (use class names: `bg-surface-container-lowest`, `bg-surface`, `bg-surface-bright`, `border-outline-variant/20`, `text-on-surface`, `text-on-surface-variant`, `text-primary`, `bg-primary/10`, `bg-primary`, `text-on-primary`, `bg-secondary/10`, `text-secondary`, `border-secondary/20`, `bg-error-container`, `text-error`, sem-8 semantic color pairs). Typography: headline-lg (Hanken 32/40 semibold), title-md (Inter 20/28 600), body-md (Inter 16/24), body-sm (Inter 14/20), label-caps (JetBrains Mono 12/16, letterSpacing .05em, uppercase). Radii: containers 3xl, cards/tiles 2xl, buttons/inputs xl, chips/badges lg, avatars full. Spacing: unit 4px, grid gutter 16px, container padding 24–32px. Page header 'Active Subjects' + subtitle; per-subject section card: 48px custom-colored icon tile, subject title, '{N} in progress · {M} pending approval' count, 'Subject Settings' gear button (inline disclosure with 6 config controls: Educational Mode on/off segmented, Agent Personality select, Human Score Minimum stepper+slider, Writing Style Examples list, Rules list, Effort 5-level scale), 'EXPORT ALL' label-caps secondary button, custom subject delete; two-column grid (In Progress col-span-2, Pending Approval col-span-1, red count badge, bordered pending cards with Review Now); status chip component set with 6px dot: pending_approval amber, not_started neutral, in_progress blue, paused slate, humanizing cyan, ready_for_review amber, completed green, submitted cyan, graded deep-green, tracked indigo; overdue due-chip in error red with AlertTriangle; empty subject state per Stitch ('Ready to analyze some texts?' + curved-icon circle + Import Assignment primary CTA); error banner + Retry; skeleton shimmer; history pointer card 'Submission Ledger & Archive'. All buttons min 44px, focus ring 2px primary."

---

## 9. Handoff notes (data/behavior untouched here)

- Assignment model fields needed by visuals: `id, name, subject, class_code, status, due_date, description` (already in payload); subject grouping by explicit `subject_id` (B7) replacing keyword heuristics.
- `turnedInIds` ghost filter, `helpotron:assignment-created` listener, visibility/focus refetch all preserved.
- Drop dead `LaunchToDocModal` from this component.
- `BUBBLE_SECTIONS` constants belong to the regeneration: section order In Progress → Pending (completed shown nowhere on dashboard except its chip on the rare completed-in-flight card; completed history is the ledger's job).
