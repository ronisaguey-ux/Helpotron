# MEGA AUDIT & EXECUTION SWEEP — Helpotron

You are running a **10-subagent audit and remediation-planning sweep** over
`/home/roni/Roni_workspace/helpotron`. Your job is to produce ONE consolidated, buildable
plan. **You do not implement anything in this phase.** Present the plan and stop.

---

## 0. HARD RULES — read before anything else

### 0.1 THIS ENTIRE AUDIT IS READ-ONLY

**You and all ten subagents are inspecting, not changing.** Specifically:

- **No** file edits, moves, deletions or renames inside the repo.
- **No** `git add` / `commit` / `push` / `checkout` / `stash` / `restore` / branch creation.
- **No** dependency installs, migrations, service restarts, or config changes.
- **No** new rows in the production DB, and **no** writes to the live data lake.
- **No** touching the running stack.
- The **only** permitted writes are: the raw findings reports at `plans/audit/<track>.md` and
  the final consolidated plan at `plans/mega-audit-<date>.json`. Nothing else. Ever.
- If a track needs to see runtime behaviour, it **starts a scratch process on its own port**
  with `DATABASE_URL` **and** `DATALAKE_DIR` both pinned to scratch paths, and kills it by
  pid afterwards. It does not touch the live services on `:5000` / `:5173` / `:8099`.

If you believe a finding requires an actual code change to confirm it, **do not make the
change** — write the proposed patch into the finding and mark it `"verification":
"proposed, not applied"`. The next phase applies it.

### 0.2 THE GRAPH IS READ-ONLY TOO — do not rebuild it mid-audit

`graphify-out/` is a **shared artifact**: one graph, read concurrently by all ten subagents.

| Read-only — use freely | **WRITES — forbidden during the audit** |
|---|---|
| `graphify query` | `graphify extract` |
| `graphify explain` | `graphify update` |
| `graphify path` | `graphify cluster-only` |
| `graphify affected` | `graphify label` |
| `graphify god-nodes` | `python3 scripts/graphify_label.py` |
| `graphify diagnose` | `graphify watch` |

The right-hand column rewrites `graph.json`, `GRAPH_REPORT.md` and `communities.json`. A
subagent running one of those while nine siblings are traversing the same files is a
race that corrupts the one artifact the whole sweep depends on.

**If the graph looks stale** (`built_at_commit` != `git rev-parse HEAD`): **do not fix it
yourself.** Report it as an `open_question` and keep auditing — a graph one commit behind
still names the right files to open. Rebuilding is the coordinator's decision, made once,
between phases.

**Do not run `graphify install` / `uninstall` / any `--mcp` mode** — those write agent and
MCP configuration files.

### 0.3 Stay in your lane. Do not touch:
- `~/.claude/**` — not your lane. Do not read, summarise, instrument or "improve" it.
- `/home/roni-saguey/.config/opencode/**` — the opencode stack (config, MCPs, skills,
  commands, plugins, hooks, serve/wake/monitor units). Off limits.
- `~/.config/tool-call-compactor/**`, `opencode-serve`, `opencode-wake`, `tele-poller`.
- **Do not** restart `opencode-serve`. If you are hosted by it, that kills your own session.
- **Do not** launch Helpotron publicly or un-pause `helpotron-web.service`.

**Never do these:**
- **Do not commit, push, or open a PR.** Planning phase only.
- **Do not print secrets.** No `.env` contents, no API keys, no tokens, no passwords — not
  in your output, not in a report, not in a log, not in a test fixture. If a finding *is*
  about a secret, name the file and line and describe the exposure; never reproduce the value.
- **Do not create rows in the production DB.** Any test that writes must pin
  `DATABASE_URL` to a scratch sqlite file **and** `DATALAKE_DIR` to a scratch dir. A scratch
  uvicorn without `DATALAKE_DIR` pollutes the live data lake — that has happened before.
- **Do not `pkill`.** It is denied on this box. Kill by pid (`kill <pid>`) or
  `systemctl --user stop`.
- **Do not delete or overwrite work you did not write.** If you find uncommitted changes,
  they are the owner's; build around them and say so.
- **Do not propose removing a feature the owner uses** without an explicit migration path.

