import json
from datetime import datetime, timezone
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from .database import get_db, StudyMaterial, User
from .routes_features import get_current_authenticated_user

router = APIRouter(prefix="/api/library", tags=["library"])


def _serialize_material(m: StudyMaterial) -> dict:
    content = m.content
    if m.kind in ("flashcards", "practice_test"):
        try:
            content = json.loads(content)
        except Exception:
            pass
    return {
        "id": m.id,
        "user_id": m.user_id,
        "assignment_id": m.assignment_id,
        "transcript_id": m.transcript_id,
        "kind": m.kind,
        "content": content,
        "model_used": m.model_used,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "saved_at": m.saved_at.isoformat() if m.saved_at else None,
        "shared_with": m.shared_with or [],
    }


@router.get("/materials")
async def get_library_materials(
    request: Request,
    kind: Optional[str] = Query(None),
    saved: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    q = db.query(StudyMaterial).filter(
        or_(
            StudyMaterial.user_id == user.id,
            StudyMaterial.shared_with.contains([user.id]),
        )
    )

    if kind and kind != "all":
        q = q.filter(StudyMaterial.kind == kind)

    if saved is True:
        q = q.filter(StudyMaterial.saved_at.isnot(None))
    elif saved is False:
        q = q.filter(StudyMaterial.saved_at.is_(None))

    total = q.count()
    rows = q.order_by(StudyMaterial.id.desc()).offset(offset).limit(limit).all()

    return {
        "materials": [_serialize_material(m) for m in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/materials/{material_id}/save")
async def save_library_material(
    material_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    m = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    if m.user_id != user.id and user.id not in (m.shared_with or []):
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    m.saved_at = now
    db.commit()
    db.refresh(m)

    return {
        "status": "ok",
        "material_id": m.id,
        "saved_at": m.saved_at.isoformat() if m.saved_at else None,
    }


@router.delete("/materials/{material_id}/unsave")
async def unsave_library_material(
    material_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user: User = get_current_authenticated_user(request, db)
    m = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    if m.user_id != user.id and user.id not in (m.shared_with or []):
        raise HTTPException(status_code=403, detail="Forbidden")

    m.saved_at = None
    db.commit()
    db.refresh(m)

    return {
        "status": "ok",
        "material_id": m.id,
        "saved_at": None,
    }


@router.delete("/materials/{material_id}")
async def delete_library_material(
    material_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Move a library material to the trash.

    This used to `db.delete(m)` outright — one click and the material was gone
    with no way back. It now snapshots the row into the trash first (recoverable
    for the retention window, see server/trash.py) and only then removes it.
    """
    user: User = get_current_authenticated_user(request, db)
    m = db.query(StudyMaterial).filter(StudyMaterial.id == material_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    if m.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only material creator may delete")

    from .trash import move_to_trash
    move_to_trash(
        db,
        user_id=user.id,
        item_type="study_material",
        item_id=m.id,
        title=f"{str(m.kind or 'material').replace('_', ' ').title()} #{m.id}",
        subtitle=(m.content or "")[:120] or None,
        payload={
            "id": m.id,
            "assignment_id": m.assignment_id,
            "transcript_id": m.transcript_id,
            "kind": m.kind,
            "content": m.content,
            "model_used": m.model_used,
            "saved_at": m.saved_at.isoformat() if m.saved_at else None,
            "shared_with": list(m.shared_with or []),
        },
    )
    db.delete(m)
    db.commit()

    return {
        "status": "ok",
        "deleted_id": material_id,
        "trashed": True,
    }
