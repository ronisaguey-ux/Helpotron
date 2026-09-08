"""09-07: /api/extension/agent_chat semantics — token gating (insufficient_tokens),
the structured-agent-call guarantee that a deliberation monologue can never
reach the user, the viewport clamp contract on the direct browser_action
payload, and the all-or-nothing drop reporting.

Run with the pinned test DB (conftest) — never against the live :8000.
"""
from server.database import AgentChatMessage, SessionLocal, User
from server.security import create_jwt_token


def _make_user(public_id: str, token_balance: float, plan: str = "basic"):
    """Create (or update) a user and return (auth headers, numeric user id)."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(
                public_id=public_id,
                plan=plan,
                credits=100.0 if plan in ("basic", "pro", "elite") else 0.0,
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


def test_zero_balance_returns_insufficient_tokens_and_records_nothing(client, unique_user):
    """Token gate (operator 08-26 semantics): with 0 balance no LLM call, no
    execution, no persisted message — the response carries insufficient_tokens."""
    headers, uid = _make_user(unique_user, token_balance=0.0)
    resp = client.post("/api/extension/agent_chat", json={"text": "solve 1+x=2"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "insufficient_tokens"
    # message/reply are the durable chat-message record; text holds the copy
    assert "Insufficient tokens" in data["message"]["text"]
    assert data["token_balance"] == 0.0
    db = SessionLocal()
    try:
        # the gate short-circuits before the user message is recorded or any
        # action runs — only the refusal itself is persisted (by design).
        user_rows = db.query(AgentChatMessage).filter(
            AgentChatMessage.user_id == uid, AgentChatMessage.sender == "user",
        ).count()
        assert user_rows == 0
        refusal = db.query(AgentChatMessage).filter(
            AgentChatMessage.user_id == uid, AgentChatMessage.sender == "overlord",
        ).all()
        assert refusal and "Insufficient tokens" in (refusal[0].text or "")
    finally:
        db.close()


def test_plain_answer_reply_never_leaks_think_monologue(client, monkeypatch, unique_user):
    """A structured agent call resolving to plain_answer must never deliver
    <think> blocks or the rules-monologue to the user — stripped in the route."""
    headers, _uid = _make_user(unique_user, token_balance=5.0)

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None, **kw):
        # the real caller's viewport default must be forwarded
        assert viewport == {"width": 1280, "height": 800}
        return {
            "action": "plain_answer",
            "payload": {},
            "force_permission": False,
            "reply": (
                "<think>We need to follow the system's rules. The instruction says "
                "use sandboxed math. The user says: solve 1+1.</think>The answer is 2."
            ),
        }

    import server.routes_overlord as _ro
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)

    resp = client.post("/api/extension/agent_chat",
                       json={"text": "how do i solve 1+1 mate"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "think" not in data["reply"].lower()
    assert "we need to follow" not in data["reply"].lower()
    assert "the instruction says" not in data["reply"].lower()
    assert "The answer is 2." in data["reply"]
    # one token charged on success
    assert data["token_balance"] == 4.0


def test_browser_action_payload_is_clamped_to_captured_viewport(client, monkeypatch, unique_user):
    """Direct-payload browser_action: coords clamp into the captured viewport,
    the fenced-block name list validates, and deliberate text is stripped."""
    headers, _uid = _make_user(unique_user, token_balance=5.0)

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None, **kw):
        return {
            "action": "browser_action",
            "payload": {"actions": [
                {"op": "move", "x": 99999, "y": -5},
                {"op": "click", "x": 500, "y": 400, "button": "left"},
                {"op": "type", "text": "hi"},
                {"op": "key", "key": "Enter", "modifiers": []},
                {"op": "scroll", "x": 10, "y": 10, "deltaX": 0, "deltaY": 240},
            ]},
            "force_permission": False,
            "reply": "<think>planning the move</think>Moved and clicked.",
        }

    import server.routes_overlord as _ro
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "click the search bar", "agent_mode": True,
        "viewport": {"width": 400, "height": 300},
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    acts = data["control_actions"]
    assert len(acts) == 5
    # clamped to (width-1, height-1) / (0, 0)
    assert acts[0] == {"op": "move", "x": 399, "y": 0}
    assert acts[1] == {"op": "click", "x": 399, "y": 299, "button": "left"}
    assert acts[3] == {"op": "key", "key": "Enter", "modifiers": []}
    assert "planning" not in data["reply"]
    assert data["execution"]["actions_count"] == 5
    assert data["token_balance"] == 4.0


def test_browser_action_invalid_burst_drops_all_and_reports_failed(client, monkeypatch, unique_user):
    """One invalid op anywhere in the direct payload => the WHOLE burst drops;
    the response must report it honestly (failed, 0 actions), never success."""
    headers, _uid = _make_user(unique_user, token_balance=5.0)

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None, **kw):
        return {
            "action": "browser_action",
            "payload": {"actions": [
                {"op": "move", "x": 10, "y": 10},
                {"op": "explode", "x": 1, "y": 1},  # not on the allowlist
            ]},
            "force_permission": False,
            "reply": "Going to move.",
        }

    import server.routes_overlord as _ro
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "move the mouse", "agent_mode": True,
        "viewport": {"width": 640, "height": 480},
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["control_actions"] is None
    assert data["execution"]["status"] == "failed"
    assert data["execution"]["actions_count"] == 0


def test_browser_search_with_math_query_never_intercepted_by_shell(client, unique_user):
    """'search inside my tab, how to solve 1+1' or 'search in my searchbar, how to solve 1+x=2'
    must NEVER be intercepted by _extract_shell_query into a failing math bash command.
    It must resolve to browser_action with real control actions."""
    from server.routes_overlord import _extract_shell_query

    t1 = "search inside my tab, how to solve 1+1"
    t2 = "search in my searchbar, how to solve 1+x=2"
    assert _extract_shell_query(t1) == ""
    assert _extract_shell_query(t2) == ""

    headers, _uid = _make_user(unique_user, token_balance=5.0)
    resp = client.post("/api/extension/agent_chat", json={
        "text": t1,
        "agent_mode": True,
        "viewport": {"width": 1280, "height": 800},
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "couldn't run that computation" not in (data.get("reply") or "").lower()
    assert data["control_actions"] is not None
    assert len(data["control_actions"]) > 0
    # verify typed query is extracted cleanly
    type_actions = [a for a in data["control_actions"] if a.get("op") == "type"]
    assert len(type_actions) == 1
    assert "how to solve 1+1" in type_actions[0]["text"]



def test_plain_answer_click_fallback_does_not_crash_the_endpoint(client, monkeypatch, unique_user):
    """Regression (09-08): the plain-answer control fallback called re.search in a
    module that never imported `re`, so every agent-mode message containing
    "click"/"search"/"type in" that came back WITHOUT a fenced control block
    raised NameError and 500'd — the endpoint died on the most ordinary phrase
    the feature exists to serve. It must answer, and report the miss honestly."""
    headers, _uid = _make_user(unique_user, token_balance=5.0)

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None, **kw):
        # no ```control``` block anywhere in the reply -> the fallback runs
        return {"action": "plain_answer", "payload": {}, "force_permission": False,
                "reply": "Sure, I'll take care of that."}

    import server.routes_overlord as _ro
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "click accept", "agent_mode": True,
        "viewport": {"width": 1280, "height": 800},
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    # nothing to aim at (no frames this turn) -> stated, never silently skipped
    assert data["control_actions"] is None
    assert data["execution"]["status"] == "failed"
    assert data["execution"]["actions_count"] == 0
