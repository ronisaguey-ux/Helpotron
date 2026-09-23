# Loading-State & Wait-Time UX Audit — helpotron (web + extension)

Agent 7 of 10 · read-only audit · 2026-09-23

Scope: every async action in `extension/` and `web/`, judged against the
standard loading-indicator rules (proportional feedback: <1s none, 2–5s spinner,
5–10s spinner + static context, 10s+ determinate progress; fast failure).

---

## 1. Verified current state

### 1a. The 1-second rule IS implemented correctly in `withBusy`

`extension/popup.js:40-73`. Read the function end-to-end:

- **DISABLE is immediate** — `btn.disabled = true` and `aria-busy="true"` run
  synchronously at `popup.js:48-49`, *before* any timer. This is the part that
  stops a double-submit, and it does NOT wait. ✅
- **LABEL is delayed** — the spinner+verb swap (`showLabel`) is wrapped in
  `setTimeout(..., BUSY_LABEL_DELAY_MS)` with `BUSY_LABEL_DELAY_MS = 400`
  (`popup.js:38,52-59`). A sub-second action shows *nothing*, which is the
  correct outcome.
- **Guarded double-click** — `btn.dataset.busy === '1'` early-returns
  (`popup.js:42`), and `finally` always restores markup + clears the timer
  (`popup.js:63-72`), including on throw.

Verdict: the pattern is correct. No double-submit window, no fast-action flash.
`extension/tests/busy_button.test.js` already covers all of this (10 tests).

### 1b. `withBusy` coverage — 5 buttons wired, several unguarded

Wired (`withBusy` in the handler):
| button | file:line |
|---|---|
| `#btnScrapeCurrent` (Scrape current) | `popup.js:1340` |
| `#btnScrapeSite` (Start crawl) | `popup.js:1471` |
| `#btnRefreshAssignments` | `popup.js:4077` |
| `#btnRefreshDocTabs` | `popup.js:4078` |
| `#btnStartLaunchToDoc` | `popup.js:4081` |

Unguarded async actions (no `withBusy`, control unchanged during the wait):
- `#btnHumanizeLtd` — **`popup.js:3825-3860`**. Manual busy swap:
  `btnHumanizeLtd.disabled = true; btnHumanizeLtd.innerHTML = '<span>Humanizing…</span>'`
  (`popup.js:3838-3840`). No spinner element, no `.btn-spinner` class, no
  delayed label. This is the only primary action left on the old pattern.
- `#btnNewChat` (`popup.js:2033`), `#btnRenameThread` (`popup.js:2069`),
  `#btnPinThread` (`popup.js:2096`), `#btnStopCrawl` (`popup.js:1485`),
  `#saveSettings` (`popup.js:1538`), `#btnRefreshChat` (`popup.js:3466`),
  `#btnPopOut` (`popup.js:224` — manual disable + error el, acceptable).
  These are sub-second → ~2s; they set a status line but never disable the
  control, so a double-click can double-fire (e.g. two thread creates).

### 1c. The long waits (core of the audit)

**Multi-round agent loop — the worst offender.** Two copies exist:

- Popup: `runAgentTask` `popup.js:3706-3758`.
- Full-tab: `runAgentTaskTab` `agent_mode.js:1679-1725`.

Both track `used` (tool calls), `round`, a hard cap (`AGENT_LOOP_HARD_ROUND_CAP = 40`
`popup.js:3704`; `TAB_LOOP_HARD_ROUND_CAP = 40` `agent_mode.js:1677`), and a
budget (`agentToolBudget()` `popup.js:3707`; `budget` `agent_mode.js:1680`).
**The budget and round counter are passed only to the MODEL** in the continuation
prompt (`agentContinuationPrompt` `popup.js:3685-3698`; `tabContinuationPrompt`
`agent_mode.js:1664-1675` — the string `"Tool calls used so far: ${used} of ${budget}"`).
**The user never sees `used`, `budget`, or `round`.** `setStatus` is called *only
when the loop stops* (`popup.js:3731/3735/3740/3744/3756`; `agent_mode.js:1703/1705/1710/1714/1723`).

What the user actually sees during a multi-round task (minutes):
- a **static text bubble** `"Thinking…"` (`popup.js:3506`) / `"…thinking…"`
  (`agent_mode.js:1528`), with **no spinner and no animation** (`.chat-msg.agent`
  has no animation in `popup.css:1024-1035`; confirmed via puppeteer drive — 0
  `.btn-spinner`/spinner elements present, and "Thinking…" is a plain text node);
