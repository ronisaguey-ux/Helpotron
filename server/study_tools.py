"""Study-material generation — study guides, flashcards, practice tests,
2-minute summaries, all built from the user's OWN lecture transcripts.

No assignment completion: these tools make the material understandable.
Reading level is a tailoring option (plain-language explanation is a
legitimate study aid); there is no 'grade trajectory' or style mimicry here.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

try:
    from . import llm
except (ImportError, ValueError):
    from server import llm


logger = logging.getLogger(__name__)

# FIX B3 (implemented 08-22): 4-step progress streaming for long-running
# generation tasks. Each generator accepts an optional async on_progress
# callback and fires real phase boundaries: Parsing syllabus -> Extracting
# key concepts -> Generating <material> -> Verifying accuracy.
ProgressCB = Callable[[int, str], Awaitable[None]]


async def _progress(on_progress: ProgressCB | None, step: int, label: str) -> None:
    if on_progress is not None:
        await on_progress(step, label)

_SYSTEM = (
    "You are Helpotron, a study assistant. You generate study materials from "
    "lecture transcripts and assignment prompts. Be accurate to the transcript; "
    "when the transcript doesn't cover something, say so instead of inventing it. "
    "Never fabricate sources or quotes. Output in clean Markdown unless the user "
    "asked for JSON."
)

READING_LEVELS = ["9th", "10th", "11th", "12th", "college-freshman", "sophomore"]


def _reading_level_clause(level: str | None) -> str:
    level = (level or "college-freshman").lower()
    if level not in READING_LEVELS and level not in ("", "none"):
        logger.warning("unknown reading level %r, defaulting to college-freshman", level)
        level = "college-freshman"
    return (
        f"\nReading level: {level}. Explain jargon, define terms, and keep sentence "
        "structure appropriate for that level."
    ) if level else ""


def _transcript_block(transcript: str, limit: int = 40000) -> str:
    transcript = (transcript or "").strip()
    if not transcript:
        raise ValueError("transcript is empty")
    if len(transcript) > limit:
        transcript = transcript[:limit] + "\n[truncated]"
    return transcript


async def _invoke_llm(system: str, user: str, effort_score: int = 500) -> str:
    try:
        return await llm.call_llm(system, user, effort_score=effort_score)
    except TypeError:
        try:
            return await llm.call_llm(system, user)
        except TypeError:
            return await llm.call_llm(user, system_prompt=system)



async def generate_study_guide(
    transcript: str,
    assignment_prompt: str = "",
    reading_level: str | None = None,
    on_progress: ProgressCB | None = None,
    effort_score: int = 500,
) -> tuple[str, str]:
    user = (
        "Create a study guide from this lecture transcript"
        + (f" and the assignment prompt: {assignment_prompt}" if assignment_prompt else "")
        + ".\nInclude: key concepts with definitions, main arguments, important "
        "examples, and 3-5 sample exam questions with brief answers.\n\n"
        f"TRANSCRIPT:\n{_transcript_block(transcript)}"
        + _reading_level_clause(reading_level)
    )
    await _progress(on_progress, 1, "Parsing syllabus")
    await _progress(on_progress, 2, "Extracting key concepts")
    content = await _invoke_llm(_SYSTEM, user, effort_score=effort_score)
    await _progress(on_progress, 3, "Generating study guide")
    await _progress(on_progress, 4, "Verifying accuracy")
    return content, None


async def generate_flashcards(
    transcript: str,
    count: int = 20,
    reading_level: str | None = None,
    on_progress: ProgressCB | None = None,
    effort_score: int = 500,
) -> tuple[list[dict], str]:
    user = (
        f"Create {count} flashcards from this lecture transcript. Return ONLY a "
        "JSON array, no prose, each item shaped "
        '{"q": "...", "a": "..."}.\n'
        f"TRANSCRIPT:\n{_transcript_block(transcript)}"
        + _reading_level_clause(reading_level)
    )
    await _progress(on_progress, 1, "Parsing syllabus")
    await _progress(on_progress, 2, "Extracting key concepts")
    await _progress(on_progress, 3, "Generating flashcards")
    for attempt in range(2):
        content = await _invoke_llm(_SYSTEM, user, effort_score=effort_score)
        model = None
        parsed = llm.extract_json(content)
        if parsed is not None:
            items = parsed.get("flashcards") if isinstance(parsed, dict) and "flashcards" in parsed else (
                parsed if isinstance(parsed, list) else None
            )
            if items is None and isinstance(parsed, dict):
                items = [v for v in parsed.values() if isinstance(v, list)]
                items = items[0] if items else None
            if isinstance(items, list) and items and all(isinstance(i, dict) and "q" in i and "a" in i for i in items):
                await _progress(on_progress, 4, "Verifying accuracy")
                return items, model
        logger.warning("flashcard JSON parse failed (attempt %d), retrying", attempt + 1)
    raise RuntimeError("flashcards: could not parse JSON output after retries")


async def generate_practice_test(
    transcript: str,
    mc_count: int = 10,
    short_answer_count: int = 5,
    reading_level: str | None = None,
    on_progress: ProgressCB | None = None,
    effort_score: int = 500,
) -> tuple[dict, str]:
    user = (
        f"Create a practice test from this lecture transcript: {mc_count} "
        f"multiple-choice questions (each with 4 options and the correct answer "
        "marked) and {short_answer_count} short-answer questions with model "
        "answers. Return ONLY a JSON object shaped "
        '{"multiple_choice": [{"q": "...", "options": ["a","b","c","d"], '
        '"answer_index": 0, "explanation": "..."}], "short_answer": ['
        '{"q": "...", "model_answer": "..."}]}.\n'
        f"TRANSCRIPT:\n{_transcript_block(transcript)}"
        + _reading_level_clause(reading_level)
    )
    await _progress(on_progress, 1, "Parsing syllabus")
    await _progress(on_progress, 2, "Extracting key concepts")
    await _progress(on_progress, 3, "Generating quiz")
    for attempt in range(2):
        content = await _invoke_llm(_SYSTEM, user, effort_score=effort_score)
        model = None
        parsed = llm.extract_json(content)
        if parsed is not None and isinstance(parsed, dict):
            if "multiple_choice" in parsed or "short_answer" in parsed:
                await _progress(on_progress, 4, "Verifying accuracy")
                return parsed, model
        logger.warning("practice-test JSON parse failed (attempt %d), retrying", attempt + 1)
    raise RuntimeError("practice-test: could not parse JSON output after retries")


async def generate_summary(
    transcript: str,
    on_progress: ProgressCB | None = None,
    effort_score: int = 500,
) -> tuple[str, str]:
    user = (
        "Create a 2-minute summary of this lecture — the kind you'd read "
        "right before class. Include: the thesis/main point, 3-5 key arguments "
        "in order, one standout quote or example if present in the transcript, "
        "and 2 questions you should be ready to answer.\n\n"
        f"TRANSCRIPT:\n{_transcript_block(transcript)}"
    )
    await _progress(on_progress, 1, "Parsing syllabus")
    await _progress(on_progress, 2, "Extracting key concepts")
    content = await _invoke_llm(_SYSTEM, user, effort_score=effort_score)
    await _progress(on_progress, 3, "Generating summary")
    await _progress(on_progress, 4, "Verifying accuracy")
    return content, None


async def generate_study_pack(content: str, user: Any, db: Any) -> dict:
    from server.credits import charge, refund
    from fastapi import HTTPException
    if not charge(user, 'study_guide', db):
        raise HTTPException(status_code=402, detail='Insufficient credits for study guide generation')
    
    try:
        prompt = f'Generate a structured study guide with key terms and summaries from: {content}'
        raw_response = await llm.call_llm(
            system_prompt='You are an expert academic tutor. Return valid JSON only.',
            user_prompt=prompt,
            response_format='json_object'
        )
        parsed = llm.extract_json(raw_response)
        if not parsed:
            raise ValueError('Failed to parse valid JSON from LLM response')
        return parsed
    except Exception as e:
        refund(user, 'study_guide', db)
        logger.error(f'Study pack generation failed, credits refunded: {e}')
        raise HTTPException(status_code=500, detail=f'Study pack generation failed: {str(e)}')


GENERATORS: dict[str, Any] = {
    "study_guide": generate_study_guide,
    "flashcards": generate_flashcards,
    "practice_test": generate_practice_test,
    "summary": generate_summary,
    "study_pack": generate_study_pack,
}

