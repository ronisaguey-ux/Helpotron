#!/bin/bash
# Daily SQLite backup script for Helpotron
# Usage: crontab -e  →  0 2 * * * /home/roni/Roni_Workspace/helpotron/scripts/backup_db.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/roni/helpotron-backups}"
DB_PATH="${DB_PATH:-/home/roni/Roni_Workspace/helpotron/helpotron.db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/helpotron_$TIMESTAMP.db"

# Use sqlite3 online backup if available, else copy
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
  cp "$DB_PATH" "$BACKUP_FILE"
fi

# Compress
gzip -f "$BACKUP_FILE"

# Prune old backups
find "$BACKUP_DIR" -name "helpotron_*.db.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $BACKUP_FILE.gz"