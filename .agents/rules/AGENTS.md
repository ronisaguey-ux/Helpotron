# Global Multi-Agent Coordination Rules

1. **Telegram Alias Enforcement**:
   - **Antigravity (Me)**: ALWAYS prefix outbound Telegram messages with `agy: `
   - **Claude Code Main**: Prefixed with `main: `
   - **DeepSeek Webchat**: Prefixed with `webchat: `

2. **Self-Settings Modification Protection**:
   - Claude Code is hard-blocked by pre-tool hook from modifying settings files.
   - Any settings request must go through Antigravity -> Telegram approval -> Manual apply.

3. **Web Search & DeepSeek V4 Flash**:
   - Web search is powered by `websearch-deepseek` with model `deepseek-flash` and thinking enabled.

4. **Self-Healing & Drift Sanitization**:
   - `clean` / `/clean`: Scrubs refusals, strips exit tools, fabricates alignment context, and restores session.
   - `autoclean` / `/autoclean`: Real-time background daemon for continuous drift interception.
   - `cleanreframe` / `/cleanreframe`: Context rotation combined with dynamic dictionary prompt refinement.
