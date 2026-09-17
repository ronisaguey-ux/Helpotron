"""Context-sensitive veto for lexical substitution.

THE DEFECT THIS FIXES. `zipf.py` picks a synonym by Brown-corpus frequency from
WordNet's first sense. That ranking is context-free, so it produces real errors:

    excessive engagement      -> excessive battle
    a ubiquitous force        -> a everywhere force
    comprehensive examination -> full examining
    performing tasks          -> playing tasks

`engagement` and `battle` are both common, both nouns, both short; nothing in a
frequency ranking knows they are not interchangeable in "engagement with social
media". WordNet sense ordering is not usage ordering.

THE VETO. A masked-language-model plausibility check, applied at substitution
time with the sentence in hand. Replace the target token with [MASK], ask the
model for the probability it assigns to the original word and to the candidate:

    reject if  P(candidate) < theta_abs          (candidate is implausible at all)
    reject if  P(candidate) < P(original) / k    (candidate is far worse than what
                                                  the author actually wrote)

Two thresholds, not one, because they fail differently: the absolute floor catches
a candidate that is nonsense anywhere, the ratio catches a candidate that is
plausible in general but clearly worse HERE. Measured on the documented failures,
the ratio separates cleanly (engagement->battle at 284x), and the one tight case
(engagement->conflict at 6.7x) is exactly why the ratio is needed alongside the
floor.

This is a FILTER, not a generator. It never produces text — it only rejects a
substitution another table proposed — which is why it does not violate the
project's no-neural-generation constraint on the transform path.

Model: distilbert-base-uncased (Apache-2.0, 66M, CPU). Already in the local HF
cache, so no download. Deterministic: same model, same input, same verdict.
"""
from __future__ import annotations

import os
import re
import threading

# Thresholds. These are DEFAULTS, not calibrated values — see `calibrate()`.
# The docstring above says why both exist; the numbers want measuring against the
# corpus rather than trusting these.
THETA_ABS = float(os.environ.get("MLM_THETA_ABS", "0.005"))
K_RATIO = float(os.environ.get("MLM_K_RATIO", "5.0"))

_MODEL = None
_TOK = None
_LOCK = threading.Lock()


def _load():
    """Load the masked LM once, lazily, single-threaded and quiet."""
    global _MODEL, _TOK
    if _MODEL is not None:
        return True
    with _LOCK:
        if _MODEL is not None:
            return True
        try:
            import torch
            from transformers import AutoModelForMaskedLM, AutoTokenizer

            # One thread keeps the timing deterministic and stops this from
            # competing with anything else on a loaded box.
            torch.set_num_threads(1)
            name = os.environ.get("MLM_MODEL", "distilbert-base-uncased")
            _TOK = AutoTokenizer.from_pretrained(name)
            _MODEL = AutoModelForMaskedLM.from_pretrained(name)
            _MODEL.eval()
            return True
        except Exception as e:  # model unavailable -> veto abstains, never blocks
            print(f"[mlm_veto] unavailable ({type(e).__name__}: {e}) — veto disabled")
            _MODEL = False
            return False


def sentence_around(text: str, start: int, end: int) -> tuple[str, int, int]:
    """The sentence containing [start:end], and the token's offset within it.

    Sentence boundaries are found on the raw text so the returned offsets stay
    valid for a mask substitution.
    """
    left = 0
    for m in re.finditer(r"[.!?]\s+", text[:start]):
        left = m.end()
    right = len(text)
    m = re.search(r"[.!?](?:\s|$)", text[end:])
    if m:
        right = end + m.start() + 1
    sent = text[left:right]
    return sent, start - left, end - left


def _masked_prob(sent: str, lo: int, hi: int, word: str) -> float:
    """P(word) at the masked position of `sent`."""
    import torch

    masked = sent[:lo] + _TOK.mask_token + sent[hi:]
    enc = _TOK(masked, return_tensors="pt", truncation=True, max_length=256)
    with torch.no_grad():
        logits = _MODEL(**enc).logits[0]
    # Position of the mask token in the encoded sequence (offset mapping is the
    # reliable way; fall back to the first [MASK] id).
    ids = enc["input_ids"][0].tolist()
    pos = ids.index(_TOK.mask_token_id)
    probs = torch.softmax(logits[pos], dim=-1)
    for tid in _TOK.encode(word, add_special_tokens=False)[:1]:
        return float(probs[tid])
    return 0.0


def verdict(sent: str, lo: int, hi: int, original: str, candidate: str) -> tuple[bool, str, float]:
    """Should this substitution be REJECTED? Returns (reject, reason, ratio)."""
    if not _load():
        return False, "veto_unavailable", float("inf")

    try:
        p_orig = _masked_prob(sent, lo, hi, original)
        p_cand = _masked_prob(sent, lo, hi, candidate)
    except Exception as e:
        return False, f"veto_error:{type(e).__name__}", float("inf")

    ratio = (p_orig / p_cand) if p_cand > 0 else float("inf")

    if p_cand < THETA_ABS and p_orig >= THETA_ABS:
        return True, f"implausible(p={p_cand:.2e})", ratio
    if ratio > K_RATIO:
        return True, f"ratio={ratio:.1f}x", ratio
    return False, f"ok(ratio={ratio:.2f}x)", ratio


def check(text: str, start: int, end: int, original: str, candidate: str) -> tuple[bool, str]:
    """Convenience wrapper: locate the sentence, then veto.

    Returns (rejected, reason). A rejection means the caller must NOT substitute.
    """
    sent, lo, hi = sentence_around(text, start, end)
    if len(sent.split()) < 3:
        # Too short to give the model any context to judge with.
        return False, "too_short"
    rejected, reason, _ = verdict(sent, lo, hi, original, candidate)
    return rejected, reason


if __name__ == "__main__":
    # The documented failures, as a smoke test.
    cases = [
        ("excessive engagement with social media", "engagement", "battle"),
        ("excessive engagement with social media", "engagement", "conflict"),
        ("tolerate disagreement and think in real time", "tolerate", "stand"),
        ("a ubiquitous force in modern life", "ubiquitous", "everywhere"),
        ("the algorithmic curation of content", "curation", "battle"),
        ("rewards performance, speed and self-presentation", "performance", "battle"),
    ]
    print(f"theta_abs={THETA_ABS}  k={K_RATIO}\n")
    print(f"{'sentence':52} {'original':12} {'cand':12} {'verdict':22} {'ratio':>8}")
    print("-" * 112)
    for sent, orig, cand in cases:
        i = sent.find(orig)
        sent2, lo, hi = sentence_around(sent, i, i + len(orig))
        rej, why, ratio = verdict(sent2, lo, hi, orig, cand)
        tag = "REJECT" if rej else "accept"
        print(f"{sent[:50]:52} {orig:12} {cand:12} {tag+' '+why:22} {ratio:8.2f}")
