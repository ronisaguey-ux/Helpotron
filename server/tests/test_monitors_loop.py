"""Test proving EFF-04: offload monitors snapshot_once to asyncio.to_thread."""
import pytest


def test_monitors_async_offload():
    with open("server/monitors.py", "r", encoding="utf-8") as f:
        content = f.read()
    assert "await asyncio.to_thread(snapshot_once)" in content, "snapshot_once not offloaded via to_thread"
