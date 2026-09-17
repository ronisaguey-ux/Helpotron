"""Lexicons for the humanizer instrument.

Every list here is a *measuring stick*, so each one is deliberately explicit and
auditable: if a parameter misses its target range, the fix is to edit the list
and re-measure, not to argue with a black box.

Sources: the marker classes follow the standard register-variation literature the
manifesto cites (Biber's dimensions, Coh-Metrix connectives, Halliday's function
words). Where a list cannot be exhaustive it is documented as a lower bound,
because a partial lexicon UNDERCOUNTS a rate - it never invents one.
"""

# --------------------------------------------------------------- word classes
# Closed-class POS tags (Universal Dependencies, as spaCy emits them).
FUNCTION_POS = frozenset({"DET", "ADP", "AUX", "CCONJ", "SCONJ", "PRON", "PART"})
CONTENT_POS = frozenset({"NOUN", "PROPN", "VERB", "ADJ", "ADV", "NUM"})

# ------------------------------------------------------------------ pronouns
FIRST_PERSON = frozenset({
    "i", "me", "my", "mine", "myself",
    "we", "us", "our", "ours", "ourselves",
})
SECOND_PERSON = frozenset({
    "you", "your", "yours", "yourself", "yourselves",
    "thou", "thee", "thy", "thine", "ye",
})
THIRD_PERSON = frozenset({
    "he", "him", "his", "himself", "she", "her", "hers", "herself",
    "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
})

# ------------------------------------------------------- discourse & argument
# Logical/organisational connectives. These are the markers Biber associates
# with informational production, so a technical essay should score high.
DISCOURSE_MARKERS = frozenset({
    "however", "therefore", "thus", "hence", "moreover", "furthermore",
    "consequently", "nevertheless", "nonetheless", "accordingly", "conversely",
    "similarly", "likewise", "instead", "meanwhile", "otherwise", "rather",
    "indeed", "namely", "specifically", "particularly", "notably",
    "additionally", "alternatively", "subsequently", "ultimately",
    "first", "firstly", "second", "secondly", "third", "thirdly",
    "finally", "lastly", "next", "then", "also", "besides", "still",
    "whereas", "while", "although", "though", "because", "since", "unless",
    "despite", "notwithstanding", "henceforth",
})

# The argumentative subset: thesis -> evidence -> contrast -> conclusion.
ARGUMENTATIVE_MARKERS = frozenset({
    "therefore", "thus", "hence", "consequently", "accordingly", "so",
    "because", "since", "as", "for",
    "however", "nevertheless", "nonetheless", "but", "yet", "although",
    "though", "whereas", "while", "despite", "conversely", "instead",
    "moreover", "furthermore", "additionally", "also", "besides",
    "therefore", "accordingly", "in", "conclusion", "sum",
    "first", "second", "third", "finally",
    "evidence", "suggests", "indicates", "demonstrates", "implies",
    "argues", "claims", "supports", "refutes", "contradicts",
    "premise", "assumption", "implication", "consequence", "warrant",
})

TEMPORAL_MARKERS = frozenset({
    "then", "before", "after", "during", "while", "when", "whenever",
    "until", "since", "once", "later", "earlier", "afterwards", "beforehand",
    "meanwhile", "simultaneously", "subsequently", "eventually", "finally",
    "initially", "originally", "formerly", "recently", "soon", "already",
    "still", "yet", "now", "today", "yesterday", "tomorrow", "tonight",
    "morning", "afternoon", "evening", "night", "spring", "summer",
    "autumn", "fall", "winter", "year", "years", "month", "months",
    "week", "weeks", "day", "days", "hour", "hours", "minute", "minutes",
    "decade", "decades", "century", "centuries", "era", "age",
})

