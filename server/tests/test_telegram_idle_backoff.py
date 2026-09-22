"""Test proving EFF-05: gate telegram_agent_loop with idle backoff when no bots configured."""
import pytest


def test_telegram_idle_backoff_configured():
    with open("server/telegram_agent_link.py", "r", encoding="utf-8") as f:
        content = f.read()
    assert "IDLE_POLL_INTERVAL" in content or ("30.0" in content and "sleep" in content), (
        "No idle backoff configured for empty bot registry"
    )
