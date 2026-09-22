# Graph traversal — read this before grepping

A code knowledge graph of this repo lives at `graphify-out/graph.json`. It answers
questions grep cannot: *who calls this*, *what breaks if I change it*, *which files
form a cluster*. Use it to aim your search, then read the files it names.

**`graphify-out/` is gitignored and regenerable.** Nothing in it is a source of truth —
the code is. If the graph disagrees with the code, the code is right and the graph is
stale.

## Query it

```bash
cd /home/roni/Roni_workspace/helpotron
G=graphify-out/graph.json

graphify query "where is the API key authentication checked" --graph $G
graphify explain "require_admin" --graph $G          # node + all its edges
graphify path "get_current_user" "User" --graph $G   # how two things connect
graphify affected "charge_actual_usage" --graph $G   # what depends on it
graphify god-nodes --top 20 --graph $G               # the core abstractions
```

The MCP server (`graphify-mcp`) exposes the same over query tools: `query_graph`,
`get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`,
`shortest_path`.

### ★ Ambiguity: `explain` prints NOTHING for a non-unique name

`explain` fails silently when more than one node shares a name, which reads exactly like
"that symbol is not in the graph" and will send you hunting for a typo that does not exist.

Measured: `call_llm` exists in **both** `server/llm.py` and `server/stylometry/rewrite.py`;
`SettingsApp` exists in both `web/src/components/SettingsApp.jsx` and `web/src/App.jsx`.
`graphify explain "call_llm"` returns an empty result for both.

**Use the node ID instead** — it is the path plus the name, with `/` and `.` flattened to
`_`: `server_llm_call_llm`, `server_stylometry_rewrite_call_llm`,
`web_src_components_settingsapp_settingsapp`. To find the ID:

```bash
python3 -c "
import json
d = json.load(open('graphify-out/graph.json'))
for n in d['nodes']:
    if 'call_llm' in (n.get('id') or ''):
        print(n['id'], n.get('source_file'), n.get('source_location'))
"
```

Method labels carry a leading dot (`.log_api_call()`, `.update_user_settings()`) and still
resolve on the bare name when unique. Also note `_run_detector_group` resolves fine while
its ID drops the leading underscore (`server_detectors_run_detector_group`).

**If `explain` returns nothing: try the ID form before concluding the node does not exist.**

## Read the report

`graphify-out/GRAPH_REPORT.md` — open this first on an unfamiliar area. It carries a
navigation index of every community, god nodes, **import cycles**, and surprising
connections. 372 communities, each named after the file most of its members live in.

`graphify-out/communities.json` — the same index, machine-readable: `{id, name, size,
files[], hub, hub_location, third_party}`.

Entries marked `[vendored]` are third-party material carried inside this repo
(`vendor/watermarks-remover`, `.agents/skills/*`). They are in the graph on purpose —
a supply-chain review needs to see them — but they are not Helpotron's own code, so do
not spend audit budget there unless supply chain is the question.

## What is in it

- 9999 nodes · 23488 edges · 372 communities · 93% EXTRACTED / 7% INFERRED edges
- Every node carries `source_file` and `source_location` (`server/admin.py L46`), so a
  lookup returns something you can open.
- Dependency nodes (`react`, `asyncio`, `FastAPI`) are present with no `source_file` —
  they are imports, not files.
- Two files are excluded by graphify's credential heuristic because their names contain
  the word *tokens*: `docs/design/.../dark_tokens.json` and `motion_tokens.json`. They
  are **design tokens, not credentials** — a false positive. If a design question needs
  them, read them directly.

## Rebuild it

```bash
cd /home/roni/Roni_workspace/helpotron

# 1. extract — pure AST, zero token cost, ~60s
env -u DEEPSEEK_API_KEY -u ANTHROPIC_API_KEY -u OPENAI_API_KEY \
  graphify extract . --code-only --timing

# 2. re-cluster (extract already clusters; run this after an `update`)
env -u DEEPSEEK_API_KEY graphify cluster-only . --no-viz --no-label

# 3. label      — ALWAYS run this, or every community reads "Community N"
python3 scripts/graphify_label.py .
```

`graphify update .` re-extracts only changed files and is the cheap path after edits;
step 3 still has to run, because `--no-label` resets the names to placeholders.

**Do not run `graphify install` / `graphify uninstall` / any `--mcp` mode.** They write
agent and MCP configuration files, which is not this repo's business. The CLI and the
MCP server are already installed.

## Why labels are derived, not generated

`graphify label` names communities with an LLM. This box has no ollama and no usable
local chat model (the only local server is the HIP humanizer — a *base* model with no
chat template), and no key is spent on a housekeeping pass.

So `scripts/graphify_label.py` names each community after the file most of its members
live in. That is a fact about the code rather than a description of it, it is stable
across rebuilds, and for the one job a name has here — tell me where to open the file —
it is more useful than an invented label. It is idempotent and re-runnable.
