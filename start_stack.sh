#!/bin/bash
# One-shot bring-up of the helpotron stack after a reboot (08-31).
# Replaces ad-hoc process starts: API (uvicorn :8000), web (vite :5173),
# tunnel (cloudflared), and the tele-wake chain.
# Run AS THE USER on the desktop session (X11 DISPLAY=:0 already up).
set -e
cd /home/roni/Roni_workspace/helpotron

# 1) API server (background, reload on)
nohup /home/roni/Roni_workspace/helpotron/.venv/bin/uvicorn server.main:app \
  --host 0.0.0.0 --port 8000 --reload > /tmp/helpotron_api.log 2>&1 &
echo "api pid $!"

# 2) Web preview (background)
cd /home/roni/Roni_workspace/helpotron/web
nohup node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 \
  > /tmp/helpotron_web.log 2>&1 &
echo "web pid $!"

# 3) Cloudflare tunnel (background)
nohup /home/roni-saguey/.local/bin/cloudflared tunnel \
  --config /home/roni-saguey/.cloudflared/helpotron.yml run helpotron \
  > /tmp/helpotron_tunnel.log 2>&1 &
echo "tunnel pid $!"

# 4) Tele wake chain (wake inbox -> this machine's helpotron datalake)
bash /home/roni-saguey/.local/bin/tele_session_monitor.sh &
echo "tele watcher armed"

sleep 6
echo "--- checks:"
curl -s -o /dev/null -w "api:%{http_code}\n" http://127.0.0.1:8000/ || echo "api: DOWN"
curl -s -o /dev/null -w "web:%{http_code}\n" http://127.0.0.1:5173/ || echo "web: DOWN"
curl -s -o /dev/null -w "tunnel:%{http_code}\n" https://helpotron.dpdns.org/ || echo "tunnel: DOWN (may need a few more seconds)"
