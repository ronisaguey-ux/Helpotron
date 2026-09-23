# Runaway-Cost Protection — Rate Limiting & Spend Ceilings

Agent 1 of 10. READ-ONLY audit — no code changed. Facts cited as `path:line`.

---

## 0. Verified current state

- `costly_guard(kind)` exists in `server/ratelimit.py:145-181` with `DEFAULT_COSTLY_LIMITS`
  (`server/ratelimit.py:120-127`). **It is referenced by zero routes** — `grep -rn costly_guard
  server/*.py` returns only the definition and its own docstring. Unverified, unwired.
- 14 files call `call_llm`/`stream_llm`; none reference the limiter (confirmed by grep).
- `credits.has_usage_balance()` (`server/credits.py:139-152`) gates only on
  `get_token_balance(user) > 0` at task **START**; concurrent requests all pass.
- `credits.is_unmetered()` (`server/credits.py:321-333`) = `is_admin_user()` → the operator
  account has **no** request ceiling and **no** cost ceiling. `charge_actual_usage`
  (`server/credits.py:190-191`) returns 0 for unmetered users.
- Real dollar spend **is already recorded** for every user including the operator:
  `ApiUsageLog.base_cost_usd`/`charged_cost_usd`, written by `cost_engine.log_api_call`
  (`server/cost_tracking.py:53-103`) and `record_service_cost` (`server/cost_tracking.py:105-155`),
  with provider-reported `usage.cost` preferred (`server/cost_tracking.py:77-79`). A daily cost
  cap is therefore **cheap** to add — the number is already in the ledger.
- **No circuit breaker / cooldown / emergency kill-switch exists anywhere in `server/`.** The
  only "breaks" are: `memguard` memory-budget 429 queue (`web/src/api.js:119-164`), per-API-key
  rate + spend limits (`server/api_keys.py:41-52,203-208,247`), and the START-only token gate.
  None of them stops a spend spike or an OpenRouter error storm on the operator account.

---

## (b) BUGS in `costly_guard` — exact lines, exact fixes

### BUG 1 — `request.state.auth_user_public_id` is never set (dead account detection)
`server/ratelimit.py:137` reads `request.state.auth_user_public_id`. Nothing ever writes it:

- `security.get_current_user` (`server/security.py:489-568`) ends every branch in
  `_enforce_not_banned` → `_bind_metering` (`server/security.py:466-486`), which calls
  `metering.set_meter_user(...)` (a contextvar), **not** `request.state`.
- `api_keys.authenticate` (`server/api_keys.py:268-273`) sets `request.state.api_key_id` and
  `request.state.auth_via_api_key`, **not** `auth_user_public_id`.

So `_caller_key()`'s "account" branch is dead; it always falls to the IP branch. Worse, that
branch uses `request.client.host` directly (`server/ratelimit.py:141`), which behind the
cloudflared tunnel is **always `127.0.0.1`** — it ignores the `client_identity()` forwarding
logic (`server/ratelimit.py:69-77`) that the rest of the module relies on. Every anonymous
caller would collapse into one bucket. (Reachable impact is nil today because `costly_guard`
hard-depends on auth — see BUG 2 — but the code is a trap for a future public route.)

**Fix** — two options; (a) is the correct one because `costly_guard` already holds the resolved user:

```python
# server/ratelimit.py:130-142  (replace _caller_key)
def _caller_key(request: "Request") -> tuple[str, str]:
    # Account identity is supplied by the caller (costly_guard resolves the user);
    # this fallback is for the anonymous path only, and must honour the same
    # trusted-proxy forwarding as client_identity() so the tunnel does not
    # collapse everyone onto 127.0.0.1.
    client = client_identity(request)
    return f"ip:{client}", "address"
```

