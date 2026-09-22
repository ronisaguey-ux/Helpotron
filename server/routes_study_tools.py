import json
import re
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from .database import get_db, StudyMaterial, StudyCardState, StudySession, User, Assignment
from .routes_features import get_current_authenticated_user
from .fsrs_scheduler import FSRSScheduler
from .analytics import log_study_session

router = APIRouter(prefix="/api/study", tags=["study_tools"])
scheduler = FSRSScheduler()


def _owned_material_or_404(db: Session, material_id: int, user: User) -> StudyMaterial:
    """Fetch a StudyMaterial the caller is allowed to read, else 404.

    This is the only sanctioned way to fetch a single material by id in this
    module. Before it, review/grade/mastery each ran
    ``filter(StudyMaterial.id == material_id)`` with no user predicate, so any
    authenticated user could read another user's quiz answers by enumerating
    ids (sweep#2 S1-2) — the listing filter below had the predicate, the
    single-item lookups did not.

    Ownership is the same rule the listing and the library routes use: the
    creator, or someone the material is `shared_with`. The predicate is part of
    the QUERY rather than a check afterwards, so a foreign id is simply not
    found and the 404 stays truthful — this also avoids leaking which ids exist.
    """
    m = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.id == material_id,
            or_(
                StudyMaterial.user_id == user.id,
                StudyMaterial.shared_with.contains([user.id]),
            ),
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    return m


class CardReviewRequest(BaseModel):
    card_index: int = Field(..., ge=0)
    rating: int = Field(..., ge=1, le=4)  # 1: Again, 2: Hard, 3: Good, 4: Easy
    difficulty: Optional[str] = Field("medium")
    time_spent_minutes: Optional[int] = Field(1, ge=0)


class QuizAnswerItem(BaseModel):
    question_index: int = Field(..., ge=0)
    selected_answer: str


class QuizGradeRequest(BaseModel):
    answers: List[QuizAnswerItem]
    time_spent_minutes: Optional[int] = Field(5, ge=0)


