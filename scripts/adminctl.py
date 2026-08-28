#!/usr/bin/env python3
"""adminctl.py — main's helpotron control panel (NASA console, 08-26).

Direct API control for the always-on admin agent (main). All operations run
against the LOCAL API on 127.0.0.1:8000 with the admin account (JWT obtained
once via /api/login and cached in ~/.config/helpotron_admin.json).

Usage:
  adminctl.py login                          # store admin JWT (uses HELPOTRON_ADMIN_PW / ADMIN_PW / --pw)
  adminctl.py users                          # list users (id, public_id, plan, credits, admin)
  adminctl.py get <id>                       # one user detail
  adminctl.py search <q>                     # admin search by name/id/email
  adminctl.py set-plan <id> <basic|pro|elite>
  adminctl.py credits <id> <amt> [reason]    # +/-, e.g. 100 or -50
  adminctl.py multiplier <public_id> <mult>  # token cost multiplier
  adminctl.py reset-pw <id> <newpw>          # set a user's password
  adminctl.py ban|unban <id>
  adminctl.py stats | health                 # system stats / health
  adminctl.py budget [id]                    # budget for user (default RoniDev)
  adminctl.py messages [reply <id> <text>]   # list inbox or reply
  adminctl.py datalake [list <n>]            # newest data-lake entries
  adminctl.py tokens [generate <days> <uses> | list | deactivate <token>]

Auth: JWT from /api/login (cached); any 401 refreshes once from creds.
Never pushes anything; read/eval/act locally.
"""
import argparse, json, os, sys, time
from pathlib import Path

import urllib.request

API = os.environ.get("HELPOTRON_API", "http://127.0.0.1:8000")
CRED_FILE = Path(os.path.expanduser("~/.config/helpotron_admin.json"))
ADMIN_USER = os.environ.get("HELPOTRON_ADMIN_USER", "RoniDev")
ADMIN_PW = os.environ.get("HELPOTRON_ADMIN_PW") or os.environ.get("ADMIN_PW") or ""


def call(method: str, path: str, body: dict | None = None, bearer: str | None = None) -> tuple[int, dict]:
    """HTTP call; returns (status, parsed json|{})."""
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    if bearer:
        req.add_header("Authorization", f"Bearer {bearer}")
    if body is not None:
        req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw or b"{}")
            except Exception:
                return r.status, {"text": raw.decode(errors="ignore")[:400]}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"text": raw.decode(errors="ignore")[:400]}
    except Exception as ex:
        return -1, {"error": str(ex)}


def get_jwt(refresh: bool = False) -> str:
    global ADMIN_PW
    creds = {}
    if not refresh and CRED_FILE.exists():
        try:
            creds = json.loads(CRED_FILE.read_text())
            if creds.get("jwt"):
                return creds["jwt"]
        except Exception:
            pass
    pw = ADMIN_PW or (json.loads(CRED_FILE.read_text() or "{}") if CRED_FILE.exists() else {}).get("pw") or ""
    if not pw:
        print("adminctl: no password — set HELPOTRON_ADMIN_PW env (or .env) and run 'adminctl.py login'")
        sys.exit(2)
    st, r = call("POST", "/api/login", {"public_id": ADMIN_USER, "password": pw})
    if st != 200:
        print(f"adminctl: login failed rc={st}: {json.dumps(r)[:200]}")
        sys.exit(1)
    jwt = r.get("token") or r.get("access_token") or r.get("jwt") or ""
    if not jwt and isinstance(r.get("session"), dict):
        jwt = r["session"].get("token", "")
    if not jwt:
        print(f"adminctl: no token in login response: {json.dumps(r)[:200]}")
        sys.exit(1)
    CRED_FILE.parent.mkdir(exist_ok=True, parents=True)
    CRED_FILE.write_text(json.dumps({"jwt": jwt, "pw": pw}))
    os.chmod(CRED_FILE, 0o600)
    ADMIN_PW = pw
    return jwt


def a(method: str, path: str, body: dict | None = None, retry: bool = True):
    jwt = get_jwt()
    st, r = call(method, path, body, bearer=jwt)
    if st == 401 and retry:
        jwt = get_jwt(refresh=True)
        st, r = call(method, path, body, bearer=jwt)
    return st, r


def pj(r: dict) -> str:
    return json.dumps(r, indent=1, default=str)[:3000]


plans = ("none", "basic", "pro", "elite")