- per-action updates *within a single batch* via the pulsing agent-active bar
  (`showAgentActiveBar` `popup.js:2614`, `updateAgentActiveDesc` `popup.js:2637`,
  `"Action N/M: Clicking…"` `popup.js:3118`) — good, but this resets every round;
- no "round 3 of 40", no "42 of 100 tool calls", no percentage.

So the single most important wait in the product presents an **indefinite static
indicator** for minutes at a time, exactly the failure mode the research flags.

**Budget retrieval is also broken/shape-fragile (supporting bug):**
- Server publishes the budget at `/api/extension/ui-config` as a **top-level**
  key (`server/routes_extension.py:168` `"tool_call_budget": _MAX_AGENT_TOOL_CALLS`).
- Popup reads `copy.tool_call_budget` (`popup.js:139`) where `copy = _ensureUiCopy()`,
  which caches **`boot.ui`** from `/api/extension/bootstrap`
  (`popup.js:4166-4169`). That bootstrap `ui` object is
  `{spinner_verbs, busy_message, busy_after_seconds}` (`server/routes_extension_api.py:328-334`)
  — **no `tool_call_budget`**. So `agentToolBudget()` silently falls back to 100
  (`popup.js:142`) every time, *unless* `loadModelLadder()` happened to write the
  full ui-config payload into `ui_copy` first (`popup.js:370`), making the read
  order-dependent.
- Full-tab reads `copy.ui.tool_call_budget` (`agent_mode.js:1683`) from the
  bootstrap payload — also `undefined`, also always falls back to 100
  (`agent_mode.js:1680`).

**Crawl** — per-page determinate-ish, no bar. `renderCrawlStatus` (`popup.js:1421-1455`)
writes `"🌐 Scraping {scope} — {done}/{total} pages saved"` + `"Last: {title}"`,
polled every 2s (`pollCrawlStatus` `popup.js:1457-1469`). This is real per-page
progress but rendered as **plain text** in `#crawlProgress` (a text node, no bar —
confirmed by drive). Acceptable for 10s+; a small bar would be nicer, not urgent.

**Launch-to-Doc typing** — correctly wired, real determinate progress. ✅
`#ltdProgressFill` (a real `DIV.progress-bar-fill`) and `#ltdTypingPct` are driven
by `BROADCAST_TYPING_PROGRESS` messages (`popup.js:4213-4238`), reading
`percentage ?? percent` (`popup.js:4219-4221`), with rotating verbs
(`startProgressNarration` `popup.js:4181-4204`) and a queue notice after
`busy_after_seconds`. Pause/Cancel stay reachable (`popup.js:4125-4142`). Verified
via drive: `ltdProgressFill` = `DIV.progress-bar-fill` inline width `0%`,
`ltdTypingPct` = `"0%"`. The web mirror (`LaunchToDocModal.jsx`) relays real
`HELPOTRON_TYPING_PROGRESS` (`LaunchToDocModal.jsx:102-115`) and explicitly
surfaces launch failure instead of faking progress (`LaunchToDocModal.jsx:376-384`).

**Humanize** — local HIP, ~6–90s, weak feedback. `popup.js:3825-3860`: button
shows `"Humanizing…"` text immediately, no spinner, no progress, no elapsed
context. For a 90s humanize the user stares at two static words. The single POST
is non-streaming, so true percent is unavailable — but rotating status text
(5–10s rule) and a length-aware reassurance ("long documents take up to a minute")
are missing.

### 1d. Web app loading states

- `web/src/components/ui/Skeleton.jsx` is a shimmer placeholder (`Skeleton.jsx:1-16`),
  used in 7 files: `DataLakeView.jsx:246-248`, `AnonymousLanding.jsx:723-831`
  (Suspense fallbacks), `IntelligenceView.jsx:92-94`, `study/AcademicCalendar.jsx:417`,
  `SubjectSettingsPanel.jsx:102-104`, `TrialActivationCard.jsx:62-71`, plus the
  `charts/` sweep shells. Coverage is real but thin — most async views show
  **nothing** or a bare spinner.
- `web/src/components/Button.jsx:44-91` has a correct `loading` prop (immediate
  `Loader2` swap, `aria-busy`, disabled) but **no delayed-label equivalent** of
  `withBusy`. It is used with `loading` in exactly **one** place
  (`NotificationsView.jsx:99`). The repo has **509 raw `<button>` elements**; the
  remaining loading states are ~30 hand-rolled `Loader2 animate-spin` swaps
  (e.g. `ApiKeysPanel.jsx:179-232`, `AssignmentHistoryView.jsx:269-345`). Most are
  2–5s actions and are fine; none implement the sub-second "don't flash" rule.

