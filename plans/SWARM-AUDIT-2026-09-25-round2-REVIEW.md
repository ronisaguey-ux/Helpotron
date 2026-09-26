# Round 2 — Review & Enhancement

**Reviewed by:** opencode · **Date:** 2026-09-25
**Raw audit:** `SWARM-AUDIT-2026-09-25-round2.json` (unchanged, kept as evidence)
**Enhanced plan for execution:** `SWARM-AUDIT-2026-09-25-round2-enhanced.json`
**Previous round:** `SWARM-AUDIT-2026-09-25.json` (untouched)

Every finding below was **driven against the working tree** before this plan was accepted. Nothing
here rests on the auditor's word — the audit was right about the substance and wrong about several
details, and one finding it reported as dead code does not exist in the repo it named.

---

## 1. Verdict

| | count |
|---|---|
| Findings reported | 8 |
| **Confirmed real** (I reproduced each) | **6** |
| Real but already mitigated / currently latent | 2 |
| Refuted | 0 |

**The CRITICAL is genuine, and it is worse than filed.** That is the headline.

---

## 2. The CRITICAL — `HARN-SEC-02`, command injection in `send_telegram_message`

`src/tools/tools.js:779-788` builds a shell string and escapes only double quotes:

```js
const cmd = `set -a; … bash "${sendScript}" "${text.replace(/"/g, '\\"')}"`;
spawn('/bin/bash', ['-c', cmd], …)
```

**Double quotes do not stop bash expanding `$(…)` or backticks.** I drove the exact escaping:

| payload | what the send script received |
|---|---|
| `test $(echo PWNED_SUBSTITUTION)` | `test PWNED_SUBSTITUTION` — **evaluated** |
| ``test `echo PWNED_BACKTICK` `` | `test PWNED_BACKTICK` — **evaluated** |
| `hi $(cat /etc/hostname)` | `hi roni-saguey-HP-ENVY-Laptop-13-ad1xx` — **the host was read** |

### Two things the audit missed, which raise the severity

1. **It fires even when the send script is missing.** The default script path
   (`…/oculus/scripts/…/send-telegram.sh`) does not exist on this box. Bash expands the
   substitution *before* it tries to exec, so the injection still ran — I proved it by creating a
   side-effect file from a payload while the script was absent. The tool is therefore exploitable
   on a machine where it otherwise appears not to work at all.
2. **Nothing gates it.** `send_telegram_message` is in `TOOL_DEFINITIONS`, in the executable set,
   has **no `available()` predicate**, and does not route through `sandbox.js` or `BASH_ALLOWED`
   (which only guards `run_bash`). So the model-driven path to host command execution is open.

**This must be step 1 of wave 1.** It is the only finding here that lets a prompt-injected model
turn execute arbitrary commands on the host.

---

## 3. Finding-by-finding review

| id | sev | verdict | evidence I ran |
|---|---|---|---|
| `HARN-SEC-02` | CRITICAL | **REAL, amplified** | Command substitution and backticks both evaluated; host name read into a file; fires with the script absent; no availability gate. |
| `HELP-CORR-01` | HIGH | **REAL** | Read the handler: `db_alive` set `True`, `db.execute` in a bare `except: pass`, never set `False`, never returned; uptime/latencies/error-rates/incidents are hardcoded literals. |
| `T2B-CORR-01` | HIGH | **REAL** | `export` returns `success:True` producing nothing; delete/hot/archive never check `rowcount`, so a nonexistent lead reports success. |
| `T2B-SEC-01` | MEDIUM | **REAL** | Login has only `login:{ip}:{email}`. The same file already uses `otp_ip:{ip}` / `otp_verify_ip:{ip}` — so this is an omission, not a design choice. |
| `HARN-CORR-01` | MEDIUM | **REAL** | `workspaceRoot()` is `…/webchat_worker`, so repo paths resolve to `/…/webchat_worker/<repo>`, which do not exist. Driven: `{success:false, branchStatus:'', recentCommits:''}` with no diagnostic. |
| `HELP-METER-01` | MEDIUM | **REAL** | `_set_usage_high_water` is called at line 363 **only**, after the `if delta == 0: return 0` at 328-329. Same class as the concurrent double-bill fixed in `4e25466`. |
| `HELP-CONF-01` | LOW | **ALREADY MITIGATED** | The file is genuinely not loaded — but it already carries a loud `THIS FILE IS NOT LOADED BY THE RUNNING SERVICE` header. The proposed fix is already done. |
| `T2B-CONF-01` | LOW | **LATENT, not active** | Precedence is as described, but there is **no local `roofing-lead-bot/.env`** on disk, so nothing is shadowed today. |

---

## 4. Corrections I made to the plan

These are defects **in the audit's output**, not in the code — worth separating, because a plan
carrying them would send the executor somewhere useless.

1. **Dead code mis-attributed.** The audit put `ROUTINE_ACTION_TYPES` in **t2b's `app.py`**. It is
   not in t2b at all (0 occurrences). It is helpotron's **`server/overlord_agent.py:103`**.
   A step built on the audit's version would have edited a file that does not contain the symbol.

2. **Every t2b `verify_command` was unrunnable as written.** They were written as if run from the
   t2b root:
   ```
   roofing-lead-bot/.venv/bin/python -m pytest roofing-lead-bot/tests/…
   ```
   That fails — proved it: `ModuleNotFoundError: No module named 'state_store'`. The app uses
   top-level imports, so pytest must run with **CWD = `roofing-lead-bot/`**. All t2b commands are
   now `(cd roofing-lead-bot && ./.venv/bin/python -m pytest tests/… -q)`, and I validated that form
   against an existing test (3 passed) plus the helpotron and harness forms.

3. **Two Node test bodies were missing their imports.** They called `test()` and `assert` with no
   `require('node:test')` / `require('node:assert')`, so they would have failed with
   *"test is not defined"* before testing anything. Bodies completed with their headers.

4. **`HELP-CONF-01` reclassified** from "to fix" to "verify only" — the header is already there.

5. **`T2B-CONF-01` reclassified** as latent — recorded as a trap for the future, not a live bug.

---

## 5. What I added: the plan is now executable

The audit's `execution_order` listed only **wave / theme / finding ids / rationale** — no files, no
changes, no commands. That is a summary, not something an executor can follow, and it is the same
gap that made round 1's plan unusable.

The enhanced plan carries **seven fully-specified steps**. Each one has:

- exact **file** and **line range**
- the **change** in words precise enough to apply, including what must *not* change
- the **test to write**, marked `must_fail_without_fix`
- a **verify command** — written in the exact form I ran successfully
- the **suite that must stay green**, with its current number recorded
- an **observable `done_when`**

**Waves:**
- **Wave 1 — remote execution & auth:** `HARN-SEC-02` (the CRITICAL), `T2B-SEC-01`
- **Wave 2 — silent failure & deceptive metrics:** `HELP-CORR-01`, `T2B-CORR-01`, `HARN-CORR-01`
- **Wave 3 — metering & config integrity:** `HELP-METER-01`, `T2B-CONF-01`

`HELP-CONF-01` is recorded under `not_a_step` with the reason, so it is visibly *decided*, not
forgotten.

**Baselines to hold (measured by the auditor, re-checkable):**
helpotron **864 passed / 1 skipped** · t2b **338 passed** · harness **342** · orchestrator **51**

---

## 6. Refutations — the audit got these right

All 8 refutations are consistent with the fixes made earlier today (`d73947e`, `44e9fab`, `6fa8230`,
`0cf464c`, `74153a6`, `b9235de`, `71648b0`). It correctly identified the inbound-SMS refusal as the
**fix** rather than a bug, which was the easiest thing here to get backwards.

Four of the eight are refutations of things that were *live* last round and are fixed now — which is
the correct behaviour from a fresh session reading an updated brief.

---

## 7. Open gaps the audit declared itself

Two, both stated honestly rather than papered over:

- `helpotron` — object-level authorization across every route was not exhaustively enumerated.
- `webchat-to-api-harness` — the swarm/subagent runtime was not driven end to end.

Neither is claimed clean. Treat both as unknown, not as verified.

---

## 8. Recommendation

**Execute wave 1 first and alone.** `HARN-SEC-02` is a host command-execution path reachable by a
model-driven tool call; it should not wait behind metering or config tidying. Waves 2 and 3 are
independent of it and of each other.
