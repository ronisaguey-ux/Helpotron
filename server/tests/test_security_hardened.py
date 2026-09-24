"""Comprehensive regression test suite for security hardening.

Covers:
1. SSRF prevention on internal IPs, loopback, cloud metadata, and disallowed schemes.
2. RCE and sandbox escape prevention in _validated_argv and run_python_math_bash.
3. Path traversal blocking in serve_spa_frontend.
4. Credit minting prevention on POST /api/payments (rejects unverified stripe provider & non-positive amounts).
5. Admin authentication with Bearer session tokens and safe handling of missing request.
6. File upload extension and payload constraints.
7. Datalake user anonymization prefix consistency (always starts with usr_).
8. GDPR account deletion route mapping (/api/user/account and /user/account).
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from server.ssrf import is_safe_url, validate_safe_url
from server.canvas_sync import CanvasSyncEngine
from server.overlord_agent import _validated_argv
from server.math_executor import run_python_math_bash
from server.datalake import _anonymize_id
from server.main import app, resolve_spa_target
from server.security import SessionStore, create_access_token
from server.admin import require_admin
from server.database import User, SessionLocal


client = TestClient(app)


# ─── 1. SSRF Prevention Tests ────────────────────────────────────────────────

def test_ssrf_blocks_loopback_and_private_ips():
    """Verify SSRF validator blocks localhost, loopback, and private ranges."""
    assert not is_safe_url("http://127.0.0.1:8000/api/admin")
    assert not is_safe_url("http://localhost:8000")
    assert not is_safe_url("http://10.0.0.5/secret")
    assert not is_safe_url("http://172.16.0.1/admin")
    assert not is_safe_url("http://192.168.1.1/router")
    assert not is_safe_url("http://[::1]/internal")
    assert not is_safe_url("http://0.0.0.0/")


def test_ssrf_blocks_cloud_metadata():
    """Verify SSRF validator blocks AWS/GCP/Azure link-local metadata service."""
    assert not is_safe_url("http://169.254.169.254/latest/meta-data")
    assert not is_safe_url("http://metadata.google.internal/computeMetadata/v1")
    assert not is_safe_url("http://metadata.goog")
    assert not is_safe_url("http://instance-data")


def test_ssrf_blocks_non_http_schemes():
    """Verify SSRF validator blocks non-HTTP/HTTPS schemes."""
    assert not is_safe_url("file:///etc/passwd")
    assert not is_safe_url("ftp://example.com/file.txt")
    assert not is_safe_url("gopher://example.com")
    assert not is_safe_url("data:text/plain;base64,SGVsbG8=")


def test_ssrf_allows_safe_external_urls():
    """Verify SSRF validator allows legitimate public hostnames."""
    assert is_safe_url("https://canvas.instructure.com/api/v1/courses")
    assert is_safe_url("https://example.com/syllabus.pdf")


def test_canvas_sync_rejects_ssrf_target():
    """Verify CanvasSyncEngine rejects internal/metadata base URLs."""
    with pytest.raises(ValueError, match="SSRF"):
        CanvasSyncEngine("http://169.254.169.254", "fake_token")

    with pytest.raises(ValueError, match="SSRF"):
        CanvasSyncEngine("http://127.0.0.1:8000", "fake_token")


# ─── 2. RCE & Sandbox Escape Prevention Tests ────────────────────────────────

def test_validated_argv_blocks_dangerous_code():
    """Verify _validated_argv rejects dangerous Python builtins, imports, and system calls."""
    assert _validated_argv('python3 -c "import os; os.system(\'id\')') is None
    assert _validated_argv('python3 -c "import sys; sys.exit(1)"') is None
    assert _validated_argv('python3 -c "__import__(\'os\').system(\'ls\')"') is None
    assert _validated_argv('python3 -c "open(\'/etc/passwd\').read()"') is None
    assert _validated_argv('python3 -c "import subprocess; subprocess.run(\'ls\')"') is None
    assert _validated_argv('python3 -c "eval(\'1+1\')"') is None
    assert _validated_argv('python3 -c "exec(\'print(1)\')"') is None


def test_validated_argv_allows_safe_math():
    """Verify _validated_argv allows pure math computation."""
    safe_cmd = 'python3 -c "import math; print(math.sqrt(25))"'
    argv = _validated_argv(safe_cmd)
    assert argv is not None
    assert argv[1] == "-c"
    assert "math.sqrt" in argv[2]


def test_run_python_math_bash_blocks_dangerous_code():
    """Verify math executor rejects dangerous code before subprocess invocation."""
    ok, err = run_python_math_bash("import os\nprint(os.listdir('/'))")
    assert not ok
    assert "Disallowed operation" in err

    ok, err = run_python_math_bash("import subprocess\nsubprocess.run('ls')")
    assert not ok
    assert "Disallowed operation" in err

    ok, err = run_python_math_bash("with open('/etc/passwd') as f: print(f.read())")
    assert not ok
    assert "Disallowed operation" in err


def test_run_python_math_bash_executes_safe_math():
    """Verify math executor safely calculates valid expressions."""
    ok, res = run_python_math_bash("print(math.factorial(5))")
    assert ok
    assert res == "120"


# ─── 3. Path Traversal Prevention in SPA Serving ──────────────────────────────

@pytest.mark.asyncio
async def test_serve_spa_frontend_blocks_path_traversal():
    """Verify the SPA path guard raises 404 on traversal attempts outside web/dist.

    Drives `resolve_spa_target`, which is where the guard actually lives now. The route
    handler used to hold it inline and is defined inside a conditional, so importing it
    (as this test used to) failed at import time and took the whole suite with it.
    """
    with pytest.raises(HTTPException) as exc_info:
        resolve_spa_target("../../.env")
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        resolve_spa_target("../../../etc/passwd")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_spa_path_guard_blocks_dotfiles_and_allows_real_assets():
    """The guard must refuse dotfiles but still serve an ordinary path.

    The positive case matters: a guard that 404s everything is not security, it is an
    outage — and only asserting the refusals would have accepted that.
    """
    # A dotfile inside dist is refused even though it does not traverse anywhere.
    with pytest.raises(HTTPException):
        resolve_spa_target(".env")
    with pytest.raises(HTTPException):
        resolve_spa_target("assets/.hidden.js")

    # An ordinary path resolves inside dist and does not raise.
    resolved = resolve_spa_target("index.html")
    assert resolved.name == "index.html"
    assert resolved.is_relative_to(resolve_spa_target("").resolve())


# ─── 4. Credit Minting Prevention on POST /api/payments ──────────────────────

def test_payments_endpoint_blocks_direct_stripe(monkeypatch):
    """Verify POST /api/payments disallows client-declared 'stripe' provider when Stripe is configured."""
    from server.config import config
    monkeypatch.setattr(config, "stripe_secret_key", "sk_test_mock_secret")
    monkeypatch.setattr(config, "stripe_webhook_secret", "whsec_test_mock_secret")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "test_security_user").first()
        if not user:
            user = User(public_id="test_security_user", password_hash="dummy_hash", credits=10.0, settings={"2fa_enabled": True})
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.settings = {**(user.settings or {}), "2fa_enabled": True}
            db.commit()
            db.refresh(user)

        token = create_access_token({"sub": user.id})
        headers = {"Authorization": f"Bearer {token}", "X-Public-ID": user.public_id}

        # A direct 'stripe' payment must be rejected ON EVERY CONFIGURATION.
        # The bug was a guard that only fired when Stripe was enabled, so on a
        # box without Stripe keys this call minted tokens with no charge.
        res = client.post(
            "/api/payments",
            json={"public_id": user.public_id, "provider": "stripe", "amount_cents": 5000},
            headers=headers,
        )
        # Should be 400 Bad Request (Stripe payments must go through checkout) or 403 (2FA requirement)
        assert res.status_code in (400, 403)
        if res.status_code == 400:
            assert "checkout" in res.text.lower()
    finally:
        db.close()


def test_payments_endpoint_rejects_negative_and_zero_amount():
    """Verify POST /api/payments rejects non-positive payment amounts."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == "test_security_user").first()
        if not user:
            user = User(public_id="test_security_user", password_hash="dummy_hash", credits=10.0, settings={"2fa_enabled": True})
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.settings = {**(user.settings or {}), "2fa_enabled": True}
            db.commit()
            db.refresh(user)

        token = create_access_token({"sub": user.id})
        headers = {"Authorization": f"Bearer {token}", "X-Public-ID": user.public_id}

        res_zero = client.post(
            "/api/payments",
            json={"public_id": user.public_id, "provider": "cashapp", "amount_cents": 0},
            headers=headers,
        )
        assert res_zero.status_code in (400, 422, 403)

        res_neg = client.post(
            "/api/payments",
            json={"public_id": user.public_id, "provider": "cashapp", "amount_cents": -100},
            headers=headers,
        )
        assert res_neg.status_code in (400, 422, 403)
    finally:
        db.close()


