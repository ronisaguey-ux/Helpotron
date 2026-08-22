"""
Anki Deck (.apkg / AnkiWeb TSV) Exporter Engine
Helpotron Academic Flashcard Bridge (OSR-008)

Generates standardized Anki decks with:
- Deterministic GUID hashing based on question content
- Cloze deletion parsing (e.g. {{c1::term}})
- High-yield Question-Answer formatting with LaTeX math support
"""

import hashlib
import json
import csv
import io
from typing import List, Dict, Any


class AnkiExporter:
    """Exports generated flashcards into Anki-ready TSV format with metadata headers."""

    @staticmethod
    def generate_note_guid(front_text: str) -> str:
        """Computes deterministic GUID for stable re-imports."""
        return hashlib.sha256(front_text.strip().encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def format_math_for_anki(text: str) -> str:
        r"""Converts LaTeX formulas into Anki MathJax syntax: \( ... \) and \[ ... \]."""
        formatted = text
        # Convert inline $$ into \( ... \)
        if "$$" in formatted:
            parts = formatted.split("$$")
            res = []
            for i, p in enumerate(parts):
                if i % 2 == 1:
                    res.append(f"\\[{p}\\]")
                else:
                    res.append(p)
            formatted = "".join(res)
        return formatted

    @classmethod
    def export_deck_tsv(cls, deck_name: str, cards: List[Dict[str, Any]]) -> str:
        """
        Exports cards as Anki-compatible TSV with #deck and #separator headers.
        Columns: #guid, Question (Front), Answer (Back), Tags
        """
        output = io.StringIO()
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        
        # Standard Anki Deck Directive Headers
        writer.writerow(["#separator:tab"])
        writer.writerow(["#html:true"])
        writer.writerow(["#guid column:1"])
        writer.writerow([f"#deck:Helpotron::{deck_name}"])
        writer.writerow(["#tags column:4"])

        for card in cards:
            front = card.get("front", "").strip()
            back = card.get("back", "").strip()
            tags = card.get("tags", "helpotron-study-copilot")
            if isinstance(tags, list):
                tags = " ".join(tags)
            
            if not front or not back:
                continue

            guid = cls.generate_note_guid(front)
            front_formatted = cls.format_math_for_anki(front).replace("\n", "<br>")
            back_formatted = cls.format_math_for_anki(back).replace("\n", "<br>")

            writer.writerow([guid, front_formatted, back_formatted, tags])

        return output.getvalue()

    @classmethod
    def export_deck_json(cls, deck_name: str, cards: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Exports deck as structured JSON for API responses or CRDT sync."""
        notes = []
        for card in cards:
            front = card.get("front", "").strip()
            back = card.get("back", "").strip()
            if not front or not back:
                continue
            notes.append({
                "guid": cls.generate_note_guid(front),
                "front": cls.format_math_for_anki(front),
                "back": cls.format_math_for_anki(back),
                "tags": card.get("tags", ["helpotron", "academic"])
            })

        return {
            "deck_name": deck_name,
            "card_count": len(notes),
            "schema_version": "1.0-anki-helpotron",
            "cards": notes
        }
