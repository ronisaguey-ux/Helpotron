# Session Security — "2FA does not protect a stolen session"

Agent 2 of 10. Helpotron. Read-only audit; no code was changed.

**Bottom line up front:** the repo is *not* in the worst state the brief suspected. Password change/reset **does** revoke sessions, and API keys **are** hashed at rest. But there are two real gaps: (1) there is **no way for a user to see or revoke their own active sessions** other than changing their password or logging out of one device, and (2) the **session token is stored in plaintext** in the DB, so a single DB read equals every live session — strictly worse than a stolen browser.

---

## (a) Verified current state — facts with file:line

### The `UserSession` row is exactly 6 columns
`server/database.py:123-134`:
```python
class UserSession(Base):
    __tablename__ = "user_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    public_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
```
No `last_used_at`, no `user_agent`, no `ip_address`. Confirmed — the brief was right on this point.

### Session token is PLAINTEXT AT REST (the biggest finding)
- Minted: `SessionStore.create_session` — `server/security.py:272-288`. Token = `secrets.token_urlsafe(48)` (line 274), then stored verbatim: `UserSession(token=token, ...)` (line 278-283). **No hash.**
- Looked up: `SessionStore.get_session` — `server/security.py:295` does `db.query(UserSession).filter(UserSession.token == token).first()` — plaintext SQL equality, **no `secrets.compare_digest`**, no hash.
- The column is unique+indexed (`database.py:128`), so `SELECT token FROM user_sessions` returns every live bearer credential in cleartext.
- **Consequence:** a DB read (backup, query log, SQL injection, admin read) = every active session for every user. This is a different and worse threat than an info-stealer grabbing one browser, because it is *mass* and *silent*.

### API keys ARE hashed (the contrast that makes the above stand out)
- `server/api_keys.py:59-60` `_hash()` = `sha256(key).hexdigest()`; stored in `ApiKey.key_hash` (`database.py:158`, `String(64)`).
- Lookup `check_api_key` — `server/api_keys.py:174-180` hashes the presented key, matches on `key_hash`, then **`secrets.compare_digest(row.key_hash, digest)`** (line 180) for the constant-time check.
- The class docstring at `api_keys.py:13-21` states the intent verbatim: *"Only a SHA-256 hash is stored … a database dump contains no working credentials."*
- **The session token got none of this treatment.** The API-key architecture was built *specifically* to fix the "session token in a browser" problem (`api_keys.py:7-11`), yet the session table it was replacing still stores the token raw.

### There is no session listing/revocation surface
Full grep of `server/` for session list/revoke routes → the only touchpoints are:
- `POST /api/logout` — `server/main.py:1330-1354`: deletes the *current* session (cookie or Bearer) and revokes the user's JWTs (`revoke_user_jwts`).
- Self-service password change — `server/routes_user_settings.py:712-741` (see (c)).
- Recovery reset — `server/recovery.py:425` `SessionStore.revoke_all_sessions(user.id)`.
- Admin resets/bans — `server/admin.py:511, 528, 564, 575, 602, 826` all call `SessionStore.revoke_all_sessions`.

No `GET`/`DELETE` endpoint lets a user list their sessions or kill one by id. The only user-facing "kill everything else" is changing the password.

### Dead-code landmine
`SessionStore.get_all_sessions` — `server/security.py:344-359` returns a dict **keyed by the raw token** for **every user** (`{s.token: {...}}`). It has **zero callers** (verified). If it is ever wired to a route, it is a full session-token dump. Flag it in the plan as DO-NOT-USE, and consider deleting it.

---

## (b) Exact attack path a stolen token takes TODAY

1. **Token leaves the browser.** The session token is an `httponly` cookie (`main.py:1242-1250`) but is *also* returned in plaintext in the login JSON as `"session_token": token` (`main.py:1265`), documented as the API-client/extension contract. A malicious third-party extension, info-stealer, or unsecured network that can read the cookie or the login response has the raw token.
2. **Import into another browser.** Attacker sets the `helpotron_session` cookie (or `Authorization: Bearer <token>`) in their own client.
3. **Instant full identity.** `get_current_user` (`security.py:489-557`) resolves it at lines 500-511 (cookie) or 548-557 (Bearer), and `get_current_authenticated_user` (`routes_features.py:19-94`) does the same at 31-47 and 77-89. 2FA is never re-checked — it fired once at login (`main.py:1204-1226`).
4. **The session slides forward.** Every authenticated request calls `SessionStore.refresh_session` (`security.py:330-341`), pushing `expires_at` out another 7 days. An active stolen token essentially never dies on its own.
5. **The victim cannot see it or kill it.** There is no session list to notice the extra device, and no per-session revoke. The only self-service remedy is a password change (which does work — see (c)) or "log out" (which only kills the *attacker's own* current token, not the victim's other sessions).
6. **Blast radius = full account.** A stolen *session* passes every `require_session_auth` gate, so it can change the password (locking out the real owner), rename the login id, delete the account, and spend money. See (c)/(d).

