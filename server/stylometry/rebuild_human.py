"""Rebuild the human half of the calibration corpus, GENRE-MATCHED.

The first corpus compared pre-1900 NOVELS against modern AI ESSAYS, and the feature
discovery dutifully reported "semicolons higher in human" and "questions higher in
human" - which are 19th-century-novel traits (dialogue, semicolon-heavy prose), not
human traits. Optimising a rewrite toward those would have chased a genre artifact.

The human side must therefore be expository prose of the same register as the AI
side. Sources, both definitively human-authored:

  * Project Gutenberg essays (Emerson, Thoreau, Bacon) - pre-1900, so no argument
    about provenance, and essay-register rather than fiction.
  * Wikipedia - modern expository reference prose, human-authored.
  * RFCs - modern technical prose written by humans, a third independent register.

Novels, poetry and drama are excluded even though they are the easiest human text
to obtain, because scoring them teaches the instrument the wrong lesson.
"""
import json, os, re, sys, urllib.request, warnings

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))

GUTENBERG_ESSAYS = {
    "emerson_essays": 16643,
    "thoreau_walden": 205,
    "bacon_essays": 56463,
    "chesterton_heretics": 470,
    "mill_liberty": 34901,
}
RFCS = ["rfc793", "rfc2616", "rfc2119", "rfc1925"]


def fetch(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "research/1.0"})
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "ignore")


def strip_gutenberg(t: str) -> str:
    """Remove the Project Gutenberg licence wrapper, which is boilerplate and would
    otherwise be scored as part of the prose."""
    start = re.search(r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG.*?\*\*\*", t)
    end = re.search(r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG", t)
    if start:
        t = t[start.end():]
    if end:
        t = t[:end.start()]
    return t


def essay_chunks(text: str, words: int = 420, count: int = 1):
    """Contiguous mid-document prose, skipping the title/front matter."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if len(p.split()) > 40]
    out = []
    for i in range(min(count, max(0, len(paras) - 4))):
        # Start a few paragraphs in, so the opening address is skipped.
        block = " ".join(paras[3 + i: 3 + i + 6])
        w = block.split()
        if len(w) >= words // 2:
            out.append(" ".join(w[:words]))
    return out


def main() -> int:
    out = []
    for name, gid in GUTENBERG_ESSAYS.items():
        try:
            url = f"https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt"
            t = strip_gutenberg(fetch(url))
            for j, ch in enumerate(essay_chunks(t, 420, 2)):
                out.append((f"human_{name}{j}", ch))
                print(f"  {name}{j}: {len(ch.split())}w")
        except Exception as e:
            print(f"  {name}: FAILED {type(e).__name__}: {str(e)[:70]}")

    arts = ["Printing press", "Industrial Revolution", "Unemployment", "Typewriter",
            "Steam engine", "Telegraphy", "Paper", "Bookbinding"]
    for a in arts:
        try:
            import urllib.parse
            url = ("https://en.wikipedia.org/w/api.php?action=query&prop=extracts"
                   "&explaintext=1&format=json&titles=" + urllib.parse.quote(a))
            d = json.loads(fetch(url))
            t = list(d["query"]["pages"].values())[0].get("extract", "")
            paras = [p for p in t.split("\n\n") if len(p.split()) > 25]
            if len(paras) >= 4:
                ch = " ".join(paras[1:6])
                if len(ch.split()) >= 200:
                    out.append((f"human_wiki_{a[:10].replace(' ', '_')}", ch))
                    print(f"  wiki_{a}: {len(ch.split())}w")
        except Exception as e:
            print(f"  wiki_{a}: FAILED {type(e).__name__}")

    for r in RFCS:
        try:
            t = fetch(f"https://www.rfc-editor.org/rfc/{r}.txt")
            ch = " ".join(t.split()[:460])
            out.append((f"human_{r}", ch))
            print(f"  {r}: {len(ch.split())}w")
        except Exception as e:
            print(f"  {r}: FAILED {type(e).__name__}")

    path = os.path.join(HERE, "calibration", "corpus.json")
    corpus = json.load(open(path))
    old = len(corpus["human"])
    corpus["human"] = out
    json.dump(corpus, open(path, "w"), indent=1)
    print()
    print(f"  human half replaced: {old} documents -> {len(out)}")
    print(f"  (novels/poetry removed; essays + reference + RFCs only)")
    print(f"  AI half unchanged: {len(corpus['ai'])} documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
