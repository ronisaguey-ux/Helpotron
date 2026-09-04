# T2B Engine — Security Sweep Report (owner-authorized penetration sweep)

- **Date**: 2026-09-03
- **Target**: `http://127.0.0.1:5001` — isolated scratch instance of the T2B engine / roofing-lead-bot (Python/Flask + Waitress, `ENVIRONMENT=development`, disposable DB at `/tmp/sweep_t2b.db`)
- **Scope**: API + webhooks + static serving of the scratch instance only. Source review of `/home/roni/Roni_workspace/t2b/roofing-lead-bot/`.
- **Limitations / boundaries honored**:
  - Only 127.0.0.1:5001 probed. Production (127.0.0.1:5000), public domains, and any other host untouched. Prod DB untouched.
  - No tool installs requiring root; no DDoS; concurrency <= 8-16; no real outbound messages were sent. The single OTP request used a reserved fictional number (+1-999-555-0198) and was deflected by the quiet-hours guard before any send (verified in server log: "Quiet hours in effect ... deferring message"). Contact-form test payloads used fake addresses; the one submission that triggered the owner's own `tg_send.sh` notification bridge used obviously fake data (disclosed in finding L-04).
  - Outbound Telegram send-path tests were NOT executed live (would reach real chat IDs); that finding is source-verified only.
- **Tools used**: hackingtool (pip venv `/tmp/ht-venv`, install via `uv`; engagement `t2b-sweep` ran with the `recon` pipeline), sqlmap 1.10.9 (`/tmp/ht-venv/bin/sqlmap`), custom Python/curl probes, direct inspection of the scratch SQLite DB and server log `/tmp/sweep-t2b.log`. wfuzz was not usable (requires pycurl, not pip-installable in this env); route discovery done with an HTTP loop instead.

---

## Findings by severity

### CRITICAL

