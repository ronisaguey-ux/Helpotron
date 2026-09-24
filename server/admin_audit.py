"""Durable audit trail for privileged administrative actions.

Why this module exists, measured 2026-09-24: `set_user_plan` wrote nothing at all,
`grant_welcome_tokens` only printed to stdout, and `reset_user_password` wrote nothing —
so a plan change, a token grant, a password reset and a ban left NO durable record of
who did it or when. The CLI at `scripts/adminctl.py` exposes every one of those verbs
plus impersonation behind a single admin JWT.

`record()` is deliberately fail-soft. An audit write must never take down the action it
is recording: a plan change that succeeded but failed to log is a far smaller problem
than a plan change that fails because the logging table is missing. The failure is
printed loudly (it is an operator-visible gap, not a routine condition) and swallowed.
"""
from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from .database import AdminAction

log = logging.getLogger("helpotron.admin_audit")


def _client_ip(request) -> str | None:
    if request is None:
        return None
    try:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()[:64]
        return (request.client.host if request.client else None)
    except Exception:
        return None


def record(
    db: Session,
    *,
    actor: str,
    target: str,
    action: str,
    detail: dict | None = None,
    request=None,
    commit: bool = True,
) -> None:
    """Write one admin-action row. Never raises.

    Set `commit=False` when the caller is mid-transaction and will commit itself, so
    the audit row and the change it describes land together or not at all.
    """
    try:
        db.add(AdminAction(
            actor=str(actor or "?")[:128],
            target=str(target or "?")[:128],
            action=str(action or "?")[:64],
            detail=json.dumps(detail, default=str) if detail else None,
            ip=_client_ip(request),
        ))
        if commit:
            db.commit()
    except Exception as e:  # pragma: no cover - a logging failure must not break the action
        log.error("ADMIN AUDIT WRITE FAILED action=%s target=%s: %s", action, target, e)
        try:
            db.rollback()
        except Exception:
            pass
