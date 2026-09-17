"""Tests for the humanizer instrument.

These are not coverage tests. Each one pins a place where the instrument was
measured WRONG and would otherwise regress silently, because every bug found so
far produced a plausible number rather than an exception:

  * a parameter that read exactly 0 on every text
  * punctuation densities that read 0 because the sample loader ate commas
  * a stopword baseline computed with a different tagger than the measure
  * a perplexity model that reported ~3800 for ordinary prose

A number that is silently wrong is worse than a crash, so the assertions here
are mostly about *shape and sanity*, not about exact values.

    .venv/bin/python -m pytest tests.py -q
"""

from __future__ import annotations

import math

import pytest

import ranges as R
from measures_a import Ctx
from refmodel import load_ref_model
from rubric import deviations, measure, summarize

REF = load_ref_model()

# Two essay-length texts with deliberately different shapes, so a parameter that
# ignores its input has a chance to show up as "same value on both".
#
# Length matters here and is not cosmetic: several parameters are whole-document
# statistics. `model_perplexity_baseline` is the clearest case - measured,
# ordinary Brown prose scores ~18 at 900 words, but a 45-word technical snippet
# scores ~2900 purely because a fifth of its tokens are rare domain words and
# the mean is taken over log-probabilities. A short snippet is not a document.
TECHNICAL = """
The oxidation of the specimen was measured under controlled conditions during
the course of the investigation. The measurement apparatus was calibrated prior
to each trial, and the resulting data were recorded automatically by the
acquisition system. Consequently, the systematic error associated with the
procedure was reduced substantially across the full set of trials. Furthermore,
the experimental design permitted replication of the observed effects across
independent laboratories, which strengthened the conclusion considerably. The
samples were prepared according to the established protocol, and each specimen
was analysed in triplicate in order to establish the reliability of the
measurement. The results indicate that the treatment produced a measurable
change in the composition of the material under study. Additional experiments
were conducted in order to determine whether the effect persists over longer
periods of observation, and the outcome of those experiments supports the
interpretation advanced here.
""".strip()

CASUAL = """
So I went down there and it was, like, totally weird. The guy just stood there,
you know? I couldn't really believe it at first, because nobody had told me
anything about what was going on. Anyway, we got the stuff and then we left,
because honestly there wasn't much else to do. It was the kind of afternoon
where you just sort of drift around and nothing much happens. I mean, I guess it
was fine. We ended up getting food on the way back and that was pretty good, so
the day wasn't a total loss. The whole thing took way longer than I thought it
would, which was kind of annoying, but whatever. It's not like I had anything
better to do with my time that day anyway. I told my friend about it later and
he just laughed at me, which I probably deserved.
""".strip()


@pytest.fixture(scope="module")
def tech():
    return measure(TECHNICAL, "technical", ref=REF)


@pytest.fixture(scope="module")
def casual():
    return measure(CASUAL, "technical", ref=REF)


# --------------------------------------------------------------- table sanity
def test_table_is_complete():
    """56 parameters, ids 1..56 with no gaps and no duplicates."""
    ids = [p["id"] for p in R.PARAMS]
    assert ids == list(range(1, 57)), f"missing or duplicated: {ids}"


def test_every_parameter_has_a_range_somewhere():
    for p in R.PARAMS:
        have = [g for g, r in p["ranges"].items() if r is not None]
        assert have, f"{p['name']} has no target range in any genre"


def test_ranges_are_ordered():
    for p in R.PARAMS:
        for g, r in p["ranges"].items():
            if r is None:
                continue
            lo, hi = r
            assert lo < hi, f"{p['name']}/{g}: range {r} is inverted or empty"


def test_every_parameter_declares_its_method_and_fidelity():
    for p in R.PARAMS:
        assert p["method"].strip(), f"{p['name']} has no recorded method"
        assert p["fidelity"] in {"exact", "parser", "approx", "corpus",
                                 "unmeasurable"}


def test_deviation_is_zero_inside_and_signed_outside():
    name = "lexical_density_ratio"
    lo, hi = R.range_for(name, "technical")
    assert R.deviation(name, (lo + hi) / 2, "technical") == 0.0
    assert R.deviation(name, hi + (hi - lo), "technical") > 0
    assert R.deviation(name, lo - (hi - lo), "technical") < 0


def test_deviation_is_none_where_the_manual_says_na():
    # The manifesto marks paragraph_length_variance N/A for poetry.
    assert R.deviation("paragraph_length_variance", 5.0, "poetry") is None


# ------------------------------------------------------- measurement contract
def test_all_parameters_are_returned(tech):
    missing = [p["name"] for p in R.PARAMS if p["name"] not in tech]
    assert not missing, f"not measured: {missing}"


def test_density_measures_fire_when_their_feature_is_present():
    """Density parameters are legitimately 0 when a text lacks the feature - the
    real failure mode is a parameter that can NEVER be non-zero, whatever the
    text. So this feeds each feature its own trigger instead of asserting on
    arbitrary prose.

    This is the test that would have caught the sample loader stripping commas:
    it would have made punctuation densities permanently zero.
    """
    trigger = (
        "Consequently, the specimen (which was prepared) \u2014 as noted "
        "by Smith et al. 2019 \u2014 was analysed; replication followed. "
        "Never was the result disputed. Hmm, well, anyway, it's fine, right? "
        "We had to figure out the whole thing, and it turned out fine. "
        "Silent  was\tthe night!!  two  spaces here."
    )
    v = measure(trigger, "technical", ref=REF)
    for name in ("punctuation_comma_density", "punctuation_semicolon_rate",
                 "punctuation_em_dash_rate", "parenthetical_injection_density",
                 "citation_density_marker", "idiomatic_expression_rate",
                 "human_imperfection_noise_seed"):
        assert v[name] is not None and v[name] > 0, (
            f"{name} can never be non-zero -> dead formula")


