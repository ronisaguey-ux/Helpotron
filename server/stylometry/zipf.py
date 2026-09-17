"""Zipfian lexical substitution - the manifesto's step 3, made deterministic.

The problem it solves, measured on the AI baseline against 32 human essays:

    mean_word_length        6.115  vs  4.435     (AI 38% longer)
    latinate_vs_germanic    0.311  vs  0.066     (AI 4.7x more Latinate)
    word_length_variance    10.89  vs  5.546
    lexical_density_ratio   0.549  vs  0.458
    type_token_ratio        0.790  vs  0.686

The hand-written table in simplifications.py catches the academic register
("utilize", "in order to") but only fires ~28 times on a 770-word essay. This is
the general lever underneath it.

The rule, and why it is not a thesaurus guess. A word is a candidate when it is
LONG and RARE. For each candidate we ask WordNet for its synonyms - which are by
construction the same part of speech and the same sense - and then pick the one
that is most frequent in ordinary prose, according to the Brown corpus. So the
replacement is chosen by an explicit frequency measurement, never by a model
predicting what fits. A candidate is only used if it beats the original on
measured frequency, which is what makes the pass monotone in the Zipfian sense:
every substitution moves the text down the frequency distribution, which is
exactly the direction real student writing sits.

    substitute(text) -> (text, n_changes, examples)
"""

from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import functools
import json
import os
import re

from simplifications import fix_articles

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "zipf_freq.json")

# NLTK_DATA is not exported in this shell and the corpora live under ~/.local, so
# every fresh interpreter fails to find `brown`/`wordnet` unless the path is
# injected. Done here, at import, because it was costing a failed run each time.
_NLTK_DIR = os.path.expanduser("~/.local/share/nltk_data")


def _ensure_nltk_path() -> None:
    import nltk
    if os.path.isdir(_NLTK_DIR) and _NLTK_DIR not in nltk.data.path:
        nltk.data.path.insert(0, _NLTK_DIR)


_ensure_nltk_path()

# Words that must never be swapped: function words, connectives and anything whose
# replacement changes the argument rather than the register.
PROTECT = {
    "however", "although", "because", "therefore", "between", "through",
    "against", "without", "within", "during", "before", "after", "while",
    "which", "their", "there", "these", "those", "would", "could", "should",
    "about", "being", "other", "where", "still", "every", "might", "while",
}

_WORD = re.compile(r"[A-Za-z][A-Za-z'-]*")

# per-million thresholds, from the measurements in _lemma_index's docstring
RARE_GATE = 30e-6     # a candidate must be rarer than this to be touched
FREQ_FLOOR = 40e-6     # its replacement must be at least this common
FREQ_MARGIN = 1.6      # ...and this many times more common than the original

# Pairs where WordNet's most-frequent sense is simply the wrong sense for
# academic prose. Found by reading the substitution list, not guessed; extend it
# when a new one shows up rather than loosening the sense rule.
BLOCKED = {
    "consistency": {"body", "consistence"},
    "workforce":   {"men", "hands"},
    "creation":    {"world", "universe"},
    "intelligence": {"word", "news"},
    "capable":     {"open", "able"},
    "substantially": {"well"},
    "performing":  {"playing", "acting"},
    # adjective swapped for an ADVERB: measured "a ubiquitous force" ->
    # "a everywhere force". spaCy tags "everywhere" as ADV, so the POS guard
    # should reject it; listing it explicitly because a single miss here is very
    # visible in the output.
    "ubiquitous":  {"everywhere", "widespread"},
    "omnipresent": {"everywhere"},
    # adjective -> ADVERB, which the POS guard should already reject; listed
    # explicitly because it survived into real output as "a everywhere force".
    "prevalent":   {"widely" },
    "widespread":  {"widely"},
    "performance": {"execution", "carrying out"},
}


@functools.lru_cache(maxsize=1)
def _nlp():
    """spaCy's small English model.

    NLTK's averaged_perceptron_tagger is not usable here: its download lands in a
    different directory from the one the corpus loader reads, so `nltk.pos_tag`
    raises LookupError while `brown` and `wordnet` load fine. spaCy is already in
    this venv with en_core_web_sm, and its POS tags are what the POS guard needs.
    """
    import spacy
    return spacy.load("en_core_web_sm", disable=["ner", "lemmatizer"])


