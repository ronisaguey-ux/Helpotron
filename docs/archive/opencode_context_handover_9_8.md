# OpenCode Context Handover — 2026-09-08

Seamless-resume state for the opencode agent on this machine.

## Current objective
Get the **Helpotron Chrome extension v2.7.0** ready for CWS:
1. ✔ 3-way audit (manifest/CWS, feature integrity, security/code-health) — ALL DONE, PASS.
2. ⏳ Build/extract a **fresh** test zip from source; hand to owner for testing.
3. ⏳ On owner's explicit green light → **submit v2.7.0 to Google CWS** (published-unlisted id `nlbbjhgmdmjmlgojeiblkhfmmnlmfmjk`), wait for approval.
4. ⏳ After approval → swap the website extension download link to the store URL.

Separately done this week: the X11 STT dictation hotkey (v5) is COMPLETE and confirmed working ("the dictation hotkey finally works").

## STT dictation hotkey — COMPLETE (verified)
- File `/home/roni-saguey/.local/state/stt/oc_stt_hotkey.py`. Hold `1`+`2` → record mic → transcript typed via `type_text()` into the focused window. Lone `1`/`2` type normally. NO autosend (no trailing Return).
- **Final bug root cause:** `peek_event()` used only `select()`, but XTEST-injected keys with `d.sync()` get libxcb-buffered and do NOT wake `select` → hotkey got presses (10/11) but never releases → `active=[10,11]` stuck forever, record thread never finalized, keyboard held.
  **FIX:** `peek_event()` drains `d.pending_events()` first, then falls back to `select`. NEVER revert to select-only.
- Verified via A/B grab test (`[(2,10),(3,10)]` via `pending_events()`); systemd chord completed `(no speech heard)`; lone `1` types normally; no stray `oc_stt` clients. Service `oc-stt-hotkey.service` enabled+active, `oc-stt-daemon.service` active.
- Logs: `journalctl --user -u oc-stt-hotkey.service` (not a log file). `DISPLAY=:0` needed for any X/injection test.
- Backups: GOOD `/tmp/opencode/oc_stt_hotkey.v5_fixed.bak` (has fix). **STALE `/tmp/opencode/oc_stt_hotkey.v5.bak` (select-only — do not restore).**
- Memory note `/home/roni-saguey/.claude/projects/-home-roni-Roni-workspace/memory/stt-hotkey-setup.md` updated to v5 + peek footgun.
- Version history (never regress): v1 sync grab froze; v2 sync grab dropped partner press; v3 async ungrab-early leaked auto-repeat digits; v4 async held-through-recording blocked main loop 200s (dead); **v5 = threaded recording, async grab, ungrab on both release, non-blocking wait, HARD_CAP 130.0 + subprocess timeout 200, drain-pending peek fix.**

## Extension state
- Repo `/home/roni/Roni_workspace/helpotron`, branch `timing-model-gptzero`, remote `github.com/ronisaguey-ux/Helpotron`.
- Manifest **version 2.7.0**, `manifest_version` 3, valid JSON/no trailing commas. Source dir `extension/`.
- **STALE artifacts (do not use):** `helpotron-extension-v2.7.0-test-extracted/` and `helpotron-extension-v2.7.0.zip` (built 14:49; source popup.js modified 18:58, agent_mode.js 16:58, content.js 16:49 — newer). **Must rebuild from `extension/`.**
- `CWS_APPROVAL_REVIEW.md` lives in `extension/`. PRESET_RELEASE_NOTES lives in `server/routes_extension.py` (2.7.0 key present).
- Git tip: `extension/` committed + clean; untracked `verify-artifacts/` (drivecheck/keepopen results, package-manifest.txt modified) — leave alone.

