# Database Scaling Readiness — helpotron

Agent 5 of 10. Read-only assessment. No repo file or database was modified.

**Verdict up front:** the database is a toy at current scale. The largest table is
1,091 rows. 68 of 70 declared indexes already exist on disk. The correct "do now"
list is three items — two of them are async event-loop blocking calls, not database
work, and the third is a four-line idempotent index-fix so the models stop lying
about the schema. Every distributed-database stage from the video (replicas, Redis,
partitioning, sharding, engine split) is **not yet**, and most of it is not even
achievable on SQLite — it is downstream of a future Postgres migration that itself
has no trigger today.

---

## (a) MEASURED current state

Read via `sqlite3` in `mode=ro` (URI `file:data/db/helpotron.db?mode=ro`). Nothing
written.

**File:** `data/db/helpotron.db` — 13,893,632 bytes (~13.9 MB), mode 600.
WAL already active (`-wal` 0 bytes, `-shm` 32 KB present). `busy_timeout=30000`
confirmed in `server/database.py:36`.

### Table | rows | size (dbstat pgsize)

| table | rows | size |
|---|---|---|
| assignments | **1,091** | 4.5 MB |
| universal_dump_items | **1,078** | 4.4 MB |
| agent_chat_messages | 65 | 260 KB |
| api_usage_logs | 18 | 73 KB |
| users | 15 | 60 KB |
| user_sessions | 15 | 60 KB |
| study_materials | 14 | 57 KB |
| agent_actions | 8 | 32 KB |
| extension_releases | 6 | 24 KB |
| every other table (26 of them) | 1 each | 4 KB each |

Total rows across the whole database: **~2,290**. The two "large" tables are the
`assignments` (row holds a big `prompt` + `file_urls` JSON blob) and
`universal_dump_items` (holds `extracted_text`). They are large in *bytes*, not
rows: 4.5 MB across 1,091 rows means ~4 KB/row of content, not churn.

**`api_usage_logs` is NOT large** — 18 rows. It is a candidate for growth (one row
per LLM/transcription/vision/detector call) but today it is nothing.

### Real index list (sqlite_master, `type='index'`)

72 indexes total: 68 named `ix_*` + 4 `sqlite_autoindex_*` (the `unique=True`
constraints). This **contradicts the shared-context claim that "the LIVE database
carries almost none of the declared indexes."** That claim is stale. `create_all()`
creates indexes for tables it creates fresh, and this DB was created (or fully
rebuilt) after most `index=True` declarations existed. The actual gap is **2
indexes, not 70**. Code wins over the context file here.

---

## (b) Declared-vs-actual index diff

`grep -c 'index=True' server/database.py` = 70. DB `ix_*` indexes = 68.

| declared index | status | reason |
|---|---|---|
| `ix_users_organization_id` (`users.organization_id`) | **MISSING** | column added by `ALTER TABLE` at `server/database.py:760`, no matching index migration |
| `ix_universal_dump_items_subject` (`universal_dump_items.subject`) | **MISSING** | column added by `ALTER TABLE` at `server/database.py:808-812`, no matching index migration |

Every other declared index is present. The two missing ones are exactly the two
columns whose tables already existed when the column was introduced — `create_all()`
never retro-fits a column *or* its index, and the `init_db()` migration block
(`server/database.py:741-834`) added the columns but not their indexes. (The one
exception: `payments.provider_ref` got an explicit
`CREATE INDEX IF NOT EXISTS` at `server/database.py:828-830` — the existing pattern
to copy.)

### Do the two missing indexes matter?

No, at current scale. `EXPLAIN QUERY PLAN` on the live DB (read-only):

- `WHERE user_id = ?` on `assignments` → **SEARCH USING INDEX** `ix_assignments_user_id`
- `WHERE user_id = ?` on `universal_dump_items` → **SEARCH USING INDEX** `ix_universal_dump_items_user_id`
- `WHERE created_at > ?` on `api_usage_logs` → **SEARCH USING INDEX** `ix_api_usage_logs_created_at`
- `WHERE target_key = ?` on `agent_chat_messages` → **SEARCH USING INDEX** `ix_agent_chat_messages_target_key`
- `WHERE provider_ref = ?` on `payments` → **SEARCH USING INDEX** `ix_payments_provider_ref`
- `WHERE subject = ?` on `universal_dump_items` → **SCAN** (missing index)
- `WHERE title ILIKE '%term%'` on `assignments` (`server/admin.py:618`) → **SCAN**

The two SCANs are the only non-indexed paths, and both are negligible:

1. The subject lookup is actually written as
   `func.lower(UniversalDumpItem.subject) == subject.strip().lower()`
   (`server/routes_dump.py:287`, `server/overlord_agent.py:1540`). A plain index on
   `subject` **would not be used** for a `lower(subject)` predicate — you would need
   an expression index on `lower(subject)`. And it is scanning 1,078 rows.
