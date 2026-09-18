"""Unit tests for Extension Versioning, Update Alerts, and ZIP Packaging API."""
import zipfile
import io
import pytest
from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)


def test_get_extension_version():
    """Verify GET /api/extension/version returns valid version metadata and release notes."""
    resp = client.get("/api/extension/version")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "latest_version" in data
    assert len(data["latest_version"]) >= 3
    assert "release_notes" in data
    # Grouped notes: a section heading plus at least one item. This used to be
    # `>= 3`, an arbitrary count rather than an invariant — a legitimate
    # one-item bugfix release (2.7.3) cannot reach three lines while its notes
    # are still correctly structured, so the old assertion would have failed a
    # perfectly good release. What actually matters is that the notes are a
    # structured list and not one blob.
    notes = data["release_notes"]
    assert len(notes) >= 2, f"notes must be a heading plus at least one item, got {notes!r}"
    assert notes[0].strip(), "the first line must be a non-empty section heading"
    assert any(n.strip() for n in notes[1:]), "there must be at least one note item"
    assert data["download_url"] == "/api/extension/download"


def test_check_extension_update_outdated():
    """Verify POST /api/extension/check-update detects when client has an older version."""
    resp = client.post("/api/extension/check-update", json={"current_version": "1.0.0"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["update_available"] is True
    assert "download_url" in data


def test_check_extension_update_latest():
    """Verify POST /api/extension/check-update detects when client is up to date."""
    v_resp = client.get("/api/extension/version")
    latest = v_resp.json()["latest_version"]

    resp = client.post("/api/extension/check-update", json={"current_version": latest})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["update_available"] is False


def test_download_extension_zip():
    """Verify GET /api/extension/download generates a valid streaming ZIP archive."""
    resp = client.get("/api/extension/download")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert "attachment" in resp.headers["content-disposition"]
    assert "helpotron-extension" in resp.headers["content-disposition"]

    # Verify that the zip content is valid and contains core extension files
    zip_bytes = io.BytesIO(resp.content)
    with zipfile.ZipFile(zip_bytes, "r") as zf:
        namelist = zf.namelist()
        assert "manifest.json" in namelist
        assert "background.js" in namelist
        assert "popup.html" in namelist
        assert "popup.js" in namelist