# -------------------------------------------------------------------- hedges
HEDGES = frozenset({
    "about", "almost", "apparently", "appear", "appears", "approximately",
    "arguably", "around", "assume", "assumes", "broadly", "certain",
    "certainly", "circa", "could", "doubt", "doubtful", "essentially",
    "estimate", "estimated", "fairly", "feel", "feels", "frequently",
    "generally", "guess", "hardly", "hopefully", "imply", "indicate",
    "indicates", "largely", "likely", "mainly", "may", "maybe", "might",
    "mostly", "nearly", "normally", "often", "ought", "perhaps", "plausible",
    "possibly", "potentially", "presumably", "probably", "quite", "rather",
    "relatively", "reportedly", "roughly", "seem", "seems", "seldom",
    "should", "sometimes", "somewhat", "sort", "speculate", "suggest",
    "suggests", "suppose", "supposedly", "suspect", "tend", "tends",
    "typically", "unclear", "uncertain", "usually", "would",
})
INTENSIFIERS = frozenset({
    "absolutely", "acutely", "altogether", "awfully", "badly", "barely",
    "completely", "considerably", "deeply", "definitely", "downright",
    "dramatically", "especially", "exceptionally", "exceedingly", "extremely",
    "fairly", "fiercely", "fully", "greatly", "hardly", "highly", "hugely",
    "incredibly", "intensely", "just", "literally", "markedly", "merely",
    "mightily", "most", "much", "notably", "particularly", "perfectly",
    "positively", "powerfully", "pretty", "profoundly", "purely", "quite",
    "radically", "rather", "really", "remarkably", "scarcely", "seriously",
    "severely", "significantly", "simply", "so", "somewhat", "strongly",
    "substantially", "super", "terribly", "thoroughly", "totally", "tremendously",
    "truly", "unusually", "utterly", "very", "virtually", "wildly",
})

# -------------------------------------------------------------------- fillers
CONVERSATIONAL_FILLERS = frozenset({
    "well", "so", "just", "like", "anyway", "anyhow", "basically", "actually",
    "honestly", "literally", "seriously", "right", "okay", "ok", "yeah",
    "yep", "nope", "hmm", "uh", "um", "er", "ah", "oh", "gosh", "wow",
    "kinda", "sorta", "gonna", "wanna", "gotta", "dunno", "whatever",
    "anyways", "plus", "man", "dude", "stuff", "things",
})

# ------------------------------------------------------- register indicators
COLLOQUIAL = frozenset({
    "gonna", "wanna", "gotta", "kinda", "sorta", "dunno", "yeah", "yep",
    "nope", "ok", "okay", "stuff", "things", "guys", "folks", "kids",
    "awesome", "cool", "weird", "crazy", "super", "totally", "pretty",
    "lot", "lots", "big", "huge", "tiny", "get", "got", "gets", "put",
    "look", "looks", "like", "just", "really", "very", "so", "well",
})
FORMAL = frozenset({
    "therefore", "thus", "hence", "consequently", "furthermore", "moreover",
    "nevertheless", "notwithstanding", "whereas", "hereby", "wherein",
    "thereof", "therein", "thereby", "commence", "commenced", "constitute",
    "constitutes", "demonstrate", "demonstrates", "facilitate", "facilitates",
    "implement", "implements", "utilise", "utilize", "utilised", "subsequent",
    "prior", "regarding", "concerning", "pursuant", "aforementioned",
    "endeavour", "endeavor", "ascertain", "endeavours", "necessitate",
    "substantiate", "elucidate", "delineate", "promulgate", "adjudicate",
})
CONTRACTIONS = frozenset({
    "n't", "'s", "'re", "'ve", "'ll", "'d", "'m", "won't", "can't",
    "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't",
    "it's", "that's", "there's", "i'm", "i've", "i'll", "i'd",
    "you're", "you've", "we're", "we've", "they're", "they've",
})

# ------------------------------------------------------------ etymology proxy
# A suffix heuristic, not an etymology lookup. Documented as approximate: it
# measures the *morphological signature* the manifesto's parameter reacts to.
LATINATE_SUFFIXES = (
    "tion", "sion", "ment", "ance", "ence", "ity", "ous", "ive", "ial",
    "ical", "ic", "ate", "ize", "ise", "ify", "able", "ible", "al", "ary",
    "ory", "ent", "ant", "ure", "age", "ism", "ist", "ology", "ography",
    "escent", "acious", "itious", "aneous", "ferous", "gerous",
)
# Germanic-leaning markers: productive native suffixes.
GERMANIC_SUFFIXES = (
    "ness", "ship", "hood", "dom", "ful", "less", "like", "ling", "ward",
    "wise", "ing", "ed", "en", "er", "est", "th",
)

