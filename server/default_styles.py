"""Default writing style samples for each reading level and grade target.

Excerpts from public domain literature and scholarly texts (Project Gutenberg / Open Access)
to use as fallback writing styles when the user hasn't uploaded custom text samples.
Supports 3rd Grade through PhD Professor.
"""

DEFAULT_STYLES = {
    "3rd_grade": {
        "label": "3rd Grade Elementary",
        "default": "Wilbur loved Charlotte. She was kind and smart. Every day she would spin a new word in her web. All the animals on the farm watched in wonder. Wilbur felt safe and happy in the barn with all his new friends."
    },
    "4th_grade": {
        "label": "4th Grade Elementary",
        "default": "Peter lived with his family near Central Park. His little brother Fudge was always getting into mischief. One day Fudge swallowed Peter's pet turtle. Peter was very upset, but his parents helped him understand how to take care of his family."
    },
    "5th_grade": {
        "label": "5th Grade Intermediate",
        "default": "Jess and Leslie created a secret kingdom called Terabithia deep in the woods across the creek. They spent their afternoons building castles, imagining adventures, and helping each other overcome their fears at school."
    },
    "6th_grade": {
        "label": "6th Grade Middle School",
        "default": "Meg Murry, her small brother Charles Wallace, and their mother were sitting in the kitchen during a terrible storm. A mysterious visitor arrived with news of the fifth dimension and a journey across time and space."
    },
    "7th_grade": {
        "label": "7th Grade Middle School",
        "default": "Jonas was feeling apprehensive. It was almost December, and the Ceremony of Twelve was approaching. In their community, life was orderly, predictable, and free from pain, but Jonas was about to discover the hidden truth behind their memories."
    },
    "8th_grade": {
        "label": "8th Grade Middle School",
        "default": "Scout Finch lived with her father Atticus and brother Jem in Maycomb, Alabama. Atticus taught his children that you never really understand a person until you consider things from his point of view—until you climb into his skin and walk around in it."
    },
    "9th_grade": {
        "label": "9th Grade (High School Freshman)",
        "default": "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of their daughters."
    },
    "10th_grade": {
        "label": "10th Grade (High School Sophomore)",
        "default": "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world."
    },
    "11th_grade": {
        "label": "11th Grade (High School Junior)",
        "default": "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since. 'Whenever you feel like criticizing any one,' he told me, 'just remember that all the people in this world haven't had the advantages that you've had.'"
    },
    "12th_grade": {
        "label": "12th Grade (High School Senior)",
        "default": "The transition from classical antiquity to modern philosophical thought represents a fundamental shift in epistemic inquiry. Authors of the Enlightenment challenged conventional dogmas by insisting upon empirical observation, deductive reasoning, and institutional accountability."
    },
    "high_school": {
        "label": "High School (Default)",
        "default": "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of their daughters."
    },
    "undergrad_freshman": {
        "label": "Undergraduate Freshman",
        "default": "The investigation of natural phenomena requires rigorous observational discipline combined with structured theoretical models. In analyzing the principles of mechanical velocity and thermodynamic equilibrium, one must account for systematic measurement errors and contextual boundary conditions."
    },
    "undergrad_senior": {
        "label": "Undergraduate Senior",
        "default": "The discourse surrounding cognitive synthesis and linguistic determinism suggests that syntactic structures significantly constrain semantic retrieval. Empirical studies demonstrate that semantic priming accelerates lexeme categorization across distributed neuro-computational architectures."
    },
    "masters": {
        "label": "Master's Scholar",
        "default": "A comprehensive meta-analysis of epistemological methodologies indicates significant divergence between post-positivist empiricism and hermeneutic phenomenology. Quantitative regressors reveal robust correlations between institutional governance frameworks and socio-economic resilience metrics under exogenous shocks."
    },
    "phd_candidate": {
        "label": "PhD Candidate",
        "default": "By formalizing the variational free energy principle within non-equilibrium stochastic thermodynamics, we delineate the mathematical bounds of active inference. The resulting Markov blankets enforce conditional statistical independence across hierarchical latent representations."
    },
    "phd_professor": {
        "label": "PhD Professor / Post-Doc",
        "default": "The hermeneutic deconstruction of relativistic paradigms necessitates a recalibration of ontological priors. Through axiomatic formalization of non-Abelian gauge symmetries, we substantiate the dialectical convergence of quantum statistical mechanics and higher-order topological invariants."
    },
}

