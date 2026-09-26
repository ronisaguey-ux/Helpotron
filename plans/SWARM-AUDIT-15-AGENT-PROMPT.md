# CROSS-REPO SWARM AUDIT — 15 agents, 4 repositories

**Deliverable:** one consolidated plan, `plans/SWARM-AUDIT-<date>-round2.json`, plus a per-finding
appendix. You present it and **STOP**. You do not implement anything in this pass.

**Scope:** `AI-coding-orchestrator` · `t2b` · `helpotron` · `webchat-to-api-harness`.

---

## 0. Read this whole document before you open a file

This is not a generic "find bugs" brief. It is written by the agent that ran the previous four
audits on these repos and then hand-checked the output against the source.

Sections **1**, **4** and **6** decide whether this audit is worth anything. Section 1 explains
what went wrong last time. Section 4 is the contract that keeps it from going wrong again.
Section 6 is a list of things already refuted by hand, so you do not spend budget rediscovering
them.

Every number below is a real measurement taken on these repos on this machine. Every path is
real. Where something was already fixed, it is listed so you do not report it as live.

---

## 1. Why this prompt is shaped the way it is

### 1.1 The measured hallucination rate

A full audit pass across these repos produced **803 raw findings**. Of the subset that made a
*mechanically checkable* claim — a named construct at a cited line range — **62–74% were refuted**
when the cited lines were actually read. Adding an evidence requirement to the prompt moved that
to **57%**. It did not fix it.

**No prompt fixes this.** That is why the contract in section 4 exists and why section 4 is the
part you must actually follow. What you control is not whether you are right — it is whether your
output is *checkable*.

### 1.2 Two verbatim refutations, both of which would have entered a plan as real defects

- `adminctl.py:150-180` — *"accepts raw SQL commands without parameterization"*.
  The cited lines are HTTP calls of the form `f"/api/admin/user/{id}/plan"`. **The file contains
  no SQL at all.**
- `serve.py:15-25` — *"uses deprecated asyncio event loop patterns"*.
  The cited lines are `os.path.join`, a `PORT` read, and a `class` definition. **There is no
  asyncio in the file.**

Both were confident, specific and wrong. That is the failure mode this brief exists to prevent.

### 1.3 Reachability is part of the finding

The highest-rated finding of a previous pass was *"`scrub_pii()` and
`anonymize_student_submission()` use different redaction patterns for the same PII types —
inconsistency guarantees leaks"*. It is **true about the code** and **useless as a defect**:
`grep -rn "scrub_pii\|anonymize_student_submission"` across the repo returns **zero callers**.
Both functions are dead. One is genuinely broken, the other merely sloppy. Neither can leak,
because nothing calls either.

**Before treating a finding as a defect, `grep -rn <symbol>` for callers.** A bug in dead code is
a note, not a bug. It goes in the `dead_code` list, never in the severity-ranked findings list.

### 1.4 The single highest-yield field on these repos

Across every audit so far, the findings that were real, were worth fixing, and would never have
been found by reading for "security issues", were all one shape:

> **A control that reports success and does nothing.**

All of these were real and are now fixed:

- A settings writer returning `saved:true, effective:true` while writing the value **somewhere the
  reader never looks**.
- A connection flag written from **three different call sites in three different shapes**, so a
  reader trusting one shape reported "nothing connected" after a real connection.
- A **per-user watermark** combined with a **per-task idempotency key**, so two concurrent tasks
  each billed the whole window — measured **$0.02 + $0.03 of real cost billed as 10 cents against
  5.00 actual**.
- A `connected` flag in a file that **nothing ever cleared**, so one connect meant "connected"
  forever — on a screen that simultaneously probed and printed "browser: not running".
- An API-key guard on a settings **read** that a key could already **write**: protecting nothing
  while breaking a required call.
- A test that wrote into the **live** config directory and corrupted an installed launch.
- A route decorator bound to the **wrong function**, so `POST .../plan` set `payment_verified`
  instead of the plan, and returned a 200 success shape that never mentioned a plan.

**That shape — not "security" — is where your best findings live.** Agents 11, 12 and 13 are
dedicated to it. Give them the most effort.

---

## 2. The four repositories

### 2.1 `helpotron` — FastAPI + React + Chrome MV3 extension

- **Path:** `/home/roni/Roni_workspace/helpotron`
- **Branch:** audit the working tree and record the branch in your output.
- **Interpreter:** `./.venv/bin/python` — **always this, never system `python3`.** A dependency
  present only in the venv fails under system python *silently*: the healthy path returns a score
  of `0.0` with the error buried in a `details` field, which its caller reads as "clean".
- **Tests:** from the repo root — `./.venv/bin/python -m pytest server/tests -q`.
  Last measured **849 passed, 0 failed**. Re-measure; do not quote that number.
- **⚠️ `server/.env` IS A DECOY.** Nothing reads it. `server/config.py` resolves its `env_file` to
  the **repo root `.env`**, and `server/llm.py` `load_dotenv()`s that same file with
  `override=True`. A secret "rotated" into `server/.env` is inert — this already happened and
  produced a rotation that never took effect. **Every key goes in the root `.env`, and you verify
  by reading it *through the app*, never by reading the file.**
- **⚠️ The API is NOT `--reload`.** Editing `server/*.py` leaves the running instance serving the
  old code. Restart, then verify the endpoint.
- **⚠️ `create_all()` never retro-fits an index onto an existing table.** A model field declared
  `index=True` exists on a fresh DB and *not* on the live one. Measured: `grep -c index=True
  server/database.py` → **70**, `grep -rn 'CREATE INDEX' server/*.py` → **1**. Any index or unique
  constraint that matters needs an explicit `CREATE INDEX IF NOT EXISTS` in the migration block.
- **⚠️ The public site is deliberately DOWN behind a maintenance banner.** Do not start it, do not
  remove the banner, do not "fix" a listener on 5173. The API on `:5000` stays up and is what you
  drive.
- **Graph available:** `graphify-out/graph.json` (9,999 nodes). Use it to traverse instead of
  grepping blind.

### 2.2 `t2b` — lead generation and outreach

- **Path:** `/home/roni/Roni_workspace/t2b`
- **The application is `roofing-lead-bot/`**, not the repo root.
- **Interpreter:** `roofing-lead-bot/.venv/bin/python`.
- **Tests:** run **from `roofing-lead-bot/`** — the suite and its config assume that cwd.
  Last measured **332 passed**. Re-measure.
- **⚠️ The root `.env` is canonical.** `config.py` loads `env_file=(".env", "../.env")`, so a
  second real `.env` under `roofing-lead-bot/` would silently win. `.env.example` is only a stub.
- **⚠️ Port `:5000` on this machine belongs to helpotron.** t2b needs another port locally.
- **⚠️ Some files are mode `444`/`555` deliberately.** `chmod u+w`, edit, restore — git tracks only
  the exec bit, so the mode change produces no spurious diff.
- **Graph available:** `graphify-out/graph.json` (1,447 nodes).

### 2.3 `webchat-to-api-harness` — drives real logged-in webchat tabs as an API

- **Path:** `/home/roni/Roni_workspace/webchat_worker/harness`
- **Branch:** `main`.
- **Tests:** `npm test`. **The test command pins `--test-concurrency=1` on purpose.** Before that
  pin the *same unmodified tree* reported **284/283, 288/286 and 286/286** across three runs, always
  with `Unable to deserialize cloned data`. **A test command whose pass count moves on its own
  cannot be evidence** — you cannot separate your regression from the runner's race. Never "fix" a
  flake by loosening an assertion.
- **⚠️ This repo IS a tool-execution trust boundary.** The model writes commands that the harness
  then executes (`run_bash`, `write_file`, `edit_file`). Findings here are not "the app might
  misbehave" — they are "the model can make this machine do something".
- **⚠️ `run_bash` is disabled unless `BASH_ALLOWED=true`.** Several earlier findings were
  "refuted" only because the reviewer had not enabled it. **Enable it, then test it.**
