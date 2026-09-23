# Empty & Success State Audit — helpotron (agent 4/10)

Scope: `web/src/components/*.jsx`, `extension/popup.{html,js}`, `extension/agent_mode.js`.
Read-only audit. No repo files modified except this report.

---

## 1. Verified current state

Owner rules being audited against:
- Empty screen must say **why** it is empty, give the **next action**, never look broken.
- A failed **search** must offer alternatives, never a dead end.
- Intentional emptiness (inbox zero) should be a **reward**, not a generic blank.
- Every completed action needs **unambiguous confirmation**; silence after a critical action causes duplicate submissions.
- Major milestones → full-page celebration. Routine actions → subtle confirm OR natural state transition.
- Proportional feedback.

### 1a. Web empty states — full table

| component | file:line | triggers | has WHY? | has CTA? | reachable by normal user? | verdict |
|---|---|---|---|---|---|---|
| ControlCenterView | `ControlCenterView.jsx:365-368` | user-directory search/filter returns 0 | ❌ | ❌ | admin only | **WORST** — bare `No matching identities found.` |
| DataLakeView | `DataLakeView.jsx:250-253` | no history entries | ❌ | ❌ | **yes** | **WORST** — bare `Nothing submitted yet.` |
| ThreadsRail | `ThreadsRail.jsx:181-184` | no threads OR search filter empty | ❌ | ❌ | **yes** | **WORST** — bare `No chats yet`; can't tell filter-empty from new-empty |
| AssignmentCardDashboard (in-progress col) | `AssignmentCardDashboard.jsx:743-748` | subject has cards but none in-progress | ❌ | ❌ | yes | plain text, no why/CTA |
| AssignmentCardDashboard (pending col) | `AssignmentCardDashboard.jsx:778-782` | none pending approval | ❌ | ❌ | yes | plain text, no why/CTA |
| AssignmentConfigPanel files | `AssignmentConfigPanel.jsx:231-234` | node has no attached files | partial (`No files attached to this node.`) | ❌ | yes | detail panel, low |
| AssignmentConfigPanel artifacts | `AssignmentConfigPanel.jsx:254-257` | no synthesized artifacts | partial | ❌ | yes | detail panel, low |
| MessageAdminView | `MessageAdminView.jsx:190-196` | no messages with admin | ✅ | ❌ (composer above) | yes | has why, no button |
| ReferralSection | `ReferralSection.jsx:316-319` | no issued codes | ✅ | ❌ (text points to button) | yes | inline pointer, no real button |
| ApiKeysPanel | `ApiKeysPanel.jsx:194-197` | no API keys | ✅ | ❌ (text points to "above") | yes | pointer only |
| MyAgentView | `MyAgentView.jsx:820-826` | fresh conversation | ✅ | ✅ (composer visible below) | yes | OK |
| IntelligenceView | `IntelligenceView.jsx:265-277` | no recommendations | ✅ | ❌ | yes | reward-style ("All recommendations cleared") but no celebration/streak |
| NotificationsView | `NotificationsView.jsx:214-224` | no notifications | ✅ | ✅ ("Refresh feed") | yes | good; CTA wording weak on 'all' tab |
| NotificationsPanel | `NotificationsPanel.jsx:108-129` | no notifications (bell) | ✅ | ✅ ("Manage preferences") | yes | good |
| AssignmentHistoryView | `AssignmentHistoryView.jsx:449-466` | no records OR filter empty | ✅ | ✅ ("Create New Assignment") | yes | good; but **filter-empty shows the same "create" screen** |
| LibraryView files | `LibraryView.jsx:257-276` | no materials | ✅ | ✅ ("Upload First Material") | yes | good |
| LibraryView saved | `LibraryView.jsx:383-392` | nothing bookmarked | ✅ | ❌ | yes | has why, no CTA |
| AssignmentDumpView | `AssignmentDumpView.jsx:533-540` | no queue items | ✅ | ❌ (points to upload above) | yes | pointer only |
| AssignmentTurnInView active | `AssignmentTurnInView.jsx:161-167` | no active assignments | ✅ | ❌ | yes | pointer only |
| AssignmentTurnInView history | `AssignmentTurnInView.jsx:229-236` | nothing completed | ✅ | ❌ | yes | pointer only |
| GuideView | `GuideView.jsx:600-612` | search/filter no match | ✅ | ✅ ("Clear all filters") | yes | **good** (correct "no match" treatment) |
| CommandPalette | `CommandPalette.jsx:145-157` | command search no match | ✅ | ✅ (slash-command hints) | yes | good; no fuzzy "did you mean" |
| TrashPanel | `TrashPanel.jsx:155-162` | trash empty | ✅ | n/a (intentional empty) | yes | **good** reward-style (Inbox icon + calm copy) |
| AdminAdvancedDashboard users | `AdminAdvancedDashboard.jsx:627-637` | no users / none match search | ✅ | ❌ | admin | has why, no CTA |
| ActivityView | `ActivityView.jsx:114-123` | no events / category filter empty | ✅ | n/a | yes | uses EmptyState, good |

