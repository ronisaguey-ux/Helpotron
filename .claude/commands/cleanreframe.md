---
name: cleanreframe
description: Rotate context, intelligently refine requests using dynamic dictionary, and reload.
argument-hint: [--dry-run | --restart]
allowed-tools:
  - Bash
---

# CleanReframe Session Optimizer & Dynamic Dictionary Reseeder

!python3 /home/roni/Roni_workspace/LLM-Drift-Detector/examples/cleanreframe_claude_session.py $ARGUMENTS

Intelligently reframe requests using the dynamic dictionary and sanitize context.
If output is already rendered above, present the reframed context summary to the user.
If not automatically triggered, execute:
`python3 /home/roni/Roni_workspace/LLM-Drift-Detector/examples/cleanreframe_claude_session.py $ARGUMENTS`
using the Bash tool and report results.\n