# Track 6: Latency — Partial Audit Findings
> **Status**: PARTIAL — subagent killed due to rate limit. Evidence extracted from reasoning transcript.
> All measurements below were made by the agent against the live codebase.

---

## LAT-01 (HIGH) — Synchronous `urllib.urlopen` in Async Cloudflare Turnstile Handler Blocks Event Loop 500ms+

**Track**: latency
**Severity**: high
**Location**: `server/routes_auth_2fa.py` — `verify_turnstile_token`; also `submit_help_ticket`, `apply_for_testing_access`

**Evidence**:
- `fetch_store_version()` uses `urllib.request.urlopen` (blocking) inside async endpoint — measured **215ms block** per call
- `verify_turnstile_token` Cloudflare verification: measured **500ms+ event loop freeze** per access request
- `_service_health()` at `/status`: measured **2+ second event loop stall** — freezes ALL concurrent FastAPI requests during health check
- Agent ran asyncio event loop timing scripts and confirmed stalls

**Impact**: Every 2FA attempt, help ticket, and status check freezes the entire server for 215ms–2s. Under load this stacks — 10 concurrent users each triggering a turnstile verification = 5 seconds of dead air.

**Fix**: Wrap all three in `asyncio.to_thread()` or replace `urllib` with `await httpx.AsyncClient().get(...)`.

**Verification**: `"unverified": false` — measured wall times confirmed.

---

## LAT-02 (HIGH) — N+1 Query: Study Materials API Fires Separate DB Query Per Card State

**Track**: latency
**Severity**: high
**Location**: Study tools routes — `get_card_states` per material in iteration

**Evidence**:
- Initial query fetches study materials list
- Loop then performs separate DB query per material to fetch associated card states
- Agent measured: query count scales linearly with material count
- No `joinedload` or batch query used

**Fix**: Use SQLAlchemy `joinedload` or a single `WHERE material_id IN (...)` batch query.

**Verification**: `"unverified": false` — agent traced query pattern in code and measured counts.

---

## LAT-03 (HIGH) — `record_routing_telemetry` is `async def` but Does Synchronous DB I/O on Every LLM Call

**Track**: latency
**Severity**: high
**Location**: `server/routes_overlord.py` — `record_routing_telemetry`; `server/cost_tracking.py` — `log_api_call`

**Evidence**:
- `log_api_call` does synchronous DB operations (session.add / session.commit) on the event loop thread
- `record_routing_telemetry` declared `async def` but performs synchronous I/O — called on every LLM call in chat path
- Contributes to blocking on the chat critical path

**Fix**: Wrap DB commits in `asyncio.to_thread()` or switch to an async SQLAlchemy session.

**Verification**: `"unverified": false` — agent traced call stack and confirmed sync DB in async context.

---

## LAT-04 (HIGH) — ~390ms TLS/Connection Overhead Per LLM Call, ~800ms Per Agent Turn (2 Calls)

**Track**: latency
**Severity**: high
**Location**: `server/llm.py` — `call_llm` and `stream_llm`; `server/stylometry/rewrite.py` — `call_llm`

**Evidence**:
- Each LLM call: ~390ms connection setup + TLS handshake measured
- Single agent chat turn = intent resolution call + reply call = **~800ms overhead** before any token generation
- `httpx.AsyncClient` is not being reused across calls — new client per invocation

**Fix**: Instantiate a module-level `httpx.AsyncClient` with `http2=True` and reuse it. Connection pooling eliminates the per-call handshake.

**Verification**: `"unverified": false` — agent measured 390ms overhead across multiple modules.

---

## LAT-05 (MEDIUM) — Post-Stream AI Detection Causes Silent Delay + Possible Text Divergence

**Track**: latency
**Severity**: medium
**Location**: `server/routes_overlord.py` — `/api/agent/chat/stream` post-stream detection

**Evidence**:
- Streaming chat: raw AI chunks are yielded to client in real time
- After stream completes, `_apply_detection_standard` runs detection + possible rewrite iterations
- User receives the raw streamed text, but the saved reply may differ if rewrite triggers
- Silent gap between stream end and "done" frame during detection
- This also means user sees content that may be overwritten in DB

**Note**: Also identified independently by Track 10 (TEST-06).

---

## LAT-06 (MEDIUM) — `ExtensionRelease` Table Queried Multiple Times Per Request, Retrieving All Rows Each Time

**Track**: latency
**Severity**: medium
**Location**: `server/routes_extension.py` — extension version/release checks

**Evidence**:
- Multiple DB queries to `ExtensionRelease` table per API call
- Each query retrieves ALL releases then filters in Python — no `WHERE version=X` predicate
- Redundant full-table scans for what should be a single indexed lookup

**Fix**: Single `db.query(ExtensionRelease).filter_by(version=v).first()` with an index on `version`.

---

## Open Items (not reached before kill)
- `asyncio.gather()` opportunities in sequential await chains — partial only
- Cold path analysis beyond chat — NOT completed
