"""Study groups API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db, User, StudyGroup, GroupMembership, SharedMaterial
from .security import get_current_user
from .study_groups import StudyGroupManager

router = APIRouter(prefix="/api/groups", tags=["study_groups"])


@router.post("/create")
async def create_group(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = await request.json()
    name = data.get("name")
    if not name:
        raise HTTPException(400, "Group name required")
    result = StudyGroupManager.create_group(db, name, user)
    return result


@router.post("/join")
async def join_group(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = await request.json()
    invite_code = data.get("invite_code")
    if not invite_code:
        raise HTTPException(400, "Invite code required")
    result = StudyGroupManager.join_group(db, invite_code, user)
    return result


@router.post("/share")
async def share_material(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = await request.json()
    group_id = data.get("group_id")
    material_id = data.get("material_id")
    if not group_id or not material_id:
        raise HTTPException(400, "group_id and material_id required")
    result = StudyGroupManager.share_material(db, group_id, material_id, user)
    return result


@router.get("/my")
async def get_my_groups(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return StudyGroupManager.get_groups_for_user(db, user)


@router.get("/{group_id}/materials")
async def get_group_materials(
    group_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return StudyGroupManager.get_group_materials(db, group_id, user)
