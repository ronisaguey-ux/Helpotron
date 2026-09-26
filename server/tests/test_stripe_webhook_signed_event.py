"""A real, correctly-signed Stripe webhook must actually grant tokens.

Found while answering "is Stripe ready to receive money" (2026-09-26), by driving a
genuinely signed event through the handler instead of reading it.

`stripe.Webhook.construct_event` returns a `stripe.Event`. In stripe-python 15.x that
is a StripeObject with NO `.get()`:

    AttributeError: 'get' is a dict method, but a Event is not a dict.
    Use .to_dict() to convert it.

Every branch of `handle_stripe_webhook` reads the event via `.get(...)`, so a REAL
webhook crashed on its very first line — `event.get("id")`. The route only catches
`ValueError`, so the caller saw a 500, Stripe retried, and the customer would have
been charged with tokens never granted: money in, nothing out.

The unit suite did not catch this because nothing exercised the signed path end to
end — the test events were plain dicts, which DO have `.get()`.

Measured before the fix: `handle_stripe_webhook` raised AttributeError on a signed
event. After: returns {"status": "received"} and the $10 basic plan grants 30,000
tokens. Non-vacuous — the first test fails on the unfixed tree.
"""
import hashlib
import hmac
import json
import time
import uuid

import pytest

from server.config import settings
from server.database import init_db, SessionLocal, User
from server import credits, payments

init_db()

pytestmark = pytest.mark.skipif(
    not (settings.stripe_webhook_secret or "").startswith("whsec_"),
    reason="needs a real whsec_ webhook secret to sign an event",
)


def _sign(payload: bytes) -> str:
    t = str(int(time.time()))
    sig = hmac.new(
        settings.stripe_webhook_secret.encode(),
        f"{t}.".encode() + payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={t},v1={sig}"


def _user(db, public_id, customer_id):
    u = db.query(User).filter(User.public_id == public_id).first()
    if u is None:
        u = User(public_id=public_id, plan="none", credits=0.0,
                 settings={"token_balance": 0.0}, stripe_customer_id=customer_id)
        db.add(u)
    else:
        u.plan = "none"
        # subscription_status is NOT NULL — "" not None
        u.subscription_status = ""
        u.stripe_customer_id = customer_id
        u.settings = {"token_balance": 0.0}
    db.commit()
    db.refresh(u)
    return u


def _event(event_type, obj):
    return json.dumps(
        {"id": "evt_" + uuid.uuid4().hex[:16], "type": event_type, "data": {"object": obj}},
        separators=(",", ":"),
    ).encode()


def test_signed_webhook_does_not_crash(db):
    """THE REGRESSION. A stripe.Event has no .get(); the handler is written with it."""
    _user(db, "wh_crash_probe", "cus_wh_crash")
    payload = _event("checkout.session.completed", {
        "customer": "cus_wh_crash", "payment_status": "paid", "amount_total": 1000,
        "metadata": {"plan": "basic"},
    })
    # must not raise AttributeError
    out = payments.handle_stripe_webhook(payload, _sign(payload))
    assert isinstance(out, dict)


def test_signed_payment_grants_the_plan_allowance(db):
    """The money path, end to end: a paid checkout credits the right tokens."""
    uid = "wh_grant_probe"
    cus = "cus_wh_grant"
    _user(db, uid, cus)

    payload = _event("checkout.session.completed", {
        "customer": cus, "subscription": "sub_wh_grant", "payment_status": "paid",
        "amount_total": 1000, "metadata": {"plan": "basic"},
    })
    out = payments.handle_stripe_webhook(payload, _sign(payload))
    assert out.get("status") == "received", out

    db2 = SessionLocal()
    u2 = db2.query(User).filter(User.public_id == uid).first()
    assert credits.get_token_balance(u2) == payments.TIER_TOKENS["basic"], (
        f"a paid basic checkout must grant {payments.TIER_TOKENS['basic']:,} tokens; "
        f"got {credits.get_token_balance(u2):,.0f}. This is the money path — a "
        f"customer charged with nothing granted."
    )
    assert u2.plan == "basic"
    assert u2.subscription_status == "active"
    db2.close()


def test_bad_signature_still_rejected(db):
    """The fix must not weaken signature verification."""
    payload = _event("checkout.session.completed", {"customer": "cus_x", "metadata": {}})
    with pytest.raises(ValueError):
        payments.handle_stripe_webhook(payload, "t=1,v1=deadbeef")


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
