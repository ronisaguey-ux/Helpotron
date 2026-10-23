# 06 — findings.json citation integrity audit

**Auditor:** static-analysis agent (no browser, no edits, no commits)
**Date:** 2026-10-22
**Target:** `/home/roni/Roni_workspace/helpotron/reports/ui-audit/findings.json`
**Code state:** repo `main`, working tree **clean**, HEAD = `3c2870b`
**Status: STOPPED EARLY by coordinator.** Sections 1–2 are substantially complete; section 3 lists what was not reached.

---

## 0. JSON validity + finding count

| Check | Result |
|---|---|
| `json.load()` | **VALID** — parses clean, no hand-edit corruption |
| Top-level keys | `meta`, `baseline_metrics`, `findings`, `still_to_verify`, `summary` |
| `len(findings)` | **31** |
| Duplicate ids | none (30 × `F-nn` + `S-01`) |
| `summary.by_state` vs recomputed | **matches** — `{fixed:13, open:14, positive:2, stale:2}` |
| `summary.by_severity` vs recomputed | **matches** — `{critical:3, high:8, medium:13, info:4, low:3}` |
| `summary.open_by_severity` vs recomputed | **matches** — `{high:3, medium:9, low:2}` |
| `summary.open_ids` / `fixed_ids` / `stale_ids` / `positive_ids` vs per-finding `state` | **all match exactly** |

`findings.json` is internally consistent. **The HANDOFF is the stale document, not findings.json.**

> `docs/HANDOFF.md:254` states `by_state` reads `{fixed: 6, open: 21, positive: 2, stale: 2}` and §6 says "**31 findings**". The file now says `{fixed: 13, open: 14, ...}`. Commit `6e597e2 docs(audit): update findings with Phase A resolutions (13 fixed)` explains the delta. **HANDOFF.md §6 and §4 ("24 commits … to 521e2d9") need updating** — HEAD is 17 commits past `521e2d9`.
>
> Consequence for the task brief: the brief named **six** FIXED findings; the file now marks **thirteen**. The seven additional ones (F-02, F-03, F-05, F-10, F-14, F-16, F-29) were not in the brief's verification list.

**Citation inventory:** 40 `path/file.ext`-shaped tokens across all fields, **31 carrying a line number**.

---

## 1. Citation-by-citation verification

Legend: **OK** = file+line exist and the code there supports the claim · **DRIFT** = right file, wrong line · **STALE-CONTENT** = line resolves but the code no longer says what the finding claims (usually because it was fixed) · **FILE-OK/NO-LINE** = file-level citation only, no line to verify.

Every cited file **exists**. **No citation points at a deleted file.**

### 1a. Citations that resolve correctly (no correction needed)

