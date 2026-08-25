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