# Helpotron Overlord Agent & Virtual Sub-Agent Sandbox Architecture

## 1. Overview
The **Helpotron Overlord Agent** serves as the master orchestrating agent for the entire Helpotron platform. It provides persistent natural language control over user settings, credits, and sub-agent teams, operating alongside an isolated **Virtual Sub-Agent Sandbox** engine.

---

## 2. Overlord Operation Modes

| Mode | Behavior | Use Case |
| :--- | :--- | :--- |
| **Manual** | Every action requires explicit user approval before execution. | High-scrutiny academic workflows |
| **Auto** | Auto-approves routine study actions (e.g. flashcards, summaries, rubric checks). Pauses for critical actions (credit minting, final submission, deletions). | Recommended daily mode |
| **YOLO** | Auto-approves all actions immediately with zero confirmation prompts. | High-throughput batch automation |

### Natural Language Settings & Ecosystem Commands
The Overlord parses direct natural language directives:
* *"Change my reading level to sophomore"* → Updates user profile reading level.
* *"Set operation mode to YOLO"* → Upgrades session and user mode.
* *"Add 50 credits to my account"* → Checks permissions and mints credits.
* *"Run python script in sandbox"* → Spawns isolated sandbox, executes code, and returns stdout/artifacts.

---

## 3. Virtual Sub-Agent Sandbox (`server/engine/sandbox.py`)

### Architecture
* **Isolated Workspaces**: Each task runs in a dedicated directory under `exports/sandboxes/<sandbox_id>/`.
* **Path Traversal Guards**: Strict resolution ensures sub-agents cannot escape their workspace.
* **Execution Engines**: Supports `Python`, `Node.js`, and `Bash` script generation and execution.
* **Resource Limits & Auto-Cleanup**: Strict execution timeouts (default 30s) and automatic workspace destruction on task completion.

### API Endpoints
* `POST /api/agent/command`: Natural language ecosystem directive execution.
* `POST /api/agent/sandbox/execute`: Direct script execution inside a virtual sandbox.
* `GET /api/agent/sandbox/active`: Lists running virtual sandboxes.
* `POST /api/agent/sandbox/cleanup`: Destroys specified sandbox workspace.
* `POST /api/agent/permissions/respond`: Approves or rejects pending authorization requests.

---

## 4. Supported File Formats & Drag-and-Drop
The Overlord interface supports drag-and-drop file ingestion for:
* **Documents**: `.txt`, `.pdf`, `.docx`, `.csv`
* **Media / Transcripts**: `.mp3`, `.mp4`, `.wav`, `.webm`
* **Archives / Datasets**: `.zip`, `.tar.gz`