### BUG 2 — `Depends(get_current_authenticated_user)` inside the factory: WORKS, but double-auths
Answer to the literal question: **yes, it works.** FastAPI resolves `Depends` instances found in
a dependency's default parameter values (the standard sub-dependency pattern), and
`get_current_authenticated_user` (`server/routes_features.py:19`) is a plain sync function whose
own `Depends(get_db)` (`server/database.py:733`, sync generator) resolves in the threadpool. The
deferred `from .routes_features import ...` (`server/ratelimit.py:155`) is harmless but also
pointless — there is **no** circular import to avoid (`routes_features` imports `database` +
`security`, never `ratelimit`).

The real cost: if a route already declares `current_user = Depends(get_current_user)`, adding
`costly_guard("agent_turn")` runs a **second** auth chain — a second `SessionStore.refresh_session`
DB write (`server/routes_features.py:35`, `server/security.py:504,550`) and a second `User` lookup,
per request. Not wrong, but wasteful and a source of drift.

**Fix (recommended):** make the guard a plain helper that consumes the already-resolved user,
called as the first line of each handler. Keeps it explicit/greppable, avoids double-auth:

```python
# server/ratelimit.py — add after costly_guard
def costly_check(kind: str, request: "Request", user) -> None:
    """Raise 429 when the caller exceeds the per-kind ceiling. Call at the top
    of a cost-incurring handler AFTER auth, passing the already-resolved user."""
    default_limit, default_window = DEFAULT_COSTLY_LIMITS.get(kind, (60, 60.0))
    public_id = getattr(user, "public_id", None)
    base = f"user:{public_id}" if public_id else client_identity(request)
    key = f"costly:{kind}:{base}"
    if not limiter.allow(key, default_limit, window=default_window):
        retry_after = limiter.retry_after(key, default_limit, window=default_window)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"That was a lot of requests at once. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )
```

If the owner prefers the dependency shape, `costly_guard` as written is fine — just accept the
double-auth and **use the returned `user`**, not a parallel `Depends(get_current_user)`.

### BUG 3 — `RateLimiter.MAX_KEYS` eviction is not LRU (low severity)
`server/ratelimit.py:27-28`: `next(iter(self._hits))` evicts the **oldest-inserted** key, not the
least-recently-used. Under a burst of many *distinct* keys (>10,000) a hot early-inserted bucket
can be evicted, resetting that caller's window. Verdict: it errs **permissive** (a reset window),
never over-blocks; and the costly-guard key space is `user:{public_id}` (a few hundred keys), far
under 10,000. **Does not matter** for the intended threat model. Note it; do not "fix" it now.

---

## (a) Every cost-incurring route — table

Loop ceiling (measured, see §3): `_MAX_AGENT_TOOL_CALLS = 100` (`server/screen_vision.py:90`),
`_MAX_CONTROL_ACTIONS = 25` (`server/screen_vision.py:85`), client hard round cap
`AGENT_LOOP_HARD_ROUND_CAP = 40` (`extension/popup.js:3705`). Real max rounds per user action =
**min(40 rounds, 100 tool calls, 2-stall guard) = 40** round-trips, each = one `agent_chat` POST
+ one internal vision call.