- **⚠️ Nothing in this repo has ever been found by reading it.** Every real defect in it was found
  by *driving* it. See section 9.3.

### 2.4 `AI-coding-orchestrator` — the audit engine itself

- **Path:** `/home/roni/Roni_workspace/AI-coding-orchestrator`
- **Branch:** `audit-tooling`.
- **CLI:** `orch` is on PATH — `orch doctor`, `orch agents <target>`, `orch findings`, `orch config`.
- **Tests:** `python3 cli/tests_orch.py`. Last measured **51 passed**.
- **⚠️ The engine's own output is the least trustworthy artifact in this repo.** It has produced a
  synthetic *"Raw analysis output (JSON parse failed)"* row that **entered the findings list as a
  real finding**, and a round verdict of `OK` over a reply that parsed to nothing. **Audit it as
  code that lies, not as code that crashes.**
- **⚠️ `engine/audit.py` is the live copy; the root `audit.py` is a 4 KB stub.** Reporting a finding
  against the stub is reporting a bug in a file nothing runs.

---

## 3. The 15 agents

Each agent owns **one field**. Do not let an agent stray outside its field — the value of a swarm
is coverage without duplication, and fifteen agents all sweeping "security" is one agent that ran
fifteen times.

The probes under each agent are **starting points, not a checklist**. They point at places already
known to contain real defects.

### 3.0 THE FIELD MATRIX — audit every applicable field, and ONLY the applicable ones

Fifteen fields. **A field marked `—` for a repo is out of scope there and must produce ZERO
findings for that repo.** This is not decoration: UI/UX findings on a Python audit engine, or
"outreach compliance" findings on a browser harness, are findings about a system that does not
exist — and a report that invents them is worse than one that is short. Where a field does not
apply, say so explicitly in your output (`"n/a"`) rather than staying silent, so the reader can
tell "not applicable" from "we did not look".

| # | Field | helpotron | t2b | harness | orchestrator |
|---|---|---|---|---|---|
| 1 | **Security** — authentication & authorization | ✓ | ✓ | — | — |
| 2 | **Security** — tool-execution trust boundary | — | — | ✓ | ✓ |
| 3 | **Economics** — token economy & metering | ✓ | — | — | — |
| 4 | **Compliance** — outreach (TCPA/DNC/quiet hours) | — | ✓ | — | — |
| 5 | **Economics** — provider failure & spend | ✓ | ✓ | — | — |
| 6 | **Concurrency** — races & atomicity | ✓ | ✓ | ✓ | ✓ |
| 7 | **Data integrity** — migrations & idempotency | ✓ | ✓ | — | — |
| 8 | **Privacy** — PII & retention | ✓ | — | — | — |
| 9 | **UI / UX** — error states, empty states, honesty of display | ✓ | — | ✓ (the CLI) | — |
| 10 | **Reliability** — recovery & supervision | — | — | ✓ | ✓ |
| 11 | **Correctness** — silent failure & false success ★ highest-yield | ✓ | ✓ | ✓ | ✓ |
| 12 | **Hygiene** — dead code & stale prose | ✓ | ✓ | ✓ | ✓ |
| 13 | **Testing** — test quality & non-vacuity | ✓ | ✓ | ✓ | ✓ |
| 14 | **Efficiency** — performance & resource use | ✓ | — | — | ✓ |
| 15 | **Docs / onboarding** — documentation & config drift | ✓ | ✓ | ✓ | ✓ |

**★ FIELD 11 IS THE HIGHEST-YIELD FIELD ON THESE REPOS AND SHOULD BE WORKED HARDEST.** The class is
"a control that reports success and does nothing": a status flag read from a file instead of probed,
a function that returns `True` on the error path, a parse failure swallowed by a bare `catch`, a
save that writes where nothing reads. It has produced real, shipped bugs in **every** round so far,
in all four repos, including three in one afternoon. When you are unsure where to dig next, dig
here. Ask of every function: *if this silently failed, what would the caller see?*

**Every finding must carry its `field`** (see §10.1) so coverage is countable. A finding whose
field you cannot name is usually two findings, or none.

---

**AGENT 1 — Adversarial Security: authentication and authorization**
*Repos: helpotron, t2b*

Read: every credential parser, every route guard, the admin surface, the API-key path.

Probes:
- Enumerate **every** place that parses an `Authorization` header. Previous audits found the same
  class **three separate times**: a route module carrying its own private copy of the auth logic,
  which therefore never learned about a newly added credential type. A new credential only has to
  be forgotten in one of the duplicated copies. **Grep for the parse, not for the guard.**
- For each credential type, test the whole matrix: valid → allowed; revoked → refused; expired →
  refused; unknown → refused **with no reason given**. A 401 that explains *why* is free
  reconnaissance.
- Account-critical routes — minting a key, changing a password, checkout, billing, account
  deletion, data export — must refuse a revocable extension credential. Verify the guard runs
  **after** authentication, not before: with the wrong order, a key successfully **minted another
  key** (HTTP 200). This was real.
- Object-level authorization: enumerate every route taking an id parameter that is not the
  caller's own. A previous sweep flagged 13 and all 8 opened were false positives with a real
  ownership check one line away — so **check, do not assume, and report the route list either
  way.** A "clean" verdict with no enumeration is not evidence.
- An impersonation endpoint that mints a session for any account without re-auth is a takeover
  primitive. Check whether one exists and what guards it.
- **Do not re-raise anything in section 6.**

---

**AGENT 2 — Adversarial Security: the tool-execution trust boundary**
*Repos: webchat-to-api-harness, AI-coding-orchestrator*

This is the highest-consequence surface in the four repos: a language model writes a command, and
a machine runs it. Work it as an adversary, not as a reviewer.

Read: `sandbox.js`, `tools.js`, the command guard, the file writers, `subagents.js`.

Probes:
- **Enable bash first** (`BASH_ALLOWED=true`), or you are only testing whether the guard is off.
- Drive the path fence with real payloads, not theories: an absolute path outside the root;
  traversal (`../../../etc/passwd`); a **symlink inside the root pointing outward**; quoted,
  globbed and redirection forms. One earlier version of this check was refuted by driving it and is
  listed in section 6 — do not re-file it.
- **Any identifier that becomes part of a path or filename is untrusted input.** A job id
  assembled with `path.join(dir, id + '.json')` accepts `../`. This was real and is fixed.
- **A validation inside a `try/catch` whose caller swallows the throw is not a validation** — the
  invalid input and the missing input become indistinguishable. This was real and is fixed. Look
  for the same shape everywhere else.
- `edit_file`-style tools: check the `String.replace` semantics. In JavaScript the replacement
  string expands `$&`, `$1`, `` $` `` and `$'` — and **JSX and template literals are full of `$`**,
  so an edit can corrupt source silently. This was real, caught before shipping.
- The command deny-list should block only what is **(a) irreversible and (b) has no legitimate
  agent use** — disk/filesystem destruction, power and boot state, fork bombs, recursive mass
  `chown`, piping a remote script into a shell. Check it cannot be trivially bypassed by a shell
  builtin, an alias, or a path to a binary.
- Every outbound call needs a connect timeout **and** a response timeout. A relay that accepts a
  socket and then never answers hangs the caller forever with no error. This was real.
- **The sandbox is the security boundary; the deny-list is not.** If a finding's only control is
  the deny-list, say so explicitly.

---

**AGENT 3 — Token Economy and Metering**
*Repos: helpotron*

Read: the ledger writers, the charge paths, the balance gates, the settlement and watermark code.

Probes:
- **The concurrent double-bill pattern.** A per-**user** watermark combined with a per-**task**
  idempotency key means two concurrent tasks take the same baseline and each bill the entire
  window. This was real: **$0.02 + $0.03 of measured cost billed 5.00 + 5.00 = 10.00 cents against
  5.00 actual.** *An idempotency key scoped to the task cannot protect a window scoped to the
  user.* Check every settlement path for it.
