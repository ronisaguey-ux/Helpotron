# B4 — Teardown + Regeneration Spec: NewAssignmentModal + AssignmentDetailView

Grounding: real code at `/home/roni/Roni_workspace/helpotron/web/src/components/NewAssignmentModal.jsx`, `AssignmentDetailView.jsx`, `LaunchToDocModal.jsx`, `lib/assignmentBuckets.js`, `MyAgentView.jsx` (shared ThinkingBubble), `api.js`; token system in `web/src/index.css` `@theme inline` (roles `st-*`); Stitch sources: `helpotron_import_assignment_1/2`, `helpotron_scraped_assignments_1/2`, `helpotron_assignment_detail_v3_1/2` under the stitch export root. Icons: lucide-react only. No AI images. Stitch parity rule from `redesign_rationale.md`: radius 3xl containers / 2xl cards / xl buttons, 44px touch targets, 2px primary focus ring, dark-first with light fallbacks, zero hex literals.

---

# 1. NewAssignmentModal.jsx

## 1.1 Anatomy (as built)

Mount pattern: `if (!isOpen) return null` **before any hooks**; hooks (10 useState + 2 useEffect) run only when open. Callers: AppShell 879 (`{newSessionOpen && <NewAssignmentModal/>}`), HistoryView 516 (also `&&`-gated), AssignmentCardDashboard 681 (**unconditional render** with `isOpen={showImportModal}`).

Chrome stack (outer→inner):

| Layer | Classes | Notes |
|---|---|---|
| Backdrop | `fixed inset-0 z-[100] flex p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto aurora-modal-backdrop`, `role="dialog" aria-modal` | click-close on self only; 180ms fade-in keyframe embedded in a `<style>` block |
| Panel | `m-auto w-full max-w-xl bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl aurora-modal-panel` | 220ms rise+fade |
| Header row | icon tile `w-9 h-9 rounded-2xl bg-primary/15 text-primary` + `<FileText 4>`; h3 `font-headline-lg text-title-md`; X button `disabled:opacity-40` | Escape closes only when `phase ∈ {idle, saving_rubric}` and `importPhase==='idle'`; closeAllowed = not creating/importing |
| Tablist | conditional on `import_from_url_enabled` from `GET /api/public-config` (fetched on open; silently defaults OFF on any error, no loading skeleton — tabs pop in = layout shift; demo mode falls through to real network so tabs never show in demo) | 2 pill tabs: "Create manually" / "Import from link"; selected = `bg-primary text-on-primary shadow-sm`, else `text-on-surface-variant` |
| Manual form | Title `*` text (maxLength 500, placeholder "e.g. Essay: Symbolism in Beloved"), Due date `type=date` (optional), Prompt textarea rows 5 (maxLength not set), Rubric textarea rows 4 (maxLength 500000), error block, footer: Cancel + Create Assignment | shared `inputCls` = `w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs … focus:ring-2 focus:ring-primary`; `labelCls` = `font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1.5` |
| Link form | URL `type=url` maxLength 2048 (min 8 to submit) + helper copy ("Helpo reads it…"), "What is it?" textarea rows 3 maxLength 5000 + helper copy ("Scraping can take up to a minute"), error block, footer Cancel + Import Assignment (`<Link2>`) | |
| Importing state | replaces the whole form: 64px ring spinner (border-4 surface-container-high track + primary arc) with Link2 at center, pulsing dot + "Reading portal page structure…", sub-copy "Extracting assignment instructions, due dates, and grading rubrics.", 3 pulsing skeleton bars at `opacity-40` | user cannot cancel (closeAllowed false); no step text rotation |
| Footer footnote | `Assignments you create appear in the workspace and cards; they land in this ledger after being marked completed.` | always rendered |

## 1.2 Variants

- With import flag ON: tab bar + two modes. Flag OFF: manual form only.
- Demo mode: same chrome; `assignmentRequest` short-circuits through `mock.js` when a demo handler exists, else real network.
- Three call sites differentiate only `onCreated` behavior (dashboard refetches; history shows a `CreateNotice` toast with `#id` + subject; AppShell navigates to overview + dispatches `helpotron:assignment-created` window event). All three dispatch the same CustomEvent internally — double-path completion signal.

## 1.3 States (exhaustive)

phase: `idle | creating | saving_rubric`; importPhase: `idle | importing`.