| Finding | Citation | Verdict |
|---|---|---|
| F-01 | `server/security.py:538-547` | **OK** — CSP string literal block; claim about which directives were present is consistent with the surrounding in-code comment |
| F-01 | `server/security.py:526` (docstring) | **OK** — docstring line, now updated to name `frame-src` + `worker-src` |
| F-15 | `web/src/main.jsx:4-6` | **OK** — exactly the three `@fontsource-variable/{inter,hanken-grotesk,jetbrains-mono}` imports |
| F-04 | `AnonymousLanding.jsx:508` (nav) | **OK** — `px-container-padding` present |
| F-04 | `AnonymousLanding.jsx:573` (hero) | **OK** — `px-container-padding` present |
| F-04 | `AnonymousLanding.jsx:667` (footer) | **OK** — `px-container-padding` present |
| F-04 | `AnonymousLanding.jsx:295` (fix pattern) | **OK** — `px-4 sm:px-6` on `#pricing`, exactly as described |
| F-08 | `AnonymousLanding.jsx:624` (`#features`) | **OK** — `<section id="features">` |
| F-08 | `AnonymousLanding.jsx:295` (`#pricing`) | **OK** — `<section id="pricing">` |
| F-03 | `web/src/api.js:44` | **OK** — `export function hasSessionIndicator()` |
| F-03 | `web/src/App.jsx:288-301` (health probe) | **OK** — the `/api/health` + `setInterval(probe, 30000)` effect |
| F-18/F-19 | `web/src/App.jsx:81-87` | **OK** — `ViewSuspenseFallback()` returning the centred `Loading…` string, verbatim |
| F-19 | `web/src/App.jsx:173` | **OK** — `function SessionBootScreen()` |
| F-13 | `web/src/App.jsx:206` | **OK** — `useState(() => (hasSessionIndicator() ? 'checking' : 'signedOut'))`, synchronous as claimed |
| F-22 | `server/main.py:1379` | **OK** — `plan="none",` in the signup `User(...)` constructor |
| F-17 | `ReferralSection.jsx:115` | **OK** — `api.redeemReferralCode(...)` |
| F-11 | `web/src/App.jsx:25` | **OK** — `import { AnimatedLogo } from './components/ui/AnimatedLogo.jsx'` |
| F-07 | `AnonymousLanding.jsx:422-453` | **OK** — the `pushState` cluster in `navigatePath` |
| F-16 | `docs/design/DIRECTION.md` | **FILE-OK/NO-LINE** — file exists (230 lines) |
| F-02/F-08 | `docs/UI_UX_SWEEP.md` | **FILE-OK/NO-LINE** — file exists (134 lines) |
| F-15/F-04 | `web/src/index.css` | **FILE-OK/NO-LINE** |
| F-04 | `web/src/components/AnonymousLanding.jsx` | **FILE-OK/NO-LINE** |
| F-28 | `index.html` (honest_note) | **FILE-OK/NO-LINE** |
| F-07 | `AnonymousLanding.jsx` (cause) | **FILE-OK/NO-LINE** |
| F-21 | `web/src/App.jsx` (evidence) | **FILE-OK/NO-LINE** |

### 1b. DRIFT — right file, wrong line. Corrections to apply.

