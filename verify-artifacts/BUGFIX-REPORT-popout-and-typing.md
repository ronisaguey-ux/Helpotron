# Helpotron — BUG 1 (Keep open) & BUG 2 (typing closes the extension)

Root-cause report, fixes, and reproduction evidence.
Date: 2026-09-07. Repo: `/home/roni/Roni_workspace/helpotron`.

You were right that the green harness was not proof. It was not. The harness
could not observe either failure, for reasons given in §5.

---

## 0. BUG 0 — the reason none of the fixes ever reached you

Found first, because it gates everything else.

`scripts/package_extension.sh:23` derives its output directory from the manifest
version:

```bash
TEST_DIR="$REPO/helpotron-extension-v$VERSION-test"
```

Commit `9ccadaf` set `extension/manifest.json:4` back from `2.7.0` to `2.6.1`.
From that commit on, every build landed in `helpotron-extension-v2.6.1-test/`
while Chrome's "Load unpacked" kept pointing at the frozen
`helpotron-extension-v2.7.0-test/`. Fixes were real and were being written to a
directory the browser never read.

Direct measurement of the build you were loading:

```
has_sidePanel_api: "undefined"     ← stale v2.7.0-test build
has_sidePanel_api: "function"      ← current build
```

**Fix:** `extension/manifest.json:4` restored to `2.7.0`, plus a loud stale-dir
warning in `scripts/package_extension.sh:79-102` that names every sibling
`helpotron-extension-v*-test` directory it did not just build. It fired on the
first run and named `/home/roni/Roni_workspace/helpotron/helpotron-extension-v2.6.1-test`.

---

## 1. BUG 2 — "when it attempted to type something, all it did was close the extension"

### Root cause

`extension/popup.js`, in `executeReturnedActions()`, ran this **before**
`chrome.debugger.attach`:

```js
await chrome.tabs.update(driveTab.id, { active: true });
await chrome.windows.update(driveTab.windowId, { focused: true });
```

A browser-action popup document is destroyed the instant focus leaves it. Those
two calls move focus to another tab/window, so they destroy the very document
that is awaiting them. Execution never reaches the attach below; nothing is ever
typed; the UI vanishes. That is exactly the reported symptom — the extension
"closing" *is* the popup being torn down by its own focus switch.

The mechanism was isolated by three experiments, not inferred:

| Experiment | Result | Conclusion |
|---|---|---|
| `repro_attach.py` — attach with target tab already active (no focus change) | `popup_alive_after_attach: true`, `input_value: "ATTACH_OK"` | `chrome.debugger.attach` is **innocent** |
| `repro_bgtab.py` — drive a background tab, zero focus change | `popup_alive_after: true`, `input_value: "BG_OK"`, `tabs_before == tabs_after` | CDP input works fine on a **non-active** tab |
| `repro_bug2.py` — full path through the real action popup | `popup_alive_after_fire: false`, `input_value: ""` | the focus switch is the **sole** killer |

The second row is what made the fix small: because driving a background tab
works, the popup never needed to hand off to the service worker. `background.js:705-710`
independently confirms no service-worker driver exists — an earlier
`chrome.debugger` path there was deliberately removed for leaking attachments.
So a feared ~180-line port became a ~15-line guard.

### Fix — `extension/popup.js`

Gate the focus switch on whether the current surface can survive it:

```js
const needsFocusSwitch = !driveTab.active || (activeTab && activeTab.id !== driveTab.id);
const drivingUnseen = Boolean(needsFocusSwitch) && !isPersistentSurface;
if (needsFocusSwitch && isPersistentSurface) {
  await chrome.tabs.update(driveTab.id, { active: true }).catch(() => {});
}
if (isPersistentSurface && activeTab && driveTab.windowId !== activeTab.windowId) {
  await chrome.windows.update(driveTab.windowId, { focused: true }).catch(() => {});
}
```

A popped-out window or side panel keeps its document across focus changes, so it
still switches to the tab and you watch it happen. The ephemeral action popup
drives the tab **in place** and labels it, e.g.
`Driving (background tab): …`, with a status line pointing at ⧉ Keep open.