---

## (c) Does changing the password revoke sessions? — YES (this contradicts the brief's suspicion)

`server/routes_user_settings.py:712-741`, quoted:
```python
@router.post("/change-password")
async def change_password(payload: ChangePasswordPayload, request: Request, db: Session = Depends(get_db)):
    """Self-service password change (operator 08-26): verify current, enforce
    strength, rotate hash, invalidate other sessions."""
    ...
    # Invalidate all other active sessions and JWTs for this account
    from .security import revoke_user_jwts
    revoke_user_jwts(user.id)
    current_token = request.cookies.get(SESSION_COOKIE_NAME)
    if current_token:
        db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.token != current_token).delete()
    else:
        db.query(UserSession).filter(UserSession.user_id == user.id).delete()
    db.commit()
    return {"status": "success", "message": "Password updated. Other sessions have been signed out."}
```

And the recovery path, `server/recovery.py:423-425`:
```python
    db.commit()
    # Kick other sessions — SessionStore uses its OWN connection ...
    SessionStore.revoke_all_sessions(user.id)
```

`SessionStore.revoke_all_sessions` — `security.py:362-374` — deletes every `UserSession` row for the user and calls `revoke_user_jwts`.

This is pinned by a test: `server/tests/test_security_hardened.py:452-501` `test_password_change_revokes_other_sessions` (asserts `sess_token_1`/`sess_token_2` are gone, `sess_token_curr` survives).

**So the worst-case "a compromised session survives a password reset" is FALSE here.** A stolen session is revoked the moment the victim changes their password or an admin resets it. What is missing is everything *short* of that nuclear option: the victim cannot see which devices hold sessions, cannot kill one device, and is not told "you have N active sessions."

---

## (d) Blast radius: stolen `htk_` key vs stolen session

The split is enforced by `require_session_auth` — `server/security.py:571-588` — which raises 403 for any request that arrived via an API key (`Bearer htk_` prefix or `request.state.auth_via_api_key`). Routes that call it **refuse a key and demand a real session**:

| Route | Guard location | What a stolen SESSION can do that a key CANNOT |
|---|---|---|
| `POST /api/keys` (mint another key) | `routes_api_keys.py:42` | Issue itself an unlimited key |
| `POST /api/user/change-password` | `routes_user_settings.py:723` | Lock the real owner out |
| `POST /api/user/public-id` (rename login id) | `routes_profile.py:164` | Steal the account's login identity |
| `POST /api/auth/2fa/setup` | `routes_auth_2fa.py:177` | Enroll its own 2FA factor |
| `POST /api/auth/2fa/verify-setup` | `routes_auth_2fa.py:264` | Activate the enrolled factor |
| `DELETE /api/user/account` (GDPR erase) | `routes_user_settings.py:1037` | Delete the entire account |
| `POST /api/payments` | `main.py:2142` | Spend money / mint tokens |
| `POST /api/checkout` | `main.py:2187` | Start a subscription |
| `POST /api/discount` | `main.py:2212` | Record a data submission for credits |
| `POST /api/billing/portal` | `routes_billing.py:30` | Open the Stripe billing portal |

**A stolen `htk_` key is bounded**: it can authenticate as the user across the whole *functional* surface — `/api/me`, `GET/PATCH /api/user/settings` (`routes_user_settings.py:175, 202`), assignments, features, extension routes, dumps, running agents, burning metered credits — but it **cannot** mint a key, change the password, rename the login id, touch 2FA, delete the account, or reach billing.

Two caveats that widen the key's real-world radius:
- The key's `allowed_scopes` defaults to `{}` (= unrestricted) and `usage_limit_tokens`/`rate_limit_per_min` default to `None` (= unlimited) — `api_keys.py:76-79`. A key the user created with defaults is nearly as broad as a session for every non-guarded route.
- `check_api_key` scopes only kick in when `allowed_scopes` is non-empty (`api_keys.py:249-260`); the default key never hits that branch.

**A stolen session is a full account takeover** — all ten rows above, plus everything a key can do. That asymmetry is the point of this audit: the session is the crown-jewel credential, and it is the one that is (a) invisible and (b) unrevocable per-device and (c) plaintext in the DB.