# ------------------------------------------------------------- nominalization
NOMINALIZATION_SUFFIXES = (
    "tion", "sion", "ment", "ance", "ence", "ity", "ness", "ism", "ist",
    "age", "ure", "al", "cy", "ry", "ship", "hood", "dom",
)
# Tokens that end in a nominalizing suffix but are not nominalizations.
NOMINALIZATION_STOPWORDS = frozenset({
    "nation", "question", "condition", "position", "action", "attention",
    "section", "station", "mention", "option", "opinion", "union", "onion",
    "companion", "champion", "scorpion", "million", "billion", "trillion",
    "region", "religion", "fashion", "passion", "mission", "session",
    "version", "vision", "division", "decision", "occasion", "person",
    "reason", "season", "prison", "poison", "lesson", "weapon", "iron",
    "one", "done", "gone", "none", "stone", "alone", "phone", "scene",
    "machine", "marine", "engine", "genuine", "divine", "imagine",
    "man", "woman", "human", "German", "Roman", "when", "then", "than",
    "again", "rain", "main", "plain", "certain", "mountain", "fountain",
    "captain", "curtain", "bargain", "villain", "domain", "campaign",
    "alien", "citizen", "children", "women", "men", "garden", "kitchen",
    "heaven", "seven", "eleven", "oven", "given", "driven", "proven",
    "written", "eaten", "beaten", "broken", "spoken", "token", "open",
    "happen", "often", "sudden", "widen", "golden", "wooden", "linen",
})

# ---------------------------------------------------------------- idiom lists
# Multi-word units. Matched on lowercased token n-grams.
IDIOMS = frozenset({
    "a piece of cake", "at the end of the day", "beat around the bush",
    "bite the bullet", "break the ice", "by and large", "call it a day",
    "come to terms with", "cut corners", "down to the wire",
    "every cloud has a silver lining", "face the music", "get the hang of",
    "give the benefit of the doubt", "go the extra mile", "hit the nail on the head",
    "in the nick of time", "in the same boat", "jump the gun", "keep an eye on",
    "last straw", "learn the ropes", "let the cat out of the bag",
    "miss the boat", "no pain no gain", "off the top of my head",
    "on the fence", "on the same page", "once in a blue moon",
    "out of the blue", "piece of cake", "pull someone's leg",
    "raining cats and dogs", "read between the lines", "rock the boat",
    "see eye to eye", "sit on the fence", "spill the beans",
    "take it with a grain of salt", "the ball is in your court",
    "the best of both worlds", "throw in the towel", "time will tell",
    "under the weather", "up in the air", "when it rains it pours",
    "you can say that again", "against the clock", "all ears",
    "as far as i know", "back to square one", "ballpark figure",
})
PHRASAL_VERBS = frozenset({
    "account for", "add up", "back up", "blow up", "break down", "break up",
    "bring about", "bring up", "call off", "carry on", "carry out",
    "catch up", "check out", "come across", "come up", "count on",
    "cut down", "cut off", "deal with", "drop out", "end up", "figure out",
    "fill in", "find out", "focus on", "get along", "get rid of",
    "give up", "go on", "go through", "grow up", "hold on", "keep on",
    "lay off", "leave out", "let down", "look after", "look forward to",
    "look into", "look up", "make up", "move on", "pass out", "pick up",
    "point out", "pull off", "put off", "put on", "put up with",
    "run into", "run out of", "set up", "show up", "sort out",
    "stand out", "take off", "take on", "take over", "turn out",
    "turn up", "work out", "write down", "rely on", "result in",
    "refer to", "consist of", "depend on", "lead to", "bring in",
    "carry over", "follow up", "opt out", "single out", "rule out",
})

