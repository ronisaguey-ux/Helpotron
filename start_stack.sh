#!/bin/bash
# One-shot bring-up of the helpotron stack after a reboot.
# API/web/tunnel are systemd user services with Restart=always (09-11); this
# script just starts them plus the tele-wake chain.
# Run AS THE USER on the desktop session (X11 DISPLAY=:0 already up).
set -e
cd /home/roni/Roni_workspace/helpotron

# 1-3) API (uvicorn :5000), web (vite :5173) and the Cloudflare tunnel are
# supervised systemd user services with Restart=always (09-11), so a crash
# or kill heals itself in ~5s and they come up at login. This script is now
# just an idempotent bring-up wrapper around them:
#   helpotron-api.service     — uvicorn, 10G RAM-budget cgroup (owner 08-31),
#                               --proxy-headers + forwarded-allow-ips 127.0.0.1
#   helpotron-web.service     — vite preview, cwd .../helpotron/web
#   helpotron-tunnel.service  — ~/.cloudflared/helpotron.yml (helpotron + t2b)
systemctl --user start helpotron-api.service helpotron-web.service helpotron-tunnel.service
echo "supervised units: $(systemctl --user is-active helpotron-api.service helpotron-web.service helpotron-tunnel.service | tr '\n' ' ')"

# 4) Tele wake chain (wake inbox -> this machine's helpotron datalake)
bash /home/roni-saguey/.local/bin/tele_session_monitor.sh &
echo "tele watcher armed"

sleep 6
echo "--- checks:"
curl -s -o /dev/null -w "api:%{http_code}\n" http://127.0.0.1:5000/ || echo "api: DOWN"
curl -s -o /dev/null -w "web:%{http_code}\n" http://127.0.0.1:5173/ || echo "web: DOWN"
curl -s -o /dev/null -w "tunnel:%{http_code}\n" https://helpotron.dpdns.org/ || echo "tunnel: DOWN (may need a few more seconds)"
