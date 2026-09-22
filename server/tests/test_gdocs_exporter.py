import pytest
import asyncio
from server.gdocs_exporter import (
    HumanizedTypingSimulator,
    OriginalityComplianceChecker,
    GoogleDocsStreamer
)
from server.export import export_to_google_doc


def test_humanized_typing_simulator():
    sim = HumanizedTypingSimulator(wpm=70, typo_probability=0.2)
    sample_text = (
        "This is an introductory paragraph discussing the thesis of the research.\n\n"
        "Secondly, the empirical analysis indicates significant improvements in model fidelity."
    )
    events = sim.generate_typing_events(sample_text)
    assert len(events) > 0
    actions = [e["action"] for e in events]
    assert "insert" in actions
    assert any("delay_ms" in e for e in events)


def test_no_ai_metadata_leakage():
    sim = HumanizedTypingSimulator()
    sample = "Academic research content on constitutional law."
    events = sim.generate_typing_events(sample)
    for e in events:
        text = e.get("text", "")
        assert "AI" not in text
        assert "Generated" not in text
        assert "Helpotron" not in text


def test_originality_compliance_checker_checkpoint():
    async def _run():
        checker = OriginalityComplianceChecker(human_threshold=75.0)
        sample_text = (
            "The historical analysis shows varied developments across the centuries. "
            "Moreover, the socio-economic factors played a crucial role in determining institutional outcomes."
        )
        result = await checker.evaluate_checkpoint(sample_text, checkpoint_pct=10)
        assert "compliant" in result
        assert "human_confidence_score" in result
        assert "burstiness" in result
        assert result["checkpoint_pct"] == 10
    asyncio.run(_run())


def test_originality_compliance_self_correct():
    async def _run():
        checker = OriginalityComplianceChecker()
        flagged_text = "Moreover, in today's fast-paced modern digital world, it is worth noting that the quick brown fox jumps over the lazy dog."
        failure_report = {
            "checkpoint_pct": 20,
            "human_confidence_score": 50.0,
            "burstiness": 15.0
        }
        corrected_text, metrics = await checker.self_correct_content(flagged_text, failure_report)
        assert isinstance(corrected_text, str)
        assert len(corrected_text) > 0
        assert corrected_text != flagged_text
        assert "human_confidence_score" in metrics
        assert "burstiness" in metrics
    asyncio.run(_run())
