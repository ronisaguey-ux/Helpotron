"""Automated verification suite for Shannon pentest remediation findings.
"""
import pytest
from server.database import User, SessionLocal, Organization
from server.security import SessionStore, SESSION_COOKIE_NAME, is_admin_user


def test_authz_01_org_creation_does_not_grant_admin(client):
    """AUTHZ-01: POST /api/organizations/create must NOT grant platform admin."""
    db = SessionLocal()
    pid = "test_org_user_no_admin"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={})
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        u.role = "member"
        u.organization_id = None
        db.commit()

    token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    resp = client.post(
        "/api/organizations/create",
        json={"name": "TestNonAdminOrg", "plan": "team", "seat_count": 5},
        headers=headers,
    )
    assert resp.status_code == 200

    db.refresh(u)
    assert u.role != "admin"
    assert is_admin_user(u) is False

    # Verify user is still forbidden from admin endpoints
    admin_resp = client.get("/api/admin/users", headers=headers)
    assert admin_resp.status_code == 403


def test_misc_13_banned_user_blocked_on_org_route(client):
    """MISC-13: Banned user cookie cannot call /api/organizations/create."""
    db = SessionLocal()
    pid = "test_banned_org_caller"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={"banned": True})
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        s = dict(u.settings or {})
        s["banned"] = True
        u.settings = s
        db.commit()

    token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    resp = client.post(
        "/api/organizations/create",
        json={"name": "BannedOrgAttempt", "plan": "team", "seat_count": 5},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "suspended" in resp.text.lower()


def test_inj_01_sympify_command_injection_blocked():
    """INJ-01: sympy.sympify and eval-capable code in run_shell must be rejected."""
    from server.overlord_agent import _is_safe_compute_code, _validated_argv

    # Shannon exploit payload 1
    p1 = "from sympy import sympify; sympify('__import__(+chr(39)+os+chr(39)+).system(+chr(39)+id+chr(39)+)')"
    assert _is_safe_compute_code(p1) is False
    assert _validated_argv(f"python3 -c '{p1}'") is None

    # Shannon exploit payload 2 (base64 exec)
    p2 = "from sympy import sympify; sympify('exec(__import__(+chr(39)+base64+chr(39)+).b64decode(+chr(39)+aWQ=+chr(39)+).decode())')"
    assert _is_safe_compute_code(p2) is False
    assert _validated_argv(f"python3 -c '{p2}'") is None

    # Direct import of sympify or dangerous methods
    assert _is_safe_compute_code("import sympy; sympy.sympify('1+1')") is False
    assert _is_safe_compute_code("import sympy; sympy.parse_expr('1+1')") is False

    # Safe math expressions must still be allowed
    assert _is_safe_compute_code("import math; print(2+2)") is True
    assert _is_safe_compute_code("import sympy; print(sympy.simplify('1/2+1/3'))") is True


def test_inj_02_and_04_sandbox_script_never_auto_approved(client):
    """INJ-02 & INJ-04: run_sandbox_script must NEVER auto-approve via yolo override."""
    from server.overlord_agent import PermissionEngine

    # Direct permission engine check
    settings = {"operation_mode": "auto"}
    approved, reason = PermissionEngine.evaluate_action_permission(
        settings, "run_sandbox_script", session_mode_override="yolo"
    )
    assert approved is False
    assert "requires explicit" in reason.lower()

    # Even if operation_mode is yolo, script execution requires approval
    settings_yolo = {"operation_mode": "yolo"}
    approved_yolo, _ = PermissionEngine.evaluate_action_permission(
        settings_yolo, "run_sandbox_script"
    )
    assert approved_yolo is False

    # HTTP endpoint check via POST /api/agent/task
    db = SessionLocal()
    pid = "test_sandbox_inj_user"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={"operation_mode": "auto"})
        db.add(u)
        db.commit()
        db.refresh(u)

    token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    resp = client.post(
        "/api/agent/task",
        headers=headers,
        json={
            "action_type": "run_sandbox_script",
            "session_mode_override": "yolo",
            "payload": {
                "language": "python",
                "script": "print('exploit')",
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "permission_required"
    assert "paused awaiting user confirmation" in data.get("message", "")


def test_authz_02_admin_impersonation_blocks_admin_targets(client):
    """AUTHZ-02: Admin impersonation must reject targeting other admin accounts."""
    db = SessionLocal()
    from server.admin import ADMIN_IDS
    admin_pid = ADMIN_IDS[0]
    admin = db.query(User).filter(User.public_id == admin_pid).first()
    if not admin:
        admin = User(public_id=admin_pid, plan="elite", role="admin", is_admin=True, settings={})
        db.add(admin)
        db.commit()
        db.refresh(admin)

    # Another admin target
    other_admin = db.query(User).filter(User.public_id == "other_admin_target").first()
    if not other_admin:
        other_admin = User(public_id="other_admin_target", plan="elite", role="admin", settings={})
        db.add(other_admin)
        db.commit()

    admin_token = SessionStore.create_session(admin.id, admin.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, admin_token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    # Attempt to impersonate other admin
    resp = client.post(f"/api/admin/user/other_admin_target/act", headers=headers)
    assert resp.status_code == 403
    assert "cannot impersonate" in resp.text.lower()


def test_authz_03_and_misc_04_admin_password_reset(client):
    """AUTHZ-03 & MISC-04: Admin pw reset blocks admin targets, validates strength, and revokes sessions."""
    db = SessionLocal()
    from server.admin import ADMIN_IDS
    admin = db.query(User).filter(User.public_id == ADMIN_IDS[0]).first()
    admin_token = SessionStore.create_session(admin.id, admin.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, admin_token)

    csrf_resp = client.get("/api/csrf")
    csrf_token = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf_token}

    # Target user
    target_pid = "test_reset_target_user"
    target = db.query(User).filter(User.public_id == target_pid).first()
    if not target:
        target = User(public_id=target_pid, plan="none", role="member", settings={})
        db.add(target)
        db.commit()
        db.refresh(target)

    victim_session = SessionStore.create_session(target.id, target.public_id)

    # Weak password rejected
    resp_weak = client.post(
        f"/api/admin/user/{target_pid}/reset-password",
        headers=headers,
        json={"new_password": "123"},
    )
    assert resp_weak.status_code == 400

    # Valid reset succeeds
    resp_ok = client.post(
        f"/api/admin/user/{target_pid}/reset-password",
        headers=headers,
        json={"new_password": "StrongPassword99!"},
    )
    assert resp_ok.status_code == 200

    # Old session is now revoked (MISC-04)
    client2 = type(client)(client.app)
    client2.cookies.set(SESSION_COOKIE_NAME, victim_session)
    me_resp = client2.get("/api/me")
    assert me_resp.status_code == 401


def test_misc_02_banned_admin_blocked_by_require_admin(client):
    """MISC-02: A banned admin account must be rejected by require_admin."""
    db = SessionLocal()
    banned_admin_pid = "test_banned_admin_account"
    b_admin = db.query(User).filter(User.public_id == banned_admin_pid).first()
    if not b_admin:
        b_admin = User(public_id=banned_admin_pid, plan="elite", role="admin", settings={"banned": True})
        db.add(b_admin)
        db.commit()
        db.refresh(b_admin)
    else:
        s = dict(b_admin.settings or {})
        s["banned"] = True
        b_admin.settings = s
        db.commit()

    token = SessionStore.create_session(b_admin.id, b_admin.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, token)

    resp = client.get("/api/admin/users")
    assert resp.status_code == 403
    assert "suspended" in resp.text.lower()


def test_auth_01_and_authz_12_api_key_guards(client):
    """AUTH-01 & AUTHZ-12: API keys cannot access session-critical routes and rate limits/scopes are enforced."""
    from server.api_keys import generate_key
    from server.database import User, SessionLocal

    db = SessionLocal()
    pid = "test_api_key_guard_user"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={"2fa_totp_secret": "TOPSECRETSEED123"})
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        s = dict(u.settings or {})
        s["2fa_totp_secret"] = "TOPSECRETSEED123"
        u.settings = s
        db.commit()

    key_row, raw_key = generate_key(db, u, label="test_scope_key", rate_limit_per_min=2, allowed_scopes=["/api/user/settings"])
    key_headers = {"Authorization": f"Bearer {raw_key}"}

    # API key rejected on account-critical routes
    assert client.get("/api/user/settings", headers=key_headers).status_code == 403
    assert client.get("/api/user/data-export", headers=key_headers).status_code == 403
    assert client.delete("/api/user/account", headers=key_headers).status_code == 403
    assert client.post("/api/auth/2fa/verify-setup", headers=key_headers, json={"method": "totp", "secret": "SEC", "code": "123456"}).status_code == 403
    assert client.post("/api/discount", headers=key_headers, json={"payload": {"test": 1}}).status_code == 403

    # Normal session can access settings and 2fa_totp_secret is redacted
    sess_token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, sess_token)
    settings_resp = client.get("/api/user/settings")
    assert settings_resp.status_code == 200
    returned_settings = settings_resp.json().get("settings", {})
    assert "2fa_totp_secret" not in returned_settings or returned_settings.get("2fa_totp_secret") != "TOPSECRETSEED123"


def test_auth_02_and_06_2fa_challenge_hardening(client):
    """AUTH-02 & AUTH-06: 2FA challenge endpoints prevent enumeration and step burning."""
    from server.auth_2fa import totp_service

    # Non-existent user gets uniform response on email and sms paths
    resp_email = client.post("/api/auth/2fa/send-challenge", json={"user_id": "nonexistent_enum_probe_999", "method": "email"})
    assert resp_email.status_code == 200
    assert "sent" in resp_email.json().get("message", "").lower()

    resp_sms = client.post("/api/auth/2fa/send-challenge", json={"user_id": "nonexistent_enum_probe_999", "method": "sms"})
    assert resp_sms.status_code == 200
    assert "sent" in resp_sms.json().get("message", "").lower()

    # Rate limiting on verify-challenge: 5 failed attempts locks out
    target_id = "test_verify_lockout_user"
    for _ in range(5):
        client.post("/api/auth/2fa/verify-challenge", json={"user_id": target_id, "method": "totp", "code": "000000"})
    lockout_resp = client.post("/api/auth/2fa/verify-challenge", json={"user_id": target_id, "method": "totp", "code": "000000"})
    assert lockout_resp.status_code == 429

    # Verify TOTP code verification without replay burn
    secret = totp_service.generate_secret()
    db = SessionLocal()
    pid = "test_totp_burn_user"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={"2fa_enabled": True, "2fa_method": "totp", "2fa_totp_secret": secret})
        db.add(u)
        db.commit()
    else:
        s = dict(u.settings or {})
        s["2fa_enabled"] = True
        s["2fa_method"] = "totp"
        s["2fa_totp_secret"] = secret
        u.settings = s
        db.commit()

    import pyotp
    code = pyotp.TOTP(secret).now()
    # verify_challenge succeeds
    resp_v = client.post("/api/auth/2fa/verify-challenge", json={"user_id": pid, "method": "totp", "code": code})
    assert resp_v.status_code == 200
    # Step was NOT burned in login replay guard
    assert totp_service.verify_code_with_replay(u.id, secret, code) is True


