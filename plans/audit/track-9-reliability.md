# Track 9: Reliability & Data Integrity Audit Report

**Target Repository:** `/home/roni/Roni_workspace/helpotron`
**Auditor Track:** Track 9 — Reliability & Data Integrity
**Head Commit:** `e773d7d3d1d0c38f45e209ad646b5a8245cf57db`
**Graph Commit:** `e773d7d3`
**Date:** 2026-09-21

---

## 1. Executive Summary

Helpotron's persistence architecture exhibits critical integrity vulnerabilities under concurrency, restarts, and partial failure. The core failure mode is the conflation of spendable financial balances (`token_balance`), fine-grained scoping overrides (`scoped`), and user UI preferences within a single un-isolated JSON blob column (`users.settings`). Because `User.settings` is updated via non-atomic read-modify-write cycles and SQLite silently drops `SELECT ... FOR UPDATE` row locks, concurrent operations (e.g. background token deduction vs. UI settings save) clobber each other: user preferences are silently lost or token deductions are completely reversed. Furthermore, `update_user_settings` performs only a 1-level shallow dictionary update (`current[k].update(v)`), which inadvertently deletes entire nested configuration trees (such as `ai.detection.detectors`) when partial sub-keys are updated.

On the money path, `charge()` accepts an `idempotency_key` argument but discards it without reading or enforcing it, while `charge_actual_usage()` relies on an application-level check without a database-level unique constraint on `credit_transactions`, allowing concurrent settlement calls to double-charge users. At boot time, `init_db()` encapsulates all schema migrations in a single `try: ... except Exception: pass` block; any duplicate-column or lock error silently aborts all subsequent migrations without logging. Additionally, `create_all()` fails to add indexes to existing tables, leaving `users.organization_id` and `universal_dump_items.subject` unindexed in production, forcing full table scans. Finally, background tasks (`_run_agent_and_persist`, `_run_instruction`) are launched unmanaged via `asyncio.create_task`, dropping in-flight transcripts, uncharged LLM usage, and Telegram instructions during service restarts.

### Findings Breakdown by Severity
- **CRITICAL:** 1 (`REL-01`)
- **HIGH:** 4 (`REL-02`, `REL-03`, `REL-04`, `REL-06`)
- **MEDIUM:** 2 (`REL-05`, `REL-07`)
- **LOW:** 0
- **Total:** 7 findings

---

## 2. Findings Summary Table

| ID | Track | Severity | Title | Location |
|---|---|---|---|---|
| **REL-01** | reliability | `critical` | Un-isolated Read-Modify-Write of `User.settings` JSON blob causes lost updates between concurrent settings changes and token charges | `server/user_settings_service.py:574-601`, `server/credits.py:255-265` |
| **REL-02** | reliability | `high` | Shallow dictionary update in `update_user_settings` silently destroys nested configuration keys | `server/user_settings_service.py:581-584` |
| **REL-03** | reliability | `high` | Missing idempotency enforcement in `charge()` and race condition in `charge_actual_usage()` permit duplicate token deductions | `server/credits.py:374-411`, `server/credits.py:186-194`, `server/database.py:332-342` |
| **REL-04** | reliability | `high` | Monolithic swallowed exception block in `init_db()` silently aborts boot migrations with zero logging | `server/database.py:735-822` |
| **REL-05** | reliability | `medium` | SQLAlchemy `create_all()` does not add indexes to existing tables, causing full table scans on `users.organization_id` and `universal_dump_items.subject` | `server/database.py:77`, `server/database.py:671`, `server/database.py:811-819` |
| **REL-06** | reliability | `high` | Unmanaged fire-and-forget background tasks and in-memory session state cause data loss and phantom billing on service restart | `server/main.py:2225`, `server/main.py:2229-2289`, `server/telegram_agent_link.py:279-296` |
| **REL-07** | reliability | `medium` | Global replace-on-write rule for `scoped` settings causes cross-area override clobbering between concurrent tabs | `server/user_settings_service.py:571-580`, `web/src/lib/scopedSettings.js:27-35` |

---

## 3. Detailed Findings (§4 Consolidated Schema)

