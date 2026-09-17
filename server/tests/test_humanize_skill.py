"""Tests for the unified AI-humanizer skill (08-30, operator-requested).

Hierarchy (operator 08-31 rework): global / subject / assignment — the
settings scope chain. Scoped variants live in settings["scoped"]["ai.humanizer"]
and resolve most-specific-wins (assignment > subject) against the chat ctx.
"""
import pytest
from types import SimpleNamespace

from server.humanize_skill import (
    HUMANIZER_RULEBOOK,
    humanizer_block,
    humanizer_enabled,
    detection_enabled,
    detection_min_human,
    detection_detectors,
    ensure_human_standard,
    style_enabled,
    style_selected_samples,
    sample_voice_block,
)
from server.agent_prompt import agent_system_prompt


@pytest.fixture(autouse=True)
def _hip_off_by_default(monkeypatch):
    """Keep HIP out of the unit tests.

    hip_configured() reads HIP_ENDPOINT from the repo .env, which is set in
    normal development. Without this, any test that reaches
    ensure_human_standard() calls the LIVE HIP server on :8099 instead of the
    faked LLM — measured: two existing tests started returning real model
    output ("original version (first round of revision) in draft prose form")
    and failed. A unit test must never depend on a background service being up.
    Tests that exercise HIP re-patch these two names themselves.
    """
    async def _no_hip(text, rounds=None):
        return None

    monkeypatch.setattr("server.hip_humanizer.hip_configured", lambda: False)
    monkeypatch.setattr("server.hip_humanizer.hip_humanize", _no_hip)
    yield


def _settings(scoped=None, **ai_overrides):
    ai = {"humanizer": "off",
          "hierarchy": {n: {} for n in
                        ("my_agent", "assignment_team", "study_tools", "dump_agent", "qa_chat", "extensions")}}
    ai.update(ai_overrides)
    s = {"ai": ai}
    if scoped:
        s["scoped"] = scoped
    return s


def _variant(level, ref, value):
    return {"id": f"v-{level}-{ref}", "scope": {"level": level, "ref": ref}, "value": value}


def test_disabled_by_default():
    assert humanizer_enabled({}) is False
    assert humanizer_enabled({"ai": {}}) is False
    assert humanizer_block({}) == ""


def test_global_on_applies_without_ctx():
    s = _settings(humanizer="on")
    assert humanizer_enabled(s) is True
    assert humanizer_enabled(s, "assignment_team") is True
    assert humanizer_block(s) != ""


def test_subject_variant_beats_global():
    s = _settings(humanizer="on", scoped={"ai.humanizer": [_variant("subject", "Biology", "off")]})
    assert humanizer_enabled(s, ctx={"subject": "Biology"}) is False
    assert humanizer_enabled(s, ctx={"subject": "Chemistry"}) is True       # global fallback
    assert humanizer_enabled(s, ctx=None) is True                           # nothing matches


def test_assignment_wins_over_subject():
    s = _settings(humanizer="off", scoped={"ai.humanizer": [
        _variant("subject", "Biology", "on"),
        _variant("assignment", "Chapter 5 test", "off"),
    ]})
    ctx = {"assignment": "Chapter 5 test", "subject": "Biology"}
    assert humanizer_enabled(s, ctx=ctx) is False                           # assignment beats subject
    assert humanizer_enabled(s, ctx={"subject": "Biology"}) is True         # subject-only match
    assert humanizer_enabled(s, ctx={"assignment": "Other sheet"}) is False  # global off


def test_assignment_variant_without_subject():
    s = _settings(humanizer="on", scoped={"ai.humanizer": [_variant("assignment", "Essay 1", "off")]})
    assert humanizer_enabled(s, ctx={"assignment": "Essay 1"}) is False
    assert humanizer_enabled(s, ctx={"assignment": "Essay 2"}) is True


def test_node_layer_ignored():
    """08-31: per-hierarchy-node humanizer config no longer influences the
    skill — surfaces are NOT the hierarchy any more."""
    s = _settings(humanizer="off", hierarchy={"my_agent": {"humanizer": "on"}})
    assert humanizer_enabled(s, "my_agent") is False
    assert humanizer_block(s, "my_agent") == ""


