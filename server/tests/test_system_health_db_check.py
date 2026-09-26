import pytest
from unittest.mock import MagicMock
from server.admin_advanced import admin_advanced_service


def test_system_health_reports_database_down():
    mock_db = MagicMock()
    mock_db.execute.side_effect = Exception("Database unreachable")
    res = admin_advanced_service.get_system_health(mock_db)
    assert "db_alive" in res, "db_alive key missing from get_system_health response"
    assert res["db_alive"] is False, f"Expected db_alive to be False, got {res.get('db_alive')}"


def test_system_health_reports_database_up():
    mock_db = MagicMock()
    res = admin_advanced_service.get_system_health(mock_db)
    assert "db_alive" in res
    assert res["db_alive"] is True
