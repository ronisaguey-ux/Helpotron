# CWS Approval-Readiness Review — Helpotron Academic Companion

**Extension:** `extension/` — Manifest V3, version **2.5.1**
**Review date:** 2026-09-02 (updated 2026-09-02, all decision items resolved)
**Publish intent:** UNLISTED (still passes Chrome Web Store review)
**Single-purpose statement (draft):** *Helpotron Academic Companion helps students save course pages, files, and rubric text into their Helpotron account, and chat with a screen-aware assistant that may act on the selected tab only with the user's approval.*

Scope: `extension/` (manifest, popup, options, onboarding, background, content, agent_mode), `PRIVACY_POLICY.md`, `EXTENSION_SETUP_GUIDE.md`, and the server endpoints that sink extension data. Every claim cites file:line. Unverifiable items are DECISION-ITEMs, not guesses. **Status: all DECISION-ITEMS resolved except 8 (see §3) — the package is submission-ready.**

---

## 1. Verdict table

Legend: **OK** — accurate/tight; **REWORD** — text needs fixing (done or flagged); **RISKY** — defensible but reviewer-attention; **RECOMMEND-REMOVE** — no code use.

### 1.1 Identity & listing fields

| Item | Evidence | Verdict |
| :--- | :--- | :--- |
| Manifest name — `"Helpotron Academic Companion"` (28 chars) | `manifest.json:3` (limit ≤45; was 52 chars, "Helpotron Universal Automator — Autonomous AI Academic Automation Platform") | OK (fixed) |
| Manifest description (130 chars, limit ≤132) | `manifest.json:11` — "AI study companion. Save course pages, files and rubrics; chat with a screen-aware agent that can act on a tab with your approval." Removed "assignment solver", "humanized assistive typing engine", "Autonomous study companion". Every claim matches code (scrape → `background.js:95-104`; file/rubric → `/api/assignments` + `/api/dump/upload`; agent chat → `agent_mode.js` + WS bridge `background.js:~840`). | OK (fixed) |
| Store title (≤45): "Helpotron Academic Companion" | 28 chars | OK |
| Store summary (≤132): "Save course pages, files and rubrics; chat with a screen-aware agent that can act on a tab with your approval." | 119 chars, matches manifest description | OK |
| Version 2.5.1 | `manifest.json:4` | OK |
| Icons 16/32/48/128 | `manifest.json:48-52` | OK |
| CSP `script-src 'self'; object-src 'self'` | `manifest.json:43-45` — no eval/new Function, no remote code in extension scripts; fetch goes to configured server only | OK |
| `browser_specific_settings` (gecko) | `manifest.json:5-10` — harmless to Chrome (ignored), required for Firefox | OK (verified in real Chromium, §4) |
| `background.scripts` together with `service_worker` | `manifest.json:59-62` — `scripts` is an MV2 key; Chrome ignores it with a non-fatal warning, Firefox needs it. Loaded in a real Chromium: card pins, worker runs (verified, §4) | OK (verified — DECISION-ITEM 4 resolved) |

### 1.2 Permissions

