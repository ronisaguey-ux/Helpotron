"""Test proving REL-07: path-level scoped settings updates."""
import pytest


def test_scoped_settings_path_merge():
    from server.user_settings_service import UserSettingsService
    from server.database import SessionLocal, User
    import uuid

    db = SessionLocal()
    try:
        user = User(
            public_id=f"test_user_{uuid.uuid4().hex[:8]}",
            settings={"scoped": {"/path/a": {"theme": "dark"}, "/path/b": {"theme": "light"}}},
        )
        db.add(user)
        db.commit()
        UserSettingsService.update_user_settings(db, user, {"scoped": {"/path/a": {"theme": "solarized"}}})
        updated = UserSettingsService.get_user_settings(user)
        assert "/path/b" in updated.get("scoped", {}), "Scoped path /path/b was overwritten/dropped!"
        assert updated["scoped"]["/path/a"]["theme"] == "solarized"
        assert updated["scoped"]["/path/b"]["theme"] == "light"
    finally:
        db.close()