---

## 2. BUG 1 — "when I click outside it still closes"

### Root cause

Two parts.

1. **Primarily BUG 0.** Commit `9ccadaf` had already added the side-panel path,
   but the version revert meant your loaded build predated it. That build
   reports `has_sidePanel_api: "undefined"` — it had no persistent surface to
   open, so the popup just closed on blur.

2. **A latent gesture bug in the new path.** `chrome.sidePanel.open()` is
   user-gesture-gated, and the handler spent the gesture on
   `await chrome.tabs.query(...)` before calling it. Any slow query loses the
   gesture and `open()` rejects.

### Fix — `extension/popup.js`

The window id is resolved at load time so the click handler can call `open()`
with **no await in front of it**:

```js
if (chrome.sidePanel && chrome.sidePanel.open && currentWindowId != null) {
  try {
    await chrome.sidePanel.open({ windowId: currentWindowId });
    window.close();
    return;
  } catch { /* fall through to a real popup window */ }
}
```

`extension/background.js` stamps the panel path so the document can identify its
own surface — the side panel and the action popup both load `popup.html` and are
otherwise indistinguishable from inside:

```js
chrome.sidePanel.setOptions({ path: 'popup.html?mode=panel', enabled: true })
```

`popup.js` reads that into `isPanelMode` → `isPersistentSurface`, which is the
same flag BUG 2's guard keys off. The two fixes share one concept: *does this
surface survive losing focus?*

---

## 3. Diff summary

```
 extension/background.js      | 12 +++++++++    ?mode=panel stamp (surface self-ID)
 extension/manifest.json      |  2 +-           2.6.1 -> 2.7.0  (BUG 0)
 extension/popup.js           | 59 ++++++++---  surface detection, gesture-safe
                                                sidePanel.open, gated focus switch
 scripts/package_extension.sh | 25 +++++++++    stale build-dir warning
 scripts/verify_extension.py  |  (untracked)    type coverage + documented blind spot
```

`scripts/verify_extension.py` does not appear in `git diff` because
`.gitignore:9` (`verify_*.py`) excludes it. An unreviewed harness is part of why
its gaps went unnoticed; you may want that ignore rule narrowed.

Nothing under `server/` was touched. `server/llm.py` routing is untouched; no
LLM fallbacks were added. `.env` untouched, `:8000` not restarted, nothing pushed.

---

## 4. Re-run proof (real unpacked build, `helpotron-extension-v2.7.0-test`)

All runs drive the actual unpacked build in a real Chrome for Testing via
`chrome.action.openPopup()` — the genuine action popup, not `popup.html` in a tab.

### BUG 2 — before vs after

```
BEFORE                              AFTER (3 runs)
popup_alive_after_fire: false       popup_alive_after_fire: true
input_value: ""                     input_value: "HELLO_FROM_AGENT"
(active tab switched)               tabs_after == tabs_before
                                    TYPED_OK: true
```

Per-event provenance from the target page confirms exactly one insertion and no
stray keystrokes:

```json
"beforeinput_events": ["insertText|\"HELLO_FROM_AGENT\""],
"keydown_events": []
```

The active tab stayed on the undrivable `chrome-extension://…` page and the http
target stayed `active: false` throughout — the popup survived, and the text
landed in a background tab.

### BUG 1 — fixed build

```json
"has_sidePanel_api": "function",
"side_panel_open": true,
"contexts_after": ["SIDE_PANEL:popup.html", …],
"PERSISTENT_SURFACE_OK": true
```

`chrome.runtime.getContexts()` is the only exact discriminator between a
`SIDE_PANEL` and a `POPUP` document; an earlier version of this probe checked
only for new windows and wrongly reported the fixed build as broken.

---

## 5. Harness gaps (why it was green while you were broken)

1. **`popup_ready()` loaded `popup.html` as an ordinary tab.** A tab survives
   focus changes; a real action popup does not. The entire BUG 2 mechanism was
   structurally unobservable, so `check_drive` passed. Now documented in a
   blind-spot comment at the function, pointing to the out-of-band repro.
