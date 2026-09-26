"""The inbound SMS webhook must not trust a request it cannot verify.

`_verify_twilio_signature` used to return True whenever TWILIO_AUTH_TOKEN was unset. The
endpoint checks the result and raises 401 on False, so the fail-open turned an unverifiable
request into a trusted one: knowing a target's phone number was enough to POST `Body=STOP` to
/sms/inbound and flip `sms_opt_out` on that account, which blocks their 2FA.

Twilio signs inbound webhooks with the account AUTH TOKEN, so an install holding only the API
key pair (this one) genuinely cannot verify them. "Cannot verify" must mean "refuse".

The escape hatch is deliberate and separate — TWILIO_ALLOW_UNVERIFIED_INBOUND=1 — so the
insecure state is always a decision rather than an accident. It is tested too, because a
security switch that cannot be turned on when an operator needs it is its own outage.
"""
import base64
import hashlib
import hmac
import os
from unittest.mock import patch

import pytest

from server.routes_auth_2fa import _verify_twilio_signature

URL = "https://helpotron.dpdns.org/sms/inbound"
PARAMS = {"From": "+15550001111", "Body": "STOP"}


def _sign(token: str, url: str = URL, params=None) -> str:
    params = PARAMS if params is None else params
    payload = url + "".join(f"{k}{v}" for k, v in sorted(params.items()))
    return base64.b64encode(
        hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()
    ).decode()


@pytest.fixture(autouse=True)
def _clean_env():
    """Never inherit a real token or a stray opt-in from the developer's shell."""
    saved = {k: os.environ.get(k) for k in ("TWILIO_AUTH_TOKEN", "TWILIO_ALLOW_UNVERIFIED_INBOUND")}
    for k in saved:
        os.environ.pop(k, None)
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def test_unverifiable_request_is_refused():
    """No token, no opt-in: an unsigned/forged request must be rejected, not trusted."""
    with patch("server.routes_auth_2fa.config") as cfg:
        cfg.twilio_auth_token = ""
        assert _verify_twilio_signature(URL, PARAMS, "") is False
        assert _verify_twilio_signature(URL, PARAMS, "forged-signature") is False


def test_unverified_inbound_requires_an_explicit_opt_in():
    """The insecure path exists, but only when the operator says so out loud."""
    with patch("server.routes_auth_2fa.config") as cfg:
        cfg.twilio_auth_token = ""
        os.environ["TWILIO_ALLOW_UNVERIFIED_INBOUND"] = "1"
        assert _verify_twilio_signature(URL, PARAMS, "forged") is True

        for off in ("0", "false", "no", ""):
            os.environ["TWILIO_ALLOW_UNVERIFIED_INBOUND"] = off
            assert _verify_twilio_signature(URL, PARAMS, "forged") is False, (
                f"only a truthy opt-in may accept unverified inbound (tried {off!r})"
            )


def test_a_correctly_signed_request_is_still_accepted():
    """The guard must not block real Twilio traffic — that would be an outage, not a fix."""
    token = "unit-test-auth-token"
    with patch("server.routes_auth_2fa.config") as cfg:
        cfg.twilio_auth_token = token
        assert _verify_twilio_signature(URL, PARAMS, _sign(token)) is True


def test_a_signature_over_different_params_is_rejected():
    """The signature covers the params, so a tampered Body must not validate."""
    token = "unit-test-auth-token"
    with patch("server.routes_auth_2fa.config") as cfg:
        cfg.twilio_auth_token = token
        valid = _sign(token)
        assert _verify_twilio_signature(URL, {"From": "+15550001111", "Body": "START"}, valid) is False


def test_a_signature_for_a_different_url_is_rejected():
    """The URL is part of the signed payload; a signature lifted from elsewhere must not work."""
    token = "unit-test-auth-token"
    with patch("server.routes_auth_2fa.config") as cfg:
        cfg.twilio_auth_token = token
        elsewhere = _sign(token, url="https://evil.example/sms/inbound")
        assert _verify_twilio_signature(URL, PARAMS, elsewhere) is False
