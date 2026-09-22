"""Per-area setting overrides (owner 2026-09-21).

Owner: "have the main settings page work globally, and then at the individual
regional areas, at like an assignment bubble, or subject bubble, my agent, etc u
have subsettings there that can override the global default".

The feature shipped inert THREE separate ways, so these tests pin the parts that
each of those breaks would have caught:

  1. `scoped` was not a writable key, so the API dropped every write while
     returning success. Covered by the write-path test.
  2. The UI read/wrote `scoped_subsettings` in a shape nothing resolved. The
     resolver now accepts both names and both shapes — covered here.
  3. `humanizer_ctx` was only built when an assignment was in play, so on
     My Agent the context was None and a `place` override had nothing to match.
     Covered by the two `_build_agent_chat_prompt` tests.
"""
import pytest
from types import SimpleNamespace

from server.humanize_skill import humanizer_enabled, _scoped_value, _SCOPE_ORDER


def _settings(scoped=None, humanizer="off", **ai_overrides):
    ai = {"humanizer": humanizer}
    ai.update(ai_overrides)
    s = {"ai": ai}
    if scoped is not None:
        s["scoped"] = scoped
    return s


def _variant(level, ref, value):
    return {"id": "v-test", "scope": {"level": level, "ref": ref}, "value": value}


def _legacy_variant(target_type, target_value, value):
    """The shape written by the ORIGINAL UI (and the one stored historically)."""
    return {"id": "v-old", "target_type": target_type, "target_value": target_value, "value": value}


class TestScopeOrder:
    def test_place_is_in_the_chain(self):
        assert _SCOPE_ORDER == ("assignment", "subject", "place")

    def test_most_specific_wins(self):
        scoped = {
            "ai.humanizer": [
                _variant("place", "my_agent", "place-value"),
                _variant("subject", "Chemistry", "subject-value"),
                _variant("assignment", "Lab report", "assignment-value"),
            ]
        }
        s = _settings(scoped=scoped, humanizer="off")
        ctx = {"assignment": "Lab report", "subject": "Chemistry", "place": "my_agent"}
        # assignment is most specific
        assert _scoped_value(s, "ai.humanizer", ctx) == "assignment-value"

    def test_subject_beats_place_when_no_assignment(self):
        scoped = {
            "ai.humanizer": [
                _variant("place", "my_agent", "off"),
                _variant("subject", "Chemistry", "on"),
            ]
        }
        s = _settings(scoped=scoped, humanizer="off")
        assert _scoped_value(s, "ai.humanizer", {"subject": "Chemistry", "place": "my_agent"}) == "on"
        # a different subject falls through to the place scope
        assert _scoped_value(s, "ai.humanizer", {"subject": "Physics", "place": "my_agent"}) == "off"

    def test_place_only_matches_its_own_surface(self):
        scoped = {"ai.humanizer": [_variant("place", "my_agent", "on")]}
        s = _settings(scoped=scoped, humanizer="off")
        assert _scoped_value(s, "ai.humanizer", {"place": "my_agent"}) == "on"
        # the extension surface is a different place and must not inherit it
        assert _scoped_value(s, "ai.humanizer", {"place": "extensions"}) is None


class TestLegacyShapeStillResolves:
    """Nothing that was already stored may silently stop working."""

    def test_target_type_shape(self):
        scoped = {"ai.humanizer": [_legacy_variant("subject", "Chemistry", "on")]}
        s = _settings(scoped=scoped, humanizer="off")
        assert _scoped_value(s, "ai.humanizer", {"subject": "Chemistry"}) == "on"

    def test_scoped_subsettings_key_is_still_read(self):
        s = _settings(humanizer="off")
        s["scoped_subsettings"] = {"ai.humanizer": [_legacy_variant("subject", "Chemistry", "on")]}
        assert _scoped_value(s, "ai.humanizer", {"subject": "Chemistry"}) == "on"


class TestScopeRefIsAName:
    def test_an_id_shaped_ref_does_not_match_a_name(self):
        """`ref` must be the NAME — the server's context carries titles, not ids."""
        scoped = {"ai.humanizer": [_variant("subject", "42", "on")]}
        s = _settings(scoped=scoped, humanizer="off")
        assert _scoped_value(s, "ai.humanizer", {"subject": "Chemistry"}) is None


class TestEnforcement:
    def test_global_on_but_subject_overrides_it_off(self):
        scoped = {"ai.humanizer": [_variant("subject", "Chemistry", "off")]}
        s = _settings(scoped=scoped, humanizer="on")
        assert humanizer_enabled(s, "my_agent", {"subject": "Chemistry"}) is False
        assert humanizer_enabled(s, "my_agent", {"subject": "Physics"}) is True

    def test_global_off_but_subject_overrides_it_on(self):
        scoped = {"ai.humanizer": [_variant("subject", "Chemistry", "on")]}
        s = _settings(scoped=scoped, humanizer="off")
        assert humanizer_enabled(s, "my_agent", {"subject": "Chemistry"}) is True
        assert humanizer_enabled(s, "my_agent", {"subject": "Physics"}) is False

    def test_a_place_override_reaches_a_real_turn(self):
        scoped = {"ai.humanizer": [_variant("place", "my_agent", "on")]}
        s = _settings(scoped=scoped, humanizer="off")
        assert humanizer_enabled(s, "my_agent", {"place": "my_agent"}) is True


