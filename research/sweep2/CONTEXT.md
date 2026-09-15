# Helpotron — 10-agent sweep brief (2026-09-14, sweep 2)

You are ONE of 10 agents auditing **helpotron** (backend + web app + Chrome
extension). You will never see the other nine. Each of you owns ONE track and
writes ONE report file. Do not coordinate; overlap is expected and fine.

## WHY YOU ARE HERE

The owner wants a complete picture before deciding what to fix. **He decides —
you do not fix anything.** A finding without a number and a file:line is not a
finding.

## HARD RULES (violating these invalidates your report)

1. **RESEARCH AND REPORTS ONLY.** Your ONLY writable file is your report path.
   Do not edit, create or delete any other file. The owner's code is not yours
   to change, and nine other agents are in here at the same time.
2. **NEVER mutate git** — no commit, checkout, reset, clean, stash, push, add.
   Read-only `git log` / `git show` / `git diff` is encouraged.
3. **NEVER `pkill`** — it is denied on this box and a pattern match kills your own
   shell. Kill by explicit pid only, and only processes you started.
4. **NEVER print, copy or echo a secret.** `.env`, API keys, tokens, passwords,
   cookies. Read config programmatically; keep values on disk. If a secret leaks
   into your report, your whole report is void.
5. **Never fabricate.** No invented paths, line numbers, function names, or
   measurements. If you could not verify something, write `"confidence": "low"`
   and state what you could not check. A visible gap is useful; an invention is
   poison.
6. **Every finding carries a `path/file.ext:LINE` and a NUMBER** (a measurement,
   a count, a timing, a byte size). "This could be slow" is not a finding.
   "`/api/x` takes 2.4s cold (measured 3×)" is.
7. **Report what is actually there, not what the naming implies.** Read the code.
   A function called `validate_*` that returns True unconditionally is a finding.
8. **No changes to running services.** Do not restart, kill or reconfigure the
   API, web server, tunnel or any systemd unit. Read-only probing (curl GET) is fine.

## THE PRODUCT

`/home/roni/Roni_workspace/helpotron` — a study/homework assistant:
a **FastAPI backend** (`server/`, 103 py files, ~34.8k lines), a **React web app**
(`web/src/`, 193 files, ~43.2k lines), and a **Chrome MV3 extension**
(`extension/`, 27 files, ~14.7k lines) that drives the user's own browser. It has
a credit/token economy and is live on the public internet.

| area | path | size |
|---|---|---|
| backend | `server/*.py` | 103 files / 34,782 lines |
| web app | `web/src/` | 193 files / 43,218 lines |
| extension | `extension/` | 27 files / 14,683 lines |
| backend tests | `server/tests/test_*.py` | 61 files |
| root tests | `tests/` | 5 files |
| ops | `deploy/`, `start_stack.sh`, systemd units, `Dockerfile` |
| docs | `README.md`, `CHANGELOG.md`, `GATES.md`, `helpotron_SoT.md`, `docs/` |

Biggest modules (start here for architecture): `routes_overlord.py` 2542,
`main.py` 2229, `routes_extension.py` 1881, `overlord_agent.py` 1857,
`user_settings_service.py` 1270, `routes_user_settings.py` 1043,
`assignment_dump.py` 871, `datalake.py` 749, `llm.py` 646, `screen_vision.py` 696.

## ENVIRONMENT — HOW TO ACTUALLY RUN THINGS

- Python venv: `.venv` (exists). **Run python/pytest from the repo root.**
- Tests: `.venv/bin/python -m pytest server/tests/ -q` → currently **503 passed**.
  The full run takes ~2 minutes. **Do not run the full suite more than once** —
  it is heavy and 9 other agents are competing for the box.
- `.env` exists and holds real keys. **Never print it.**
- Running services (read-only probing fine, do NOT restart):
  - `helpotron-api.service` → `http://127.0.0.1:5000` (uvicorn, serves the API)
  - `helpotron-web.service` → `http://127.0.0.1:5173` (vite preview of `web/dist`)
  - `helpotron-tunnel.service` → `https://helpotron.dpdns.org` (cloudflared)
  - `systemctl --user status helpotron-{api,web,tunnel}` — read-only.
  - Local health: `curl -s http://127.0.0.1:5000/api/health`
- Auth for probing the API: there is a local dev-login bypass for the account
  `RoniDev`. To get a session you may POST to `/api/login` with
  `{"public_id":"RoniDev","password":"<see below>"}`. **Ask the owner's config,
  do not guess** — read `server/main.py` for the accepted local bypass credentials
  if you need them, and **NEVER put them in your report**. Mutating requests need
  the `X-CSRF-Token` header returned by login.
  **Do not create, delete or modify rows in `data/db/helpotron.db` (production).**
- **Read-only investigation of the DB is fine** and often the fastest evidence:
  use python `sqlite3` against `data/db/helpotron.db`. Opening it read-only
  (`sqlite3.connect('file:data/db/helpotron.db?mode=ro', uri=True)`) is safest.
  `sqlite3` the CLI **does not exist** on this box; use python.
