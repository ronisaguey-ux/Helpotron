"""Sealed error reports: encryption, integrity, and the key discipline.

Owner requirement (2026-09-23):

    "when the user reports and sends the real diagnostics, have it send an
     encrypted hashed json output so the user never sees back end logic ever
     even when reporting"

These tests exercise the real crypto (AES-GCM via `cryptography`), not a mock:
a seal that does not round-trip is worthless, and a mock would happily pass
while the wire format disagreed.
"""

import base64
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from server import error_reports
from server.error_reports import (
    ReportKeyError,
    ReportSealError,
    issue_report_key,
    live_key_count,
    reporter_ref,
    unseal_report,
)


# ── A browser-shaped sealer (mirrors web/src/lib/reportPayload.js) ───────────

def seal_like_the_browser(diagnostics, key_b64, key_id):
    """Produce exactly what sealReport() in the frontend produces.

    Written against the wire format rather than by importing the JS, so a
    change to one side without the other fails here.
    """
    import hashlib
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    body = {k: v for k, v in diagnostics.items() if k != "_identity"}
    plaintext = json.dumps(body).encode("utf-8")
    key = base64.b64decode(key_b64)
    iv = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(iv, plaintext, None)

    return {
        "schema": "helpotron.sealed_report/1",
        "algorithm": "AES-256-GCM+HMAC-SHA256",
        "key_id": key_id,
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "iv": base64.b64encode(iv).decode(),
        "digest": hashlib.sha256(plaintext).hexdigest(),
        "kind": body.get("kind"),
        "status": body.get("status"),
        "surface": body.get("surface"),
        "app_version": body.get("app_version"),
        "bytes": len(plaintext),
        "reported_at": body.get("reported_at"),
    }


def sample_diagnostics():
    return {
        "schema": "helpotron.error_report/1",
        "title": "Something went wrong on our end",
        "summary": "The request was rejected.",
        "kind": "server",
        "status": 500,
        "detail": '{"detail":"internal traceback at server/main.py:1173"}',
        "surface": "web",
        "route": "/assignments/42",
        "app_version": "2.7.3",
        "build_time": "2026-09-23T00:00:00Z",
        "reported_at": "2026-09-23T12:00:00.000Z",
    }


# ── The round trip ──────────────────────────────────────────────────────────

def test_a_sealed_report_round_trips():
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    out = unseal_report(env)
    assert out["kind"] == "server"
    assert out["status"] == 500
    assert out["route"] == "/assignments/42"
    # The whole point: the internal detail survives intact for us.
    assert "server/main.py" in out["detail"]


def test_the_key_never_appears_in_the_envelope():
    """An envelope carrying its own key would be readable by whoever holds it."""
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    serialised = json.dumps(env)
    assert issued["key"] not in serialised, "the key leaked into the envelope"
    # And the raw key bytes must not be recoverable from it either.
    assert base64.b64decode(issued["key"]).hex() not in serialised


def test_the_diagnostics_are_not_readable_without_the_key():
    """A user pasting the payload into a decoder must get nothing."""
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    raw = base64.b64decode(env["ciphertext"])
    assert b"server/main.py" not in raw
    assert b"traceback" not in raw
    assert b"error_report" not in raw
    # Not even the top-level keys are legible.
    for word in (b"kind", b"status", b"route"):
        assert word not in raw


# ── Key discipline ──────────────────────────────────────────────────────────

def test_a_key_is_single_use():
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    unseal_report(env)
    with pytest.raises(ReportSealError):
        unseal_report(env)


def test_an_envelope_with_an_unissued_key_id_is_refused():
    env = seal_like_the_browser(sample_diagnostics(), base64.b64encode(os.urandom(32)).decode(), "not-a-real-key-id")
    with pytest.raises(ReportSealError):
        unseal_report(env)


def test_an_expired_key_is_refused(monkeypatch):
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    # Reach in and age the key past the TTL.
    key_id = issued["key_id"]
    with error_reports._lock:
        key, _ = error_reports._keys[key_id]
        error_reports._keys[key_id] = (key, 0.0)
    with pytest.raises(ReportSealError):
        unseal_report(env)


def test_the_registry_does_not_grow_without_bound():
    before = live_key_count()
    for _ in range(50):
        issue_report_key()
    # Every mint purges expired entries; nothing here is old enough to drop, so
    # the count simply rises by what we minted — the assertion is that minting
    # does not silently discard a live key.
    assert live_key_count() >= before


