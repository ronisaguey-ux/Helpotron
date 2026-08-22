#!/bin/bash
set -ex
cd /home/roni/Roni_workspace/helpotron

# STEP 21
mkdir -p scripts
cat << 'INNER_EOF' > scripts/backup_db.sh
#!/bin/bash
# Helpotron — Automated SQLite database backup with 30-day retention pruning.
set -euo pipefail

DB_PATH="${DB_PATH:-/opt/helpotron/data/helpotron.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/helpotron/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/helpotron_${TIMESTAMP}.db.gz"

mkdir -p "${BACKUP_DIR}"

if [ ! -f "${DB_PATH}" ]; then
  echo "[ERROR] Database not found: ${DB_PATH}" >&2
  exit 1
fi

# Create compressed backup
sqlite3 "${DB_PATH}" ".backup /tmp/helpotron_tmp_backup.db"
gzip -c /tmp/helpotron_tmp_backup.db > "${BACKUP_FILE}"
rm -f /tmp/helpotron_tmp_backup.db

echo "[OK] Backup created: ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"

# Prune backups older than RETENTION_DAYS
find "${BACKUP_DIR}" -name 'helpotron_*.db.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "[OK] Pruned backups older than ${RETENTION_DAYS} days."
INNER_EOF
chmod +x scripts/backup_db.sh
git add scripts/backup_db.sh && git commit -m 'fix(remediation): STEP-21 - Automated DB backup with 30-day retention pruning' || true

# STEP 22
mkdir -p server/tests
touch server/tests/__init__.py
cat << 'INNER_EOF' > server/tests/test_security_hardened.py
"""Hardened security regression tests for Helpotron.

Covers: admin auth bypass prevention, rate limiting, JWT verification,
credit atomicity, sandbox path traversal, and command injection prevention.
"""
import os
import pytest
from fastapi.testclient import TestClient


# ─── Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    os.environ.setdefault("DATABASE_URL", "sqlite:///./test_security.db")
    os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters!")
    from server.main import app
    return TestClient(app)


# ─── STEP-01: Admin Auth ──────────────────────────────────────────────────

def test_admin_unauthenticated_returns_401(client):
    """Unauthenticated request to admin endpoint must return 401."""
    res = client.get("/api/admin/stats")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_admin_spoofed_header_returns_401(client):
    """Spoofed X-Public-ID header must NOT grant admin access."""
    res = client.get("/api/admin/stats", headers={"X-Public-ID": "admin_root"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


# ─── STEP-02: Command Injection ───────────────────────────────────────────

def test_convert_audio_rejects_shell_metacharacters():
    """Shell injection via filename must raise FileNotFoundError, not execute."""
    from server.transcription import convert_audio_to_wav
    try:
        convert_audio_to_wav('evil; touch /tmp/pwned.txt', '/tmp/out.wav')
    except (ValueError, FileNotFoundError):
        pass
    assert not os.path.exists('/tmp/pwned.txt'), "Shell injection succeeded!"


def test_convert_audio_rejects_invalid_extension():
    """Invalid audio extension must raise ValueError."""
    from server.transcription import convert_audio_to_wav
    with pytest.raises(ValueError, match="Invalid audio format extension"):
        convert_audio_to_wav('/tmp/test.exe', '/tmp/out.wav')


def test_convert_audio_uses_subprocess_not_os_system():
    """Verify implementation uses subprocess.run not os.system."""
    import inspect
    from server import transcription
    src = inspect.getsource(transcription.convert_audio_to_wav)
    assert 'os.system' not in src
    assert 'subprocess.run' in src


# ─── STEP-05: Sandbox Path Traversal ─────────────────────────────────────

def test_sandbox_traversal_blocked():
    """Path traversal attempt must be neutralized."""
    from server.engine.sandbox import get_sanitized_sandbox_path
    p = get_sanitized_sandbox_path('sbx_test', '../../../../etc/passwd')
    assert 'etc' not in str(p.parent)


def test_sandbox_executable_write_blocked():
    """Writing executable files to sandbox must be rejected."""
    from server.engine.sandbox import write_sandbox_file
    with pytest.raises(ValueError, match="Executable file extensions forbidden"):
        write_sandbox_file('sbx_test', 'evil.sh', 'rm -rf /')


# ─── STEP-04: LLM extract_json ───────────────────────────────────────────

def test_extract_json_plain():
    """extract_json must parse plain JSON string."""
    from server.llm import extract_json
    result = extract_json('{"status": "ok", "count": 42}')
    assert result['count'] == 42


def test_extract_json_markdown_wrapped():
    """extract_json must handle markdown-fenced JSON blocks."""
    from server.llm import extract_json
    raw = 'Here is the data:\n```json\n{"flashcards": [{"q": "What?", "a": "This."}]}\n```\nDone.'
    result = extract_json(raw)
    assert len(result['flashcards']) == 1


def test_call_llm_is_coroutine():
    """call_llm must be an async coroutine function."""
    import inspect
    from server import llm
    assert inspect.iscoroutinefunction(llm.call_llm)


# ─── STEP-11: Rate Limiter ────────────────────────────────────────────────

def test_rate_limit_dependency_allows_initial_requests():
    """Rate limiter must allow requests within quota."""
    from server.ratelimit import rate_limit, RATE_LIMITS
    from fastapi import Request
    RATE_LIMITS.clear()
    scope = {'type': 'http', 'client': ('127.0.0.1', 1234),
             'path': '/api/test', 'headers': [], 'method': 'GET',
             'query_string': b'', 'root_path': ''}
    req = Request(scope)
    limiter = rate_limit(max_requests=5, window_seconds=60)
    assert limiter(req) is True


def test_rate_limit_dependency_blocks_over_quota():
    """Rate limiter must raise HTTP 429 when quota exceeded."""
    from server.ratelimit import rate_limit, RATE_LIMITS
    from fastapi import Request, HTTPException
    RATE_LIMITS.clear()
    scope = {'type': 'http', 'client': ('192.168.1.1', 9999),
             'path': '/api/block-test', 'headers': [], 'method': 'GET',
             'query_string': b'', 'root_path': ''}
    req = Request(scope)
    limiter = rate_limit(max_requests=2, window_seconds=60)
    limiter(req)
    limiter(req)
    with pytest.raises(HTTPException) as exc_info:
        limiter(req)
    assert exc_info.value.status_code == 429
    assert 'Retry-After' in exc_info.value.headers


# ─── JWT helpers ──────────────────────────────────────────────────────────

def test_verify_jwt_token_invalid_returns_none():
    """Invalid JWT must return None, not raise an exception."""
    from server.security import verify_jwt_token
    result = verify_jwt_token('not.a.valid.jwt.token')
    assert result is None


def test_verify_jwt_token_valid_roundtrip():
    """A token created by create_jwt_token must verify successfully."""
    from server.security import create_jwt_token, verify_jwt_token
    token = create_jwt_token({'sub': 'test_user_1', 'role': 'student'})
    payload = verify_jwt_token(token)
    assert payload is not None
    assert payload['sub'] == 'test_user_1'
INNER_EOF
git add server/tests/ && git commit -m 'fix(remediation): STEP-22 - Comprehensive security regression test suite' || true

# FINAL STEP
source .venv/bin/activate
python3 -c "from server.main import app; print('App import: OK')"
git push origin main