CLICHES = frozenset({
    "in today's world", "in today's society", "in this day and age",
    "since the dawn of time", "throughout history", "in conclusion",
    "it is important to note", "it should be noted", "it is worth noting",
    "needless to say", "at the end of the day", "when all is said and done",
    "the fact of the matter is", "in the grand scheme of things",
    "a double-edged sword", "the tip of the iceberg", "a testament to",
    "plays a vital role", "plays a crucial role", "plays a significant role",
    "in the realm of", "in the world of", "a growing number of",
    "a wide range of", "a myriad of", "a plethora of", "delve into",
    "shed light on", "pave the way", "stands as a", "serves as a",
    "is a perfect example", "cannot be overstated", "goes without saying",
    "last but not least", "first and foremost", "in a nutshell",
    "the bottom line", "when it comes to", "as a matter of fact",
    "in other words", "for all intents and purposes", "with flying colors",
    "a beacon of hope", "the fabric of society", "rich tapestry",
    "ever-evolving", "fast-paced world", "digital age", "technological advancements",
    "leave a lasting impact", "make a difference", "the key to success",
    "a valuable lesson", "broaden my horizons", "deeply rooted",
})

# ---------------------------------------------------------------- citation-ish
# Citation-shaped spans, matched as regexes against raw text.
CITATION_PATTERNS = (
    r"\(\s*[A-Z][A-Za-z\-']+(?:\s+(?:et\s+al\.?|and|&)\s*[A-Za-z\-']*)*"
    r"\s*,?\s*(?:19|20)\d{2}[a-z]?\s*\)",       # (Smith 2019) / (Smith et al., 2019)
    r"\[\s*\d+(?:\s*[,;-]\s*\d+)*\s*\]",         # [12] / [1,3-5]
    r"\bet\s+al\.?\b",                            # et al.
    r"\b(?:19|20)\d{2}[a-z]?\b(?=[\s,;.)])",     # bare year
    r"\bdoi:\s*\S+",                              # doi:10.x/y
    r"\bhttps?://\S+",                            # url
    r"\((?:\s*[A-Z][a-z]+,\s*){1,3}(?:19|20)\d{2}\s*\)",  # (Smith, Jones, 2019)
)

# ------------------------------------------------------------- subtext proxies
# Discourse particles and stance markers whose presence signals unresolved,
# speaker-relative meaning rather than a stated proposition.
AMBIGUITY_MARKERS = frozenset({
    "perhaps", "maybe", "somehow", "somewhere", "something", "someone",
    "whatever", "whichever", "whoever", "wherever", "whenever", "however",
    "seems", "seemed", "felt", "feels", "maybe", "almost", "nearly",
    "between", "beyond", "within", "without", "toward", "towards",
    "behind", "beneath", "beneath", "among", "amongst", "against",
})
# Words with high polysemy (many WordNet senses) - the manifesto's "polysemy".
HIGH_POLYSEMY = frozenset({
    "light", "dark", "cold", "warm", "heavy", "sharp", "soft", "hard",
    "deep", "high", "low", "long", "short", "open", "close", "free",
    "clear", "fine", "fair", "plain", "flat", "round", "sound", "spring",
    "fall", "bear", "beat", "blow", "break", "cast", "draw", "drive",
    "face", "figure", "fire", "form", "grow", "head", "hold", "keep",
    "lay", "lead", "leave", "lie", "mark", "match", "mean", "meet",
    "move", "note", "order", "pass", "pick", "pitch", "place", "point",
    "press", "raise", "reach", "rest", "ring", "rock", "roll", "run",
    "scale", "seal", "serve", "set", "settle", "shake", "shape", "shift",
    "shoot", "sing", "sink", "sit", "spirit", "split", "spot", "stand",
    "state", "stay", "stem", "step", "stick", "stock", "stop", "strike",
    "stroke", "study", "suit", "support", "take", "taste", "tell",
    "tender", "tie", "tip", "touch", "treat", "turn", "voice", "wash",
    "watch", "wave", "wear", "weight", "will", "work", "yield",
})
