"""API contract tests for the Helpotron backend."""
import asyncio
import json

import pytest

from server import study_tools


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_upsert_assignment_and_status(client, unique_user, auth_headers):
    r = client.post("/api/assignments", json={
        "public_id": unique_user, "canvas_id": "42", "title": "Essay on Hamlet",
        "due_date": "2026-09-01", "prompt": "Analyze the soliloquy.", "file_urls": ["https://x/files/1"],
    }, headers=auth_headers)
    assert r.status_code == 200
    assignment_id = r.json()["assignment_id"]

    # same canvas_id -> upsert, not duplicate
    r2 = client.post("/api/assignments", json={
        "public_id": unique_user, "canvas_id": "42", "title": "Essay on Hamlet (revised)",
        "due_date": "2026-09-01", "prompt": "Analyze the soliloquy.", "file_urls": [],
    }, headers=auth_headers)
    assert r2.json()["assignment_id"] == assignment_id

    status = client.get(f"/api/status/{unique_user}", headers=auth_headers).json()
    assert len(status["assignments"]) == 1
    assert status["assignments"][0]["status"] == "tracked"


def test_material_requires_credits_then_succeeds(client, unique_user, auth_headers, monkeypatch):
    async def fake_llm(system, user, **kwargs):
        return "A study guide about Hamlet."
    monkeypatch.setattr(study_tools.llm, "call_llm", fake_llm)

    body = {"public_id": unique_user, "transcript_text": "Hamlet delays. The ghost speaks."}
    r = client.post("/api/study-guide", json=body, headers=auth_headers)
    assert r.status_code == 402  # no credits on a fresh basic user

    # top up via a stripe provider (only stripe gets instant credits now)
    pay = client.post("/api/payments", json={"public_id": unique_user, "provider": "stripe", "amount_cents": 500}, headers=auth_headers)
    assert pay.status_code == 200
    assert pay.json()["status"] == "captured"

    r = client.post("/api/study-guide", json=body, headers=auth_headers)
    assert r.status_code == 200
    assert "Hamlet" in r.json()["content"]
    assert r.json()["model_used"] is None  # call_llm returns str (BATCH-02)

    # cost ledger: study_guide costs 2 credits (TASK_COSTS)
    assert client.get(f"/api/credits/{unique_user}", headers=auth_headers).json()["credits"] == 3.0


