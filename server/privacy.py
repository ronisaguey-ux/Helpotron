"""Privacy / GDPR Article 17 erasure (remediation BATCH-09).

Plan section: `delete_user_account_and_data` — a single authenticated
endpoint that wipes every row referencing the user (assignments,
transcripts, materials, credit ledger, payments, drafts, referrals,
study sessions/groups/memberships, shared materials, API usage logs,
dump items, sessions) and then the user row itself.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .database import (
    ApiUsageLog,
    Assignment,
    CreditTransaction,
    DataSubmission,
    Draft,
    GroupMembership,
    Payment,
    Referral,
    SharedMaterial,
    StudyGroup,
    StudyMaterial,
    StudySession,
    Transcript,
    UniversalDumpItem,
    User,
    UserSession,
    get_db,
)
from .security import get_current_user

logger = logging.getLogger("helpotron.privacy")

router = APIRouter(tags=["privacy"])

# Every table that carries user ownership, in dependency order.
_CHILD_TABLES: List[type] = [
    GroupMembership,
    SharedMaterial,
    StudySession,
    StudyGroup,
    Referral,
    Draft,
    Payment,
    CreditTransaction,
    DataSubmission,
    StudyMaterial,
    Transcript,
    Assignment,
    ApiUsageLog,
    UniversalDumpItem,
    UserSession,
]


def delete_user_account_and_data(
    current_user: User,
    db: Session,
) -> Dict[str, Any]:
    """Erasure (GDPR Art. 17): delete all of the user's data, then the user.

    Runs as one transaction — if any step fails the whole erasure rolls
    back rather than leaving a half-deleted account.
    """
    user_id = current_user.id
    public_id = current_user.public_id
    counts: Dict[str, int] = {}

    for model in _CHILD_TABLES:
        q = db.query(model)
        if model is Referral:
            deleted = q.filter(
                (Referral.referrer_id == user_id) | (Referral.referee_id == user_id)
            ).delete(synchronize_session=False)
        elif model is SharedMaterial:
            deleted = q.filter(SharedMaterial.shared_by_id == user_id).delete(synchronize_session=False)
        elif model is StudyGroup:
            deleted = q.filter(StudyGroup.created_by_id == user_id).delete(synchronize_session=False)
        else:
            deleted = q.filter(model.user_id == user_id).delete(synchronize_session=False)
        counts[model.__tablename__] = deleted

    deleted_user = db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.commit()
    logger.info(
        "Erasure complete for user %s (%s): %s",
        user_id, public_id, {k: v for k, v in counts.items() if v},
    )
    return {"status": "deleted", "public_id": public_id, "rows_deleted": counts}


@router.delete("/user/account")
@router.delete("/api/user/account")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authenticated endpoint to delete user account and wipe all personal data."""
    return delete_user_account_and_data(current_user, db)
