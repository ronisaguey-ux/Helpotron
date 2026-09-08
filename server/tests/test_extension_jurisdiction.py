"""09-08 jurisdiction: a turn can put several tabs in scope, so the screen
context that reaches the agent has to say WHICH tab each frame came from, name
the tabs it could not photograph, and state that the returned control burst is
replayed in every tab in scope.

The pairing is the sharp edge: the extension sends a `tabs` entry for every tab
in scope but an image only for the ones it could capture, so frame N belongs to
the Nth captured=True tab — not to tabs[N].

Run with the pinned test DB (conftest) — never against the live :8000.
"""
from server.database import SessionLocal, User
from server.routes_extension import _tab_ref_label, ChatTabRef
from server.security import create_jwt_token


def _make_user(public_id: str, token_balance: float = 50.0):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            user = User(
                public_id=public_id,
                plan="basic",
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
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def _patch_vision_and_capture(monkeypatch):
    """Stub vision (no model call) and capture the screen context the resolver
    is handed. Returns the dict the context lands in."""
    seen = {}

    async def fake_vision(image, width=None, height=None, model_id=None):
        frames = seen.setdefault("frames", [])
        frames.append(image)
        return f"analysis-{len(frames)}"

    async def fake_resolve(user, settings, text, is_admin, db=None, target_key=None,
                           node="my_agent", assignment_context=None,
                           humanizer_ctx=None, viewport=None, screen_analysis=None, **kw):
        seen["screen_analysis"] = screen_analysis or ""
        return {"action": "plain_answer", "payload": {}, "force_permission": False,
                "reply": "ok"}

    import server.routes_extension as _rx
    import server.routes_overlord as _ro
    monkeypatch.setattr(_rx, "analyze_screen_image", fake_vision)
    monkeypatch.setattr(_ro, "_resolve_agent_intent", fake_resolve)
    return seen


# a 1x1 jpeg stands in for a captured frame; vision is stubbed so it is never read
FRAME = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="


def test_each_frame_is_labelled_with_its_tab(client, monkeypatch, unique_user):
    """Two tabs in scope, both captured: every screen line names its tab, and
    the context states the burst is replayed in all of them."""
    headers = _make_user(unique_user)
    seen = _patch_vision_and_capture(monkeypatch)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "close the banner", "agent_mode": True,
        "viewport": {"width": 1280, "height": 800},
        "images": [FRAME, FRAME],
        "tabs": [
            {"title": "Essay draft", "url": "https://docs.google.com/x", "captured": True},
            {"title": "Grades", "url": "https://classroom.google.com/y", "captured": True},
        ],
    }, headers=headers)
    assert resp.status_code == 200

    ctx = seen["screen_analysis"]
    assert 'tab 1 of 2: "Essay draft" (docs.google.com)' in ctx
    assert 'tab 2 of 2: "Grades" (classroom.google.com)' in ctx
    # the model must know one burst hits every tab, or it aims at one of them
    assert "[Jurisdiction]" in ctx
    assert "replayed in every one of those tabs" in ctx


def test_uncaptured_tab_is_named_and_does_not_shift_frame_numbering(client, monkeypatch, unique_user):
    """Middle tab could not be photographed: the two frames stay pinned to slots
    1 and 3, and the tab with no frame is stated instead of silently dropped —
    an omission reads to the model like a tab it saw and found empty."""
    headers = _make_user(unique_user + "-miss")
    seen = _patch_vision_and_capture(monkeypatch)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "click accept", "agent_mode": True,
        "viewport": {"width": 1280, "height": 800},
        "images": [FRAME, FRAME],
        "tabs": [
            {"title": "One", "url": "https://a.example.com/", "captured": True},
            {"title": "Two", "url": "https://b.example.com/", "captured": False},
            {"title": "Three", "url": "https://c.example.com/", "captured": True},
        ],
    }, headers=headers)
    assert resp.status_code == 200

    ctx = seen["screen_analysis"]
    assert 'tab 1 of 3: "One" (a.example.com)' in ctx
    assert 'tab 3 of 3: "Three" (c.example.com)' in ctx
    assert 'tab 2 of 3' not in ctx
    assert "[Not captured]" in ctx
    assert '"Two" (b.example.com)' in ctx


