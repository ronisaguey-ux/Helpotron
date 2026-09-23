# Helpotron — Pre-Launch Checklist Audit

Audit date: 2026-09-23. Agent 3 of 10. Read-only: verified against the working tree
(branch `feat/audit-remediation-extended` @ `daa15187`), the live systemd units, live
HTTP responses, and the actual `.env` (values never printed, only presence/length).

Hard constraint honoured: Helpotron is **deliberately DOWN** behind the maintenance
page; nothing here proposes turning it on. Zero-automated-alerts rule honoured.

---

## (a) Findings table

| # | Item | Status | Evidence (path:line) | Exactly what to do | Effort |
|---|------|--------|----------------------|---------------------|--------|
| 1 | **Product analytics** | **MISSING** | `server/analytics.py` (per-user study time/scores only), `server/monitors.py` (ops health), `server/routes_analytics.py`, `server/routes_monitors.py`; no PostHog/Mixpanel/Amplitude/Segment anywhere (grep of whole tree) | Add signup/activation/retention event tracking. Minimal, alert-free: append anonymised events to a datalake file (`event, user_hash, ts`), later aggregate into cohorts. See plan §(b) step 1 | M |
| 1b | Monitor noise (~96%) | **DONE** | `server/monitors.py:91-110` (`_classify_request` splits user/polling/background), `:173-227` (`_count_distinct_events` dedups synthetic), `:55-88` documents the 96% figure | Nothing — already fixed. Do not regress | — |
| 2 | **SEO** | **PARTIAL** | `web/public/sitemap.xml` (only `/` + `/privacy`, lastmod 2026-08-18, host `helpotron.com`); `web/public/robots.txt` | Rewrite sitemap with all real public paths (`/`, `/features`, `/pricing`, `/guide`, `/terms`, `/privacy`, `/extension`), correct host, current lastmod. Cross-check below | S |
| 2b | Sitemap dead-path cross-check | **CLEAN** | `/` and `/privacy` both present in `web/src/App.jsx:313-341` (`VIEW_PATH_MAP`) + `:343` (`PUBLIC_PATHS`) | No dead path advertised today. Sitemap is incomplete, not broken | — |
| 2c | Canonical domain | **PARTIAL** | sitemap/robots use `helpotron.com`; `web/index.html:16-26` og/twitter use `helpotron.dpdns.org`; tunnel unit serves `helpotron.dpdns.org` | Pick ONE canonical host; update sitemap, robots, og/twitter to match. Verify DNS for `helpotron.com` actually resolves | S |
| 3 | **Social sharing** | **PARTIAL** | `web/index.html:15-26` og:title/description/image + twitter:card all present; image file `web/public/og-preview.svg` **exists** (3116 B) | Replace SVG og:image with a real 1200×630 PNG/JPG — FB/Twitter/WhatsApp/LinkedIn scraper do NOT render SVG. Point at the canonical host | S |
| 4 | **Error monitoring (auto)** | **MISSING** | No Sentry/Raven/Bugsnag/Rollbar/NewRelic/Datadog in web/ or server/; no `window.onerror`/`unhandledrejection` collector in `web/src` | Build the zero-alert equivalent: durable error row + watcher wakes agent + agent decides. See §(b) step 2 | M |
| 4b | Sealed user-report (manual) | **DONE** | `server/error_reports.py` (mint key `:106`, unseal `:139`), `web/src/lib/reportPayload.js`, `web/src/components/ui/ErrorReportButton.jsx` | User-initiated reporting already ships. Not a crash monitor — do not conflate | — |
| 5 | **Email deliverability** | **MISSING** | `server/auth_2fa.py:104-106` (`is_configured` false: `EMAIL_USER`/`EMAIL_PASSWORD` empty in `.env`), `:109-137` (`send_email` via `smtplib`); `server/mailer.py` is dead code (`config.smtp_enabled` doesn't exist → would AttributeError, never imported) | Decide email provider, set `EMAIL_HOST/USER/PASSWORD`, configure SPF/DKIM/DMARC at the DNS provider. See §(b) step 3 | M |
| 5b | Transactional email inventory | **PARTIAL** | Live OTP-only: verification `server/routes_auth_2fa.py:125,136`, 2FA setup `:222`, 2FA login `:384` + `server/main.py:1199`, purchase auth `:544`, recovery `server/recovery.py:283`. Welcome/materials/low-credits exist only in dead `server/mailer.py:43-88` | If email is wanted, add welcome + password-reset-as-email; today recovery defaults to dev-channel when no email/phone is set (`recovery.py:13`) | S |
| 5c | Plain-text alternative | **DONE** | `server/auth_2fa.py:120-126` `MIMEMultipart("alternative")` with text + html | Already correct | — |
| 5d | Reply-To / From | **PARTIAL** | `auth_2fa.py:122` `From = config.email_from or config.email_user` (default `noreply@helpotron.com`, branded); **no `Reply-To` header set** | Add a real branded Reply-To (e.g. `support@helpotron.com`); keep From branded | S |
| 5e | SPF/DKIM/DMARC | **UNVERIFIED** | No DNS tooling on this box for the external domain | Verify in DNS provider dashboard — cannot be checked from here | — |
| 6 | **Legal — reachable signed-in** | **DONE** | `App.jsx:313-341` `VIEW_PATH_MAP` now includes `/terms`→terms, `/privacy`→privacy, `/pricing`→credits:plans, `/study`→library:practice, `/guide`, `/features`, `/extension`; `:343` `PUBLIC_PATHS`; `:346-368` `resolvePath` handles `/sign-in`+`/signup`; `:956-975` renders guide/extension/privacy/terms for authed | Prior blank-page bug is gone. No action | — |
| 6b | Legal — CTA dispatch | **DONE** | `AnonymousLanding.jsx:402` explicit-intent `openAuth('signup')`, `:418-434` `navigatePath` for all 7 paths; `GuideView.jsx:364` `go()` → `onGoTo`; `App.jsx:628-642` maps signup/login→auth, pricing/study via `LEGACY_VIEWS` `:232-252` | The six-button blank-page bug is fixed. No action | — |
| 6c | Cookie consent (EU) | **DONE** | `web/src/components/CookieBanner.jsx` + `web/src/lib/cookieConsent.js`, mounted `App.jsx:995` (signed-in) **and** `AnonymousLanding.jsx:844` (anonymous); "Necessary only"/"Accept all" | Present on both surfaces. Note: banner badge claims "FERPA Compliant" (`CookieBanner.jsx:55`) — fold into legal copy review | S |
| 6d | Support contact branded | **DONE** | `privacy@helpotron.com` (`PrivacyPolicyView.jsx:57`), `legal@helpotron.com` (×3); zero personal gmail in web/src | Branded addresses. No action | — |
| 7 | **HTTPS** | **DONE (edge)** | Public `https://helpotron.dpdns.org/` → 200 via Cloudflare tunnel (`helpotron-tunnel.service`); HSTS middleware `server/security.py:399-432` (emitted only on secure request) | Origin is plain HTTP behind the tunnel — correct. Confirm the proxy forwards `X-Forwarded-Proto` or HSTS never fires | S |
| 7b | **Stripe** | **MISSING** | `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*` **empty** in `.env`; `stripe` package **not installed** (`./.venv/bin/python -c "import stripe"` → ModuleNotFoundError); `payments.py:48-49` `_stripe_enabled()` false → checkout returns `stripe_not_configured` `:54-58` | Install `stripe>=11.0` (already in `requirements.txt:50`), set the three keys + three price IDs, then E2E-test checkout+webhook. See §(b) step 4 | L |
| 7c | Stripe webhook guard | **BUG (latent)** | `server/main.py:2197-2206` webhook route has **no** `_stripe_enabled` guard and calls `handle_stripe_webhook` which does `import stripe` at `payments.py:145` → 500 on any webhook today | Add `if not _stripe_enabled(): raise HTTPException(503, ...)` at top of the route, or lazy-import guard | S |
| 7d | **Backups** | **DONE** | `helpotron-backup.timer` (05:15 daily, `Persistent=true`) → `helpotron-backup.service` → `scripts/backup_db.sh` (resolves `DATABASE_URL`, verifies 36 tables/16 users, gzips, 30-day retention). Latest `backups/helpotron_20260922_214251.db.gz` (11 MB) verified; log shows correct 13.9 MB source | Already working. Restore drill not tested — see UNVERIFIED | S |
| 8 | **systemd grounding** | **VERIFIED** | `systemctl --user list-units --state=running`: api(:5000), maintenance(:5173), tunnel, hip(:8099), 6 helpotron-* daemons, `oc-*-wake` watchers, `tele-poller` all running. Timers: only `helpotron-backup.timer` is helpotron-owned | Consistent with the plan. No unscheduled backup claim | — |
| 9 | **Maintenance state** | **CONFIRMED DOWN** | `helpotron-maintenance.service` (`MAINTENANCE_PORT=5173`) → `maintenance/serve.py` (200 banner all paths, `/api/*`→503). `/api/health` (`:5000`) → `{"status":"ok","env":"development","stripe_configured":false,"telegram_configured":false}` | Deliberate-down state is correct. Note `env:development` despite `PRODUCTION_MODE=true` in `.env` — fix `ENVIRONMENT` before launch | S |

---

## (b) Prioritised execution plan (highest launch-risk first)

**1. Product analytics — signup/activation/retention (no alerting).**
- Files: new `server/activation_events.py` + hook into `signup` (`server/main.py:1269`) and the 2FA/trial-complete path.
- Change: append `{"event","user_hash","ts"}` JSONL to `datalake_storage/activation_events.jsonl` using the existing `datalake._anonymize_id` hash. Never email/page.
- Verify: `./.venv/bin/python -m pytest server/tests -q` plus `./.venv/bin/python -c "import server.activation_events"`.

**2. Zero-alert crash sink (durable row → agent judgement).**
- Files: new `server/error_sink.py`; register a FastAPI exception handler in `server/main.py` (and a `window.onerror`/`unhandledrejection` → `POST /api/reports/key`-style endpoint, reusing `error_reports.py`).
- Change: on unhandled 5xx, write a row (`surface, digest, kind, ts, count`) to a `error_sink` table; a new `opencode-error-wake` systemd watcher (mirror `oc_helpticket_wake.py` in `~/.local/bin`) wakes the agent; the agent decides whether to surface. No paging.
- Verify: `curl -X POST .../api/health` after a forced 500, confirm the row lands via `sqlite3 data/db/helpotron.db "select count(*) from error_sink"`.

**3. Email — pick provider + configure DNS.**
- Files: `.env` (`EMAIL_HOST/USER/PASSWORD`), `server/auth_2fa.py:122` (add `Reply-To`), optionally replace dead `server/mailer.py`.
- Change: set SMTP creds; add `msg["Reply-To"] = config.email_from`; delete or rewire `mailer.py`.
- Verify: `./.venv/bin/python -c "from server.auth_2fa import EmailNotificationService as E; print(E.is_configured())"` → `True`, then a live send.
- Blocking dependency: SPF/DKIM/DMARC at the DNS provider (UNVERIFIED from this box).

**4. Stripe — install + configure + E2E.**
- Files: `./.venv/bin/pip install 'stripe>=11.0'`; `.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASIC/PRO/ELITE`); `server/main.py:2197` add `_stripe_enabled` guard.
- Change: guard the webhook route; then test `create_checkout_session` and `handle_stripe_webhook` with a test-mode key.
- Verify: `./.venv/bin/python -c "import stripe; print(stripe.__version__)"` and a signed-webhook test (pattern already in `server/tests/conftest.py:204`).

