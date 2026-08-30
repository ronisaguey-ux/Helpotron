import pytest
from fastapi.testclient import TestClient
from server.main import app
from server.security import create_jwt_token, verify_jwt_token
from server.math_executor import safe_eval_math_expr

client = TestClient(app)

def test_admin_requires_jwt():
    res = client.get('/api/admin/stats')
    assert res.status_code == 401

def test_admin_header_spoofing_rejected():
    res = client.get('/api/admin/stats', headers={'X-Public-ID': 'admin_root'})
    assert res.status_code == 401

def test_jwt_token_validation():
    token = create_jwt_token(user_id=42, role='user')
    payload = verify_jwt_token(token)
    assert payload is not None
    assert payload['sub'] == 42
    assert payload['role'] == 'user'

def test_safe_math_eval():
    assert safe_eval_math_expr('10 + 20 * 2') == 50
    with pytest.raises(TypeError):
        safe_eval_math_expr('__import__("os").system("id")')


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
        token = create_jwt_token(user_id=user.id, role='user')
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
        jwt_tok = create_jwt_token(user_id=user_id, role='user')
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
        # Only the current session remains, others revoked
        assert "sess_token_1" not in rem_tokens
        assert "sess_token_2" not in rem_tokens
        assert "sess_token_curr" in rem_tokens
    finally:
        db.close()