"""G1: admin universal search endpoint is registered, admin-guarded, and returns
the full schema against the live DB (via TestClient + real app stack).

Runtime proof — not a grep. Positive control: the same query patterns find
seeded rows; negative control: unauthenticated request gets 401.
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/gate_search.db"
os.environ["JWT_SECRET"] = "test-secret-key-minimum-32-characters!"

for _db in (os.path.join("/tmp", "gate_search.db"),):
    if os.path.exists(_db):
        os.remove(_db)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from fastapi.testclient import TestClient  # noqa: E402

from server.database import Assignment, Base, CreditTransaction, SessionLocal, User, engine  # noqa: E402
from server.security import ADMIN_PUBLIC_ID, create_jwt_token  # noqa: E402

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
    admin = User(public_id=ADMIN_PUBLIC_ID, plan="elite", credits=1000)
    user = User(public_id="gate-search-user", telegram_id="tg-gate-7", plan="free", credits=10)
    db.add_all([admin, user])
    db.flush()
    db.add(Assignment(user_id=user.id, title="gate search essay alpha", prompt="x"))
    db.add(CreditTransaction(user_id=user.id, delta=5, reason="gate credit seed"))
    db.commit()
    admin_id, user_id = admin.id, user.id
finally:
    db.close()

admin_auth = {"Authorization": f"Bearer {create_jwt_token(admin_id)}"}
user_auth = {"Authorization": f"Bearer {create_jwt_token(user_id)}"}

with TestClient(app) as client:
    # Negative control: no auth → 401
    r = client.get("/api/admin/search", params={"q": "gate-search-user"})
    check("unauthenticated search is rejected (401)", r.status_code == 401, f"got {r.status_code}")

    # Non-admin with a valid token → still guarded (require_admin → 403)
    r = client.get("/api/admin/search", params={"q": "gate-search-user"}, headers=user_auth)
    check("non-admin search is rejected (403)", r.status_code == 403, f"got {r.status_code}")

    # Admin search finds the seeded user by public_id
    r = client.get("/api/admin/search", params={"q": "gate-search-user"}, headers=admin_auth)
    check("admin search returns 200", r.status_code == 200, f"got {r.status_code}")
    body = r.json()
    check("schema has query key", "query" in body and body["query"] == "gate-search-user")
    check("schema has system_status HEALTHY", body.get("system_status") == "HEALTHY")
    check("schema has all 4 result groups", all(k in body for k in ("users", "assignments", "materials", "credit_transactions")))
    found = [u for u in body.get("users", []) if u["public_id"] == "gate-search-user"]
    check("seeded user found by public_id search", len(found) == 1, str(body.get("users")))

    # Search by telegram_id
    r = client.get("/api/admin/search", params={"q": "tg-gate-7"}, headers=admin_auth)
    found = [u for u in r.json().get("users", []) if u.get("telegram_id") == "tg-gate-7"]
    check("seeded user found by telegram_id search", len(found) == 1)

    # Search finds assignments + credit txns
    r = client.get("/api/admin/search", params={"q": "gate search essay"}, headers=admin_auth)
    check("assignment found by title search", len(r.json().get("assignments", [])) >= 1)
    r = client.get("/api/admin/search", params={"q": "gate credit seed"}, headers=admin_auth)
    check("credit transaction found by reason search", len(r.json().get("credit_transactions", [])) >= 1)

if failures:
    print(f"FAILED: {len(failures)} checks failed: {failures}")
    sys.exit(1)
print("search gate passed")