@router.get("/decks")
async def list_study_decks(
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    materials = (
        db.query(StudyMaterial)
        .filter(
            or_(
                StudyMaterial.user_id == user.id,
                StudyMaterial.shared_with.contains([user.id]),
            ),
            StudyMaterial.kind.in_(["flashcards", "practice_test", "deck"]),
        )
        .order_by(StudyMaterial.id.desc())
        .all()
    )

    material_ids = [m.id for m in materials]
    card_states_by_material: dict[int, list] = {m_id: [] for m_id in material_ids}
    if material_ids:
        all_states = (
            db.query(StudyCardState)
            .filter(
                StudyCardState.user_id == user.id,
                StudyCardState.material_id.in_(material_ids),
            )
            .all()
        )
        for cs in all_states:
            card_states_by_material.setdefault(cs.material_id, []).append(cs)

    decks = []
    for m in materials:
        parsed = []
        try:
            parsed = json.loads(m.content) if isinstance(m.content, str) else m.content
        except Exception:
            parsed = []

        total_cards = len(parsed) if isinstance(parsed, list) else 0

        card_states = card_states_by_material.get(m.id, [])
        mastered_count = sum(1 for cs in card_states if cs.state in ("mastered", "known", "review"))
        mastery_pct = round((mastered_count / total_cards) * 100, 1) if total_cards > 0 else 0.0

        decks.append({
            "id": m.id,
            "title": f"{m.kind.replace("_", " ").title()} #{m.id}",
            "kind": m.kind,
            "total_cards": total_cards,
            "mastered_cards": mastered_count,
            "mastery_percentage": mastery_pct,
            "model_used": m.model_used,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "saved_at": m.saved_at.isoformat() if m.saved_at else None,
            "cards": parsed if isinstance(parsed, list) else [],
        })

    return {"decks": decks, "count": len(decks)}


@router.post("/decks/{material_id}/review")
async def review_card(
    material_id: int,
    payload: CardReviewRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    m = _owned_material_or_404(db, material_id, user)

    now = datetime.now(timezone.utc)

    card_state = (
        db.query(StudyCardState)
        .filter(
            StudyCardState.user_id == user.id,
            StudyCardState.material_id == material_id,
            StudyCardState.card_index == payload.card_index,
        )
        .first()
    )

    review_res = scheduler.schedule_review(rating=payload.rating)
    next_due_dt = datetime.fromisoformat(review_res["next_due_date"]) if review_res.get("next_due_date") else now + timedelta(days=1)
    new_state = "mastered" if payload.rating >= 3 else ("known" if payload.rating == 2 else "learning")

    if not card_state:
        card_state = StudyCardState(
            user_id=user.id,
            material_id=material_id,
            card_index=payload.card_index,
            state=new_state,
            difficulty=payload.difficulty or "medium",
            due=next_due_dt,
            lapses=1 if payload.rating == 1 else 0,
            last_practiced=now,
        )
        db.add(card_state)
    else:
        card_state.state = new_state
        card_state.difficulty = payload.difficulty or card_state.difficulty
        card_state.due = next_due_dt
        if payload.rating == 1:
            card_state.lapses = (card_state.lapses or 0) + 1
        card_state.last_practiced = now

    db.commit()
    db.refresh(card_state)

    # Log study session event
    try:
        log_study_session(
            db=db,
            user_id=user.id,
            material_id=material_id,
            time_spent_minutes=payload.time_spent_minutes or 1,
            completed_flashcards=1,
        )
    except Exception as e:
        print("Warning: failed to log study session:", e)

    return {
        "status": "ok",
        "card_index": payload.card_index,
        "state": card_state.state,
        "due": card_state.due.isoformat() if card_state.due else None,
        "fsrs": review_res,
    }


@router.post("/quiz/{material_id}/grade")
async def grade_quiz(
    material_id: int,
    payload: QuizGradeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    m = _owned_material_or_404(db, material_id, user)

    parsed_content = []
    try:
        parsed_content = json.loads(m.content) if isinstance(m.content, str) else m.content
    except Exception:
        parsed_content = []

    if not isinstance(parsed_content, list):
        parsed_content = []

    total_questions = len(parsed_content)
    correct_count = 0
    results = []

    answer_map = {ans.question_index: ans.selected_answer.strip().lower() for ans in payload.answers}

    for idx, item in enumerate(parsed_content):
        correct_answer = ""
        explanation = ""
        if isinstance(item, dict):
            correct_answer = str(
                item.get("correct_answer")
                or item.get("answer")
                or item.get("definition")
                or item.get("back")
                or ""
            ).strip().lower()
            explanation = str(item.get("explanation") or item.get("hint") or "")
        elif isinstance(item, list) and len(item) >= 2:
            correct_answer = str(item[1]).strip().lower()

        submitted = answer_map.get(idx, "")
        is_correct = bool(submitted and (submitted == correct_answer or submitted in correct_answer or correct_answer in submitted))
        if is_correct:
            correct_count += 1

        results.append({
            "question_index": idx,
            "submitted": submitted,
            "correct_answer": correct_answer,
            "is_correct": is_correct,
            "explanation": explanation,
        })

    score_pct = round((correct_count / max(1, total_questions)) * 100, 1)

    try:
        log_study_session(
            db=db,
            user_id=user.id,
            material_id=material_id,
            time_spent_minutes=payload.time_spent_minutes or 5,
            score=score_pct,
        )
    except Exception as e:
        print("Warning: failed to log quiz study session:", e)

    return {
        "status": "ok",
        "material_id": material_id,
        "score": correct_count,
        "total": total_questions,
        "percentage": score_pct,
        "results": results,
    }


@router.get("/streak")
async def get_study_streak(
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    sessions = (
        db.query(StudySession.created_at)
        .filter(StudySession.user_id == user.id)
        .order_by(StudySession.created_at.desc())
        .all()
    )

    if not sessions:
        return {"streak_days": 0, "last_active_date": None, "has_streak": False}

    session_dates = set()
    for s in sessions:
        if s[0]:
            session_dates.add(s[0].date())

    sorted_dates = sorted(session_dates, reverse=True)
    # Compare in UTC, the same clock the rows were written with.
    #
    # `StudySession.created_at` defaults to `utcnow()`, but `date.today()` reads
    # the server's LOCAL date. West of UTC those disagree for the last hours of
    # every day (20:00 EDT is already tomorrow in UTC), so a user who had just
    # studied was shown a 0-day streak every evening — the UTC date of their
    # session was "tomorrow" and matched neither today nor yesterday.
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)

    # Streak only counts if user studied today or yesterday
    if not sorted_dates or (sorted_dates[0] != today and sorted_dates[0] != yesterday):
        return {
            "streak_days": 0,
            "last_active_date": sorted_dates[0].isoformat() if sorted_dates else None,
            "has_streak": False,
        }

    streak = 1
    current_pivot = sorted_dates[0]
    for d in sorted_dates[1:]:
        if d == current_pivot - timedelta(days=1):
            streak += 1
            current_pivot = d
        else:
            break

    return {
        "streak_days": streak,
        "last_active_date": sorted_dates[0].isoformat(),
        "has_streak": streak > 0,
    }


@router.get("/mastery/{material_id}")
async def get_deck_mastery(
    material_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    m = _owned_material_or_404(db, material_id, user)

    parsed_cards = []
    try:
        parsed_cards = json.loads(m.content) if isinstance(m.content, str) else m.content
    except Exception:
        parsed_cards = []

    total_cards = len(parsed_cards) if isinstance(parsed_cards, list) else 0

    card_states = (
        db.query(StudyCardState)
        .filter(
            StudyCardState.user_id == user.id,
            StudyCardState.material_id == material_id,
        )
        .all()
    )

    mastered = sum(1 for cs in card_states if cs.state in ("mastered", "known"))
    learning = sum(1 for cs in card_states if cs.state == "learning")
    mastery_pct = round((mastered / max(1, total_cards)) * 100, 1) if total_cards > 0 else 0.0

    return {
        "material_id": material_id,
        "mastered": mastered,
        "learning": learning,
        "total": total_cards,
        "mastery_percentage": mastery_pct,
    }


class CanvasSyncRequest(BaseModel):
    canvas_url: str = Field(..., description="Base URL of the Canvas instance, e.g. https://canvas.instructure.com")
    api_token: str = Field(..., min_length=10, description="Canvas User API token")
    course_ids: Optional[List[int]] = Field(default=None, description="Optional list of course IDs to sync")
    include_completed: bool = Field(default=False, description="Whether to import completed/submitted assignments")


def _clean_canvas_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<(?:br|/p|/li|/tr|/h[1-6])\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
    )
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()


def _format_canvas_rubric(rubric_list: List[Dict[str, Any]]) -> str:
    if not rubric_list or not isinstance(rubric_list, list):
        return ""
    lines = ["| Criterion | Points | Description |", "| --- | --- | --- |"]
    for c in rubric_list:
        if not isinstance(c, dict):
            continue
        crit_desc = (c.get("description") or "").replace("|", "\\|").strip()
        points = str(c.get("points") or "")
        long_desc = (c.get("long_description") or "").replace("\n", " ").replace("|", "\\|").strip()
        lines.append(f"| {crit_desc} | {points} | {long_desc} |")
    return "\n".join(lines)


@router.post("/canvas/sync")
async def sync_canvas_lms(
    body: CanvasSyncRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Native Canvas LMS integration endpoint (canvasapi standard pattern).

    Authenticates with Canvas REST API using user-provided API token, fetches
    active enrolled courses, retrieves assignments with grading rubrics, and
    upserts them into Helpotron's assignment database.
    """
    user: User = get_current_authenticated_user(request, db)

    base_url = body.canvas_url.strip().rstrip("/")
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = f"https://{base_url}"

    try:
        from .ssrf import validate_safe_url, create_ssrf_safe_async_client
        validate_safe_url(base_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid canvas_url: {exc}")

    headers = {
        "Authorization": f"Bearer {body.api_token.strip()}",
        "Accept": "application/json",
        "User-Agent": "Helpotron-CanvasSync/2.7.0",
    }

    async with create_ssrf_safe_async_client(timeout=35.0, headers=headers, follow_redirects=True) as client:
        # 1. Fetch active courses
        courses_url = f"{base_url}/api/v1/courses?enrollment_state=active&per_page=50"
        try:
            resp = await client.get(courses_url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to connect to Canvas LMS: {exc}")

        if resp.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Canvas authentication failed: Invalid or expired API token",
            )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Canvas API returned status {resp.status_code}: {resp.text[:200]}",
            )

        courses_data = resp.json()
        if not isinstance(courses_data, list):
            courses_data = []

        target_courses = []
        for c in courses_data:
            cid = c.get("id")
            if not cid:
                continue
            if body.course_ids and cid not in body.course_ids:
                continue
            cname = c.get("name") or c.get("course_code") or f"Course {cid}"
            target_courses.append({"id": cid, "name": cname})

        synced_assignments = []
        for c in target_courses:
            cid = c["id"]
            assign_url = (
                f"{base_url}/api/v1/courses/{cid}/assignments"
                f"?include[]=rubric&include[]=all_dates&per_page=50"
            )
            try:
                a_resp = await client.get(assign_url)
                if a_resp.status_code != 200:
                    continue
                assignments = a_resp.json()
                if not isinstance(assignments, list):
                    continue
            except Exception:
                continue

            for a in assignments:
                aid = a.get("id")
                if not aid:
                    continue

                has_submitted = bool(a.get("has_submitted_submissions"))
                if not body.include_completed and has_submitted:
                    continue

                canvas_key = f"{cid}:{aid}"
                assignment_row = (
                    db.query(Assignment)
                    .filter_by(user_id=user.id, canvas_id=canvas_key)
                    .first()
                )
                if assignment_row is None:
                    assignment_row = Assignment(
                        user_id=user.id,
                        canvas_id=canvas_key,
                        status="turned_in" if has_submitted else "tracked",
                    )
                    db.add(assignment_row)

                assignment_row.title = str(a.get("name") or "Untitled Assignment").strip()[:512]
                assignment_row.due_date = a.get("due_at")

                raw_desc = a.get("description") or ""
                clean_prompt = _clean_canvas_html(raw_desc)
                if clean_prompt:
                    assignment_row.prompt = clean_prompt
                elif assignment_row.prompt is None:
                    assignment_row.prompt = ""

                progress = dict(assignment_row.progress or {})
                progress["course_name"] = c["name"]
                progress["course_id"] = cid
                progress["source_url"] = a.get("html_url") or f"{base_url}/courses/{cid}/assignments/{aid}"
                progress["synced_from"] = "canvas_api"

                rubric_data = a.get("rubric")
                if rubric_data:
                    progress["rubric"] = _format_canvas_rubric(rubric_data)

                assignment_row.progress = progress

                synced_assignments.append({
                    "id": assignment_row.id,
                    "canvas_id": canvas_key,
                    "title": assignment_row.title,
                    "course": c["name"],
                    "due_date": assignment_row.due_date,
                    "has_rubric": bool(rubric_data),
                })

        db.commit()

        return {
            "status": "ok",
            "courses_synced": len(target_courses),
            "assignments_synced": len(synced_assignments),
            "assignments": synced_assignments,
        }