| Finding | Field | Claimed | Actual now | Corrected citation | Notes |
|---|---|---|---|---|---|
| **F-15** | `cause` | `App.jsx:709` — "`font-sans` on the root `.app-canvas` div" | `:709` is `window.addEventListener('hashchange', openFromHash)` | **`web/src/App.jsx:750`** | `<div className="app-canvas … font-sans antialiased …">` — drift +41 |
| **F-03** | `cause` | `App.jsx:408-484`; `catch(e){}` at `:428`,`:459`; terminal state at `:464` | `checkSession` now `:409-…`; catches at `:430`,`:461`; `// Unauthenticated state` at `:473` | **`web/src/App.jsx:409-492`; catches `:430`,`:461`; unauthenticated branch `:473`** | also now contains the fix (see §2) |
| **F-03** | `aggravating` | `App.jsx:858` — "the offline banner … renders inside AppShell" | `:858` is `<CommandPalette …>` | **`web/src/App.jsx:866`** (amber banner) / `OfflineBanner` imported `:26` | the AppShell gate is `authStatus === 'authed'` at `:853`'s subtree |
| **F-03/F-13** | `residual` | `App.jsx:439` — "the 1200ms retry" | `:439` is the tail of the explanatory comment | **`web/src/App.jsx:441`** — `await new Promise((r) => setTimeout(r, 1200))` | drift +2 |
| **F-18** | `observed_so_far[2]` | `App.jsx:777` — "reuses SessionBootScreen as the AppShell chunk fallback" | `:777` is `isMandatory={false}` on `<AuthModal>` | **`web/src/App.jsx:853`** — `<Suspense fallback={<SessionBootScreen />}>` | drift +76. **Claim itself still TRUE** |
| **F-19** | `cost` | `":777 reuses the session screen as the chunk fallback"` | same as above | **`web/src/App.jsx:853`** | |
| **F-26** | `detail` | `App.jsx:779` — `AdminNoticePopup` | `:779` is `onLoginSuccess={(u) => {` on `<AuthModal>` | **`web/src/App.jsx:855`** (render); lazy import `:54` | drift +76 |
| **F-30** | `cause` | `App.jsx:601` — "does not call `recordNav`" | `:601` is the closing `};` of `handleAcceptPrivacy` | **`web/src/App.jsx:610`** — `const recordNav = () => {` | drift +9 |
| **F-05** | `fix` | `App.jsx:628 handleSelectView` | `:628` is inside `goForward` | **`web/src/App.jsx:669`** — `const handleSelectView = (viewKey, tab = null) => {` | drift +41. **And the fix did not land there** — it landed as a `useEffect` at **`:654-665`** |
| **F-07** | `cause` | `App.jsx:628 handleSelectView` | as above | **`web/src/App.jsx:669`** | |
| **F-07** | `cause` | "replaceState (`:380`, `:385`, `:501`)" | `:381`, `:386`, `:510` | **`web/src/App.jsx:381`, `:386`, `:510`** | claim "the only history calls are replaceState" **verified TRUE** — zero `pushState` in App.jsx |
| **F-07** | `cost` | "its own back/forward stack (`:606-624`)" | `recordNav` `:610-613`, `goBack` `:615-623`, `goForward` `:625-633` | **`web/src/App.jsx:610-633`** | |
| **F-06** | `cause` | `App.jsx:313-341` VIEW_PATH_MAP; `PUBLIC_PATHS (:343)`; `setNotFoundPath at :358` | map is `:314-342`; `PUBLIC_PATHS` `:344`; `setNotFoundPath` `:359` | **`web/src/App.jsx:314-342`, `:344`, `:359`** | off-by-one throughout (cited lines are the preceding comments). **Claim verified TRUE**: no `/help` key, `/help` not in `PUBLIC_PATHS` |
| **F-08** | `cause` | `App.jsx:343` PUBLIC_PATHS; "returns early (`:352`)" | `:344`; early return `:353-355` | **`web/src/App.jsx:344`, `:353`** | **Claim verified TRUE** — `'/features'` and `'/pricing'` both in `PUBLIC_PATHS` |
| **F-21** | `evidence` | VIEW_PATH_MAP `(:331, :332)` → 'activity'/'automation' | `:331` is `'/extension'`, `:332` is `'/dump'` | **`web/src/App.jsx:318` (`/activity`), `:319` (`/automation`)** | **Worse than drift — the claim's substance is wrong too.** Both now map to **`['overview', null]`**, not to `'activity'`/`'automation'`. See §4 |
| **F-12** | `detail` | `App.jsx:714-719` — skip link, `sr-only + focus:not-sr-only` | `:714-719` is the `helpotron:nav` event-bus `useEffect` | **`web/src/App.jsx:755-760`** (classes `:757`, label `:759`) | drift +41. Pattern claim **verified TRUE** |
| **F-13** | `detail` | "`:767` renders SessionBootScreen while 'checking'"; "AnonymousLanding renders only on 'signedOut' (`:769`)" | `:767-769` is `<PrivacyPolicyModal>` props | **`web/src/App.jsx:808`** (`authStatus === 'checking' && <SessionBootScreen />`) and **`:810`** (`authStatus === 'signedOut' && <AnonymousLanding`) | drift +41. **Claim verified TRUE** |
| **F-22** | `cause` | `App.jsx:809` planLimit; threshold at `:811` | `:809` blank, `:810` is the signedOut branch | **`web/src/App.jsx:885`** (planLimit), **`:887`** (`if (pct < 15)`) | drift +76. **And the defect is fixed** — see §4 |
| **F-27** | `cause` | `index.css:83` paired deepgreen `#059669`/`#064E3B`; light block "at `:248`" | `:83` is now the fix comment; the pair is `:89`; light pair is `:254` | **`web/src/index.css:89`** (`:root`), **`web/src/index.css:254`** (`[data-theme="light"]`) | |
| **F-28** | `cause` | `web/index.html:54` mounted React into `<main id="root">` | `:54` is now the explanatory comment; root element is `:58` | **`web/index.html:58`** | |
| **F-28** | `cause` | `AppShell.jsx:545` renders `<main id="main-content">` | `:545` is `isOpen={newSessionOpen}` on `<NewAssignmentModal>` | **`web/src/components/AppShell.jsx:517`** | drift −28 |
| **F-09** | `correction` | `index.css:573-577` — `min-height/min-width 44px` inside `@media (pointer: coarse)` | `:573-577` is `.glass-input:focus { border-color … box-shadow … }` — **no 44px, no pointer query** | **NOT YET RELOCATED** — see §3 | this is the one citation whose *substance* I could not confirm at the cited line before stopping |
| **S-01** | `implication` | `server/main.py:1332` — "signup rate limit (20/hour per IP)" | `:1332` is `"session_token": token,` inside the **login** response dict; `@app.post("/api/signup")` begins `:1336` | **NOT YET RELOCATED** — see §3 | the "20/hour" number was not located |
| **F-02** | `cause` | `server/assignments.py:72` registers `@router.get("/assignments")` with no `/api` prefix | `:71` is `@router.get("/api/assignments")`, `:72` is the `async def` | **`server/assignments.py:71-72`** for the handler; the bare alias was **deleted** | STALE-CONTENT — see §2/§4 |
| **F-14** | `cause` | `AuthModal.jsx:813-831` — 16px checkbox, label with two `<a>` | `:813-831` is the submit `<Button>` + "Already have an account?" switch | **NOT YET RELOCATED** — see §3 | STALE-CONTENT; fix `8122697` landed |
| **F-17** | `worse_than_cosmetic` | `AuthModal.jsx:298-317` redeemed the code AFTER account creation | `:295-298` is a comment recording the removal; the redemption branch is gone | **`web/src/components/AuthModal.jsx:293-304`** (the post-signup auto-login branch, redemption removed) | STALE-CONTENT = fixed |
| **F-05** | `cause` | `web/index.html:9` title says "Clarion …" | `:9` is `<title>Helpotron — Academic Workspace & Assignment Workflow</title>` | line **correct**, content **superseded** | STALE-CONTENT = fixed |

