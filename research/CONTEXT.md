# Helpotron — swarm research brief

You are ONE of 20 agents auditing two products. Ten are on **T2B**, ten on
**helpotron** — you will never see them. Everyone writes to their own file.

## HARD RULES

1. **RESEARCH AND REPORTS ONLY.** Your ONLY writable file is your report at the
   path in your brief. Do not edit, create or delete ANY other file in the repo.
   Other agents are in here at the same time; an edit outside your report will
   collide and be discarded.
2. **Never run git commands that mutate** — no commit, checkout, reset, clean,
   stash, push. Read-only `git log`/`git show`/`git diff` is fine and encouraged.
3. **Never `pkill`** — denied on this box, and a pattern match can kill your own
   shell. Kill by pid only.
4. **Never print, copy or echo secrets.** `.env`, API keys, tokens, passwords.
   Read config programmatically; keep values on disk.
5. **Never fabricate.** No invented file paths, line numbers, function names or
   measurements. If you cannot verify it, mark `"confidence": "low"` and say what
   you could not check. A gap is visible; an invention is not.
6. **Every finding carries a number and a `path/file.ext:LINE`.**
7. **Every fix names file, lines, exact change, and how to VERIFY it.**

## ⚠️ THE REPO IS NOT CLEAN — READ THIS BEFORE YOU TOUCH ANYTHING

`git status` shows **~1,508 lines of uncommitted work across 16 files** from a
prior session (Sept 11–12): `extension/*` (popup, agent_mode, content,
element_registry, manifest, css), `server/llm.py`, `server/main.py`,
`server/routes_extension.py`, `server/routes_overlord.py`,
`server/routes_study_tools.py`, `server/tests/test_extension_agent_chat.py`,
`web/src/components/ChatBubble.jsx`, `web/src/main.jsx`.

**That work belongs to the owner. Treat it as the current state of the code —
read it, judge it, report on it — but NEVER revert, stash, checkout or
"clean" it.** It is exactly why you are restricted to writing only your report.

## THE PRODUCT

`/home/roni/Roni_workspace/helpotron`

A study/homework assistant. A FastAPI backend (`server/`, 58+ test files), a
React web app (`web/src/`), and a Chrome MV3 extension (`extension/`) that
drives the user's own browser. It has a credit/token economy, a customer-facing
site, and it is live on the public internet.

### Layout
| area | path |
|---|---|
| backend | `server/*.py` — routes, auth, analytics, assignments, study tools, vision, LLM |
| web app | `web/src/` — `App.jsx`, `api.js`, `components/`, `main.jsx` |
| extension | `extension/` — MV3: `background.js`, `popup.js`, `agent_mode.js`, `content.js` |
| tests | `server/tests/test_*.py` (55), `tests/` (a few more) |
| ops | `deploy/`, `start_stack.sh`, systemd units, `Dockerfile` |
| docs | `README.md`, `CHANGELOG.md`, `GATES`, `helpotron_SoT`, `docs/` |

### Environment — how to actually run things
- Python venv at `.venv` (**exists**). **Run tests from the repo root.**
- `.env` exists (46 lines). **Never print it.** Read individual keys
  programmatically if you need one, and never put a value in your report.
- Test command (verify it first): `.venv/bin/python -m pytest server/tests/ -q`
- **Tests are isolated from prod by `DATABASE_URL`.** Never write to the prod DB
  (`data/db/helpotron.db`). No throwaway rows in prod, ever.
- The API runs on **:5000**, the web preview on **:5173**, public via a
  cloudflared tunnel. `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/health`
  proves the origin is up. Do not restart services the owner may be using.
- Known pre-existing reds: `test_browser_search_with_math_query_never_intercepted_by_shell`
  (deterministic path returns `[]` by design) and occasionally
  `test_security_hardened.py::test_deterministic_math_ast_whitelist` (a 5 s
  timeout under load). Report them as measured, do not "fix" them.

### Product rules that are settled (do not re-litigate, but DO flag violations)
- **LLM calls go to OpenRouter only.** The key is in `.env`. No "omni" lanes.
- **Model ladder = `deepseek/deepseek-v4.1-flash` only.** Any other slug in a
  routing table is a bug. `PRIMARY_MODEL` in `.env` is NOT a routing control —
  the ladder is hardcoded in `ModelPolicy.PRIMARY_MODELS` (`server/llm.py`).
- **Any manifest bump creates a release row and shows What's New to every
  installed user** — so a version bump is a publish action, not a dev action.
  Flag any un-announced bump.
- The extension's live DOM element registry and the screen-vision coordinate
  path are load-bearing: the server tells the model what it can do from
  `seescreen`/`execute` booleans in the request body.

## YOUR REPORT

Exactly one file, valid JSON, at the path in your brief:

```json
{
  "track": "<your track id>",
  "agent": "<short name>",
  "summary": "3-6 sentences: what is actually wrong, the root cause, the headline fix",
  "severity": "blocker|major|minor",
  "findings": [
    { "id": "H<track>-F1", "title": "short",
      "symptom": "what a user/operator sees",
      "root_cause": "the mechanism, with file:line",
      "evidence": ["server/routes_x.py:212 — ...", "measured: pytest ... -> 3 failed"],
      "confidence": "high|medium|low",
      "impact": "what it costs — money, trust, time" }
  ],
  "fixes": [
    { "id": "H<track>-X1", "finding": "H<track>-F1",
      "file": "path/file.ext", "lines": "212-230",
      "change": "EXACT edit — names of functions/vars, before -> after",
      "risk": "what could break",
      "verify": "the exact command and the number that must change" }
  ],
  "verification_plan": "how a reviewer independently confirms the whole track",
  "external_research": [
    { "what": "lib/repo/doc", "url": "", "why": "what it gives us here", "license": "", "verdict": "adopt|adapt|reject+because" }
  ],
  "open_questions": ["what you could not determine, and what would settle it"]
}
```

Order fixes by impact. **Be specific enough to apply mechanically** — the master
plan is built from your JSON and implemented without asking you anything.