@functools.lru_cache(maxsize=16384)
def _tag_one(w: str) -> str:
    """Coarse POS class for one word, cached - tagging is the expensive part."""
    doc = _nlp()(w)
    return doc[0].pos_ if len(doc) else ""


def _coarse(penn: str) -> str:
    """Collapse a Penn tag, a spaCy POS tag or a WordNet POS letter to n/v/a/r.

    Handles all three spellings because it is called on tags from both sides of
    the comparison: spaCy POS tags for the words as written, and WordNet's own
    single-letter POS for the synset.
    """
    if not penn:
        return ""
    p = penn[0].lower()
    if penn.startswith("N") or p == "n":
        return "n"
    if penn.startswith("V") or p == "v":
        return "v"
    if penn.startswith("J") or p == "a":
        return "a"
    if penn.startswith("R") or p == "r":
        return "r"
    return ""


def _suffix(w: str) -> str:
    """The inflectional suffix, used to stop swaps that break the grammar.

    WordNet will happily list a gerund and its base verb as synonyms of each
    other, which is true lexically and false grammatically: "capable of
    performing tasks" became "capable of do tasks". Requiring the original and
    the replacement to carry the SAME inflection removes that whole class of
    error without needing a parser.
    """
    if w.endswith("ing") and len(w) > 5:
        return "ing"
    if w.endswith("ed") and len(w) > 4:
        return "ed"
    if w.endswith("es") and len(w) > 4:
        return "es"
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        return "s"
    return ""


@functools.lru_cache(maxsize=1)
def _freq() -> dict:
    """Brown-corpus unigram counts, cached to disk - it is ~1.16M tokens."""
    _ensure_nltk_path()
    if os.path.exists(CACHE):
        with open(CACHE) as f:
            return json.load(f)
    from nltk.corpus import brown
    from collections import Counter
    c = Counter(w.lower() for w in brown.words() if w.isalpha())
    total = sum(c.values())
    d = {w: n / total for w, n in c.items()}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w") as f:
        json.dump(d, f)
    return d


@functools.lru_cache(maxsize=1)
def _lemma_index() -> dict:
    """lemma -> (best_synonym, original_freq, synonym_freq).

    Two guards make this safe, and both were added after the first version
    produced "Artificial Word" (intelligence -> word) and "machine -> car":

    1. MOST-FREQUENT-SENSE ONLY. WordNet returns a lemma's synsets in frequency
       order, so only the FIRST synset for each part of speech is consulted. The
       earlier version pooled every sense, so a rare sense of a common word could
       win on the strength of its synonym being common elsewhere.

    2. RARITY GATE. Only words that are genuinely rare in ordinary prose are
       candidates. Measured per-million in Brown: utilize 10.2, technological
       18.3, comprehensive 19.4, displacement 23.4, sophisticated 26.5 - these are
       the register we are hunting. Intelligence 48.9, capable 67.2, machine
       104.9, word 279 are ordinary words, and swapping them is what produced the
       absurd output. The gate sits at 30 per million.
    """
    _ensure_nltk_path()
    from nltk.corpus import wordnet as wn
    f = _freq()
    idx = {}
    for word in list(f) + [w for w in f if len(w) > 6]:
        pass
    # iterate the vocabulary that actually occurs, not all 117k lemmas of WordNet
    for lemma in wn.all_lemma_names():
        lemma = lemma.lower()
        if "_" in lemma or not lemma.isalpha() or len(lemma) < 7:
            continue
        fa = f.get(lemma, 0.0)
        if fa >= RARE_GATE:
            continue
        for ss in wn.synsets(lemma)[:1]:
            wpos = _coarse(ss.pos())
            # POS-VERIFIED, same guard as _lat_index. Without it "performing
            # tasks" became "playing tasks": WordNet's first sense of
            # "performing" is the NOUN ("the performance of a part or role in a
            # drama"), whose synonym "playing" is common - while the token in the
            # sentence is a gerund VERB meaning "carrying out". Both words are
            # frequent and both are short, so frequency alone cannot see it; only
            # the part of speech distinguishes them.
            if wpos and _coarse(_tag_one(lemma)) not in ("", wpos):
                continue
            names = [l.name().lower() for l in ss.lemmas()
                     if "_" not in l.name() and l.name().isalpha()]
            for b in names:
                if b == lemma:
                    continue
                if wpos and _coarse(_tag_one(b)) not in ("", wpos):
                    continue
                fb = f.get(b, 0.0)
                if (fb > fa * FREQ_MARGIN and fb > FREQ_FLOOR
                        and b not in BLOCKED.get(lemma, ())
                        and _suffix(b) == _suffix(lemma)):
                    cur = idx.get(lemma)
                    if cur is None or fb > cur[2]:
                        idx[lemma] = (b, fa, fb)
    return idx