**Fake progress bar (a lie) — `AssignmentDumpView.jsx:117-139`.** `handleUploadFile`
hardcodes `setUploadProgress(20)` → `setUploadProgress(60)` → `setUploadProgress(100)`
(`AssignmentDumpView.jsx:120,128,130,137`) regardless of real upload. The bar
(`AssignmentDumpView.jsx:435`) therefore claims progress that does not exist.
`api.uploadDumpFile` (`src/api.js:840-859`) is a bare `fetch` with no
`onUploadProgress` hook, so there is no real number to bind to. `handlePasteSubmit`
(`AssignmentDumpView.jsx:141-163`) shows no progress at all.

### 1e. Fast-failure violations

- **Web `request()` has NO timeout.** `src/api.js:166-213` and `doRequest`
  (`src/api.js:217-295`) call `fetch` with no `AbortController`/timeout. A hung
  server = an indefinite spinner with no failure ever surfacing. This is the
  mirror-image fast-failure bug: not "too-long timeout", but "no timeout at all".
- **Extension agent turn: 75s fetch timeout with a static "Thinking…" the whole
  time.** `popup.js:3565` and `agent_mode.js:1565` `setTimeout(() => ctrl.abort(), 75000)`.
  On abort the catch surfaces `"Connection error"` (`popup.js:3677`) / `"Study Buddy
  chat failed"` (`agent_mode.js:1655`). The user sits through up to 75s of a static
  bubble before a generic failure. There is **no stall guard during the turn** —
  only the loop-level no-op guard (`stalledRounds >= 2`,
  `popup.js:3743` / `agent_mode.js:1713`), which catches *repetition*, not *hang*.
- Extension `_post` default 15s timeout (`server_logic.js:41`) is fine for its
  callers (mouse-path, crawl plan/payload).

---

## 2. The gap (ranked by reachable-now impact)

1. **Multi-round agent loop shows no determinate progress** (popup + full-tab).
   Minutes-long, highest-value wait in the product, currently an indefinite
   "Thinking…" text with no round/tool-call/budget indicator. *(Highest-value fix.)*
2. **Humanize (6–90s) shows only static "Humanizing…"** — no spinner, no rotating
   status, no reassurance; also the last primary button not on `withBusy`.
3. **Web fake upload progress bar** (`AssignmentDumpView` 20/60/100) — a lie,
   worse than a spinner.
