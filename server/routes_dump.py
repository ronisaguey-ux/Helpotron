"""FastAPI routes for Universal Assignment Dump and Overlord AI Routing."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .assignment_dump import assignment_dump_manager
from .database import Assignment, UniversalDumpItem, User, get_db
from .routes_features import get_current_authenticated_user

router = APIRouter(prefix="/api/dump", tags=["assignment_dump"])


class ManualRoutePayload(BaseModel):
    assignment_id: Optional[int] = None
    create_new: bool = False
    new_assignment_title: Optional[str] = None
    new_assignment_subject: Optional[str] = None


@router.post("/upload")
async def upload_dump_file(
    file: UploadFile = File(...),
    assignment_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Universal upload endpoint for any file (PDF, DOCX, TXT, Audio, Video, Image).

    Extracts content via Gemini 3.1 Flash-Lite (Audio) / Gemini 3.7 Flash (Vision/OCR),
    and uses the Overlord AI to automatically route to the correct assignment.
    """
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    dump_item = await assignment_dump_manager.process_dump_upload(
        db=db,
        user=current_user,
        filename=file.filename or "uploaded_file.bin",
        content=content,
        manual_assignment_id=assignment_id,
    )

    return {
        "status": "success",
        "dump_id": dump_item.id,
        "file_name": dump_item.file_name,
        "file_type": dump_item.file_type,
        "item_status": dump_item.status,
        "auto_match_confidence": dump_item.auto_match_confidence,
        "matched_assignment_id": dump_item.matched_assignment_id,
        "overlord_notes": dump_item.overlord_notes,
        "snippet": (dump_item.extracted_text or "")[:250],
    }


@router.get("/list")
async def list_dump_items(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Retrieves all universal dumped items for user with Overlord assignment match details."""
    query = db.query(UniversalDumpItem).filter(UniversalDumpItem.user_id == current_user.id)
    if status:
        query = query.filter(UniversalDumpItem.status == status)

    items = query.order_by(UniversalDumpItem.created_at.desc()).limit(limit).all()

    result = []
    for item in items:
        matched_title = None
        if item.matched_assignment_id:
            assign = db.query(Assignment).filter(Assignment.id == item.matched_assignment_id).first()
            if assign:
                matched_title = assign.title

        result.append({
            "id": item.id,
            "file_name": item.file_name,
            "file_type": item.file_type,
            "file_size_bytes": item.file_size_bytes,
            "status": item.status,
            "extracted_text": item.extracted_text,
            "matched_assignment_id": item.matched_assignment_id,
            "matched_assignment_title": matched_title,
            "auto_match_confidence": item.auto_match_confidence,
            "overlord_notes": item.overlord_notes,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        })

    return {
        "status": "success",
        "count": len(result),
        "items": result,
    }


@router.post("/{dump_id}/route")
async def manual_route_dump_item(
    dump_id: int,
    payload: ManualRoutePayload,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Manual override for assignment routing (auth + ownership enforced — BATCH-04 IDOR)."""
    item = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dump item not found.")
    if item.user_id != current_user.id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Cannot route dump items owned by another user")

    if payload.create_new:
        title = payload.new_assignment_title or f"Assignment from {item.file_name}"
        new_assign = Assignment(
            user_id=item.user_id,
            title=title,
            prompt=item.extracted_text or f"Generated from dumped file {item.file_name}",
            status="tracked",
            progress={"created_from_dump": True, "dump_file_id": item.id},
        )
        db.add(new_assign)
        db.commit()
        db.refresh(new_assign)

        item.matched_assignment_id = new_assign.id
        item.auto_match_confidence = 1.0
        item.status = "manual_routed"
        item.overlord_notes = f"Manually created and routed to new assignment '{new_assign.title}'."
    elif payload.assignment_id:
        item.matched_assignment_id = payload.assignment_id
        item.auto_match_confidence = 1.0
        item.status = "manual_routed"
        item.overlord_notes = "Manually assigned to existing assignment."
    else:
        raise HTTPException(status_code=400, detail="Must provide assignment_id or create_new=True")

    db.commit()
    db.refresh(item)
    return {"status": "success", "item_id": item.id, "matched_assignment_id": item.matched_assignment_id}


@router.delete("/{dump_id}")
async def delete_dump_item(
    dump_id: int,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Deletes a dump item (auth + ownership enforced — remediation BATCH-04 IDOR)."""
    item = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dump item not found.")
    if item.user_id != current_user.id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Cannot delete dump items owned by another user")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": f"Dump item {dump_id} deleted."}


# ── Remediation BATCH-04: IDOR-guarded single-item dump access ──────────────
@router.get("/{dump_id}")
def get_assignment_dump(
    dump_id: int,
    current_user: User = Depends(get_current_authenticated_user),
    db: Session = Depends(get_db),
):
    """Returns one dump item with a strict IDOR ownership check."""
    dump = db.query(UniversalDumpItem).filter(UniversalDumpItem.id == dump_id).first()
    if not dump:
        raise HTTPException(status_code=404, detail="Dump record not found")
    if dump.user_id != current_user.id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Cannot access dump items owned by another user")
    return {
        "id": dump.id,
        "file_name": dump.file_name,
        "file_type": dump.file_type,
        "file_size_bytes": dump.file_size_bytes,
        "status": dump.status,
        "extracted_text": dump.extracted_text,
        "matched_assignment_id": dump.matched_assignment_id,
        "auto_match_confidence": dump.auto_match_confidence,
        "overlord_notes": dump.overlord_notes,
        "created_at": dump.created_at.isoformat() if dump.created_at else None,
    }