2. **`DRIVE_ACTION` was click-only** (`[{op:'click', x:100, y:70}]`). The type
   path — the one that was broken — was never executed. Now:
   `click button → click input → type`, with a `drive.type-landed` assertion
   reported by the target page over same-origin fetch (never a second CDP
   session on a tab `chrome.debugger` already owns).

---

## 6. Not proven — stated plainly

- **A one-off leading space.** One run produced `" HELLO_FROM_AGENT"` instead of
  `"HELLO_FROM_AGENT"`. It did **not** reproduce across three subsequent runs,
  and the per-event log shows a single exact `insertText` with zero keydowns.
  The type path is a bare `Input.insertText` with `String(op.text)` — nothing in
  it can prepend whitespace. I could not determine the origin and am not going to
  claim it is fixed. If you ever see a stray leading space in typed text, that
  is this, and `beforeinput_events` will identify the culprit.
- **One rig-level flake.** One of four runs failed at
  `chrome.action.openPopup()` with *"Could not find an active browser window"* —
  a startup race from positioning the test window off-screen. It tested nothing;
  it is not a product failure, but it means the harness needs a focus wait.
- **Real action popup still not covered inside `verify_extension.py`.** The
  blind spot is documented, not closed. Closing it means opening the genuine
  popup from the service worker inside the harness.
- **Side panel is the persistent surface, not a separate window.** ⧉ Keep open
  opens the side panel when available and only falls back to
  `chrome.windows.create`. Verified working; if you specifically want a detached
  window every time, that is a product decision, not a bug.
- **Untested by me:** the popped-out-window fallback on a build where
  `chrome.sidePanel` is missing, and `agent_mode.js`. `agent_mode.js` was audited
  (`chrome.debugger.attach` at line 618, no preceding `tabs.update` /
  `windows.update`) so it never had BUG 2, but I did not drive it end to end.

---

## 7. BUG 2, second half — Chrome stalls mouse input on a background tab for 5s

Fixing the popup self-destruct (§1) made the background drive *start*. It still
did not *finish*: probe case B timed out at 60s with `clicks=0 typed=''`, while
the per-command log showed `Input.dispatchMouseEvent` taking **5.002s** and
`Runtime.evaluate` on the same tab taking **1ms**.

Measured directly (`Input.dispatchMouseEvent` ×3, then one `Runtime.evaluate`
and one `Input.insertText`, on a visible tab / a hidden tab / the same hidden tab
after activating it), headless and headful, same result:

```
headful  visible  : mouseMs [7, 5, 17]           evalMs 2  insMs 2  active true
headful  hidden   : mouseMs [5005, 5004, 5003]   evalMs 1  insMs 1  active false
headful  promoted : mouseMs [1, 13, 17]          evalMs 1  insMs 1  active true
```

This is Chrome's renderer input-ack timeout, not an extension bug: a hidden
renderer never acks the event, so CDP waits out a fixed 5s. It only became fatal
because `glideMouseTo()` walks a human-looking path of 30–95 points and each
point is one `Input.dispatchMouseEvent`. On an unseen tab that is
**2.5–8 minutes per click** — indistinguishable from "nothing happens".

### Fix — `extension/popup.js`

A module-level `driveIsUnseen`, set per burst from the existing `drivingUnseen`
value in `executeReturnedActions()`, and an early return in `glideMouseTo()`:
when nobody can see the pointer, dispatch one `mouseMoved` straight to the
target instead of 30–95. The glide is preserved unchanged whenever the user can
actually watch it. A click on an unseen tab now costs 3 dispatches, not 32–97.

Case B went from a 60s timeout to a 10.8s pass.

---

## 8. Verification mandate — both driving cases, both surfaces

`scripts/probe_drive_surfaces.py` (`--cases ABC`, real unpacked
`helpotron-extension-v2.7.0-test`, genuine action popup via
`chrome.action.openPopup()`, surfaces discriminated by
`chrome.runtime.getContexts()`): **23 PASS / 2 NOTE / 0 FAIL** —
`verify-artifacts/probe3-results.json`.

