#!/usr/bin/env bash
# Atomic zero-downtime deploy script for Helpotron frontend.
# Creates versioned releases and switches symlink atomically without downtime.
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-roni@100.88.179.28}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/server_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/home/roni/helpotron}"
LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

COMMIT="$(git -C "$LOCAL_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RELEASE_ID="${COMMIT}_${TIMESTAMP}"
TMP_TAR="/tmp/dist_${RELEASE_ID}.tgz"

echo "🚀 Packaging frontend release $RELEASE_ID..."
cd "$LOCAL_ROOT/web"
if [[ ! -d "dist" ]]; then
    echo "❌ dist directory missing. Run 'npx vite build' first." >&2
    exit 1
fi

# Inject build metadata
cat > dist/version.json <<EOF
{
  "commit": "$COMMIT",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "release_id": "$RELEASE_ID"
}
EOF

tar -czf "$TMP_TAR" -C dist .
echo "📦 Uploading archive to $TARGET_HOST..."
scp -i "$SSH_KEY" "$TMP_TAR" "$TARGET_HOST:/tmp/dist_${RELEASE_ID}.tgz"
rm -f "$TMP_TAR"

echo "🔄 Activating release atomically on server..."
ssh -i "$SSH_KEY" "$TARGET_HOST" bash -s <<EOF
set -euo pipefail
REMOTE_BASE="$REMOTE_DIR/web"
RELEASES="\$REMOTE_BASE/releases"
mkdir -p "\$RELEASES/$RELEASE_ID"
tar -xzf "/tmp/dist_${RELEASE_ID}.tgz" -C "\$RELEASES/$RELEASE_ID"
rm -f "/tmp/dist_${RELEASE_ID}.tgz"

# Atomic symlink swap using temporary link
ln -sfn "\$RELEASES/$RELEASE_ID" "\$REMOTE_BASE/dist_new"
mv -Tf "\$REMOTE_BASE/dist_new" "\$REMOTE_BASE/dist"

# Prune old releases, keeping the 5 most recent
cd "\$RELEASES"
ls -dt */ | tail -n +6 | xargs -r rm -rf

echo "✅ Active release is now \$RELEASE_ID."
EOF

echo "✨ Deploy completed successfully."