**Drift pattern worth noting for whoever applies these:** in `web/src/App.jsx` there are two dominant constant offsets — **+41** (anything after ~line 600: F-15, F-05, F-07, F-12, F-13) and **+76** (anything after ~line 770: F-18, F-19, F-26, F-22). Several other citations are off by exactly **+1** because the agent cited the *comment line above* the code rather than the code. In `web/src/index.css` the offset is **+6**. `AnonymousLanding.jsx` line numbers **did not drift at all**.

---

## 2. The FIXED findings — independently verified against current source

I verified all six from the brief, plus (opportunistically) four of the seven extra ones.

### The six from the brief

| # | Finding | Verdict | Evidence read |
|---|---|---|---|
| 1 | **F-01** CSP `frame-src` | **CONFIRMED FIXED** | `server/security.py:556-558`: `"frame-src https://challenges.cloudflare.com https://*.challenges.cloudflare.com; "` and `"worker-src 'self' blob: data:; "` are real string literals in the `CSP = (...)` concatenation (not comments — read raw). `frame-ancestors 'none'` untouched at `:558`. Full emitted directive list: `default-src, script-src, style-src, font-src, img-src, media-src, connect-src, frame-src, worker-src, frame-ancestors`. No gate weakened. |
| 2 | **F-04** container gutter | **CONFIRMED FIXED** | `web/src/index.css:400`: `--spacing-container-padding: clamp(1rem, 3vw, 2.5rem);` inside `@theme inline` (opens `:294`), adjacent to the pre-existing `--spacing-gutter-mobile/-desktop` at `:389-390`, exactly as the finding describes. All **6** `px-container-padding` usages now resolve: `AnonymousLanding.jsx:508, 548, 573, 624, 645, 667` — the count matches the finding's "6 times" **exactly**. |
| 3 | **F-15** `--font-sans` | **CONFIRMED FIXED** | `web/src/index.css:430`: `--font-sans: "Inter Variable", system-ui, …;` and `:431`: `--font-mono: "JetBrains Mono Variable", …;` both inside `@theme inline`, with an in-code comment at `:422` recording why. The consuming `font-sans` utility is on the `.app-canvas` div at `App.jsx:750` (sole occurrence in App.jsx). |
| 4 | **F-17** discount code | **CONFIRMED FIXED** | `grep` for `Discount code` / `discount` across `web/src` → **no form field remains**. `AuthModal.jsx:295-298` carries a comment recording the removal and the reason; the post-creation redemption branch is gone — `:299` now goes straight to `onLoginSuccess?.(id)`. Redemption capability still present at `ReferralSection.jsx:115` → `api.redeemReferralCode`, so the finding's "no capability was lost" holds. |
| 5 | **F-27** contrast | **CONFIRMED FIXED — and the numbers are right** | `web/src/index.css:89` (`:root`, the live dark theme) and `:254` (`[data-theme="light"]`) now carry the **identical** pair `--st-sem-deepgreen: #047857; --st-on-sem-deepgreen: #ECFDF5;`. I recomputed WCAG 2.x relative luminance myself: `#ECFDF5` on `#047857` = **5.21:1** (claim: 5.21 ✅); the original `#064E3B` on `#059669` = **2.58:1** (claim: 2.57 — rounding ✅); the abandoned first attempt `#ECFDF5` on `#059669` = **3.58:1** (claim: 3.57 — rounding ✅). All three numbers in the finding are honest. Passes AA for normal text. |
| 6 | **F-28** landmarks | **CONFIRMED FIXED for the two surfaces named — but see the caveat** | `web/index.html:58` is `<div id="root"></div>` with an explanatory comment at `:54-57`. `AppShell.jsx:517` has exactly one `<main id="main-content">`. `AnonymousLanding.jsx:502` root element is `<main id="main-content">`, so the signed-out side has its landmark back (the regression described in `honest_note` is genuinely repaired). **Caveat / possible residual:** `grep -rn "<main"` also returns **`SettingsApp.jsx:315`** (`<main className="flex flex-col gap-unit-6">`) and **`MyAgentView.jsx:764`** (`<main className="col-span-12 …">`). Both are view components rendered *inside* AppShell's `<main id="main-content">`. If that nesting holds at runtime, `/settings` and `/agent` still have nested `main` landmarks and F-28's "Every authenticated page had nested main landmarks → fixed" is **true for 9 of 11 routes, not all 11**. I did not get to confirm the render tree before stopping — flagged, not asserted. |