4. **`tool_call_budget` is read from the wrong endpoint shape** in both extension
   files → always falls back to 100 (and blocks fix #1 from using a real budget).
5. **Web `request()` has no timeout** → hung requests spin forever (fast-failure gap).
6. **75s agent-turn timeout** presents a static "Thinking…" then a generic failure
   (fast-failure gap; mitigated by streaming/elapsed feedback, not by shortening).
7. Thread ops + `saveSettings` + `#btnRefreshChat` have no disable (double-submit
   risk on ~1–2s actions).

---

## 3. The plan

Each step names file, exact change, test, and the one command that proves it.

### Batch A — Surface determinate progress on the agent loop (highest value)

**A1. Add a real round/tool-call readout to the full-tab agent loop.**

File: `extension/agent_mode.js`. In `runAgentTaskTab` (`agent_mode.js:1679-1725`),
after `round += 1` (line 1697), before the stop checks, write the progress to the
status line every round:

```js
round += 1;
setStatus(`⏳ Round ${round}${TAB_LOOP_HARD_ROUND_CAP ? ` of ~${TAB_LOOP_HARD_ROUND_CAP}` : ''} · ${used} of ${budget} tool calls`);
```

Progress value comes from the already-tracked `round`, `used`, `budget` (all in
scope). No new data source. `budget` must first be fixed to read correctly — see
**A0** below (do A0 first).

Also update the "…thinking…" line so the user knows it is *progressing*, not hung —
`agent_mode.js:1528`:

```js
const typingEl = addChatMsgEl('agent', '…thinking…');
```

is fine for <5s, but add a rotating verb after 5s (reuse the server-owned verbs).
Simplest: reuse `setStatus` above; leave the bubble as-is.

**A2. Same readout in the popup loop.**

File: `extension/popup.js`. In `runAgentTask` (`popup.js:3706-3758`), after
`round += 1` (line 3719):

```js
round += 1;
setStatus(`⏳ Round ${round} of up to ${AGENT_LOOP_HARD_ROUND_CAP} · ${used} of ${budget} tool calls`);
```

`budget` is already fetched at `popup.js:3707` (but see A0).

**A3. (optional, higher polish) A determinate progress bar in the chat view,**
mirroring the existing LTD card markup. Reuse the exact classes that already
exist (`popup.css:1199-1247`): `.typing-active-card`, `.typing-status-line`,
`.typing-pulse`, `.typing-pct`, `.progress-bar-track`, `.progress-bar-fill`. Add
one card above the chat input (inside `#viewChat`), and drive its fill width from
`Math.min(100, Math.round((used / budget) * 100))` updated each round.

Markup (copy matched to LTD card at `popup.html:598-617`):

```html
<div class="typing-active-card" id="agentProgressCard" style="display:none">
  <div class="typing-status-line">
    <span class="typing-pulse"></span>
    <span id="agentProgressStatus">Round 1 · working…</span>
    <span class="typing-pct" id="agentProgressPct">0%</span>
  </div>
  <div class="progress-bar-track">
    <div class="progress-bar-fill" id="agentProgressFill" style="width:0%"></div>
  </div>
</div>
```

Test: `extension/tests/agent_progress.test.js` — extract the `runAgentTask` body
the same way `busy_button.test.js` extracts `withBusy` (`busy_button.test.js:24-41`),
assert that after one `round += 1` the status text contains `"Round 1"` and
`" of 100 tool calls"` (mock `runAgentTurn` to return `{ok:true, ran:3, done:false, noops:[]}`).
Prove: `node --test extension/tests/agent_progress.test.js`.

**A0. (prerequisite — do first in this batch) Fix the budget read.**

File: `extension/popup.js:135-144` and `extension/agent_mode.js:1680-1685`.
The authoritative key is top-level `tool_call_budget` on `/api/extension/ui-config`
(`server/routes_extension.py:168`). Normalize in one place:

```js
// popup.js agentToolBudget()
async function agentToolBudget() {
  if (_agentToolBudget) return _agentToolBudget;
  try {
    const copy = await _ensureUiCopy();
    const n = Number(
      (copy && copy.tool_call_budget) ??         // ui-config payload (top-level)
      (copy && copy.ui && copy.ui.tool_call_budget) // bootstrap ui (future)
    );
    if (Number.isFinite(n) && n > 0) { _agentToolBudget = n; return n; }
  } catch {}
  _agentToolBudget = AGENT_TOOL_BUDGET_FALLBACK;
  return _agentToolBudget;
}
```

`agent_mode.js` change `copy.ui.tool_call_budget` → `copy.tool_call_budget ?? copy.ui?.tool_call_budget`
and ensure it fetches `/api/extension/ui-config` (or add a top-level
`tool_call_budget` to the `/api/extension/bootstrap` response at
`server/routes_extension_api.py:324-342` — the cleaner server-side fix, one line).

Test: `extension/tests/budget.test.js` — assert `agentToolBudget()` returns the
value from a ui-config-shaped payload and the fallback for a bootstrap-shaped one.
Prove: `node --test extension/tests/budget.test.js`.

### Batch B — Humanize feedback + `withBusy` coverage

**B1. Put `#btnHumanizeLtd` on the correct pattern.** Replace the manual swap
(`popup.js:3838-3840`) with `withBusy` + a spinner:

```js
if (btnHumanizeLtd) {
  btnHumanizeLtd.addEventListener('click', () => withBusy(btnHumanizeLtd, 'Humanizing…', async () => {
    // ...existing body, minus the manual disabled/innerHTML/finally lines...
  }));
}
```

`withBusy` gives the immediate disable + delayed spinner label. Then add length-
aware context for long waits — right before the `fetch` (`popup.js:3842`):

```js
const words = text.split(/\s+/).filter(Boolean).length;
if (words > 1500) setStatus('✍️ Humanizing a long document — this can take up to a minute.');
```

Test: `extension/tests/busy_button.test.js` already covers `withBusy`; add one case
asserting `#btnHumanizeLtd` passes through it (grep for `btnHumanizeLtd` being
wrapped, same extraction pattern). Prove: `node --test extension/tests/busy_button.test.js`.

**B2. (optional) Rotating status for long humanize.** Reuse
`startProgressNarration()` (`popup.js:4181`) if you want the server-owned verbs
while a >10s humanize runs — but note it is currently coupled to the typing state;
wire a lighter verb rotation (`setInterval` every 4s on the status line, cleared
in `finally`). Low priority.

### Batch C — Web fake progress bar → real or honest

**C1. Stop lying: replace the hardcoded 20/60/100.** `web/src/components/AssignmentDumpView.jsx:117-139`.
Either (a) wire real progress via `XMLHttpRequest` `upload.onprogress` (the only
way to get a real number from a `fetch`-based upload; switch `api.uploadDumpFile`
to XHR or expose an `onProgress` callback), or (b) if real progress is out of
scope, replace the bar with an indeterminate style + static verb and drop the
numeric percent entirely (a spinner + "Uploading file…" is honest; a fake number
is not).

Real-progress markup (minimal change — keep the existing bar `AssignmentDumpView.jsx:435`,
drive it from XHR):

```js
const xhr = new XMLHttpRequest();
xhr.upload.onprogress = (e) => {
  if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
};
```

Test: `web/tests/uploadProgress.test.mjs` — assert the component sets progress
from `e.loaded/e.total` (mock XHR), and never sets 20/60/100 literals (grep guard).
Prove: `node --test web/tests/uploadProgress.test.mjs`.

### Batch D — Fast failure

**D1. Give `request()` a timeout + honest failure.** `web/src/api.js:217`
(`doRequest`). Add an `AbortController` with a sensible default (e.g. 30s) and
surface it through the existing error contract:

```js
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), options.timeout || 30000);
try {
  const response = await fetch(url, { ...options, headers, credentials: 'include', signal: ctrl.signal });
  // ...
} finally { clearTimeout(timer); }
```

An aborted fetch throws `AbortError` → catch → `humanError` should classify it as
`timeout`/`offline` (verify `kindFor` in `web/src/lib/errors.js:180` already maps
408/504 → timeout; add `AbortError` mapping). This turns an indefinite spinner into
a surfaced failure.

Test: `web/tests/errors.test.mjs` — add an `AbortError` case. Prove:
`node --test web/tests/errors.test.mjs`.

**D2. (extension) Elapsed-time honesty during a 75s turn.** In `runAgentTurn`
(`popup.js:3506`) / `runAgentTurnTab` (`agent_mode.js:1528`), start a 5s timer
that appends elapsed context to the status line (e.g. `"still thinking… (12s)"`)
so the static bubble reads as *working*, not *hung*. Cheap, no new data.

### Batch E — Double-submit guards (low)

Wrap the remaining async buttons in `withBusy` (or a bare immediate-disable):
`#btnNewChat` (`popup.js:2033`), `#btnRenameThread` (`popup.js:2069`),
`#btnPinThread` (`popup.js:2096`), `#saveSettings` (`popup.js:1538`),
`#btnRefreshChat` (`popup.js:3466`). Disable is the fix; the label is optional for
these ~1–2s actions (sub-second actions should show nothing per the rule).

---

## 4. RISKS / DO NOT DO

- **Do NOT add a spinner to a sub-second action.** `withBusy`'s 400ms label delay
  is correct (`popup.js:38,52-59`) — keep it. Adding an always-on spinner to
  thread create/rename/pin or the refresh links would flash and feel slower.
- **Do NOT show a fake progress bar.** `AssignmentDumpView`'s 20/60/100 is the
  exact anti-pattern. Any determinate bar must be bound to a real measured value
  (`used/budget`, `done/total`, `e.loaded/e.total`, `percentage`). A percentage
  you cannot measure is worse than an honest spinner.
- **Do NOT shorten the agent-turn 75s timeout to "fail faster".** The server turn
  legitimately takes that long; the owner's rule is a task is never abandoned for
  being slow (`popup.js:4150-4152`). Fix by *informing* during the wait (D2), not
  by cutting it off.
- **Do NOT read `tool_call_budget` from the bootstrap `ui` object.** It is not
  there (`server/routes_extension_api.py:328-334`). Read it from
  `/api/extension/ui-config` top-level (`server/routes_extension.py:168`) or add it
  to bootstrap. Reading the wrong shape is why both files silently fall back to 100.
- **Do NOT touch the crawl's `done/total` text.** It is real per-page progress and
  already adequate; "improving" it into a bar risks regressing a working signal.
- **Do NOT touch the LTD typing progress** — it is correctly wired to real
  `BROADCAST_TYPING_PROGRESS` percentages (`popup.js:4213-4238`) and its web mirror
  already fixed a prior fake bar (`LaunchToDocModal.jsx:376-384`).
- **`~/.claude/**` is off-limits**; trees are dirty with owner/other-agent WIP —
  read-only, add only this report.

---

## 5. UNVERIFIED

- The exact wall-clock distribution of humanize (6–90s) is asserted from the
  context brief and `server_logic.js`/`routes` structure; I did not run a live
  HIP call (service is down behind maintenance). `UNVERIFIED` on precise timing.
- Whether `/api/extension/bootstrap` ever *also* carries `tool_call_budget` in a
  newer deploy — I read the current `server/routes_extension_api.py:324-342`,
  which does not. Re-verify at implement time.