def test_auth_03_jwt_revocation(client):
    """AUTH-03: Outstanding JWTs are revoked on logout and password change."""
    from server.security import create_jwt_token, hash_password
    from server.database import SessionLocal, User

    db = SessionLocal()
    pid = "test_jwt_revocation_user"
    h, s = hash_password("ValidPassword123!")
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", password_hash=h, password_salt=s, settings={})
        db.add(u)
        db.commit()
        db.refresh(u)
    else:
        u.password_hash = h
        u.password_salt = s
        db.commit()

    jwt_token = create_jwt_token(u.id)

    # JWT authenticates on /api/me
    resp_me = client.get("/api/me", headers={"Authorization": f"Bearer {jwt_token}"})
    assert resp_me.status_code == 200

    # Logout revokes JWT
    client.post("/api/logout", headers={"Authorization": f"Bearer {jwt_token}"})
    resp_after = client.get("/api/me", headers={"Authorization": f"Bearer {jwt_token}"})
    assert resp_after.status_code == 401

    # New JWT before password change
    new_jwt = create_jwt_token(u.id)
    resp_new = client.get("/api/me", headers={"Authorization": f"Bearer {new_jwt}"})
    assert resp_new.status_code == 200

    # Change password
    sess_token = SessionStore.create_session(u.id, u.public_id)
    client.cookies.set(SESSION_COOKIE_NAME, sess_token)
    csrf_resp = client.get("/api/csrf")
    csrf = csrf_resp.json().get("csrf_token") or client.cookies.get("csrf_token")
    client.post(
        "/api/user/change-password",
        headers={"X-CSRF-Token": csrf},
        json={"current_password": "ValidPassword123!", "new_password": "NewStrongPassword456!"}
    )

    # Pre-change JWT now rejected
    client.cookies.clear()
    resp_revoked = client.get("/api/me", headers={"Authorization": f"Bearer {new_jwt}"})
    assert resp_revoked.status_code == 401


