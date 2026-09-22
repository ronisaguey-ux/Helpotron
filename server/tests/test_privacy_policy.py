"""Test proving LEG-03: Pangram Labs and Sapling AI third-party disclosures in PrivacyPolicyView.jsx."""
import pytest


def test_third_party_disclosures():
    with open("web/src/components/PrivacyPolicyView.jsx", "r", encoding="utf-8") as f:
        content = f.read()
    assert "Pangram Labs" in content, "Pangram Labs missing from PrivacyPolicyView"
    assert "Sapling" in content, "Sapling AI missing from PrivacyPolicyView"