---

## (e) The minimum viable fix — numbered plan

Mirror `server/routes_api_keys.py` throughout: same `_get_current_user` shape (`get_current_user` then `require_session_auth`, order matters), same `{"status": "success", ...}` response envelope, same `_get_current_user`-per-route pattern.

### Step 1 — Add the three columns to the model
`server/database.py:123-134`, after `expires_at`:
```python
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(256), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
```
(Note: `database.py` uses `datetime | None` on line 90 and `DateTime` on 164; match whichever imports cleanly — the file already imports both `datetime` and `DateTime`.)

### Step 2 — Capture `last_used_at` / `user_agent` / `ip` in the auth path (exact function)
This repo has **no auth middleware**; it has two auth entry points, and both already call `SessionStore.get_session` + `refresh_session`:

- **`last_used_at`** — stamp inside `SessionStore.refresh_session` (`security.py:330-341`). It already writes `expires_at` on every authenticated request and is called by *both* paths (`security.py:504` and `routes_features.py:35` / `:81`). Add one line:
```python
    session.last_used_at = datetime.now(timezone.utc)
    session.expires_at = datetime.now(timezone.utc) + timedelta(seconds=cls._session_expiry)
```
- **`user_agent` / `ip_address`** — these need the `Request`, which `refresh_session` does not see. Add a tiny method next to `refresh_session`:
```python
    @classmethod
    def record_context(cls, token: str, user_agent: str | None, ip_address: str | None) -> None:
        from .database import SessionLocal, UserSession
        db = SessionLocal()
        try:
            session = db.query(UserSession).filter(UserSession.token == token).first()
            if session:
                if user_agent:
                    session.user_agent = user_agent[:256]
                if ip_address:
                    session.ip_address = ip_address[:64]
                db.commit()
        finally:
            db.close()
```
  and call it in exactly two places, immediately after a successful session lookup:
  - `security.py` `get_current_user`, after line 504 (cookie path) and after line 550 (Bearer path): `SessionStore.record_context(token, request.headers.get("user-agent"), request.client.host if request.client else None)`.
  - `routes_features.py` `get_current_authenticated_user`, after line 35 and after line 81: same call. `ip` source = `request.client.host` (matches repo convention — `main.py:300`, `ratelimit.py:70`); `user_agent` source = `request.headers.get("user-agent")`.

This is the choke point: *every* session-authenticated request flows through one of those two functions, so the capture cannot be skipped by a new route.

### Step 3 — `GET /api/user/sessions` (list the caller's own, never the token)
New file `server/routes_user_sessions.py`, mirroring `routes_api_keys.py:31-43`:
```python
router = APIRouter(prefix="/api/user/sessions", tags=["sessions"])

async def _session_user(request: Request, db: Session):
    from .security import get_current_user, require_session_auth
    user = await get_current_user(request=request)   # ORDER MATTERS, same as keys
    require_session_auth(request)                    # a key may not list/revoke sessions
    return user
```
List handler returns, for each of the caller's rows only (`UserSession.user_id == user.id`, ordered `created_at.desc()`):
```python
{
  "id": row.id,
  "created_at": row.created_at.isoformat(),
  "expires_at": row.expires_at.isoformat(),
  "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
  "user_agent": (row.user_agent or "")[:80],        # truncated, see (g)
  "ip_address": mask_ip(row.ip_address),            # masked, see (g)
  "is_current": is_current,
}
```
**`token` is never a key in this dict.** Envelope: `{"status": "success", "sessions": [...]}`.

### Step 4 — the "this device" marker, given the token is never returned
The server already knows the current row: it just authenticated *this* request with a token. Extract the presented credential the same way auth does (cookie `helpotron_session` first, else a non-`htk_`/non-JWT Bearer), then compare server-side, never returning the token:
```python
def _presented_session_token(request: Request) -> str | None:
    from .security import SESSION_COOKIE_NAME, _API_KEY_PREFIX, verify_jwt_token
    t = request.cookies.get(SESSION_COOKIE_NAME)
    if t:
        return t
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        bearer = auth.split(" ", 1)[1]
        if bearer.startswith(_API_KEY_PREFIX):
            return None
        if verify_jwt_token(bearer):
            return None       # JWT is not a DB session row; not "this device"
        return bearer
    return None
```
Then, per row: `is_current = bool(current) and secrets.compare_digest(row.token, current)`. The token never crosses the wire; only the boolean does. This is the concrete mechanism the brief asked for.

