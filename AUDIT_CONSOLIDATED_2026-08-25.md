# Helpotron Consolidated Audit — 10-dimension full report + fix plan

**Date:** 2026-08-25 · **Scope:** entire repo (server, web, extension, pipeline, MCP, deploy) · **Method:** 10 parallel read-only subagent audits, line-referenced, runtime-probed where noted. Nothing was modified.

---

## 0. Scoreboard

| Severity | Count |
|---|---|
| CRITICAL (must fix before any public launch) | **8** |
| HIGH | **24** |
| MEDIUM | 31 |
| LOW | 22 |
| **Total findings** | ~85 (deduped across lanes; 3 duplicate-families merged) |

**Verdict: the app is NOT Cloudflare-serverless-fit as it stands** (local SQLite + on-disk lake + per-process in-memory state). It IS fixable in two tiers: (1) security + correctness emergency fixes — hours; (2) CF architecture refactor (container backend + Postgres + R2) — days.

---

## PART A — CRITICAL (block any public launch)

### A1. Git-tracked LIVE secrets — rotate NOW, purge history before pushing anywhere
`.agents/mcp_config.json` (git-tracked, commit 43fdcc7, no .gitignore) contains **plaintext live credentials**: Telegram bot token `8668566979:...` (live), DeepSeek API key `sk-f445f2a5...` (live), GitHub PAT `ghp_7GRB7A...` (DEAD but still leaked).
Also in repo source: `scripts/create_admin.py` + `set_password.py:12-16` hardcode **`RoniDev` / `••••••••••••`** (the live admin password).
**Fix:** rotate Telegram + DeepSeek keys, change admin password; `git rm --cached .agents/mcp_config.json` + gitignore it; `git filter-repo` purge the secrets from ALL history (they are in commits, not just working tree); source secrets from env only; add a secret-scan pre-commit/CI gate.

### A2. JWT signing key is the hardcoded repo default — forged admin JWT possible
`server/security.py:37` — `JWT_SECRET = getattr(config, 'JWT_SECRET', 'helpotron_production_super_secret_key_change_me_in_env')`. **Verified at runtime:** `hasattr(Settings(), 'JWT_SECRET') == False` (config field is lowercase `jwt_secret`) → the getattr default always wins. `.env` sets `JWT_SECRET=42893f...` but nothing ever reads it. Known-key HS256 → attacker issues `{sub:<admin id>, role:"admin"}` → full admin API; also `verify_jwt_token` (security.py:334, admin.py:39, routes_features.py:42) and `create_jwt_token` all use it.
**Fix:** `JWT_SECRET = config.jwt_secret`; refuse to start in `production_mode` if default present; collapse config.py's separate module-level alias so only one key exists.

