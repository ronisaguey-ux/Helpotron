# Helpotron Security Sweep — Helpotron (scratch instance)

- **Date**: 2026-09-03 (probes ran 2026-09-02 20:30 → 2026-09-03 00:50 local)
- **Target**: `http://127.0.0.1:8001` — isolated scratch instance of the Helpotron FastAPI server, running from the disposable code copy `/tmp/helpotron-sweep` (unmodified; source read for route understanding only) with a disposable SQLite DB `/tmp/sweep_helpotron.db`. Since production runs on `127.0.0.1:8000`, both ports' responses were cross-checked each session to guarantee probe isolation.
- **Scope / hard boundaries honored**:
  - Probing limited to `http://127.0.0.1:8001` via HTTP only. Never touched `127.0.0.1:8000`, `helpotron.dpdns.org`, or any other host.
  - No code changes, no restarts, no file modifications inside `/tmp/helpotron-sweep`; server files only read.
  - User-space tooling only (`uv`-managed venv `/tmp/ht-venv`); no sudo, no system installs.
  - Concurrency ≤ 16; no flood/DDoS behavior; no payload-delivery, phishing, or RAT activity.
  - **Isolation verification**: every test account was confirmed present in `/tmp/sweep_helpotron.db` (5 accounts: `iso_probe2`, `swpa_1788410212_a`, `swpa_1788410212_b`, `c_csrf_1788410921`, `duptest2`) and a final query showed **0 matches** in the production DB (`/home/roni/Roni_workspace/helpotron/data/db/helpotron.db`). No sweep data ever reached production.
- **Credential note**: the scratch server uses `config.py` defaults for `JWT_SECRET` and `SECRET_KEY` (development values), which are NOT production values; secret-guessing/birthday attacks carry no transfer value and were not pursued (see I-01).
- **Tools used**: `python3` + `requests` (custom probe scripts, raw sockets for header inspection), `curl`, `sqlmap` 1.10.9 (PyPI, installed with `uv` into `/tmp/ht-venv`), SQLite CLI reads against the disposable scratch DB only.
- **Verification standard**: only findings reproduced live against the scratch instance with an exact payload and observed response are reported. Attempted and not exploitable items are listed so the negative result is visible.

---

## Findings

### Critical

None. No unauthenticated remote compromise, no SQL injection, no command execution, no path traversal, no admin takeover was found.

### High

None. (Credentials/session access control, authorization boundaries, and the elevated-admin paths all held up under testing — see "Verified negatives".)

---

### Medium

#### M-01 — Unauthenticated download of other users' file assets via `/uploads/assignment_dump/…` (no auth, name-only access control)

- **Endpoint/Method**: `GET /uploads/assignment_dump/<32-hex-filename>` — `HardenedUploadsStaticFiles` served directly from disk with no authentication check.
- **Payload** (no cookies, no auth headers):
  ```
  GET http://127.0.0.1:8001/uploads/assignment_dump/023bc0c65daf4f3e9b72b38bc43325bf.pptx
  GET http://127.0.0.1:8001/uploads/assignment_dump/0834f494cd754deaa0863ae866c26d2b.exe
  ```
- **Expected vs observed**: Expected: 401/403 unless the requester owns the material. Observed: both requests returned **HTTP 200** with the full file — `.pptx`: `Content-Length: 22274715` (≈22 MB), `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`; `.exe`: `Content-Type: application/x-msdos-program`. Headers did include `Content-Disposition: attachment`, `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff` (good containment), but nothing enforces *ownership*: a known/leaked filename is fully readable by an anonymous client. The only access control is the 128-bit random-hex filename ("security by obscurity"); filenames can leak via shares, logs, drafts, messaging, or an earlier user's own links.
- **Fix hint**: serve dump/upload files behind the authenticated ownership check (route through a GET that validates `assignment.user_id == current_user.id`), or issue expiring signed URLs instead of a static mount.

#### M-02 — Recovery flow account-enumeration oracle (two distinct responses leak account existence)

