import uuid
import pytest
from server.database import SessionLocal, User, UniversalDumpItem, Assignment
from server.routes_dump import list_dump_items


@pytest.mark.asyncio
async def test_dump_list_batch_assignment_titles():
    db = SessionLocal()
    user_pid = f"test_dump_{uuid.uuid4().hex[:8]}"
    try:
        user = User(public_id=user_pid, plan="free", role="user")
        db.add(user)
        db.commit()

        a1 = Assignment(user_id=user.id, title="Assignment Alpha", prompt="Test Prompt 1")
        a2 = Assignment(user_id=user.id, title="Assignment Beta", prompt="Test Prompt 2")
        db.add_all([a1, a2])
        db.commit()

        d1 = UniversalDumpItem(user_id=user.id, file_name="doc1.pdf", file_type="pdf", matched_assignment_id=a1.id)
        d2 = UniversalDumpItem(user_id=user.id, file_name="doc2.pdf", file_type="pdf", matched_assignment_id=a2.id)
        d3 = UniversalDumpItem(user_id=user.id, file_name="doc3.pdf", file_type="pdf", matched_assignment_id=None)
        db.add_all([d1, d2, d3])
        db.commit()

        resp = await list_dump_items(
            status=None,
            subject=None,
            limit=10,
            current_user=user,
            db=db,
        )

        assert resp["status"] == "success"
        assert resp["count"] == 3
        item_map = {it["file_name"]: it for it in resp["items"]}
        assert item_map["doc1.pdf"]["matched_assignment_title"] == "Assignment Alpha"
        assert item_map["doc2.pdf"]["matched_assignment_title"] == "Assignment Beta"
        assert item_map["doc3.pdf"]["matched_assignment_title"] is None
    finally:
        db.rollback()
        db.close()