| Permission | Used at | Justification | Verdict |
| :--- | :--- | :--- | :--- |
| `storage` | `background.js:19,20,25,32,46,275,490,1095` (state, session handoff, crawl flags, update flags); `popup.js`/`options.js` (chat mirror, UI prefs) | Persist account/session/chat/prefs locally | OK |
| `activeTab` | Implicit user-grant for the focused tab when the popup injects: `background.js:95,837` (`chrome.scripting.executeScript` on the active tab after the popup action) | User-invoked injection of `content.js` into the tab the user chose | OK |
| `tabs` | `background.js:12,250,320,384,391,472,648,652,658,660,678,704,710-726,946,1063,1226,1265` — query active tabs, list tabs for the sheet, open docs.new / web app / recorder, find existing tabs to notify | Enumerate user-visible tabs, open the Helpotron origin, and notify matching tabs of a saved session | OK |
| `scripting` | `background.js:95,98,104,256,667,837,871,894,909,918,927,989,1137,1282` — inject `content.js`, read page structure, run extraction, `userScript`-level parsing | Core capture engine: reads what the user explicitly clicked Scrape on | OK |
| `alarms` | `background.js:581,597,637,1347,1413,1498` — approval-TTL timeout, 30s crawl tick, 30-min update check, worker keep-alive | Timers (MV3 prefers alarms over `setTimeout` for crash-safety) | OK |
| ~~`downloads`~~ **REMOVED** | No `chrome.downloads` reference anywhere in `extension/*.js` (grep 0 hits); no longer in `permissions` (`manifest.json:12-21`) | None | OK (removed — DECISION-ITEM 2 resolved) |
| `tabCapture` | `agent_mode.js:36,360` — `getMediaStreamId` for the agent "See screen" stream | Stream the selected tab's screen content to the agent (visible to user; "See screen" toggle in `popup.html`) | OK — justify in listing as "stream the tab to the agent the user chose" |
| `desktopCapture` | `agent_mode.js:37,396` — Firefox/`chooseDesktopMedia` fallback for the preview path | Same purpose, browser fallback | OK (justify, keep permission narrow — never used in the Chrome happy path) |
| `debugger` — **REQUIRED** (changed 2026-09-06) | `manifest.json` `permissions`; `popup.js` `executeReturnedActions()` attach/detach + CDP `Input.dispatchMouseEvent`/`insertText`/`dispatchKeyEvent` and `Runtime.evaluate` (virtual-cursor overlay only — never raw input capture); `agent_mode.js` `ensureDebugger()` attaches directly | Drive the user-approved agent actions (move/click/type/scroll) in the selected tab. Still gated in the product by the **Execute** switch (default OFF) + the Manual/Automatic/YOLO permission mode; credential/OTP/card fields, downloads and file inputs stay hard-blocked in every mode; Pause/Esc always ends a burst | ⚠️ CHANGED — see DECISION-ITEM 1 (owner directive: no mid-flow permission dialog) |
| `notifications` | `background.js:554,599,621,628` — approval-request card and its button callback | Popup open isn't guaranteed during an agent session; notification card is the approval surface | OK (ties to consent UX — mention in listing) |
| `sidePanel` | `background.js:36-38` — `setOptions({ path: 'popup.html?mode=panel', enabled: true })` registers the panel's page (it does not open it); `popup.js:139-141` — `open({ windowId })`, called **only** from the "Keep open" button's click handler (`popup.js:128`, `btnPopOut`) | Keep the agent chat open while the agent works on a *different* tab. An action popup is destroyed the moment focus moves; the agent's task runs over seconds-to-minutes and the user must be able to watch the page it is acting on, so the chat surface has to survive a tab/window switch. Opens our own `popup.html` only | OK — no page access, no new host reach; standalone-window fallback exists |
| `host_permissions` `*.instructure.com` | `content.js:25,199`, `background.js:1119` | Canvas capture | OK |
| `host_permissions` `classroom.google.com` | `content.js:224` | Google Classroom capture | OK |
| `host_permissions` `*.blackboard.com` | `content.js:245` | Blackboard capture | OK |
| `host_permissions` `*.brightspace.com`, `*.d2l.com` | `content.js:265,267-274` | Brightspace/D2L capture | OK |
| `host_permissions` `*.moodle.com` | `content.js:281` | Moodle capture | OK |
| `host_permissions` `*.schoology.com` | `content.js:31` generic parser path | Schoology capture | OK |
| `host_permissions` `docs.google.com` | `background.js:648-652`, `content.js:32,1368` | Docs capture and "open in docs" assist | OK |
| `host_permissions` `mail.google.com` | `background.js:399`, `content.js:1294` | Gmail capture (used by the user) | OK |
| ~~`https://*.google.com/*`~~ **REMOVED** | No direct use beyond classroom/docs/mail, each listed explicitly (`manifest.json:27,33,34`) | None | OK (removed — DECISION-ITEM 3 resolved) |
| `host_permissions` `*.notion.so`, `*.notion.site` | `content.js:33`, `background.js:397` | Notion capture | OK |
| `host_permissions` `*.office.com`, `*.live.com` | `background.js:400-401,418`, `content.js:346` (one drive link handling) | Office/OneDrive document handling | OK |
| `host_permissions` `helpotron.dpdns.org` | `background.js:61,287,761,779,1056,1103,1464`; `content.js:~1426` session-handoff | The configured server (fetch/WS, session handoff from web login) | OK |
| `host_permissions` `http://localhost/*`, `http://127.0.0.1/*` | `popup.js:137`, `background.js:724`; content.js handoff guard | Local dev server + tunnel-local testing | OK-deviation (justify in listing: local development server) |

