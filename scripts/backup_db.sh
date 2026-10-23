#!/usr/bin/env bash
# Atomic SQLite backup for helpotron.
#
# Why this is not a "try a few paths in order" script any more: it used to be,
# and it silently backed up the WRONG database for months. The candidate list
# put "$PROJECT_DIR/helpotron.db" first — a stale 323 KB / 18-user file left in
# the repo root — while the server's real database is
# "$PROJECT_DIR/data/db/helpotron.db" (13.9 MB). There is also a 0-byte decoy at
# "$PROJECT_DIR/data/helpotron.db". The script reported success every run while
# capturing nothing of value.
#
# So the database path is now RESOLVED, not guessed:
#   1. $DATABASE_URL (the same variable the server itself reads)
#   2. the same default server/config.py falls back to
# and the resolved file must exist and be non-empty, or the script fails loudly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
# Below this, the file is not the real database — it is a placeholder or a stub.
MIN_BYTES="${MIN_BYTES:-10240}"
DATE_TAG=$(date +"%Y%m%d_%H%M%S")

# ── 1. Resolve the database the SERVER actually uses ─────────────────────────
DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" && -f "$PROJECT_DIR/.env" ]]; then
    # Read only the assignment, never echo the file. Handles an unquoted or
    # single/double-quoted value; ignores commented lines.
    DB_URL="$(grep -m1 -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$PROJECT_DIR/.env" \
        | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
              -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
fi
DB_URL="${DB_URL:-sqlite:///$PROJECT_DIR/data/db/helpotron.db}"

if [[ "$DB_URL" != sqlite:* ]]; then
    echo "❌ [ERROR] Backup only handles SQLite; DATABASE_URL is not sqlite://*." >&2
    echo "   Use pg_dump for this database instead — this script will not pretend." >&2
    exit 1
fi
# sqlite:///relative/path  ->  relative/path ; sqlite:////abs/path -> /abs/path
RESOLVED_DB="${DB_URL#sqlite:///}"
RESOLVED_DB="${RESOLVED_DB%%\?*}"
[[ "$RESOLVED_DB" != /* ]] && RESOLVED_DB="$PROJECT_DIR/$RESOLVED_DB"

if [[ ! -f "$RESOLVED_DB" ]]; then
    echo "❌ [ERROR] Database not found at the configured path: $RESOLVED_DB" >&2
    exit 1
fi

DB_BYTES=$(stat -c %s "$RESOLVED_DB")
if (( DB_BYTES < MIN_BYTES )); then
    echo "❌ [ERROR] $RESOLVED_DB is only ${DB_BYTES} bytes (< ${MIN_BYTES})." >&2
    echo "   That is not the live database — it is a placeholder. Not backing up a stub." >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "📦 Backing up $RESOLVED_DB (${DB_BYTES} bytes)..."
BACKUP_FILE="$BACKUP_DIR/helpotron_$DATE_TAG.db"
# sqlite3 .backup() takes a consistent snapshot even while the server is writing
# (WAL mode), unlike a plain file copy.
python3 - "$RESOLVED_DB" "$BACKUP_FILE" <<'PY'
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
con = sqlite3.connect(src)
try:
    bck = sqlite3.connect(dst)
    try:
        con.backup(bck)
    finally:
        bck.close()
finally:
    con.close()
PY

# ── 2. Prove the backup is a real database, not an empty envelope ────────────
VERIFY=$(python3 - "$BACKUP_FILE" <<'PY'
import sqlite3, sys
try:
    con = sqlite3.connect(sys.argv[1])
    users = con.execute("select count(*) from users").fetchone()[0]
    tables = con.execute("select count(*) from sqlite_master where type='table'").fetchone()[0]
    con.close()
    print(f"{tables} tables, {users} users")
except Exception as exc:          # a truncated/corrupt backup must not pass
    print(f"FAIL {exc}")
PY
)
if [[ "$VERIFY" == FAIL* ]]; then
    echo "❌ [ERROR] Backup failed verification ($VERIFY) — removing $BACKUP_FILE" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

gzip -9 "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"
chmod 600 "$BACKUP_FILE"

echo "✅ [$(date)] Backup verified ($VERIFY): $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# ── 3. Retain 30 days ────────────────────────────────────────────────────────
find "$BACKUP_DIR" -type f -name "helpotron_*.db.gz" -mtime +"$RETAIN_DAYS" -delete
echo "🧹 Pruned backups older than ${RETAIN_DAYS} days."
