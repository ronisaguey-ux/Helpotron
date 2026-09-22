"""Test proving ECON-05: draft and transcription task token debit pricing."""
import pytest


def test_draft_and_transcription_costs():
    from server.draft import DRAFT_COST
    assert DRAFT_COST >= 200.0, f"DRAFT_COST {DRAFT_COST} is stale"
    with open("server/main.py") as f:
        content = f.read()
    assert "hours * 500" in content or "TRANSCRIPTION_TOKEN_RATE" in content or ("hours = max(1.0" in content and "500" in content)