### Four of the seven extra FIXED findings (not in the brief)

| Finding | Verdict | Evidence |
|---|---|---|
| **F-05** document titles | **CONFIRMED FIXED** | `web/index.html:9` title is now Helpotron-branded. `document.title` is set in three places — `App.jsx:656` (signed-out base), `:660` (`${openAssignment.title} · Helpotron`), `:663` (`${label} · Helpotron`, from a `VIEW_TITLES` map ending `:652`). The `· Helpotron` format matches HANDOFF §5's spec. `grep -rn "Clarion" web/` over html/jsx/js/css → **zero hits**. |
| **F-02** `/assignments` JSON | **PARTIALLY FIXED — overstated as fixed.** See §4 | |
| **F-03** degraded auth state | **CONFIRMED FIXED** | `App.jsx:466-471` is a new third outcome: `const isNetworkOr5xx = lastError && (lastError.status === 0 \|\| !lastError.status \|\| lastError.status >= 500); if (isNetworkOr5xx) { setAuthStatus('degraded'); return; }` — placed **before** the `// Unauthenticated state` branch at `:473`, so the `localStorage.removeItem('token')` / csrf-cookie wipe at `:485-487` is no longer reached on a transport failure. That is exactly the fix the finding prescribed. |
| **F-17** | (counted above) | |