### 1b. Extension empty states — full table

| surface | file:line | triggers | has WHY? | has CTA? | verdict |
|---|---|---|---|---|---|
| threads drawer | `popup.html:502-503` + `popup.js:1976-1978` | `chatThreadsList.length === 0` | ❌ | ❌ | **WORST** — hardcoded single `Current conversation` div; no way to know there are no saved threads |
| threads fetch failure | `popup.js:1958` + `:1968-1970` | `!res.ok` or network error | ❌ (silently swallowed) | ❌ | fetch-fail indistinguishable from empty |
| crawl results | `popup.js:1371-1378` | crawl returned 0 results | ❌ | ❌ | **WORST** — `crawlResultsWrap.style.display='none'` hides the whole "Pages scraped so far" section |
| launch-to-doc assignment picker | `popup.js:3996-3999` | `/api/assignments` returns `[]` | ❌ | ❌ | **WORST** — disabled `<option>No assignments found</option>` = dead end |
| launch-to-doc picker catch | `popup.js:4021-4023` | fetch throws | ❌ | ❌ | **BUG** — `ltdAssignmentSelect.textContent = ...` replaces `<option>`s of a `<select>` with a text node → renders as a broken/empty control |
| agent_mode action log | `agent_mode.js:160-164` | `state.logs.length === 0` | ✅ ("agent writes its steps here") | ❌ | acceptable |
| agent_mode tab pick | `agent_mode.js:565` | no tabs to capture | ✅ | ❌ | acceptable |

### 1c. Success / confirmation — silent-action audit

Confirmed-confirming actions (good): `DataLakeView.submit` sets `setOk('Thanks — your entry is in.')` (`DataLakeView.jsx:104`); extension `saveSettings` reports `✅ Connected` (`popup.js:1582`); `btnNewChat` reports `✨ Switched to new conversation` (`popup.js:2057`); `btnHumanizeLtd` has a busy state (`popup.js:3838-3857`).

**Silent / unguarded actions (the duplicate-submission bug):**

| action | file:line | feedback today | risk |
|---|---|---|---|
| Data Lake **delete** entry | `DataLakeView.jsx:117-128` | **none** — `remove()` never calls `setOk`, only `fetchHistory()` | destructive delete with zero confirmation |
| extension **approval buttons** (Approve/Reject/Neutral/Auto) | `popup.js:1108-1118` → `answerFromButton` → `answerApproval` (`:981`) | status line only; **button itself never disables** | double-click dispatches the consent decision twice (allow/deny) |
| extension **send chat** (`btnPopupChatSend`) | `popup.js` (submit handler) | unguarded, no busy state | duplicate send on double-click/Enter |
| extension `btnOpenChat`, `btnRefreshChat` | `popup.js:1679`, `:3465` | unguarded | repeated fetch, no state change |
| extension `btnNewChat` | `popup.js:2032-2065` | status text, **no button disable** | double-click → two `POST /api/agent/threads` |
| extension `saveSettings` | `popup.js:1538` | status text, **no button disable** | double-click (idempotent but janky) |

`withBusy` is wired to only **5** of **54** click handlers: `btnScrapeCurrent` (`:1340`), `btnStartCrawl` (`:1471`), `btnRefreshAssignments` (`:4077`), `btnRefreshDocTabs` (`:4078`), `btnStartLaunchToDoc` (`:4081`). The consent-critical approval set is the glaring omission — that is the owner's "buttons that never changed state" report.

