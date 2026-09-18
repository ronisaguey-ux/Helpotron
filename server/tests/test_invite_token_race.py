"""Invite-token redemption must be single-use (SEC-2026-007, second site).

`TokenManager.redeem_token` read-modify-writes the admin's JSON settings blob.
It had two defects, and they compounded:

  1. No row lock. Concurrent redemptions all read `uses: 0`, all pass the
     `uses >= max_uses` and `used_by` checks, and all grant.
  2. The grant happened BEFORE the use was recorded. Any failure between the two
     minted tokens against a token the ledger still described as unused.

Only one of those is reproducible on SQLite (which ignores `SELECT ... FOR
UPDATE` because it serialises writers anyway), so the lock is asserted
structurally and the ordering is asserted behaviourally. The lock's real target
is Postgres.
"""
import concurrent.futures as cf
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from server.admin import TokenManager, ADMIN_IDS
from server.database import SessionLocal, User
from server.credits import get_token_balance


@pytest.fixture
def admin_and_users():
    """An admin row (which owns the token list) plus N redeemers."""
    db = SessionLocal()
    admin = db.query(User).filter(User.public_id.in_(ADMIN_IDS)).first()
    if admin is None:
        admin = User(public_id=ADMIN_IDS[0], plan="elite",
                     settings={"token_balance": 0.0, "tokens": []})
        db.add(admin)
        db.commit()

    # Always start from a clean token list so a previous run cannot make this
    # pass or fail for the wrong reason. The test DB is a persistent file.
    s = dict(admin.settings or {})
    s["tokens"] = []
    admin.settings = s
    db.commit()

    tag = uuid.uuid4().hex[:8]
    users = []
    for i in range(5):
        u = User(public_id=f"redeem_{tag}_{i}", plan="basic",
                 settings={"token_balance": 0.0})
        db.add(u)
        users.append(u)
    db.commit()
    ids = [u.id for u in users]
    db.close()
    yield ids
    # leave rows: the test DB is shared and other tests count rows


def _balance(uid):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == uid).first()
        return float((u.settings or {}).get("token_balance", 0) or 0)
    finally:
        db.close()


def _token_uses(token):
    db = SessionLocal()
    try:
        return [
            (t["uses"], len(t["used_by"]))
            for t in TokenManager.list_tokens(db) if t["token"] == token
        ]
    finally:
        db.close()


def test_max_uses_one_grants_exactly_once(admin_and_users):
    """The headline: one token, several users, exactly one grant."""
    db = SessionLocal()
    token = TokenManager.generate_token(db, duration_days=7, max_uses=1)
    db.close()

    granted = 0
    messages = []
    for uid in admin_and_users:
        db = SessionLocal()
        try:
            u = db.query(User).filter(User.id == uid).first()
            before = float((u.settings or {}).get("token_balance", 0) or 0)
            msg = TokenManager.redeem_token(db, u, token)
            after = float((u.settings or {}).get("token_balance", 0) or 0)
            messages.append(msg)
            if after > before:
                granted += 1
        finally:
            db.close()

    assert granted == 1, f"expected exactly one grant, got {granted}: {messages}"

    uses = _token_uses(token)
    assert uses and uses[0][0] == 1, f"token should record exactly one use, saw {uses}"
    assert uses[0][1] == 1, f"exactly one user should be in used_by, saw {uses}"


def test_use_recorded_even_if_the_grant_path_is_reentered(admin_and_users):
    """A second redeem by the SAME user must be refused, not double-paid.

    This is what the `used_by` check is for, and it is only reliable because the
    use is now recorded in the same transaction as the grant.
    """
    uid = admin_and_users[0]
    db = SessionLocal()
    token = TokenManager.generate_token(db, duration_days=7, max_uses=5)
    db.close()

    first = _balance(uid)
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == uid).first()
        msg1 = TokenManager.redeem_token(db, u, token)
    finally:
        db.close()

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == uid).first()
        msg2 = TokenManager.redeem_token(db, u, token)
    finally:
        db.close()

    delta = _balance(uid) - first
    assert "received" in msg1.lower(), msg1
    assert "already used" in msg2.lower(), f"second redeem should be refused, got: {msg2}"
    assert delta == 25, f"only the first redeem may pay, delta was {delta}"


def test_concurrent_redeem_does_not_multiply_grants(admin_and_users):
    """Concurrency is where this bug lived.

    SQLite ignores SELECT ... FOR UPDATE, so this cannot prove the lock on its
    own — it can only catch an ordering regression. The lock is asserted in
    test_redeem_takes_a_row_lock.
    """
    db = SessionLocal()
    token = TokenManager.generate_token(db, duration_days=7, max_uses=1)
    db.close()

    def redeem(uid):
        db = SessionLocal()
        try:
            u = db.query(User).filter(User.id == uid).first()
            before = float((u.settings or {}).get("token_balance", 0) or 0)
            TokenManager.redeem_token(db, u, token)
            after = float((u.settings or {}).get("token_balance", 0) or 0)
            return after > before
        except Exception as e:              # noqa: BLE001 — surface, do not mask
            return f"error: {type(e).__name__}: {e}"
        finally:
            db.close()

    with cf.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(redeem, admin_and_users))

    errors = [r for r in results if isinstance(r, str)]
    assert not errors, f"redemption raised: {errors}"
    assert sum(1 for r in results if r is True) == 1, f"grants: {results}"

    uses = _token_uses(token)
    assert uses and uses[0][0] == 1, f"exactly one use must be recorded, saw {uses}"


def test_redeem_is_locked_on_both_levels():
    """Structural assertion — the only way to pin a lock on SQLite.

    Two locks, two jobs, and both must survive:

      * the PROCESS lock (`_REDEEM_LOCK`) is what actually holds on SQLite,
        which ignores SELECT ... FOR UPDATE;
      * `with_for_update()` on the admin row is what holds once this runs on
        Postgres or with multiple workers.

    If someone removes either, this fails — and the failure is honest, rather
    than a concurrent run happening to get lucky.
    """
    import inspect
    src = inspect.getsource(TokenManager.redeem_token)
    assert "_REDEEM_LOCK" in src, (
        "redeem_token must hold the process lock — SQLite ignores row locks, so "
        "this is the only thing serialising concurrent redemptions here"
    )
    locked = inspect.getsource(TokenManager._redeem_locked)
    assert "with_for_update()" in locked, (
        "the admin row must be selected FOR UPDATE for Postgres / multi-worker"
    )
    # The re-read must happen INSIDE the lock, not before it — the original bug
    # was concurrent readers each seeing `uses: 0`.
    assert "_redeem_locked" in src.split("with _REDEEM_LOCK")[1], (
        "the settings read must be inside the lock, not before it"
    )