1. **idle/manual** — form enabled, Create disabled unless `title.trim().length>0`.
2. **creating** — Create button label "Creating…" + spinning Loader2; X/Cancel/backdrop/Escape disabled (closeAllowed false); inputs remain editable (mutation mid-flight is possible — stale body already sent).
3. **saving_rubric (post-create, error)** — assignment created, rubric PATCH failed: success-priority completion is BLOCKED on the rubric save; inline error block gets a "Retry rubric save" button (`retryRubric`, bg-error/20). If retry succeeds → onCreated with `rubric_saved:true`. This is the only recoverable error path. Quirk: the Retry button shows whenever `phase==='saving_rubric' && createdId!=null`, and after a failed retry the error text changes to "Still could not save the rubric: …".
4. **idle/success** — no success UI inside the modal at all; caller unmounts it (`onCreated`). HistoryView renders its own toast; dashboard silently refetches.
5. **importing** — full-screen-in-modal loader; no progress %, no cancel.
6. **import errors** (all render into `bg-error/15 border-error/30 font-mono` alert):
   - Network down: `AssignmentApiError status 0` → "Could not reach the server (msg)".
   - Gateway HTML page: "The server gateway returned 503 (temporarily unavailable)…".
   - 429: "Rate limited (429). Retry after Ns." parsed from `Retry-After` header; `AssignmentApiError` carries `status`/`retryAfter` (reason the file mirrors api.js instead of using it).
   - `insufficient_tokens` (HTTP **200**, body `{status:'insufficient_tokens'}`): shown as an error-styled alert — a soft token gate dressed as a hard error, no "get tokens" affordance.
   - Created-but-no-id: "Server accepted the assignment but returned no id. Reload the list to check."
   - Import finished-but-no-id: "The scrape finished but no assignment id came back. Try again."
   - Rubric-save failure (manual): "Assignment #N was created, but saving its rubric failed: …".

## 1.4 Buttons inventory

Close X (disabled while busy) · 2 tabs · Cancel (disabled while busy) · Create Assignment (disabled: empty title or busy; spinner swap) · Retry rubric save (conditional) · Import Assignment (disabled: url<8 or importing) · backdrop click · Escape. No focus trap, no focus restore; on open only `titleRef.current?.focus()` inside a `useEffect` keyed on `[phase, importPhase]` — **every phase change re-focuses the title input** (e.g., arriving at the rubric-retry error yanks focus off the retry button). `aria-labelledby` present; `role="tablist"/tab` present but no `aria-controls`/roving tabindex.

## 1.5 Concrete problems (grounded)

