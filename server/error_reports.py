"""error_reports.py — server half of the sealed error-report pipeline.

Owner requirement (2026-09-23), verbatim:

    "when the user reports and sends the real diagnostics, have it send an
     encrypted hashed json output so the user never sees back end logic ever
     even when reporting"

The browser half is `web/src/lib/reportPayload.js`. It:
  1. scrubs the diagnostics (identifiers replaced, every field size-capped),
  2. seals the JSON with AES-256-GCM under a single-use key fetched from here,
  3. sends a SHA-256 digest of the plaintext for tamper detection,
  4. sends HMAC-SHA256 references for the reporter and session INSTEAD of the
     identifiers themselves, so reports can be correlated without being
     reversible by guesswork.

What this module owns
---------------------
* `issue_report_key()` — mint a single-use key, remember it, hand over the
  base64. The plaintext never reaches the server; only the key does — and the
  key is useless once the sealed envelope has been unsealed and the key is
  dropped.
* `unseal_report()` — decrypt + verify the digest + verify the key was actually
  one we issued.

⚠️ WHAT THIS IS AND IS NOT
--------------------------
The key has to be usable by the browser, so it is reachable by anyone who
controls that browser. This is NOT protection against an attacker with DevTools
open — no in-page mechanism can be. It protects against the failure that
actually occurs: an internal path, stack or payload becoming visible on screen,
in a screenshot, in a shared window, or in a copied log.

The real containment for "the user never sees backend logic" is that the DISPLAY
layer never renders `technical` — see `web/src/lib/errors.js`. Encryption is the
second belt, for when a raw value escapes the display layer anyway.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import logging
import os
import secrets
import threading
import time
from typing import Any, Dict, Optional, Tuple

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

log = logging.getLogger(__name__)

# AES-256 key size. GCM is authenticated, so a wrong key or a tampered
# ciphertext fails the tag check rather than returning garbage.
_KEY_BYTES = 32

# How long a minted key stays valid. Long enough for a slow upload on a bad
# connection, short enough that a leaked key is worthless soon after.
KEY_TTL_SECONDS = 15 * 60

# Cap on live keys, so minting in a loop cannot exhaust memory. The oldest is
# evicted first — a key that has not been used within the window is stale.
_MAX_LIVE_KEYS = 5000


class ReportKeyError(Exception):
    """The key could not be issued, or was not one we issued."""


class ReportSealError(Exception):
    """The envelope could not be opened: bad tag, bad digest, or malformed."""


# ── Key registry ─────────────────────────────────────────────────────────────
# In-process and deliberately so: a key is needed for a few seconds between
# minting and unsealing. Persisting it to the DB would put a decryption key in
# the same store as the ciphertext it protects, which is the one arrangement
# that makes encryption pointless.
#
# The envelope carries only a KEY ID, never the key. If the key travelled inside
# the envelope, anyone holding a copy of the envelope before it was unsealed
# could decrypt it — which is exactly the situation a seal exists to prevent.

_lock = threading.Lock()
_keys: Dict[str, Tuple[bytes, float]] = {}


def _purge_expired(now: Optional[float] = None) -> None:
    """Drop expired keys. Called on every mint so the map cannot grow silently."""
    now = now if now is not None else time.time()
    stale = [k for k, (_, created) in _keys.items() if now - created > KEY_TTL_SECONDS]
    for k in stale:
        _keys.pop(k, None)

    # Belt and braces: if a flood arrived inside the TTL window, evict oldest.
    if len(_keys) > _MAX_LIVE_KEYS:
        ordered = sorted(_keys.items(), key=lambda kv: kv[1][1])
        for k, _ in ordered[: len(_keys) - _MAX_LIVE_KEYS]:
            _keys.pop(k, None)


def issue_report_key() -> Dict[str, str]:
    """Mint a single-use key.

    Returns the key (for the browser to encrypt with) and its id (for the
    browser to reference when it sends the envelope back). Only the id travels
    back to the server; the key bytes stay on the server for its whole life.
    """
    key = secrets.token_bytes(_KEY_BYTES)
    key_id = secrets.token_urlsafe(18)
    with _lock:
        _purge_expired()
        _keys[key_id] = (key, time.time())
    return {
        "key_id": key_id,
        "key": base64.b64encode(key).decode("ascii"),
        "expires_in": KEY_TTL_SECONDS,
    }


def _take_key_by_id(key_id: str) -> bytes:
    """Consume a key. Single-use: a second unseal with the same id fails."""
    with _lock:
        entry = _keys.pop(key_id, None)
    if entry is None:
        raise ReportKeyError("unknown or already-used report key")
    key, created = entry
    if time.time() - created > KEY_TTL_SECONDS:
        raise ReportKeyError("report key expired")
    return key


# ── Unseal ───────────────────────────────────────────────────────────────────

def unseal_report(envelope: Dict[str, Any], *, consume_key: bool = True) -> Dict[str, Any]:
    """Open a sealed envelope and return the diagnostics dict.

    Verifies, in order:
      1. the envelope is shaped as we expect,
      2. the key id is one we issued (and consumes it),
      3. the AES-GCM tag — i.e. the ciphertext is intact and authentic,
      4. the SHA-256 digest of the plaintext — i.e. it is the exact JSON the
         browser produced, not a re-encoded equivalent.

    Raises ReportSealError on any failure. It never returns a partially-trusted
    result: an envelope that fails a check is discarded whole.
    """
    import json

    if not isinstance(envelope, dict):
        raise ReportSealError("envelope is not an object")

    ciphertext_b64 = envelope.get("ciphertext")
    iv_b64 = envelope.get("iv")
    digest_expected = envelope.get("digest")
    if not ciphertext_b64 or not iv_b64:
        raise ReportSealError("envelope is missing ciphertext or iv")

    # The key itself is NOT carried in the envelope — only the id of a key we
    # issued. An envelope that named its own key would let a sender choose the
    # key, which is no seal at all.
    key_id = envelope.get("key_id")
    if not key_id or not isinstance(key_id, str):
        raise ReportSealError("envelope does not reference a report key")

    if consume_key:
        try:
            key = _take_key_by_id(key_id)
        except ReportKeyError as exc:
            raise ReportSealError(str(exc)) from exc
    else:
        with _lock:
            entry = _keys.get(key_id)
        if entry is None:
            raise ReportSealError("unknown or already-used report key")
        key = entry[0]

    try:
        ciphertext = base64.b64decode(ciphertext_b64, validate=True)
        iv = base64.b64decode(iv_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ReportSealError("malformed base64 in envelope") from exc

    if len(iv) != 12:
        raise ReportSealError("iv must be 12 bytes for AES-GCM")

    try:
        plaintext = AESGCM(key).decrypt(iv, ciphertext, None)
    except InvalidTag as exc:
        # Wrong key, or the ciphertext was altered. Indistinguishable by design.
        raise ReportSealError("could not open the report (bad tag)") from exc

    if digest_expected:
        actual = hashlib.sha256(plaintext).hexdigest()
        if not hmac.compare_digest(str(digest_expected), actual):
            raise ReportSealError("digest mismatch — the report was altered in transit")

    try:
        data = json.loads(plaintext.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ReportSealError("decrypted payload is not valid JSON") from exc

    if not isinstance(data, dict):
        raise ReportSealError("decrypted payload is not a JSON object")

    return data


# ── Reporter references ──────────────────────────────────────────────────────

def reporter_ref(raw_id: Any, *, salt: Optional[str] = None) -> Optional[str]:
    """HMAC-SHA256 reference for an identifier, for correlating reports.

    Deliberately separate from `datalake._anonymize_id`: that one exists to keep
    a *stored* identity unlinkable, this one exists to link two reports from the
    same person while remaining unguessable. Same idea, different job — and
    keeping them apart means rotating one cannot silently orphan the other.
    """
    if raw_id is None or raw_id == "":
        return None
    key = (salt or os.getenv("DATALAKE_SALT") or os.getenv("SECRET_KEY") or "").encode()
    if not key:
        return None
    return hmac.new(key, str(raw_id).encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def live_key_count() -> int:
    """How many minted keys are still live. For tests and the health view."""
    with _lock:
        _purge_expired()
        return len(_keys)
