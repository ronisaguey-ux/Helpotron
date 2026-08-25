#!/usr/bin/env bash
# start_watermarks.sh — run the watermarks-remover hygiene service for the
# helpotron stack. Stdlib-only HTTP service (no venv needed).
#   info: strips invisible AI-provenance / metadata marks from files YOU own,
#         before exporting or sharing them (privacy & hygiene).
#   url:  http://127.0.0.1:8765   (health: GET /health)
set -u

SRV="$(cd "$(dirname "$0")/.." && pwd)/vendor/watermarks-remover/service/scripts/server.py"
PORT="${WATERMARKS_SERVER_PORT:-8765}"

if curl -s -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "already up (127.0.0.1:${PORT})"
  exit 0
fi

setsid nohup /usr/bin/python3 "$SRV" --host 127.0.0.1 --port "$PORT" >> /tmp/watermarks_service.log 2>&1 < /dev/null &
for i in $(seq 1 15); do
  if curl -s -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "watermarks service up on 127.0.0.1:${PORT}"
    exit 0
  fi
  sleep 1
done
echo "FAILED to start watermarks service (see /tmp/watermarks_service.log)" >&2
exit 1
