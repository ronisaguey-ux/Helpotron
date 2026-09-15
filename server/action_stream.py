"""Server-driven action stream — the humanization logic the owner wants moved off the extension.

Why this module exists
----------------------
The extension's `content.js` still *drives* typing: it runs `HumanProfile.tick()` on every
character and decides the delay, the typos, the false starts, the mouse wander and the
corrections. That means every cadence or humanization tweak is frozen into a signed
extension build that has to clear Chrome Web Store review.

This module turns that on its head. The server now emits a **stream of primitive actions**
— every keystroke, every pause (as an explicit `wait`), every backspace, every pointer move —
as pure JSON data. The extension becomes a dumb, stable player that executes the stream with
its shipped code and holds no policy of its own. A cadence change is then a server deploy.

MV3 / CWS constraint, honoured: remotely-hosted *code* is forbidden; data is fine. This
module sends data only — an ordered list of {op, ...params} objects. The player's fixed
vocabulary is the shipped code.

This is the FIRST SLICE: a real, seeded humanizer that reproduces the fitted rhythm shape
(median gap ~157 ms, rare-but-long lulls, one-backspace corrections) and the text-correctness
invariant (the replay produces exactly the source text). Full parity with the 35-parameter
JS `HumanProfile` is a follow-up, not a hidden claim.
"""
from __future__ import annotations

import math
import random
import time
from typing import Any, Dict, List, Optional, Tuple

# Bumped when the vocabulary or the wire shape changes, so an older player can
# refuse a stream it does not understand rather than mis-execute it.
ACTION_STREAM_VERSION = 1

# The closed op set. The player knows exactly these and nothing else; an op
# outside this table is a server bug the player must reject, not improvise around.
# value: the params an action of that op must carry (positional names).
PRIMITIVE_OPS: Dict[str, Tuple[str, ...]] = {
    "focus": (),
    "type": ("ch",),
    "key": ("key", "code", "keyCode"),
    "backspace": (),
    "wait": ("ms",),
    "mouse": ("x", "y"),
    "click": ("x", "y"),
    "label": ("name",),
}

# Fitted rhythm targets from the owner's two recordings (prompt.md §2.4), pooled.
# `median_gap_s` and `tail_sigma` reproduce mean gap ~240 ms, tail occupancy
# ~0.9% of gaps, ~17% of elapsed time in >2s lulls. These are DATA anchors, not
# a claim of precision; `PROFILE_SPREAD`-style wander is the anti-overfit layer.
MEDIAN_GAP_S = 0.157
GAP_SIGMA = 0.62
LULL_PROB = 0.008          # rare but long — the fitted lull shape
LULL_MEDIAN_MS = 4700.0
NATURAL_PAUSE_EVERY_WORDS = 75
NATURAL_PAUSE_MS = (1200, 2000)

# Adjacent keys for plausible one-key typos (qwerty neighbours). Any other char
# falls back to a random lowercase letter — still a "wrong finger", still one
# backspace, so the revision shape is identical.
_ADJACENT: Dict[str, str] = {
    "a": "s", "b": "n", "c": "v", "d": "f", "e": "r", "f": "g", "g": "h",
    "h": "j", "i": "o", "j": "k", "k": "l", "l": "k", "m": "n", "n": "m",
    "o": "p", "p": "o", "q": "w", "r": "t", "s": "d", "t": "y", "u": "i",
    "v": "c", "w": "e", "x": "z", "y": "u", "z": "x",
}


def _char_key(ch: str) -> Dict[str, Any]:
    """The `key`/`code`/`keyCode` for a character, mirroring content.js `_cdpCharDown`.

    The player needs enough to build a CDP `Input.dispatchKeyEvent` (or the DOM
    fallback) for a single char. This table is the source of truth the stream
    carries, so the player never has to derive anything.
    """
    if ch == "\n":
        return {"key": "Enter", "code": "Enter", "keyCode": 13}
    if ch == " ":
        return {"key": " ", "code": "Space", "keyCode": 32}
    if ch.isalpha() and ch.isascii():
        return {"key": ch, "code": f"Key{ch.upper()}", "keyCode": ord(ch.upper())}
    if ch.isdigit():
        return {"key": ch, "code": f"Digit{ch}", "keyCode": ord(ch)}
    return {"key": ch, "code": "", "keyCode": ord(ch)}


def _gap(rng: random.Random, speed: float) -> int:
    """One inter-keystroke gap in milliseconds, shaped like the fitted hand."""
    # lognormal with median MEDIAN_GAP_S (seconds), scaled by the gear.
    median_s = MEDIAN_GAP_S * speed
    mu = math.log(median_s)
    gap_ms = max(18, int(round(rng.lognormvariate(mu, GAP_SIGMA) * 1000.0)))
    if rng.random() < LULL_PROB:
        # A rare long hesitation, folded on top of the base gap.
        gap_ms += int(round(rng.lognormvariate(math.log(LULL_MEDIAN_MS), 0.5)))
    return gap_ms


def _typo_char(rng: random.Random, ch: str) -> str:
    if ch.lower() in _ADJACENT and ch.isalpha():
        n = _ADJACENT[ch.lower()]
        return n.upper() if ch.isupper() else n
    return rng.choice("abcdefghijklmnopqrstuvwxyz")