def test_block_contents():
    block = humanizer_block(_settings(humanizer="on"))
    assert block.startswith("\nHUMANIZER SKILL")
    assert "burstiness" in block
    assert "em dash" in block or "em dashes" in block
    assert "AUDIT-REVISE LOOP" in HUMANIZER_RULEBOOK
    assert "FACT SAFEGUARD" in HUMANIZER_RULEBOOK


def test_system_prompt_injection_ctx_driven():
    user = SimpleNamespace(settings=_settings(), public_id="u1", id=1)

    # off -> no humanizer block anywhere
    assert "HUMANIZER SKILL" not in agent_system_prompt(user)

    # global on -> block present
    user2 = SimpleNamespace(settings=_settings(humanizer="on"), public_id="u2", id=2)
    assert "HUMANIZER SKILL" in agent_system_prompt(user2)

    # on globally, but the subject override turns it off for THAT subject —
    # the ctx must reach the prompt builder
    s3 = _settings(humanizer="on", scoped={"ai.humanizer": [_variant("subject", "Biology", "off")]})
    user3 = SimpleNamespace(settings=s3, public_id="u3", id=3)
    assert "HUMANIZER SKILL" not in agent_system_prompt(user3, ctx={"subject": "Biology"})
    assert "HUMANIZER SKILL" in agent_system_prompt(user3)
    assert "HUMANIZER SKILL" in agent_system_prompt(user3, ctx={"subject": "Chemistry"})


def test_ai_key_writable_and_defaults():
    """The 08-29 writable-keys filter must now accept the ai block (it was
    silently dropping every AI & Intelligence settings edit before)."""
    from server.user_settings_service import user_writable_settings_keys, UserSettingsService
    assert "ai" in user_writable_settings_keys()
    d = UserSettingsService.get_user_settings(SimpleNamespace(settings=None))
    assert d["ai"]["humanizer"] == "off"
    assert d["ai"]["detection"]["enabled"] == "off"
    assert d["ai"]["detection"]["min_human"] == 70
    assert d["ai"]["detection"]["detectors"]["sapling"] is True
    assert d["ai"]["detection"]["detectors"]["pangram"] is True
    assert "winston_ai" not in d["ai"]["detection"]["detectors"]  # 09-04 A8: purged
    assert d["ai"]["style"]["enabled"] == "off"
    assert d["ai"]["style"]["selection"] == []
    assert d["ai"]["style"]["samples"] == {}
    for node in ("my_agent", "assignment_team", "study_tools", "dump_agent", "qa_chat", "extensions"):
        assert node in d["ai"]["hierarchy"]


# ─── AI Detection Standard (operator 08-31) ────────────────────────────────

def test_detection_disabled_by_default():
    assert detection_enabled({}) is False
    assert detection_enabled({"ai": {"detection": {"enabled": "off"}}}) is False
    assert detection_min_human({}) == 70


def test_detection_scoped_variants():
    s = _settings(
        detection={"enabled": "on", "min_human": 85, "detectors": {"sapling": True}},
        scoped={"ai.detection.enabled": [_variant("subject", "Biology", "off")],
                "ai.detection.min_human": [_variant("subject", "Biology", "65"),
                                           _variant("assignment", "Essay 1", "60")]},
    )
    assert detection_enabled(s, ctx={"subject": "Biology"}) is False
    assert detection_enabled(s, ctx={"subject": "Chemistry"}) is True     # global on
    # assignment beats subject for the min_human path; subject beats global
    assert detection_min_human(s, ctx={"assignment": "Essay 1", "subject": "Biology"}) == 60
    assert detection_min_human(s, ctx={"subject": "Biology"}) == 65
    assert detection_min_human(s, ctx=None) == 85


def test_detection_min_human_clamped():
    s = _settings(detection={"enabled": "on", "min_human": 250})
    assert detection_min_human(s) == 100


def test_detection_detectors_default_and_toggles():
    # 09-04 A8: default set is Sapling + Pangram — Winston purged.
    # 09-06 (owner): + the free self-hosted tier (ZipPy, RoBERTa-ONNX).
    assert detection_detectors(_settings()) == ["sapling", "pangram", "zippy", "roberta_onnx"]
    s = _settings(detection={"enabled": "on", "min_human": 70,
                             "detectors": {"sapling": False, "pangram": True,
                                           "roberta_onnx": False}})
    assert detection_detectors(s) == ["pangram", "zippy"]


