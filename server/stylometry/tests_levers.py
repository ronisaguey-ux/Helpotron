"""Tests for the levers and the lever-effect measurement.

The question these answer is not "does the code run" but "is this lever real".
A lever that changes nothing is not a lever, and a lever whose transformation
destroys document structure is worse than one that does nothing.

Every test here pins a specific measured failure:

  * `de_nominalize` emitted "Transformaing" - a regex captured the stem of
    "Transformation" and split the suffix off the word
  * every sentence-level lever merged all paragraphs into one, which showed up
    as `paragraph_length_variance` reporting +3299.7% on almost every lever
  * six levers reported "moves nothing" on the default corpus, which is either
    a corpus gap or a broken trigger - these tests separate the two

    .venv/bin/python -m pytest tests_levers.py -q
"""

from __future__ import annotations

import pytest

from levers import LEVERS, apply_lever, split_paragraphs
from refmodel import load_ref_model
from rubric import measure

REF = load_ref_model()

# A text containing at least one trigger for EVERY lever. Built by enumerating
# each lever's required pattern, because the first version was missing triggers
# for five of them and the test then reported the levers as dead - a test bug
# masquerading as a finding, which is exactly what this suite exists to prevent.
#
#   de_nominalize         "the transformation of" / "the analysis of"
#   add_nominalizations   "we measured" / "was analysed"
#   strip_discourse       sentence starts with "However," / "Furthermore,"
#   add_discourse         (any sentence)
#   vary_sentence_length  a >16-word sentence with ", and "
#   flatten_sentences     adjacent sentences under 12 words
#   add_hedges            (any sentence)
#   strip_hedges          "apparently" / "very" / "significantly"
#   add_first_person      "It is" / "This suggests"
#   add_em_dashes         a parenthetical "(...)" of 4-80 chars
#   add_semicolons        ", and " / ", but "
#   add_parentheticals    "the method" / "the results" / "the data"
#   add_citations         a sentence ending in "."
#   fragmentize           a >=7-word sentence starting with The/A/This/We
#   lengthen_words        "use" / "good" / "make" / "way"
#   shorten_words         "utilise" / "demonstrates" / "require" / "obtained"
#   add_temporal          (any sentence)
#   add_idioms            "In the end" / "Therefore" / "considered" / "examined"
KITCHEN_SINK = """In the end, the transformation of the data (which had been collected)
was clear, and the production of results followed. However, the method was applied
to the results.

Furthermore, we measured the sample, and we observed the process. Therefore, the
data show a trend, but the analysis of the data was performed. It is important to
note that this suggests a change.

Nevertheless, the study was considered and the sample was examined. Clearly, the
algorithm was evaluated, and the system utilises the value. The work was very hard
and apparently the way was good.

Short one. Another short one. The method demonstrates the data. It is clear.
We require the results, and the process was analysed. This indicates the outcome.

They utilise the value. The data was obtained. He measured the effect, and she
observed the trend. Silent was the night. The value was determined, and the
effect was substantial.
"""

PARAGRAPHED = """First paragraph here. It has two sentences.

Second paragraph here. Also two sentences.

Third paragraph. And another one.
"""


def test_paragraph_structure_survives_every_lever():
    """The +3299.7% bug, pinned.

    A sentence-level lever that splits the whole document into sentences and
    rejoins with a single space merges every paragraph. This asserts the
    paragraph count is unchanged for every lever.
    """
    before = len(split_paragraphs(PARAGRAPHED))
    bad = []
    for name in LEVERS:
        out, _, _ = apply_lever(name, PARAGRAPHED, strength=0.5)
        after = len(split_paragraphs(out))
        if after != before:
            bad.append((name, before, after))
    assert not bad, f"lever(s) changed paragraph count: {bad}"


def test_every_lever_changes_the_text_when_its_trigger_is_present():
    """A lever that never fires is not a lever.

    Each lever is fed a text containing its own triggers. If a lever cannot
    change that text, its trigger phrases are wrong - which is a permanent
    defect, unlike "the essay did not contain the pattern".
    """
    dead = []
    for name in LEVERS:
        out, notes, _ = apply_lever(name, KITCHEN_SINK, strength=0.5)
        if out.strip() == KITCHEN_SINK.strip():
            dead.append(name)
    assert not dead, (
        f"lever(s) cannot fire even when their trigger is present: {dead}")


