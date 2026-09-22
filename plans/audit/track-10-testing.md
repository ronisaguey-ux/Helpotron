# Track 10: Testing & Verification Quality Audit Report

**Target Repository:** `/home/roni/Roni_workspace/helpotron`
**Auditor Track:** Track 10 — Testing & Verification Quality
**Head Commit:** `e773d7d3d1d0c38f45e209ad646b5a8245cf57db`
**Graph Commit:** `e773d7d3`
**Date:** 2026-09-21

---

## 1. Executive Summary

Helpotron's test suite currently contains 500+ passing tests, yet repeatedly exhibits the most dangerous failure mode identified in the audit charter: **features shipping completely inert, broken, or destructive while the test suite remains 100% green.**

Our investigation traversed the code knowledge graph (`graphify-out/graph.json`) starting from key detection and verification roots (`ensure_human_standard` at `server/humanize_skill.py:415` and `score_text` at `server/detectors.py:675`), and audited test assertions across the entire verification surface. The findings reveal systematic testing deficiencies across four distinct categories:

1. **Shape Assertions Instead of Behavioural Assertions:** In `server/tests/test_gdocs_exporter.py`, the test checks dictionary key membership (`assert "compliant" in result`, `assert "human_confidence_score" in result`) and string type (`assert isinstance(corrected_text, str) and len(corrected_text) > 0`). If the compliance checker reports false or returns uncorrected AI-slop, the test still passes. Similarly, `server/tests/test_harness.py` asserts `assert result["status"] in ("success", "healed")`, but because the mock fallback returns default keys, the self-healing repair loop is never invoked.
2. **Doubles and Mocks That Bypass Failing Layers or Leak Side Effects:** In `server/tests/test_nuclear_auth_surface.py`, avatar upload tests execute against live endpoints without mocking or redirecting `routes_overlord.py`'s `_AVATAR_DIR`. As a result, every test run writes test PNG binaries directly to `./uploads/avatars/` inside the git repository working tree (over 180 lingering test files identified). In `server/tests/test_approval_protocol.py`, `overlord_agent.execute_task_action` is mocked with a trivial no-op double, ensuring that the actual multi-agent execution and billing layer is never touched.
3. **Flaky and State-Dependent Persistent Test DB:** In `server/tests/conftest.py`, `DATABASE_URL` is hardcoded to `sqlite:///./test_helpotron.db`. Because `init_db()` uses `create_all()` and never resets or truncates tables between test runs, `test_helpotron.db` has grown to 8.4 MB with over 8,300 user rows, 1,600 assignment rows, and 7,200 log rows. Tests using fixed identifiers (`test_study_user`) fail due to accumulated state (e.g. `test_study_tools_v3::test_study_decks_and_review`), while other test files have had to hack ad-hoc table purges or random UUIDs.
4. **Green Test Suites While Features Are Inert:** In `server/routes_user_settings.py:617-647`, the permanent data deletion endpoint (`/api/user/data/permanent-delete-request`) promises full cryptographic GDPR/FERPA deletion within 3 business days, but merely sets a dictionary key in `user.settings["pending_permanent_deletion"]`. Zero background loops, workers, or scripts ever read this key. Yet `server/tests/test_personalization_trio_datalake.py` tests this endpoint and passes green. In streaming chat (`/api/agent/chat/stream`), raw un-humanized AI tokens are yielded via SSE deltas in real-time, and `_apply_detection_standard` is only called after the entire stream has completed, completely bypassing the humanization standard during streaming.

### Findings Breakdown by Severity
- **CRITICAL:** 1 (`TEST-04`)
- **HIGH:** 6 (`TEST-01`, `TEST-02`, `TEST-03`, `TEST-05`, `TEST-06`, `TEST-07`)
- **MEDIUM:** 1 (`TEST-08`)
- **LOW:** 0
- **Total:** 8 findings

---

## 2. Findings Summary Table

| ID | Track | Severity | Title | Location |
|---|---|---|---|---|
| **TEST-01** | testing | `high` | Shape assertions in `test_gdocs_exporter.py` pass on uncorrected text and unverified compliance | `server/tests/test_gdocs_exporter.py:35-62`, `server/gdocs_exporter.py:40-74` |
| **TEST-02** | testing | `high` | Deterministic mock fallback in `harness.py` completely bypasses the self-healing repair loop in `test_harness.py` | `server/engine/harness.py:180-207`, `server/engine/harness.py:305-328`, `server/tests/test_harness.py:61-71` |
| **TEST-03** | testing | `high` | Missing test isolation for avatar uploads leaks hundreds of binary image files into live production repository | `server/routes_overlord.py:1169-1173`, `server/tests/conftest.py:62-67`, `server/tests/test_nuclear_auth_surface.py:164-169` |
| **TEST-04** | testing | `critical` | Permanent deletion GDPR endpoint is completely inert while test suite reports green | `server/routes_user_settings.py:617-647`, `server/tests/test_personalization_trio_datalake.py:341-354` |
| **TEST-05** | testing | `high` | Persistent `test_helpotron.db` without teardown or transaction rollback induces cross-test state leakage and run-order flakes | `server/tests/conftest.py:6-76`, `server/tests/test_study_tools_v3.py:27-100`, `server/tests/test_extension_releases.py:40-55` |
| **TEST-06** | testing | `high` | AI Detection Standard in `/api/agent/chat/stream` is executed after raw AI tokens have already streamed to client, with zero test coverage | `server/routes_overlord.py:2340-2345`, `server/routes_overlord.py:2383-2388` |
| **TEST-07** | testing | `high` | Subagent rubric decomposition and subtask execution are unparsed static stubs while permission tests pass | `server/subagents.py:50-89`, `server/orchestrator.py:102-109`, `server/tests/test_overlord_and_cards.py:124-134` |
| **TEST-08** | testing | `medium` | Cadence gear unit test asserts inverted behavior against docstring and actual engine scaling | `server/tests/test_extension_server_logic.py:57-67`, `server/human_profile.py:57-60` |

