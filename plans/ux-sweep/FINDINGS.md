# Helpotron UX sweep — consolidated findings (2026-09-22)

Owner's report, verbatim: *"the ux is helpotrons biggest weakness, its HORRIBLE, the errors
literally just flash random backend code on my screen, which is tragic"*, plus
*"the ui of the extension is still super crowded and clunky, fix and improve it"*.

Two independent read-only recon passes produced everything below. Every entry is a verified
`file:line` read from source, not a guess.

## The single root cause, stated once

There are **two separate sources of garbage on screen**, and they need different fixes:

1. **Real leaked backend payloads.** `api.js` stringifies FastAPI's `detail`, which is an
   ARRAY for validation errors, straight into the user's face.
2. **Invented fake jargon.** The frontend hardcodes machine-sounding nonsense
   (`ERR_ROUTER_NODE_UNRESOLVED`, `FATAL GATEWAY 504`, `NODE_CACHE_LOCAL`) that *looks*
   like backend code and is rendered deliberately. This is arguably worse than (1): it is a
   lie about what happened, written by us.

And a third, structural problem that makes every fix above worth less than it should be:

3. **The shared primitives already exist and are unused.** `components/Button.jsx` already has
   `loading`/`isLoading`/`loadingText` + `aria-busy`. `lib/overlay.js` already has
   `toast.error()` and `formatErrorMessage()`. `ui/Skeleton.jsx` exists. Adoption:
   **509 raw `<button>` vs 20 `<Button>`, only 7 passing `loading`**, and `Skeleton` is
   imported by nothing but its own barrel file.

So the plan is: fix the two lie sources, then route everything through the primitives that
are already there.

---

## SOURCE 1 — leaked backend payloads

| location | problem |
|---|---|
| `api.js:259` | `typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)` — stringifies FastAPI validation arrays. **This is the exact code the owner saw.** |
| `api.js:318` | `getErrorMessage()` does the same `JSON.stringify(err.detail)`. Zero call sites — dead code that would reintroduce the bug the moment someone uses it. |
| `api.js:417,538` | SSE `evt.detail` / `evt.message` thrown raw. |
| `api.js:572,664,684,775,837` | `.detail \|\| fallback` on upload/send paths. |
| `lib/overlay.js:44` | `formatErrorMessage()` — a THIRD normaliser that also JSON.stringifies. |

**Fix:** one shared `humanError(err)` in `api.js` that maps HTTP status → human sentence,
renders FastAPI validation arrays as field-level sentences, and NEVER emits raw JSON. Both
`api.js:259` and `overlay.js:44` delegate to it.

## SOURCE 2 — invented jargon

### Error-branch (renders when an error shows)
| file:line | literal |
|---|---|
| `ui/ErrorState.jsx:16` | `ERR_ROUTER_NODE_UNRESOLVED` |
| `ui/ErrorState.jsx:29` | `ERR_AUTH_LEASE_EXPIRED` |
| `ui/ErrorState.jsx:42-44` | `ERR_COMPILATION_FAULT`, headline `Kernel Exception Vector`, body about an "AST synthesis error" and an "intercepted panic" |
| `ui/ErrorState.jsx:55-57` | `ERR_INTERNAL_SERVER_FAULT`, `Internal System Anomaly` |
| `ui/ErrorState.jsx:68-70` | `ERR_SOCKET_DISCONNECT`, `Network Partition Detected` |
| `AssignmentCardDashboard.jsx:431` | `FATAL GATEWAY 504` |
| `AssignmentCardDashboard.jsx:435` | `ERR_TIMEOUT_UPSTREAM_NODE: {fetchError}` |
| `AssignmentCardDashboard.jsx:438,440` | `TELEMETRY SYNC INTERRUPTED`, `NEVER RENDERING PSEUDO-EMPTY SUBJECTS` |
| `AdminToolsView.jsx:255,262` | `Querying live subsystem telemetry…`, `No active telemetry signals…(0 mock nodes rendered)` |
| `ui/OfflineBanner.jsx:56-60` | `OFFLINE PERSISTENCE MODE`, `NODE_CACHE_LOCAL` |