### 1d. Cannot distinguish "empty because new" vs "empty because fetch failed"

- `ThreadsRail` (`filteredThreads.length === 0`) — one branch serves both "no threads yet" and "search matched nothing".
- `AssignmentHistoryView` (`filteredList.length === 0`) — "No assignment records found" + Create CTA shows even when a **filter** is active and simply matched nothing.
- extension threads drawer — `fetchChatThreads` swallows `!res.ok` and network errors identically (`popup.js:1958`, `:1968`), so a failed fetch renders the hardcoded "Current conversation" div exactly like a genuinely empty account.
- extension crawl results — "crawl returned 0 pages" and "crawl never started" both render as a hidden section (`popup.js:1375-1378`).
- `ControlCenterView` — no distinction between "directory is empty" and "filter matched nothing".

---

## 2. The gap (ranked by real, reachable-now impact)

1. **Extension approval buttons unguarded** — a double-click re-dispatches allow/deny consent. Critical.
2. **Extension threads drawer hardcoded "Current conversation"** — blank/lying empty state, owner-flagged.
3. **Extension crawl results hide the whole section on zero** — indistinguishable from "never started"; a user crawls a site, sees nothing, thinks it broke.
4. **Extension launch-to-doc picker dead-end + broken `<select>` catch** — "No assignments found" option with no next step; the catch path corrupts the control.
5. **DataLakeView delete is silent** — destructive action, no confirmation.
6. **Three web surfaces with bare `No …` text and no CTA** — `DataLakeView`, `ThreadsRail`, `ControlCenterView`.
7. **Filter-empty vs new-empty collapse** — `ThreadsRail`, `AssignmentHistoryView`, `ControlCenterView`.
8. **Missing celebration** — no full-page celebration for onboarding-complete or inbox-zero (IntelligenceView "All recommendations cleared" is the only calm empty, and it has no streak/visual).

---

## 3. The plan — exact fixes (quote the JSX you are replacing)

### FIX 1 — DataLakeView: give the empty list a why + CTA
`web/src/components/DataLakeView.jsx:250-253`
Replace:
```jsx
) : history.length === 0 ? (
  <p className="font-body-sm text-xs text-on-surface-variant">
    Nothing submitted yet.
  </p>
```
With (import `EmptyState` from `./ui/EmptyState.jsx` if not already imported):
```jsx
) : history.length === 0 ? (
  <div className="rounded-2xl bg-surface-container-low/40 border border-dashed border-outline-variant/30 p-8 text-center space-y-2">
    <Database className="w-8 h-8 text-primary mx-auto" />
    <h4 className="font-title-md text-sm font-semibold text-on-surface">
      Nothing in the lake yet
    </h4>
    <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mx-auto">
      Drop in research notes, findings, or scored material — each entry earns micro-credits you can spend on agent work.
    </p>
    <button type="button" onClick={() => contentRef?.current?.focus()} className="h-10 px-5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase cursor-pointer">
      Write your first entry
    </button>
  </div>
```
CTA button: **"Write your first entry"** → focuses the compose textarea (add a `contentRef` via `useRef` on the existing `content` textarea, `DataLakeView.jsx:177`).

### FIX 2 — ThreadsRail: why + CTA, and split filter-empty from new-empty
`web/src/components/ThreadsRail.jsx:181-184`
Replace:
```jsx
{filteredThreads.length === 0 ? (
  <div className="p-unit-4 text-center rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-outline font-body-sm">
    No chats yet
  </div>
) : (
```
With:
```jsx
{filteredThreads.length === 0 ? (
  filterText ? (
    <div className="p-unit-4 text-center rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-outline font-body-sm">
      No chats match “{filterText}”.
      <button type="button" onClick={() => setFilterText('')} className="block mx-auto mt-2 text-primary hover:underline cursor-pointer">Clear search</button>
    </div>
  ) : (
    <div className="p-unit-4 text-center rounded-xl bg-surface-container-low/40 border border-outline-variant/15 space-y-2">
      <p className="font-body-sm text-on-surface-variant">No conversations yet — start one and it will live here.</p>
      <button type="button" onClick={onNewThread} className="h-9 px-4 rounded-lg bg-primary text-on-primary font-label-caps text-xs uppercase cursor-pointer">Start a conversation</button>
    </div>
  )
) : (
```
CTA: **"Start a conversation"** → call `onNewThread` (existing prop already used by the new-thread control; verify its exact name in the parent — UNVERIFIED name, wire to the same handler the "+" button uses). **"Clear search"** → `setFilterText('')`.

