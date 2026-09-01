"""Regression tests for dashboard card -> subject-bubble routing (operator 09-01).

Bug A: granular subjects stored by the dump classifier / scrape scanner
("Earth Science", "Chemistry", "Physics") were never matched by the dashboard's
default bubble vocabulary, so those cards surfaced only in the "All Course
Assignments" bubble. The /api/assignments/cards builder in server.routes_overlord
now (a) normalizes natural-science granular subjects onto the default
"Biology & Life Sciences" bubble label (the stored value is preserved on the
card in subject_detail) and (b) backfills a subject for subject-less cards
using the same deterministic classifier the extension scrape flow uses.

Note: conftest.py pins DATABASE_URL to an ephemeral ./test_helpotron.db before
the server imports, so the TestClient tests never touch the live database.
"""
from server.database import Assignment, SessionLocal, User
from server.routes_overlord import _bubble_vocab_subject


# ─── Unit tests: subject normalization ───────────────────────────────────────

def test_granular_science_subjects_map_to_bubble_vocabulary():
    # The regression row: "Timeline of Earth's Geological Development" was
    # stored with subject "Earth Science" and surfaced only in the 'all' bubble.
    assert _bubble_vocab_subject("Earth Science") == "Biology & Life Sciences"
    assert _bubble_vocab_subject("Chemistry") == "Biology & Life Sciences"
    assert _bubble_vocab_subject("Physics") == "Biology & Life Sciences"
    assert _bubble_vocab_subject("Astronomy") == "Biology & Life Sciences"
    assert _bubble_vocab_subject("Environmental Science") == "Biology & Life Sciences"
    assert _bubble_vocab_subject("General Science") == "Biology & Life Sciences"


def test_prefixed_granular_subjects_map_to_bubble_vocabulary():
    assert _bubble_vocab_subject("Chemistry Honors") == "Biology & Life Sciences"
    assert _bubble_vocab_subject("Physics 1") == "Biology & Life Sciences"
    assert _bubble_vocab_subject("AP Chemistry") == "Biology & Life Sciences"


def test_vocab_and_non_science_subjects_pass_through_untouched():
    # Real stored subjects that already match a default bubble — never rewritten.
    assert _bubble_vocab_subject("Mathematics") == "Mathematics"
    assert _bubble_vocab_subject("English & Literature") == "English & Literature"
    assert _bubble_vocab_subject("American History") == "American History"
    assert _bubble_vocab_subject("Psychology & Cognitive Sciences") == "Psychology & Cognitive Sciences"
    # Computer Science is its own default bubble — the 'science' family must not hijack it.
    assert _bubble_vocab_subject("Computer Science") == "Computer Science"
    assert _bubble_vocab_subject("Art History") == "Art History"
    assert _bubble_vocab_subject("") == ""


def test_neutral_classifier_bucket_stays_neutral():
    # The classify fallback bucket ("General Academic") carries no subject
    # evidence and must not be re-labeled as a science course.
    assert _bubble_vocab_subject("General Academic") == "General Academic"


def test_subjectless_backfill_uses_scrape_classifier():
    # Manual create / manual-route paths stored NO subject; the cards builder
    # backfills from the title with the same deterministic scraper classifier
    # (keyword hints, never an LLM call).
    from server.main import _classify_subject
    subj, code = _classify_subject("Mitochondria and cellular respiration lab report")
    assert subj == "Biology"
    assert code == "BIOL-101"


# ─── Endpoint tests: /api/assignments/cards ──────────────────────────────────

def _add_assignment(public_id, title, progress):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        a = Assignment(user_id=user.id, title=title, status="tracked", prompt="", progress=progress)
        db.add(a)
        db.commit()
        db.refresh(a)
        return a.id
    finally:
        db.close()


def test_cards_endpoint_routes_granular_science_subject_to_default_bubble(client, auth_headers, unique_user):
    """GET /api/assignments/cards normalizes a granular "Earth Science" subject
    onto the default bubble label while preserving the stored value."""
    aid = _add_assignment(unique_user, "Timeline of Earth's Geological Development",
                          {"subject": "Earth Science", "course_code": "EARTH-101",
                           "created_from_dump": True, "dump_file_id": 41})
    res = client.get("/api/assignments/cards", headers=auth_headers)
    assert res.status_code == 200
    mine = [c for c in res.json()["cards"] if c["id"] == aid]
    assert len(mine) == 1, f"card missing: {res.text[:300]}"
    assert mine[0]["subject"] == "Biology & Life Sciences"   # default bubble label
    assert mine[0]["subject_detail"] == "Earth Science"      # honest granular value kept
    assert mine[0]["class_code"] == "EARTH-101"              # real course identity intact


def test_cards_endpoint_backfills_subject_for_subjectless_assignment(client, auth_headers, unique_user):
    """Manual-route / manual-create assignments stored no subject; the cards
    builder backfills from the title so the card can reach a subject bubble."""
    aid = _add_assignment(unique_user, "Mitochondria and cellular respiration lab report",
                          {"created_from_dump": True})
    res = client.get("/api/assignments/cards", headers=auth_headers)
    assert res.status_code == 200
    mine = [c for c in res.json()["cards"] if c["id"] == aid]
    assert len(mine) == 1, f"card missing: {res.text[:300]}"
    # Classified "Biology" then normalized to the canonical science bubble label.
    assert mine[0]["subject"] == "Biology & Life Sciences"
    assert mine[0]["subject_detail"] == "Biology"
    assert mine[0]["class_code"] == "BIOL-101"
