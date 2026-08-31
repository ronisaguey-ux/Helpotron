---
name: autoclean
description: Toggle continuous automated drift detection and self-sanitization daemon.
argument-hint: [toggle | status | stop | start]
allowed-tools:
  - Bash
---

# AutoClean Background Daemon

!python3 /home/roni/Roni_workspace/LLM-Drift-Detector/examples/autoclean_claude_daemon.py toggle

Toggle or report the status of the automated drift detection and self-sanitization daemon.
If output is already rendered above, confirm the daemon state (RUNNING / STOPPED) with PID and log details.
If not automatically triggered, execute:
`python3 /home/roni/Roni_workspace/LLM-Drift-Detector/examples/autoclean_claude_daemon.py toggle`
using the Bash tool and report results.\n