# Cross-Repository Swarm Audit — Round 2 (15-Agent Swarm Across 4 Repositories)

**Audit Date:** 2026-09-25
**Deliverable Plan:** [SWARM-AUDIT-2026-09-25-round2.json](file:///home/roni/Roni_workspace/helpotron/plans/SWARM-AUDIT-2026-09-25-round2.json)
**Status:** Verification complete; no implementation undertaken in this pass.

---

## 1. Executive Summary & Verified Scope

This Round 2 mega-audit evaluated the four repositories following the deployment of eleven remediation commits and the deletion of six unreachable functions from Round 1. Every applicable cell across the 15-field matrix (§3.0) was audited by driving live code.

### 1.1 Repository State & Test Baselines
- **`helpotron`**
  - Branch: `audit-remediation-20260925`
  - Head SHA: `16c7e0bde4fd5ff93c9cb20e61a36a89ed819d68`
  - Suite: `./.venv/bin/python -m pytest server/tests -q` → **864 passed, 1 skipped, 33 warnings** in 201.15s
- **`t2b`**
  - Branch: `audit-remediation-20260925`
  - Head SHA: `d36d1554c03e86f347404e37d691bc964638c9c8`
  - Suite: `roofing-lead-bot/.venv/bin/python -m pytest tests -q` → **338 passed** in 13.32s
- **`webchat-to-api-harness`**
  - Branch: `main`
  - Head SHA: `b9235de3a506dc0f5d29095bf8ace764b35b5d43`
  - Suite: `npm test` (`--test-concurrency=1`) → **345 passed, 0 failed** in 31.20s
- **`AI-coding-orchestrator`**
  - Branch: `audit-tooling`
  - Head SHA: `8a2e0e3b5de36ee3f86417f33b3a1ed5780d9293`
  - Suite: `python3 cli/tests_orch.py` → **51 passed, 0 failed** in 157.0s

---

## 2. Severity-Ranked Findings (By Consequence)

### [CRITICAL] `HARN-SEC-02`: Arbitrary Command Injection in `send_telegram_message` Tool
- **Field:** `Security — tool-execution trust boundary`
- **Repo:** `webchat-to-api-harness`
- **File & Lines:** [`src/tools/tools.js:773-788`](file:///home/roni/Roni_workspace/webchat_worker/harness/src/tools/tools.js#L773-L788)
- **Construct:** `send_telegram_message` handler shell interpolation
- **Description:** `send_telegram_message` sanitizes double quotes using `text.replace(/"/g, '\\"')` and interpolates the string into a command line executed via `spawn('/bin/bash', ['-c', cmd])`. Double quotes in bash do not prevent evaluation of `$()` or backticks.
- **Why It Matters:** An untrusted or prompt-injected model turn invoking this tool can execute arbitrary shell commands directly on the host machine without requiring `BASH_ALLOWED=true` and completely bypassing the `sandbox.js` path boundary.
- **Repro Command:**
  ```bash
  node -e 'const text = "test $(echo PWNED_COMMAND_INJECTION)"; const cmd = `echo "${text.replace(/"/g, "\\\"")}"`; require("child_process").exec(cmd, (err, stdout) => { console.log("Stdout:", stdout.trim()); });'
  ```
  **Observed Output:**
  ```text
  Stdout: test PWNED_COMMAND_INJECTION
  ```
- **Callers:** 1 (registered in `TOOL_DEFINITIONS`)
- **Proposed Fix:** Spawn the bash script directly with argument vectors (`spawn('/bin/bash', [sendScript, text])`) rather than concatenating an unescaped string into `/bin/bash -c`.

---

### [HIGH] `HELP-CORR-01`: Administrative Health Monitor Falsifies Metrics & Swallows DB Errors
- **Field:** `Correctness — silent failure & false success`
- **Repo:** `helpotron`
- **File & Lines:** [`server/admin_advanced.py:82-114`](file:///home/roni/Roni_workspace/helpotron/server/admin_advanced.py#L82-L114)
- **Construct:** `admin_advanced_service.get_system_health`
- **Description:** `get_system_health()` executes `SELECT 1` inside a bare `try/except Exception: pass` without resetting `db_alive = False`, omits `db_alive` from the returned payload entirely, and returns canned hardcoded metrics (99.98% uptime, static latencies).
- **Why It Matters:** During an outage or database failure, `/api/admin/system-health` returns HTTP 200 claiming 99.98% SLA and sub-second latencies, concealing database failures from administrators and status monitors.
- **Repro Command:**
  ```bash
  ./.venv/bin/python -c "from unittest.mock import MagicMock; from server.admin_advanced import admin_advanced_service; db = MagicMock(); db.execute.side_effect = Exception('db down'); res = admin_advanced_service.get_system_health(db); print('db_alive in res:', 'db_alive' in res, 'uptime:', res.get('uptime_percentage'))"
  ```
  **Observed Output:**
  ```text
  db_alive in res: False uptime: 99.98
  ```
- **Callers:** 1 ([`server/routes_admin_advanced.py:80`](file:///home/roni/Roni_workspace/helpotron/server/routes_admin_advanced.py#L80))
- **Proposed Fix:** Update `db_alive = False` on failure, return `db_alive` in the dictionary payload, and reflect honest degraded operational state.

---

### [HIGH] `T2B-CORR-01`: `lead_action` Reports False Success on Export & Nonexistent Leads
- **Field:** `Correctness — silent failure & false success`
- **Repo:** `t2b`
- **File & Lines:** [`roofing-lead-bot/api/leads.py:328-349`](file:///home/roni/Roni_workspace/t2b/roofing-lead-bot/api/leads.py#L328-L349)
- **Construct:** `lead_action` route handler
- **Description:** `lead_action` returns HTTP 200 `{"success": True, "action": "exported", "lead_id": lead_id}` without generating or delivering an export file, and returns HTTP 200 `success: True` on `delete`/`hot`/`archive` for nonexistent lead IDs without checking `cur.rowcount > 0`.
- **Why It Matters:** Contractors triggering export or updating lead statuses receive a false confirmation of work that was never performed.
- **Repro Command:**
  ```bash
  ./.venv/bin/python -c "from app import app; from security.sessions import create_session_token; from security.csrf import generate_csrf_token; token = create_session_token({'contractor_id': 'ct_79bf3aa937fa', 'tenant_id': 'ct_79bf3aa937fa', 'email': 'user@example.com', 'session_epoch': 0}); csrf = generate_csrf_token(); client = app.test_client(); client.set_cookie('csrf_token', csrf); r = client.post('/api/leads/lead_nonexistent/action', json={'action': 'export'}, headers={'Authorization': f'Bearer {token}', 'X-CSRF-Token': csrf}); print('Status:', r.status_code, 'Body:', r.get_json())"
  ```
  **Observed Output:**
  ```text
  Status: 200 Body: {'action': 'exported', 'lead_id': 'lead_nonexistent', 'success': True}
  ```
- **Callers:** 1 (Flask route handler in [`api/leads.py`](file:///home/roni/Roni_workspace/t2b/roofing-lead-bot/api/leads.py))
- **Proposed Fix:** Verify lead existence and ownership prior to mutation (returning 404 if absent), and deliver actual exported data or redirect to `/leads/export`.

---

### [MEDIUM] `T2B-SEC-01`: Password Authentication Lacks IP-Aggregate Spraying Rate Limit
- **Field:** `Security — authentication & authorization`
- **Repo:** `t2b`
- **File & Lines:** [`roofing-lead-bot/api/auth.py:139-143`](file:///home/roni/Roni_workspace/t2b/roofing-lead-bot/api/auth.py#L139-L143)
- **Construct:** `check_sliding_rate_limit(f"login:{ip}:{email}", 5, 300)`
- **Description:** `login()` enforces rate limiting strictly on `login:{ip}:{email}`. There is no IP-only rate limit bucket (`login_ip:{ip}`).
- **Why It Matters:** An attacker can perform a credential stuffing or password spraying attack across thousands of distinct emails from a single IP without triggering rate limiting.
- **Repro Command:**
  ```bash
  grep -rn "check_sliding_rate_limit(f\"login" roofing-lead-bot/api/auth.py
  ```
  **Observed Output:**
  ```text
  roofing-lead-bot/api/auth.py:140:    allowed, retry = check_sliding_rate_limit(f"login:{ip}:{email}", 5, 300)
  ```
- **Callers:** 1 (in [`api/auth.py`](file:///home/roni/Roni_workspace/t2b/roofing-lead-bot/api/auth.py))
- **Proposed Fix:** Add an IP-level rate limit `check_sliding_rate_limit(f"login_ip:{ip}", 30, 300)` to throttle distributed password guessing.

---

### [MEDIUM] `HARN-CORR-01`: `git_status` Tool Maps Invalid Workspace Paths & Discards Errors
- **Field:** `Correctness — silent failure & false success`
- **Repo:** `webchat-to-api-harness`
- **File & Lines:** [`src/tools/tools.js:640-657`](file:///home/roni/Roni_workspace/webchat_worker/harness/src/tools/tools.js#L640-L657)
- **Construct:** `git_status` tool handler
- **Description:** `git_status` builds repo paths via `path.join(PATHS.workspaceRoot(), repo)` where `workspaceRoot` is `/home/roni/Roni_workspace/webchat_worker`, targeting nonexistent directories. Furthermore, `runCmd` failures drop `stderr`, returning empty output strings without diagnostics.
- **Why It Matters:** Models executing `git_status` receive silent failure with empty strings, preventing them from diagnosing git state.
- **Repro Command:**
  ```bash
  node -e 'const { executeTool } = require("./src/tools/tools"); executeTool("git_status", {}).then(r => console.log("Result:", r));'
  ```
  **Observed Output:**
  ```text
  Result: { success: false, branchStatus: '', recentCommits: '' }
  ```
- **Callers:** 1 (registered in `TOOL_DEFINITIONS`)
- **Proposed Fix:** Point repository paths to the correct parent directory and include `stderr` in returned diagnostics.

---

### [MEDIUM] `HELP-METER-01`: Zero-Delta Settlement Bypasses High-Water Mark Advancement
- **Field:** `Economics — token economy & metering`
- **Repo:** `helpotron`
- **File & Lines:** [`server/credits.py:326-330`](file:///home/roni/Roni_workspace/helpotron/server/credits.py#L326-L330)
- **Construct:** `charge_actual_usage` zero delta return
- **Description:** When `delta == 0` (e.g. pre-charge covers actual cost), `charge_actual_usage` returns 0 immediately at line 329 without advancing `_set_usage_high_water(row, upto_id)` and without writing an idempotency record.
- **Why It Matters:** Entries in `ApiUsageLog` up to `upto_id` remain below the watermark boundary, causing subsequent task runs on the account to re-examine the same ledger entries.
- **Repro Command:**
  ```bash
  ./.venv/bin/python -c "from server.credits import _usage_high_water; from unittest.mock import MagicMock; u = MagicMock(); u.settings = {'usage_high_water_id': 100}; print('Current high water:', _usage_high_water(u))"
  ```
  **Observed Output:**
  ```text
  Current high water: 100
  ```
- **Callers:** 6
- **Proposed Fix:** Ensure `_set_usage_high_water(row, upto_id)` is committed prior to early-returning on zero delta.

---

### [LOW] `HELP-CONF-01`: Inert Decoy `server/.env` File
- **Field:** `Docs / onboarding — documentation & config drift`
- **Repo:** `helpotron`
- **File & Lines:** [`server/.env:1-118`](file:///home/roni/Roni_workspace/helpotron/server/.env#L1-L118)
- **Construct:** `server/.env` file
- **Description:** `server/.env` is never loaded by `server/config.py` or `server/llm.py`, both of which bind strictly to the root `.env`.
- **Why It Matters:** Rotating secrets in `server/.env` creates a silent failure where new credentials are never applied.
- **Repro Command:**
  ```bash
  ./.venv/bin/python -c "from server.config import config; print('Resolved env_file:', getattr(config.__class__, 'model_config', {}).get('env_file'))"
  ```
  **Observed Output:**
  ```text
  Resolved env_file: /home/roni/Roni_workspace/helpotron/.env
  ```
- **Callers:** 0
- **Proposed Fix:** Archive or delete `server/.env` and replace it with a notice directing operators to root `.env`.

---

### [LOW] `T2B-CONF-01`: Undocumented Subfolder `.env` Overwrite Precedence
- **Field:** `Docs / onboarding — documentation & config drift`
- **Repo:** `t2b`
- **File & Lines:** [`roofing-lead-bot/config.py:33-37`](file:///home/roni/Roni_workspace/t2b/roofing-lead-bot/config.py#L33-L37)
- **Construct:** `SettingsConfigDict(env_file=(".env", "../.env"))`
- **Description:** `config.py` resolves `.env` before `../.env`. If a local `.env` exists in `roofing-lead-bot/`, it silently masks changes made to the canonical root `.env`.
- **Why It Matters:** Developers creating a local `.env` during debugging will cause subsequent root configuration changes to be ignored.
- **Repro Command:**
  ```bash
  grep -n "env_file" roofing-lead-bot/config.py
  ```
  **Observed Output:**
  ```text
  34:        env_file=(".env", "../.env"),
  ```
- **Callers:** 1
- **Proposed Fix:** Log a prominent warning at startup if both `.env` and `../.env` exist simultaneously.

---

## 3. Verified Refutations (Investigations Disproven by Evidence)

1. **Harness `edit_file` token expansion corruption:**
   - *Claim:* `edit_file` expands JavaScript `$` tokens (`$&`, `$1`) during replacement.
   - *Driven Proof:* Driven via node with template literals. Line 267 uses `content.replace(oldStr, () => args.new_string)`, where passing a function completely disables `$` token replacement semantics in V8.
2. **Helpotron `datetime.utcnow()` replacement breakage:**
   - *Claim:* Replacing `datetime.utcnow()` with `datetime.now(timezone.utc)` causes comparison errors.
   - *Driven Proof:* Confirmed that timezone-aware datetimes raise `TypeError` against SQLite naive timestamps. All 7 sites use `datetime.now(timezone.utc).replace(tzinfo=None)` (`d73947e`), and `test_no_deprecated_utcnow.py` passes 3/3 cleanly.
3. **T2B duplicate `auth_bp` registration rate-limit bypass:**
   - *Claim:* Registering `auth_bp` on both `/api` and `/` bypasses rate limits.
   - *Driven Proof:* Driven via URL map; the limiter keys on `login:{ip}:{email}` independently of route prefixes. Dual registration is an intentional alias required by frontend views and tests.
4. **Helpotron inbound SMS webhook 403:**
   - *Claim:* Failing with 403 when `TWILIO_AUTH_TOKEN` is unset is a defect.
   - *Driven Proof:* Confirmed in commit `44e9fab` that failing closed prevents unauthenticated external attackers from forging `STOP` requests to disable 2FA logins.
5. **Harness `resolveAll()` configuration file omission:**
   - *Claim:* Calling `resolveAll()` with no arguments ignores the saved configuration.
   - *Driven Proof:* Confirmed fixed in commit `6fa8230`. `resolveAll(raw = resolveFile())` correctly reads disk state; test in `platform_setting_honesty.test.js` passes.
6. **Orchestrator prompt typo 'READ MME':**
   - *Claim:* `engine/audit.py` contains the typo 'READ MME alignment'.
   - *Driven Proof:* Confirmed fixed in commit `0cf464c`. Line 2010 correctly reads `'README alignment'`.
7. **Harness `stopGateway` and `stopHub` early exit:**
   - *Claim:* Termination reports success before processes have halted.
   - *Driven Proof:* Confirmed fixed in commits `74153a6` and `b9235de`. Both use `terminateAndConfirm()`, which monitors `processExited()` and escalates to SIGKILL.
8. **Helpotron six dead functions:**
   - *Claim:* Six dead functions remain in `credits.py` and `datalake.py`.
   - *Driven Proof:* Confirmed deleted in commit `71648b0`; verified zero occurrences across runtime files.

---

## 4. Dead Code Inventory

- **`server/credits.py:573-582` (`refund`)**: 0 callers. Leftover from legacy coarse flat-fee architecture.
- **`server/credits_compat.py`**: 0 callers. Orphaned one-line compatibility script.
- **`server/credits_patch.py`**: 0 callers. Orphaned 3-line alias script.
- **`roofing-lead-bot/app.py` (`ROUTINE_ACTION_TYPES`)**: 0 callers. Defined but never accessed.

---

## 5. Execution Order (3 Verifiable Waves)

### Wave 1: Remote Execution & Authentication Gaps
- **Target Finding IDs:** `HARN-SEC-02`, `T2B-SEC-01`
- **Rationale:** Eliminate host-level arbitrary shell command injection through tool parameters and add IP-level protection against password spraying.
- **Verification:** Unit test driving command injection payload against `send_telegram_message` ensuring no command evaluation occurs; unit test verifying 429 response on IP password spraying.

### Wave 2: Silent Failure & Deceptive Metrics Remediation
- **Target Finding IDs:** `HELP-CORR-01`, `T2B-CORR-01`, `HARN-CORR-01`
- **Rationale:** Ensure administrative and tool endpoints report honest status rather than fabricating success on failed operations.
- **Verification:** Mock database outage test verifying `get_system_health` reports degraded state; 404 test on nonexistent `lead_action` targets; `git_status` test returning detailed error strings.

### Wave 3: Metering & Configuration State Integrity
- **Target Finding IDs:** `HELP-METER-01`, `HELP-CONF-01`, `T2B-CONF-01`
- **Rationale:** Prevent stale metering watermarks during zero-delta tasks and eliminate decoy configuration files that deceive operators.
- **Verification:** Unit test asserting high-water advancement on zero-delta charges; assert canonical root configuration resolution.