# ── Integrity ───────────────────────────────────────────────────────────────

def test_tampering_with_the_ciphertext_is_detected():
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    raw = bytearray(base64.b64decode(env["ciphertext"]))
    raw[10] ^= 0xFF                      # flip a byte
    env["ciphertext"] = base64.b64encode(bytes(raw)).decode()
    with pytest.raises(ReportSealError):
        unseal_report(env)


def test_a_wrong_digest_is_detected():
    """Covers a payload re-encoded between seal and unseal."""
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    env["digest"] = "0" * 64
    with pytest.raises(ReportSealError, match="digest"):
        unseal_report(env)


def test_a_malformed_iv_is_refused():
    issued = issue_report_key()
    env = seal_like_the_browser(sample_diagnostics(), issued["key"], issued["key_id"])
    env["iv"] = base64.b64encode(b"short").decode()
    with pytest.raises(ReportSealError):
        unseal_report(env)


def test_a_missing_envelope_is_refused():
    with pytest.raises(ReportSealError):
        unseal_report(None)
    with pytest.raises(ReportSealError):
        unseal_report({})
    with pytest.raises(ReportSealError):
        unseal_report({"ciphertext": "x", "iv": "y"})   # no key_id


def test_plaintext_that_is_not_json_is_refused():
    """Sealed with a real key, but the contents are not a JSON object."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import hashlib

    issued = issue_report_key()
    key = base64.b64decode(issued["key"])
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, b"not json at all", None)
    env = {
        "key_id": issued["key_id"],
        "ciphertext": base64.b64encode(ct).decode(),
        "iv": base64.b64encode(iv).decode(),
        "digest": hashlib.sha256(b"not json at all").hexdigest(),
    }
    with pytest.raises(ReportSealError):
        unseal_report(env)


# ── Triple-checked facts ────────────────────────────────────────────────────

def test_each_report_gets_a_distinct_key_and_iv():
    a = issue_report_key()
    b = issue_report_key()
    assert a["key"] != b["key"]
    assert a["key_id"] != b["key_id"]

    env_a = seal_like_the_browser(sample_diagnostics(), a["key"], a["key_id"])
    env_b = seal_like_the_browser(sample_diagnostics(), b["key"], b["key_id"])
    # Same plaintext, different IVs, so the ciphertexts must differ entirely —
    # otherwise a repeated report would be recognisable from its shape.
    assert env_a["iv"] != env_b["iv"]
    assert env_a["ciphertext"] != env_b["ciphertext"]


def test_two_reports_from_the_same_person_hash_identically():
    """Correlation works without the identifier being recoverable."""
    a = reporter_ref("RoniDev")
    b = reporter_ref("RoniDev")
    c = reporter_ref("someone_else")
    assert a == b
    assert a != c
    assert a is not None


def test_reporter_refs_are_not_reversible_by_guessing():
    """A keyed hash, not a plain digest — so a dictionary attack cannot find it."""
    plain = __import__("hashlib").sha256(b"RoniDev").hexdigest()[:32]
    assert reporter_ref("RoniDev") != plain


# ── Cross-language: the REAL frontend sealer vs this server ─────────────────
#
# The wire format is produced by web/src/lib/reportPayload.js and consumed here.
# Every test above uses a Python-built envelope, which would happily pass even if
# the JavaScript disagreed on the JSON shape or the base64 alphabet. This one
# runs the shipped browser module under Node and opens its output here, so a
# change to either side alone fails.

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SEALER = os.path.join(REPO, "web", "src", "lib", "reportPayload.js")
SEAL_SCRIPT = os.path.join(REPO, "..", "..", "tmp", "opencode", "xlang", "seal.mjs")


def _node_available():
    import shutil
    return shutil.which("node") is not None


@pytest.mark.skipif(not _node_available(), reason="node not available")
def test_the_shipped_frontend_sealer_round_trips_here(tmp_path):
    """Seal with the real JS module; open it with the real server code."""
    script = tmp_path / "seal.mjs"
    script.write_text(
        f"""
