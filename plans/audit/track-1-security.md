# Track 1: Security & Authz — Partial Audit Findings
> **Status**: PARTIAL — subagent killed due to rate limit. Evidence extracted from reasoning transcript.
> All findings below are based on verified code inspection from the agent's tool calls.

---

## SEC-01 (HIGH) — Rate Limiter Always Sees 127.0.0.1, Enabling Global DoS via Shared IP

**Track**: security
**Severity**: high
**Location**: `server/routes_auth.py` (RateLimitMiddleware), critical auth flows using `request.client.host`

**Evidence**:
- `RateLimitMiddleware` correctly reads `cf-connecting-ip` / `x-forwarded-for` proxy headers
- Critical auth endpoints (login, 2FA, password reset) use `request.client.host` directly, which always resolves to `127.0.0.1` behind a reverse proxy
- Reproduced: A single user's repeated failed login attempts trips the lockout for ALL users behind the same proxy IP (i.e., the entire userbase behind Cloudflare)
- Lockout error triggered despite valid credentials on subsequent attempt

**Impact**: Any user with a bad password can globally lock out all other users. Attacker can deliberately trigger lockout to DoS auth for everyone.

**Fix approach**: Replace `request.client.host` with the same proxy-aware IP extraction used in `RateLimitMiddleware` — read `cf-connecting-ip` then `x-forwarded-for`, fall back to `request.client.host`. Apply consistently to all auth rate-limit checks.

**Verification**: `"unverified": false` — agent reproduced the lockout via script.

---

## SEC-02 (MEDIUM) — `require_admin` Falls Through to Session Cookie After JWT Check

**Track**: security
**Severity**: medium
**Location**: `server/admin.py:L46` — `require_admin`

**Evidence**:
- Auth logic: check Bearer JWT first, then fall through to session cookie if absent
- Both paths check ban status + `is_admin`/`role` before granting access — logic appears correct
- Concern: no explicit rejection of malformed/expired JWT before falling through — need to confirm expired JWTs are not silently downgraded to cookie auth

**Status**: `"unverified": true` — agent was killed before completing the JWT expiry fallthrough test.

---

## SEC-03 (MEDIUM) — 2FA Routes: Async Endpoint with Synchronous Cloudflare Turnstile Verification

**Track**: security / latency crossover
**Severity**: medium
**Location**: `server/routes_auth_2fa.py` — `verify_turnstile_token` called from async handler

**Evidence**:
- `verify_turnstile_token` uses `urllib.request.urlopen` (blocking, sync) inside an `async def` handler
- Measured: blocks event loop for 500ms+ per verification
- Also affects `submit_help_ticket` and `apply_for_testing_access`

**Fix approach**: Wrap in `asyncio.to_thread()` or replace with `httpx.AsyncClient`.

**Verification**: `"unverified": false` — agent measured 500ms+ event loop freeze.

---

## Open Items (not reached before kill)
- IDOR scan on all routes that accept `assignment_id`, `user_id`, `organization_id` — NOT completed
- `run_shell` sandbox depth (sympy.sympify already closed in pentest) — NOT re-verified
- API key boundary vs session auth exhaustive check — NOT completed