**(a) Drive the ACTIVE tab from the action popup — 2.0s.**
`A.no-focus-switch` active tab unchanged `931243755 → 931243755`;
`A.popup-survived` POPUP context still present after the drive;
`A.input-landed` `clicks=1 typed='V270_TYPE_OK'`;
`A.event-provenance` `['beforeinput|insertText|"V270_TYPE_OK"']`.
No focus change was needed and none happened. Input landed on the visible page.

**(b) Drive a BACKGROUND tab while the surface is the ephemeral action popup —
10.8s.** Active tab is a deliberately undrivable `chrome://newtab/`.
`B.popup-survived` true, `B.no-focus-steal` `931243758 → 931243758`,
`B.input-landed` `clicks=1 typed='V270_TYPE_OK'`, same clean provenance.
The popup does not close and the text lands.

**(c) "Watch it happen" on the persistent surface — 2.0s.** Driven through the
real product path: open the action popup, click `#btnPopOut` inside it with a
genuine user gesture. `C.keep-open-click` `'clicked'`;
`C.side-panel-open` `SIDE_PANEL:popup.html?mode=panel` present;
`C.ephemeral-popup-closed` the action popup handed off to the panel;
`C.panel-survived` the panel is still there after the drive;
`C.watch-it-happen` **the panel switched the active tab to the driven page**
(`931243762 → 931243761`); `C.input-landed` `clicks=1 typed='V270_TYPE_OK'`.

The gesture matters: `chrome.sidePanel.open()` cannot be satisfied by a
`Runtime.evaluate {userGesture:true}` issued in the **service worker** — it
rejects with *"may only be called in response to a user gesture"*. The gesture
has to originate in the surface document. That is why §2's fix keeps
`sidePanel.open()` first with no `await` in front of it, and why the probe
clicks the real button rather than calling the API.

The two NOTEs are both `*.burst-state`: the probe sampled the in-page burst
result after the surface had already settled, so `res`/`ms` read back `null`.
The drive itself passed in both cases.

---

## 9. Debugger permission — decision

**Kept REQUIRED. `optional_permissions: ["debugger"]` was not restored.**

- There is no `chrome.permissions.request` call anywhere in the extension, so
  there is no runtime grant path left to fall back on — making it optional would
  ship a build whose Execute path can never obtain `debugger`.
- `origin/main` already ships 2.7.0 with `debugger` required.
- `extension/CWS_APPROVAL_REVIEW.md:143` records this as an owner directive:
  *"REOPENED AND RE-DECIDED 2026-09-06 (owner directive): REQUIRED, no runtime
  prompt."*

Flagged for the owner: required `debugger` is a heavier CWS review posture than
the live 2.6.0 zip's optional one. Reverting it is a product decision and needs
the `ensureDebugger()` runtime-request flow rebuilt first.

---

## 10. Harness gaps — closed and still open

Closed in `scripts/verify_extension.py` (this bundle):

- The version invariant was hardcoded `ver == "2.6.1"`. It now compares the
  **loaded build** against `extension/manifest.json`. A hardcoded string both
  goes stale every release and is blind to BUG 0 by construction — that is the
  exact drift it failed to catch.
- Launch flags now include `--disable-background-timer-throttling`,
  `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`.
  Without them the background-tab checks measure Chrome's hidden-page timer
  clamp, not the extension.
- `check_keepopen()` demanded a `?mode=window` window and failed when the fix
  correctly took the side panel. It now accepts either persistent surface and
  branches on which one landed.

Still open, deliberately:

- `popup_ready()` still loads `popup.html` as a **tab**. A tab survives focus
  loss; the real action popup does not — which is the entire mechanism of BUG 2.
  Rewriting it is more than a 30-line change. `scripts/probe_drive_surfaces.py`
  covers the genuine action popup instead, and is the file to run when touching
  the drive or keep-open paths.
