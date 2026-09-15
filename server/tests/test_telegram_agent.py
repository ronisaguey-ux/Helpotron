"""Tests: Telegram bot ↔ My Agent link (08-31, operator).

Covers: connect validates the token (format + Telegram getMe), status never
leaks the token, disconnect clears, and the poller's chat-binding rules
(first private chat binds; other chats ignored; /start welcome).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal
from server.main import app

init_db()
client = TestClient(app)

from server import telegram_agent_link as tal
from server.telegram_agent_link import normalize_token, _process_updates

TOKEN_OK = "1234567890:AAFakeTokenForTests0123456789AbCdEfGh"


def _user_headers():
    uid = f"tg_{uuid.uuid4().hex[:8]}"
    pwd = "Password123!"
    assert client.post("/api/signup", json={"public_id": uid, "password": pwd}).status_code in (200, 201)
    login = client.post("/api/login", json={"public_id": uid, "password": pwd})
    assert login.status_code == 200
    data = login.json()
    headers = {
        "X-CSRF-Token": data.get("csrf_token", ""),
        "Authorization": f"Bearer {data.get('token') or data.get('session_token') or ''}",
    }
    return uid, headers, None


# ── routes ──────────────────────────────────────────────────────────────────

def test_connect_rejects_bad_token_format(monkeypatch):
    uid, headers, _ = _user_headers()
    resp = client.post("/api/telegram-agent/connect", json={"token": "not-a-bot-token"}, headers=headers)
    assert resp.status_code == 400


def test_connect_rejects_token_telegram_rejects(monkeypatch):
    async def fake_get_me(token):
        return False, "Unauthorized", {"error_code": 401}

    monkeypatch.setattr("server.routes_telegram_agent.tg_get_me", fake_get_me)
    uid, headers, _ = _user_headers()
    resp = client.post("/api/telegram-agent/connect", json={"token": TOKEN_OK}, headers=headers)
    assert resp.status_code == 400
    assert "rejected" in resp.json()["detail"].lower()


def test_connect_status_roundtrip_never_leaks_token(monkeypatch):
    async def fake_get_me(token):
        return True, "my_helper_bot", {}

    monkeypatch.setattr("server.routes_telegram_agent.tg_get_me", fake_get_me)
    uid, headers, _ = _user_headers()

    resp = client.post("/api/telegram-agent/connect", json={"token": TOKEN_OK}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["bot_username"] == "my_helper_bot"

    status = client.get("/api/telegram-agent/status", headers=headers)
    assert status.status_code == 200
    body = status.json()
    assert body["connected"] is True
    assert body["bot_username"] == "my_helper_bot"
    raw = status.text
    assert TOKEN_OK not in raw
    assert "token" not in body

    # Stored server-side under the expected settings key.
    from server.database import User
    with SessionLocal() as db:
        u = db.query(User).filter(User.public_id == uid).first()
        assert u.settings["ai"]["telegram_bot"]["token"] == TOKEN_OK


def test_disconnect_clears_state(monkeypatch):
    async def fake_get_me(token):
        return True, "my_helper_bot", {}

    monkeypatch.setattr("server.routes_telegram_agent.tg_get_me", fake_get_me)
    uid, headers, _ = _user_headers()
    client.post("/api/telegram-agent/connect", json={"token": TOKEN_OK}, headers=headers)

    resp = client.post("/api/telegram-agent/disconnect", headers=headers)
    assert resp.status_code == 200
    status = client.get("/api/telegram-agent/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["connected"] is False


def test_unauthenticated_status_is_401():
    client.cookies.clear()  # shared TestClient keeps prior login cookies
    resp = client.get("/api/telegram-agent/status")
    assert resp.status_code == 401


# ── normalize │ poller binding rules ────────────────────────────────────────

def test_normalize_token_validation():
    assert normalize_token("  1234567890:AAFakeToken0123456789AbCdEfGhIjKlMn  ") == "1234567890:AAFakeToken0123456789AbCdEfGhIjKlMn"
    with pytest.raises(ValueError):
        normalize_token("")
    with pytest.raises(ValueError):
        normalize_token("alphabet-soup")
    with pytest.raises(ValueError):
        normalize_token("123:@tooShort")


class _FakeUser:
    def __init__(self, public_id):
        self.public_id = public_id
        self.settings = {}


def test_poll_binding_rules(monkeypatch):
    """One combined walk-through of the poller's chat-binding rules, driven
    through asyncio.run (the module API is async) against a real DB user."""
    import asyncio

    from server.database import User as DBUser

    sent = []

    async def fake_send(token, chat, text):
        sent.append((chat, text))
        return True

    monkeypatch.setattr(tal, "tg_send", fake_send)

    public_id = f"u_bind_{uuid.uuid4().hex[:8]}"
    with SessionLocal() as db:
        db.add(DBUser(public_id=public_id, plan="elite", credits=1000))
        db.commit()
        user = db.query(DBUser).filter(DBUser.public_id == public_id).first()
        user.settings = {"ai": {"telegram_bot": {"token": TOKEN_OK, "chat_id": "", "offset": 0}}}
        db.commit()

    def fresh_user():
        with SessionLocal() as db:
            return db.query(DBUser).filter(DBUser.public_id == public_id).first()

    async def run(updates):
        await _process_updates(fresh_user(), TOKEN_OK, updates)

    # 1) First private message binds and gets the welcome.
    asyncio.run(run([{"update_id": 1, "message": {"chat": {"id": 111, "type": "private"}, "text": "/start"}}]))
    assert len(sent) == 1 and "👋" in sent[0][1]

    def state():
        with SessionLocal() as db:
            w = db.query(DBUser).filter(DBUser.public_id == public_id).first()
            return w.settings["ai"]["telegram_bot"]

    assert state()["chat_id"] == "111"
    assert state()["offset"] == 2

    # 2) A different chat trying to use the bot is ignored; binding unchanged.
    asyncio.run(run([{"update_id": 2, "message": {"chat": {"id": 999, "type": "private"}, "text": "/start"}}]))
    assert len(sent) == 1, "foreign chat must not be served"
    assert state()["chat_id"] == "111"

    # 3) Group messages never bind or serve.
    asyncio.run(run([{"update_id": 3, "message": {"chat": {"id": -42, "type": "group"}, "text": "hello"}}]))
    assert len(sent) == 1

    # 4) A replayed update (crash recovery) is served once, not twice.
    asyncio.run(run([{"update_id": 4, "message": {"chat": {"id": 111, "type": "private"}, "text": "/help"}}]))
    asyncio.run(run([{"update_id": 4, "message": {"chat": {"id": 111, "type": "private"}, "text": "/help"}}]))
    assert len(sent) == 2  # welcome + help once (replay skipped)

    with SessionLocal() as db:
        w = db.query(DBUser).filter(DBUser.public_id == public_id).first()
        db.delete(w)
        db.commit()