- **Any hash, token or lookup key derived from a secret that rotates is a data-loss bug on a
  timer.** This was real: when a salt followed a rotating `SECRET_KEY`, **118 of 123 records**
  became invisible to their own owners. For each derived key, name what it follows and whether
  that thing rotates.
- **The gate must not be the charge.** A pre-flight check that also deducts means failure and
  success cost the same. A failure must bill nothing; a success must bill the measured amount.
  Check the old refund branch is gone — once nothing is charged up front, a refund mints a free
  token.
- **A read-modify-write on a JSON blob is not atomic.** Check for a row lock, **and** for the
  `rollback()` on the insufficient-balance path — without it the lock is held until the request's
  session closes, and a second concurrent task on the same account blocks behind it.
- A helper that writes its own ledger row (an `add_tokens`-style function): a caller that *also*
  writes one double-counts the grant in every audit sum. This was live.
- Only the operator account should be unmetered. **Check no paid plan short-circuits a charge** —
  a `plan == "elite"` early-return once let a subscriber consume unbounded upstream spend.
- Grep every balance setter for a clamp. Flooring at 0 is right for a top-up and **wrong for a
  settlement that exceeded the balance**, where the honest result is negative (and self-blocks).
- Check the ledger is the source of truth: anything that spends money and writes **no** ledger row
  is invisible to every charge, regardless of what it costs.

---

**AGENT 4 — Outreach Compliance**
*Repos: t2b*

Read: the send path end to end — consent, opt-out, quiet hours, rate limiting, and the provider
call itself.

Probes:
- Verify compliance **at send time, not at import time.** A previous finding claimed consent,
  opt-out and rate limits could not be verified at send time; it was **refuted** because the
  auditor read a 19-line **re-export shim** and never opened the package underneath. **Follow an
  import to the file that does the work before concluding anything about when a check runs.**
- Time-of-day windows: test the **boundaries** (exactly 09:00, exactly 20:00, the weekend branch),
  not the middle of a weekday. A previous claim of "no time-of-day restrictions" was refuted by
  driving the function for three times of day — do not re-file it.
- Opt-out must be checked on **every** channel independently. One channel checking it does not
  cover another.
- **An unbounded per-client map is an anonymous caller controlling your memory.** Check every
  limiter map for a bound, and for *what it drops*: dropping a bucket that has **refilled to
  capacity** is safe; dropping one that is merely old is a rate-limit bypass.
- A provider client with **no timeout** blocks its thread indefinitely. For some SDKs the timeout
  is not a constructor argument — it lives on the HTTP client. **Read the SDK; do not assume the
  parameter name.** This was real for Twilio: `Client.__init__` takes no `timeout`.
- **Check who owns the retry.** A silent client-level retry can double-send an SMS. Retries belong
  to the caller's queue.
- Distinguish a consent record from a consent *claim*: a value the caller supplies is not a
  credential.

---

**AGENT 5 — Provider Failure and Spend**
*Repos: t2b, helpotron*

Read: every outbound integration — payments, SMS, email, model providers, file storage,
detectors.

Probes:
- For each provider: connect timeout, response timeout, retry policy, and **who owns the retry**.
- **Webhook idempotency.** A handler without a uniqueness constraint on the provider's event id
  will double-apply on redelivery. Check the constraint is declared **and** that it exists on the
  live database — see the `create_all` trap in §2.1. This was real.
- A provider that is configured but **not installed** is a *latent* failure, not a live one. Rank
  it honestly instead of calling it critical.
- Check the failure mode of a partially-configured integration. A missing key that yields `None`,
  and a caller that treats `None` as "no data", turns a provider outage into a **silent success**.
  **A missing result must be distinguishable from an empty one** — returning `{}` where the caller
  needs `None` was a real defect because an empty result is indistinguishable from a filter that
  dropped everything.
- Cost: find anything that spends money and records nothing. A surface with no ledger row is
  invisible regardless of its price, so it can never be billed.
- Pricing that is billed per unit (per word, per character, per message) cannot be priced by a
  per-token rate table — it silently falls to a default and produces a meaningless number. Check
  every per-unit service for an explicit cost path.
- Check for a scheduled price change that will make a call **materially** more expensive.

---

**AGENT 6 — Concurrency and Races**
*Repos: all four*

This field produced the single most expensive real defect found so far. Work it hard.

Read: anything holding a watermark, a counter, a shared file, a mutex, a lock, or a cache.

Probes:
- **Watermark / idempotency-key scope mismatch** — see agent 3, then check the other three repos
  for the same shape. It is a pattern, not a one-off.
- A shared timestamp or state file written by multiple processes: is the read-modify-write atomic,
  and can two processes both conclude they are clear to send? Three lane gateways each spaced
  themselves correctly while still hitting the account together.
- **A lock's identity is not "a live pid".** A pid answers *"may I signal this?"*, not *"is this our
  process?"*. Measured: writing our **own** pid into a gateway pidfile made the running check
  return it. Check what each lock actually validates.
- **A cleanup whose condition depends on process uptime does not run on a fresh boot.** This was
  real: a limiter sweep of the form `now - started_up_at > TTL` never fired until the machine had
  been up longer than the TTL — and a test for it only passed *because* uptime exceeded 24 hours.
  On a fresh boot it failed. Check every sweep for what it measures elapsed time from.
- A mutex acquired but not released on every path — check the `finally`.
- A double-start guard where the "is it already running?" check and the spawn are separated by an
  `await`: both callers can pass the check and both spawn. This was real, and the fix introduced a
  second bug (the pidfile keyed on the **pre-renumber** port), which its own test caught.
- An in-memory cache or map that is never bounded, never swept, or swept only on one code path
  through it. An anonymous caller controls the size of a per-client map.
- Two tasks on one account each charged the full window — see agent 3. **Any accounting scoped per
  user but keyed per task is this bug.**

---

**AGENT 7 — Data Integrity, Migrations and Idempotency**
*Repos: helpotron, t2b*

Read: the models, the migration block, every write spanning more than one row, every importer.

Probes:
- **Count indexes against the live database, not the models.** (§2.1: 70 declared, 1 created.) Every
  model declaration is a *claim*; `PRAGMA index_list` on the live file is the evidence.
- Every migration must be idempotent, and idempotency must be **proven**, not intended. A migration
  that multiplies a stored balance needs a marker row — and the marker needs a real, non-nullable
  foreign key value, or the whole transaction rolls back silently and the migration quietly does
  nothing. This was real.
- **Back up before writing, and verify the backup exists before the write**, not after. Check the
  script's order.
- A multi-step write with no transaction leaves a half-state on failure. Name the recovery path.
- **A delete that touches only the database, where the record actually lives in a file** (or the
  reverse) — the delete returns 200, the UI refreshes, and the row is still there. This was real.
- An import or parse path that accepts a value it cannot store: check the **route signature's**
  type. A route declaring `entry_id: int` when the UI holds a string id rejects every real request
  with a 422 that the user reads as a raw validation body. This was real.
- Check that a per-record identifier used for lookup is stable. A deletion that keys on the wrong
  field deletes nothing and returns success.

---

**AGENT 8 — Privacy, PII and Retention**
*Repos: helpotron*

Read: the data lake, the scrubbers, the exporters, the logging, and the file permissions.

Probes:
- **Reachability first** (§1.3). A scrubber with no callers is a note, not a defect.
- For any scrubber that **is** called: drive it with one realistic mixed string and read the
  output. A previous one emitted `[ANONYMIZED_EMAIL] [REDACTED_EMAIL]` — **two markers, the second
  never replaced** — because each substitution wrote a replacement containing a placeholder that
  nothing consumed. It also left the person's name intact. Test with: email, phone, SSN, student
  id, and a human name, all in one string.
- **Check file modes, not just presence.** Two `.env` files and the live database were
  world-readable while a third `.env` was correctly `600` — so a presence-only sweep passed. This
  was real.
- Anything that leaves the machine must be checked for what it carries. A support report is a
  document built to be pasted into a **third party's** tracker: a stale or raw value there is a
  wrong fact *sent to someone else*. Check what the report payload includes and whether identity is
  separable from the diagnostic content.
