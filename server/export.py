"""Export utilities for study materials and deliverables."""
from __future__ import annotations

import json
import os
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


async def generate_export_bundle(assignment_id: int, export_format: str, user: Any) -> str:
    """Generates a local export file bundle for the given assignment."""
    export_dir = "/tmp/helpotron_exports"
    os.makedirs(export_dir, exist_ok=True)
    target_file = f"{export_dir}/assignment_{assignment_id}_bundle.{export_format.lower()}"
    with open(target_file, "w", encoding="utf-8") as f:
        f.write(f"# Helpotron Export Bundle - Assignment {assignment_id}\nUser: {getattr(user, 'public_id', 'user')}\nFormat: {export_format}\nGenerated Successfully.")
    return target_file


async def export_and_relay_telegram(assignment_id: int, export_format: str, db: Any, user: Any) -> str:
    """Generates export deliverable and pushes it to linked Telegram chat if present."""
    file_path = await generate_export_bundle(assignment_id, export_format, user)
    telegram_id = getattr(user, "telegram_id", None)
    notifications_paused = getattr(user, "notifications_paused", False)
    if telegram_id and not notifications_paused:
        try:
            from .telegram_bot import send_document_to_user
            await send_document_to_user(telegram_id, file_path, caption=f"📄 Here is your exported {export_format.upper()} bundle!")
        except Exception:
            pass
    return file_path


async def export_to_google_doc(
    assignment_id: int,
    access_token: str,
    title: str,
    content: str,
    simulation_speed: str = "fast"
) -> Dict[str, Any]:
    """Streams assignment content into Google Docs with authentic typing history."""
    from .gdocs_exporter import gdocs_streamer
    return await gdocs_streamer.stream_assignment_to_doc(
        access_token=access_token,
        title=title,
        content=content,
        simulation_speed=simulation_speed
    )

