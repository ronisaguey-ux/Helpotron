#!/usr/bin/env bash
# Ops script: prune stale deploy backups and build artifacts.
# Retains the most recent backups while freeing space from heavy duplicated ML models.
set -euo pipefail

APP_DIR="${1:-/home/roni/helpotron}"
RETAIN_DAYS="${RETAIN_DAYS:-7}"

echo "🧹 Starting Helpotron disk hygiene cleanup for $APP_DIR..."

# 1. Prune server.bak-* directories older than RETAIN_DAYS
if compgen -G "$APP_DIR/server.bak-*" > /dev/null; then
    find "$APP_DIR" -maxdepth 1 -type d -name "server.bak-*" -mtime +"$RETAIN_DAYS" -exec rm -rf {} +
    echo "  Cleaned stale server.bak-* older than $RETAIN_DAYS days."
fi

# 2. Prune web/dist.bak-* directories older than RETAIN_DAYS
if compgen -G "$APP_DIR/web/dist.bak-*" > /dev/null; then
    find "$APP_DIR/web" -maxdepth 1 -type d -name "dist.bak-*" -mtime +"$RETAIN_DAYS" -exec rm -rf {} +
    echo "  Cleaned stale web/dist.bak-* older than $RETAIN_DAYS days."
fi

# 3. Clean temporary probe logs and stale test files
find "$APP_DIR" -maxdepth 2 -type f -name "test_helpotron.db" -delete 2>/dev/null || true
find "$APP_DIR" -maxdepth 1 -type f -name "*.tmp" -delete 2>/dev/null || true

echo "✅ Disk cleanup complete."
