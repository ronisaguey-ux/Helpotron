import pytest
from server.gdocs_exporter import HumanizedTypingSimulator, GoogleDocsStreamer
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
