"""Database layer — SQLAlchemy 2.0, SQLite by default, Supabase-swappable.

Swap to PostgreSQL by setting DATABASE_URL (see .env.example). All access goes
through the session factory here; nothing else constructs connections.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Generator

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, Boolean, UniqueConstraint, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from sqlalchemy.pool import NullPool, QueuePool

try:
    from .config import config
except (ImportError, ValueError):
    from server.config import config


_connect_args = {"check_same_thread": False, "timeout": 30.0} if config.database_url.startswith("sqlite") else {}
engine = create_engine(
    config.database_url,
    connect_args=_connect_args,
    poolclass=NullPool if config.database_url.startswith("sqlite") else QueuePool,
)

# Enable SQLite Write-Ahead Logging (WAL) mode for concurrency
if config.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


def _json_default(v: Any) -> str:
    return json.dumps(v)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    telegram_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    plan: Mapped[str] = mapped_column(String(16), default="none")  # none|basic|pro|elite; "none" = nothing until paid/upgraded (operator 08-26)
    credits: Mapped[float] = mapped_column(Float, default=0.0)
    notifications_paused: Mapped[bool] = mapped_column(default=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    discount_balance: Mapped[float] = mapped_column(Float, default=0.0)
    discount_spillover: Mapped[float] = mapped_column(Float, default=0.0)
    # Operator 08-31: one-time order discount granted by redeeming someone
    # else's referral code — 30% for a new user, 15% for an existing one.
    # Consumed (reset to 0.0) by the next successful payment.
    referral_discount_pct: Mapped[float] = mapped_column(Float, default=0.0)
    password_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    trial_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    preferred_model: Mapped[str] = mapped_column(String(64), default="deepseek-v4.1-flash")
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id", use_alter=True, name="fk_users_org_id"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(32), default="member")  # admin, moderator, member
    stripe_customer_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    subscription_status: Mapped[str] = mapped_column(String(32), default="none")  # none, trialing, active, past_due, canceled
    is_student_verified: Mapped[bool] = mapped_column(default=False)
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    phone_verified: Mapped[bool] = mapped_column(default=False)
    trial_claimed: Mapped[bool] = mapped_column(default=False)
    # Owner 09-06: Free Trial requires a 1-cent payment verification
    # (Stripe checkout when configured, else a manual record the operator
    # approves). Independent of phone_verified (legacy SMS lane).
    payment_verified: Mapped[bool] = mapped_column(default=False)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_cost_multiplier: Mapped[float] = mapped_column(Float, default=1.0)
    monthly_budget_usd: Mapped[float] = mapped_column(Float, default=50.0)
    default_effort_level: Mapped[int] = mapped_column(Integer, default=5)

    assignments = relationship("Assignment", back_populates="user", cascade="all, delete-orphan")
    agent_files = relationship("AgentFile", back_populates="user", cascade="all, delete-orphan")
    transcripts = relationship("Transcript", back_populates="user", cascade="all, delete-orphan")
    materials = relationship("StudyMaterial", back_populates="user", cascade="all, delete-orphan")
    credit_transactions = relationship("CreditTransaction", back_populates="user", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    drafts = relationship("Draft", back_populates="user", cascade="all, delete-orphan")
    referrals = relationship("Referral", foreign_keys="Referral.referrer_id", back_populates="referrer", cascade="all, delete-orphan")
    referred = relationship("Referral", foreign_keys="Referral.referee_id", back_populates="referee", cascade="all, delete-orphan")
    study_sessions = relationship("StudySession", back_populates="user", cascade="all, delete-orphan")
    organization = relationship("Organization", foreign_keys="User.organization_id", back_populates="members")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    """Persistent user session for authentication."""
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    public_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)

    user = relationship("User", back_populates="sessions")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    plan: Mapped[str] = mapped_column(String(32), default="team")  # team, school, district
    seat_count: Mapped[int] = mapped_column(Integer, default=10)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)

    members = relationship("User", foreign_keys="User.organization_id", back_populates="organization")
    admin = relationship("User", foreign_keys="Organization.admin_id")


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    canvas_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    title: Mapped[str] = mapped_column(String(512))
    due_date: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt: Mapped[str] = mapped_column(String)
    file_urls: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="tracked")
    progress: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # Turn-in (08-27): an assignment marked as turned in moves into the
    # assignment history. turned_in_at is the real timestamp of the turn-in;
    # it is reset to NULL when the user undoes the turn-in.
    turned_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    turned_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="assignments")
    transcripts = relationship("Transcript", back_populates="assignment")
    materials = relationship("StudyMaterial", back_populates="assignment")
    drafts = relationship("Draft", back_populates="assignment")


class AgentAction(Base):
    """My Agent action ledger — every executed action with an undo snapshot."""
    __tablename__ = "agent_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    assignment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action_type: Mapped[str] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(String(1024), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    undo_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="done")  # done | undone
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AgentFile(Base):
    """A file uploaded into a user's personal agent (skill / rule / automation /
    personality). Content is stored on disk under uploads/agent_files/ with a
    random hex name; the DB row is the index. (My Agent experience, 08-22.)"""

    __tablename__ = "agent_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(512))
    kind: Mapped[str] = mapped_column(String(32), default="skill")
    disk_name: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user = relationship("User", back_populates="agent_files")


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("assignments.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="upload")
    text: Mapped[str] = mapped_column(String)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user = relationship("User", back_populates="transcripts")
    assignment = relationship("Assignment", back_populates="transcripts")
    materials = relationship("StudyMaterial", back_populates="transcript")


class UserSettingsScope(Base):
    """Per-scope user settings override (BATCH-04).

    Settings resolve through the inheritance chain
    task → assignment → teacher → class → subject → academic → global;
    each scope target stores its own settings_json override. One row per
    (user, scope_type, scope_id) target.
    """

    __tablename__ = "user_settings_scopes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scope_type: Mapped[str] = mapped_column(String(32), default="global", index=True)
    scope_id: Mapped[str] = mapped_column(String(64), default="default", index=True)
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "scope_type", "scope_id", name="uq_user_scope_target"),)


class UserSetting(Base):
    """Scoped user setting key-value record (SoT §5)."""
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    setting_key: Mapped[str] = mapped_column(String(64), index=True)
    setting_value: Mapped[str] = mapped_column(Text)
    scope_type: Mapped[str] = mapped_column(String(32), default="global", index=True)
    scope_id: Mapped[str] = mapped_column(String(64), default="global", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "setting_key", "scope_type", "scope_id", name="uq_user_setting_target"),)



class StudyMaterial(Base):
    __tablename__ = "study_materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("assignments.id"), nullable=True)
    transcript_id: Mapped[int | None] = mapped_column(ForeignKey("transcripts.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(String)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    saved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    shared_with: Mapped[list] = mapped_column(JSON, default=list)  # list of user IDs

    user = relationship("User", back_populates="materials")
    assignment = relationship("Assignment", back_populates="materials")
    transcript = relationship("Transcript", back_populates="materials")
    study_sessions = relationship("StudySession", back_populates="material")


class StudyCardState(Base):
    __tablename__ = "study_card_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("study_materials.id"), index=True)
    card_index: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(16), default="new")  # new/learning/known/mastered (FSRS)
    difficulty: Mapped[str] = mapped_column(String(16), default="medium")  # easy/medium/hard
    due: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    last_practiced: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    __table_args__ = (UniqueConstraint("user_id", "material_id", "card_index", name="uq_study_cards"),)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    delta: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user = relationship("User", back_populates="credit_transactions")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    amount_cents: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    provider_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user = relationship("User", back_populates="payments")


class ModerationItem(Base):
    """Flagged user content awaiting admin review (Control Center → Moderation).

    Replaces the old hardcoded in-memory mock queue (09-01, operator): entries
    are created by server/moderation.py when user text hits a safety rule, and
    resolved through POST /api/admin/moderation/{id}/action.
    """
    __tablename__ = "moderation_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # mod_<hex8>
    content_type: Mapped[str] = mapped_column(String(32))        # user_feedback | data_submission
    content_ref: Mapped[str] = mapped_column(String(64))         # fb_<hex8> / mc_<hex8> (JSONL id)
    user_public_id: Mapped[str] = mapped_column(String(64), default="")
    reason: Mapped[str] = mapped_column(String(255))
    snippet: Mapped[str] = mapped_column(Text, default="")
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | approved | rejected
    flagged_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    admin_notes: Mapped[str] = mapped_column(Text, default="")


class DataSubmission(Base):
    __tablename__ = "data_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    discount_earned: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), index=True)
    threshold: Mapped[float] = mapped_column(Float, default=80.0)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    draft_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    average_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    detector_results: Mapped[list | None] = mapped_column(JSON, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    retries_left: Mapped[int] = mapped_column(Integer, default=5)
    last_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="drafts")
    assignment = relationship("Assignment", back_populates="drafts")


class Referral(Base):
    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    referrer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    referee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    referral_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    referrer = relationship("User", foreign_keys=[referrer_id], back_populates="referrals")
    referee = relationship("User", foreign_keys=[referee_id], back_populates="referred")


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("study_materials.id"), index=True)
    time_spent_minutes: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed_flashcards: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user = relationship("User", back_populates="study_sessions")
    material = relationship("StudyMaterial", back_populates="study_sessions")


class AgentChatThread(Base):
    """User chat threads (operator 08-26): history tabs — users can open a new
    conversation and go back to any old one. Each thread maps to a scoped
    chat key (u{user_id}:{thread_id}); the title derives from the first message."""
    __tablename__ = "agent_chat_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(256), default="New chat")
    pinned: Mapped[bool] = mapped_column(default=False)  # pin chats (operator 08-26)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AgentChatMessage(Base):
    """Persistent agent conversation turns (operator 08-26). The in-memory
    _chat_histories store dies on every restart — that's why the agent forgot
    context after each redeploy. This is the durable copy; the in-memory dict
    stays as a cache seeded from this table."""
    __tablename__ = "agent_chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_key: Mapped[str] = mapped_column(String(64), index=True)  # 'None' = global agent chat, else assignment id
    sender: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class StudyGroup(Base):
    __tablename__ = "study_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id])
    memberships = relationship("GroupMembership", back_populates="group", cascade="all, delete-orphan")
    shared_materials = relationship("SharedMaterial", back_populates="group", cascade="all, delete-orphan")


class GroupMembership(Base):
    __tablename__ = "group_memberships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("study_groups.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    group = relationship("StudyGroup", back_populates="memberships")
    user = relationship("User")


class SharedMaterial(Base):
    __tablename__ = "shared_materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("study_groups.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("study_materials.id"), index=True)
    shared_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    shared_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    group = relationship("StudyGroup", back_populates="shared_materials")
    material = relationship("StudyMaterial")
    shared_by = relationship("User")


class AdminMessage(Base):
    __tablename__ = "admin_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    subject: Mapped[str] = mapped_column(String(256), default="Message to Admin")
    category: Mapped[str] = mapped_column(String(64), default="general")
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="sent")  # sent, read, replied
    admin_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AdminNotice(Base):
    """Admin → user direct notice (operator 08-28): the admin sends a message
    from the Control Center per-user row; the user's client polls unread rows
    and pops the newest one on screen (dismissed → read_at set).

    Mirrors AdminMessage (user → admin) but with the direction reversed:
    recipient is `user_id`, and read tracking is per-recipient, not a reply
    thread.

    broadcast (operator 09-01): a single row with user_id='*' reaches every
    user; per-user read state lives in AdminNoticeRead so one user dismissing
    never silences it for the others.
    """
    __tablename__ = "admin_notices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    subject: Mapped[str] = mapped_column(String(256), default="Message from Admin")
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    broadcast: Mapped[bool] = mapped_column(Boolean, default=False)


class AdminNoticeRead(Base):
    """Per-user read receipts for broadcast admin notices (operator 09-01):
    one row per (broadcast notice, user). Without this, a broadcast row's
    single read_at would mark the announcement read for everyone.
    """
    __tablename__ = "admin_notice_reads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    notice_id: Mapped[int] = mapped_column(Integer, index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ExtensionRelease(Base):
    """Remembered extension release announcement (operator 09-03): rows are
    auto-synced from extension/manifest.json so EVERY version bump is
    recorded and every user gets a What's-new notification; an admin can
    annotate any row with human release notes."""
    __tablename__ = "extension_releases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(256), default="Helpotron Extension")
    notes: Mapped[str] = mapped_column(Text, default="")
    is_major: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ExtensionReleaseRead(Base):
    """Per-user read receipts for extension release notifications (mirrors
    AdminNoticeRead): one row per (release, user) — acking is per-user, never
    global, so one user dismissing never silences the notice for others."""
    __tablename__ = "extension_release_reads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    release_id: Mapped[int] = mapped_column(Integer, index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PasswordReset(Base):
    """Password recovery requests (operator 08-28): one row per request.

    code_hash is the SHA-256 of the 6-digit code (never stored in plaintext);
    token is an opaque url-safe string that acts as the same capability for
    link-based UX ("recovery-code link"). Rows are single-use and expire after
    30 minutes; verify failures increment attempts (5 max → row invalidated).
    """
    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    public_id: Mapped[str] = mapped_column(String(64), index=True)
    method: Mapped[str] = mapped_column(String(16))  # email | phone | dev
    code_hash: Mapped[str] = mapped_column(String(64))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | used | expired | invalidated
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[str | None] = mapped_column(String(32), nullable=True)  # user | admin


class ApiUsageLog(Base):
    """Detailed ledger for all API calls (LLMs, Audio Transcription, Vision, Detectors)."""
    __tablename__ = "api_usage_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    public_id: Mapped[str] = mapped_column(String(64), index=True)
    tool_or_model: Mapped[str] = mapped_column(String(128), index=True)
    category: Mapped[str] = mapped_column(String(64), default="llm")  # llm, transcription, vision, detector, subagent
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    base_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    user_multiplier: Mapped[float] = mapped_column(Float, default=1.0)
    charged_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)


class UniversalDumpItem(Base):
    """Stores raw dumped files (PDF, audio, image, video, text) and Overlord assignment routing state."""
    __tablename__ = "universal_dump_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(512))
    file_type: Mapped[str] = mapped_column(String(64))  # document, audio, video, image, text
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(64), default="pending_analysis")  # pending_analysis, processing, matched, unmatched, manual_routed, finalized
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    matched_assignment_id: Mapped[int | None] = mapped_column(ForeignKey("assignments.id"), nullable=True, index=True)
    auto_match_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    requested_action: Mapped[str | None] = mapped_column(String(32), nullable=True)  # flashcards, practice_quiz, study_guide, summary, do_it
    overlord_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User")
    matched_assignment = relationship("Assignment")


class ClaimedTrialPhone(Base):
    """Tracks normalized phone numbers that have claimed the 1-time free trial to prevent multi-account abuse."""
    __tablename__ = "claimed_trial_phones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    phone_masked: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    claimed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)


def get_db() -> Generator[Any, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(engine)
    if config.database_url.startswith("sqlite"):
        # Safe migration for missing columns on existing tables
        with engine.connect() as conn:
            from sqlalchemy import text
            try:
                columns_user = [row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
                if "discount_spillover" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN discount_spillover FLOAT DEFAULT 0.0"))
                if "discount_balance" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN discount_balance FLOAT DEFAULT 0.0"))
                if "referral_discount_pct" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN referral_discount_pct FLOAT DEFAULT 0.0"))
                if "password_hash" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(128)"))
                if "password_salt" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN password_salt VARCHAR(64)"))
                if "organization_id" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN organization_id INTEGER"))
                if "role" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(32) DEFAULT 'member'"))
                if "trial_expires_at" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN trial_expires_at DATETIME"))
                if "preferred_model" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN preferred_model VARCHAR(64) DEFAULT 'deepseek-v4.1-flash'"))
                if "stripe_customer_id" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(128)"))
                if "stripe_subscription_id" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(128)"))
                if "subscription_status" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN subscription_status VARCHAR(32) DEFAULT 'none'"))
                if "is_student_verified" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_student_verified BOOLEAN DEFAULT 0"))
                if "phone_number" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN phone_number VARCHAR(32)"))
                if "phone_verified" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT 0"))
                if "trial_claimed" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN trial_claimed BOOLEAN DEFAULT 0"))
                if "payment_verified" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN payment_verified BOOLEAN DEFAULT 0"))
                if "last_active_at" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN last_active_at DATETIME"))
                if "token_cost_multiplier" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN token_cost_multiplier FLOAT DEFAULT 1.0"))
                if "monthly_budget_usd" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN monthly_budget_usd FLOAT DEFAULT 50.0"))
                if "default_effort_level" not in columns_user:
                    conn.execute(text("ALTER TABLE users ADD COLUMN default_effort_level INTEGER DEFAULT 5"))

                columns_materials = [row[1] for row in conn.execute(text("PRAGMA table_info(study_materials)")).fetchall()]
                if "shared_with" not in columns_materials:
                    conn.execute(text("ALTER TABLE study_materials ADD COLUMN shared_with JSON DEFAULT '[]'"))
                if "saved_at" not in columns_materials:
                    conn.execute(text("ALTER TABLE study_materials ADD COLUMN saved_at DATETIME"))

                columns_assignments = [row[1] for row in conn.execute(text("PRAGMA table_info(assignments)")).fetchall()]
                if "turned_in" not in columns_assignments:
                    conn.execute(text("ALTER TABLE assignments ADD COLUMN turned_in BOOLEAN DEFAULT 0"))
                if "turned_in_at" not in columns_assignments:
                    conn.execute(text("ALTER TABLE assignments ADD COLUMN turned_in_at DATETIME"))

                # Operator 08-28: the assignment full-view endpoint reads
                # universal_dump_items (dump provenance); DBs created before the
                # field existed would 500 without this guard.
                columns_dump = [row[1] for row in conn.execute(text("PRAGMA table_info(universal_dump_items)")).fetchall()]
                if columns_dump and "requested_action" not in columns_dump:
                    conn.execute(text("ALTER TABLE universal_dump_items ADD COLUMN requested_action VARCHAR(32)"))

                # Operator 09-01: broadcast admin notices (user_id='*' row).
                # admin_notice_reads is a brand-new table — create_all already
                # made it; only the existing admin_notices table needs the col.
                columns_notices = [row[1] for row in conn.execute(text("PRAGMA table_info(admin_notices)")).fetchall()]
                if columns_notices and "broadcast" not in columns_notices:
                    conn.execute(text("ALTER TABLE admin_notices ADD COLUMN broadcast BOOLEAN DEFAULT 0"))

                conn.commit()
            except Exception:
                pass