### Always-on chrome (renders whenever the surface is visible)
| file:line | literal |
|---|---|
| `ui/DestructiveConfirmModal.jsx:51,54` | `CRITICAL GATEWAY`, `IMMUTABLE MUTATION` |
| `NotificationsView.jsx:90,92` | `PLATFORM SYSTEM`, `TELEMETRY FEED` |
| `AdminToolsView.jsx:246,250` | `Subsystem Engine Nodes`, `REAL TELEMETRY ONLY` |
| `MonitorsView.jsx:276` | `ANOMALY SIGNAL` |
| `AssignmentConfigPanel.jsx:162,194` | `Academic Citation Topology`, `SOURCE SPEC` |
| `AgentTimeline.jsx:171` | `NODE 0{n} • {role}` |
| `TermsOfServiceView.jsx:592` | `IMMUTABLE SPECIFICATION // SHA-256: 7F83B165…` — **a fabricated hash presented as a legal document's integrity commitment** |
| `CreateSubjectDialog.jsx:197` | `CATALOG REF` |
| `RecoveryFlowModal.jsx:416` | `DISPATCH RECIPIENT` |
| `SessionExpiryModal.jsx:154` | `INACTIVITY THRESHOLD REACHED (24H)` |
| `WorkingDraftCard.jsx:151,156` | `BELOW HUMAN THRESHOLD — RETRY`, `HUMAN-STYLE REVIEW` |
| `CreditsCostTab.jsx:66,70,86` | `LIVE METROLOGY`, `Cost Ledger & Spend Velocity`, `LIVE METER` |
| `SubjectSettingsPanel.jsx:394` | `HUMAN-STYLE SCORE` |
| `BillingView.jsx:337,577` | `INCLUDED RUNWAY`, `SMS OTP` |
| `AppShell.jsx:306,366` | `NEW STUDY SESSION`, `TASK_TOKENS` |
| `NewAssignmentModal.jsx:322,325` | `Extracting Coursework Topology...`, `Parsing rubric constraints, due date tokens, and theorem requirements.` |
| `PrivacyPolicyModal.jsx:175` | `[NAME_REDACTED]` — a doc marker rendered in user-facing prose |
| `QuickSettings.jsx:113` | label `CREDITS` renders `user.token_balance` — **the same number as the `TOKENS` block at :119**. Two names, one value. |

**Do not touch (internal only, never rendered):** `LaunchToDocModal.jsx:56,106,206` message-bus
names; `api.js:322` default code; `charts/y-axis-scales.js` ids; the `[A-Z]` regexes in
`AdminAdvancedDashboard.jsx:410`, `AuthModal.jsx:57`, `ExtensionInstallView.jsx:281`.

## DEAD / SILENT BUTTONS (async, zero feedback)

Every entry is also a double-submit risk unless marked otherwise.

**User-facing:** `QuickSettings.jsx:274` (logout) · `LibraryView.jsx:290,402,410`
(save/unsave/delete) · `ApiKeysPanel.jsx:223` (delete key) · `NotificationsView.jsx:100`
(mark all read) · `AssignmentDetailView.jsx:535` (mobile Launch-to-Doc — the desktop twin at
`:356` IS correctly disabled, so this is a copy that lost the guard) · `study/AcademicCalendar.jsx:335,345`
(remind/delete) · `study/FlashcardsPlayer.jsx:415-439` (rate card) · `RecoveryFlowModal.jsx:454`
(resend — `loading` state exists, unwired) · `AssignmentHistoryView.jsx:297,336`
(export/retry — `exportState`+`loading` exist, unwired) · `AssignmentCardDashboard.jsx:493`
(export) · `AssignmentDumpView.jsx:375,595` (retry/delete — `loading` exists, unwired) ·
`ControlCenterView.jsx:561` (impersonate) · `AgentConfigsSidebar.jsx:458,508,546,584,616`
(skill/memory/file mutations) · `ThreadsRail.jsx:141,214,278,291` (thread CRUD).

