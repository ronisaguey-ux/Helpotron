"""
Unit tests for Open-Source Intelligence Feature Engines:
- FSRS Spaced Repetition Scheduler (server/fsrs_scheduler.py)
- Anki Deck Exporter (server/anki_exporter.py)
- Canvas REST Sync Engine (server/canvas_sync.py)
"""

import pytest
from datetime import datetime, timezone, timedelta
from server.fsrs_scheduler import FSRSScheduler
from server.anki_exporter import AnkiExporter
from server.canvas_sync import CanvasSyncEngine


def test_fsrs_initial_review_ratings():
    scheduler = FSRSScheduler(target_retention=0.90)
    
    # Rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
    rev_again = scheduler.schedule_review(rating=1)
    rev_good = scheduler.schedule_review(rating=3)
    rev_easy = scheduler.schedule_review(rating=4)

    assert rev_again["review_state"] == "learning"
    assert rev_again["interval_days"] >= 1
    assert rev_good["interval_days"] >= 1
    assert rev_easy["interval_days"] >= rev_good["interval_days"]
    assert rev_easy["stability"] > rev_good["stability"]


def test_fsrs_subsequent_review_intervals():
    scheduler = FSRSScheduler(target_retention=0.90)
    
    # First review (Good)
    init = scheduler.schedule_review(rating=3)
    last_review = datetime.now(timezone.utc) - timedelta(days=3)

    # Second review (Good)
    second_rev = scheduler.schedule_review(
        rating=3,
        current_stability=init["stability"],
        current_difficulty=init["difficulty"],
        last_review_time=last_review
    )
    assert second_rev["stability"] > init["stability"]
    assert second_rev["interval_days"] >= 1


def test_anki_exporter_tsv_and_json():
    cards = [
        {"front": "What is the powerhouse of the cell?", "back": "Mitochondria", "tags": "bio-101"},
        {"front": "Calculate $$E=mc^2$$", "back": "Mass-energy equivalence", "tags": "physics"}
    ]

    tsv_output = AnkiExporter.export_deck_tsv("Biology", cards)
    assert "#deck:Helpotron::Biology" in tsv_output
    assert "#separator:tab" in tsv_output
    assert "Mitochondria" in tsv_output
    assert "\\[E=mc^2\\]" in tsv_output  # MathJax converted

    json_output = AnkiExporter.export_deck_json("Biology", cards)
    assert json_output["card_count"] == 2
    assert json_output["deck_name"] == "Biology"
    assert len(json_output["cards"]) == 2
    assert json_output["cards"][0]["guid"] != ""


def test_canvas_sync_link_header_parser():
    link_header = '<https://canvas.instructure.com/api/v1/courses?page=2&per_page=50>; rel="next", <https://canvas.instructure.com/api/v1/courses?page=5&per_page=50>; rel="last"'
    next_url = CanvasSyncEngine.parse_rfc5988_next_link(link_header)
    assert next_url == "https://canvas.instructure.com/api/v1/courses?page=2&per_page=50"

    empty_next = CanvasSyncEngine.parse_rfc5988_next_link(None)
    assert empty_next is None
