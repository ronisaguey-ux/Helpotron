"""Default writing style samples for each reading level and grade target.

These are excerpts from public domain books (Project Gutenberg) to use as
fallback writing styles when the student hasn't uploaded custom text.
"""

# Map reading level -> grade target -> sample text
# Grade targets: 'F', 'D', 'D+', 'C', 'C+', 'B', 'B+', 'A', 'A+'
# For simplicity, we use one sample per reading level; the grade target can
# influence the complexity of the sample, but we'll keep it simple.

DEFAULT_STYLES = {
    "9th": {
        "default": """Tom Sawyer was a boy of about twelve years old. He lived with his Aunt Polly in a small town on the Mississippi River. Tom was always getting into trouble. He hated school and loved adventure. One day, he decided to play hooky and went swimming instead of going to school. His aunt punished him by making him whitewash the fence on a Saturday. But Tom was clever. He convinced his friends that whitewashing was a great privilege, and they paid him to do it for him. Tom's adventures were many and varied. He and his friend Huckleberry Finn once witnessed a murder in the graveyard. They ran away and became pirates on an island. They even attended their own funeral. Tom was always full of schemes and pranks, but he had a good heart. He eventually found treasure and became the richest boy in town."""
    },
    "10th": {
        "default": """It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters. My dear Mr. Bennet, said his lady to him one day, have you heard that Netherfield Park is let at last? Mr. Bennet replied that he had not. But it is, returned she; for Mrs. Long has just been here, and she told me all about it. Mr. Bennet made no answer. Do you not want to know who has taken it? cried his wife impatiently. You want to tell me, and I have no objection to hearing it. This was invitation enough. Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it, that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week."""
    },
    "11th": {
        "default": """The Picture of Dorian Gray is a novel by Oscar Wilde. The story is about a young man named Dorian Gray who has his portrait painted by a friend. Dorian is so beautiful that he wishes to remain young forever, while the portrait ages instead. His wish comes true, and he leads a life of pleasure and vice, while the portrait becomes more and more hideous. Dorian eventually murders the painter and tries to destroy the portrait, but in doing so, he kills himself. The novel is a study of aestheticism, morality, and the consequences of vanity. Wilde's writing is witty and full of epigrams. One of the most famous lines from the book is: 'There is no such thing as a moral or an immoral book. Books are well written, or badly written. That is all.' Dorian Gray's story is a cautionary tale about the dangers of narcissism and the pursuit of pleasure at all costs."""
    },
    "12th": {
        "default": """Frankenstein; or, The Modern Prometheus is a novel written by Mary Shelley. The story begins with a man named Victor Frankenstein who discovers the secret of life and creates a creature from dead body parts. He is horrified by his creation and abandons it. The creature, however, is intelligent and sensitive, and it eventually seeks revenge on Victor for his abandonment. The creature kills Victor's family and friends, and Victor pursues it to the Arctic. The novel explores themes of creation, responsibility, and the consequences of playing God. Shelley's writing is Gothic and romantic, and the book is considered one of the earliest works of science fiction. The creature's final words to Victor are: 'I am the devil, but I am also your child.' The novel raises questions about what it means to be human and the ethics of scientific advancement."""
    },
    "college-freshman": {
        "default": """The Time Machine is a science fiction novella by H.G. Wells. It tells the story of a time traveler who invents a machine that can travel through time. He travels to the year 802,701 AD, where he finds two species of creatures: the Eloi, a peaceful but weak race, and the Morlocks, a subterranean race that preys on the Eloi. The time traveler then travels further into the future, to a time when the Earth is dying and the sun is fading. The novella is a commentary on class divisions and the evolution of humanity. Wells's writing is imaginative and thought-provoking. The time traveler's final journey into the far future leaves him stranded, and he never returns. The story is a classic of early science fiction and explores themes of time, progress, and the ultimate fate of humanity."""
    },
    "sophomore": {
        "default": """The Count of Monte Cristo is an adventure novel by Alexandre Dumas. The story is about a young sailor named Edmond Dantès who is unjustly imprisoned on the island of Château d'If. He spends years in prison, but eventually escapes and discovers a hidden treasure on the island of Monte Cristo. He reinvents himself as the Count of Monte Cristo and sets out to seek revenge on the three men who betrayed him. The novel is a tale of justice, redemption, and the consequences of obsession. Dumas's writing is rich and full of dramatic twists. The Count's plan is elaborate and methodical, and he slowly destroys his enemies one by one. However, he also learns that revenge has its limits, and he ultimately finds a measure of peace. The novel is one of the most popular works of French literature and has been adapted into numerous films and television shows."""
    }
}


def get_default_style(reading_level: str, target_grade: str = "default") -> str:
    """Return a default writing style sample for the given reading level and target grade."""
    level = reading_level or "college-freshman"
    # Normalize: if level not in dict, default to college-freshman
    if level not in DEFAULT_STYLES:
        level = "college-freshman"
    # Try to get target_grade-specific, else fallback to "default"
    style_dict = DEFAULT_STYLES[level]
    if target_grade in style_dict:
        return style_dict[target_grade]
    return style_dict.get("default", "")  # fallback to empty string
