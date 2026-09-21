"""Account profile: display name, avatar, and the public-ID rename.

The rename is the one that needs real tests — it changes the LOGIN IDENTIFIER, so
every guard around it is load-bearing:

  * an API key must never be able to do it (a leaked key must not take over an
    account by renaming it),
  * the current password must be required (an open session on a shared machine
    must not be able to lock the owner out of their own id),
  * the same validator signup uses must apply, so a rename cannot reach a
    reserved or admin-looking name registration would refuse,
  * uniqueness is case-insensitive, or the login lookup becomes ambiguous.

A fixed public_id per test run is not used: the test DB is a persistent FILE and a
literal id collides with whatever a previous run left behind.
"""
from __future__ import annotations

import uuid

import pytest


def _signup(client, password="CorrectHorse1"):
    """A fresh, password-bearing account with a live session. Unique every run."""
    uid = f"prof_{uuid.uuid4().hex[:10]}"
    client.post("/api/signup", json={"public_id": uid, "password": password})
    login = client.post("/api/login", json={"public_id": uid, "password": password})
    cookies = dict(login.cookies)
    return uid, password, cookies, {"X-CSRF-Token": cookies.get("csrf_token", "")}


def test_profile_reads_and_defaults_to_empty(client):
    uid, _pw, cookies, headers = _signup(client)
    resp = client.get("/api/user/profile", cookies=cookies, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["public_id"] == uid
    # Nothing set yet: the UI shows the empty state, not a fabricated name.
    assert body["display_name"] == ""
    assert body["avatar_url"] == ""
    # A password-bearing account CAN rename itself.
    assert body["can_change_public_id"] is True


def test_display_name_is_stripped_and_persists(client):
    _uid, _pw, cookies, headers = _signup(client)
    resp = client.patch(
        "/api/user/profile",
        json={"display_name": "  Ada Lovelace  "},
        cookies=cookies,
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Ada Lovelace"

    again = client.get("/api/user/profile", cookies=cookies, headers=headers)
    assert again.json()["display_name"] == "Ada Lovelace"


def test_display_name_strips_control_characters(client):
    """A pasted name carrying a newline must not inject a line break into every
    surface that renders it (agent greeting, admin tables, Telegram handoffs)."""
    _uid, _pw, cookies, headers = _signup(client)
    resp = client.patch(
        "/api/user/profile",
        json={"display_name": "Ada\nLovelace"},
        cookies=cookies,
        headers=headers,
    )
    assert resp.status_code == 200
    assert "\n" not in resp.json()["display_name"]


def test_avatar_url_must_be_ours_or_https(client):
    """A `javascript:` or `data:` URL here would be stored XSS the moment another
    surface renders it in an <img src>."""
    _uid, _pw, cookies, headers = _signup(client)
    for bad in ("javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://evil.test/x.png"):
        resp = client.patch(
            "/api/user/profile",
            json={"avatar_url": bad},
            cookies=cookies,
            headers=headers,
        )
        assert resp.status_code == 400, bad

    ok = client.patch(
        "/api/user/profile",
        json={"avatar_url": "/uploads/avatars/abc123.png"},
        cookies=cookies,
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["avatar_url"] == "/uploads/avatars/abc123.png"


def test_avatar_can_be_removed_with_empty_string(client):
    _uid, _pw, cookies, headers = _signup(client)
    client.patch("/api/user/profile", json={"avatar_url": "/uploads/avatars/a.png"},
                 cookies=cookies, headers=headers)
    gone = client.patch("/api/user/profile", json={"avatar_url": ""},
                        cookies=cookies, headers=headers)
    assert gone.status_code == 200
    assert gone.json()["avatar_url"] == ""


def test_public_id_change_requires_the_password(client):
    uid, _pw, cookies, headers = _signup(client)
    resp = client.post(
        "/api/user/profile/public-id",
        json={"new_public_id": f"renamed_{uuid.uuid4().hex[:8]}", "password": "wrong-password"},
        cookies=cookies,
        headers=headers,
    )
    assert resp.status_code == 403
    # And the account is untouched.
    assert client.get("/api/user/profile", cookies=cookies, headers=headers).json()["public_id"] == uid


def test_public_id_change_succeeds_and_the_new_id_logs_in(client):
    uid, password, cookies, headers = _signup(client)
    new_id = f"renamed_{uuid.uuid4().hex[:8]}"

    resp = client.post(
        "/api/user/profile/public-id",
        json={"new_public_id": new_id, "password": password},
        cookies=cookies,
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["public_id"] == new_id
    assert resp.json()["previous_public_id"] == uid

    # The whole point: the account now signs in with the new identifier.
    fresh = client.post("/api/login", json={"public_id": new_id, "password": password})
    assert fresh.status_code == 200


def test_public_id_rejects_reserved_and_malformed_names(client):
    _uid, password, cookies, headers = _signup(client)
    for bad in ("admin", "root", "administrator", "has space", "bad!char"):
        resp = client.post(
            "/api/user/profile/public-id",
            json={"new_public_id": bad, "password": password},
            cookies=cookies,
            headers=headers,
        )
        assert resp.status_code == 400, bad


def test_public_id_uniqueness_is_case_insensitive(client):
    """`Taken` and `taken` must not both exist — the login lookup would be
    ambiguous and the account impossible to sign in to reliably."""
    _a, _apw, _ac, _ah = _signup(client)
    existing = f"Taken_{uuid.uuid4().hex[:8]}"
    client.post("/api/signup", json={"public_id": existing, "password": "CorrectHorse1"})

    _uid, password, cookies, headers = _signup(client)
    resp = client.post(
        "/api/user/profile/public-id",
        json={"new_public_id": existing.lower(), "password": password},
        cookies=cookies,
        headers=headers,
    )
    assert resp.status_code == 409


def test_public_id_change_is_refused_for_an_api_key(client):
    """The extension's key must not be able to rename the account it belongs to —
    that is a takeover primitive from a credential designed to be revocable."""
    uid, _pw, cookies, headers = _signup(client)
    made = client.post("/api/keys", json={"label": "probe"}, cookies=cookies, headers=headers)
    assert made.status_code == 200, made.text
    raw = made.json().get("key") or made.json().get("api_key")

    resp = client.post(
        "/api/user/profile/public-id",
        json={"new_public_id": f"stolen_{uuid.uuid4().hex[:8]}", "password": "CorrectHorse1"},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert resp.status_code == 403
    # The key may still READ the profile (the extension shows who is signed in).
    assert client.get("/api/user/profile", headers={"Authorization": f"Bearer {raw}"}).status_code == 200
    # And nothing changed.
    assert client.get("/api/user/profile", cookies=cookies, headers=headers).json()["public_id"] == uid


def test_profile_endpoints_require_auth(client):
    assert client.get("/api/user/profile").status_code == 401
    assert client.patch("/api/user/profile", json={"display_name": "x"}).status_code == 401
    assert client.post(
        "/api/user/profile/public-id",
        json={"new_public_id": "whatever", "password": "x"},
    ).status_code == 401