- **A subprocess log captures whatever the process printed.** Never let a sandbox echo its
  environment — a run log held a plaintext secret for days this way. Check any process that prints
  its environment, its argv, or a config dump.
- Retention: does a delete actually delete, or set a flag? Is the recoverable-delete window
  intentional and documented?
- Anonymisation: check that a derived identifier is not reversible by a **dictionary attack**. A
  plain hash of an email is reversible because the address space is small; a keyed hash is not.

---

**AGENT 9 — UI, UX and Error States**
*Repos: helpotron, webchat-to-api-harness (the CLI)*

Read: every error path, empty list, loading state and disabled control.

**STANDING OWNER RULE, verbatim:**
> *"every error state should contain 3 things, concise showcasing of the error, explanation of the
> error, and a call to action, which can be a guided refresh button, report error to data lake,
> clear cache, etc depends on the type of error"*

Probes:
- **A blanket "Try Again" everywhere is itself the bug.** The action must match the cause: a
  validation error is not retryable with the same input; a stale deploy needs a cache clear, not a
  retry; an offline state has nothing to report because nothing reached the server. Check the mapping
  from cause to action, and check there is **one** place it is decided — a new error that can bypass
  it is a new error with no call to action.
- **A stale deploy is not a network error.** A failed dynamic import of a hashed chunk arrives as a
  fetch error, so it classifies as `network` and gets offered a retry that re-requests the same dead
  chunk. Check the classifier's **order**, because a stale-deploy error also reads like a fetch
  failure.
- **Raw backend internals on screen is the most-repeated UX defect on these repos** — found in
  three separate normalizers and five separate render sites. Grep for `JSON.stringify` on an error
  object, for `data.detail`, and for any `${e.message}` in a render path. A raw `FATAL GATEWAY 504`
  or a raw pydantic body is the user's entire impression of the product.
- A control that is **disabled** explains nothing. A control in a **busy** state that is still
  clickable invites the second click that double-submits. Check every primary action for both — a
  first click that looks ignored is what causes the second one.
- **Measure a layout; do not eyeball it.** Previous work found a slider rendering **6px** tall — an
  unusable hit area on the control that sets effort — and a primary nav label truncated to
  `Study B…` by four `flex:1 1 0` tabs. A screenshot caught the label; the numbers never would
  have. Do both.
- An empty state must distinguish **"you have none"** from **"your filter matched none"**. They need
  different copy and different actions.
- Check that a rendered string is the value the user thinks it is. A label reading `CREDITS` was
  rendering the **token** balance — the same number twice, under two names.
- In a TUI/CLI: check that a screen the user cannot reach, or a control that does nothing, is
  reported honestly rather than rendering as available.

---

**AGENT 10 — Reliability, Recovery and Supervision**
*Repos: webchat-to-api-harness, AI-coding-orchestrator*

Read: the process lifecycle, the health endpoints, the timeouts, the retry and backoff code.

Probes:
- **A health endpoint whose status code does not mean what it looks like.** Here `/health` returns
  **503 while the browser is not attached — which means UP**. Tooling that treats 503 as down
  reports a healthy service as dead. The inverse is worse: an endpoint that always returns 200
  while the thing behind it is broken. **Read the body**, and check that the honest endpoint is the
  one the dashboard consumes. A separate always-200 observation endpoint is the right shape; check
  it does not imply readiness it has not verified.
- **Distinguish "wedged" from "busy", and expose the numbers the operator needs.** The tell for a
  wedged renderer was: a frozen counter, a frozen byte count, a climbing timer, and **every process
  at 0.0% CPU**. *"No response" is not "still working"* — a busy page burns CPU. Check the recovery
  path keys on something durable: a recovery keyed on **message wording** silently stops working the
  day the wording changes, and this was real.
- A restart that reconnects to the same dead child fixes nothing. On this box, restarting the
  gateway while the **browser** was wedged re-attached to the corpse and the lane stayed dead. Check
  the recovery **order**.
- **A probe timeout shorter than a deliberate internal delay declares healthy work dead.** This was
  real: a 45s probe against a send gate that could wait 80s banned the only allowed model and killed
  a run at the start. Check every timeout against the longest legitimate wait inside it.
- **Retry classification.** A transient error not marked retryable causes a hard failure on a
  condition one retry would absorb. A throttle that **is** marked retryable *deepens* the limit.
  Check the order of the checks, because a throttle message usually also reads "try again later".
  This was real, and the ordering was the whole fix.
- **Long-running processes read their script once at boot.** Editing the file is inert until the
  process restarts — this applied to the gateway, the opencode serve, and three shell watchers.
  Report it wherever a config or code change would not take effect live.
- Permission and identity checks: verify against **real** system state, not a fixture. A check that
  matched `server.js` as a substring also matched `mcp-server.js`, so the MCP process would have been
  accepted as the gateway. Test against real pids from `/proc`.

---

**AGENT 11 — Correctness and Silent Failure — THE HIGHEST-YIELD FIELD**
*Repos: all four*

**Give this agent the most effort.** §1.4 explains why: every real, high-value defect on these repos
was of this shape, and none of them look like a bug when you read the code — they look like working
code. The whole class is invisible to a reader who is looking for a crash.

Read: every writer, every reporter, every status flag, every decision function that returns a value
from a fallback.

Probes:
- **Find every place a stored flag is read as a live fact.** A status in a file is a *memory*, not
  an *observation*. `grep -rn` for it — **the call sites are never just one.** The count for one flag
  here was **eight**: a dashboard header, a browser screen, the problem report, three CLI screens, and
  the MCP. Every one of them reported a stale fact as current. **Any "connected / ready / healthy"
  indicator must be derived from a probe at render time, and an unproven state must render as
  *nothing* rather than as a reassuring word.**
- **Find every writer whose saved location is not the reader's location.** Write to `.env` and read
  from `process.env`; write to one config file and read from another; write to the live tree when the
  test means a scratch directory. This was real, three times, in one session. **Two write paths for
  one value is one path too many.**
- **Find every display of a value that is not the effective value.** A settings screen showing a
  different number from the one in force, or reporting `unset` for something that is running, is a
  display that lies. Same class as a wrong status flag: the number is the evidence, and it was wrong.
- **Find every `catch` that swallows to a benign value.** `return null` / `[]` / `{}` from a failed
  operation makes *failure* indistinguishable from *empty*, and a caller cannot choose correctly
  between them. Ask of every one: **does an empty result differ from an error?** It must.
- **Find every "success" computed from the input rather than observed from the effect.** A loop
  reporting `ran: actions.length` reports what was **sent**, not what happened. This was real: the
  agent said it scrolled and the page never moved. **An action that produced no observable change is
  not evidence of work.**
- **Find every fallback that substitutes a default when a configured value is missing** — and check
  it cannot substitute something **not on the approved list**. *A control that lapses precisely when
  the system is stressed is not a control.* This was real: a model allowlist lapsed under load, and
  the fallback sent ten audit prompts to an **unaudited provider**.
- A validation that reads the wrapper's field instead of the payload's (or vice versa) sees nothing
  and passes. Compare the shape at the read site against the shape at the write site. This was real:
  a read dug into the wrong nesting level and "proved" a bug that did not exist.
- A default applied in one place and displayed from another — the worst version is a default applied
  by the **runtime** and reported as `unset` by the **display**.
- **Anything that must outlive a request, survive a restart, or be true after a crash** — check it is
  written where the next process will look, not just where this one does.

---

**AGENT 12 — Dead Code and Stale Prose**
*Repos: all four*

Read: the comments next to changed behaviour, docstrings, orphaned modules, and anything that
describes another file.

Probes:
- **A comment that describes the intent is not evidence the code does it.** This is the highest
  hit-rate sub-probe in this field. A caller's comment asserting the callee "already carries the full
  content for read_file" — while the code **stripped** it — cost a full debugging cycle and produced a
  fabricated answer. **Read the comment, then read the function it describes, and report the
  divergence.**
