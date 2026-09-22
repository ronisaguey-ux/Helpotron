# Helpotron Test Failure Triage Report (TASK-01)

Date: 2026-09-22
Scope: Triage and classification of test failures identified during the Helpotron mega-audit handoff (base commit `e773d7d3d1d0c38f45e209ad646b5a8245cf57db` vs audit remediation branch).

---

## 1. Summary of Results

| Test ID / Path | Status at `e773d7d3` | Status at Remediation HEAD | Classification | Root Cause / Resolution |
|---|---|---|---|---|
| `server/tests/test_security_audit_remediation.py::test_ssrf_rejects_private_and_loopback_ips` | PASS | PASS | Environment / False Alarm | DNS & loopback resolution requires network stack. Passes cleanly in standard test runner. |
| `server/tests/test_security_hardened.py::test_ssrf_allows_safe_external_urls` | PASS | PASS | Environment / False Alarm | External URL probe depends on live network reachability. Passes cleanly. |
| `server/tests/test_shannon_remediation.py::test_ssrf_02_and_04_ip_pinning_and_dns_rebinding_defense` | PASS | PASS | Environment / False Alarm | IP pinning socket simulation passes when run in isolation or full suite. |
| `server/tests/test_shannon_remediation.py::test_ssrf_05_canvas_sync_pagination_origin_and_ssrf_guard` | PASS | PASS | Environment / False Alarm | Canvas sync mock pagination correctly rejects non-origin URLs. Passes cleanly. |
| `server/tests/test_web_search.py::test_live_search_returns_sources_and_a_cost` | PASS | PASS | Environment / Latency | Live HTTP search upstream; takes ~1.5s but returns valid sources and non-zero cost. |
| `server/tests/test_study_tools_v3.py::test_study_decks_and_review` | PASS (clean DB) | PASS | Pre-existing Flake | Persistent SQLite test database (`helpotron.db` / file DB) can accumulate aged `StudySession` rows; passes with fresh test user IDs. |
| `server/tests/test_browser_search_with_math_query_never_intercepted_by_shell` | PASS | PASS | Pre-existing Contract | Deterministic fallback returns empty list when no screen target is detected. Passes. |
| `server/tests/test_scoped_settings.py` (3 tests: `test_scoped_settings_round_trip`, `test_scoped_settings_isolation`, `test_scoped_settings_batch`) | PASS | PASS | Regression (Fixed in `99795ec`) | `REL-01` serialization added `db.expire_all()`, which broke on `FakeDB` test double lacking `expire_all`. Guarded with `if hasattr(db, "expire_all")`. |
| `server/tests/test_extension_agent_chat.py` (2 tests: `test_chat_endpoint_cost_and_deduction`, `test_chat_deduction_overdraw`) | PASS | PASS | Regression (Fixed in `8526ec6`) | `ECON-03` atomic debit modified database row via SQL without mutating caller's in-memory `user.settings["token_balance"]` dict. Added in-memory synchronization in `_charge_tokens`. |

---

## 2. Stale Test Updates (Audited in Step 2)

During the execution of `ECON-04` (removal of Elite bypass) and `ECON-06` (token estimate quantum fix), 2 existing tests failed because they were asserting the defective pre-audit behavior:

1. **`server/tests/test_finalize_practice_test_merge.py::test_finalize_practice_quiz_preserves_quiz_shape`**:
   - **Pre-audit state**: User was configured with `plan="elite"` and `credits=100.0`, with `token_balance=0`. Because `server/routes_dump.py` bypassed Elite users entirely, the gate let it through despite 0 tokens.
   - **Remediation state**: `ECON-04` removed the Elite bypass. The gate correctly rejected the user with `insufficient_tokens`.
   - **Resolution (`099370d`)**: Properly funded the user with `settings={"token_balance": 10000.0}` and documented the historical bypass in the test docstring.

2. **`server/tests/test_economy_v3.py::test_dump_batch_estimate_and_finalize`**:
   - **Pre-audit state**: Line 77 asserted `est_data["total_cost"] >= 0.03`, which pinned the old 100x overstatement (~$0.01 per small item).
   - **Remediation state**: `ECON-06` fixed the estimate to use real model rates ($0.00015/1K in, $0.0006/1K out), resulting in a true cost of ~$0.0015 for 3 small items. The old assertion failed.
   - **Resolution (`099370d`)**: Asserted `est_data["total_cost"] > 0` and `est_data["total_tokens"] >= 3`, asserting against real positive cost without hardcoding an obsolete literal.

---

## 3. Conclusion & Suite Verification

With the regression fixes and stale test updates applied, the entire test suite runs green:
- Total collected: 763 items
- Results: **763 passed, 0 failed**
