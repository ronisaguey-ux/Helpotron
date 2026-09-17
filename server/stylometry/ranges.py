"""The 56-parameter stylometric reference table.

Transcribed from Bob's manifesto (2026-09-16, "Humanizer Stylometric Manifesto").
This file is DATA ONLY - no logic. It answers one question: given a genre, what
range should each parameter sit in?

Four genres, exactly as the manifesto defines them:
  technical  - Genre A: technical / academic essay, analytical philosophy
  biography  - Genre B: biography / narrative non-fiction, memoir, long-form profile
  poetry     - Genre C: poetry / verse
  fiction    - Genre D: literary fiction

Ranges are TARGETS TO APPROACH, not numbers to maximize. Overshooting past a
range is as wrong as falling short of it (manifesto, "THE TRAP").

`fidelity` records how honestly each parameter can be measured with the tooling
on this box, because a parameter that cannot be measured cannot close a loop:
  exact     - computed directly from the text, no model needed
  parser    - needs a dependency/POS parse (spaCy en_core_web_sm)
  corpus    - needs a reference corpus for a frequency/surprisal estimate
  approx    - measured, but by a documented stand-in for the manifesto's method
  unmeasurable - no honest local method; documentation, not a lever
"""

# Genre keys, in the order the manifesto presents them.
GENRES = ("technical", "biography", "poetry", "fiction")

GENRE_LABELS = {
    "technical": "Technical / Academic Essay",
    "biography": "Biography / Narrative Non-Fiction",
    "poetry": "Poetry / Verse",
    "fiction": "Literary Fiction",
}


def P(id, name, default, category, fidelity, method, tech, bio, poet, fic, bias,
      note=""):
    """One parameter row. Ranges are (low, high) or None where the manifesto
    declares the value N/A for that genre."""
    return {
        "id": id,
        "name": name,
        "default": default,
        "category": category,
        "fidelity": fidelity,
        "method": method,
        "ranges": {
            "technical": tech,
            "biography": bio,
            "poetry": poet,
            "fiction": fic,
        },
        "bias": bias,
        "note": note,
    }


