"""Assert every model carrying user ownership is in _CHILD_TABLES or explicitly exempted."""
from server.database import Base
import server.privacy as privacy


# Tables intentionally exempted from direct _CHILD_TABLES iteration (e.g. system logs,
# admin records, transient tokens, or tables managed via separate policies).
EXEMPT_USER_TABLES = {
    "users",
    "admin_messages",
    "admin_notice_reads",
    "admin_notices",
    "agent_actions",
    "agent_chat_messages",
    "agent_chat_threads",
    "agent_files",
    "api_keys",
    "calendar_entries",
    "claimed_trial_phones",
    "extension_release_reads",
    "password_resets",
    "study_card_states",
    "trash_items",
    "user_settings",
    "user_settings_scopes",
}


def test_every_user_owned_table_is_erased():
    """Every table with a user_id column must be in _CHILD_TABLES or explicitly exempted."""
    child_table_names = {m.__tablename__ for m in privacy._CHILD_TABLES}
    uncovered = []

    for mapper in Base.registry.mappers:
        table = mapper.local_table
        col_names = [c.name for c in table.columns]
        if "user_id" in col_names:
            if table.name not in child_table_names and table.name not in EXEMPT_USER_TABLES:
                uncovered.append(table.name)

    assert not uncovered, (
        f"New models with user_id added without GDPR erasure coverage: {uncovered}. "
        f"Add them to server/privacy.py _CHILD_TABLES or EXEMPT_USER_TABLES."
    )