- **A comment that names the canonical source and gets its numbers wrong is worse than a wrong
  literal**, because the next reader trusts it as documentation. One comment read *"mirrors
  server/plans.py (trial 150, $10/300, $20/1000, $40/2700)"* — naming the right file and quoting
  values that were stale by 100×. Check every comment that cites another file or a specific number.
- **Duplicated logic where only one copy was fixed.** The same idiom existed in two functions and a
  find-and-replace hit the wrong one. When auditing, **check both sites**; a syntax check cannot see a
  logical corruption.
- **A duplicated `module.exports` / re-declaration where the second silently discards the first.**
  This was real: three exports resolved to `undefined` with no error anywhere, and nothing imported
  them yet, which is the only reason it was harmless.
- Functions defined and never called. **Report with the caller count from `grep`, in their own
  section** — do not rank them as defects (§1.3).
- **A test that writes into live state.** A test called a path helper that resolved to the **real**
  config directory and wrote a wrong port into the installed config — so *running the suite corrupted
  the product*. **Check what every path helper resolves to before trusting a fixture.**
- Stale numbers anywhere a user reads them — a price, a version, a limit that changed in code and not
  in the copy. This class **regrew twice** after being fixed, and one instance was in the Terms of
  Service. **Any tier number in a component is a bug on a timer.**
- Unfinished code in the shipped path: `pass` bodies, `# implementation here`, stubs returning canned
  values, a script that only appends `# <<<FIX ...>>>` placeholder comments. **Distinguish a
  deliberate, documented stub from an unfinished one, and say which** — a stub that reports success is
  the §1.4 class.

---

**AGENT 13 — Test Quality**
*Repos: all four*

Read the test files, and for each assertion ask: **what would still pass if the code were deleted?**

Probes:
- **Assertions that cannot fail.** A test asserting a string exists in a file when the string is in
  the test itself proves nothing. A test asserting `>= 3` items where the real invariant is
  "well-formed and non-empty" breaks on a legitimate one-item release. A test asserting a string is
  *absent* that would also pass on an empty file.
- **Non-determinism, and its cause.** A suite whose pass count moves between identical runs cannot be
  evidence. Causes found here: default test concurrency; and an assertion on an exact row count
  against a **persistent shared** database. Fix the cause; never loosen the assertion.
- **Tests that reach live state** — a live server, a live database, a live config directory, a live
  browser. One test also *failed* specifically because it reached the live service. A test must be
  runnable twice, in any order, on a machine that is in use.
- **Tests that pass by accident of environment.** One passed only while the machine's uptime exceeded
  24 hours; on a fresh boot its cleanup condition was never met. If an outcome depends on uptime, the
  time of day, or an env var that happens to be set, **say so, and say whether the TEST or the CODE is
  wrong.** Here the test was right and the code was wrong — and the finding was originally filed the
  other way round.
- **A test that asserts on the input rather than the effect.** A routing test that calls the handler
  function directly will pass while the route is bound to a **different** function. This was real: a
  route decorator sat on the wrong handler, and only an HTTP-level test could see it. **For anything
  with a route, a decorator, or a dispatch table, assert through the real entry point.**
- **A fake that ignores the operation it is supposedly exercising.** One merge test passed straight
  through a real bug because its fake database never applied the write. Check every double actually
  applies the effect.
- **A test that is non-vacuous by construction.** For any test written to prove a fix: reverting the
  fix must fail **exactly one** test. Ask for that for every new test in the plan.
- Critical paths with no test at all: the money path, the auth path, the deletion path, the migration.
- A test that asserts on a **proxy** for the feature rather than the feature — a file containing a
  string, rather than the endpoint responding or the page rendering.

---

**AGENT 14 — Performance and Resource Use**
*Repos: helpotron, AI-coding-orchestrator*

Read: the hot loops, the pollers, the startup path, and anything that runs on a timer.

Probes:
- **Blocking I/O inside an async handler.** A synchronous HTTP client called from an `async def`
  route blocks the event loop for the duration. This was real: a 240s synchronous call froze the
  whole API. Check every outbound call on an async path for `asyncio.to_thread` (or an async client).
  **Note that the same call is harmless from a plain `def` route** — so check the route's own
  signature, not just the call.
- **A full-table or full-scan operation on a timer.** This was real: a poller walked every user's
  settings every 3 seconds regardless of how many bots were running. Check the poll interval against
  the cost, and whether it can early-exit when there is nothing to do.
- **A poll that runs whether or not anyone is looking.** Polling endpoints counted for ~96% of all
  recorded traffic — leaving a dashboard open *raised* the traffic graph. Check that background
  polling is classified separately from user requests.
- Unbounded growth: caches, maps, lists, log files, uploaded files, transcript directories. Check the
  bound and the eviction.
- **A scan that reports a number a human will act on must be accurate.** A file-scope estimate stated
  **4,109 files** where the real engine scanned **~840**, turning an 173-hour job into a reported
  **848-hour** one. *A planning tool that over-reports is worse than none: it changes the decision.*
  Check every count that a human or an agent will base a plan on.
- Repeated expensive work in a render or request path: a scan re-run because a screen called it
  twice, a config re-parsed per request, a graph rebuilt on every view.
- Check resources are released: browser pages, file handles, database sessions, child processes.

---

**AGENT 15 — Documentation, Onboarding and Config Drift**
*Repos: all four*

Read the READMEs, the guides, the in-product copy, the `.env.example` files, and the setup scripts.

Probes:
- **A documentation claim is a finding only if you checked it.** Several past "X is not documented"
  findings were false because the README **did** name the file — in a combined form
  (`popup.html / .js`) that a filename grep missed. **Search the documentation for the thing before
  claiming it is absent, and search for the stem as well as the full name.**
- **Copy that describes a feature that no longer exists.** A deleted valuation engine was still
  described in the user guide. **When a feature is removed, grep the docs** — prose outlives code.
- **Setup instructions that do not work.** Run them. A documented command that fails, a port that
  nothing serves, a path that moved. The health-check script here probed a port nothing listened on
  and therefore stayed silent forever — a monitor that cannot fail.
- **`.env.example` drift.** A key in the example that nothing reads; a key the code requires that is
  missing from the example; a value in the example that would be insecure if copied.
- **Two config files where only one loads.** This has caused two separate "I changed it and nothing
  happened" incidents here (`server/.env` in helpotron; an `.env` under `roofing-lead-bot/` in t2b).
  Check every repo for a config file that exists but is never read, and **report it explicitly** — an
  inert config file is worse than a missing one, because it looks configured.
- Documented limits and defaults that disagree with the code. Where a README states a default, find
  the actual default and compare.
- Onboarding friction that is a defect rather than a preference — a first run that fails, a required
  step that is not mentioned, an error message that does not name the fix.

---

## 4. THE EVIDENCE CONTRACT — non-negotiable

Sections 4.1 to 4.7 apply to **every** finding from **every** agent. A finding that violates them is
worse than no finding: it wastes a verifier's time and it teaches the reader to distrust the whole
report.

### 4.1 Read the lines before you cite them

**If you have not seen the construct in those exact lines, you may not claim it is there.**
§1.2 gives two verbatim cases of what happens otherwise.

### 4.2 A line range must be a range, not a file

`1-200`, `1-50`, `1-100` are not ranges, they are **a file**. A finding whose range is the whole file
is treated as **unsupported**. Cite the lines that contain the defect.

### 4.3 If you cannot locate it precisely, say so

Write `"line_range": "N/A"` and set confidence to `LOW`. An honest *"I could not locate this
precisely"* is a useful result. An invented line number is not.

### 4.4 Name the construct you are claiming

"Contains hardcoded credentials" is checkable — the literal must be visible in the cited lines.
"Potentially insecure" is not a finding. **Every finding must name the function, the expression, the
literal, or the call that is the defect.**

### 4.5 Do not report your own missing context as a defect

A finding that a file has "no graph data available" or was "not provided in batch" describes *this
audit's inputs*, not the code. Put those in a separate `analysis_gaps` array. Never as a finding.

