#!/usr/bin/env bash
# Rollback script for Helpotron frontend.
# Switches the active web symlink to the previous available release.
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-roni@100.88.179.28}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/server_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/home/roni/helpotron}"

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

echo "✅ Rollback complete. Active release is now: \$PREV_RELEASE"
EOF
