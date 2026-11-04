#!/bin/bash
set -ex
cd /home/roni/Roni_workspace/helpotron

# STEP 06
mkdir -p .github/workflows
cat << 'INNER_EOF' > .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - name: Set up Python
        uses: actions/setup-python@0a5c61591373683505ea898e09a6003b87017716 # v5.0.0
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r server/requirements.txt
          pip install pytest pytest-asyncio httpx

      - name: Run Test Suite
        env:
          JWT_SECRET: ci-test-secret-value-32chars-minimum-key
          DATABASE_URL: sqlite:///:memory:
        run: |
          pytest server/tests/ -v
INNER_EOF
git add .github/workflows/ci.yml && git commit -m 'fix(remediation): STEP-06 - Harden CI workflow with pinned SHA actions' || true

# STEP 07
mkdir -p deploy
cat << 'INNER_EOF' > deploy/nginx.conf
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=llm_limit:10m rate=5r/s;

server {
    listen 80;
    listen [::]:80;
    server_name helpotron.dpdns.org www.helpotron.dpdns.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name helpotron.dpdns.org www.helpotron.dpdns.org;

    ssl_certificate /etc/letsencrypt/live/helpotron.dpdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/helpotron.dpdns.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://openrouter.ai wss:; frame-ancestors 'none';" always;

    client_max_body_size 25M;

    location / {
        root /var/www/helpotron/web/dist;
        try_files $uri $uri/ /index.html;
        expires 1d;
        add_header Cache-Control "public, no-transform";
    }

    location /api/ {
        limit_req zone=api_limit burst=30 nodelay;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
}
INNER_EOF
git add deploy/nginx.conf && git commit -m 'fix(remediation): STEP-07 - Harden Nginx with TLS 1.3, HSTS, CSP and rate limiting' || true

# STEP 08
cat << 'INNER_EOF' > deploy/helpotron-api.service
[Unit]
Description=Helpotron Automator FastAPI Daemon
After=network.target

[Service]
Type=simple
User=helpotron
Group=helpotron
WorkingDirectory=/opt/helpotron
EnvironmentFile=/opt/helpotron/.env
ExecStart=/opt/helpotron/venv/bin/uvicorn server.main:app --host 127.0.0.1 --port 8000 --workers 4 --proxy-headers
Restart=always
RestartSec=5s

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/opt/helpotron/data /opt/helpotron/exports /opt/helpotron/logs
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictNamespaces=yes
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
INNER_EOF
git add deploy/helpotron-api.service && git commit -m 'fix(remediation): STEP-08 - Harden systemd service with sandboxing and localhost binding' || true

# STEP 09
cat << 'INNER_EOF' > .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/server"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    rebase-strategy: "auto"

  - package-ecosystem: "npm"
    directory: "/web"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    rebase-strategy: "auto"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
INNER_EOF
git add .github/dependabot.yml && git commit -m 'fix(remediation): STEP-09 - Configure Dependabot for pip, npm and actions' || true

# STEP 10
cat << 'INNER_EOF' > .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.2
    hooks:
      - id: gitleaks

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
        args: ['--maxkb=5000']
      - id: detect-private-key
INNER_EOF
git add .pre-commit-config.yaml && git commit -m 'fix(remediation): STEP-10 - Configure pre-commit hooks for secret detection' || true
