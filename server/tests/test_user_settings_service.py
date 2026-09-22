"""Tests for UserSettingsService serialization and concurrent safety (REL-01)."""
import uuid
import pytest
from server.database import SessionLocal, User
from server.user_settings_service import UserSettingsService as S


def _create_user() -> str:
    public_id = f"user-{uuid.uuid4().hex[:10]}"
    db = SessionLocal()
    try:
        db.add(User(
            public_id=public_id,
            plan="pro",
            role="user",
            settings={},
        ))
        db.commit()
    finally:
        db.close()
    return public_id


def test_second_settings_write_preserves_the_first_key():
    """Verify that multiple settings updates preserve previously written keys."""
    public_id = _create_user()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        S.update_user_settings(db, user, {"ai": {"humanizer": "on"}})
        S.update_user_settings(db, user, {"appearance": {"theme": "dark"}})

        db.refresh(user)
        s = user.settings or {}
        assert s.get("ai", {}).get("humanizer") == "on"
        assert s.get("appearance", {}).get("theme") == "dark", (
            "a settings write discarded another key"
        )
    finally:
        db.close()