---

## 3. NOT reached before the stop order

These are honest gaps, not passes.

**Citations located but substance unconfirmed (2):**
- **F-09** `web/src/index.css:573-577` — the cited lines are `.glass-input:focus` rules with **no `44px` and no `@media (pointer: coarse)`**. The `correction` field's whole argument ("a real phone DOES get 44px targets") rests on this citation. I had not yet grepped `index.css` for the actual `pointer: coarse` block, so I cannot say whether this is pure drift or whether the claimed rule does not exist. **Next step: `grep -n "pointer: coarse" -A6 web/src/index.css`.** This is the highest-value remaining check, because if the rule is absent, F-09's severity downgrade from "touch failure" to "desktop-only" is unjustified and should be reverted.
- **S-01** `server/main.py:1332` — points into the **login** response body, and `@app.post("/api/signup")` starts at `:1336`. The "20/hour per IP" signup rate limit was not located. **Next step: grep the signup handler for the limiter decorator / `20`.**

**Citation not yet relocated (1):**
- **F-14** `AuthModal.jsx:813-831` — confirmed STALE-CONTENT (that range is now the submit button). Fix commit `8122697 fix(auth): decouple consent checkbox from navigation and widen hit area` exists, but I had **not** read the new consent-checkbox markup, so **F-14's fixed status is unverified**: I cannot confirm the 44px hit area or that the `<a>` elements left the `<label>`. Interesting adjacent signal already seen: `AuthModal.jsx:818-822` now renders `Check the agreement box above to enable account creation.` when `!consentAgreed`, which satisfies the finding's secondary "Also explain the disabled button" ask.

**Findings not examined at all (9):**
`F-10` (fixed, `6a3f323`) · `F-16` (fixed, `6a3f323`) · `F-29` (fixed, `2b17dc7`) · `F-18` (partially — two of four bullets checked) · `F-19` (partially) · `F-20` · `F-23` · `F-24` · `F-25`

**Specifically unaddressed from the task brief:**
- **Task step 6 — re-verify the two `stale` findings.** **F-13**: I confirmed its three underlying code claims hold against current source (synchronous `authStatus` initializer `:206`; `checking → SessionBootScreen` `:808`; `signedOut → AnonymousLanding` `:810`), so the "does not reproduce" verdict **still stands**, though all three line numbers drifted +41 as tabulated. **F-24 I did not re-verify at all** — it rests entirely on runtime observation of `/api/dump/list` and dashboard card counts, which is browser work I was barred from and which no static read can settle. Its `action` ("Re-test the API-created path") remains the right next step.
- **F-20** is in `open_ids` but commit **`6a3f323 fix(a11y): demote breadcrumb h1 and eliminate nested guide main landmark`** landed afterwards and is credited as the `fixed_commit` for both F-10 and F-16. F-20's defect is *exactly* "demote the breadcrumb h1". **Strong suspicion F-20 is already fixed and mis-stated as open** — same failure mode as F-22 below. **Unverified; must be checked.**

---

## 4. Findings I believe are simply WRONG

### 4.1 F-22 — marked `open`, but the defect it describes no longer exists. **WRONG.**

F-22 is in `summary.open_ids` with `state: "open"`, `status: "confirmed, unfixed"`, and HANDOFF §5 lists it as Phase A item 3 still to do.

Current `web/src/App.jsx:885`:
```js
const planLimit = { none: 2000, trial: 15000, testing: 10000, basic: 35000, pro: 120000, unlimited: 500000 }[userPlan] || 2000;
```
Commit `69bbaae fix(billing): add plan-none limit to low-token check and add dismiss` did both halves of what F-22's `fix` field asked for:
1. **`none: 2000` is now a key**, so a plan-`none` account holding 2,000 tokens computes `pct = 100`, not `13.3` — it fails the `if (pct < 15)` test at `:887` and the banner does not render. The fallback also moved `15000 → 2000`.
2. **The banner is dismissible** — new `tokenNagDismissed` state (`:215`) gates the render at `:884`, and an `X` button with `aria-label="Dismiss low token balance warning"` sets it (`:906-912`).

