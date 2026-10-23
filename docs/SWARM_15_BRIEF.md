# MEGA PROMPT — 15-agent full-stack audit swarm

Copy everything below the line into a fresh agent session. It is self-contained.

---

You are the **coordinator** of a 15-agent audit swarm on Helpotron, a live academic
companion product with real paying students. Your job is to spawn, brief, monitor and
harvest fifteen specialist agents, then consolidate their findings.

Read these first, in order, before spawning anything:
1. `/home/roni/Roni_workspace/helpotron/docs/HANDOFF.md` — environment, deploy, traps
2. `/home/roni/Roni_workspace/helpotron/docs/design/DIRECTION.md` — 31 owner decisions
3. `/home/roni/Roni_workspace/helpotron/reports/ui-audit/findings.json` — 31 existing findings

## Environment

| Thing | Value |
|---|---|
| Repo | `/home/roni/Roni_workspace/helpotron` (git, `main`) |
| Live | <https://helpotron.dpdns.org> |
| Server | `ssh -i ~/.ssh/server_ed25519 roni@100.88.179.28`, app at `/home/roni/helpotron` |
| Stack | FastAPI + SQLAlchemy · React 19 + Vite + Tailwind v4 · Chrome MV3 extension |
| QA account | `qadesign1` / `Design12345!` |
| Logs dir | `reports/audit-v2/` — create it, one file per agent |

---

## RULE 0 — INCREMENTAL LOGGING. THIS IS THE MOST IMPORTANT RULE.

A previous 12-agent swarm lost **10 of 12 agents' work entirely** because they batched
their findings and wrote the report at the end. They were killed by a rate limit
mid-run and everything was lost.

Every agent MUST be told, verbatim:

> **Assume you will be killed without warning at any moment.**
> Your FIRST action is to create your log file with a header. Your SECOND action onward:
> after EVERY individual finding, immediately append it to that file. Never batch.
> Never "save it for the report". A finding that is not on disk does not exist.
> Append with `cat >> file` or an Edit — one finding, one write, immediately.
> End every work session by appending a `## STATUS` block saying what you verified,
> what you started but did not finish, and what you never reached.

Enforce this. An agent that reports only at the end has failed its brief.

## RULE 1 — PRODUCTION IS LIVE. DO NOT MUTATE IT.

A previous agent took the site down for 4.5 hours. Every agent is **FORBIDDEN** from:
- `toggle.sh` (any argument), `systemctl start/stop/restart`, killing any process
- deleting anything under `/home/roni/helpotron` on the server
- `git commit`, `git push`, `git clean`, any history rewrite
- editing anything in `web/`, `server/`, `extension/`
- installing, removing or upgrading any package
- creating accounts or data on the live system beyond the existing QA account

They **audit and report**. Remediation is a separate, later phase with owner sign-off.
Read-only SSH is fine. If an agent believes something must change immediately, it logs
it as `SEVERITY: CRITICAL` and tells you — it does not act.

## RULE 2 — ONE BROWSER

Playwright MCP is a single shared Chrome. **Only agent 1 may use it.** Everyone else
uses curl, source reading, `ssh`, and the built bundle in `web/dist`. Tell each
non-browser agent this explicitly or they will collide.

## RULE 3 — RECORD WHAT YOU AUDITED AGAINST

The repo moves. Every agent records `git rev-parse --short HEAD` in its log header.
A finding without a commit reference cannot be reproduced later.

## RULE 4 — EVIDENCE, NOT OPINION

Every finding carries either a `path/file.ext:line` citation or a measured number
(milliseconds, bytes, a ratio, a status code, a row count). "This feels slow" is not a
finding. "GET /api/dashboard p95 = 2.3s, 41 queries, `server/main.py:1882`" is.

## RULE 5 — SEVERITY, used identically by all 15

`CRITICAL` — data loss, auth bypass, secret exposure, money bug, or total outage path
`HIGH` — a user cannot complete a core task, or a real security/privacy weakness
`MEDIUM` — significant friction, measurable slowness, or a latent correctness bug
`LOW` — polish, inconsistency, cleanup
`INFO` — observation worth recording, no action implied

## RULE 6 — NO DUPLICATE WORK

`findings.json` already holds 31 findings (13 fixed, 14 open, 2 positive, 2 stale).
**Read it first.** Do not re-report a known finding — instead, verify whether the
13 marked fixed are genuinely fixed, and say so. New findings get new ids: `V2-NN`.

---

## The fifteen agents

Spawn all fifteen. Give each the rules above plus its brief. Model: use the strongest
available; these are analysis tasks where depth pays.

