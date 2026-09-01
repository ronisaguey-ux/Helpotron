# Helpotron Fix-Verification ROUND 2 — commit b40b110 (3-agent, evidence-based)

**Date:** 2026-08-25 · **Against:** AUDIT_CONSOLIDATED_2026-08-25.md + round-1 verification · **Target:** b40b110 (origin/main HEAD, verified; worktree == b40b110, clean) · **Method:** 3 read-only agents, proof pulled from the actual commit diff, pytest at the exact commit.

## Verdict: REAL progress — the claimed fixes are genuine this time (A3/A4/A6/B8/B10/B13/B16 verified), but NOT complete: ~8 categories still block public deployment, headlined by an identity-mint/cross-user-charge surface (A5) and a NEW known-key Dockerfile trap.

Runs: **109/109 pass at b40b110** (22.5s, verified).

---

## VERIFIED FIXED at b40b110 (with proof)

| # | Item | Proof |
|---|---|---|
| A3 | Purchase minting closed | `routes_auth_2fa.py:327` auth dep; zero `User(` construction; `verify_password` + `code_store.verify_code`; destination = registered account only. Manual providers → `status="pending"`, credits only if `captured` (payments.py:159-170). Refund no longer 500s (`Payment` imported, signature matched) |
| A4 | 2FA disable | auth dep + per-method TOTP/email/SMS code validation (routes_auth_2fa.py:234-267) |
| A6 | Dump upload/list | all `Depends(get_current_authenticated_user)`; no user_id Form; disk name uuid-only; basename+traversal-char scrub (assignment_dump.py:223-227) |
| B8 | Blocking SMTP/SMS | 7 `asyncio.to_thread` wraps (routes_auth_2fa.py:83,131,192,295 + SMS :142,201,310) |
| B10 | Credit race | **atomic** `UPDATE users SET credits=credits-:cost WHERE id=:uid AND credits>=:cost`, rowcount check, used directly in charge() (credits.py:79-92) |
| B13 | Overlord ownership | 403 if `perm_entry["user_public_id"] != user.public_id` (routes_overlord.py:240-241) |
| B15 | Draft retry | auth dep + owner 404 + DRAFT_COST charge (main.py:1208-1220) |
| B16-half | Hygiene auth | /inspect + /clean `Depends(get_current_user)`; URL from `HYGIENE_SERVICE_URL` (env default 127.0.0.1:8765 remains, and the sync httpx still blocks the event loop at routes_hygiene.py:48) |
| B21 | Record button | background.js:61 handler wired (regression check passed) |
| C6-half, D2 | export-download guard (is_relative_to), extension reads server/public_id from chrome.storage | verified |
| Working tree | all hardcoded credentials scrubbed from HEAD (set_password argv, LoginTest inputs, background.js storage-only) | grep clean (except audit .md files) |

## STILL BLOCKING PUBLIC DEPLOYMENT (ranked)