| # | HTTP path | file:line (route) | bills via | proposed `kind` | proposed limit | ceiling justification |
|---|---|---|---|---|---|---|
| 1 | `POST /api/agent/chat` | `routes_overlord.py:2445` | `call_llm` at `routes_overlord.py:1644,2103`; `overlord_agent.py:1003` | `agent_turn` | **60/min** | loop ceiling 40 rounds/task; 60 > 40, each round ≥1s so sustained <60 |
| 2 | `POST /api/agent/chat/stream` | `routes_overlord.py:2287` | `stream_llm` at `routes_overlord.py:2366` | `agent_turn` | **60/min** | same turn budget as non-stream |
| 3 | `POST /api/extension/agent_chat` | `routes_extension.py:1662` | vision (`screen_vision.py:265`) + `call_llm` | `agent_turn` | **60/min** | drives the 40-round loop; 60 covers it |
| 4 | `POST /api/extension/vision` | `routes_extension.py:930` | `analyze_screen_image` → OpenRouter vision (`screen_vision.py:348-364`) | `vision` *(new)* | **90/min** | 40 in-loop + standalone; cheap per call |
| 5 | `POST /api/agent/task` | `routes_overlord.py:2778` | multi-LLM agent task (overlord_agent / agent_session) | `agent_task` | **20/min** | a whole task is many billed calls; a human launches <20/min |
| 6 | `POST /api/agent/command` | `routes_overlord.py:2853` | `call_llm` directive (`overlord_agent.py:1003`) | `agent_task` | **20/min** | same |
| 7 | `POST /api/agent/sandbox/execute` | `routes_overlord.py:2872` | `cf_computer.exec` — **feature-flagged OFF** (`config.py:119` `false`) | `agent_task` | **20/min** | latent; gate now so it's not free when enabled |
| 8 | `POST /api/ai/detect` | `main.py:1769` | `detectors.score_text` → Pangram ($0.05/1k words) / Sapling (`detectors.py:148-149,254-324`) | `detect` | **20/min** | Pangram is 5c/scan; 20/min = up to $60/min worst case |
| 9 | `POST /api/assignment/humanize` | `main.py:2467` | `humanizer.humanize_loop` → HIP (local) + `call_llm` fallback (`humanizer.py:589`) + paid detectors | `humanize` | **30/min** | HIP local keeps it cheap; LLM fallback + detectors bill |
| 10 | `POST /api/user/originality/check` | `routes_user_settings.py:447` | `AIHumanizerPipeline.humanize_text` (same paid chain) | `humanize` | **30/min** | same |
| 11 | `POST /api/transcribe` | `main.py:1836` | `transcription.transcribe_audio` → OpenRouter Gemini audio (`transcription.py:1-30`) | `transcribe` *(new)* | **10/min** | audio is expensive per-hour; 10/min is generous |
| 12 | `POST /api/dump/upload` | `routes_dump.py:119` | audio path → `transcribe_audio` (`assignment_dump.py:329,342`) | `dump` | **20/min** | ingestion; audio sub-path bills most |
| 13 | `POST /api/dump/upload-text` | `routes_dump.py:193` | (extraction; downstream route bills) | `dump` | **20/min** | keep same bucket |
| 14 | `POST /api/dump/{dump_id}/route` | `routes_dump.py:322` | `call_llm` at `routes_dump.py:496` | `dump` | **20/min** | one LLM pass per route |
| 15 | `POST /api/dump/{dump_id}/finalize` | `routes_dump.py:792` | `call_llm` at `assignment_dump.py:128` | `dump` | **20/min** | finalize = LLM pass |
| 16 | `POST /api/dump/batch/finalize` | `routes_dump.py:730` | batch → `assignment_dump.py:128` per item | `dump` | **20/min** | a batch is N LLM passes; 20 batches/min is already a lot |
| 17 | `POST /api/study-guide` | `main.py:1889` | `study_tools._invoke_llm` (`study_tools.py:73-84`) | `study` *(new)* | **30/min** | generation; generous, finite |
| 18 | `POST /api/flashcards` | `main.py:1894` | same | `study` | **30/min** | |
| 19 | `POST /api/practice-test` | `main.py:1899` | same | `study` | **30/min** | |
| 20 | `POST /api/summary` | `main.py:1904` | same | `study` | **30/min** | |
| 21 | `POST /api/generate/stream/{kind}` | `main.py:1924` | `study_tools` generators (`study_tools.py:264-268`) | `study` | **30/min** | |
| 22 | `POST /api/study/decks/{material_id}/review` | `routes_study_tools.py:131` | `_invoke_llm` / `generate_study_guide` | `study` | **30/min** | |
| 23 | `POST /api/study/quiz/{material_id}/grade` | `routes_study_tools.py:201` | `study_tools.py:241` `call_llm` | `study` | **30/min** | |
| — | `POST /api/engines/stylometry/rewrite` | `routes_engines.py:116` | **regex/table only** (`routes_engines.py:118-140`), no paid call | *none* | — | excluded — local |
| — | `POST /api/features/detect-type` | `routes_features.py:146` | local heuristic | *none* | — | excluded — local |

