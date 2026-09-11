# Helpotron Fix-Verification ROUND 3 — commit 07db0a3 (3-agent; deploy-ready answer)

**Date:** 2026-08-25 · **Target:** 07db0a3 (origin/main HEAD verified; worktree == HEAD) · **Method:** 3 read-only agents: (1) 8-blocker claims, (2) demo auth-flow trace, (3) admin-upgrade + deploy sanity. All proof from `git show 07db0a3:…`.

## Verdict: 5 of 8 claims VERIFIED, 3 PARTIAL. Demo is RUNNABLE (single-origin VPS/container path) but NOT hand-the-link-ready: 2 blockers + 6 config items + 2 decisions.

---

## Claim-by-claim

| # | Item | Verdict | Note |
|---|---|---|---|
| 1 | A5 auth-gating | **PARTIAL** | 13+ routes verified (transcribe no dev-user, style→403, materials/dashboard/generate/assignment/agent-WS ownership, draft/admin→require_admin). **Survivors: `POST /api/users` (main.py:691) + `PATCH /api/users/{public_id}` (:700) still mint from client-supplied public_id.** `"dev-user"` = 0 hits. |
| 2 | Dockerfile/guard | **VERIFIED** | no `.env` copy; `change_me_…` placeholders; guard blocks 6 strings + `change_me` substring + len<32. |
| 3 | A8 infra | **PARTIAL** | psycopg2/asyncpg + compose(postgres16, healthcheck) exist, but **half-wired**: config never reads POSTGRES_*, compose never sets DATABASE_URL → container boots on SQLite, postgres dead weight. |
| 4 | Extension | **VERIFIED** | `<all_urls>` + storage.sync resolution w/ localhost fallback. |
| 5 | PAT sanitize | **VERIFIED (URL)** | remote URL token-free. **Flag: `~/.git-credentials` (helper=store) still holds a live PAT — rotate.** |
| 6 | 2FA login | **VERIFIED (server)** | `2fa_required` returned BEFORE session cookie; TOTP replay-guarded; setup/verify-setup user-gated. **Frontend missing — see flow below.** |
| 7 | B9 math auth | **VERIFIED** | /solve /verify-text /execute all Depends. |
| 8 | Backlog | **PARTIAL** | JWT alias unified ✅; datalake RoniDev fallback gone ✅; shots untracked ✅. **GDPR "standardized under /api/account" FALSE** — no such route; old datalake-blind `DELETE /user/account` (privacy.py:98, untouched) still coexists with the new scrubbing `DELETE /api/user/account`. |

Compile check: all touched server files parse clean.

## Demo flow — friend experience at 07db0a3

1. **Auto-login: WORKS.** First visit → locked full-screen AuthModal (`checkSession` → `/api/me`; 401 → mandatory modal, no escape).
2. **2FA offer: DOES NOT EXIST in the shipped UI.** Server fully built; **frontend has zero 2FA handling** — no `2fa_required` handler in AuthModal.jsx:42-45 (a 2FA user sees "Invalid credentials"), no 2FA settings UI anywhere in web/src, setup endpoints never called by the UI, and signup never sets `2fa_enabled` → password-only login. Foot-guns: email codes addressed to the public_id (username ≠ email); custom SMTP unconfigured = mock (codes only to logs); TOTP is the zero-config method.
3. **Privacy policy: WORKS (client-side).** Signup checkbox ("Academic Honor Code / FERPA / GDPR Terms") required + **mandatory post-login PrivacyPolicy modal** (decline → logout). Server `POST /api/signup` does not enforce consent (direct-API bypass).
4. **Admin upgrade: works VIA API, not via GUI.** `POST /api/admin/user/{public_id}/plan?plan=basic|pro|elite` + `…/credits?amount=&reason=` (admin.py:188-212, require_admin — cookie auth NOW passes, round-1 401 fixed), plus bulk endpoint. Signup auto-creates friends as **plan=pro, 7-day trial, 600 credits** — so upgrades = trial→elite or credit grants. **The plan/credits GUI is dead code**: `AdminAdvancedDashboard.jsx` is never imported; Control Center shows only SystemMap. Owner uses curl/Postman (session cookie + CSRF header, or Bearer JWT which skips CSRF).

## Deploy blockers (must resolve before handing the link)

- **B1 — single-origin constraint.** Session+CSRF cookies are `SameSite=Lax` and client is same-origin by default. A split CF Pages(front)+separate-api.origin **breaks logins**. Use one origin: provided `deploy/nginx.conf` (VPS) or CF Pages + same-origin Function proxy → container backend (CF Containers/Cloud Run). Pages-only is still out (subprocess sandboxes, in-memory agents, local FS lake — but container + volumes handles it).
- **B2 — stock `docker compose up` crashes.** Compose sets `PRODUCTION_MODE=true` but nothing sets JWT_SECRET → the import-time guard raises RuntimeError. Must pass a real `JWT_SECRET` (env/mounted .env). Add `DATABASE_URL=postgresql+psycopg2://helpotron:changeme@postgres:5432/helpotron` (or stay SQLite with a persistent volume for the trial — CF Containers FS is ephemeral, so **uploads/lake/exports need a volume or R2** for any cloud run).
- **B3 — demo decision needed on 2FA**: (a) skip 2FA entirely for the demo (recommended — password-only matches the shipped UI), or (b) small UI fix (AuthModal `2fa_required` handler + settings 2FA panel wired to `/api/auth/2fa/{setup,verify-setup}`; TOTP recommended) — ~an hour of work.

## MUST-SET before launch
`JWT_SECRET` (≥32 chars, no `change_me`, not in blacklist), `SESSION_SECRET`, `ADMIN_PUBLIC_ID`, `WEB_ORIGIN=<real origin>`, `PRODUCTION_MODE=true` (+ TLS), LLM key (`GEMINI_API_KEY`/`DEEPSEEK_API_KEY` — local already configured), `EMAIL_*` only if email flows (else mock), `ADMIN_PASSWORD` one-shot via `python scripts/create_admin.py` (creates plan=elite + 9999 credits; admin-ness comes from admin_public_id match). `.env.example` additions needed: DATABASE_URL, ADMIN_PASSWORD.

## Open (non-blocking but real)
A5 survivors (api/users POST+PATCH), compose→PG wiring, GDPR duplicate route, `.git-credentials` PAT, compose postgres `changeme` password, remaining "RoniDev" defaults (transcription/overlord/referral paths — benign but sloppy), `AdminAdvancedDashboard.jsx` dead GUI.