**Do not re-litigate settled ground.** These were investigated and closed. Read the notes,
do not redo them:
- `research/sweep2/` — 82 findings, 10 tracks
- `maintenance/ROTATION-INVENTORY-20260918.md` — the rotation inventory
- `/home/roni/Roni_workspace/shannon/workspaces/helpotron-pentest/` — Shannon pentest: 44
  vulns / 4 CRITICAL. (Outside this repo, absolute path on purpose.)
  The real ones: RCE via `sympy.sympify` in the `run_shell` agent action; and
  `POST /api/organizations/create` setting `role="admin"`.
- The security hardening in commits `5f1200c`, `c5b0d68`, `dd8c600`, the 2FA lockout fix
  `6868679`, the merge to `main` `3636d0f`, and the per-area settings work `628d03f` →
  `48b2cd3` → `e773d7d`.
- Known **pre-existing** reds that are NOT regressions:
  `test_browser_search_with_math_query_never_intercepted_by_shell` and
  `test_study_tools_v3::test_study_decks_and_review` (persistent test DB ages out).

---

## 1. NAVIGATE — mandatory, and read-only

> **The graph is how this audit avoids blind searching. Using it is not optional.**
> Before you grep for a symbol, **query the graph.** Before you claim something is used
> or unused, **run `graphify affected`.** A track that greps its way through 183,000 lines
> of code instead of traversing 9,999 nodes with real edges will run out of context and
> produce findings it cannot cite.

Traversal here is **read-only** — only the left column of the table in §0.2 is permitted.

```bash
cd /home/roni/Roni_workspace/helpotron
G=graphify-out/graph.json

# 1. orientate — what are the core abstractions of this codebase?
graphify god-nodes --top 20 --graph $G

# 2. find an entry point by intent, not by guessing a filename
graphify query "where is the API key authentication checked" --graph $G

# 3. understand a node fully: source file:line, every edge, with provenance
graphify explain "<symbol>" --graph $G

# 4. how do two things connect?
graphify path "<A>" "<B>" --graph $G

# 5. impact — everything that depends on a symbol, with file:line each
graphify affected "<symbol>" --graph $G
```

**The same graph is available over MCP** (`graphify-mcp`): `query_graph`, `get_node`,
`get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`. Prefer these
over spawning a shell when the MCP server is reachable — same data, no process.

- **Read `docs/GRAPHIFY-TRAVERSAL.md` first.** It documents the graph, the traversal
  commands, the read-only/writing split, and how the community labels were produced.
- **Read `graphify-out/GRAPH_REPORT.md`** before working an unfamiliar area: a navigation
  index of all 372 communities (each named after the file its members live in), god nodes,
  **import cycles**, and surprising connections. This is the single highest-value page in
  the repo for orientating fast.
- `graphify-out/communities.json` is the same index for machines:
  `{id, name, size, files[], hub, hub_location, third_party}`.
- **`affected` is what makes a finding's blast radius real** rather than claimed. Use its
  output to fill `blast_radius.dependents` in the plan schema (§4) — do not hand-wave it.
- Entries marked `[vendored]` are third-party material carried inside the repo
  (`vendor/watermarks-remover`, `.agents/skills/*`). They are in the graph on purpose for
  the supply-chain pass — but do not spend audit budget there unless supply chain **is** the
  question.
- The graph was built at commit `e773d7d3`. **If `git rev-parse HEAD` differs, do NOT
  rebuild it** (§0.2) — note the delta as an `open_question` and carry on. A graph one
  commit behind still names the right files to open.

**Every finding must cite `path/file.py:LINE`, and the graph is the cheapest way to get
one.** A finding without a line number is a hypothesis, and hypotheses do not belong in the
plan.

---

## 2. THE TEN SUBAGENTS

Fan out **all ten in parallel**. Each gets its own context, its own report file, and a
hard rule: **read-only — no file edits, no commits, no writes outside its own report.**
Subagents do not know about each other; tell each one that nine siblings are working the
same repo so it must not revert or "fix" anything.

**Every subagent brief must carry these four lines verbatim**, because a subagent that
does not receive them will grep blindly and produce findings it cannot cite:

