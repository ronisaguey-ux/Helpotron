#!/usr/bin/env bash
# Helpotron VPS firewall policy (remediation BATCH-05).
# Run as root on the VPS:  bash deploy/ufw_rules.sh
set -euo pipefail

echo "==> Applying Helpotron UFW policy"

ufw default deny incoming
ufw default allow outgoing

# Web traffic (frontend + API behind nginx)
ufw allow 443/tcp
ufw allow 80/tcp

# SSH — restrict to a sane source range if you know your admin IPs:
ufw allow OpenSSH

# Helpotron internals (bound to loopback; never expose publicly)
ufw allow from 127.0.0.1 to any port 8000 proto tcp

ufw --force enable
echo "==> UFW status:"
ufw status verbose