2. The admin title search is admin-only, `LIMIT 10`, on 1,091 rows. A full scan of
   1,091 rows is microseconds. The eventual fix is FTS5, not a B-tree (B-trees don't
   help leading-`%` patterns).

---

## (c) DO NOW list

Three items. Two are async blocking calls (reachable now), one is index drift
(correctness, optional). This is the whole list — deliberately short.

---

## (d) DOCUMENTED TRIGGER table — everything deferred

| stage (from video) | worth doing when | not worth doing when |
|---|---|---|
| **Vertical / connection pool** | a DB-backed route p95 > ~200 ms under real load, **or** you add `--workers N` to the uvicorn command | today: single worker + NullPool is already correct (see §e) |
| **B-tree indexes** | a table passes ~50k rows **and** `EXPLAIN QUERY PLAN` shows a SCAN on a user-facing route | today: 2,290 rows total, 68/70 indexes present |
| **FTS for search** | `assignments.title ILIKE` becomes a real search feature or the table passes ~50k rows | today: admin-only, `LIMIT 10`, 1,091 rows |
| **Redis / in-memory cache** | a specific hot read (dashboard counts, tier lookups) is measured at the top of a profile at > ~50 rps, or an immutable lookup is re-read per request and the query is the bottleneck | today: zero read paths are hot |
| **Read replicas** | only after a Postgres migration, when primary write throughput saturates and reads exceed one node | today: impossible on SQLite |
| **Partition / shard** | when single-node **write** throughput is maxed (the video's own trigger) | today: writes are a handful/day |
| **Engine split (Postgres+Redis+ES+S3+columnar)** | when ≥2 of the above have actually fired | today: pure fantasy for ~2k rows |

**The real trigger ladder for helpotron specifically:** SQLite+WAL is fine until
either (1) write contention appears — `database is locked` / `busy` errors in the
logs despite `busy_timeout=30000` — or (2) a query profile shows a table scan on a
large, hot path. The *first* deferred action, and the one that gates every other
stage, is a **Postgres migration**, and that only triggers on write contention or a
genuine multi-worker deployment. Everything after Postgres (replicas, sharding,
engine split) is gated on Postgres, and every one of them needs its own measurable
trigger to fire first.

---

## (e) Connection-pool assessment (sqlite + uvicorn, specifically)

`server/database.py:22-27`:

```python
_connect_args = {"check_same_thread": False, "timeout": 30.0} if sqlite else {}
engine = create_engine(url, connect_args=_connect_args,
                       poolclass=NullPool if sqlite else QueuePool)
```

The deployed command (`deploy/helpotron-api.service`) is a **single uvicorn worker**
— no `--workers`, no `--reload`:

```
ExecStart=.../.venv/bin/uvicorn server.main:app --host 0.0.0.0 --port 5000 --proxy-headers --forwarded-allow-ips 127.0.0.1
```

This configuration is **correct**, not deficient:

- **`NullPool` is right for SQLite.** SQLite has no server to hold a pooled
  connection to; SQLAlchemy's `QueuePool` buys nothing and risks handing a stale
  connection across threads. A fresh connection per session is the correct pattern.
  The video's "connection pools" point is a Postgres concept and should **not** be
  ported here.
- **`check_same_thread=False` is required** — FastAPI runs sync routes (e.g. the
  `def login`/`def signup` in `server/main.py:1056,1270`) in a threadpool, and
  `check_same_thread=True` (the sqlite3 default) would raise on exactly those.
- **Single worker** means the whole app has one writer, so WAL + `busy_timeout=30000`
  is more than enough. There is no write contention to pool around.
- If anyone adds `--workers N`, SQLite stops being the right backend at all (N
  writers on one file), and that is the Postgres trigger in §d — not a pooling fix.

**Verdict: no change. This is the one part of the video's progression that is
already correct, and the correct answer is "leave it alone."**

Tests pin the DB via `server/tests/conftest.py:6`
(`DATABASE_URL=sqlite:///./test_helpotron.db` — a *persistent* file, unique ids per
run) and redirect the lake via `DATA_LAKE_DIR` to a temp dir
(`server/tests/conftest.py:9-18`), so any engine change is exercised by the suite
against a fresh DB, not the live one.

---

## (f) On-path vs off-path blocking calls

The known 240 s bug is **already fixed**: `server/routes_hygiene.py:49-56` now wraps
the sidecar POST in `asyncio.to_thread(...)`. Two residual instances remain.

| call site | on/off path | severity | detail |
|---|---|---|---|
| `server/captcha.py:49` via `def login` (`main.py:1056`) and `def signup` (`main.py:1270`) | **OFF-path** | none | sync route → FastAPI runs it in the threadpool; the sync `httpx.Client` never touches the loop |
| `server/captcha.py:49` via `async def submit_help_ticket` (`routes_recovery.py:147`) and `async def apply_for_testing_access` (`routes_recovery.py:231`) | **ON-path** | medium | sync `httpx.Client(timeout=10)` blocks the loop up to 10 s per request — same class as the hygiene bug, shorter timeout. Active only when Turnstile is configured (`captcha_required()`). |
| `server/routes_hygiene.py:32` `_service_health()` in `async def status` (`routes_hygiene.py:39`) | **ON-path** | low | sync `httpx.get(timeout=2.0)` blocks the loop up to 2 s when the sidecar is down. Residual — the fix below was applied to `_forward` but not this helper. |

Classification rule: sync `httpx` inside `async def` = on-path (blocks the loop);
sync `httpx` inside `def` = off-path (threadpool). All other `httpx` uses found are
`httpx.AsyncClient` inside `async def` — correct.

---

## (g) Numbered DO NOW plan

### 1. Stop the event loop blocking on `_service_health` (2 s)

- **File:** `server/routes_hygiene.py:30-35`
- **Change:** make the health probe async off-loop, matching the already-fixed
  `_forward`:

  ```python
  async def _service_health() -> dict:
      try:
          r = await asyncio.to_thread(
              lambda: httpx.get(f"{SERVICE_URL}/health", timeout=2.0)
          )
          return r.json()
      except Exception:
          return {"ok": False}
  ```

  and at `server/routes_hygiene.py:40` change `return _service_health()` to
  `return await _service_health()`.
- **Test:** `server/tests/test_*` hygiene tests still pass; add a unit test that
  monkeypatches `httpx.get` to `time.sleep(2.1)` and asserts the status route
  returns within ~1 s (proving the loop is not blocked) — or, cheaper, assert the
  function returns `{"ok": False}` when `httpx.get` raises.
- **Verify:** `./.venv/bin/python -m pytest server/tests -q -k hygiene`

### 2. Stop the event loop blocking on Turnstile in the two recovery routes

- **File:** `server/routes_recovery.py:179-181` and `:258-260`
- **Change:** run the sync verifier off-loop:

  ```python
  if captcha_required() and not has_valid_bypass(request):
      ok = await asyncio.to_thread(verify_turnstile_token, token, client)
      if not ok:
          raise HTTPException(403, "Security check required — complete the captcha and try again.")
  ```

  (`routes_recovery.py` already imports `asyncio`? If not, add
  `import asyncio` at the top.) Leave `server/captcha.py` itself alone — it is
  correct for the sync login/signup routes.
- **Test:** a test that monkeypatches `server.captcha.verify_turnstile_token` to
  `time.sleep(0.2)` and posts to `/api/recovery/help-ticket` with Turnstile enabled;
  assert it still returns (and, ideally, that a concurrent `/api/health` stays
  responsive during the call). The critical assertion is that the route calls the
  verifier *and* does not raise on the off-loop thread.
- **Verify:** `./.venv/bin/python -m pytest server/tests -q -k recovery`

### 3. Make the model declarations honest — add the two missing indexes to `init_db()`

- **File:** `server/database.py`, inside `init_db()`, next to the existing
  `ix_payments_provider_ref` block at `:828-830`
- **Change:** add two idempotent statements (copy the existing pattern):

  ```python
  conn.execute(text(
      "CREATE INDEX IF NOT EXISTS ix_users_organization_id ON users (organization_id)"
  ))
  conn.execute(text(
      "CREATE INDEX IF NOT EXISTS ix_universal_dump_items_subject ON universal_dump_items (subject)"
  ))
  ```

  Note the subject index **will not** accelerate the actual `lower(subject)`
  query — this is purely a schema-honesty fix so the model stops lying, and it is
  marked optional/not-urgent. Do **not** add an expression index
  `lower(subject)` now; that is gated by the §d trigger.
- **Test:** `init_db()` against a copy of the live DB is the real proof (the code
  path `create_all()` never exercises). A test can create a table without the index,
  call `init_db()`, and assert both `sqlite_master` entries now exist.
- **Verify (read-only check, no write to live DB):**
  `python3 -c "import sqlite3;c=sqlite3.connect('file:data/db/helpotron.db?mode=ro',uri=True);print([r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='index' AND name IN ('ix_users_organization_id','ix_universal_dump_items_subject')\")])"`
  — expect both names after deploy.

---

## (h) RISKS / DO NOT DO

- **Do NOT add 70 indexes to this database.** 68 of them already exist. The only
  gap is 2, and both are on sub-2k-row tables where a scan is microseconds. Adding
  more (composite indexes, `lower(subject)` expression indexes, FTS) now is
  premature optimization with a real write-amplification cost on every insert —
  for tables that take a handful of writes a day. This is the honest conclusion,
  and it is the correct one.
- **Do NOT add a connection pool.** `NullPool` is correct for SQLite. A `QueuePool`
  here buys nothing and risks stale handles across threads. This is the one stage of
  the video that must be *skipped on purpose*.
- **Do NOT run `create_all()` expecting it to fix anything on the live DB.** It
  cannot retro-fit a column or index onto an existing table. Any live-DB change must
  go through the `init_db()` idempotent `ALTER`/`CREATE INDEX` block
  (`server/database.py:741-834`).
- **Do NOT touch the two `.bak-pre-salt-rekey-*` files** in `data_lake/`, the
  `.bak-*` files in `data/db/`, or `data_lake/*.jsonl` — they are the pre-fix state
  and the owner's recovery artifacts.
- **Do NOT rotate `SECRET_KEY` (or `DATALAKE_SALT`) casually.** `_anonymize_id`
  (`server/datalake.py:58`) derives every stored `user_hash` from the salt; rotating
  it silently orphans the per-user history filter — the exact bug
  `scripts/migrate_datalake_salt.py` documents (118/123 records orphaned on
  2026-09-23). The dedicated `DATALAKE_SALT` is now pinned in `.env`; leave it.
- **Do NOT propose Redis, replicas, partitioning, sharding, or an engine split in
  this cycle.** Every one of those is a Postgres-stage feature gated by a trigger
  that has not fired (largest table 1,091 rows). Proposing a Redis cluster today is
  a failed answer.
- **Do NOT turn the app on** to "verify" — helpotron is deliberately behind the
  maintenance page.

---

## (g2) Datalake note (JSONL, not the DB)

Confirmed: the datalake is a set of append-only JSONL files under `data_lake/`, not
SQLite. (`server/datalake.py:28` sets `DATALAKE_DIR = BASE_DIR / "data_lake"`; note
`server/config.py:78` defaults to `datalake_storage` but `datalake.py` wins at
runtime. `data/lake/` is an empty legacy dir — `.gitkeep` only — not the store.)

| file | lines | size | retention |
|---|---|---|---|
| `monitors_history.jsonl` | 2,027 | 3.2 MB | capped at 2,000 lines (`server/monitors.py:40`, trimmed every 30 snapshots at `:362-372`) — currently slightly over, will trim on next write |
| `operational_events.jsonl` | 815 | 260 KB | **none — unbounded append** |
| `user_feedback.jsonl` | 501 | 164 KB | **none — unbounded append** |
| `microcredit_submissions.jsonl` | 356 | 364 KB | **none — unbounded append** |
| `humanized_samples.jsonl` (corpus) | — | — | capped at 5,000 samples (`server/datalake.py:190`) |

The three unbounded files grow forever. At 5.7 MB total today this is **not a
problem**, but it is the one genuinely unbounded growth vector in the system. The
salt-orphaning bug is **already fixed and shipped**: `scripts/migrate_datalake_salt.py`
pins `DATALAKE_SALT` in `.env` and re-keys records from `raw_user_id`; the
`*.bak-pre-salt-rekey-*` backups prove it was run. Trigger for adding rotation to the
three unbounded stores: when any single JSONL exceeds ~100 MB, or the `data_lake`
dir passes ~1 GB — document it now, do not build it now.

---

## Citations (verified this session)

- Engine/pool/pragmas: `server/database.py:22-27`, `:30-38`
- Migration block + payments index pattern: `server/database.py:741-834`, `:828-830`
- Missing-index columns declared/added: `server/database.py:77` & `:760`,
  `server/database.py:683` & `:808-812`
- Hot queries: `server/routes_dump.py:287`, `server/overlord_agent.py:1540`,
  `server/admin.py:618`, `server/routes_organization.py:75`
- Blocking calls: `server/routes_hygiene.py:30-40`, `:49-56`; `server/captcha.py:38-58`;
  `server/main.py:1056`, `:1270`; `server/routes_recovery.py:147`, `:179-181`, `:231`, `:258-260`
- Datalake/salt/retention: `server/datalake.py:28`, `:58`, `:104-108`, `:190`;
  `server/monitors.py:39-40`, `:355-374`; `scripts/migrate_datalake_salt.py:1-52`
- Single worker: `deploy/helpotron-api.service` (ExecStart)
- Test DB pinning: `server/tests/conftest.py:6-18`

All row counts, sizes, index lists and `EXPLAIN QUERY PLAN` output were produced
against the live `data/db/helpotron.db` opened `mode=ro` this session.
