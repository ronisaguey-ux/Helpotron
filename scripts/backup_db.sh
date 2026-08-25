#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-/opt/helpotron/backups}"
DATE_TAG=$(date +"%Y%m%d_%H%M%S")

# Check DB path candidates in order
CANDIDATE_PATHS=(
    "${DB_PATH:-}"
    "$PROJECT_DIR/helpotron.db"
    "$PROJECT_DIR/data/helpotron.db"
    "/var/www/helpotron/helpotron.db"
    "/opt/helpotron/data/helpotron.db"
)

RESOLVED_DB=""
for path in "${CANDIDATE_PATHS[@]}"; do
    if [[ -n "$path" && -f "$path" ]]; then
        RESOLVED_DB="$path"
        break
    fi
done

if [[ -z "$RESOLVED_DB" ]]; then
    echo "❌ [ERROR] SQLite database not found in any candidate path." >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "📦 Creating atomic backup of $RESOLVED_DB..."
python3 -c "import sqlite3; con = sqlite3.connect('$RESOLVED_DB'); bck = sqlite3.connect('$BACKUP_DIR/helpotron_$DATE_TAG.db'); con.backup(bck); bck.close(); con.close()"
gzip -9 "$BACKUP_DIR/helpotron_$DATE_TAG.db"

BACKUP_FILE="$BACKUP_DIR/helpotron_$DATE_TAG.db.gz"
echo "✅ [$(date)] Backup completed successfully: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# Retain backups for 30 days
find "$BACKUP_DIR" -type f -name "helpotron_*.db.gz" -mtime +30 -delete
echo "🧹 Pruned backups older than 30 days."
