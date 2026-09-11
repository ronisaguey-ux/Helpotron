# Prompt for Antigravity: full security analysis of Helpotron + fix + push/rebase/merge

**Context:** Helpotron (AI academic-assistance app) at `/home/roni/Roni_workspace/helpotron` — FastAPI + SQLAlchemy backend (`server/`), React/Vite frontend (`web/`), SQLite (real DB: `data/db/helpotron.db` per `.env`), live API `127.0.0.1:8000` (uvicorn `--reload`), preview `127.0.0.1:5173`, public `https://helpotron.dpdns.org` (cloudflared).

**TASK:** Do a FULL security analysis of the website and FIX anything you find, then verify, then git push + rebase + merge. Do not produce a report-only — fix the issues.

## Security scope (analyze all of these)
1. **Auth & session**: JWT issuance/validation (`server/security.py`), login/signup (password hashing, brute-force, Turnstile gate, 2FA/TOTP flow + SMS opt-out), CSRF token handling, session expiry/rotation.
2. **IDOR / authorization**: every `/api/...` route that takes an id (assignments, materials, messages, exports, payments, admin routes incl. `/api/admin/user/{id}/welcome-tokens`) — verify ownership scoping (must filter on `current_user.id`), 404-vs-403 behavior, admin-only guards.
3. **Injection**: SQLAlchemy usage (no string-built queries), shell/`eval`/`exec`, command injection from user input, path traversal in any file handling (uploads, `file_urls`, doc exports).
4. **XSS**: React rendering (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`), markdown/LaTeX rendering paths, chat message rendering in My Agent views, any `window.open`/`postMessage` handlers, CSP headers on the API + any served HTML.
5. **SSRF / external fetches**: canvas scraper / file download / OCR paths that fetch user-supplied URLs — block private IPs, link-local, metadata IPs (169.254.x, 10.x, 127.x, ::1), and non-http(s) schemes.
6. **File uploads**: `/api/transcribe` and any upload endpoint — size limits, type sniffing, extension handling, filename sanitization, storage path safety.
7. **Secrets & data exposure**: no secrets in responses/logs/errors (mask API keys, tokens), no `.env`/key leakage via `/static`, `/docs`/`/openapi.json` exposure, debug mode, datalake anonymization (user ids must stay `usr_` + sha256 salted, never raw `public_id`).
8. **Rate limiting & DoS**: per-IP throttling correctness, the memory budget queue (memguard), generous limits on expensive LLM routes, WebSocket/SSE endpoints.
9. **Payments**: Stripe webhook signature verification, payment/credit manipulation (can a client mint credits? negative amounts? replay?), discount abuse.
10. **Agent surface**: `server/overlord_agent.py` tool actions (esp. permission/mode handling, `change_settings`, `export_assignment_data`, `request_feature`), system prompt injection from user text, subagent isolation.
11. **Headers & config**: CORS origins, security headers (CSP, X-Frame-Options, HSTS), cookies flags (HttpOnly/Secure/SameSite), `proxy-headers` trust.
12. **Dependencies**: `pip-audit`/`npm audit` on lockfiles — fix only HIGH/CRITICAL direct-dependency vulns with minimal, safe upgrades; run the full test suite afterward.
13. **License/keys hygiene**: grep repo + git history (`git log -S`) for committed secrets; never commit or print real keys (mask everything you display).

## Hard rules
- **Never modify**: `~/.claude`, `~/.claude.json`, MCP configs, hooks, `.env` (report problems, don't self-fix), bot/telegram setups, VPN stacks.
- **Never route the paid DeepSeek key anywhere**; the app must keep using ONLY the free OpenRouter key (`.env OPENROUTER_API_KEY`/`OMNIROUTE_API_KEY`). If you touch `llm.py`, the wire id must stay `deepseek/deepseek-v4.1-flash` — the canonical id IS the wire id (the old `-exp` rewrite is retired; V4.1 Flash is natively vision, verified 09-10). See `test_llm_wire_model.py`.
- **Real fixes only** — no placeholders, TODOs, stubs, or comment-markers. Every fix gets a real code change + a regression test (or an updated existing test) that would have caught the bug.
- **Data safety**: use ephemeral test users (e.g. `secaudit_<rand>`) and sweep them + their rows afterward; never touch/delete production user rows. Beware: backend tests share the dev DB only via test suite's `sqlite:///./test_helpotron.db` — run tests with `.venv/bin/python -m pytest server/tests -q` from the repo root; never against the prod DB.
- **No external probing**: do not scan/attack any other host; all testing is localhost/prod-live-site with benign payloads only. Do not send any user data outside the machine.
- Use `.venv/bin/python` for everything Python; `vite build` must be run from `web/`; server edits auto-reload the live API (that's expected — verify `/health` returns `{"status":"ok"}` after).
- Test suites that call the real LLM can be flaky — retry a failure once before declaring a regression; never weaken an existing assertion to make a test pass.

## Verification (all required before git work)
1. `.venv/bin/python -m pytest server/tests -q` — full suite green (plus your new tests).
2. `cd web && npm run build` — clean build with no new warnings/errors.
3. `curl -s http://127.0.0.1:8000/health` → 200 `{"status":"ok"}`; `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173` → 200.
4. Quick live spot-checks for each fix via `curl`/TestClient with a throwaway user, cleaning up after.

## Git (do this LAST, in order)
1. `cd /home/roni/Roni_workspace/helpotron`; `git fetch origin`; branch from latest `origin/main`: `git checkout -b security-audit-$(date +%Y%m%d) origin/main`.
2. Commit in logical, focused commits (explicit file paths in `git add`, never `git add -A`), ending with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
3. When done: `git rebase origin/main` (resolve conflicts honestly — never `-X theirs` to silence a conflict).
4. Run the FULL verification block again post-rebase, then `git checkout main && git pull --ff-only origin main && git merge --ff-only security-audit-...` and `git push origin main`.
5. If the suite is not green at any point: STOP, do not merge, report exactly what fails.

## Deliverable
A concise report (console/README section or comment block): findings by severity (Critical/High/Medium/Low — give at least the top items), what you fixed, tests added, verification results, and anything you intentionally left unfixed with a reason.