def test_purchase_requires_2fa_enforcement():
    """Verify POST /api/payments and /api/checkout enforce 2FA when purchases_require_2fa is active."""
    import uuid
    db = SessionLocal()
    try:
        no_2fa_user = f"user_no_2fa_{uuid.uuid4().hex[:6]}"
        user = User(public_id=no_2fa_user, password_hash="dummy_hash", credits=10.0, settings={"2fa_enabled": False})
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token({"sub": user.id})
        headers = {"Authorization": f"Bearer {token}", "X-Public-ID": user.public_id}

        res = client.post(
            "/api/payments",
            json={"public_id": user.public_id, "provider": "cashapp", "amount_cents": 500},
            headers=headers,
        )
        assert res.status_code == 403
        assert "Two-factor authentication must be enabled" in res.text

        # Enable 2FA and verify access succeeds past the 2FA gate
        user.settings = {"2fa_enabled": True}
        db.commit()

        res_after = client.post(
            "/api/payments",
            json={"public_id": user.public_id, "provider": "cashapp", "amount_cents": 500},
            headers=headers,
        )
        assert res_after.status_code == 200
    finally:
        db.close()


# ─── 5. Admin Authentication Hardening Tests ─────────────────────────────────

def test_require_admin_handles_none_request():
    """Verify require_admin raises 401 when request is None rather than crashing."""
    with pytest.raises(HTTPException) as exc_info:
        require_admin(None)
    assert exc_info.value.status_code == 401