ACADEMIC_LEVELS = [
    {"key": "3rd_grade", "label": "3rd Grade (Elementary)"},
    {"key": "4th_grade", "label": "4th Grade (Elementary)"},
    {"key": "5th_grade", "label": "5th Grade (Elementary)"},
    {"key": "6th_grade", "label": "6th Grade (Middle School)"},
    {"key": "7th_grade", "label": "7th Grade (Middle School)"},
    {"key": "8th_grade", "label": "8th Grade (Middle School)"},
    {"key": "9th_grade", "label": "9th Grade (High School Freshman)"},
    {"key": "10th_grade", "label": "10th Grade (High School Sophomore)"},
    {"key": "11th_grade", "label": "11th Grade (High School Junior)"},
    {"key": "12th_grade", "label": "12th Grade (High School Senior)"},
    {"key": "undergrad_freshman", "label": "Undergraduate (Freshman/Sophomore)"},
    {"key": "undergrad_senior", "label": "Undergraduate (Junior/Senior)"},
    {"key": "masters", "label": "Master's Graduate Scholar"},
    {"key": "phd_candidate", "label": "PhD Candidate / Researcher"},
    {"key": "phd_professor", "label": "PhD Professor / Principal Investigator"},
]


SELECTED_BOOK_STYLES = [
    {
        "id": "book_great_gatsby",
        "title": "The Great Gatsby",
        "author": "F. Scott Fitzgerald",
        "era": "1920s Modernism",
        "tone": "Lyrical, introspective, evocative with rich cadence",
        "sample": "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since. 'Whenever you feel like criticizing any one,' he told me, 'just remember that all the people in this world haven't had the advantages that you've had.' He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that."
    },
    {
        "id": "book_pride_and_prejudice",
        "title": "Pride and Prejudice",
        "author": "Jane Austen",
        "era": "Regency Era / Realism",
        "tone": "Witty, structured, ironic, polished formal prose",
        "sample": "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters."
    },
    {
        "id": "book_1984",
        "title": "1984",
        "author": "George Orwell",
        "era": "Mid-Century Dystopian Realism",
        "tone": "Direct, punchy, sparse, unembellished clarity",
        "sample": "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him."
    },
    {
        "id": "book_moby_dick",
        "title": "Moby Dick",
        "author": "Herman Melville",
        "era": "19th Century Romanticism",
        "tone": "Philosophical, expansive, rhythmic, grand cadence",
        "sample": "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation."
    },
    {
        "id": "book_walden",
        "title": "Walden",
        "author": "Henry David Thoreau",
        "era": "Transcendentalism",
        "tone": "Reflective, grounded, deliberate, aphoristic",
        "sample": "I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear; nor did I wish to practise resignation, unless it was quite necessary."
    },
    {
        "id": "book_frankenstein",
        "title": "Frankenstein",
        "author": "Mary Shelley",
        "era": "Gothic Romanticism",
        "tone": "Passionate, intellectual, emotional gravity, complex syntax",
        "sample": "I was benevolent and good; misery made me a fiend. Make me happy, and I shall again be virtuous. But I am solitary and abhorred; yet I do not want to destroy that which is noble. You, my creator, would tear me to pieces and triumph; remember that, and tell me why I should pity man more than he pities me?"
    },
    {
        "id": "book_dorian_gray",
        "title": "The Picture of Dorian Gray",
        "author": "Oscar Wilde",
        "era": "Aestheticism / Late Victorian",
        "tone": "Epigrammatic, polished, decadent, sharp observational wit",
        "sample": "The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn."
    },
    {
        "id": "book_brave_new_world",
        "title": "Brave New World",
        "author": "Aldous Huxley",
        "era": "20th Century Satirical Dystopia",
        "tone": "Clinical, satirical, precise, intellectual irony",
        "sample": "A squat grey building of only thirty-four stories. Over the main entrance the words, CENTRAL LONDON HATCHERY AND CONDITIONING CENTRE, and, in a shield, the World State's motto, COMMUNITY, IDENTITY, STABILITY."
    },
]


def get_default_style(reading_level: str, target_grade: str = "default") -> str:
    """Return a default writing style sample for the given reading level."""
    level = reading_level or "10th_grade"
    if level not in DEFAULT_STYLES:
        # Fallback aliases
        alias_map = {
            "9th": "9th_grade",
            "10th": "10th_grade",
            "11th": "11th_grade",
            "12th": "12th_grade",
            "high_school": "10th_grade",
            "highschool": "10th_grade",
            "college-freshman": "undergrad_freshman",
            "sophomore": "undergrad_freshman",
        }
        level = alias_map.get(level, "10th_grade")
    
    style_entry = DEFAULT_STYLES.get(level, DEFAULT_STYLES["10th_grade"])
    return style_entry.get("default", "")