#### C-01 — Cross-tenant PII destruction: any authenticated contractor can permanently redact ANY lead's data
- **Endpoint / method**: `DELETE /api/privacy/<phone>` (`api/consent.py::delete_privacy_data`)
- **Payload** (Alice's session):
  ```
  DELETE /api/privacy/+19995550122
  Authorization: Bearer <alice-token>
  ```
- **Expected vs observed**: Expected: resource scoped to caller or refused. Observed: `200 {"deleted_pii_for": "+19995550122", "status": "success", "compliance_ledger_retained": true}`; the victim lead (`sweep_l_b1`, tenant `ct_ff63d398fde5` = Bob's tenant) had its `lead_data` mutated in the DB to:
  ```
  {"name":"[REDACTED]","phone":"[REDACTED]","email":"[REDACTED]",...}
  ```
  The `UPDATE lead SET lead_data = json_set(...) WHERE json_extract(lead_data,'$.phone') = ? OR lead_id = ?` has NO tenant filter, and `auth_required` only proves a valid session, not ownership. Alice destroyed Bob's lead PII (a competitor can blind every tenant's pipeline).
- **Fix hint**: join/guard the UPDATE on `tenant_id = g.contractor_id` (or route deletes through an owner-scoped lead lookup), and audit-log who deleted what.

#### C-02 — Unauthenticated disclosure of any contractor's full billing record via query param
- **Endpoint / method**: `GET /api/billing?contractor_id=<id>` (`api/billing.py::get_billing`)
- **Payload**:
  ```
  GET /api/billing?contractor_id=ct_ff63d398fde5      (no Authorization header, no cookie)
  ```
- **Expected vs observed**: Expected: 401 or own-record only. Observed: `200` with the victim's complete billing:
  ```
  {"credits_left": 28, "in_trial": false, "plan": {"credits": 40, "id": "pro", "name": "Pro", "price": 50},
   "transactions": [{"delta": 40, "event": "Payment received", "usd": 50.0},
                    {"delta": -1, "event": "Lead unlocked", "usd": 0.0}]}
  ```
  `_get_contractor_id()` falls back to `request.args.get("contractor_id")` when no token is present (and with no token AND no param it returns the FIRST contractor in the DB — full fallback leak).
- **Fix hint**: delete the query-param fallback and the "first contractor if empty" branch; the endpoint must be `@auth_required` and read `g.contractor_id`.

### HIGH

#### H-01 — Cross-tenant read of privacy/compliance records for any phone
- **Endpoint / method**: `GET /api/privacy/<phone>` (`api/consent.py::get_privacy_record`)
- **Payload** (Alice's session):
  ```
  GET /api/privacy/+19995550122   (phone owned by tenant B)
  Authorization: Bearer <alice-token>
  ```
- **Expected vs observed**: Expected: 401/403/404 for non-owned phone. Observed: `200` returning victim's consent records, optout ledger entries, and lead metadata (`{"lead":{"lead_id":"sweep_l_b1","tenant_id":"ct_ff63d398fde5","status":"new","consent_at":null,"optout_at":null}}`). Any contractor can enumerate compliance evidence and conformance states of any phone.
- **Fix hint**: require the target phone to belong to the caller's tenant (join on `lead.tenant_id` / consent ownership) before returning records.

#### H-02 — Unauthenticated platform-wide business metrics (unit economics, volume, funnel)
- **Endpoints**: `GET /api/metrics` (NO `@auth_required`), plus `GET /api/usage` and `GET /api/steps` leak global stats to any authenticated contractor.
- **Payload**: `GET /api/metrics` with no credentials -> `200` with `leads_in`, `unlocked`, `reply_p50`, `cost_per_unlock`, `credits`, m1-m12 block (SMS cost `m8_sms_cost`, `m9_llm_cost_per_lead`, `m12_dispute_rate`, 8-stage funnel). `GET /api/usage` with a contractor token returns `sms_sent` / `telegram_upgraded` global counters (`monitor.get_conversion_stats()` is tenant-agnostic); `GET /api/steps` likewise aggregates `sequence_event` and `sequence_run` globally (`SELECT action, COUNT(*) FROM sequence_event`).
- **Expected vs observed**: Expected: per-tenant scoping/auth on business data. Observed: all three return platform aggregates with no tenant filter.
- **Fix hint**: gate `/api/metrics` behind auth/role (dashboard only) and scope usage/steps queries by the caller's tenant.

#### H-03 — Unauthenticated TCPA consent fabrication; arbitrary cross-tenant write to lead records
- **Endpoint / method**: `POST /api/consent` (`api/consent.py::capture_consent`)
- **Payloads**:
  ```
  POST /api/consent  {"checkbox": true, "phone": "+19995550199"}   # an ALREADY OPTED-OUT number
  POST /api/consent  {"checkbox": true, "phone": "+19995550133", "copy": "sweep-forged"}
  ```
- **Expected vs observed**: Expected: consent only for verified opt-ins. Observed: `200 {"status":"success","consent_id":...}` for both — a synthetic `consent_record` row was written for the opted-out number, and the second call silently mutated the victim tenant's lead in the DB (`sweep_l_b2`, tenant `ct_ff63d398fde5`): `consent_at=2026-09-03T04:33:14Z, consent_source='web_form'` — the UPDATE is global (`WHERE json_extract(lead_data,'$.phone') = ? OR lead_id = ?`), set by an unauthenticated caller. This corrupts the compliance evidence trail and can pre-mint "consent" for a target before outreach.
- **Fix hint**: authenticate the web-form consent with a per-session challenge (and never let it re-consent a number with an existing optout); constrain the lead UPDATE to the source tenant of the form (or drop the lead-side write entirely).

#### H-04 — Telegram outbound path never enforces opt-out
- **Endpoint / method**: code path (source-verified; not executed live to avoid real messaging) — `src/channels/telegram.py::TelegramAdapter.send_text` vs `src/channels/sms.py::SmsAdapter.send_text`.
- **Payload (concept)**: a chat_id that sent `STOP` to `/webhooks/telegram` (recorded via `record_optout("telegram", chat_id, ...)`) can still receive messages from `src/core/sequences.py:178`, `src/core/orchestrator.py:90`, and `worker.py` when those dispatch through `TelegramAdapter.send_text` — the Telegram adapter's send path has NO `is_opted_out()` check (SMS has it; Telegram does not).
- **Expected vs observed**: Expected: symmetric TCPA enforcement. Observed: only the SMS adapter consults `state_store.is_opted_out`; every Telegram send disregards the optout ledger.
- **Fix hint**: add the same `is_opted_out(recipient)` guard at the top of `TelegramAdapter.send_text` (mirroring `SmsAdapter.send_text`).

### MEDIUM

#### M-01 — Login user enumeration via timing (and register 409 oracle)
- **Endpoint / method**: `POST /api/auth/login`, `POST /api/auth/register`
- **Payload**: `{"email":"bob-sweep@test.com","password":"wrongpw"}` vs `{"email":"no-such-user-zzz@test.com","password":"wrongpw"}` (4 samples each).
- **Expected vs observed**: Expected: constant-time-ish auth for valid-vs-invalid. Observed: existing account median 138 ms (Argon2id verify) vs nonexistent 4 ms (no hash lookup) — a 35x timing delta; plus `POST /api/auth/register` with an existing email returns `409 "An account with this email already exists"` (existence oracle). Both allow enumerating contractor emails/phones.
- **Fix hint**: pre-hash a dummy credential when no account matches (uniform verify time); make registration return a generic response or rate-limit-independent 200.

#### M-02 — OTP secrets in server logs (cleartext), "email" channel never delivers
- **Endpoint / method**: `POST /api/auth/request-otp` (`security/otp.py::request_otp`)
- **Payload**: `{"target":"sweep-otp-log@test.com","channel":"email"}`
- **Expected vs observed**: Expected: OTP delivered via the requested channel only. Observed: `200 {"message":"OTP sent via email",...}` — but no email send exists; the code is written to the log verbatim: `OTP requested for sweep-otp-log@test.com: code=435904`. Combined with M-03 log injection, any log consumer (SIEM, SaaS aggregation, remote logs) exposes live login codes; `verify_otp` then issues a full session token for the existing account (`/api/auth/verify-otp` auto-creates accounts too). Codes are also generated with `random.choices` (`random` module), not `secrets`.
- **Fix hint**: use `secrets` for code generation; never log codes (hash or omit); only return success for channels actually implemented; deliver email OTP via a real mail adapter.

#### M-03 — Log injection via OTP target; unauthenticated email-event webhook
- **Endpoints**: `POST /api/auth/request-otp` (target field), `POST /webhooks/twilio-email`
- **Payload**: `{"target":"log-inj@x.com\n2026-09-03T99:99:99Z - INFO - FAKE LOG LINE INJECTED","channel":"email"}` and a bare `POST /webhooks/twilio-email` with JSON body.
- **Expected vs observed**: Expected: sanitized log output / authenticated webhook. Observed: the injected fake line appears byte-exact in `/tmp/sweep-t2b.log` (`2026-09-03T99:99:99Z - INFO - FAKE LOG LINE INJECTED: code=766388`), and `twilio-email` answers `200 {"status":"received"}` to anyone and logs the full payload — reliable log forging/volume spam.
- **Fix hint**: strip CR/LF from loggable fields (or use structured/JSON logging); verify the email webhook signature or drop the route.

#### M-04 — Webhook mock gate: placeholder secrets + ALLOW_MOCK_WEBHOOKS=1 disables ALL verification (conditional credit self-grant)
- **Endpoints**: `POST /webhooks/stripe`, `POST /webhooks/telegram`
- **Payload**: forged `checkout.session.completed` with `metadata.contractor_id=<self>` + `metadata.credits=9999` (no signature).
- **Expected vs observed**: In the CURRENT instance this is blocked — `503 "Stripe webhook not configured"` and `403 "Forbidden: Webhook unconfigured"` (the instance's `STRIPE_WEBHOOK_SECRET` and `TELEGRAM_WEBHOOK_SECRET` are placeholder strings in the inherited env, `ALLOW_MOCK_WEBHOOKS` unset). BUT with `ALLOW_MOCK_WEBHOOKS=1` the code path skips signature verification entirely (`if using_placeholder: ... event = request.get_json(...)`), and a mock `checkout.session.completed` event would credit arbitrary `metadata.credits` to any `contractor_id` — unauthenticated free credits, and (for `invoice.payment_succeeded`) forced subscription renewal.
- **Fix hint**: never disable verification — keep placeholder-secret handling to fail 403/503 unconditionally, or gate mocks behind an internal-only auth header; validate metadata contractor_id against a live Stripe session object.

#### M-05 — Unvalidated markup stored in DB via contact/consent (stored-XSS seed; sink not proven in served frontend)
- **Endpoints**: `POST /api/contact` (name/company/message), `POST /api/consent` (copy field)
- **Payload**: `{"name":"<img src=x onerror=alert(1)>","message":"<script>alert(document.cookie)</script>",...}` and `{"copy":"<script>alert(1)</script>",...}`
- **Expected vs observed**: Expected: HTML-escaped/sanitized storage. Observed: raw markup stored verbatim in `contact_request` (confirmed in DB) and hashed consent copies. No `innerHTML`/`v-html`/`insertAdjacentHTML` sink exists in the served frontend today (`app_index.js` uses only `textContent`/`createElementNS` — a positive), so no verified execution; the XSS becomes active the moment any admin/dashboard UI renders these fields as HTML.
- **Fix hint**: escape or strip markup at input (HTML-encode on render as the durable fix).

### LOW

- **L-01 — Type-confusion input handling -> unhandled 500**: `POST /api/consent` with `{"phone": 12345}` returns `500 Internal Server Error` (Flask HTML error page) and logs the full traceback (`AttributeError: 'int' object has no attribute 'strip'`). Fix: type-check/concoerce inputs and return a JSON 400 (catches non-string phone, email, channel).
- **L-02 — Malformed JSON is handled safely** (positive control): broken JSON bodies yield `400 "Email and password are required"` — verified; rate limits masked a couple of password-length edge cases (429 fires before 400), which is acceptable.
- **L-03 — Cookie `Secure` flag is environment-dependent**: `t2b_session`/`t2b_csrf` carry `HttpOnly`(session) / `SameSite=Lax` but no `Secure` when `ENVIRONMENT != production` (`Set-Cookie: t2b_session=...; HttpOnly; Path=/; SameSite=Lax` observed). Config default for `environment` is `"production"`, so production deployments are covered, but any override silently downgrades transport security. Fix: derive `Secure` from the public URL scheme instead of the env name.
- **L-04 — Contact endpoint notifies the owner bridge on every valid submission** (5/hour/IP cap verified: 6th -> `429`) — the notify call is `subprocess.run([tg_script, ...])` (no shell=True, so no shell injection) and the message content interpolates raw user fields to the owner's Telegram. One fake test submission was made during this sweep (clearly fake data) and reached the owner's private bridge; attacker-relevant impact: notification spam/plausible fake inquiries to the owner. Fix: keep the rate limit, add per-field sanitization and a notify queue that batches.
- **L-05 — No request-body size limit**: Waitress's default `max_request_body_size` (~1 GB) and Flask-without-limit allow large/abusive payloads (DB write amplification on `contact`/`consent`). Fix: set an explicit small body size limit and tighten content-type checks.
- **L-06 — Free-trial abuse via IP-only registration cap**: `POST /api/auth/register` grants 3 credits on every new email, limited only by `reg:{ip}` 3/hour (verified 429 on 4th attempt). A distributed client can mint unlimited 3-credit trial tenants. Real limit of impact today: leads are tenant-scoped, so a fresh tenant starts with zero leads; still an abuse/business-logic vector. Fix: add email/phone uniqueness + device fingerprint or payment-card proof for trials.

### INFO

- **I-01 — Session token contents are readable (signed, not encrypted)** — itsdangerous `URLSafeTimedSerializer.dumps`: base64 of the payload (contractor_id, email, business_name) is visible; standard-signing OK, but confirm no PII beyond these is ever embedded and consider JWT-standard `aud`/type separation.
- **I-02 — `Server: waitress` header** and Python/flask traceback paths in logs; consider `Server` header hardening (COSMIC/obfuscation) since stack details aid attackers.
- **I-03 — The scratch instance inherits LIVE production secrets** via `load_dotenv()` -> `../.env` (`/home/roni/Roni_workspace/t2b/.env`): real `SESSION_SECRET` (64 chars), real `TWILIO_AUTH_TOKEN` (32 chars) plus placeholder `STRIPE_*`/`TELEGRAM_*` secrets. Defensive impact of this sweep: session forgery with the dev fallback secret failed (401 — good), but this scratch instance holds credentials that could reach the real Twilio number / users, and an OTP code would be sent for real outside quiet hours. Fix: run scratch/dev instances with a scrubbed `.env` (e.g. `T2B_ENV_FILE=...dev.env` or explicit env overrides), never wire real bot/twilio keys into mock instances.
- **I-04 — Security headers are complete**: CSP (`default-src 'self'; ...; frame-ancestors 'none'`), HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` all present (audited). CORS is strict (evil `Origin: http://evil.test` -> no ACAO; allowlist only) — verified.
- **I-05 — Route map matches source exactly** (curl discovery over ~25 candidate names: only `leads/usage/subscription/settings/steps` require auth; `plans/config/metrics/experiments/billing/health` are public) — no hidden admin/debug endpoints found. `POST /api/leads/<id>/unlock` and `/dispute` require both session auth + CSRF (Bearer-only exemption is by design); cross-tenant unlock returns 404 (verified) — the paywall controls are sound.

### Verified positive controls (controls that passed)

| Control | Verification |
|---|---|
| Lead tenant isolation (read/unlock/action) | Alice GET/POST on Bob's `sweep_l_b1` -> 404 both; Bob lists only his lead |
| Atomic paywall unlock | 1 credit deducted per unlock; disabled re-unlock of derived state ('already unlocked' returns full lead, no re-charge) |
| Dispute refund bounded | Invalid reason -> 400; disputed lead re-unlock -> 409 `PAYWALL_CREDITS_EXHAUSTED` style block; refund exactly 1 |
| Login/register/OTP/contact rate limits | 6th login attempt -> 429; 4th register/hour -> 429; contact 6th -> 429; OTP verify lockout after 6 tries -> 429 15-min |
| OTP brute-force lockout | Verified 6 attempts -> "locked out for 15 minutes"; request-otp during lockout -> 429 |
| Session forgery | Token signed with fallback dev secret -> 401 (real SESSION_SECRET in use) |
| SQL injection | sqlmap `identifier`, `key`, `contractor_id` (level 2, risk 1, techniques BTS) -> "all tested parameters do not appear to be injectable"; all DB calls parameterized (one f-string uses a PRAGMA column name, not user input) |
| Path traversal on static routes | `../`, `%2e%2e`, double-encoded, `//etc/passwd` variations -> all 404 |
| Webhook signatures (real secrets) | Forged Twilio signature -> 403; Telegram/Stripe with placeholder secrets -> 403/503 |
| Password hashing | Argon2id (time_cost=2, 64 MiB) — login timing cost observed ~138 ms |

---

## Findings summary table

| ID | Severity | Endpoint (method) | Issue |
|---|---|---|---|
| C-01 | Critical | `DELETE /api/privacy/<phone>` | Any authenticated contractor permanently redacts ANY tenant's lead PII (verified DB mutation) |
| C-02 | Critical | `GET /api/billing?contractor_id=` | Unauthenticated full billing/plan/transaction disclosure of any contractor |
| H-01 | High | `GET /api/privacy/<phone>` | Cross-tenant read of consent/optout/lead compliance records |
| H-02 | High | `GET /api/metrics`, `/api/usage`, `/api/steps` | Platform-wide business metrics disclosed (metrics fully unauthenticated; usage/steps unscoped) |
| H-03 | High | `POST /api/consent` | Unauthenticated TCPA consent fabrication incl. opted-out numbers; writes consent onto ANY tenant's lead |
| H-04 | High | Telegram outbound send path (source-verified) | Opt-out never enforced for Telegram sends (SMS adapter has it, Telegram does not) |
| M-01 | Medium | `POST /api/auth/login`, `/register` | Timing-based account enumeration (138ms vs 4ms) + 409 register oracle |
| M-02 | Medium | `POST /api/auth/request-otp` | OTP codes logged in cleartext; "email" channel returns success but never sends; codes from `random` |
| M-03 | Medium | `POST /api/auth/request-otp`, `POST /webhooks/twilio-email` | Log injection via newline in target; full-log-payload unauthenticated webhook |
| M-04 | Medium | `POST /webhooks/stripe`, `/webhooks/telegram` | `ALLOW_MOCK_WEBHOOKS=1` + placeholder secrets = zero verification, unauthenticated credit grant (blocked in current config) |
| M-05 | Medium | `POST /api/contact`, `/api/consent` | Raw HTML/script stored in DB (no verified render sink in served frontend) |
| L-01 | Low | `POST /api/consent` | Type-confusion input -> unhandled 500 + full traceback in log |
| L-03 | Low | login/register cookies | `Secure` flag only when ENVIRONMENT=production |
| L-04 | Low | `POST /api/contact` | Owner notify bridge spam + fake inquiry injection (5/hour IP cap verified) |
| L-05 | Low | all | No request-body size limit (Waitress default ~1 GB) |
| L-06 | Low | `POST /api/auth/register` | Trial-credit farming via IP-only 3/hour cap |
| I-01..I-05 | Info | various | Signed-readable session tokens; `Server: waitress`; dev instance inherits prod secrets via `../.env`; good headers/CORS; route map matches source |

**Severity totals: Critical 2 | High 4 | Medium 5 | Low 6 | Info 5** (positive controls excluded).