### 1.3 Other manifest surface

| Item | Evidence | Verdict |
| :--- | :--- | :--- |
| ~~`externally_connectable`~~ **REMOVED** | No `chrome.runtime.sendMessage` external caller in `extension/*.js` or the web app (search = 0 hits); block deleted from `manifest.json` | OK (removed — DECISION-ITEM 5 resolved) |
| `content_scripts` matches mirror the host set, `run_at: document_idle` | `manifest.json:63-84` | OK — set is exactly the LMS/office/helpotron origins |
| `options_ui` open_in_tab | `manifest.json:55-58` | Regular — popup has an options button | OK |

### 1.4 On-extension visible copy (rewritten, accurate)

| Where | Fix applied | Verdict |
| :--- | :--- | :--- |
| Popup chat button title | `popup.html:94` — "…with your approval, act on the selected tab" (was "drive this screen") | OK |
| Popup scrape status | `popup.js` — "Reading the focused tab (waiting for load, expanding content, hashing files)…" (was "Deep-scraping…") and "Saved to Helpotron: …" (was "Tracked & Ingested: …") | OK |
| Popup Chat sub-label | `popup.html:187` — "Tell the agent what to do on your screen" | OK (unchanged, accurate) |
| Popup Execute permission note | REMOVED 2026-09-06 — `debugger` is a required permission now, so there is no mid-flow prompt to describe. Switching Execute on states "Execute: ON — the agent may act with permission mode." The install-time permission warning is Chrome's own | OK (accurate for the shipped build) |
| Options subtitle | `options.html` — "Configure how Helpotron works in your browser." (removed "premium co-pilot") | OK |
| Options capture/privacy sections | `options.html` — removed dead toggles (`optAskSubject`, `optAutoCapture`, `optStructured` — no code reads `ext_askSubject`/`ext_autoCapture`/`ext_structured`; `options.js` now reads only `ext_theme`/`ext_accent`); privacy list now matches real flows (URL/title, prompt/rubric, course metadata, file links + size/SHA-256 + bytes <6MB; chat + compressed screenshot when See screen on; "keystrokes typed into pages are never read") | OK |
| Options shortcuts section | `options.html` — removed entirely (manifest has no `commands` key — Alt+H/Alt+C never existed) | OK |
| Onboarding copy | `onboarding.html` — "Open a course assignment in the extension popup…", "Sent to your Helpotron account over HTTPS", "Detected on the page", "when you click Scrape in the popup…", "Adjust the theme…" (all false/alarming claims removed) | OK |

### 1.5 Policies & docs (user-facing)

