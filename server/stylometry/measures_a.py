"""Parameters 1-30 plus the shared parse context.

Each measure is one branch of `measure_a()`. The context object is built once
per text so the two measure modules never re-parse.
"""

from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np

from lexicons import (
    CONTENT_POS, DISCOURSE_MARKERS, FIRST_PERSON, FUNCTION_POS,
    GERMANIC_SUFFIXES, HEDGES, INTENSIFIERS, LATINATE_SUFFIXES,
    NOMINALIZATION_STOPWORDS, NOMINALIZATION_SUFFIXES, SECOND_PERSON,
)
from refmodel import cos, entropy, nlp, syllables, tfidf_vectors

SUBORDINATE_DEPS = frozenset({"advcl", "ccomp", "xcomp", "acl", "relcl",
                              "csubj", "csubjpass"})
CLAUSE_DEPS = frozenset({"ROOT", "advcl", "ccomp", "xcomp", "acl", "relcl",
                         "csubj", "csubjpass", "conj", "parataxis"})


def depth_of(tok, cache):
    """Depth of a token in the dependency tree; root = 0."""
    if tok.i in cache:
        return cache[tok.i]
    if tok.head.i == tok.i:
        cache[tok.i] = 0
        return 0
    d = 1 + depth_of(tok.head, cache)
    cache[tok.i] = d
    return d


def finite_verbs(sent):
    """Tokens heading a finite clause. spaCy's morphology is the primary
    signal; for untagged verbs we fall back to being a clausal dependency."""
    out = []
    for t in sent:
        if t.pos_ not in ("VERB", "AUX"):
            continue
        form = t.morph.get("VerbForm")
        if form and "Fin" in form:
            out.append(t)
        elif not form and t.pos_ == "VERB" and t.dep_ in CLAUSE_DEPS:
            out.append(t)
    return out


def clause_heads(sent):
    heads = [v for v in finite_verbs(sent) if v.dep_ not in ("aux", "auxpass")]
    return heads or [t for t in sent if t.dep_ == "ROOT"]


class Ctx:
    """Everything the measures need, computed exactly once."""

    def __init__(self, text, ref):
        self.text = text
        self.ref = ref
        doc = nlp()(text)
        self.doc = doc
        self.sents = [s for s in doc.sents if any(t.is_alpha for t in s)]
        if not self.sents:
            raise ValueError("no alphabetic sentences in the text")
        self.toks = [t for t in doc if not t.is_space]
        self.words = [t for t in doc if t.is_alpha]
        self.content = [t for t in self.toks if t.pos_ in CONTENT_POS
                        and not t.is_punct]
        self.W = [t.text.lower() for t in self.words]
        self.n_sent = len(self.sents)
        self.slen = [len([t for t in s if t.is_alpha]) for s in self.sents]
        self.sent_content = [[t.text.lower() for t in s if t.pos_ in CONTENT_POS]
                             for s in self.sents]
        self.clause_counts = [len(clause_heads(s)) for s in self.sents]

    def per_sent(self, n):
        return n / self.n_sent


