"""IDOR regression tests for the study-tool endpoints (sweep#2 S1-2).

Before the fix, ``review``/``grade``/``mastery`` fetched a StudyMaterial with
``filter(StudyMaterial.id == material_id)`` and no user predicate, so any
authenticated user could read another user's quiz — including the correct
answers in ``content`` — just by enumerating ids.

These tests are written to FAIL against that behaviour and pass against the
ownership check, and they also pin the sharing rule so the fix cannot be
tightened into "owner only" and silently break ``shared_with``.
"""
import json

from server.database import SessionLocal, StudyMaterial, User
from server.tests.test_study_tools_v3 import _auth_headers

CARDS = [
    {"front": "Q1", "back": "A1", "answer": "A1"},
    {"front": "Q2", "back": "A2", "answer": "A2"},
]


def _make_user(public_id: str) -> int:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if user is None:
            user = User(public_id=public_id, plan="basic", credits=20.0, settings={})
            db.add(user)
            db.commit()
            db.refresh(user)
        return user.id
    finally:
        db.close()


def _make_material(owner_id: int, shared_with=None) -> int:
    db = SessionLocal()
    try:
        m = StudyMaterial(
            user_id=owner_id,
            kind="practice_test",
            content=json.dumps({"questions": CARDS, "cards": CARDS}),
            model_used="deepseek-v4.1-flash",
            shared_with=shared_with or [],
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        return m.id
    finally:
        db.close()


def test_other_user_cannot_read_quiz_answers(monkeypatch):
    """The core IDOR: a stranger must not be able to grade against a foreign deck."""
    owner = _make_user("idor_owner")
    material_id = _make_material(owner)
    attacker_headers = _auth_headers("idor_attacker")

    for path in (
        f"/api/study/mastery/{material_id}",
    ):
        r = _client().get(path, headers=attacker_headers)
        assert r.status_code == 404, f"{path} leaked another user's material"

    r = _client().post(
        f"/api/study/quiz/{material_id}/grade",
        headers=attacker_headers,
        json={"answers": [{"question_index": 0, "selected_answer": "A1"}]},
    )
    assert r.status_code == 404, "grade endpoints leaked another user's quiz"

    r = _client().post(
        f"/api/study/decks/{material_id}/review",
        headers=attacker_headers,
        json={"card_index": 0, "rating": 3},
    )
    assert r.status_code == 404, "review endpoint leaked another user's deck"


def test_owner_still_has_access():
    """The fix must not lock the owner out of their own deck."""
    owner = _make_user("idor_owner_self")
    material_id = _make_material(owner)
    headers = _auth_headers("idor_owner_self")

    r = _client().get(f"/api/study/mastery/{material_id}", headers=headers)
    assert r.status_code == 200, "owner lost access to their own material"


def test_shared_with_still_grants_access():
    """`shared_with` is honoured elsewhere; the IDOR fix must not break it."""
    owner = _make_user("idor_share_owner")
    friend = _make_user("idor_share_friend")
    material_id = _make_material(owner, shared_with=[friend])
    headers = _auth_headers("idor_share_friend")

    r = _client().get(f"/api/study/mastery/{material_id}", headers=headers)
    assert r.status_code == 200, "a shared material was wrongly denied"


def _client():
    from server.tests.test_study_tools_v3 import client

    return client