> 1. **Read-only.** No edits, no commits, no writes except your own report at
>    `plans/audit/<track>.md`. See §0.1.
> 2. **Traverse the graph before you grep.** Read `docs/GRAPHIFY-TRAVERSAL.md`, then read
>    `graphify-out/GRAPH_REPORT.md`, then use `graphify query` / `explain` / `affected`.
>    The read-only commands are listed in §0.2 — **the rebuilding ones are forbidden.**
> 3. **Every finding cites `path/file.py:LINE`**, and carries a repro you actually ran.
> 4. **Nine sibling agents are in this repo right now.** Do not revert, reformat or "tidy"
>    anything — not their work, not the owner's uncommitted changes.

Each subagent must independently **verify before asserting**: run it, read the code path,
or query the graph. A claim sourced from a README or a comment is not a finding.

| # | Track | What it must establish | Ground to cover |
|---|---|---|---|
| 1 | **Security & authz** | Every auth boundary: who can reach what, and can a credential type be forgotten | `server/security.py`, `server/api_keys.py`, `server/admin.py`, `routes_organization.py`, the 2FA routes, `require_session_auth` vs API-key boundary, IDOR on every route that takes an id, the agent `run_shell` sandbox, rate limits |
| 2 | **Legality & compliance copy** | Every user-facing claim is accurate, defensible, and does not describe a prohibited use | `TermsOfServiceView.jsx`, `PrivacyPolicyView.jsx`, `PrivacyPolicyModal.jsx`, `GuideView.jsx`, `AnonymousLanding.jsx`, `ReferralSection.jsx`, `TrialActivationCard.jsx`; FERPA/COPPA/GDPR posture; data retention; the humanizer and AI-detector wording; **sensitive-term reframing** (see §3) |
| 3 | **Design system** | Token consistency, scale, spacing, contrast, dark/light parity | `web/src/components/ui/**`, the design tokens, `design/` specs, every component that hardcodes a colour or a px value that a token exists for |
| 4 | **UI & navigation** | Can a user find every feature; are there dead ends, orphaned screens, unreachable routes | `App.jsx` routing + `LEGACY_VIEWS`/`VIEW_PATH_MAP`, `AppShell`, nav items, `SettingsApp`/`SettingsSections`, mobile drawer, empty states |
| 5 | **Convenience & utility** | Every repeated manual step that should be one action; every feature that is "implemented" but has no caller | Grep for exported functions with **zero call sites**; props passed but never read; endpoints with no client |
| 6 | **Latency** | Where a request waits, and on what | Blocking calls in async handlers (`requests`/`httpx` not awaited/to_thread), N+1 queries, sequential awaits that could be gathered, cold paths on the chat critical path, the streaming path |
| 7 | **Efficiency — this laptop** | It runs entirely on the operator's machine; the budget is real and shared | `server/resource_guard.py`, HIP `llama-server` on `:8099`, the detector funnel's CPU cost, memory residency, swap, what runs while idle, anything that burns CPU when nothing is happening |
| 8 | **Economics** | Every process that costs tokens is metered, and the price is honest | `server/credits.py`, `cost_tracking.py`, `cost_engine.py`, `metering.py`, `payments.py`, `plans.py`, `detectors.py`; the 100-tokens-per-cent unit; `TIER_TOKENS`; anything that spends without a ledger row; anything charged a flat price whose real cost is far from it |
| 9 | **Reliability & data integrity** | What breaks under concurrency, restart, partial failure | Transactions and locks on the JSON-blob settings, idempotency keys, the `scoped` replace-on-write rule, migration safety, `init_db()` `create_all` not adding indexes to existing tables, restart behaviour of every unit |
| 10 | **Testing & verification quality** | Which tests prove nothing | Tests that assert a shape instead of behaviour; doubles that ignore the write; tests that bypass the layer that breaks; **the persistent test DB** that makes exact-count assertions flaky; suites green while a feature is inert — this happened repeatedly and is the single most expensive failure mode in this repo |

**Budget the expensive ones.** Track 7 must measure (CPU, RSS, wall time), not estimate.
Track 6 must show real numbers, not "this looks slow".

### 2.1 Graph entry points per track — start here, do not grep cold

Each subagent gets the same four-line brief above **plus** its own starting traversal. Every
symbol below was **verified to resolve** against `graphify-out/graph.json` — if one returns
nothing for you, the graph has been rebuilt and the name moved; fall back to
`graphify query "<intent>"` and do not guess.