def measure_a(c: Ctx) -> dict:
    """Parameters 1-30: lexical, syntactic, semantic, stylometry."""
    out = {}
    text, toks, words = c.text, c.toks, c.words
    W, ref = c.W, c.ref

    # ---------------------------------------------------------------- lexical
    # 1 lexical density (Halliday: content words / all words)
    out["lexical_density_ratio"] = len(c.content) / max(1, len(toks))

    # 2 MATTR: mean type-token ratio over a 100-word sliding window
    win = 100
    if len(W) <= win:
        out["type_token_ratio_windowed"] = len(set(W)) / max(1, len(W))
    else:
        out["type_token_ratio_windowed"] = float(np.mean(
            [len(set(W[i:i + win])) / win for i in range(len(W) - win + 1)]))

    # 3-4 word length, in characters
    lens = [len(t.text) for t in words]
    out["mean_word_length"] = float(np.mean(lens)) if lens else None
    out["word_length_variance"] = float(np.var(lens)) if lens else None

    # 5 character entropy over letters + single spaces, which is the scale the
    #   4.1-4.5 target range lives on (English text sits near 4.2 bits)
    chars = "".join(ch for ch in re.sub(r"\s+", " ", text.lower())
                    if ch.isalpha() or ch == " ")
    out["character_level_entropy"] = entropy(list(chars))

    # 6 closed-class weight
    fw = [t for t in toks if t.pos_ in FUNCTION_POS]
    out["function_word_profile_weight"] = len(fw) / max(1, len(toks))

    # 7 stopword omission, against Brown's own measured prose rate
    obs = len(fw) / max(1, len(toks))
    out["stopword_omission_rate"] = max(
        0.0, (ref.fw_rate - obs) / max(1e-9, ref.fw_rate))

    # 8 latinate:germanic morphological signature (suffix heuristic)
    lat = germ = 0
    for t in words:
        w = t.text.lower()
        if len(w) > 5 and any(w.endswith(s) for s in LATINATE_SUFFIXES):
            lat += 1
        elif any(w.endswith(s) for s in GERMANIC_SUFFIXES) or syllables(w) == 1:
            germ += 1
    out["latinate_vs_germanic_ratio"] = lat / max(1, germ)

    # -------------------------------------------------------------- syntactic
    # 9 mean maximum dependency depth per sentence
    depths = []
    for s in c.sents:
        cache = {}
        depths.append(max((depth_of(t, cache) for t in s), default=0))
    out["syntactic_dependency_depth"] = float(np.mean(depths))

    # 10 sentence length variance, in words
    out["sentence_length_variance"] = float(np.var(c.slen))

    # 11 finite clauses per sentence
    out["clause_to_sentence_ratio"] = float(np.mean(c.clause_counts))

    # 12 branching asymmetry: |left-right children| / total children
    asym = []
    for t in toks:
        kids = list(t.children)
        if kids:
            left = sum(1 for k in kids if k.i < t.i)
            asym.append(abs(left - (len(kids) - left)) / len(kids))
    out["parse_tree_branching_asymmetry"] = float(np.mean(asym)) if asym else None

    # 13 POS-trigram transition smoothness between adjacent sentences
    def pos_tri(s):
        p = [t.pos_ for t in s]
        return Counter(tuple(p[i:i + 3]) for i in range(len(p) - 2))
    smooth = []
    for a, b in zip(c.sents, c.sents[1:]):
        va, vb = pos_tri(a), pos_tri(b)
        if va and vb:
            smooth.append(cos(va, vb))
    out["pos_ngram_transition_smooth"] = float(np.mean(smooth)) if smooth else None

    # 14 coordination vs subordination
    coord = sum(1 for t in toks if t.dep_ == "conj")
    subord = sum(1 for t in toks if t.dep_ in SUBORDINATE_DEPS)
    out["coordination_vs_subordination"] = coord / max(1, subord)

    # 15 fragments: sentences with no finite predicate at all
    out["fragment_injection_rate"] = (
        sum(1 for s in c.sents if not finite_verbs(s)) / c.n_sent)

    # --------------------------------------------------------------- semantic
    # 16 adjacent-sentence TF-IDF cosine
    vecs = tfidf_vectors(c.sent_content)
    coh = [cos(vecs[i], vecs[i + 1]) for i in range(len(vecs) - 1)]
    out["semantic_coherence_gradient"] = float(np.mean(coh)) if coh else None

    # 17 entity transition: does the leading referent of one sentence reappear
    #    in the next? (centering-theory proxy for entity chaining)
    def lead(s):
        for t in s:
            if t.pos_ in ("NOUN", "PROPN", "PRON"):
                return t.text.lower()
        return None
    kept = pairs = 0
    for a, b in zip(c.sents, c.sents[1:]):
        la = lead(a)
        if la is None:
            continue
        pairs += 1
        if la in {t.text.lower() for t in b if t.pos_ in ("NOUN", "PROPN", "PRON")}:
            kept += 1
    out["entity_transition_density"] = kept / pairs if pairs else None

    # 18 discourse connectives per sentence
    out["discourse_marker_frequency"] = c.per_sent(
        sum(1 for t in toks if t.text.lower() in DISCOURSE_MARKERS))

    # 19 information density: mean content-word surprisal under the reference
    #    unigram, normalised by that model's own entropy so it is bounded
    if c.content:
        surp = float(np.mean([ref.unigram_surprisal(t.text) for t in c.content]))
        out["information_density_rate"] = min(
            1.0, surp / max(1e-9, ref.unigram_entropy()))
    else:
        out["information_density_rate"] = None

    # 20 lexical chaining: content-set overlap of adjacent sentences
    chain = []
    for a, b in zip(c.sent_content, c.sent_content[1:]):
        sa, sb = set(a), set(b)
        if sa and sb:
            chain.append(len(sa & sb) / min(len(sa), len(sb)))
    out["lexical_chaining_persistence"] = float(np.mean(chain)) if chain else None

    # 21 topic drift: vocabulary turnover between adjacent 50-token blocks
    blocks = [W[i:i + 50] for i in range(0, len(W), 50)]
    drift = []
    for a, b in zip(blocks, blocks[1:]):
        sa, sb = set(a), set(b)
        if sa and sb:
            drift.append(len(sb - sa) / len(sb))
    out["topic_drift_allowance"] = float(np.median(drift)) if drift else None

    # -------------------------------------------------------------- stylometry
    # 22 passive voice: clauses carrying a passive subject or auxpass
    pas = cl = 0
    for s in c.sents:
        for h in clause_heads(s):
            cl += 1
            kids = list(h.children)
            if (h.dep_ == "nsubjpass"
                    or any(k.dep_ == "nsubjpass" for k in kids)
                    or any(k.dep_ == "auxpass" for k in kids)):
                pas += 1
    out["passive_voice_ratio"] = pas / max(1, cl)

    # 23 hedges + intensifiers per sentence
    out["hedge_and_intensifier_density"] = c.per_sent(
        sum(1 for t in toks
            if t.text.lower() in HEDGES or t.text.lower() in INTENSIFIERS))

    # 24 nominalization rate
    nom = 0
    for t in words:
        w = t.text.lower()
        if w in NOMINALIZATION_STOPWORDS:
            continue
        if len(w) > 6 and any(w.endswith(s) for s in NOMINALIZATION_SUFFIXES):
            nom += 1
    out["nominalization_ratio"] = nom / max(1, len(toks))

    # 25-26 pronoun person bias
    prons = [t for t in toks
             if t.pos_ == "PRON" or t.text.lower() in FIRST_PERSON | SECOND_PERSON]
    out["pronoun_bias_first_person"] = sum(
        1 for t in prons if t.text.lower() in FIRST_PERSON) / max(1, len(prons))
    out["pronoun_bias_second_person"] = sum(
        1 for t in prons if t.text.lower() in SECOND_PERSON) / max(1, len(prons))

    # 27-29 punctuation densities, per sentence
    out["punctuation_comma_density"] = c.per_sent(text.count(","))
    out["punctuation_em_dash_rate"] = c.per_sent(
        text.count("\u2014") + text.count(" - ") + text.count("\u2013"))
    out["punctuation_semicolon_rate"] = c.per_sent(text.count(";"))

    # 30 parentheticals: appositives + bracket pairs + dash spans
    appos = sum(1 for t in toks if t.dep_ == "appos")
    out["parenthetical_injection_density"] = c.per_sent(
        appos + text.count("(") + text.count("[")
        + text.count("\u2014") + text.count("\u2013"))

    return out
