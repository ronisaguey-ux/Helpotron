#!/usr/bin/env bash
# run_native.sh — helpotron native-laptop launch (08-26 operator directive).
# Everything local: data lives under ./data/*, no VPS, no external storage.
# Public exposure: Cloudflare Tunnel (see cloudflared notes + README).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"

set -a
# Local data roots (keep ALL user data inside the repo's data/ dir)
export DATABASE_URL="sqlite:///${REPO}/data/db/helpotron.db"
export DATA_LAKE_DIR="${REPO}/data/lake"
export AGENT_FILES_DIR="${REPO}/data/uploads"
export DATA_DIR="${REPO}/data"
# Secrets still come from the repo-local .env (never committed)
[ -f .env ] && . ./.env || true
set +a

mkdir -p data/db data/lake data/uploads data/users data/assignments data/state

echo "[native] API:    http://127.0.0.1:8000  (uvicorn)"
echo "[native] Web:    http://127.0.0.1:5173  (vite)"
echo "[native] Tunnels: cloudflared tunnel run <tunnel-name> → routes to :8000"

# API server
python3 -m uvicorn server.main:app --host 127.0.0.1 --port 8000 \
  & API_PID=$!
# Web (dev server serves the SPA + extension assets)
( cd web && npm run dev ) & WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM EXIT
echo "[native] running (API=$API_PID WEB=$WEB_PID) — Ctrl-C to stop"
wait