| # | First move |
|---|---|
| 1 | `graphify explain "require_admin"` → `server/admin.py L46` · `graphify affected "get_current_authenticated_user"` → `server/routes_features.py L19` · communities `[0] server/security.py` (268 nodes), `[4] server/admin.py` (145) |
| 2 | `graphify query "user facing terms and conditions privacy consent copy"` — this track is prose, so the graph's job is to localise the files; the reading is the work. The seven components are named in the table above. |
| 3 | `graphify query "design tokens theme shared UI primitives"` · communities `[11] web/src/components/charts/chart-context.jsx` (119 nodes, +32 files) and the `web/src/components/ui/**` clusters |
| 4 | `graphify explain "App"` → `web/src/App.jsx L164` · `graphify explain "web_src_components_settingsapp_settingsapp"` → `web/src/components/SettingsApp.jsx L100` · community `[9] web/src/api.js` (122 nodes, +31 files) is the whole client surface |
| 5 | **`graphify god-nodes --top 60`**, then `graphify affected "<symbol>"` on each and look for symbols with **no inbound edges** — that is a dead feature, measured rather than guessed. Beware: `react` (147) and `lucide-react` (87) are library imports, not your code. |
| 6 | `graphify explain "server_llm_call_llm"` → `server/llm.py L369` · `graphify affected "stream_llm"` → `server/llm.py L585` — the chat critical path. Then read those handlers for un-awaited blocking work. |
| 7 | `graphify explain "_run_detector_group"` → `server/detectors.py L558` (the funnel's CPU choke point) · `graphify affected "estimate_in_process_cost"` → `server/detectors.py L194` · `graphify explain "cpu_used_pct"` → `server/resource_guard.py L73` |
| 8 | `graphify explain "log_api_call"` → `server/cost_tracking.py L53` · `graphify affected "charge_actual_usage"` → `server/credits.py L147` · `graphify affected "CreditTransaction"` → `server/database.py L332` (a god node, 35 edges). Every spend path traces back through these three. |
| 9 | `graphify explain "server_user_settings_service_usersettingsservice_update_user_settings"` → `server/user_settings_service.py L574` · `graphify affected "AgentSession"` → `server/agent_session.py L77` · community `[2] server/credits.py` (203 nodes). The money and settings write paths are where integrity breaks. |
| 10 | `graphify affected "ensure_human_standard"` → `server/humanize_skill.py L415` · `graphify affected "score_text"` → `server/detectors.py L675` — then check whether each caller's test asserts **behaviour** or a **shape**. That is this track's whole question. |

**★ Ambiguity gotcha — `explain` prints nothing when a name is not unique.** `call_llm` exists
twice (`server/llm.py` and `server/stylometry/rewrite.py`) and `SettingsApp` twice
(`web/src/components/SettingsApp.jsx` and `web/src/App.jsx`); for those the bare name returns
an empty result, which reads like "not in the graph". **Use the node ID instead** — it is the
path plus the name, slashes and dots flattened to underscores:
`server_llm_call_llm`, `web_src_components_settingsapp_settingsapp`. Method labels carry a
leading dot (`.log_api_call()`) but still resolve on the bare name when unique. If `explain`
returns nothing, try the ID form before concluding anything.

A track that cannot name the node it started from has not orientated, and will produce
findings without line numbers.

---

## 3. SENSITIVE-TERM REFRAMING — track 2's core deliverable

The product includes an AI-writing humanizer and AI-detection tooling. The **capability
stays**; the **framing must be defensible**. Rewrite user-facing language so it describes
what the product does rather than a prohibited outcome.

Rules:
- Describe the **mechanism**, not the evasion: "rewrites text in the user's own voice and
  cadence" — not "beats AI detectors" / "undetectable" / "evades detection".
- Never claim a result the product cannot guarantee. A detector is a classifier, not a
  verdict; say so.
- Never state or imply that the product is for defeating academic-integrity screening.
- Keep the honest disclosures that already exist — e.g. ToS already says outputs are
  **not** guaranteed undetectable. That is a strength; do not soften it away.
- Sweep the whole surface, not just the ToS: marketing copy, tooltips, guide steps,
  release notes, emails, API error strings, component names, and **identifiers/filenames**
  where a legacy name still says "evasion".
- Strengthen ToS, Privacy Policy and FAQ where they are thin: what is collected, what is
  NOT, retention, third-party processors, the student-data posture, termination, refunds,
  and the AI-output disclaimer.
- For each proposed rewrite give **exact before → after text** with `file:line`. Prose
  that outlives deleted features is a real bug class here — check every claim against
  what the code actually does.

---

## 4. DELIVERABLE — one consolidated JSON plan

Write the plan to `plans/mega-audit-<YYYY-MM-DD>.json`. Subagents write their raw findings
to `plans/audit/<track>.md`; you consolidate.

**Schema:**

```json
{
  "generated_at": "ISO-8601",
  "repo": "/home/roni/Roni_workspace/helpotron",
  "head_commit": "<git rev-parse HEAD>",
  "graph_commit": "<built_at_commit from graphify-out/graph.json>",
  "summary": {
    "findings_total": 0,
    "by_severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
    "by_track": {},
    "verified_red_tests": [],
    "estimated_total_effort": "<hours>"
  },
  "findings": [
    {
      "id": "SEC-01",
      "track": "security",
      "severity": "critical",
      "title": "<one line>",
      "evidence": {
        "locations": ["server/file.py:120-134"],
        "repro": "<the exact command or test that demonstrates it>",
        "observed": "<what actually happened — the real output>"
      },
      "impact": "<what an attacker or a user actually gets>",
      "blast_radius": {
        "graph_query": "graphify affected \"<symbol>\"",
        "dependents": ["<symbols/files>"],
        "breaks_if_changed": ["<files>"]
      },
      "fix": {
        "approach": "<the change in one paragraph>",
        "files": ["server/file.py"],
        "snippets": [
          {
            "file": "server/file.py",
            "action": "replace",
            "anchor": "<exact existing text to locate>",
            "before": "<exact current code>",
            "after": "<exact new code>"
          }
        ],
        "migration": "<data/schema steps, or null>",
        "risk": "<what could break>"
      },
      "tests": [
        {
          "path": "server/tests/test_x.py",
          "name": "test_<behaviour>",
          "proves": "<the behaviour this pins>",
          "must_fail_without_fix": true,
          "body": "<complete, runnable test code>"
        }
      ],
      "verification": "<the exact command that proves the fix, and what success looks like>"
    }
  ],
  "execution_order": [
    {"step": 1, "finding_ids": ["SEC-01"], "rationale": "highest blast radius first", "depends_on": []}
  ],
  "open_questions": [
    {"question": "...", "why_blocked": "...", "recommended": "..."}
  ]
}
```

**Every finding must carry all four:** exact `file:line`, a **repro you actually ran**, a
copy-pasteable fix with real before/after snippets, and a test that **fails without the
fix**. A finding missing any of the four is marked `"unverified": true` and sorted last —
do not silently drop it, and do not pad the list with it either.

**Rank by exploitability and blast radius, not by how interesting the bug is.** A CRITICAL
must be reachable **now** with the code as it stands; a real-but-latent issue is HIGH/latent
and must say so.

---

## 5. WHAT GOOD LOOKS LIKE HERE

This repo has a specific, expensive failure mode, and your plan will be judged on whether
it avoids it:

> **A feature shipped that was inert, or destructive, with a green test suite.**

Real examples found in this exact repo: an override toggle that did nothing whenever the
global setting was on; a save that silently deleted every other saved override; a value
written under a schema nothing read; a write the API silently dropped while returning 200;
a UI that called a function that was never imported; an avatar endpoint with no caller; a
subject override silently saved as a different scope because the UI called a field `name`
and the DB called it `title`.

So: **a passing test is not evidence a feature works.** For anything in tracks 4, 5, 8 and
10 specifically, drive the real path and assert the real artifact — the file is served,
the row is in the DB, the page actually moved, the value the backend *resolves* is the
value that was saved.

**Prefer a test that fails without the fix.** If you cannot make a test fail against the
current code, you have not pinned the behaviour — you have pinned your belief about it.

---

## 6. OUTPUT

Present, in this order:

1. **Executive summary** — the state of the repo in a short paragraph, then the count by
   severity, then the 5 findings that matter most and why.
2. **The findings table** — one row each: id, severity, track, title, location.
3. **The plan file path** and its top-level shape.
4. **Execution order** — the sequence, grouped into safe commits, with what each step
   verifies.
5. **Open questions** — each with your recommended default, so the owner can answer with
   one word instead of a paragraph.

**Then stop. Do not begin implementing. Do not start step 1. Wait to be prompted.**
