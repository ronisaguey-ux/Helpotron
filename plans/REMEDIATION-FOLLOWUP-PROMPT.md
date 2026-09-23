# HELPOTRON — REMEDIATION EXECUTION BRIEF (follow-up to the extended mega-audit)

> Paste everything below the line. Self-contained: you can see nothing outside this repo.

---

# HELPOTRON — TURN THE VERIFIED AUDIT INTO SHIPPED FIXES

You finished `plans/mega-audit-2026-09-22-extended.json`: 72 findings, **0 unverified**,
54 verified. That work has been reviewed and independently spot-checked — it holds up.
Several of your claims were re-measured by hand and confirmed:

- `LEG-08` — `SECURITY.md:49` says bcrypt; `security.py:136` is `pbkdf2_hmac('sha256', …, 100000)`. Confirmed.
- `LEG-06` — `AuthModal.jsx:465` really does still say "grants 150" four lines below `:460`
  which correctly says 15,000. Confirmed, and it is worse than you wrote (see §2).
- `EFF-04` — `run_monitors_loop` is `async def` and calls the sync `snapshot_once()` directly at
  `monitors.py:374,377` with no `to_thread`. Confirmed.
- `EFF-05` — `telegram_agent_loop` calls `_connected_users()`, which runs
  `db.query(User).filter(User.settings.is_not(None)).all()` and parses every user's settings,
  every 3.0 s regardless of bot count. Confirmed.
- `SEC-OPEN-A` — 13 routes looked unguarded to a heuristic scan; all 8 I opened filter correctly
  (`_get_owned_assignment`, `_owned_material_or_404`, `AgentFile.user_id == user.id`, …).
  Your verdict is right.

**Your finding work is done. What is missing is the executable layer and the fixes themselves.**
The `execution_order` in the extended plan is 9 themes with finding ids and a rationale — it has
no files, no changes, no test suites, no verification commands. Nothing in this repo has been
fixed yet. That is this brief.

---

## 0. BEFORE YOU TOUCH ANYTHING

```
repo        : /home/roni/Roni_workspace/helpotron
branch      : main
HEAD        : da766763e1443c97793bc45c20d8a1b905968633
suite       : cd /home/roni/Roni_workspace/helpotron && ./.venv/bin/python -m pytest server/tests -q
oracle      : ./.venv/bin/python   (NEVER system python3 — `zippy` is only in the venv, and a
              missing solver silently reads as score 0.0 which the funnel treats as "clearly
              human", short-circuiting the whole detector stack)
```

**Owner WIP — these two files are uncommitted work that is NOT yours. Do not edit, revert,
reformat or stage them. Verify the hashes before and after every commit:**
```
server/launch_to_doc.py                  md5  9fb6de3e8b6e0ba81c6211e3d5f441bc
server/tests/test_launch_to_doc_plan.py  md5  923f2592fb5c83ce62fe43355174669b
```
Also uncommitted and not yours: `extension/manifest.json`, `server/routes_extension.py`.
Leave all four alone. Commit only the files your step names.

**Hard rules for this repo (learned the expensive way — do not re-derive):**
- **Never restart a live service as your verification.** Order is
  `edit → ast.parse / import check → suite → restart → verify the endpoint`.
  `systemctl --user restart helpotron-api.service` against a file with a SyntaxError took the
  production site down with 81 crash-loop restarts once. The suite imports `server.main`, so it
  catches that class in seconds: `./.venv/bin/python -c "import sys;sys.path.insert(0,'.');import server.main"`.
- **`server/.env` IS A DECOY.** Nothing reads it. The ROOT `.env` is the only config that loads
  (`server/config.py:15`, `server/llm.py:18`). A key placed in `server/.env` is inert.
- **`with_for_update()` is a NO-OP on SQLite.** The emitted SQL has no `FOR UPDATE`. Any fix
  phrased as "add a row lock" changes nothing here. What works: `BEGIN IMMEDIATE`, or a
  single-statement `UPDATE … WHERE balance >= ?` / `json_set`. (There is already a
  `credits.debit_tokens_atomic` for this.)
- **`create_all()` does NOT add an index to an existing table.** 70 `index=True` declarations vs
  1 `CREATE INDEX` statement — the live DB carries almost none. A new UNIQUE constraint needs an
  explicit `CREATE INDEX IF NOT EXISTS` in the migration block.
- **Files are often mode `444`/`555`.** `chmod u+w`, edit, restore the mode. Git tracks only the
  exec bit, so this produces no spurious diff.
