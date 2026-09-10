# Audit 3 of 3 — Security / Code-Health Audit
Helpotron Chrome extension — `/home/roni/Roni_workspace/helpotron/extension/`
Date: 2026-09-08

## 1. Syntax check (`node --check`) — every .js in extension/

| File | Result |
|------|--------|
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

**All 10 JS files parse cleanly (PASS).**

## 2. Secret scan (literal secrets across extension/*.js)

Patterns scanned: `sk-`, `ghp_`, `AIza`, `eyJ` (JWT blobs), `api_key`/`apikey`/`api-key`, hardcoded tokens.

Result: **ZERO hits.** No literal secrets, no hardcoded API keys, no JWT blobs.

Note on the two long-blob lines flagged:
- `background.js:877` — verified a `//` code comment (part of the "Read-only tab tools available to the agent session" doc block). Not a secret.
- `background.js:1196` — verified a `//` code comment (courses discovery block). Not a secret.
Neither contains a secret blob; both are comment text.

## 3. Auth source-of-truth

All authenticated requests use `Authorization: Bearer <token>` where the token is read live from
`chrome.storage.local` (`session_token || token`). No credentials are hardcoded:

- `background.js:59,73,302` — `chrome.storage.local.get(['session_token','token'])` → `Bearer ${tok}`
- `popup.js:377,961,836,1367` — `session_token || token` → `Bearer ${...}`
- `agent_mode.js:197,203,1370` — `session_token || token` → `Bearer ${...}`

**CONFIRMED:** auth is exclusively via `chrome.storage.local` session_token/token → `Authorization: Bearer`
headers. No hardcoded credentials anywhere.

## 4. Fetch-host audit

Every fetch/tab target in extension/*.js:

| Host | Use | Verdict |
|------|-----|---------|
| `https://helpotron.dpdns.org` | Extension's own backend (DEFAULT_SERVER; all `${server}`/`${srv}`/`SERVER` default to it) | Expected |
| `https://docs.new` | `background.js:699` — `chrome.tabs.create` for a new Google Doc (not a fetch) | Expected |

Domain mentions for `docs.google.com`, `instructure.com`, `office.com`, `live.com`, `notion.so`,
`blackboard`, `brightspace`, `moodle` are **local hostname/LMS detection matchers only** (`u.includes(...)`
checks and `a[href*="..."]` CSS selectors in background.js:430-452 / content.js:20-27,345-355). They
receive no network data — pure page-classification logic. **Not fetch hosts.**

Two flagged fetch call sites, both expected (not exfil):
- `content.js:499` — `fetch(url, { credentials: 'include' })` inside `extractAllFileLinks`/hashing of
  **LMS/file URLs** on the current page (local file hashing). Expected, not exfil.
- `background.js:1150` — `fetchTextSafe(url, { credentials: 'omit' })` — reads a URL's text with
  cookies explicitly omitted. Expected, not exfil.

**CONFIRMED:** only hosts are `https://helpotron.dpdns.org` and `https://docs.new` (tab create). No
third-party or exfil host.

## 5. XSS sink audit

Data-bearing renders all build via `createElement` + `textContent` (safe):
- **Threads list** (`renderThreadsDrawer`, popup.js:1690-1728): `createElement('span')` + `textContent = th.title`. Safe.
- **Chat messages** (`addPopupChatMsg`, popup.js:1614-1635): `body.textContent = text`. **CONFIRMED textContent.**
- **Assignment options** (popup.js:3004-3016): `createElement('option')` + `textContent`. Safe.
- **Tab options** (popup.js:3062-3074): `createElement('option')` + `textContent`. Safe.

Non-data `innerHTML` sites (static markup, cleared containers, static emoji/SVG): safe.

Interpolated `${}`-data innerHTML — **one site**:
- `popup.js:3022` — `ltdAssignmentSelect.innerHTML = `<option value="">Could not load (${String(e).slice(0, 30)})</option>``
  inserts a caught error string truncated to 30 chars. **Severity: LOW.** Error text from fetch failures is
  not attacker-controlled HTML in this flow, and it is truncated. **Not a confirmed XSS.**

`content.js:1438` HUD card innerHTML is fully static (no `${}`). `agent_mode.js:655`/`popup.js:1972`
virtual-cursor innerHTML is static SVG (only a constant `VIRTUAL_CURSOR_ID` interpolated).

**CONFIRMED: NO confirmed XSS.** All user/data-bearing UI uses createElement+textContent; the single
interpolated-innerHTML site is LOW-severity, defense-in-depth only.

## 6. Message-auth check

`background.js:337-340`:
```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'untrusted sender' });
    return;
  }
```
**CONFIRMED:** untrusted senders rejected via `sender.id !== chrome.runtime.id`.

## Overall verdict

**OVERALL: PASS**
