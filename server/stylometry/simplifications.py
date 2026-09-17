"""Lexical simplification tables for the deterministic engine.

WHY THIS TABLE EXISTS, and how it was derived. Measured against 32 the detector-confirmed
human student essays:

    feature                    human     AI      my AI baseline
    mean_word_length           4.435   5.242        6.115
    latinate_vs_germanic       0.066   0.171        0.311
    function_word_weight       0.430   0.331        0.348
    lexical_density_ratio      0.458   0.522        0.549

My baseline essay is 38% longer-worded than real student writing and uses 4.7x more
Latinate vocabulary. That is the single largest structural gap, and it is lexically
fixable without touching meaning: swap the academic register for the plain one.

The table is deliberately hand-built and auditable rather than a neural synonym
model, because the manifesto's whole argument is that the engine must be
deterministic. Every entry is a substitution a competent student would actually
make - not a thesaurus guess - and multi-word targets are allowed where the plain
form needs them ("in order to" -> "to").

    shorten(text)  -> lower mean_word_length, latinate ratio, lexical density
    lengthen(text) -> the inverse, used to calibrate the transform's own effect
"""


import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent
# Academic -> plain. Ordered longest-first at application time so that
# "in order to" is not destroyed by a shorter rule matching inside it.
TO_PLAIN = {
    # multi-word first
    "in order to": "to", "due to the fact that": "because", "for the purpose of": "to",
    "in the event that": "if", "with regard to": "about", "in regard to": "about",
    "a large number of": "many", "a significant number of": "many",
    "the majority of": "most", "a proportion of": "some", "prior to": "before",
    "subsequent to": "after", "in the absence of": "without", "by means of": "by",
    "in conjunction with": "with", "as a consequence of": "because of",
    "as a result of": "because of", "with respect to": "about", "in terms of": "in",
    "on the basis of": "from", "in the context of": "in",
    "it is important to note that": "note that", "it should be noted that": "note that",
    "plays a significant role in": "matters for", "plays a crucial role in": "matters for",
    "is capable of": "can", "is able to": "can", "are able to": "can",
    "has the ability to": "can", "makes it possible to": "lets",
    # verbs
    "utilize": "use", "utilise": "use", "utilized": "used", "utilised": "used",
    "utilizes": "uses", "utilises": "uses", "utilizing": "using", "utilising": "using",
    "demonstrate": "show", "demonstrates": "shows", "demonstrated": "showed",
    "demonstrating": "showing", "facilitate": "help", "facilitates": "helps",
    "facilitated": "helped", "facilitating": "helping",
    "implement": "start", "implements": "starts", "implemented": "started",
    "implementing": "starting", "obtain": "get", "obtains": "gets",
    "obtained": "got", "obtaining": "getting",
    "require": "need", "requires": "needs", "required": "needed",
    "requiring": "needing", "purchase": "buy", "purchased": "bought",
    "commence": "start", "commenced": "started", "terminate": "end",
    "terminated": "ended", "ascertain": "find out", "endeavour": "try",
    "endeavor": "try", "elucidate": "explain", "delineate": "outline",
    "substantiate": "support", "exacerbate": "worsen", "ameliorate": "improve",
    "necessitate": "need", "disseminate": "spread", "promulgate": "promote",
    "conceptualise": "think about", "conceptualize": "think about",
    "operationalize": "put to work", "incentivize": "encourage",
    "comprehend": "understand", "comprehends": "understands",
    "constitute": "make up", "constitutes": "makes up",
    "demonstrating": "showing", "endeavours": "tries", "expedite": "speed up",
    "allocate": "give", "allocated": "gave", "generating": "creating",
    "generate": "create", "generates": "creates", "generated": "created",
    "transform": "change", "transforms": "changes", "transformed": "changed",
    "restructure": "reorganize", "optimize": "improve", "optimise": "improve",
    "eliminate": "remove", "eliminates": "removes", "eliminated": "removed",
    "encompasses": "covers", "encompass": "cover", "incorporate": "include",
    "incorporates": "includes", "incorporating": "including",
    "disseminated": "spread", "augment": "add to", "augments": "adds to",
    # adjectives
    "significant": "important", "significantly": "a lot", "substantial": "large", "substantially": "a lot", "considerable": "large", "considerably": "greatly",
    "numerous": "many", "myriad": "many", "plethora": "many", "multitude": "many",
    "fundamental": "basic", "fundamentally": "basically",
    "essential": "key", "crucial": "key", "critical": "key", "vital": "key",
    "paramount": "key", "imperative": "necessary", "pivotal": "key",
    "comprehensive": "full", "extensive": "wide", "extensive": "wide",
    "substantive": "real", "profound": "deep", "profoundly": "deeply",
    "unprecedented": "new", "unparalleled": "unmatched",
    "advantageous": "good", "detrimental": "harmful", "beneficial": "good",
    "challenging": "hard", "problematic": "hard", "complex": "hard",
    "innumerable": "countless", "ubiquitous": "everywhere",
    "approximately": "about", "currently": "now", "subsequently": "later",
    "consequently": "so", "additionally": "also", "furthermore": "also",
    "moreover": "also", "nevertheless": "still", "nonetheless": "still",
    # "therefore"/"thus"/"hence" are sentence-initial connectives. Mid-sentence
    # they must NOT become "so": measured "workers unable to relocate so face a
    # mismatch" from "workers unable to relocate thus face". They are handled by
    # the position-aware pass below along with "however".
    "accordingly": "so",
    "regarding": "about", "concerning": "about",
    "furthermore": "also", "moreover": "also", "nevertheless": "still",
    "individuals": "people", "individual": "person", "persons": "people",
    "prioritize": "rank", "endeavored": "tried", "cognizant": "aware",
    "utilization": "use", "utilisation": "use", "implementation": "start",
    "methodology": "method", "modalities": "ways", "ramifications": "effects",
    "repercussions": "effects", "implications": "effects",
    "capabilities": "abilities", "capability": "ability",
    "commencement": "start", "termination": "end", "attainment": "reach",
    "occurrence": "case", "occurrences": "cases",
    "phenomenon": "thing", "phenomena": "things",
    "trajectory": "path", "paradigm": "model", "framework": "plan",
    "infrastructure": "system", "optimization": "improvement",
    "differentiation": "difference", "specialization": "focus",
    "collaboration": "teamwork", "utilizing": "using",
    "revolutionary": "new", "innovative": "new", "groundbreaking": "new",
    "transformative": "big", "comprehensive": "full",
    "disproportionately": "unevenly", "predominantly": "mostly",
    "overwhelmingly": "mostly", "increasingly": "more and more",
    "ultimately": "in the end", "effectively": "well", "efficiently": "well",
    "conventional": "normal", "contemporary": "modern", "subsequent": "later",
    "preceding": "earlier", "aforementioned": "already mentioned",
    "aforementioned": "already mentioned",
}

