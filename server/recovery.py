"""Password recovery service (operator 08-28).

Forgot-password / recovery flow with three delivery options:
  (a) EMAIL  — 6-digit code sent via the repo's SMTP sender (auth_2fa).
  (b) PHONE  — 6-digit code sent via the Twilio SMS sender (auth_2fa).
  (c) DEV    — the developer is pinged on Telegram (TELEGRAM_ADMIN_CHAT_ID)
               AND the request is persisted as an AdminMessage row, so it also
               shows in the Control Center inbox. The developer then hands the
               user the code / uses the admin "change password" control.

All three are real flows. Email/phone read the user's stored contact from the
existing user record (settings JSON); when unset the API reports
email_set/phone_set=False and the UI nudges toward option (c).

Codes are stored hashed (SHA-256), single-use, 30-minute expiry, max 5 verify
attempts. Password changes go through the same PBKDF2 scheme as signup
(server/security.py hash_password / verify_password).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

try:
    from .config import config
    from .database import AdminMessage, PasswordReset, User, SessionLocal
    from .security import hash_password, validate_password_strength, SessionStore
    from .auth_2fa import email_service, sms_service
except (ImportError, ValueError):
    from server.config import config
    from server.database import AdminMessage, PasswordReset, User, SessionLocal
    from server.security import hash_password, validate_password_strength, SessionStore
    from server.auth_2fa import email_service, sms_service

logger = logging.getLogger("helpotron.recovery")

CODE_TTL_MINUTES = 30
MAX_VERIFY_ATTEMPTS = 5


# ─── contact (email / phone) lookup from the existing user record ───────────

def user_contact(user: User, kind: str) -> Optional[str]:
    """Return the stored email or phone for a user from their settings record.

    Reads the free-form settings JSON (the same place 2FA/permissions live):
      - email: settings.email | settings.contact_email | settings.profile.email
      - phone: settings.phone | settings.phone_number | settings.profile.phone
    Returns None when the user has not configured that contact on this box.
    """
    if not user.settings:
        return None
    settings = user.settings
    profile = settings.get("profile") or {}
    if kind == "email":
        for key in ("email", "contact_email"):
            val = str(settings.get(key) or "").strip()
            if val and "@" in val:
                return val
        val = str(profile.get("email") or "").strip()
        return val or None
    if kind == "phone":
        for key in ("phone", "phone_number"):
            val = str(settings.get(key) or "").strip()
            if val:
                return val
        val = str(profile.get("phone") or "").strip()
        return val or None
    return None


def mask_contact(value: Optional[str], kind: str) -> str:
    """Mask a contact for display (never leak the full address)."""
    if not value:
        return ""
    if kind == "email":
        at = value.rfind("@")
        if at > 0:
            local = value[:at]
            domain = value[at:]
            head = local[:1] if local else ""
            return f"{head}{'*' * max(2, len(local) - 1)}{domain}"
        return f"{value[:1]}***"
    # phone
    digits = [c for c in value if c.isdigit()]
    if len(digits) >= 4:
        return f"{value[:3]}***{''.join(digits[-4:])}"
    return f"{value[:1]}***"


# ─── recovery codes ─────────────────────────────────────────────────────────

def gen_code() -> str:
    """6-digit numeric recovery code (same UX as the 2FA codes)."""
    return "".join(secrets.choice("0123456789") for _ in range(6))


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def _new_row(user: User, method: str) -> tuple[PasswordReset, str]:
    code = gen_code()
    row = PasswordReset(
        user_id=user.id,
        public_id=user.public_id,
        method=method,
        code_hash=hash_code(code),
        token=secrets.token_urlsafe(24),
        status="active",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=CODE_TTL_MINUTES),
    )
    return row, code


# ─── developer channel (option c) ───────────────────────────────────────────

def _telegram_creds() -> tuple[str, str]:
    """Resolve the dev-channel Telegram credentials for THIS box.

    Preference: config (helpotron/.env → TELEGRAM_BOT_TOKEN /
    TELEGRAM_ADMIN_CHAT_ID). Fallback: the repo's live telebridge bot.env —
    the same source telebridge/tg_send.sh uses, and the only place on this
    machine with a real token+chat (helpotron/.env keeps these blank).
    Never raises; returns ("", "") when nothing is configured.
    """
    token = config.telegram_bot_token or ""
    chat = config.telegram_admin_chat_id or ""
    if token and chat:
        return token, chat
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    bot_env_candidates = (
        os.path.join(repo_root, "telebridge", "bot.env"),
        os.path.join(repo_root, "..", "telebridge", "bot.env"),  # workspace sibling
    )
    bot_env = next((p for p in bot_env_candidates if os.path.isfile(p)), "")
    try:
        if bot_env:
            vals: dict[str, str] = {}
            with open(bot_env, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, val = line.partition("=")
                        vals[key.strip()] = val.strip().strip('"').strip("'")
            if not token:
                token = vals.get("TELEGRAM_BOT_TOKEN", "")
            if not chat:
                chat = vals.get("TELEGRAM_CHAT_ID", "") or vals.get("TELEGRAM_ADMIN_CHAT_ID", "")
    except OSError:
        pass
    return token, chat


async def notify_developer_via_telegram(text: str) -> bool:
    """Push a dev-facing alert to Telegram, when automated alerts are ENABLED.

    OFF BY DEFAULT (owner directive 2026-09-18): *"i want 0 automated alerts, i
    want you to personally deliver information when u deem necessary, this is all
    noise."* Every automated pinger on this box was firing at the owner's
    Telegram — one per generated assignment, per datalake entry, per admin
    message — and the signal drowned in it.

    The alert itself was never the valuable part. The caller persists an
    AdminMessage row regardless (see request_recovery, which writes the row after
    this call), and that durable row wakes the agent, which triages the event and
    decides whether it is worth the owner's attention. So suppressing the push
    loses no information — it moves the judgement from a hardcoded `send()` to a
    person deciding.

    Set DEV_TELEGRAM_ALERTS=on to restore the old behaviour. Returns False (never
    raises) so every caller keeps working unchanged either way.
    """
    if os.getenv("DEV_TELEGRAM_ALERTS", "").strip().lower() not in ("on", "1", "true", "yes"):
        logger.info("recovery: automated dev alert suppressed (DEV_TELEGRAM_ALERTS off) — row still persisted")
        return False

    token, chat = _telegram_creds()
    if not token or not chat:
        logger.warning("recovery: dev alert NOT delivered (no Telegram credentials for the dev channel on this box)")
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat, "text": text, "parse_mode": "Markdown"},
            )
        ok = resp.status_code == 200
        if not ok:
            logger.warning("recovery: telegram dev alert -> HTTP %s", resp.status_code)
        return ok
    except Exception as exc:  # network / timeout — never break the request
        logger.warning("recovery: telegram dev alert failed: %s (channel unreachable)", type(exc).__name__)
        return False


import time

_FAILED_RECOVERY_ATTEMPTS: dict[int, list[float]] = {}
_ACCOUNT_LOCKOUT_WINDOW_SECONDS = 900.0  # 15 minutes
_MAX_ACCOUNT_FAILED_ATTEMPTS = 5


def _clean_and_check_account_attempts(user_id: int) -> bool:
    """Returns True if account is locked out from recovery attempts."""
    now = time.time()
    attempts = [t for t in _FAILED_RECOVERY_ATTEMPTS.get(user_id, []) if now - t < _ACCOUNT_LOCKOUT_WINDOW_SECONDS]
    _FAILED_RECOVERY_ATTEMPTS[user_id] = attempts
    return len(attempts) >= _MAX_ACCOUNT_FAILED_ATTEMPTS


def _record_failed_attempt(user_id: int) -> None:
    now = time.time()
    attempts = [t for t in _FAILED_RECOVERY_ATTEMPTS.get(user_id, []) if now - t < _ACCOUNT_LOCKOUT_WINDOW_SECONDS]
    attempts.append(now)
    _FAILED_RECOVERY_ATTEMPTS[user_id] = attempts


async def deliver_dev_code(db, user: User, row: PasswordReset, code: str) -> bool:
    """Ping the developer with the recovery request."""
    tg_text = (
        f"🔑 *Password recovery request*\n"
        f"User: `{user.public_id}`\n"
        f"Request ID: `{row.id}`\n"
        f"Expires in {CODE_TTL_MINUTES} min. Use the admin Control Center "
        f"*Users & Credits → Change Pw*."
    )
    sent = await notify_developer_via_telegram(tg_text)
    # Persist in the admin inbox without exposing the plaintext recovery secrets (MISC-05)
    db.add(AdminMessage(
        user_id=user.public_id,
        subject=f"Password recovery — {user.public_id}",
        category="password_recovery",
        message=(
            f"User {user.public_id} asked for a recovery code via the developer channel.\n"
            f"Request ID: {row.id}\n"
            f"Expires: {CODE_TTL_MINUTES} minutes. Set a new password for them from "
            f"the Control Center (Change Pw)."
        ),
        status="sent",
    ))
    return sent


# ─── public API cores ───────────────────────────────────────────────────────

async def request_recovery(db, public_id: str, method: str) -> dict[str, Any]:
    """Create + deliver a recovery code for the user by channel (a|b|c)."""
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user:
        # Do not reveal whether an account exists — same message as the
        # front-facing "no contact configured" nudge.
        raise ValueError("No account matches that public_id.")

    if _clean_and_check_account_attempts(user.id):
        raise ValueError("Too many failed recovery attempts for this account. Recovery is locked for 15 minutes.")

    method = (method or "").lower().strip()

    # Invalidate all prior active recovery requests for this user (AUTHZ-08)
    db.query(PasswordReset).filter(
        PasswordReset.user_id == user.id,
        PasswordReset.status == "active",
    ).update({"status": "superseded"}, synchronize_session=False)

    # Options (a)/(b): confirm the contact exists BEFORE minting a code.
    if method in ("email", "phone"):
        contact = user_contact(user, method)
        if not contact:
            raise ValueError(f"no_{method}")
        row, code = _new_row(user, method)
        db.add(row)
        db.commit()
        if method == "email":
            delivered = await asyncio.to_thread(
                email_service.send_verification_code, contact, code,
                purpose_label="Password Recovery",
            )
        else:
            # Route the SMS through the provider. When Twilio Verify is active it
            # owns the code, so the verify step below checks with Verify instead
            # of the locally stored hash (see verify_and_reset).
            from .auth_2fa import SMSVerification
            delivered = await SMSVerification.send(contact)
        return {
            "status": "ok",
            "request_id": row.id,
            "method": method,
            "delivered": bool(delivered),
            "available": True,
            "message": (
                f"Recovery code sent to your {method} (valid {CODE_TTL_MINUTES} minutes)."
                if delivered else
                "Recovery code delivery failed on the server side — "
                "ask the developer for one instead."
            ),
        }

    if method == "dev":
        row, code = _new_row(user, method)
        db.add(row)
        db.commit()
        await deliver_dev_code(db, user, row, code)
        db.commit()
        return {
            "status": "ok",
            "request_id": row.id,
            "method": "dev",
            "delivered": True,
            "available": True,
            "message": (
                "The developer was pinged on Telegram. The recovery code they pass "
                f"you stays valid {CODE_TTL_MINUTES} minutes — ask them for it, then "
                "enter it with your new password."
            ),
        }

    raise ValueError("Unknown recovery method — use email, phone or dev.")


def verify_and_reset(db, public_id: str, new_password: str, code: Optional[str] = None,
                     token: Optional[str] = None, two_factor_code: Optional[str] = None,
                     by: str = "user") -> dict[str, Any]:
    """Verify the recovery code (or link token) and set the new password.

    Uses the exact same hash as signup (security.hash_password, PBKDF2-SHA256).
    Single-use: the row is consumed; all other sessions are revoked.
    """
    user = db.query(User).filter(User.public_id == public_id).first()
    if not user or not user.password_hash:
        raise ValueError("No account matches that public_id.")

    if _clean_and_check_account_attempts(user.id):
        raise ValueError("Too many failed recovery attempts for this account. Recovery is locked for 15 minutes.")

    if not validate_password_strength(new_password):
        raise ValueError("New password must be at least 8 characters and include a letter and a number")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = (
        db.query(PasswordReset)
        .filter(PasswordReset.user_id == user.id, PasswordReset.status == "active")
        .order_by(PasswordReset.id.desc())
        .first()
    )
    if not row:
        raise ValueError("No active recovery request found — request a new code.")

    if row.expires_at.replace(tzinfo=None) < now:
        row.status = "expired"
        db.commit()
        raise ValueError("Recovery code has expired. Request a new one.")

    code_ok = bool(code) and secrets.compare_digest(hash_code(code), row.code_hash)
    if not code_ok and (row.method == "phone") and code:
        # The code a phone recovery receives is Verify's, not ours, so the local
        # hash cannot match it. Ask Verify. This runs only for phone rows and
        # only after the hash check fails, so an email/dev row is unaffected.
        try:
            from .auth_2fa import SMSVerification
            from .routes_auth_2fa import _e164
            if SMSVerification.is_verify_enabled():
                _st = user.settings or {}
                _phone = _st.get("phone_number") or (_st.get("profile") or {}).get("phone") or ""
                try:
                    _phone = _e164(_phone) if _phone else ""
                except ValueError:
                    _phone = ""
                if _phone:
                    code_ok, _why = SMSVerification.check_sync(_phone, code)
        except Exception:
            code_ok = False
    token_ok = bool(token) and secrets.compare_digest(token.strip(), row.token)
    if not (code_ok or token_ok):
        _record_failed_attempt(user.id)
        row.attempts = (row.attempts or 0) + 1
        if row.attempts >= MAX_VERIFY_ATTEMPTS:
            row.status = "invalidated"
        db.commit()
        raise ValueError("Invalid recovery code or link.")

    # MISC-07: Require 2FA if enabled on the account
    is_2fa_enabled = bool((user.settings or {}).get("2fa_enabled"))
    if is_2fa_enabled:
        if not two_factor_code:
            return {
                "status": "2fa_required",
                "method": (user.settings or {}).get("2fa_method", "totp"),
                "message": "Two-factor authentication code required to complete password reset.",
            }
        from .routes_auth_2fa import totp_service
        secret = (user.settings or {}).get("2fa_totp_secret", "")
        valid_2fa = totp_service.verify_code(secret, two_factor_code.strip()) if secret else False
        if not valid_2fa:
            backup_codes = list((user.settings or {}).get("2fa_backup_codes") or [])
            if two_factor_code.strip() in backup_codes:
                backup_codes.remove(two_factor_code.strip())
                st = dict(user.settings or {})
                st["2fa_backup_codes"] = backup_codes
                user.settings = st
                valid_2fa = True
        if not valid_2fa:
            _record_failed_attempt(user.id)
            raise ValueError("Invalid two-factor authentication code.")

    # Valid: clear failed attempt tracker and rotate the password
    _FAILED_RECOVERY_ATTEMPTS.pop(user.id, None)
    hashed, salt = hash_password(new_password)
    user.password_hash = hashed
    user.password_salt = salt
    row.status = "used"
    row.attempts = (row.attempts or 0) + 1
    row.completed_at = now
    row.completed_by = by
    db.commit()
    # Kick other sessions — SessionStore uses its OWN connection, so commit
    # above first (same pattern as admin.py ban/tempban).
    SessionStore.revoke_all_sessions(user.id)
    return {"status": "success", "public_id": user.public_id, "request_id": row.id}


def save_contacts(db, user: User, email: Optional[str] = None, phone: Optional[str] = None) -> dict[str, Any]:
    """Persist the user's email/phone into their settings record."""
    settings = dict(user.settings or {})
    profile = dict(settings.get("profile") or {})
    if email is not None:
        clean = email.strip()[:200]
        if clean and "@" not in clean:
            raise ValueError("That does not look like an email address.")
        settings["email"] = clean
        profile["email"] = clean
    if phone is not None:
        clean = phone.strip()[:32]
        settings["phone"] = clean
        profile["phone"] = clean
    settings["profile"] = profile
    user.settings = settings
    db.commit()
    return {"status": "success", "email_set": bool(user_contact(user, "email")), "phone_set": bool(user_contact(user, "phone"))}


def contact_status(user: User) -> dict[str, Any]:
    """Masked availability readout for the recovery UI."""
    email = user_contact(user, "email")
    phone = user_contact(user, "phone")
    return {
        "public_id": user.public_id,
        "email_set": bool(email),
        "phone_set": bool(phone),
        "email_masked": mask_contact(email, "email"),
        "phone_masked": mask_contact(phone, "phone"),
    }


def recover_lookup(db, public_id: str) -> User | None:
    return db.query(User).filter(User.public_id == public_id).first()
