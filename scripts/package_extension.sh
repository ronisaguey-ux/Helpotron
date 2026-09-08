#!/usr/bin/env bash
# package_extension.sh — build the CWS submission zip for the Helpotron
# extension (version read from extension/manifest.json) and extract it into a
# test dir. Re-runnable: the zip and the test dir are rebuilt from scratch
# every time. The previous zip's hash is recorded in the manifest before it is
# replaced.
#
# Usage:
#   bash scripts/package_extension.sh
#
# Outputs:
#   helpotron-extension-v<version>.zip                  (manifest at zip root)
#   helpotron-extension-v<version>-test/                (extracted for testing)
#   verify-artifacts/package-manifest.txt               (zip sha256 + listing hash)
#
# Exclusions: *.md, .DS_Store, __pycache__/, *.pyc, *.tmp, *.log
set -euo pipefail

REPO="/home/roni/Roni_workspace/helpotron"
EXT_DIR="$REPO/extension"
VERSION="$("$REPO/.venv/bin/python3" -c "import json;print(json.load(open('$EXT_DIR/manifest.json'))['version'])")"
ZIP="$REPO/helpotron-extension-v$VERSION.zip"
TEST_DIR="$REPO/helpotron-extension-v$VERSION-test"
ART="$REPO/verify-artifacts"

rm -rf /tmp/helpotron-pkg-stage
STAGE="/tmp/helpotron-pkg-stage"
mkdir -p "$STAGE" "$ART"

[[ -f "$EXT_DIR/manifest.json" ]] || { echo "FATAL: no manifest.json in $EXT_DIR"; exit 1; }

# -- record the previous artifact (if any) before overwriting -----------------
PREV_LINE="previous-zip: (none)"
if [[ -f "$ZIP" ]]; then
    PREV_LINE="previous-zip-sha256: $(sha256sum "$ZIP" | cut -d' ' -f1)  (built $(stat -c %y "$ZIP" | cut -d. -f1))"
fi

# -- build the zip (manifest.json must land at the zip ROOT) ------------------
rm -f "$ZIP"
# shellcheck disable=SC2086
(cd "$EXT_DIR" && zip -q -r "$ZIP" . \
    -x "*.md" -x ".DS_Store" -x "__pycache__/*" -x "*.pyc" -x "*.tmp" -x "*.log")

# -- extract to the test dir ---------------------------------------------------
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"
unzip -q "$ZIP" -d "$TEST_DIR"

# -- hashes --------------------------------------------------------------------
ZIP_SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)
LISTING=$(unzip -Z1 "$ZIP" | LC_ALL=C sort)
LIST_HASH=$(printf '%s\n' "$LISTING" | sha256sum | cut -d' ' -f1)
COUNT=$(printf '%s\n' "$LISTING" | grep -c .)

# -- sanity: manifest inside the zip matches the source version ---------------
"$REPO/.venv/bin/python3" - "$ZIP" "$VERSION" <<'EOF'
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    m = json.loads(z.read("manifest.json"))
assert m.get("manifest_version") == 3, "not MV3"
assert m.get("version") == sys.argv[2], f"version {m.get('version')} != {sys.argv[2]}"
print(f"zip manifest check OK: {m.get('name')} v{m.get('version')} (MV3)")
EOF

# -- manifest file --------------------------------------------------------------
{
    echo "helpotron extension package manifest  ($(date '+%Y-%m-%d %H:%M:%S'))"
    echo "$PREV_LINE"
    echo "zip: $ZIP"
    echo "zip-sha256: $ZIP_SHA"
    echo "listing-sha256 (sorted file list): $LIST_HASH"
    echo "file-count: $COUNT"
    echo "test-dir: $TEST_DIR"
    echo "excluded: *.md .DS_Store __pycache__/* *.pyc *.tmp *.log"
    echo "--- sorted zip listing ---"
    printf '%s\n' "$LISTING"
} > "$ART/package-manifest.txt"

# -- LOUD WARNING: stale sibling test dirs ------------------------------------
# The bug class this catches cost a full debugging cycle: TEST_DIR is derived
# from the manifest version, so changing that version silently starts writing to
# a NEW directory while Chrome keeps loading the OLD one via "Load unpacked".
# Every subsequent fix then lands somewhere the browser never reads, and the
# extension appears not to change no matter what you do. Name the strays.
STALE=()
while IFS= read -r d; do
    [[ "$d" == "$TEST_DIR" ]] && continue
    STALE+=("$d")
done < <(find "$REPO" -maxdepth 1 -type d -name 'helpotron-extension-v*-test' | LC_ALL=C sort)

if (( ${#STALE[@]} )); then
    echo
    echo "  !!  STALE UNPACKED BUILD DIR(S) PRESENT — Chrome may still be loading one of"
    echo "      these instead of the build just produced:"
    for d in "${STALE[@]}"; do
        echo "        $d   (last modified $(stat -c %y "$d" | cut -d. -f1))"
    done
    echo "      Just built:  $TEST_DIR"
    echo "      If chrome://extensions 'Load unpacked' points at a stale dir, re-point it"
    echo "      (or delete the stale dir) — otherwise your fixes will not be loaded."
    echo
fi

echo "zip:            $ZIP"
echo "zip-sha256:     $ZIP_SHA"
echo "listing-hash:   $LIST_HASH  ($COUNT files)"
echo "test dir:       $TEST_DIR"
echo "manifest file:  $ART/package-manifest.txt"