def main() -> int:
    ap = argparse.ArgumentParser(prog="adminctl.py")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("login")
    for name, args in {
        "users": [],
        "stats": [],
        "health": [],
        "tokens": [],
        "get": ["id"],
        "search": ["q"],
        "set-plan": ["id", "plan"],
        "grant-tokens": ["id", "amount"],
        "credits": ["id", "amount", "reason"],
        "multiplier": ["public_id", "mult"],
        "reset-pw": ["id", "newpw"],
        "ban": ["id"],
        "unban": ["id"],
        "budget": ["id"],
        "messages": ["action", "mid", "text"],
        "datalake": ["list_n"],
        "tokens-gen": ["days", "uses"],
        "tokens-deact": ["token"],
    }.items():
        sp = sub.add_parser(name)
        for arg in args:
            sp.add_argument(arg)
    opts = ap.parse_args()
    cmd, m = opts.cmd, None

    if cmd == "login":
        jwt = get_jwt(); print("logged in as", ADMIN_USER); return 0
    if cmd == "users":
        st, r = a("GET", "/api/admin/users")
        users = r.get("users") if isinstance(r, dict) else r if isinstance(r, list) else []
        data = users if isinstance(users, list) else [users]
        if st != 200:
            print(f"rc={st}"); print(pj(r)); return 1
        for u in data:
            if isinstance(u, dict):
                print(f"{u.get('id')}\t{u.get('public_id')}\tplan={u.get('plan') or 'basic'}\tcredits={u.get('credits')}\tadmin={u.get('is_admin') or u.get('role')}")
            else:
                print(u)
        return 0
    if cmd == "get":
        st, r = a("GET", f"/api/admin/search?q={urllib.parse.quote(opts.id)}")
        print(pj(r)); return 0 if st == 200 else 1
    if cmd == "search":
        st, r = a("GET", f"/api/admin/search?q={urllib.parse.quote(opts.q)}")
        print(pj(r)); return 0 if st == 200 else 1
    if cmd == "set-plan":
        if opts.plan not in plans:
            print("plan must be one of", plans); return 2
        st, r = a("POST", f"/api/admin/user/{opts.id}/plan?plan={opts.plan}")
        print(f"rc={st}", pj(r)); return 0 if st == 200 else 1
    if cmd == "grant-tokens":
        st, r = a("POST", "/api/admin/tokens/grant", {"public_id": opts.id, "amount": float(opts.amount)})
        print(f"rc={st}", pj(r)); return 0 if st in (200, 201) else 1
    if cmd == "credits":
        st, r = a("POST", f"/api/admin/user/{opts.id}/credits?amount={opts.amount}&reason={urllib.parse.quote(opts.reason or 'AdminGrant')}")
        print(f"rc={st}", pj(r)); return 0 if st == 200 else 1
    if cmd == "multiplier":
        st, r = a("POST", f"/api/admin/costs/users/{opts.public_id}/multiplier", {"multiplier": float(opts.mult)})
        print(f"rc={st}", pj(r)); return 0 if st == 200 else 1
    if cmd == "reset-pw":
        st, r = a("POST", f"/api/admin/user/{opts.id}/reset-password", {"new_password": opts.newpw})
        print(f"rc={st}", pj(r)); return 0 if st == 200 else 1
    if cmd == "ban" or cmd == "unban":
        st, r = a("POST", f"/api/admin/user/{opts.id}/{cmd}")
        print(f"rc={st}", pj(r)); return 0 if st == 200 else 1
    if cmd == "stats":
        st, r = a("GET", "/api/admin/stats"); print(pj(r)); return 0 if st == 200 else 1
    if cmd == "health":
        st, r = a("GET", "/api/admin/system-health"); print(pj(r)); return 0 if st == 200 else 1
    if cmd == "budget":
        uid = opts.id or "RoniDev"
        st, r = a("GET", f"/api/admin/costs/budget?user_id={urllib.parse.quote(uid)}")
        print(pj(r)); return 0 if st == 200 else 1
    if cmd == "messages":
        if opts.action == "reply" and opts.mid:
            st, r = a("POST", f"/api/admin/messages/{opts.mid}/reply", {"reply": opts.text or ""})
            print(pj(r)); return 0 if st == 200 else 1
        st, r = a("GET", "/api/admin/messages"); print(pj(r)); return 0 if st == 200 else 1
    if cmd == "datalake":
        n = int(opts.list_n or 20)
        st, r = a("GET", "/api/datalake/export")
        if st != 200:
            st, r = a("GET", "/api/datalake/list")
        data = r if isinstance(r, list) else r.get("entries") or r.get("items") or []
        for e in (data or [])[-n:]:
            print(json.dumps(e, default=str)[:500])
        return 0 if st == 200 else 1
    if cmd == "tokens":
        st, r = a("GET", "/api/admin/tokens"); print(pj(r)); return 0 if st == 200 else 1
    if cmd == "tokens-gen":
        st, r = a("POST", "/api/admin/tokens/generate", {"duration_days": int(opts.days), "max_uses": int(opts.uses)})
        print(pj(r)); return 0 if st == 200 else 1
    if cmd == "tokens-deact":
        st, r = a("POST", f"/api/admin/tokens/deactivate?token={urllib.parse.quote(opts.token)}")
        print(pj(r)); return 0 if st == 200 else 1

    ap.print_help()
    return 2


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
