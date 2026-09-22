"""Assignment draft generation with style mimicry and AI detector scoring.

This module handles:
- Storing and retrieving a student's custom writing style (uploaded text).
- Generating an assignment draft using the style as a few-shot example.
- Running the draft through the top 5 AI detectors.
- Retrying up to 5 times if the average detector score is below threshold.
- Marking the draft as 'risky' if it fails after all retries.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from . import detectors, llm
from .config import config
from .database import Assignment, Draft, Transcript, User, utcnow
from .default_styles import get_default_style

logger = logging.getLogger("helpotron.draft")

# Cost in credits per draft generation (charged on success, refunded on failure)
DRAFT_COST = 200.0

# Max retries for detector threshold
MAX_RETRIES = 5

# Strict retry ceiling (max 3 iterations) to prevent runaway billing
MAX_HUMANIZER_RETRIES = 3

# Default detector threshold if user doesn't specify
DEFAULT_THRESHOLD = 80.0


def get_style(user_id: int, db: Session) -> Optional[str]:
    """Retrieve the student's uploaded custom text for style mimicry."""
    user = db.get(User, user_id)
    if user and user.settings.get("writing_style"):
        return user.settings["writing_style"]
    return None


def set_style(user_id: int, text: str, db: Session) -> None:
    """Store the student's custom text in user settings."""
    user = db.get(User, user_id)
    if user:
        user.settings = {**user.settings, "writing_style": text}
        db.commit()


# 08-28 fix: transcripts/scraped source were sliced at 5000 chars — the model
# drafted from only the first minutes of any lecture (or the first 5k chars of a
# scraped page), and the rest was silently missing from the draft. Now cap at
# 120k chars with an explicit marker on cut (storage is full either way; this
# only bounds the outbound LLM prompt).
TRANSCRIPT_PROMPT_CAP = 120_000


def _transcript_chunk(text: str) -> str:
    t = (text or "").strip()
    if len(t) <= TRANSCRIPT_PROMPT_CAP:
        return t
    return (t[:TRANSCRIPT_PROMPT_CAP] +
            f"\n\n[…transcript continues beyond the {TRANSCRIPT_PROMPT_CAP}-char prompt cap; "
            f"the full recorded text is available on the assignment.]")


def build_style_prompt(style_text: str, assignment_prompt: str, transcript_text: str) -> str:
    """Build a system prompt that instructs the LLM to mimic the student's style."""
    from .agent_prompt import sandbox_math_rule, prompt_injection_defense_rule  # standing rules
    return f"""You are an AI assistant helping a student write an assignment draft.

The student has provided samples of their own writing style. Your task is to generate a draft that mimics their style as closely as possible. Use the same vocabulary, sentence structure, tone, and level of formality.

Student's writing style sample:
{style_text[:3000]}

Assignment prompt:
{assignment_prompt}

Lecture/transcript context:
{_transcript_chunk(transcript_text)}

Write a complete draft that directly addresses the assignment prompt. Do not include any meta-commentary. Just produce the draft text.

{sandbox_math_rule()}

{prompt_injection_defense_rule()}"""


def build_default_style_prompt(reading_level: str, target_grade: str, assignment_prompt: str, transcript_text: str) -> str:
    """Build a system prompt that uses a default writing style based on reading level and target grade."""
    from .agent_prompt import sandbox_math_rule, prompt_injection_defense_rule  # standing rules
    style_text = get_default_style(reading_level, target_grade)
    if not style_text:
        style_text = "Write in a clear, academic style appropriate for the reading level."
    return f"""You are an AI assistant helping a student write an assignment draft.

The student has not provided their own writing style, so we are using a default style based on their reading level and target grade.

Reading level: {reading_level or 'college-freshman'}
Target grade: {target_grade or 'B'}

Default style sample:
{style_text[:2000]}

Assignment prompt:
{assignment_prompt}

Lecture/transcript context:
{_transcript_chunk(transcript_text)}

Write a complete draft that directly addresses the assignment prompt. Mimic the style of the sample as closely as possible. Do not include any meta-commentary. Just produce the draft text.

{sandbox_math_rule()}

{prompt_injection_defense_rule()}"""


async def generate_draft(
    user_id: int,
    assignment_id: int,
    transcript_text: str,
    assignment_prompt: str,
    style_text: Optional[str] = None,
    reading_level: Optional[str] = None,
    target_grade: Optional[str] = None,
) -> Tuple[str, str]:
    """Generate a draft using style mimicry. Returns (draft_text, model_used)."""
    if style_text:
        system_prompt = build_style_prompt(style_text, assignment_prompt, transcript_text)
    else:
        system_prompt = build_default_style_prompt(reading_level or "college-freshman", target_grade or "B", assignment_prompt, transcript_text)
    user_prompt = "Generate the assignment draft now."
    # Use the same LLM call as other generators
    try:
        content = await llm.call_llm(user_prompt=user_prompt, system_prompt=system_prompt)
    except TypeError as e:
        # The positional fallback that used to be here passed (system, user) into
        # a (user, system) signature — inverting the roles, and doing it on ANY
        # TypeError, including one raised inside call_llm. It could inject style
        # and transcript text into the system slot, which is exactly the
        # privilege boundary the prompt-injection hardening exists to protect.
        raise RuntimeError(f"draft generation failed: {type(e).__name__}: {e}") from e
    model = None
    return content, model


async def score_draft(draft_text: str, threshold: float) -> Tuple[float, List[detectors.DetectorResult], bool]:
    """Score the draft with detectors and check against threshold."""
    avg_score, results, passed = await detectors.score_text(draft_text, threshold)
    return avg_score, results, passed


