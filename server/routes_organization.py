"""Organization / enterprise API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db, User, Organization
from .security import SessionStore, SESSION_COOKIE_NAME

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


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


@router.post("/create")
async def create_organization(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = await request.json()
    name = data.get("name")
    plan = data.get("plan", "team")
    seat_count = data.get("seat_count", 10)

    if not name:
        raise HTTPException(400, "Organization name required")

    org = Organization(
        name=name,
        plan=plan,
        seat_count=seat_count,
        admin_id=user.id,
        settings={}
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    # Set user's organization
    user.organization_id = org.id
    user.role = "admin"
    db.commit()

    return {"id": org.id, "name": org.name, "plan": org.plan, "seat_count": org.seat_count}


@router.get("/my")
async def get_my_organization(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not user.organization_id:
        return {"organization": None}
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        return {"organization": None}
    members = db.query(User).filter(User.organization_id == org.id).all()
    return {
        "id": org.id,
        "name": org.name,
        "plan": org.plan,
        "seat_count": org.seat_count,
        "members": [{"public_id": m.public_id, "role": m.role} for m in members],
        "admin_id": org.admin_id
    }


@router.post("/invite")
async def invite_to_organization(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = await request.json()
    email = data.get("email")
    if not email:
        raise HTTPException(400, "Email required")
    # Placeholder: send email with invite link
    return {"status": "invite sent", "email": email}
