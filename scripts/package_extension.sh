#!/usr/bin/env bash
# package_extension.sh — build the CWS submission zip for the Helpotron
# extension (version read from extension/manifest.json) and extract it into an
# unpacked folder for "Load unpacked". Re-runnable: both are rebuilt from
# scratch every time.
#
# Usage:
#   bash scripts/package_extension.sh
#
# Outputs (under dist/, which is gitignored — these are build artifacts, not
# source; the repo root holds only canonical docs and config):
#   dist/helpotron-extension-v<version>.zip
#   dist/helpotron-extension-v<version>-extracted/
#   artifacts/package-manifest.txt          (zip sha256 + listing hash)
#
# The zip is built by a file-walk that mirrors the server's own
# /api/extension/download route (server/routes_extension.py) exactly:
#   * skip any file whose NAME starts with "." or ends .pyc/.tmp/.log/.md
#   * write FILES ONLY — no directory entries
# That matters: `zip -r` adds explicit `assets/` and `assets/fonts/` entries, so
# the artifact an agent builds by hand silently differs from the one users
# download. Parity with the server is asserted below, not assumed.
#
# Exclusions: *.md, .DS_Store, __pycache__/, *.pyc, *.tmp, *.log
set -euo pipefail

REPO="/home/roni/Roni_workspace/helpotron"
EXT_DIR="$REPO/extension"
DIST="$REPO/dist"
ART="$REPO/artifacts"
PY="$REPO/.venv/bin/python3"

VERSION="$("$PY" -c "import json;print(json.load(open('$EXT_DIR/manifest.json'))['version'])")"
ZIP="$DIST/helpotron-extension-v$VERSION.zip"
TEST_DIR="$DIST/helpotron-extension-v$VERSION-extracted"

mkdir -p "$DIST" "$ART"
[[ -f "$EXT_DIR/manifest.json" ]] || { echo "FATAL: no manifest.json in $EXT_DIR"; exit 1; }

# -- record the previous artifact (if any) before overwriting -----------------
PREV_LINE="previous-zip: (none)"
if [[ -f "$ZIP" ]]; then
    PREV_LINE="previous-zip-sha256: $(sha256sum "$ZIP" | cut -d' ' -f1)  (built $(stat -c %y "$ZIP" | cut -d. -f1))"
fi

# -- build the zip + the unpacked dir in one walk -----------------------------
rm -rf "$TEST_DIR" "$ZIP"
"$PY" - "$EXT_DIR" "$ZIP" "$TEST_DIR" <<'EOF'
import os, shutil, sys, zipfile

ext, zip_path, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out_dir, exist_ok=True)
files = []
for root, _dirs, names in os.walk(ext):
    for name in names:
        if name.startswith(".") or name.endswith((".pyc", ".tmp", ".log", ".md")):
            continue
        src = os.path.join(root, name)
        rel = os.path.relpath(src, ext)
        dst = os.path.join(out_dir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        files.append(rel)

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for rel in files:
        z.write(os.path.join(out_dir, rel), rel)
print(f"packaged {len(files)} files -> {zip_path}")
EOF

# -- hashes --------------------------------------------------------------------
ZIP_SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)
LISTING=$("$PY" -c "import zipfile,sys;print('\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))" "$ZIP" | LC_ALL=C sort)
LIST_HASH=$(printf '%s\n' "$LISTING" | sha256sum | cut -d' ' -f1)
COUNT=$(printf '%s\n' "$LISTING" | grep -c .)

# Directory entries would double the listing on unpack and are absent from the
# server's artifact — catch a regression here rather than in the store review.
DIRS_IN_ZIP=$(printf '%s\n' "$LISTING" | grep -c '/$' || true)
if [[ "$DIRS_IN_ZIP" != "0" ]]; then
    echo "FATAL: zip contains $DIRS_IN_ZIP directory entry/entries; expected files only."
    exit 1
fi

# -- sanity: manifest inside the zip matches the source version ---------------
"$PY" - "$ZIP" "$VERSION" <<'EOF'
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    m = json.loads(z.read("manifest.json"))
assert m.get("manifest_version") == 3, "not MV3"
assert m.get("version") == sys.argv[2], f"version {m.get('version')} != {sys.argv[2]}"
print(f"zip manifest check OK: {m.get('name')} v{m.get('version')} (MV3)")
EOF

# -- parity against the live server artifact, when it is reachable ------------
# The server route is the source of truth for what users actually download; if
# it is up, prove this build matches it file-for-file instead of trusting the
# walk to be right.
SERVER_ZIP="$(mktemp /tmp/helpotron-server-ext-XXXXXX.zip)"
if curl -fsS -o "$SERVER_ZIP" http://127.0.0.1:5000/api/extension/download 2>/dev/null; then
    "$PY" - "$SERVER_ZIP" "$ZIP" <<'EOF'
import hashlib, sys, zipfile
srv, loc = zipfile.ZipFile(sys.argv[1]), zipfile.ZipFile(sys.argv[2])
sn, ln = srv.namelist(), loc.namelist()
assert sn == ln, f"file list differs (server {len(sn)} vs local {len(ln)})"
diff = [n for n in sn
        if hashlib.sha256(srv.read(n)).hexdigest() != hashlib.sha256(loc.read(n)).hexdigest()]
assert not diff, f"content differs for: {diff}"
print(f"server parity OK: {len(sn)} entries, names and content identical")
EOF
    PARITY_LINE="server-parity: byte-content identical to /api/extension/download"
else
    PARITY_LINE="server-parity: NOT CHECKED (server not reachable)"
fi
rm -f "$SERVER_ZIP"

# -- manifest file --------------------------------------------------------------
{
    echo "helpotron extension package manifest  ($(date '+%Y-%m-%d %H:%M:%S'))"
    echo "$PREV_LINE"
    echo "zip: $ZIP"
    echo "zip-sha256: $ZIP_SHA"
    echo "listing-sha256 (sorted file list): $LIST_HASH"
    echo "file-count: $COUNT"
    echo "extracted-dir: $TEST_DIR"
    echo "$PARITY_LINE"
    echo "excluded: *.md .DS_Store __pycache__/* *.pyc *.tmp *.log"
    echo "--- sorted zip listing ---"
    printf '%s\n' "$LISTING"
} > "$ART/package-manifest.txt"

# -- LOUD WARNING: stale unpacked dirs ----------------------------------------
# The bug class this catches cost a full debugging cycle: the unpacked dir name
# is derived from the manifest version, so changing that version silently starts
# writing to a NEW directory while Chrome keeps loading the OLD one via "Load
# unpacked". Every subsequent fix then lands somewhere the browser never reads,
# and the extension appears not to change no matter what you do. Name the strays.
STALE=()
while IFS= read -r d; do
    [[ "$d" == "$TEST_DIR" ]] && continue
    STALE+=("$d")
done < <(find "$DIST" -maxdepth 1 -type d -name 'helpotron-extension-v*-extracted' | LC_ALL=C sort)

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
echo "extracted dir:  $TEST_DIR"
echo "manifest file:  $ART/package-manifest.txt"