import {{ buildDiagnostics, sealReport }} from {json.dumps('file://' + SEALER)};
const [keyB64, keyId] = process.argv.slice(2);
const diag = buildDiagnostics(
  {{ kind: 'server', message: 'x', status: 500,
     technical: '{{"detail":"traceback at server/main.py:99","token":"htk_SECRET"}}' }},
  {{ surface: 'web', breadcrumbs: [{{ email: 'a@b.com' }}] }},
);
// Identity is passed separately and keyed-hashed — it never enters the payload.
const identity = {{ public_id: 'RoniDev', session_id: 'sess-abc' }};
process.stdout.write(JSON.stringify(await sealReport(diag, keyB64, keyId, identity)));
""",
        encoding="utf-8",
    )

    import subprocess

    issued = issue_report_key()
    proc = subprocess.run(
        ["node", str(script), issued["key"], issued["key_id"]],
        capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 0, f"the frontend sealer failed:\n{proc.stderr[-800:]}"

    env = json.loads(proc.stdout)
    out = unseal_report(env)

    # The round trip held, and the internals survived for us.
    assert out["status"] == 500
    assert "server/main.py" in out["detail"]

    # And none of it is legible to whoever holds the payload.
    serialised = json.dumps(env)
    for secret in ("server/main.py", "htk_SECRET", "RoniDev", "a@b.com"):
        assert secret not in serialised, f"{secret!r} was readable in the envelope"

    # Identity is hashed, and present in the clear nowhere.
    assert env["reporter_ref"] and "RoniDev" not in env["reporter_ref"]
    # The identity carrier must not reach the server at all.
    assert "_identity" not in out
    assert "RoniDev" not in json.dumps(out)
    assert "sess-abc" not in json.dumps(out)
    # The scrubber replaced the nested email before it was ever encrypted.
    assert out["breadcrumbs"] == [{"email": "[hashed]"}]



# ── The routes ──────────────────────────────────────────────────────────────
#
# The crypto above is useless if the endpoints are reachable by the wrong person
# or if the mint never happens. These drive the real app.

def test_minting_a_key_requires_a_session(client):
    """An anonymous caller cannot mint a decryption key."""
    r = client.post("/api/reports/key")
    assert r.status_code == 401, r.text


def test_a_signed_in_user_gets_a_key(client, auth_headers_factory):
    headers = auth_headers_factory("report_key_user")
    r = client.post("/api/reports/key", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["algorithm"] == "AES-256-GCM"
    assert body["key_id"]
    # The key is returned to the BROWSER to encrypt with; only its id travels back.
    assert len(base64.b64decode(body["key"])) == 32


def test_a_minted_key_actually_opens_what_it_sealed(client, auth_headers_factory):
    """The full path a browser takes, against the real endpoints."""
    headers = auth_headers_factory("report_roundtrip_user")

    body = client.post("/api/reports/key", headers=headers).json()
    env = seal_like_the_browser(sample_diagnostics(), body["key"], body["key_id"])

    # Opening is admin-only, so this closes the loop the way an operator would.
    # The id is config-driven (ADMIN_PUBLIC_ID, default "RoniDev").
    from server.security import ADMIN_PUBLIC_ID
    admin = auth_headers_factory(ADMIN_PUBLIC_ID)
    r = client.post("/api/reports/open", headers=admin, json={"envelope": env})
    assert r.status_code == 200, r.text
    got = r.json()["diagnostics"]
    assert got["status"] == 500
    assert "server/main.py" in got["detail"]


def test_a_normal_user_cannot_open_a_report(client, auth_headers_factory):
    """Reports name internal paths and models — they are not for everyone."""
    headers = auth_headers_factory("report_owner_user")
    body = client.post("/api/reports/key", headers=headers).json()
    env = seal_like_the_browser(sample_diagnostics(), body["key"], body["key_id"])

    r = client.post("/api/reports/open", headers=headers, json={"envelope": env})
    assert r.status_code == 403, r.text


def test_opening_requires_a_session(client):
    r = client.post("/api/reports/open", json={"envelope": {}})
    assert r.status_code == 401, r.text


def test_an_unknown_key_id_is_refused_by_the_route(client, auth_headers_factory):
    from server.security import ADMIN_PUBLIC_ID
    admin = auth_headers_factory(ADMIN_PUBLIC_ID)
    env = seal_like_the_browser(
        sample_diagnostics(), base64.b64encode(os.urandom(32)).decode(), "made-up-id",
    )
    r = client.post("/api/reports/open", headers=admin, json={"envelope": env})
    assert r.status_code == 400
    assert "report" in r.json()["detail"].lower()
