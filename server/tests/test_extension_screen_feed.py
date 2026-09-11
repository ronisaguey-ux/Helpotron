"""Tests for screen feed directive generation in /api/extension/agent_chat.

Pins the behavior of AGENT_MODE_DIRECTIVE when:
  1. seescreen is True, but images is empty (e.g. Chrome New Tab, internal pages):
     must output SCREEN FEED: UNAVAILABLE with reason detail, and explicitly forbid
     claiming the toggle is off.
  2. seescreen is False:
     must output SCREEN FEED: OFF.
"""
from server.database import SessionLocal, User
from server.security import create_jwt_token


def _make_user(public_id: str, token_balance: float = 5.0, plan: str = "basic"):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(
                public_id=public_id,
                plan=plan,
                credits=100.0,
                settings={"2fa_enabled": True, "token_balance": token_balance},
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.settings = {**(user.settings or {}), "2fa_enabled": True,
                             "token_balance": token_balance}
            db.commit()
            db.refresh(user)
        token = create_jwt_token({"sub": user.id, "public_id": user.public_id})
        return {"Authorization": f"Bearer {token}"}, user.id
    finally:
        db.close()


def test_seescreen_on_without_images_sets_unavailable_directive(client, monkeypatch, unique_user):
    """When user has See Screen ON but is on a restricted tab (like chrome://newtab),
    the system prompt must indicate SCREEN FEED: UNAVAILABLE and not tell user toggle is off."""
    headers, _uid = _make_user(unique_user, token_balance=5.0)
    captured = {}

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None, **kw):
        captured["settings"] = settings
        return {"action": "plain_answer", "payload": {}, "force_permission": False,
                "reply": "ok"}

    import server.routes_overlord as _ro
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "what is on my screen",
        "agent_mode": True,
        "execute": True,
        "seescreen": True,
        "screen_error": "the tab you are on (New Tab) cannot be driven — chrome:// pages are off limits",
        "images": [],
    }, headers=headers)

    assert resp.status_code == 200
    instr = captured["settings"]["ai"]["hierarchy"]["extensions"]["instructions"]
    assert "SCREEN FEED: UNAVAILABLE" in instr
    assert "the tab you are on (New Tab) cannot be driven" in instr
    assert "Do NOT tell the user that their 'See screen' toggle is turned off!" in instr


def test_seescreen_off_sets_screen_feed_off_directive(client, monkeypatch, unique_user):
    """When user explicitly has See Screen OFF, the system prompt must indicate SCREEN FEED: OFF."""
    headers, _uid = _make_user(unique_user, token_balance=5.0)
    captured = {}

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None, **kw):
        captured["settings"] = settings
        return {"action": "plain_answer", "payload": {}, "force_permission": False,
                "reply": "ok"}

    import server.routes_overlord as _ro
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "hello",
        "agent_mode": True,
        "execute": False,
        "seescreen": False,
        "images": [],
    }, headers=headers)

    assert resp.status_code == 200
    instr = captured["settings"]["ai"]["hierarchy"]["extensions"]["instructions"]
    assert "SCREEN FEED: OFF" in instr
    assert "SCREEN FEED: UNAVAILABLE" not in instr