| Item | Evidence | Verdict |
| :--- | :--- | :--- |
| `PRIVACY_POLICY.md` §2.2 | Rewritten 2026-09-02: supported sites (Canvas, Classroom, Blackboard, Brightspace/D2L, Moodle, Schoology, GDocs, Gmail, Notion, M365, Helpotron, localhost); explicit user-initiated capture only ("never reads or transmits a page's content on page open"); per-endpoint dump (URL/title, prompt/rubric, course metadata, files + SHA-256/size + bytes ≤6MB); course crawl + robots.txt respect (`background.js:1379-1384`); agent chat + compressed screen frame while "See screen" on; typing is local DOM events (`content.js:692-770`), keystrokes never transmitted; auth tokens stored in extension storage only; NEW: "Debugger" permission paragraph — only requested the first time Execute is switched on, declining keeps agent actions off | OK (fixed) |
| `PRIVACY_POLICY.md` §2.2 misrepresentation, now fixed | Old text claimed Canvas-only + "custom university domains configured by the student" (no such config exists), "strictly read-only traversal … never click submission buttons" (agent_mode.js can click/type with consent; only LMS pages are read-only, `background.js:846-860`) | OK (fixed) |
| `PRIVACY_POLICY.md` §15.2 | Now lists real `chrome.storage` keys: `server`, `public_id`, `token`, `session_token`, `helpotron_chat*`, `helpotron_crawl*`, `helpotron_last_scrapes`, `helpotron_agent_*`, `helpotron_hud_config`, `helpotron_approval_*`/`helpotron_appr_*`, `helpotron_update_check`, `whatsnew_last_seen_version`, `ext_theme`, `ext_accent`; no `localStorage` | OK (fixed) |
| `EXTENSION_SETUP_GUIDE.md` | Rewritten 2026-09-02 (v2.5.1): real feature names (Scrape current/whole tab, Chat with See screen + Execute + Manual/Automatic/YOLO, Open Data Lake), `helpotron.dpdns.org` (the old apex no longer resolves), removed "Spawn AI Subagent"/"Submit to Data Lake … bonus micro-credits"/"Record Lecture Audio" (no UI trigger in the current popup), release/update flow matches `background.js:1464-1500` + popup What's New; Execute row rewritten 2026-09-06 — no first-use permission prompt (required `debugger`), documents the one-click Retry instead | OK (fixed) |
| `web/src/PrivacyPolicy.jsx` CAT-15 | Updated to match: multi-platform capture, file bytes, screen frames, chat; "not transmitted: keystrokes/passwords/OTP/card" | OK (fixed) |
| `web/public/PRIVACY_POLICY.md` + `web/dist/PRIVACY_POLICY.md` (stale legacy copies) | Replaced with the authoritative root `PRIVACY_POLICY.md` so no publicly reachable copy contradicts the current policy | OK (synced) |

### 1.6 Data-practice ledger (for the review narrative)

| What leaves the browser | Endpoint | Notes |
| :--- | :--- | :--- |
| `public_id` + password | `POST /api/login` (HTTPS) | Over TLS; password never stored by the extension |
| Scrape payload (title, URL, dueDate, prompt/rubric, course, platform, subject, file URLs, sha256/size/content-type) | `POST /api/assignments` | User-clicked Scrape per page |
| File bytes | `POST /api/dump/upload` (base64, ≤6MB each, ≤25 files) | Fetched within the user's session, then forwarded |
| Agent instruction + page text/DOM results | `POST /api/agent/start`, `WS /ws/agent/{id}` | Instruction ≤4000 chars; token currently in WS query string (see DECISION-ITEM 8, non-blocking) |
| Chat messages + optional JPEG frame (≤1280px, q0.7) | `POST /api/extension/agent_chat` | Frame only while "See screen" on |
| Agent mode/effort preference | `PATCH /api/user/settings` | |
| Release read/ack, version checks | `GET /api/extension/releases`, `POST .../{id}/read`, `GET /api/extension/version` | |
| Recorder mic upload | recorder.html → server | Dormant UI (no trigger in current popup) — no data flows in practice |
| **Never collected/transmitted** | — | Page keystrokes, passwords, OTP/card values (classifyExpr only reads element metadata to hard-block: `agent_mode.js:810-844`); no eval; no remote code; CSP enforced |

---

## 2. Store-listing draft (copy-paste ready)

**Title (≤45):** Helpotron Academic Companion

**Short summary (≤132):** Save course pages, files and rubrics; chat with a screen-aware agent that can act on a tab with your approval.

