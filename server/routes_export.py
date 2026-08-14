"""Export API routes for study materials."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .database import get_db, User, StudyMaterial
from .security import SessionStore, SESSION_COOKIE_NAME
from .export import (
    export_flashcards_quizlet,
    export_flashcards_anki,
    export_practice_test_json,
    export_study_guide_markdown,
    export_summary_text,
)

router = APIRouter(prefix="/api/export", tags=["export"])


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Not authenticated")
    session = SessionStore.get_session(token)
    if not session:
        raise HTTPException(401, "Invalid session")
    user = db.query(User).filter(User.id == session["user_id"]).first()
    if not user:
        raise HTTPException(401, "User not found")
    return user


@router.get("/flashcards/{material_id}/quizlet")
async def export_quizlet(
    material_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    material = db.query(StudyMaterial).filter(
        StudyMaterial.id == material_id,
        StudyMaterial.user_id == user.id,
        StudyMaterial.kind == "flashcards"
    ).first()
    if not material:
        raise HTTPException(404, "Flashcards not found")
    import json
    flashcards = json.loads(material.content)
    csv_data = export_flashcards_quizlet(flashcards)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=flashcards_{material_id}.csv"}
    )


@router.get("/flashcards/{material_id}/anki")
async def export_anki(
    material_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    material = db.query(StudyMaterial).filter(
        StudyMaterial.id == material_id,
        StudyMaterial.user_id == user.id,
        StudyMaterial.kind == "flashcards"
    ).first()
    if not material:
        raise HTTPException(404, "Flashcards not found")
    import json
    flashcards = json.loads(material.content)
    csv_data = export_flashcards_anki(flashcards)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=flashcards_{material_id}_anki.csv"}
    )


@router.get("/practice-test/{material_id}/json")
async def export_practice_test(
    material_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    material = db.query(StudyMaterial).filter(
        StudyMaterial.id == material_id,
        StudyMaterial.user_id == user.id,
        StudyMaterial.kind == "practice_test"
    ).first()
    if not material:
        raise HTTPException(404, "Practice test not found")
    import json
    practice_test = json.loads(material.content)
    json_data = export_practice_test_json(practice_test)
    return Response(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=practice_test_{material_id}.json"}
    )


@router.get("/study-guide/{material_id}/markdown")
async def export_study_guide(
    material_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    material = db.query(StudyMaterial).filter(
        StudyMaterial.id == material_id,
        StudyMaterial.user_id == user.id,
        StudyMaterial.kind == "study_guide"
    ).first()
    if not material:
        raise HTTPException(404, "Study guide not found")
    content = export_study_guide_markdown(material.content)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=study_guide_{material_id}.md"}
    )


@router.get("/summary/{material_id}/txt")
async def export_summary(
    material_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    material = db.query(StudyMaterial).filter(
        StudyMaterial.id == material_id,
        StudyMaterial.user_id == user.id,
        StudyMaterial.kind == "summary"
    ).first()
    if not material:
        raise HTTPException(404, "Summary not found")
    content = export_summary_text(material.content)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=summary_{material_id}.txt"}
    )
