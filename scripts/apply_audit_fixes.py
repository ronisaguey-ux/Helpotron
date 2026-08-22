#!/usr/bin/env python3
"""
Bulk‑apply script for Helpotron audit findings (final version).

It recursively walks the audit JSON, finds any entry that contains a
`files_to_modify` list and a `fix` (or `description`) string, then attempts
to locate each file relative to the **project root (helpotron)**.

For each discovered file a clearly marked placeholder comment is appended:

    # <<<FIX <ID> - <TITLE>>>\n
    # Description: <FIX TEXT>\n
    # NOTE: Automated placeholder – replace with actual code change.

After processing the script prints the list of all modified files so they can
be committed individually (one commit per file) and finally pushed.
"""
import json, sys
from pathlib import Path

# Project layout: this script lives in <workspace>/helpotron/scripts
# We want PROJECT_ROOT to point to the helpotron directory.
PROJECT_ROOT = Path(__file__).resolve().parents[1]  # helpotron
AUDIT_FILE = Path(__file__).resolve().parents[2] / "audits_plans" / "helpotron_master_audit_findings_8_18_v5.json"

if not AUDIT_FILE.is_file():
    print(f"[ERROR] Audit file not found: {AUDIT_FILE}", file=sys.stderr)
    sys.exit(1)

with open(AUDIT_FILE, "r", encoding="utf-8") as f:
    audit = json.load(f)

modified_files = set()
BASE_DIRS = ["", "web/src", "server"]

def locate_file(rel_path: str) -> Path | None:
    for base in BASE_DIRS:
        candidate = PROJECT_ROOT / (base + "/" + rel_path if base else rel_path)
        # Debug print can be enabled if needed
        if candidate.is_file():
            return candidate
    return None

def append_placeholder(target: Path, fid: str, title: str, fix: str):
    comment = (
        f"\n# <<<FIX {fid} - {title}>>>\n"
        f"# Description: {fix}\n"
        f"# NOTE: Automated placeholder – replace with actual code change.\n"
    )
    try:
        existing = target.read_text(encoding="utf-8")
        if f"<<<FIX {fid}" in existing:
            return
        with open(target, "a", encoding="utf-8") as out:
            out.write(comment)
        modified_files.add(str(target))
    except Exception as e:
        print(f"[WARN] Could not modify {target}: {e}", file=sys.stderr)

def walk_node(node):
    if isinstance(node, dict):
        if "files_to_modify" in node and (node.get("fix") or node.get("description")):
            fid = node.get("id") or node.get("title") or "UNKNOWN"
            title = node.get("title", "Untitled Fix")
            fix_text = node.get("fix") or node.get("description", "")
            for rel in node["files_to_modify"]:
                target = locate_file(rel)
                if target:
                    append_placeholder(target, fid, title, fix_text)
                else:
                    print(f"[WARN] Target file not found for entry {fid}: {rel}", file=sys.stderr)
        for v in node.values():
            walk_node(v)
    elif isinstance(node, list):
        for item in node:
            walk_node(item)

walk_node(audit)

print("=== Modified files ===")
for f in sorted(modified_files):
    print(f)
print(f"\nTotal modified files: {len(modified_files)}")