### Group A — correctness and experience

**A1 · Live browser verification** *(the ONLY agent with browser access)*
Drive the real site signed-in as the QA account. Verify the 13 findings marked fixed
are actually fixed in the browser, not just in the diff. Measure per route: console
errors, horizontal overflow at 1440/1024/768/390, tap targets under 32px, contrast of
body text, time to interactive, and which of the four async states exist. Screenshot
each route at 1440 and 390. **Note: Playwright is sandboxed to
`/home/roni/Roni_workspace/claude_worker` — save to a relative path, then `cp` into the
repo.** Dismiss the admin popup (`button:has-text("Got it")`) before measuring.

**A2 · Four-state inventory**
For every view component that fetches data: does it have EMPTY, LOADING (skeleton or
just a spinner?), ERROR (does it say what happened and what to do?), SUCCESS? Source
only. Inventory every silent `catch {}` / `catch (e) {}` — each is an error the user
never learns about. `AssignmentDumpView` is the known-good reference; describe how it
does it so others can copy. Chase three known bugs to root cause: the spend
confirmation that hangs on "finalize" and never completes; "server took too long"
surfacing only after the dialog is closed; a dump showing nothing while work is
actually running.

**A3 · Extension audit**
`extension/` (MV3, v2.9.0). **Lead with the complete list of every `id` and `data-*`
attribute that `popup.js` or any extension script reads** — that is the contract any
redesign must preserve, and it is the single most valuable artifact here. Then: control
inventory, competing CTAs, copy against the banned-vocabulary list, four-state coverage,
and the gap to the owner's target (a vertical icon rail: settings / launch-to-doc /
chat / scrape beside one content pane).

**A4 · Accessibility deep audit**
`axe` on every route (`axe <url> --save out.json --exit`). **`pa11y` is broken on this
box** — Chrome "No usable sandbox"; don't burn time. Beyond axe: keyboard-only
traversal of the core loop, focus management when modals open and close, focus traps,
`prefers-reduced-motion` compliance, screen-reader labelling of icon-only controls,
colour-only information, and heading-outline correctness per route.

