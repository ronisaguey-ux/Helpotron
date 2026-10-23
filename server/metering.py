"""Usage metering context (owner 2026-09-17).

Owner: *"every single process, from humanizing, ai detection, EVERYTHING costs
tokens"*.

The ledger (`api_usage_logs`) is what makes that possible: anything that records
its real cost there is automatically billable, because the charge-after path
(`credits.ledger_watermark` -> work -> `credits.charge_actual_usage`) charges
whatever the ledger accumulated during a task.

The problem this module solves: the code that spends money is often deep inside
a call tree that has no idea which user is paying. The AI detectors, for
instance, are called from a scoring funnel several frames below the request
handler. Threading a user id through every detector signature would touch
dozens of call sites and would be silently forgotten by the next one.

A `contextvar` carries the paying account instead. It is the right primitive for
this: asyncio tasks each get their own context, so a value set while handling one
request can never leak into a concurrent one. Anything that spends money calls
`record_service_cost(...)` and does not need to know how it got there.

Deliberately fail-soft: if there is no user in context, or the write fails,
`record_service_cost` returns quietly. A metering gap must never break the
feature it is measuring — the cost simply lands as unattributed until the next
call site sets the context.
"""
from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Any, Optional

logger = logging.getLogger("helpotron.metering")

# The account to bill for work happening in this task. None = unattributed
# (background jobs, operator tooling, tests).
_current_public_id: ContextVar[Optional[str]] = ContextVar("helpotron_meter_public_id", default=None)


def set_meter_user(public_id: Optional[str]):
    """Bind the paying account for the current task. Returns a reset token."""
    return _current_public_id.set(str(public_id) if public_id else None)


def reset_meter_user(token) -> None:
    try:
        _current_public_id.reset(token)
    except Exception:
        pass


def current_meter_user() -> Optional[str]:
    return _current_public_id.get()


current_public_id = current_meter_user


class meter_user:
    """Context manager form:

        with meter_user(user.public_id):
            ...work that spends money...

    Nesting is safe; an inner block that sets None leaves the outer binding
    untouched because each set/reset pairs through a token.
    """

    def __init__(self, public_id: Any, db: Any = None):
        if hasattr(public_id, "public_id"):
            self._public_id = getattr(public_id, "public_id")
        else:
            self._public_id = public_id
        self._db = db
        self._token = None

    def __enter__(self):
        self._token = set_meter_user(self._public_id)
        return self

    def __exit__(self, *exc):
        reset_meter_user(self._token)
        return False


def record_service_cost(service: str, cost_usd: float, units: float = 0.0,
                        metadata: Optional[dict] = None, public_id: Optional[str] = None,
                        category: str = "service") -> None:
    """Write one measured service cost into the ledger.

    Called by anything billed per unit rather than per token — the AI detectors
    (per character / per word) are the main one. No-op when there is nobody to
    bill; never raises.
    """
    if cost_usd is None or cost_usd <= 0:
        return
    pid = public_id or current_meter_user()
    if not pid:
        return
    try:
        from .cost_tracking import cost_engine
        from .database import SessionLocal
        with SessionLocal() as db:
            cost_engine.record_service_cost(
                db=db, public_id=pid, service=service,
                cost_usd=float(cost_usd), units=float(units or 0.0),
                metadata=metadata, category=category,
            )
    except Exception as e:
        logger.warning("could not record %s cost (%.6f USD): %s", service, cost_usd, e)
