# Helpotron — remaining work after `feat/audit-remediation-extended`

Paste this whole document into agy. It is self-contained: it names every file, what
is already done, and exactly what to verify or finish. Do not re-derive what is
recorded here as verified.

---

## STATE (independently verified — trust this, but re-check before acting)

**Repo:** `/home/roni/Roni_workspace/helpotron`
**Branch:** `feat/audit-remediation-extended` — **20 commits ahead of `origin/main` (`8be2d8c`), NOT merged.**

The prior agent's report is **accurate**. I verified every headline claim myself:

| Claim | Verified |
|---|---|
| 19 commits matching the listed subjects | ✓ all 19 found by `git log --grep` |
| Full suite **780 passed, 0 failed, 37 warnings in 200.65s** | ✓ reproduced: 780 passed, 322.99s, exit 0 |
| `scripts/check_copy_hygiene.js` → exit 0 | ✓ "copy hygiene OK" |
| `scripts/check_stale_numbers.js` → exit 0 | ✓ "0 stale token numbers found" |
| `npm --prefix web run build` → clean | ✓ `✓ built in 15.96s`, EXIT=0 |
| `server/launch_to_doc.py` md5 `9fb6de3e8b6e0ba81c6211e3d5f441bc` | ✓ exact match |
| `server/tests/test_launch_to_doc_plan.py` md5 `923f2592fb5c83ce62fe43355174669b` | ✓ exact match |

**All 18 findings were checked in the code, not just the commit messages.** Each is a
real change: REL-02 (`_deep_merge_settings` recursive + `BEGIN IMMEDIATE` + forced core
`UPDATE`), REL-07 (`REPLACE_ON_WRITE = frozenset({"scoped"})`), EFF-04
(`await asyncio.to_thread(snapshot_once)`), EFF-05 (`IDLE_POLL_INTERVAL = 30.0` when zero
bots connected), LAT-02 (`StudyCardState.material_id.in_(...)` batch instead of N+1),
LEG-08 (`SECURITY.md:49` now says PBKDF2-HMAC-SHA256, not bcrypt), LEG-03 (Pangram Labs +
Sapling AI disclosed with data scope), LEG-04 (`Helpotron Autonomous Systems LLC` in both
Terms and Privacy), LEG-07 ("bill discount credits"), UI-01/02 (`PUBLIC_PATHS` +
`VIEW_PATH_MAP` in `App.jsx`), UI-06 (`onNavigate`/`user` forwarded), UI-10 (`hashchange`
listener), TEST-01/02/05, ECON-05 (`DRAFT_COST 2.0 → 200.0`, transcription
`TRANSCRIPTION_TOKEN_RATE = 500.0` — correct, since the token unit is 100/cent).

The 4 stale-number sites I had recorded are all correct now
(`AdminCostView.jsx` comment, `AdminAdvancedDashboard.jsx` dropdown,
`TrialActivationCard.jsx:107` → `|| 15000`, `AuthModal.jsx:465` → 15,000).

**Treat the above as done. Do not redo it. Your job is what follows.**

---

## TASK 1 — Merge the branch (highest value, blocked on almost nothing)

`feat/audit-remediation-extended` is **20 commits ahead of `origin/main`**, so a suite
that takes 5 minutes and passes 780/780 **has not reached the main line**. Anyone
cloning now gets the pre-remediation code.

1. Confirm `origin/main` is still `8be2d8c` and that the branch is purely ahead:
   ```bash
   cd /home/roni/Roni_workspace/helpotron
   git fetch origin
   git rev-list --count origin/main..HEAD     # expect 20
   git rev-list --count HEAD..origin/main     # expect 0
   ```
   If the second number is **not** 0, **stop** — main has moved and this needs a rebase,
   not a merge.

2. Re-run the gate on the branch head, immediately before merging:
   ```bash
   ./.venv/bin/python -m pytest server/tests -q
   node scripts/check_copy_hygiene.js
   node scripts/check_stale_numbers.js
   npm --prefix web run build
   ```
   All four must pass. A merge is the last checkpoint before this reaches everyone.

3. Fast-forward only:
   ```bash
   git push origin feat/audit-remediation-extended:main
   ```
   Use `--ff-only` semantics — never a merge commit, never a force-push. If it is
   rejected, the branch needs a rebase onto main; rebase, re-run the gate, retry.

4. **Prove the merge landed**, don't assume it:
   ```bash
   git fetch origin
   git rev-parse --short origin/main                       # must equal your branch head
   git ls-remote --heads origin                            # what main actually carries
   ```
   Then say so explicitly in your report with the SHA.

---

## TASK 2 — The 32 uncommitted files in the working tree

`git status` shows 32 dirty paths. **Classify every one before you touch anything** —
some are the owner's own work-in-progress and must NOT be committed or reverted.

Known-good and **already correct as modified** (verified: these are owner WIP; leave the
working tree exactly as it is):
- `extension/manifest.json`
- `server/launch_to_doc.py` (md5 as above)
- `server/routes_extension.py`
- `server/tests/test_launch_to_doc_plan.py` (md5 as above)

The rest are untracked artifacts of the audit itself, and each needs a decision:
- `research/a*.txt` (9 files), `research/s3-h*.json` (9 files), `research/s3-harvest/`,
  `research/security_audit_findings_20260917.json` — audit evidence. **Decide: commit as
  the audit record, or `.gitignore`.** Do not delete them; they are the evidence behind
  findings that were acted on.
