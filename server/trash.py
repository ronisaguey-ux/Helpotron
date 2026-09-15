"""Soft-delete / restore — the trash bin behind every delete button.

Deleting a user's own work should be reversible. `move_to_trash()` snapshots the
row into `trash_items` and removes the original; `restore()` rebuilds it from the
snapshot; anything left in the bin past the retention window is purged.

The snapshot is deliberate rather than a `deleted_at` flag on each table: it
needs no schema change per kind of content, survives a restore even after the
original row ids are reused, and keeps the retention rule in ONE place instead
of being reimplemented for every model that grows a delete button.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from .database import TrashItem

# How long a deleted item stays recoverable. Read from one constant so the
# sweep, the API and the UI copy cannot disagree.
RETENTION_DAYS = 10


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def purge_expired(db: Session) -> int:
    """Delete everything past its window. Called on every trash read so the bin
    self-cleans without needing a scheduler to be running."""
    now = _utcnow()
    expired = db.query(TrashItem).filter(TrashItem.expires_at <= now).all()
    for item in expired:
        db.delete(item)
    if expired:
        db.commit()
    return len(expired)


def move_to_trash(
    db: Session,
    user_id: int,
    item_type: str,
    item_id: Optional[int],
    title: str,
    payload: Dict[str, Any],
    subtitle: Optional[str] = None,
) -> TrashItem:
    """Snapshot an item into the trash. Commit is left to the caller so the
    original delete and the snapshot land in one transaction."""
    now = _utcnow()
    entry = TrashItem(
        user_id=user_id,
        item_type=item_type,
        item_id=item_id,
        title=(title or "")[:255],
        subtitle=(subtitle or None),
        payload=payload or {},
        deleted_at=now,
        expires_at=now + timedelta(days=RETENTION_DAYS),
    )
    db.add(entry)
    return entry


def serialize(entry: TrashItem) -> Dict[str, Any]:
    now = _utcnow()
    hours_left = max(0.0, (entry.expires_at - now).total_seconds() / 3600.0)
    # Round UP: an item with 11 hours left has "1 day" left, not 0 — saying
    # "0 days" about something that is still recoverable reads as already gone.
    days_left = int(-(-hours_left // 24)) if hours_left > 0 else 0
    return {
        "id": entry.id,
        "item_type": entry.item_type,
        "item_id": entry.item_id,
        "title": entry.title,
        "subtitle": entry.subtitle,
        "deleted_at": _iso(entry.deleted_at),
        "expires_at": _iso(entry.expires_at),
        "days_left": days_left,
        "hours_left": round(hours_left, 1),
    }


# ── Restore handlers ────────────────────────────────────────────────────────
#
# One function per item_type, each taking the decoded snapshot and rebuilding the
# original row. A type with no handler is restorable-as-data only (the payload is
# still returned, but nothing is re-inserted) — a missing handler must never
# silently claim a successful restore, so the API reports it explicitly.

def _restore_study_material(db: Session, user_id: int, payload: Dict[str, Any]) -> Tuple[bool, str]:
    """Rebuild a StudyMaterial that was removed from the library."""
    from .database import StudyMaterial
    raw_id = payload.get("id")
    existing = db.query(StudyMaterial).filter(
        StudyMaterial.id == raw_id, StudyMaterial.user_id == user_id
    ).first() if raw_id is not None else None
    if existing:
        return True, "already present"
    row = StudyMaterial(
        user_id=user_id,
        assignment_id=payload.get("assignment_id"),
        transcript_id=payload.get("transcript_id"),
        kind=payload.get("kind") or "notes",
        content=payload.get("content") or "",
        model_used=payload.get("model_used"),
        shared_with=payload.get("shared_with") or [],
    )
    if raw_id is not None:
        # Keep the original id so links and study-tool references still resolve.
        row.id = raw_id
    saved_at = payload.get("saved_at")
    if saved_at:
        try:
            row.saved_at = datetime.fromisoformat(str(saved_at))
        except ValueError:
            row.saved_at = None
    db.add(row)
    return True, "restored"


RESTORE_HANDLERS = {
    "study_material": _restore_study_material,
}


def restore(db: Session, entry: TrashItem, user_id: int) -> Tuple[bool, str]:
    """Rebuild one trashed item. Returns (restored, message)."""
    handler = RESTORE_HANDLERS.get(entry.item_type)
    if handler is None:
        return False, f"no restore handler for '{entry.item_type}'"
    try:
        ok, msg = handler(db, user_id, dict(entry.payload or {}))
    except Exception as exc:  # noqa: BLE001 - report, never 500 a restore
        db.rollback()
        return False, f"restore failed: {exc}"
    if not ok:
        return False, msg
    db.delete(entry)
    db.commit()
    return True, msg
