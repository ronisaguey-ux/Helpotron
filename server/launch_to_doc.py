"""Launch to Doc — the POLICY lives here; the extension only does browser mechanics.

Why this module exists
----------------------
The extension used to own the whole launch decision: which tab to reuse, when to
open a fresh one at docs.new, the typing defaults, and the cadence presets baked
into popup.html as `data-wpm` / `data-typo` attributes. Every one of those is a
tuning knob, and every one of them was frozen into a signed artifact that has to
clear Chrome Web Store review before it can change.

Now the extension asks this module for a PLAN and applies it mechanically. Fixing
a typo rate, changing the doc target, adding a cadence, or re-wording the UI hint
is a server deploy — no extension rebuild, no review.

What is deliberately NOT here
-----------------------------
Anything that needs a browser API: finding/creating the tab, focusing the window,
injecting the content script, dispatching the typing stream. The server cannot do
those and should not pretend to. This module decides; the extension performs.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Bumped when the plan's SHAPE changes so an older extension can tell whether it
# understands the payload it was handed.
PLAN_VERSION = 1

# Where a draft gets typed. `reuse_existing` lets the extension prefer an already
# open doc over spawning a new tab, which is what a student mid-assignment wants.
DOC_TARGET: Dict[str, Any] = {
    "url": "https://docs.new",
    "match": "docs.google.com",
    "reuse_existing": True,
    "focus": True,
}

# The cadence menu. `sub` is the short chip caption, `title` the hover tooltip.
# These used to be three hardcoded buttons in popup.html.
CADENCE_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "academic",
        "label": "Academic",
        "sub": "65 wpm",
        "title": "Academic — 65 words per minute",
        "wpm": 65,
        "typo_rate": 0.018,
        "default": True,
    },
    {
        "id": "careful",
        "label": "Careful",
        "sub": "48 wpm",
        "title": "Careful — 48 words per minute",
        "wpm": 48,
        "typo_rate": 0.025,
        "default": False,
    },
    {
        "id": "fast",
        "label": "Fast",
        "sub": "85 wpm",
        "title": "Fast — 85 words per minute",
        "wpm": 85,
        "typo_rate": 0.012,
        "default": False,
    },
]

DEFAULT_PRESET_ID = "academic"

# Behaviour that is not user-facing per launch. One source of truth: the extension
# previously carried its own fallbacks (0.06 typo rate in background.js against
# 0.018 in the popup), so the effective value depended on which path ran.
TYPING_DEFAULTS: Dict[str, Any] = {
    "natural_pauses": True,
    "jitter": True,
    "false_start_rate": 0.025,
    "target_app": "universal",
}

# Bounds so a caller-supplied override can never ask for something absurd (a
# 5000 wpm stream is not typing, it is a paste that looks nothing like a human).
WPM_MIN, WPM_MAX = 10, 200
TYPO_RATE_MIN, TYPO_RATE_MAX = 0.0, 0.25

UI_COPY: Dict[str, str] = {
    "panel_title": "Humanized Typing into Google Docs",
    "panel_desc": (
        "Types a draft into a Google Doc at a natural human cadence — real "
        "keystroke intervals and micro-pauses."
    ),
    "no_docs_tab_hint": "No Docs tab open? One is created at docs.new automatically.",
    "start_label": "Start Typing into Document",
}


def resolve_preset(preset_id: Optional[str]) -> Dict[str, Any]:
    """The named preset, or the default one. Never raises — an unknown id (an old
    extension, a stale bookmark) falls back to the default rather than failing a
    launch the user already asked for."""
    wanted = (preset_id or "").strip().lower()
    for preset in CADENCE_PRESETS:
        if preset["id"] == wanted:
            return preset
    for preset in CADENCE_PRESETS:
        if preset.get("default"):
            return preset
    return CADENCE_PRESETS[0]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def build_typing_config(
    preset_id: Optional[str] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """The exact config the extension will hand to the typing engine.

    `overrides` is the escape hatch for a caller that knows better (a future
    per-user preference), but every value is clamped: the plan is the last place
    that can stop a nonsensical stream before it is typed into someone's essay.
    """
    preset = resolve_preset(preset_id)
    cfg: Dict[str, Any] = {
        "wpm": preset["wpm"],
        "typo_rate": preset["typo_rate"],
        "preset_id": preset["id"],
        **TYPING_DEFAULTS,
    }
    for key in ("wpm", "typo_rate", "natural_pauses", "jitter",
                "false_start_rate", "target_app"):
        if not isinstance(overrides, dict) or key not in overrides:
            continue
        value = overrides[key]
        if key == "wpm":
            try:
                cfg["wpm"] = int(_clamp(float(value), WPM_MIN, WPM_MAX))
            except (TypeError, ValueError):
                pass
        elif key == "typo_rate":
            try:
                cfg["typo_rate"] = round(_clamp(float(value), TYPO_RATE_MIN, TYPO_RATE_MAX), 4)
            except (TypeError, ValueError):
                pass
        elif key == "false_start_rate":
            try:
                cfg["false_start_rate"] = round(
                    _clamp(float(value), TYPO_RATE_MIN, TYPO_RATE_MAX), 4
                )
            except (TypeError, ValueError):
                pass
        elif key in ("natural_pauses", "jitter"):
            cfg[key] = bool(value)
        elif key == "target_app" and isinstance(value, str) and value.strip():
            cfg["target_app"] = value.strip()[:32]
    return cfg


def build_launch_plan(
    *,
    title: Optional[str] = None,
    text: str = "",
    subject: Optional[str] = None,
    assignment_id: Optional[int] = None,
    preset_id: Optional[str] = None,
    text_override: Optional[str] = None,
    tab_id: Optional[int] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """The complete launch plan: what to type, where, and how fast.

    Pure — no DB, no request object — so the whole policy is unit-testable and the
    route stays a thin resolver of the assignment text.
    """
    chosen_text = text_override if (text_override and text_override.strip()) else (text or "")
    chosen_text = chosen_text.strip()
    word_count = len(chosen_text.split()) if chosen_text else 0
    typing = build_typing_config(preset_id, overrides)

    return {
        "status": "success",
        "plan_version": PLAN_VERSION,
        "assignment_id": assignment_id,
        "title": (title or "").strip() or "Assignment Document",
        "text": chosen_text,
        "word_count": word_count,
        # The extension shows this before a keystroke is sent, so the estimate
        # rides on the cadence actually chosen rather than a fixed 65 wpm.
        "estimated_minutes": max(1, round(word_count / float(typing["wpm"]))) if word_count else 0,
        "subject": subject or "",
        "target": {**DOC_TARGET, "tab_id": tab_id},
        "typing": typing,
        # The popup renders its cadence menu and copy from here, so the UI and the
        # engine can never disagree about what "Academic" means.
        "presets": CADENCE_PRESETS,
        "ui": UI_COPY,
    }


def build_launch_config() -> Dict[str, Any]:
    """Just the UI + defaults half of the plan, for rendering the panel before a
    launch is requested (no assignment, no text, nothing typed)."""
    return {
        "status": "success",
        "plan_version": PLAN_VERSION,
        "target": DOC_TARGET,
        "typing": build_typing_config(),
        "presets": CADENCE_PRESETS,
        "default_preset_id": resolve_preset(None)["id"],
        "ui": UI_COPY,
    }