PARAMS = [
    # ---------------------------------------------------------------- lexical
    P(1, "lexical_density_ratio", 0.58, "lexical", "parser",
      "content-word tokens / all tokens, content = NOUN/VERB/ADJ/ADV (Halliday)",
      (0.64, 0.72), (0.52, 0.58), (0.45, 0.78), (0.48, 0.54),
      "Highest in Technical (nominal packing)"),
    P(2, "type_token_ratio_windowed", 0.72, "lexical", "exact",
      "MATTR over a 100-word sliding window, averaged",
      (0.62, 0.68), (0.70, 0.76), (0.78, 0.92), (0.74, 0.82),
      "Highest in Poetry; suppressed in Technical by repeated domain terms"),
    P(3, "mean_word_length", 4.85, "lexical", "exact",
      "mean characters per alphabetic word token",
      (5.25, 5.80), (4.70, 5.05), (4.10, 4.75), (4.40, 4.75),
      "Skewed high by Greek/Latin compounds in Technical"),
    P(4, "word_length_variance", 1.42, "lexical", "exact",
      "population variance of word lengths in characters",
      (1.85, 2.40), (1.35, 1.60), (1.60, 2.90), (1.25, 1.50),
      "Highest variance in Poetry and Technical"),
    P(5, "character_level_entropy", 4.12, "lexical", "exact",
      "Shannon entropy in bits over the character unigram distribution",
      (4.35, 4.55), (4.10, 4.25), (3.65, 4.45), (4.05, 4.20),
      "Higher in Technical (uncommon morphological affixes)"),
    P(6, "function_word_profile_weight", 0.65, "lexical", "exact",
      "fraction of tokens that are closed-class function words",
      (0.45, 0.55), (0.62, 0.68), (0.35, 0.75), (0.68, 0.76),
      "High in Dialogue/Fiction; low in Technical"),
    P(7, "stopword_omission_rate", 0.08, "lexical", "exact",
      "1 - (observed function words / function words expected in full prose)",
      (0.02, 0.05), (0.04, 0.08), (0.15, 0.45), (0.06, 0.12),
      "Massive elevation in Poetry (telegraphic / ellipsis)"),
    P(8, "latinate_vs_germanic_ratio", 1.25, "lexical", "approx",
      "suffix/etymology-marker heuristic: Latinate (-tion,-ity,-ous,...) per "
      "Germanic-marked token; see suffixes.py for the marker list",
      (1.80, 2.60), (1.10, 1.40), (0.40, 0.95), (0.65, 1.05),
      "High Latinate in Technical; high Germanic in Poetry/Fiction"),

    # ------------------------------------------------------------- syntactic
    P(9, "syntactic_dependency_depth", 4.50, "syntactic", "parser",
      "maximum dependency-tree depth per sentence, averaged over sentences",
      (5.40, 7.20), (4.20, 5.10), (2.10, 6.80), (3.80, 4.80),
      "Deepest in Technical (complex embedded prepositions)"),
    P(10, "sentence_length_variance", 6.80, "syntactic", "exact",
      "population variance of sentence lengths in words",
      (8.50, 12.40), (7.20, 9.80), (3.10, 16.50), (8.00, 14.20),
      "Extreme bimodal variance in Fiction and Poetry"),
    P(11, "clause_to_sentence_ratio", 1.85, "syntactic", "parser",
      "finite-verb-rooted clause segments per sentence (ROOT + conj/advcl/ccomp)",
      (1.90, 2.45), (2.10, 2.60), (1.10, 2.20), (2.20, 2.85),
      "High in narrative fiction; compressed in technical writing"),
    P(12, "parse_tree_branching_asymmetry", 0.35, "syntactic", "parser",
      "mean |left_children - right_children| / total_children over all nodes",
      (0.55, 0.72), (0.32, 0.45), (0.10, 0.85), (0.28, 0.40),
      "Right-branching heavy in Technical; balanced in Narrative"),
    P(13, "pos_ngram_transition_smooth", 0.78, "syntactic", "parser",
      "mean cosine similarity of adjacent POS-trigram count vectors",
      (0.84, 0.92), (0.76, 0.82), (0.42, 0.68), (0.72, 0.80),
      "Highly regular in Technical; deliberately broken in Poetry"),
    P(14, "coordination_vs_subordination", 1.10, "syntactic", "parser",
      "count(conj) / count(advcl + ccomp + xcomp + acl + relcl)",
      (0.55, 0.80), (1.15, 1.45), (0.90, 2.10), (1.20, 1.65),
      "Subordination dominates Technical; coordination in Narrative"),
    P(15, "fragment_injection_rate", 0.04, "syntactic", "parser",
      "fraction of sentences with no ROOT verb (no finite predicate)",
      (0.001, 0.005), (0.02, 0.04), (0.18, 0.42), (0.05, 0.12),
      "Near zero in Technical; high stylistic presence in Poetry"),

    # -------------------------------------------------------------- semantic
    P(16, "semantic_coherence_gradient", 0.81, "semantic", "approx",
      "mean cosine similarity of adjacent sentences under TF-IDF vectors; "
      "stands in for the manifesto's neural-embedding cosine",
      (0.85, 0.92), (0.78, 0.84), (0.38, 0.68), (0.70, 0.80),
      "High sequential cosine similarity in Technical"),
    P(17, "entity_transition_density", 0.52, "semantic", "parser",
      "fraction of adjacent sentence pairs whose leading entity is unchanged",
      (0.38, 0.48), (0.72, 0.86), (0.22, 0.55), (0.65, 0.78),
      "Highest in Biography (continuous tracking of protagonist)"),
    P(18, "discourse_marker_frequency", 0.22, "semantic", "exact",
      "discourse connectives per sentence; see markers.py for the lexicon",
      (0.34, 0.48), (0.18, 0.26), (0.04, 0.12), (0.12, 0.18),
      "Dominated by logical connectives in Technical"),
    P(19, "information_density_rate", 0.64, "semantic", "approx",
      "mean content-word surprisal under a reference-corpus unigram model, "
      "normalised to 0-1 by the model's own entropy",
      (0.78, 0.90), (0.58, 0.66), (0.60, 0.95), (0.45, 0.60),
      "Maximum proposition density in Technical and Poetry"),
    P(20, "lexical_chaining_persistence", 0.45, "semantic", "approx",
      "overlap coefficient between the content-word sets of adjacent sentences",
      (0.65, 0.82), (0.52, 0.68), (0.25, 0.50), (0.40, 0.55),
      "Strongest semantic thread preservation in Technical"),
    P(21, "topic_drift_allowance", 0.15, "semantic", "approx",
      "median windowed vocabulary-turnover rate between adjacent 50-token blocks",
      (0.05, 0.10), (0.22, 0.32), (0.45, 0.85), (0.25, 0.40),
      "Strictly constrained in Technical; expansive in Poetry"),

    # ------------------------------------------------------------- stylometry
    P(22, "passive_voice_ratio", 0.12, "stylometry", "parser",
      "fraction of clauses whose main verb is a passive (auxpass dependent)",
      (0.24, 0.38), (0.08, 0.14), (0.02, 0.06), (0.04, 0.08),
      "High in Academic/Technical; minimized in Narrative"),
    P(23, "hedge_and_intensifier_density", 0.30, "stylometry", "exact",
      "hedge + intensifier tokens per sentence; see markers.py for the lexicon",
      (0.42, 0.58), (0.22, 0.32), (0.15, 0.40), (0.25, 0.35),
      "Epistemic hedges dominate Technical; intensifiers in Fiction"),
    P(24, "nominalization_ratio", 0.18, "stylometry", "exact",
      "nominally-derived tokens (-tion,-ment,-ance,-ity,...) / all tokens",
      (0.32, 0.46), (0.14, 0.20), (0.06, 0.14), (0.08, 0.14),
      "Defining feature of Technical/Academic prose"),
    P(25, "pronoun_bias_first_person", 0.05, "stylometry", "exact",
      "first-person pronoun tokens / all pronoun tokens",
      (0.01, 0.04), (0.02, 0.08), (0.15, 0.45), (0.08, 0.28),
      "Suppressed in Technical; prominent in Lyric Poetry/Memoir"),
    P(26, "pronoun_bias_second_person", 0.02, "stylometry", "exact",
      "second-person pronoun tokens / all pronoun tokens",
      (0.00, 0.01), (0.00, 0.02), (0.05, 0.22), (0.02, 0.06),
      "Rare across prose; present in apostrophic Poetry"),
    P(27, "punctuation_comma_density", 0.48, "stylometry", "exact",
      "commas per sentence",
      (0.58, 0.72), (0.46, 0.54), (0.20, 0.65), (0.42, 0.52),
      "Elevated in Technical by introductory adverbials and lists"),
    P(28, "punctuation_em_dash_rate", 0.06, "stylometry", "exact",
      "em/en dashes per sentence",
      (0.01, 0.03), (0.05, 0.09), (0.08, 0.25), (0.06, 0.14),
      "Highest in modern Poetry and Fiction"),
    P(29, "punctuation_semicolon_rate", 0.03, "stylometry", "exact",
      "semicolons per sentence",
      (0.05, 0.11), (0.03, 0.06), (0.01, 0.05), (0.02, 0.04),
      "Distinct marker of formal Academic/Philosophical prose"),
    P(30, "parenthetical_injection_density", 0.05, "stylometry", "exact",
      "parenthetical spans per sentence (brackets, dashes, appositive commas)",
      (0.12, 0.22), (0.06, 0.10), (0.02, 0.08), (0.03, 0.06),
      "Dominated by citations and clarifications in Technical"),

    # ------------------------------------------------------- cognitive / info
    P(31, "model_perplexity_baseline", 34.2, "cognitive", "approx",
      "perplexity under a reference-corpus trigram model with Kneser-Ney "
      "smoothing; a stand-in for the manifesto's autoregressive-LLM perplexity",
      (18.5, 28.0), (28.0, 38.0), (75.0, 180.0), (32.0, 48.0),
      "Low surprisal in predictable Technical; highest in Poetry"),
    P(32, "syntactic_burstiness_factor", 0.75, "cognitive", "exact",
      "coefficient of variation of sentence lengths, squashed to 0-1",
      (0.45, 0.60), (0.68, 0.78), (0.85, 0.98), (0.78, 0.92),
      "Low in uniform Technical; high in Fiction/Poetry"),
    P(33, "argumentative_structuring_index", 0.50, "cognitive", "exact",
      "thesis/evidence/contrast/conclusion connective density per sentence",
      (0.82, 0.95), (0.42, 0.55), (0.10, 0.28), (0.20, 0.35),
      "Dominant in Technical/Philosophy essays"),
    P(34, "temporal_marker_density", 0.10, "cognitive", "exact",
      "temporal adverbials + tensed time expressions per sentence",
      (0.04, 0.08), (0.24, 0.38), (0.08, 0.16), (0.18, 0.26),
      "Primary structural anchor in Biography"),
    P(35, "register_formality_score", 0.60, "cognitive", "approx",
      "composite: contraction rate, colloquial-token rate, formal-token rate",
      (0.88, 0.98), (0.68, 0.78), (0.30, 0.85), (0.45, 0.65),
      "Near-ceiling formality in Technical"),
    P(36, "cognitive_load_correlation_target", 0.42, "cognitive", "approx",
      "composite of dependency depth and clause count per sentence, normalised",
      (0.68, 0.82), (0.45, 0.55), (0.20, 0.60), (0.40, 0.50),
      "High clausal processing overhead in Technical"),
    P(37, "working_memory_chunk_size", 7.00, "cognitive", "parser",
      "mean number of open syntactic heads pending at each token (DLT-style)",
      (8.50, 11.20), (6.80, 7.80), (3.50, 6.50), (5.80, 7.20),
      "Strained past Miller's 7+/-2 limit in dense Technical syntax"),

    # ---------------------------------------------------------------- macro
    P(38, "paragraph_length_variance", 4.20, "macro", "exact",
      "population variance of paragraph lengths in sentences",
      (2.80, 4.50), (4.80, 6.50), None, (6.20, 9.80),
      "High uniformity in Technical; wide swing in Fiction",
      note="manifesto marks this N/A for poetry (stanzas, not paragraphs)"),
    P(39, "intro_outro_symmetry_ratio", 0.90, "macro", "approx",
      "vocabulary + argumentative-connective overlap between first and last "
      "paragraph, normalised",
      (0.92, 0.98), (0.65, 0.78), (0.30, 0.60), (0.45, 0.65),
      "Strict macro-rhetorical symmetry in Technical papers"),
    P(40, "citation_density_marker", 0.08, "macro", "exact",
      "citation-shaped spans per sentence (parenthetical years, et al., [n])",
      (0.22, 0.45), (0.05, 0.12), (0.00, 0.01), (0.00, 0.02),
      "High explicit attribution in Technical"),
    P(41, "question_to_statement_ratio", 0.04, "macro", "exact",
      "sentences ending in '?' / sentences ending in '.'",
      (0.01, 0.03), (0.02, 0.05), (0.08, 0.22), (0.06, 0.14),
      "Suppressed in Technical; rhetorical in Poetry/Fiction"),
    P(42, "idiomatic_expression_rate", 0.15, "macro", "approx",
      "matches against a fixed idiom/phrasal-verb lexicon per sentence",
      (0.02, 0.05), (0.12, 0.18), (0.10, 0.30), (0.18, 0.28),
      "Colloquial idioms avoided in Technical prose"),
    P(43, "subtext_ambiguity_index", 0.20, "macro", "approx",
      "composite: pronoun-antecedent ambiguity, polysemy density, "
      "unresolved-noun rate",
      (0.02, 0.06), (0.15, 0.25), (0.75, 0.95), (0.45, 0.65),
      "Deliberately eliminated in Technical; central to Poetry"),

    # ------------------------------------------------------------ micro-aeathetic
    P(44, "alliteration_clustering_rate", 0.05, "micro", "exact",
      "fraction of adjacent content-word pairs sharing an onset consonant",
      (0.02, 0.04), (0.04, 0.07), (0.22, 0.58), (0.06, 0.12),
      "Intentional aesthetic density in Poetry"),
    P(45, "rhythmic_cadence_variance", 0.65, "micro", "approx",
      "variance of the per-sentence stressed-syllable count, normalised; "
      "syllables are estimated, not dictionary-looked-up",
      (0.35, 0.48), (0.58, 0.68), (0.15, 0.85), (0.62, 0.74),
      "Monotonous in Technical; structured or volatile in Verse"),
    P(46, "cliche_suppression_filter", 0.85, "micro", "approx",
      "1 - (cliche-phrase hits / opportunities); see markers.py for the lexicon",
      (0.70, 0.80), (0.78, 0.85), (0.92, 0.99), (0.82, 0.90),
      "Highest originality requirement in serious Poetry"),
    P(47, "conversational_filler_frequency", 0.05, "micro", "exact",
      "fillers/discourse particles per sentence (well, just, really, you know)",
      (0.00, 0.01), (0.02, 0.04), (0.00, 0.08), (0.06, 0.15),
      "Confined to dialogue in Narrative Fiction"),
    P(48, "syntactic_inversion_rate", 0.08, "micro", "parser",
      "clauses with a non-subject-first ordering, per clause",
      (0.03, 0.06), (0.06, 0.10), (0.25, 0.55), (0.08, 0.14),
      "Frequent anastrophe / poetic inversion in Verse"),
    P(49, "lexical_repetition_tolerance", 0.18, "micro", "exact",
      "1 - (content-word types / content-word tokens), i.e. tolerated repetition",
      (0.38, 0.55), (0.16, 0.22), (0.08, 0.35), (0.12, 0.18),
      "High tolerance in Technical for unambiguous taxonomy"),
    P(50, "human_imperfection_noise_seed", 0.12, "micro", "approx",
      "density of irregular typography and non-template phrasing "
      "(irregular spacing, mid-sentence case, double punctuation)",
      (0.04, 0.08), (0.10, 0.15), (0.18, 0.35), (0.12, 0.18),
      "Low in polished formal papers; visible in informal verse"),

    # ------------------------------------- the six the manifesto adds (51-56)
    P(51, "mean_dependency_distance", 3.20, "syntactic", "parser",
      "mean |head_index - dependent_index| over all dependency arcs (Liu)",
      (3.20, 3.85), (2.60, 3.10), (1.80, 4.20), (2.40, 2.80),
      "Stretched by post-modifying phrases in Technical",
      note="manifesto gives only three genres; biography is interpolated"),
    P(52, "phrasal_compression_vs_clausal_elaboration", 3.00, "syntactic",
      "parser",
      "(prepositional phrases + nominal pre-modifiers) / finite dependent "
      "clauses (Biber & Gray)",
      (4.50, 7.20), (1.80, 2.40), (0.90, 1.40), (0.90, 1.40),
      "Modern academic writing packages information into dense noun phrases",
      note="manifesto gives technical/biography/fiction; poetry set to fiction"),
    P(53, "honore_statistic", 1200.0, "lexical", "approx",
      "R = 100*log(N) / (1 - V1/V); hapax-based vocabulary richness "
      "(Brunet's W reported alongside)",
      (1100, 1350), (1100, 1350), (1800, 2400), (1400, 1800),
      "Poetry peaks on hapax legomena; Technical repeats its jargon",
      note="manifesto gives poetry and technical only; biography/fiction interpolated"),
    P(54, "bigram_conditional_surprisal_entropy", 3.60, "cognitive", "approx",
      "cross-entropy in bits/word of the text under a reference-corpus "
      "bigram model",
      (3.2, 4.1), (4.1, 5.2), (6.8, 9.4), (5.2, 6.8),
      "Predictable collocations in Technical; low mutual information in Poetry",
      note="manifesto gives technical and poetry only; biography/fiction interpolated"),
    P(55, "punctuation_to_word_ratio", 0.14, "stylometry", "exact",
      "punctuation glyphs / word tokens",
      (0.12, 0.16), (0.12, 0.16), (0.02, 0.35), (0.14, 0.22),
      "Commas/colons/brackets dominate Technical; dialogue marks in Fiction",
      note="manifesto gives technical/fiction/poetry; biography interpolated"),
    P(56, "yngve_frazier_tree_depth", 5.50, "syntactic", "parser",
      "mean number of non-terminal branches held open per token, at each "
      "token (Yngve/Frazier), approximated from the constituency-free "
      "dependency tree by counting pending heads",
      (4.8, 6.5), (4.0, 5.0), (1.5, 5.2), (3.1, 4.0),
      "Deepest in Technical; shallowest in Fiction",
      note="manifesto gives technical/fiction/poetry; biography interpolated"),
]