# Words whose removal is itself a simplification (adverb padding).
CUT_PADDING = {
    "fundamentally": "", "essentially": "", "arguably": "", "notably": "",
    "remarkably": "", "consequently": "so", "accordingly": "so",
    "it is worth noting that": "note that",
}


_BAD_ADJ = (("most big", "biggest"), ("very big", "huge"),
             ("more big", "bigger"), ("most large", "largest"))

# Connectives that are ONLY valid as a sentence opener. Mid-sentence they need a
# different English form, or the result is ungrammatical - measured
# "More recently, however, automation has extended" becoming
# "More recently, but, automation has extended".
_INITIAL_ONLY = {
    "however": "But",              # sentence-initial only
    "although": "Even though",
}
_MIDSENTENCE = {
    "however": "though",           # "... automation, though, has extended"
}
# Bare "so" is wrong mid-clause. "It therefore makes us less able" became
# "It so makes us less able" — measured on a real run. "so" only works as a
# coordinator after "and" ("the plan fails and so we stop") or as a sentence
# opener; as a bare mid-clause adverb it is ungrammatical. So the mid-clause map
# is now restricted to the coordinated case and these connectives are otherwise
# left alone.
_INITIAL_ONLY.update({
    "thus": "So", "hence": "So", "therefore": "So", "consequently": "So",
})
_MIDSENTENCE.update({
    "however": "though",
})
_COORDINATED = {
    "thus": "so", "hence": "so", "therefore": "so", "consequently": "so",
}


