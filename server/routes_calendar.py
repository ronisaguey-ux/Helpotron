"""Calendar — the user's own deadlines, reminders and notes (owner 2026-09-19).

Owner: *"the academic deadline callender doesn't even work, u cant click on any
date, or add stuff to dates ... a callender where u can have agents remind u of
certain stuff on telegram, dates to start an assignment, etc, just have a text box
with title and description per day, and just have the user describe in plain text
what they want, agents will deal with it"*.

The old calendar was READ-ONLY: it plotted assignment due dates and nothing else,
so no date could be clicked and nothing could be added.

Design rule, and it is the whole point: **this API stores plain language.** A row
is a date, a title and a description. There is no event type, no priority, no
recurrence rule, no reminder schedule — the agent reads the description and
decides what to do with it. Adding structure here would create a second, worse
way to express the same intent, and it would stop the user writing what they
actually mean ("start the essay two days early", "nag me if I haven't begun").

Routes (mounted under /api/calendar):
    GET    /entries?start=&end=   list, optionally bounded by date
    GET    /upcoming?days=N       what's coming (the agent's view)
    POST   /entries               create
    PATCH  /entries/{id}          edit title/description/date/remind
    DELETE /entries/{id}          remove
    POST   /entries/{id}/reminded mark a reminder as delivered
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import CalendarEntry, get_db
from .routes_features import get_current_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

_DATE_FMT = "%Y-%m-%d"


class CalendarEntryIn(BaseModel):
    # The description is deliberately unbounded-ish free text: it is what the
    # agent reads and acts on, so capping it tightly would defeat the design.
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=4000)
    entry_date: str = Field(..., description="YYYY-MM-DD")
    remind: bool = True


class CalendarEntryPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=4000)
    entry_date: Optional[str] = None
    remind: Optional[bool] = None


def _valid_date(value: str) -> str:
    """Normalise and validate a YYYY-MM-DD date string.

    Rejects impossible calendar dates (2026-13-45) rather than letting `date`
    roll them over into a different day — a silently-shifted deadline is worse
    than a visible error.
    """
    try:
        parsed = datetime.strptime((value or "").strip(), _DATE_FMT).date()
    except (ValueError, TypeError):
        raise HTTPException(400, "Dates must be in YYYY-MM-DD format.")
    return parsed.strftime(_DATE_FMT)


def _serialize(e: CalendarEntry) -> Dict[str, Any]:
    return {
        "id": e.id,
        "entry_date": e.entry_date,
        "title": e.title,
        "description": e.description or "",
        "remind": bool(e.remind),
        "reminded_at": e.reminded_at.isoformat() if e.reminded_at else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def _owned(db: Session, user, entry_id: int) -> CalendarEntry:
    entry = (
        db.query(CalendarEntry)
        .filter(CalendarEntry.id == entry_id, CalendarEntry.user_id == user.id)
        .first()
    )
    if not entry:
        raise HTTPException(404, "Calendar entry not found")
    return entry


@router.get("/entries")
def list_entries(
    request: Request,
    start: Optional[str] = Query(None, description="YYYY-MM-DD (inclusive)"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD (inclusive)"),
    db: Session = Depends(get_db),
):
    user = get_current_authenticated_user(request, db)
    q = db.query(CalendarEntry).filter(CalendarEntry.user_id == user.id)
    # Dates are stored as zero-padded YYYY-MM-DD, so lexicographic comparison is
    # chronological — no casting, and the index on entry_date still applies.
    if start:
        q = q.filter(CalendarEntry.entry_date >= _valid_date(start))
    if end:
        q = q.filter(CalendarEntry.entry_date <= _valid_date(end))
    rows = q.order_by(CalendarEntry.entry_date.asc(), CalendarEntry.id.asc()).all()
    return {"status": "success", "entries": [_serialize(e) for e in rows]}


@router.get("/upcoming")
def upcoming_entries(
    request: Request,
    days: int = Query(14, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """What is coming up — the view an agent uses to decide what to remind about.

    Only entries flagged `remind`, from today onward, that have not already been
    marked delivered. Past entries are excluded deliberately: an agent that
    announces last week's deadline is noise, not a reminder.
    """
    user = get_current_authenticated_user(request, db)
    today = date.today()
    horizon = (today + timedelta(days=days)).strftime(_DATE_FMT)
    rows = (
        db.query(CalendarEntry)
        .filter(
            CalendarEntry.user_id == user.id,
            CalendarEntry.remind.is_(True),
            CalendarEntry.reminded_at.is_(None),
            CalendarEntry.entry_date >= today.strftime(_DATE_FMT),
            CalendarEntry.entry_date <= horizon,
        )
        .order_by(CalendarEntry.entry_date.asc())
        .all()
    )
    return {
        "status": "success",
        "today": today.strftime(_DATE_FMT),
        "days": days,
        "entries": [_serialize(e) for e in rows],
    }


@router.post("/entries")
def create_entry(
    payload: CalendarEntryIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = get_current_authenticated_user(request, db)
    entry = CalendarEntry(
        user_id=user.id,
        entry_date=_valid_date(payload.entry_date),
        title=payload.title.strip(),
        description=(payload.description or "").strip(),
        remind=bool(payload.remind),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"status": "success", "entry": _serialize(entry)}


@router.patch("/entries/{entry_id}")
def update_entry(
    entry_id: int,
    payload: CalendarEntryPatch,
    request: Request,
    db: Session = Depends(get_db),
):
    user = get_current_authenticated_user(request, db)
    entry = _owned(db, user, entry_id)

    if payload.title is not None:
        entry.title = payload.title.strip()
    if payload.description is not None:
        entry.description = payload.description.strip()
    if payload.entry_date is not None:
        entry.entry_date = _valid_date(payload.entry_date)
        # Moving a note to a new date makes it pending again — otherwise a
        # delivered reminder would never fire at its new time.
        entry.reminded_at = None
    if payload.remind is not None:
        entry.remind = bool(payload.remind)
        if entry.remind and entry.reminded_at:
            entry.reminded_at = None

    db.commit()
    db.refresh(entry)
    return {"status": "success", "entry": _serialize(entry)}


@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user = get_current_authenticated_user(request, db)
    entry = _owned(db, user, entry_id)
    db.delete(entry)
    db.commit()
    return {"status": "success", "deleted": entry_id}


@router.post("/entries/{entry_id}/reminded")
def mark_reminded(
    entry_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Record that the reminder for this entry has been delivered.

    Called after a real Telegram send succeeds, so one note is announced once.
    """
    user = get_current_authenticated_user(request, db)
    entry = _owned(db, user, entry_id)
    entry.reminded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(entry)
    return {"status": "success", "entry": _serialize(entry)}