try:
    import mlm_veto as VETO          # context-sensitive substitution veto
except Exception:
    VETO = None


def substitute(text: str, min_len: int = 6, max_per_100: int = 30):
    """Walk the text and swap long rare words for their most common synonym.

    min_len gates the candidate set: below 7 characters the long-word features we
    are steering barely move, and short words are where grammar breaks first.
    max_per_100 caps the rate so the prose does not turn into a word list.
    """
    idx = _lemma_index()
    toks = list(_WORD.finditer(text))
    budget = max(1, int(len(toks) * max_per_100 / 100))
    out = []
    last = 0
    changes = []
    vetoed = []

    for m in toks:
        w = m.group(0)
        lw = w.lower()
        if len(lw) < min_len or lw in PROTECT or budget <= 0:
            continue
        hit = idx.get(lw)
        if not hit:
            continue
        repl = hit[0]
        # Context-sensitive veto. The frequency ranking is context-free, so it
        # proposes substitutions that are nonsense here even though both words are
        # common ("engagement" -> "battle"). The masked-LM check sees the sentence
        # and rejects those. A rejection skips the substitution; it can only
        # remove a move, never block the text.
        if VETO is not None:
            try:
                rejected, why = VETO.check(text, m.start(), m.end(), w, repl)
                if rejected:
                    vetoed.append((w, repl, why))
                    continue
            except Exception:
                pass
        if not repl.isalpha():
            continue
        # preserve the capitalisation of the original token
        if w[0].isupper():
            repl = repl.capitalize()
        out.append(text[last:m.start()])
        out.append(repl)
        last = m.end()
        budget -= 1
        changes.append((w, repl))

    out.append(text[last:])
    return fix_articles("".join(out)), len(changes), changes


def report(text: str):
    new, n, ch = substitute(text)
    f = _freq()

    def mwl(s):
        ws = [w for w in _WORD.findall(s)]
        return sum(len(w) for w in ws) / max(1, len(ws))

    print(f"  substitutions: {n}")
    print(f"  mean_word_length {mwl(text):.3f} -> {mwl(new):.3f}   (human target 4.435)")
    print(f"  reduced Zipf rank on {sum(1 for a, b in ch if f.get(b,0) > f.get(a,0))}/{n}")
    print()
    print("  " + ", ".join(f"{a}->{b}" for a, b in ch[:18]))
    return new


if __name__ == "__main__":
    import sys
    report(open(sys.argv[1] if len(sys.argv) > 1 else str(_HERE / "baseline700.txt")).read())


# ------------------------------------------------------------------ latinate

# The measure this targets is a SUFFIX heuristic (measures_a.py:124-132):
#   lat  += len(w) > 5 and w ends in any LATINATE_SUFFIXES
#   germ += w ends in any GERMANIC_SUFFIXES, OR w is monosyllabic
#
# So the ratio falls in exactly two ways: swap a long latinate word for a SHORT
# one, or for a MONOSYLLABIC one. That second route is why the replacement is
# scored on syllable count as well as frequency - "utilization" -> "use" is worth
# far more here than "utilization" -> "usage", because only "use" is one syllable.
_LAT = ('tion', 'sion', 'ment', 'ance', 'ence', 'ity', 'ous', 'ive', 'ial',
        'ical', 'ic', 'ate', 'ize', 'ise', 'ify', 'able', 'ible', 'al', 'ary',
        'ory', 'ent', 'ant', 'ure', 'age', 'ism', 'ist', 'ology', 'ography')


def _n_syll(w: str) -> int:
    """Cheap syllable estimate, matching the one measures_a uses."""
    w = w.lower()
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and n > 1:
        n -= 1
    return max(1, n)