- **The test DB is a persistent file.** Use a unique `public_id` / idempotency key per run
  (`uuid4`), never a literal — three tests failed only in full-suite runs because a fixed key
  collided with the previous run's row.
- **`plan == "elite"` charge bypasses are a recurring class.** Grep for it as routine.
- **Never trust, always verify.** Run the thing. A green suite proves it compiles, not that the
  feature works.

**Work on a feature branch. Never commit to `main` without being asked.**

---

## 1. FIRST: FIX THE THREE "CLEAN" SECURITY VERDICTS' EVIDENCE

`SEC-OPEN-A`, `SEC-OPEN-B`, `SEC-OPEN-C` are marked **Verified (Clean)** and the verdicts are
correct — but the recorded evidence is an **assertion**, not a measurement ("Exhaustive scan …
confirms that object-level ownership checks are systematically enforced"). A "clean" on IDOR is
the single most consequential verdict in the plan: if it is wrong, it is a data-exposure class,
and this repo has already shipped that exact bug (`routes_organization.py:53` set
`role="admin"` unconditionally).

**Make each one enumerable.** For every route that takes an id-shaped parameter, produce a row:

```
file:line | METHOD /path | the guard | how you proved it
```

Example of the standard required:

```
server/routes_assignment_direction.py:50 | _get_owned_assignment()
  → .filter(Assignment.id == id, Assignment.user_id == user_id) … raise 404
server/routes_study_tools.py        | _owned_material_or_404(db, material_id, user)
server/routes_overlord.py           | AgentFile.user_id == user.id
server/routes_api_keys.py           | keys.delete_key(db, user, key_id)
```

A route you cannot attach a guard to is a **finding**, not a gap in the survey. Include the count
(`N routes with an id parameter, N guarded`) so the claim is falsifiable. Do the same for
SEC-OPEN-B (quote the AST allowlist and the string-constant regex, with the node types it checks)
and SEC-OPEN-C (list every route calling `require_session_auth`, and confirm the call is ordered
AFTER `get_current_user` — calling it first reads `request.state.auth_via_api_key` before auth sets
it, which once let an API key mint another key at HTTP 200).

**This is evidence work, not new analysis. It is the smallest step and it unblocks the largest
unknown.**

---

## 2. THE STALE-NUMBER CLASS IS BIGGER THAN LEG-06 SAYS

You found `AuthModal.jsx:465`. That is real, and it is the visible tip of a class that has now
been "fixed" twice and regrown both times. A sweep of `web/src/components/*.jsx` for the old
100×-stale numbers returns **18 candidate sites**, including:

```
web/src/components/AdminCostView.jsx:75
    // Plan economics — mirrors server/plans.py (trial 150, $10/300, $20/1000, $40/2700)
web/src/components/AdminAdvancedDashboard.jsx:512-515
    <option value="trial">Trial (100 Tokens)</option>
    <option value="basic">Basic (300 Tokens)</option>
    <option value="pro">Pro (1,000 Tokens)</option>
    <option value="elite">Elite (2,700 Tokens)</option>
web/src/components/TrialActivationCard.jsx:107
    const claim = trial.credits_grant || 150;
```

The `AdminCostView` line is a **comment that names the canonical file and gets its numbers wrong** —
which is worse than a wrong literal, because the next reader trusts it as documentation.

**The canonical truth** (`server/credits.py:55-59`, `payments.TIER_TOKENS` re-exports it):

| tier | tokens | price | notes |
|---|---|---|---|
| trial | 15,000 | — | one-time, **14 days** (`trial_service.TRIAL_DURATION_DAYS = 14`) |
| testing | 10,000 | — | never expires, `requires_approval` |
| basic | 30,000 | $10 | |
| pro | 100,000 | $20 | |
| elite | 270,000 | $40 | |

`TOKENS_PER_USD = 10_000`, `TOKENS_PER_CENT = 100` (1 token = 1/100 of a cent).

**Do a total sweep, not a spot fix.** Every tier number, allowance, duration and price anywhere
outside `server/credits.py` / `server/payments.py` / `server/plans.py` is a bug on a timer. Then
make it impossible to regrow: derive the UI from `GET /api/plans` where it already exists
(Settings → Credits & Billing does), and add a guard test that greps components for the stale
literal set and fails. The rule to encode: **a tier number in a component is a bug, not a value.**

---

## 3. THE ACTUAL JOB — PLAN, THEN EXECUTE

### 3a. Write the executable plan

Produce **`plans/execution-plan-<YYYY-MM-DD>.json`**. It is not a summary of the audit; it is the
work order. Every step carries:

```json
{
  "step": 1,
  "title": "imperative, one line",
  "why_first": "the consequence that sets its priority",
  "closes": ["REL-02", "UI-01"],
  "files": ["exact/paths.py"],
  "change": "what changes and why, specific enough that a reviewer could reject it",
  "test_suite": {
    "write": [
      { "path": "server/tests/test_x.py", "name": "test_y",
        "proves": "the behaviour, not the shape",
        "must_fail_without_fix": true,
        "body": "the actual test code" }
    ],
    "must_stay_green": ["the exact pytest invocations"]
  },
  "verify_command": "the command you will run and paste the output of",
  "done_when": "observable, not 'the fix is written'",
  "effort": "hours or days",
  "risk": "what the fix could break, or 'none material' and why"
}
```

Order it by **consequence, not by file**. Group into waves. The extended plan's `execution_order`
is the starting shape — keep its priorities, add the missing detail:
wave 1 money/data-loss and blank screens · wave 2 the product lying to the user · wave 3
event-loop and efficiency · wave 4 hygiene with guard tests.

### 3b. Execute it, wave by wave

For each step, in order:

1. **Write the failing test FIRST.** Run it. Paste the failure. A test that passes before the fix
   is not a test.
2. **Read the surrounding code** and match its conventions, naming and error-handling style.
   Root-cause it — a fix applied to a symptom returns with friends.
3. **Make the change**, smallest diff that closes the finding.
4. **Run the step's tests, then the full suite.** Confirm the baseline count did not drop.
5. **Re-run the original reproduction** from the audit and paste the new output.
6. **Commit** on the feature branch:

```
<scope>: <short imperative>

<what was wrong, in one or two sentences, with file:line>
<what the fix does, and the test that proves it>
```

7. **Verify WIP hashes** (§0) before every commit and after every merge.

**Do not batch.** Do not write five fixes then test once. Each step is committed only when its own
verification has been run and its `done_when` holds.

---

## 4. WHAT COUNTS AS DONE

- [ ] `SEC-OPEN-A/B/C` carry enumerable evidence, not assertions — a route list with guards.
- [ ] The stale-number sweep is total, with a guard test that fails if it regrows.
- [ ] `plans/execution-plan-<date>.json` exists and every step has: files, change, tests to write
      (with bodies), suites to keep green, a verify command, an observable done_when.
- [ ] Every finding you fix has a test that **failed before and passes after** — quote both runs.
- [ ] The full suite is green, and you state the count you observed (not the count you expected).
- [ ] Owner WIP md5s are unchanged.
- [ ] Every claim in your report is backed by a command you actually ran, pasted in.

---

## 5. WHAT NOT TO DO

- **Do not re-audit.** The findings are verified. Finding more is not the job; closing them is.
- **Do not report a fix without a fail-then-pass test.** "Should work now" is not a result.
- **Do not touch the four WIP files.** They are the owner's.
- **Do not commit to `main`.** Feature branch.
- **Do not restart the API to test a change** — import-check it first (§0). This has taken the
  production site down once already.
- **Do not delete a flat price because the audit called it flat.** The flat constants are
  deliberate floors (`max(measured, floor)`) — the floors exist because some real work consumes
  platform resources that never reach the LLM ledger. ECON-05's job is to check whether a floor
  still *binds*, and to say which ones no longer do. It is not licence to delete them.
- **Do not "fix" the dimensions marked UNKNOWN by guessing.** Tenant isolation is now adjudicated
  (§1). Accessibility, integration failure modes, and the eval gate's falsifiability are still
  unexamined — if you reach them, audit them properly rather than asserting.

---

## 6. REPORTING

Return, at the end:

1. **The plan**, committed, at `plans/execution-plan-<date>.json`.
2. **A per-step result**: finding id · commit sha · the failing test output before · the passing
   output after · the suite count.
3. **A list of anything you did not complete**, named individually, with why. An honest partial
   is worth more than a complete-looking claim — this audit only exists because the previous
   pass under-reported its coverage and the owner caught it.
4. **Anything you learned that a stranger would have to rediscover** — the exact command, the
   exact path, the exact failure it prevents. Non-obvious mechanisms, traps that cost you an
   hour, facts that make a whole class of bug possible.

**Start by reading `plans/mega-audit-2026-09-22-extended.json`, then write the plan before you
change a single line of code. Begin.**
