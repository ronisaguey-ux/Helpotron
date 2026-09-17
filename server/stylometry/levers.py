"""Levers: deterministic text transformations, each aimed at named parameters.

The manifesto's second step: apply levers ONE AT A TIME and measure which
parameters each lever truly moves. These are deliberately *mechanical*
transformations, not LLM rewrites - a regex is reproducible, free, instant and
auditable, so it can establish what a lever does. An LLM rewrite cannot, and
once a lever's real effect is known the LLM can attempt the same move with the
measurement as its target.

STRUCTURE RULE: a sentence-level lever must transform INSIDE each paragraph.
The first version split the whole document into sentences and rejoined with a
single space, which merged every paragraph into one. The symptom was
`paragraph_length_variance` reporting +3299.7% on almost every lever - a bug
signature, not a lever effect. `paragraph_map` exists so this cannot recur.

Each lever declares what it is FOR. That is a hypothesis, and
`measure_levers.py` reports what it actually moves; the two need not agree.
"""

from __future__ import annotations

import re

# --------------------------------------------------------------------- helpers
_ABBREV = ("e.g", "i.e", "etc", "vs", "cf", "al", "Mr", "Mrs", "Dr", "St",
           "No", "Fig", "Eq", "approx", "Inc", "Ltd", "Jr", "Sr")


def split_sentences(paragraph: str) -> list[str]:
    """Sentence split that survives common abbreviations and decimals."""
    text = paragraph.strip()
    if not text:
        return []
    # Protect abbreviations by removing the period, then restore it.
    protected = text
    for a in _ABBREV:
        protected = re.sub(rf"\b{re.escape(a)}\.", a.replace(".", "\x00") + "\x00",
                           protected)
    parts = re.split(r"(?<=[.!?])\s+", protected)
    return [p.replace("\x00", ".").strip() for p in parts if p.strip()]


def split_paragraphs(text: str) -> list[str]:
    return [p for p in re.split(r"\n\s*\n", text) if p.strip()]


def _join(sents: list[str]) -> str:
    return " ".join(s.strip() for s in sents if s.strip())


def paragraph_map(text: str, per_para) -> str:
    """Apply a sentence-level transform inside each paragraph, preserving the
    blank-line structure of the document."""
    return "\n\n".join(_join(per_para(split_sentences(p)))
                       for p in split_paragraphs(text))


def regex_map(text: str, per_para) -> str:
    """Apply a whole-text regex transform paragraph by paragraph, so blank
    lines cannot be eaten."""
    return "\n\n".join(per_para(p) for p in split_paragraphs(text))


