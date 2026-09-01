"""Assignment lifecycle: status buckets, direction picker, Data Lake fallback.

Feature 09-01: new assignments land as ``pending_approval`` (awaiting the
user's direction). The user picks a direction from DIRECTIONS; the assignment
moves to ``in_progress`` and the sub-agent team is dispatched (via the
``server.assignment_team.dispatch_direction`` contract, lazy-imported so a
module that doesn't exist yet can never break the API).

When the requested direction is ``custom`` and its text does not match a known
capability keyword, the platform cannot execute it — instead of faking a
dispatch, the request is written to the Data Lake as a ``feature_request``
entry (honest fallback: a human/operator triages it).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .database import Assignment

# ─── Status buckets ───────────────────────────────────────────────────────────

# Assignment.status string -> lifecycle bucket. One bucket per stage so the UI
# can render the exact same 4-stage pipeline for every row regardless of the
# legacy status spellings.
BUCKET_FOR_STATUS: Dict[str, frozenset] = {
    "pending": frozenset({"pending_approval", "not_started", "tracked"}),
    "in_progress": frozenset({"in_progress", "paused"}),
    "completed": frozenset({"completed", "submitted", "graded"}),
    "archived": frozenset({"archived"}),
}
BUCKET_ORDER = ["pending", "in_progress", "completed", "archived"]

# The 9 statuses the assignment lifecycle knows (7 legacy + 2 new).
VALID_STATUSES = frozenset({
    "tracked", "not_started", "in_progress", "completed", "submitted",
    "graded", "paused", "pending_approval", "archived",
})

# Internal/transient statuses written by other pipelines (orchestrator sets
# "materials_ready" / "transcribed" mid-workflow). They always mean work is
# underway, never a failure — map them onto their lifecycle bucket.
_COMPAT_STATUS = {
    "materials_ready": "in_progress",
    "transcribed": "in_progress",
    "processing": "in_progress",
    "pending": "pending_approval",
}


def normalize_compat_status(status: Optional[str]) -> str:
    """Coerce any stored status string into a valid one, silently.

    Never raises and never echoes the raw input (that would leak internal
    state back to a client): unknown strings collapse to ``not_started``.
    """
    if not status:
        return "not_started"
    if status in VALID_STATUSES:
        return status
    return _COMPAT_STATUS.get(status, "not_started")


def bucket_for(status: Optional[str]) -> str:
    """Lifecycle bucket for a status string (normalized first)."""
    norm = normalize_compat_status(status)
    for bucket, statuses in BUCKET_FOR_STATUS.items():
        if norm in statuses:
            return bucket
    return "pending"


# ─── Directions ───────────────────────────────────────────────────────────────

DIRECTIONS = ["do_it_for_me", "study_guide", "quiz", "flashcards", "summary", "custom"]

# Capability keywords the platform actually ships (finalize actions, study
# tools, agent skill set). A free-text custom direction is achievable only
# when it names one of these — anything else goes to the Data Lake instead.
CAPABILITY_KEYWORDS = (
    "do it for me", "do it", "do_it", "solve", "solution", "done for me",
    "study guide", "study_guide", "studyguide", "cheat sheet", "cheatsheet",
    "notes", "note-taking", "outline", "explain", "explanation",
    "quiz", "practice quiz", "practice_quiz", "practice test", "practice_test",
    "test me", "questions", "question bank",
    "flashcard", "flashcards", "flash card", "flash cards", "anki",
    "spaced repetition", "spaced_repetition",
    "summary", "summarize", "summarise", "synopsis",
    "examples", "sample answer", "template", "teach", "review",
)

_CUSTOM_PATTERN = re.compile(
    r"(?i)(?:^|[\s\W])(" + "|".join(re.escape(k) for k in CAPABILITY_KEYWORDS) + r")(?:$|[\s\W])",
)


def is_direction_achievable(direction: str, custom_text: Optional[str]) -> bool:
    """True when the platform can actually execute the requested direction.

    Non-custom directions are always achievable (they are product features).
    ``custom`` is achievable only when its free text names a known capability
    keyword; otherwise the request goes to the Data Lake (see apply_direction).
    """
    if direction != "custom":
        return True
    text = (custom_text or "").strip()
    if not text:
        return False
    return bool(_CUSTOM_PATTERN.search(text))


# ─── Data Lake fallback ───────────────────────────────────────────────────────

def _write_datalake_feature_request(user: Any, assignment: Assignment, custom_text: str) -> Optional[Dict[str, Any]]:
    """Log the un-achievable custom direction as a Data Lake feature request.

    Returns the feedback entry (with its feedback_id) or None on any failure —
    a Data Lake hiccup must never fail the direction API.
    """
    try:
        from server.datalake import datalake_manager
    except Exception:  # noqa: BLE001 — datalake missing/young: the API still succeeds
        return None
    try:
        entry = datalake_manager.record_feedback(
            category="feature_request",
            urgency="medium",
            message=(
                f"[assignment '{assignment.title}'] direction requested: {custom_text}"
                f" (assignment #{assignment.id})"
            ),
            user_id=getattr(user, "public_id", None),
            feature_tag="assignment_direction",
        )
        return entry or None
    except Exception:  # noqa: BLE001
        return None


# ─── Lifecycle operations ─────────────────────────────────────────────────────

async def apply_direction(
    db,
    user: Any,
    assignment: Assignment,
    direction: str,
    custom_text: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate + apply the user's direction to an assignment.

    Marks the assignment ``in_progress`` and records the chosen direction in
    ``progress`` (direction / direction_chosen_at / direction_text for custom).
    When the direction is ``custom`` and NOT achievable, the request is logged
    to the Data Lake instead of being dispatched. Otherwise the sub-agent team
    is triggered via the ``server.assignment_team.dispatch_direction`` contract
    (lazy-imported + best-effort — the API never fails on dispatch).

    Returns ``{status, message, datalake_requested, datalake_feedback_id,
    dispatch_note}``.
    """
    direction = (direction or "").strip().lower()
    if direction not in DIRECTIONS:
        # Callers (router) pre-validate and turn this into a 400; the raise
        # keeps the function honest for direct callers too.
        raise ValueError(f"invalid direction: {direction}")
    custom_text = (custom_text or "").strip()
    text = custom_text if direction == "custom" else None

    progress = dict(assignment.progress or {})
    progress["direction"] = direction
    progress["direction_chosen_at"] = datetime.now(timezone.utc).isoformat()
    if text is not None:
        progress["direction_text"] = text
    assignment.status = "in_progress"
    assignment.progress = progress
    db.commit()

    result: Dict[str, Any] = {
        "status": "in_progress",
        "message": f"Direction '{direction}' applied; assignment marked in progress.",
        "datalake_requested": False,
        "datalake_feedback_id": None,
        "dispatch_note": "dispatch pending",
    }

    achievable = is_direction_achievable(direction, custom_text)

    if direction == "custom" and not achievable:
        # Honest fallback: the platform can't run what was asked — hand it to
        # the Data Lake for triage rather than faking a sub-agent dispatch.
        entry = _write_datalake_feature_request(user, assignment, text or custom_text)
        result["datalake_requested"] = entry is not None
        result["datalake_feedback_id"] = (entry or {}).get("feedback_id")
        if entry is not None:
            result["message"] = (
                f"Custom direction sent to the Data Lake ({entry.get('feedback_id')}) "
                "-- no matching capability; an operator will triage it."
            )
        else:
            result["message"] = "Custom direction not achievable; Data Lake write failed (see operator)."
        return result

    # Trigger the sub-agent team — best effort only. The contract lives in
    # server/assignment_team.py (built by the parallel dispatch agent); a
    # missing or failing module must never break direction selection.
    try:
        from server.assignment_team import dispatch_direction
        note = await dispatch_direction(db, user, assignment, direction, text or "")
        raw = str(note) if note else ""
        dispatch_note = raw[:120] if raw else "dispatch pending"
    except Exception:  # noqa: BLE001
        dispatch_note = "dispatch pending"
    if dispatch_note:
        prog = dict(assignment.progress or {})
        prog["dispatch_note"] = dispatch_note
        assignment.progress = prog
        db.commit()
    result["dispatch_note"] = dispatch_note
    return result


async def mark_done(db, user: Any, assignment: Assignment) -> Dict[str, Any]:
    """Mark an assignment done → lifecycle bucket ``completed``."""
    assignment.status = "completed"
    progress = dict(assignment.progress or {})
    progress["completed_at"] = datetime.now(timezone.utc).isoformat()
    assignment.progress = progress
    db.commit()
    db.refresh(assignment)
    return {"status": "completed", "message": "Assignment marked as done.", "assignment_id": assignment.id}


async def archive(db, user: Any, assignment: Assignment) -> Dict[str, Any]:
    """Archive an assignment → lifecycle bucket ``archived`` (assignment history)."""
    assignment.status = "archived"
    progress = dict(assignment.progress or {})
    progress["archived_at"] = datetime.now(timezone.utc).isoformat()
    assignment.progress = progress
    db.commit()
    db.refresh(assignment)
    return {"status": "archived", "message": "Assignment archived.", "assignment_id": assignment.id}
