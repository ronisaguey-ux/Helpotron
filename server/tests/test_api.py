"""API contract tests for the Helpotron backend."""
import asyncio
import json

import pytest

from server import study_tools


def test_new_signup_starts_with_zero_tokens(client):
    """08-31 (owner directive, late evening — supersedes both the named-only
    and universal grants): NO automatic welcome bonus. Bob: "Don't
    automatically give every new account 300 credits, run it by me here and
    give only when I approve". Signups start at 0; the approval loop grants
    via POST /api/admin/user/{public_id}/welcome-tokens."""
    from server.database import User, SessionLocal

    # Idempotent: the suite DB (sqlite:///./test_helpotron.db) persists between
    # runs, so a prior run's rows would 400 "already taken" on the next one.
    db = SessionLocal()
    try:
        db.query(User).filter(
            User.public_id.in_(["BrandNew10", "AnotherNew20"])
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

    for pid in ("BrandNew10", "AnotherNew20"):
        r = client.post("/api/signup", json={"public_id": pid, "password": "Passw0rd99"})
        assert r.status_code == 200, r.text
        assert r.json()["token_balance"] == 0.0

    db = SessionLocal()
    try:
        for pid in ("BrandNew10", "AnotherNew20"):
            u = db.query(User).filter(User.public_id == pid).first()
            assert float((u.settings or {}).get("token_balance", 0) or 0) == 0.0
    finally:
        db.close()


def test_owner_approved_welcome_tokens_grant(client):
    """08-31 (Bob's approval loop): the admin endpoint applies the 300-token
    grant only to accounts the owner approves; non-admins are rejected."""
    from server.database import User, SessionLocal
    from server.security import create_jwt_token

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.public_id == "RoniDev").first()
        if admin is None:
            admin = User(public_id="RoniDev", plan="elite", credits=100.0)
            db.add(admin)
            db.commit()
            db.refresh(admin)
        admin_token = create_jwt_token(user_id=admin.id, role="admin")
        student = db.query(User).filter(User.public_id == "BrandNew10").first()
        assert student is not None
        student_token = create_jwt_token(user_id=student.id, role="user")
    finally:
        db.close()

    # Owner-approved grant: 300 tokens land in settings.token_balance.
    r = client.post(
        "/api/admin/user/BrandNew10/welcome-tokens",
        params={"amount": 300.0},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["new_token_balance"] == 300.0

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == "BrandNew10").first()
        assert float((u.settings or {}).get("token_balance", 0) or 0) == 300.0
    finally:
        db.close()

    # A non-admin (any signed-in user) cannot grant tokens.
    r2 = client.post(
        "/api/admin/user/BrandNew10/welcome-tokens",
        params={"amount": 300.0},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert r2.status_code == 403


def test_signup_captcha_gate_when_configured(client, monkeypatch):
    """08-31 (operator): /api/signup enforces the same deny-closed Turnstile
    gate as /api/login once keys are configured — no token (or a bad one) =
    403, a valid one = created, and the operator bypass header lets test bots
    through. Purely local: siteverify is stubbed, no network involved."""
    from server import captcha
    from server.database import User, SessionLocal

    monkeypatch.setattr(captcha.settings, "turnstile_secret", "test-secret")
    monkeypatch.setattr(captcha.settings, "turnstile_sitekey", "test-sitekey")
    monkeypatch.setattr(captcha.settings, "captcha_bypass_secret", "qa-bypass-081")
    monkeypatch.setattr(
        "server.main.verify_turnstile_token",
        lambda token, ip="": token == "test-token",
    )

    db = SessionLocal()
    try:
        db.query(User).filter(User.public_id.in_(["CaptchaGate01", "CaptchaGate02"])).delete(
            synchronize_session=False)
        db.commit()
    finally:
        db.close()

    # Missing token → 403 (denied before any verification call).
    r = client.post("/api/signup", json={"public_id": "CaptchaGate01", "password": "Passw0rd99"})
    assert r.status_code == 403
    assert "Security check required" in r.json()["detail"]

    # Bad token → 403.
    r = client.post("/api/signup", json={
        "public_id": "CaptchaGate01", "password": "Passw0rd99", "turnstile_token": "wrong",
    })
    assert r.status_code == 403

    # Valid token → account created.
    r = client.post("/api/signup", json={
        "public_id": "CaptchaGate01", "password": "Passw0rd99", "turnstile_token": "test-token",
    })
    assert r.status_code == 200, r.text

    # Operator bypass header → created even with a stale token.
    r = client.post("/api/signup", json={
        "public_id": "CaptchaGate02", "password": "Passw0rd99", "turnstile_token": "stale",
    }, headers={"X-Helpotron-Captcha-Bypass": "qa-bypass-081"})
    assert r.status_code == 200, r.text


def test_memguard_stat_file_is_bytes_not_kb():
    """08-31 (operator): cgroup v2 memory.stat values are in BYTES. A 1024x
    multiplier here once inflated 'file', pressure clamped to 0, and the RAM
    queue silently never fired in production (discovered by live E2E) — this
    pins the raw unit so it can't regress."""
    from server import memguard

    stat = "anon 512000000\nfile 46926848\nkernel 41648128\n"
    assert memguard._parse_memory_stat_file(stat) == 46926848
    assert memguard._parse_memory_stat_file("anon 1\n") == 0


def test_memory_budget_queue_and_exemptions(client, monkeypatch):
    """08-31 (operator): when the server tree's memory usage sits at the 10G
    budget, NEW requests get the queue message (429, exact copy, Retry-After)
    and liveness endpoints stay 200 so the wake monitors never queue."""
    from server import memguard
    from server.database import User, SessionLocal

    budget = memguard._budget_bytes()
    # Pin the machine floor so the test never depends on this box's actual RAM.
    monkeypatch.setattr(memguard, "_box_available_bytes", lambda: 12 * 1024 * 1024 * 1024)
    db = SessionLocal()
    try:
        db.query(User).filter(User.public_id == "MemGate01").delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(memguard, "memory_usage_bytes", lambda: (budget, budget))
    r = client.post("/api/signup", json={"public_id": "MemGate01", "password": "Passw0rd99"})
    assert r.status_code == 429
    assert r.json()["detail"] == memguard.QUEUE_MESSAGE
    assert r.json()["queued"] is True
    assert r.headers.get("retry-after") == "3"

    # /health never queues — the tele-wake monitors need a fast 200.
    r = client.get("/health")
    assert r.status_code == 200

    # Under budget the request runs normally.
    monkeypatch.setattr(memguard, "memory_usage_bytes", lambda: (budget // 2, budget))
    r = client.post("/api/signup", json={"public_id": "MemGate01", "password": "Passw0rd99"})
    assert r.status_code == 200, r.text


def test_memory_budget_machine_floor(client, monkeypatch):
    """08-31 (operator): even with the app's own usage under budget, when the
    whole MACHINE is nearly out of RAM new requests queue (small box: a 10G
    app cap alone can starve everything else — Chrome, the tunnel, this
    session — before the cgroup ever binds)."""
    from server import memguard
    from server.database import User, SessionLocal

    db = SessionLocal()
    try:
        db.query(User).filter(User.public_id == "MemGate02").delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(memguard, "memory_usage_bytes", lambda: None)  # scope unreadable
    monkeypatch.setattr(memguard, "_box_available_bytes", lambda: 100 * 1024 * 1024)
    r = client.post("/api/signup", json={"public_id": "MemGate02", "password": "Passw0rd99"})
    assert r.status_code == 429
    assert r.json()["detail"] == memguard.QUEUE_MESSAGE

    # Box healthy again → the request passes the guard.
    monkeypatch.setattr(memguard, "_box_available_bytes", lambda: 6 * 1024 * 1024 * 1024)
    r = client.post("/api/signup", json={"public_id": "MemGate02", "password": "Passw0rd99"})
    assert r.status_code == 200, r.text


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
    # 09-01 (Bob): every new assignment bubble starts pending_approval — the
    # user picks a direction (do it for me / study guide / …) before work starts.
    assert status["assignments"][0]["status"] == "pending_approval"


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