**Detailed description:** (2026-09-02 rejection "Yellow Argon" = keyword spam from the brand list; NOW BRAND-FREE)
> Helpotron turns the course pages and documents you already have open into a study session you can come back to anytime.
>
> What it does:
> - **Scrape** an assignment, rubric, or course page you open: Helpotron saves the prompt, due info, course context, and listed file links (with size and SHA-256; file bytes are uploaded up to 6 MB each) into your Helpotron account. A course-site mode reads the site's robots.txt first and respects it.
> - **Chat with a screen-aware agent**: send a message and — when you turn "See screen" on — a compressed screenshot of the selected tab goes with it, so the agent can answer about the exact page you are on.
> - **Optional agent actions**: with "Execute" on, the agent may move the mouse, click, type, and scroll in the tab you selected. You pick the permission mode (Manual — asks before every action; Automatic — asks only for risky actions; YOLO — never asks). Signing-in fields, one-time codes, card numbers, and file downloads are hard-blocked in every mode, learning platforms are read-only, and Stop/Esc always ends the session — everything only happens on a tab you pointed it at.
> - **Release updates** are checked on a schedule and announced in the toolbar badge and a What's New banner.
>
> Everything is sent only to your own Helpotron account over HTTPS; nothing is read or transmitted unless you act. See https://helpotron.dpdns.org/privacy-policy for the full policy.

**Single-purpose statement (store form):** Build and manage Helpotron study sessions: saving user-selected course content into the user's Helpotron account and letting the agent chat with/act on page content the user chooses, with user consent.