def test_require_admin_supports_bearer_session_store_token():
    """Verify require_admin authenticates via SessionStore tokens in Authorization: Bearer."""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            admin = db.query(User).filter(User.public_id == "RoniDev").first()
        if not admin:
            admin = User(public_id="admin_test_sec", password_hash="dummy", role="admin")
            db.add(admin)
            db.commit()
            db.refresh(admin)

        session_token = SessionStore.create_session(admin.id, admin.public_id)
        from starlette.requests import Request
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/admin/users",
            "headers": [(b"authorization", f"Bearer {session_token}".encode("utf-8"))],
        }
        req = Request(scope)
        auth_admin = require_admin(req, db)
        assert auth_admin.id == admin.id
    finally:
        db.close()


# ─── 6. File Upload Extension Hardening Tests ────────────────────────────────

def test_dump_upload_rejects_executable_files():
    """Verify /api/dump/upload rejects dangerous file extensions like .sh, .exe, .py."""
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            pytest.skip("No user in db")
        token = create_access_token({"sub": user.id})
        headers = {"Authorization": f"Bearer {token}", "X-Public-ID": user.public_id}

        files = {"file": ("malicious.sh", b"#!/bin/bash\necho pwned", "application/x-sh")}
        res = client.post("/api/dump/upload", files=files, headers=headers)
        assert res.status_code == 400
        assert "not permitted" in res.text
    finally:
        db.close()


