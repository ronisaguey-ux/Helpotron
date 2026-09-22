"""Test proving LEG-04: legal entity disclosure in TermsOfServiceView and PrivacyPolicyView."""
import pytest


def test_legal_entity_disclosure():
    for p in ["web/src/components/TermsOfServiceView.jsx", "web/src/components/PrivacyPolicyView.jsx"]:
        with open(p, "r", encoding="utf-8") as f:
            assert "Helpotron Autonomous Systems LLC" in f.read(), f"Missing LLC entity in {p}"
