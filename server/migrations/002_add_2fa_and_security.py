import sqlite3
import logging

logger = logging.getLogger('helpotron.migration.002')

def upgrade(db_path: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'two_factor_secret' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(64) DEFAULT NULL")
    if 'is_two_factor_enabled' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN is_two_factor_enabled BOOLEAN DEFAULT 0")
    if 'backup_codes_json' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN backup_codes_json TEXT DEFAULT NULL")
    conn.commit()
    conn.close()
    logger.info('Successfully applied migration 002_add_2fa_and_security')