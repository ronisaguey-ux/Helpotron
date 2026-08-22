#!/usr/bin/env python3
"""
Utility script: list audit fix IDs, titles, and target files.
Outputs lines of the form:
    ID|||TITLE|||FILE_PATH
One line per file, for all audit entries that have a `files_to_modify`
list and a `fix`/`description`.
"""
import json, sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]  # helpotron
AUDIT_FILE = Path(__file__).resolve().parents[2] / "audits_plans" / "helpotron_master_audit_findings_8_18_v5.json"

if not AUDIT_FILE.is_file():
    print(f"[ERROR] Audit file not found: {AUDIT_FILE}", file=sys.stderr)
    sys.exit(1)

with open(AUDIT_FILE, "r", encoding="utf-8") as f:
    audit = json.load(f)

def walk(node):
    if isinstance(node, dict):
        if "files_to_modify" in node and (node.get("fix") or node.get("description")):
            fid = node.get("id") or node.get("title") or "UNKNOWN"
            title = node.get("title", "Untitled Fix")
            for rel in node["files_to_modify"]:
                # Resolve to absolute path based on known base dirs
                for base in ["", "web/src", "server"]:
                    candidate = PROJECT_ROOT / (base + "/" + rel if base else rel)
                    if candidate.is_file():
                        print(f"{fid}|||{title}|||{candidate}")
                        break
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for item in node:
            walk(item)

walk(audit)