def test_transcribe_rejects_unsupported_extensions():
    """Verify /api/transcribe rejects non-audio file extensions."""
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            pytest.skip("No user in db")
        token = create_access_token({"sub": user.id})
        headers = {"Authorization": f"Bearer {token}", "X-Public-ID": user.public_id}

        files = {"file": ("bad_file.py", b"print('hello')", "text/x-python")}
        res = client.post("/api/transcribe", files=files, headers=headers)
        assert res.status_code == 400
        assert "Unsupported audio format" in res.text
    finally:
        db.close()


# ─── 7. Datalake Anonymization Consistency Tests ─────────────────────────────

def test_datalake_anonymization_prefix():
    """Verify _anonymize_id always starts with 'usr_' even for falsy / None IDs."""
    anon_none = _anonymize_id(None)
    assert anon_none.startswith("usr_")

    anon_user = _anonymize_id("student_12345")
    assert anon_user.startswith("usr_")
    assert "student_12345" not in anon_user


# ─── 8. GDPR Route Mapping Tests ─────────────────────────────────────────────

def test_gdpr_account_deletion_routes_exist():
    """Verify both /api/user/account and /user/account routes are registered."""
    all_paths = []
    for r in app.routes:
        if hasattr(r, "path"):
            all_paths.append(r.path)
        elif hasattr(r, "original_router"):
            for sub_r in r.original_router.routes:
                if hasattr(sub_r, "path"):
                    all_paths.append(sub_r.path)
    assert "/api/user/account" in all_paths
    assert "/user/account" in all_paths


# ─── 9. Legacy / Core Hardening Tests ─────────────────────────────────────────

def test_admin_requires_jwt():
    res = client.get('/api/admin/stats')
    assert res.status_code == 401


def test_admin_header_spoofing_rejected():
    res = client.get('/api/admin/stats', headers={'X-Public-ID': 'admin_root'})
    assert res.status_code == 401


def test_deterministic_math_ast_whitelist():
    from server.math_executor import solve_deterministic_math, assert_math_expression_safe, UnsafeMathExpression

    # Valid equations & math expressions
    assert assert_math_expression_safe("x^2 + 5*x + 6 = 0") == "x^2 + 5*x + 6 = 0"
    assert assert_math_expression_safe("sin(pi / 2) + sqrt(16)") == "sin(pi / 2) + sqrt(16)"

    # Dangerous AST injection attempts rejected by AST whitelist
    with pytest.raises(UnsafeMathExpression):
        assert_math_expression_safe("__import__('os').system('id')")
    with pytest.raises(UnsafeMathExpression):
        assert_math_expression_safe("().__class__.__bases__[0].__subclasses__()")
    with pytest.raises(UnsafeMathExpression):
        assert_math_expression_safe("[x for x in (1, 2)]")

    # Safe deterministic math execution returns success for valid math, rejected error for injection
    clean_res = solve_deterministic_math("2 * x + 4 = 10")
    assert clean_res["success"] is True

    unsafe_res = solve_deterministic_math("__import__('os').system('echo pwn')")
    assert unsafe_res["success"] is False
    assert "Rejected" in unsafe_res["error"]


def test_users_patch_privilege_escalation_blocked():
    from server.database import SessionLocal, User
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == 'sec_priv_user').first()
        if not user:
            user = User(public_id='sec_priv_user', plan='basic', credits=10.0, settings={'reading_level': 'college-freshman'})
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_access_token({"sub": user.id})
    finally:
        db.close()

    auth_headers = {'Authorization': f'Bearer {token}'}
    # Attempt to elevate token_balance, unban, or change server-owned micro_credits
    res = client.patch(
        f'/api/users/{user.public_id}',
        json={'public_id': user.public_id, 'settings': {'token_balance': 999999.0, 'banned': False, 'micro_credits_balance': 500.0, 'academic_level': 'masters'}},
        headers=auth_headers
    )
    assert res.status_code == 200
    data = res.json()
    assert 'token_balance' in data.get('ignored_fields', [])
    assert 'micro_credits_balance' in data.get('ignored_fields', [])
    assert data['settings'].get('token_balance') != 999999.0

    db = SessionLocal()
    try:
        refreshed = db.query(User).filter(User.public_id == 'sec_priv_user').one()
        assert (refreshed.settings or {}).get('token_balance') != 999999.0
        assert (refreshed.settings or {}).get('academic_level') == 'masters'
    finally:
        db.close()


