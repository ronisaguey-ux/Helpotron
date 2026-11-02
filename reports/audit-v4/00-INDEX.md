# Helpotron Full-Stack Audit Swarm v4 — Index

**Round:** r14 · **Date:** 2026-11-02 · **Coordinator:** claude-worker (Opus 5.5)
**Base:** `300a8b8` · **Merged head on `main`:** `ac99845` (18 commits, all rebased + fast-forwarded, zero conflicts)
**Production:** not mutated, nothing deployed, nothing pushed (`git fetch` to origin returned HTTP 500).

## Verification on merged `main`

| Check | Result |
|:--|:--|
| `cd web && npm run build` | PASS (8.68s) |
| `.venv/bin/python -m pytest tests/ -q` | 32 passed, 1 failed — the **pre-existing** baseline `test_ip_rate_limit_returns_429` |
| `server/tests` (A3, on branch) | 13 failures, all pre-existing on base `300a8b8`; the one regression introduced was fixed in `9fae044` |

## Roster

| Agent | Categories | Branch | Findings | Fixed | Open | Commits | Status |
|:--:|:--|:--|:--:|:--:|:--:|:--:|:--:|
| A1 | 1 Routing · 2 Responsive · 3 A11y | `audit-v4/A1` | 6 | 3 (+1 partial) | 1 | 4 | COMPLETE |
| A2 | 4 Copy · 5 Auth · 6 IDOR | `audit-v4/A2` | 5 | 4 | 0 | 3 | COMPLETE (admin surfaces not audited) |
| A3 | 7 Injection · 8 Secrets/deps · 9 Privacy | `audit-v4/A3` | 7 | 3 | 3 | 4 | COMPLETE |
| A4 | 10 Latency · 11 DB · 12 FE perf | `audit-v4/A4` | 10 | 4 | 5 | 4 | COMPLETE |
| A5 | 13 LLM cost · 14 Infra · 15 Extension | `audit-v4/A5` | 9 | 5 | 3 | 3 | COMPLETE |
| **Total** | 15 categories | 5 branches | **37** | **19 (+1 partial)** | **12** | **18** | |

A2–A5 were killed mid-run by an API rate limit; their incremental logs and commits survived and all four were resumed to completion.

## Highest-impact fixes

- **V4-A3-03 HIGH** — unauthenticated static mount served all of `uploads/` (dumps, agent files, agent memory); now `/uploads/avatars` only (`5450ff2`, `9fae044`).
- **V4-A5-01/02 HIGH** — draft charging race: one charge could yield two drafts; retries could skip the charge; double-click started two paid runs (`d1d1d01`).
- **V4-A5-04 HIGH** — logrotate deleted microcredit submissions after 14 days and wiped monitor history daily (`ac99845`).
- **V4-A2-01/02 HIGH** — password recovery reported false success for 2FA accounts and locked out SMS/email-2FA users; TOTP replay guard added (`843d8ef`, `e2f5239`).

## Open — needs owner action

| ID | Sev | What |
|:--|:--:|:--|
| V4-A3-04 | HIGH | DeepSeek `sk-****` and GitHub `ghp_****` keys remain in git history (`43fdcc7`, `9378a6d`). **Rotate both**, then purge history. |
| V4-A5-06 | HIGH | Server restart mid-draft leaves it pending with 1000 tokens charged and no refund (`server/draft.py:328-331`). |
| V4-A3-01 | MEDIUM | SSRF: sidecar stealth/dynamic modes don't block in-page subrequests to internal hosts (`scrape_sidecar/app.py:293,305-317`). |
| V4-A1-05 | MEDIUM | In-app navigation never updates the URL — reload/share/Back break (`web/src/App.jsx`). |
| V4-A5-07 | MEDIUM | Backups on the same disk as the DB; no offsite copy. |
| — | LOW/INFO | katex advisory, 4 unused npm deps, admin users N+1, 100 MB in-memory upload, api_usage_logs retention, stale systemd unit paths, lazy 121 KB KaTeX chunk. |

## Not reached

- Admin surfaces (`routes_overlord.py`, `admin.py`, `ControlCenterView`, `AdminToolsView`) for privilege escalation.
- No tests exist for password recovery; the new 2FA reset paths are untested.
- Rollback script verified only on a local mock; DB row counts are from a local copy dated Oct 16, not production.

Per-agent logs: `A1.md` … `A5.md`. Machine-readable: `report.json`.
