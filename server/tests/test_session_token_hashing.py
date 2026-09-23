"""Session tokens are stored HASHED, and legacy rows migrate on first use.

WHY THIS FILE EXISTS
A session token is a bearer credential — whoever reads the row can act as the
user. Rows were stored verbatim (measured 2026-09-23: 364 live rows, each a
usable 64-char token), so a DB backup or a leaked dump handed over every live
session at once. API keys were already hashed; sessions were not.

The migration is the part that needs pinning, because it is invisible when it
works and silent when it does not: a legacy row still holding a raw token can
never be matched by hash, so lookup falls back to the raw comparison and
re-writes the row. If that fallback breaks, every existing session is logged
out on deploy — a failure that looks like "users got signed out" and points at
nothing.
"""
import re

from server.security import SessionStore, _hash_token

HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _rows():
    from server.database import SessionLocal, UserSession
    db = SessionLocal()
    try:
        return [(s.id, s.token) for s in db.query(UserSession).all()]
    finally:
        db.close()


def _seed_raw_row(public_id="hashtest_user"):
    """Insert a session row the way the OLD code did: token stored verbatim."""
    import secrets
    from datetime import datetime, timedelta, timezone
    from server.database import SessionLocal, UserSession
    token = secrets.token_urlsafe(48)
    db = SessionLocal()
    try:
        db.add(UserSession(
            token=token,
            user_id=1,
            public_id=public_id,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=3600),
        ))
        db.commit()
    finally:
        db.close()
    return token


def test_create_session_stores_a_hash_not_the_token():
    """create_session must return the token and persist only its digest."""
    token = SessionStore.create_session(user_id=1, public_id="hash_create")
    assert not HEX64.match(token), "the returned token must be the raw credential"

    stored = [t for _, t in _rows()]
    assert _hash_token(token) in stored, "the digest of the token must be stored"
    assert token not in stored, "the RAW token must never reach the database"

    # And the credential it handed back still authenticates.
    assert SessionStore.get_session(token) is not None


def test_legacy_raw_row_is_migrated_in_place_on_first_lookup():
    """A pre-hash row must still work, and stop being raw after one lookup."""
    raw = _seed_raw_row("hash_legacy")
    assert raw in [t for _, t in _rows()], "precondition: the raw row is in the DB"

    session = SessionStore.get_session(raw)
    assert session is not None, "a legacy session must not be logged out by the deploy"
    assert session["public_id"] == "hash_legacy"

    stored = [t for _, t in _rows()]
    assert raw not in stored, "the raw token must have been replaced by its hash"
    assert _hash_token(raw) in stored

    # Lookup must keep working now that it resolves by hash.
    assert SessionStore.get_session(raw) is not None


def test_an_unknown_token_still_resolves_to_nothing():
    """The fallback must not turn a bogus token into a valid session."""
    assert SessionStore.get_session("not-a-real-token") is None


def test_delete_and_refresh_use_the_hashed_lookup():
    """delete/refresh went through the same filter and must follow the fallback."""
    raw = _seed_raw_row("hash_del")
    assert SessionStore.refresh_session(raw) is True
    SessionStore.delete_session(raw)
    assert SessionStore.get_session(raw) is None, "delete must remove the hashed row"


def test_all_sessions_never_exposes_a_usable_token():
    """get_all_sessions returns the stored value, which must be a hash.

    This is what stops an admin/debug read of the session table from being a
    list of live credentials.
    """
    SessionStore.create_session(user_id=1, public_id="hash_list")
    for key in SessionStore.get_all_sessions():
        assert HEX64.match(key), f"a session listing exposed a non-hashed token: {key[:12]}…"