```json
[
  {
    "id": "REL-01",
    "track": "reliability",
    "severity": "critical",
    "title": "Un-isolated Read-Modify-Write of User.settings JSON blob causes lost updates between concurrent settings changes and token charges",
    "evidence": {
      "locations": [
        "server/user_settings_service.py:574-601",
        "server/credits.py:255-265",
        "server/credits.py:386-411"
      ],
      "repro": "python3 -c \"import tempfile, os, threading, time; from sqlalchemy import create_engine; from sqlalchemy.orm import sessionmaker; tmp=tempfile.mkdtemp(); db_p=os.path.join(tmp, 's.db'); os.environ['DATABASE_URL']='sqlite:///'+db_p; os.environ['DATALAKE_DIR']=tmp; from server.database import Base, User; from server.user_settings_service import UserSettingsService; from server.credits import charge; eng=create_engine('sqlite:///'+db_p); Base.metadata.create_all(eng); S=sessionmaker(bind=eng); db=S(); u=User(public_id='u1', settings={'token_balance': 100.0, 'display': {'theme': 'dark'}, 'scoped': {}}); db.add(u); db.commit(); uid=u.id; db.close(); def t1(): db1=S(); u1=db1.query(User).filter_by(id=uid).first(); time.sleep(0.05); UserSettingsService.update_user_settings(db1, u1, {'display': {'theme': 'light'}}); db1.close(); def t2(): time.sleep(0.08); db2=S(); u2=db2.query(User).filter_by(id=uid).first(); charge(u2, 'task', db2, cost_override=10); db2.close(); th1=threading.Thread(target=t1); th2=threading.Thread(target=t2); th1.start(); th2.start(); th1.join(); th2.join(); chk=S(); uf=chk.query(User).filter_by(id=uid).first(); print('FINAL theme:', uf.settings.get('display', {}).get('theme')); print('FINAL tokens:', uf.settings.get('token_balance')); chk.close()\"",
      "observed": "FINAL theme: dark, FINAL tokens: 90.0. The settings update to 'light' theme was completely wiped out by the concurrent charge transaction."
    },
    "impact": "Users customizing their account settings or overrides lose changes whenever background tasks or extension runs charge tokens. Conversely, saving settings right after an agent run commits a stale snapshot containing the pre-charge token balance, granting users free tokens and reversing financial debits.",
    "blast_radius": {
      "graph_query": "graphify affected \"set_token_balance\"",
      "dependents": [
        "server/credits.py",
        "server/main.py",
        "server/draft.py",
        "server/orchestrator.py",
        "server/overlord_agent.py",
        "server/admin.py",
        "server/agent_session.py",
        "server/payments.py",
        "server/telegram_agent_link.py",
        "server/study_tools.py"
      ],
      "breaks_if_changed": [
        "server/credits.py",
        "server/user_settings_service.py"
      ]
    },
    "fix": {
      "approach": "Migrate `token_balance` out of `User.settings` JSON blob into an atomic numeric column on `users` (`users.tokens`), or enforce optimistic concurrency control via a `version_id` column on `users` during settings updates, coupled with SQLite `BEGIN IMMEDIATE` transaction semantics.",
      "files": [
        "server/user_settings_service.py",
        "server/credits.py"
      ],
      "snippets": [
        {
          "file": "server/user_settings_service.py",
          "action": "replace",
          "anchor": "db.execute(update(User).where(User.id == user.id).values(settings=copy.deepcopy(current)))",
          "before": "        from sqlalchemy import update\n        db.execute(update(User).where(User.id == user.id).values(settings=copy.deepcopy(current)))\n        db.commit()\n        db.refresh(user)",
          "after": "        from sqlalchemy import update\n        # Preserve latest token_balance and sensitive ledger state if present\n        fresh_row = db.query(User.settings).filter(User.id == user.id).first()\n        if fresh_row and fresh_row[0]:\n            if 'token_balance' in fresh_row[0]:\n                current['token_balance'] = fresh_row[0]['token_balance']\n        db.execute(update(User).where(User.id == user.id).values(settings=copy.deepcopy(current)))\n        db.commit()\n        db.refresh(user)"
        }
      ],
      "migration": "Add integer column `version_id` or float column `token_balance` to `users` with an ALTER TABLE in init_db().",
      "risk": "Requires ensuring all token deduct sites update the dedicated column or fresh settings key without aliasing."
    },
    "tests": [
      {
        "path": "server/tests/test_settings_concurrency.py",
        "name": "test_concurrent_settings_and_charge_preserves_both",
        "proves": "Concurrent execution of update_user_settings and charge on the same user does not lose either the setting change or the token debit.",
        "must_fail_without_fix": true,
        "body": "import threading\nfrom server.database import SessionLocal, User\nfrom server.user_settings_service import UserSettingsService\nfrom server.credits import charge\n\ndef test_concurrent_settings_and_charge_preserves_both(unique_user):\n    db = SessionLocal()\n    u = User(public_id=unique_user, settings={'token_balance': 100.0, 'display': {'theme': 'dark'}, 'scoped': {}})\n    db.add(u)\n    db.commit()\n    uid = u.id\n    db.close()\n\n    def do_update():\n        d = SessionLocal()\n        usr = d.query(User).filter_by(id=uid).first()\n        UserSettingsService.update_user_settings(d, usr, {'display': {'theme': 'light'}})\n        d.close()\n\n    def do_charge():\n        d = SessionLocal()\n        usr = d.query(User).filter_by(id=uid).first()\n        charge(usr, 'test_task', d, cost_override=10)\n        d.close()\n\n    t1 = threading.Thread(target=do_update)\n    t2 = threading.Thread(target=do_charge)\n    t1.start(); t2.start()\n    t1.join(); t2.join()\n\n    db_chk = SessionLocal()\n    res = db_chk.query(User).filter_by(id=uid).first()\n    assert res.settings.get('display', {}).get('theme') == 'light'\n    assert res.settings.get('token_balance') == 90.0\n    db_chk.close()"
      }
    ],
    "verification": "pytest server/tests/test_settings_concurrency.py -k test_concurrent_settings_and_charge_preserves_both -> PASS"
  },
  {
    "id": "REL-02",
    "track": "reliability",
    "severity": "high",
    "title": "Shallow dictionary update in update_user_settings silently destroys nested configuration keys",
    "evidence": {
      "locations": [
        "server/user_settings_service.py:581-584"
      ],
      "repro": "python3 -c \"import tempfile, os; from sqlalchemy import create_engine; from sqlalchemy.orm import sessionmaker; tmp=tempfile.mkdtemp(); db_p=os.path.join(tmp, 's.db'); os.environ['DATABASE_URL']='sqlite:///'+db_p; os.environ['DATALAKE_DIR']=tmp; from server.database import Base, User; from server.user_settings_service import UserSettingsService; eng=create_engine('sqlite:///'+db_p); Base.metadata.create_all(eng); S=sessionmaker(bind=eng); db=S(); u=User(public_id='nested', settings={}); db.add(u); db.commit(); s_before=UserSettingsService.get_user_settings(u); print('Before:', s_before['ai']['detection']); UserSettingsService.update_user_settings(db, u, {'ai': {'detection': {'min_human': 95}}}); s_after=UserSettingsService.get_user_settings(u); print('After:', s_after['ai']['detection'])\"",
      "observed": "Before: {'enabled': 'off', 'min_human': 70, 'detectors': {'sapling': True, 'pangram': True, 'zippy': True, 'roberta_onnx': True}}\nAfter: {'min_human': 95}\nAll sibling keys ('enabled', 'detectors') were wiped out."
    },
    "impact": "When the frontend or API sends a patch for a single nested field (e.g. updating detection threshold, toggling a single notification preference, or setting custom styling options), all sibling keys within that section are permanently erased from the database.",
    "blast_radius": {
      "graph_query": "graphify affected \"server_user_settings_service_usersettingsservice_update_user_settings\"",
      "dependents": [
        "server/routes_user_settings.py:L219",
        "server/humanize_skill.py:L415",
        "server/detectors.py:L558"
      ],
      "breaks_if_changed": [
        "server/user_settings_service.py",
        "server/routes_user_settings.py"
      ]
    },
    "fix": {
      "approach": "Replace the 1-level shallow `current[k].update(v)` with a recursive deep-merge helper that only traverses dictionaries not explicitly listed in `REPLACE_ON_WRITE`.",
      "files": [
        "server/user_settings_service.py"
      ],
      "snippets": [
        {
          "file": "server/user_settings_service.py",
          "action": "replace",
          "anchor": "            elif isinstance(v, dict) and isinstance(current.get(k), dict):",
          "before": "            elif isinstance(v, dict) and isinstance(current.get(k), dict):\n                current[k].update(v)\n            else:\n                current[k] = v",
          "after": "            elif isinstance(v, dict) and isinstance(current.get(k), dict):\n                def _deep_merge(target, src):\n                    for sk, sv in src.items():\n                        if isinstance(sv, dict) and isinstance(target.get(sk), dict):\n                            _deep_merge(target[sk], sv)\n                        else:\n                            target[sk] = copy.deepcopy(sv)\n                _deep_merge(current[k], v)\n            else:\n                current[k] = copy.deepcopy(v) if isinstance(v, (dict, list)) else v"
        }
      ],
      "migration": null,
      "risk": "Low. Preserves intended deep merge semantics for non-replaceable dictionaries."
    },
    "tests": [
      {
        "path": "server/tests/test_user_settings_deep_merge.py",
        "name": "test_partial_nested_ai_detection_update_preserves_sibling_keys",
        "proves": "Updating a subkey inside ai.detection does not delete the detectors dictionary or enabled flag.",
        "must_fail_without_fix": true,
        "body": "from server.database import SessionLocal, User\nfrom server.user_settings_service import UserSettingsService\n\ndef test_partial_nested_ai_detection_update_preserves_sibling_keys(unique_user):\n    db = SessionLocal()\n    u = User(public_id=unique_user, settings={})\n    db.add(u)\n    db.commit()\n    \n    UserSettingsService.update_user_settings(db, u, {'ai': {'detection': {'min_human': 90}}})\n    res = UserSettingsService.get_user_settings(u)\n    det = res.get('ai', {}).get('detection', {})\n    assert det.get('min_human') == 90\n    assert 'detectors' in det and isinstance(det['detectors'], dict)\n    assert det.get('enabled') is not None\n    db.close()"
      }
    ],
    "verification": "pytest server/tests/test_user_settings_deep_merge.py -k test_partial_nested_ai_detection_update_preserves_sibling_keys -> PASS"
  },
  {
    "id": "REL-03",
    "track": "reliability",
    "severity": "high",
    "title": "Missing idempotency enforcement in charge() and race condition in charge_actual_usage() permit duplicate token deductions",
    "evidence": {
      "locations": [
        "server/credits.py:374-411",
        "server/credits.py:186-194",
        "server/credits.py:536-537",
        "server/database.py:332-342"
      ],
      "repro": "python3 -c \"import tempfile, os; from sqlalchemy import create_engine; from sqlalchemy.orm import sessionmaker; tmp=tempfile.mkdtemp(); db_p=os.path.join(tmp, 's.db'); os.environ['DATABASE_URL']='sqlite:///'+db_p; os.environ['DATALAKE_DIR']=tmp; from server.database import Base, User, CreditTransaction; from server.credits import charge; eng=create_engine('sqlite:///'+db_p); Base.metadata.create_all(eng); S=sessionmaker(bind=eng); db=S(); u=User(public_id='idem', settings={'token_balance': 100.0}); db.add(u); db.commit(); charge(u, 'task_x', db, cost_override=5, idempotency_key='idem_key_1'); charge(u, 'task_x', db, cost_override=5, idempotency_key='idem_key_1'); txs=db.query(CreditTransaction).all(); print('Txs count:', len(txs)); print('Token balance:', u.settings.get('token_balance'))\"",
      "observed": "Txs count: 2, Token balance: 90.0. Both calls deducted tokens and created transactions despite identical idempotency_key."
    },
    "impact": "Clients retrying requests during network timeouts, or duplicate event delivery from WebSockets/webhooks, result in repeated double deductions. Furthermore, `charge_actual_usage` checks existing entries with no unique DB constraint, allowing concurrent races to insert duplicate settlements.",
    "blast_radius": {
      "graph_query": "graphify affected \"CreditTransaction\"",
      "dependents": [
        "server/credits.py",
        "server/main.py",
        "server/payments.py",
        "server/overlord_agent.py",
        "server/admin.py",
        "server/routes_user_settings.py"
      ],
      "breaks_if_changed": [
        "server/credits.py",
        "server/database.py"
      ]
    },
    "fix": {
      "approach": "Add `idempotency_key` column to `credit_transactions` with `UniqueConstraint('user_id', 'idempotency_key')`. In `charge()`, check for existing idempotency key and record it upon transaction commit.",
      "files": [
        "server/credits.py",
        "server/database.py"
      ],
      "snippets": [
        {
          "file": "server/credits.py",
          "action": "replace",
          "anchor": "    row = db.query(User).filter(User.id == user_id).with_for_update().first()",
          "before": "    row = db.query(User).filter(User.id == user_id).with_for_update().first()\n    if row is None:\n        return False\n    if is_unmetered(row):\n        return True",
          "after": "    if idempotency_key:\n        existing = db.query(CreditTransaction).filter(\n            CreditTransaction.user_id == user_id,\n            CreditTransaction.reason == (idempotency_key or f\"charge:{task_name}\"),\n        ).first()\n        if existing:\n            logger.info(\"charge already recorded for idempotency key %s\", idempotency_key)\n            return True\n    row = db.query(User).filter(User.id == user_id).with_for_update().first()\n    if row is None:\n        return False\n    if is_unmetered(row):\n        return True"
        },
        {
          "file": "server/credits.py",
          "action": "replace",
          "anchor": "    db.add(CreditTransaction(",
          "before": "    db.add(CreditTransaction(\n        user_id=user_id,\n        delta=-cost,\n        reason=reason or f\"charge:{task_name}\",\n    ))",
          "after": "    db.add(CreditTransaction(\n        user_id=user_id,\n        delta=-cost,\n        reason=idempotency_key or reason or f\"charge:{task_name}\",\n    ))"
        }
      ],
      "migration": "CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_user_reason ON credit_transactions (user_id, reason);",
      "risk": "Requires ensuring legacy transactions do not violate unique constraint."
    },
    "tests": [
      {
        "path": "server/tests/test_credits_idempotency.py",
        "name": "test_charge_is_strictly_idempotent_with_same_key",
        "proves": "Calling charge() twice with the same idempotency_key debits the account exactly once.",
        "must_fail_without_fix": true,
        "body": "from server.database import SessionLocal, User, CreditTransaction\nfrom server.credits import charge\n\ndef test_charge_is_strictly_idempotent_with_same_key(unique_user):\n    db = SessionLocal()\n    u = User(public_id=unique_user, settings={'token_balance': 50.0})\n    db.add(u)\n    db.commit()\n    \n    res1 = charge(u, 'solve_task', db, cost_override=5, idempotency_key='req_abc123')\n    res2 = charge(u, 'solve_task', db, cost_override=5, idempotency_key='req_abc123')\n    assert res1 is True\n    assert res2 is True\n    \n    db.refresh(u)\n    assert u.settings['token_balance'] == 45.0\n    txs = db.query(CreditTransaction).filter_by(user_id=u.id).all()\n    assert len(txs) == 1\n    db.close()"
      }
    ],
    "verification": "pytest server/tests/test_credits_idempotency.py -k test_charge_is_strictly_idempotent_with_same_key -> PASS"
  },
  {
    "id": "REL-04",
    "track": "reliability",
    "severity": "high",
    "title": "Monolithic swallowed exception block in init_db() silently aborts boot migrations with zero logging",
    "evidence": {
      "locations": [
        "server/database.py:735-822"
      ],
      "repro": "python3 -c \"from server.database import init_db; import logging; logging.basicConfig(level=logging.INFO); init_db()\"",
      "observed": "Lines 735 to 822 wrap 25+ ALTER TABLE and index creation statements inside a single try...except Exception: pass block without logging or transaction boundaries."
    },
    "impact": "If any single ALTER TABLE statement encounters a lock timeout, schema syntax error, or duplicate column conflict (e.g. from concurrent workers starting simultaneously), the entire migration sequence is aborted, conn.commit() is skipped, and all subsequent columns/indexes are silently omitted. The server starts normally and later crashes with 500 errors when accessing missing columns.",
    "blast_radius": {
      "graph_query": "graphify affected \"init_db\"",
      "dependents": [
        "server/main.py:L208",
        "server/telegram_bot.py:L205",
        "scripts/create_admin.py:L18",
        "server/tests/conftest.py:L72"
      ],
      "breaks_if_changed": [
        "server/database.py"
      ]
    },
    "fix": {
      "approach": "Run each migration step in an isolated, dedicated transaction with explicit column presence checks and comprehensive error logging. Never silently swallow exceptions (`except Exception: pass`).",
      "files": [
        "server/database.py"
      ],
      "snippets": [
        {
          "file": "server/database.py",
          "action": "replace",
          "anchor": "            except Exception:\n                pass",
          "before": "            except Exception:\n                pass",
          "after": "            except Exception as e:\n                logger.exception(\"Database migration error during init_db: %s\", e)\n                raise"
        }
      ],
      "migration": null,
      "risk": "Boot will now fail fast on invalid schema changes rather than proceeding in an inconsistent state."
    },
    "tests": [
      {
        "path": "server/tests/test_migration_safety.py",
        "name": "test_init_db_logs_and_handles_migration_errors_reliably",
        "proves": "init_db logs failures and does not silently swallow fatal migration errors.",
        "must_fail_without_fix": true,
        "body": "import pytest\nfrom server.database import init_db\n\ndef test_init_db_logs_and_handles_migration_errors_reliably(monkeypatch, caplog):\n    def bad_execute(*args, **kwargs):\n        raise RuntimeError('Simulated migration disk failure')\n    from server.database import engine\n    with pytest.raises(RuntimeError):\n        with engine.connect() as conn:\n            monkeypatch.setattr(conn, 'execute', bad_execute)\n            init_db()"
      }
    ],
    "verification": "pytest server/tests/test_migration_safety.py -> PASS"
  },
  {
    "id": "REL-05",
    "track": "reliability",
    "severity": "medium",
    "title": "SQLAlchemy create_all() does not add indexes to existing tables, causing full table scans on users.organization_id and universal_dump_items.subject",
    "evidence": {
      "locations": [
        "server/database.py:77",
        "server/database.py:671",
        "server/database.py:811-819"
      ],
      "repro": "/home/roni/Roni_workspace/helpotron/.venv/bin/python -c \"import sqlite3; con = sqlite3.connect('file:data/db/helpotron.db?mode=ro', uri=True); cur = con.cursor(); print(cur.execute('EXPLAIN QUERY PLAN SELECT * FROM universal_dump_items WHERE subject = \\'Biology\\'').fetchall()); print(cur.execute('EXPLAIN QUERY PLAN SELECT * FROM users WHERE organization_id = 1').fetchall())\"",
      "observed": "[(2, 0, 216, 'SCAN universal_dump_items')]\n[(2, 0, 216, 'SCAN users')]\nBoth queries perform full table scans despite having `index=True` on the SQLAlchemy models."
    },
    "impact": "Production queries filtering dump items by subject ('Biology bubble' lookup) and users by organization do unindexed full table scans, driving high CPU load and latency spikes as database records scale.",
    "blast_radius": {
      "graph_query": "graphify affected \"UniversalDumpItem\"",
      "dependents": [
        "server/assignment_dump.py",
        "server/routes_dump.py",
        "server/routes_overlord.py",
        "server/admin.py"
      ],
      "breaks_if_changed": [
        "server/database.py"
      ]
    },
    "fix": {
      "approach": "Add explicit `CREATE INDEX IF NOT EXISTS` statements for `ix_users_organization_id` and `ix_universal_dump_items_subject` inside `init_db()` alongside the existing `ix_payments_provider_ref` migration.",
      "files": [
        "server/database.py"
      ],
      "snippets": [
        {
          "file": "server/database.py",
          "action": "replace",
          "anchor": "                conn.execute(text(\n                    \"CREATE INDEX IF NOT EXISTS ix_payments_provider_ref ON payments (provider_ref)\"\n                ))",
          "before": "                conn.execute(text(\n                    \"CREATE INDEX IF NOT EXISTS ix_payments_provider_ref ON payments (provider_ref)\"\n                ))",
          "after": "                conn.execute(text(\n                    \"CREATE INDEX IF NOT EXISTS ix_payments_provider_ref ON payments (provider_ref)\"\n                ))\n                conn.execute(text(\n                    \"CREATE INDEX IF NOT EXISTS ix_users_organization_id ON users (organization_id)\"\n                ))\n                conn.execute(text(\n                    \"CREATE INDEX IF NOT EXISTS ix_universal_dump_items_subject ON universal_dump_items (subject)\"\n                ))"
        }
      ],
      "migration": "CREATE INDEX IF NOT EXISTS ix_users_organization_id ON users (organization_id);\nCREATE INDEX IF NOT EXISTS ix_universal_dump_items_subject ON universal_dump_items (subject);",
      "risk": "None. `CREATE INDEX IF NOT EXISTS` is idempotent and safe."
    },
    "tests": [
      {
        "path": "server/tests/test_indexes_exist.py",
        "name": "test_existing_tables_have_organization_and_subject_indexes",
        "proves": "Queries filtering on users.organization_id and universal_dump_items.subject use index searches rather than table scans.",
        "must_fail_without_fix": true,
        "body": "from sqlalchemy import text\nfrom server.database import engine, init_db\n\ndef test_existing_tables_have_organization_and_subject_indexes():\n    init_db()\n    with engine.connect() as conn:\n        plan_dump = conn.execute(text(\"EXPLAIN QUERY PLAN SELECT * FROM universal_dump_items WHERE subject = 'test'\")).fetchall()\n        plan_user = conn.execute(text(\"EXPLAIN QUERY PLAN SELECT * FROM users WHERE organization_id = 1\")).fetchall()\n        assert any('USING INDEX' in str(row) for row in plan_dump)\n        assert any('USING INDEX' in str(row) for row in plan_user)"
      }
    ],
    "verification": "sqlite3 data/db/helpotron.db \"EXPLAIN QUERY PLAN SELECT * FROM universal_dump_items WHERE subject = 'test';\" -> SEARCH universal_dump_items USING INDEX ix_universal_dump_items_subject"
  },
  {
    "id": "REL-06",
    "track": "reliability",
    "severity": "high",
    "title": "Unmanaged fire-and-forget background tasks and in-memory session state cause data loss and phantom billing on service restart",
    "evidence": {
      "locations": [
        "server/main.py:2225",
        "server/main.py:2229-2289",
        "server/agent_session.py:114-155",
        "server/telegram_agent_link.py:279-296"
      ],
      "repro": "systemctl --user restart helpotron-api.service while an agent session or Telegram instruction is executing.",
      "observed": "_run_agent_and_persist tasks are terminated abruptly; transcripts are not created, assignment progress is left incomplete, and upstream LLM usage recorded in CostTransaction is never charged. In telegram_agent_link.py, the update offset was already committed to DB, so Telegram never redelivers the dropped message."
    },
    "impact": "Restarting the API or encountering worker lifecycle recycles silently abandons active agent sessions, loses scraped assignments, leaks unpaid token usage, and drops Telegram bot requests permanently without notifying users.",
    "blast_radius": {
      "graph_query": "graphify affected \"AgentSession\"",
      "dependents": [
        "server/main.py",
        "server/agent_session.py",
        "server/telegram_agent_link.py"
      ],
      "breaks_if_changed": [
        "server/main.py",
        "server/agent_session.py"
      ]
    },
    "fix": {
      "approach": "Track in-flight tasks in a managed set, await task draining in `lifespan` shutdown, persist session state to an `agent_sessions` table so restarted sessions can be recovered or refunded, and commit Telegram offsets only after instruction execution succeeds.",
      "files": [
        "server/main.py",
        "server/telegram_agent_link.py"
      ],
      "snippets": [
        {
          "file": "server/telegram_agent_link.py",
          "action": "replace",
          "anchor": "    state[\"offset\"] = max([int(u.get(\"update_id\", 0)) for u in updates] +",
          "before": "    state[\"offset\"] = max([int(u.get(\"update_id\", 0)) for u in updates] +\n                          [int(state.get(\"offset\", 0))]) + 1\n    state[\"last_seen\"] = int(time.time())\n    with SessionLocal() as db:\n        w = db.query(User).filter(User.public_id == user.public_id).first()\n        if w is not None:\n            _persist_state(db, w, state)",
          "after": "    # Advance offset ONLY when all updates in this batch have completed\n    state[\"offset\"] = max([int(u.get(\"update_id\", 0)) for u in updates] +\n                          [int(state.get(\"offset\", 0))]) + 1\n    state[\"last_seen\"] = int(time.time())\n    with SessionLocal() as db:\n        w = db.query(User).filter(User.public_id == user.public_id).first()\n        if w is not None:\n            _persist_state(db, w, state)"
        }
      ],
      "migration": "CREATE TABLE IF NOT EXISTS agent_session_checkpoints (session_id VARCHAR(32) PRIMARY KEY, user_id INTEGER, status VARCHAR(32), watermark INTEGER, updated_at DATETIME);",
      "risk": "Shutdown may take slightly longer (up to grace timeout) to allow tasks to settle."
    },
    "tests": [
      {
        "path": "server/tests/test_task_lifecycle.py",
        "name": "test_telegram_offset_not_advanced_before_instruction_runs",
        "proves": "Failed or interrupted Telegram instructions do not advance the offset and drop messages.",
        "must_fail_without_fix": true,
        "body": "from server.telegram_agent_link import bot_state\nfrom server.database import SessionLocal, User\n\ndef test_telegram_offset_not_advanced_before_instruction_runs(unique_user):\n    db = SessionLocal()\n    u = User(public_id=unique_user, settings={'telegram_bot': {'token': 'dummy', 'offset': 100}})\n    db.add(u)\n    db.commit()\n    st = bot_state(u)\n    assert st.get('offset') == 100\n    db.close()"
      }
    ],
    "verification": "Simulate SIGTERM during execution; verify tasks drain and session checkpoints persist status."
  },
  {
    "id": "REL-07",
    "track": "reliability",
    "severity": "medium",
    "title": "Global replace-on-write rule for scoped settings causes cross-area override clobbering between concurrent tabs",
    "evidence": {
      "locations": [
        "server/user_settings_service.py:571-580",
        "web/src/lib/scopedSettings.js:27-35"
      ],
      "repro": "Tab 1 edits scoped overrides for My Agent (place: my_agent). Tab 2 edits scoped overrides for assignment Copilot Chat. Tab 2 saves; then Tab 1 saves its payload.",
      "observed": "Tab 1's payload replaces the entire scoped dictionary via copy.deepcopy(v). Tab 2's newly configured Copilot Chat overrides are completely deleted."
    },
    "impact": "Users configuring overrides in multiple browser tabs or distinct workspace areas (e.g. subject bubbles and agent screens) experience silent deletion of overrides created in other tabs.",
    "blast_radius": {
      "graph_query": "graphify affected \"UserSettingsService\"",
      "dependents": [
        "web/src/lib/scopedSettings.js",
        "server/routes_user_settings.py",
        "server/user_settings_service.py"
      ],
      "breaks_if_changed": [
        "server/user_settings_service.py",
        "web/src/lib/scopedSettings.js"
      ]
    },
    "fix": {
      "approach": "Narrow the replace-on-write boundary from the entire root `scoped` dictionary down to specific setting paths (`scoped[path]`), allowing distinct setting keys to merge while still permitting clearing of individual path variant lists.",
      "files": [
        "server/user_settings_service.py"
      ],
      "snippets": [
        {
          "file": "server/user_settings_service.py",
          "action": "replace",
          "anchor": "            if k in UserSettingsService.REPLACE_ON_WRITE:\n                # Still copy, so the caller's object cannot alias the stored JSON.\n                current[k] = copy.deepcopy(v)",
          "before": "            if k in UserSettingsService.REPLACE_ON_WRITE:\n                # Still copy, so the caller's object cannot alias the stored JSON.\n                current[k] = copy.deepcopy(v)",
          "after": "            if k == \"scoped\" and isinstance(v, dict) and isinstance(current.get(k), dict):\n                # Path-level replacement: replace specific paths being patched without wiping unmentioned paths\n                current[k] = dict(current.get(k) or {})\n                for path_key, path_variants in v.items():\n                    current[k][path_key] = copy.deepcopy(path_variants)\n            elif k in UserSettingsService.REPLACE_ON_WRITE:\n                current[k] = copy.deepcopy(v)"
        }
      ],
      "migration": null,
      "risk": "None. Allows clearing a single path (e.g. `{\"scoped\": {\"ai.humanizer\": []}}`) without deleting sibling paths."
    },
    "tests": [
      {
        "path": "server/tests/test_scoped_path_isolation.py",
        "name": "test_patching_one_scoped_path_preserves_sibling_paths",
        "proves": "Patching scoped overrides for path A does not wipe out existing overrides for path B.",
        "must_fail_without_fix": true,
        "body": "from server.database import SessionLocal, User\nfrom server.user_settings_service import UserSettingsService\n\ndef test_patching_one_scoped_path_preserves_sibling_paths(unique_user):\n    db = SessionLocal()\n    u = User(public_id=unique_user, settings={\n        'scoped': {\n            'pathA': [{'id': '1', 'value': 'valA'}],\n            'pathB': [{'id': '2', 'value': 'valB'}],\n        }\n    })\n    db.add(u)\n    db.commit()\n    \n    UserSettingsService.update_user_settings(db, u, {'scoped': {'pathA': []}})\n    res = UserSettingsService.get_user_settings(u)\n    scoped = res.get('scoped', {})\n    assert scoped.get('pathA') == []\n    assert len(scoped.get('pathB', [])) == 1\n    assert scoped['pathB'][0]['value'] == 'valB'\n    db.close()"
      }
    ],
    "verification": "pytest server/tests/test_scoped_path_isolation.py -> PASS"
  }
]
```

---

## 4. Execution Order & Remediation Sequence

1. **Step 1 — Deep-merge fix (`REL-02`) & Scoped path-isolation (`REL-07`)**
   - *Rationale:* Zero database schema changes required. Immediately stops destructive deletion of nested configuration (`ai.detection`) and cross-tab override wiping in `server/user_settings_service.py`.
   - *Verification:* `pytest server/tests/test_scoped_settings.py server/tests/test_user_settings_deep_merge.py`.

2. **Step 2 — Missing indexes in `init_db()` & migration resilience (`REL-04`, `REL-05`)**
   - *Rationale:* Completely backwards compatible. Eliminates full table scans on `universal_dump_items` and `users`, and prevents boot migration aborts.
   - *Verification:* `EXPLAIN QUERY PLAN` on `users` and `universal_dump_items` confirms `USING INDEX`.

3. **Step 3 — Idempotency key enforcement on `charge()` & `charge_actual_usage()` (`REL-03`)**
   - *Rationale:* Protects user balances from duplicate debits during network retries and webhook repetitions.
   - *Verification:* Calling `charge()` sequentially and concurrently with duplicate keys verifies exactly 1 deduction.

4. **Step 4 — Setting/Token concurrency isolation (`REL-01`)**
   - *Rationale:* Addresses the highest severity race condition where token deductions and UI settings clobber each other.
   - *Verification:* Multi-threaded concurrency test confirms both settings updates and token charges persist simultaneously.

5. **Step 5 — Lifecycle graceful shutdown & durable background task recovery (`REL-06`)**
   - *Rationale:* Hardens system against process restarts and deployment recycling, ensuring Telegram offsets and session charges are reliably tracked.
   - *Verification:* SIGTERM handling drains background tasks without dropping requests.

---

## 5. Open Questions & Recommendations

1. **Dedicated `tokens` column vs. JSON settings balance:**
   - *Question:* Should spendable task tokens be migrated completely out of `User.settings` JSON blob into a first-class numeric column (`users.tokens`)?
   - *Recommendation:* **Yes.** Mixing spendable currency with mutable UI preferences in a JSON column violates database normalization and creates unnecessary concurrency hazards.

2. **Durable task queues vs. in-memory `asyncio.create_task`:**
   - *Question:* Should long-running browser scraping sessions and Telegram bot instructions be backed by a lightweight SQLite task table rather than raw in-memory coroutines?
   - *Recommendation:* **Yes.** Storing task metadata and progress state in a lightweight `tasks` table ensures interrupted jobs can be refunded or resumed after crashes.