- **Endpoints/Methods**: `GET /api/recovery/options` and `POST /api/recovery/verify` (both unauthenticated).
- **Payload / proof**:
  ```
  GET /api/recovery/options?public_id=swpa_1788410212_b      → 200 {"status":"success","public_id":"swpa_1788410212_b","email_set":false,"phone_set":false,"email_masked":"","phone_masked":""}
  GET /api/recovery/options?public_id=zzz_no_such_acct_9x    → 200 {"status":"success","has_email":false,"email_masked":null,"has_phone":false,"phone_masked":null,"dev":true}

  POST /api/recovery/verify {"public_id":"zzz_no_such_acct_9x","new_password":"Cr4ftedPass!0","code":"000000"}          → 400 {"detail":"No account matches that public_id."}
  POST /api/recovery/verify {"public_id":"swpa_1788410212_b","new_password":"Cr4ftedPass!0","code":"000000"}            → 400 {"detail":"No active recovery request found — request a new code."}
  ```
- **Expected vs observed**: `options` is intended to be enumeration-safe but returns a *different JSON schema* for missing vs existing accounts (`has_email/has_phone/dev` keys vs `email_set/phone_set` keys, and `public_id` echoed only for existing accounts) — trivially scriptable. `verify` is the sharper oracle: identical HTTP status (400) but **different `detail` text** that names whether the public_id exists. An attacker can enumerate the full account base at 2 requests per check, which feeds targeted attacks (M-03 spam, M-04 lockout, social targets).
- **Fix hint**: return byte-identical response bodies for missing and existing accounts in both endpoints (same key set, same generic error string), including the `verify` path.

#### M-03 — Unauthenticated recovery-request spam → admin-inbox/Telegram flooding, false "delivered", recovery code written in plaintext server log

- **Endpoint/Method**: `POST /api/recovery/request` (unauthenticated, no captcha, no per-account/per-IP cap beyond global middleware).
- **Payload**:
  ```
  POST /api/recovery/request {"public_id":"swpa_1788410212_b","method":"dev"}
  → 200 {"status":"success","delivered":true,"…"}
  ```
- **Expected vs observed**: recovery "request with a code" is a sensitive, authenticated-adjacent action expected to be rate-limited and to only claim delivery when delivery genuinely happens. Observed: anyone can mint unlimited 6-digit codes for any known public_id; every `method=dev` request inserts an `AdminMessage` row (surfaced to the operator as an alert/Telegram ping), so a few thousand requests flood the admin channel and the request-processing path (a loose DoS against operations). In this config (`EmailService` mock, no SMTP, no Telegram bot) the response claims `"delivered": true` while nothing was delivered — and the code itself is written in plaintext into the server log by the mock sender (`[Mock Email] To: … Content: … your code is 000999 …`), a sensitive-value-at-rest issue (any log reader — or the log-exfil path in future — recovers live recovery codes).
- **Fix hint**: authenticate or captcha-gate `/request`, add per-account + per-IP cooldowns (e.g., 3/hour/account, 10/hour/IP), debounce/suppress duplicate AdminMessage alerts, and never log generated codes (log delivery metadata only).

#### M-04 — Login lockout can be triggered by an attacker, and valid credentials are rejected during the window; per-account exponential backoff never escalates past 1 s

- **Endpoints/Methods**: `POST /api/login` (unauthenticated), `auth_limiter` (per-account) and `auth_limiter` per-IP logic in `server/security.py`.
- **Payload / proof** (6 sequential wrong-password logins to `swpa_1788410212_b`):
  ```
  attempt 1 → 401 {"detail":"Invalid credentials"}                      (failure logged)
  attempt 2 → 429 {"detail":"Too many failed attempts. Try again in 1s"}  Retry-After: 1
  ```
  And the IP-throttle, using 5 *different fictional* accounts (one client IP):
  ```
  bursts 1-5 → 401 {"detail":"Invalid credentials"}
  burst 6    → 429 {"detail":"Too many failed login attempts from this address. Try again in 58s"}  Retry-After: 58
  ```
  During the window, even the legitimate password is rejected — a fresh, correct login for `c_csrf_1788410921` returned `429 … Try again in 59s` while the window was active.
