#!/usr/bin/env python3
"""graphify_label.py — give graphify's communities names that come from the code.

WHY THIS EXISTS
---------------
`graphify cluster-only --no-label` leaves every community called "Community N", and
with 372 of them the navigation index is a wall of numbers — an agent reading
GRAPH_REPORT.md to decide where to look learns nothing, which is the exact "blindly
searching" problem the graph is supposed to remove.

graphify's own `label` command names communities with an LLM. That is fine when a
backend is available, but this box has neither ollama nor a usable local chat model
(the only local server is the HIP humanizer, a BASE model with no chat template — it
emits scaffolding, not names), and routing a paid key through a housekeeping pass is
not the owner's call to make on his behalf.

So the names here are DERIVED, not generated: a community is named after the file
its members actually live in. That is a fact about the code rather than a description
of it, it costs nothing, it is stable across rebuilds, and for the one job a name has
here — tell me where to open the file — it is strictly more useful than an invented
label. The community's hub node is recorded alongside it as the secondary hint.

WHAT IT WRITES
--------------
  graphify-out/graph.json          community_name on every node
  graphify-out/GRAPH_REPORT.md     the nav list + every "### Community N" heading
  graphify-out/communities.json    machine-readable nav for agents (id, name, size,
                                   files with counts, hub node)

Idempotent, and safe to re-run after any `graphify update` / `cluster-only`, which
will have reset the names to placeholders.

Usage:
    python3 scripts/graphify_label.py [repo_root]
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# A name has to fit a nav line without wrapping. The path is truncated from the
# LEFT so the filename survives — `components/SettingsSections.jsx` tells you more
# than `server/routes/...`.
MAX_NAME = 58

# How much of a community one file must hold before the community is simply that
# file. Below this, the name admits the community is spread out.
DOMINANT = 0.60

# Directories that are vendored third-party material carried INSIDE this repo
# (a watermarks-remover plugin, agent skill bundles). They are kept in the graph
# on purpose — a supply-chain review needs to see them — but they are marked, so
# an agent reading the nav knows which entries are not Helpotron's own code and
# does not spend its budget there.
THIRD_PARTY = ("vendor/", ".agents/")


def shorten(path: str) -> str:
    if len(path) <= MAX_NAME:
        return path
    parts = path.split("/")
    out = parts[-1]
    for p in reversed(parts[:-1]):
        if len(p) + 1 + len(out) > MAX_NAME - 2:
            break
        out = f"{p}/{out}"
    return out if len(out) <= MAX_NAME else "…" + out[-(MAX_NAME - 1):]


def build(repo: Path) -> dict:
    gpath = repo / "graphify-out" / "graph.json"
    if not gpath.exists():
        raise SystemExit(f"no graph at {gpath} — run: graphify extract {repo} --code-only")

    data = json.loads(gpath.read_text())
    nodes = data.get("nodes") or []
    links = data.get("links") or []

    # Degree across the whole graph, so the hub is the community's most connected
    # node in context, not just its biggest.
    degree: Counter = Counter()
    for e in links:
        degree[e.get("source")] += 1
        degree[e.get("target")] += 1

    by_comm: dict[str, list[dict]] = defaultdict(list)
    for n in nodes:
        by_comm[str(n.get("community"))].append(n)

    report = repo / "graphify-out" / "GRAPH_REPORT.md"
    text = report.read_text() if report.exists() else ""

    mapping: dict[str, dict] = {}
    for cid, members in by_comm.items():
        files = Counter(
            m.get("source_file") for m in members if m.get("source_file")
        )
        hub = max(members, key=lambda m: degree.get(m.get("id"), 0))
        total_with_file = sum(files.values()) or 1

        if files:
            top_file, top_count = files.most_common(1)[0]
            coverage = top_count / total_with_file
            name = shorten(top_file)
            if coverage < DOMINANT:
                # Spread across files: still lead with the biggest one, but say how
                # many others there are so the name is not read as the whole story.
                others = len(files) - 1
                if others:
                    name += f"  (+{others} file{'s' if others != 1 else ''})"
        else:
            name = hub.get("label") or f"Community {cid}"

        mapping[cid] = {
            "id": cid,
            "name": name,
            "size": len(members),
            "files": files.most_common(8),
            "file_count": len(files),
            "hub": hub.get("label"),
            "hub_location": f"{hub.get('source_file')} {hub.get('source_location')}",
            "third_party": bool(files) and files.most_common(1)[0][0].startswith(THIRD_PARTY),
        }


    # ── patch graph.json so `explain`/`query` report the real name ────────────
    for n in nodes:
        cid = str(n.get("community"))
        if cid in mapping:
            n["community_name"] = mapping[cid]["name"]
    gpath.write_text(json.dumps(data, separators=(",", ":")))
    print(f"  graph.json: community_name set on {len(nodes)} nodes")

    # ── machine-readable nav ─────────────────────────────────────────────────
    nav_path = repo / "graphify-out" / "communities.json"
    nav = sorted(mapping.values(), key=lambda m: -m["size"])
    nav_path.write_text(json.dumps(nav, indent=2))
    print(f"  communities.json: {len(nav)} communities")

    # ── patch the report ─────────────────────────────────────────────────────
    if text:
        def nav_line(m: re.Match) -> str:
            cid = m.group(1)
            ent = mapping.get(cid)
            if not ent:
                return m.group(0)
            mark = "  ·  [vendored]" if ent.get("third_party") else ""
            return f"- {ent['name']}  ·  [{cid}]  ·  {ent['size']} nodes{mark}"

        new = re.sub(r"^- Community (\d+)\s*$", nav_line, text, flags=re.M)

        def head(m: re.Match) -> str:
            cid = m.group(1)
            ent = mapping.get(cid)
            if not ent:
                return m.group(0)
            hub = ent["hub"] or "—"
            loc = ent["hub_location"] or "—"
            mark = "  ·  VENDORED THIRD-PARTY" if ent.get("third_party") else ""
            return (f'### {ent["name"]}  ·  Community {cid}  ({ent["size"]} nodes){mark}\n'
                    f'Hub: `{hub}` — `{loc}`')

        new = re.sub(r'^### Community (\d+)\s*-\s*"Community \d+"\s*$', head, new, flags=re.M)

        # A nav list of 323 bare names is still a wall — group it by top directory.
        report.write_text(new)
        print(f"  GRAPH_REPORT.md: headings + nav rewritten")

    return mapping


def main() -> None:
    repo = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    print(f"labelling communities for {repo}")
    mapping = build(repo)

    # Show the biggest ones so the result of a rebuild is visible, not assumed.
    print("\n  largest communities:")
    for ent in sorted(mapping.values(), key=lambda m: -m["size"])[:14]:
        print(f"    {ent['size']:>5}  {ent['name']}")


if __name__ == "__main__":
    main()