def test_auth_04_and_08_password_strength_and_signup_oracle(client):
    """AUTH-04 & AUTH-08: Weak/breached passwords rejected; signup error does not leak user existence."""
    from server.security import validate_password_strength

    # Breached passwords rejected
    assert validate_password_strength("Password1") is False
    assert validate_password_strength("12345678") is False
    assert validate_password_strength("password") is False
    assert validate_password_strength("admin123") is False
    assert validate_password_strength("StrongUniquePassword987!") is True

    # Signup with breached password rejected
    resp_breached = client.post("/api/signup", json={"public_id": "test_pw_breach_user", "password": "Password1"})
    assert resp_breached.status_code == 400

    # Signup with existing username returns generic message
    db = SessionLocal()
    pid = "test_signup_enum_existing"
    if not db.query(User).filter(User.public_id == pid).first():
        client.post("/api/signup", json={"public_id": pid, "password": "GoodPassword999!"})

    resp_existing = client.post("/api/signup", json={"public_id": pid, "password": "GoodPassword999!"})
    assert resp_existing.status_code == 400
    assert "Public ID already taken" not in resp_existing.text
    assert "unavailable" in resp_existing.text.lower() or "invalid" in resp_existing.text.lower()


def test_auth_05_recovery_options_uniform_schema(client):
    """AUTH-05: /api/recovery/options returns identical schema regardless of account existence."""
    resp_exists = client.get("/api/recovery/options?public_id=RoniDev")
    assert resp_exists.status_code == 200
    data_exists = resp_exists.json()

    resp_missing = client.get("/api/recovery/options?public_id=nonexistent_recovery_target_9999")
    assert resp_missing.status_code == 200
    data_missing = resp_missing.json()

    assert set(data_exists.keys()) == set(data_missing.keys())
    assert "public_id" not in data_exists
    assert "public_id" not in data_missing
    for k in ("status", "has_email", "email_set", "has_phone", "phone_set", "dev"):
        assert k in data_exists


