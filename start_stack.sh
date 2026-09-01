#!/bin/bash
# One-shot bring-up of the helpotron stack after a reboot (08-31).
# Replaces ad-hoc process starts: API (uvicorn :8000), web (vite :5173),
# tunnel (cloudflared), and the tele-wake chain.
# Run AS THE USER on the desktop session (X11 DISPLAY=:0 already up).
set -e
cd /home/roni/Roni_workspace/helpotron

# 1) API server (background, reload on) — inside a 10G RAM-budget scope
# (owner directive 08-31). server/memguard.py reads the cgroup and answers
# "Task is in Queue, will be completed momentarily" when the budget is spent.
# --scope --unit names the cgroup helpotron-uvicorn.scope so a re-run detects
# the active instance instead of spawning a second server that can't bind.
# --proxy-headers: trust cloudflared's X-Forwarded-Proto so request.url.is_secure
# is True for tunnel requests -> Secure session/CSRF cookies on https (handoff A10 #2).
# --forwarded-allow-ips 127.0.0.1: only the local tunnel may supply forwarded headers.
if systemctl --user is-active --quiet helpotron-uvicorn.scope 2>/dev/null; then
  echo "api scope already active — skipping launch"
else
  nohup systemd-run --user --scope --unit=helpotron-uvicorn \
    -p MemoryMax=10G -p MemoryHigh=10G -p MemorySwapMax=0 \
    /home/roni/Roni_workspace/helpotron/.venv/bin/uvicorn server.main:app \
    --host 0.0.0.0 --port 8000 --reload --proxy-headers --forwarded-allow-ips 127.0.0.1 \
    > /tmp/helpotron_api.log 2>&1 &
  echo "api scope started (pid $!)"
fi

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
