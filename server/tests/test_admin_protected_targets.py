"""V2-B2-03: destructive admin actions must not hit the owner or other admins."""
import uuid

from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal, User
from server.main import app
from server.security import create_jwt_token

init_db()
client = TestClient(app)


def _mk(public_id, role="member"):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == public_id).first()
        if u is None:
            u = User(public_id=public_id, plan="basic", credits=1.0, settings={}, role=role)
            db.add(u)
            db.commit()
            db.refresh(u)
        return u.id
    finally:
        db.close()


def _hdr(uid, role):
    return {"Authorization": f"Bearer {create_jwt_token(user_id=uid, role=role)}"}


def test_second_admin_cannot_touch_owner_or_peers():
    _mk("RoniDev", "admin")
    sub_id = _mk("sub-" + uuid.uuid4().hex[:6], "admin")
    peer = "peer-" + uuid.uuid4().hex[:6]
    _mk(peer, "admin")
    h = _hdr(sub_id, "admin")
    for target in ("RoniDev", peer):
        assert client.post(f"/api/admin/user/{target}/ban", headers=h).status_code == 403
        assert client.post(f"/api/admin/user/{target}/tempban", headers=h).status_code == 403
        assert client.delete(f"/api/admin/user/{target}", headers=h).status_code == 403
        r = client.post(f"/api/admin/user/{target}/change-password",
                        json={"new_password": "Passw0rd123"}, headers=h)
        assert r.status_code == 403


def test_admin_can_still_ban_regular_user():
    admin_id = _mk("RoniDev", "admin")
    victim = "vic-" + uuid.uuid4().hex[:6]
    _mk(victim)
    r = client.post(f"/api/admin/user/{victim}/ban", headers=_hdr(admin_id, "admin"))
    assert r.status_code == 200