**Admin (`AdminAdvancedDashboard.jsx`):** `:750,780,799,809,818,827,835,885,908,944,965,1031,1039,1080,1113,1206,1207,1311,1390,1432`
— token grants/removals, bans, kicks, impersonation, moderation approve/reject, health
refresh. `AdminToolsView.jsx:477,596` (`commandBusy` exists, only the main submit is wired).

**Optimistic mutations** (UI updates immediately, so no guard; a fast double-click still
double-fires): `MyAgentView.jsx:328,353,367,387,1145,1158,1166,1179` · `LibraryView.jsx:96,108`.

**Correctly guarded, for reference — copy this pattern:** `DataLakeView.jsx:275` (`disabled={deletingId===id}`) ·
`TrashPanel.jsx:240,249` · `MonitorsView.jsx:309,319` · `ApprovalCard.jsx:148-181` ·
`PermissionModal.jsx:132` · `AssignmentTurnInView.jsx:204,283` · `AdminCostView.jsx:454` ·
`QuickSettings` submit paths.

## ABSENT / FAKE LOADING STATES

**Bare `return null` → blank area, no reserved layout:** `TrialActivationCard.jsx:57` (whole
card vanishes while trial status loads) · `SubjectSettingsPanel.jsx:97` · `ScopedSetting.jsx:56` ·
`ui/os.jsx:189`.

**Bare "Loading…" text, no skeleton:** `DataLakeView.jsx:244` ·
`IntelligenceView.jsx:88-92` (`Loading telemetry snapshot…`) · `study/AcademicCalendar.jsx:406`
(10px text) · `AnonymousLanding.jsx:722,758,794,830` (`animate-pulse` only) ·
`ExtensionInstallView.jsx:52` · `charts/chart-loading-label.jsx:12` · `charts/area-chart-loading.jsx:32`.

**Doing it right:** `AssignmentCardDashboard.jsx:364-405` (full first-load skeleton) ·
`App.jsx:150-158` (`SessionBootScreen`) · `CreditsView.jsx:84` · `ApiKeysPanel.jsx:186-188`.

## PRIMITIVES TO ROUTE THROUGH (already exist, adopt)

| primitive | path | API |
|---|---|---|
| Button | `components/Button.jsx` | `variant`, `size`, `loading`, `isLoading`, `loadingText`, `disabled`, `glow`, `ariaLabel` — busy sets `disabled` + `aria-busy` + spinner |
| Skeleton | `ui/Skeleton.jsx` | `className`, `style` — renders `.skeleton-shimmer` |
| Toast | `lib/overlay.js` + `ui/ToastContainer.jsx` | `toast.info/success/error(title, message, duration)` → CustomEvent. **Only dispatcher today is `SettingsApp.jsx:278`, and it passes a STRING where the container expects an object → blank toast.** |
| ErrorState | `ui/ErrorState.jsx` | `type`, `title`, `message`, `onPrimaryAction`, `onSecondaryAction` — currently full of fake jargon |
| Spinner | **none** | `Loader2 animate-spin` inlined in 27 files — worth a real primitive |

## EXTENSION UI (crowded / clunky — owner's second ask)

Not yet reconnoitred. The extension is `extension/` in the same repo —
`popup.html`/`popup.js`, `agent_mode.html`/`agent_mode.js`, `content.js`. Owner's words:
*"still super crowded and clunky"*. Needs its own pass: tabs that can be collapsed,
controls that are not all visible at once, and a clear primary action per surface.

## ORDER OF WORK

1. `humanError()` in `api.js`; `api.js:259` and `overlay.js:44` delegate to it. (kills the leak)
2. Strip the invented jargon — every entry in SOURCE 2. (kills the lie)
3. Fix the Toast contract (object vs string) so toasts actually render.
4. Wire `loading` into the silent buttons; add a `disabled` guard to the double-submit set.
5. Replace bare-`return null` and bare-"Loading…" with `Skeleton`.
6. Extension UI pass.
7. Verify in a real browser: no raw payload, no fake code, every async action shows state.
