"""Telegram integration: real delivery, honest connection state.

Audit 08-29 replaced a simulated notifier (``TelegramNotifier.send_message``
returned "(simulated)" without any network call, so the settings page reported
success for messages nobody received) and a settings UI that hardcoded Telegram
as connected for every account. These tests pin the behaviour that replaced it:
credentials are only stored once Telegram accepts them, and status reflects
what is actually stored.

Bot API calls are stubbed so the suite stays hermetic — the live-network
behaviour of the helper is covered by its own error branches below.
"""
import pytest

from server.database import SessionLocal, User
from server.features import TelegramNotifier
from server.security import create_jwt_token

_PUBLIC_ID = "telegram_test_user"


def _auth_headers(client):
    """Create (once) a dedicated user and return its bearer header."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == _PUBLIC_ID).first()
        if user is None:
            user = User(public_id=_PUBLIC_ID, plan="basic", credits=10.0, settings={})
            db.add(user)
            db.commit()
            db.refresh(user)
        # Start every test from a disconnected account.
        user.settings = {}
        db.commit()
        token = create_jwt_token(user_id=user.id, role="user")
    finally:
        db.close()
    return {"Authorization": f"Bearer {token}"}


def _stored_settings():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == _PUBLIC_ID).one()
        return dict(user.settings or {})
    finally:
        db.close()


def test_status_reports_disconnected_for_a_fresh_account(client):
    """The old UI showed "connected" unconditionally; status must say otherwise."""
    headers = _auth_headers(client)
    res = client.get("/api/features/telegram/status", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["connected"] is False
    assert body["chat_id"] is None
    assert body["bot_hint"] is None


def test_status_requires_authentication(client):
    assert client.get("/api/features/telegram/status").status_code in (401, 403)


def test_configure_rejects_empty_credentials(client):
    headers = _auth_headers(client)
    res = client.post(
        "/api/features/telegram/configure",
        json={"bot_token": "  ", "chat_id": ""},
        headers=headers,
    )
    assert res.status_code == 400
    assert _stored_settings().get("telegram_bot_token") is None


def test_configure_does_not_store_credentials_telegram_rejects(client, monkeypatch):
    """A typo'd token must not produce a connected-looking account."""
    headers = _auth_headers(client)

    async def _reject(user, message):
        return {"sent": False, "detail": "Unauthorized"}

    monkeypatch.setattr(TelegramNotifier, "send_message", staticmethod(_reject))

    res = client.post(
        "/api/features/telegram/configure",
        json={"bot_token": "123:bad", "chat_id": "999"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "Unauthorized" in res.json()["detail"]

    stored = _stored_settings()
    assert "telegram_bot_token" not in stored
    assert "telegram_chat_id" not in stored
    assert client.get("/api/features/telegram/status", headers=headers).json()["connected"] is False


def test_configure_then_status_then_disconnect_round_trip(client, monkeypatch):
    headers = _auth_headers(client)
    sent = []

    async def _accept(user, message):
        sent.append(message)
        return {"sent": True, "detail": "Message delivered to your Telegram chat."}

    monkeypatch.setattr(TelegramNotifier, "send_message", staticmethod(_accept))

    res = client.post(
        "/api/features/telegram/configure",
        json={"bot_token": "8123456789:AAHrealtoken", "chat_id": "424242"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["connected"] is True
    # A confirmation is delivered before anything is persisted.
    assert len(sent) == 1

    stored = _stored_settings()
    assert stored["telegram_bot_token"] == "8123456789:AAHrealtoken"
    assert stored["telegram_chat_id"] == "424242"

    status = client.get("/api/features/telegram/status", headers=headers).json()
    assert status["connected"] is True
    assert status["chat_id"] == "424242"
    # The hint identifies the bot without exposing the token.
    assert status["bot_hint"] == "…oken"
    assert "8123456789" not in str(status)

    test_res = client.post("/api/features/telegram/test", json={}, headers=headers)
    assert test_res.status_code == 200

    off = client.post("/api/features/telegram/disconnect", json={}, headers=headers)
    assert off.status_code == 200
    assert off.json()["connected"] is False
    stored = _stored_settings()
    assert "telegram_bot_token" not in stored
    assert "telegram_chat_id" not in stored


def test_test_endpoint_fails_loudly_when_not_connected(client):
    """Previously this returned 200 with a "(simulated)" success string."""
    headers = _auth_headers(client)
    res = client.post("/api/features/telegram/test", json={}, headers=headers)
    assert res.status_code == 400
    assert "not connected" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_send_message_reports_missing_credentials_without_network():
    result = await TelegramNotifier.send_message(User(settings={}), "hi")
    assert result["sent"] is False
    assert "not connected" in result["detail"].lower()


def test_is_configured_requires_both_halves():
    assert TelegramNotifier.is_configured(User(settings={})) is False
    assert TelegramNotifier.is_configured(User(settings={"telegram_bot_token": "t"})) is False
    assert TelegramNotifier.is_configured(User(settings={"telegram_chat_id": "c"})) is False
    assert TelegramNotifier.is_configured(
        User(settings={"telegram_bot_token": "t", "telegram_chat_id": "c"})
    ) is True
    # Whitespace-only values are not credentials.
    assert TelegramNotifier.is_configured(
        User(settings={"telegram_bot_token": "  ", "telegram_chat_id": "c"})
    ) is False