def shorten(text: str) -> tuple[str, int]:
    """Apply every substitution that matches. Returns (text, n_changes)."""
    import re
    n = 0
    # Longest keys first, so "in order to" is applied before "to" could interfere
    # and "a large number of" before "large" -> "big".
    for a in sorted(TO_PLAIN, key=len, reverse=True):
        b = TO_PLAIN[a]
        pat = rf"\b{re.escape(a)}\b" if " " not in a else re.escape(a)

        # CASE-PRESERVING replacement. The first version substituted the
        # lowercase form unconditionally, so a sentence-initial connective lost
        # its capital: "More recently, however, ..." became
        # "More recently, but, ..." and a new sentence began "but, it is uneven."
        def _repl(m, _b=b):
            src = m.group(0)
            if src.isupper():
                return _b.upper()
            if src[:1].isupper():
                return _b[:1].upper() + _b[1:]
            return _b

        text, k = re.subn(pat, _repl, text, flags=re.IGNORECASE)
        n += k

    # Position-aware connectives. A comma on both sides means the word is
    # parenthetical and must take the mid-sentence form; otherwise sentence-initial.
    for src, mid in _MIDSENTENCE.items():
        # (a) parenthetical form: ", however," -> ", though,"
        def _fix(m, _m=mid):
            return f", {_m},"
        text, k = re.subn(rf",\s*{src}\s*,", _fix, text, flags=re.IGNORECASE)
        n += k
    # Coordinated form only: "and therefore face a mismatch" -> "and so face".
    # This is the ONE mid-sentence position where "so" is grammatical. The old
    # pass fired on any mid-clause occurrence and produced "It so makes us less
    # able", which is why it is now fenced to a preceding coordinator.
    for src, coord in _COORDINATED.items():
        text, k = re.subn(rf"\b(and|but|or)\s+{src}\b", lambda m, _c=coord: f"{m.group(1)} {_c}",
                          text, flags=re.IGNORECASE)
        n += k
    for src, init in _INITIAL_ONLY.items():
        def _fix2(m, _i=init):
            return _i
        # only at a true sentence start: preceded by a full stop or line start
        text, k = re.subn(rf"(?<=[.!?]\s)\s*{src}\s*,", " " + _fix2(None), text,
                          flags=re.IGNORECASE)
        n += k
        text, k = re.subn(rf"^{src}\s*,", _fix2(None) + ",", text,
                          flags=re.IGNORECASE | re.MULTILINE)
        n += k

    for bad, good in _BAD_ADJ:
        text, k = re.subn(rf"\b{re.escape(bad)}\b", good, text, flags=re.IGNORECASE)
        n += k
    return fix_articles(text), n


def fix_articles(text: str) -> str:
    """Repair a/an agreement after a substitution may have broken it.

    "a significant burden" -> "a important burden" is wrong, and the fix belongs
    here rather than in the gate: rejecting the candidate throws away a valid
    simplification, while repairing it keeps the substitution and the grammar. The
    /w/-sound cases ("a one-time", "a European") are excluded because they take "a"
    despite the vowel letter.
    """
    import re
    text = re.sub(r"\ba\s+([aei]\w+|o(?!ne\b|nce\b)\w+)", r"an \1", text,
                  flags=re.IGNORECASE)
    text = re.sub(r"\ban\s+([bcdfgjklmnpqrstvwxyz]\w+|u[bcdfghjklmnpqrstvwxz]\w+)",
                  r"a \1", text, flags=re.IGNORECASE)
    return text


def lengthen(text: str) -> tuple[str, int]:
    """The inverse mapping, for calibrating the transform's own effect."""
    import re
    inv = {}
    for a, b in TO_PLAIN.items():
        if b and len(b) > len(a) and b not in inv:
            inv[b] = a
    n = 0
    for b in sorted(inv, key=len, reverse=True):
        text, k = re.subn(rf"\b{re.escape(b)}\b", inv[b], text, flags=re.IGNORECASE)
        n += k
    return text, n


if __name__ == "__main__":
    import sys
    t = open(sys.argv[1] if len(sys.argv) > 1
             else str(_HERE / "baseline700.txt")).read()
    out, n = shorten(t)
    print(f"  substitutions: {n}")
    print(f"  chars {len(t)} -> {len(out)}")
    print(f"  mean word len {sum(len(w) for w in t.split())/len(t.split()):.3f} "
          f"-> {sum(len(w) for w in out.split())/len(out.split()):.3f}")
    print()
    print(out[:400])
