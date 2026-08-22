---
name: bridge-interagent
description: >-
  Use this skill to send and receive structured messages between Antigravity and Claude Code via the Antigravity-Bridge inbox.
---

# Antigravity Bridge Interagent Skill

Inter-agent communication protocol connecting Antigravity and Claude Code.

## Storage Path
`~/.claude/inbox/messages.jsonl`

## Send Message to Claude Code
Append JSON object to `~/.claude/inbox/messages.jsonl`:
```json
{
  "id": "msg_<timestamp>_<hex>",
  "timestamp": "<iso_timestamp>",
  "from": "antigravity",
  "to": "claude_code",
  "subject": "<Subject>",
  "priority": "normal",
  "content": "<Body>",
  "status": "unread",
  "reply_to": null
}
```
