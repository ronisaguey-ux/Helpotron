#!/usr/bin/env bash
# Atomic zero-downtime deploy script for Helpotron frontend.
# Creates versioned releases and switches symlink atomically without downtime.
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-roni@100.88.179.28}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/server_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/home/roni/helpotron}"
# The port the app actually listens on (deploy/helpotron-api.service binds
# 127.0.0.1:5000). Post-deploy verification curls it — see the health gate.
HEALTH_PORT="${HEALTH_PORT:-5000}"
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

# The release we are replacing, resolved BEFORE the swap so a failed health
# check can put it back. Empty on the very first deploy.
PREV_RELEASE=""
if [[ -L "\$REMOTE_BASE/dist" ]]; then
    PREV_RELEASE=\$(basename "\$(readlink -f "\$REMOTE_BASE/dist")")
fi

mkdir -p "\$RELEASES/$RELEASE_ID"
tar -xzf "/tmp/dist_${RELEASE_ID}.tgz" -C "\$RELEASES/$RELEASE_ID"
rm -f "/tmp/dist_${RELEASE_ID}.tgz"

# The archive must actually contain a site before we point production at it: an
# empty or partial tarball used to be swapped in and reported as a success.
if [[ ! -s "\$RELEASES/$RELEASE_ID/index.html" ]]; then
    echo "❌ Release $RELEASE_ID has no index.html — not swapping." >&2
    rm -rf "\$RELEASES/$RELEASE_ID"
    exit 1
fi

# Atomic symlink swap using temporary link
ln -sfn "\$RELEASES/$RELEASE_ID" "\$REMOTE_BASE/dist_new"
mv -Tf "\$REMOTE_BASE/dist_new" "\$REMOTE_BASE/dist"

# ── Verify before declaring success (V5-A5-07) ──────────────────────────────
# This script used to print "Deploy completed successfully" the moment the
# symlink moved, having checked nothing: a release with no assets, or one whose
# server half was already degraded, was announced as a good deploy and nobody
# found out until a user did. The archive is checked for index.html before the
# swap, and the swapped-in site is then given up to 30s to answer a deep health
# check; anything else reverts to the release we just replaced.
wait_healthy() {
    local url="\$1"
    local tries="\${2:-15}"
    local i
    for ((i = 1; i <= tries; i++)); do
        if curl -fsS --max-time 5 "\$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    return 1
}

FAILED=""
SERVED_ID=\$(curl -fsS --max-time 5 "http://127.0.0.1:$HEALTH_PORT/version.json" 2>/dev/null \
    | tr -d '\\n' | sed -n 's/.*"release_id"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p') || true
if [[ "\$SERVED_ID" != "$RELEASE_ID" ]]; then
    echo "⚠️  version.json reports '\$SERVED_ID', expected '$RELEASE_ID' — will verify via health." >&2
fi
if ! wait_healthy "http://127.0.0.1:$HEALTH_PORT/api/health?deep=true"; then
    FAILED="the app never answered a deep health check"
fi

if [[ -n "\$FAILED" ]]; then
    echo "❌ Deploy verification FAILED: \$FAILED" >&2
    if [[ -n "\$PREV_RELEASE" ]]; then
        echo "↩️  Reverting to \$PREV_RELEASE" >&2
        ln -sfn "\$RELEASES/\$PREV_RELEASE" "\$REMOTE_BASE/dist_new"
        mv -Tf "\$REMOTE_BASE/dist_new" "\$REMOTE_BASE/dist"
        rm -rf "\$RELEASES/$RELEASE_ID"
        echo "⚠️  Reverted. Production is back on \$PREV_RELEASE." >&2
    else
        echo "⚠️  No previous release to revert to — production is UNVERIFIED." >&2
    fi
    exit 1
fi

# Prune old releases, keeping the 5 most recent (only after a verified deploy,
# so a failed release is never the thing that evicted a good one)
cd "\$RELEASES"
ls -dt */ | tail -n +6 | xargs -r rm -rf

echo "✅ Active release is now \$RELEASE_ID (health verified)."
EOF

echo "✨ Deploy completed successfully."