**Correction:** `state` → `fixed`, `fixed_commit` → `69bbaae`, remove from `open_ids`, decrement `open`/`open_by_severity.medium`, increment `fixed`. **HANDOFF §5 Phase A item 3 should be struck.** This also means `summary.by_state` is wrong *as a description of reality* even though it is arithmetically self-consistent.

### 4.2 F-02 — reported FIXED; it is only ~20% fixed. **OVERSTATED.**

F-02's own `fix` field says: *"Drop the bare /assignments **aliases** (keep the /api/ ones)"* — plural. Commit `9ddc66a` removed **one** line (`-@router.get("/assignments")`). `server/assignments.py` still registers **five** bare, un-prefixed routes:

```
 92: @router.post("/assignments")
125: @router.get("/assignments/{assignment_id}")
135: @router.get("/assignments/{assignment_id}/subagent-team")
154: @router.patch("/assignments/{assignment_id}")
187: @router.delete("/assignments/{assignment_id}")
```
`server/assignments.py:19` is `router = APIRouter(tags=["assignments"])` — **no `prefix`**, so these sit at the site root. `app.include_router(assignments_router)` is `server/main.py:546`; the SPA catch-all `@app.get("/{full_path:path}")` is `server/main.py:2769`. FastAPI matches in registration order, so **the bare route wins over the catch-all**.

