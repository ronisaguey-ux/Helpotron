"""Reference-corpus model and shared helpers for the humanizer instrument.

The surprisal-derived parameters (perplexity, information density, bigram
surprisal entropy, stopword-omission baseline) need a frequency prior. We train
one on NLTK's Brown corpus - 1.16M words of 1961 American English across 15
genres - and cache it to disk.

Brown is NOT the BNC/COCA the manifesto cites. That matters in exactly one way:
our absolute numbers are not directly comparable to the published ranges. They
ARE comparable to each other, which is what a rewrite loop consumes, and
`validate.py` quantifies the gap instead of pretending it is not there.
"""

from __future__ import annotations

import math
import os
import pickle
import re
import warnings
from collections import Counter

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
REF_CACHE = os.path.join(CACHE_DIR, "refmodel.pkl")

_nlp = None
_pyphen = None


def nlp():
    """Lazy-load spaCy once. Excluding ner+lemmatizer keeps it small and fast;
    neither is used by any parameter."""
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm", exclude=["ner", "lemmatizer"])
    return _nlp


def pyphen_dict():
    global _pyphen
    if _pyphen is None:
        import pyphen
        _pyphen = pyphen.Pyphen(lang="en_US")
    return _pyphen


def syllables(word: str) -> int:
    """Dictionary hyphenation, so this is a real syllable count, not a guess
    from counting vowel groups."""
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    try:
        return max(1, len(pyphen_dict().inserted(w).split("-")))
    except Exception:
        return max(1, len(re.findall(r"[aeiouy]+", w)))


class RefModel:
    """Interpolated trigram model over Brown.

    Fixed lambdas, plain MLE at each order. The first version of this added a
    vocab-sized smoothing constant to the *conditional* denominators, which is
    wrong - it drives every higher-order probability toward zero and inflated
    measured perplexity to ~3800 for ordinary prose. A conditional distribution
    is smoothed against its own continuation count, not against the vocabulary
    size; the unigram carries the floor instead.

    The absolute perplexity is a property of this model. The ordering it
    induces across texts is stable, and that is the only thing a rewrite loop
    reads off it.
    """

    L1, L2, L3 = 0.15, 0.35, 0.50
    _FLOOR = 1e-9

    def __init__(self):
        self.uni = Counter()
        self.bi = Counter()
        self.tri = Counter()
        self.total = 1
        self.fw_rate = 0.5
        self.content_surprisal = None
        self._uni_entropy = None

    def train(self, sents):
        for s in sents:
            toks = ["<s>"] + [w.lower() for w in s] + ["</s>"]
            self.uni.update(toks)
            for a, b in zip(toks, toks[1:]):
                self.bi[(a, b)] += 1
            for a, b, c in zip(toks, toks[1:], toks[2:]):
                self.tri[(a, b, c)] += 1
        self.total = sum(self.uni.values())

    def p(self, w, prev1="<s>", prev2="<s>"):
        # Add-k smoothing on the UNIGRAM only, which is what gives an unseen
        # word a finite probability instead of zero. The conditional orders use
        # plain MLE and fall back through the interpolation weights.
        #
        # Both previous versions were wrong in opposite directions:
        #   * `(count + 0.5) / (denominator + 0.5 * vocab)` on the CONDITIONAL
        #     orders drags every bigram/trigram toward zero -> perplexity ~3800
        #   * no smoothing at all on the unigram -> an unseen word scores exactly
        #     0 at order 1, so the interpolated probability lands on the floor
        #     and short technical texts report perplexity in the thousands while
        #     ordinary Brown prose reports ~18
        v = len(self.uni)
        p1 = (self.uni.get(w, 0) + 0.5) / (self.total + 0.5 * v)
        c1 = self.uni.get(prev1, 0)
        p2 = (self.bi.get((prev1, w), 0) / c1) if c1 else 0.0
        c2 = self.bi.get((prev2, prev1), 0)
        p3 = (self.tri.get((prev2, prev1, w), 0) / c2) if c2 else 0.0
        return max(self.L1 * p1 + self.L2 * p2 + self.L3 * p3, self._FLOOR)

    def unigram_surprisal(self, w):
        v = len(self.uni)
        p = (self.uni.get(w.lower(), 0) + 0.5) / (self.total + 0.5 * v)
        return -math.log2(max(p, self._FLOOR))

    def unigram_entropy(self):
        if self._uni_entropy is None:
            tot = 0.0
            for w, c in self.uni.items():
                if w in ("<s>", "</s>"):
                    continue
                p = c / self.total
                tot -= p * math.log2(p)
            self._uni_entropy = tot
        return self._uni_entropy


def load_ref_model(force: bool = False) -> RefModel:
    os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(REF_CACHE) and not force:
        with open(REF_CACHE, "rb") as f:
            return pickle.load(f)

    # NLTK refuses to load from a world- or group-writable directory, and the
    # default ~/nltk_data here is 0775, so the corpus downloaded fine and then
    # failed to open. Point it at a 0700 path instead of fighting the warning.
    if not os.environ.get("NLTK_DATA"):
        os.environ["NLTK_DATA"] = os.path.expanduser("~/.local/share/nltk_data")
    warnings.filterwarnings("ignore")
    from nltk.corpus import brown

    m = RefModel()
    sents = [[w for w in s if any(ch.isalpha() for ch in w)]
             for s in brown.sents()]
    m.train(sents)

    # The stopword-omission baseline must be measured with the SAME tagger the
    # measure uses, or the comparison is between two different definitions of
    # "function word" and the parameter is meaningless. The first version read
    # Brown's universal tagset (DET/ADP/CONJ/PRON/PRT -> 0.321) while the
    # measure counts spaCy's FUNCTION_POS, which also carries AUX and PART;
    # observed rates came out above the baseline on every text, so the
    # parameter read exactly 0 everywhere.
    from measures_a import Ctx  # local import: avoids a circular module load
    from lexicons import FUNCTION_POS
    nlp_ = nlp()
    checked = 0
    fw = 0
    for sent in sents[:4000]:
        doc = nlp_(" ".join(sent))
        for t in doc:
            if t.is_space:
                continue
            checked += 1
            if t.pos_ in FUNCTION_POS:
                fw += 1
    m.fw_rate = fw / max(1, checked)

    with open(REF_CACHE, "wb") as f:
        pickle.dump(m, f, protocol=4)
    return m


# ------------------------------------------------------------------- helpers
def entropy(items):
    if not items:
        return 0.0
    c = Counter(items)
    n = sum(c.values())
    return -sum((v / n) * math.log2(v / n) for v in c.values())


def cos(a, b):
    import numpy as np
    if not a or not b:
        return 0.0
    keys = set(a) | set(b)
    va = np.array([a.get(k, 0.0) for k in keys])
    vb = np.array([b.get(k, 0.0) for k in keys])
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def tfidf_vectors(sent_tokens):
    """Sentence vectors with idf computed over the document itself, so no
    external corpus is needed for the coherence measure."""
    df = Counter()
    for toks in sent_tokens:
        df.update(set(toks))
    n = max(1, len(sent_tokens))
    vecs = []
    for toks in sent_tokens:
        tf = Counter(toks)
        total = max(1, sum(tf.values()))
        vecs.append({w: (c / total) * math.log((n + 1) / (df[w] + 1)) + 1e-9
                     for w, c in tf.items()})
    return vecs


def paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
