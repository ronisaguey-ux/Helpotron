"""Test proving LEG-07: referral rewards copy accurately describes billing discount credits."""
import pytest


def test_referral_rewards_copy():
    with open("web/src/components/ReferralSection.jsx", "r", encoding="utf-8") as f:
        content = f.read()
    assert "30,000 tokens" not in content, "Stale token claim in referral rewards"
    assert "billing credits" in content or "discount" in content
