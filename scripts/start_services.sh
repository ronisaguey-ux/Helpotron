#!/usr/bin/env bash
# start_services.sh — Starts Helpotron backend and frontend in background

PROJECT_DIR="/home/roni/Roni_Workspace/helpotron"
cd "$PROJECT_DIR"

# 1. Kill existing instances
pkill -f "uvicorn server.main:app" || true
pkill -f "vite.*5173" || true
sleep 1

# 2. Start Backend (FastAPI on port 8000)
# HELPOTRON_CLAUDE_BRIDGE=1 routes agent-chat messages to Claude Code
# (headless `claude -p` + helpotron-admin MCP) when it's reachable, falling
# back to the local intent pipeline otherwise.
echo "Starting Backend on http://localhost:8000 ..."
HELPOTRON_CLAUDE_BRIDGE=1 nohup "$PROJECT_DIR/.venv/bin/uvicorn" server.main:app --host 0.0.0.0 --port 8000 >> /tmp/helpotron_backend.log 2>&1 &

# 3. Start Frontend (Vite on port 5173)
echo "Starting Frontend on http://localhost:5173 ..."
cd "$PROJECT_DIR/web"
nohup npm run dev -- --host 0.0.0.0 --port 5173 >> /tmp/helpotron_frontend.log 2>&1 &

sleep 3
echo "Helpotron services started!"