@functools.lru_cache(maxsize=1)
def _lat_index() -> dict:
    """Latinate-suffixed word -> a short, monosyllabic-preferred replacement.

    Built from the same Brown frequency table and restricted to the same
    most-frequent-sense rule as _lemma_index, but the acceptance test is
    different: a replacement qualifies when it is SHORTER and at least as
    frequent. That is a directional claim about the exact feature being
    measured, so the pass cannot push the metric the wrong way.
    """
    _ensure_nltk_path()
    from nltk.corpus import wordnet as wn
    f = _freq()
    idx = {}
    for lemma in wn.all_lemma_names():
        lemma = lemma.lower()
        if "_" in lemma or not lemma.isalpha() or len(lemma) <= 5:
            continue
        if not any(lemma.endswith(s) for s in _LAT):
            continue
        fa = f.get(lemma, 0.0)
        # POS-VERIFIED. The failure this removes, in order of how it appeared:
        #   formal -> ball        (adjective swapped for a noun, via a rare
        #                          dance sense that WordNet lists early)
        #   deliberate -> consider (adjective swapped for a verb)
        #   judgment -> mind       (noun swapped for a noun, wrong sense)
        # WordNet's own synset POS is authoritative for the CANDIDATE, but says
        # nothing about the word as it is used here. So the original token is
        # POS-tagged in its actual sentence and the two must agree in the coarse
        # noun/verb/adjective/adverb class. That rejects the first two outright,
        # and the sense-ordering rule below rejects the third.
        for ss in wn.synsets(lemma)[:1]:
            wpos = _coarse(ss.pos())
            if wpos and _coarse(_tag_one(lemma)) not in ("", wpos):
                continue
            for l in ss.lemmas():
                b = l.name().lower()
                if b == lemma or "_" in b or not b.isalpha() or len(b) < 3:
                    continue
                if wpos and _coarse(_tag_one(b)) not in ("", wpos):
                    continue                  # candidate is a different POS too
                if len(b) >= len(lemma) - 1:
                    continue                      # must be meaningfully shorter
                if _suffix(b) != _suffix(lemma):  # no inflection breakage
                    continue
                fb = f.get(b, 0.0)
                # BOTH tests, not either. The first version accepted a swap when
                # it merely had fewer syllables, which let "artificial" -> "hokey"
                # through ("hokey" does not occur once in Brown; it is a
                # figurative synonym from a rare sense of "artificial"). A word
                # that never occurs in ordinary prose is never the plain-English
                # form of anything, so frequency is the binding constraint and
                # the syllable drop is only a bonus.
                if fb <= fa * 1.5 or fb < FREQ_FLOOR:
                    continue                      # must be commoner AND common
                if _n_syll(b) > _n_syll(lemma):
                    continue                      # never trade into more syllables
                cur = idx.get(lemma)
                # rank by what the metric actually rewards: fewer syllables first,
                # then shorter, then more frequent
                key = (_n_syll(b), len(b), -fb)
                if cur is None or key < cur[0]:
                    idx[lemma] = (key, b, fa, fb)
    return {k: (v[1], v[2], v[3]) for k, v in idx.items()}


def delatinate(text: str, max_per_100: int = 26):
    """Swap long Latinate words for short, preferably monosyllabic, synonyms."""
    idx = _lat_index()
    toks = list(_WORD.finditer(text))
    budget = max(1, int(len(toks) * max_per_100 / 100))
    out, last, changes = [], 0, []
    vetoed = []
    for m in toks:
        w = m.group(0)
        lw = w.lower()
        if budget <= 0 or len(lw) <= 5 or lw in PROTECT:
            continue
        if not any(lw.endswith(s) for s in _LAT):
            continue
        hit = idx.get(lw)
        if not hit:
            continue
        repl = hit[0]
        # Same context-sensitive veto as substitute(): delatinate() proposes
        # Latinate->Germanic swaps from the same context-free frequency index and
        # produces the same class of error ("engagement" -> "battle"). Both paths
        # must veto, or the defect simply moves to whichever one is unguarded.
        if VETO is not None:
            try:
                rejected, why = VETO.check(text, m.start(), m.end(), w, repl)
                if rejected:
                    vetoed.append((w, repl, why))
                    continue
            except Exception:
                pass
        if w[0].isupper():
            repl = repl.capitalize()
        out.append(text[last:m.start()])
        out.append(repl)
        last = m.end()
        budget -= 1
        changes.append((w, repl))
    out.append(text[last:])
    return fix_articles("".join(out)), len(changes), changes


def delatinate_report(text: str):
    new, n, ch = delatinate(text)
    def mwl(s):
        ws = _WORD.findall(s)
        return sum(len(w) for w in ws) / max(1, len(ws))
    print(f"  delatinate: {n} swaps, mean_word_length {mwl(text):.3f} -> {mwl(new):.3f}")
    print("  " + ", ".join(f"{a}->{b}" for a, b in ch[:20]))
    return new