- **P1 Rules-of-Hooks violation.** Early `return null` before hooks + unconditional render from AssignmentCardDashboard (line 681) means the first open from the dashboard flips the same instance from 0 hooks to 14 → React "Rendered more hooks than during the previous render" crash. AppShell/HistoryView dodge it by unmounting (`&&`), which also resets all state — the modal keeps two different lifecycles across its three callers.
- **P2 Import flow is fire-and-forget.** Stitch deigns a 4-screen flow (URL → loading → **Review & Confirm** with editable title / subject select + "Auto-routed" chip / due date / collapsible "Extracted Instructions" → Success panel with "View Assignment"). Reality: one POST creates the assignment server-side and closes; the user can't confirm or fix the scraped title/subject/due; `res.title`/`res.subject` are only echoed into a history toast. The scraped details the modal *does* receive (`title`, `subject`) are never shown.
- **P3 Token-gate message styled as error** (insufficient_tokens, 200 OK) — reads as a failure, no upgrade path.
- **P4 No focused states a11y** — no `modal-overlay` focus transfer/restore, no Tab containment (LaunchToDocModal has the full trap+restore; this modal does not); phase re-focus bug above.
- **P5 Layout shift + demo-mode flag dead** — `importEnabled` fetched after first paint; flag never on in demo mode; every open re-fetches.
- **P6 Footer note contradicts import mode** ("ledger after being marked completed" is coarse truth, but it's pasted below the *import* form too).
- **P7 Styling drift from Stitch tokens**: this modal is already role-tokenized (fine), but its card buttons use `rounded-xl` (make xl per rationale: 3xl panel is ok), footer buttons `px-4 py-2.5` ≈ 40px tall (<44px touch target); direction pills fine. `max-w-xl` panel with 4 stacked fields pushes the create button below the fold at 375px (backdrop `overflow-y-auto` requires scroll; no sticky footer).
- **P8 Import helper copy is unmeasured** — "is this legal/authorized to scrape" disclaimer absent (we are told Stitch's rationale prioritizes copy correctness; keep the honest "reads the page" wording, don't promise AI-generated images).

## 1.6 REGENERATION SPEC (Google Stitch) — New Assignment modal

**Layout** (desktop): centered modal `max-w-2xl rounded-3xl bg-surface-container-lowest border border-outline-variant/50 shadow-[0_4px_30px_rgba(0,0,0,0.4)]` (glass-panel variant for dark: `background rgba(11,28,48,0.7)` + `border white/5`), backdrop `rgba(11,28,48,0.6)` + blur-4. Header bar `px-6 py-5 border-b border-outline-variant/30` with icon chip (`rounded-2xl bg-secondary-container/15 text-secondary`, lucide `FilePlus2`) + `font-title-md text-title-md` title + X close. Sticky footer `px-6 py-4 border-t` holding `h-[44px]` buttons.

**Tabs**: keep the pill segmented control (`p-1 rounded-2xl bg-surface-container-low border`), but gate it behind a **skeleton pill row** while `import_from_url_enabled` loads (fix P5) and support demo mode via the same `mock.js` fallthrough path (or hardcode the flag ON in demo).

**Step 1 — URL entry** (screen 1 of `helpotron_import_assignment_1`): labelled URL field with leading lucide `Link2` icon inside the input (`pl-10`), `h-12`, `border-outline-variant focus:ring-2 focus:ring-primary`; "Additional context (optional)" textarea rows 3; helper text (`font-body-sm text-body-sm text-on-surface-variant`); footer right-aligned primary button `h-[44px] rounded-xl bg-primary hover:bg-primary-container font-title-md` label "Scrape & Import" with `Zap` icon.

**Step 2 — Importing** (adopt the Stitch 4-step progression, replace static spinner): centered 24 (w-24 h-24) double ring spinner with `Sparkles`/`Brain` at center; **sequential status checklist** — "Reading page structure…" → "Extracting instructions & dates…" → "Routing to subject…" with each line flipping to a `CheckCircle2 text-primary` item; skeleton-text bars at `opacity-30`; `aria-live="polite"` on the checklist. Cancel allowed (real cancel via `AbortSignal` if API supports; otherwise disable — do not fake it).

**Step 3 — Review & Confirm** (NEW; the biggest gap vs Stitch; requires the API to surface scraped fields before commit — if the server-landing-first contract stays, instead show a 2-seconds-simple success edit screen gated on `PATCH /api/assignments/{id}`): editable Title (`font-title-md` style border-b field), Subject **select** with "Auto-routed" secondary chip (`bg-secondary-container/10 text-secondary`, `Wand2` icon) when `res.subject` came from routing; Due date field; collapsible "Extracted Instructions" expander (`ChevronDown` rotate, mono body); footer: Cancel (ghost) → Create Assignment (primary).

**Step 4 — Success**: green-tile panel (`bg-primary-container/10 border-primary-container/30 rounded-xl p-6` centered, `CheckCircle2 w-12 h-12 text-primary`) — "Assignment Created", caption "Added to **{subject}**" (from real `res.subject`, fallback "workspace"), primary `View Assignment` link-button → navigates to the detail view of `assignment_id` (needs a callback; today `onCreated` only returns id — callers refetch).

**Errors**: keep the `bg-error/15 border-error/30 font-mono` alert pattern inside the card, but: insufficient_tokens gets a **distinct amber/tertiary tile** (`bg-tertiary-container/10`?) with its own icon (`Coins` from zaps? use lucide `Coins`/`CreditCard`) + "Add tokens" link → payments route; 429 keeps the Retry-After seconds text; always include the assignment-id-recovery copy for the no-id paths.

**Every action button** (final list): Close X · Cancel ghost (`text-on-surface-variant, hover:text-on-surface, h-[44px]`) · Scrape & Import (primary) · Retry scrape (on failure) · Create Assignment (primary, spinner while busy) · Retry rubric save (error-ghost in alert) · View Assignment (primary-link) · Add tokens (only in insufficient_tokens) · per-field field icons. All ≥44px, uppercase `font-label-caps text-label-caps`, focus ring 2px primary.

**Manual tab spec** (unchanged field set, Stitch-ified): same 4 fields; add `aria-describedby` helpers, `maxLength` stays; footer right-aligned; title-focused on open; **full focus management** (trap + restore, mirror LaunchToDocModal's proven implementation).

**MOBILE**: keep the modal but convert to **full-screen bottom sheet**: backdrop becomes plain dim, panel `fixed inset-x-0 bottom-0 rounded-t-3xl max-h-[92dvh]` with drag handle bar (`w-10 h-1 rounded-full bg-outline-variant`), header sticky, body scrollable `pb-28`, **sticky bottom footer** inside the sheet with Cancel + primary split 50/50 (`min-h-[48px]`), `pb-[env(safe-area-inset-bottom)]`; tabs become full-width 2-chooser; date input uses native picker; the 4-step progression fits vertically with reduced skeleton padding; sheet dismiss on backdrop tap only when not busy (keep `closeAllowed` semantics).

**Note for future config affordance (B7)**: per-assignment config lands visually as a **"⚙ Settings" ghost icon button in the modal footer-adjacent header row** (right of Close, secondary action) OR, cleaner, inside Review & Confirm as a collapsed "Advanced options" row — placeholder now: a disabled-until-model-exists `Settings2` icon button `min-w-[44px] min-h-[44px] rounded-2xl border hover:bg-surface-container-low`, labeled in copy only if the model ships.

---

# 2. AssignmentDetailView.jsx (`AssignmentWorkspace` / exported as `AssignmentDetailView`)

## 2.1 Anatomy (top→bottom on a `max-w-7xl mx-auto p-4 sm:p-6 space-y-6 h-full flex flex-col` root)

1. **Header** (`flex flex-col md:flex-row border-b border-outline-variant/50 pb-6`):
   - Chips row: status pill (`font-label-caps bg-secondary-container/15 text-secondary px-3 py-1 rounded-full border border-secondary-container/30` + 2px pulsing `bg-secondary` dot) showing `full?.status || assignment.status || 'Not started'`; "Assignment ID: #N" plain variant text; course chip `uppercase px-3 py-1 rounded-full bg-surface-container-high border`; "← Back to dashboard" underline link (only if onBack).
   - `h2 font-display-xl text-headline-lg-mobile md:text-display-xl` title; `font-body-md text-body-md text-on-surface-variant` prompt line (falls back to "Study workspace and subagent dispatch for {title}."); meta line `Due: … • Instructor: …` (`font-tabular-stat`-ish, plain variant text; teacher falls back '—').
   - Action row (right, `justify-end`): **Export** outline (`Download`, spinning `RefreshCw` while exporting; title="Export JSON"), **Launch to Doc** outline (`Sparkles text-secondary`), **Mark as done** primary (`CheckCircle2`; disabled `markingDone||markedDone`; label flips "Completed" after).
2. **3-stage progress ribbon** (`rounded-3xl p-5 card`): inner `grid lg:grid-cols-12`, stages in `lg:col-span-9` as `md:grid-cols-3`; each stage = 32px circle (`w-8 h-8 rounded-full`) + label + mono status line.
   - Stage 1 "Step 1: Reading & Rubric", mono `text-primary`: Halted/Completed/Ready/Awaiting Input.
   - Stage 2 "Synthesis & Proofs": complete→primary check; active→`bg-secondary/20 text-secondary border` + spinning RefreshCw; else plain; status Halted/Completed/In Progress.../Queued/Waiting.
   - Stage 3 "Lexical Humanizing": complete→`bg-emerald-500/20 text-emerald-400 border-emerald-500/30`; status `text-emerald-400 font-medium` = Halted/Interrupted/`realScoreLabel` ("Passed: N% Human Score" or "Passed (no AI-detection score recorded)")/Humanizing queued/Waiting.
   - Right slot `lg:col-span-3`: **Stop Execution** handle — 3 visual states: interrupted (`bg-error/20 text-error border-error/30`, label "Halted", disabled), finished (`bg-surface-container-high text-on-surface-variant/40`, "Finished", disabled), armed (`bg-error/10 hover:bg-error hover:text-white text-error border-error/30`, "Stop Execution").
   - Derived: `isExecutionFinished` = bucket∈{completed,archived} || markedDone || archiveDone; `isInterrupted` = interrupted || full?.interrupted || assignment?.interrupted.
3. **Direction picker card** (only when `bucket==='pending' && !directionChosen && !archiveDone`): `Compass text-secondary` heading "Pick what you want for this assignment" (`font-title-md`), `font-body-sm` intro "…it starts working the moment you pick."; grid `grid-cols-2 sm:grid-cols-3 gap-2.5` of 6 direction buttons (`rounded-2xl border border-outline-variant/30 bg-surface-container-low hover:border-primary hover:bg-surface-container-high px-4 py-3 font-label-caps uppercase`; `custom` toggles an inline textarea + "Send to the team" primary button + note "If what you describe isn't something the app can do yet, it's automatically sent to the Data Lake and we'll build it."); then: choosing spinner line (`RefreshCw` + "Dispatching to the team…"), `directionError` (`font-label-caps text-error` with ⚠️), `dispatchNote` box (`bg-primary/10 border-primary/30 text-primary font-mono`; truthful copy only — `datalake_requested` → "Request sent to Data Lake — we'll build this." else server note).
4. **Subagent Team card** (`Users` icon, `rounded-3xl p-6`): empty-state branches (in priority order):
   - `loading` → "Loading sub-agent activity…" (`EyeOff`).
   - bucket pending + no direction → `Compass` "Choose a direction to start your subagent team" + [Pick a direction →] primary button scrolling to picker + dump line.
   - `dispatchNote` present → `Sparkles` note text + (if pending+chosen) "The team starts on {label} — progress appears here the moment it's really recorded." + dump line.
   - pending + direction chosen → same "starts on" copy.
   - completed → `CheckCircle2` "Work on this assignment is complete — mark it done, then move it to history." + [Mark as done]; if `markedDone && !archiveDone && !archiveConfirmDismissed` → "Done — move it to Assignment History?" + [Move to history] + [Not now] (underlined, dismisses for the session); if `archiveDone` → archived line + [View in Assignment History].
   - in_progress → spinning RefreshCw "The team is working on this assignment — progress appears here as it is recorded."
   - archived → `Archive` "This assignment is archived — it lives in your Assignment History." + [Open Assignment History].
   - fallback → `EyeOff` "No sub-agent activity recorded for this assignment yet" + dump provenance line ("Dump #id · type · status: auto_routed (auto-routed — no action requested yet)") + next-steps copy ("finalize your dump — flashcards / study guide / summary / do-it — or ask your agent…" or `requested_action` echo).
   - Non-empty: `dispatchNote` box + `grid grid-cols-1 md:grid-cols-4 gap-3` agent cards: name (font-semibold), status chip (COMPLETE=`bg-primary/15 text-primary`, WORKING=`bg-secondary/15 text-secondary`, FAILED=`bg-error/15 text-error`, else gray), `h-1.5` progress bar on `bg-surface-container-highest`, `{progress}% complete` tabular mono. Map from `SUBAGENT_STATUS_LABEL` (completed→COMPLETE, running/in_progress→WORKING, pending→WAITING, failed→FAILED, else uppercased raw).
   - **Chat** (divider `border-t border-outline-variant/20`, `ref={teamChatRef}`): history list `max-h-48 overflow-y-auto` — user bubbles right `bg-primary text-on-primary`, agent bubbles left `bg-surface-container-low border-outline-variant/30 text-on-surface`, `max-w-[85%] rounded-2xl px-4 py-2.5`, whitespace-pre-wrap; empty state "This bubble is fresh — ask the agent team to start, or finalize your dump."; composer `rounded-xl border-outline-variant/30 bg-surface-container-low focus-within:border-primary` text input + Send icon button (`bg-primary`); below: busy line ("Agent team is working…" spinner, `font-label-caps text-primary`) or error line ("⚠️ Message not sent — …" `text-error`).
5. **Details grid 1** (`grid lg:grid-cols-2`): Prompt card (`BookOpen` icon, mono-ish body copy, min-h-[80px], empty → "No prompt recorded for this assignment yet."); Rubric card (`Circle` icon; `full.rubric`, empty → "No rubric attached yet.").
6. **Details grid 2**: Attached Files (`Paperclip`; rows `p-3 rounded-xl border bg-surface-container-low` listing `String` file names — no open action); Saved Materials (`Brain`; `Clock` icon, `m.kind`, `created_at` date right-aligned tabular).
7. **Foot note**: `Sparkles` + "Sub-agent, rubric, dump and chat data is loaded live from the server — it reflects only activity that was really recorded." (anti-hallucination honesty, keep).
8. `<LaunchToDocModal isOpen={showLaunchToDocModal} assignment={{…full, …assignment}} onClose>` (modal itself is the legacy violet "Assistive Typing Engine" surface — visual-dark different from the aurora surfaces; B5/B6 territory but used here).

Data sources (3 parallel fetches on mount + manual refresh): `api.assignmentFullView(id)` (`/api/assignment/{id}/full-view`), `api.agentChatHistory(id)`, `api.getAssignmentDirection(id)` (GET `…/direction`; 404 → null). Every mutation (`chooseDirection`, `markDone`, `archive`, `interrupt`, `sendMessage`) re-fetches direction + full view; errors land in `directionError`.

## 2.2 States (exhaustive)

| Axis | States |
|---|---|
| Bucket (server `directionInfo.bucket` wins, else `getAssignmentBucket(status)` client map: pending/in_progress/completed/archived/unknown→pending) | pending (no dir → picker card + team empty CTA; dir chosen → "starts on" copy), in_progress (team working, step2 active), completed (mark-done flow), archived |
| Loading | `loading` (full view; NO skeleton — cards render from the `assignment` prop immediately; only the team card switches its empty-state to "Loading sub-agent activity…" when `subagents.length===0`), `directionLoading` (gates picker visibility), `choosing`, `interrupting`, `markingDone`, `archiving`, `exporting`, `teamBusy` |
| Chat | idle · optimistic-post (`teamBusy`, user bubble pending) · failure (optimistic bubble REMOVED + `teamError` "⚠️ Message not sent — …") · history-empty ("fresh bubble" copy). Non-streaming: reply arrives only after `POST /api/agent/chat` resolves ('✅ Message sent.' fallback) |
| Completion path | `directionNote` (dispatch note), `markedDone`, `archiveConfirmDismissed` ("Not now" → row gone for the session), `archiveDone` (archived banner + View in History, `onGoToHistory` >> onBack) |
| Interrupt | `interrupting` (spinner) · `interrupted` local / `full.interrupted` / `assignment.interrupted` — stops steps + handle |
| Errors | `directionError` (choose/mark-done/archive), `teamError`, `exportError` (404 → "Nothing recorded to export for this assignment yet."), full-view fetch failure silently swallowed (fallback card fields), chat history failure swallowed |
| Empty/fallback | no assignment → `clean-card` full-page empty state (`AlertCircle`, "No assignment selected", "Pick an assignment from the dashboard…", [Go back] primary); prompt/rubric/files/materials placeholders; team fallback + dump provenance lines |
| Effort / token display | The only "effort" readouts: stage status mono lines, subagent `% complete` bars, and `Passed: N% Human Score` (or "no AI-detection score recorded"). **No token/credit readout on this page** (credits live in shell top bar); `rawHumanScore` derives from `human_score`→`human`→`100−ai_score`. |

## 2.3 Buttons inventory

Back to dashboard (link) · Export · Launch to Doc · Mark as done (2 sites: header + team card) · Stop Execution (3 states) · 6 direction tiles (+ custom toggle textarea) · Send to the team · Pick a direction · Move to history · Not now · View in Assignment History (2 sites) · Open Assignment History · Send (chat). Each has busy/spinner variants where noted; errors are inline mono lines.

## 2.4 Concrete problems (grounded)

- **D1 Overdue is invisible here.** Dashboard cards (`isOverdue(card.due_date)` → AlertTriangle chip) and History rows (red `AlertTriangle` + `text-error` cell) both surface overdue; the detail header renders due as a plain variant "Due: —" — the student stuck-at-pending can't see the most important number turning red. The 3-stage ribbon and team card never reference the due date.
- **D2 Load-state arithmetic is duplicated/fluid**: `loading` governs only the team empty-state; the ribbon/direction-picker/status pill render whatever the *card* prop said the instant the first mount happened, then silently upgrade — a full-view 500 leaves phantom "Not started" + no retry (both fetches swallow errors; `refreshFullView` exists but is only wired after mutations).
- **D3 Chat is non-streaming and one-shot** — a message to a working team is an opaque round trip; no streaming (`api.agentChatStream` exists and MyAgentView uses it with live ThinkingBubble + tool status), no per-corpus "thinking" bubble, no tool status rows on this page (tool progress lives as subagent cards only), no stop/cancel for an in-flight chat message, no auto-scroll anchor for history.
- **D4 Two mark-done / move-to-history stories**: header `Mark as done` vs team-card CTA duplicate; archive is triggered by native `confirm()` (plain browser chrome, unstylable, inconsistent with the in-card row) — and the header button never surfaces the follow-up "move to history" state (that lives only in the team card; on small screens users may miss it).
- **D5 Dead states on the ribbon**: Stage 3 shows "Humanizing queued" whenever step2 is active and "Waitng"-style defaults when `bucket=unknown` — label "Waiting" is shown for a brand-new assignment which is really "Not started"; `step1Status 'Awaiting Input'` is actually correct-copy (keep, but gate on real fields).
- **D6 Mixed a11y**: direction buttons (the primary interaction) have no `aria-pressed` and no radiogroup semantics; the ribbon has no `role="progressbar"`/`aria-live`; the chat feed isn't `aria-live="polite"` (busy line is plain); subagent bars are div-`style` widths with no `aria-valuenow`; `Stop Execution` disabled reasons indistinguishable to AT; native `confirm()` breaks keyboard-only flows.
- **D7 Message-bubble honesty is unproven for the *team* route**: `replyText = res?.reply || res?.message || '✅ Message sent.'` — if the server returns no text, the UI shows a green checkmark that the team never actually said (contrast D-footer's "only activity that was really recorded" promise).
- **D8 No result canvas**: the detail page is the "bubble" home, yet the actual work product (`full.do_it_work` — LaunchToDocModal reads it; `materials` list) renders only as a 1-line materials list — Stitch v3 puts a real **Working Draft reading-mode canvas** on the right of a 12-col bento. Also no Copy/Open-material affordances; attached files are bare strings.
- **D9 Micro-inconsistencies**: `rounded-2xl` direction/subagent cards vs rationale's card=2xl (fine) but progress-bars `h-1.5` vs Stitch `h-2`; two different "View in History" styles (primary vs outline); `text-[10px]` mono dump line; `max-w-7xl` root without inner page header separation from AppShell tabs; status pill pulses even when `status` is a stale fallback.
- **D10 Stitch gap**: no skeleton for the main content, no `ai-glass` dispatch panel with vertical activity timeline, no overall `%` figure (Stitch detail v3 shows a headline `68%` progressbar), no Stage/tool grouping beyond 3 mono lines.

## 2.5 REGENERATION SPEC (Google Stitch) — Assignment Detail ("bubble") page

Align to `helpotron_assignment_detail_v3_1` bento at the same time as the real data model (do not invent steps):

**Shell**: same root; keep the aurora role-token surface classes (`bg-surface-container-lowest rounded-3xl border-outline-variant/50 shadow-sm`, dark-first via existing `dark:`-free tokens), `font-display-xl` heading.

**Header (unchanged semantics, Stitch-ified)**: status pill → 9-semantic-chip system (pending=`bg-secondary-container/15 text-secondary` with pulsing dot; in_progress=`bg-primary/15 text-primary`; completed=`bg-emerald-500/15 text-emerald-400`; archived=`bg-surface-container-high text-on-surface-variant`); Add **overdue chip** when `due_date < today` (rounded-full `bg-error/15 text-error border-error/30` + lucide `AlertTriangle`, `font-label-caps`) — fixes D1. Title/ID/course/prompt/meta unchanged. Action row: Export · Launch to Doc · **Overflow menu** (`MoreHorizontal` ghost icon, opens a dropdown with Archive/Move-to-history + config placeholder) · Mark as done (primary). All `min-h-[44px]`.

**Bento grid** `grid grid-cols-1 lg:grid-cols-12 gap-gutter`:

- **Left `lg:col-span-5`**:
  1. *Direction picker hero* (`rounded-3xl p-6`): `Compass` heading, `font-body-sm` intro; **2-col grid of 6 rich tiles** (icon + `font-label-caps` bold + one-line `font-body-sm text-[12px]` subtitle: "Complete draft generation"), selected = `border-2 border-primary bg-primary-container/5`, unselected = `border border-outline-variant hover:border-primary`; `custom` = dashed tile (`border-dashed`, opens inline textarea as today); per-tile `aria-pressed`, `min-h-[44px]`, focus ring 2px; `choosing` overlay "Dispatching to the team…"; `dispatchNote` primary/10 mono box; `directionError` `text-error` line. **Config placeholder (B7)**: bottom hairline row "⚙ Assignment settings" ghost toggle placed here (below the picker, above Agent Activity) — visually a `Settings2 icon + font-label-caps` label in `text-on-surface-variant`; unbuilt until the model ships.
  2. *Agent Activity panel* (`?`-glass or `bg-surface-container-low` shade; header row title + `font-tabular-stat text-primary font-bold` headline **`{overall}%`** computed from subagent progress mean (fallback `loading` → shimmer); `h-2 bg-surface-container-highest rounded-full` progressbar with `role="progressbar"` + `aria-valuenow` + pulsing overlay; **vertical timeline** (1px `bg-outline-variant/50` line, `w-6 h-6` circle nodes): node per real subagent row — completed=`bg-primary`+`Check`, running=`border-2 border-primary`+`animate-ping` inner dot, failed=`bg-error`+`X`, pending=plain empty — with title `{agent}` + mono `{statusLabel}` chip + body detail (progress text / "no note recorded" avoided: render only what server gives). `aria-live="polite"`.
  3. *Stop Execution* handle at panel foot (keeps its 3 states, exact current labels).
- **Right `lg:col-span-7`** — *Working Draft / Output* card (`max-h` panel): header `px-6 py-4 border-b bg-surface-container-low/50` with `FileText` + title ("Working Draft" when `full.do_it_work` exists, else "Study Output"), actions: Copy (`Copy`→`Check` 2s), Launch to Doc (`ExternalLink`), Export (`Code`/`Download`); body `p-6 md:p-8 overflow-y-auto` reading-mode canvas: `do_it_work` (if present) else **materials list as cards** (`rounded-2xl border bg-surface-container-low p-4`, kind + date + Open), else empty state ("Nothing generated yet — pick a direction or ask the team." + [Pick a direction]); bottom action bar `px-6 py-4 border-t` ghost "Move to history" + primary "Mark as done" (moves the D4 dangling follow-up into a real bar; drop the in-card confirm row and native `confirm()` for a **styled in-card confirm strip** exactly as today's row but non-blocking). Live "agent is writing…" footer line only when `bucket==='in_progress'` (no fabrication).
- **Full-width, below bento**: Prompt card + Rubric card (unchanged, `lg:grid-cols-2`), Attached Files + Saved Materials (unchanged, upgrade file rows to clickable when URLs exist).

**Chat (upgrade in place)**: reuse MyAgentView's streaming pattern — `api.agentChatStream` with `onEvent` chunk append; add ThinkingBubble (copy the exported/prop-injectable version of MyAgentView's `ThinkingBubble` — shared-component refactor B3/B6 align) with collapse/minimize + `aria-expanded`; keep honest `id: local_` optimistic bubbles and remove-on-fail; `aria-live="polite"` on the feed; new-arrival auto-scroll; show "Agent team is working…" bushline via stream status rather than post; tool-status rows appear as inline mono chips under the streaming message when the event payload carries them.

**States (regeneration checklist)**: pending/no-dir → picker hero + team empty; pending/dir → "starts on" copy + staged timeline; in_progress → live panel + streaming chat; completed → mark-done bar; archived → archived banner + View in History; interrupted → halted handle + step1 "Halted"; every fetch has a skeleton (Stitch skeleton variant: `bg-on-surface-variant/20 rounded-full animate-skeleton`, or `animate-pulse` bars) and an error line + **Retry**; overdue chip; empty states for each card keep the exact current honest copy.

**Every action button (final inventory)**: Back · Export · Launch to Doc · More overflow · Mark as done (header + bottom bar) · 6 direction tiles · Send to the team · Pick a direction · Copy · Move to history · Not now · View in Assignment History · Open Assignment History · Send (chat) · Retry (new, error rows) · step-Agent panel None. Busy variants: spinner replaced icon + `disabled:opacity-40`, label unchanged (except Mark as done→"Completed", Stop→"Halted", Export spinner).

**MOBILE**:
- Header: single column; status chips + ID wrap; title `text-headline-lg-mobile`; action row becomes a **sticky bottom action bar** (`fixed bottom-0 inset-x-0 bg-surface-container-lowest backdrop-blur border-t border-outline-variant/50 px-4 py-3 pb-safe`, 3 equal buttons: Launch to Doc · Export · Mark as done; overflow dots move to the header chip row).
- Bento collapses to single column; direction tiles stay 2-col; Agent Activity timeline unchanged; Working Draft card drops its fixed `h-[600px]` → natural height with `max-h-[60vh]`.
- **Chat composer floats above the bottom bar** (`sticky bottom-[calc(56px+safe)]` or a scrolled anchor button `ArrowDown` when below-fold) so the user can always steer the team; history `max-h-56`.
- Direction picker heading + step labels shrink to `text-headline-lg-mobile`-scale where needed; all touch targets ≥48px on touch.
- Stop Execution remains inside the Agent Activity panel (not in the bottom bar — it's a destructive action, keep it semantics-separated).

**Shared tokens to hand to Stitch**: containers `rounded-3xl`, cards `rounded-2xl`, buttons `rounded-xl`, `min-h-[44px]`; type scale from index.css `@theme` (Hanken Grotesk display/headline, Inter title/body, JetBrains Mono label-caps/tabular-stat); roles: primary `#00685f`, primary-container `#008378`, secondary `#4648d4`, secondary-fixed `#e1e0ff`, error `#ba1a1a`, error-container `#ffdad6`, outline `#6d7a77`, outline-variant `#bcc9c6`, surface-container-lowest `#ffffff`, -low `#eff4ff`, -high `#dce9ff`, -highest `#d3e4fe`, on-surface `#0b1c30`, on-surface-variant `#3d4947`, inverse-surface `#213145`; focus ring 2px primary; box-shadow `0 4px 20px rgba(0,0,0,0.02)`–0.4 dark.

---

# 3. Shared bubble/status UI (used by BOTH pages)

- **AURORA_CHIP_TINTS** (scoped in AssignmentDetailView, expected to move to index.css as `.aurora-chip.ok|info|danger|tight`): glass pill base + rgba tints (ok=16,185,129/.14, info=34,211,238/.13, danger=244,63,94/.14 — these are literal rgba hex-adjacent values; Stitch rationale says "zero hex literals" — convert to `oklch` role aliases or `--color-*` vars during regen).
- **Status pill pattern** (shared): `font-label-caps text-label-caps px-3 py-1 rounded-full border` + 2px pulsing dot; tints per chip set.
- **SUBAGENT_STATUS_LABEL** map (SUPER-LABEL-CAPS mono chips `text-[10px] rounded-full px-2 py-0.5`, complete/working/failed/pending).
- **Progress bar pattern** (shared): track `h-1.5/h-2 bg-surface-container-highest/high rounded-full overflow-hidden`, fill `bg-primary` (or gradient for AI typing in LaunchToDoc), `transition-all duration-300`.
- **ThinkingBubble** (MyAgentView 73-131): collapsed pill "💭 Thinking…" + ChevronDown / expanded card `bg-surface-container-high border-outline-variant/40 rounded-2xl` with "Model Reasoning · Live" mono header + scrollable mono body; Escape-to-minimize; `_userScrolled` pinning. Reuse as-is (move to shared via prop or export).
- **Dispatch-note box**: `bg-primary/10 border-primary/30 text-primary font-mono rounded-xl` — truthful server copy only.
- **Dump provenance line**: `text-[10px] font-mono text-[var(--text-muted)]/80` — used in detail team empty states (keep honest labels: auto_routed/matched/manual_routed/finalized).
- **Error line pattern**: `font-label-caps text-xs text-error` with ⚠️ (directionError, teamError) vs **error panel** in modal (`bg-error/15 border-error/30 rounded-xl text-xs font-mono` role="alert").
- **Chat bubble pattern** (both pages): user `bg-primary text-on-primary` right, agent `bg-surface-container-low border-outline-variant/30` left, `max-w-[85%] rounded-2xl px-4 py-2.5 font-body-sm whitespace-pre-wrap`.
- **Modal chrome pattern** (NewAssignmentModal + LaunchToDocModal): backdrop blur + panel `rounded-3xl(2xl)` + header icon tile + X + sticky footer with ghost-cancel + primary action; LaunchToDocModal additionally implements the **focus trap + restore** reference implementation to copy (it is the a11y template in this codebase despite the violet theme).

---

# 4. Bottom line for the redesign (honesty notes)

- Regeneration must respect the server-first import contract (create-then-patch) unless the API is widened to "scrape → return draft → confirm → create"; the Stitch Review & Confirm screen depends on that, so flag the API change request explicitly rather than pretending the UI-only fix suffices.
- Detail page currently does NOT show streaming/thinking/tool-status for the *assignment team chat* — the upgraded spec above borrows the proven pattern from MyAgentView; do not claim the detail view had it.
- Effort/token display on this page today = subagent % + human-score % only; no credits token on page (top bar only). Keep truthful phrasing ("Passed — no AI-detection score recorded", "only activity that was really recorded").
