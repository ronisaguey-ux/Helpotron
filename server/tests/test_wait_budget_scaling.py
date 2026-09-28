"""The 'server is busy' notice must scale with priority, not sit at a flat 3 minutes.

Owner, 2026-09-28: *"add a time limit of waiting for the user, and it scales with priority, like
for example a high priority easy process like a user saying 'hello' should only be waiting 30s
untill they get a 'server is busy, your request will be processed instantly when load lightens'
but for lower priority, like lets say humanization, has a 5min wait score, where the UI shows
its in progress to not piss the uder off fkr 5min, and beyond that it gets honest and says the
same server busy now"*.

★ A FLAT 180 IS WRONG IN BOTH DIRECTIONS, and this is the test that would have caught it. It
told a greeting to wait six times longer than its own promise, and warned a humanization 120
seconds BEFORE its patience had run out — both of which read as the system being confused.

★ THE CLIENT MUST NOT HOLD ITS OWN COPY OF THE NUMBERS. The notice the user reads has to come
from the same registry the queue enforces, or the two drift and the visible one is the lie.
"""

import sys

sys.path.insert(0, "/home/roni/Roni_workspace/helpotron")

from server.priority import wait_budget_seconds  # noqa: E402
from server.resource_guard import should_show_busy  # noqa: E402


def test_hello_gets_a_short_budget():
    """A cheap, high-priority turn must not be told to wait three minutes."""
    assert wait_budget_seconds("chat_message") == 30.0
    assert should_show_busy(29, "chat_message") is False
    assert should_show_busy(30, "chat_message") is True
    # The headline case from the owner's message.
    assert should_show_busy(180, "chat_message") is True


def test_humanize_gets_the_full_five_minutes():
    """A heavy rewrite is promised five minutes before the notice is honest."""
    assert wait_budget_seconds("humanize") == 300.0
    assert should_show_busy(30, "humanize") is False
    assert should_show_busy(180, "humanize") is False, "must still read 'in progress' at 3 min"
    assert should_show_busy(299, "humanize") is False
    assert should_show_busy(300, "humanize") is True


def test_the_two_cases_genuinely_differ():
    """The whole point: the SAME elapsed time means different things per process.

    A flat threshold cannot express this, which is the defect being pinned.
    """
    elapsed = 120.0
    assert should_show_busy(elapsed, "chat_message") is True
    assert should_show_busy(elapsed, "humanize") is False


def test_an_unknown_process_gets_the_default():
    """An unnamed caller must not inherit a cheap task's impatience."""
    assert wait_budget_seconds("no_such_process") == 180.0
    assert should_show_busy(179, "no_such_process") is False
    assert should_show_busy(180, "no_such_process") is True


def test_the_client_table_matches_the_queue():
    """The published map must equal what the queue enforces, for every process."""
    from server.routes_extension_api import _wait_budget_map
    published = _wait_budget_map()
    assert published["chat_message"] == wait_budget_seconds("chat_message")
    assert published["humanize"] == wait_budget_seconds("humanize")
    assert published["default"] == 180.0
    # Every registry entry is represented, so a surface can always find its own number.
    from server.priority import PRIORITY_REGISTRY
    for name in PRIORITY_REGISTRY:
        assert name in published, f"{name} missing from the published table"
