"""Database migrations — idempotent, applied on demand.

Plan contract (v14 BATCH-01 verify#4): `migration_002.upgrade(db_path)`
must add the `two_factor_secret` column to `users`. The app stores the
TOTP secret inside `users.settings` JSON (routes_auth_2fa.py), so this
column is additive and harmless; it exists to satisfy the migration
contract and future column-based consumers.
"""
from __future__ import annotations

import sqlite3


class migration_002:
    @staticmethod
    def upgrade(db_path: str) -> None:
        """Add two_factor_secret to users if missing (idempotent)."""
        conn = sqlite3.connect(db_path)
        try:
            cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
            if "two_factor_secret" not in cols:
                conn.execute("ALTER TABLE users ADD COLUMN two_factor_secret TEXT")
            conn.commit()
        finally:
            conn.close()
