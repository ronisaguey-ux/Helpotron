"""Test proving TEST-05: isolated db_session fixture in conftest.py."""
import pytest


def test_isolated_db_session_fixture(db_session):
    from server.database import User
    u = User(public_id="iso_user_1")
    db_session.add(u)
    db_session.commit()
    assert db_session.query(User).filter(User.public_id == "iso_user_1").count() == 1
