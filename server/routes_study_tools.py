import json
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from .database import get_db, StudyMaterial, StudyCardState, StudySession, User
from .routes_features import get_current_authenticated_user
from .fsrs_scheduler import FSRSScheduler
from .analytics import log_study_session

router = APIRouter(prefix="/api/study", tags=["study_tools"])
scheduler = FSRSScheduler()


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

    decks = []
    for m in materials:
        parsed = []
        try:
            parsed = json.loads(m.content) if isinstance(m.content, str) else m.content
        except Exception:
            parsed = []

        total_cards = len(parsed) if isinstance(parsed, list) else 0

        # Query card states for this user and material
        card_states = (
            db.query(StudyCardState)
            .filter(
                StudyCardState.user_id == user.id,
                StudyCardState.material_id == m.id,
            )
            .all()
        )
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
    m = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Deck not found")

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
    m = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Quiz material not found")

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
    today = date.today()
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
    m = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

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