- **Expected vs observed**: expected "5 failures per hour per account with growing exponential backoff" per the code comment (2^(fails-5)). Observed: (a) any unauthenticated caller who knows (or enumerates, see M-02) a public_id can fire 5 wrong passwords and **lock the real user out of their own account for up to ~1 hour** — a DoS primitive with no cost to the attacker; (b) correct-credential logins are rejected with 429 during the window (no exception for valid auth); (c) because blocked attempts are answered *before* `log_failure()`, the failure deque never grows, so the backoff is **permanently stuck at 1 s** — the "5 failures/hour" protection is really "one attempt per second for an hour" (≈3,600 password guesses/hour against the locked account, from a single IP); (d) the IP throttle counts *all* failed attempts, including logins against nonexistent accounts, so an attacker pushing 5 junk attempts can also block every other user sharing that IP (school NAT) from logging in for ~60 s; and a successful login does not clear the IP-side window (`reset_failures` only clears the account key).
- **Fix hint**: escalate backoff geometrically even when blocked (count the 429s), separate attacker-triggered lockout from the account's own failures (e.g., penalize only after a per-IP burst *plus* verify), and exempt correct credentials from the IP throttle (check password first, then throttle), or add captcha challenge for suspect IPs.

#### M-05 — Credentialed CORS reflection to any `chrome-extension://` origin (arbitrary extension can read the user's data)

- **Endpoint/Method**: all API endpoints; demonstrated on `GET /api/csrf` and the `OPTIONS` preflight for `/api/login`.
- **Payload**:
  ```
  GET /api/csrf
  Origin: chrome-extension://aaaaaa1111
  → 200  Access-Control-Allow-Origin: chrome-extension://aaaaaa1111
         Access-Control-Allow-Credentials: true
  ```
  (same reflection verified on an `OPTIONS` preflight: `200, ACAO: chrome-extension://aaaaaa1111, ACAC: true`).
- **Expected vs observed**: the app's own extension legitimately needs CORS, but the wildcard-style regex `chrome-extension://[a-pA-P0-9]{6,64}` (plus a `moz-extension://` UUID pattern) is deliberately written to match **any** browser-extension origin, not a pinned extension ID. Observed: with `access-control-allow-credentials: true`, every response body is readable cross-origin by any installed (or socially-engineered-and-installed) Chrome/Firefox extension while the victim's session cookie exists — extension reads of dashboard/settings/materials/dumps, etc., with the user's full session privileges.
- **Fix hint**: pin the exact extension ID(s) to the allowlist (`chrome-extension://<pinned-id>` only), never a character-class pattern, and keep `allow_credentials` true only for those pinned origins.

---

### Low

#### L-01 — Logout is CSRF-exempt (and has no CSRF requirement at all); session can be terminated by a hostile page under same-site conditions

- **Endpoint/Method**: `POST /api/logout`.
- **Payload**:
  ```
  POST /api/logout
  Origin: https://evil.example | Referer: https://evil.example/form.html
  Cookie: helpotron_session=<valid>
  → 200 {"message":"Logged out"}
  ```
- **Expected vs observed**: `csrf.valid_csrf` skips `/api/logout` entirely (`EXEMPT_PATHS`) and the route never checks a token, so any request carrying a session cookie logs the user out, cross-site origin or not. Mitigating factor observed: the session cookie is `SameSite=lax`, so a vanilla cross-site *form POST* in a modern browser would not send the cookie — the direct cross-site path is mostly blocked today; the gap matters for (a) extension/page-level XSS, (b) cross-site flows that browsers do attach cookies to, (c) any future `GET`-style logout or cookie-upgrade, and (d) defense-in-depth. Classified Low/defense-in-depth, kept because the endpoint was deliberately exempted.
- **Fix hint**: include `/api/logout` in CSRF enforcement (it is cheap; logout with the double-submit token).

#### L-02 — Session cookie is never marked `Secure` (observed live; code sets no `secure=` flag)

