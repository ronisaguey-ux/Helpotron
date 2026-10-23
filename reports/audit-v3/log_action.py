#!/usr/bin/env python3
import sys
import json
import os
import fcntl
from datetime import datetime, timezone

LOG_FILE = "/home/roni/Roni_workspace/helpotron/reports/audit-v3/execution.json"

def append_log(agent, category, phase, summary, files, commit, evidence):
    ts = datetime.now(timezone.utc).isoformat()
    entry = {
        "ts": ts,
        "agent": agent,
        "category": category,
        "phase": phase,
        "summary": summary,
        "files": files if isinstance(files, list) else [files] if files else [],
        "commit": commit if commit else None,
        "evidence": str(evidence)
    }

    lock_file = LOG_FILE + ".lock"
    with open(lock_file, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            if os.path.exists(LOG_FILE):
                try:
                    with open(LOG_FILE, "r") as f:
                        data = json.load(f)
                    if not isinstance(data, list):
                        data = []
                except Exception:
                    data = []
            else:
                data = []

            data.append(entry)

            temp_file = LOG_FILE + ".tmp"
            with open(temp_file, "w") as f:
                json.dump(data, f, indent=2)
            os.replace(temp_file, LOG_FILE)
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent", required=True)
    parser.add_argument("--category", required=True)
    parser.add_argument("--phase", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--files", default="[]")
    parser.add_argument("--commit", default=None)
    parser.add_argument("--evidence", default="")
    args = parser.parse_args()

    try:
        files = json.loads(args.files)
    except Exception:
        files = [f.strip() for f in args.files.split(",") if f.strip()]

    append_log(args.agent, args.category, args.phase, args.summary, files, args.commit, args.evidence)
    print("Logged successfully.")
