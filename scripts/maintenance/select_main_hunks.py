#!/usr/bin/env python3
"""Split a unified diff and drop any hunk whose text matches a denylist.

Why this exists: ``server/main.py`` is ``git update-index --skip-worktree``'d so
a local dev-login bypass never reaches GitHub. That works, but it means an
ordinary edit to a route body in that file cannot be committed the normal way —
``git add server/main.py`` would stage the bypass alongside it.

This script is the escape hatch. It parses a diff into hunks and keeps only the
ones that do NOT contain a denylisted string, so the economy/logic hunks can be
staged while the bypass hunk is dropped.

Usage::

    git show HEAD:server/main.py > /tmp/opencode/main_head.py
    git diff --no-index /tmp/opencode/main_head.py server/main.py > full.diff
    python3 scripts/maintenance/select_main_hunks.py full.diff econ.diff \\
        "<the-bypass-password>|||<alternate-spelling>"
    sed -i 's|^--- server/main.py|--- a/server/main.py|;
            s|^+++ server/main.py|+++ b/server/main.py|' econ.diff
    git update-index --no-skip-worktree server/main.py
    git apply --cached --check econ.diff && git apply --cached econ.diff

The denylist is passed on the command line and is deliberately NOT recorded here:
the bypass credential must not appear in the repository, including in a docstring.

Then PROVE both directions before committing — the check is the safety net, not
this script::

    git show :server/main.py | grep -c "<the-bypass-string>"   # MUST be 0
    git show :server/main.py | grep -c "<your new code>"       # MUST be > 0
    diff <(git show :server/main.py) server/main.py            # ONLY the bypass hunk

Expected output is ``kept N hunks, dropped M: [...]`` — read the dropped count and
confirm it is exactly the one hunk you meant to drop. A silent extra drop means a
denylist string appeared in unrelated code.
"""
from __future__ import annotations

import re
import sys


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2

    src, dst, raw_denylist = sys.argv[1], sys.argv[2], sys.argv[3]
    denylist = [token for token in raw_denylist.split("|||") if token]

    lines = open(src, encoding="utf-8").read().splitlines(keepends=True)
    try:
        first = next(i for i, line in enumerate(lines) if line.startswith("@@"))
    except StopIteration:
        print("no hunks found in the diff — nothing to do")
        return 1

    header, body = lines[:first], lines[first:]

    hunks: list[list[str]] = []
    current: list[str] | None = None
    for line in body:
        if line.startswith("@@"):
            if current is not None:
                hunks.append(current)
            current = [line]
        elif current is not None:
            current.append(line)
    if current is not None:
        hunks.append(current)

    kept: list[list[str]] = []
    dropped: list[str] = []
    for hunk in hunks:
        text = "".join(hunk)
        if any(token in text for token in denylist):
            dropped.append(text.splitlines()[0])
        else:
            kept.append(hunk)

    header = [
        re.sub(r"^(---|\+\+\+) .*", lambda m: f"{m.group(1)} server/main.py", line)
        for line in header
    ]

    with open(dst, "w", encoding="utf-8") as handle:
        handle.writelines(header)
        for hunk in kept:
            handle.writelines(hunk)

    print(f"kept {len(kept)} hunks, dropped {len(dropped)}: {dropped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
