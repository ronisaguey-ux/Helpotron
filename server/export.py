"""Export utilities for study materials."""
from __future__ import annotations

import json
from typing import Any, Dict, List


def export_flashcards_quizlet(flashcards: List[Dict]) -> str:
    """Export flashcards as Quizlet CSV format (term, definition)."""
    lines = ["term,definition"]
    for card in flashcards:
        q = card.get("q", "")
        a = card.get("a", "")
        lines.append(f'"{q}","{a}"')
    return "\n".join(lines)


def export_flashcards_anki(flashcards: List[Dict]) -> str:
    """Export flashcards as Anki CSV format (front, back)."""
    lines = ["front,back"]
    for card in flashcards:
        q = card.get("q", "")
        a = card.get("a", "")
        lines.append(f'"{q}","{a}"')
    return "\n".join(lines)


def export_practice_test_json(practice_test: Dict) -> str:
    """Export practice test as JSON."""
    return json.dumps(practice_test, indent=2, ensure_ascii=False)


def export_study_guide_markdown(study_guide: str) -> str:
    """Export study guide as Markdown."""
    return study_guide


def export_summary_text(summary: str) -> str:
    """Export summary as plain text."""
    return summary