**Dead kind:** `typing` (`server/ratelimit.py:125`) maps to no HTTP route — the typing engine is
client-side CDP (`server/typing_engine/`, no paid call). Its comment "one call per round of a
multi-action loop" is wrong: the per-round call is `agent_chat` → `agent_turn`. Remove `typing` or
repurpose it; do not wire it.

---

## (c) Layer 2 — the edge (Cloudflare)

`/home/roni-saguey/.cloudflared/helpotron.yml` (9 lines) declares a tunnel with `ingress` only:
`helpotron.dpdns.org → localhost:5173`, `t2b.helpotron.dpdns.org → localhost:5000`, else 404.
**That is the entire edge configuration.** There are **no** Cloudflare rate-limiting rules, no
WAF custom rules, no Bot Fight Mode, no Turnstile, no IP-access rules, no origin-pull
authentication in this file. `deploy/nginx.conf` is unused (traffic arrives through the tunnel).
Anything "assumed" about Cloudflare protection is exactly that — assumed, not configured.

**Doable from this box (cloudflared tunnel config only):** nothing that rate-limits. The tunnel
config controls *routing*; Cloudflare's rate-limit/WAF/bot features are dashboard/API-side and the
API token in use is scoped to the tunnel, not to zone rules.

**Owner must click (Cloudflare dashboard, zone `dpdns.org`):**
1. **Bot Fight Mode** → ON (managed challenge) for `helpotron.dpdns.org`.
2. **WAF rate-limiting rule**: `POST /api/*` (all API paths), block/mitigate at e.g. **60 req/min
   per IP** on sensitive cost-incurring paths, higher (300/min) on static.
3. **WAF custom rule** to cap the specific expensive paths if they need tighter edge gating than
   the origin: `/api/agent/*`, `/api/transcribe`, `/api/ai/detect`.
4. **Origin-pull authentication** (mTLS or `Cloudflare-Access` service token) so `localhost:5173`
   is not directly reachable from the internet bypassing the edge.

The server-side Layer-1 limiter (this report) is the thing that actually works regardless — the
edge is defense-in-depth, not a substitute, and it cannot key on authenticated user identity the
way `costly_guard` can (shared Wi-Fi / rotating VPN defeats IP-only edge rules).

---

## (d) Layer 3 — the client

- **`web/src/api.js` backoff** (`queueRetry`, `web/src/api.js:141-164`): triggers **only** on the
  memory-budget queue error (`isQueueError`: `status===429 && message===QUEUE_MESSAGE`,
  `web/src/api.js:133-135`). Bounded at **10 minutes**, backoff 3s→10s capped (`web/src/api.js:139-144`).
  It will **not** amplify a `costly_guard` 429: that 429 carries a different detail string, so it
  bypasses `queueRetry` and surfaces as a normal `retry` error (via `lib/errors.js`). **No storm
  amplification.** CSRF self-heal (`web/src/api.js:207-210`) retries once, guarded by
  `__csrfRetried`. Good.
- **Double-submit guards**: of 509 raw `<button>` elements in `web/src`, only **2** carry a
  `disabled=` guard, though 103 carry a `disabled=` bound to a loading/busy/submitting flag. The
  spread is thin; the primary submit paths are covered by `withBusy` in the extension (already
  shipped) but the web SPA relies on scattered `disabled={loading}`. Not the runaway driver —
  server rate limiting is the real gate — but worth a sweep for any submit button that fires a
  paid endpoint without a `disabled={loading}`.
