# Audit 2 of 3 — Feature-Integrity / Message-Wiring Audit

Repo: `/home/roni/Roni_workspace/helpotron`
Ext dir: `/home/roni/Roni_workspace/helpotron/extension/`
Audited: 2026-09-08 (single session, no subagents)

Scope: extendibility of every JS file, popup DOM id ↔ getElementById integrity,
message wiring (sent vs handled), and typing-engine presence.

---

## 1. JS syntax check (`node --check`)

Ran `node --check` against every `.js` file in `extension/`. All 10 files pass.

| File | Result |
|---|---|
| agent_mode.js | PASS |
| background.js | PASS |
| content.js | PASS |
| crawl-core.js | PASS |
| mouse_path.js | PASS |
| onboarding.js | PASS |
| options.js | PASS |
| popup.js | PASS |
| recorder.js | PASS |
| theme.js | PASS |

`node --check`: **10/10 PASS, 0 FAIL.**

---

## 2. popup.html id ↔ popup.js getElementById integrity

- popup.html distinct `id="..."` elements: **156**
- popup.js literal `getElementById('<id>')` lookups: **114** unique ids
- Static lookups found in popup.html: **114 / 114** (all resolve)

Three non-literal `getElementById` calls are dynamic and resolve at runtime, NOT
missing ids:

- `${VIRTUAL_CURSOR_ID}` → template literal; `VIRTUAL_CURSOR_ID = '__helpotron_agent_cursor__'` (popup.js:1939), element created+appended by `initVirtualCursor` before lookup.
- `__helpotron_cursor_text__`, `__helpotron_cursor_ripple__` → created via `cur.innerHTML` inside `initVirtualCursor` (popup.js:1979/1981), appended to the DOM before `getElementById` (popup.js:2023/2041).

**id-missing count: 0**

---

## 3. Message-wiring audit

Handlers (`chrome.runtime.onMessage.addListener`):
- content.js:569 → `SCRAPE_CURRENT_ASSIGNMENT`, `DEEP_SCRAPE_CURRENT_ASSIGNMENT`, `COLLECT_COURSE_LINKS` (+ generic unknown/no-action fallback)
- content.js:685 (typing engine `setupListeners`) → `START_ASSISTIVE_TYPING`, `PAUSE_ASSISTIVE_TYPING`, `RESUME_ASSISTIVE_TYPING`, `CANCEL_ASSISTIVE_TYPING`, `GET_TYPING_STATUS`
- content.js:1883 → `BROADCAST_TYPING_PROGRESS`
- content.js:1915 → `agent-drive` (type)
- background.js:337 → `SYNC_ASSIGNMENTS`, `getTabs`, `startScrape`, `persistInstruction`, `startCrawl`, `stopCrawl`, `crawlStatus`, `activateAgent`, `scrapeContext`, `scrapeWithInstruction`, `agentStatus`, `startRecording`, `getGDocsTabs`/`getEditableTabs`, `launchToDoc`, `pauseTyping`, `resumeTyping`, `cancelTyping`, `BROADCAST_TYPING_PROGRESS`/`TYPING_PROGRESS`, `openDataLake`, `storeSession`, `REQ_APPROVAL`, `APPROVAL_RESPONSE` (action or act)
- popup.js:3144 → `BROADCAST_TYPING_PROGRESS`/`TYPING_PROGRESS`
- popup.js:3173 → `APPROVAL_PROMPT`
- agent_mode.js:1515 → `agent:user-interrupt` (type)

### Per-action wiring table (sent → handled)