**5. SEO + social sweep (cheap, do last).**
- Files: `web/public/sitemap.xml`, `web/public/robots.txt`, `web/index.html` (og/twitter), add `web/public/og-preview.png`.
- Change: full path list, canonical host, `og:image` → PNG.
- Verify: `curl -s https://helpotron.dpdns.org/og-preview.png -o /dev/null -w '%{http_code}'` → 200.

---

## (c) MUST-FIX-BEFORE-LAUNCH vs nice-to-have

**MUST-FIX (a paying user or a search/scraper hits these on day one):**
1. **Stripe** — card payments are the monetisation path; today they return `stripe_not_configured` and the package isn't even installed. A subscriber clicking "Subscribe" cannot pay. *Blocking.*
2. **Email** — 2FA/purchase/recovery codes are email-or-SMS; email is dead (no creds). If a user enables email 2FA or requests email recovery, the code silently never arrives. *Blocking for those flows.*
3. **Product analytics** — you cannot measure activation/retention at all; launch without it means the first cohort's data is lost forever. *Blocking for "did the launch work".*
4. **Error visibility** — no automatic crash signal exists; under ZERO-alert the durable-row+agent pattern is the only compliant way to know the site is broken while you're away. *Blocking for ops sanity (not for users).*
5. **`ENVIRONMENT`/`PRODUCTION_MODE`** — health reports `env:development` while `PRODUCTION_MODE=true`; a misread here hides prod-only failures. *Blocking (1-line).*
6. **Stripe webhook guard** — latent 500; only fires once Stripe is on, so it's part of the Stripe fix.