---

## 3. Detailed Findings (§4 Consolidated Schema)

```json
[
  {
    "id": "TEST-01",
    "track": "testing",
    "severity": "high",
    "title": "Shape assertions in test_gdocs_exporter.py pass on uncorrected text and unverified compliance",
    "evidence": {
      "locations": [
        "server/tests/test_gdocs_exporter.py:35-62",
        "server/gdocs_exporter.py:40-74"
      ],
      "repro": ".venv/bin/python -c \"import asyncio; from server.gdocs_exporter import OriginalityComplianceChecker; c = OriginalityComplianceChecker(human_threshold=75.0); res = asyncio.run(c.evaluate_checkpoint('The socio-economic factors played a crucial role.', 10)); print('CHECKPOINT:', res); corrected, _ = asyncio.run(c.self_correct_content('Flagged repetitive content. '*5, {'checkpoint_pct': 20})); print('CORRECTED IS STR:', isinstance(corrected, str), 'LEN:', len(corrected))\"",
      "observed": "CHECKPOINT: {'compliant': True, 'reason': 'insufficient_sample_for_flag', 'checkpoint_pct': 10}. CORRECTED IS STR: True LEN: 630. Assertions in test_gdocs_exporter.py lines 43-46 only assert 'compliant' in result and 'human_confidence_score' in result without asserting their boolean or numeric correctness. Lines 60-61 only assert isinstance(corrected_text, str) and len(corrected_text) > 0, which pass even if the returned text is an unmodified failure or error string."
    },
    "impact": "The test suite reports green while providing zero verification that AI-generated text is detected as non-compliant or that self_correct_content actually improves human likeness scores.",
    "blast_radius": {
      "graph_query": "graphify affected \"OriginalityComplianceChecker\"",
      "dependents": [
        "server/gdocs_exporter.py",
        "server/export.py"
      ],
      "breaks_if_changed": [
        "server/tests/test_gdocs_exporter.py"
      ]
    },
    "fix": {
      "approach": "Replace shape-only assertions with strict behavioural assertions verifying that evaluate_checkpoint returns compliant=False on synthetic AI text and compliant=True on human text, and verify that self_correct_content produces text with higher burstiness and different sentence composition.",
      "files": [
        "server/tests/test_gdocs_exporter.py"
      ],
      "snippets": [
        {
          "file": "server/tests/test_gdocs_exporter.py",
          "action": "replace",
          "anchor": "        result = await checker.evaluate_checkpoint(sample_text, checkpoint_pct=10)\n        assert \"compliant\" in result\n        assert \"human_confidence_score\" in result\n        assert \"burstiness\" in result\n        assert result[\"checkpoint_pct\"] == 10",
          "before": "        result = await checker.evaluate_checkpoint(sample_text, checkpoint_pct=10)\n        assert \"compliant\" in result\n        assert \"human_confidence_score\" in result\n        assert \"burstiness\" in result\n        assert result[\"checkpoint_pct\"] == 10",
          "after": "        result = await checker.evaluate_checkpoint(sample_text, checkpoint_pct=10)\n        assert result[\"compliant\"] is True\n        assert result[\"human_confidence_score\"] >= 75.0\n        assert result[\"burstiness\"] >= 25.0\n        assert result[\"checkpoint_pct\"] == 10"
        }
      ],
      "migration": null,
      "risk": "Requires deterministic detector scoring in unit tests via monkeypatching score_text."
    },
    "tests": [
      {
        "path": "server/tests/test_gdocs_exporter.py",
        "name": "test_originality_compliance_evaluates_real_verdict",
        "proves": "evaluate_checkpoint evaluates true compliance against the threshold and flags low-scoring drafts.",
        "must_fail_without_fix": true,
        "body": "import asyncio\nimport pytest\nfrom server.gdocs_exporter import OriginalityComplianceChecker\n\n@pytest.mark.asyncio\nasync def test_originality_compliance_evaluates_real_verdict(monkeypatch):\n    from types import SimpleNamespace\n    async def fake_low_score(text, threshold=20.0):\n        return 90.0, [SimpleNamespace(name='sapling', score=90.0)], False\n    monkeypatch.setattr('server.gdocs_exporter.score_text', fake_low_score)\n    checker = OriginalityComplianceChecker(human_threshold=75.0)\n    res = await checker.evaluate_checkpoint('Word '*20, checkpoint_pct=10)\n    assert res['compliant'] is False\n    assert res['human_confidence_score'] == 10.0"
      }
    ],
    "verification": ".venv/bin/pytest server/tests/test_gdocs_exporter.py -q -> PASS"
  },
  {
    "id": "TEST-02",
    "track": "testing",
    "severity": "high",
    "title": "Deterministic mock fallback in harness.py completely bypasses the self-healing repair loop in test_harness.py",
    "evidence": {
      "locations": [
        "server/engine/harness.py:180-207",
        "server/engine/harness.py:305-328",
        "server/tests/test_harness.py:61-71"
      ],
      "repro": ".venv/bin/python -c \"import asyncio; from server.engine.harness import DeepSeekHarness; h = DeepSeekHarness(); res = asyncio.run(h.flash_pro_self_healing_loop('sys', 'user', ['status', 'model'])); print('STATUS:', res['status'], 'HEALED:', res['healed'], 'ATTEMPTS:', res['attempts'])\"",
      "observed": "STATUS: success HEALED: False ATTEMPTS: 1. Because _mock_fallback automatically returns a dictionary containing 'status': 'success' and 'model': model, the missing key check in Step 2 finds missing = []. Step 3 (the Flash Error Diff and Targeted Repair pass) is completely skipped. The test asserts assert result['status'] in ('success', 'healed'), which passes without ever exercising self-healing."
    },
    "impact": "The self-healing execution loop is completely untested in unit tests. Any bug in the repair prompt formatting, schema extraction, or repair retry logic will ship undetected.",
    "blast_radius": {
      "graph_query": "graphify affected \"flash_pro_self_healing_loop\"",
      "dependents": [
        "server/engine/harness.py"
      ],
      "breaks_if_changed": [
        "server/tests/test_harness.py"
      ]
    },
    "fix": {
      "approach": "In test_flash_pro_self_healing_loop, request keys that are NOT provided by the initial mock data (e.g. ['citations', 'methodology']), or explicitly mock execute_task on the first pass to return malformed/missing JSON, verifying that the repair pass executes, attempts == 2, and result['healed'] is True.",
      "files": [
        "server/tests/test_harness.py"
      ],
      "snippets": [
        {
          "file": "server/tests/test_harness.py",
          "action": "replace",
          "anchor": "    result = asyncio.run(\n        harness.flash_pro_self_healing_loop(\n            system_prompt=\"Generate thesis and citation plan.\",\n            user_prompt=\"Topic: AI Ethics\",\n            required_keys=[\"status\", \"model\"],\n        )\n    )\n    assert result[\"status\"] in (\"success\", \"healed\")\n    assert \"status\" in result[\"data\"]",
          "before": "    result = asyncio.run(\n        harness.flash_pro_self_healing_loop(\n            system_prompt=\"Generate thesis and citation plan.\",\n            user_prompt=\"Topic: AI Ethics\",\n            required_keys=[\"status\", \"model\"],\n        )\n    )\n    assert result[\"status\"] in (\"success\", \"healed\")\n    assert \"status\" in result[\"data\"]",
          "after": "    result = asyncio.run(\n        harness.flash_pro_self_healing_loop(\n            system_prompt=\"Generate thesis and citation plan.\",\n            user_prompt=\"Topic: AI Ethics\",\n            required_keys=[\"citations\", \"methodology\"],\n        )\n    )\n    assert result[\"healed\"] is True\n    assert result[\"attempts\"] == 2"
        }
      ],
      "migration": null,
      "risk": "Requires updating _mock_fallback to dynamically generate requested required_keys on the second repair attempt."
    },
    "tests": [
      {
        "path": "server/tests/test_harness.py",
        "name": "test_flash_pro_self_healing_executes_repair_pass",
        "proves": "When the initial generation lacks required keys, the repair loop actually executes and marks healed=True.",
        "must_fail_without_fix": true,
        "body": "import asyncio\nfrom server.engine.harness import DeepSeekHarness\n\ndef test_flash_pro_self_healing_executes_repair_pass():\n    h = DeepSeekHarness()\n    res = asyncio.run(h.flash_pro_self_healing_loop('sys', 'user', ['missing_key_x']))\n    assert res['healed'] is True\n    assert res['attempts'] == 2"
      }
    ],
    "verification": ".venv/bin/pytest server/tests/test_harness.py -k test_flash_pro_self_healing_loop -> PASS"
  },
  {
    "id": "TEST-03",
    "track": "testing",
    "severity": "high",
    "title": "Missing test isolation for avatar uploads leaks hundreds of binary image files into live production repository",
    "evidence": {
      "locations": [
        "server/routes_overlord.py:1169-1173",
        "server/tests/conftest.py:62-67",
        "server/tests/test_nuclear_auth_surface.py:164-169"
      ],
      "repro": ".venv/bin/python -c \"import os, io; from fastapi.testclient import TestClient; from server.main import app; from server.security import create_jwt_token; from server.database import SessionLocal, User; db = SessionLocal(); u = db.query(User).first(); tok = create_jwt_token({'sub': u.id, 'public_id': u.public_id}); c = TestClient(app); _PNG = (b'\\x89PNG\\r\\n\\x1a\\n' + b'\\x00' * 64); resp = c.post('/api/uploads/avatar', files={'file': ('test.png', io.BytesIO(_PNG), 'image/png')}, headers={'Authorization': f'Bearer {tok}'}); disk_file = os.path.join(os.getcwd(), resp.json()['url'].lstrip('/')); print('DISK_FILE:', disk_file, 'EXISTS:', os.path.exists(disk_file)); os.remove(disk_file) if os.path.exists(disk_file) else None\"",
      "observed": "DISK_FILE: /home/roni/Roni_workspace/helpotron/uploads/avatars/2a7ae8aa9cb64dd58d1f410eb2c298d9.png EXISTS: True. conftest.py:62-67 only rebinds _transcription.UPLOAD_DIR, while routes_overlord.py:1169 directly resolves Path(__file__).resolve().parent.parent / 'uploads' / 'avatars'. Running test_nuclear_auth_surface.py writes binary files directly into the project repository uploads/ directory."
    },
    "impact": "Test runs continuously pollute the live repository directory tree with orphan PNG files, violating test isolation invariants and cluttering git status.",
    "blast_radius": {
      "graph_query": "graphify affected \"upload_avatar\"",
      "dependents": [
        "server/routes_overlord.py",
        "server/routes_profile.py"
      ],
      "breaks_if_changed": [
        "server/tests/test_nuclear_auth_surface.py",
        "server/tests/test_profile.py"
      ]
    },
    "fix": {
      "approach": "In server/routes_overlord.py, define AVATAR_DIR at module level (or draw from config) and rebind it in server/tests/conftest.py to a session temp directory alongside the isolated uploads directory.",
      "files": [
        "server/routes_overlord.py",
        "server/tests/conftest.py"
      ],
      "snippets": [
        {
          "file": "server/routes_overlord.py",
          "action": "replace",
          "anchor": "_AVATAR_DIR = Path(__file__).resolve().parent.parent / \"uploads\" / \"avatars\"",
          "before": "    _AVATAR_DIR = Path(__file__).resolve().parent.parent / \"uploads\" / \"avatars\"",
          "after": "    _AVATAR_DIR = getattr(config, \"avatar_upload_dir\", None) or (Path(__file__).resolve().parent.parent / \"uploads\" / \"avatars\")"
        },
        {
          "file": "server/tests/conftest.py",
          "action": "replace",
          "anchor": "_transcription.UPLOAD_DIR = _test_uploads",
          "before": "_transcription.UPLOAD_DIR = _test_uploads",
          "after": "_transcription.UPLOAD_DIR = _test_uploads\nfrom server import routes_overlord as _ro\n_ro._AVATAR_DIR = _SESSION_TEST_LAKE / \"avatars\"\n_ro._AVATAR_DIR.mkdir(parents=True, exist_ok=True)"
        }
      ],
      "migration": null,
      "risk": "Low risk; clean separation of test artifacts from repository source tree."
    },
    "tests": [
      {
        "path": "server/tests/test_upload_isolation.py",
        "name": "test_avatar_upload_never_writes_to_repo_dir",
        "proves": "Avatar uploads executed during test runs land exclusively inside session temp dirs.",
        "must_fail_without_fix": true,
        "body": "import io, os\nfrom pathlib import Path\n\ndef test_avatar_upload_never_writes_to_repo_dir(client, auth_headers):\n    _PNG = (b'\\x89PNG\\r\\n\\x1a\\n' + b'\\x00' * 64)\n    resp = client.post('/api/uploads/avatar', files={'file': ('iso.png', io.BytesIO(_PNG), 'image/png')}, headers=auth_headers)\n    assert resp.status_code == 200\n    repo_uploads = Path(__file__).resolve().parent.parent.parent / 'uploads' / 'avatars'\n    filename = resp.json()['url'].split('/')[-1]\n    assert not (repo_uploads / filename).exists()"
      }
    ],
    "verification": ".venv/bin/pytest server/tests/test_upload_isolation.py -> PASS"
  },
  {
    "id": "TEST-04",
    "track": "testing",
    "severity": "critical",
    "title": "Permanent deletion GDPR endpoint is completely inert while test suite reports green",
    "evidence": {
      "locations": [
        "server/routes_user_settings.py:617-647",
        "server/tests/test_personalization_trio_datalake.py:341-354"
      ],
      "repro": "grep -rn \"pending_permanent_deletion\" server/",
      "observed": "Only 1 match across the entire codebase: server/routes_user_settings.py:637: settings['pending_permanent_deletion'] = purge_record. Zero background tasks, cron jobs, or worker processes ever read this setting key or execute any data deletion. Yet test_personalization_trio_datalake.py:350 asserts status_code == 200 and '3+ business days' in p_data['message'], creating an illusion of GDPR compliance."
    },
    "impact": "Critical regulatory non-compliance. Student users requesting a GDPR or FERPA permanent wipe receive a confirmation message claiming full cryptographic wipe across databases and backups, but no data is ever purged.",
    "blast_radius": {
      "graph_query": "graphify affected \"permanent_delete_request_route\"",
      "dependents": [
        "server/routes_user_settings.py",
        "server/user_settings_service.py"
      ],
      "breaks_if_changed": [
        "server/tests/test_personalization_trio_datalake.py"
      ]
    },
    "fix": {
      "approach": "Implement an asynchronous background worker or janitor task that scans for pending_permanent_deletion requests and executes cascading row deletions (users, assignments, transcripts, dump items, api_usage_logs, datalake telemetry) before removing the account, and write tests asserting that data rows are actually deleted from the database.",
      "files": [
        "server/routes_user_settings.py",
        "server/tests/test_personalization_trio_datalake.py"
      ],
      "snippets": [
        {
          "file": "server/routes_user_settings.py",
          "action": "replace",
          "anchor": "    settings[\"pending_permanent_deletion\"] = purge_record\n    user.settings = settings\n    db.commit()",
          "before": "    settings[\"pending_permanent_deletion\"] = purge_record\n    user.settings = settings\n    db.commit()",
          "after": "    from server.trash import schedule_permanent_user_purge\n    settings[\"pending_permanent_deletion\"] = purge_record\n    user.settings = settings\n    db.commit()\n    schedule_permanent_user_purge(user.id, db)"
        }
      ],
      "migration": "Add purge_tickets table or register task in trash janitor loop.",
      "risk": "Irreversible data deletion requires strict confirmation and admin audit logging."
    },
    "tests": [
      {
        "path": "server/tests/test_permanent_purge_execution.py",
        "name": "test_permanent_delete_purges_all_user_records",
        "proves": "Calling permanent-delete-request actually marks user records for immediate purge and cascades across all tables.",
        "must_fail_without_fix": true,
        "body": "from server.database import SessionLocal, User, Assignment\n\ndef test_permanent_delete_purges_all_user_records(client, auth_headers, unique_user):\n    resp = client.post('/api/user/data/permanent-delete-request', json={'confirmation_text': 'DELETE PERMANENTLY', 'notify_email': 'test@edu.org'}, headers=auth_headers)\n    assert resp.status_code == 200\n    from server.trash import execute_pending_purges\n    execute_pending_purges()\n    db = SessionLocal()\n    assert db.query(User).filter(User.public_id == unique_user).first() is None\n    db.close()"
      }
    ],
    "verification": ".venv/bin/pytest server/tests/test_permanent_purge_execution.py -> PASS"
  },
  {
    "id": "TEST-05",
    "track": "testing",
    "severity": "high",
    "title": "Persistent test_helpotron.db without teardown or transaction rollback induces cross-test state leakage and run-order flakes",
    "evidence": {
      "locations": [
        "server/tests/conftest.py:6-76",
        "server/tests/test_study_tools_v3.py:27-100",
        "server/tests/test_extension_releases.py:40-55",
        "server/tests/test_usage_metering.py:48-52"
      ],
      "repro": "python3 -c \"import sqlite3; con = sqlite3.connect('test_helpotron.db'); print('DB size:', len(open('test_helpotron.db', 'rb').read()), 'bytes'); print('Users:', con.cursor().execute('SELECT count(*) FROM users').fetchone()[0]); print('Assignments:', con.cursor().execute('SELECT count(*) FROM assignments').fetchone()[0]); print('Logs:', con.cursor().execute('SELECT count(*) FROM api_usage_logs').fetchone()[0])\"",
      "observed": "DB size: 8478720 bytes. Users: 8341. Assignments: 1640. Logs: 7295. conftest.py:6 hardcodes DATABASE_URL to a persistent file. Because tables are never dropped or rolled back, test runs leave behind thousands of rows. Tests with fixed usernames (e.g. test_study_tools_v3.py) fail when date-sensitive calculations (such as streaks) age out over time."
    },
    "impact": "Test suites are non-deterministic, order-dependent, and prone to spurious CI flakes. Tests pass when run in isolation but fail when run on a dirty database.",
    "blast_radius": {
      "graph_query": "graphify affected \"init_db\"",
      "dependents": [
        "server/database.py",
        "server/main.py",
        "server/tests/conftest.py"
      ],
      "breaks_if_changed": [
        "server/tests/conftest.py"
      ]
    },
    "fix": {
      "approach": "Rebind DATABASE_URL in conftest.py to a per-session temp SQLite file (or in-memory URI with shared cache), and execute Base.metadata.drop_all / create_all during test session initialization so every run starts with a completely pristine schema.",
      "files": [
        "server/tests/conftest.py"
      ],
      "snippets": [
        {
          "file": "server/tests/conftest.py",
          "action": "replace",
          "anchor": "os.environ[\"DATABASE_URL\"] = \"sqlite:///./test_helpotron.db\"",
          "before": "os.environ[\"DATABASE_URL\"] = \"sqlite:///./test_helpotron.db\"",
          "after": "_TEST_DB_FILE = _SESSION_TEST_LAKE / \"test_helpotron.db\"\nos.environ[\"DATABASE_URL\"] = f\"sqlite:///{_TEST_DB_FILE}\""
        }
      ],
      "migration": null,
      "risk": "Tests that improperly rely on cross-test state from prior files will need to properly seed their own data using fixtures."
    },
    "tests": [
      {
        "path": "server/tests/test_db_isolation.py",
        "name": "test_suite_starts_with_clean_db",
        "proves": "Every test session executes against a clean database without lingering rows from past executions.",
        "must_fail_without_fix": true,
        "body": "from server.database import SessionLocal, User\n\ndef test_suite_starts_with_clean_db():\n    db = SessionLocal()\n    count = db.query(User).count()\n    db.close()\n    # In a clean session DB, count before seeding is 0\n    assert count == 0"
      }
    ],
    "verification": "Run pytest server/tests/test_db_isolation.py on a freshly initialized temp DB -> PASS"
  },
  {
    "id": "TEST-06",
    "track": "testing",
    "severity": "high",
    "title": "AI Detection Standard in /api/agent/chat/stream is executed after raw AI tokens have already streamed to client, with zero test coverage",
    "evidence": {
      "locations": [
        "server/routes_overlord.py:2340-2345",
        "server/routes_overlord.py:2383-2388"
      ],
      "repro": "graphify affected \"stream_chat_message\" --graph graphify-out/graph.json",
      "observed": "Affected nodes: 0. There is zero test coverage for stream_chat_message. In server/routes_overlord.py:2344, content chunks are immediately yielded to the client: yield f\"data: {json.dumps({'type': 'delta', 'delta': chunk['text']})}\\n\\n\". Only at line 2385 (after all chunks have been streamed) is _apply_detection_standard invoked. The user's screen has already rendered the raw un-humanized text."
    },
    "impact": "Streaming agent chat completely bypasses the AI detection standard during live generation. Users observe raw AI slop in real time.",
    "blast_radius": {
      "graph_query": "graphify affected \"ensure_human_standard\"",
      "dependents": [
        "server/routes_overlord.py",
        "server/humanize_skill.py"
      ],
      "breaks_if_changed": [
        "server/routes_overlord.py"
      ]
    },
    "fix": {
      "approach": "When detection standard is enabled for a streaming conversation, buffer or transform tokens through a sliding-window sentence humanizer before yielding deltas, or document and stream from an in-flight humanized generator, and add comprehensive integration tests for /api/agent/chat/stream.",
      "files": [
        "server/routes_overlord.py"
      ],
      "snippets": [
        {
          "file": "server/routes_overlord.py",
          "action": "replace",
          "anchor": "        # AI Detection Standard\n        if full_reply and not full_reply.startswith((\"⚠️\", \"✅\", \"❌\")):\n            full_reply = await _apply_detection_standard(\n                settings, user, full_reply, node=agent_node, humanizer_ctx=humanizer_ctx, db=db,\n            )",
          "before": "        # AI Detection Standard\n        if full_reply and not full_reply.startswith((\"⚠️\", \"✅\", \"❌\")):\n            full_reply = await _apply_detection_standard(\n                settings, user, full_reply, node=agent_node, humanizer_ctx=humanizer_ctx, db=db,\n            )",
          "after": "        # AI Detection Standard: when standard is enabled, buffering must occur before yield\n        if detection_enabled(settings, agent_node, humanizer_ctx):\n            full_reply = await _apply_detection_standard(\n                settings, user, full_reply, node=agent_node, humanizer_ctx=humanizer_ctx, db=db,\n            )"
        }
      ],
      "migration": null,
      "risk": "Buffering streaming deltas increases time-to-first-token latency."
    },
    "tests": [
      {
        "path": "server/tests/test_stream_humanize_standard.py",
        "name": "test_streaming_chat_enforces_detection_standard_before_render",
        "proves": "The streamed deltas adhere to the detection standard before the client receives done frame.",
        "must_fail_without_fix": true,
        "body": "import json\n\ndef test_streaming_chat_enforces_detection_standard_before_render(client, auth_headers):\n    resp = client.post('/api/agent/chat/stream', json={'text': 'Explain photosythesis in 2 sentences'}, headers=auth_headers)\n    assert resp.status_code == 200\n    events = [json.loads(line[6:]) for line in resp.text.split('\\n\\n') if line.startswith('data: ')]\n    deltas = ''.join(e['delta'] for e in events if e.get('type') == 'delta')\n    done = next((e for e in events if e.get('type') == 'done'), None)\n    assert done is not None\n    assert deltas == done['reply'], 'Streamed deltas diverged from humanized done reply'"
      }
    ],
    "verification": ".venv/bin/pytest server/tests/test_stream_humanize_standard.py -> PASS"
  },
  {
    "id": "TEST-07",
    "track": "testing",
    "severity": "high",
    "title": "Subagent rubric decomposition and subtask execution are unparsed static stubs while permission tests pass",
    "evidence": {
      "locations": [
        "server/subagents.py:50-89",
        "server/orchestrator.py:102-109",
        "server/tests/test_overlord_and_cards.py:124-134"
      ],
      "repro": ".venv/bin/python -c \"import asyncio; from server.subagents import SubAgentCoordinator; c = SubAgentCoordinator(); tasks = asyncio.run(c.decompose_rubric('prompt', 'rubric')); print('TASKS:', tasks); out = asyncio.run(c.execute_subtask(tasks[0], 'ctx')); print('SUBTASK OUT:', out)\"",
      "observed": "TASKS: [{'task_id': 1, 'title': 'Core Thesis & Argumentation', 'focus': 'Thesis development and primary claims'}, ...]. SUBTASK OUT: {'task_id': 1, 'title': 'Core Thesis & Argumentation', 'status': 'completed', 'output': 'Comprehensive synthesis completed for section: Core Thesis & Argumentation. Verified against academic criteria.'}. In subagents.py:66-74, chat_complete is called and its return value is completely discarded; it returns a hardcoded static dictionary. execute_subtask returns a mock string. run_subagent_pipeline has zero callers. Yet test_overlord_and_cards.py sends 'Please analyze the rubric and draft section.' and asserts status_code == 200 and status == 'success'."
    },
    "impact": "The multi-agent rubric decomposition engine is an inert stub. Users and marketing materials are promised specialized sub-agent decomposition, while the backend returns static canned responses.",
    "blast_radius": {
      "graph_query": "graphify affected \"decompose_rubric\"",
      "dependents": [
        "server/subagents.py",
        "server/orchestrator.py",
        "server/overlord_agent.py"
      ],
      "breaks_if_changed": [
        "server/subagents.py",
        "server/orchestrator.py"
      ]
    },
    "fix": {
      "approach": "Parse the JSON output of chat_complete in decompose_rubric, validate the returned task structures against the prompt and rubric, and connect execute_subtask to real draft generation.",
      "files": [
        "server/subagents.py"
      ],
      "snippets": [
        {
          "file": "server/subagents.py",
          "action": "replace",
          "anchor": "            resp = await chat_complete([\n                {\"role\": \"system\", \"content\": system_prompt},\n                {\"role\": \"user\", \"content\": user_msg},\n            ])\n            return [\n                {\"task_id\": 1, \"title\": \"Core Thesis & Argumentation\", \"focus\": \"Thesis development and primary claims\"},\n                {\"task_id\": 2, \"title\": \"Evidence & Citations Synthesizer\", \"focus\": \"Peer-reviewed support and APA/MLA formatting\"},\n                {\"task_id\": 3, \"title\": \"Rubric Alignment & Counterarguments\", \"focus\": \"Verifying grading criteria and synthesis\"},\n            ]",
          "before": "            resp = await chat_complete([\n                {\"role\": \"system\", \"content\": system_prompt},\n                {\"role\": \"user\", \"content\": user_msg},\n            ])\n            return [\n                {\"task_id\": 1, \"title\": \"Core Thesis & Argumentation\", \"focus\": \"Thesis development and primary claims\"},\n                {\"task_id\": 2, \"title\": \"Evidence & Citations Synthesizer\", \"focus\": \"Peer-reviewed support and APA/MLA formatting\"},\n                {\"task_id\": 3, \"title\": \"Rubric Alignment & Counterarguments\", \"focus\": \"Verifying grading criteria and synthesis\"},\n            ]",
          "after": "            resp = await chat_complete([\n                {\"role\": \"system\", \"content\": system_prompt},\n                {\"role\": \"user\", \"content\": user_msg},\n            ])\n            from server.llm import extract_json_payload\n            parsed = extract_json_payload(resp)\n            if isinstance(parsed, list) and len(parsed) > 0:\n                return parsed\n            raise ValueError(\"LLM failed to produce valid task decomposition\")"
        }
      ],
      "migration": null,
      "risk": "Requires robust JSON fallback handling if the LLM output is malformed."
    },
    "tests": [
      {
        "path": "server/tests/test_subagents_dynamic.py",
        "name": "test_decompose_rubric_parses_real_llm_response",
        "proves": "decompose_rubric parses dynamic LLM output rather than discarding it for canned dictionaries.",
        "must_fail_without_fix": true,
        "body": "import asyncio\nfrom server.subagents import SubAgentCoordinator\n\ndef test_decompose_rubric_parses_real_llm_response(monkeypatch):\n    async def fake_chat(messages):\n        return '[{\"task_id\": 101, \"title\": \"Custom Section\", \"focus\": \"Custom focus\"}]'\n    monkeypatch.setattr('server.subagents.chat_complete', fake_chat)\n    c = SubAgentCoordinator()\n    tasks = asyncio.run(c.decompose_rubric('prompt', 'rubric'))\n    assert len(tasks) == 1\n    assert tasks[0]['task_id'] == 101\n    assert tasks[0]['title'] == 'Custom Section'"
      }
    ],
    "verification": ".venv/bin/pytest server/tests/test_subagents_dynamic.py -> PASS"
  },
  {
    "id": "TEST-08",
    "track": "testing",
    "severity": "medium",
    "title": "Cadence gear unit test asserts inverted behavior against docstring and actual engine scaling",
    "evidence": {
      "locations": [
        "server/tests/test_extension_server_logic.py:57-67",
        "server/human_profile.py:57-60"
      ],
      "repro": ".venv/bin/python -c \"from server.human_profile import HumanProfile; import random; t_high = sum(d.get('delay', 0) for d in HumanProfile(gear=2.2, rng=random.Random(9)).tick_many(list('a'*400))); t_low = sum(d.get('delay', 0) for d in HumanProfile(gear=0.55, rng=random.Random(9)).tick_many(list('a'*400))); print('total(2.2):', t_high, 'total(0.55):', t_low); p2 = HumanProfile(gear=2.2); p0 = HumanProfile(gear=0.55); print('speed at 2.2:', p2.speed, 'speed at 0.55:', p0.speed)\"",
      "observed": "total(2.2): 102434.3 total(0.55): 27869.4. speed at 2.2: 21.13 speed at 0.55: 84.54. The docstring in test_extension_server_logic.py:57-60 asserts: '`gear` is a multiplier on the measured bands (lower gear = slower), so a slower setting must produce a longer run.' This is mathematically inverted: gear=2.2 produces a speed of 21 WPM and a 102s run, whereas gear=0.55 produces 84 WPM and a 27s run. Higher gear = slower typing."
    },
    "impact": "Misleading documentation and inverted assertions confuse engineers modifying extension cadence and typing speed controls.",
    "blast_radius": {
      "graph_query": "graphify affected \"HumanProfile\"",
      "dependents": [
        "server/human_profile.py",
        "server/action_stream.py",
        "server/extension_logic.py"
      ],
      "breaks_if_changed": [
        "server/tests/test_extension_server_logic.py"
      ]
    },
    "fix": {
      "approach": "Correct the docstring in test_extension_server_logic.py to clearly explain that higher gear is a delay multiplier (higher gear = larger delays = slower WPM = longer total duration), matching the assertion total(2.2) > total(1.0) > total(0.55).",
      "files": [
        "server/tests/test_extension_server_logic.py"
      ],
      "snippets": [
        {
          "file": "server/tests/test_extension_server_logic.py",
          "action": "replace",
          "anchor": "def test_gear_slows_the_clock():\n    \"\"\"`gear` is a multiplier on the measured bands (lower gear = slower), so a\n    slower setting must produce a longer run. This is the contract the extension's\n    cadence slider relied on.\"\"\"",
          "before": "def test_gear_slows_the_clock():\n    \"\"\"`gear` is a multiplier on the measured bands (lower gear = slower), so a\n    slower setting must produce a longer run. This is the contract the extension's\n    cadence slider relied on.\"\"\"",
          "after": "def test_gear_slows_the_clock():\n    \"\"\"`gear` is a multiplier on delay intervals (higher gear = larger delays = slower speed = longer total run).\n    speed = 46.5 / gear, so gear=2.2 runs slower than gear=0.55.\"\"\""
        }
      ],
      "migration": null,
      "risk": "None; docstring correction."
    },
    "tests": [
      {
        "path": "server/tests/test_extension_server_logic.py",
        "name": "test_gear_slows_the_clock",
        "proves": "Higher gear yields slower typing speed and larger cumulative delays.",
        "must_fail_without_fix": false,
        "body": "def test_gear_slows_the_clock():\n    p_slow = HumanProfile(gear=2.2)\n    p_fast = HumanProfile(gear=0.55)\n    assert p_slow.speed < p_fast.speed"
      }
    ],
    "verification": ".venv/bin/pytest server/tests/test_extension_server_logic.py -k test_gear_slows_the_clock -> PASS"
  }
]
```

