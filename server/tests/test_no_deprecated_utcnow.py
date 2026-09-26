"""No deprecated naive-UTC calls in server code.

`datetime.utcnow()` is deprecated and scheduled for removal. The obvious replacement —
`datetime.now(timezone.utc)` — is WRONG here and this file exists to stop anyone making it:
these values are written to and compared against plain `DateTime` columns, and SQLite returns
them NAIVE. Comparing a naive stored value with an aware one raises

    TypeError: can't compare offset-naive and offset-aware datetimes

which would 500 every API-key check for any key carrying an expiry.

The correct equivalent is explicit and keeps everything naive:

    datetime.now(timezone.utc).replace(tzinfo=None)

It returns exactly what `utcnow()` did — verified: same value, `tzinfo is None`, and it still
compares safely against naive DB values. `credits.py` already used this form, so the fix was to
apply the established idiom rather than invent one.
"""
import ast
import io
import pathlib

import pytest

SERVER = pathlib.Path(__file__).resolve().parent.parent


def _server_modules():
    return sorted(p for p in SERVER.glob("*.py") if p.name != "__init__.py")


def test_no_deprecated_utcnow_calls():
    offenders = []
    for path in _server_modules():
        src = io.open(path, encoding="utf-8").read()
        for i, line in enumerate(src.splitlines(), 1):
            if "datetime.utcnow()" in line:
                offenders.append(f"{path.name}:{i}: {line.strip()}")
    assert offenders == [], (
        "datetime.utcnow() is deprecated AND its naive result is load-bearing here "
        "(it is compared against naive DateTime columns). Use "
        "datetime.now(timezone.utc).replace(tzinfo=None) instead:\n" + "\n".join(offenders)
    )


def test_the_aware_replacement_is_not_used_in_a_python_comparison():
    """Guard the mistake that actually raises.

    An aware `datetime.now(timezone.utc)` compared IN PYTHON against a value read from a plain
    `DateTime` column raises `TypeError: can't compare offset-naive and offset-aware datetimes`,
    because SQLite hands the value back naive. That is the one shape to catch.

    Deliberately NOT flagged: an aware datetime passed as a SQL bind parameter
    (`filter(Col >= since)`) or written to a column. Those go through SQLAlchemy/SQLite as
    values, are not Python comparisons, and are existing working code — a guard that failed on
    them would be an outage dressed as diligence.
    """
    import re

    # `something < datetime.now(timezone.utc) ...` with no tzinfo strip on that term.
    comparison = re.compile(r"[^\n]*[<>]=?[^\n]*datetime\.now\(timezone\.utc\)[^\n]*")
    offenders = []
    for path in _server_modules():
        src = io.open(path, encoding="utf-8").read()
        for i, line in enumerate(src.splitlines(), 1):
            if not comparison.match(line):
                continue
            if "replace(tzinfo=None)" in line:
                continue
            # A comparison inside a SQLAlchemy filter is a bind param, not a Python compare.
            if ".filter(" in line or "filter(" in line:
                continue
            offenders.append(f"{path.name}:{i}: {line.strip()}")
    assert offenders == [], (
        "an aware datetime compared in Python against a naive DateTime column will raise:\n"
        + "\n".join(offenders)
    )


def test_the_helper_still_returns_a_naive_utc_value():
    """If this changes, every naive-DB comparison in the server changes with it."""
    import datetime as dt

    value = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    assert value.tzinfo is None, "must be naive: the DateTime columns store naive values"
    # And it must still be UTC, not local time.
    utc_now = dt.datetime.now(dt.timezone.utc)
    assert abs((utc_now.replace(tzinfo=None) - value).total_seconds()) < 5