- `plans/REMEDIATION-FOLLOWUP-PROMPT.md` — a planning document. `plans/` is **not**
  gitignored, so it can be committed as-is.
- `scripts/apikey_flow_e2e.js`, `scripts/graphify_label.py` — `graphify_label.py` is the
  mandatory third graphify build step (see `docs/GRAPHIFY-TRAVERSAL.md`) and should be
  tracked.
- `maintenance/index.html`, `maintenance/serve.py`, `stitch-design/` — newer additions; ask
  before committing anything large or binary.

**Rule: a clean `git status` is the goal, but "clean" means every path was consciously
decided — committed, ignored with a reason, or left alone and named. Never `git add -A`
over this tree.** Say in your report what you did with each group.

---

## TASK 3 — Close the three "clean" verdicts with enumerable evidence

Three findings were adjudicated clean on an *assertion* rather than a *measurement*. That
was the weakest part of the audit and it should be closed properly, because the repo has
already shipped this exact class once (`routes_organization.py:53` set `role="admin"`
unconditionally).

- **SEC-OPEN-A — IDOR sweep.** The verdict is CLEAN and I corroborated it (my own heuristic
  flagged 13 routes with an id parameter and no ownership guard; all 8 I opened were false
  positives with real guards one line away — `_get_owned_assignment`, `_owned_material_or_404`,
  `AgentFile.user_id == user.id`, `keys.delete_key(db, user, key_id)`). **But the evidence
  was never enumerated.** Produce the actual list: every route taking an id parameter, and
  the guard that protects each, as `file:line`. Then the verdict has proof.
- **SEC-OPEN-B**, **SEC-OPEN-C** — same treatment.

Do not re-raise IDOR without that route list.

---

## TASK 4 — Make the stale-number guard permanent

`scripts/check_stale_numbers.js` exists and passes. This is the **third time** the stale
price class has regrown — `AGENTS.md` records it being fixed twice and returning both times.
A guard script that only runs when someone remembers to run it is not a guard.

- Wire it into CI (`.github/workflows/`) **and** into the pre-commit path if one exists.
- Then prove it can fail: temporarily reintroduce one stale number, confirm the guard
  exits non-zero, revert. A guard never observed failing is decoration.

---

## TASK 5 — Decisions only the owner can make (ask, do not guess)

1. **The paused banner.** The owner asked on 2026-09-17 to keep Helpotron publicly paused.
   It is **not** paused: `helpotron-web.service` is `active` and the public site returns
   **HTTP 200**. Either the owner changed his mind or this was missed. **Ask him.** Do not
   take the site down on your own initiative, and do not silently leave it up either.
2. **`main.py:1582` TODO(owner).** Should `/api/users/{public_id}` ever write another
   user's settings? It currently fails closed (403). Confirm the intended behaviour with
   him rather than picking one.
3. **Rotation items still needing dashboards** (cannot be done from this box): OpenRouter,
   Omniroute, Pangram (⚠️ **Pangram 3 is discontinued 2026-09-30** — the same call then
   costs 10× more, 5¢ → 50¢ per 1k words), Sapling, Winston, the Twilio secret pair, the HF
   token, and the shannon DeepSeek key. Full inventory:
   `maintenance/ROTATION-INVENTORY-20260918.md`.

---

## RULES

1. **Reproduce before you fix.** Never patch a failure you have not observed yourself.
2. **Verify by driving the feature, not by trusting the suite.** A green suite proves the
   code compiles. Start the server and exercise the route.
3. **Do not revert or "clean up" anyone else's edits.** The four owner-WIP files above must
   have byte-identical md5s before and after your work. Check them first and last.
4. **`with_for_update()` is a NO-OP on SQLite.** If you touch money paths, the working
   mechanisms are `BEGIN IMMEDIATE` or a single-statement `UPDATE ... WHERE balance >= ?`.
   `credits.debit_tokens_atomic` exists.
5. **`plan == "elite"` bypasses are a recurring class** — grep for them as routine.
   `credits.is_unmetered()` is operator-only.
6. **Any tier number in a component is a bug on a timer.** Canonical truth is
   `server/credits.py:55-59` (trial 15,000 · testing 10,000 · basic 30,000 · pro 100,000 ·
   elite 270,000; `TOKENS_PER_USD = 10_000`).
7. Use `./.venv/bin/python` — system `python3` lacks `zippy` and silently returns a wrong
   verdict rather than an error.
8. `sudo` is unavailable. `pkill` is denied — use `pgrep` + `kill <pid>`.
9. **Never restart a live service as your verification.** Order:
   `edit → import check → suite → restart → verify endpoint`. A restart against a broken
   file turns a syntax error into a site outage.
10. Report honestly. Work you could not complete is named as incomplete, with the reason.

---

## DELIVERABLE

A report with, per task:

- **TASK 1** — the merge SHA that landed on `origin/main`, and the four gate commands with
  their real output.
- **TASK 2** — every dirty path, what you did with it, and the four owner-WIP md5s
  before and after (they must match).
- **TASK 3** — the enumerable route/guard list with `file:line`.
- **TASK 4** — the CI wiring, plus the proof the guard can fail.
- **TASK 5** — the three decisions, marked as questions if the owner has not answered.

Anything you could not do: say so plainly and say why. Do not report a step as done
without the output that proves it.
