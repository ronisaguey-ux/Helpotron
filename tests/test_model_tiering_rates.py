"""Pre-flight cost estimates must price models with the same rates we bill with.

`model_tiering.MODEL_TIERS` and `cost_tracking.MODEL_RATES` were two independent
hand-written price lists, and they had drifted: the high tier said
gemini-3.8-flash was $2.50/$7.50 per 1M while the ledger billed $1.00/$4.00 —
a 2.5x overstatement in the number a user is shown before a run, in the UI's
own "budget friendly advice" copy.

The estimate now derives from MODEL_RATES; this test keeps it that way.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_model_tiering.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters!")

import pytest

from server.cost_tracking import MODEL_RATES, _rates_for
from server.model_tiering import ModelTieringEngine


@pytest.mark.parametrize("model", ["gemini-3.1-flash-lite", "gemini-3.8-flash"])
def test_tier_costs_match_the_billing_table(model):
    tier = ModelTieringEngine.MODEL_TIERS[model]
    rates = _rates_for(model)
    assert tier["cost_per_1m_input"] == pytest.approx(rates["input"] * 1000)
    assert tier["cost_per_1m_output"] == pytest.approx(rates["output"] * 1000)


def test_high_tier_is_not_inflated_against_the_ledger():
    """Pins the specific 2.5x drift that was fixed."""
    rates = MODEL_RATES["gemini-3.8-flash"]
    tier = ModelTieringEngine.MODEL_TIERS["gemini-3.8-flash"]
    assert tier["cost_per_1m_input"] == pytest.approx(1.00), tier
    assert tier["cost_per_1m_output"] == pytest.approx(4.00), tier
    assert tier["cost_per_1m_input"] == pytest.approx(rates["input"] * 1000)


def test_estimate_for_a_task_uses_the_derived_rates():
    est = ModelTieringEngine.estimate_task_cost("humanization", word_count=1000, effort_level=9)
    assert est["selected_model"] == "gemini-3.8-flash"
    # 1400 tokens at $1.00 in / $4.00 out per 1M, both directions counted
    expected = (1400 / 1_000_000.0) * 1.00 + (1400 / 1_000_000.0) * 4.00
    assert est["model_cost_usd"] == pytest.approx(round(expected, 5))