def test_flashcards_json_retry_then_parse(client, unique_user, auth_headers, monkeypatch):
    calls = {"n": 0}

    async def flaky_llm(system, user, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return 'Sure! ```json\nnot valid json\n```'
        return '[{"q": "Who delays?", "a": "Hamlet"}]'

    monkeypatch.setattr(study_tools.llm, "call_llm", flaky_llm)
    client.post("/api/payments", json={"public_id": unique_user, "provider": "stripe", "amount_cents": 200}, headers=auth_headers)

    r = client.post("/api/flashcards", json={"public_id": unique_user, "transcript_text": "Hamlet delays."}, headers=auth_headers)
    assert r.status_code == 200
    cards = r.json()["content"]
    assert cards[0]["q"] == "Who delays?"
    assert calls["n"] == 2


def test_generate_stream_sse_progress_events(client, unique_user, auth_headers, monkeypatch):
    """FIX B3: /api/generate/stream/{kind} emits 4 real-time progress events
    (Parsing syllabus -> Extracting key concepts -> Generating -> Verifying
    accuracy) then a done event; failures surface as in-band error events
    on a 200 SSE response instead of an HTTP error body."""
    async def fake_llm(system, user, **kwargs):
        return '[{"q": "Q1?", "a": "A1."}, {"q": "Q2?", "a": "A2."}]'
    monkeypatch.setattr(study_tools.llm, "call_llm", fake_llm)

    body = {"public_id": unique_user, "transcript_text": "Hamlet delays."}

    # fresh user has no credits -> error event in-band (SSE contract: 200 + error frame)
    r = client.post("/api/generate/stream/flashcards", json=body, headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert '"event": "error"' in r.text
    assert "insufficient credits" in r.text

    # top up (stripe: 500 cents = 5 credits) and re-run
    pay = client.post("/api/payments", json={"public_id": unique_user, "provider": "stripe", "amount_cents": 500}, headers=auth_headers)
    assert pay.status_code == 200

    r = client.post("/api/generate/stream/flashcards", json=body, headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")

    frames = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    kinds = [f["event"] for f in frames]
    assert kinds == ["progress", "progress", "progress", "progress", "done"], kinds

    steps = [f["step"] for f in frames[:-1]]
    labels = [f["label"] for f in frames[:-1]]
    assert steps == [1, 2, 3, 4]
    assert labels[0] == "Parsing syllabus"
    assert labels[1] == "Extracting key concepts"
    assert labels[2] == "Generating flashcards"
    assert labels[3] == "Verifying accuracy"

    material = frames[-1]["material"]
    assert material["kind"] == "flashcards"
    # _material_payload pre-parses JSON kinds: content is already the list
    assert material["content"] == [{"q": "Q1?", "a": "A1."}, {"q": "Q2?", "a": "A2."}]

    # unknown kind -> plain 404 (not an SSE stream)
    bad = client.post("/api/generate/stream/bogus", json=body, headers=auth_headers)
    assert bad.status_code == 404


def test_generation_failure_credits_back(client, unique_user, auth_headers, monkeypatch):
    async def broken_llm(system, user, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(study_tools.llm, "call_llm", broken_llm)
    client.post("/api/payments", json={"public_id": unique_user, "provider": "stripe", "amount_cents": 300}, headers=auth_headers)

    r = client.post("/api/summary", json={"public_id": unique_user, "transcript_text": "some lecture"}, headers=auth_headers)
    assert r.status_code == 500
    assert client.get(f"/api/credits/{unique_user}", headers=auth_headers).json()["credits"] == 3.0  # unchanged


def test_discount_program(client, unique_user, auth_headers):
    d1 = client.post("/api/discount", json={"public_id": unique_user, "payload": {"grades": "anonymized"}}, headers=auth_headers)
    assert d1.status_code == 200
    assert d1.json()["discount_balance"] == 1.0
    assert d1.json()["next_purchase_discount"] == 1.0

    pay = client.post("/api/payments", json={"public_id": unique_user, "provider": "stripe", "amount_cents": 1000}, headers=auth_headers)
    assert pay.status_code == 200
    assert pay.json()["credits"] == 9.9  # $10 - 1% discount = 9.9 credits


def test_transcribe_without_backend_returns_clear_error(client, unique_user, auth_headers):
    # clients (extension recorder, web) send public_id as a FORM field — this
    # asserts that path works (was a query-param-only endpoint; 422 before fix)
    r = client.post(
        "/api/transcribe",
        data={"public_id": unique_user},
        files={"file": ("lecture.webm", b"not really audio", "audio/webm")},
        headers=auth_headers,
    )
    assert r.status_code == 500  # no whisper backend configured — clean error, not 422
    assert "Gemini transcription failed" in r.json()["detail"] or "Transcription is not configured" in r.json()["detail"]


def test_transcribe_accepts_query_param_too(client, unique_user, auth_headers):
    r = client.post(
        "/api/transcribe",
        params={"public_id": unique_user},
        files={"file": ("lecture.webm", b"not really audio", "audio/webm")},
        headers=auth_headers,
    )
    assert r.status_code == 500
    assert "Gemini transcription failed" in r.json()["detail"] or "Transcription is not configured" in r.json()["detail"]


def test_unknown_provider_rejected(client, unique_user, auth_headers):
    r = client.post("/api/payments", json={"public_id": unique_user, "provider": "bitcoin", "amount_cents": 100}, headers=auth_headers)
    assert r.status_code == 400