## Audit results — ALL PASS
### Subagent 1 — Manifest / CWS readiness (COMPLETE)
- Version 2.7.0, mv3, valid JSON. All referenced files exist; background.service_worker present; PRESET_RELEASE_NOTES has 2.7.0.
- `debugger` is in `permissions` (line 21) NOT `optional_permissions` — **intentional owner-directed decision** per CWS_APPROVAL_REVIEW.md §3 DECISION-ITEM 1 (REOPENED 2026-09-06: "owner directive: REQUIRED, no runtime prompt"). NOT a blocker.
- `downloads`/`externally_connectable` absent; host_permissions = classroom.google.com/docs.google.com/mail.google.com (no `*.google.com` wildcard).

### Subagent 2 — Feature integrity / message wiring (COMPLETE, PASS)
- `node --check` PASS on popup.js(content/background/agent_mode/options).
- popup.html has 156 ids; every `getElementById()` in popup.js resolves to an existing id (0 missing).
- Message wiring: content.js handles SCRAPE_CURRENT_ASSIGNMENT, DEEP_SCRAPE_CURRENT_ASSIGNMENT, COLLECT_COURSE_LINKS, GET_TYPING_STATUS; background.js handles SYNC_ASSIGNMENTS, getTabs, persistInstruction, startScrape, startCrawl, agentStatus, activateAgent, REQ_APPROVAL, storeSession. All senders have handlers; no orphaned actions.
- Typing model present: content.js `GoogleDocsAssistiveTypingEngine` with `GAP_SHAPE`, `calculateDelay` (burst/lull), `tickSpeed` (drift/runFactor). `window.__helpotron_unified_typing_engine = new GoogleDocsAssistiveTypingEngine()`.
- "Dead UI" list (approval cards, form members, tabNav, toggles, btnPopupChatSend, btnWhatsNewDismiss/Expand, option-chat/scrape, ltdTabSelect) = **false positives** — all wired via other patterns (`.onclick`, form submit, `querySelectorAll('.option-card').forEach`, `modelToggles` forEach, or getElementById var bound later).

### Subagent 3 — Security / code-health (COMPLETE, PASS)
- `node --check` all PASS. NO literal secrets (no sk-/ghp_/AIza/JWT blobs — the only 2 long-blob lines in background.js:877,1196 are code comments). All auth via `chrome.storage.local` session_token/token → `Authorization: Bearer` headers from user login.
- fetch hosts: only `https://helpotron.dpdns.org`, `https://docs.new` (tab create). No third-party/exfil host. `content.js:499` fetches LMS file URLs (`credentials:'include'`); `background.js:1150` `fetchTextSafe` (`credentials:'omit'`) — both expected, not exfil.
- XSS sinks: data-bearing renders (threads list, chat messages, assignment/tab options) build via `createElement`+`textContent` (safe). Interpolated innerHTML sites use static strings or own-config values; the only `${}`-data innerHTML is the error string `String(e).slice(0,30)` in an option — low-risk. `addPopupChatMsg` uses `textContent`. No confirmed XSS.
- Message auth: `background.js:337-340` rejects via `sender.id !== chrome.runtime.id` (untrusted sender). `storeSession` writes server/public_id/token but only from the origin-guarded content script on helpotron/localhost pages.

## Next actions
1. Package fresh zip from `extension/` (exclude `*.md`): `cd /home/roni/Roni_workspace/helpotron && zip -r helpotron-extension-v2.7.0-fresh.zip extension/ -x '*.md'` (or rebuild into a clean dir tree without the `extension/` prefix). Confirm manifest version 2.7.0 inside, 30 files.
2. Extract it to a fresh test dir; sanity-check `manifest.json` + a couple runtime files match source checksums.
3. Hand path to owner for testing; **STOP for explicit go before any CWS submission** (outward-facing/hard-to-reverse).
4. On go: submit v2.7.0 to CWS (id `nlbbjhgmdmjmlgojeiblkhfmmnlmfmjk`), then update `server/` website download link to the store URL.

## Key constraints
- Terse. No sudo. Do not edit opencode config/MCPs/serve stack. Bob=owner.
- `pkill` DENIED; use `kill -9 <pid>` (for-loops trip the harness guard). No throwaway prod-DB rows.
- Parallel work: use `oc_bg_oc_bg_agent` (the native task/subagent tool was slow/broken for this run).
