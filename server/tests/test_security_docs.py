"""Test proving LEG-08: SECURITY.md truthfulness regarding hashing and encryption."""
import pytest


def test_security_md_truthfulness():
    with open("SECURITY.md", "r", encoding="utf-8") as f:
        content = f.read()
    assert "bcrypt" not in content, "SECURITY.md still falsely claims bcrypt"
    assert "AES-256" not in content, "SECURITY.md still falsely claims AES-256 at rest"
    assert "PBKDF2" in content
    assert "TLS 1.3" in content
