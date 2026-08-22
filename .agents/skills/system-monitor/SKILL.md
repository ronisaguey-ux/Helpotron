---
name: system-monitor
description: >-
  Use this skill to inspect and heal the entire agentic stack: tmux sessions (claude-main, oculus, oculus-execution), webchat API endpoints (8080, 8082), orchestrator status, and auto-responder daemons.
---

# System Monitor Skill

Inspects and verifies running processes, background daemons, and port endpoints across the workspace.

## Key Inspection Commands

1. **Check Tmux Sessions**:
   `tmux ls`
   - `claude-main`: Active Claude Code main session
   - `oculus`: Always-on Telegram inbox monitor
   - `oculus-execution`: Master plan execution engine

2. **Check Webchat API Status**:
   - DeepSeek Webchat: `curl -s http://127.0.0.1:8080/status`
   - Orch Webchat: `curl -s http://127.0.0.1:8082/status`

3. **Check Background Daemons**:
   `ps aux | grep -E "telegram_auto_responder|outbox-relay|server.js|execute_master_oculus_plan" | grep -v grep`