- Playwright is available for the web app at
  `web/node_modules/playwright` (require it by absolute path; a bare
  `require('playwright')` from `/tmp` will not resolve). Chromium is cached.
  **Keep browser runs lean**: small viewport, short runtime, and avoid software GL
  loops — `envy-mem-watchdog` will SIGSTOP a CPU-heavy run and it will look like a
  crash. **Prefer reading code and measuring with curl over driving a browser.**
- For any long CPU-bound job, wrap it: `systemd-run --user --scope -q -p CPUQuota=40% -- <cmd>`.

## ⚠️ THE SECOND-ORDER TRAPS (this is where your time goes if you ignore it)

These have each cost a previous agent an hour. They are true **right now**:

1. **`pkill` is DENIED** and a pattern match can kill your own shell. Kill by pid.
2. **`/usr/bin/node` does not exist** — node is `~/.local/bin/node`.
3. **`server/main.py` is skip-worktree'd.** `git status` will look clean even
   though it is modified. It holds a local dev-login bypass that must NEVER be
   committed. Do not revert it, do not stage it, and **do not judge it as a
   security finding without saying it is local-only and intentionally
   uncommitted** — `git show HEAD:server/main.py` shows the clean version.
4. **The test suite writes to `test_helpotron.db`**, not production. Tests are
   isolated by a `DATABASE_URL` pin. If a test appears to touch `data/db/helpotron.db`,
   that IS a finding — verify carefully before claiming it.
5. **`created_at` is UTC everywhere.** Any comparison against local time
   (`date.today()`, `datetime.now()` without tz) is a real bug class — one was
   just fixed in the study streak. Hunt for the rest.
6. **A route registered in `server/main.py` is uncommittable** (skip-worktree) and
   would be missing from a fresh clone. Check `git show HEAD:server/routes_overlord.py`
   for how sub-routers are mounted from tracked modules instead.
7. **The prod DB has a real user set** (~15 accounts). Do not delete rows.

## CURRENT STATE YOU SHOULD TREAT AS GIVEN

- Working tree is **clean** at commit `304542e` (all recent work committed and
  pushed). If `git status` is dirty when you start, another agent touched
  something — report it, do not "fix" it.
- The extension ships as `dist/helpotron-extension-v2.7.0.zip` and is **byte-identical**
  to what `GET http://127.0.0.1:5000/api/extension/download` serves.
  The Chrome Web Store currently serves **2.6.0**; 2.7.0 is in review.
- A prior audit (2026-09-14, `research/h1..h10*.json`) already covered some ground.
  **You MAY read those to avoid re-reporting fixed things**, and you should
  specifically check whether each of their claims is still true. Many are now
  stale. Do not just copy them — re-verify.
- Known red: `server/tests/test_extension_agent_chat.py::test_browser_search_with_math_query_never_intercepted_by_shell`
  fails at HEAD. Confirm it is still the same and decide whether the TEST or the
  CODE is wrong — that is a genuine question, not a given.

## OUTPUT — YOUR REPORT

Write **one JSON file** at the exact path given in your task. Schema:

```json
{
  "track": "<your track id>",
  "agent": "<your track name>",
  "summary": "3-6 sentences. The honest headline, including what you could NOT check.",
  "severity": "critical|high|medium|low",
  "findings": [
    {
      "id": "S1-1",
      "title": "one line, concrete",
      "severity": "critical|high|medium|low",
      "category": "security|latency|cost|design|correctness|tests|ops|contract|ux",
      "evidence": "path/file.ext:LINE plus the NUMBER you measured. Quote the offending line.",
      "impact": "what actually goes wrong for the user or the business",
      "confidence": "high|medium|low",
      "verified_how": "the exact command or read that proves it"
    }
  ],
  "fixes": [
    {
      "id": "S1-F1",
      "finding_id": "S1-1",
      "files": ["path/file.ext"],
      "lines": "120-134",
      "change": "the exact change, specific enough to apply without re-deriving it",
      "verify": "the command that proves the fix worked",
      "effort": "S|M|L",
      "risk": "what could break"
    }
  ],
  "verification_plan": ["ordered steps someone else could run to reproduce your top findings"],
  "external_research": ["only if you looked something up: what, where, and the version/date"],
  "open_questions": ["things you could not resolve, phrased so the owner can answer in one line"],
  "could_not_check": ["explicit list of what you did not have access/time to verify"]
}
```

**Write the file within your first 10 minutes with whatever you have, then keep
rewriting it as you learn more.** Previous agents were killed mid-run by the
memory watchdog; the ones who wrote early kept their findings, the ones who
didn't lost everything. Assume you may be killed at any moment.

## QUALITY BAR

- **Prefer few, proven, high-value findings over many speculative ones.** A
  report with 6 verified findings beats one with 30 guesses.
- **Rank by real impact**: money lost, data lost/exposed, user blocked, user
  misled. Cosmetic issues are legitimate but must be labelled `low`.
- **Say what is GOOD too** — if a subsystem is solid, one line saying so is
  valuable and stops the owner wasting time there.
- If your track turns up nothing serious, **say that plainly**. A clean bill of
  health with evidence is a real result. Do not manufacture findings to look busy.
