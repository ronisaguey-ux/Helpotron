"""Endpoint tests for /api/export/*/latex (08-30, user-requested feature)."""
import pytest

from server.database import SessionLocal, StudyMaterial, User


def _make_user_and_headers(public_id: str):
    from server.tests.conftest import _get_auth_headers_for_user
    return _get_auth_headers_for_user(public_id)


def _seed_material(user_id: int, kind: str, content: str) -> int:
    db = SessionLocal()
    try:
        m = StudyMaterial(user_id=user_id, kind=kind, content=content)
        db.add(m)
        db.commit()
        db.refresh(m)
        return m.id
    finally:
        db.close()


def test_study_guide_latex_endpoint(client, unique_user, auth_headers):
    from server.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.public_id == unique_user).first().id
    db.close()
    mid = _seed_material(uid, "study_guide", "# Bio Notes\n\n## Chapter 1\n\nDNA is $A\\to T$.\n")
    r = client.get(f"/api/export/study-guide/{mid}/latex", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/x-tex")
    assert f"study_guide_{mid}.tex" in r.headers["content-disposition"]
    assert "\\documentclass[11pt]{article}" in r.text
    assert "\\title{Bio Notes}" in r.text
    assert "\\subsection{Chapter 1}" in r.text
    assert "$A\\to T$" in r.text


def test_summary_latex_endpoint(client, unique_user, auth_headers):
    from server.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.public_id == unique_user).first().id
    db.close()
    mid = _seed_material(uid, "summary", "## Overview\n\nShort summary with 100% accuracy.\n")
    r = client.get(f"/api/export/summary/{mid}/latex", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/x-tex")
    assert f"summary_{mid}.tex" in r.headers["content-disposition"]
    assert "\\section{Overview}" in r.text
    assert "100\\%" in r.text


def test_latex_requires_matching_kind(client, unique_user, auth_headers):
    from server.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.public_id == unique_user).first().id
    db.close()
    mid = _seed_material(uid, "flashcards", '[{"q": "a", "a": "b"}]')
    r = client.get(f"/api/export/study-guide/{mid}/latex", headers=auth_headers)
    assert r.status_code == 404


def test_latex_is_owner_scoped(client, unique_user, auth_headers):
    from server.database import SessionLocal, User
    db = SessionLocal()
    uid = db.query(User).filter(User.public_id == unique_user).first().id
    db.close()
    other = _make_user_and_headers(f"other-{unique_user}")
    mid = _seed_material(uid, "study_guide", "# Priv\n\nsecret\n")
    r = client.get(f"/api/export/study-guide/{mid}/latex", headers=other)
    assert r.status_code == 404


def test_latex_missing_material_404(client, unique_user, auth_headers):
    r = client.get("/api/export/study-guide/999999999/latex", headers=auth_headers)
    assert r.status_code == 404
