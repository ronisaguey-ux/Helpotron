"""Plan catalogue — the one place tier names, prices and allowances are defined.

Audit 08-29. Before this module the same facts lived in five places that did
not agree with each other:

  * ``credits.TIER_MONTHLY_CREDITS``  free 500 · basic 2000 · pro 6000 · elite 25000
      — what ``/api/dashboard`` shows the user as their monthly allowance.
  * ``payments.TIER_CREDITS``                     basic  500 · pro 2000 · elite  6000
      — what a successful payment actually deposits.
  * ``payments.TIER_PRICE_CENTS``              basic $10 · pro  $20 · elite    $40
  * ``web/src/components/CreditsPricingDashboard.jsx`` — hardcoded 500/2000/6000,
      i.e. the checkout page sold each tier the allowance of the tier below it.
  * ``web/src/App.jsx`` low-credit banner — basic 30 · pro 100 · elite 280, which
      matched no other table, so the "running low" warning fired at ~1.5% of the
      real balance instead of 15% and in practice never fired at all.

The presentation layer now reads this module (and only this module) through
``GET /api/plans``, so the marketing page, the checkout page and the in-app
balance warning can no longer drift apart.

NOTE — an unresolved *business* discrepancy is deliberately preserved rather
than silently picked: ``ALLOWANCE`` (what the dashboard promises monthly) is
larger than ``PURCHASE_GRANT`` (what a payment deposits) on every paid tier.
Both values are re-exported from their existing owners so this module changes
no behaviour; reconciling them is an owner decision, not a refactor.
"""
from __future__ import annotations

from typing import Any, Dict, List

from .credits import TIER_MONTHLY_CREDITS
from .payments import TIER_CREDITS as _PURCHASE_GRANT, TIER_PRICE_CENTS

# Ordered cheapest → richest; drives display order everywhere.
PLAN_ORDER: List[str] = ["trial", "basic", "pro", "elite"]

PLAN_COPY: Dict[str, Dict[str, str]] = {
    "trial": {
        "name": "Free Trial",
        "tagline": "7-day starter trial with 100 task tokens ($1.00 tool budget) — SMS verification required (1 per number).",
    },
    "basic": {
        "name": "Basic",
        "tagline": "300 task tokens / month ($3.00 tool budget) for steady coursework.",
    },
    "pro": {
        "name": "Pro",
        "tagline": "1,000 task tokens / month ($10.00 tool budget) for a full semester load.",
    },
    "elite": {
        "name": "Elite",
        "tagline": "2,700 task tokens / month ($27.00 tool budget) for heavy research and multi-agent work.",
    },
}

# Every tier ships the same product. Tiers differ by monthly allowance only —
# this is a deliberate pricing stance and the copy should keep saying so.
SHARED_CAPABILITIES: List[str] = [
    "Assignment bubbles with a per-assignment AI agent",
    "Browser extension + paste-in coursework capture",
    "Turn-in ledger with timestamps and undo",
    "Study tools, library and exports (Docs, Markdown, PDF, CSV)",
    "Two-factor authentication and session security",
]


def _price_cents(plan: str) -> int:
    return 0 if plan in ("trial", "free") else TIER_PRICE_CENTS.get(plan, 0)


def get_plan_catalogue() -> List[Dict[str, Any]]:
    """Serialisable plan list for the public ``/api/plans`` endpoint."""
    catalogue: List[Dict[str, Any]] = []
    for plan in PLAN_ORDER:
        copy = PLAN_COPY.get(plan, {})
        cents = _price_cents(plan)
        is_trial = plan == "trial"
        tokens = TIER_MONTHLY_CREDITS.get(plan, 300)
        catalogue.append(
            {
                "id": plan,
                "name": copy.get("name", plan.title()),
                "tagline": copy.get("tagline", ""),
                "price_cents": cents,
                "price_monthly": cents / 100,
                # Task tokens for compute (1 task token = 1 cent = $0.01 tool cost)
                "monthly_task_tokens": tokens,
                "monthly_credits": tokens,  # backwards-compatible field
                "usage_value_usd": round(tokens * 0.01, 2),
                "popular": plan == "pro",
                "is_trial": is_trial,
                "requires_sms": is_trial,
                "badge": "1-Time Trial (SMS)" if is_trial else ("Most Popular" if plan == "pro" else None),
                "capabilities": [
                    f"{tokens:,} task tokens / month (1 token = $0.01 API tool cost)",
                    "Credits are discount dollars ($1.00 off per credit)",
                    *SHARED_CAPABILITIES,
                ],
            }
        )
    return catalogue


def low_balance_threshold(plan: str) -> float:
    """Balance below which the in-app "running low" banner should appear.

    15% of the tier's real monthly allowance. Replaces the hardcoded
    ``{basic: 30, pro: 100, elite: 280}`` table in App.jsx, which was derived
    from no real allowance and therefore never fired at a useful moment.
    """
    return TIER_MONTHLY_CREDITS.get(plan, TIER_MONTHLY_CREDITS.get("free", 500)) * 0.15


def purchase_grant(plan: str) -> int:
    """Credits deposited by a successful payment (see module NOTE)."""
    return _PURCHASE_GRANT.get(plan, 0)
