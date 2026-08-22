"""Study groups collaboration features."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import HTTPException

from .database import User, StudyMaterial


class StudyGroupManager:
    @staticmethod
    def create_group(db: Session, name: str, created_by: User) -> dict:
        """Create a new study group."""
        from .database import StudyGroup
        group = StudyGroup(
            name=name,
            created_by_id=created_by.id,
            invite_code=secrets.token_urlsafe(8),
            settings={"allow_material_sharing": True, "allow_editing": False}
        )
        db.add(group)
        db.commit()
        db.refresh(group)
        return {"id": group.id, "name": group.name, "invite_code": group.invite_code}

    @staticmethod
    def join_group(db: Session, invite_code: str, user: User) -> dict:
        from .database import StudyGroup, GroupMembership
        group = db.query(StudyGroup).filter(StudyGroup.invite_code == invite_code).first()
        if not group:
            raise HTTPException(404, "Group not found")
        existing = db.query(GroupMembership).filter(
            GroupMembership.group_id == group.id,
            GroupMembership.user_id == user.id
        ).first()
        if existing:
            raise HTTPException(400, "Already in group")
        membership = GroupMembership(group_id=group.id, user_id=user.id)
        db.add(membership)
        db.commit()
        return {"group_id": group.id, "name": group.name}

    @staticmethod
    def share_material(db: Session, group_id: int, material_id: int, user: User) -> dict:
        from .database import StudyGroup, GroupMembership, SharedMaterial
        group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
        if not group:
            raise HTTPException(404, "Group not found")
        # Check if user is in group
        membership = db.query(GroupMembership).filter(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user.id
        ).first()
        if not membership:
            raise HTTPException(403, "Not a member of this group")
        material = db.query(StudyMaterial).filter(
            StudyMaterial.id == material_id,
            StudyMaterial.user_id == user.id
        ).first()
        if not material:
            raise HTTPException(404, "Material not found")
        shared = SharedMaterial(
            group_id=group_id,
            material_id=material_id,
            shared_by_id=user.id
        )
        db.add(shared)
        db.commit()
        return {"status": "shared", "material_id": material_id}

    @staticmethod
    def get_group_materials(db: Session, group_id: int, user: User) -> list:
        from .database import GroupMembership, StudyGroup, SharedMaterial, StudyMaterial
        group = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
        if not group:
            raise HTTPException(404, "Group not found")
        membership = db.query(GroupMembership).filter(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user.id
        ).first()
        if not membership:
            raise HTTPException(403, "Not a member")
        shared = db.query(SharedMaterial).filter(SharedMaterial.group_id == group_id).all()
        material_ids = [s.material_id for s in shared]
        materials = db.query(StudyMaterial).filter(StudyMaterial.id.in_(material_ids)).all()
        return [{"id": m.id, "kind": m.kind, "created_at": m.created_at.isoformat()} for m in materials]

    @staticmethod
    def get_groups_for_user(db: Session, user: User) -> list:
        from .database import StudyGroup, GroupMembership
        memberships = db.query(GroupMembership).filter(GroupMembership.user_id == user.id).all()
        group_ids = [m.group_id for m in memberships]
        if not group_ids:
            return []
        groups = db.query(StudyGroup).filter(StudyGroup.id.in_(group_ids)).all()
        return [{"id": g.id, "name": g.name, "invite_code": g.invite_code} for g in groups]
