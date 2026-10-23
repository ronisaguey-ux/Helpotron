"""V2-B2-04: Test study group creation, creator auto-membership, and member authorization."""
import uuid
from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal, User, StudyMaterial
from server.main import app
from server.security import create_jwt_token

init_db()
client = TestClient(app)


def _create_user(public_id: str) -> User:
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == public_id).first()
        if u is None:
            u = User(public_id=public_id, plan="pro", credits=10.0, settings={})
            db.add(u)
            db.commit()
            db.refresh(u)
        return u
    finally:
        db.close()


def _auth_headers(user: User) -> dict:
    token = create_jwt_token(user_id=user.id, role="user")
    return {"Authorization": f"Bearer {token}"}


def test_study_group_creator_membership_and_sharing():
    # 1. Setup creator and peer
    creator_id = f"creator_{uuid.uuid4().hex[:6]}"
    peer_id = f"peer_{uuid.uuid4().hex[:6]}"
    creator = _create_user(creator_id)
    peer = _create_user(peer_id)

    creator_hdr = _auth_headers(creator)
    peer_hdr = _auth_headers(peer)

    # 2. Create study group as creator
    res = client.post("/api/groups/create", json={"name": "Bio 101"}, headers=creator_hdr)
    assert res.status_code == 200
    group_data = res.json()
    group_id = group_data["id"]
    invite_code = group_data["invite_code"]

    # 3. Creator must be able to list group immediately (membership created)
    my_groups = client.get("/api/groups/my", headers=creator_hdr).json()
    assert any(g["id"] == group_id for g in my_groups)

    # 4. Creator creates a study material
    db = SessionLocal()
    try:
        mat = StudyMaterial(user_id=creator.id, kind="flashcards", content="Q: What is DNA? A: Genetic code")
        db.add(mat)
        db.commit()
        db.refresh(mat)
        material_id = mat.id
    finally:
        db.close()

    # 5. Creator can share material with the group without 403 lockout
    share_res = client.post("/api/groups/share", json={"group_id": group_id, "material_id": material_id}, headers=creator_hdr)
    assert share_res.status_code == 200

    # 6. Non-member cannot access group materials (403)
    peer_mat_res = client.get(f"/api/groups/{group_id}/materials", headers=peer_hdr)
    assert peer_mat_res.status_code == 403

    # 7. Non-member joins using invite code
    join_res = client.post("/api/groups/join", json={"invite_code": invite_code}, headers=peer_hdr)
    assert join_res.status_code == 200

    # 8. Joined member can now view group materials
    peer_mat_res2 = client.get(f"/api/groups/{group_id}/materials", headers=peer_hdr)
    assert peer_mat_res2.status_code == 200
    assert len(peer_mat_res2.json()) == 1
    assert peer_mat_res2.json()[0]["id"] == material_id
