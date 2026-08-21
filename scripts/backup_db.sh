#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/helpotron"
DATE_TAG=$(date +"%Y%m%d_%H%M%S")
DB_PATH="/var/www/helpotron/data/helpotron.db"

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_PATH" ]; then
    # Perform atomic SQLite online backup using sqlite3 CLI or python
    python3 -c "import sqlite3; con = sqlite3.connect('$DB_PATH'); bck = sqlite3.connect('$BACKUP_DIR/helpotron_$DATE_TAG.db'); con.backup(bck); bck.close(); con.close()"
    gzip -9 "$BACKUP_DIR/helpotron_$DATE_TAG.db"
    echo "[$(date)] Backup completed successfully: $BACKUP_DIR/helpotron_$DATE_TAG.db.gz"
    # Retain backups for 14 days
    find "$BACKUP_DIR" -type f -name "helpotron_*.db.gz" -mtime +14 -delete
fi
