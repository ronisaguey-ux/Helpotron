"""Test proving LEG-09: student-directed educational data posture in SECURITY.md and PrivacyPolicyView.jsx."""
import pytest


def test_ferpa_coppa_disclosures():
    with open("SECURITY.md", "r", encoding="utf-8") as f:
        sec = f.read()
    assert "student-initiated" in sec or "student-directed" in sec, "Missing student posture clarification in SECURITY.md"
    with open("web/src/components/PrivacyPolicyView.jsx", "r", encoding="utf-8") as f:
        priv = f.read()
    assert "student-directed" in priv or "student-initiated" in priv, "Missing student posture clarification in PrivacyPolicyView.jsx"