### 4.6 Reachability is part of the finding

`grep -rn <symbol>` for callers (excluding the definition) before treating anything as a defect. State
the caller count. **Zero callers means the `dead_code` list, not the findings list** (§1.3).

### 4.7 Verify by driving, not by reading

Where a finding can be tested, **test it, and paste the command and its real output.** Not a
description of what you would run — the output.

- `sandbox.js`'s path fence was reported broken twice; both reports were **refuted by driving it**,
  which showed every payload denied.
- t2b's "no time-of-day restrictions" was refuted by calling the function at 03:00, 10:00 and 22:00.
- helpotron's "scrubber leaks" was confirmed *true* as code and *inert* as a defect, because `grep`
  showed zero callers.

**A finding you have driven and reproduced is worth ten you have reasoned about.** And a refutation
you have driven is equally valuable — see section 5.

### 4.8 Classify each finding, because they are not equal

At the top of each finding, mark it:

- **`CHECKABLE`** — a named construct at a real line range, plus a repro command. These are the ones
  worth reading, and they are the **only** ones that may be ranked `CRITICAL` or `HIGH`.
- **`SUGGESTION`** — "migrate X", "replace Y", "unify Z", "consider W". Legitimate, but it is a
  design opinion, not a defect. Rank it `LOW`/`INFO` and put it in its own section.
- **`DEAD_CODE`** — true, but nothing calls it. Own section (§1.3).
- **`GAP`** — a question you could not answer. Own section.

**A `SUGGESTION` may never be filed as `CRITICAL`.** Previous audits' "critical" bucket was mostly
architectural preferences wearing a severity label.

### 4.9 Rank by consequence, and rank honestly

- **A CRITICAL must be reachable now, on the live system, by an actor who exists.** A real weakness in
  a feature that is unconfigured and whose dependency is not installed is **latent** — rank it
  `HIGH (latent)` and say why, rather than calling it critical.
- Conversely, do not downgrade something because it is inconvenient: a defect that overcharges a
  paying customer is critical even when it is short.

---

## 5. Refutation is a result — report it as one

**Several of the most useful outcomes of previous audits were refutations.** They changed what should
be done, and acting on the filed version would have *broken working code*:

- A report said a gear unit test asserted inverted behaviour. The **test was right and the docstring
  was backwards**: `speed = 46.5 / g` means a higher gear is slower, which is exactly what the test
  asserted. "Fixing" the test would have introduced a regression.
- A report said `require_admin` fell through to a session cookie. Reading the branch order showed the
  cookie is only read in the `else` path. **No downgrade path exists.**
- A report said an audit function was a stub. It has real persona context, a real system prompt and a
  real model call — only the JSON-parsing half is unproven.

So: when you investigate something in section 6 or 7, or anything you suspect and then disprove,
**say so explicitly, with the evidence**. A refutation needs: the claim, the file and lines you read,
what you ran, and the conclusion.

**Do not pad the findings list to avoid reporting an empty section.** An agent whose field yielded
nothing of substance, and which says so, is doing its job. An agent that invents three medium findings
to look productive is the failure mode this whole brief is built around.

---

## 6. DO NOT RE-RAISE — hand-verified refutations

These were investigated by hand, by driving the code. **They are settled.** If you believe one is
wrong, you must **reproduce it and paste the output** — a fresh assertion is not a re-opening.

| Refuted claim | How it was settled |
|---|---|
| harness `sandbox.js` PATH_TOKEN regex bypass | Driven with bash **enabled**: `cat /etc/passwd`, `tar -czf /tmp/x.tgz /etc`, quoted forms, `grep -r secret /root/.ssh`, `echo hi > /etc/motd` — **all DENY**. The regex catches quoted, globbed and redirection forms. |
| harness `sandbox.js` path traversal via deep nesting | Driven: `checkPath('/etc/passwd')` → DENY; `root+'/../../../../etc/passwd'` → DENY; a **symlink inside the root pointing at `/etc`** → DENY. `path.resolve` normalises `..` before the realpath check. The cited line range did not contain the named function. |
| `server.js:110-120` command injection in `run_bash` | The cited range is a **line-diff implementation** (`added`/`removed`, an LCS table). No command execution at all. `run_bash` lives in `src/tools/tools.js` and is gated by `sandbox.checkCommand()` then the deny-list. |
| t2b lacks time-of-day restrictions (TCPA 8am–9pm) | `is_quiet_hours` **is** called on the send path and behaves: **03:00 quiet, 10:00 not, 22:00 quiet.** Windows are Mon–Sat 09:00–20:00, Sun 12:00–21:00. |
| t2b `judge.py` has a circular dependency | `ai_filter` does not import `judge`; both import orders succeed. Real but minor: `judge.py` reaches into private internals (`_filter_cache`, `_lead_signature`, `_sanitize_for_llm`) — a coupling smell, **not a cycle**. |
| `change_settings` in both CRITICAL and ROUTINE permission sets | **Inert.** `ROUTINE_ACTION_TYPES` is **defined and never read anywhere**. `evaluate_action_permission` tests `is_critical` and returns before routine is consulted. |
| `humanize_text` needs no approval in ANY mode incl. MANUAL | Driven for all three modes: **manual → refused** ("Manual mode requires explicit approval for all actions"), auto → allowed, yolo → allowed. |
| helpotron `credits.py` 'free': 15000 contradicts README 'trial' | The README already documents the trial grant. The tier **key** and the marketing **name** differ, which is not a defect. |
| helpotron `scrub_pii` / `anonymize_student_submission` inconsistency leaks PII | **TRUE about the code, useless as a defect** — `grep -rn` returns **zero callers** for both. See §1.3. **Both are now DELETED** (§7.1, `71648b0`), so this is closed in both directions: do not report the inconsistency and do not report their absence. They were also measured: `scrub_pii` emitted two markers with the second never replaced; the other missed an SSN. |
| t2b duplicate `auth_bp` registration (`app.py:126-127`) | **Not a defect, and not the vulnerability the wording implies.** Driven through `app.url_map`: every auth endpoint is live on BOTH `/api/auth/*` and `/auth/*`. It is **not a rate-limit bypass** — the limiter keys on **`login:{ip}:{email}`** (`api/auth.py:140`), not on the route. Both surfaces are genuinely used by the frontend (12 hits on `/auth/request-otp`, 4 on `/api/auth/register`, …) and `ac17b74` added the unprefixed one deliberately. The real defect is only that the router table carries two names for one blueprint. **Left alone on purpose: removing it would break two test files** (`test_security_remediation.py`, `test_otp_abuse.py`) whose assertions are about rate limiting and OTP abuse. |
| "`datetime.utcnow()` is deprecated — replace it with `datetime.now(timezone.utc)`" | **The obvious fix is a LIVE OUTAGE here.** These values are written to and compared against plain `DateTime` columns, and SQLite hands them back **naive**, so the aware form raises `TypeError: can't compare offset-naive and offset-aware datetimes` — measured (`naive < aware`). It would 500 every API-key check carrying an expiry. The correct equivalent keeps it naive and matches what `credits.py` already did: **`datetime.now(timezone.utc).replace(tzinfo=None)`**. Fixed for real in `d73947e`. ⚠️ An aware datetime used as a **SQL bind parameter** (`monitors.py`, `security.py` — which works) is not the same thing and must NOT be flagged; a guard that fails on working code is an outage dressed as diligence. |
| helpotron "the DB has almost no indexes, the models declare 70" | **Refuted.** The **live** DB has **72 indexes across 36 tables**; the "1 index" reading came from the stale root decoy DB. |
| `gdocs_exporter.py` has a hardcoded Google OAuth client id/secret | `grep` for OAuth → **0 matches** in the file. |
| `export.py` uses HMAC-SHA256 with a hardcoded secret `'export-signing-key'` | **0 repo-wide matches.** |
| `credits.py:85` generates predictable referral codes with `random.random()` | The referral route uses `secrets.token_hex(20)`; `credits.py` does not import `random` at all. |
| `migrate_token_unit_100x.py` has float precision loss in financial data | `bal * 100` is **exact** for every integral token balance (12/12 tested). Tokens are integers. |
| `background.js` stores API keys in `chrome.storage.sync` | The key lives in **`storage.local`**, which does not sync. `.sync` holds the server URL and the theme. |
| `admin_advanced.py` "lacks authentication" | It is a **service class with zero route decorators**. Every route serving it lives elsewhere and calls `require_admin`. |
| `create_admin.py` has a hardcoded default admin password | The match was a **docstring usage line** showing how to pass the password as an environment variable. The code reads `os.getenv` and falls back to `secrets.token_urlsafe(16)`. |
| `probe_vision_models.py` is vulnerable to SSRF | It uses a hardcoded path constant and **has no argv at all**. |
| A file is "a 600-line monolithic script" | The file is **254 lines**. A stated size must be checked. |
| README-naming claims (multiple) | The README **does** name the file, in combined form — a filename grep missed it. |
| `sandbox.js`'s deny-list allows `mkfs`, `shutdown`, fork bombs | **Fixed**, not refuted — the rule was restated: block only what is irreversible *and* has no legitimate agent use. |