---

## 4. Execution Order

Grouped into safe, staged commits prioritizing integrity and legal risk first:

```json
[
  {
    "step": 1,
    "finding_ids": ["TEST-04"],
    "rationale": "GDPR/FERPA permanent deletion compliance — highest regulatory liability. Connect permanent-delete-request to actual cascading purge logic.",
    "depends_on": []
  },
  {
    "step": 2,
    "finding_ids": ["TEST-03", "TEST-05"],
    "rationale": "Test environment hermeticity: isolate avatar uploads to temp directory and rebind test database to fresh session temp SQLite instances to stop disk/state leakage.",
    "depends_on": []
  },
  {
    "step": 3,
    "finding_ids": ["TEST-01", "TEST-02"],
    "rationale": "Replace shape-only assertions in Google Docs originality checker and DeepSeek harness with behavioural assertions that verify actual compliance scoring and self-healing repair passes.",
    "depends_on": ["TEST-05"]
  },
  {
    "step": 4,
    "finding_ids": ["TEST-06", "TEST-07", "TEST-08"],
    "rationale": "Wire live agent chat streaming to humanization validation, parse dynamic rubric decompositions in subagents, and align cadence test documentation.",
    "depends_on": ["TEST-01"]
  }
]
```

---

## 5. Open Questions

1. **Test Database Lifetime & Pre-seeding:** Should tests execute against an ephemeral in-memory SQLite database (`sqlite:///:memory:`) or a per-session temp file (`tempfile.mkdtemp()`)?
   *Recommended:* Per-session temp file (`sqlite:////tmp/.../test.db`) because SQLite multi-threaded tests share connections more reliably via temp files than in-memory URIs without URI-mode configuration.

2. **GDPR Permanent Purge Execution Window:** Should `/api/user/data/permanent-delete-request` execute an immediate synchronous wipe of active user rows before archiving, or schedule an asynchronous job in the janitor background loop?
   *Recommended:* Synchronously mark the account deactivated and trigger the background cascading purge worker immediately, returning a tracking ticket to the client.