def test_inversion_rate_fires_on_an_inverted_clause():
    """Given its own text: inside the combined trigger above the subject of the
    inverted clause is not detected, which is a parser property, not a dead
    formula. Verified directly against the parse tree, where subject-before-head
    ordering is real."""
    v = measure("Never was the result disputed.", "technical", ref=REF)
    assert v["syntactic_inversion_rate"] > 0, (
        "subject-after-head ordering is never counted -> dead formula")


def test_fragment_rate_fires_on_a_fragment():
    frag = "Because the oxidation. Specimen under controlled conditions. Data recorded."
    v = measure(frag, "technical", ref=REF)
    assert v["fragment_injection_rate"] > 0


def test_parameters_react_to_their_input(tech, casual):
    """Surface statistics must differ between two very different registers.
    The few that legitimately coincide are zero-valued density measures, which
    `test_density_measures_fire_when_their_feature_is_present` covers properly.
    """
    identical = [p["name"] for p in R.PARAMS
                 if tech.get(p["name"]) is not None
                 and tech[p["name"]] == casual[p["name"]]]
    assert len(identical) < 12, (
        f"{len(identical)} parameters give identical values on technical vs "
        f"casual prose: {identical}")


def test_perplexity_separates_at_document_length():
    """Perplexity is only meaningful at document length, and the manifesto's
    band is a whole-essay statistic. Measured on real corpora our model gives
    ~18 for Brown 'learned' at 900 words, which is inside the published
    18.5-28.0 ballpark, so the model is sane - it is short samples that are not.
    """
    import warnings
    warnings.filterwarnings("ignore")
    from nltk.corpus import brown

    words = []
    for s in brown.sents(categories="learned"):
        words.extend(t for t in s if not (t.startswith("[") or t.endswith("]")))
        if len(words) > 900:
            break
    v = measure(" ".join(words[:900]), "technical", ref=REF)
    assert v["_perplexity_reliable"] is True
    assert 5.0 < v["model_perplexity_baseline"] < 120.0, (
        f"ordinary academic prose scored "
        f"{v['model_perplexity_baseline']:.0f}; the model is miscalibrated")


def test_perplexity_flags_its_own_unreliability():
    """A short sample must say so rather than report a confident number."""
    v = measure("Oxidation apparatus calibration replication laboratories.",
                "technical", ref=REF)
    assert v["_perplexity_reliable"] is False


def test_punctuation_reads_the_text(tech):
    """The bug: a sample loader stripped punctuation and every punctuation
    parameter read 0. Feed a text with known punctuation and demand it shows."""
    t = "Alpha, beta; gamma \u2014 delta. Epsilon, zeta."
    v = measure(t, "technical", ref=REF)
    assert v["punctuation_comma_density"] > 0
    assert v["punctuation_semicolon_rate"] > 0
    assert v["punctuation_em_dash_rate"] > 0


def test_stopword_omission_can_be_positive(tech, casual):
    """The baseline must be measured with the same tagger as the measure.
    Telegraphic prose (fewer function words than Brown) must score above 0."""
    terse = " ".join(["Oxidation measurement apparatus calibration replication."] * 4)
    v = measure(terse, "technical", ref=REF)
    assert v["stopword_omission_rate"] > 0, (
        "no text can ever score above zero -> baseline uses a different tagger")


def test_cognitive_load_reads_depth(tech):
    """The bug: this read exactly 0 because measure_b could not see
    measure_a's output. Deeply nested prose must produce a non-zero value."""
    assert tech["cognitive_load_correlation_target"] > 0.0


def test_deep_nesting_beats_shallow(casual):
    shallow = "The cat sat. The dog ran. The bird flew. The fish swam."
    deep = ("The detection of anomalies in the distribution of particles "
            "across the regions of the sample that had been prepared by the "
            "method described in the preceding section was reported.")
    vs = measure(shallow, "technical", ref=REF)
    vd = measure(deep, "technical", ref=REF)
    assert vd["syntactic_dependency_depth"] > vs["syntactic_dependency_depth"]


def test_counts_match_the_text(tech):
    m = tech["_meta"]
    assert m["sentences"] >= 4
    assert m["words"] > 40


def test_summary_is_consistent(tech):
    s = summarize(tech, "technical")
    assert s["measured"] == s["in_range"] + s["off_target"]
    assert 0 <= s["in_range"] <= 56
    assert s["severe"] <= s["off_target"]
    assert s["mean_abs_deviation"] >= 0.0


def test_missing_values_are_none_not_zero():
    """A single-sentence text has no sentence pairs, so the pair-wise measures
    must report None. Reporting 0.0 would be a claim about the text; None is a
    claim about the measurement, which is the honest one."""
    v = measure("One solitary sentence about oxidation.", "technical", ref=REF)
    for name in ("semantic_coherence_gradient", "lexical_chaining_persistence",
                 "pos_ngram_transition_smooth"):
        assert v[name] is None, f"{name} should be None on a single sentence"


def test_empty_text_raises_rather_than_returning_junk():
    with pytest.raises(ValueError):
        measure("    \n\n   ", "technical", ref=REF)


def test_genres_are_exactly_the_four_in_the_manifesto():
    assert set(R.GENRES) == {"technical", "biography", "poetry", "fiction"}
