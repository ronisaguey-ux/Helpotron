"""G8: backend boots and LIVE endpoints respond after the implementation.

Full restart smoke against the real server: kill the running uvicorn on :8000,
relaunch it, wait for /health, then curl the three new endpoints with real
tokens minted from the dev DB. This proves the deployed server, not just the
test stack.
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 8000
BASE = f"http://localhost:{PORT}"

failures = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def http(method, path, headers=None, body=None, timeout=10):
    req = urllib.request.Request(BASE + path, method=method, headers=headers or {})
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:  # noqa: BLE001
        return None, str(e)


# 1) Kill the running uvicorn (it holds port 8000 with pre-edit code)
killed = False
out = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True).stdout
for line in out.splitlines():
    if f":{PORT} " in line and "python" in line:
        pid = int(line.split("pid=")[1].split(",")[0])
        os.kill(pid, signal.SIGTERM)
        killed = True
        print(f"  killed uvicorn pid {pid}")
if not killed:
    print("  no existing uvicorn on :8000 (starting fresh)")
time.sleep(2)

# 2) Relaunch
log = open("/tmp/helpotron_gate_smoke.log", "w")
proc = subprocess.Popen(
    [os.path.join(ROOT, ".venv/bin/uvicorn"), "server.main:app", "--host", "0.0.0.0", "--port", str(PORT)],
    cwd=ROOT,
    stdout=log,
    stderr=subprocess.STDOUT,
    stdin=subprocess.DEVNULL,
    start_new_session=True,
)
print(f"  relaunched uvicorn pid {proc.pid}")

# 3) Wait for /health
up = False
for _ in range(40):
    time.sleep(0.5)
    try:
        code, _ = http("GET", "/health", timeout=2)
        if code == 200:
            up = True
            break
    except Exception:  # noqa: BLE001
        pass
check("server boots (GET /health 200)", up)

if not up:
    print("  --- server log tail ---")
    print(open("/tmp/helpotron_gate_smoke.log").read()[-2000:])
    print("smoke gate FAILED (server never came up)")
    sys.exit(1)

# 4) Mint tokens against the dev DB — admin (RoniDev) + normal user
os.environ.setdefault("DATABASE_URL", "sqlite:///./helpotron.db")
sys.path.insert(0, ROOT)
from server.database import SessionLocal, User  # noqa: E402
from server.security import ADMIN_PUBLIC_ID, create_jwt_token  # noqa: E402

db = SessionLocal()
try:
    admin = db.query(User).filter(User.public_id == ADMIN_PUBLIC_ID).first()
    if not admin:
        admin = User(public_id=ADMIN_PUBLIC_ID, plan="elite", credits=100)
        db.add(admin)
        db.commit()
    admin_token = create_jwt_token(admin.id)
    demo = db.query(User).filter(User.public_id == "demo-user").first()
    if not demo:
        demo = User(public_id="demo-user", plan="free", credits=20)
        db.add(demo)
        db.commit()
    demo_token = create_jwt_token(demo.id)
finally:
    db.close()

# 5) Live curls
code, body = http("GET", "/api/admin/search?q=Roni", headers={"Authorization": f"Bearer {admin_token}"})
check("live: GET /api/admin/search 200", code == 200, f"got {code}: {body[:200]}")
if code == 200:
    data = json.loads(body)
    check("live: search schema complete", data.get("system_status") == "HEALTHY" and "users" in data)

code, body = http("GET", "/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
check("live: GET /api/admin/users 200", code == 200, f"got {code}")

code, body = http("POST", "/api/admin/user/RoniDev/credits?amount=1&reason=gate-smoke", headers={"Authorization": f"Bearer {admin_token}"})
check("live: POST /api/admin/user/{id}/credits 200", code == 200, f"got {code}: {body[:200]}")

code, body = http("GET", "/api/features/costs/intelligence", headers={"Authorization": f"Bearer {demo_token}"})
check("live: GET /api/features/costs/intelligence 200", code == 200, f"got {code}: {body[:200]}")

code, body = http("GET", "/api/admin/search?q=Roni")
check("live: search without token 401", code == 401, f"got {code}")

if failures:
    print(f"FAILED: {len(failures)} checks failed: {failures}")
    sys.exit(1)
print("smoke gate passed")
