#!/bin/bash
# Helpotron — Automated SQLite database backup with 30-day retention pruning.
set -euo pipefail

DB_PATH="${DB_PATH:-/opt/helpotron/data/helpotron.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/helpotron/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/helpotron_${TIMESTAMP}.db.gz"

mkdir -p "${BACKUP_DIR}"

if [ ! -f "${DB_PATH}" ]; then
  echo "[ERROR] Database not found: ${DB_PATH}" >&2
  exit 1
fi

# Create compressed backup
sqlite3 "${DB_PATH}" ".backup /tmp/helpotron_tmp_backup.db"
gzip -c /tmp/helpotron_tmp_backup.db > "${BACKUP_FILE}"
rm -f /tmp/helpotron_tmp_backup.db

echo "[OK] Backup created: ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"

# Prune backups older than RETENTION_DAYS
find "${BACKUP_DIR}" -name 'helpotron_*.db.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "[OK] Pruned backups older than ${RETENTION_DAYS} days."
