# AGY — Finish the Helpotron Stitch Web Redesign (commit + push to design/stitch-redesign)

You are completing a design-system migration that is ~30% done. The app is **Helpotron**
(AI academic-assistance app) at `/home/roni/Roni_workspace/helpotron`. A Google Stitch
design package ("Study OS" / "Cognitive Calm" / M3 teal scheme) must be ported across the
entire web app, verified, committed, and pushed.

## Read these FIRST (in this order)

1. `/home/roni/Roni_workspace/helpotron/stitch-design/AGY_WEB_REDESIGN_FINISH_PROMPT.md` (this file)
2. `/home/roni/Roni_workspace/helpotron/extension/design.css` — **THE canonical reference port.**
   The same design system was already ported for the browser extension; it holds the FINAL
   token values, radius scale, typography contract, and component classes. Use its values as
   ground truth everywhere (bg `#0e1113`, surface `#1a1c1e`, primary `#59d8c9`, on-primary
   `#003732`, primary-container `#005049`, on-primary-container `#76f5e5`, secondary `#bfc2ff`,
   error `#ffb4ab`, etc. + light sheet `#f8f9ff`/`#00685f`/`#4648d4`).
3. `/tmp/stitch_final/stitch_helpotron_study_os_redesign/dark_tokens_v2.json` — official 46-role dark sheet.
4. `/tmp/stitch_v2/stitch_helpotron_study_os_redesign/helpotron_study_os/DESIGN.md` — official light sheet + typography + shape + elevation rules.
5. The Stitch screen renders — each folder in `/tmp/stitch_final/stitch_helpotron_study_os_redesign/` has a `code.html` (the design's markup, with the exact classNames to mimic) and a `screen.png` (the target look). Study the ones for your ported surfaces.
6. `/home/roni/Roni_workspace/helpotron/web/src/index.css` lines ~1391–1608 — the existing token layer: `--st-*` vars on `:root` (dark) and `[data-theme="light"]`, plus a Tailwind-4 `@theme inline` block that maps `--color-*` → the design role names so classNames like `bg-surface-container-low`, `text-on-surface-variant`, `border-outline-variant/20`, `font-label-caps` compile verbatim.

## Current state (verified)

- Branch: `design/stitch-redesign` at `4db0273`. **NEVER push to master — only to this branch.**
- Already committed: extension redesign + server announcement infra. **DO NOT touch `server/` or `extension/` — web only.**
- In-flight (uncommitted in `web/`): token layer (`index.css`), fonts (`main.jsx` + `@fontsource-variable/*` in `package.json` — already installed, do NOT re-install), partial ports of `web/src/components/AppShell.jsx` (topbar + credits chip converted; sidebar NOT finished) and `web/src/components/AssignmentCardDashboard.jsx` (partial).
- App runtime: Tailwind v4 (`tailwindcss ^4.0.0`), React + Vite. Theme switching: `data-theme` attribute + `applyAppearance/applyAccessibility/applyFontScale` in `web/src/components/SettingsApp.jsx`. Font-scale slider = root font-size; design values must stay REM where needed.

## TASK 1 — Land the official token sheets (`web/src/index.css`)

Replace ONLY the values inside the `--st-*` blocks (lines ~1405–1501). Keep structure and
comment style. Dark values: `dark_tokens_v2.json` verbatim (bg `#0e1113`, surface `#1a1c1e`,
primary `#59d8c9`, on-primary `#003732`, primary-container `#005049`,
on-primary-container `#76f5e5`, secondary `#bfc2ff`, on-secondary `#1518a6`,
secondary-container `#2d2fbc`, on-secondary-container `#e0e0ff`, tertiary `#ffb2be`
+ all surface-container/low/highest + error/inverse/outline rows from the JSON).
Light values: DESIGN.md verbatim (surface `#f8f9ff`, primary `#00685f`, primary-container
`#008378`, secondary `#4648d4`, secondary-container `#6063ee`, tertiary `#924628`, error
`#ba1a1a`, filled rows). They must match `extension/design.css` sheets role-for-role.
Do NOT touch the `@theme inline` mapping, the chart tokens, the old theme blocks at the top
(lines ~213–548 and ~890–1390) or legacy CSS vars — legacy views keep rendering through the
old variable names (see TASK 4).

## TASK 2 — Finish AppShell + Dashboard (the two in-flight files)

- `web/src/components/AppShell.jsx`: finish the sidebar per the design's dashboard render
  (`/tmp/stitch_final/.../helpotron_dashboard_dark_default_1/code.html` + `_2` + light `_1`):
  fixed full-height sidebar (collapsible to rail), nav groups with `font-label-caps` group
  labels, active item = `bg-primary-container/40`-style highlight + `text-on-primary-container`,
  items with icons (lucide, `w-4.5`/18px) + `font-body-sm`, topbar already converted.
  Keep ALL props/behavior/handlers (mobile drawer, quick menu, notifications, back/forward,
  collapsed state) — this is a reskin, never a functionality change.
- `web/src/components/AssignmentCardDashboard.jsx`: match the dashboard screen — subject
  bubble grid (cards `bg-surface-container-low rounded-xl border border-outline-variant p-md`,
  hover `hover:border-outline-variant/40`, accent dot per subject), assignment cards with
  status chips (semantic: IN PROGRESS blue dot / COMPLETED green / PENDING amber / FAIL error),
  `font-tabular-stat` stats, `font-label-caps` microcopy, mono uppercase chips. Two-level
  navigation (bubble grid → bubble workspace) MUST keep working.
- Reference the modern `_v3` dirs where present (dashboard_dark_default, assignment_detail_v3).

## TASK 3 — Port the remaining screens

For each view below: convert containers/surfaces/text/chips/buttons to the design classes
(see `design.css` + the Stitch code.html as reference), keep every id/data-testid/handler,
keep all logic, keep responsive behavior. Radii per design (12px `rounded-xl`, 16px `rounded-2xl`
cards, `rounded-full` chips/buttons). Cards: `bg-surface-container-low` + `border border-outline-variant`
+ `rounded-xl`; page bg `bg-background` (via AppShell main). Primary buttons: `bg-primary
text-on-primary rounded-lg min-h-11 px-4` style with hover `bg-primary-fixed-dim`; secondary:
`border-outline-variant text-on-surface bg-surface-container-lowest`; ghost icons hover
`bg-surface-container-high`.

| Stitch screen (folder in /tmp/stitch_final/...) | App file to port |
|---|---|
| helpotron_dashboard_dark_default_1/_2 | AppShell.jsx + AssignmentCardDashboard.jsx (TASK 2) |
| helpotron_assignment_detail_v3_1/_2 | AssignmentDetailView.jsx (+ AssignmentDumpView.jsx) |
| helpotron_history_v3_1/_2 | AssignmentHistoryView.jsx |
| helpotron_import_assignment_1/_2 | NewAssignmentModal.jsx (and the import flow in AutomationCenter.jsx if present) |
| helpotron_insights_v3_1/_2 | InsightsView.jsx |
| helpotron_monitors_feedback_v3_1/_2 | MonitorsView.jsx |
| helpotron_my_agent_v3_1/_2 | MyAgentView.jsx (+ IntelligenceView.jsx if it shares surfaces) |
| helpotron_payments_v3_1/_2 | Payment-related: BillingView.jsx / CreditsView.jsx / CreditsPricingDashboard.jsx |
| helpotron_settings_complete_1/_2 | SettingsApp.jsx + SettingsSections.jsx |
| helpotron_study_tools_v3_1/_2 | LibraryView.jsx (study tools/library surfaces) |
| helpotron_scraped_assignments_1/_2 | DataLakeView.jsx + AssignmentDumpView.jsx |
| helpotron_2fa_security_1/_2 | TwoFactorSetup.jsx + RecoveryFlowModal.jsx |
| helpotron_error_states_1/_2 | Any visible error/empty states in the ported views (error + empty card styling) |
| helpotron_landing_page_1/_2/_3 + helpotron_sign_in | Landing + sign-in: check if React (`web/src/components/AnonymousLanding.jsx`, `AuthModal.jsx`) or Jinja in `server/` → port the Stitch look; if server templates exist, port those too (server edits allowed here ONLY if the file is a template/static asset — no logic changes) |
| helpotron_control_center_1/_2 | AdminAdvancedDashboard.jsx (admin-only: container/surface conversion only, no logic) |

Admin/utility views NOT in the design package (AdminPanels, AnalyticsDashboard, AdminAgentChat,
CommandPalette, GuideView, MessageAdminView, NotificationsView, PrivacyPolicy/Terms views,
QueueNoticeBanner, ReferralSection, DataLake internals): do NOT hand-port. Instead apply
TASK 4's aliasing so they inherit the palette cleanly.

## TASK 4 — Legacy aliases so unported views stay coherent

In `web/src/index.css` keep a small alias block mapping the old var names to the new tokens
(e.g. `--bg-surface: var(--st-surface)`, `--text-primary: var(--st-on-surface)`,
`--border-subtle: color-mix(in srgb, var(--st-outline-variant) 60%, transparent)`,
`--accent: var(--st-primary)`, `--accent-2: var(--st-secondary)`, `--accent-subtle:
color-mix(in srgb, var(--st-primary) 14%, transparent)`, etc.) so legacy `.clean-card`,
`.glass-panel`, `.clean-input` and arbitrary `bg-[var(--bg-surface)]` classes inherit the new
palette. Verify nothing visually breaks: legacy views must look coherent, not broken.

## TASK 5 — Verify (mandatory, in this order)

1. `cd /home/roni/Roni_workspace/helpotron/web && npm run build` — must pass with zero errors.
2. `npm run dev` (Vite on 5173) — the live API is already at 127.0.0.1:8000 (DO NOT restart it;
   systemd/uvicorn reload handles itself; if you see "Task is in Queue" that's the RAM budget cap — not a bug).
3. Screenshot every ported view with headless chrome:
   `google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot=/tmp/redesign_<view>.png --virtual-time-budget=5000 http://127.0.0.1:5173/<route>`
   Routes: check `web/src/App.jsx` for the mapping (demo mode: `DemoModeToggle.jsx` lets you
   screenshot without real creds — use it if sign-in blocks you).
4. Functional smoke test (do not rely on visuals alone): sign-in (demo or dev account) →
   dashboard loads → open an assignment → history view → settings toggle (theme + font scale) →
   no console errors at any step (check the browser console in devtools via headless `--dump-dom` or a quick puppeteer-less check; at minimum no React error boundaries in the page).
5. Confirm `extension/` and `server/` working tree is CLEAN (you must not modify them).

## Constraints (non-negotiable)

- FULL implementation only. No placeholders, no TODO markers, no stubbed views.
- Never change behavior/ids/handlers; visual port only. Preserve `data-*` attrs and aria.
- No new dependencies. Fonts, lucide, tailwind v4 already present.
- WCAG AA: text contrast ≥ 4.5:1 on its surface (use `text-on-surface-variant` for secondary).
- `prefers-reduced-motion`: no new infinite animations; keep existing guards.
- Commit ONLY on `design/stitch-redesign` (never master). Commit messages in the repo style
  (`feat(ui): …` / `design(stitch): …`), end with the Co-Authored-By line:
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- Push the branch to origin (`origin design/stitch-redesign`) when the build + tests pass.
- After pushing, report: files changed, screens ported (with screenshots kept in /tmp for
  review), build status, any deviations, and anything you deliberately left for a later pass.

## Definition of done

Build passes, all listed screens render per the Stitch renders (compare side by side against
the screen.png files), legacy views coherent, no console errors on the smoke path, commit +
push landed on `design/stitch-redesign`, and your final report lists the commit sha(s).
