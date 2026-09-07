"""09-07 (Job 2): approval protocol — decision set allow | deny | neutral.

Protocol (same core for BOTH surfaces, shared _apply_approval_decision):
  * allow/approve  -> execute the pending action (allow + autoAdd also stores
    the action TYPE in user.settings['auto_approved_actions'] so the next
    identical request auto-allows silently — no prompt).
  * deny/reject    -> hard no: action never runs.
  * neutral/message-> action NOT performed; the user's text is injected into
    the agent thread as a follow-up instruction (user turn); the request STAYS
    pending (the agent may re-request it or continue the plan without it).
    text is REQUIRED for neutral -> blank neutral is a 400 the UI can block.
  * unknown reqId  -> ignored safely (404, nothing mutated).

Surfaces under test: /api/agent/permission/respond (web) and
/api/extension/approval/respond (extension, reqId-keyed).
"""
import pytest

from server.database import SessionLocal, User, init_db
from server.overlord_agent import overlord_agent
from server.security import create_jwt_token

init_db()


def _make_user(public_id: str, settings=None):
    """Create/update a user; returns (headers, user)."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(
                public_id=public_id,
                plan="basic",
                credits=100.0,
                settings={**(settings or {}), "2fa_enabled": True,
                           "token_balance": 500},
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            merged = {**(settings or {}), "2fa_enabled": True,
                      "token_balance": (settings or {}).get("token_balance", 500)}
            user.settings = merged
            db.commit()
            db.refresh(user)
        token = create_jwt_token({"sub": user.id, "public_id": user.public_id})
        return {"Authorization": f"Bearer {token}"}, user
    finally:
        db.close()


def _pending(user, action_type="submit_assignment", assignment_id=None):
    perm = overlord_agent.create_pending_permission(
        user_public_id=user.public_id,
        action_type=action_type,
        title=f"Permission Required: {action_type.replace('_', ' ').title()}",
        description=f"Authorize '{action_type}'?",
        payload={"text": "do it", "assignment_id": assignment_id},
        assignment_id=assignment_id,
    )
    return perm


class _Calls:
    def __init__(self):
        self.entries = []


@pytest.fixture()
def recorder(monkeypatch):
    calls = _Calls()

    async def fake_execute(db, user=None, action_type=None, payload=None,
                           assignment_id=None, node="my_agent", **kw):
        calls.entries.append({
            "action_type": action_type, "assignment_id": assignment_id, "user": user,
        })
        return {"status": "success", "message": f"ran {action_type}"}

    monkeypatch.setattr(overlord_agent, "execute_task_action", fake_execute)
    return calls


# ─── extension surface: /api/extension/approval/respond ──────────────────────

def test_extension_allow_executes_pending_action(client, unique_user, recorder):
    headers, user = _make_user(unique_user)
    perm = _pending(user)
    resp = client.post("/api/extension/approval/respond",
                       json={"reqId": perm["id"], "decision": "allow"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["decision"] == "approve"
    assert len(recorder.entries) == 1
    assert recorder.entries[0]["action_type"] == "submit_assignment"
    assert overlord_agent._pending_permissions[perm["id"]]["status"] == "approved"


def test_extension_deny_rejects_and_never_executes(client, unique_user, recorder):
    headers, user = _make_user(unique_user)
    perm = _pending(user)
    resp = client.post("/api/extension/approval/respond",
                       json={"reqId": perm["id"], "decision": "deny", "text": "nope"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rejected"
    assert data["decision"] == "reject"
    assert recorder.entries == []
    assert overlord_agent._pending_permissions[perm["id"]]["status"] == "rejected"


def test_extension_neutral_routes_text_back_not_executed_stays_pending(client, unique_user, recorder):
    headers, user = _make_user(unique_user)
    thread_key = 4242
    perm = _pending(user, assignment_id=thread_key)
    resp = client.post("/api/extension/approval/respond",
                       json={"reqId": perm["id"], "decision": "neutral",
                             "text": "Skip the submit; write the summary instead."},
                       headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "neutral"
    assert data["decision"] == "neutral"
    assert data["request_status"] == "still_pending"
    assert data["message"] == "Skip the submit; write the summary instead."
    # action NOT executed
    assert recorder.entries == []
    # request STAYS pending (not a hard no)
    assert overlord_agent._pending_permissions[perm["id"]]["status"] == "pending"
    # user's text is now a turn in the agent thread (the follow-up instruction)
    history = overlord_agent.get_chat_history(thread_key, user=user)
    texts = [m["text"] for m in history]
    assert any("Skip the submit; write the summary instead." == t for t in texts)
    assert any("still pending approval" in t for t in texts)


def test_extension_neutral_without_text_is_400(client, unique_user):
    headers, user = _make_user(unique_user)
    perm = _pending(user)
    resp = client.post("/api/extension/approval/respond",
                       json={"reqId": perm["id"], "decision": "neutral"}, headers=headers)
    assert resp.status_code == 400
    resp2 = client.post("/api/extension/approval/respond",
                        json={"reqId": perm["id"], "decision": "neutral", "text": "   "},
                        headers=headers)
    assert resp2.status_code == 400


def test_extension_message_alias_behaves_like_neutral(client, unique_user, recorder):
    headers, user = _make_user(unique_user)
    perm = _pending(user, assignment_id=777)
    resp = client.post("/api/extension/approval/respond",
                       json={"req_id": perm["id"], "decision": "message",
                             "text": "different plan, not the submit"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "neutral"
    assert recorder.entries == []
    assert overlord_agent._pending_permissions[perm["id"]]["status"] == "pending"


def test_extension_allow_auto_add_persists_type_and_next_gate_skips_prompt(client, unique_user, recorder):
    headers, user = _make_user(unique_user)
    perm = _pending(user)
    resp = client.post("/api/extension/approval/respond",
                       json={"reqId": perm["id"], "decision": "allow",
                             "autoAdd": True, "text": "this and all future ones"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["auto_added"] is True

    # persisted where the owner asked: the user's settings JSON store, same
    # field the permission engine consults FIRST on every future gate
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.id == user.id).first()
        assert "submit_assignment" in (row.settings or {}).get("auto_approved_actions", [])
    finally:
        db.close()

    # now the very gate the agent hits before asking: silently auto-allowed
    # (reload from DB — a new request would read the persisted settings too)
    from server.overlord_agent import permission_engine
    db2 = SessionLocal()
    try:
        fresh = db2.query(User).filter(User.id == user.id).first()
        approved, _ = permission_engine.evaluate_action_permission(
            user_settings={**(fresh.settings or {}), "operation_mode": "manual"},
            action_type="submit_assignment",
            session_mode_override=None,
        )
    finally:
        db2.close()
    assert approved is True  # no prompt even in manual mode


def test_extension_unknown_reqid_ignored_safely(client, unique_user):
    headers, user = _make_user(unique_user)
    before = len(overlord_agent._pending_permissions)
    resp = client.post("/api/extension/approval/respond",
                       json={"reqId": "perm_doesnotexist", "decision": "allow"}, headers=headers)
    assert resp.status_code == 404
    assert len(overlord_agent._pending_permissions) == before  # nothing mutated
    resp2 = client.post("/api/extension/approval/respond",
                        json={"reqId": "perm_doesnotexist", "decision": "neutral",
                              "text": "hi"}, headers=headers)
    assert resp2.status_code == 404


def test_extension_other_users_request_is_403(client, unique_user):
    headers_a, user_a = _make_user(f"{unique_user}_a")
    _headers_b, user_b = _make_user(f"{unique_user}_b")
    perm = _pending(user_a)
    resp = client.post("/api/extension/approval/respond",
                       json={"reqId": perm["id"], "decision": "deny"}, headers=_headers_b)
    assert resp.status_code == 403


def test_extension_req_id_missing_is_422(client, unique_user):
    headers, _user = _make_user(unique_user)
    resp = client.post("/api/extension/approval/respond",
                       json={"decision": "allow"}, headers=headers)
    assert resp.status_code == 422


# ─── web surface: /api/agent/permission/respond (same core, stable protocol) ──

def test_web_allow_alias_still_executes(client, unique_user, recorder):
    headers, user = _make_user(unique_user, settings={"operation_mode": "manual"})
    perm = _pending(user)
    resp = client.post("/api/agent/permission/respond",
                       json={"permission_id": perm["id"], "decision": "allow"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert [e["action_type"] for e in recorder.entries] == ["submit_assignment"]


def test_web_deny_alias_still_rejects(client, unique_user, recorder):
    headers, user = _make_user(unique_user, settings={"operation_mode": "manual"})
    perm = _pending(user)
    resp = client.post("/api/agent/permission/respond",
                       json={"permission_id": perm["id"], "decision": "deny"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    assert recorder.entries == []


def test_web_allow_without_text_without_autoadd_is_valid(client, unique_user, recorder):
    headers, user = _make_user(unique_user, settings={"operation_mode": "manual"})
    perm = _pending(user)
    resp = client.post("/api/agent/permission/respond",
                       json={"permission_id": perm["id"], "decision": "allow"}, headers=headers)
    assert resp.status_code == 200
    assert len(recorder.entries) == 1
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.id == user.id).first()
        assert "submit_assignment" not in (row.settings or {}).get(
            "auto_approved_actions", [])
    finally:
        db.close()


def test_web_neutral_without_text_is_400(client, unique_user):
    headers, user = _make_user(unique_user, settings={"operation_mode": "manual"})
    perm = _pending(user)
    resp = client.post("/api/agent/permission/respond",
                       json={"permission_id": perm["id"], "decision": "neutral", "text": ""},
                       headers=headers)
    assert resp.status_code == 400


def test_web_unknown_permission_id_404(client, unique_user):
    headers, _user = _make_user(unique_user)
    resp = client.post("/api/agent/permission/respond",
                       json={"permission_id": "perm_doesnotexist", "decision": "allow"},
                       headers=headers)
    assert resp.status_code == 404


# ─── the approval_request card payload on the agent_chat surfaces ─────────────

def test_extension_agent_chat_permission_required_carries_approval_request(client, unique_user, monkeypatch):
    """The card payload the popup renders: {req_id, title, summary} — and the
    legacy permission_request key stays in place (stability)."""
    headers, _user = _make_user(unique_user, settings={"operation_mode": "manual"})

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None):
        return {"action": "submit_assignment", "payload": {"assignment_id": 1},
                "force_permission": False, "reply": "ok"}

    import server.routes_overlord as _ro
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)

    resp = client.post("/api/extension/agent_chat", json={"text": "submit it"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "permission_required"
    req = data.get("approval_request")
    assert isinstance(req, dict)
    assert set(req.keys()) == {"req_id", "title", "summary"}
    assert req["req_id"] == data["permission_request"]["id"]
    assert req["title"] == data["permission_request"]["title"]
    assert req["summary"] == data["permission_request"]["description"]


def test_web_agent_chat_permission_required_carries_approval_request(client, unique_user):
    """Same card payload on the web chat surface (both surfaces served)."""
    headers, _user = _make_user(unique_user, settings={
        "operation_mode": "auto", "token_balance": 500})
    resp = client.post("/api/agent/chat",
                       json={"assignment_id": 0, "text": "Submit assignment."}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "permission_required"
    req = data.get("approval_request")
    assert isinstance(req, dict)
    assert set(req.keys()) == {"req_id", "title", "summary"}
    assert req["req_id"] == data["permission_request"]["id"]
