"""A subscription checkout must not send a login name to Stripe as an email.

Found while answering "is helpotron ready to ship paid" (2026-09-25), by driving the
real checkout path instead of reading it.

`create_checkout_session` created the Stripe customer with
`email=user.public_id`. A public_id is the LOGIN IDENTIFIER (`RoniDev`, `bold`,
`max`, ...), not an address — and Stripe rejects a malformed address outright:

    InvalidRequestError: Invalid email address: RoniDev

Measured against the live account, and ZERO of the 16 real accounts have an
email-shaped public_id. The exception was raised while creating the customer, which
happens BEFORE the checkout session exists — so no user could reach a payment page
at all. The paid path was unreachable at its first step.

The invariant these tests pin: whatever reaches Stripe's `email` parameter must be a
real address, and a user without one must still be able to buy.
"""
import pytest

from server.database import init_db, SessionLocal, User
from server import payments

init_db()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _user(db, public_id, settings=None):
    u = db.query(User).filter(User.public_id == public_id).first()
    if u is None:
        u = User(public_id=public_id, plan="none", credits=0.0,
                 settings=settings or {"token_balance": 0.0})
        db.add(u)
    else:
        u.settings = settings or {"token_balance": 0.0}
        u.stripe_customer_id = None
    db.commit()
    db.refresh(u)
    return u


class _Stub:
    """Records the kwargs it was called with into ITS OWN dict.

    Each stub gets its own capture dict: a shared one lets the later
    Session.create call overwrite the Customer params this test is asserting on.
    """
    def __init__(self, captured, id_value="stub_id"):
        self._captured = captured
        self._id_value = id_value

    def create(self, **kwargs):
        self._captured.clear()
        self._captured.update(kwargs)
        return type("Obj", (), {"id": self._id_value, "url": "https://checkout.stripe.com/stub"})()


def _patch_stripe(monkeypatch, customer_captured, session_captured=None):
    """Stub BOTH calls the function makes, with real signatures live.

    The first version of this test stubbed only Customer, so the code proceeded to
    stripe.checkout.Session.create with a fake price id and the test failed against
    the LIVE API (resource_missing). A test that reaches the network is neither
    hermetic nor evidence — stub every call the unit makes.
    """
    import stripe
    if session_captured is None:
        session_captured = {}
    monkeypatch.setattr(stripe, "Customer", _Stub(customer_captured, "cus_test_stub"))
    monkeypatch.setattr(stripe.checkout, "Session", _Stub(session_captured, "cs_test_stub"))
    monkeypatch.setattr(payments, "stripe_price_ids", lambda: {"basic": "price_test_basic"})
    monkeypatch.setattr(payments, "_stripe_enabled", lambda: True)


def test_username_public_id_is_not_sent_as_email(db, monkeypatch):
    """THE REGRESSION. A login name must never reach Stripe's email field."""
    captured = {}
    _patch_stripe(monkeypatch, captured)

    u = _user(db, "RoniDev")
    payments.create_checkout_session(db, u, "basic")

    assert "email" not in captured or captured.get("email") != "RoniDev", (
        "public_id was sent to Stripe as an email address. Stripe rejects it with "
        "'Invalid email address: RoniDev' and the customer is never created, so no "
        "user can reach a payment page."
    )


def test_checkout_succeeds_for_a_user_with_no_email(db, monkeypatch):
    """A sale must not depend on the customer having an address on file."""
    captured = {}
    _patch_stripe(monkeypatch, captured)

    u = _user(db, "usr_no_email_here", settings={"token_balance": 0.0})
    # must not raise — that is the whole bug
    payments.create_checkout_session(db, u, "basic")
    assert captured.get("metadata", {}).get("public_id") == "usr_no_email_here"


def test_real_email_is_passed_through(db, monkeypatch):
    """When the account HAS a contact address, Stripe should get it."""
    captured = {}
    _patch_stripe(monkeypatch, captured)

    u = _user(db, "usr_with_email", settings={
        "token_balance": 0.0,
        "profile": {"email": "real.person@example.com"},
    })
    payments.create_checkout_session(db, u, "basic")

    assert captured.get("email") == "real.person@example.com", (
        f"the account's real contact address should be passed to Stripe; "
        f"got {captured.get('email')!r}"
    )


def test_malformed_contact_email_is_not_passed(db, monkeypatch):
    """A junk value in settings must not resurrect the same Stripe error."""
    captured = {}
    _patch_stripe(monkeypatch, captured)

    u = _user(db, "usr_bad_email", settings={
        "token_balance": 0.0,
        "profile": {"email": "not-an-address"},
    })
    payments.create_checkout_session(db, u, "basic")

    assert captured.get("email") != "not-an-address", (
        "a malformed contact value was forwarded to Stripe as an email"
    )
