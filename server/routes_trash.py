"""Trash API — list, restore, purge, and bulk variants.

Every delete in the product should move something here rather than destroying it
outright. The retention window and the restore mechanisms live in server/trash.py;
this module is only the HTTP surface.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import TrashItem, get_db
from .trash import RETENTION_DAYS, purge_expired, restore, serialize

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trash", tags=["trash"])


def _get_current_user(request: Request, db: Session):
    # Imported lazily to avoid a circular import at module load (main imports
    # every router, and the auth helper lives with the user routes).
    from .routes_overlord import _get_current_user as _resolve
    return _resolve(request, db)


@router.get("")
async def list_trash(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Everything in this user's trash, newest first, plus the retention rule so
    the UI does not hardcode it."""
    user = _get_current_user(request, db)
    purged = purge_expired(db)
    rows = (
        db.query(TrashItem)
        .filter(TrashItem.user_id == user.id)
        .order_by(TrashItem.deleted_at.desc())
        .all()
    )
    return {
        "status": "success",
        "retention_days": RETENTION_DAYS,
        "purged_now": purged,
        "count": len(rows),
        "items": [serialize(r) for r in rows],
    }


@router.post("/{trash_id}/restore")
async def restore_one(trash_id: int, request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = _get_current_user(request, db)
    entry = (
        db.query(TrashItem)
        .filter(TrashItem.id == trash_id, TrashItem.user_id == user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Not in trash")
    ok, msg = restore(db, entry, user.id)
    if not ok:
        raise HTTPException(status_code=409, detail=msg)
    return {"status": "success", "message": msg, "id": trash_id}


@router.post("/restore-all")
async def restore_all(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Restore everything restorable. A kind with no handler is reported, not
    counted as a success — a bulk action that claims to have restored something
    it could not would leave the user believing their data is back."""
    user = _get_current_user(request, db)
    purge_expired(db)
    rows = db.query(TrashItem).filter(TrashItem.user_id == user.id).all()
    restored: List[int] = []
    failed: List[Dict[str, Any]] = []
    for entry in rows:
        ok, msg = restore(db, entry, user.id)
        if ok:
            restored.append(entry.id)
        else:
            failed.append({"id": entry.id, "title": entry.title, "reason": msg})
    return {
        "status": "success",
        "restored": len(restored),
        "failed": failed,
    }


@router.delete("/{trash_id}")
async def purge_one(trash_id: int, request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Delete permanently, now — no undo."""
    user = _get_current_user(request, db)
    entry = (
        db.query(TrashItem)
        .filter(TrashItem.id == trash_id, TrashItem.user_id == user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Not in trash")
    db.delete(entry)
    db.commit()
    return {"status": "success", "id": trash_id}


@router.delete("")
async def empty_trash(request: Request, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Delete everything in the trash permanently, now."""
    user = _get_current_user(request, db)
    rows = db.query(TrashItem).filter(TrashItem.user_id == user.id).all()
    count = len(rows)
    for entry in rows:
        db.delete(entry)
    db.commit()
    return {"status": "success", "deleted": count}
