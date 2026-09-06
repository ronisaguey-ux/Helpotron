"""Notifications API routes (Stitch v6 / 3.1.7 - 3.1.8).

Derived feed without unnecessary separate tables:
- Draft-ready notifications (Draft rows)
- Agent action events (AgentAction completed events)
- Direct & Broadcast AdminNotice rows
"""
from __future__ import annotations

import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .database import (
    get_db,
    User,
    Draft,
    AgentAction,
    AdminNotice,
    AdminNoticeRead,
)
from .security import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class ReadNotificationsRequest(BaseModel):
    ids: List[str] = []


@router.get("")
async def get_notifications(
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Returns derived notification feed for the current user."""
    items: List[Dict[str, Any]] = []

    # 1. Admin Notices (direct to user or broadcast)
    direct_notices = (
        db.query(AdminNotice)
        .filter(AdminNotice.user_id == user.public_id, AdminNotice.broadcast == False)
        .order_by(desc(AdminNotice.created_at))
        .limit(limit)
        .all()
    )
    for n in direct_notices:
        items.append({
            "id": f"notice_{n.id}",
            "raw_id": n.id,
            "type": "notice",
            "title": n.subject or "Admin Notice",
            "message": n.message,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "read": n.read_at is not None,
            "priority": "high",
            "source": "admin",
        })

    # Broadcast notices
    broadcast_notices = (
        db.query(AdminNotice)
        .filter(AdminNotice.broadcast == True)
        .order_by(desc(AdminNotice.created_at))
        .limit(limit)
        .all()
    )
    read_notice_ids = set(
        row[0]
        for row in db.query(AdminNoticeRead.notice_id)
        .filter(AdminNoticeRead.user_id == user.public_id)
        .all()
    )
    for n in broadcast_notices:
        items.append({
            "id": f"notice_{n.id}",
            "raw_id": n.id,
            "type": "broadcast",
            "title": n.subject or "Platform Announcement",
            "message": n.message,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "read": n.id in read_notice_ids,
            "priority": "medium",
            "source": "platform",
        })

    # 2. Draft Events
    drafts = (
        db.query(Draft)
        .filter(Draft.user_id == user.id)
        .order_by(desc(Draft.updated_at))
        .limit(limit // 2)
        .all()
    )
    for d in drafts:
        status_label = d.status.title() if d.status else "Pending"
        is_ready = d.status in ("ready", "completed", "done")
        items.append({
            "id": f"draft_{d.id}",
            "raw_id": d.id,
            "type": "draft",
            "title": f"Draft {status_label}",
            "message": f"Draft for assignment #{d.assignment_id} is {d.status} (score: {d.average_score or 'n/a'}).",
            "created_at": (d.updated_at or d.created_at).isoformat() if (d.updated_at or d.created_at) else None,
            "read": False,
            "priority": "medium" if is_ready else "low",
            "link": "history",
            "source": "engine",
        })

    # 3. Agent Completed Actions
    actions = (
        db.query(AgentAction)
        .filter(AgentAction.user_id == user.id, AgentAction.status == "done")
        .order_by(desc(AgentAction.created_at))
        .limit(limit // 2)
        .all()
    )
    for a in actions:
        items.append({
            "id": f"agent_{a.id}",
            "raw_id": a.id,
            "type": "agent",
            "title": f"Agent: {a.action_type.replace('_', ' ').title()}",
            "message": a.summary or f"Agent action {a.action_type} executed successfully.",
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "read": False,
            "priority": "low",
            "link": "agent",
            "source": "agent",
        })

    # Sort all feed items by timestamp descending
    def _parse_ts(it: Dict[str, Any]) -> float:
        ts = it.get("created_at")
        if not ts:
            return 0.0
        try:
            return datetime.datetime.fromisoformat(ts).timestamp()
        except Exception:
            return 0.0

    items.sort(key=_parse_ts, reverse=True)
    unread_count = sum(1 for it in items if not it.get("read"))

    return {
        "notifications": items[:limit],
        "unread_count": unread_count,
        "total": len(items),
    }


@router.post("/read")
async def mark_notifications_read(
    req: ReadNotificationsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Marks specified notifications as read."""
    now = datetime.datetime.now(datetime.timezone.utc)
    read_ids: List[str] = []

    for nid in req.ids:
        if nid.startswith("notice_"):
            try:
                raw_id = int(nid.replace("notice_", ""))
                notice = db.query(AdminNotice).filter(AdminNotice.id == raw_id).first()
                if notice:
                    if notice.broadcast:
                        # Insert AdminNoticeRead if not already present
                        existing = (
                            db.query(AdminNoticeRead)
                            .filter(
                                AdminNoticeRead.notice_id == raw_id,
                                AdminNoticeRead.user_id == user.public_id,
                            )
                            .first()
                        )
                        if not existing:
                            db.add(AdminNoticeRead(notice_id=raw_id, user_id=user.public_id, read_at=now))
                    else:
                        if notice.user_id == user.public_id and not notice.read_at:
                            notice.read_at = now
                    read_ids.append(nid)
            except Exception:
                pass
        else:
            # Derived items (drafts, agent actions) read state tracked client-side
            read_ids.append(nid)

    try:
        db.commit()
    except Exception:
        db.rollback()

    return {"ok": True, "read_ids": read_ids}