def test_de_nominalize_does_not_split_suffixes():
    """The "Transformaing" bug, pinned.

    A regex like `(\\w{4,})tion` captures the stem and drops the suffix, so the
    output contains a word that is not a word. The substitution must be
    word-level.
    """
    out, _, _ = apply_lever("de_nominalize",
                            "The transformation of the data was clear.", 0.5)
    for broken in ("Transformaing", "transformaing", "produc ing", "tioning"):
        assert broken not in out, f"de_nominalize emitted {broken!r}"


def test_de_nominalize_moves_its_target_parameter():
    """A lever is only real if its target actually moves."""
    text = ("The transformation of the data was clear. The production of "
            "results was slow. The analysis of the sample was performed. "
            "The measurement of the value was repeated.")
    before = measure(text, "technical", ref=REF)
    out, notes, _ = apply_lever("de_nominalize", text, strength=0.5)
    after = measure(out, "technical", ref=REF)
    assert after["nominalization_ratio"] < before["nominalization_ratio"], (
        f"de_nominalize did not reduce nominalization_ratio "
        f"({before['nominalization_ratio']:.4f} -> "
        f"{after['nominalization_ratio']:.4f}); notes: {notes}")


def test_remove_levers_move_their_target_downward():
    """Both directions of an axis must move the SAME parameter, oppositely.

    If adding a feature raises parameter X, removing it must lower X. A lever
    that moves a different parameter in the other direction means the two are
    not on the same axis at all.
    """
    pairs = [
        ("add_hedges", "strip_hedges", "hedge_and_intensifier_density"),
        ("add_discourse_markers", "strip_discourse_markers",
         "discourse_marker_frequency"),
    ]
    for up_name, down_name, param in pairs:
        base = measure(KITCHEN_SINK, "technical", ref=REF)
        up, _, _ = apply_lever(up_name, KITCHEN_SINK, strength=0.5)
        down, _, _ = apply_lever(down_name, KITCHEN_SINK, strength=0.5)
        v_up = measure(up, "technical", ref=REF)[param]
        v_down = measure(down, "technical", ref=REF)[param]
        assert v_up > base[param], (
            f"{up_name} did not raise {param} "
            f"({base[param]} -> {v_up})")
        assert v_down < base[param], (
            f"{down_name} did not lower {param} "
            f"({base[param]} -> {v_down})")


def test_levers_do_not_produce_empty_text():
    for name in LEVERS:
        out, _, _ = apply_lever(name, KITCHEN_SINK, strength=0.5)
        assert len(out.strip()) > 50, f"{name} destroyed the text"


def test_levers_do_not_mangle_word_count_wildly():
    """A lever should transform prose, not delete it or duplicate it.
    Half to double the word count is generous; beyond that is a bug."""
    base = len(KITCHEN_SINK.split())
    for name in LEVERS:
        out, _, _ = apply_lever(name, KITCHEN_SINK, strength=0.5)
        ratio = len(out.split()) / base
        assert 0.5 < ratio < 2.0, (
            f"{name} changed the word count by {ratio:.2f}x")


def test_lever_strength_is_monotonic_for_count_based_levers():
    """More strength must mean more transformation, not less. A lever whose
    effect is non-monotonic in its own strength cannot be tuned."""
    text = " ".join(["The method was applied. It was clear."] * 12)
    counts = []
    for s in (0.1, 0.5, 0.9):
        out, notes, _ = apply_lever("add_hedges", text, strength=s)
        counts.append(out.count(","))
    assert counts == sorted(counts), (
        f"add_hedges is not monotonic in strength: {counts}")


def test_every_lever_declares_an_intent():
    for name, (fn, intent) in LEVERS.items():
        assert callable(fn), f"{name} is not callable"
        assert intent.strip(), f"{name} declares no intent"


def test_applying_a_lever_twice_is_idempotent_or_bounded():
    """Applying a lever twice must not explode. Idempotent is ideal; bounded
    growth is acceptable; exponential is a bug."""
    once, _, _ = apply_lever("add_hedges", KITCHEN_SINK, strength=0.5)
    twice, _, _ = apply_lever("add_hedges", once, strength=0.5)
    assert len(twice.split()) < 2 * len(KITCHEN_SINK.split())