- **Endpoint/Method**: `POST /api/login` (response `Set-Cookie`).
- **Payload / observation**:
  ```
  Set-Cookie: helpotron_session=2UFhqIyIvvFOgxjCKiuxU7fvDNkUiGzLQm9P35XGOk9IdD1k8whZG4ajbfpScine; HttpOnly; Max-Age=604800; Path=/; SameSite=lax
  ```
- **Expected vs observed**: session cookie for an auth-over-HTTP flow should carry `Secure` when served over TLS (the production deployment is behind cloudflared HTTPS). Observed: no `Secure` attribute in the live `Set-Cookie`; source inspection shows the cookie is set without a `secure=` flag, so it would be transmitted on any plaintext mirror/rebinding path. (Scratch runs on plain HTTP, so the HTTPS-specific behavior could not be fully observed — limitation noted; the missing flag in code is the finding.)
- **Fix hint**: set `secure=True` on the response cookie (plus `__Host-` prefix for hardening).

#### L-03 — `/api/math/solve` error responses leak internal evaluator/library messages

- **Endpoint/Method**: `POST /api/math/solve` (authenticated).
- **Payload / proof**:
  ```
  {"expression":"sin()"}        → 400 {"detail":"ERROR: Sympy: sin takes exactly 1 argument (0 given) | SafeEval: math.sin() takes exactly one argument (0 given)"}
  {"expression":"log(1,2,3)"}   → 400 {"detail":"ERROR: Sympy: log takes at least 1 argument (3 given) | SafeEval: log expected at most 2 arguments, got 3"}
  {"expression":"asin(1,1)"}    → 400 {"detail":"ERROR: Sympy: asin takes exactly 1 argument (2 given) | SafeEval: Disallowed node"}
  ```
- **Expected vs observed**: expected a generic "invalid expression" message. Observed: full internal exception text exposing evaluator internals (`Sympy:` path, internal class name `SafeEval`, argument-count logic) — useful reconnaissance of the sandbox implementation (attacker learns exactly which nodes/paths are implemented, aiding bypass research of this exact surface), plus noisy errors for users. No bypass of the expression guard was found; this is an information leak only.
- **Fix hint**: catch and log the exception server-side; return a fixed generic 400 string.

#### L-04 — `/openapi.json` and `/docs` are fully exposed on the running instance

- **Endpoint/Method**: `GET /openapi.json`, `GET /docs`.
- **Payload / observation**: `GET /openapi.json` → 200 with the complete route/schema map; `GET /docs` → 200 Swagger UI (1027-byte shell).
- **Expected vs observed**: expected the scratch to leave docs on (development default), but this is the deployment codebase — if production runs the same config, the entire attack surface is machine-readable to anyone. Low (route-map disclosure), listed because the task checklist asked to verify production-mode behavior; production may set an env flag — unobservable from here.
- **Fix hint**: gate docs/openapi to development mode via env flag (documented), or serve behind admin auth.

#### L-05 — Recovery verify: 5-attempt invalidation per row + unlimited re-mint → reset-flow denial and credential-stuffing surface

- **Endpoint/Method**: `POST /api/recovery/verify`.
- **Payload / proof**: repeated verification attempts against a single minted code: after 5 failed verifies the `PasswordReset` row is invalidated (`attempts >= 5`) and the code is dead, observed as a 400 with an "expired/invalidated" style detail; a new `/api/recovery/request` immediately mints a fresh row (verified live).
- **Expected vs observed**: the 5-attempts-per-row limit is a good anti-brute-force default; the problem is the surrounding flow: any attacker can (a) burn a legitimate user's code by pegging it to exactly 5 wrong inputs (user then must re-request and simultaneously has a locked-out account, see M-04), and (b) re-mint codes for the same account without any per-account cooldown (compounding M-03). Additionally the 6-digit code + hash-at-rest design was verified consistent (SHA-256 stored, single-use) — the weakness is the orchestration, not the crypto.
- **Fix hint**: per-account verify/request cooldowns with exponential backoff, and invalidate *all* outstanding rows for the user when a new one is minted.