**A5 · Copy and comprehension**
Finish the banned-vocabulary sweep started in
`reports/ui-audit/swarm/05-banned-vocabulary.md` (739 lines, **PARTIAL** — read it,
continue from where it stopped, don't restart). Then every error message in the
product: does it say what happened, why, and what to do next? Every empty state: does
it tell a student what to do? Every button label: does it name the outcome, or is it
"Continue"/"Got it"?

### Group B — security

**B1 · Authentication and session**
`server/main.py`, `security.py`, `captcha.py`, session store. Session token generation
and entropy, storage at rest, expiry and renewal, logout completeness (does it
invalidate server-side?), the cookie-race retry at `App.jsx:438`, 2FA enforcement and
bypass paths, password policy, account recovery (`routes_recovery.py`) and its rate
limits, Turnstile enforcement and the operator bypass header. **Never print a secret.**

**B2 · Authorisation and IDOR**
Every route taking an id. Can user A read, modify or delete user B's assignment,
artifact, API key, session, or credit transaction? Check the admin surface
(`ControlCenterView`, `routes_overlord.py`, `AdminToolsView`) for privilege escalation
and impersonation. Check `/api/assignment/{id}/full-view`, `/api/dump/*`, export, and
the Data Lake. Test with the QA account against ids it does not own — read-only probes.

**B3 · Input handling and injection**
SQL injection via SQLAlchemy raw/`text()` usage, command injection, path traversal
(`resolve_spa_target` is already hardened — verify), SSRF in URL import
(`routes_import_url.py`) and Canvas sync, XSS in `react-markdown`/KaTeX rendering of
agent output, prompt injection through dumped coursework into the agent, file upload
validation (type, size, magic bytes, stored filename), and the sandbox that executes
generated code — the boot log warns *"NO NAMESPACE BOUNDARY — sandboxed code runs as the
server UID and can read .env and the production database"*. **Assess that honestly.**

**B4 · Secrets, dependencies, supply chain**
Full working tree and full git history for credential shapes (`AIza`, `sk-`, `ghp_`,
bearer tokens, private keys, `.env` content, long base64). `.mcp.json` holds a live
API key and must stay gitignored and absent from history — verify. Then `pip-audit` /
`npm audit` equivalents for known CVEs, unpinned or abandoned dependencies, and
anything in `web/package.json` violating the policy in `docs/design/LIBRARIES.md`.
Check CSP, HSTS, cookie flags, CORS, and every security header against the live site.
**Mask every value you report.**

**B5 · Privacy and data handling**
The product promises FERPA compliance, GDPR Article 17, and "we never sell student
data" — in its own marketing copy and cookie banner. Verify the reality: what is
actually collected, where it is stored, how long it is retained, what the export
contains, whether deletion actually deletes (soft vs hard, and in every table), what
third parties receive data, what the Data Lake retains, and whether the cookie banner's
"Necessary only" genuinely disables the optional telemetry. Report every gap between
the claim and the implementation.

### Group C — performance and cost

**C1 · Backend latency**
Instrument or time every API endpoint the core loop touches. Find N+1 queries, missing
`await`, blocking I/O on the event loop, synchronous HTTP inside async handlers, and
anything slow enough to feel. Report p50/p95 per endpoint with the offending
`file:line`. `/api/dashboard`, `/api/assignments/cards`, `/api/dump/list` and
`/api/me` are the hot ones — `/api/me` is polled every 25s per open tab.

**C2 · Database**
Schema, indexes, and query plans. Missing indexes on foreign keys and on anything in a
WHERE or ORDER BY. Table growth and row counts on the live DB (read-only). Whether
`helpotron.db` is SQLite in production and what that implies for concurrent writes.
Check for unbounded tables (logs, api_usage_logs, credit_transactions) and absent
retention. **Read-only — no writes, no migrations, no VACUUM.**

**C3 · Frontend performance**
Lighthouse mobile and desktop on `/`, `/signup`, and the authenticated routes. Core Web
Vitals, especially LCP and CLS. Chunk sizes and what an anonymous visitor downloads —
verify the eager/lazy split documented at the top of `App.jsx` actually holds and
nothing authenticated leaks into the entry chunk. Font payload: three variable families
ship as woff2, including cyrillic/greek/vietnamese subsets nobody needs — measure the
saving. `gsap` is installed; confirm whether it is imported at all.

**C4 · LLM cost and token efficiency**
This is where the money goes. Audit every prompt sent to a model: system prompt size,
context stuffing, whether conversation history is truncated or grows unbounded, whether
prompt caching is used, whether the cheapest adequate model is chosen per task, retry
and timeout behaviour, and whether a failed run still charges the user. Cross-check the
`5×` cost multiplier just applied (`0766e8f`) against what runs actually consume —
is the estimate now honest? Check `server/draft.py`, `overlord_agent.py`, and the
subagent delegation path.

**C5 · Infrastructure and operational safety**
Deploy process repeatability, rollback path, the `toggle.sh` live/closed mechanism and
why `helpotron-api` is not enabled at boot (a reboot currently leaves the site CLOSED —
assess that as a risk). Backups: do they exist, are they tested, what is the RPO? Log
growth and rotation. Disk headroom. The `dist.bak-*` accumulation. Monitoring and
alerting — **the site was down 4.5 hours and nothing alerted anyone**; say what would
have caught it. systemd unit hardening. Certificate and domain expiry.

---

## Your job as coordinator

1. Create `reports/audit-v2/` and a `00-INDEX.md` listing all 15 agents, their status,
   and their log paths. Update it as agents complete.
2. Spawn all 15 with the rules above plus their brief. Tell each its log file path:
   `reports/audit-v2/<id>-<slug>.md` (e.g. `B2-authorisation-idor.md`).
3. **Monitor for rate limits.** If agents start dying, immediately message the survivors
   to flush their logs. Do not let work evaporate a second time.
4. As each completes, append a one-paragraph summary to `00-INDEX.md` — never paste a
   full agent report into your own context, it will overflow.
5. When all have reported, consolidate every new finding into `findings.json` with
   `V2-NN` ids, preserving the existing schema and the `summary` block.
6. Produce `reports/audit-v2/EXECUTIVE-SUMMARY.md`: the five most expensive problems
   across all domains, what each costs, and the fix. Rank by real cost to the business
   and its users — a 2-second page load and an IDOR are not the same thing.
7. Commit in small pieces. **The `commit-condom` hook enforces ≤2 files, ≤400 changed
   lines, and ≤72-character subjects.** It will reject anything larger; split rather
   than bypass.

## What success looks like

Every one of the fifteen has a log file on disk with findings appended incrementally,
each carrying a citation or a number and a severity. Nothing is lost if an agent dies.
The consolidated `findings.json` is valid. The executive summary tells the owner the
truth, including what is still bad and what was not reached.

**Report honestly. If a number did not move, say so. The owner reads the diff.**