**Nice-to-have (post-launch, low risk):**
- og:image PNG + canonical host (sharing previews look broken but nothing fails).
- Sitemap completeness (only 2 of 7 pages indexed — SEO cost, not an outage).
- Reply-To header (deliverability polish).
- "FERPA Compliant" badge wording review.
- Backup restore drill (backups are verified-consistent; a restore has never been exercised).

---

## (d) UNVERIFIED from this box — and why

- **SPF/DKIM/DMARC** — needs the DNS provider dashboard or external DNS lookup; no such tooling/credentials here.
- **Stripe keys / price IDs** — absent from `.env`; can't test checkout/webhook end-to-end without real (or test-mode) keys.
- **Email creds** — absent; can't prove a mail actually leaves the building.
- **Canonical domain ownership** — `helpotron.com` vs `helpotron.dpdns.org`; can't confirm which DNS actually resolves to the tunnel from this box.
- **Backup restore** — backups are created + verified (table/user count), but a restore-to-fresh-DB has never been run.
- **Live crash/error-sink behaviour** — the sink is proposed, not built; "what the watcher wakes on" is unverified until implemented.

---

## Honest bottom line

Legal reachability, the CTA blank-page bug, cookie consent, monitor noise, HTTPS-at-edge,
and DB backups are **genuinely done** (all verified in the working tree / live system).
The launch blockers are **Stripe, email, product analytics, and error visibility** — all
four are missing-not-broken, and all four are fixable in code without turning the site on
or violating the zero-alert rule. The app is correctly down behind maintenance, API healthy.
