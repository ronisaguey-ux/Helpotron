---
name: telegram-messenger
description: >-
  Use this skill to send alerts, status updates, or responses directly to the user on Telegram.
  Automatically enforces the 'agy: ' alias prefix for Antigravity.
---

# Telegram Messenger Skill

Sends formatted messages to the user's Telegram chat via the Oculus telegram-monitor sender script.

## Usage

Run the following command to deliver a message:

```bash
bash -c 'set -a; source /home/roni/.config/oculus/orchestrator.env; set +a; /home/roni/Roni_workspace/oculus/scripts/telegram-monitor/bin/send-telegram.sh "agy: <MESSAGE_TEXT>"'
```