### 1. **A5 core — identity-mint + cross-user charge/read: STILL LIVE** (biggest remaining hole)
`get_or_create_user(db, client-supplied public_id)` with NO auth remains on: `/api/transcribe` (main.py:735, `"dev-user"` fallback, **charges the victim's credits** :750), `/api/generate/stream/{kind}` (:752), `/api/agent/start` (:872 — **charges victim's credit**), `/api/style/upload` + `/api/style/{public_id}` (:905/:925 — **overwrites victim's writing style**), `/api/materials/{public_id}/{kind}` (:972), `/api/dashboard?public_id=` **and X-Public-ID header** (:935-950 — contradicts the comment at :956 claiming "header never trusted"), `/api/draft/generate` (:1007), `/api/users` POST (:692 — bare mint). Plus **no auth at all**: `/api/draft/{draft_id}/admin` (:1230 — the fixer *claimed* it), `/api/assignment/{id}/export-gdocs`, `/api/assignment/humanize`, `/api/agent/{session_id}`, `/ws/agent/{session_id}` (**no owner check**; WS detach on any close → mid-run refund fraud). **Any demo visitor can burn any user's credits, read any materials/style, get free LLM compute.**
(This is the same family the fixer's A5 claim covers only 10 of ~23 routes.)

### 2. **N1 — Dockerfile ships a known-key-insensitive prod container**
`Dockerfile` does `COPY .env.example /app/.env`; `.env.example` contains functional-format `JWT_SECRET=helpotron_super_secret_jwt_signing_key_min_32_chars` (now public) — and `security.py:44-45`'s prod guard only blacklists 2 exact strings, so it **passes**. With `PRODUCTION_MODE=false` default: forgeable HS256 JWT (the token includes `role`), `secure=False` session cookies, localhost CORS. **Fix:** empty/`change-me` placeholders in .env.example, expand the guard to reject the .env.example literals, default PRODUCTION_MODE true in the image, never copy .env.example as .env in the Dockerfile.

### 3. **A8 — CF architecture untouched**
No postgres driver (a PG URL hard-fails), no docker-compose, zero boto3/S3/R2, agent sessions still in-memory dict (agent_session.py:99), subprocess sandboxes, local FS lake with dead `DATA_LAKE_DIR`, unused `redis>=5`. Dockerfile itself is a valid single-container (uvicorn + serves web/dist) → fine for CF Containers/Cloud Run; **Pages-only is out**.

### 4. **Extension localhost-locked**
`manifest.json` host_permissions localhost-only; `background.js:4` `DEFAULT_SERVER='http://localhost:8000'` — the extension cannot reach a Cloudflare origin; a demo that includes the extension is dead until a config-mapped origin + permissions exist.

### 5. **A1 — secrets still recoverable; remote URL embeds live PAT**
History (43fdcc7, 9804380, 9378a6d…) still contains `RoniDev/••••••••••••`, DeepSeek key, Telegram bot token, old PAT; `.git/config remote.origin.url` embeds the **live** PAT `<REDACTED-GITHUB-PAT>…`. Purge (filter-repo) + rotate + credential-helper before any public push.

### 6. **A4 remainder — 2FA still cosmetic**
Never enforced at login (zero `2fa_enabled` checks in main.py/config.py); `/2fa/verify-setup` still enables 2FA/secret on any public_id anonymously; `verify-email` C18 persists.

### 7. **B9 — math endpoints fully unauthenticated** (`routes_math.py` /solve, /verify-text, /execute — zero Depends); `_safe_pow` bounds are in.

### 8. **Remaining backlog (not deployment-critical but real)**
B14 placeholder routing → match_assignment_nlp; B5 ("RoniDev" author fallback routes_datalake.py:142, DATA_LAKE_DIR dead, ghost datalake_storage); B7 (privacy.py delete route never touches the lake, and the route is `/user/account` — **missing `/api` prefix**); B20 theme fake; B18 phantom scripts tracked; B22/B23 scaffolding without caller/runner; B1 duplicate resolver stub; C1 sandbox `startswith`; C2 gdocs silent drop; C3 dump orphan "processing"; C4 CSV escaping; C5 export-root mismatch; D1 no hash routing; N7 27MB committed shots (public repo junk); N2 `config.py:153` alias + `auth.py:17` twin-key JWT (latent); N5 anonymous `/api/users` mint; N6 dead redis/dirs.

## Bottom line
b40b110 is a **substantially better** commit than 9378a6d — the headline criticals (minting, 2FA disable, dump traversal, credit race, cross-user permissions, draft retry) are genuinely fixed and the tests pass. **But the app is still not demoable publicly**: #1 (A5 identity-mint/cross-user charge — any visitor can bill any account) and #2 (known-key Dockerfile container) alone each disqualify the launch; #3-#5 (CF architecture, extension origin, secret history) are structural blockers. Send the fixer the ranked list above; #1+#2+#5 are ~a day of work and must land before the demo.