def build_action_stream(
    text: str,
    *,
    speed: float = 1.0,
    typo_rate: float = 0.101,
    natural_pauses: bool = True,
    jitter: bool = True,
    false_start_rate: float = 0.025,
    seed: Optional[int] = None,
    viewport: Tuple[int, int] = (1200, 800),
) -> List[Dict[str, Any]]:
    """Emit the full primitive action stream that types `text` at a human rhythm.

    Pure and deterministic given `seed` — the same text + seed yields the same
    stream, so it is unit-testable and replayable. The final document is always
    exactly `text`: every typo is corrected by one backspace, every false start is
    fully deleted, and pointer movement never carries a stray click into the text.
    """
    rng = random.Random(seed)
    speed = max(0.55, min(2.2, float(speed)))
    typo_rate = max(0.0, min(0.25, float(typo_rate)))
    false_start_rate = max(0.0, min(0.25, float(false_start_rate)))
    vw, vh = viewport

    actions: List[Dict[str, Any]] = []
    actions.append({"op": "focus"})

    words = text.split()
    word_idx = 0
    mouse_every = 200  # chars between pointer excursions (deliberately sparse)

    for i, ch in enumerate(text):
        # The gap precedes the keystroke, so the stream is paced, not bursty.
        if i > 0:
            actions.append({"op": "wait", "ms": _gap(rng, speed)})

        # Rare-but-long natural pause at word milestones (thinking break).
        if natural_pauses and i > 0 and ch == " " and word_idx > 0 and word_idx % NATURAL_PAUSE_EVERY_WORDS == 0:
            actions.append({"op": "wait", "ms": int(rng.randint(*NATURAL_PAUSE_MS))})

        # Pointer excursion — move only; a click only when the roll says so, and
        # never at the same moment a correction is mid-flight (kept out by the
        # sequential shape: the click is an isolated event between words).
        if ch == " " and i > 0 and i % mouse_every == 0:
            x0 = int(vw * (0.15 + rng.random() * 0.5))
            y0 = int(vh * (0.25 + rng.random() * 0.4))
            reach = 120
            x1 = max(2, min(vw - 2, x0 + int((rng.random() - 0.5) * 2 * reach)))
            y1 = max(2, min(vh - 2, y0 + int((rng.random() - 0.5) * 2 * reach)))
            actions.append({"op": "mouse", "x": x0, "y": y0})
            actions.append({"op": "mouse", "x": x1, "y": y1})
            if rng.random() < 0.25:
                actions.append({"op": "click", "x": x1, "y": y1})
            actions.append({"op": "wait", "ms": int(rng.randint(180, 500))})

        # False start: a fragment is typed then backspaced away before the word.
        if false_start_rate and i > 0 and ch not in " \n" and rng.random() < false_start_rate:
            frag = "".join(rng.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(2 + rng.randint(0, 2)))
            for fc in frag:
                actions.append({"op": "type", "ch": fc, **_char_key(fc)})
                actions.append({"op": "wait", "ms": int(round(_gap(rng, speed)))})
            actions.append({"op": "wait", "ms": int(rng.randint(320, 740))})
            for _ in frag:
                actions.append({"op": "backspace"})
                actions.append({"op": "wait", "ms": int(rng.randint(44, 104))})
            actions.append({"op": "wait", "ms": int(rng.randint(450, 1000))})

        # Typo: emit the wrong char, catch it, backspace, retype. One backspace,
        # max run 1 — the measured correction shape (prompt.md §2.4).
        if typo_rate and ch not in " \n" and rng.random() < typo_rate:
            wrong = _typo_char(rng, ch)
            actions.append({"op": "label", "name": "typo"})
            actions.append({"op": "type", "ch": wrong, **_char_key(wrong)})
            actions.append({"op": "wait", "ms": int(rng.randint(180, 520))})
            actions.append({"op": "backspace"})
            actions.append({"op": "wait", "ms": int(rng.randint(60, 160))})

        actions.append({"op": "type", "ch": ch, **_char_key(ch)})
        if jitter:
            # Small per-key drift; never negative, never dominates the base gap.
            actions.append({"op": "wait", "ms": int(rng.randint(0, 24))})

        if ch == " ":
            word_idx += 1

    actions.append({"op": "label", "name": "done"})
    return actions


def validate_action_stream(actions: Any) -> Tuple[bool, str]:
    """Server-side guard mirroring the player's allowlist. Defense in depth: the
    player already rejects bad ops, but the server must never *emit* one."""
    if not isinstance(actions, list):
        return False, "actions must be a list"
    for idx, a in enumerate(actions):
        if not isinstance(a, dict) or "op" not in a:
            return False, f"action[{idx}] is not an action object"
        op = a["op"]
        if op not in PRIMITIVE_OPS:
            return False, f"action[{idx}] has unknown op {op!r}"
        for p in PRIMITIVE_OPS[op]:
            if p not in a:
                return False, f"action[{idx}] ({op}) missing param {p!r}"
        if op == "type" and (not isinstance(a["ch"], str) or len(a["ch"]) != 1):
            return False, f"action[{idx}] type ch must be a single char"
        if op == "wait" and (not isinstance(a["ms"], int) or a["ms"] < 0):
            return False, f"action[{idx}] wait ms must be a non-negative int"
        if op in ("mouse", "click") and (
            not isinstance(a["x"], (int, float)) or not isinstance(a["y"], (int, float))
        ):
            return False, f"action[{idx}] {op} needs numeric x/y"
    return True, ""


def replay_text(actions: List[Dict[str, Any]]) -> str:
    """Replay the stream and return the text it would produce. The independent
    oracle: it must equal the source text, or the stream is corrupt.

    This is a *second method* that could disagree with the generator — it is not
    derived from the same assumption, which is what makes it a real check.
    """
    out: List[str] = []
    for a in actions:
        if a["op"] == "type":
            out.append(a["ch"])
        elif a["op"] == "backspace":
            if out:
                out.pop()
    return "".join(out)
