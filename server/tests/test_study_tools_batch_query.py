"""Test proving LAT-02: batch StudyCardState queries to eliminate N+1 latency in routes_study_tools.py."""
import pytest


def test_study_card_state_batching():
    with open("server/routes_study_tools.py", "r", encoding="utf-8") as f:
        content = f.read()
    assert "StudyCardState.material_id.in_" in content, "StudyCardState queries not batched with .in_()"
    assert "for m in materials:" in content
    loop_body = content.split("for m in materials:")[1].split("return {\"decks\":")[0]
    assert "db.query(StudyCardState)" not in loop_body, "db.query(StudyCardState) still inside materials loop (N+1)"
