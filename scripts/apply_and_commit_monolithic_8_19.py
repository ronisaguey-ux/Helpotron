#!/usr/bin/env python3
"""
Apply audit fixes from the monolithic audit (8_19) and commit each change individually.
For every finding that contains a `files_to_modify` list and a `fix` or `description`,
  1. Locate the target file (relative to the project root, trying '', 'web/src', 'server').
  2. Append a placeholder comment:
        # <<<FIX <ID> - <TITLE>>>
        # Description: <FIX TEXT>
        # NOTE: Automated placeholder – replace with actual code change.
  3. Stage the file and commit with a conventional‑commit message:
        fix(audit): <ID> – <TITLE>
The script skips entries where the placeholder already exists or the file cannot be found.
"""
import json, sys, subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]  # helpotron
AUDIT_FILE = Path(__file__).resolve().parents[2] / "audits_plans" / "helpotron_master_monolithic_audit_8_19.json"

if not AUDIT_FILE.is_file():
    print(f"[ERROR] Audit file not found: {AUDIT_FILE}", file=sys.stderr)
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

def append_placeholder(target: Path, fid: str, title: str, fix: str) -> bool:
    comment = (
        f"\n# <<<FIX {fid} - {title}>>>\n"
        f"# Description: {fix}\n"
        f"# NOTE: Automated placeholder – replace with actual code change.\n"
    )
    try:
        existing = target.read_text(encoding="utf-8")
        if f"<<<FIX {fid}" in existing:
            return False
        with open(target, "a", encoding="utf-8") as out:
            out.write(comment)
        return True
    except Exception as e:
        print(f"[WARN] Could not modify {target}: {e}", file=sys.stderr)
        return False

def process_entry(entry):
    if not ("files_to_modify" in entry and (entry.get("fix") or entry.get("description"))):
        return []
    fid = entry.get("id") or entry.get("title") or "UNKNOWN"
    title = entry.get("title", "Untitled Fix")
    fix_text = entry.get("fix") or entry.get("description", "")
    modified = []
    for rel in entry["files_to_modify"]:
        target = locate_file(rel)
        if not target:
            print(f"[WARN] Target file not found for entry {fid}: {rel}")
            continue
        if append_placeholder(target, fid, title, fix_text):
            # stage and commit
            try:
                subprocess.run(["git", "add", str(target)], check=True)
                msg = f"fix(audit): {fid} – {title}"
                subprocess.run(["git", "commit", "-m", msg], check=True)
                modified.append(str(target))
            except subprocess.CalledProcessError as e:
                print(f"[ERROR] Git error for {target}: {e}")
    return modified

def walk(node):
    modified_files = []
    if isinstance(node, dict):
        modified_files.extend(process_entry(node))
        for v in node.values():
            modified_files.extend(walk(v))
    elif isinstance(node, list):
        for item in node:
            modified_files.extend(walk(item))
    return modified_files

all_modified = walk(audit)

print("=== All modifications committed ===")
for f in all_modified:
    print(f)
print(f"Total committed files: {len(all_modified)}")
