"""09-10: Launch to Doc — the policy moved to the server, the extension is a wrapper.

The extension used to own the launch decision (which tab, when to open docs.new,
the typing defaults, and the cadence presets hardcoded in popup.html), which meant
every tuning change needed a new signed build. The server now returns a PLAN and
the extension applies it mechanically.

These tests pin the contract the wrapper depends on:
  1. the config endpoint really carries the UI menu (so the panel is server-driven),
  2. the plan endpoint resolves assignment text and returns a complete plan,
  3. every number is clamped (the last stop before a stream is typed into an essay),
  4. the old payload endpoint still works — nothing that shipped may break.

Run with the pinned test DB (conftest) — never against the live server.
"""
from server.database import Assignment, SessionLocal, User
from server.launch_to_doc import (
    CADENCE_PRESETS,
    build_launch_config,
    build_launch_plan,
    build_typing_config,
    resolve_preset,
)
from server.main import app
from server.security import create_jwt_token
from fastapi.testclient import TestClient

client = TestClient(app)


def _user(public_id: str):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == public_id).first()
        if not u:
            u = User(public_id=public_id, plan="pro", credits=100.0,
                     settings={"token_balance": 500})
            db.add(u)
            db.commit()
            db.refresh(u)
        token = create_jwt_token(user_id=u.id, role="user")
        return {"Authorization": f"Bearer {token}", "X-Public-ID": public_id}, u.id
    finally:
        db.close()


def _assignment(owner_id: int, title="Accessible Biology Lab Report",
                work="Cellular respiration occurs in three primary stages."):
    db = SessionLocal()
    try:
        a = Assignment(
            user_id=owner_id,
            title=title,
            prompt="Investigate cellular respiration.",
            due_date="2026-09-05",
            status="completed",
            progress={"subject": "Biology", "do_it_work": work},
        )
        db.add(a)
        db.commit()
        db.refresh(a)
        return a.id
    finally:
        db.close()


# ── 1. the pure policy ───────────────────────────────────────────────────────

def test_config_carries_the_ui_menu_and_defaults():
    cfg = build_launch_config()
    assert cfg["status"] == "success"
    assert [p["id"] for p in cfg["presets"]] == ["academic", "careful", "fast"]
    assert cfg["default_preset_id"] == "academic"
    # the panel renders its copy from here, so it must actually be present
    assert cfg["ui"]["no_docs_tab_hint"]
    assert cfg["typing"]["wpm"] == 65


def test_every_preset_is_complete():
    """A preset missing a field would render a broken chip or type at NaN wpm."""
    for p in CADENCE_PRESETS:
        for field in ("id", "label", "sub", "title", "wpm", "typo_rate"):
            assert field in p, f"{p.get('id')} missing {field}"
        assert 10 <= p["wpm"] <= 200
        assert 0.0 <= p["typo_rate"] <= 0.25


def test_unknown_preset_falls_back_to_default_not_error():
    """An old extension sending a retired preset id must still launch."""
    assert resolve_preset("retired-preset")["id"] == "academic"
    assert resolve_preset(None)["id"] == "academic"
    assert resolve_preset("")["id"] == "academic"


def test_typing_config_is_clamped():
    """The plan is the last thing between a bad number and someone's essay."""
    assert build_typing_config("academic", {"wpm": 99999})["wpm"] == 200
    assert build_typing_config("academic", {"wpm": -5})["wpm"] == 10
    assert build_typing_config("academic", {"typo_rate": 9})["typo_rate"] == 0.25
    assert build_typing_config("academic", {"typo_rate": -1})["typo_rate"] == 0.0
    # junk must be ignored, never crash and never leak through
    assert build_typing_config("academic", {"wpm": "fast"})["wpm"] == 65
    assert build_typing_config("academic", {"typo_rate": None})["typo_rate"] == 0.018


def test_typing_config_asks_for_trusted_keystrokes_by_default():
    """09-11 audit fix: the typing path must dispatch through CDP, not synthetic
    DOM events. Measured difference is a single property — Input.dispatchKeyEvent
    yields keydown/keypress/beforeinput/input/keyup with isTrusted:true, while
    dispatchEvent yields false — and that is what a page can read to tell
    automation from a person. The plan carries the flag so the extension never
    has to guess, and it can still be turned off."""
    assert build_typing_config()["trusted_keys"] is True
    assert build_typing_config("academic")["trusted_keys"] is True
    assert build_launch_plan(text="hi")["typing"]["trusted_keys"] is True
    assert build_launch_config()["typing"]["trusted_keys"] is True
    assert build_typing_config("academic", {"trusted_keys": False})["trusted_keys"] is False


