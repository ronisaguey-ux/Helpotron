"""HumanProfile — the 35-parameter writing model, ported from the extension.

Why this file exists
--------------------
`content.js` carried a 35-parameter `HumanProfile` class that decided, per
character, the delay, the typos, the false starts, the rereads, the mouse
wander and the corrections. That meant every cadence or humanization tweak was
frozen into a signed extension build and had to clear Chrome Web Store review —
and the security boundary was enforced by code the user's browser owned, which
a modified extension could loosen.

The port makes the server authoritative. `content.js` no longer decides
anything: the server emits a primitive action stream (see `action_stream.py`)
and the shipped player executes it with a fixed vocabulary.

Fidelity
--------
This is a line-by-line port of the JS class, not a re-implementation. The bands
are the owner's MEASURED timings (two sessions, 10,901 key gaps), so `FITTED` is
True and they are ABSOLUTE milliseconds — the "shape model" path that rescaled
them by a synthetic speed is not used. `gear` multiplies them directly.

Determinism: every roll draws from an injected `random.Random`, so the same
(text, seed) reproduces the same stream exactly. The JS used `Math.random()`;
that is the one deliberate difference, and it is what makes the stream
unit-testable and replayable.
"""
from __future__ import annotations

import math
import random
from typing import Any, Dict, List, Optional

# Set True because the bands below are measured, not modelled. While true they
# are absolute and are NOT rescaled by any synthetic cadence; `gear` multiplies
# them directly. Mirrors `HumanProfile.FITTED = true` after the JS class body.
FITTED = True


def _bands(v: float, mn: float, mx: float, jitter: float) -> Dict[str, float]:
    return {"v": v, "min": mn, "max": mx, "jitter": jitter}