### FIX 3 — ControlCenterView: why + CTA, split filter-empty
`web/src/components/ControlCenterView.jsx:365-368`
Replace:
```jsx
) : filteredUsers.length === 0 ? (
  <div className="p-12 text-center text-xs font-code-sm text-on-surface-variant">
    No matching identities found.
  </div>
```
With:
```jsx
) : filteredUsers.length === 0 ? (
  <div className="p-12 text-center space-y-2">
    <p className="text-xs font-code-sm text-on-surface-variant">
      No identities match your search.
    </p>
    <button type="button" onClick={() => { /* reset the directory search/filter to '' */ setUserQuery(''); }} className="text-xs text-primary hover:underline cursor-pointer">
      Clear search
    </button>
  </div>
```
Note: the search state variable name is UNVERIFIED — read the directory filter input in `ControlCenterView.jsx` (near the search box) and reset that exact setter.

### FIX 4 — AssignmentCardDashboard sub-columns: why, no heavy CTA (they are inside a populated grid)
`web/src/components/AssignmentCardDashboard.jsx:743-748`
Replace:
```jsx
{inProgressCards.length === 0 ? (
  <div className="bg-surface-container-low/40 rounded-2xl p-6 border border-dashed border-outline-variant/30 text-center">
    <p className="font-body-sm text-body-sm text-on-surface-variant">
      No active assignments currently in progress.
    </p>
  </div>
```
With:
```jsx
{inProgressCards.length === 0 ? (
  <div className="bg-surface-container-low/40 rounded-2xl p-6 border border-dashed border-outline-variant/30 text-center">
    <p className="font-body-sm text-body-sm text-on-surface-variant">
      Nothing in progress right now — kick off an agent thread and it will appear here.
    </p>
  </div>
```
`AssignmentCardDashboard.jsx:778-782` — replace `No actions awaiting approval.` with:
```jsx
<p className="font-body-sm text-body-sm text-on-surface-variant">
  Nothing needs your approval — you are all caught up.
</p>
```

### FIX 5 — Extension threads drawer: real empty state + distinguish fetch failure
`extension/popup.js:1973-1979`
Replace:
```js
function renderThreadsDrawer() {
  if (!threadsListEl) return;
  threadsListEl.innerHTML = '';
  if (chatThreadsList.length === 0) {
    threadsListEl.innerHTML = '<div class="thread-item active">Current conversation</div>';
    return;
  }
```
With:
```js
function renderThreadsDrawer() {
  if (!threadsListEl) return;
  threadsListEl.innerHTML = '';
  if (chatThreadsList.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'thread-empty';
    empty.textContent = threadsLoadFailed
      ? 'Could not load past conversations — check your connection and reopen this drawer.'
      : 'No saved conversations yet — start a new chat and it will appear here.';
    threadsListEl.appendChild(empty);
    return;
  }
```
Add a module-level flag `let threadsLoadFailed = false;` near `let chatThreadsList = []` (`popup.js:1926`), set it in `fetchChatThreads`:
```js
  try {
    const res = await fetch(`${srv}/api/agent/threads`, { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    chatThreadsList = data.threads || [];
    threadsLoadFailed = false;
    renderThreadsDrawer();
    ...
  } catch (e) {
    threadsLoadFailed = true;
    renderThreadsDrawer();
  }
```
Remove the hardcoded default `<div class="thread-item active">Current conversation</div>` from `extension/popup.html:503` (it is JS-replaced on load anyway, but its presence is the "lying" default). Also add a matching `.thread-empty` style to `popup.css` (padding + muted color).

