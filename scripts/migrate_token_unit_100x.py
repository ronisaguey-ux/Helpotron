#!/usr/bin/env python3
"""One-time migration: rescale token balances to the new unit.

WHY. On 2026-09-17 the owner changed the token rate from 1 token = 1 cent to
1 token = 1/100 cent (100 tokens per cent, 10,000 per dollar), so that sub-cent
tasks could be priced accurately instead of every one rounding up to a whole
cent. The plan allowances were scaled by the same factor (300 -> 30,000 etc), so
the economics are unchanged — but any balance already ON an account is written in
the OLD, coarser unit. Left alone, a user holding 300 tokens would find them
worth 100x less than yesterday.

This multiplies every stored `settings.token_balance` by 100, exactly cancelling
the rate change for existing holdings.

Idempotent: a marker row in `credit_transactions` records that it ran, so a
second run refuses rather than multiplying twice.

    python3 scripts/migrate_token_unit_100x.py --dry-run
    python3 scripts/migrate_token_unit_100x.py --apply
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

MARKER = "migration:token_unit_100x"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the change")
    ap.add_argument("--dry-run", action="store_true", help="report only (default)")
    a = ap.parse_args()
    apply = bool(a.apply and not a.dry_run)

    from server.database import SessionLocal, User, CreditTransaction
    from server.credits import get_token_balance

    db = SessionLocal()
    try:
        already = (db.query(CreditTransaction)
                     .filter(CreditTransaction.reason == MARKER).first())
        if already is not None:
            print("already migrated — refusing to run again (would multiply by 100 twice)")
            return 0

        rows = db.query(User).all()
        moved = []
        for u in rows:
            bal = get_token_balance(u)
            if bal:
                moved.append((u.public_id, bal, bal * 100))

        print(f"accounts holding a balance: {len(moved)}")
        for pid, before, after in moved:
            print(f"  {str(pid)[:24]:26s} {before:>12,.2f} -> {after:>14,.2f} tokens")

        if not apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0

        # back up first; this touches real money state
        from server.config import config
        db_path = str(config.database_url).replace("sqlite:///", "")
        if db_path and Path(db_path).exists():
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup = f"{db_path}.bak-pre-token-100x-{stamp}"
            shutil.copy2(db_path, backup)
            print(f"\nbacked up -> {backup}")

        for u in rows:
            bal = get_token_balance(u)
            if not bal:
                continue
            settings = dict(u.settings or {})
            settings["token_balance"] = float(bal) * 100.0
            u.settings = settings          # replace, not mutate: SQLAlchemy needs
                                           # a new object to see the change
        marker_owner = rows[0].id if rows else None
        if marker_owner is None:
            print("no users to migrate")
            return 0
        db.add(CreditTransaction(user_id=marker_owner, delta=0, reason=MARKER))
        db.commit()
        print(f"migrated {len(moved)} accounts")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
