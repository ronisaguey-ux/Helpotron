#!/usr/bin/env bash
# Rollback script for Helpotron frontend.
# Switches the active web symlink to the previous available release.
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-roni@100.88.179.28}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/server_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/home/roni/helpotron}"
# Same port deploy_atomic.sh verifies against (deploy/helpotron-api.service).
HEALTH_PORT="${HEALTH_PORT:-5000}"

echo "⏪ Initiating atomic rollback on $TARGET_HOST..."

ssh -i "$SSH_KEY" "$TARGET_HOST" bash -s <<EOF
set -euo pipefail
REMOTE_BASE="$REMOTE_DIR/web"
RELEASES="\$REMOTE_BASE/releases"

if [[ ! -d "\$RELEASES" ]]; then
    echo "❌ No releases directory found at \$RELEASES" >&2
    exit 1
fi

cd "\$RELEASES"
# Find the release just older than the ACTIVE one. "Second newest" was wrong
# after any rollback: a second run picked the same release again and reported
# success while nothing changed.
CURRENT=\$(basename "\$(readlink -f "\$REMOTE_BASE/dist")")
PREV_RELEASE=\$(ls -dt */ 2>/dev/null | tr -d '/' | awk -v cur="\$CURRENT" 'seen{print; exit} \$0==cur{seen=1}')

if [[ -z "\$PREV_RELEASE" ]]; then
    echo "❌ No previous release available to roll back to." >&2
    exit 1
fi

echo "🔄 Rolling back to release: \$PREV_RELEASE..."
ln -sfn "\$RELEASES/\$PREV_RELEASE" "\$REMOTE_BASE/dist_new"
mv -Tf "\$REMOTE_BASE/dist_new" "\$REMOTE_BASE/dist"

# Verify the rollback actually landed (V5-A5-07). A rollback that reports
# success against a release which does not serve is worse than no rollback: the
# operator believes the incident is over and stops looking.
if [[ ! -s "\$RELEASES/\$PREV_RELEASE/index.html" ]]; then
    echo "❌ \$PREV_RELEASE has no index.html — reverting to \$CURRENT" >&2
    ln -sfn "\$RELEASES/\$CURRENT" "\$REMOTE_BASE/dist_new"
    mv -Tf "\$REMOTE_BASE/dist_new" "\$REMOTE_BASE/dist"
    exit 1
fi

HEALTHY=""
for i in \$(seq 1 15); do
    if curl -fsS --max-time 5 "http://127.0.0.1:$HEALTH_PORT/api/health?deep=true" >/dev/null 2>&1; then
        HEALTHY="yes"
        break
    fi
    sleep 2
done

if [[ -z "\$HEALTHY" ]]; then
    echo "❌ Rollback target \$PREV_RELEASE does not answer a deep health check either." >&2
    echo "   Left the symlink on \$PREV_RELEASE; check the service, do not assume." >&2
    exit 1
fi

echo "✅ Rollback complete and health verified. Active release: \$PREV_RELEASE"
EOF