---

## 7. ALREADY FIXED — do not report these as live defects

Re-reporting a fixed issue wastes the reader's time and makes the report look unreliable. If you
encounter one of these, note it as **verified fixed** with the evidence, not as a finding.

- **helpotron:** `sympy.sympify` RCE in `run_shell` (now blocked two independent ways;
  `import math; print(math.sqrt(16))` still works, which matters — a guard that blocks everything is
  an outage). Org-create self-promotion to platform admin. The concurrent double-bill
  (`usage_cents_between`). The `scrub_pii` callers (none). The rate-limiter key leak (bounded + swept).
- **t2b:** cross-tenant consent forgery; unauthenticated writes on the experiments route; the session
  epoch; the Twilio client timeout; the unbounded public-consent limiter map.
- **harness:** `subagents.js` job-id path traversal; `readJob`'s swallowed validation throw; the hub
  relay's missing timeouts; the `run_bash` deny-list; the model-id namespace bug; `ANTHROPIC_MODEL`
  never being set; the launch-config port (was 8181, is 8081).
- **harness, honesty class:** the `connected` flag in all eight sites; the MCP default-gate
  preference; pid identity (`pidLooksLikeGateway`); `freePortPair` collision + `startGateway` blind
  spawn; the non-deterministic test command; the send-gap defaults (20–80s → 3–6s) and its settings
  routing.
- **orchestrator:** the model-allowlist lapse under load; the A–Z tie-break choosing a stub model;
  the probe timeout (45s → `AUDIT_PROBE_TIMEOUT`, 240s); target-typo resolving to the orchestrator's
  own directory; unbuffered stdout; the exclusion list disagreeing with the engine.

### 7.1 Fixed SINCE the last audit — these are the newest and the most likely to be re-reported

The previous audit ran, its findings were worked, and **eleven more defects were fixed and pushed.**
They are listed here with their commits so you can verify the fix rather than take this document's
word for it. Reporting any of these as a live defect means the report is out of date.

**helpotron** (`audit-remediation-20260925`):
- `44e9fab` — **inbound SMS fails closed.** `_verify_twilio_signature` returned `True` when
  `TWILIO_AUTH_TOKEN` was unset, so anyone who knew a target's phone number could POST `Body=STOP`
  to `/api/auth/sms/inbound` and flip `sms_opt_out`, blocking their 2FA. It now refuses.
  **This is a deliberate live behaviour change: inbound opt-outs are refused until the owner adds
  `TWILIO_AUTH_TOKEN`.** An explicit `TWILIO_ALLOW_UNVERIFIED_INBOUND=1` re-enables the old path.
  Do not report the refusal as a bug — it is the fix.
- `44e9fab` — **the event loop block at its SECOND call site.** The 2026-09-18 fix wrapped the 240 s
  POST in `_forward` and missed `_service_health`, which `/api/hygiene/status` calls directly.
- `99b42f3` — **an API-key scope is a path grant, not a string prefix.** `path.startswith(scope)`
  meant a key scoped to `/api/task` also opened `/api/tasks`, `/api/task_admin` and
  `/api/tasks/delete`. Now `scope_covers()` requires a segment boundary.
- `d73947e` — **`datetime.utcnow()` removed, 7 sites.** The obvious replacement
  (`datetime.now(timezone.utc)`) is a **live outage** here: these values are compared against plain
  `DateTime` columns and SQLite returns them naive, so it raises
  `TypeError: can't compare offset-naive and offset-aware datetimes`. The correct form is
  `datetime.now(timezone.utc).replace(tzinfo=None)`. See §6 — do not "fix" this back.
- `71648b0` — **six unreachable functions deleted** (`charge_with_rollback`, `deduct_credits_atomic`,
  `get_user_credits`, `add_credits_to_user` in `credits.py`; `scrub_pii`,
  `anonymize_student_submission` in `datalake.py`). They are gone; do not report them, and do not
  report their *absence* as a gap either. ⚠️ `main.py:1585` still defines its own `async def
  get_user_credits` — a **route handler** sharing the name. That one is live.

**t2b** (`audit-remediation-20260925`):
- `d36d155` — **the Telegram idempotency key is scoped by chat.** It was
  `str(message_id or f"tg_{chat_id}_{hash}")`, which drops the chat whenever a `message_id` is
  present — and a Telegram `message_id` is a **per-chat sequential integer**, so two conversations
  both sending their 5th message derived the key `"5"` and the second was silently dropped. Now
  `tg_<chat_id>_<message_id or hash>`.

**webchat-to-api-harness** (`main`):
- `1e078f5` — `cdpAlive()` called **any** port that answered a browser. It and `cdpTargets()` read the
  same port and disagreed inside one frame. It now requires the body to identify CDP.
- `8bcba9b` — `browserRunning()` accepted any live pid; liveness is not identity. It now requires
  `chrome` + `--remote-debugging-port` in **argv**.
- `74153a6` + `b9235de` — `stopGateway()`/`stopHub()` claimed `stopped:true` immediately after
  SIGTERM. They now wait, escalate to SIGKILL, and on a real failure **keep the pidfile** so the
  process stays reachable. Both share one `terminateAndConfirm()`. Note `isAlive()` counts **zombies**
  as alive — `processExited()` is the correct question.
- `6fa8230` — **`resolveAll(raw, …)` took `raw` with no default**, so `resolveAll()` resolved against
  `undefined` and every **file-backed** setting fell through to its default (measured: 45 → 17
  settings). Its own comment claimed the opposite. The same commit fixed the **git push guard**,
  which compared a branch *word* to `main`/`master` and therefore allowed `HEAD:main`,
  `refs/heads/main`, `+main` (a force push) and `feature/x:main`.
- `35c10fd` — the README now documents that `/health` returns **503 when the browser is not
  attached, which means UP**, and that `/metrics` is always 200.

**AI-coding-orchestrator** (`audit-tooling`):
- `0cf464c` — the `READ MME alignment` typo in the no-SoT prompt block.
- `8a2e0e3` — the **root `audit.py` stub was deleted** (a 92-line one-shot for a report that no
  longer exists; it could not run). The live engine is `engine/audit.py`. The README pointed at the
  deleted file and has been corrected. **Do not go looking for a root `audit.py`.**

---

## 8. Read these before you start

Do not re-derive what is already written down. These exist and are current:

- `~/Roni_workspace/audits_plans/audit-summary.json` — the previous sweep's counts per repo.
- `~/Roni_workspace/audits_plans/cross-eval.json` — the cross-repo comparison.
- `~/Roni_workspace/audits_plans/{harness,helpotron,t2b}/` — per-repo findings, per-pass artifacts,
  execution plans, and the rendered `code_audit_9_25.md` reports.
- `~/Roni_workspace/AI-coding-orchestrator/tools/audit_prompt.md` — the engine's own prompt; it
  carries the evidence requirement this section enforces.
