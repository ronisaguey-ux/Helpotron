"""Regression tests: My Agent 'generate flashcards' flow (operator 08-27).

The old execute_task_action path built StudyMaterial with `type=`/`title=`
kwargs (invalid — the model column is `kind` and there is no title column),
which TypeError'd every chat flashcard request into a 500. These tests pin
the fixed behavior: real card generation, canonical {q, a} storage, and the
material landing in the library.
"""
import json

import pytest
from fastapi.testclient import TestClient

from server import llm
from server.database import SessionLocal, User
from server.main import app
from server.security import create_jwt_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_ratelimiter(client):
    from server import ratelimit
    ratelimit.limiter._hits.clear()
    client.cookies.clear()
    yield
    ratelimit.limiter._hits.clear()
    client.cookies.clear()


def _elite_auth(public_id: str) -> dict:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(
                public_id=public_id,
                plan="elite",
                credits=0.0,
                settings={"2fa_enabled": True,
                          "token_balance": 100.0,
                          "operation_mode": "auto",
                          "auto_approved_actions": ["generate_flashcards"]},
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_jwt_token({"sub": user.id, "public_id": user.public_id})
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


# Fake LLM: intent resolution returns the generate_flashcards action;
# the deck-builder call returns a {q, a} JSON array.
def _make_fake_llm():
    async def fake_llm(*args, **kwargs):
        up = kwargs.get("user_prompt") or (args[0] if args else "")
        if isinstance(up, str) and "Create 20 flashcards" in up:
            return '[{"q": "Who delays?", "a": "Hamlet."}]'
        return json.dumps({
            "action": "generate_flashcards",
            "payload": {"title": "Hamlet Deck", "prompt": "Hamlet delays."},
            "reply": "Generating flashcards…",
        })
    return fake_llm


def test_agent_chat_generate_flashcards_returns_deck(client, monkeypatch):
    monkeypatch.setattr(llm, "call_llm", _make_fake_llm())
    auth = _elite_auth("fc_agent_deck")

    r = client.post("/api/agent/chat", json={"assignment_id": 0, "text": "generate flashcards on Hamlet"}, headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "success", data
    assert data["execution"]["action"] == "generate_flashcards"
    assert data["execution"]["status"] == "completed"
    assert data["execution"]["cards_count"] == 1
    assert data["execution"]["cards"][0] == {"q": "Who delays?", "a": "Hamlet."}
    material_id = data["execution"]["material_id"]

    # The deck is real: it lands in the library as kind=flashcards, list-of-cards.
    mats = client.get(f"/api/materials/fc_agent_deck/all", headers=auth).json()["materials"]
    deck = next((m for m in mats if m["id"] == material_id), None)
    assert deck is not None
    assert deck["kind"] == "flashcards"
    assert deck["content"] == [{"q": "Who delays?", "a": "Hamlet."}]


def test_agent_chat_flashcards_intent_cards_normalize(client, monkeypatch):
    """The LLM intent may carry {front, back} cards — they must normalize to
    {q, a} (canonical deck shape) and not 500."""
    async def fake_llm(*args, **kwargs):
        return json.dumps({
            "action": "generate_flashcards",
            "payload": {"title": "Bio Deck", "cards": [
                {"front": "What is mitosis?", "back": "Cell division producing two identical nuclei."}]},
            "reply": "ok",
        })
    monkeypatch.setattr(llm, "call_llm", fake_llm)
    auth = _elite_auth("fc_agent_frontback")

    r = client.post("/api/agent/chat", json={"assignment_id": 0, "text": "flashcards about mitosis"}, headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["execution"]["cards"] == [
        {"q": "What is mitosis?", "a": "Cell division producing two identical nuclei."}
    ]


def test_agent_chat_flashcards_failure_is_honest_note(client, monkeypatch):
    """LLM unavailable (no deck possible) → in-band failed status, never a 500."""
    async def fake_llm(*args, **kwargs):
        up = kwargs.get("user_prompt") or (args[0] if args else "")
        if isinstance(up, str) and "Create 20 flashcards" in up:
            raise RuntimeError("llm down")
        return json.dumps({"action": "generate_flashcards", "payload": {"title": "X"}, "reply": "ok"})
    monkeypatch.setattr(llm, "call_llm", fake_llm)
    auth = _elite_auth("fc_agent_fail")

    r = client.post("/api/agent/chat", json={"assignment_id": 0, "text": "flashcards now"}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["execution"]["status"] == "failed"
    assert "flashcards" in r.json()["execution"]["message"].lower()
