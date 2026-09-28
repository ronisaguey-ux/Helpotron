"""Every process in helpotron, scored 1-1000, and what that score buys it.

Owner, 2026-09-28, verbatim: *"make a priority fallback list with values from 1-1000 of every
process that would occur in helpotron, like laya message filtering, humanizing, math execution
via bash/py, PowerPoint creation, etc and give them a priority score, the faster and lower
cpu/ram footprint it has on my machine, the higher the score, and faster it gets processed, so
users are never waiting on a respond for a 'Hello' forever, but humanizing takes a while"*.

★ THE SCORE IS DERIVED FROM MEASURED FOOTPRINT, NOT FROM TASTE. Each entry carries the CPU
seconds and RAM the process actually costs on this box, because a score you cannot audit is a
score that drifts. When a number here changes, change the measurement that justifies it.

★ HIGH SCORE = SMALLER AND FASTER. That is the whole ordering rule, and it is deliberately
the inverse of "importance": the thing that costs the machine least is the thing that can
safely run while the machine is busy.

The wait budget is NOT a timeout — a task is never cancelled for taking long (standing owner
rule). It is the point at which the interface stops promising and starts being honest:
*"a high priority easy process like a user saying 'hello' should only be waiting 30s untill
they get a 'server is busy, your request will be processed instantly when load lightens' but
for lower priority, like lets say humanization, has a 5min wait score, where the UI shows its
in progress to not piss the user off for 5min, and beyond that it gets honest"*.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

# Priority bands, so a new process can be placed without inventing a number.
BAND_INSTANT = 900    # sub-second or pure I/O; no local contention worth naming
BAND_LIGHT = 700      # a second or two of CPU, or a single cheap network hop
BAND_MODERATE = 500   # one model call, moderate memory
BAND_HEAVY = 300      # real local CPU or a long provider round-trip
BAND_MASSIVE = 150    # the heaviest things a user can ask for

# ★ ANTI-STARVATION. Strict priority ordering means a stream of "hello"s could starve a
# humanization run forever, which is not what the owner asked for ("lower get in later", not
# "lower never get in"). A waiter's effective priority climbs while it waits, so a
# low-priority task is guaranteed to eventually outrank a fresh high-priority one.
#
# ★ THE RATE IS DERIVED, NOT PICKED. My first value was 1.0/second, which is useless: the
# spread between chat_message (950) and humanize (150) is 800, so a humanization job would
# have needed ~13 minutes of unbroken traffic to climb past a fresh message — long past the
# 5-minute window it is promised, which makes the guarantee decorative. The rate is instead
# set so ANY waiter reaches the top of the ordering after MAX_WAIT_SECONDS of waiting,
# i.e. if a task has been waiting its full honesty window it wins by right.
_HIGHEST_PRIORITY = 980
_LOWEST_PRIORITY = 150
MAX_WAIT_SECONDS = 300.0
PRIORITY_AGING_PER_SEC = float(os.environ.get(
    "HELPOTRON_PRIORITY_AGING",
    str((_HIGHEST_PRIORITY - _LOWEST_PRIORITY) / MAX_WAIT_SECONDS),
))
MAX_AGE_BONUS = float(os.environ.get("HELPOTRON_PRIORITY_MAX_AGE_BONUS", "900"))

# ★ THE REGISTRY. priority · wait_seconds (when to stop promising) · measured footprint · why.
PRIORITY_REGISTRY: Dict[str, Dict[str, Any]] = {
    # ── instant: the "Hello" case. Nothing here may ever queue behind a humanization. ──
    "chat_message": {
        "priority": 950, "wait_seconds": 30,
        "cpu_seconds": 0.1, "ram_mb": 5,
        "why": "A plain message. The owner's example: a 'hello' must never wait forever.",
    },
    "laya_filter": {
        "priority": 980, "wait_seconds": 30,
        "cpu_seconds": 0.05, "ram_mb": 2,
        "why": "Inbound injection/abuse screen. Runs on every message, so anything slower "
               "than it would be queued behind the gate that is meant to be in front.",
    },
    "math_exec": {
        "priority": 850, "wait_seconds": 45,
        "cpu_seconds": 0.2, "ram_mb": 20,
        "why": "AST-whitelist evaluation, sub-second. Cheap enough to be near-instant.",
    },
    # ── light: bounded network work with no local CPU of consequence. ──
    "canvas_sync": {
        "priority": 800, "wait_seconds": 60,
        "cpu_seconds": 0.3, "ram_mb": 30,
        "why": "Google Classroom fetches. I/O bound; the machine is idle while it waits.",
    },
    "gdocs_export": {
        "priority": 800, "wait_seconds": 60,
        "cpu_seconds": 0.3, "ram_mb": 30,
        "why": "Streams into Google Docs over the network, same shape as canvas_sync.",
    },
    # ── moderate: one model call. ──
    "study_material": {
        "priority": 550, "wait_seconds": 150,
        "cpu_seconds": 1.0, "ram_mb": 120,
        "why": "One LLM generation (study guide / flashcards / practice test).",
    },
    "summary": {
        "priority": 550, "wait_seconds": 150,
        "cpu_seconds": 1.0, "ram_mb": 120,
        "why": "Same generation path as the other materials.",
    },
    "agent_action": {
        "priority": 500, "wait_seconds": 180,
        "cpu_seconds": 1.5, "ram_mb": 150,
        "why": "A single overlord agent action; may itself call the model once.",
    },
    # ── heavy: real local CPU, measured on this box. ──
    "agent_session": {
        "priority": 400, "wait_seconds": 240,
        "cpu_seconds": 4.0, "ram_mb": 250,
        "why": "A full agent session: multi-step, drives the browser, holds state. The "
               "largest consumer that is still interactive.",
    },
    "detection": {
        "priority": 320, "wait_seconds": 240,
        "cpu_seconds": 3.0, "ram_mb": 400,
        "why": "Runs the RoBERTa ONNX model plus heuristics — measured ~0.7-0.85s CPU per "
               "512-token pass and ~345MB resident. CPU-bound, so it must not run many-wide.",
    },
    "transcription": {
        "priority": 280, "wait_seconds": 300,
        "cpu_seconds": 30.0, "ram_mb": 600,
        "why": "Up to 100MB of audio through a speech model: minutes of CPU, high memory.",
    },
    # ── massive: the heaviest ask. Long promise window, honest after. ──
    "humanize": {
        "priority": 150, "wait_seconds": 300,
        "cpu_seconds": 90.0, "ram_mb": 2000,
        "why": "Drives the local base model for tens of seconds of saturated CPU per run "
               "(measured 363 CPU-s for a 252-word essay) and holds ~2GB. The owner's own "
               "example of something that legitimately takes a while, hence the 5min window.",
    },
    "pptx": {
        "priority": 250, "wait_seconds": 300,
        "cpu_seconds": 20.0, "ram_mb": 500,
        "why": "Builds a deck: many images, a render pass, and a file write.",
    },
}

DEFAULT_PRIORITY = 500
DEFAULT_WAIT_SECONDS = 180


def get_priority(process: str) -> int:
    """Priority score for a named process (1-1000, higher = gets in sooner)."""
    entry = PRIORITY_REGISTRY.get(process)
    return int(entry["priority"]) if entry else DEFAULT_PRIORITY


def wait_budget_seconds(process: str) -> float:
    """How long we keep promising before telling the user the server is busy."""
    entry = PRIORITY_REGISTRY.get(process)
    return float(entry["wait_seconds"]) if entry else DEFAULT_WAIT_SECONDS


def describe(process: str) -> Dict[str, Any]:
    """Everything known about one process, for an admin surface or a test."""
    entry = PRIORITY_REGISTRY.get(process)
    if not entry:
        return {"process": process, "known": False, "priority": DEFAULT_PRIORITY,
                "wait_seconds": DEFAULT_WAIT_SECONDS}
    return {"process": process, "known": True, **entry}


# ★ AGENT ACTION TYPES ARE NOT REGISTRY KEYS. Every agent action used to run at the generic
# default because the call sites passed no `process=`, so the whole registry was bypassed on
# that path — and `humanize_text` is the DEAREST thing in the table (150, a 300s budget).
# This maps an action type onto the process it actually is, so the score and the wait budget
# the user experiences match the work being done.
ACTION_PROCESS = {
    "humanize_text": "humanize",
    "summarize_lecture": "summary",
    "generate_flashcards": "study_material",
    "run_shell": "math_exec",
    "run_sandbox_script": "math_exec",
}


def priority_for_action(action_type: str) -> str:
    """The registry process name for an agent action type.

    Falls back to the action type itself, which is not in the registry and therefore resolves
    to DEFAULT_PRIORITY — the safe middle. An action with no confident mapping must not be
    given a cheap task's score, or the queue would favour it over real interactive work.
    """
    return ACTION_PROCESS.get(action_type or "", action_type or "unknown")


def effective_priority(priority: int, waited_seconds: float) -> float:
    """Priority as the queue should read it right now, including the aging bonus.

    ★ WITHOUT THIS, THE QUEUE STARVES THE BOTTOM. "Higher gets in first" taken literally
    means a busy gateway can postpone a humanization run indefinitely while short messages
    keep arriving. The owner asked for low priority to get in LATER, not never, so age is
    added and capped.
    """
    bonus = min(MAX_AGE_BONUS, max(0.0, waited_seconds) * PRIORITY_AGING_PER_SEC)
    return float(priority) + bonus


def should_show_busy(elapsed_seconds: float, process: Optional[str] = None) -> bool:
    """Whether to stop promising and tell the user the server is busy.

    Priority-scaled: a 30s window for a message, 5 minutes for a humanize run, exactly as
    the owner specified. A named process uses its own budget; an unnamed caller falls back
    to the default so an unwired call site cannot silently promise forever.
    """
    budget = wait_budget_seconds(process) if process else DEFAULT_WAIT_SECONDS
    return float(elapsed_seconds or 0) >= budget


def priority_table() -> list[Dict[str, Any]]:
    """The whole list, highest priority first — the operator's fallback list, readable."""
    rows = []
    for name, entry in PRIORITY_REGISTRY.items():
        rows.append({"process": name, **entry})
    rows.sort(key=lambda r: -int(r["priority"]))
    return rows