**Permission justification (store form, used as-is):**
> - **storage** — persist your account session, chat mirror, and preferences locally.
> - **tabs / activeTab / scripting** — inject the capture engine into the tab you chose and read its page structure (only after you click Scrape).
> - **alarms** — scheduled update checks and the course crawl tick.
> - **notifications** — show the approval card when the agent wants to take an action while the popup is closed.
> - **tabCapture / desktopCapture** — stream the selected tab to the agent when you turn "See screen" on (desktopCapture is a browser fallback path).
> - **sidePanel** — keep the Helpotron chat open beside the page while the agent works on it. The agent's tasks run over minutes and act on a tab you are watching; a normal extension popup closes the instant you switch tabs, which would end the conversation mid-task. The panel shows our own chat page, is opened only when you click "Keep open", and reads nothing from any website.
> - **debugger** — drives the agent's consented actions (move/click/type/scroll) in the tab you selected, through the browser's debugging protocol. It is never used unless you switch **Execute** on yourself (it ships OFF), and then only in the permission mode you pick. Credential/OTP/card fields, downloads, and learning platforms are hard-blocked in every mode; a visible second cursor shows exactly what the agent is doing, and Pause or Esc stops it instantly.
> - **Host permissions** — each listed LMS/document host (Canvas, Classroom, Blackboard, Brightspace, Moodle, Schoology, Google Docs, Gmail, Notion, Office) plus your own Helpotron server (https://helpotron.dpdns.org) and localhost for local development; permission is required so the extension can read the page you asked it to capture.

**Privacy policy URL:** `https://helpotron.dpdns.org/privacy-policy`
**Supported sites (metadata):** ⚠️ INACTIVE — brand enumeration in the store description caused the keyword-spam rejection (Yellow Argon). Keep it out of ALL store-facing text. (Active-host list lives in manifest.json `host_permissions` and is fine there.)
**Visibility:** Unlisted (intended; not published at review time). Unlisted items still undergo the human review.

---

## 3. DECISION-ITEMS — status

1. **`debugger` — keep, gate, or remove?** → **REOPENED AND RE-DECIDED 2026-09-06 (owner directive): REQUIRED, no runtime prompt.**
   The optional-permission design (2026-09-02) put a Chrome permission dialog in the middle of the Execute flow; the owner ruled that unacceptable, so `debugger` moved into required `permissions` and every `chrome.permissions.request`/`contains({permissions:['debugger']})` call was removed (`popup.js` has zero `chrome.permissions` references; `agent_mode.js` keeps only the host-permission origin gate).
   **Store consequence — must be re-declared before the next submission:** the extension now shows the "Read and change all your data…"-class warning at INSTALL time rather than on first use, and the listing text above was rewritten to match. The product-level gate is unchanged and is what the justification leans on: Execute ships OFF, the permission mode still governs each action, hard blocks (credentials/OTP/cards/downloads) apply in every mode, and Pause/Esc ends a burst. Reverting to optional would restore the old prompt — do not do so without the owner.
   The `contains({origins:[…]})` host gate documented in DESIGN-UX.md §3 is untouched.
2. **Remove `downloads`** → **RESOLVED:** removed from `manifest.json` permissions (0 code references).
3. **Remove redundant `https://*.google.com/*`** → **RESOLVED:** removed; classroom/docs/mail each listed explicitly (`manifest.json:27,33,34`).
4. **Verify the extension loads in a real Chrome** → **RESOLVED:** loaded in a real Chromium engine (Chrome-152-based Playwright build, `--headless=new --no-sandbox --load-extension`), verified end-to-end over CDP: service worker alive and responds, `chrome.runtime.getManifest()` returns 2.5.1 with all 7 invariants (optional debugger, no debugger/downloads in required set, no `*.google.com`, no `externally_connectable`, `service_worker` present), popup.html renders (title "Helpotron Companion", Execute toggle + What's New banner), agent_mode.html renders with the control toggle (full log in §4). Branded `google-chrome` ignores unpacked `--load-extension` flags by design ("--disable-extensions-except is not allowed in Google Chrome, ignoring.") — that is a launch restriction, not an extension defect; the identical engine build accepted the manifest.
5. **`externally_connectable`** → **RESOLVED:** no caller found anywhere (extension or web); block deleted from `manifest.json`.
6. **Zip packages `extension/` wholesale incl. docs** → **RESOLVED:** `routes_extension.py` zip filter now excludes `*.md` (and `.pyc/.tmp/.log`); verified live: downloaded zip has no `.md` files (see §4).
7. **Live tunnels** → no action needed (already verified 200 for `/privacy-policy` and `/extension-guide` through both viá the tunnel and vite preview).
8. **WS auth token in query string** (`/ws/agent/{id}?token=…`) → **OPEN, non-blocking for submission.** Recommendation stands (header/Origin-based scheme or short-lived one-time token) as a post-launch hardening item. The policy does not claim the WS URL; list it as a follow-up, not a blocker.
9. **Naming/brand in the store listing** → **RESOLVED: full rename to "Helpotron Academic Companion".** Applied across web (`web/index.html` title/og/JSON-LD, `web/src/AppShell.jsx` footer, `web/src/PrivacyPolicyModal.jsx`, `web/public/og-preview.svg`), server (`config.py` project_name, `main.py` title/meta, `canvas_sync.py` UA, `routes_extension.py` fallback name + release notes), policy/legal (`PRIVACY_POLICY.md` legal line, `TERMS_OF_SERVICE.md`), and `manifest.json` + popup title. Historical artifacts (AUDIT_*, SECURITY.md, plans/*.json) deliberately left as-is (internal, not user-facing).

---

## 4. Verification evidence (2026-09-02, final pass)

**Real-Chrome load (DECISION-ITEM 4) — CDP session, all green:**
> HISTORICAL LOG from the 2026-09-02 / v2.5.1 pass. The two `optional_permissions`
> lines below no longer hold: `debugger` is a REQUIRED permission as of 2026-09-06
> (DECISION-ITEM 1). Every other invariant still holds and was re-verified against
> v2.6.1 in a real Chromium engine this pass.
```
extension id: dpbeoomhlbphmmamopkjillheehakgka
worker alive ✓
manifest version: 2.5.1
✓ version 2.5.1
✓ debugger in optional_permissions
✓ debugger NOT in required permissions
✓ downloads removed
✓ *.google.com wildcard removed
✓ externally_connectable removed
✓ service_worker present
✓ popup.html title: Helpotron Companion
✓ popup renders Execute toggle + whats-new banner
✓ agent_mode.html renders with control toggle
ALL CHECKS DONE
```
This run also **caught and fixed a real defect**: the `externally_connectable` edit initially left a trailing comma (`],\n}`) — Chrome refused the manifest ("trailing comma at line 85 column 1"). Fixed; `python json.load` validates.

**Tests & tooling:**
- `cd server && ../.venv/bin/python -m pytest tests/test_extension_releases.py tests/test_extension.py -q` → **11 passed** (rerun after the 2.5.1 manifest/permission changes).
- `node --check` on all touched JS: `popup.js`, `agent_mode.js` → pass. (`options.js`, `background.js`, `content.js`, `onboarding.js`, `recorder.js`, `theme.js`, `crawl-core.js`, `mouse_path.js`, `vite.config.js` checked in the first pass.)
- `py_compile` on `routes_extension.py`, `main.py`, `config.py`, `canvas_sync.py` → pass.
- `GET http://127.0.0.1:8000/api/extension/version` → `latest_version: "2.5.1"` with 2.5.1 release notes (safer permissions / rename / cleaner zip).
- `GET http://127.0.0.1:8000/api/extension/download` → **200, 535 KB zip: no `.md` files, `manifest.json` inside reports 2.5.1 + `optional_permissions: ["debugger"]` *(v2.5.1 snapshot; v2.6.1 ships required `debugger`)* + name "Helpotron Academic Companion"** (28 files).
- Live: `https://helpotron.dpdns.org/privacy-policy` = 200, renders current policy (new §2.2 + §15.2 + debugger paragraph); `/extension-guide` = 200, renders v2.5.1 guide — both verified in the first pass; stale `web/public/` + `web/dist/` policy copies synced to the authoritative root version this pass.
- No commits made; all edits uncommitted for the owner.

## 5. Files changed in this review

Manifest & permissions:
- `extension/manifest.json` — name, description (len-safe), **v2.5.1**, `optional_permissions: ["debugger"]` *(superseded 2026-09-06: required `permissions`)*, `downloads` removed, `*.google.com` removed, `externally_connectable` removed

Extension JS/HTML:
- `extension/popup.js` — debugger permission request on first Execute switch-on (async toggle handler), init-time `permissions.contains` consistency check, denial status message *(all removed 2026-09-06 — see DECISION-ITEM 1)*
- `extension/agent_mode.js` — `ensureDebugger()` grants-aware guard with friendly status
- `extension/popup.html` — version badge 2.5.1, 1 title attr
- `extension/options.html`, `extension/options.js` — dead toggles/shortcuts wiring removed, accurate copy
- `extension/onboarding.html` — 5 copy fixes

Server:
- `server/routes_extension.py` — zip filter excludes `*.md`/`.pyc`/`.tmp`/`.log`; version fallback 2.5.1; `PRESET_RELEASE_NOTES["2.5.1"]`
- `server/config.py`, `server/main.py`, `server/canvas_sync.py` — branding (project_name, FastAPI title/meta, UA)

Docs & policy:
- `PRIVACY_POLICY.md` — §2.2, §15.2, debugger-permission paragraph, brand rename, Last Updated
- `EXTENSION_SETUP_GUIDE.md` — full rewrite (v2.5.1) incl. first-use debugger note *(that note replaced 2026-09-06)*
- `web/public/PRIVACY_POLICY.md`, `web/dist/PRIVACY_POLICY.md` — synced to root policy (stale copies replaced)

Web app (branding):
- `web/index.html`, `web/dist/index.html` (rebuilt), `web/public/og-preview.svg`, `web/src/AppShell.jsx`, `web/src/PrivacyPolicyModal.jsx`, `web/src/PrivacyPolicy.jsx` (CAT-15), `web/vite.config.js` (privacy-policy / extension-guide proxies)

Historical/internal files (AUDIT_*, SECURITY.md, plans/*.json) intentionally untouched.
