"""G3: subagent-team API endpoint is exposed AND IDOR-safe — own assignment 200,
foreign assignment 404, unauthenticated 401. Runtime proof via TestClient.
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/gate_subagent_endpoint.db"
os.environ["JWT_SECRET"] = "test-secret-key-minimum-32-characters!"

for _db in (os.path.join("/tmp", "gate_subagent_endpoint.db"),):
    if os.path.exists(_db):
        os.remove(_db)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from fastapi.testclient import TestClient  # noqa: E402

from server.database import Assignment, Base, SessionLocal, User, engine  # noqa: E402
from server.security import create_jwt_token  # noqa: E402

Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)

from server.main import app  # noqa: E402

failures = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


db = SessionLocal()
try:
    alice = User(public_id="gate-alice", plan="free", credits=10)
    bob = User(public_id="gate-bob", plan="free", credits=10)
    db.add_all([alice, bob])
    db.flush()
    db.add(Assignment(user_id=alice.id, title="alice private", prompt="", status="in_progress"))
    db.commit()
    alice_id, bob_id = alice.id, bob.id
finally:
    db.close()

alice_auth = {"Authorization": f"Bearer {create_jwt_token(alice_id)}"}
bob_auth = {"Authorization": f"Bearer {create_jwt_token(bob_id)}"}

with TestClient(app) as client:
    # route table exposes both prefixes
    paths = {r.path for r in app.routes}
    check("route exposed at /assignments/{id}/subagent-team", "/assignments/{assignment_id}/subagent-team" in paths)
    check("route exposed at /api/assignments/{id}/subagent-team", "/api/assignments/{assignment_id}/subagent-team" in paths)

    # need an assignment id — query the seeded row (GET /api/assignments is not
    # a route; the assignment list endpoint lives at /assignments)
    db2 = SessionLocal()
    try:
        aid = db2.query(Assignment.id).filter(Assignment.title == "alice private").scalar()
    finally:
        db2.close()
    check("found seeded assignment id", aid is not None)

    # own assignment → 200 + team snapshot
    r = client.get(f"/api/assignments/{aid}/subagent-team", headers=alice_auth)
    check("own assignment returns 200", r.status_code == 200, f"got {r.status_code}")
    body = r.json()
    check("response has coordinator", bool(body.get("coordinator")))
    check("response has 4-role team", len(body.get("team", [])) == 4, str(body.get("team"))[:120])

    # foreign assignment → 404 (IDOR-safe)
    r = client.get(f"/api/assignments/{aid}/subagent-team", headers=bob_auth)
    check("foreign assignment returns 404", r.status_code == 404, f"got {r.status_code}")

    # unauthenticated → 401
    r = client.get(f"/api/assignments/{aid}/subagent-team")
    check("unauthenticated returns 401", r.status_code == 401, f"got {r.status_code}")

if failures:
    print(f"FAILED: {len(failures)} checks failed: {failures}")
    sys.exit(1)
print("subagent endpoint gate passed")
