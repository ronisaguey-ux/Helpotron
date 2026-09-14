# HELPTRON — MASTER PLAN

**Repo:** `github.com/ronisaguey-ux/Helpotron` · **Branch:** `audit/2026-09-14-swarm`
**Audit:** 10 parallel agents, 2026-09-14 · **Evidence:** `research/*.json`
**Scope note:** helpotron is an independent project. Nothing here relates to T2B.

> ⚠️ **This repo carried ~1,508 lines of uncommitted work across 16 files from a
> prior session** (extension, server, web). The agents were instructed to treat
> it as current state and never revert it. It is still uncommitted and untouched.

---

## VERDICT

**The engineering is real; the business is not yet.** The stack genuinely runs
(API :5000, web :5173, tunnel — all verified up), the web app is a coherent
product rather than a pile of views, and the extension's screen-control agent
**does work mechanically** (a ref-based op validates and dispatches). That is
more than most projects at this stage.

But: the agent lane **charges 1 credit and then runs an unbounded, unmetered
~50k-token LLM loop**; untrusted page text reaches the model as *"trusted system
context"* and then executes; a paying subscriber receives **no usable balance**
because checkout credits one currency and features charge another; and **three
contradictory price tables ship at once**, so the offer cannot be stated.

The single most important strategic finding: the extension's moat — driving the
user's own logged-in browser — **was shipped by Google itself in August 2026.**
That does not kill the product, but it means the differentiation must move to the
vertical (operating school portals that have no API) or nothing.

---

## SEVERITY MAP

| Track | Sev | Findings | Headline |
|---|---|---|---|
| H1 economics | blocker | 12 | **1 credit buys an unbounded ~50k-token loop**; two currencies that never meet |
| H2 web-ux | blocker | 11 | `api.createAssignment` **does not exist** — primary flow is dead |
| H3 extension | blocker | 14 | A stale ref is a silent no-op **reported as success**; debugger attachments leak |
| H4 server | blocker | 14 | **No real migrations**; GDPR delete shadowed by a duplicate handler |
| H5 security | blocker | 10 | **Prompt injection reaches the model as trusted context, then executes** |
| H6 tests | major | 10 | Running the suite **deletes real files** and makes live HTTPS calls |
| H7 ops | blocker | 11 | **No working DB backup**; API on 0.0.0.0; `vite preview` in production |
| H8 capability | major | 7 | Unresolved ref silently skipped, then **reported as executed** |
| H9 academics | blocker | 10 | **Quiz marks every answer correct**; FSRS is never run |
| H10 strategy | blocker | 8 | Three price tables; no distribution; the moat shipped by Google |

**107 findings, 100 fixes.**

---

## ⚠️ ACT IMMEDIATELY — SECRETS

Two independent tracks found the same live secret:

1. **A GitHub push token is in cleartext in `.git/config`** (the `origin` remote
   URL embeds a `ghp_…` PAT). Found by H5-F9 and H6-F10. It is visible to anyone
   with read access to the repo's config and to any process that reads it.
   **Action:** rotate the token, then re-point the remote without it. Not changed
   here because it would break the owner's ability to push.
2. **`DEBUG=true` in the production `.env`** (H5-F9). Every error becomes a stack
   trace to the client.
3. **Student uploads are served unauthenticated** via the `/uploads` static mount
   (H5-F7), and **sandbox run directories are world-readable** (H5-F8, and the
   systemd units set no `UMask`, H7-F4).

---

## IMPLEMENTED ON THIS BRANCH

Each is an individual commit, verified before the next. **No file the owner has
uncommitted was touched** — helpotron carries ~1,508 lines of in-flight work
across 16 files, and every fix below lands in a file that is clean.

| Commit | What | Why it mattered |
|---|---|---|
| `4d88545` | research + this plan | 10 reports, 107 findings |
| `585d045` | **tests no longer run the production background loops** | `TestClient(app)` triggers the lifespan, which spawns `_cleanup_temp_files_loop` — it `os.remove`s anything older than 24h from the **live** `./uploads`, `./exports`, `/tmp/helpotron_exports`, and its first pass runs before its first sleep. Measured: 10 test files already written into the real `uploads/` (each exactly 16 bytes, mtimes inside the test window). Only the 24h gate had prevented an actual purge |

**Verified:** `server/tests/test_api.py` 16 passed, and the real `uploads/` file
count was **10 before and 10 after** — unchanged.

**Why the other 106 findings were not applied:** the highest-value ones change
surfaces the owner is actively editing (extension ref dispatch in
`extension/*`, the credit ledger and agent loop in `server/main.py`, the price
tables) or need a product decision (which of the three price tables is
canonical, whether to keep the detector-evasion lane at all). Applying them
blind would produce a diff the owner cannot review against their own work.

---

## WORKSTREAM RANKING

### W1 — Close the money hole  *(H1)*
`/api/agent/start` charges **1 credit** and then runs a loop that can reach
**~50k tokens per call with no meter and no cap**. One user can burn the operator's
OpenRouter budget. Closely followed by H1-F2/F3: grants land in `token_balance`,
paid features charge `credits`, so **a paying subscriber gets no usable balance**,
and H1-F7 (Stripe webhook not idempotent — a retried event grants credits twice).

### W2 — Close the execution hole  *(H5)*
Untrusted page text is passed to the model as trusted system context, and the
model's output can drive clicks and keystrokes. **That is
remote-code-execution-class.** H5-F2 compounds it: the "sandbox" is a working
directory, not a sandbox — model-authored Python runs unconfined as the server
user. Secondary: IDOR on quiz grading (H5-F3, returns correct answers).

### W3 — Make the money path correct  *(H1, H4)*
One canonical price table; one currency with a defined exchange; cost ledger rows
actually written (the daily spend cap is dead code). H4-F1: there are **no real
migrations**, so a model change breaks the existing production database at first
query — silently.

### W4 — Make the agent honest  *(H3, H8)*
An unresolved ref is **silently skipped and then reported as an executed action**
(both executors). Refs are positional indices re-enumerated at dispatch time, so a
shifted DOM clicks the **wrong element**. `chrome.debugger` attachments leak three
ways, leaving the user's tab locked.

### W5 — Fix the academics or stop claiming it  *(H9)*
Quiz grading **marks every multiple-choice answer correct** (score always 100%).
FSRS is never run — every interval is a constant lookup. `draft_section` is a
hardcoded stub returning fake prose. And H9-F5: the product writes the assignment
and runs detector-evasion — an integrity and institutional-risk decision for the
owner, not a patch.

### W6 — Make the ops survivable  *(H7)*
No working DB backup (the script targets the wrong database). API bound to
**0.0.0.0**. Production web tier is `vite preview`, which Vite explicitly
disclaims for production. 834 sandbox run dirs unreaped.

### W7 — Decide the offer  *(H10)*
Three price tables at once; a trial that cannot self-activate; an unlisted
extension; no demo asset. Even fixed, the moat question stands.

---

## NOT IMPLEMENTED (honest list)

~103 findings are documented in `research/*.json` with file:line, an exact edit
and a verification step. Nothing was applied, for the reason above: helpotron has
live uncommitted work and the top fixes need owner decisions.

**Highest-value next three, ready to apply:** H1-F1 (meter and cap the agent
loop), H1-F2 (`token_balance` -> `credits` reconciliation), H4-F1 (a real
migration path before the next model change ships).