- **Extension multi-round loop has a stop condition** (not missing):
  `extension/popup.js:3705` `AGENT_LOOP_HARD_ROUND_CAP = 40`; budget `used >= tool_call_budget`
  (`:3734`); two-stalled-rounds guard (`:3744`); pause guard. The loop is bounded. Its ceiling is
  **40 round-trips / user action**, each a paid `agent_chat` + vision — which is why Layer-1
  `agent_turn` at 60/min is the correct safety net above it.

---

## (e) The unmetered hole — recommendation

`is_unmetered()` = admin (`server/credits.py:321-333`). The operator has no request ceiling and no
cost ceiling. **A rate limit is NOT sufficient** — a rate limit bounds *count*, not *cost*; one
operator action can be an arbitrarily expensive agent task, a 2-hour transcription, or 40 vision
rounds. What is needed is a **hard daily dollar cap**.

It is cheap because the ledger already records the operator's spend: `ApiUsageLog.base_cost_usd`
is written by `cost_engine.log_api_call` / `record_service_cost` for *every* user including admin
(metering binds `current_meter_user()` regardless of `is_unmetered`). So the cap is one SUM query.

**Concrete number: `$10 / day` hard cap on `base_cost_usd` for unmetered accounts** (the operator),
configurable via `ADMIN_DAILY_COST_CAP_USD` (default `10.00`). Rationale: Elite = 270,000
tokens/month ≈ $27/month ≈ ~$0.90/day, so $10/day gives the owner ~11× headroom for testing while
bounding a runaway to $10/day instead of unbounded (the 08-19 incident was $19.43 in a day).
Enforcement point: alongside the rate limiter, in the same guard (or `has_usage_balance`) — check
`SUM(ApiUsageLog.base_cost_usd) WHERE user_id = :id AND created_at > now-24h` and refuse new work
with a clear 402/429 when exceeded. Because `charge_actual_usage` currently returns 0 for
unmetered users, the cap must be checked **before** work starts (it is the only brake an
unmetered account has).

---

## (f) Circuit breaker — finding

**None.** `grep -rni "breaker|cooldown|emergency|kill-switch|circuit|fuse|panic" server/` returns
only false positives ("refuse", "short-circuit" in the *detector funnel*, `cf_computer`
feature-flag). There is no mechanism that:
- trips when OpenRouter returns persistent 5xx/timeouts (a `call_llm` retry storm would keep
  billing the failed attempts), or
- halts new work when hourly/daily spend spikes past a threshold.

The existing partial brakes (memguard RAM 429, per-key limits, START-only token gate) bound memory
and per-key volume but **not dollars and not the operator**. The daily cost cap in §(e) is the
missing breaker; add a second cheap one: in `call_llm` (`server/llm.py`), if the last N OpenRouter
calls errored, stop and surface rather than silently retrying (see plan step 6).

---

## (g) Surgical implementation plan

Each step: exact file, exact change, test to add, one verify command. (Run from repo root; use
`./.venv/bin/python`.)

1. **Add missing kinds + `costly_check` helper.** In `server/ratelimit.py`: add `"vision": (90, 60.0)`,
   `"transcribe": (10, 60.0)`, `"study": (30, 60.0)` to `DEFAULT_COSTLY_LIMITS`; drop the dead
   `"typing"` key; add `costly_check(kind, request, user)` from BUG 2. Keep `costly_guard` as-is
   for API-compat but note double-auth.
   *Test:* `server/tests/test_ratelimit.py` — assert `costly_check` raises 429 on the 61st call
   and honours per-account keying (two users, one limit). *Verify:*
   `./.venv/bin/python -m pytest server/tests/test_ratelimit.py -q`

2. **Fix `_caller_key`** (`server/ratelimit.py:130-142`) to use `client_identity(request)` (BUG 1).
   *Test:* unit test that a request with `client.host == "127.0.0.1"` and a `cf-connecting-ip`
   header keys on the forwarded IP. *Verify:* same pytest file.

