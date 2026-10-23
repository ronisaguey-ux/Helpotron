"""Test proving V2-C4-02: subagents decompose_rubric parses LLM response and fast-paths empty inputs."""
import json
import pytest
from server.subagents import subagent_coordinator


@pytest.mark.asyncio
async def test_decompose_rubric_fast_path_empty():
    """Empty prompt and rubric should immediately return fallback tasks without LLM call."""
    tasks = await subagent_coordinator.decompose_rubric("", "")
    assert len(tasks) == 3
    assert tasks[0]["title"] == "Core Thesis & Argumentation"


@pytest.mark.asyncio
async def test_decompose_rubric_parses_llm_json(monkeypatch):
    """Proves V2-C4-02: LLM JSON output is parsed and used instead of discarded."""
    mock_llm_response = json.dumps([
        {"task_id": 1, "title": "Historical Context Analysis", "focus": "Analyze 19th century economic context"},
        {"task_id": 2, "title": "Statistical Regression", "focus": "Perform OLS regression on trade volume"},
    ])

    async def mock_chat_complete(*args, **kwargs):
        return mock_llm_response

    monkeypatch.setattr("server.subagents.chat_complete", mock_chat_complete)

    tasks = await subagent_coordinator.decompose_rubric("Analyze 19th c. economics", "Rubric: context + stats")
    assert len(tasks) == 2
    assert tasks[0]["title"] == "Historical Context Analysis"
    assert tasks[1]["focus"] == "Perform OLS regression on trade volume"


@pytest.mark.asyncio
async def test_decompose_rubric_fallback_on_invalid_output(monkeypatch):
    """Graceful fallback when LLM output is not valid JSON."""
    async def mock_chat_complete(*args, **kwargs):
        return "I am unable to parse this rubric into tasks."

    monkeypatch.setattr("server.subagents.chat_complete", mock_chat_complete)

    tasks = await subagent_coordinator.decompose_rubric("Some prompt", "Some rubric")
    assert len(tasks) == 3
    assert tasks[0]["title"] == "Core Thesis & Argumentation"