### A3. Unauthenticated free elite-plan / +4000-credit minting
`server/routes_auth_2fa.py:290` `verify_purchase_challenge` — unknown `public_id` → **user auto-created accepting ANY password, never validated**; the 2FA code is sent to `payload.destination` (client-supplied, line 279). Attack: `POST /2fa/purchase-challenge {public_id:"x", destination: attacker@mail}` → attacker gets the code → `POST purchase-verify` → `plan="elite"` + 4000 credits, `Payment(status="captured")` with attacker-chosen `amount_cents`. No session, no CSRF, no link between account and destination.
`server/payments.py:152` + `main.py:977` `POST /api/payments` — same class: for any provider except stripe, records `status="manual"` and credits `amount_cents/100` with no proof, no auth.
`main.py:1017` `/api/refund` — **always 500** (`credits.Payment` doesn't exist; verified `hasattr` == False, also wrong signature for `refund_unused`).
**Fix:** tie code to the registered destination; require a session; derive plan/price server-side; restrict credit grants to verified Stripe webhook only (manual = `pending`); import the real `Payment` model.

### A4. 2FA is trivially removable and mostly never enforced
`routes_auth_2fa.py:234` `disable_two_factor` — `payload.code` (min 6 chars) **never validated**; POST with `{user_id: victim, code:"000000"}` anonymously disables 2FA + erases TOTP secret.
`main.py:461` `/api/login` — issues a session cookie but **never checks 2FA** on login.
`auth_2fa.py:113-127,160-168` — "graceful mock": unconfigured SMTP/Twilio `send_email`/`send_sms_async` return True with codes logged to INFO — in a misconfigured prod deploy, 2FA "succeeds" while codes are in the logs.
**Fix:** authenticated dependency + real TOTP/challenge verification on disable; enforce 2FA at login; in production_mode fail instead of mock-True and never log codes.

### A5. Unauthenticated legacy surface — public_id IS the identity (IDOR everywhere)
`main.py:962,710,973,692,752` — `/api/dashboard/{public_id}`, `/api/status`, `/api/credits`, `/api/assignments`, material endpoints call `get_or_create_user(db, public_id)` with **no session check**. Knowing a public_id lets you read settings/assignments/materials/transactions AND **charge the victim's credits** (`_generate` → `credits.charge` line 440; `/api/transcribe`; `/api/style/upload` overwrites the victim's writing style).
`main.py:1175-1216` — `/api/draft/{draft_id}` GET/retry/admin: sequential int ids, no owner check → read any user's drafts, free infinite regen (no charge on retry).
`main.py:1097` + `agent_session.py` — `/api/agent/{session_id}` + `/ws/agent/{session_id}` unauthenticated (12-hex ids guessable); `detach()` sets `status="disconnected"` on ANY close → attacker drop flips a live run to disconnected (mid-run refund logic at main.py:1082).
`services` lane also found: unauthenticated `/api/hygiene/...` endpoints (services), feedback/datalake reads with no auth (security lane).
**Fix:** route ALL of these through `Depends(get_current_user)` modeled on `assignments.py`, filter `user_id == current_user.id`, 404 not 403 for unknown ids; charge on draft retry; owner-check the agent WS.