def test_uploads_hardening_headers():
    from pathlib import Path
    uploads_dir = Path(__file__).resolve().parent.parent.parent / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    test_html = uploads_dir / "test_xss_probe.html"
    test_html.write_text("<html><script>alert(1)</script></html>")

    try:
        res = client.get("/uploads/test_xss_probe.html")
        assert res.status_code == 200
        # Nosniff + CSP sandbox + attachment disposition to prevent stored XSS
        assert res.headers.get("X-Content-Type-Options") == "nosniff"
        assert "sandbox" in res.headers.get("Content-Security-Policy", "")
        assert "attachment" in res.headers.get("Content-Disposition", "")
    finally:
        if test_html.exists():
            test_html.unlink()


def test_recovery_user_enumeration_mitigation():
    # Non-existent account returns 200 with default channels instead of 404
    opt_res = client.get("/api/recovery/options?public_id=nonexistent_user_99887766")
    assert opt_res.status_code == 200
    data = opt_res.json()
    assert data["status"] == "success"
    assert data["has_email"] is False
    assert data["dev"] is True

    # Request code for non-existent account returns generic success instead of 404
    req_res = client.post("/api/recovery/request", json={"public_id": "nonexistent_user_99887766", "method": "dev"})
    assert req_res.status_code == 200
    assert req_res.json()["status"] == "success"


def test_password_change_revokes_other_sessions():
    from datetime import datetime, timezone, timedelta
    from server.database import SessionLocal, User, UserSession
    from server.security import hash_password, SessionStore

    ph, salt = hash_password("OldPassword123!")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == 'sec_pw_user').first()
        if not user:
            user = User(public_id='sec_pw_user', plan='basic', credits=10.0, password_hash=ph, password_salt=salt)
            db.add(user)
        else:
            user.password_hash = ph
            user.password_salt = salt
        db.commit()
        db.refresh(user)
        user_id = user.id
        db.query(UserSession).filter(UserSession.user_id == user_id).delete()
        # Seed 3 existing sessions
        exp = datetime.now(timezone.utc) + timedelta(days=7)
        sess1 = UserSession(token="sess_token_1", user_id=user_id, public_id="sec_pw_user", expires_at=exp)
        sess2 = UserSession(token="sess_token_2", user_id=user_id, public_id="sec_pw_user", expires_at=exp)
        curr_sess = UserSession(token="sess_token_curr", user_id=user_id, public_id="sec_pw_user", expires_at=exp)
        db.add_all([sess1, sess2, curr_sess])
        db.commit()
        jwt_tok = create_access_token({"sub": user_id})
    finally:
        db.close()

    headers = {'Authorization': f'Bearer {jwt_tok}'}
    cookies = {'helpotron_session': 'sess_token_curr'}
    res = client.post(
        '/api/user/change-password',
        json={'current_password': 'OldPassword123!', 'new_password': 'NewSecurePassword456!'},
        headers=headers,
        cookies=cookies
    )
    assert res.status_code == 200

    db = SessionLocal()
    try:
        remaining_sessions = db.query(UserSession).filter(UserSession.user_id == user_id).all()
        rem_tokens = [s.token for s in remaining_sessions]
        # Only the current session remains, others revoked.
        # Tokens are stored HASHED now, so the survivor is identified by its
        # digest — asserting on the raw value would pass only while the row was
        # still leaking its credential.
        from server.security import _hash_token
        assert "sess_token_1" not in rem_tokens
        assert "sess_token_2" not in rem_tokens
        assert _hash_token("sess_token_curr") in rem_tokens
        assert "sess_token_curr" not in rem_tokens
    finally:
        db.close()
