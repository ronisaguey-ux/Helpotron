"""Regression test (operator 08-31): the practice_quiz finalize merged per-chunk
decks with the flashcards {q,a} shape, so a chunk's answer field (the quiz
shape is {q, options, answer, explain}) read as "" for every question and the
whole deck was dropped — combined stayed empty and the route reported
'finalized_no_content' even when every LLM chunk was valid JSON.

The merged material must preserve the full quiz shape so LibraryView can
render options/answer/explain."""
import json

import server.llm as llm
from server.database import SessionLocal, Assignment, StudyMaterial, UniversalDumpItem, User
from server.security import create_jwt_token


def test_finalize_practice_quiz_preserves_quiz_shape(client, unique_user, monkeypatch):
    calls = {"n": 0}

    async def fake_quiz_llm(system_prompt, user_prompt, **kwargs):
        calls["n"] += 1
        return json.dumps([
            {
                "q": f"Where do light reactions occur? ({calls['n']})",
                "options": ["Stroma", "Thylakoid membrane", "Cytoplasm", "Matrix"],
                "answer": "Thylakoid membrane",
                "explain": "The light-dependent reactions take place in the thylakoid membranes.",
            }
        ])

    monkeypatch.setattr(llm, "call_llm", fake_quiz_llm)

    db = SessionLocal()
    try:
        user = User(public_id=unique_user, plan="elite", credits=100.0)
        db.add(user)
        db.commit()
        db.refresh(user)
        assignment = Assignment(
            user_id=user.id, title="Photosynthesis deck",
            prompt="photosynthesis converts light into chemical energy",
            status="tracked",
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        item = UniversalDumpItem(
            user_id=user.id,
            file_name="photosynthesis.pptx",
            file_type="document",
            file_size_bytes=1024,
            file_path="/nonexistent",
            status="pending_analysis",
            extracted_text=("Light reactions occur in the thylakoid membrane. " * 200),
            matched_assignment_id=assignment.id,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        item_id = item.id
        assignment_id = assignment.id
        token = create_jwt_token({"sub": user.id, "public_id": unique_user})
        headers = {"Authorization": f"Bearer {token}"}
    finally:
        db.close()

    res = client.post(
        f"/api/dump/{item_id}/finalize",
        json={"action": "practice_quiz"},
        headers=headers,
    )
    body = res.json()
    assert res.status_code == 200, body
    # The whole point: generation must produce material now.
    assert body.get("generated") is True, body
    assert body.get("material_id") is not None, body
    assert calls["n"] >= 1

    db = SessionLocal()
    try:
        mat = db.query(StudyMaterial).filter(StudyMaterial.id == body["material_id"]).first()
        assert mat is not None
        assert mat.kind == "practice_test"
        assert mat.assignment_id == assignment_id
        deck = json.loads(mat.content)
        assert isinstance(deck, list) and len(deck) == calls["n"]
        for card in deck:
            assert card["q"] and card["answer"]
            assert isinstance(card["options"], list) and len(card["options"]) == 4
            assert "explain" in card  # full quiz shape survives the merge
    finally:
        db.close()