### FIX 6 — Extension crawl results: never hide the section; say why it is empty
`extension/popup.js:1371-1378`
Replace:
```js
function renderCrawlResults(results) {
  if (!crawlResultsEl) return;
  crawlResultsEl.innerHTML = '';
  const list = Array.isArray(results) ? results : [];
  if (list.length === 0) {
    crawlResultsWrap.style.display = 'none';
    return;
  }
  crawlResultsWrap.style.display = 'flex';
```
With:
```js
function renderCrawlResults(results) {
  if (!crawlResultsEl) return;
  crawlResultsEl.innerHTML = '';
  const list = Array.isArray(results) ? results : [];
  crawlResultsWrap.style.display = 'flex';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'crawl-result-empty';
    empty.textContent = 'No pages were saved — none of the crawled pages yielded extractable text. Try a different site, or scrape this single page instead.';
    crawlResultsEl.appendChild(empty);
    return;
  }
```
Add `.crawl-result-empty` to `popup.css` (muted italic, small padding).

### FIX 7 — Extension launch-to-doc picker: no dead-end option + fix the broken catch
`extension/popup.js:3996-4023`
Replace the empty branch and the catch:
```js
    if (list.length === 0) {
      if (!launched) ltdAssignmentSelect.innerHTML = '<option value="">No assignments found</option>';
      return;
    }
```
With (render a hint line next to the select instead of a dead option):
```js
    if (list.length === 0) {
      if (!launched) {
        ltdAssignmentSelect.innerHTML = '<option value="">— no assignments yet —</option>';
        setStatus('No assignments to type into yet — create one in Helpotron first (Helpotron → Assignments → Create).');
      }
      return;
    }
```
And the catch:
```js
  } catch (e) {
    ltdAssignmentSelect.textContent = `Could not load (${String(e).slice(0, 30)})`;
  }
```
Replace with (do not corrupt the `<select>` with a text node):
```js
  } catch (e) {
    ltdAssignmentSelect.innerHTML = '<option value="">Could not load assignments — check your connection and refresh.</option>';
    setStatus(`⚠️ Could not load assignments (${humanErrorText(e)}).`);
  }
```

### FIX 8 — AssignmentHistoryView: split filter-empty
`web/src/components/AssignmentHistoryView.jsx:449-466` — the empty branch uses `filteredList.length === 0`. When the filter input (`AssignmentHistoryView.jsx:392`, "Filter title or instructor…") is non-empty, show a different copy + CTA:
```jsx
) : filteredList.length === 0 ? (
  filterText ? (
    <div className="p-12 rounded-3xl ... text-center space-y-3">
      <Search className="w-8 h-8 text-on-surface-variant mx-auto" />
      <p className="font-body-sm text-xs text-on-surface-variant">No records match “{filterText}”.</p>
      <button type="button" onClick={() => setFilterText('')} className="text-primary hover:underline cursor-pointer">Clear filter</button>
    </div>
  ) : (
    /* existing "No assignment records found" + Create New Assignment block */
  )
```
Verify the filter state var name (`filterText`/`filter` — UNVERIFIED) in `AssignmentHistoryView.jsx`.

### FIX 9 — Success: DataLakeView delete confirmation
`web/src/components/DataLakeView.jsx:117-128` — add `setOk('Entry deleted.')` after `await api.deleteDataLakeEntry(id);`:
```js
      await api.deleteDataLakeEntry(id);
      setOk('Entry deleted.');
      await fetchHistory();
```

### FIX 10 — Extension: guard the approval buttons (the critical one)
`extension/popup.js:1108-1118` — wrap the dispatch so a second click while one is in flight is ignored:
```js
for (const [id, decision, opts] of approvalButtons) {
  const el = document.getElementById(id);
  if (!el) continue;
  el.addEventListener('click', () => {
    if (el.disabled) return;
    el.disabled = true;
    answerFromButton(decision, opts);
    // re-enable after the queue advances; answerFromButton calls renderNextApproval()
    setTimeout(() => { el.disabled = false; }, 250);
  });
}
```
(Alternatively use the existing `withBusy(el, 'Sending…', ...)` helper.) This closes the "buttons that never changed state" report where it matters most — consent decisions.

### FIX 11 — Extension: busy-state the remaining chat/settings buttons
Apply `withBusy` to `btnPopupChatSend` (send), `btnOpenChat` (`popup.js:1679`), `btnRefreshChat` (`popup.js:3465`), `btnNewChat` (`popup.js:2032`), `saveSettings` (`popup.js:1538`) — same pattern already used for the five scrapers. This prevents duplicate send/create submissions.