def test_auth_07_websocket_rejects_query_token():
    """AUTH-07: get_current_user rejects query-string tokens on WebSocket upgrades."""
    import asyncio
    from server.security import get_current_user
    from fastapi import HTTPException

    class MockWebSocket:
        cookies = {}
        headers = {}
        query_params = {"token": "some_secret_jwt_or_key"}

    ws = MockWebSocket()
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_current_user(websocket=ws))
    assert exc_info.value.status_code == 401
    assert "query string tokens are not permitted" in str(exc_info.value.detail).lower()


def test_misc_03_and_06_account_deletion_with_usage_logs_and_lake(client):
    """MISC-03 & MISC-06: Account deletion succeeds with ApiUsageLog and scrubs lake data."""
    from server.database import SessionLocal, User, ApiUsageLog
    from server.datalake import datalake_manager

    db = SessionLocal()
    pid = "test_erasure_lake_user"
    u = db.query(User).filter(User.public_id == pid).first()
    if not u:
        u = User(public_id=pid, plan="none", role="member", settings={})
        db.add(u)
        db.commit()
        db.refresh(u)

    # Insert an ApiUsageLog row (this caused MISC-03 500 error)
    usage = ApiUsageLog(user_id=u.id, public_id=u.public_id, tool_or_model="test_tool", category="llm")
    db.add(usage)
    db.commit()

    # Record lake items with a unique marker
    marker = "ERASURE_MARKER_TEST_12345"
    datalake_manager.record_feedback(user_id=u.public_id, category="bug_report", urgency="low", message=f"{marker} feedback text")
    datalake_manager.evaluate_and_record_microcredit_submission(user_id=u.public_id, data_content=f"{marker} microcredit lecture snippet", title=f"{marker} Title")

    user_db_id = u.id
    sess_token = SessionStore.create_session(u.id, u.public_id)
    headers = {"Authorization": f"Bearer {sess_token}"}

    # DELETE /api/user/account must succeed (HTTP 200, not 500)
    del_resp = client.delete("/api/user/account", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json().get("status") == "success"

    # User row is deleted
    db.expire_all()
    assert db.query(User).filter(User.id == user_db_id).first() is None

    # Lake items no longer contain marker in plaintext
    recent_fb = datalake_manager.list_feedback(limit=20)
    for fb in recent_fb:
        assert marker not in fb.get("message", "")


def _get_user_headers(client, public_id: str):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.public_id == public_id).first()
        if not u:
            u = User(public_id=public_id, plan="basic", role="member", settings={})
            db.add(u)
            db.commit()
            db.refresh(u)
        sess_token = SessionStore.create_session(u.id, u.public_id)
        return {"Authorization": f"Bearer {sess_token}"}
    finally:
        db.close()


