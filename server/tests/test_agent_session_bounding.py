"""Test agent session step bounding and metering context."""
import asyncio
import typing
from unittest.mock import AsyncMock, patch

import pytest

from server.agent_session import AgentManager, AgentSession
from server.metering import current_meter_user, meter_user


def test_meter_user_type_hints():
    """Verify meter_user type hints do not raise NameError for Any."""
    hints = typing.get_type_hints(meter_user.__init__)
    assert "public_id" in hints
    assert hints["public_id"] is typing.Any


@pytest.mark.asyncio
async def test_agent_session_invalid_json_increments_steps():
    """Verify that invalid JSON tool call increments steps, preventing unbounded retry loops."""
    mgr = AgentManager()
    session = mgr.create(public_id="probe_user_123", assignment_id=1, instruction="test")

    mock_ws = AsyncMock()
    session.attached.set()
    session.websocket = mock_ws

    # Mock call_llm to return non-JSON string
    with patch("server.llm.call_llm", AsyncMock(return_value="not a json tool call")):
        # Run run with max steps bounded to 3 for fast test
        with patch("server.agent_session.MAX_STEPS", 3):
            await mgr.run(session)

    assert session.steps == 3
    assert session.status == "done"
    events = [entry["event"] for entry in session.log]
    assert "invalid_tool_json" in events
    assert events.count("invalid_tool_json") == 3