### FIX 12 — Celebration (milestone) — one targeted add, not a sweep
Add a full-page celebration when onboarding completes and when the Data Lake earns the first micro-credit / Inbox reaches zero. Lowest-priority: pick ONE surface first (recommend inbox-zero in `NotificationsView.jsx:214`) — swap the `EmptyState` for a brief confetti/streak variant with copy "Inbox zero — you are all caught up." Do **not** add a modal for routine saves.

---

## 4. Execution plan — independent batches

**Batch A (web empty states, one file each — no conflicts):**
1. `DataLakeView.jsx` — FIX 1 (empty list why+CTA) + FIX 9 (delete `setOk`).
2. `ThreadsRail.jsx` — FIX 2 (empty + filter split).
3. `ControlCenterView.jsx` — FIX 3.
4. `AssignmentCardDashboard.jsx` — FIX 4 (two sub-column copy strings).
5. `AssignmentHistoryView.jsx` — FIX 8 (filter split).

**Batch B (extension empty states — popup.js is shared, so serialize these edits but they are independent regions):**
6. `popup.js` FIX 5 (threads drawer) + remove `popup.html:503` hardcoded div + add `.thread-empty` CSS.
7. `popup.js` FIX 6 (crawl results never hide) + `.crawl-result-empty` CSS.
8. `popup.js` FIX 7 (launch-to-doc picker empty + catch).

**Batch C (extension success/guards — same file, independent handlers):**
9. FIX 10 (approval guard).
10. FIX 11 (busy-state the chat/settings buttons).

**Batch D (celebration — deferred, single surface):**
11. FIX 12 (inbox-zero celebration in `NotificationsView.jsx`).

Each batch touches disjoint file regions, so batches A and C can each be one pass; B edits the same file across three distinct functions (threads ~1973, crawl ~1371, picker ~3938) — no line overlap.

---

## 5. RISKS / DO NOT DO

- **Do NOT add a modal/toast for every save.** The rules explicitly call an intrusive popup per save "wrong". Prefer natural state transitions (item slides into the list and persists). Only delete + consent + send get explicit confirmation/guards.
- **Do NOT touch `~/.claude/**`** (standing owner rule), and do not restart `helpotron-api.service` to "verify" — the app is deliberately DOWN behind `helpotron-maintenance.service`. Verification is `./.venv/bin/python -c "import sys;sys.path.insert(0,'.');import server.main"` and `npm`/vite build only.
- **Do NOT remove the `EmptyState` component or change its API** — `NotificationsView` and `ActivityView` import it; only ADD usages.
- **Do NOT rename props on `ThreadsRail` blindly** — `onNewThread` name is UNVERIFIED; read the parent to wire FIX 2's CTA to the actual handler.
- **Do NOT corrupt the `<select>` in FIX 7** by setting `textContent` — that is the existing bug being fixed; use `innerHTML` with a real `<option>`.
- **Do NOT make the crawl section always-visible when it was never started** — FIX 6 must keep the section hidden until a crawl is actually initiated (gate on crawl having been started, not on `list.length`), or you introduce a permanent empty box on first open. Flag: verify the "crawl started" signal (`crawlProgressEl` phase) before unconditionally showing the wrap.
- **Neutral approval still requires a note** (`popup.js:1089-1104`) — FIX 10 must not bypass that gate; only add the disabled re-entrancy guard around `answerFromButton`.
- **The 7 accounts named `Atlas` are user data** — leave them; this audit is UI-only.
- **Filters vs fetch-failure distinction**: FIX 2/5/8 depend on reading the correct filter/search state var in each component. If a var name is wrong the fix silently no-ops — verify each setter against the component's actual `useState` declaration before editing.

---

## 6. UNVERIFIED items

- Exact search/filter state variable names in `ControlCenterView.jsx` (FIX 3), `AssignmentHistoryView.jsx` (FIX 8), and the new-thread handler prop name on `ThreadsRail.jsx` (FIX 2) — read the components before editing.
- Whether `DataLakeView.jsx` already imports `EmptyState` / has a `Database` icon import — the proposed FIX 1 uses inline JSX (no new import strictly required, `Database` is already used at `DataLakeView.jsx:143`).
- The exact "crawl started" phase value to gate FIX 6's always-visible section (`popup.js:1422` phase enum: `idle/queued/running/stopping/done/stopped/failed`).