@pytest.mark.asyncio
async def test_ensure_human_standard_rewrites_until_pass(monkeypatch):
    """Draft v1 scores 40% human → rewrite (v2) scores 80% → returned, with
    a 2-entry attempt log. Both the detector and the LLM are faked."""
    seen_rewrites = []

    async def fake_score_text(text, threshold=80.0, max_retries=5, detectors=None):
        human = 80.0 if "v2" in text else 40.0
        return (100.0 - human, [SimpleNamespace(name="sapling", score=100.0 - human)], True)

    async def fake_call_llm(**kwargs):
        seen_rewrites.append(kwargs["user_prompt"])
        return "rewritten v2 draft " * 12

    monkeypatch.setattr("server.detectors.score_text", fake_score_text)
    monkeypatch.setattr("server.llm.call_llm", fake_call_llm)

    s = _settings(humanizer="on", detection={"enabled": "on", "min_human": 70})
    text = "original v1 draft prose. " * 8
    final, attempts = await ensure_human_standard(text, s)
    assert final.startswith("rewritten v2 draft")
    assert len(attempts) == 2
    assert attempts[0]["human"] == 40.0
    assert attempts[1]["human"] == 80.0
    assert len(seen_rewrites) == 1


@pytest.mark.asyncio
async def test_ensure_human_standard_excludes_error_votes(monkeypatch):
    """08-31 retest: a detector that HTTP-400s (out of credits) returns the
    20.0 error fallback — if that voted, dead detectors act as a phantom
    '80% human' vote. Here sapling=100 AI and pangram=0 disagree, winston is
    dead: the healthy median is 50 -> 50% human (fails -> rewrite). With the
    bug it would median to 20 -> 80% human and wrongly PASS the raw draft."""

    def _res(name, score, err=None):
        return SimpleNamespace(name=name, score=score,
                               details={"error": err} if err else {})

    async def fake_score_text(text, threshold=80.0, max_retries=5, detectors=None):
        if "v2" in text:
            return (0.0, [_res("sapling", 0.0), _res("pangram", 0.0)], True)
        return (40.0, [_res("sapling", 100.0), _res("pangram", 0.0), _res("sapling", 20.0, "HTTP 400")], False)

    async def fake_call_llm(**kwargs):
        return "rewritten v2 draft " * 12

    monkeypatch.setattr("server.detectors.score_text", fake_score_text)
    monkeypatch.setattr("server.llm.call_llm", fake_call_llm)

    s = _settings(detection={"enabled": "on", "min_human": 70})
    text = "original v1 draft prose. " * 8
    final, attempts = await ensure_human_standard(text, s)
    assert attempts[0]["human"] == 50.0        # healthy median, NOT the 80 phantom
    assert final.startswith("rewritten v2 draft")  # draft did not pass on the error vote


@pytest.mark.asyncio
async def test_ensure_human_standard_keeps_best_when_never_passes(monkeypatch):
    """Always under the bar: keeps the best-scored attempt (here the
    original — a rewrite that scores WORSE must never replace it)."""

    async def fake_score_text(text, threshold=80.0, max_retries=5, detectors=None):
        human = 30.0 if "v2" in text or "v3" in text else 35.0
        return (100.0 - human, [SimpleNamespace(name="sapling", score=100.0 - human)], True)

    rewrite_count = {"n": 0}

    async def fake_call_llm(**kwargs):
        rewrite_count["n"] += 1
        return f"worse rewrite v{rewrite_count['n'] + 1} " * 12

    monkeypatch.setattr("server.detectors.score_text", fake_score_text)
    monkeypatch.setattr("server.llm.call_llm", fake_call_llm)

    s = _settings(detection={"enabled": "on", "min_human": 70})
    text = "original v1 draft prose. " * 8
    final, attempts = await ensure_human_standard(text, s)
    assert final == text.strip()              # best scored version — the original
    assert len(attempts) == 3                 # original + 2 rewrites, all scored


@pytest.mark.asyncio
async def test_ensure_human_standard_off_returns_untouched():
    s = _settings(detection={"enabled": "off", "min_human": 70})
    text = "some prose reply that is long enough to be scored. " * 3
    final, attempts = await ensure_human_standard(text, s)
    assert final == text
    assert attempts is None


# ─── Sample Voice (operator 08-31) ────────────────────────────────────────────