### Step 5 — `DELETE /api/user/sessions/{id}` and "sign out everywhere"
- `DELETE /api/user/sessions/{id}`: `_session_user(request, db)`, then delete the row **only if** `UserSession.id == id and UserSession.user_id == user.id`. 404 if not found (same bare 404 as `api_keys.delete_key`, `routes_api_keys.py:112-113`). Deleting one's *own current* row is allowed — the client just gets 401 on the next request and re-logs-in (acceptable; matches "log out" semantics).
- `DELETE /api/user/sessions` (or `POST /api/user/sessions/revoke-others`): delete all of the caller's rows **except** the presented current token. Reuse the same filter shape as change-password (`routes_user_settings.py:734-738`), but scoped to the token the request actually carries rather than only the cookie:
```python
    current = _presented_session_token(request)
    if current:
        db.query(UserSession).filter(UserSession.user_id == user.id,
                                     UserSession.token != current).delete(synchronize_session=False)
    else:
        db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    db.commit()
```
(No need to touch JWTs here — the DB session token is the long-lived credential; `revoke_user_jwts` can be called too for belt-and-braces, matching `revoke_all_sessions`.)

### Step 6 — never return the token, and treat IP/UA as PII
See (g). The list response must not contain `token`, `key_hash`, or any full `ip_address` history.

### Step 7 — tests to add (`server/tests/test_user_sessions.py`)
Each test drives the real auth layer (cookie/Bearer via `TestClient`, not a mocked user), per the landmine that a test which bypasses the broken layer passes forever:
1. `test_list_returns_own_sessions_and_never_token` — seed two users with sessions; list as user A; assert every returned id belongs to A and **no** key named `token`/`key_hash` exists in any element.
2. `test_list_marks_current_session` — seed 2 sessions for one user, request with one of them; assert exactly one row has `is_current is True` and its `id` is the current row's id.
3. `test_api_key_cannot_list_or_revoke_sessions` — mint a key (reuse `api_keys.generate_key`), hit both endpoints with `Authorization: Bearer htk_...`; assert **403** (this is the `require_session_auth` guard, the whole point).
4. `test_delete_session_revokes_it` — delete session B while holding A; assert a subsequent request with B's token returns **401** and A still works.
5. `test_sign_out_everywhere_keeps_current` — seed 3 sessions, call revoke-others with token A; assert only A's row survives.
6. `test_last_used_and_context_are_captured` — after one authenticated request, assert the current row's `last_used_at` is non-null and `user_agent`/`ip_address` are populated.

### Step 8 — (follow-up, not minimum) hash the session token at rest
This closes the "DB read = all sessions" hole by mirroring `api_keys`: store `sha256(token)` in `token`, compare `secrets.compare_digest(row.token, _hash(presented))`. It is a *separate* change because it touches every lookup (`security.py:295, 322, 334`, the change-password inline delete at `routes_user_settings.py:736` which filters on `token != current_token`) and the "current marker" comparison. Plan it as a distinct migration that back-fills hashes for existing plaintext rows. It is the real fix for the worst finding and should not be silently dropped, but it is not required for list/revoke.

**Verify command per step** (run from repo root, `./.venv/bin/python`):
- Steps 1-2: `./.venv/bin/python -c "import sys;sys.path.insert(0,'.');import server.main"` (import sanity — never restart the live service).
- Steps 3-6: `./.venv/bin/python -m pytest server/tests/test_user_sessions.py -q`.
- Regression: `./.venv/bin/python -m pytest server/tests/test_security_hardened.py::test_password_change_revokes_other_sessions server/tests/test_api_keys.py -q`.

---

## (f) Live-DB migration — ordered, idempotent

**Existing pattern** is inside `server/database.py:741-834` (`init_db`): `Base.metadata.create_all(engine)` first, then for sqlite a block of `PRAGMA table_info(<t>)` checks guarding `ALTER TABLE <t> ADD COLUMN ...` (e.g. lines 748-790 for `users`), and `CREATE INDEX IF NOT EXISTS ...` for indexes (line 828-830). `init_db()` runs on every startup via the FastAPI lifespan — `server/main.py:199-208` calls it at line 208. **No separate migrations/ directory exists; this `init_db` block is the migration system.**

Live DB: `data/db/helpotron.db` (13.9 MB, real data, live `-wal`/`-shm` present), path from `server/config.py:30` (`DATABASE_URL` default `sqlite:///{BASE_DIR}/data/db/helpotron.db`).

**What must run, in order** — add this block to `init_db()` right after the `users` block (`database.py:790`), before `conn.commit()`:

```python
columns_sessions = [row[1] for row in conn.execute(text("PRAGMA table_info(user_sessions)")).fetchall()]
if columns_sessions and "last_used_at" not in columns_sessions:
    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN last_used_at DATETIME"))
if columns_sessions and "user_agent" not in columns_sessions:
    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN user_agent VARCHAR(256)"))
if columns_sessions and "ip_address" not in columns_sessions:
    conn.execute(text("ALTER TABLE user_sessions ADD COLUMN ip_address VARCHAR(64)"))
```

**Idempotency:** each `ALTER` is guarded by a `PRAGMA table_info` read, so it fires only when the column is missing; `ALTER TABLE ... ADD COLUMN` on a column that already exists would otherwise raise "duplicate column name", and the guard prevents that. Re-running `init_db()` on an already-migrated DB is a no-op. `create_all()` does **not** retro-fit columns onto the existing `user_sessions` table (the landmine in the shared context), which is exactly why this explicit block is required.

**Order of operations for the operator:**
1. Backup: `cp data/db/helpotron.db data/db/helpotron.db.pre-session-cols` (a `.bak` convention already exists in that dir).
2. Add the model columns (Step 1) *and* the `init_db` block in the same change, so a fresh DB and the live DB both end up correct.
3. Deploy/restart `helpotron-api.service` — `init_db()` runs the guarded `ALTER`s once on startup.
4. Verify idempotency without touching prod data:
   `./.venv/bin/python -c "import sys;sys.path.insert(0,'.');from server.database import init_db;init_db();init_db()"` — the second call must not raise.

---

## (g) What a session-listing API must NEVER return, and why

1. **The token (or a hash of it).** An XSS on the settings page (the UI that will render this list) could `fetch` the response and lift every bearer token in the account — the exact info-stealer scenario this feature exists to mitigate. Return `id` only, never `token`, never a `token_prefix` that could be brute-forced into a live token (a 64-char `token_urlsafe(48)` token has no usable short prefix anyway — do not invent one).
2. **Full `ip_address` history.** A chronological IP list is PII (location history, GDPR Article 4/9 territory, and this repo already ships a GDPR delete at `routes_user_settings.py:1032`). Return either `ip_address` masked (e.g. `198.51.100.x` / last octet zeroed, or just an approximate "region" if that is ever added) or omit it from the list entirely and show only the *current* request's IP on the "this device" row. `user_agent` is fine truncated (it is already in every request header), but truncate it (`[:80]`) so it cannot carry a huge/injected value into the DOM.

---

## (h) RISKS / DO NOT DO

- **Do NOT wire `SessionStore.get_all_sessions`** (`security.py:344-359`). It returns every user's raw token as a dict key. It is dead code today; leave it dead or delete it.
- **Do NOT return `token` in the list response.** Reuse the `routes_api_keys.py` invariant: the secret appears exactly once (creation), never in a list.
- **Do NOT gate the new endpoints with `get_current_authenticated_user` alone** — that function *accepts* API keys (`routes_features.py:57-65`). The list/revoke routes must call `require_session_auth` after auth (order matters, per `routes_api_keys.py:37-42`), or a leaked key could list/revoke sessions and undo the whole account-takeover boundary.
- **Do NOT capture `ip_address` from an unvalidated header** (e.g. raw `X-Forwarded-For`). Use `request.client.host` (repo convention). uvicorn runs `--proxy-headers` (noted at `main.py:1239`), so `request.client.host` already reflects the real client behind cloudflared; do not add a second hand-rolled `XFF` parser.
- **Do NOT restart the live `helpotron-api.service` to "verify".** It is live; a syntax error becomes an outage. Import-check only (`server.main` import) per the shared context.
- **Do NOT revert anyone's WIP.** The tree is dirty (10 agents). This report is additive only.
- **Do NOT change `token` to hashed at rest in the same change as the list/revoke feature** (Step 8 is deliberately separate) — it alters the lookup equality used by `routes_user_settings.py:736` and the current-marker comparison, and needs its own back-fill migration.
- **Do NOT return `last_used_at` before it is populated** as a lie — return `null` until Step 2 has actually run at least once on the live DB.

## UNVERIFIED
- Whether the root `.env` sets a non-default `DATABASE_URL` (the path above is the config default at `config.py:30`; the file at `data/db/helpotron.db` matches it, but `.env` was read programmatically, not echoed).
- Exact truncation widths for `user_agent`/`ip_address` masking are proposed, not owner-approved; they are design choices, not facts.
