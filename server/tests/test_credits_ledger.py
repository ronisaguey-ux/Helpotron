"""Money-path integrity: every token debit must reach the ledger.

Created by the 2026-09-21 mega-audit. The finding behind it (ECON-03) was that
`_charge_tokens` — the debit the agent paths actually call — moved the JSON balance
and committed while writing NO CreditTransaction row, so agent spend was invisible
to every audit and refund path and the balance could not be reconciled from the
ledger. The first test here fails against that body and passes against the fix.

The test DB is a persistent file (server/tests/conftest.py), so every user is created
with a unique public_id: an assertion about a row count against a shared DB is a flake
waiting for the next run.
"""
import uuid

import pytest

from server.credits import get_token_balance
from server.database import CreditTransaction, SessionLocal, User


def _paid_user(balance: float = 10000.0) -> str:
    """A metered (non-operator) user with a funded token balance. Returns public_id."""
    public_id = f"ledger-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        db.add(User(
            public_id=public_id,
            plan="pro",
            # `credits` is the earn-only discount currency and is deliberately 0.0:
            # the real balance lives in settings.token_balance, and a test that funded
            # the dead column would pass against the broken code.
            credits=0.0,
            role="user",
            settings={"token_balance": balance},
        ))
        db.commit()
    finally:
        db.close()
    return public_id


def _load(public_id: str) -> User:
    db = SessionLocal()
    try:
        return db.query(User).filter(User.public_id == public_id).first()
    finally:
        db.close()


def _ledger_rows(public_id: str) -> int:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        return db.query(CreditTransaction).filter(
            CreditTransaction.user_id == user.id
        ).count()
    finally:
        db.close()


def test_agent_action_charge_writes_a_ledger_row():
    """The balance delta and the CreditTransaction delta must agree.

    Against the pre-fix `_charge_tokens` — which did
    `settings["token_balance"] = max(0.0, bal - cost); user.settings = settings;
    db.commit()` — the balance moved and the row count did not, and this fails.
    """
    from server.routes_overlord import _charge_tokens

    public_id = _paid_user(balance=10000.0)
    before_balance = get_token_balance(_load(public_id))
    before_rows = _ledger_rows(public_id)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        _charge_tokens(user, db, 100.0)
    finally:
        db.close()

    after_balance = get_token_balance(_load(public_id))
    after_rows = _ledger_rows(public_id)

    assert before_balance - after_balance == pytest.approx(100.0), (
        "the debit did not move the balance"
    )
    assert after_rows == before_rows + 1, (
        "a token debit with no CreditTransaction row makes spend unauditable: "
        "refunds cannot be computed and the balance cannot be reconciled from the ledger"
    )


def test_charge_ledger_delta_matches_the_balance_delta():
    """Reconciliation property: for one debit, the ledger entry equals the movement.

    A ledger row that exists but carries the wrong delta is no better than one that is
    missing, and only comparing the two numbers catches that.
    """
    from server.routes_overlord import _charge_tokens

    public_id = _paid_user(balance=5000.0)
    before_balance = get_token_balance(_load(public_id))

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        _charge_tokens(user, db, 250.0)
        row = db.query(CreditTransaction).filter(
            CreditTransaction.user_id == user.id
        ).order_by(CreditTransaction.id.desc()).first()
    finally:
        db.close()

    moved = before_balance - get_token_balance(_load(public_id))
    assert moved == pytest.approx(250.0)
    assert row is not None, "the debit wrote no ledger row"
    assert abs(row.delta) == pytest.approx(moved), (
        f"ledger says {row.delta} but the balance moved {moved} — they must agree "
        "or the ledger cannot be used to audit spend"
    )


def test_charge_is_measured_not_flat_the_work_already_ran():
    """A post-hoc settlement charges the amount it is given, not a table lookup."""
    from server.routes_overlord import _charge_tokens

    public_id = _paid_user(balance=1000.0)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        _charge_tokens(user, db, 7.0)
    finally:
        db.close()

    assert get_token_balance(_load(public_id)) == pytest.approx(993.0)


# ── REL-01: the JSON blob cannot be merged atomically, so the RMW must serialise ──
#
# `with_for_update()` is a NO-OP here: SQLite has no row locks, and compiling the
# statement shows no FOR UPDATE in the emitted SQL. So the protection has to be a
# database WRITE lock taken BEFORE the read (BEGIN IMMEDIATE). A sequential test cannot
# tell the difference — both orders pass when nothing overlaps — so these run two real
# sessions in threads, released together by a barrier to force the interleaving.


def test_concurrent_settings_writes_do_not_lose_keys():
    """Two writers touching DIFFERENT keys must both survive.

    Reproduced against the unfixed code: the first commit's key disappears when the
    second writer commits from a snapshot it read before that commit.
    """
    import threading

    from server.user_settings_service import UserSettingsService as S

    public_id = _paid_user(balance=1000.0)
    db0 = SessionLocal()
    try:
        u = db0.query(User).filter(User.public_id == public_id).first()
        uid = u.id
    finally:
        db0.close()

    barrier = threading.Barrier(2, timeout=15)
    errors = []

    def writer(key, value):
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == uid).first()
            # Both threads have READ before either writes — the interleaving that
            # silently discards a key.
            barrier.wait()
            S.update_user_settings(db, user, {key: value})
        except Exception as e:  # noqa: BLE001 — surfaced below, not swallowed
            errors.append(f"{key}: {type(e).__name__}: {e}")
        finally:
            db.close()

    t1 = threading.Thread(target=writer, args=("from_thread_1", 1))
    t2 = threading.Thread(target=writer, args=("from_thread_2", 2))
    t1.start(); t2.start()
    t1.join(timeout=20); t2.join(timeout=20)

    assert not errors, f"concurrent writers raised: {errors}"

    db = SessionLocal()
    try:
        final = db.query(User).filter(User.id == uid).first().settings or {}
    finally:
        db.close()

    assert final.get("from_thread_1") == 1, (
        "the first writer's key was discarded by a concurrent write from a stale read"
    )
    assert final.get("from_thread_2") == 2, (
        "the second writer's key is missing"
    )


def test_concurrent_token_charges_do_not_overdraw():
    """The financial case: two concurrent debits must not apply to the same balance.

    1000 tokens, two charges of 400 each. Applied properly, 200 remain. Measured against
    a read-then-write it left 600 — one debit swallowed, both callers told they succeeded.
    """
    import threading

    public_id = _paid_user(balance=1000.0)
    db0 = SessionLocal()
    try:
        uid = db0.query(User).filter(User.public_id == public_id).first().id
    finally:
        db0.close()

    barrier = threading.Barrier(2, timeout=15)
    errors = []

    def debit():
        db = SessionLocal()
        try:
            barrier.wait()
            # The atomic delta helper, NOT a read-then-write: an absolute value computed
            # in Python from a balance read before the other thread committed is exactly
            # how a debit goes missing.
            from server.credits import debit_tokens_atomic
            debit_tokens_atomic(db, uid, 400.0)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{type(e).__name__}: {e}")
        finally:
            db.close()

    threads = [threading.Thread(target=debit) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=20)

    assert not errors, f"concurrent debits raised: {errors}"
    assert get_token_balance(_load(public_id)) == pytest.approx(200.0), (
        "two concurrent debits were applied to the same balance — the account was "
        "silently overdrawn"
    )