async def create_draft_task(
    user_id: int,
    assignment_id: int,
    threshold: float,
    db: Session,
) -> Draft:
    """Start the draft generation process. Returns the Draft record."""
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise ValueError("Assignment not found")
    user = db.get(User, user_id)
    if not user:
        raise ValueError("User not found")
    # Charge task tokens upfront (refunded on failure)
    from .credits import get_token_balance, set_token_balance, is_unmetered
    if not is_unmetered(user):
        if get_token_balance(user) < DRAFT_COST:
            raise ValueError("Insufficient tokens")
        set_token_balance(user, get_token_balance(user) - DRAFT_COST)
        db.commit()

    draft = Draft(
        user_id=user_id,
        assignment_id=assignment_id,
        threshold=threshold,
        status="pending",
        retries_left=MAX_RETRIES,
        created_at=datetime.now(timezone.utc),
    )
    db.add(draft)
    db.commit()
    return draft


def run_draft_workflow(draft_id: int) -> None:
    """Synchronous wrapper for the async workflow; runs in background thread."""
    asyncio.run(_draft_workflow_async(draft_id))


async def _draft_workflow_async(draft_id: int) -> None:
    """Background task: generate, score, retry, and update draft status."""
    from .database import SessionLocal
    db = SessionLocal()
    try:
        draft = db.get(Draft, draft_id)
        if not draft:
            logger.error("Draft %d not found", draft_id)
            return
        # Get assignment and transcript
        assignment = db.get(Assignment, draft.assignment_id)
        if not assignment:
            raise ValueError("Assignment missing")
        # We need transcript text - could be from assignment's related transcripts.
        # For simplicity, we'll take the latest transcript for the assignment.
        transcript = (
            db.query(Transcript)
            .filter(Transcript.assignment_id == draft.assignment_id)
            .order_by(Transcript.id.desc())
            .first()
        )
        # 08-28 fix: scraped assignments have no Transcript row — the scraped
        # page content IS the source. Fall back so drafts/team work can be
        # generated instead of erroring out ("No transcript found").
        if not transcript:
            transcript_text = (assignment.prompt or "").strip() or ""
            if not transcript_text:
                raise ValueError("No transcript found for this assignment")
        else:
            transcript_text = transcript.text
        assignment_prompt = assignment.prompt

        # Get style, reading level, target grade
        user = db.get(User, draft.user_id)
        reading_level = user.settings.get("reading_level", "college-freshman") if user else "college-freshman"
        target_grade = assignment.progress.get("target_grade") or user.settings.get("average_grade", "B") if user else "B"

        style_text = get_style(draft.user_id, db)

        # Generation loop with retries
        for attempt in range(1, MAX_RETRIES + 1):
            draft.attempts = attempt
            db.commit()
            logger.info("Draft %d attempt %d", draft_id, attempt)

            # Generate draft
            try:
                draft_text, model_used = await generate_draft(
                    draft.user_id,
                    draft.assignment_id,
                    transcript_text,
                    assignment_prompt,
                    style_text,
                    reading_level,
                    target_grade
                )
                # Humanizer Pass: Voice calibration (User custom style / Selected book style) + Kimhons 38-pattern scrubbing + Burstiness modulation
                from .humanizer import AIHumanizerPipeline
                humanizer = AIHumanizerPipeline(human_score_threshold=draft.threshold)
                book_style_id = user.settings.get("selected_book_style") if user and user.settings else None
                effort_level = user.settings.get("default_effort_level", 500) if user and user.settings else 500

                humanized_text, humanize_meta = await humanizer.humanize_loop(
                    draft_text=draft_text,
                    style_sample=style_text,
                    book_style_id=book_style_id,
                    reading_level=reading_level,
                    effort_level=effort_level,
                    settings=(user.settings if user and user.settings else None),
                )
                draft.draft_text = humanized_text
                draft.model_used = model_used
            except Exception as e:
                logger.error("Generation error: %s", e)
                draft.last_error = str(e)
                db.commit()
                continue

            # Score humanized draft with final multi-detector suite
            avg_score, results, passed = await score_draft(draft.draft_text, draft.threshold)
            draft.detector_results = [r.to_dict() for r in results]
            draft.average_score = avg_score
            db.commit()

            if passed:
                draft.status = "passed"
                draft.retries_left = MAX_RETRIES - attempt
                db.commit()
                logger.info("Draft %d passed with score %.2f", draft_id, avg_score)
                # Update assignment status
                assignment.status = "draft_ready"
                assignment.progress = {**assignment.progress, "draft": True}
                db.commit()
                return
            else:
                draft.retries_left = MAX_RETRIES - attempt
                if attempt < MAX_RETRIES:
                    # Modify prompt slightly for next attempt (e.g., ask to be more human-like)
                    # We'll just let the generation retry with the same inputs; the model will vary.
                    pass

        # Exhausted retries: mark as risky
        draft.status = "risky"
        draft.retries_left = 0
        db.commit()
        # Update assignment status
        assignment.status = "draft_risky"
        assignment.progress = {**assignment.progress, "draft": "risky"}
        db.commit()
        logger.info("Draft %d marked risky after %d attempts", draft_id, MAX_RETRIES)
    except Exception as e:
        logger.exception("Draft workflow failed: %s", e)
        draft.status = "failed"
        draft.last_error = str(e)
        db.commit()
        # Refund tokens on failure
        user = db.get(User, draft.user_id)
        if user:
            from .credits import get_token_balance, set_token_balance
            set_token_balance(user, get_token_balance(user) + DRAFT_COST)
            db.commit()
    finally:
        db.close()


def start_draft_workflow(draft_id: int) -> None:
    """Start the draft workflow in the background."""
    t = threading.Thread(target=run_draft_workflow, args=(draft_id,), daemon=True)
    t.start()
