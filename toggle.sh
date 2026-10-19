#!/usr/bin/env bash
# Toggle helpotron between LIVE (real app) and CLOSED (maintenance banner).
#   toggle.sh live    -> stop the banner, start the API   (site public)
#   toggle.sh closed  -> stop the API, start the banner   (deliberate downtime)
#   toggle.sh status  -> which one is serving :5000
# Both units want :5000, so they are mutually exclusive and must be swapped,
# never started together. Neither is enabled for boot in the live state, so a
# reboot returns the site to the CLOSED banner — the safe default.
set -euo pipefail
case "${1:-status}" in
  live)
    sudo systemctl stop helpotron-maintenance
    sudo systemctl start helpotron-api
    sleep 4
    ;;
  closed)
    sudo systemctl stop helpotron-api
    sudo systemctl start helpotron-maintenance
    sleep 2
    ;;
  status) ;;
  *) echo "usage: $0 {live|closed|status}" >&2; exit 2 ;;
esac
printf "api=%s maintenance=%s  " "$(systemctl is-active helpotron-api)" "$(systemctl is-active helpotron-maintenance)"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:5000/ 2>/dev/null || echo 000)
echo "local:5000=$code"