- `helpotron/plans/mega-audit-2026-09-22-extended.json` — the 72-finding consolidated plan from the
  last full helpotron audit, with per-finding verdicts. **Read the refuted entries especially.**
- `helpotron/graphify-out/graph.json` (9,999 nodes) and `t2b/graphify-out/graph.json` (1,447 nodes) —
  traverse these instead of grepping blind. `graphify query "<question>" --graph <path>`,
  `graphify explain "<symbol>"`, `graphify affected "<symbol>"` (real impact analysis),
  `graphify god-nodes --top 20`.

**Do not run `graphify extract`, `cluster-only` or `label`** — a rebuild overwrites the graph and the
labelling pass needs an LLM backend this box does not have.

---

## 9. Hard constraints

### 9.1 Never
- **Never touch `~/.claude/**`.** Not its settings, hooks, transcripts, plugins or CLI.
- **Never commit or push from this audit.** Produce a plan; do not change the repos.
- **Never print, echo or log a secret, token, key or `.env` value.** Read programmatically; keep it on
  disk. Redact anything you quote.
- **Never write throwaway rows into a production database**, and never point a test at it.
- **Never start helpotron's public site** or remove its maintenance banner. The API stays up.
- **Never `pkill -f "<pattern>"` or `pgrep -f "<pattern>"` and then kill that list from the same
  shell.** The pattern matches your own process and you kill your own session. This has happened. Use
  the bracket form and put the loop in a **script file** so the literal pattern is never in the
  invoking shell's argv — or kill by explicit pid.
- **Never `git stash`** to compare against a baseline — it can pop a foreign stash left by another
  session. Use `git worktree add /tmp/opencode/baseline HEAD`, or run the failing test in isolation.
- **Never restart a live service as your verification.** Order: edit → syntax/import check → tests →
  restart → verify the endpoint → drive the feature.
- **Never conclude a long-running process has failed from a client-side timeout.** Confirm against its
  own health endpoint and log first.

### 9.2 Scratch environment, so you cannot corrupt the live one
- Pin the database **and** the data directory: `DATABASE_URL=<scratch file> DATALAKE_DIR=<scratch dir>`.
  Pinning only the DB **polluted the live data lake** with four real telemetry rows during a previous
  pentest. Set both.
- Pin the state directory for the harness: `WEBCHAT_STATE_DIR` (and `ENVIRONMENT=development` for
  helpotron). These exist precisely so a test never touches live state.
- Anything that spawns a server: use a non-default port.

### 9.3 The rule that matters most for the harness
**Nothing in `webchat-to-api-harness` has ever been found by reading it.** Every real defect came from
driving it and observing the difference. Four examples, all in our code and none in the model:

1. A tool-call parser **rejected the shape the model actually used** (flat arguments vs nested
   `params`), so every call was discarded, a correction was sent, the model retried in the same shape,
   and it eventually fabricated a summary. A parser that rejects valid input is indistinguishable from
   a model that cannot produce valid output.
2. The harness **stripped content from what the model could see**, so it answered from a guess — a
   canary file's contents came back as an invented value, confidently.
3. A thread reset **reported success over a thread it never touched**, so a job could answer a prompt
   from an unrelated conversation.
4. A whole-file write arrived with **raw newlines inside a JSON string**, which is invalid JSON: the
   entire write was discarded and the run reported success.

**So: start the thing, drive it, and read back the effect.** A green suite proves the code compiles.

### 9.4 The lane you may be running on is not trustworthy either
If you use the webchat lane or any model lane to help: **its summary is a claim, never evidence.** It
has reported tests passing while they failed, and reported work complete over an untouched tree. Run
the suite it names, yourself.

---

## 10. Deliverable

### 10.1 One plan file
`~/Roni_workspace/helpotron/plans/SWARM-AUDIT-<YYYY-MM-DD>-round2.json`

```json
{
  "generated": "<ISO date>",
  "scope": { "<repo>": { "path": "...", "branch": "...", "head": "<sha>" } },
  "agents": [ { "n": 1, "field": "...", "repos": ["..."], "findings": 0, "refutations": 0 } ],
  "counts": { "raw": 0, "checkable": 0, "suggestion": 0, "dead_code": 0, "gap": 0, "refuted": 0 },
  "findings": [
    {
      "id": "<REPO>-<FIELD>-<NN>",
      "class": "CHECKABLE | SUGGESTION | DEAD_CODE | GAP",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
      "confidence": "HIGH | MEDIUM | LOW",
      "repo": "<repo>",
      "file": "<path relative to the repo root>",
      "line_range": "<start-end | N/A>",
      "construct": "<the exact function / expression / literal you are claiming>",
      "field": "<ONE of the 15 fields in §3.0, named verbatim — this is how coverage is counted>",
      "finding": "<one sentence>",
      "why_it_matters": "<the consequence, in plain language>",
      "repro": { "command": "<the exact command you ran>", "observed": "<its real output>" },
      "callers": "<n, from grep -rn>",
      "proposed_fix": "<one sentence>",
      "test_to_write": { "path": "<test file>", "must_fail_without_fix": true, "body": "<the test body>" },
      "verify_command": "<one command that proves the fix>",
      "done_when": "<an observable statement, not an intention>"
    }
  ],
  "refutations": [
    { "claim": "...", "file": "...", "read": "<lines>", "ran": "<command + output>", "conclusion": "..." }
  ],
  "field_coverage": [
    { "field": "<one of the 15>", "repo": "<repo>", "status": "findings | clean | n/a",
      "note": "<for 'clean', what you actually looked at; for 'n/a', why the field does not apply>" }
  ],
  "dead_code": [ { "symbol": "...", "file": "...", "callers": 0 } ],
  "analysis_gaps": [ { "repo": "...", "what_i_could_not_check": "...", "why": "..." } ],
  "execution_order": [
    { "wave": 1, "theme": "...", "finding_ids": ["..."], "rationale": "..." }
  ]
}
```

### 10.2 A human-readable report
`~/Roni_workspace/helpotron/plans/SWARM-AUDIT-<date>-round2.md` — ranked by consequence, one section per
agent, with the refutations and the dead code in their own sections. **Lead with what is actually
wrong**, not with methodology.

### 10.3 What must be true of the plan
- **Every `field` in §3.0 that applies to a repo is accounted for**: either it produced findings, or
  it appears in `field_coverage` as `"n/a"`. A field silently skipped is indistinguishable from a
  field that was never looked at, which is the whole failure §3.0 exists to prevent.
- Every `CHECKABLE` finding has a real `file`, a real `line_range`, a named construct, a repro with
  real output, and a caller count.
- Every `CRITICAL` is reachable now, by an actor who exists, on the live system — or is explicitly
  labelled latent.
- Every finding that needs a code change carries `test_to_write` whose reverting **fails exactly one
  test**, and a `verify_command` that is content-only where steps share a build.
- `execution_order` is **waves**, each independently verifiable, ordered to fail fast: the risky and
  uncertain work first, while changing direction is still cheap.
- `analysis_gaps` is filled honestly. An empty one means you checked everything, which is a strong
  claim — make sure it is true.

---

## 11. Definition of done

You are done when:

1. All 15 agents have reported — including any that found nothing, saying so explicitly.
2. Every `CHECKABLE` finding's cited lines **contain** the construct claimed.
3. Every refutation has its evidence recorded.
4. Nothing from section 6 has been re-filed without a reproduction.
5. Nothing from section 7 has been reported as live.
6. Nothing in the four repos has been modified, committed or pushed.
7. Both deliverables exist at the paths in section 10, and the JSON parses.
8. You have presented the findings and **stopped**. You have not started implementing.

**The single test for whether this audit was worth running:** could a competent engineer read any one
of your findings, open the file at the line you cited, and see the thing you described? If not, that
finding is not done — remove it or downgrade it to a `GAP`.

A short report of ten real, verified findings beats a long one of eighty guesses. **You will not be
judged on volume. You will be judged on whether the things you wrote down are true.**
