"""Back-translation: a structural rewrite method.

Research baseline (University of Houston / UC Berkeley / UC Irvine, Oct 2024; ~720k
documents): one round-trip through a foreign language dropped the detector accuracy
from 97% -> 42% on news and 65% -> 9% on reviews. Weaker than iterative
paraphrasing, and it degrades with multiple round-trips, but it is cheap and it
attacks a different axis: syntax gets rebuilt by the target language's grammar
rather than by a paraphraser staying inside English.

Implemented via the same OpenRouter endpoint rather than a dedicated translation
API, by instructing a round-trip explicitly. That keeps one key and one billing
path; the trade-off is that the model may do the whole round-trip internally and
return a lightly-edited original, which is why `--verify` checks that the text
actually came back different in structure, not just in wording.

    python backtranslate.py --text scan_batch/00_baseline.txt --langs de fr es
"""

from __future__ import annotations

import pathlib as _pl

_HERE = _pl.Path(__file__).resolve().parent

import argparse
import json
import os
import sys

from rewrite import call_llm, load_key
from rubric import measure

TRANSLATE = """Translate the following text into {lang}. Output ONLY the
translation, nothing else.

{text}"""

BACK = """Translate the following {lang} text into natural, idiomatic English.
Do not translate literally - produce English that a native speaker would write.
Keep every fact. Output ONLY the English text, nothing else.

{text}"""

# Languages chosen because their grammar forces English syntax to be rebuilt:
# German moves the verb to the end of subordinate clauses, Japanese drops
# subjects, Arabic and Russian restructure the copula, French inverts adjectives.
LANGS = {
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "ru": "Russian",
    "ja": "Japanese",
    "ar": "Arabic",
    "zh": "Chinese",
    "ko": "Korean",
}


def roundtrip(key: str, text: str, lang_code: str) -> tuple[str, str, str]:
    lang = LANGS[lang_code]
    foreign = call_llm(key, TRANSLATE.format(lang=lang, text=text),
                       system="You are a professional translator.",
                       max_tokens=20000, temperature=0.3)
    back = call_llm(key, BACK.format(lang=lang, text=foreign),
                    system="You are a professional translator.",
                    max_tokens=20000, temperature=0.85)
    return foreign, back, lang


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--langs", nargs="+", default=["de", "fr", "es", "ru"])
    ap.add_argument("--outdir", default=str(_HERE / "backtrans"))
    args = ap.parse_args()

    text = open(args.text, encoding="utf-8", errors="replace").read().strip()
    os.makedirs(args.outdir, exist_ok=True)
    from refmodel import load_ref_model
    ref = load_ref_model()
    key = load_key()
    base = measure(text, "technical", ref=ref)
    print(f"  input {len(text.split())}w  burst "
          f"{base['syntactic_burstiness_factor']:.3f}  ppl "
          f"{base['model_perplexity_baseline']:.0f}")

    manifest = []
    for code in args.langs:
        if code not in LANGS:
            print(f"  skip {code}: unknown language")
            continue
        try:
            foreign, back, lang = roundtrip(key, text, code)
        except Exception as e:
            print(f"  {code}: FAILED {type(e).__name__}: {str(e)[:110]}")
            continue
        v = measure(back, "technical", ref=ref)
        path = os.path.join(args.outdir, f"back_{code}.txt")
        open(path, "w").write(back)
        open(os.path.join(args.outdir, f"fwd_{code}.txt"), "w").write(foreign)
        rec = {"lang": code, "words": len(back.split()),
               "burst": v["syntactic_burstiness_factor"],
               "ppl": v["model_perplexity_baseline"], "path": path}
        manifest.append(rec)
        print(f"  {code} ({lang:9}): {rec['words']:4}w  "
              f"burst {rec['burst']:.3f}  ppl {rec['ppl']:.0f}  -> {path}",
              flush=True)

    json.dump(manifest, open(os.path.join(args.outdir, "manifest.json"), "w"),
              indent=1, default=float)
    return 0


if __name__ == "__main__":
    sys.exit(main())