def _style_setting(**style_overrides):
    style = {"enabled": "off", "selection": [], "samples": {}}
    style.update(style_overrides)
    return _settings(style=style)


def test_style_disabled_by_default():
    assert style_enabled({}) is False
    assert sample_voice_block({}) == ""
    assert style_selected_samples({}) == []


def test_style_global_selection_and_library():
    s = _style_setting(enabled="on", selection=["a", "b"],
                       samples={"a": {"name": "A essay", "text": "Alpha prose."},
                                "b": {"name": "B essay", "text": "Beta prose."}})
    assert style_enabled(s) is True
    got = style_selected_samples(s)
    assert [x["name"] for x in got] == ["A essay", "B essay"]
    block = sample_voice_block(s)
    assert "SAMPLE VOICE" in block
    assert "A essay" in block and "Alpha prose." in block
    assert "never its CONTENT" in block


def test_style_scoped_variant_beats_global():
    s = _style_setting(enabled="on", selection=["a"],
                       samples={"a": {"name": "A", "text": "Alpha. " * 5},
                                "b": {"name": "B", "text": "Beta. " * 5},
                                "c": {"name": "C", "text": "Ceta. " * 5}},
                       )
    s["scoped"] = {"ai.style.samples": [
        _variant("subject", "Biology", ["b", "c"]),
        _variant("assignment", "Essay 1", ["c"]),
    ]}
    # assignment beats subject
    assert [x["id"] for x in style_selected_samples(s, ctx={"assignment": "Essay 1", "subject": "Biology"})] == ["c"]
    assert [x["id"] for x in style_selected_samples(s, ctx={"subject": "Biology"})] == ["b", "c"]
    assert [x["id"] for x in style_selected_samples(s, ctx={"subject": "Chemistry"})] == ["a"]


def test_style_missing_sample_ids_skipped():
    s = _style_setting(enabled="on", selection=["gone", "a"],
                       samples={"a": {"name": "A", "text": "Alpha. " * 5}})
    got = style_selected_samples(s)
    assert [x["id"] for x in got] == ["a"]


def test_style_aborts_without_selection():
    s = _style_setting(enabled="on", selection=[], samples={"a": {"name": "A", "text": "Alpha. " * 5}})
    assert style_enabled(s) is True
    assert sample_voice_block(s) == ""


def test_style_capped_at_three_samples_and_chars():
    s = _style_setting(enabled="on", selection=["a", "b", "c", "d"],
                       samples={k: {"name": k, "text": (k + ". ") * 2000} for k in "abcd"})
    got = style_selected_samples(s)
    assert len(got) == 3
    assert all(len(x["text"]) <= 3000 for x in got)


def test_system_prompt_sample_voice_and_gptzero():
    """The canonical prompt carries the sample voice block when the chat has a
    matching ctx, and the GPTZero assurance note ONLY in assignment chats."""
    user = SimpleNamespace(settings=_style_setting(
        enabled="on", selection=["a"],
        samples={"a": {"name": "Essay voice", "text": "Short punchy sentences. Strong verbs."}}),
        public_id="u1", id=1)

    p = agent_system_prompt(user)
    assert "SAMPLE VOICE" in p
    assert "Essay voice" in p
    assert "gptzero" not in p          # no assignment ctx -> no note

    p2 = agent_system_prompt(user, ctx={"assignment": "Essay 1"})
    assert "SAMPLE VOICE" in p2
    assert "gptzero.me" in p2
    assert "Never add it to intermediate" in p2

    # off -> no voice block even in an assignment chat; note still present
    off = SimpleNamespace(settings=_settings(style={"enabled": "off", "selection": ["a"],
                                                    "samples": {"a": {"name": "A", "text": "x"}}}),
                          public_id="u2", id=2)
    p3 = agent_system_prompt(off, ctx={"assignment": "Essay 1"})
    assert "SAMPLE VOICE" not in p3
    assert "gptzero.me" in p3


@pytest.mark.asyncio
async def test_ensure_human_standard_skips_short_text():
    s = _settings(detection={"enabled": "on", "min_human": 70})
    final, attempts = await ensure_human_standard("ok", s)
    assert final == "ok"
    assert attempts is None


