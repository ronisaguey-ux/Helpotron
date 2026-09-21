"""Plan catalogue — the one place tier names, prices and allowances are defined.

Audit 08-29, reconciled 09-14 under the token/credit split. Before this module
the same facts lived in five places that did not agree with each other:

  * ``credits.TIER_MONTHLY_CREDITS``  free 500 · basic 2000 · pro 6000 · elite 25000
  * ``payments.TIER_CREDITS``                     basic  500 · pro 2000 · elite  6000
  * ``payments.TIER_PRICE_CENTS``              basic $10 · pro  $20 · elite    $40
  * ``web/src/components/CreditsPricingDashboard.jsx`` — hardcoded 500/2000/6000,
      i.e. the checkout page sold each tier the allowance of the tier below it.
  * ``web/src/App.jsx`` low-credit banner — basic 30 · pro 100 · elite 280, which
      matched no other table, so the "running low" warning fired at ~1.5% of the
      real balance instead of 15% and in practice never fired at all.

The presentation layer now reads this module (and only this module) through
``GET /api/plans``, so the marketing page, the checkout page and the in-app
balance warning can no longer drift apart.

The former ALLOWANCE-vs-PURCHASE_GRANT divergence is GONE: ``TIER_TOKENS`` in
``payments.py`` is the single source (trial 15,000 · basic 30,000 · pro 100,000 ·
elite 270,000, at the owner's 2026-09-17 rate of 100 tokens = 1 cent) and
``credits.TIER_MONTHLY_TASK_TOKENS`` re-exports it, so what a plan promises
monthly is what a payment deposits. ``TIER_MONTHLY_CREDITS``
survives only as a backwards-compatible alias and its name is now misleading —
these were never credits.
"""
from __future__ import annotations

from typing import Any, Dict, List

from .credits import TIER_MONTHLY_CREDITS
from .payments import TIER_CREDITS as _PURCHASE_GRANT, TIER_PRICE_CENTS, _stripe_enabled

# Ordered cheapest → richest; drives display order everywhere.
PLAN_ORDER: List[str] = ["trial", "testing", "basic", "pro", "elite"]

PLAN_COPY: Dict[str, Dict[str, str]] = {
    "trial": {
        "name": "Free Trial",
        "tagline": "One-time 14-day starter trial with 15,000 task tokens — unlocked after 2FA, a $0.01 payment verification, and approval. New accounts start at 0 tokens.",
    },
    "testing": {
        "name": "Testing",
        "tagline": "Free 10,000 task tokens for people evaluating the platform and reporting issues. They never expire. Tell the developer who you are and why you want access — approval is manual.",
    },
    "basic": {
        "name": "Basic",
        "tagline": "30,000 task tokens / month for steady coursework.",
    },
    "pro": {
        "name": "Pro",
        "tagline": "100,000 task tokens / month for a full semester load.",
    },
    "elite": {
        "name": "Elite",
        "tagline": "270,000 task tokens / month for heavy research and multi-agent work.",
    },
}

# How each tier's allowance recurs, for the allowance line only. The paid tiers
# renew monthly; the trial is a one-time grant that ends with the trial, and
# Testing is a flat grant that never expires.
ALLOWANCE_RECURRENCE: Dict[str, str] = {
    "trial": " for the 14-day trial",
    "testing": " (never expires)",
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


def tier_availability() -> Dict[str, bool]:
    """Which tiers a user can actually START right now.

    Owner 2026-09-18: *"for now the helpotron doesnt have a stripe so theres no
    paid tiers for now... keep all the current tiers, but if users try to click
    on them, just wire up a 'not available yet' warning, and the only available
    tier is the testing tier (for now)"*, with a real launch expected in ~2 weeks.

    Every tier stays VISIBLE — they are the product roadmap and hiding them would
    misrepresent the offering. What changes is whether the button does anything.

    The paid tiers and the trial are gated on the payment gateway, not on a
    hand-flipped boolean: the trial's $0.01 verification is itself a payment, so
    it cannot run without a gateway either. The moment Stripe keys land in the
    environment these open by themselves, with no code change and nothing to
    remember on launch day.

    `testing` is open permanently: it is free, granted by hand, and needs no
    gateway — that is the entire point of it existing before launch.
    """
    gateway = bool(_stripe_enabled())
    return {
        "trial": gateway,
        "testing": True,
        "basic": gateway,
        "pro": gateway,
        "elite": gateway,
    }


def get_plan_catalogue() -> List[Dict[str, Any]]:
    """Serialisable plan list for the public ``/api/plans`` endpoint."""
    # Paid plans cannot be bought while the payment gateway is unconfigured.
    # Advertising a plan the checkout cannot sell is the "inert control" failure
    # in reverse — a button that takes money nowhere. The frontend reads these
    # flags and shows a "not available yet" notice instead of a dead checkout.
    availability = tier_availability()
    catalogue: List[Dict[str, Any]] = []
    for plan in PLAN_ORDER:
        copy = PLAN_COPY.get(plan, {})
        cents = _price_cents(plan)
        is_trial = plan == "trial"
        is_testing = plan == "testing"
        tokens = TIER_MONTHLY_CREDITS.get(plan, 30000)
        free_entry = is_trial or is_testing
        available = availability.get(plan, False)
        catalogue.append(
            {
                "id": plan,
                "name": copy.get("name", plan.title()),
                "tagline": copy.get("tagline", ""),
                "price_cents": cents,
                "price_monthly": cents / 100,
                "monthly_task_tokens": tokens,
                "monthly_credits": tokens,  # backwards-compatible field
                # Only a tier that can actually be started is "popular" — a
                # highlighted CTA that cannot be pressed is worse than no CTA.
                "popular": plan == "pro" and available,
                "is_trial": is_trial,
                "is_testing": is_testing,
                "is_free": free_entry,
                # False = real tier, not startable today. The UI must say so
                # rather than opening a checkout that cannot complete.
                "available": available,
                "unavailable_reason": (
                    "" if available
                    else (
                        # The trial is free, but its $0.01 verification IS a
                        # payment, so it is blocked on the same gateway the paid
                        # plans are. Say why honestly rather than implying it is
                        # a paid tier that is merely unreleased.
                        "Not available yet — the 1¢ verification opens at launch."
                        if is_trial
                        else "Not available yet — paid plans open at launch."
                    )
                ),
                "purchasable": available,  # kept: older clients read this
                # Owner 09-06: trial requires 2FA + a 1-cent payment verification.
                "requires_2fa": is_trial,
                "requires_1c_payment": is_trial,
                # Owner 2026-09-18: the Testing tier is granted BY HAND — the
                # applicant messages the developer, the agent triages and
                # forwards an assessment, and the owner approves. No money and
                # no card, so the gate is a human decision, not a payment.
                "requires_approval": is_testing,
                "badge": (
                    "1-Time Trial" if is_trial and available
                    else ("Free Access" if is_testing
                          else ("Most Popular" if plan == "pro" and available else None))
                ),
                # No USD-value disclosure (owner 09-06): token allowances only.
                #
                # The recurrence word has to match the tier. Saying
                # "15,000 task tokens / month" on a ONE-TIME trial and on a
                # never-expiring Testing grant advertises an allowance that
                # renews when nothing renews it (owner 2026-09-19).
                "capabilities": [
                    f"{tokens:,} task tokens{ALLOWANCE_RECURRENCE.get(plan, ' / month')}",
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
