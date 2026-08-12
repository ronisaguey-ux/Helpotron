"""API contract tests for the Helpotron backend."""
import asyncio

import pytest

from server import study_tools


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_upsert_assignment_and_status(client, unique_user):
    r = client.post("/api/assignments", json={
        "public_id": unique_user, "canvas_id": "42", "title": "Essay on Hamlet",
        "due_date": "2026-09-01", "prompt": "Analyze the soliloquy.", "file_urls": ["https://x/files/1"],
    })
    assert r.status_code == 200
    assignment_id = r.json()["assignment_id"]

    # same canvas_id -> upsert, not duplicate
    r2 = client.post("/api/assignments", json={
        "public_id": unique_user, "canvas_id": "42", "title": "Essay on Hamlet (revised)",
        "due_date": "2026-09-01", "prompt": "Analyze the soliloquy.", "file_urls": [],
    })
    assert r2.json()["assignment_id"] == assignment_id

    status = client.get(f"/api/status/{unique_user}").json()
    assert len(status["assignments"]) == 1
    assert status["assignments"][0]["status"] == "tracked"


def test_material_requires_credits_then_succeeds(client, unique_user, monkeypatch):
    async def fake_llm(system, user):
        return "A study guide about Hamlet.", "deepseek-v4-flash-free"
    monkeypatch.setattr(study_tools.llm, "call_llm", fake_llm)

    body = {"public_id": unique_user, "transcript_text": "Hamlet delays. The ghost speaks."}
    r = client.post("/api/study-guide", json=body)
    assert r.status_code == 402  # no credits on a fresh basic user

    # top up via a manual provider (cashapp) — 500 cents = 5 credits
    pay = client.post("/api/payments", json={"public_id": unique_user, "provider": "cashapp", "amount_cents": 500})
    assert pay.status_code == 200
    assert pay.json()["status"] == "manual"
    assert pay.json()["credits"] == 5.0

    r = client.post("/api/study-guide", json=body)
    assert r.status_code == 200
    assert "Hamlet" in r.json()["content"]
    assert r.json()["model_used"] == "deepseek-v4-flash-free"

    # cost ledger: 0.5 credit spent
    assert client.get(f"/api/credits/{unique_user}").json()["credits"] == 4.5


def test_flashcards_json_retry_then_parse(client, unique_user, monkeypatch):
    calls = {"n": 0}

    async def flaky_llm(system, user):
        calls["n"] += 1
        if calls["n"] == 1:
            return "Sure! ```json\nnot valid json\n```", "mimo-v2.5-free"
        return '[{"q": "Who delays?", "a": "Hamlet"}]', "deepseek-v4-flash-free"

    monkeypatch.setattr(study_tools.llm, "call_llm", flaky_llm)
    client.post("/api/payments", json={"public_id": unique_user, "provider": "zelle", "amount_cents": 200})

    r = client.post("/api/flashcards", json={"public_id": unique_user, "transcript_text": "Hamlet delays."})
    assert r.status_code == 200
    cards = r.json()["content"]
    assert cards[0]["q"] == "Who delays?"
    assert calls["n"] == 2


def test_generation_failure_credits_back(client, unique_user, monkeypatch):
    async def broken_llm(system, user):
        raise RuntimeError("boom")

    monkeypatch.setattr(study_tools.llm, "call_llm", broken_llm)
    client.post("/api/payments", json={"public_id": unique_user, "provider": "venmo", "amount_cents": 300})

    r = client.post("/api/summary", json={"public_id": unique_user, "transcript_text": "some lecture"})
    assert r.status_code == 500
    assert client.get(f"/api/credits/{unique_user}").json()["credits"] == 3.0  # unchanged


def test_discount_program(client, unique_user):
    d1 = client.post("/api/discount", json={"public_id": unique_user, "payload": {"grades": "anonymized"}})
    assert d1.status_code == 200
    assert d1.json()["discount_balance"] == 1.0
    assert d1.json()["next_purchase_discount"] == 1.0

    pay = client.post("/api/payments", json={"public_id": unique_user, "provider": "cashapp", "amount_cents": 1000})
    assert pay.status_code == 200
    assert pay.json()["credits"] == 9.9  # $10 - 1% discount = 9.9 credits


def test_transcribe_without_backend_returns_clear_error(client, unique_user):
    # clients (extension recorder, web) send public_id as a FORM field — this
    # asserts that path works (was a query-param-only endpoint; 422 before fix)
    r = client.post(
        "/api/transcribe",
        data={"public_id": unique_user},
        files={"file": ("lecture.webm", b"not really audio", "audio/webm")},
    )
    assert r.status_code == 500  # no whisper backend configured — clean error, not 422
    assert "WHISPER_API_KEY" in r.json()["detail"]


def test_transcribe_accepts_query_param_too(client, unique_user):
    r = client.post(
        "/api/transcribe",
        params={"public_id": unique_user},
        files={"file": ("lecture.webm", b"not really audio", "audio/webm")},
    )
    assert r.status_code == 500
    assert "WHISPER_API_KEY" in r.json()["detail"]


def test_unknown_provider_rejected(client, unique_user):
    r = client.post("/api/payments", json={"public_id": unique_user, "provider": "bitcoin", "amount_cents": 100})
    assert r.status_code == 400