def test_override_can_never_make_trusted_keys_truthy_from_junk():
    """bool() is the only coercion — any non-empty value means "on", so a
    caller cannot accidentally send a string that leaks through unchecked."""
    assert build_typing_config("academic", {"trusted_keys": "yes"})["trusted_keys"] is True
    assert build_typing_config("academic", {"trusted_keys": 0})["trusted_keys"] is False
    assert build_typing_config("academic", {"trusted_keys": ""})["trusted_keys"] is False


def test_plan_estimate_uses_the_chosen_cadence():
    """The panel shows a time estimate before typing; it must follow the cadence,
    not a hardcoded 65 wpm."""
    slow = build_launch_plan(text="word " * 130, preset_id="careful")
    fast = build_launch_plan(text="word " * 130, preset_id="fast")
    assert slow["typing"]["wpm"] == 48 and fast["typing"]["wpm"] == 85
    assert slow["estimated_minutes"] > fast["estimated_minutes"]


def test_plan_defaults_title_and_target():
    plan = build_launch_plan(text="hello")
    assert plan["title"] == "Assignment Document"      # never an empty title
    assert plan["target"]["url"] == "https://docs.new"
    assert plan["target"]["reuse_existing"] is True
    assert plan["plan_version"] == 1


# ── 2. the endpoints ─────────────────────────────────────────────────────────

def test_config_endpoint_requires_auth():
    assert client.get("/api/launch-to-doc/config").status_code in (401, 403)


def test_config_endpoint_serves_the_menu():
    headers, _ = _user("test_ltd_cfg_user")
    resp = client.get("/api/launch-to-doc/config", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert [p["id"] for p in data["presets"]] == ["academic", "careful", "fast"]


def test_plan_endpoint_resolves_assignment_text():
    headers, uid = _user("test_ltd_plan_user")
    aid = _assignment(uid)
    resp = client.post("/api/launch-to-doc/plan",
                       json={"assignment_id": aid, "preset_id": "careful"},
                       headers=headers)
    assert resp.status_code == 200
    plan = resp.json()
    assert plan["assignment_id"] == aid
    assert plan["title"] == "Accessible Biology Lab Report"
    assert "Cellular respiration occurs in three primary stages" in plan["text"]
    assert plan["subject"] == "Biology"
    assert plan["typing"]["wpm"] == 48           # the requested cadence won
    assert plan["word_count"] > 5
    assert plan["target"]["url"] == "https://docs.new"


def test_plan_endpoint_accepts_a_custom_text_override():
    """The user can paste their own draft; it wins over the assignment text."""
    headers, uid = _user("test_ltd_override_user")
    aid = _assignment(uid)
    resp = client.post("/api/launch-to-doc/plan",
                       json={"assignment_id": aid, "text": "  my own draft  "},
                       headers=headers)
    assert resp.status_code == 200
    plan = resp.json()
    assert plan["text"] == "my own draft"
    assert plan["word_count"] == 3


def test_plan_endpoint_works_with_no_assignment_at_all():
    """Custom text with no assignment must still produce a usable plan."""
    headers, _ = _user("test_ltd_notext_user")
    resp = client.post("/api/launch-to-doc/plan",
                       json={"text": "just some words"}, headers=headers)
    assert resp.status_code == 200
    plan = resp.json()
    assert plan["text"] == "just some words"
    assert plan["assignment_id"] is None
    assert plan["typing"]["wpm"] == 65


def test_plan_endpoint_404s_for_another_users_assignment():
    """Never type one user's work into another user's doc."""
    headers_a, _ = _user("test_ltd_owner_user")
    headers_b, uid_b = _user("test_ltd_other_user")
    aid = _assignment(uid_b)
    resp = client.post("/api/launch-to-doc/plan",
                       json={"assignment_id": aid}, headers=headers_b)
    assert resp.status_code == 200                      # owner is fine
    resp2 = client.post("/api/launch-to-doc/plan",
                        json={"assignment_id": aid}, headers=headers_a)
    assert resp2.status_code == 404                     # stranger is not


# ── 3. nothing that shipped may break ────────────────────────────────────────

def test_legacy_payload_endpoint_still_works():
    """The old endpoint is still called by the assignment picker; it must keep
    returning its original shape."""
    headers, uid = _user("test_ltd_legacy_user")
    aid = _assignment(uid)
    resp = client.get(f"/api/assignment/{aid}/launch-doc-payload", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["assignment_id"] == aid
    assert "estimated_minutes_at_65wpm" in data
