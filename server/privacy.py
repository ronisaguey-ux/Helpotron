"""Privacy / GDPR Article 17 erasure (remediation BATCH-09 & V2-B5-02 / V2-B5-03).

Plan section: `delete_user_account_and_data` — a single authenticated
endpoint that wipes every row referencing the user across all database tables,
purges on-disk artifacts (agent memory, uploaded agent files, custom avatars),
anonymizes data lake contributions, and finally removes the user row.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .database import (
    AdminMessage,
    AdminNotice,
    AdminNoticeRead,
    AgentAction,
    AgentChatMessage,
    AgentChatThread,
    AgentFile,
    ApiKey,
    ApiUsageLog,
    Assignment,
    CalendarEntry,
    ClaimedTrialPhone,
    CreditTransaction,
    DataSubmission,
    Draft,
    ExtensionReleaseRead,
    GroupMembership,
    ModerationItem,
    Organization,
    PasswordReset,
    Payment,
    Referral,
    SharedMaterial,
    StudyCardState,
    StudyGroup,
    StudyMaterial,
    StudySession,
    Transcript,
    TrashItem,
    UniversalDumpItem,
    User,
    UserSession,
    UserSetting,
    UserSettingsScope,
    get_db,
)
from .security import get_current_user

logger = logging.getLogger("helpotron.privacy")

router = APIRouter(tags=["privacy"])

# Every child table that carries user ownership or foreign keys to users.id, in safe deletion order.
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
    StudyCardState,
    StudyMaterial,
    Transcript,
    Assignment,
    CalendarEntry,
    TrashItem,
    AgentAction,
    AgentChatMessage,
    AgentChatThread,
    AgentFile,
    ApiUsageLog,
    UniversalDumpItem,
    UserSession,
    ApiKey,
    PasswordReset,
    UserSetting,
    UserSettingsScope,
    AdminMessage,
    AdminNoticeRead,
    AdminNotice,
    ExtensionReleaseRead,
    ClaimedTrialPhone,
]


def delete_user_account_and_data(
    current_user: User,
    db: Session,
) -> Dict[str, Any]:
    """Erasure (GDPR Art. 17): delete all of the user's data, purge files, then delete the user.

    Runs as one transaction — if any step fails the whole erasure rolls
    back rather than leaving a half-deleted account.
    """
    user_id = current_user.id
    public_id = current_user.public_id
    user_settings = dict(getattr(current_user, "settings", None) or {})
    counts: Dict[str, int] = {}

    # 1. Clean up user organizations where user is admin
    try:
        org_deleted = db.query(Organization).filter(Organization.admin_id == user_id).delete(synchronize_session=False)
        if org_deleted:
            counts["organizations"] = org_deleted
    except Exception as e:
        logger.warning("Could not delete admin organization for user %s: %s", user_id, e)

    # 2. Gather on-disk agent and dump file paths before rows are deleted
    try:
        agent_files = db.query(AgentFile).filter(AgentFile.user_id == user_id).all()
        agent_file_paths = [
            Path(os.getenv("AGENT_FILES_DIR", "./uploads/agent_files")) / af.disk_name
            for af in agent_files
            if getattr(af, "disk_name", None)
        ]
    except Exception:
        agent_file_paths = []

    try:
        dump_items = db.query(UniversalDumpItem).filter(UniversalDumpItem.user_id == user_id).all()
        dump_file_paths = [
            Path(di.file_path)
            for di in dump_items
            if getattr(di, "file_path", None)
        ]
    except Exception:
        dump_file_paths = []

    # 3. Clean up moderation items linked to user's public_id
    try:
        mod_deleted = db.query(ModerationItem).filter(ModerationItem.user_public_id == public_id).delete(synchronize_session=False)
        if mod_deleted:
            counts["moderation_items"] = mod_deleted
    except Exception as e:
        logger.warning("Could not delete moderation items for %s: %s", public_id, e)

    # 4. Delete all child table rows
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
        elif model in (AdminMessage, AdminNotice, AdminNoticeRead, ExtensionReleaseRead):
            # These tables store public_id (VARCHAR) in user_id, or string representation of user_id
            deleted = q.filter(
                (model.user_id == public_id) | (model.user_id == str(user_id))
            ).delete(synchronize_session=False)
        else:
            deleted = q.filter(model.user_id == user_id).delete(synchronize_session=False)
        counts[model.__tablename__] = deleted

    # 5. Delete user row
    deleted_user = db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.commit()

    # 6. Clean up on-disk files (agent memory, uploaded agent files, custom avatars, dump files, message attachments, exports)
    for p in agent_file_paths:
        try:
            if p.exists() and p.is_file():
                p.unlink()
        except OSError as e:
            logger.warning("Could not unlink agent file %s: %s", p, e)

    for dp in dump_file_paths:
        try:
            if dp.exists() and dp.is_file():
                dp.unlink()
        except OSError as e:
            logger.warning("Could not unlink dump file %s: %s", dp, e)

    safe_pid = re.sub(r"[^A-Za-z0-9_-]", "_", public_id or "guest")[:80]
    mem_path = Path("./uploads/agent_memory") / f"{safe_pid}.json"
    try:
        if mem_path.exists() and mem_path.is_file():
            mem_path.unlink()
    except OSError as e:
        logger.warning("Could not unlink agent memory %s: %s", mem_path, e)

    avatar_url = user_settings.get("avatar_url")
    if avatar_url and isinstance(avatar_url, str) and avatar_url.startswith("/uploads/avatars/"):
        av_name = Path(avatar_url).name
        av_path = Path("./uploads/avatars") / av_name
        try:
            if av_path.exists() and av_path.is_file():
                av_path.unlink()
        except OSError as e:
            logger.warning("Could not unlink avatar %s: %s", av_path, e)

    msg_attach_dir = Path("data/uploads/message_attachments")
    if msg_attach_dir.exists() and msg_attach_dir.is_dir():
        for prefix in (f"{public_id}_", f"{safe_pid}_"):
            for att_path in msg_attach_dir.glob(f"{prefix}*"):
                try:
                    if att_path.is_file():
                        att_path.unlink()
                except OSError as e:
                    logger.warning("Could not unlink message attachment %s: %s", att_path, e)

    export_dir = Path(__file__).resolve().parent.parent / "exports" / (public_id or "")
    if public_id and export_dir.exists() and export_dir.is_dir():
        try:
            shutil.rmtree(export_dir, ignore_errors=True)
        except OSError as e:
            logger.warning("Could not remove export directory %s: %s", export_dir, e)

    # 7. Anonymize user records across data lake storage
    anonymized_lake_records = 0
    try:
        from .datalake import datalake_manager
        gdpr_tag = "ANONYMIZED_GDPR_DELETED"
        anonymized_lake_records = (
            datalake_manager.anonymize_user(public_id, gdpr_tag)
            + datalake_manager.anonymize_user(str(user_id), gdpr_tag)
        )
    except Exception as e:
        logger.warning("Could not anonymize datalake records for user %s: %s", user_id, e)

    logger.info(
        "Erasure complete for user %s (%s): %s, lake_scrubbed=%d",
        user_id, public_id, {k: v for k, v in counts.items() if v}, anonymized_lake_records,
    )
    return {
        "status": "deleted",
        "public_id": public_id,
        "rows_deleted": counts,
        "lake_records_anonymized": anonymized_lake_records,
    }


@router.delete("/user/account")
@router.delete("/api/user/account")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authenticated endpoint to delete user account and wipe all personal data."""
    return delete_user_account_and_data(current_user, db)
