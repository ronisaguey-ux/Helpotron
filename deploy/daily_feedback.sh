#!/usr/bin/env bash
# daily_feedback.sh — helpotron daily data-lake feedback loop (08-26 directive).
# Runs ONCE per day (cron 09:00): collects the newest data-lake entries into a
# handoff file for main (the admin control agent) to evaluate; a successful
# evaluation+update cycle ends with a rebuilt app + reloaded extension.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LAKE="${DATA_LAKE_DIR:-${REPO}/data/lake}"
OUT="${REPO}/data/state/daily_handoff.json"
mkdir -p "${REPO}/data/state"

LAST=""
[ -f "${REPO}/data/state/.daily_last" ] && LAST="$(cat "${REPO}/data/state/.daily_last")"

python3 - "${LAKE}" "${OUT}" "${LAST}" <<'PY'
import json, os, sys, time
lake, out, last = sys.argv[1], sys.argv[2], sys.argv[3]
entries = []
for name in sorted(os.listdir(lake)):
    p = os.path.join(lake, name)
    if not name.endswith(".json"):
        continue
    try:
        st = os.path.getmtime(p)
        if last and st <= float(last):
            continue
        d = json.load(open(p))
        if isinstance(d, dict):
            d["_file"] = name
            d["_mtime"] = st
            entries.append(d)
    except Exception:
        continue
entries.sort(key=lambda d: d.get("_mtime", 0))
if not entries:
    print("daily_feedback: no new entries")
    sys.exit(0)
handoff = {"generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "count": len(entries),
           "entries": entries[-200:]}
open(out, "w").write(json.dumps(handoff, indent=1, default=str))
with open(os.path.join(os.path.dirname(out), ".daily_last"), "w") as f:
    f.write(str(max(d.get("_mtime", 0) for d in entries)))
print(f"daily_feedback: {len(entries)} new entries -> {out}")
PY

echo "Handoff: ${OUT} — main evaluates, then ships updates; see deploy/README.md"
