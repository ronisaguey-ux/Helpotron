"""Does a big humanization task actually get CHUNKED, with no paragraph lost?

Owner: *"add a char limit to humanizing so big humanization tasks are done in chunks, cuz we
know that doing it paragraph by paragraph yeilds better results and longer ones generate
junk"*.

★ THIS IS A MEASURED FAILURE, NOT A PREFERENCE. Humanizing a 321-word, 5-paragraph biography as
ONE string silently LOST the entire concluding paragraph. Per paragraph, all 5 survived. So the
tests that matter are: is the text split, is every paragraph still present afterwards, and does
the rejoin preserve the structure.

Driven with the model call faked, so this measures the WIRING rather than the model's mood.
"""

import asyncio
import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server import hip_humanizer as H  # noqa: E402

PARAS = [
    "John Locke was born in 1632 in Somerset, England. He studied at Oxford and later became "
    "a physician and philosopher whose work shaped modern political thought.",
    "His most influential book argued that government rests on the consent of the governed. "
    'He wrote, "The end of law is not to abolish or restrain, but to preserve and enlarge '
    'freedom." That single sentence carried into the American Revolution.',
    "Locke also wrote on education and religious toleration, and his letters show a careful, "
    "practical mind that preferred evidence to authority in every dispute he entered.",
    "He spent years in exile in the Netherlands after his patron fell from favour, and it was "
    "there that he finished the two treatises that made his name.",
    "In conclusion, Locke's influence reaches from the Declaration of Independence to modern "
    "theories of liberal democracy, and his insistence on consent remains central today.",
]
DOC = "\n\n".join(PARAS)


_PATCHED = ("hip_configured", "hip_rounds", "_hip_server_cpu_seconds",
            "_one_round", "HIP_MAX_CHUNK_CHARS")


def main() -> int:
    ok = True

    print("\n  --- splitting respects paragraph boundaries ---")
    chunks = H.chunk_text(DOC, max_chars=300)
    print(f"    {len(DOC)} chars -> {len(chunks)} chunks")
    for i, c in enumerate(chunks):
        print(f"      [{i}] {len(c):>4} chars | {c[:60]}...")
    if len(chunks) > 1:
        print("    PASS — a long document is split.")
    else:
        print("    FAIL — it went in as one block, which is what loses paragraphs.")
        ok = False

    # No chunk may exceed the limit (allowing one sentence of overshoot only when a single
    # sentence is itself longer than the limit).
    over = [c for c in chunks if len(c) > 300 and "." in c[:-1]]
    if not over:
        print("    PASS — no chunk exceeded the limit.")
    else:
        print(f"    FAIL — {len(over)} chunk(s) were over the limit.")
        ok = False

    # A paragraph must not be cut mid-sentence.
    for c in chunks:
        if c and c[-1] not in ".!?\"":
            print(f"    FAIL — a chunk ends mid-sentence: ...{c[-40:]}")
            ok = False
            break
    else:
        print("    PASS — every chunk ends on a sentence boundary.")

    print("\n  --- a short document is NOT split ---")
    short = "This is one short paragraph. It should go in as a single piece of work."
    short_chunks = H.chunk_text(short, max_chars=300)
    print(f"    {len(short_chunks)} chunk(s)")
    if len(short_chunks) == 1:
        print("    PASS — short text stays whole.")
    else:
        print("    FAIL — short text was needlessly split.")
        ok = False

    print("\n  --- EVERY paragraph survives the chunked round trip ---")
    seen = {"n": 0}

    async def fake_round(text, session):
        seen["n"] += 1
        return text.upper()          # a stand-in that preserves every word

    # ★ RESTORE EVERYTHING. These are module-level assignments on a production module, so
    # leaving them set rewrites hip_humanizer for the rest of the process — every later test
    # (and any code path it exercises) would see a faked model and a forced-on HIP. Measured
    # on a sibling test: patching `call_llm` without restoring made 6 unrelated llm tests fail
    # only when that file ran first.
    _saved = {name: getattr(H, name) for name in _PATCHED}
    try:
        H.hip_configured = lambda: True
        H.hip_rounds = lambda: 1
        H._hip_server_cpu_seconds = lambda: None
        # Drive the REAL threshold used by hip_humanize. The 895-char doc fits inside the 1200
        # default in one piece, so leaving the default in place would test nothing — it has to
        # be lowered below the document size for the chunking path to be exercised at all.
        H.HIP_MAX_CHUNK_CHARS = 300
        H._one_round = fake_round
        out = asyncio.run(H.hip_humanize(DOC))
    finally:
        for name, value in _saved.items():
            setattr(H, name, value)
    calls_made = seen["n"]
    print(f"    model called {calls_made}x for {len(PARAS)} paragraphs")
    print(f"    result paragraphs: {len((out or '').split(chr(10) + chr(10)))}")

    missing = [i for i, para in enumerate(PARAS)
               if para.upper() not in (out or "")]
    if not missing:
        print("    PASS — all paragraphs present, none dropped.")
    else:
        print(f"    FAIL — paragraphs {missing} were lost.")
        ok = False

    if calls_made >= len(PARAS):
        print(f"    PASS — each paragraph was its own call ({calls_made} >= {len(PARAS)}).")
    else:
        print(f"    FAIL — only {calls_made} calls: it processed the document as one block.")
        ok = False

    print("\n  " + ("ALL CLAIMS HOLD" if ok else "SOMETHING FAILED"))
    return 0 if ok else 1


def test_chunked_humanize():
    """A long document is split per paragraph and fully preserved."""
    assert main() == 0


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q", "--tb=short", "-p", "no:cacheprovider"]))