def _indices(n: int, count: int) -> list[int]:
    """Which positions to transform. Deterministic by stride, because a lever
    that moves around randomly cannot be measured."""
    if n == 0 or count <= 0:
        return []
    step = max(1, n // count)
    return list(range(0, n, step))[:count]


def _lower_first(s: str) -> str:
    return s[:1].lower() + s[1:] if s else s


def _upper_first(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


# ---------------------------------------------------------- nominalization axis
def de_nominalize(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Turn nominalizations back into verbs.

    Targets: nominalization_ratio (down), mean_word_length (down),
    clause_to_sentence_ratio (up). The manifesto names this move explicitly:
    'The reaction oxidized' -> 'The oxidation occurred' is the defining feature
    of technical prose.

    WORD-LEVEL, and that matters. The first version was a regex,
    `\\bthe (\\w{4,})tion of (\\w+)`, which captured the stem "Transforma" from
    "Transformation" and emitted "Transformaing" - it split the suffix instead of
    the word. A suffix is part of a word, so the substitution has to be
    per-word, from a table, with the grammatical restructure done explicitly.
    """
    # Phrase-level rewrites, which are where the grammar has to change too.
    phrases = [
        (r"\bthe transformation of\b", "transforming"),
        (r"\bthe production of\b", "producing"),
        (r"\bthe creation of\b", "creating"),
        (r"\bthe development of\b", "developing"),
        (r"\bthe introduction of\b", "introducing"),
        (r"\bthe distribution of\b", "distributing"),
        (r"\bthe measurement of\b", "measuring"),
        (r"\bthe analysis of\b", "analysing"),
        (r"\bthe evaluation of\b", "evaluating"),
        (r"\bthe reduction of\b", "reducing"),
        (r"\bthe increase in\b", "increasing"),
        (r"\bthe growth of\b", "growing"),
        (r"\bthe impact of\b", "how much"),
        (r"\bthe use of\b", "using"),
        (r"\bthe majority of\b", "most"),
        (r"\ba number of\b", "several"),
        (r"\bthe inefficiency of\b", "how inefficient"),
        (r"\bthe popularity of\b", "how popular"),
        (r"\bhas had a profound impact on\b", "profoundly changed"),
        (r"\bmade a significant contribution to\b", "contributed significantly to"),
        (r"\bwas responsible for the\b", ""),
    ]
    # Single-word swaps: nominalization -> verb or plainer form.
    words = {
        "transformation": "transforming", "civilization": "society",
        "production": "producing", "inefficiency": "inefficiency",
        "information": "information", "intellectual": "intellectual",
        "distribution": "distributing", "development": "developing",
        "introduction": "introducing", "measurement": "measuring",
        "evaluation": "evaluating", "examination": "examining",
        "observation": "observing", "consideration": "considering",
        "implementation": "implementing", "representation": "representing",
        "identification": "identifying", "determination": "determining",
        "establishment": "establishing", "improvement": "improving",
        "achievement": "achieving", "requirement": "requiring",
        "agreement": "agreeing", "argument": "arguing",
        "decision": "deciding", "conclusion": "concluding",
        "reduction": "reducing", "increase": "increasing",
        "expansion": "expanding", "concentration": "concentrating",
        "indication": "indicating", "suggestion": "suggesting",
        "implication": "implying", "application": "applying",
        "utilisation": "using", "utilization": "using",
        "communication": "communicating", "organisation": "organising",
        "organization": "organising",
    }
    hits = [0]

    def per_para(p):
        out = p
        for pat, rep in phrases:
            new, n = re.subn(pat, rep, out, flags=re.IGNORECASE)
            if n:
                # Preserve sentence-initial capitalisation.
                out = re.sub(
                    r"(^|[.!?]\s+)" + pat[2:],
                    lambda m: m.group(1) + _upper_first(rep),
                    out, count=1, flags=re.IGNORECASE)
                if out == new:
                    out = new
                hits[0] += n
        return out

    def per_para_words(p):
        out = p
        for a, b in words.items():
            out, n = re.subn(rf"\b{a}\b", b, out, flags=re.IGNORECASE)
            hits[0] += n
        return out

    out = regex_map(text, per_para)
    out = regex_map(out, per_para_words)
    return out, f"de_nominalize rewrote {hits[0]} span(s)"


def add_nominalizations(text: str, strength: float = 0.5) -> tuple[str, str]:
    """The inverse move, testing the same axis in the other direction."""
    rules = [
        (r"\bwe analysed\b", "an analysis was performed on"),
        (r"\bwe measured\b", "a measurement was performed on"),
        (r"\bwe observed\b", "an observation was made of"),
        (r"\bwe evaluated\b", "an evaluation was conducted of"),
        (r"\bwas analysed\b", "underwent analysis"),
        (r"\bwas measured\b", "underwent measurement"),
        (r"\bwas observed\b", "underwent observation"),
        (r"\bthe data show\b", "the data provide a demonstration of"),
        (r"\bthis suggests\b", "this provides a suggestion of"),
    ]
    hits = [0]

    def per_para(p):
        out = p
        for pat, rep in rules:
            out, n = re.subn(pat, rep, out, flags=re.IGNORECASE)
            hits[0] += n
        return out

    return regex_map(text, per_para), f"add_nominalizations applied {hits[0]}"


# --------------------------------------------------------------- discourse axis
_DISCOURSE = ["However, ", "Therefore, ", "Thus, ", "Consequently, ",
              "Furthermore, ", "Moreover, ", "Nevertheless, ", "Nonetheless, ",
              "Additionally, ", "Similarly, ", "In addition, ", "As a result, ",
              "For instance, ", "For example, ", "In contrast, ",
              "On the other hand, ", "Accordingly, ", "Ultimately, "]


def strip_discourse_markers(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Remove explicit logical connectives.
    Targets: discourse_marker_frequency, argumentative_structuring_index (down).
    """
    hits = [0]

    def per_para(sents):
        for i, s in enumerate(sents):
            for m in _DISCOURSE:
                if s.startswith(m):
                    sents[i] = _upper_first(s[len(m):])
                    hits[0] += 1
                    break
        return sents

    return paragraph_map(text, per_para), f"strip_discourse_markers removed {hits[0]}"


def add_discourse_markers(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Insert connectives at sentence starts: the same lever, upward."""
    hits = [0]

    # Markers already present at a sentence start. Without this the lever stacks
    # onto its own output - measured "So, so, more recently, but, automation has
    # extended" after two applications - and the guardrails do not catch it
    # because "So, so," is not a repeated adjacent BIGRAM at the token level.
    # Shared registry, not just this lever's own list - see _all_markers().
    def already(s: str) -> bool:
        return _opens_with_marker(s)

    # The marker index MUST persist across paragraphs. `_indices` restarts at 0
    # for every paragraph, so a per-paragraph k made position 1 of every paragraph
    # receive _DISCOURSE[0] - measured as six consecutive paragraphs all opening
    # "So, ...". A running counter gives each insertion the next marker instead.
    state = {"k": 0, "left": _marker_budget(text)}

    def per_para(sents):
        for i in _indices(len(sents), max(1, int(len(sents) * strength))):
            if i == 0 or len(sents[i].split()) < 4:
                continue
            if already(sents[i]):
                continue                      # never double up on a marker
            if state["left"] <= 0:
                break                          # human-rate cap reached
            m = _DISCOURSE[state["k"] % len(_DISCOURSE)]
            state["k"] += 1
            state["left"] -= 1
            sents[i] = m + _lower_first(sents[i])
            hits[0] += 1
        return sents

    return paragraph_map(text, per_para), f"add_discourse_markers inserted {hits[0]}"


# ------------------------------------------------- sentence length/burstiness
def vary_sentence_length(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Split long sentences at a conjunction.
    Targets: sentence_length_variance (up), burstiness (up). This is the
    burstiness axis the typing work showed is load-bearing for detector scores.
    """
    hits = [0]

    def per_para(sents):
        out = []
        budget = max(1, int(len(sents) * strength))
        for s in sents:
            m = re.search(r",\s+(and|but|which|while|because|although|so)\s+", s)
            if m and len(s.split()) > 16 and hits[0] < budget:
                out.append(s[:m.start()].rstrip(", ") + ".")
                out.append(_upper_first(s[m.end():]))
                hits[0] += 1
            else:
                out.append(s)
        return out

    return paragraph_map(text, per_para), f"vary_sentence_length split {hits[0]}"


def flatten_sentences(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Join adjacent short sentences: the same axis, downward."""
    hits = [0]

    def per_para(sents):
        out = []
        i = 0
        budget = max(1, int(len(sents) * strength))
        while i < len(sents):
            if (hits[0] < budget and i + 1 < len(sents)
                    and len(sents[i].split()) < 12
                    and len(sents[i + 1].split()) < 12):
                out.append(f"{sents[i].rstrip('.!?')}, and "
                           f"{_lower_first(sents[i + 1])}")
                hits[0] += 1
                i += 2
            else:
                out.append(sents[i])
                i += 1
        return out

    return paragraph_map(text, per_para), f"flatten_sentences joined {hits[0]}"


# ------------------------------------------------------------------ hedging axis
_HEDGES_ADD = ["apparently", "perhaps", "arguably", "broadly speaking",
               "to some extent", "presumably", "in general", "more or less",
               "it would seem that"]


def _hedge_strip_list() -> list[str]:
    """The strip list MUST come from the same lexicons the measure counts.

    The first version was hand-written and diverged from `lexicons.HEDGES` /
    `INTENSIFIERS`, so `strip_hedges` removed 0 words from a text the measure
    scored as having hedges - the lever and the instrument disagreed about what
    a hedge is. That is the same defect class as the stopword baseline being
    measured with a different tagger. Deriving the list makes divergence
    impossible.
    """
    from lexicons import HEDGES, INTENSIFIERS
    # A few are structural words whose removal damages grammar badly enough
    # that the fluency guard would reject every candidate ("so", "just", "much",
    # "most", "still", "yet"), so they are excluded by name.
    # MODALS ARE NOT HEDGES, even though the lexicon lists them as epistemic.
    # Deleting one does not soften a claim, it destroys the verb phrase:
    # measured "who may lack the resources" -> "who lack the resources" and
    # "it could be a problem" -> "it be a problem". A modal is a grammatical
    # operator, so it is excluded by category rather than by name.
    modals = {"may", "might", "could", "should", "would", "can", "will",
              "must", "shall", "ought"}
    skip = {"so", "just", "much", "most", "still", "yet", "even", "only",
            "about", "as", "for", "like", "well", "sort", "kind"} | modals

    # MULTI-WORD MARKERS MUST BE STRIPPED AS PHRASES, and their component words
    # must NOT also be stripped on their own. This pair of rules is the fix for a
    # measured loop: add_hedges inserts "Broadly speaking, ...", the single-word
    # strip then removed just "broadly", leaving "speaking, ..." - which
    # add_hedges did not recognise as a marker, so it inserted another one, and
    # after several passes the text read "speaking, speaking, speaking". The two
    # lists have to agree about what a marker is, or they fight.
    phrases = [h for h in _HEDGES_ADD if " " in h]
    lead = {p.split()[0].lower() for p in phrases}
    singles = sorted((HEDGES | INTENSIFIERS) - skip - lead)
    # longest first, so "to some extent" is not clipped by "some" / "extent"
    return sorted(phrases, key=len, reverse=True) + singles


_HEDGES_STRIP = _hedge_strip_list()


def _all_markers() -> list:
    """EVERY marker any lever can insert, longest first.

    The root cause of the worst corruption this engine produced: add_hedges and
    add_discourse_markers each checked only their OWN vocabulary before inserting,
    so they could not see each other's output. Measured result:

        "Perhaps, though, perhaps, though, perhaps, though, while these platforms..."

    add_discourse_markers put "though," at the front; add_hedges did not recognise
    "though" as a marker (it is not one of ITS hedges), so it inserted "Perhaps,";
    and the next pass found "Perhaps" unrecognised by the discourse lever. They
    took turns stacking on each other forever.
    """
    m = set(_HEDGES_ADD)
    m |= {d.strip().rstrip(",") for d in _DISCOURSE}
    return sorted(m, key=len, reverse=True)


_ALL_MARKERS = _all_markers()


# MEASURED, from the 32 confirmed-human essays: the share of sentences that open
# with a discourse marker is 0.1% on average and 2.3% at the very most. Real student
# writing essentially never does this. The engine, left uncapped, was marking nearly
# every sentence - because a composite score can accept a move that helps one
# parameter (hedge density) while wrecking another, as long as the weighted total
# still improves. The cap is therefore a hard constraint, not a preference.
MARKER_CAP_FRACTION = 0.06


def _marker_budget(text: str) -> int:
    """How many more sentences in this text may be given a leading marker.

    Derived from the human measurement above rather than chosen, with a floor of 1
    so a short text still has the lever available at all.
    """
    sents = [x for x in re.split(r"(?<=[.!?])\s+", text) if len(x.split()) > 3]
    if not sents:
        return 0
    already = sum(1 for x in sents if _opens_with_marker(x))
    allowed = max(1, int(len(sents) * MARKER_CAP_FRACTION))
    return max(0, allowed - already)


def _opens_with_marker(s: str) -> bool:
    """True when a sentence already begins with ANY marker this module inserts."""
    low = s.strip().lower()
    for m in _ALL_MARKERS:
        if low.startswith(m):
            nxt = low[len(m):len(m) + 1]
            if nxt in (",", ":", " ", ""):
                return True
    return False


def add_hedges(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Insert epistemic hedges.
    Targets: hedge_and_intensifier_density (up), formality (down).

    IDEMPOTENT ON ITS OWN OUTPUT. Without the `already` guard below this lever
    stacks: the engine applies a transform repeatedly while it keeps paying, and
    in impersonal mode that produced

        "Perhaps, perhaps, perhaps, perhaps, perhaps, so, this augmentation..."

    A sentence that already opens with a hedge is skipped, so a second pass finds
    nothing to do instead of piling another marker on top.
    """
    hits = [0]
    def already(s: str) -> bool:
        """True when a sentence already opens with ANY marker, from any lever.

        Checks whole phrases and single words so "Broadly speaking, ..." is not
        re-marked, and consults the shared registry so a marker inserted by
        add_discourse_markers also blocks this lever.
        """
        return _opens_with_marker(s)

    state = {"left": _marker_budget(text)}

    def per_para(sents):
        for k, i in enumerate(_indices(len(sents),
                                       max(1, int(len(sents) * strength)))):
            if i == 0 or len(sents[i].split()) < 5:
                continue
            if already(sents[i]):
                continue
            if state["left"] <= 0:
                break                          # human-rate cap reached
            state["left"] -= 1
            sents[i] = (f"{_upper_first(_HEDGES_ADD[k % len(_HEDGES_ADD)])}, "
                        f"{_lower_first(sents[i])}")
            hits[0] += 1
        return sents

    return paragraph_map(text, per_para), f"add_hedges inserted {hits[0]}"


def strip_hedges(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Remove hedges and intensifiers: the same axis, downward."""
    hits = [0]

    def per_para(p):
        out = p
        for w in _HEDGES_STRIP:
            out, n = re.subn(rf"\b{w}\s+", "", out, flags=re.IGNORECASE)
            hits[0] += n
        return re.sub(r"\s{2,}", " ", out)

    return regex_map(text, per_para), f"strip_hedges removed {hits[0]}"


# ------------------------------------------------------------- voice/person axis
def add_first_person(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Insert first-person framing.
    Targets: pronoun_bias_first_person (up), formality (down).

    STRENGTH IS HONOURED. The first version replaced every match unconditionally,
    so 0.25, 0.5 and 0.9 produced byte-identical output. The search explores
    three strengths per lever, so an ignored strength silently removes two thirds
    of the candidate space while the run still looks like it explored it.
    """
    rules = [
        # The negative lookbehind is load-bearing. Without it the lever is not
        # idempotent: "It is important" -> "I think it is important", and the
        # case-insensitive `\bIt is\b` then matches the "it is" INSIDE that
        # result, so a second application produced "I think I think it is
        # important". Measured in a real search run, where add_first_person was
        # accepted twice in consecutive rounds and compounded.
        (r"(?<!I think )(?<!I believe )\bIt is\b", "I think it is"),
        (r"(?<!I think )(?<!I believe )\bThere is\b", "I believe there is"),
        (r"(?<!I would suggest that )\bThis suggests\b",
         "I would suggest that this suggests"),
        (r"(?<!In my reading )\bThe results indicate\b",
         "In my reading the results indicate"),
        (r"(?<!I find that )\bIt appears\b", "I find that it appears"),
        (r"(?<!I take )\bThe evidence shows\b", "I take the evidence to show"),
        (r"(?<!I read this as indicating )\bThis indicates\b",
         "I read this as indicating"),
    ]
    hits = [0]

    def per_para(p):
        # Budget scales with strength across the whole paragraph set, so a
        # stronger setting really does apply more of the transformation.
        budget = max(1, int(round(len(re.findall(r"[.!?]\s|[.!?]$", p))
                                 * max(0.05, strength))))
        out = p
        for pat, rep in rules:
            if hits[0] >= budget:
                break
            out, n = re.subn(pat, rep, out, count=budget - hits[0],
                             flags=re.IGNORECASE)
            hits[0] += n
        return out

    return regex_map(text, per_para), f"add_first_person applied {hits[0]}"


# ------------------------------------------------------------- punctuation axis
def add_em_dashes(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Convert parentheticals to em dashes.
    Targets: punctuation_em_dash_rate (up). A clean surface lever, useful as a
    control that the pipeline detects small real changes."""
    hits = [0]

    def per_para(p):
        budget = max(1, int(len(p) / 120 * strength)) if strength else 1
        def sub(m):
            if hits[0] >= budget:
                return m.group(0)
            hits[0] += 1
            return "\u2014" + m.group(1) + "\u2014"
        return re.sub(r"\(([^)]{4,80})\)", sub, p)

    return regex_map(text, per_para), f"add_em_dashes converted {hits[0]}"


def add_semicolons(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Join clauses with semicolons where a comma-plus-conjunction exists.
    Targets: punctuation_semicolon_rate (up), comma density (down)."""
    hits = [0]

    def per_para(p):
        def sub(m):
            hits[0] += 1
            return "; "
        return re.sub(r",\s+(and|but|however|yet)\s+", sub, p)

    return regex_map(text, per_para), f"add_semicolons joined {hits[0]}"


def add_parentheticals(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Add clarifying parentheticals.
    Targets: parenthetical_injection_density (up)."""
    glosses = [
        (r"\bthe method\b", "the method (that is, the procedure)"),
        (r"\bthe results\b", "the results (see above)"),
        (r"\bthe sample\b", "the sample (n = 12)"),
        (r"\bthe data\b", "the data (unpublished)"),
        (r"\bthe process\b", "the process (described below)"),
        (r"\bthe algorithm\b", "the algorithm (hereafter the model)"),
        (r"\bthe study\b", "the study (conducted in 2019)"),
    ]
    hits = [0]

    def per_para(p):
        out = p
        for pat, rep in glosses:
            out, n = re.subn(pat, rep, out, count=1, flags=re.IGNORECASE)
            hits[0] += n
        return out

    return regex_map(text, per_para), f"add_parentheticals inserted {hits[0]}"


# ------------------------------------------------------------- attribution axis
def add_citations(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Insert citation-shaped spans at sentence ends.
    Targets: citation_density_marker (up). Deliberately synthetic: this tests
    whether the citation detector responds, not whether a citation is real."""
    hits = [0]

    def per_para(sents):
        for i in _indices(len(sents), max(1, int(len(sents) * strength))):
            if i == 0 or len(sents[i].split()) < 6:
                continue
            if sents[i].rstrip().endswith("."):
                sents[i] = sents[i].rstrip()[:-1] + " (Smith et al., 2019)."
                hits[0] += 1
        return sents

    return paragraph_map(text, per_para), f"add_citations inserted {hits[0]}"


# ---------------------------------------------------------------- structure axis
def fragmentize(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Drop the subject from some sentences, producing fragments.
    Targets: fragment_injection_rate (up), burstiness (up). Aggressive: it
    damages grammar, which the fluency guard must catch."""
    hits = [0]

    def per_para(sents):
        for i in _indices(len(sents), max(1, int(len(sents) * strength))):
            s = sents[i]
            words = s.split()
            if len(words) < 7:
                continue
            # "The system measures the value" -> "Measures the value"
            m = re.match(r"^(?:The|A|An|This|These|Those|It|We|They)\s+(\w.*)$",
                         s)
            if m:
                sents[i] = _upper_first(m.group(1))
                hits[0] += 1
        return sents

    return paragraph_map(text, per_para), f"fragmentize produced {hits[0]} fragment(s)"


# ------------------------------------------------------------------ etymology axis
_LATINATE = {
    "use": "utilise", "used": "utilised", "uses": "utilises",
    "shows": "demonstrates", "show": "demonstrate", "shown": "demonstrated",
    "got": "obtained", "get": "obtain", "gets": "obtains",
    "make": "fabricate", "made": "fabricated",
    "find": "ascertain", "found": "ascertained",
    "help": "facilitate", "helps": "facilitates",
    "need": "require", "needs": "requires",
    "start": "commence", "started": "commenced",
    "end": "terminate", "ended": "terminated",
    "buy": "purchase", "bought": "purchased",
    "tell": "inform", "told": "informed",
    "ask": "inquire", "asked": "inquired",
    "good": "favourable", "bad": "unfavourable",
    "big": "substantial", "small": "diminutive",
    "hard": "arduous", "easy": "straightforward",
    "think": "conceptualise", "thought": "conceptualised",
    "build": "construct", "built": "constructed",
    "keep": "retain", "kept": "retained",
    "give": "provide", "gave": "provided",
    "change": "modification", "changed": "modified",
    "growth": "augmentation", "work": "operation", "works": "operates",
    "way": "methodology", "ways": "methodologies",
    "thing": "entity", "things": "entities",
    "almost": "approximately", "about": "concerning",
}
_GERMANIC = {v: k for k, v in _LATINATE.items()}


def _swap_words(text: str, table: dict) -> tuple[str, str]:
    hits = [0]

    def per_para(p):
        out = p
        for a, b in table.items():
            out, n = re.subn(rf"\b{re.escape(a)}\b", b, out, flags=re.IGNORECASE)
            hits[0] += n
        return out

    return regex_map(text, per_para), hits[0]


def lengthen_words(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Swap short Germanics for Latinate alternatives.
    Targets: latinate_vs_germanic_ratio, mean_word_length, character entropy.
    The clearest test of the etymology heuristic: if a known German->Latinate
    substitution does not move the ratio, the heuristic does not measure what
    its name claims."""
    out, n = _swap_words(text, _LATINATE)
    return out, f"lengthen_words swapped {n}"


def shorten_words(text: str, strength: float = 0.5) -> tuple[str, str]:
    """The inverse: Latinate back to Germanic."""
    out, n = _swap_words(text, _GERMANIC)
    return out, f"shorten_words swapped {n}"


# ------------------------------------------------------------------ register axis
_TEMPORAL_ADD = ["Later that year", "In the following months", "By then",
                 "Years afterward", "Soon after", "That winter",
                 "In the spring of that year", "Eventually", "After some time",
                 "In the years that followed"]


def add_temporal(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Insert temporal anchors.
    Targets: temporal_marker_density (up). Biography-specific in the manifesto."""
    hits = [0]

    def per_para(sents):
        for k, i in enumerate(_indices(len(sents),
                                       max(1, int(len(sents) * strength)))):
            if i == 0 or len(sents[i].split()) < 5:
                continue
            sents[i] = (f"{_TEMPORAL_ADD[k % len(_TEMPORAL_ADD)]}, "
                        f"{_lower_first(sents[i])}")
            hits[0] += 1
        return sents

    return paragraph_map(text, per_para), f"add_temporal inserted {hits[0]}"


_IDIOMS_ADD = [
    ("In the end", "At the end of the day"),
    ("Finally", "When all was said and done"),
    ("Clearly", "It goes without saying that"),
    ("However", "The thing is"),
    ("Nevertheless", "Be that as it may"),
    ("considered", "took a look at"),
    ("examined", "had a look at"),
    ("determined", "figured out"),
    ("discovered", "came across"),
    ("investigated", "dug into"),
]


def add_idioms(text: str, strength: float = 0.5) -> tuple[str, str]:
    """Insert idioms and colloquial phrasal verbs.
    Targets: idiomatic_expression_rate (up), formality (down)."""
    hits = [0]

    def per_para(p):
        out = p
        for a, b in _IDIOMS_ADD:
            pat = rf"\b{re.escape(a)}\b" if a[0].islower() else rf"\b{re.escape(a)}\b"
            new, n = re.subn(pat, b, out, count=1)
            if n:
                out = new
                hits[0] += n
        return out

    return regex_map(text, per_para), f"add_idioms inserted {hits[0]}"


# ---------------------------------------------------------------- the registry
# Each entry states what it is FOR. That is a hypothesis; measure_levers.py
# reports what each lever actually moves, and the two need not agree.
LEVERS = {
    "de_nominalize": (de_nominalize, "nominalization_ratio down"),
    "add_nominalizations": (add_nominalizations, "nominalization_ratio up"),
    "strip_discourse_markers": (strip_discourse_markers, "discourse markers down"),
    "add_discourse_markers": (add_discourse_markers, "discourse markers up"),
    "vary_sentence_length": (vary_sentence_length, "sentence variance up"),
    "flatten_sentences": (flatten_sentences, "sentence variance down"),
    "add_hedges": (add_hedges, "hedging up"),
    "strip_hedges": (strip_hedges, "hedging down"),
    "add_first_person": (add_first_person, "first person up"),
    "add_em_dashes": (add_em_dashes, "em dashes up"),
    "add_semicolons": (add_semicolons, "semicolons up"),
    "add_parentheticals": (add_parentheticals, "parentheticals up"),
    "add_citations": (add_citations, "citations up"),
    "fragmentize": (fragmentize, "fragments up"),
    "lengthen_words": (lengthen_words, "latinate ratio up"),
    "shorten_words": (shorten_words, "latinate ratio down"),
    "add_temporal": (add_temporal, "temporal markers up"),
    "add_idioms": (add_idioms, "idiom rate up, formality down"),
}


def apply_lever(name: str, text: str, strength: float = 0.5):
    fn, intent = LEVERS[name]
    new_text, notes = fn(text, strength=strength)
    return new_text, notes, intent


if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if path:
        with open(path, encoding="utf-8", errors="replace") as f:
            txt = f.read()
    else:
        txt = ("The analysis of the data was performed. The system measures the "
               "value. We measured the effect and it was clear.")
    paras = len(split_paragraphs(txt))
    print(f"input: {len(txt.split())} words, {paras} paragraphs\n")
    for n in LEVERS:
        out, notes, intent = apply_lever(n, txt, strength=0.5)
        same = out.strip() == txt.strip()
        p2 = len(split_paragraphs(out))
        flag = "NO CHANGE" if same else "changed"
        if p2 != paras:
            flag += f"  PARAGRAPHS {paras}->{p2}"
        print(f"  {n:26} {flag:26} {notes}")