# ------------------------------------------------------------------ indexes
BY_NAME = {p["name"]: p for p in PARAMS}
BY_ID = {p["id"]: p for p in PARAMS}

# Parameters the manifesto adds beyond the original 50.
EXTRA_IDS = (51, 52, 53, 54, 55, 56)

# The original engine table of 50, with its own defaults.
ENGINE_DEFAULTS = {p["name"]: p["default"] for p in PARAMS}

# Fidelity buckets - the honest controllability split.
def by_fidelity():
    out = {}
    for p in PARAMS:
        out.setdefault(p["fidelity"], []).append(p["name"])
    return out


def range_for(name, genre):
    """(low, high) for a parameter in a genre, or None if N/A."""
    return BY_NAME[name]["ranges"].get(genre)


def deviation(name, value, genre):
    """How far a measured value sits outside its target range.

    Returns 0.0 when inside the range (inside is success - the range is a
    target to approach, not a number to maximize). Outside, returns the
    distance expressed in range-widths, so parameters on different scales
    are comparable:
        < 0 below the range, > 0 above it, and 1.0 means "one whole
        range-width past the edge".
    """
    r = range_for(name, genre)
    if r is None or value is None:
        return None
    lo, hi = r
    width = max(hi - lo, 1e-9)
    if value < lo:
        return (value - lo) / width
    if value > hi:
        return (value - hi) / width
    return 0.0


if __name__ == "__main__":
    from collections import Counter
    print(f"{len(PARAMS)} parameters across {len(GENRES)} genres")
    print()
    print("fidelity split:")
    for k, v in sorted(by_fidelity().items()):
        print(f"  {k:12} {len(v):2}  {', '.join(v[:6])}"
              + (" ..." if len(v) > 6 else ""))
    print()
    print("by category:", dict(Counter(p["category"] for p in PARAMS)))
