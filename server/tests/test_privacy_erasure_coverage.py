"""Assert every model carrying user ownership is in _CHILD_TABLES and cascading deletion succeeds."""
from datetime import datetime, timezone
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from server.database import (
    Base,
    User,
    CalendarEntry,
    TrashItem,
    StudyCardState,
    StudyMaterial,
    AgentAction,
    AgentFile,
    ApiKey,
    PasswordReset,
    AgentChatThread,
    AgentChatMessage,
)
import server.privacy as privacy


# Only the root users table itself is not in _CHILD_TABLES.
EXEMPT_USER_TABLES = {
    "users",
}


def test_every_user_owned_table_is_erased():
    """Every table with a user_id column must be in _CHILD_TABLES or explicitly exempted."""
    child_table_names = {m.__tablename__ for m in privacy._CHILD_TABLES}
    uncovered = []

    for mapper in Base.registry.mappers:
        table = mapper.local_table
        col_names = [c.name for c in table.columns]
        if "user_id" in col_names:
            if table.name not in child_table_names and table.name not in EXEMPT_USER_TABLES:
                uncovered.append(table.name)

    assert not uncovered, (
        f"New models with user_id added without GDPR erasure coverage: {uncovered}. "
        f"Add them to server/privacy.py _CHILD_TABLES."
    )


def test_cascading_erasure_with_foreign_keys_enabled():
    """Verify delete_user_account_and_data wipes all records under active foreign key constraints."""
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def do_connect(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    u = User(public_id="stu_test_cov_123")
    db.add(u)
    db.commit()
    user_id = u.id

    sm = StudyMaterial(user_id=user_id, kind="flashcards", content="{}")
    db.add(sm)
    db.commit()

    scs = StudyCardState(user_id=user_id, material_id=sm.id, card_index=0)
    ce = CalendarEntry(user_id=user_id, entry_date="2026-10-25", title="Final Exam")
    ti = TrashItem(
        user_id=user_id,
        item_type="assignment",
        item_id=999,
        title="Deleted Draft",
        expires_at=datetime.now(timezone.utc),
    )
    act = AgentAction(user_id=user_id, action_type="test", summary="ran agent action")
    af = AgentFile(user_id=user_id, file_name="rubric.pdf", kind="skill", disk_name="test_file.bin", size_bytes=100)
    ak = ApiKey(user_id=user_id, public_id="key_cov_1", key_hash="hash123", key_prefix="hp_cov")
    pr = PasswordReset(
        user_id=user_id,
        public_id=u.public_id,
        method="phone",
        code_hash="code123",
        token="tok_cov_1",
        expires_at=datetime.now(timezone.utc),
    )
    thread = AgentChatThread(user_id=user_id, title="Chat 1")
    msg = AgentChatMessage(user_id=user_id, target_key="global", sender="user", text="hello")
    db.add_all([scs, ce, ti, act, af, ak, pr, thread, msg])
    db.commit()

    res = privacy.delete_user_account_and_data(u, db)
    assert res["status"] == "deleted"

    # Confirm records are wiped
    assert db.query(User).filter(User.id == user_id).first() is None
    assert db.query(CalendarEntry).filter(CalendarEntry.user_id == user_id).first() is None
    assert db.query(TrashItem).filter(TrashItem.user_id == user_id).first() is None
    assert db.query(StudyCardState).filter(StudyCardState.user_id == user_id).first() is None
    assert db.query(AgentChatMessage).filter(AgentChatMessage.user_id == user_id).first() is None