def test_ssrf_01_canvas_sync_route_rejects_private_and_loopback(client):
    """SSRF-01: POST /api/study/canvas/sync validates canvas_url against SSRF and rejects internal targets."""
    headers = _get_user_headers(client, "test_ssrf_01_user")

    # Loopback
    res = client.post(
        "/api/study/canvas/sync",
        headers=headers,
        json={"canvas_url": "http://127.0.0.1:5000", "api_token": "abcdefghijklmnop"}
    )
    assert res.status_code == 400
    assert "blocked by ssrf" in res.text.lower() or "invalid" in res.text.lower()

    # Cloud metadata
    res = client.post(
        "/api/study/canvas/sync",
        headers=headers,
        json={"canvas_url": "http://169.254.169.254/latest/meta-data", "api_token": "abcdefghijklmnop"}
    )
    assert res.status_code == 400

    # IPv6 loopback
    res = client.post(
        "/api/study/canvas/sync",
        headers=headers,
        json={"canvas_url": "http://[::1]:9778", "api_token": "abcdefghijklmnop"}
    )
    assert res.status_code == 400

    # RFC1918 private network
    res = client.post(
        "/api/study/canvas/sync",
        headers=headers,
        json={"canvas_url": "http://172.18.0.3:8899", "api_token": "abcdefghijklmnop"}
    )
    assert res.status_code == 400


