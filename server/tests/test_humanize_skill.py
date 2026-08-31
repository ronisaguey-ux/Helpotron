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
    assert d["ai"]["detection"]["detectors"]["winston_ai"] is False  # 08-31: off until topped up
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
    # 08-31: default set is Sapling + Pangram — Winston is expensive
    # (1 credit/word) and off until the account is topped up.
    assert detection_detectors(_settings()) == ["sapling", "pangram"]
    s = _settings(detection={"enabled": "on", "min_human": 70,
                             "detectors": {"sapling": False, "winston_ai": True, "pangram": False}})
    assert detection_detectors(s) == ["winston_ai"]


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
            return (0.0, [_res("sapling", 0.0), _res("pangram", 0.0),
                          _res("winston_ai", 20.0, "HTTP 400")], True)
        return (40.0, [_res("sapling", 100.0), _res("pangram", 0.0),
                       _res("winston_ai", 20.0, "HTTP 400")], False)

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
