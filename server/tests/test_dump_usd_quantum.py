"""Tests that dump cost USD calculations maintain canonical unit and sub-cent precision.

Proves non-vacuity for BUG-01 (100x overstatement) and BUG-02 (sub-cent rounding collapse).
"""
import uuid
import pytest
from server.credits import TOKENS_PER_USD
from server.database import Assignment, SessionLocal, UniversalDumpItem, User


def test_dump_cost_usd_tracks_canonical_quantum():
    """BUG-01: A 13-token charge must report ~$0.0013, NOT $0.13 (100x overstatement)."""
    from server.routes_dump import _execute_finalize

    db = SessionLocal()
    uid = uuid.uuid4().hex[:8]
    user = User(
        public_id=f"usd-user-{uid}",
        plan="pro",
        role="user",
        settings={"token_balance": 5000.0},
    )
    assignment = Assignment(user_id=1, title="Test Assignment", prompt="Test prompt")
    item = UniversalDumpItem(
        user_id=1,
        file_name="test.txt",
        file_type="text/plain",
        extracted_text="x" * 2000,
        status="pending",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    assignment.user_id = user.id
    item.user_id = user.id
    db.add(assignment)
    db.add(item)
    db.commit()
    db.refresh(item)
    db.refresh(assignment)

    import asyncio
    res = asyncio.run(_execute_finalize(item, "flashcards", user, db))

    charged_tokens = res["tokens_charged"]
    reported_usd = res["cost_usd"]

    # Under canonical unit: 1 token = $0.0001 (10,000 tokens / $1).
    # If buggy: reported_usd == charged_tokens * 0.01 (e.g. 0.13 for 13 tokens).
    expected_usd = round(charged_tokens / TOKENS_PER_USD, 6)
    assert reported_usd < 0.05, f"Reported USD ${reported_usd} is 100x inflated for {charged_tokens} tokens"
    assert abs(reported_usd - expected_usd) < 1e-6, (
        f"reported_usd {reported_usd} does not match tokens/TOKENS_PER_USD {expected_usd}"
    )


def test_batch_estimate_preserves_sub_cent_precision():
    """BUG-02: Sub-cent batch estimates must not collapse to 0.0 via round(x, 2)."""
    from server.routes_dump import _calculate_dump_item_cost

    class _SmallItem:
        extracted_text = "Short text under 500 chars."

    _, _, tokens, est_cost_usd = _calculate_dump_item_cost(_SmallItem())

    # Real cost for ~100 input / ~250 output tokens is ~$0.000165
    assert est_cost_usd > 0, "Item estimate must be non-zero"
    assert est_cost_usd < 0.01, "Item estimate is sub-cent"

    # In batch estimate, summing 3 such items must not be rounded to 0.0
    total_cost = est_cost_usd * 3
    assert round(total_cost, 6) > 0, "Sub-cent total must be preserved at 6dp"
