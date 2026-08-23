# Helpotron Admin Agent MCP

Zero-dependency MCP server (Node ≥18, no npm install) that bridges Claude Code
to the helpotron **Admin Agent** — the same chat the Control Center's
"Admin Agent" tab uses (`POST /api/agent/chat`, `session_mode_override=auto`).

When the site is live, this lets Claude Code manage the whole platform from
the admin agent: look up users, adjust credits, check system health, run
platform operations — every request is resolved and executed by the backend
agent with the admin identity, and every action lands in the audit log.

## Tools

| Tool          | What it does                                                        |
|---------------|---------------------------------------------------------------------|
| `admin_chat`  | Send an instruction to the admin agent → returns reply + execution  |
| `admin_health`| Fast backend liveness check (unauthenticated `/api/health`)         |

`admin_chat` is the whole point: the backend's LLM intent resolver decides the
action, the permission engine auto-approves it for the admin identity, and the
agent executes it. Example messages:

- `check system health`
- `give <public_id> 50 credits`
- `look up <public_id>`
- `show platform stats`
- `suspend <public_id>`

## Configuration

Copy `.env.example` → `.env` and fill in the admin credentials:

```
HELPOTRON_BASE_URL=http://localhost:8000
HELPOTRON_ADMIN_PUBLIC_ID=RoniDev
HELPOTRON_ADMIN_PASSWORD=<admin password>
```

`.env` is git-ignored. Alternatively export the same variables in the
environment, or set `HELPOTRON_ADMIN_TOKEN` to a pre-issued Bearer JWT to
skip the login flow.

## Register with Claude Code

Add to `~/.claude.json` / project `.mcp.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "helpotron-admin": {
      "command": "node",
      "args": ["/home/roni/Roni_Workspace/helpotron/mcp/server.js"],
      "env": {
        "HELPOTRON_BASE_URL": "http://localhost:8000",
        "HELPOTRON_ADMIN_PUBLIC_ID": "RoniDev"
      }
    }
  }
}
```

(The password stays in `mcp/.env`, not in the config.)

## Test without Claude Code

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"admin_chat","arguments":{"message":"check system health"}}}' \
| node server.js
```