class HumanProfile:
    """A 35-parameter writing model. One instance per typing session.

    `snapshot()` returns what the model decided, so a run can be logged and
    compared rather than eyeballed.
    """

    # ── the fitted bands ────────────────────────────────────────────────────
    # Each is drawn fresh per character inside its band, so no two gaps repeat.
    # Absolute milliseconds for this hand (see module docstring).
    def __init__(self, gear: float = 1.0, rng: Optional[random.Random] = None) -> None:
        self._rng = rng or random.Random()
        rnd = self._rng.random
        g = max(0.55, min(2.2, float(gear) if gear is not None else 1.0))
        self.gear = g
        self.speed = 46.5 / g
        self.fitted = FITTED
        self.k = g if self.fitted else (26.0 / self.speed)
        self._spare: Optional[float] = None
        self.gearHold = 0
        self.progress = 0.0

        self.p: Dict[str, Dict[str, float]] = {
            # ── RHYTHM ──────────────────────────────────────────────────────
            # 1. Base inter-key gap. MEASURED: 151ms median over 2,104 chars.
            "gapBase": _bands(151, 103, 196, 0.12),
            # 2. Log-normal sigma — how heavy the slow tail is. MEASURED: 0.761
            #    pooled over 10,901 gaps from both sessions.
            "gapTail": _bands(0.761, 0.55, 1.00, 0.05),
            # 3. Keys that land before the hand stops. MEASURED: median run 1-2,
            #    p90 run 4-7.
            "burstLen": _bands(2, 0, 6, 0.5),
            # 4. Remaining keys in the current burst.
            "burstLeft": _bands(0, 0, 6, 0),
            # 5. Gap inside a burst. MEASURED: 74ms median under a 100ms cut,
            #    101ms under 150ms. The old 26-56ms was faster than a human hand.
            "intraGap": _bands(88, 71, 125, 0.16),
            # 6. Slow wander of pace. MEASURED: essentially NONE — the median
            #    gap by decile held 152-161ms across 38 minutes. All the real
            #    variance lives in the TAIL, not the baseline.
            "paceDrift": _bands(1.0, 0.97, 1.03, 0.008),
            # 7. Short hesitation inside a word — a hand pausing over a spelling.
            "microPause": _bands(0, 0, 260, 0),
            # 8. The thinking lull. MEASURED: 38.8% of elapsed time sat in gaps
            #    over 2s while the median gap was 151ms — the clock lives in the
            #    tail.
            "thinkLull": _bands(0, 0, 8200, 0),
            # 9. Multiplier at a space. MEASURED: 1.22x (184ms vs 151ms).
            "spaceWeight": _bands(1.22, 0.95, 1.62, 0.08),
            # 10. Multiplier at a full stop. MEASURED over TWO sessions, pooled
            #     n=60 stops: 3.18x the letter median, 90% CI [2.47x, 3.98x].
            #     (Take 1 alone read 6.34x and was WRONG — n=19. The pooled
            #     figure is the one to trust.)
            "sentenceWeight": _bands(3.18, 2.47, 3.98, 0.07),

            # ── ERRORS ──────────────────────────────────────────────────────
            "typoRate": _bands(0.101, 0.055, 0.165, 0.010),
            "typoKind": _bands(rnd(), 0, 1, 1.0),
            "detectDelay": _bands(2 + int(rnd() * 11), 0, 16, 1.0),
            "fixRoute": _bands(rnd(), 0, 1, 1.0),
            "noticeBeat": _bands(210 + rnd() * 380, 90, 1200, 0.4),
            "doubleFault": _bands(1 if rnd() < 0.09 else 0, 0, 1, 1.0),
            "abandonWord": _bands(1 if rnd() < 0.06 else 0, 0, 1, 1.0),
            "falseStart": _bands(0.022 + rnd() * 0.02, 0.004, 0.06, 0.006),

            # ── REVISION ────────────────────────────────────────────────────
            "reread": _bands(0.038 + rnd() * 0.03, 0.006, 0.10, 0.008),
            "rereadDepth": _bands(14 + int(rnd() * 26), 6, 48, 1.0),
            "rereadAct": _bands(rnd(), 0, 1, 1.0),
            "wordSwap": _bands(1 if rnd() < 0.05 else 0, 0, 1, 1.0),
            "punctFix": _bands(1 if rnd() < 0.06 else 0, 0, 1, 1.0),
            "rereadBeat": _bands(280 + rnd() * 560, 120, 1500, 0.45),

            # ── PHYSICAL ────────────────────────────────────────────────────
            "mouseTravel": _bands(0.020 + rnd() * 0.02, 0.002, 0.055, 0.006),
            "mouseReach": _bands(60 + rnd() * 220, 24, 420, 0.5),
            "mouseSteps": _bands(9 + int(rnd() * 14), 5, 30, 1.0),
            "mouseHover": _bands(140 + rnd() * 520, 60, 1400, 0.5),
            "mouseClick": _bands(1 if rnd() < 0.45 else 0, 0, 1, 1.0),
            "caretNudge": _bands(1 if rnd() < 0.10 else 0, 0, 1, 1.0),

            # ── ARC ─────────────────────────────────────────────────────────
            # Warmup decays over the first ~15% of the run; fatigue builds after
            # 40%. Measured bands are deliberately near-flat: this hand does not
            # meaningfully speed up or slow down over a session, and manufacturing
            # drift would be a signature in itself.
            "progress": _bands(0, 0, 1, 0),
            "warmup": _bands(1.0, 0.99, 1.02, 0.002),
            "fatigue": _bands(1.0, 0.99, 1.01, 0.002),
            "gearShift": _bands(1.0, 0.98, 1.02, 0.004),
            "distraction": _bands(0.006, 0, 0.02, 0.001),
        }

    # ── helpers ─────────────────────────────────────────────────────────────

    def _roll(self, name: str) -> float:
        q = self.p[name]
        if q["max"] == q["min"]:
            return q["v"]
        span = (q["max"] - q["min"]) * q["jitter"]
        if span <= 0:
            return q["v"]
        v = q["v"] + (self._rng.random() - 0.5) * 2 * span
        v = max(q["min"], min(q["max"], v))
        q["v"] = v
        return v

    def _gauss(self) -> float:
        """Box-Muller with a cached spare pair, matching the JS implementation."""
        if self._spare is not None:
            s, self._spare = self._spare, None
            return s
        u = 0.0
        v = 0.0
        while u == 0:
            u = self._rng.random()
        while v == 0:
            v = self._rng.random()
        m = math.sqrt(-2 * math.log(u))
        self._spare = m * math.sin(2 * math.pi * v)
        return m * math.cos(2 * math.pi * v)

    # ── the tick ────────────────────────────────────────────────────────────

    def tick(self, ctx: Dict[str, Any], burst_scale: float = 1.0) -> Dict[str, Any]:
        """Run for EVERY character. Re-rolls all 35 parameters, then reads them
        together to decide the next action and its delay.

        `ctx` carries: char, atWordEnd, wordStart, isWordChar, progress.
        Returns: {action, delay, ...params}
        """
        P = self.p
        rnd = self._rng.random

        # Update the session arc first — everything below reads it.
        P["progress"]["v"] = max(0.0, min(1.0, ctx.get("progress") or 0.0))
        self.progress = P["progress"]["v"]
        self._roll("progress")
        P["warmup"]["v"] = max(1.0, P["warmup"]["v"] - P["warmup"]["jitter"] * 0.9)
        if P["progress"]["v"] > 0.4:
            P["fatigue"]["v"] = min(P["fatigue"]["max"], P["fatigue"]["v"] + P["fatigue"]["jitter"])

        # Gear changes: hold a speed for a stretch, then settle somewhere new.
        self.gearHold -= 1
        if self.gearHold <= 0:
            self.gearHold = 30 + int(rnd() * 140)
            P["gearShift"]["v"] = P["gearShift"]["min"] + rnd() * (
                P["gearShift"]["max"] - P["gearShift"]["min"]
            )

        # Every remaining parameter re-rolls, unconditionally. Slots that are
        # event flags are re-decided here too, so the chance of any of them
        # firing is fresh on every single character.
        for name in list(P.keys()):
            if name in ("progress", "warmup", "fatigue"):
                continue
            self._roll(name)

        P["typoRate"]["v"] = max(P["typoRate"]["min"], min(P["typoRate"]["max"], P["typoRate"]["v"]))
        P["reread"]["v"] = max(P["reread"]["min"], min(P["reread"]["max"], P["reread"]["v"]))
        P["falseStart"]["v"] = max(P["falseStart"]["min"], min(P["falseStart"]["max"], P["falseStart"]["v"]))
        P["typoKind"]["v"] = rnd()
        P["fixRoute"]["v"] = rnd()
        P["rereadAct"]["v"] = rnd()
        P["doubleFault"]["v"] = 1 if rnd() < 0.09 else 0
        P["abandonWord"]["v"] = 1 if rnd() < 0.06 else 0
        P["wordSwap"]["v"] = 1 if rnd() < 0.05 else 0
        P["punctFix"]["v"] = 1 if rnd() < 0.06 else 0
        P["mouseClick"]["v"] = 1 if rnd() < 0.45 else 0
        P["caretNudge"]["v"] = 1 if rnd() < 0.10 else 0
        P["mouseSteps"]["v"] = 5 + int(rnd() * 25)
        P["burstLen"]["v"] = int(rnd() * 4)
        # A per-run burst multiplier. 1.0 is the measured hand; 0 collapses every
        # burst to a single keystroke (a perfectly even stream) and 2+ runs keys
        # together. Clamped so no setting produces a machine-gun run.
        bs = max(0.0, min(3.0, float(burst_scale) if burst_scale is not None else 1.0))
        P["burstLen"]["v"] = max(0, min(8, int(round(P["burstLen"]["v"] * bs))))
        if bs == 0:
            P["burstLeft"]["v"] = 0
        if rnd() < P["distraction"]["v"]:
            P["thinkLull"]["v"] = 2600 + rnd() * 7000

        char = ctx.get("char") or ""
        at_word_end = bool(ctx.get("atWordEnd"))
        word_start = bool(ctx.get("wordStart"))
        is_word_char = bool(ctx.get("isWordChar"))

        # ── Decide the action, in priority order ────────────────────────────
        # Physical drift can pre-empt the keystroke. Rare, and the one category
        # the trace had none of: a session that only ever appends.
        if at_word_end and rnd() < P["mouseTravel"]["v"]:
            return {
                "action": "mouse",
                "reach": P["mouseReach"]["v"],
                "steps": P["mouseSteps"]["v"],
                "hover": P["mouseHover"]["v"],
                "click": P["mouseClick"]["v"] > 0.5,
                "delay": 60 + rnd() * 240,
            }
        if at_word_end and rnd() < P["reread"]["v"]:
            return {
                "action": "reread",
                "depth": P["rereadDepth"]["v"],
                "mode": P["rereadAct"]["v"],  # 0 delete+retype, 1 word swap, 2 look
                "beat": P["rereadBeat"]["v"],
                "wordSwap": P["wordSwap"]["v"] > 0.5,
                "delay": P["rereadBeat"]["v"],
            }
        if at_word_end and rnd() < P["caretNudge"]["v"]:
            return {"action": "nudge", "delay": 40 + rnd() * 160}
        if word_start and rnd() < P["falseStart"]["v"]:
            return {"action": "falsestart", "delay": 300 + rnd() * 420}
        if is_word_char and not word_start and rnd() < P["typoRate"]["v"]:
            return {
                "action": "typo",
                "kind": P["typoKind"]["v"],
                "detectDelay": P["detectDelay"]["v"],
                "doubleFault": P["doubleFault"]["v"] > 0.5,
                "abandon": P["abandonWord"]["v"] > 0.5,
                "delay": 0,
            }

        # ── Normal typing. Timing reads the whole rhythm block together. ─────
        in_burst = P["burstLeft"]["v"] > 0
        if in_burst:
            P["burstLeft"]["v"] -= 1
            # Inside a burst the gap is deliberately short; this is what makes
            # Docs merge the pair into one revision, exactly as a real hand does.
            d = P["intraGap"]["v"] * self.k * P["paceDrift"]["v"] * P["gearShift"]["v"]
            return {"action": "letter", "delay": max(14, int(round(d)))}
        P["burstLeft"]["v"] = math.floor(P["burstLen"]["v"])

        # Log-normal gap: median from the base, tail from sigma. A flat draw
        # cannot produce the p90 tail, and the tail is where the clock lives.
        gap = P["gapBase"]["v"] * math.exp(P["gapTail"]["v"] * self._gauss())
        gap *= self.k        # compress the clock, keep the shape
        gap *= P["paceDrift"]["v"]
        gap *= P["gearShift"]["v"]
        gap *= P["warmup"]["v"]
        gap *= P["fatigue"]["v"]

        # Boundary weight — a space and a full stop are not letter gaps.
        if char == " ":
            gap *= P["spaceWeight"]["v"]
        elif char in ".!?":
            gap *= P["sentenceWeight"]["v"]
        elif char in ",;:":
            gap *= 1.0 + (P["spaceWeight"]["v"] - 1) * 0.6

        # Short hesitation over a spelling, decided independently of the lull.
        if rnd() < 0.05:
            gap += P["microPause"]["max"] * rnd() * 0.6

        # Shift costs a beat — reaching for a capital or a symbol.
        if char.isupper() or char in '~!@#$%^&*()_+{}|:"<>?':
            gap += (16 + rnd() * 40) * self.k

        action = "type"
        if P["thinkLull"]["v"] > 0:
            gap += P["thinkLull"]["v"]
            action = "think"
            P["thinkLull"]["v"] = 0

        return {"action": action, "delay": max(16, int(round(gap)))}

    # ── observability ───────────────────────────────────────────────────────

    def snapshot(self) -> Dict[str, float]:
        """Read-only snapshot, for logging what the model actually decided."""
        return {k: round(q["v"] * 1000) / 1000 for k, q in self.p.items()}

    def tick_many(self, chars: List[str], burst_scale: float = 1.0) -> List[Dict[str, Any]]:
        """Run the model across a character sequence, computing word boundaries.

        Kept here (not in the caller) so the context a tick sees — word start,
        word end, word char — is derived one way everywhere.
        """
        out: List[Dict[str, Any]] = []
        total = max(1, len(chars))
        for i, ch in enumerate(chars):
            prev = chars[i - 1] if i > 0 else ""
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
            is_word = ch.isalnum() or ch == "'"
            prev_word = prev.isalnum() or prev == "'"
            next_word = nxt.isalnum() or nxt == "'"
            ctx = {
                "char": ch,
                "isWordChar": is_word,
                "wordStart": is_word and not prev_word,
                "atWordEnd": (not is_word) and prev_word or (is_word and not next_word),
                "progress": i / total,
            }
            d = self.tick(ctx, burst_scale=burst_scale)
            d["char"] = ch
            out.append(d)
        return out