Net: the exact reported symptom (`GET /assignments` → raw JSON) is gone, but **`/assignments/65` — the shape of an actual deep link to an assignment — still shadows the SPA and serves a JSON error on a blank page**, which is the same class-of-bug and arguably the more likely URL for a user to hit or share. (F-07 notes the app never pushes such URLs today, which limits exposure — but it is also the first thing F-07's own fix would start producing.)

**Correction:** either downgrade F-02 to `open` with its scope narrowed to the sub-path aliases, or add a `residual` field naming the five surviving routes. Do not leave it as a clean `fixed`.

### 4.3 F-21 — the evidence line numbers are wrong **and the mapping they assert is wrong.** **WRONG as written.**

F-21 `evidence`: *"Both are mapped in `web/src/App.jsx` VIEW_PATH_MAP (`:331`, `:332`) to `'activity'` and `'automation'`."*

Current `VIEW_PATH_MAP` (`App.jsx:314-342`):
```js
318:    '/activity': ['overview', null],
319:    '/automation': ['overview', null],
...
331:    '/extension': ['extension', null],
332:    '/dump': ['dump', null],
```
Two errors: the lines are `:318`/`:319` (cited `:331`/`:332`, which are different routes entirely), and the targets are **`'overview'`**, not `'activity'`/`'automation'`. So the *symptom* F-21 measured — both routes rendering `h1 "Dashboard"` — is real and now **fully explained by the map itself**, not by unwired view components. That makes the `fix` field (*"Determine whether ActivityView and AutomationCenter are wired at all"*) a misdirection: the route table is pointing both paths at the dashboard **deliberately**, and HANDOFF §5 item 5 confirms the owner's decision is to **delete** `/activity` and `/automation` outright.

I could not establish whether the map always read `['overview', null]` (making the original evidence simply mis-transcribed) or was changed afterwards; either way the finding as it stands misdescribes the code.

**Correction:** evidence → `web/src/App.jsx:318-319`, and restate as "both paths are mapped to `['overview', null]`, i.e. the dashboard, by design"; drop the "determine whether they are wired" framing in favour of owner decision 26 (delete).

### 4.4 Rule compliance — findings resting on neither a citation nor a measured number

The audit's stated rule is *"no finding rests on a screenshot alone; each carries a source citation or a measured number."* Six findings carry **no `file.ext` citation of any kind**. Judged against the rule's disjunction:

| Finding | Citation? | Number? | Rule satisfied? |
|---|---|---|---|
| F-20 | none | **yes** — "Eight of eleven", eight enumerated `h1` text pairs | ✅ by number |
| F-23 | none | **yes** — `Showing 0 of 0` → `1 of 1`, ~2.5s, zero console errors | ✅ by number |
| F-24 | none | **yes** — `status 'auto_routed'`, `1 assignment present`, five cards at `0` | ✅ by number |
| F-10 | none | **yes** — exact `h1` arrays per route, `modalOpen true` | ✅ by number |
| **F-29** | **none** | **none** | ❌ **weakest in the set.** Entirely verbatim UI strings (`SUB-PIPELINE 00 · DORMANT`, `activate synthesis vectors`) with no file, no line, no count. It is also `severity: high` and already marked `fixed` via `2b17dc7` — so a high-severity fix was signed off with nothing a reviewer can diff against. **Needs a citation retro-fitted** to wherever those strings lived. |
| **F-25** | **none** | **none** | ❌ **second weakest.** Pure visual description ("filled accent button" vs "quiet outline") of the cookie banner. No file, no line, no contrast/size measurement, and it is `open` and `medium` — so whoever picks it up has no starting file. `CookieBanner` is lazy-loaded at `App.jsx:1080`, which would be the obvious anchor. **Needs a citation.** |

F-29 and F-25 are the two genuine rule violations. The other four pass on the "or a measured number" limb, though all four would be materially easier to action with a file reference.

### 4.5 Two further corrections that are not "wrong findings" but matter

- **F-05's `fix` field misdescribes where the fix went.** It prescribed *"Set a per-view title where activeView changes (`App.jsx:628 handleSelectView`)"*. The fix actually landed as a dedicated `useEffect` at `App.jsx:654-665` keyed on `[activeView, openAssignment, authStatus]` — a better implementation than prescribed (it also covers the signed-out base title and assignment titles). Worth recording so the next reader does not go looking inside `handleSelectView` at `:669`.
- **F-18's `observed_so_far` is now mixed-tense.** Bullet 2 (`ViewSuspenseFallback`) is verbatim accurate at `:81-87`. Bullet 3's claim is still true but at `:853`. Bullet 1 (signup button label vanishing) is a runtime measurement I could not re-check. Bullet 4 overlaps F-24, which is `stale`. The finding is `open/high` and is the single largest Stage 2 workstream per its own `plan` — it deserves re-measurement rather than inheritance.

---

## 5. Summary of corrections for someone else to apply

**Do not edit `findings.json` based on this file without re-reading the cited code — I was stopped mid-audit.**

1. **State changes:** F-22 `open → fixed` (`fixed_commit: 69bbaae`); F-02 `fixed → open`-with-residual (five surviving bare routes); **check F-20 against `6a3f323`** — likely the same mis-state as F-22.
2. **Line-number corrections:** 24 citations listed in §1b. The App.jsx offsets are systematic (+41 below ~line 600, +76 below ~line 770) — worth a scripted pass rather than 24 manual edits, but each one still needs an eyeball because several are *also* content-stale.
3. **Substance corrections:** F-21 evidence (wrong lines **and** wrong mapping target); F-05 `fix` (fix landed elsewhere).
4. **Missing citations to retro-fit:** F-29 (high, fixed, zero evidence anchor) and F-25 (medium, open, zero evidence anchor).
5. **Open questions to resolve first:** does `@media (pointer: coarse)` with 44px minimums actually exist in `web/src/index.css` (F-09's severity downgrade depends on it)? Do `SettingsApp.jsx:315` / `MyAgentView.jsx:764` nest a `<main>` inside `AppShell.jsx:517`'s (F-28's completeness depends on it)? Where is the 20/hour signup limiter (S-01)?
6. **`docs/HANDOFF.md` needs updating** — §4's commit range (`…to 521e2d9`, HEAD is `3c2870b`), §6's `by_state` figures, and §5 Phase A items 2 and 3 (both done).