# ─── HIP: the base-model humanizer (2026-09-17) ──────────────────────────────
# Every instruction-tuned rewrite scores 100% AI on the real grader (GPTZero)
# regardless of surface style, because a detector reads the RLHF /
# instruction-tuning fingerprint in the model's weights and that is fixed at
# generation. HIP de-paraphrases with a BASE model (no instruction layer) and
# measured 1% AI. These tests pin the wiring, not the model.

@pytest.mark.asyncio
async def test_hip_runs_even_when_local_detector_false_passes(monkeypatch):
    """REGRESSION (2026-09-17). The local detectors cannot see modern AI prose:
    measured on blatant AI text, zipPy labels it Human/Human (5.0) and
    roberta-base-openai-detector returns an AI probability of 0.004, so the
    gate scores that draft ~95% human — above the 70 threshold. Before this
    fix the pre-score returned the draft untouched, so HIP was wired in but
    never reached: the humanizer was silently inert on exactly the input it
    exists to fix. A blind pre-score must not gate the rewrite."""

    async def blind_score_text(text, threshold=80.0, max_retries=5, detectors=None):
        # what the real stack returns: "clearly human"
        return (5.0, [SimpleNamespace(name="zippy", score=5.0)], True)

    async def fake_hip(text, rounds=None):
        return "hip humanized prose " * 10

    monkeypatch.setattr("server.detectors.score_text", blind_score_text)
    monkeypatch.setattr("server.hip_humanizer.hip_configured", lambda: True)
    monkeypatch.setattr("server.hip_humanizer.hip_humanize", fake_hip)

    s = _settings(humanizer="on", detection={"enabled": "on", "min_human": 70})
    text = "Social media platforms have fundamentally transformed the manner. " * 6
    final, attempts = await ensure_human_standard(text, s, db=None, user_id="t")

    assert final.strip() == ("hip humanized prose " * 10).strip()
    assert final.strip() != text.strip(), "HIP output must replace the draft"
    assert len(attempts) == 2, "original + HIP output should both be logged"
    assert attempts[1]["human"] == 95.0, "blind score still recorded for observability"


@pytest.mark.asyncio
async def test_hip_unconfigured_keeps_the_instruct_path(monkeypatch):
    """With no HIP endpoint the old gate is untouched: a draft already above
    the standard is returned as-is and no LLM call is made."""
    calls = []

    async def blind_score_text(text, threshold=80.0, max_retries=5, detectors=None):
        return (5.0, [SimpleNamespace(name="zippy", score=5.0)], True)

    async def fake_call_llm(**kwargs):
        calls.append(1)
        return "rewritten v2 draft " * 12

    monkeypatch.setattr("server.detectors.score_text", blind_score_text)
    monkeypatch.setattr("server.llm.call_llm", fake_call_llm)
    monkeypatch.setattr("server.hip_humanizer.hip_configured", lambda: False)

    s = _settings(humanizer="on", detection={"enabled": "on", "min_human": 70})
    text = "already above standard prose. " * 8
    final, attempts = await ensure_human_standard(text, s, db=None, user_id="t")

    assert final.strip() == text.strip()
    assert calls == [], "the instruct LLM must not run when nothing needs rewriting"


@pytest.mark.asyncio
async def test_hip_failure_falls_back_to_the_instruct_path(monkeypatch):
    """A dead HIP endpoint must degrade to the previous behaviour, never break
    chat: hip_humanize returns None, and the LLM redo loop takes over."""
    calls = []

    async def fake_score_text(text, threshold=80.0, max_retries=5, detectors=None):
        human = 80.0 if "v2" in text else 40.0
        return (100.0 - human, [SimpleNamespace(name="sapling", score=100.0 - human)], True)

    async def dead_hip(text, rounds=None):
        return None

    async def fake_call_llm(**kwargs):
        calls.append(1)
        return "rewritten v2 draft " * 12

    monkeypatch.setattr("server.detectors.score_text", fake_score_text)
    monkeypatch.setattr("server.llm.call_llm", fake_call_llm)
    monkeypatch.setattr("server.hip_humanizer.hip_configured", lambda: True)
    monkeypatch.setattr("server.hip_humanizer.hip_humanize", dead_hip)

    s = _settings(humanizer="on", detection={"enabled": "on", "min_human": 70})
    text = "original v1 draft prose. " * 8
    final, attempts = await ensure_human_standard(text, s, db=None, user_id="t")

    assert final.startswith("rewritten v2 draft")
    assert len(calls) == 1, "the fallback rewrite must still happen"
