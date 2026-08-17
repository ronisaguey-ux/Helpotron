import asyncio
import pytest
from fastapi.testclient import TestClient

from server.database import init_db, SessionLocal, User
from server.main import app
from server.user_settings_service import user_settings_service
from server.admin_advanced import admin_advanced_service

init_db()
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_users():
    db = SessionLocal()
    try:
        u1 = db.query(User).filter(User.public_id == "test_student_user").first()
        if not u1:
            u1 = User(public_id="test_student_user", plan="basic", credits=20.0, settings={})
            db.add(u1)
        admin = db.query(User).filter(User.public_id == "RoniDev").first()
        if not admin:
            admin = User(public_id="RoniDev", plan="elite", credits=100.0, settings={})
            db.add(admin)
        db.commit()
    finally:
        db.close()


def test_user_settings_defaults_and_update():
    headers = {"X-Public-ID": "test_student_user"}
    resp = client.get("/api/user/settings", headers=headers)
    assert resp.status_code == 200
    settings = resp.json()["settings"]
    assert "personas" in settings
    assert len(settings["personas"]) >= 3
    assert settings["display"]["theme"] in ("dark", "light", "auto")

    # Update display and localization
    patch_resp = client.patch(
        "/api/user/settings",
        json={
            "display": {"theme": "light", "font_size": "large"},
            "localization": {"language": "es"},
        },
        headers=headers,
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()["settings"]
    assert updated["display"]["theme"] == "light"
    assert updated["localization"]["language"] == "es"


def test_writing_personas_lifecycle():
    headers = {"X-Public-ID": "test_student_user"}
    # Create new persona
    p_resp = client.post(
        "/api/user/personas",
        json={
            "name": "Creative Novelist",
            "tone": "creative",
            "vocabulary": "vivid",
            "sentence_length": "flowing",
            "formality": 40,
        },
        headers=headers,
    )
    assert p_resp.status_code == 200
    persona = p_resp.json()["persona"]
    p_id = persona["id"]

    # Switch to new persona
    sw_resp = client.post("/api/user/personas/switch", json={"persona_id": p_id}, headers=headers)
    assert sw_resp.status_code == 200
    assert sw_resp.json()["active_persona_id"] == p_id

    # Delete persona
    del_resp = client.delete(f"/api/user/personas/{p_id}", headers=headers)
    assert del_resp.status_code == 200


def test_ai_citation_generator_and_library():
    headers = {"X-Public-ID": "test_student_user"}
    # Generate APA citation
    resp = client.post(
        "/api/user/citations/generate",
        json={
            "style": "APA",
            "source_type": "journal_article",
            "title": "Quantum Computation and Syntactic Entanglement",
            "authors": ["Turing, A.", "Shannon, C."],
            "year": "2026",
            "url_or_doi": "https://doi.org/10.1016/j.qc.2026.01",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    cit = resp.json()["citation"]
    assert "Turing, A., Shannon, C." in cit["formatted_text"]
    assert "2026" in cit["formatted_text"]

    # Save to library
    save_resp = client.post("/api/user/citations/library", json=cit, headers=headers)
    assert save_resp.status_code == 200
    assert save_resp.json()["library_count"] >= 1

    # Fetch library
    lib_resp = client.get("/api/user/citations/library", headers=headers)
    assert lib_resp.status_code == 200
    assert len(lib_resp.json()["library"]) >= 1


def test_originality_checker():
    headers = {"X-Public-ID": "test_student_user"}
    resp = client.post(
        "/api/user/originality/check",
        json={
            "content": "In this empirical study, we investigate the fundamental correlations between cognitive syntactic processing and neural linguistic cadence across diverse academic paradigms.",
            "auto_rewrite": False,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "originality_score" in data
    assert "burstiness" in data
    assert "is_compliant" in data


def test_goals_and_data_export():
    headers = {"X-Public-ID": "test_student_user"}
    # Update goal
    g_resp = client.post("/api/user/goals/target", json={"weekly_target": 7}, headers=headers)
    assert g_resp.status_code == 200
    assert g_resp.json()["goals"]["weekly_target_assignments"] == 7

    # Data export (GDPR)
    exp_resp = client.get("/api/user/data-export", headers=headers)
    assert exp_resp.status_code == 200
    export_json = exp_resp.json()["data"]
    assert "export_metadata" in export_json
    assert "settings" in export_json

    # History CSV export
    csv_resp = client.get("/api/user/history/export-csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]


def test_admin_advanced_endpoints():
    admin_headers = {"X-Public-ID": "RoniDev"}

    # 1. System health
    health_resp = client.get("/api/admin/system-health", headers=admin_headers)
    assert health_resp.status_code == 200
    health = health_resp.json()
    assert "uptime_percentage" in health
    assert "api_latencies_ms" in health

    # 2. Moderation queue
    mod_resp = client.get("/api/admin/moderation", headers=admin_headers)
    assert mod_resp.status_code == 200
    assert "queue" in mod_resp.json()

    # 3. Model metrics & override
    metrics_resp = client.get("/api/admin/model-metrics", headers=admin_headers)
    assert metrics_resp.status_code == 200
    assert "models" in metrics_resp.json()

    override_resp = client.post(
        "/api/admin/model-metrics/override",
        json={"task_type": "essay", "model_id": "deepseek-v4-flash"},
        headers=admin_headers,
    )
    assert override_resp.status_code == 200
    assert override_resp.json()["overrides"]["essay"] == "deepseek-v4-flash"
