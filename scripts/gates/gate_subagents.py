"""G2: subagent team status is DERIVED from the Assignment row (status/progress),
never hardcoded — stages must track the assignment lifecycle.

Runtime proof: seed assignments in completed / in_progress / tracked states and
assert the derived team differs per state the way the lifecycle requires.
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:////tmp/gate_subagents.db"
os.environ["JWT_SECRET"] = "test-secret-key-minimum-32-characters!"

for _db in (os.path.join("/tmp", "gate_subagents.db"),):
    if os.path.exists(_db):
        os.remove(_db)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from server.database import Assignment, Base, SessionLocal, User, engine  # noqa: E402
from server.subagents import get_assignment_subagent_team_status  # noqa: E402

Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)

failures = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


db = SessionLocal()
try:
    user = User(public_id="gate-sub-user", plan="free", credits=10)
    db.add(user)
    db.flush()
    done = Assignment(user_id=user.id, title="done essay", prompt="", status="completed")
    active = Assignment(user_id=user.id, title="active essay", prompt="", status="in_progress", progress={"pct": 40})
    queued = Assignment(user_id=user.id, title="queued essay", prompt="", status="tracked")
    db.add_all([done, active, queued])
    db.commit()
    done_id, active_id, queued_id = done.id, active.id, queued.id
finally:
    db.close()

# completed → whole team COMPLETE
r = get_assignment_subagent_team_status(done_id, db)
check("completed: coordinator present", bool(r.get("coordinator")))
team = r.get("team", [])
check("completed: team has 4 roles", len(team) == 4, f"got {len(team)}")
statuses = {m["role"]: m["status"] for m in team}
check("completed: all roles COMPLETE", all(s == "COMPLETE" for s in statuses.values()), str(statuses))
check("completed: completed_tasks/total_tasks are ints", isinstance(r.get("completed_tasks"), int) and isinstance(r.get("total_tasks"), int))

# in_progress → researcher+analyst COMPLETE, writer WORKING (progress from pct), reviewer WAITING
r = get_assignment_subagent_team_status(active_id, db)
team = {m["role"]: m for m in r.get("team", [])}
check("in_progress: researcher COMPLETE", team.get("researcher", {}).get("status") == "COMPLETE")
check("in_progress: source_analyst COMPLETE", team.get("source_analyst", {}).get("status") == "COMPLETE")
check("in_progress: writer WORKING", team.get("writer", {}).get("status") == "WORKING", str(team.get("writer")))
check("in_progress: reviewer WAITING", team.get("reviewer", {}).get("status") == "WAITING")
w = team.get("writer", {})
check("in_progress: writer progress derived from pct (0<p<=100)", isinstance(w.get("progress"), (int, float)) and 0 < w.get("progress", 0) <= 100, f"got {w.get('progress')}")

# tracked/queued → researcher WORKING, rest WAITING
r = get_assignment_subagent_team_status(queued_id, db)
team = {m["role"]: m for m in r.get("team", [])}
check("tracked: researcher WORKING", team.get("researcher", {}).get("status") == "WORKING", str(team.get("researcher")))
check("tracked: writer WAITING", team.get("writer", {}).get("status") == "WAITING")
check("tracked: reviewer WAITING", team.get("reviewer", {}).get("status") == "WAITING")

# Not hardcoded: the three assignments MUST produce different team snapshots
a = get_assignment_subagent_team_status(done_id, db)
b = get_assignment_subagent_team_status(active_id, db)
c = get_assignment_subagent_team_status(queued_id, db)
shapes = {tuple((m["role"], m["status"]) for m in x["team"]) for x in (a, b, c)}
check("lifecycle produces distinct team shapes", len(shapes) >= 2, str(shapes))

db.close()
if failures:
    print(f"FAILED: {len(failures)} checks failed: {failures}")
    sys.exit(1)
print("subagent gate passed")
