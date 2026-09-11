"""09-10 accuracy: the live DOM element list.

The agent's control coordinates used to come only from the vision pass, which
reads them off a screenshot and therefore *guesses*. The extension now measures
the real interactive elements in the page and sends them, and this route renders
that list into the directive as the source of truth.

These tests pin the three things that make the upgrade safe:
  1. the renderer is exact about what it emits and silent about what it cannot
     parse (a malformed row must never become a bogus coordinate),
  2. an empty/absent list changes nothing (the vision path stays intact),
  3. the list actually reaches the model's system instructions.

Run with the pinned test DB (conftest) — never against the live server.
"""
from server.database import SessionLocal, User
from server.routes_extension import ExtensionChatRequest, _render_live_elements
from server.security import create_jwt_token


def _make_user(public_id: str, token_balance: float, plan: str = "basic"):
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


# ── 1. the renderer ──────────────────────────────────────────────────────────

def test_no_elements_renders_nothing():
    """Absent/empty/None all render to "" so the caller can append blindly and
    the vision-only path is bit-for-bit what it was before."""
    assert _render_live_elements(None) == ""
    assert _render_live_elements([]) == ""


def test_renders_ref_name_role_and_exact_coordinates():
    out = _render_live_elements([
        {"ref": 0, "name": "Search", "role": "searchbox", "x": 240, "y": 80, "w": 300, "h": 32},
        {"ref": 1, "name": "Sign in", "role": "button", "x": 1010, "y": 80, "w": 90, "h": 32},
    ])
    assert "LIVE DOM ELEMENTS" in out
    assert "EXACT" in out
    assert "- [0] Search (searchbox) at x=240, y=80" in out
    assert "- [1] Sign in (button) at x=1010, y=80" in out
    # the ref op form must be advertised, or the model cannot use it
    assert '"op":"click","ref":n' in out


def test_malformed_rows_are_dropped_not_guessed():
    """A row missing a name, or carrying an unparseable coordinate, must be
    dropped. Emitting x=0,y=0 for it would send the agent at the page origin —
    a silent, confident wrong click, which is worse than saying nothing."""
    out = _render_live_elements([
        {"ref": 0, "name": "Good", "role": "button", "x": 10, "y": 20},
        {"ref": 1, "name": "", "role": "button", "x": 30, "y": 40},          # no name
        {"ref": 2, "name": "Bad X", "role": "button", "x": "nope", "y": 40},  # unparseable
        {"ref": 3, "name": "Missing Y", "role": "button", "x": 50},           # no y
        "not-a-dict",                                                          # wrong type
        {"ref": 4, "name": "Also good", "role": "link", "x": 60, "y": 70},
    ])
    assert "- [0] Good (button) at x=10, y=20" in out
    assert "- [4] Also good (link) at x=60, y=70" in out
    assert "Bad X" not in out
    assert "Missing Y" not in out
    assert "not-a-dict" not in out
    assert out.count("- [") == 2


def test_missing_ref_still_renders_coordinates():
    """A ref is a convenience, not a requirement — an element without one is
    still a legitimate click target by coordinate."""
    out = _render_live_elements([{"name": "Close", "role": "button", "x": 5, "y": 6}])
    assert "- Close (button) at x=5, y=6" in out
    assert "[]" not in out


def test_caps_at_sixty_elements():
    """A dense SPA must not be able to flood the model's context."""
    many = [{"ref": i, "name": f"Btn {i}", "role": "button", "x": i, "y": i} for i in range(200)]
    out = _render_live_elements(many)
    assert out.count("- [") == 60
    assert "Btn 59" in out
    assert "Btn 60" not in out


# ── 2. the request contract ──────────────────────────────────────────────────

def test_request_accepts_elements_and_stays_backward_compatible():
    """Existing payloads (no `elements`) must remain valid — this is additive."""
    old = ExtensionChatRequest(text="hello")
    assert old.elements == []
    new = ExtensionChatRequest(
        text="click it",
        elements=[{"ref": 0, "name": "Go", "role": "button", "x": 1, "y": 2}],
    )
    assert len(new.elements) == 1
    assert new.elements[0]["name"] == "Go"


# ── 3. it actually reaches the model ─────────────────────────────────────────

def test_live_elements_reach_the_agents_instructions(client, monkeypatch, unique_user):
    """End-to-end: the measured list must land in the system instructions, in the
    same block as the tele-operation directive, or the model never sees it."""
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
        "text": "click the search box",
        "agent_mode": True,
        "execute": True,
        "seescreen": False,
        "elements": [
            {"ref": 0, "name": "Search", "role": "searchbox", "x": 240, "y": 80, "w": 300, "h": 32},
            {"ref": 1, "name": "Sign in", "role": "button", "x": 1010, "y": 80, "w": 90, "h": 32},
        ],
    }, headers=headers)

    assert resp.status_code == 200
    instr = captured["settings"]["ai"]["hierarchy"]["extensions"]["instructions"]
    assert "LIVE DOM ELEMENTS" in instr
    assert "- [0] Search (searchbox) at x=240, y=80" in instr
    assert "- [1] Sign in (button) at x=1010, y=80" in instr
    # the accuracy rule must point the model at the measured list first
    assert "LIVE DOM ELEMENTS list is measured from the page itself" in instr
    # and the ref op form must be in the allowed-ops list
    assert '"op":"click","ref":0' in instr


def test_no_elements_leaves_the_directive_unchanged(client, monkeypatch, unique_user):
    """The negative half: without a list, the block must be entirely absent —
    an empty heading would tell the model the page has no controls."""
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
        "execute": False,
        "seescreen": False,
    }, headers=headers)

    assert resp.status_code == 200
    instr = captured["settings"]["ai"]["hierarchy"]["extensions"]["instructions"]
    # The accuracy RULE names the list, so asserting on the bare phrase would
    # pass on the rule alone. Assert on the rendered BLOCK — heading plus rows —
    # which is the thing that must not appear when there is no list to show.
    assert "LIVE DOM ELEMENTS (measured from the page itself this turn" not in instr
    assert "at x=" not in instr