def test_single_tab_turn_keeps_its_plain_context(client, monkeypatch, unique_user):
    """Default jurisdiction sends no `tabs` at all: the context must look exactly
    as it did before the feature — no tab numbering, no jurisdiction note."""
    headers = _make_user(unique_user + "-solo")
    seen = _patch_vision_and_capture(monkeypatch)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "what is on my screen", "agent_mode": True,
        "viewport": {"width": 1280, "height": 800},
        "images": [FRAME],
    }, headers=headers)
    assert resp.status_code == 200

    ctx = seen["screen_analysis"]
    assert "[Screen state at" in ctx
    assert " — tab " not in ctx
    assert "[Jurisdiction]" not in ctx
    assert "[Not captured]" not in ctx


def test_one_named_tab_is_labelled_without_numbering(client, monkeypatch, unique_user):
    """A jurisdiction of exactly one tab still names it — the count would be
    noise ("tab 1 of 1") but the title is the thing the user recognises."""
    headers = _make_user(unique_user + "-one")
    seen = _patch_vision_and_capture(monkeypatch)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "read it", "agent_mode": True,
        "viewport": {"width": 1280, "height": 800},
        "images": [FRAME],
        "tabs": [{"title": "Notes", "url": "https://notes.example.com/", "captured": True}],
    }, headers=headers)
    assert resp.status_code == 200

    ctx = seen["screen_analysis"]
    assert '— "Notes" (notes.example.com)]' in ctx
    assert "tab 1 of 1" not in ctx
    assert "[Jurisdiction]" not in ctx


def test_tab_label_degrades_without_title_or_url():
    """Titles go missing on a still-loading tab and urls are stripped when the
    tab is not driveable — the label must never come back empty."""
    assert _tab_ref_label(ChatTabRef(title="Docs", url="https://docs.google.com/a")) == '"Docs" (docs.google.com)'
    assert _tab_ref_label(ChatTabRef(title="Docs", url="")) == '"Docs"'
    assert _tab_ref_label(ChatTabRef(title="", url="https://b.example.com/x")) == "b.example.com"
    assert _tab_ref_label(ChatTabRef(title="", url="")) == "unnamed tab"
    # garbage in the url field must not raise — it is attacker-reachable input
    assert _tab_ref_label(ChatTabRef(title="", url="::::")) == "unnamed tab"


def test_tabs_field_is_bounded(client, monkeypatch, unique_user):
    """`tabs` is client-supplied; an unbounded list would let one request build
    an arbitrarily long system-prompt block."""
    headers = _make_user(unique_user + "-flood")
    _patch_vision_and_capture(monkeypatch)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "hi", "agent_mode": True,
        "images": [],
        "tabs": [{"title": f"t{i}", "url": "https://x.example.com/", "captured": False}
                 for i in range(40)],
    }, headers=headers)
    assert resp.status_code == 422


def test_tabs_past_the_frame_cap_are_reported_unseen(client, monkeypatch, unique_user):
    """The server drops frames past _MAX_IMAGES_PER_CALL. A tab whose frame was
    dropped must be named as unseen — otherwise the model reasons about a tab it
    was never actually shown, which is the failure this labelling exists to stop."""
    from server.screen_vision import _MAX_IMAGES_PER_CALL

    over = _MAX_IMAGES_PER_CALL + 1
    headers = _make_user(unique_user + "-cap")
    seen = _patch_vision_and_capture(monkeypatch)

    resp = client.post("/api/extension/agent_chat", json={
        "text": "read them", "agent_mode": True,
        "viewport": {"width": 1280, "height": 800},
        "images": [FRAME] * over,
        "tabs": [{"title": f"Tab{i}", "url": f"https://t{i}.example.com/", "captured": True}
                 for i in range(over)],
    }, headers=headers)
    assert resp.status_code == 200

    ctx = seen["screen_analysis"]
    assert len(seen["frames"]) == _MAX_IMAGES_PER_CALL       # the cap held
    assert f'tab 1 of {over}: "Tab0"' in ctx
    assert "[Not captured]" in ctx
    assert f'"Tab{over - 1}"' in ctx                          # the dropped one is named