class TestAgentContextCarriesTheSurface:
    """The bug this pins: ctx was None on My Agent, so `place` could never match."""

    @pytest.fixture
    def built(self, monkeypatch):
        from server import routes_overlord

        def build(assignment_id, row=None):
            user = SimpleNamespace(id=1, public_id="tester", role="user", settings={})
            payload = SimpleNamespace(
                assignment_id=assignment_id, thread_id=None, text="hi",
                model=None, effort_score=None,
            )
            return routes_overlord._build_agent_chat_prompt(user, payload, MagicMock_db(row))

        return build

    def test_my_agent_surface_scopes_to_its_own_place(self, built):
        ctx = built(None)
        assert ctx["agent_node"] == "my_agent"
        # The whole point: a non-None ctx means a `place: my_agent` override resolves.
        assert ctx["humanizer_ctx"] is not None, (
            "humanizer_ctx must carry the surface even with no assignment, or every "
            "place-scoped override on My Agent is silently inert"
        )
        assert ctx["humanizer_ctx"]["place"] == "my_agent"

    def test_assignment_surface_carries_all_three_dimensions(self, built, monkeypatch):
        from server import routes_overlord

        row = SimpleNamespace(id=7, title="Lab report", progress={"subject": "Chemistry"})
        monkeypatch.setattr(routes_overlord, "_agent_assignment_context", lambda *a, **k: "")
        ctx = built(7, row=row)
        assert ctx["agent_node"] == "assignment_team"
        assert ctx["humanizer_ctx"]["place"] == "assignment_team"
        assert ctx["humanizer_ctx"]["assignment"] == "Lab report"
        assert ctx["humanizer_ctx"]["subject"] == "Chemistry"


class MagicMock_db:
    """Just enough Session for the context builder: it only runs one `.query().filter().first()`."""

    def __init__(self, row=None):
        self._row = row

    def query(self, *_a, **_k):
        return self

    def filter(self, *_a, **_k):
        return self

    def first(self):
        return self._row


class TestClearingOverrides:
    """`scoped` must be replaceable wholesale.

    The generic settings merge is `current[k].update(v)`, which makes deletion
    impossible: `PATCH {"scoped": {}}` merges nothing, leaves every existing key,
    returns 200 — and a stale override becomes permanent with no way to remove it.
    """

    def _user(self):
        return SimpleNamespace(id=1, public_id="tester", settings={})

    class FakeDB:
        """Faithful enough for the write path.

        The real method does `db.execute(update(User).values(settings=...))` and then
        `db.refresh(user)` — the refreshed ORM object is what the caller reads back.
        A double that ignores the write makes every assertion vacuous: an earlier
        version of this test passed the merge bug straight through, because it was
        asserting on an object the real database would have replaced.
        """

        def __init__(self, user):
            self.user = user

        def execute(self, stmt, *_a, **_k):
            try:
                self._pending = dict(stmt.compile().params)["settings"]
            except Exception:
                self._pending = None

        def commit(self):
            if self._pending is not None:
                self.user.settings = self._pending
                self._pending = None

        def refresh(self, *_a, **_k):
            pass

    def _db(self, user):
        return self.FakeDB(user)

    def test_empty_map_clears_every_override(self):
        from server.user_settings_service import UserSettingsService as S

        user = self._user()
        user.settings = {
            "scoped": {
                "ai.humanizer": [_variant("subject", "Chemistry", "off")],
                "ai.detection.enabled": [_variant("place", "my_agent", True)],
            }
        }
        S.update_user_settings(self._db(user), user, {"scoped": {}})
        assert user.settings["scoped"] == {}, (
            "scoped must REPLACE, not merge — otherwise a stale override can never "
            "be removed"
        )

    def test_a_partial_map_replaces_rather_than_merges(self):
        from server.user_settings_service import UserSettingsService as S

        user = self._user()
        user.settings = {"scoped": {"ai.humanizer": [_variant("subject", "Chemistry", "off")]}}
        S.update_user_settings(self._db(user), user, {"scoped": {"ai.detection.enabled": []}})
        assert list(user.settings["scoped"]) == ["ai.detection.enabled"]

    def test_other_nested_settings_still_merge(self):
        """The replace rule must be narrow — it exists for `scoped` alone."""
        from server.user_settings_service import UserSettingsService as S

        user = self._user()
        user.settings = {"ai": {"humanizer": "off", "effortScore": 5}}
        S.update_user_settings(self._db(user), user, {"ai": {"humanizer": "on"}})
        ai = user.settings["ai"]
        assert ai["humanizer"] == "on"
        # the sibling key must SURVIVE — that is the merge being preserved
        assert ai["effortScore"] == 5
