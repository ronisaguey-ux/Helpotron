"""Database layer — SQLAlchemy 2.0, SQLite by default, Supabase-swappable.

Swap to PostgreSQL by setting DATABASE_URL (see .env.example). All access goes
through the session factory here; nothing else constructs connections.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Generator

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, Boolean, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import config

_connect_args = {"check_same_thread": False} if config.database_url.startswith("sqlite") else {}
engine = create_engine(config.database_url, connect_args=_connect_args)

# Enable SQLite Write-Ahead Logging (WAL) mode for concurrency
if config.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
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
    plan: Mapped[str] = mapped_column(String(16), default="basic")
    credits: Mapped[float] = mapped_column(Float, default=0.0)
    notifications_paused: Mapped[bool] = mapped_column(default=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    discount_balance: Mapped[float] = mapped_column(Float, default=0.0)
    discount_spillover: Mapped[float] = mapped_column(Float, default=0.0)
    password_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    password_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    trial_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    preferred_model: Mapped[str] = mapped_column(String(64), default="deepseek-flash")
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(32), default="member")  # admin, moderator, member

    assignments = relationship("Assignment", back_populates="user", cascade="all, delete-orphan")
    transcripts = relationship("Transcript", back_populates="user", cascade="all, delete-orphan")
    materials = relationship("StudyMaterial", back_populates="user", cascade="all, delete-orphan")
    credit_transactions = relationship("CreditTransaction", back_populates="user", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="user", cascade="all, delete-orphan")
    drafts = relationship("Draft", back_populates="user", cascade="all, delete-orphan")
    referrals = relationship("Referral", foreign_keys="Referral.referrer_id", back_populates="referrer", cascade="all, delete-orphan")
    referred = relationship("Referral", foreign_keys="Referral.referee_id", back_populates="referee", cascade="all, delete-orphan")
    study_sessions = relationship("StudySession", back_populates="user", cascade="all, delete-orphan")
    organization = relationship("Organization", foreign_keys="User.organization_id", back_populates="members")


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

    user = relationship("User", back_populates="assignments")
    transcripts = relationship("Transcript", back_populates="assignment")
    materials = relationship("StudyMaterial", back_populates="assignment")
    drafts = relationship("Draft", back_populates="assignment")


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
    shared_with: Mapped[list] = mapped_column(JSON, default=list)  # list of user IDs

    user = relationship("User", back_populates="materials")
    assignment = relationship("Assignment", back_populates="materials")
    transcript = relationship("Transcript", back_populates="materials")
    study_sessions = relationship("StudySession", back_populates="material")


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
    referral_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
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
                    conn.execute(text("ALTER TABLE users ADD COLUMN preferred_model VARCHAR(64) DEFAULT 'deepseek-flash'"))

                columns_materials = [row[1] for row in conn.execute(text("PRAGMA table_info(study_materials)")).fetchall()]
                if "shared_with" not in columns_materials:
                    conn.execute(text("ALTER TABLE study_materials ADD COLUMN shared_with JSON DEFAULT '[]'"))

                conn.commit()
            except Exception:
                pass


