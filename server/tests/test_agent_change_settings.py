"""09-01 (Bob, "my agent couldnt edit user settings, fix rn"): the
change_settings action must write the appearance/display/accessibility
shapes the UI actually reads — font_size was the repro (agent answered with
a browser-zoom workaround instead of changing the setting)."""

import asyncio
import json

import pytest

from server.database import init_db, SessionLocal, User
from server.overlord_agent import overlord_agent

init_db()

PUBLIC_ID = "test_change_settings_user"


@pytest.fixture(autouse=True)
def setup_settings_user():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == PUBLIC_ID).first()
        if not user:
            user = User(
                public_id=PUBLIC_ID,
                plan="pro",
                credits=50.0,
                settings={
                    "operation_mode": "auto",
                    "auto_approved_actions": ["change_settings"],
                    "token_balance": 500,
                },
            )
            db.add(user)
        else:
            user.settings = {
                "operation_mode": "auto",
                "auto_approved_actions": ["change_settings"],
                "token_balance": 500,
            }
        db.commit()
    finally:
        db.close()


def _apply(updates):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == PUBLIC_ID).first()
        result = asyncio.run(overlord_agent.execute_task_action(
            db, user, "change_settings", {"settings": updates}
        ))
        db.refresh(user)
        stored = json.loads(json.dumps(user.settings))
        return result, stored
    finally:
        db.close()


def test_font_size_small_updates_display_and_fontscale():
    """The repro: 'change the font in my setting to small' — must write both
    storage paths the UI reads (display.font_size + appearance.fontScale)."""
    result, stored = _apply({"font_size": "small"})
    assert result["status"] == "completed"
    assert "font size" in result["message"]
    assert stored["display"]["font_size"] == "small"
    assert stored["appearance"]["fontScale"] == 35


def test_font_size_large_maps_to_65():
    result, stored = _apply({"font_size": "large"})
    assert result["status"] == "completed"
    assert stored["display"]["font_size"] == "large"
    assert stored["appearance"]["fontScale"] == 65


def test_font_scale_numeric_clamped():
    result, stored = _apply({"fontScale": 80})
    assert result["status"] == "completed"
    assert stored["appearance"]["fontScale"] == 80
    # clamp outside 1-100 instead of accepting garbage
    result, stored = _apply({"font_scale": 999})
    assert stored["appearance"]["fontScale"] == 100
    result, stored = _apply({"font_scale": 0})
    assert stored["appearance"]["fontScale"] == 1


def test_theme_syncs_all_theme_shapes():
    result, stored = _apply({"theme": "light"})
    assert result["status"] == "completed"
    assert stored["theme"] == "light"
    assert stored["display"]["theme"] == "light"
    assert stored["appearance"]["theme"] == "light"


def test_accessibility_flags_accept_snake_and_camel():
    result, stored = _apply({
        "reduced_motion": True,
        "largeText": "on",
        "highContrast": "false",
    })
    assert result["status"] == "completed"
    assert stored["accessibility"]["reducedMotion"] is True
    assert stored["accessibility"]["largeText"] is True
    assert stored["accessibility"]["highContrast"] is False


def test_compact_mode_lax_string():
    result, stored = _apply({"compact_mode": "on"})
    assert result["status"] == "completed"
    assert stored["display"]["compact_mode"] is True


def test_invalid_font_size_alone_fails():
    result, _ = _apply({"font_size": "huge"})
    assert result["status"] == "failed"


def test_partial_valid_still_applies_good_keys():
    result, stored = _apply({"font_size": "small", "effort_score": "abc"})
    assert result["status"] == "completed"
    assert "font size" in result["message"]
    assert "effort" not in result["message"]
    assert stored["display"]["font_size"] == "small"


def test_non_dict_settings_fails():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == PUBLIC_ID).first()
        result = asyncio.run(overlord_agent.execute_task_action(
            db, user, "change_settings", {"settings": "small"}
        ))
        assert result["status"] == "failed"
    finally:
        db.close()
