"""Billing routes — the Stripe-hosted portal.

Mounted by routes_overlord (prefix "/api"), so the path is /api/billing/portal.
Kept out of server/main.py on purpose: that file is skip-worktree'd (local
dev-login bypass) and git will not stage changes to it.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .database import User, get_db
from .payments import create_billing_portal_session
from .routes_features import get_current_authenticated_user

router = APIRouter(prefix="/billing", tags=["billing"])


@router.post("/portal")
def billing_portal(db: Session = Depends(get_db), current_user: User = Depends(get_current_authenticated_user)):
    """Open the Stripe-hosted billing portal for the signed-in subscriber.

    The Settings "Manage Billing" control implies you can actually manage the
    subscription; the in-app plans tab cannot cancel one, so this is the real
    destination. Returns a status rather than raising when there is nothing to
    manage, so the UI can say why instead of appearing broken.
    """
    user = db.query(User).filter(User.id == current_user.id).first() or current_user
    return create_billing_portal_session(db, user)
