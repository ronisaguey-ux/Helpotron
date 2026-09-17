"""Parameters 31-56: cognitive/informational, macro-structural, micro-aesthetic,
and the six the manifesto adds on top of the engine's original 50.
"""

from __future__ import annotations

import math
import re
from collections import Counter

import numpy as np

from lexicons import (
    AMBIGUITY_MARKERS, ARGUMENTATIVE_MARKERS, CITATION_PATTERNS, CLICHES,
    COLLOQUIAL, CONTENT_POS, CONTRACTIONS, CONVERSATIONAL_FILLERS, FORMAL,
    HIGH_POLYSEMY, IDIOMS, PHRASAL_VERBS, TEMPORAL_MARKERS,
)
from measures_a import Ctx, clause_heads, depth_of
from refmodel import cos, nlp, paragraphs, syllables, tfidf_vectors


def measure_b(c: Ctx) -> dict:
    out = {}
    text, toks, words, ref = c.text, c.toks, c.words, c.ref
    W, n_sent = c.W, c.n_sent

    # ------------------------------------------------------ 31 cognitive/info
    # Perplexity under the interpolated trigram. Model-dependent in absolute
    # value; the ordering across texts is the signal.
    #
    # LENGTH DEPENDENCE, measured: the mean is over log-probabilities, so a few
    # rare domain words dominate a short sample. Ordinary Brown prose measures
    # ~18 at 900 words, but a 45-word technical snippet measures ~2900 purely
    # because 20% of its tokens are rare. The manifesto's 18.5-28.0 band is a
    # whole-essay statistic, so this is only comparable above ~150 words.
    seq = ["<s>", "<s>"] + W
    lps = [math.log(ref.p(seq[i], seq[i - 1], seq[i - 2]))
           for i in range(2, len(seq))]
    out["model_perplexity_baseline"] = math.exp(-float(np.mean(lps))) if lps else None
    out["_perplexity_reliable"] = len(W) >= 150

    # 32 burstiness: coefficient of variation of sentence length, squashed so
    #    the scale is bounded 0-1 regardless of sentence length
    mean_len = float(np.mean(c.slen)) if c.slen else 0.0
    cv = (float(np.std(c.slen)) / mean_len) if mean_len else 0.0
    out["syntactic_burstiness_factor"] = cv / (1.0 + cv)

    # 33 argumentative connectives + stance verbs per sentence
    out["argumentative_structuring_index"] = c.per_sent(
        sum(1 for t in toks if t.text.lower() in ARGUMENTATIVE_MARKERS))

    # 34 temporal anchoring per sentence
    out["temporal_marker_density"] = c.per_sent(
        sum(1 for t in toks if t.text.lower() in TEMPORAL_MARKERS))

    # 35 formality: formal lexicon minus colloquial minus contractions, scaled
    #    against a 2% token-rate so the scale is stable across text lengths
    nw = max(1, len(words))
    contr = sum(1 for t in words if t.text.lower() in CONTRACTIONS or "'" in t.text)
    coll = sum(1 for t in words if t.text.lower() in COLLOQUIAL)
    form = sum(1 for t in words if t.text.lower() in FORMAL)
    out["register_formality_score"] = float(np.clip(
        0.5 + 0.5 * (form - coll - contr) / max(1.0, 0.02 * nw), 0.0, 1.0))

    # 36 processing overhead: depth and clauses, both normalised then blended.
    #    Computed here rather than read from measure_a's dict - measure_b gets
    #    the Ctx, not measure_a's output, so `out.get("syntactic_dependency_depth")`
    #    was silently always 0.0 and this parameter measured zero on every text.
    depths = []
    for s in c.sents:
        cache = {}
        depths.append(max((depth_of(t, cache) for t in s), default=0))
    depth_m = float(np.mean(depths)) if depths else 0.0
    clause_m = float(np.mean(c.clause_counts)) if c.clause_counts else 0.0
    out["cognitive_load_correlation_target"] = float(np.clip(
        (depth_m / 8.0) * 0.6 + (clause_m / 3.0) * 0.4, 0.0, 1.0))

    # 37 working memory chunk size: how many dependency arcs are still open at
    #    each token position, averaged (DLT-style hold count)
    pend = []
    for s in c.sents:
        spans = []
        for t in s:
            if t.head.i != t.i and s.start <= t.head.i < s.end:
                spans.append(tuple(sorted((t.i, t.head.i))))
        for pos in range(s.start, s.end):
            pend.append(sum(1 for lo, hi in spans if lo < pos < hi))
    out["working_memory_chunk_size"] = float(np.mean(pend)) if pend else None

    # ---------------------------------------------------------------- 38 macro
    paras = paragraphs(text)
    psent = [len(list(nlp()(p).sents)) for p in paras] if paras else []
    out["paragraph_length_variance"] = (
        float(np.var(psent)) if len(psent) > 1 else None)

    # 39 intro/outro symmetry: how much the closing paragraph restates the
    #    opening one. Our formula is a TF-IDF cosine, which will read lower than
    #    the manifesto's 0.92-0.98 on the same text - flagged in the report as
    #    a scale mismatch rather than silently averaged in.
    if len(paras) >= 2:
        pc = [[t.text.lower() for t in nlp()(p)
               if t.pos_ in CONTENT_POS] for p in (paras[0], paras[-1])]
        if pc[0] and pc[1]:
            out["intro_outro_symmetry_ratio"] = cos(tfidf_vectors(pc)[0],
                                                    tfidf_vectors(pc)[1])
        else:
            out["intro_outro_symmetry_ratio"] = None
    else:
        out["intro_outro_symmetry_ratio"] = None

    # 40 citations per sentence
    cit = sum(len(re.findall(p, text)) for p in CITATION_PATTERNS)
    out["citation_density_marker"] = c.per_sent(cit)

    # 41 question to statement ratio
    q = text.count("?")
    st = text.count(".")
    out["question_to_statement_ratio"] = q / max(1, st)

    # 42 idiomatic expressions + phrasal verbs per sentence
    low = " " + " ".join(W) + " "
    idiomatic = sum(low.count(" " + i + " ") for i in IDIOMS)
    idiomatic += sum(low.count(" " + p + " ") for p in PHRASAL_VERBS)
    out["idiomatic_expression_rate"] = c.per_sent(idiomatic)

    # 43 subtext ambiguity: polysemy density + stance particles + pronouns whose
    #    referent is not recoverable from the previous two sentences
    content_words = [t.text.lower() for t in c.content]
    nc = max(1, len(content_words))
    poly = sum(1 for w in content_words if w in HIGH_POLYSEMY) / nc
    amb = sum(1 for w in content_words if w in AMBIGUITY_MARKERS) / nc
    unres = []
    for i, s in enumerate(c.sents):
        prior = set()
        for p in c.sents[max(0, i - 2):i]:
            prior |= {t.text.lower() for t in p if t.pos_ in ("NOUN", "PROPN")}
        for t in s:
            if t.pos_ == "PRON" and t.text.lower() not in ("it", "there", "that"):
                unres.append(1.0 if t.text.lower() not in prior else 0.0)
    unres_rate = float(np.mean(unres)) if unres else 0.0
    out["subtext_ambiguity_index"] = float(np.clip(
        0.4 * min(1.0, poly * 8.0) + 0.3 * min(1.0, amb * 12.0)
        + 0.3 * unres_rate, 0.0, 1.0))

    # ---------------------------------------------------------------- 44 micro
    # alliteration: adjacent content words sharing an onset consonant
    cw = [t.text.lower() for t in c.content]
    pairs = onsets = 0
    for a, b in zip(cw, cw[1:]):
        if a and b and a[0].isalpha() and b[0].isalpha() and not a[0] in "aeiou":
            pairs += 1
            if a[0] == b[0]:
                onsets += 1
    out["alliteration_clustering_rate"] = onsets / max(1, pairs)

    # 45 rhythmic cadence: syllable-count variation across sentences, squashed
    syl = [sum(syllables(t.text) for t in s if t.is_alpha) for s in c.sents]
    if len(syl) > 1 and np.mean(syl):
        cv2 = float(np.std(syl)) / float(np.mean(syl))
        out["rhythmic_cadence_variance"] = cv2 / (1.0 + cv2)
    else:
        out["rhythmic_cadence_variance"] = None

    # 46 cliche suppression: 1 - observed cliches per opportunity, where an
    #    opportunity is one per sentence. Capped at 1.0 by construction.
    hits = sum(low.count(" " + k + " ") for k in CLICHES)
    out["cliche_suppression_filter"] = max(
        0.0, 1.0 - min(1.0, hits / max(1, n_sent)))

    # 47 conversational fillers per sentence
    out["conversational_filler_frequency"] = c.per_sent(
        sum(1 for t in toks if t.text.lower() in CONVERSATIONAL_FILLERS))

    # 48 inversion: clauses where the subject follows the verb head
    inv = cl = 0
    for s in c.sents:
        for h in clause_heads(s):
            cl += 1
            subj = [k for k in h.children if "subj" in k.dep_]
            if subj and subj[0].i > h.i:
                inv += 1
    out["syntactic_inversion_rate"] = inv / max(1, cl)

    # 49 repetition tolerance: 1 - content-word TTR
    cc = [t.text.lower() for t in c.content]
    out["lexical_repetition_tolerance"] = (
        1.0 - len(set(cc)) / max(1, len(cc)))

    # 50 human imperfection: irregular typography, which is where a real hand
    #    leaves marks a generator does not. Structural, not semantic.
    irr = 0
    irr += len(re.findall(r"  +", text))                    # double spaces
    irr += len(re.findall(r"[.!?,]{2,}", text))              # doubled punctuation
    irr += len(re.findall(r"[a-z][.!?][A-Za-z]", text))      # missing space
    irr += len(re.findall(r"[.!?]\s*[a-z]", text))           # lowercase after stop
    irr += len(re.findall(r"\b[a-z]+[A-Z][a-z]+\b", text))   # mid-word caps
    out["human_imperfection_noise_seed"] = c.per_sent(irr)

    # ------------------------------------------- 51-56 the manifesto's extras
    # 51 mean dependency distance (Liu)
    dd = [abs(t.i - t.head.i) for t in toks if t.head.i != t.i]
    out["mean_dependency_distance"] = float(np.mean(dd)) if dd else None

    # 52 phrasal compression vs clausal elaboration (Biber & Gray)
    prep = sum(1 for t in toks if t.dep_ == "prep")
    premod = sum(1 for t in toks if t.dep_ in ("compound", "amod"))
    fin_dep = sum(1 for t in toks if t.dep_ in
                  ("advcl", "ccomp", "xcomp", "acl", "relcl", "csubj"))
    out["phrasal_compression_vs_clausal_elaboration"] = (
        (prep + premod) / max(1, fin_dep))

    # 53 Honore's R and Brunet's W, hapax-based richness
    N = len(W)
    V = len(set(W))
    counts = Counter(W)
    V1 = sum(1 for w, n in counts.items() if n == 1)
    if N > 0 and V > 0 and V1 < V:
        out["honore_statistic"] = 100.0 * math.log(N) / (1.0 - V1 / V)
    else:
        out["honore_statistic"] = None
    out["brunet_measure"] = (
        N ** (V ** -0.172) if N > 0 and V > 0 else None)

    # 54 bigram conditional surprisal entropy, bits/word
    bi = [-math.log2(ref.p(W[i], W[i - 1], "<s>")) for i in range(1, len(W))]
    out["bigram_conditional_surprisal_entropy"] = (
        float(np.mean(bi)) if bi else None)

    # 55 punctuation-to-word ratio
    glyphs = sum(1 for ch in text if ch in ".,;:!?()[]{}'\"-\u2014\u2013")
    out["punctuation_to_word_ratio"] = glyphs / max(1, len(words))

    # 56 Yngve/Frazier tree depth: mean ancestors per token, the size of the
    #    parse stack a reader must hold. Distinct from 37, which counts open
    #    arcs rather than ancestors.
    dsum = 0
    dcount = 0
    for s in c.sents:
        cache = {}
        for t in s:
            dsum += depth_of(t, cache)
            dcount += 1
    out["yngve_frazier_tree_depth"] = dsum / dcount if dcount else None

    return out
