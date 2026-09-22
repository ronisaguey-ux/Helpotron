"""Test proving REL-02: shallow merge drops nested dictionary settings."""
import uuid
import pytest
from server.database import SessionLocal, User
from server.user_settings_service import UserSettingsService


def test_deep_merge_preserves_nested_siblings():
    db = SessionLocal()
    unique_id = f"test_usr_{uuid.uuid4().hex[:8]}"
    try:
        user = User(
            public_id=unique_id,
            settings={
                "ai": {
                    "detection": {
                        "enabled": True,
                        "threshold": 80.0
                    },
                    "effortScore": 5
                }
            }
        )
        db.add(user)
        db.commit()

        # Update only threshold inside ai.detection
        UserSettingsService.update_user_settings(
            db, user,
            {"ai": {"detection": {"threshold": 95.0}}}
        )

        updated = UserSettingsService.get_user_settings(user)
        assert updated["ai"]["detection"]["threshold"] == 95.0
        # Sibling key "enabled" must not be wiped by shallow merge:
        assert "enabled" in updated["ai"]["detection"], "Sibling key 'enabled' was dropped by shallow merge!"
        assert updated["ai"]["detection"]["enabled"] is True
        assert updated["ai"]["effortScore"] == 5
    finally:
        # Cleanup
        u = db.query(User).filter(User.public_id == unique_id).first()
        if u:
            db.delete(u)
            db.commit()
        db.close()