### A6. Dump upload: unauthenticated + filename path traversal → arbitrary file write
`server/routes_dump.py:23-66` `POST /api/dump/upload` — no auth dependency (both other dump routes were IDOR-patched; this one wasn't, per the BATCH-04 comment on line 121). Trusts `user_id` from the Form field (line 26), auto-creating ANY user → upload under any identity. CSRF skipped entirely when there is no session cookie (`csrf.py:60-62`).
`server/assignment_dump.py:223-226` — `safe_name = f"{uuid.hex[:8]}_{filename}"` then `open(DUMP_DIR/safe_name, "wb")` with raw client filename → `..\..\..` segments resolve **outside** DUMP_DIR (arbitrary file write as the app user). The sanitizer magic (`server/file_utils.py:sanitize_upload_path`) exists but is never called. Reference pattern to copy: `server/agent_files.py:33-37`.
`GET /api/dump/list?user_id=<victim>` (routes_dump.py:69-114) — unauth, returns full `extracted_text` of any user. `POST /api/assignment/{id}/export-gdocs` (main.py:1252) — no owner check, leaks events content by sequential id.
**Fix:** auth dependency; `sanitize_upload_path` + uuid-only disk names; scope list to session identity; assignment owner filter.

### A7. Browser extension: manifest pattern is INVALID — the extension cannot load at all
`extension/manifest.json` content_scripts host: `*://*.canvas.*/*` — invalid match pattern (`*.canvas.*` wildcard in the middle host segment is not a valid pattern). **Every browser rejects the whole manifest** → extension fails to load anywhere. Everything below A7's fix is invisible until this is fixed.
Also in this lane: no `tabs` permission but `t.url` accessed → crash; `startRecording` popup message has **no background handler** (record button dead); host_permissions are **localhost-only** → broken on CF; `span:contains("Due")` is a jQuery pseudo-class — `querySelector` throws SyntaxError, Google Classroom scrape always crashes (UI/UX lane independently confirmed); content.js advertises 9 platforms but manifest injects only Canvas/instructure; MV3 `setInterval` dead (badge never refreshes); in-memory SW state drops the subagent on eviction; hardcoded `public_id:'RoniDev'` identity collapse.
**Fix:** correct patterns (`*://*.canvas.instructure.com/*` etc.), add `tabs`/`activeTab`, wire the recorder, env-driven `HOST` for CF, replace `:contains()` with manual filter, expand injection per the 9-platform claim, move state to `chrome.storage`, `public_id` from storage/settings.

### A8. Cloudflare serverless blockers (architecture)
Local on-disk state everywhere: SQLite `helpotron.db` (CWD-relative; two possible DBs depending on launch cwd); `data_lake/` JSONL + `datalake_storage/` ghost dir + dead `DATA_LAKE_DIR` env; `./uploads`, `./exports`, `./exports/sandboxes` CWD-relative FS; `StaticFiles("./uploads")` mount; engine `lifespan` runs asyncio loops + subprocess pipelines (fine in a container, dead in a Worker); in-memory `AgentManager` sessions (per-process, gone on cold start); sandbox subprocess spawn (no subprocess in Workers). **Verdict: CF Pages/Workers-only will not run this app.**
**Fix (CHOSEN ARCH):** container backend (CF Containers / Cloud Run) + Postgres (Neon/CF D1 is not enough — this is blob+JSONL heavy) + R2 for uploads/lake/exports; keep Pages for `web/` static; worker proxy for the extension API + WS; move WS agent sessions to a durable store (Postgres-backed session table w/ heartbeat, or Durable Objects if staying on Workers). Deploy hygiene too: `Dockerfile` CMD port 8000 hardcode, `.env.example` must NOT be copied as live env, duplicate competing systemd units (pipeline audit), `secure=False` cookies behind the proxy, CORS from the demo origin.

---

## PART B — HIGH (functional/data integrity)

| # | Severity | Where | Issue | Fix |
|---|---|---|---|---|
| B1 | H | `user_settings_service.py:397` vs `:1190`, `agent_session.py:252` | `set_scoped_setting`/`resolve_scoped_setting` defined TWICE with different signatures/tables (int-FK blob vs String(64) KV, scope `global` vs `default`); tail wins; `agent_session.py:252` positionally calls the first signature → int `.query` AttributeError or **silent no-op**; `get_effective_settings` (:1126) returns hardcoded stub, no DB read. (Independently confirmed by UI/UX lane + server lane.) | One implementation; keyword args; kill stub; pick KV or blob table |
| B2 | H | `datalake.py:274-297`, `:436-462`, `:114/:237/:429` | Whole-file JSONL rewrite via `open("w")` — no tmp+rename, no lock (ZERO flock/fcntl anywhere in server). Crash mid-write destroys the entire feedback/microcredit file; concurrent writers lose records; append w/o fsync → truncated tail on power loss; `list_feedback`/`get_raw_telemetry`/`list_microcredit_submissions` wrap the WHOLE line loop in one try/except → one corrupt line blanks every subsequent record (silent read-sided data loss). | tmp+`os.replace` (datalake has it right at anonymize_user:520), single-writer asyncio lock or flock, per-line try/except, `flush`+`fsync` |
| B3 | H | `datalake.py:406` | Raw PII persisted in the "anonymized" lake: every submission stores `"raw_user_id": str(user_id)` beside the hash — verified live, 527 records. `user_hash`/`doc_hash` pseudonymized with fixed public salt `helpotron_salt_` in source = reversible. Contradicts the module's own privacy claims. | Drop `raw_user_id`; filter by hash only; salt from env |
| B4 | H | `config.py:30`, `.env:10`, `backup_db.sh:6` | Backup NEVER RUNS: `scripts/backup_db.sh:6` `DB_PATH="/var/www/helpotron/data/helpotron.db"` — actual deployed DB is `/var/www/helpotron/helpotron.db` → silent `-f` fail. Same script writes wrong-path evidence in pipeline lane. CWD-relative `DATABASE_URL=sqlite:///helpotron.db` vs absolute default → two possible DBs. (Also independently caught by pipeline lane.) | Fix DB_PATH; assert file exists before backup + alert; absolute DATABASE_URL; wire a nightly backup + restore test |
| B5 | H | `datalake.py:28` vs `config.py:69` vs `main.py:148` | Three divergent lake locations; `config.data_lake_dir` (`datalake_storage`) consumed NOWHERE; `DATA_LAKE_DIR` env dead; ghost `datalake_storage/` not gitignored. Real data in `data_lake/`. | One storage root from config; delete dead knob; gitignore canonical dir |
| B6 | H | `routes_datalake.py:92-124` vs `:258-272` | Microcredit split-brain: submit writes JSONL (id `mc_xxx`), DELETE deletes a row from `data_submissions` sqlite (int ids, old `credits.py:198` flow only) → JSONL submissions can never be deleted; two stores. | Unify on one store; write DB row in submit or delete from JSONL |
| B7 | H | `routes_user_settings.py:554` vs `:817` | Duplicate `DELETE /account`: first reg (DB-only erasure) wins → the GDPR lake-anonymizing route is DEAD; even reachable, `:818` passes `user.id` (int) while `anonymize_user` compares `str(v)==target` vs `raw_public_id` ("RoniDev") → matches nothing, `rewritten=0` silently. | Single route; pass `user.public_id`; extend erasure to agent_memory/agent_files/avatars/uploads/lake |
| B8 | H | `routes_auth_2fa.py:105,160,199,269` | Blocking SMTP (`smtplib` timeout=10) inside async handlers, no `to_thread` → 10s event-loop stall per slow SMTP call, blocks ALL concurrent requests. | `asyncio.to_thread` / async SMTP |
| B9 | H | `assignments/routes_math.py:44`, `math_executor.py:45` | `ast.Pow` unbounded, route unauthenticated → `9**(9**9)` = 370M-digit big-int, seconds of CPU + memory blowup; 500-char input limit doesn't stop it. | Bound exponent (e.g. >4096 reject), result-size cap, and auth the endpoint |
| B10 | H | `credits.py:95-120` | Credit charge race: `with_for_update()` is a NO-OP on SQLite → two concurrent requests both pass `credits>=cost`, both decrement → double-spend/negative. | Atomic `UPDATE users SET credits=credits-:c WHERE id=:id AND credits>=:c` + rowcount check |
| B11 | H | `security.py:327/336` | `get_current_user` leaks a DB session per request: `next(get_db())` never finalized → with QueuePool/Postgres this exhausts the pool (deadlock). Triggered by every auth'd request. | `SessionLocal()` + try/finally close, or use injected dependency |
| B12 | H | `admin.py:27-49` | `require_admin` feeds the SESSION COOKIE (opaque random, from `/api/login`) into `verify_jwt_token` → jwt.decode always fails → legit cookie-authed admin gets 401 on every `/api/admin/*`. Only a forged JWT works (pair with A2). Inconsistent: `main.py:588 /api/admin/check` handles cookies fine. | Validate session via `SessionStore.get_session` first, then Bearer JWT |
| B13 | H | `routes_overlord.py:234-299` | Cross-user permission response: `perm_entry = _pending_permissions.get(payload.permission_id)` — no check `perm_entry["user_public_id"] == user.public_id`; `perm_{uuid8}` guessable; pending entries never expire. | Ownership check + expiry |
| B14 | H | `assignment_dump.py:92,104,125,257` | Partial import silently degraded to fabricated content: extraction failures store placeholders ("[Audio content pending review]", "Image scanned: …") as `extracted_text`, which is then fed into `match_assignment_nlp` → **routing decisions on fabricated text**, status still "success". | Per-source `status="extraction_failed"`, route only on real text |
| B15 | H | `main.py:1175-1216` pipeline lane | Draft retry is FREE forever after the single upfront charge (never charges/refunds) → unlimited regenerations; combined with B-family IDOR also cross-user. | Charge per retry; owner check |
| B16 | H | services lane | Hygiene endpoints unauthenticated + **sync httpx in async** + no upload size cap (whole file base64'd into memory + forwarded). | Auth the routes, async client, size cap |
| B17 | H | services lane | `SERVICE_URL` hardcoded `127.0.0.1:8765` — no env override, no deploy wiring; vendor (Higgsfield) calls send **no Authorization header** and map any 4xx → 502. | Config-driven URL; vendor auth; preserve vendor errors |
| B18 | H | pipeline lane | `HT_audit_fixes` (pgrep-verified): watcher 8s revive loop; `execute_master_oculus_plan.py` no-timeout wait + false-positive executor detection; phantom-fix tools `apply_audit_fixes.py` + JSX `#` SyntaxError (never worked); `apply_remediation_plan.py` blind edits. | Real timeouts; remove phantom tools; dry-run diffs before edit |
| B19 | H | extension (merged w/ UI/UX) | 8-platform claim vs Canvas-only injection + Classroom always-crashes (A7). | Escalate in A7 |
| B20 | H | UI/UX | **Theme switch is fake** — 6-theme Appearance picker + dark/light/Auto pill store a theme NOTHING reads; page is permanently dark (`index.css:30-37` hardcoded, `App.jsx:267` hardcoded bg). Most user-visible broken promise in the product. | CSS vars + `data-theme` on root (preview already shows intent) or ship dark-only |
| B21 | H | UI/UX | "Record Lecture Audio" dead button (extension lane merged; popup sends `startRecording` — no handler; `recorder.html/js` exist but unreachable). | Wire handler or delete surface |
| B22 | H | UI/UX | **Scoped wizard saves the WRONG value on first Apply**: override value prefilled with `slider.min`/first option (`ScopedSetting.jsx:143-145`), not current global → type a subject + Apply = silently saves "AI effort = 1" (cheapest). Plus dead `<datalist>` ref (no autocomplete), edit-mode re-scope row, settings write to localStorage only while server has its own stub resolver. | Seed from current effective value; render datalist; lock scope in edit mode |
| B23 | H | migration/data | Three-armed migration system, NONE wired: `init_db()` inline ALTERs (only 2 tables), `migrations.py` + `migrations/002_*.py` have zero runtime callers (dead), `except Exception: pass` (:491) swallows failures. Live DB has columns (2fa, backup_codes) the model doesn't declare → fresh deploy schema diverges from prod. | Single alembic-style chain at startup; declare columns; fail loudly |
| B24 | H | UI/UX | Presets partially broken: localStorage-only (server never reads), `ai.effort` vocab 'low/balanced/high' vs backend 'auto/low/medium/advanced', silently resets `fontScale` to 50, one-way no-restore; readability "v3" doesn't exist (shipped = pass v2). | Sync with server settings; fix vocabulary; don't clobber fontScale |

---

## PART C — MEDIUM (selected; full lane outputs available on request)

- **C1** `engineering/sandbox.py:26-32,88-95` — `startswith` prefix-match path validation: `sbx_Xevil` passes `sbx_X` check (latent; no callers today). Use `Path.is_relative_to`.
- **C2** `gdocs_exporter.py:237-241` — failed batch silently dropped; doc reports "success" with missing chunks + inflated char count. Raise/retry, verify count, or fail.
- **C3** `assignment_dump.py:237-273` — row committed `processing` before extraction; exception between → permanently `processing` + orphaned file, never retried. Single transaction + rollback + unlink.
- **C4** `export.py:15,25` — CSV exporter doesn't escape quotes/newlines (corrupts files); `anki_exporter.py` does it right via csv.writer — two inconsistent exporters.
- **C5** `export.py:54-70` + `routes_export.py:135` — export bundle writes `/tmp/helpotron_exports`, downloads from `BASE_DIR/exports` — bundle can never be served; relay would send an empty export. Wire + unify roots.
- **C6** `routes_export.py:139-154` — any auth'd user can fetch any file in `BASE_DIR/exports` (no per-user isolation; guessable names once per-user exports exist). Per-user subdirs/DB-backed links.
- **C7** `discounts.py:27-62` — entire module broken dead duplicate (nonexistent `discount_balance_pct` attrs — actual: `discount_balance`/`discount_spillover`); trap for any future import. Delete or fix.
- **C8** `draft.py:198,217` — weird: reads `default_effort_level`/`average_grade` keys that don't exist (stored: `effort_score`, `target_score_letter`) → effort 500/grade "B" always used; unbounded `threading.Thread` per draft with own SessionLocal, no pool.
- **C9** `routes_user_settings.py:588-593` — `get_assignment_history_route` returns fabricated constants (grade "A", 92.0, 1250 words, hardcoded due date) — the history feed lies.
- **C10** MCP lane — registered under wrong project scope: `~/.claude.json` puts `helpotron-admin` under the **oculus** project, helpotron project has `[]` → tools unavailable where README says; no `.mcp.json` in helpotron.
- **C11** MCP lane — permission dead-end: `evaluate_action_permission` has no admin bypass; CRITICAL_ACTION_TYPES always `permission_required`; MCP exposes NO permission-respond tool → `admin_chat` dead-ends. README's "auto-approves for admin" is false for critical actions.
- **C12** MCP lane — bridge `subprocess.run(timeout=120)` kills `claude -p` but orphaned node MCP call has no timeout/idempotency → double-execution of admin mutations possible.
- **C13** UI/UX — a11y toggles (reducedMotion/highContrast/largeText/dyslexiaFriendly/screenReader) have ZERO consumers — panel advertises effects that nothing implements.
- **C14** UI/UX — readability v2 sweep flattens hierarchy: `!important` per-class overrides collapse 3 tiers; `text-slate-600/500` → `#a8b6c8` and `slate-400` → `#e2e9f2` now near-identical; 9-10px eyebrow labels became the loudest text. Keep ≥2 distinct muted steps.
- **C15** UI/UX — two unreconciled settings stores (AppShell QuickSettings vs SettingsApp), neither server-backed; preset application refreshes neither.
- **C16** services/exports lane — `routes_extension.py:81-107` vs `main.py:1292-1309`: duplicate `/api/extension/download` route; main.py version shadows the router's (no dotfile/.pyc exclusion, no version number, no CORS expose header).
- **C17** `routes_user_settings.py:458` — `"created_at": str(user.id)` mislabeled (is the DB id, not a timestamp); `:485-496` soft-reset returns success without clearing anything.
- **C18** `routes_auth_2fa.py:137-143` — `verify-email` compares `User.public_id == payload.email` (users aren't keyed by email) → `email_verified` never set; no resend rate limit.
- **C19** `transcription.py:29` `/tmp` roots — `UPLOAD_DIR = BASE_DIR.parent/"uploads"` writes OUTSIDE the repo while `main.py:1327` mounts CWD `./uploads` → transcribed files 404 in prod. (Same family as A8; listed separately for the exact file.)

---

## PART D — LOW (top 10 of 22)

1. `sandbox.py:145` `subagent_task_{int(time.time()*1000)}` — collision within the same ms.
2. `mcp/server.js:43-45` — `env` beats `process.env` (inverted precedence vs documented).
3. `mcp/README.md:27` — `suspend <public_id>` example unimplementable (no such admin action — silent no-op on a security-relevant claim).
4. `mcp/server.js` — no stderr logging on chat/login failures → opaque `-32603`; `auth_limiter` shared between MCP login and web admin → 5 bad MCP passes lock out web login up to 2^15s.
5. Version bumps: `helpotron_version` duplicated in MV3 `background.js` setInterval + manifest stores; `public_id:'RoniDev'` hardcoded (identity collapse when multi-user).
6. `#datalake` deep-link dead — no hash routing in App.jsx/main.jsx (`openDataLake` opens `#datalake`) → lands on dashboard; `LibraryView.jsx:113` window.location.hash='' does nothing.
7. `web/src/demoData.js` defaults leak into live mode; credits fallback hardcoded `10029` (AppShell.jsx:428).
8. Shots/artifacts in git: `shots/helpotron_shots.zip` (10.9M) + `_0824.zip` (16.7M) tracked, no gitignore rule, two naming schemes; `exports/sandboxes/sbx_417c96d7ca0f/evil.sh` + `input.txt` committed (test junk).
9. `_cleanup_temp_files_loop` (main.py:121-133) only unlinks top-level files — nested dirs (sandboxes, `uploads/assignment_dump`, `uploads/avatars`) survive forever; `sandbox.py:282-291 prune_stale` only clears the in-memory registry.
10. Extension popup = different design system (320px fixed, raw hex, 10-12px text, wrong brand name) vs web readability floors; extension brand mismatch (`manifest` name "Helpotron Study Assistant" vs popup "Helpotron Automator" vs web "Helpotron Academic OS").

---

## PART E — FIX PLAN (execution order)

### Phase 0 — SECURITY EMERGENCY (before ANY public push; ~2-4 h)
1. Rotate ALL exposed secrets: Telegram bot token, DeepSeek key, admin password (change live pw + rotate all copies). PAT already dead.
2. `git rm --cached .agents/mcp_config.json`, gitignore it, purge history with `git filter-repo` (all commits; the PAT/keys are in history) — or rewrite the repo's origin history before any CF push.
3. Fix A2 JWT (`config.jwt_secret`) + startup guard in prod mode.
4. Fix A3 minting endpoints + A4 2FA (SAME two files; quick locked-down rewrite).
5. Close A6 dump upload/list + A5 legacy surface with `Depends(get_current_user)` (pattern: assignments.py). This is ~10 routes — bulk pass.
6. Add `tabs` + `activeTab` perms and fix the manifest patterns (A7) — extension compiles at all.

### Phase 1 — CF-DEMO CORRECTNESS (same day)
7. A8 architecture decision (container backend): dockerize server+engine, Postgres migration (swap SQLAlchemy URL), R2 S3-compat bucket for `uploads`/`exports`/`data_lake`, static pages for web/, worker proxy `/api/*` + `/ws/*`, CORS from demo origin, `secure=True` cookies behind proxy.
8. B1-B7 data-integrity fixes at once (they're the same 3 files: datalake.py, user_settings_service.py, routes_datalake.py).
9. B10 atomic credit decrement, B19/B20/B21 demo-visible UI fixes (theme apply, dead record button, scrape crash), B22 wizard seed.

### Phase 2 — FULL CORRECTNESS (day 2)
10. B8 (SMTP to_thread), B9 (math bounds), B11 (DB session), B12 (require_admin), B16-B18 (services/pipeline), C-items, B24 presets.

### Phase 3 — POLISH (opportunistic)
11. C13-C17, D-items, extension popup unification, brand-name unification.

---

## Appendix — audit lanes (what was covered)

server-core (bugs/security), security+secrets, cloudflare-fit, data+persistence, pipeline+scripts, services+Higgsfield, MCP servers, browser extension, UI/UX, export/import+shots. 3 duplicate-families merged (secrets file, path-roots, scoped-setting shadowing, record-button, Classroom scrape). No files modified by the audit.
