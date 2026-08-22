#!/usr/bin/env python3
"""
Commit each audit placeholder file individually.
For every audit entry that has a `files_to_modify` list, this script:
  1. Finds the absolute path of each target file (same logic as apply_audit_fixes.py).
  2. Runs `git add <path>`.
  3. Commits with a conventional‑commit message:
        fix(audit): <ID> – <TITLE>
If a file does not exist or is already committed, it is skipped.
The script prints a summary at the end.
"""
import subprocess, sys
from pathlib import Path
import json

PROJECT_ROOT = Path(__file__).resolve().parents[1]  # helpotron directory
AUDIT_FILE = Path(__file__).resolve().parents[2] / "audits_plans" / "helpotron_master_audit_findings_8_18_v5.json"

if not AUDIT_FILE.is_file():
    print(f"[ERROR] Audit file missing: {AUDIT_FILE}", file=sys.stderr)
    sys.exit(1)

with open(AUDIT_FILE, "r", encoding="utf-8") as f:
    audit = json.load(f)

BASE_DIRS = ["", "web/src", "server"]

def locate_file(rel_path: str) -> Path | None:
    for base in BASE_DIRS:
        candidate = PROJECT_ROOT / (base + "/" + rel_path if base else rel_path)
        if candidate.is_file():
            return candidate
    return None

committed = []
skipped = []

def process_entry(entry):
    if not ("files_to_modify" in entry and (entry.get("fix") or entry.get("description"))):
        return
    fid = entry.get("id") or entry.get("title") or "UNKNOWN"
    title = entry.get("title", "Untitled Fix")
    for rel in entry["files_to_modify"]:
        target = locate_file(rel)
        if not target:
            skipped.append((fid, rel, "file not found"))
            continue
        # Add and commit
        try:
            subprocess.run(["git", "add", str(target)], check=True)
            msg = f"fix(audit): {fid} – {title}"
            subprocess.run(["git", "commit", "-m", msg], check=True)
            committed.append((fid, str(target)))
        except subprocess.CalledProcessError as e:
            skipped.append((fid, str(target), f"git error: {e}"))

def walk(node):
    if isinstance(node, dict):
        process_entry(node)
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for item in node:
            walk(item)

walk(audit)

print("=== Commit Summary ===")
for fid, path in committed:
    print(f"Committed {fid} -> {path}")
print(f"Total committed: {len(committed)}")
print("=== Skipped ===")
for fid, info, reason in skipped:
    print(f"{fid}: {info} ({reason})")
print(f"Total skipped: {len(skipped)}")