3. **Wire `costly_check` into the high-value routes** — add as first line of the handler (after
   auth) for routes #1–#23 above. Start with the four that can bill the most: `send_chat_message`
   (`routes_overlord.py:2446`), `extension_vision` (`routes_extension.py:931`),
   `ai_detect` (`main.py:1770`), `humanize_assignment_route` (`main.py:2468`). Then the rest.
   *Test:* a request-level test that hits `POST /api/ai/detect` 21× in 60s and asserts the 21st
   returns 429 with `Retry-After`. *Verify:* `./.venv/bin/python -m pytest server/tests -q -k detect`

4. **Unmetered daily cost cap.** In `server/credits.py`, add `daily_cost_exceeded(db, user, cap_usd)`
   that sums `ApiUsageLog.base_cost_usd` for the last 24h; call it in `has_usage_balance` (only when
   `is_unmetered(user)`) and return False when exceeded. Read cap from `config.admin_daily_cost_cap_usd`
   (default `10.00`).
   *Test:* `server/tests/test_credits.py` — seed an `ApiUsageLog` row of `base_cost_usd=11.0` for an
   admin and assert `has_usage_balance` returns False; assert a non-admin is unaffected.
   *Verify:* `./.venv/bin/python -m pytest server/tests/test_credits.py -q`

5. **Layer-2 edge rules** — no code; hand the §(c) list to the owner for the dashboard. Nothing to
   verify on this box.

6. **LLM error breaker (optional, cheap).** In `server/llm.py` `call_llm`, before the retry
   ladder, if a module-level rolling counter shows ≥N (e.g. 5) consecutive upstream errors within
   60s, raise a clear `HTTPException(503)` instead of retrying. Prevents a provider outage from
   being re-billed into a storm.
   *Test:* unit test with a fake httpx client returning 500s; assert the 6th call raises 503
   without firing. *Verify:* `./.venv/bin/python -m pytest server/tests -q -k llm`

7. **Import smoke (do not restart the live service):**
   `./.venv/bin/python -c "import sys;sys.path.insert(0,'.');import server.main"`

---

## (h) RISKS / DO NOT DO

- **Do not** restart `helpotron-api.service` to "verify" — the site is deliberately down behind a
  maintenance page; a syntax error would turn the tree into an outage. Use the import smoke in
  step 7.
- **Do not** key the rate limiter on `request.client.host` anywhere — behind the tunnel it is
  always `127.0.0.1` and collapses every user into one bucket. Key on the resolved `public_id`
  (this is the entire point of `costly_guard`).
- **Do not** wire `typing` — no route exists; it is a false lead that would add a limit to nothing.
- **Do not** set `agent_turn` below 60/min — the extension's legitimate 40-round loop would trip
  it. A limit that breaks the loop is worse than none.
- **Do not** add any automated alerting — owner rule is **zero automated alerts**; the daily-cost
  cap must be a server-side refusal + a row in the ledger, not a page.
- **Do not** touch `~/.claude/**` or revert any uncommitted owner/peer work; this report is the
  only file added.
- **Do not** enforce the unmetered cap via `charge_actual_usage` (it returns 0 for unmetered) — it
  must be a **pre-start** check, or it silently does nothing.
- **Do not** "fix" the `RateLimiter` non-LRU eviction now — it errs permissive and is irrelevant
  at the current key cardinality; changing it risks over-blocking.

---

### UNVERIFIED
- Exact `usage.cost` presence on **every** OpenRouter call type (streaming vs non-streaming) — the
  code comment at `cost_tracking.py:70-72` claims it is always present (measured 2026-09-18), but I
  did not re-run a live call. The daily cap falls back to `base_cost_usd` regardless, so the
  mechanism holds either way.
- Whether `cf_computer` (Cloudflare Computer sandbox) is ever enabled in prod — currently
  `HELPOTRON_CF_COMPUTER_ENABLED=false` (`config.py:119`), so route #7 is latent.
