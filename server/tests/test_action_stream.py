"""09-15: Launch to Doc action stream — the server emits the primitive action list,
the extension plays it with a stable executor.

These tests pin the stream contract:
  1. the replay of a stream reproduces exactly the source text (the independent
     oracle — `replay_text` is a second method that could disagree),
  2. the stream is deterministic per seed and differs across seeds,
  3. the validator accepts what the builder emits and rejects a bad op,
  4. the gear scales total wait (slow > balanced > fast) and only known ops appear,
  5. the endpoint serves a valid, replayable stream behind auth.
"""
from server.action_stream import (
    ACTION_STREAM_VERSION,
    build_action_stream,
    replay_text,
    validate_action_stream,
    PRIMITIVE_OPS,
)
from server.database import Assignment, SessionLocal, User
from server.main import app
from server.security import create_jwt_token
from fastapi.testclient import TestClient

client = TestClient(app)

TEXTS = [
    "Hello world.",
    "The quick brown fox jumps over the lazy dog.",
    "Cellular respiration occurs in three primary stages.",
    "a\nb\nc",
    "UPPER lower 12345 !@#$%",
]


def _user(public_id: str):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == public_id).first()
        if not u:
            u = User(public_id=public_id, plan="pro", credits=100.0,
                     settings={"token_balance": 500})
            db.add(u)
            db.commit()
            db.refresh(u)
        token = create_jwt_token(user_id=u.id, role="user")
        return {"Authorization": f"Bearer {token}", "X-Public-ID": public_id}, u.id
    finally:
        db.close()


# ── 1. the stream reproduces the source text exactly ──────────────────────────

def test_replay_reproduces_every_source_text():
    """The one invariant that matters: whatever typos/false-starts the stream
    inserts, it must type back to exactly the source. `replay_text` is an
    independent method — it is not derived from the generator's assumption."""
    for text in TEXTS:
        for seed in (1, 42, 1337):
            actions = build_action_stream(text, seed=seed)
            assert replay_text(actions) == text, f"seed={seed} text={text!r}"


def test_replay_reproduces_a_long_text():
    """A long, essay-like text with punctuation and newlines must survive too."""
    text = ("The mitochondria are the powerhouses of the cell.\n"
            "They convert glucose into ATP through oxidative phosphorylation.") * 4
    actions = build_action_stream(text, seed=7)
    assert replay_text(actions) == text
    assert len(actions) > len(text)      # the stream has waits, so > chars


def test_stream_is_deterministic_per_seed():
    a1 = build_action_stream("hello world", seed=99)
    a2 = build_action_stream("hello world", seed=99)
    assert a1 == a2


def test_stream_differs_across_seeds():
    a1 = build_action_stream("a long enough sentence to force divergence", seed=1)
    a2 = build_action_stream("a long enough sentence to force divergence", seed=2)
    assert a1 != a2


# ── 2. the validator ──────────────────────────────────────────────────────────

def test_builder_output_validates():
    for text in TEXTS:
        actions = build_action_stream(text, seed=3)
        ok, err = validate_action_stream(actions)
        assert ok, err


def test_validator_rejects_unknown_op():
    ok, err = validate_action_stream([{"op": "type", "ch": "a"}, {"op": "teleport", "x": 1}])
    assert not ok and "unknown op" in err


def test_validator_rejects_missing_param_and_bad_ch():
    assert not validate_action_stream([{"op": "type"}])[0]
    assert not validate_action_stream([{"op": "type", "ch": "ab"}])[0]
    assert not validate_action_stream([{"op": "wait", "ms": -1}])[0]
    assert not validate_action_stream([{"op": "mouse", "x": 1}])[0]
    assert not validate_action_stream("not a list")[0]


def test_stream_uses_only_known_ops():
    actions = build_action_stream("the quick brown fox", seed=5)
    for a in actions:
        assert a["op"] in PRIMITIVE_OPS, a


# ── 3. the gear scales the total wait ─────────────────────────────────────────

def _total_wait(actions):
    return sum(a["ms"] for a in actions if a["op"] == "wait")


def test_slow_gear_types_more_slowly_than_fast():
    text = "word " * 120
    slow = build_action_stream(text, speed=1.28, typo_rate=0.0,
                               natural_pauses=False, false_start_rate=0.0, seed=11)
    fast = build_action_stream(text, speed=0.82, typo_rate=0.0,
                               natural_pauses=False, false_start_rate=0.0, seed=11)
    assert _total_wait(slow) > _total_wait(fast)


def test_stream_carries_no_wpm_figure():
    """The stream is paced by wait ops, not by a wpm the player interprets."""
    actions = build_action_stream("hello", seed=4)
    for a in actions:
        assert "wpm" not in a


# ── 4. the endpoint ───────────────────────────────────────────────────────────

def test_stream_endpoint_requires_auth():
    assert client.post("/api/launch-to-doc/stream", json={"text": "hi"}).status_code in (401, 403)


def test_stream_endpoint_serves_a_replayable_stream():
    headers, _ = _user("test_stream_user")
    resp = client.post("/api/launch-to-doc/stream",
                       json={"text": "server drives the stream"}, headers=headers)
    assert resp.status_code == 200
    plan = resp.json()
    assert plan["status"] == "success"
    stream = plan["action_stream"]
    assert stream["stream_version"] == ACTION_STREAM_VERSION
    actions = stream["actions"]
    ok, err = validate_action_stream(actions)
    assert ok, err
    assert replay_text(actions) == "server drives the stream"


def test_stream_endpoint_reuses_the_plan_contract():
    """The stream endpoint is the plan + actions; the plan half must be intact."""
    headers, _ = _user("test_stream_plan_user")
    resp = client.post("/api/launch-to-doc/stream",
                       json={"text": "hi", "preset_id": "slow"}, headers=headers)
    assert resp.status_code == 200
    plan = resp.json()
    assert plan["typing"]["speed"] == 1.28
    assert plan["target"]["url"] == "https://docs.new"
    assert "action_stream" in plan
