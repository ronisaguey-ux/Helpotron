"""Organization / enterprise API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db, User, Organization
from .security import is_user_banned

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the caller through the SHARED credential pipeline.

    2026-09-18: this module used to carry its own private copy that read the
    session cookie and nothing else, so a Bearer JWT — and every `htk_` API key —
    401'd here while working on every other route. The feature-route helper is the
    single sync resolver for cookies, JWTs, DB session tokens and API keys.
    (`security.get_current_user` is `async`, so it cannot be called from this sync
    dependency — it returns a coroutine and every attribute access 500s.)
    """
    from .routes_features import get_current_authenticated_user

    user = get_current_authenticated_user(request, db)
    if not user:
        raise HTTPException(401, "Invalid session")
    if is_user_banned(user):
        raise HTTPException(403, "Account suspended by the operator")
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

    # Set user's organization without elevating system platform role
    user.organization_id = org.id
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
    # 2026-09-18: this used to return {"status": "invite sent"} while sending
    # nothing and checking nothing — the caller was told an invite went out and
    # no email was ever sent, and no seat or admin check ever ran. An endpoint
    # that reports success for work it did not do is worse than one that is
    # missing: it is indistinguishable from a working feature, so nobody looks.
    # No invite is implemented yet, so say so.
    raise HTTPException(501, "Organization invitations are not implemented yet.")
