#!/usr/bin/env python3
"""Re-key the data-lake micro-credit store onto a dedicated, immutable salt.

WHY THIS EXISTS
---------------
`datalake._anonymize_id()` resolves its salt as:

    salt = os.getenv("DATALAKE_SALT", os.getenv("SECRET_KEY", "helpotron_salt_2026"))

and `DATALAKE_SALT` is NOT set in `.env`. So every stored `user_hash` has been
derived from `SECRET_KEY`, which is a *rotating* secret. Commit `29211e0`
introduced that fallback; before it, the salt was the hardcoded literal
`helpotron_salt_`.

The consequence, measured on 2026-09-23 against the live store — 355 records,
123 of them attributable to a `raw_user_id`:

    118 records  hashed with the old hardcoded salt   -> no longer resolvable
      5 records  hashed with the current SECRET_KEY   -> resolvable

`user_hash` is not decoration. It is the ONLY key the per-user history filter
(`list_microcredit_submissions`) matches on, and the only thing an ownership
check can compare against. So an unresolvable hash silently means: the user
cannot see their own submissions, and cannot delete them either. Rotating
`SECRET_KEY` — a routine security action, performed on this box 2026-09-18 —
orphans the entire history.

WHAT THIS DOES
--------------
Two halves, and both are required:

  1. `.env` gains a dedicated `DATALAKE_SALT`. The salt stops rotating with
     `SECRET_KEY`, so this cannot happen again.
  2. Every record that still carries a `raw_user_id` has its `user_hash`
     recomputed under that new salt. Those records become visible and deletable
     again, and no submission is lost.

Records with no `raw_user_id` are deliberately left untouched — that field is
the only way to re-derive a hash, and a record without it is one whose author
was already anonymised. Rewriting those would be inventing an owner.

IDEMPOTENT BY CONSTRUCTION
--------------------------
The hash is recomputed from `raw_user_id`, not chased from the old value, so a
second run is a no-op (the same input yields the same output). No marker row is
needed and none is written.

USAGE
-----
    ./.venv/bin/python scripts/migrate_datalake_salt.py --dry-run
    ./.venv/bin/python scripts/migrate_datalake_salt.py --apply
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import sys
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

ENV_PATH = REPO / ".env"
STORE = REPO / "data_lake" / "microcredit_submissions.jsonl"


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(ENV_PATH, override=True)


def ensure_salt() -> tuple[str, bool]:
    """Returns (salt, created). Writes a fresh DATALAKE_SALT into .env if absent."""
    _load_env()
    existing = os.getenv("DATALAKE_SALT")
    if existing:
        return existing, False

    salt = "dls_" + secrets.token_urlsafe(32)
    text = ENV_PATH.read_text(encoding="utf-8")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(ENV_PATH, ENV_PATH.with_name(f".env.bak-pre-datalake-salt-{stamp}"))

    if not text.endswith("\n"):
        text += "\n"
    text += (
        "\n# Dedicated data-lake salt. Must NEVER be rotated with SECRET_KEY: it\n"
        "# derives the user_hash on every micro-credit record, and changing it\n"
        "# orphans every stored submission (see scripts/migrate_datalake_salt.py).\n"
        f"DATALAKE_SALT={salt}\n"
    )
    ENV_PATH.write_text(text, encoding="utf-8")
    os.chmod(ENV_PATH, 0o600)
    os.environ["DATALAKE_SALT"] = salt
    return salt, True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    g.add_argument("--apply", action="store_true", help="write the .env salt and rewrite hashes")
    args = ap.parse_args()

    if not STORE.exists():
        print(f"  store not found: {STORE}")
        return 1

    if args.dry_run:
        _load_env()
        if not os.getenv("DATALAKE_SALT"):
            print("  DATALAKE_SALT is NOT set -> the salt is SECRET_KEY, and rotating it orphans")
            print("  every record. --apply will pin a dedicated salt and re-key the store.")
            salt = None
        else:
            salt = os.getenv("DATALAKE_SALT")
            print("  DATALAKE_SALT is already pinned.")
    else:
        salt, created = ensure_salt()
        print(f"  DATALAKE_SALT {'created in .env' if created else 'already present'}" + ("" if created else " (reusing)"))

    if salt is None:
        print("\n  (dry run: re-key preview needs a salt; run --apply to pin one)")
        return 0

    # Import only now: the module reads the salt from the environment at call time.
    from server.datalake import _anonymize_id

    records, changed, already, no_raw = [], 0, 0, 0
    for line in STORE.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        raw = rec.get("raw_user_id")
        if not raw:
            no_raw += 1
            records.append(rec)
            continue
        want = _anonymize_id(str(raw))
        if rec.get("user_hash") == want:
            already += 1
        else:
            changed += 1
            if args.apply:
                rec["user_hash"] = want
                rec["hash_rekeyed_at"] = datetime.utcnow().isoformat()
        records.append(rec)

    print(f"  records            : {len(records)}")
    print(f"  re-keyed           : {changed}")
    print(f"  already correct    : {already}")
    print(f"  no raw_user_id     : {no_raw}  (left untouched - no way to re-derive an owner)")

    if not args.apply:
        print("\n  DRY RUN - nothing written.")
        return 0

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = STORE.with_name(f"{STORE.name}.bak-pre-salt-rekey-{stamp}")
    shutil.copy2(STORE, backup)

    tmp = STORE.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, STORE)

    print(f"\n  backup : {backup}")
    print(f"  wrote  : {STORE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