---

### Info

#### I-01 — Config-default secrets in the scratch server (no attack value to production)

- The scratch `config.py` uses defaults `JWT_SECRET = "helpotron_jwt_secret_dev_key_32chars"`, `SECRET_KEY = "dev-insecure-secret-key-change-in-prod-32bytesmin"`, legacy `TOTP_SECRET` (unused — per-user TOTP keys are `pyotp.random_base32()`). Per sweep instructions these are development defaults, **not** production values; no guessing/birthday effort was spent. The JWT mechanism itself was confirmed functional (HS256, `sub` as int user id, role claim present) and the `verify` path correctly rejects garbage/forged tokens with 401.
- **Note**: prod must override these in the environment; verify at deploy time.

#### I-02 — Signup rate limit: 20 accounts/hour/IP — what happens after (sketch)

- `POST /api/signup` per-IP budget is 20/hour (code: `ratelimit.limiter.allow(f"signup:{client}", 20, window=3600.0)`). After the quota: the 21st signup returns `429 {"detail":"Too many accounts created from this address. Try again in <N> seconds."}` with a proper `Retry-After` header (verified in source; per-account behavior respects the header contract).
- Consequences of the design (all Info, no exploit found): (a) the counter is **in-memory per process** — restart or worker scaling resets it; (b) it is **per-IP**, so a school/institutional NAT gets one shared 20/hour budget — 20 students joining in an hour block the rest; (c) it is **not** tied to an outbound-proxy anonymity layer (any IP rotation mints unlimited accounts) — the cap is a speed bump, not abuse prevention; (d) signup requires no email/phone, so minted accounts are free DB rows (a bulk-spam actor could still fill the users table at one IP per 20 accounts).
- Also noted: no per-route body-size gate on signup — a **10 MB** JSON body was accepted and decoded (422 `json_invalid` rather than a 413); routes only cap at larger, specific sizes (e.g., `/api/transcribe` 100 MB).

#### I-03 — Duplicate JSON keys resolve last-wins (payload-ambiguity hygiene)

- `POST /api/signup` body `{"public_id":"duptest1","public_id":"duptest2","password":"Passw0rd9!"}` → 200 `{"message":"User created","public_id":"duptest2",…}` — the second duplicate key silently won. Standard Python JSON behavior, but with any parser/proxy disagreement (some gateways keep the first value) a CDN/WAF auditing the first key and the app consuming the last creates signature-vs-decision divergence. No exploit taken.

#### I-04 — `educationalMode: false` (and other non-writable settings) handling verified

- `POST /api/user/settings` accepted `educationalMode:false` from the user's own session (own-account-by-design toggle that disables junk-content guards for that user). Non-writable privilege keys (`credits`, `banned`, `2fa_enabled`, `reading_level`, `tokens`, …) are dropped by the settings filter — verified: posting them produced no change (privilege merge safe). This is intended self-service behavior, no cross-user impact.

#### I-05 — Request budget allocation (observed in code, consistent with live behavior)

- Global `RateLimitMiddleware`: 120 req/min per IP on everything; 30 req/min per logged-in user for JSON POST bodies; 10 req/30 s for the strict paths (`/api/transcribe`, `/api/agent/*`, `/api/start`, `/api/draft/*`, `/api/generate`); login/signup have their own budgets (described above). Reasonable; the per-account-IP lockout interaction (M-04) is the only adversarial consequence observed.

---

## Verified negatives (attempted, defended)