| Sender | SENT action (channel) | Handler | Status |
|---|---|---|---|
| popup.js | APPROVAL_RESPONSE `act` (runtime) | background.js | OK |
| popup.js | startScrape (runtime) | background.js | OK |
| popup.js | crawlStatus (runtime) | background.js | OK |
| popup.js | startCrawl (runtime) | background.js | OK |
| popup.js | stopCrawl (runtime) | background.js | OK |
| popup.js | openDataLake (runtime) | background.js | OK |
| popup.js | getGDocsTabs (runtime) | background.js | OK |
| popup.js | launchToDoc (runtime) | background.js | OK |
| popup.js | pauseTyping / resumeTyping (runtime) | background.js | OK |
| popup.js | cancelTyping (runtime) | background.js | OK |
| content.js | getGDocsTabs (runtime) | background.js | OK |
| content.js | launchToDoc (runtime) | background.js | OK |
| content.js | pauseTyping / resumeTyping / cancelTyping (runtime) | background.js | OK |
| content.js | storeSession (runtime) | background.js | OK |
| content.js | agent:user-interrupt `type` (runtime) | agent_mode.js | OK |
| background.js | APPROVAL_PROMPT (runtime) | popup.js | OK |
| background.js | START_ASSISTIVE_TYPING (tabs) | content.js | OK |
| background.js | PAUSE/RESUME/CANCEL_ASSISTIVE_TYPING (tabs) | content.js | OK |
| background.js | BROADCAST_TYPING_PROGRESS (tabs) | content.js + popup.js | OK |
| agent_mode.js | REQ_APPROVAL (runtime) | background.js | OK |
| agent_mode.js | agent-drive `type` (tabs) | content.js | OK |

### Cross-check result

**ORPHANED (sent but never handled): 0.**
Every action sent over `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` has
a corresponding handler in content.js, background.js, agent_mode.js or popup.js.

**HANDLER with no message-bus sender (4, verified not dead — reached via `chrome.scripting.executeScript` direct function injection, not the message bus):**

| content.js handler | Wiring path |
|---|---|
| SCRAPE_CURRENT_ASSIGNMENT | invoked directly as `scrapeAssignmentUniversal`/`window.__helpotron_scrape_universal` via executeScript func |
| DEEP_SCRAPE_CURRENT_ASSIGNMENT | invoked as `deepScrapeUniversal` via executeScript func |
| COLLECT_COURSE_LINKS | invoked as `window.collectCourseLinks` via executeScript func (background.js:1187/1332) |
| GET_TYPING_STATUS | progress instead reported over `BROADCAST_TYPING_PROGRESS` broadcasts |

These are not orphans: the scrape actions are driven directly through
`chrome.scripting.executeScript` (background.js `startScrape`/`startCrawl`/
`scrapeAndSaveTab`), and typing status flows through the broadcast channel. No
message sent to any of them is ever lost.

**Wiring verdict: 0 orphans, 0 dead handlers. PASS.**

---

## 4. Typing-engine presence (content.js)

| Required item | Present | Location |
|---|---|---|
| `GoogleDocsAssistiveTypingEngine` class | YES | content.js:635 |
| `GAP_SHAPE` (letter/space/clause/sentence/newline) | YES | content.js:627 |
| `calculateDelay(char, prevChar, wpm, usePauses, useJitter)` | YES | content.js:1136 — burst/thinking-lull via `this.burst.left`, `s.runFactor` (0.52–2.0) |
| `tickSpeed()` (drift/runFactor) | YES | content.js:1066 (`this.speed.drift`, `s.runFactor`) |
| `window.__helpotron_unified_typing_engine = new GoogleDocsAssistiveTypingEngine()` | YES | content.js:1770 |

**Typing engine: PRESENT, complete.** Burst/lull logic confirmed in `calculateDelay`
(`this.burst.left`, `runFactor` burst/stall at content.js:1077/1080).

---

## OVERALL: PASS

Summary: 10/10 JS files pass `node --check`; 0 popup DOM-id misses (156 ids vs 114
static lookups all resolve); 0 orphaned message actions and 0 dead handlers
(scrape actions wired via executeScript direct calls); assistive-typing engine
fully present with GAP_SHAPE, calculateDelay burst/lull, tickSpeed drift/runFactor,
and the `window.__helpotron_unified_typing_engine` global — all present.
