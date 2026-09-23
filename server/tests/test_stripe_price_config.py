"""Stripe price ids must resolve from config, not os.environ.

The bug this pins (2026-09-23): payments.py built its price map at import time with
`os.getenv("STRIPE_PRICE_*")`. config.py is a pydantic BaseSettings that reads .env
itself and never populates os.environ, so those lookups returned empty unless some
OTHER module had already called load_dotenv() first (server/llm.py does). Proven:

    import server.payments          -> {'basic': False, 'pro': False, 'elite': False}
    import server.llm; server.payments -> {'basic': True, ...}

So `create_checkout_session` raised "No Stripe price configured for plan 'basic'"
in a fresh process and worked in the running server — checkout success depended on
module import order. The same class is already recorded for hip_humanizer.

These tests are mechanism tests, not value tests: they prove the price map is read
live from config, so they hold with or without real price ids configured.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO))


def test_price_ids_are_read_live_from_config():
    """A config change must be visible immediately — not frozen at import time."""
    from server.config import config
    from server.payments import stripe_price_ids

    original = (config.stripe_price_basic, config.stripe_price_pro, config.stripe_price_elite)
    try:
        config.stripe_price_basic = "price_TEST_basic"
        config.stripe_price_pro = "price_TEST_pro"
        config.stripe_price_elite = "price_TEST_elite"

        got = stripe_price_ids()
        assert got["basic"] == "price_TEST_basic", got
        assert got["pro"] == "price_TEST_pro", got
        assert got["elite"] == "price_TEST_elite", got
    finally:
        (config.stripe_price_basic,
         config.stripe_price_pro,
         config.stripe_price_elite) = original


def test_price_ids_reflect_clearing_config():
    """Setting them empty must yield empty — i.e. no cached snapshot survives."""
    from server.config import config
    from server.payments import stripe_price_ids

    original = (config.stripe_price_basic, config.stripe_price_pro, config.stripe_price_elite)
    try:
        config.stripe_price_basic = ""
        config.stripe_price_pro = ""
        config.stripe_price_elite = ""
        assert stripe_price_ids() == {"basic": "", "pro": "", "elite": ""}
    finally:
        (config.stripe_price_basic,
         config.stripe_price_pro,
         config.stripe_price_elite) = original


def test_price_ids_are_not_read_with_os_getenv():
    """Source guard: the module must not snapshot prices from os.environ.

    Without this, someone can reintroduce `STRIPE_PRICE_IDS = {os.getenv(...)}` and
    the mechanism tests above would still pass, because they exercise the accessor
    rather than the module-level state that caused the outage.

    Parsed as an AST rather than matched with a regex: a regex also matches the
    comment that documents this very bug, so it would fail on correct code.
    """
    import ast

    src = (REPO / "server" / "payments.py").read_text()
    tree = ast.parse(src)

    offenders = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func
        is_getenv = (
            isinstance(fn, ast.Attribute) and fn.attr == "getenv"
            and isinstance(fn.value, ast.Name) and fn.value.id == "os"
        )
        if not is_getenv or not node.args:
            continue
        arg = node.args[0]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str) \
                and arg.value.startswith("STRIPE_PRICE_"):
            offenders.append((node.lineno, arg.value))

    assert not offenders, (
        "payments.py reads price ids from os.getenv again — that is the exact bug: "
        "pydantic Settings never populates os.environ, so these are empty unless a "
        f"different module happened to call load_dotenv() first. Found: {offenders}"
    )


def test_config_declares_the_price_fields():
    """The ids must exist as pydantic fields, which is what makes them .env-backed."""
    from server.config import config
    for field in ("stripe_price_basic", "stripe_price_pro", "stripe_price_elite"):
        assert hasattr(config, field), f"config is missing {field}"


def test_checkout_does_not_depend_on_llm_being_imported_first():
    """The original symptom, reproduced as an assertion.

    In a fresh interpreter that imports ONLY payments, the price map must be
    populated from .env. Before the fix this returned all-empty unless
    server.llm had been imported first.
    """
    import subprocess

    code = (
        "import sys; sys.path.insert(0, %r)\n"
        "from server.payments import stripe_price_ids\n"
        "from server.config import config\n"
        "ids = stripe_price_ids()\n"
        "# Compare against config, which is the source of truth read from .env.\n"
        "expected = [config.stripe_price_basic, config.stripe_price_pro, config.stripe_price_elite]\n"
        "got = [ids['basic'], ids['pro'], ids['elite']]\n"
        "assert got == expected, (got, expected)\n"
        "assert 'server.llm' not in sys.modules, 'llm must not have been imported'\n"
        "print('OK')\n"
    ) % str(REPO)

    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120)
    assert "OK" in r.stdout, (
        "a fresh process importing only server.payments did not resolve the price ids "
        f"from config.\nstdout: {r.stdout}\nstderr: {r.stderr[-800:]}"
    )
