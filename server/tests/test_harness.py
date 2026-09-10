"""Tests for DeepSeek-V4 Dual-Model Tiering & Custom Plugin Harness."""
import asyncio
import pytest
from server.engine.harness import DeepSeekHarness


@pytest.fixture
def harness():
    return DeepSeekHarness()


def test_harness_tiering_initialization(harness):
    assert harness.flash_model == "deepseek-v4.1-flash"
    assert harness.pro_model == "deepseek-v4.1-flash"
    assert "style_mutator" in harness.plugins
    assert "context_pruner" in harness.plugins
    assert "telemetry_logger" in harness.plugins


def test_dynamic_context_pruning(harness):
    raw_lms_dump = """
    <html>
      <head><style>.nav { color: red; }</style></head>
      <body>
        <nav>Skip to Content Canvas by Instructure Dashboard Courses Calendar Inbox</nav>
        <div id="content">
          <h1>Assignment: CRISPR-Cas9 Gene Therapy</h1>
          <p>Analyze off-target mutation frequencies in hematopoietic stem cells.</p>
        </div>
        <footer>Help Terms of Use Privacy Policy Logged in as Student</footer>
      </body>
    </html>
    """
    res = asyncio.run(harness.prune_context(raw_lms_dump))
    assert res["compression_ratio"] > 0.4
    assert "CRISPR-Cas9 Gene Therapy" in res["pruned_text"]
    assert "Skip to Content" not in res["pruned_text"]
    assert "<style>" not in res["pruned_text"]


def test_ast_style_mutator(harness):
    text = "Furthermore, the experiment demonstrates a significant impact on metabolic pathways. Moreover, it is important to note that results vary."
    res = asyncio.run(harness.mutate_style_ast(text))
    assert res["perturbations"] > 0
    assert "Furthermore," not in res["mutated_text"]
    assert res["detector_evasion_est"] >= 0.9


def test_custom_plugin_registration(harness):
    async def sample_docs_exporter(title: str, content: str):
        return {"status": "exported", "doc_url": f"https://docs.google.com/d/{title}"}

    harness.register_plugin("docs_exporter", sample_docs_exporter)
    assert "docs_exporter" in harness.plugins

    out = asyncio.run(harness.plugins["docs_exporter"](title="Ethics_Essay", content="Thesis..."))
    assert out["status"] == "exported"
    assert "Ethics_Essay" in out["doc_url"]


def test_flash_pro_self_healing_loop(harness):
    result = asyncio.run(
        harness.flash_pro_self_healing_loop(
            system_prompt="Generate thesis and citation plan.",
            user_prompt="Topic: AI Ethics",
            required_keys=["status", "model"],
        )
    )
    assert result["status"] in ("success", "healed")
    assert "status" in result["data"]


def test_telemetry_logger(harness):
    res = asyncio.run(harness.log_telemetry("hash123", 450, 85.5, "deepseek-v4.1-flash", "success"))
    assert res["logged"] is True
    assert res["event"]["prompt_hash"] == "hash123"
    assert res["event"]["latency_ms"] == 85.5
