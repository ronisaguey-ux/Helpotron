"""Tests for extension release announcements (09-03): auto-synced releases,
per-user read receipts, admin annotation. Uses a 9.4.x version family plus a
pre-test cleanup so reruns against the shared test DB stay deterministic."""
import pytest
from fastapi.testclient import TestClient

from server.database import (
    ExtensionRelease,
    ExtensionReleaseRead,
    SessionLocal,
    User,
)
from server.main import app
from server.security import create_jwt_token
from server import routes_extension

client = TestClient(app)

USER_A = "ext_release_user_a"
USER_B = "ext_release_user_b"
ADMIN = "ext_release_admin"


def _mk_user(public_id: str, role: str = "user") -> str:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.public_id == public_id).first()
        if not user:
            # require_admin checks the USER ROW's role column, not the token claim
            user = User(public_id=public_id, plan="basic", credits=10.0, settings={}, role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_jwt_token(user_id=user.id, role=role)
    finally:
        db.close()
    return token


@pytest.fixture(autouse=True)
def _clean_release_rows():
    """Shared session-scoped test DB persists between runs — purge the 9.4.x
    rows and our users' receipts so every run starts clean."""
    db = SessionLocal()
    try:
        db.query(ExtensionReleaseRead).filter(
            ExtensionReleaseRead.user_id.in_([USER_A, USER_B])
        ).delete(synchronize_session=False)
        db.query(ExtensionRelease).filter(ExtensionRelease.version.like("9.4.%")).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _set_manifest_version(monkeypatch, version: str) -> None:
    monkeypatch.setattr(routes_extension, "get_current_manifest", lambda: {"version": version})


def _releases(monkeypatch, version: str, headers=None) -> list:
    _set_manifest_version(monkeypatch, version)
    resp = client.get("/api/extension/releases", headers=headers)
    assert resp.status_code == 200
    return resp.json()["releases"]


def test_sync_creates_release_from_manifest(monkeypatch):
    """A manifest bump the server has never seen becomes a release row —
    first ever release is major."""
    releases = _releases(monkeypatch, "9.4.0")
    top = releases[0]
    assert top["version"] == "9.4.0"
    assert top["is_major"] is True
    assert top["title"] == "Helpotron Extension v9.4.0"


def test_patch_bump_is_not_major(monkeypatch):
    _releases(monkeypatch, "9.4.0")
    releases = _releases(monkeypatch, "9.4.1")
    assert releases[0]["version"] == "9.4.1"
    assert releases[0]["is_major"] is False
    prev = next(r for r in releases if r["version"] == "9.4.0")
    assert prev["is_major"] is True  # history remembered, flags unchanged


def test_read_requires_auth(monkeypatch):
    releases = _releases(monkeypatch, "9.4.0")
    rid = releases[0]["id"]
    resp = client.post(f"/api/extension/releases/{rid}/read")
    assert resp.status_code in (401, 403)


def test_read_receipt_is_per_user_and_idempotent(monkeypatch):
    releases = _releases(monkeypatch, "9.4.0")
    rid = releases[0]["id"]
    token_a = _mk_user(USER_A)
    token_b = _mk_user(USER_B)

    assert client.post(f"/api/extension/releases/{rid}/read", headers={"Authorization": f"Bearer {token_a}"}).status_code == 200
    # Idempotent re-ack
    assert client.post(f"/api/extension/releases/{rid}/read", headers={"Authorization": f"Bearer {token_a}"}).status_code == 200

    # A sees read=True, B (per-user receipt) still unread
    ra = _releases(monkeypatch, "9.4.0", headers={"Authorization": f"Bearer {token_a}"})
    rb = _releases(monkeypatch, "9.4.0", headers={"Authorization": f"Bearer {token_b}"})
    assert next(r for r in ra if r["id"] == rid)["read"] is True
    assert next(r for r in rb if r["id"] == rid)["read"] is False

    # Anonymous caller never sees acked state (no identity to attach it to)
    anon = _releases(monkeypatch, "9.4.0")
    assert next(r for r in anon if r["id"] == rid)["read"] is False


def test_admin_publish_annotates_release(monkeypatch):
    releases = _releases(monkeypatch, "9.4.0")
    assert releases[0]["notes"] == "Helpotron Extension updated to v9.4.0."

    token_user = _mk_user(USER_A)
    forbidden = client.post(
        "/api/extension/releases",
        json={"version": "9.4.0", "notes": "hijacked"},
        headers={"Authorization": f"Bearer {token_user}"},
    )
    assert forbidden.status_code == 403

    token_admin = _mk_user(ADMIN, role="admin")
    ok = client.post(
        "/api/extension/releases",
        json={"version": "9.4.0", "title": "Big redesign", "notes": "line one\nline two", "is_major": True},
        headers={"Authorization": f"Bearer {token_admin}"},
    )
    assert ok.status_code == 200

    after = _releases(monkeypatch, "9.4.0")
    top = after[0]
    assert top["title"] == "Big redesign"
    assert top["notes"] == "line one\nline two"
    assert top["is_major"] is True


def test_version_endpoint_serves_db_notes(monkeypatch):
    releases = _releases(monkeypatch, "9.4.0")
    assert releases[0]["notes"] == "Helpotron Extension updated to v9.4.0."

    # Admin annotates everything, then /version must reflect the DB row
    token_admin = _mk_user(ADMIN, role="admin")
    client.post(
        "/api/extension/releases",
        json={"version": "9.4.0", "notes": "fixed everything\nship it"},
        headers={"Authorization": f"Bearer {token_admin}"},
    )
    _set_manifest_version(monkeypatch, "9.4.0")
    resp = client.get("/api/extension/version")
    assert resp.status_code == 200
    data = resp.json()
    assert data["latest_version"] == "9.4.0"
    assert data["release_notes"] == ["fixed everything", "ship it"]
    assert data["is_critical_update"] is True


def test_privacy_and_guide_pages_serve_publicly():
    """CWS launch prep: the privacy-policy URL and the /extension-guide link
    must render real server-side HTML with no auth and no JS."""
    for path in ("/privacy-policy", "/extension-guide"):
        resp = client.get(path)
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/html")
        assert "<!doctype html>" in resp.text.lower()
        assert len(resp.text) > 500