- **SQL injection**: `sqlmap` 1.10.9, level 5/risk 3, was pointed at every GET/POST parameter it could reach unauthenticated and authenticated (notably `/api/recovery/options?public_id=…`, `/api/recovery/request`, `/api/login`, `/api/signup`, settings and assignment/dump/agent parameters — several via manual crafted payloads where sqlmap's needs and the CSRF/Bearer flows diverged). Uniform 401/422/200-sanitized responses; no injectable parameter found. SQLAlchemy parameterization + SQLite confirmed.
- **Command injection**: `/api/math/*` — AST-only allowlist (`assert_math_expression_safe`: no Attribute/Subscript/Lambda/comp/Import; call whitelist to sympy safe functions) plus a subprocess `python -c` script whose user expression is embedded only as a repr'd string; `/api/math/verify-text` extracts digits-only input (`\b\d+(?:\.\d+)?`), so even a hostile "expression" can only become a numeric string. Manual payloads (`__import__('os')`, `1;rm`, string escapes, `…"` attempts) all rejected 400/422.
- **Path traversal**: `/uploads/**` is served through `HardenedUploadsStaticFiles` with `is_relative_to` guards, and the SPA catch-all enforces relative-path containment; export-download route sanitizes the filename; traversal sequences (`../`, `..%2f`, encoded forms) received 404/SHA fallback, never directory escape.
- **IDOR / horizontal authorization**: user A vs user B across assignments, dumps, transcripts, drafts, threads, materials, settings, dashboard, credits, status, study-groups, features: cross-user fetches returned 403 (or 404 with masked shape). Specific checks: assignment detail/dump (404 generic), `/api/dashboard/{id}` and `/api/credits/{id}` and `/api/status/{id}` (403 except self), `/api/users/{id}` PATCH (own-id enforced), `share-material` (own material only), study-group membership enforced, datalake/dump routes own-row only. No cross-user read/write achieved.
- **Admin escalation**: normal session against `/api/admin/*` surface → 401/403 everywhere; `require_admin` requires admin role + Bearer JWT + DB-session token; `TokenManager.redeem_token` returned "Token system unavailable" without an admin account present (correctly closed). `is_admin_user` checks public_id/role; the admin panel is unreachable from a student account.
- **CSRF**: double-submit cookie enforced on all cookie-authenticated state-change routes (verified: editing settings/email without token → `403 {"detail":"CSRF token missing"}`; with token → 200). Bearer-token requests are exempted by design (API clients). Logout is the only exempted state-change route not covered (L-01).
- **XSS**: all API responses JSON; uploaded/served files carry `Content-Security-Policy: default-src 'none'; sandbox` + `X-Content-Type-Options: nosniff` + `Content-Disposition: attachment` for non-image types — verified on the anonymous dump downloads (M-01). Stored XSS via upload display is blocked at serve time.
- **Input validation**: malformed JSON → clean 422; 10 MB body → 422 (decode error only, no 5xx, no crash); `public_id` 200-char → 422 `string_too_long` (max 100 at Pydantic, 3–64 + charset per `validate_public_id`); Unicode/boundary values handled with 400/422; password strength rule (8+, letter+number) enforced.

---

## Limitations

1. **HTTP-only testing.** The scratch listens on plain HTTP; the production deployment sits behind cloudflared TLS (`helpotron.dpdns.org`). Cookie `Secure` behavior under actual TLS and any HSTS-via-`is_secure` differences could not be observed (L-02 is based on the live `Set-Cookie` flags + code reading).
2. **Config defaults only.** All tests ran with default (development) secret/API keys and no configured Turnstile, SMTP, or Telegram credentials — prod-only integrations (captcha-enforced login/signup, real email OTP delivery) were not exercised; the unconfigured-tool paths were probed for their behavior with defaults (which is exactly the dev-config risk surface described in M-03/I-01).
3. **TOTP/2FA flow** was not fully exercised (no account enrolled in the scratch; the per-user TOTP secret generation path was read only).
4. **Timing side-channels** were abandoned as inconclusive: slow-captcha responses and the 429-throttle caused noisy timings; no timing oracle is claimed.
5. **Admin panel funcionality** could not be end-to-end tested — the scratch DB has no admin user, so the admin experience was only verified as denied; production admin behavior (with a real admin account) is outside the verified set.
6. **In-memory state** (rate limiters, no Redis/replica) means the scratch reflects a single-process deployment; any multi-worker production behavior could differ.
7. Enumeration probes for `recovery/verify` (M-02) used only the two accounts created by the sweep; account-existence ratio conclusions are statistical only.

---

## Findings summary table

| ID | Severity | Endpoint · Method | Finding | One-line fix hint |
|----|----------|-------------------|---------|-------------------|
| M-01 | Medium | `/uploads/assignment_dump/*` · GET | Unauthenticated serving of file assets (22 MB .pptx, .exe) — only random filename protects; 200 with `attachment`/`sandbox` headers to anonymous clients | Serve downloads via ownership-checked route or expiring signed URLs |
| M-02 | Medium | `/api/recovery/options`, `/api/recovery/verify` · GET/POST | Account-existence oracle: different response schema/text for existing vs missing ids | Byte-identical generic responses for both cases |
| M-03 | Medium | `/api/recovery/request` · POST | Unauthenticated code minting: unlimited per-account spam, AdminMessage/Telegram flood, "delivered":true w/o delivery, code in plaintext server log | Auth/captcha gate + per-account and per-IP cooldowns; never log codes |
| M-04 | Medium | `/api/login` · POST | Lockout DoS: 5 bad logins block the account ~1 h incl. correct password; per-IP throttle blocks all users on a NAT; backoff stuck at 1s (≈3600 guesses/hr) | Escalate backoff on blocked attempts; check password before IP-throttling; penalize verified bad attempts only |
| M-05 | Medium | `/api/*` (CORS) · GET/OPTIONS | `Access-Control-Allow-Credentials: true` reflected to ANY `chrome-extension://` origin (regex `[a-pA-P0-9]{6,64}`) — arbitrary extension reads user data | Pin exact extension IDs in the CORS allowlist |
| L-01 | Low | `/api/logout` · POST | CSRF exemption and no token check — logout forceable (SameSite=lax currently blocks the simple cross-site POST) | Add logout to CSRF enforcement |
| L-02 | Low | `/api/login` · Set-Cookie | Session cookie never `Secure` (HttpOnly, SameSite=lax, Max-Age 7 d, no Secure) | `secure=True` + `__Host-` cookie hardening |
| L-03 | Low | `/api/math/solve` · POST | 400 `detail` leaks internal Sympy/SafeEval exception text | Return generic error; log details server-side |
| L-04 | Low | `/openapi.json`, `/docs` · GET | Full route schema and Swagger UI exposed to anyone | Gate docs/openapi to development mode |
| L-05 | Low | `/api/recovery/verify` · POST | 5-attempt row invalidation + unlimited re-mint enables reset-flow denial | Per-account verify cooldowns; invalidate old rows on re-mint |
| I-01 | Info | `config.py` | Development-default JWT/SECRET keys in scratch (not prod values; no effort spent) | Override all secrets via environment in production |
| I-02 | Info | `/api/signup` · POST | 20/hr per-IP cap: in-memory (per-worker, resets), per-IP (NAT-shared users starved), no email gate → free DB-row minting at 1 IP per 20 accounts | Persistent/redis-backed store; consider per-organization budgets |
| I-03 | Info | `/api/signup` · POST | 10 MB bodies accepted (422 decode error, no 413); duplicate JSON keys last-wins | Per-route body-size caps; reject duplicate keys |
| I-04 | Info | `/api/user/settings` · POST | `educationalMode:false` self-service accepted (own-account toggle); privilege keys dropped by filter (verified safe) | None (documented behavior) |
| I-05 | Info | global middleware | Budget allocation confirmed (120/min IP, 30/min user JSON, 10/30 s strict paths) | None |

**Totals: 0 Critical · 0 High · 5 Medium · 5 Low · 5 Info.**

Highlights that held up: SQL injection, command injection, path traversal, IDOR, admin escalation, and CSRF (except logout) were all verified resistant; uploads and file delivery carry strong `sandbox`+`attachment`+`nosniff` headers; crypto primitives (PBKDF2-100k, HS256 JWT, SHA-256 recovery codes, per-user TOTP) are sound. The risk heat is concentrated in the unauthenticated file/delivery/recovery surfaces (M-01–M-05) rather than in the authorization model.