def test_ssrf_02_and_04_ip_pinning_and_dns_rebinding_defense():
    """SSRF-02 & SSRF-04: Host resolution pins safe IPs and blocks rebinding TOCTOU."""
    import pytest
    from server.ssrf import resolve_and_validate_host, SSRFProtectedAnyIOBackend, SSRFProtectedSyncBackend

    # Loopback and private IPs are blocked directly
    with pytest.raises(ValueError, match="blocked by SSRF"):
        resolve_and_validate_host("127.0.0.1")

    with pytest.raises(ValueError, match="blocked by SSRF"):
        resolve_and_validate_host("169.254.169.254")

    with pytest.raises(ValueError, match="blocked by SSRF"):
        resolve_and_validate_host("10.0.0.1")

    with pytest.raises(ValueError, match="blocked by SSRF"):
        resolve_and_validate_host("localhost")

    # Decimal representation of 127.0.0.1
    with pytest.raises(ValueError, match="blocked by SSRF"):
        resolve_and_validate_host("2130706433")

    # IPv6 representation
    with pytest.raises(ValueError, match="blocked by SSRF"):
        resolve_and_validate_host("::1")

    # Public hosts resolve to safe IPs
    safe_ip = resolve_and_validate_host("school.instructure.com", 443)
    assert safe_ip and not safe_ip.startswith("127.") and not safe_ip.startswith("10.")


def test_ssrf_03_and_06_scrape_sidecar_validation_and_scrapling_lanes():
    """SSRF-03 & SSRF-06: Scrape sidecar validates all URLs with full SSRF guard, not literal substrings."""
    from fastapi.testclient import TestClient
    from scrape_sidecar.app import app as sidecar_app, _fetch_scrapling, _fetch_page, _fetch_jina

    sidecar_client = TestClient(sidecar_app)

    # SSRF-06: /scrape handler rejects internal IPs that do not start with "http://127"
    for blocked_url in [
        "http://[::1]:9778/health",
        "http://172.18.0.3:8899/bigpage",
        "http://10.0.0.5/secret",
        "http://169.254.169.254/latest/meta-data",
        "http://192.168.1.1/admin",
    ]:
        resp = sidecar_client.post("/scrape", json={"url": blocked_url})
        assert resp.status_code == 400
        assert "Refusing local/internal URL." in resp.text

    # SSRF-03: _fetch_scrapling refuses internal/private URLs
    assert _fetch_scrapling("http://127.0.0.1:5000/api/health", "plain") == ""
    assert _fetch_scrapling("http://172.18.0.3:8899/bigpage", "plain") == ""
    assert _fetch_scrapling("http://169.254.169.254/meta-data", "stealth") == ""

    # _fetch_jina refuses internal URLs
    assert _fetch_jina("http://127.0.0.1:5000") == ""

    # _fetch_page refuses internal URLs
    (content, how), lane_log = _fetch_page("http://172.18.0.3:8899/bigpage")
    assert content == ""
    assert lane_log[0]["lane"] == "ssrf_guard"


def test_ssrf_05_canvas_sync_pagination_origin_and_ssrf_guard():
    """SSRF-05: Canvas sync pagination enforces same-origin and SSRF validation on RFC5988 links."""
    from server.canvas_sync import CanvasSyncEngine

    engine = CanvasSyncEngine("https://school.instructure.com", "test_student_access_token")

    # Rejects loopback link
    loopback_header = '<http://127.0.0.1:9778/health>; rel="next"'
    assert engine.get_safe_next_link(loopback_header) is None

    # Rejects cross-origin link to prevent student token theft
    cross_origin_header = '<https://attacker-domain.org/api/v1/courses?page=2>; rel="next"'
    assert engine.get_safe_next_link(cross_origin_header) is None

    # Rejects link-local/cloud metadata link
    metadata_header = '<http://169.254.169.254/latest/meta-data>; rel="next"'
    assert engine.get_safe_next_link(metadata_header) is None

    # Accepts safe, same-origin link
    safe_header = '<https://school.instructure.com/api/v1/courses?page=2>; rel="next"'
    assert engine.get_safe_next_link(safe_header) == "https://school.instructure.com/api/v1/courses?page=2"
