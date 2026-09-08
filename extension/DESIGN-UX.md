# Helpotron Companion 2.5.0 — Design & UX contract (09-02)

This document describes the decisions behind the 09-02 rebuild of the
browser-action popup and Agent Mode. The owner spec is the authority for
*what*; this file records *how* it maps to code, and why.

---

## 1. Top level: exactly two options

The popup is a launcher with exactly two option cards (both expanded by
default, collapseable):

| Card | Sub-options | Backend surface |
|------|-------------|-----------------|
| **SCRAPE** | ① "Scrape current thing only" (focused tab of the current window, `startScrape`) ② "Scrape everything on the tab" (site crawl of the focused tab, `startCrawl`) — page-by-page results list revealed to the user | existing scrape + crawl (background.js), no backend change |
| **CHAT** | ① switch **See screen** ② switch **Execute** ③ 3-way permission mode **Manual / Automatic / YOLO** ④ effort→model line ⑤ "Open agent chat" → `agent_mode.html` | `/api/extension/agent_chat` (agent mode), `/api/user/settings` (mode/effort) |

Removed from the popup shell (see §9 Deferrals): the old 4-tab display
(Scrape/Type/Chat/Settings), the tab dropdown (option ① always targets the
focused tab, per spec), the popup chat box (chat now lives in Agent Mode),
the recording button, and the assistive-typing controllers. The typing engine
itself (background `launchToDoc`) is untouched and still reachable through
the extension's options page wiring — the *popup launcher* no longer shows it.

## 2. Vision model selection: effort → tier (backend is the brain)

Server (`server/screen_vision.py`, unit-tested in
`server/tests/test_extension_vision_tiers.py`):

```
effort score 1..1000  (default 500, clamped at both ends)
  ≤ 333   → google/gemini-3.1-flash-lite      ($0.075/M in)  tier "low"
  334-666 → deepseek/deepseek-v4-flash-vision ($0.14/M)       tier "med"  [default]
  > 666   → google/gemini-3.8-flash           ($0.25/M)       tier "high"
```

- Higher effort ⇒ more expensive model, exactly as the owner's tiered list
  demands; the three ids are the canonical ones from
  `server/user_settings_service.py` ai-block defaults and `server/llm.py`
  `MODEL_PRICING` (asserted equal by test).
- `parse_effort_score`: `None`/empty/bool/garbage → 500; numeric → round to
  int, clamp to 1..1000. Out-of-range never errors.
- `analyze_screen_image(..., model_id)` keeps its signature; a caller-supplied
  `model_id` that is NOT one of the three canonical vision ids is ignored and
  the default (`deepseek/deepseek-v4-flash-vision`) is used.
- OpenRouter slug: `deepseek/deepseek-v4-flash-vision` → the `-exp` slug; both
  gemini ids pass through untouched. Mirrored in `_OR_SLUG_MAP` inside
  `screen_vision.py` to track `llm.call_llm`'s 09-01 map (test asserts both).

**Dead-tier fallback (09-08).** Measured live against the OpenRouter catalog
and a real tab screenshot: `deepseek-v4-flash-vision-exp` is listed but its
image price is `null` — it returns HTTP 200 with **empty content** for an image
payload, and `deepseek-v4-pro` is not image-capable at all (HTTP 404). Because
the default effort of 500 landed on the flash-vision tier, screen vision was
silently dead ("Vision analysis unavailable this turn") for every user not on
low effort. `deepseek-v4-pro-vision` is now off the ladder entirely. The med
tier keeps `deepseek-v4-flash-vision`, but a non-200 or empty response now
retries once on `_VISION_FALLBACK` → `google/gemini-3.8-flash` (degrading *up*,
so the ladder stays monotonic) and logs a warning. Transport errors still raise
so callers fail closed as before. Banned from the ladder outright:
`gemini-3.5-flash`, `gemini-3.1-pro-preview`, `deepseek-v4-pro*`.

- The popup/agent UI mirrors the same three bands client-side
  (`effortModelInfo` in `popup.js`) so the visible model line always agrees
  with what the backend resolves.

### Where the score comes from

The web app's settings persist `ai.effortScore` (1..1000) and `ai.mode`
(manual/auto/yolo) under `/api/user/settings` (PATCH applies them; GET
returns them). The extension:

1. `GET /api/user/settings` using its stored `session_token` (Bearer) — the
   header auth on that route now also accepts the extension's long-lived DB
   session token (additive fallback in `routes_features.get_current_authenticated_user`).
2. On success: cache `helpotron_agent_effort` + `helpotron_agent_model` +
   `helpotron_agent_model_tier` for the UI hint; `ai.mode` overwrites the
   local mode **unless** the user changed the mode in the popup in the same
   instant (pending PATCH).
3. **Fallback contract** (unauthenticated / offline / server error): effort
   500 (med tier, the default) and mode `manual`. Nothing breaks — the
   extension is fully usable in local mode; a subtle "local fallback" hint is
   not shown, but the status line reports the sync failure, and the mode line
   is kept honest because default 500 ⇒ canonical default model.

When the user changes the mode in the popup: PATCH `{"ai": {"mode": "..."}}`
(the value is declared in the `ai` defaults so the 08-29 writable-keys filter
accepts it; `ai` itself is a declared top-level key). Effort is set only from
the web app (no popup control for it — per spec the *backend* feeds it).

## 3. CHAT modes & approval flow

Permission modes (persisted in `helpotron_agent_mode`, values
`manual` / `auto` / `yolo`; default `manual`):

| Mode | Asks the user | Never asks |
|------|---------------|------------|
| **Manual** | every action | — |
| **Automatic** | only RISKY actions | safe actions |
| **YOLO** | — | everything not hard-blocked |

Hard blocks apply in **every** mode and are never asked about:

- **Credentials/OTP/cards** — the classifier (CDP `Runtime.evaluate`, live
  DOM inspection only — no keystroke reading, ever) flags element
  `type=password`, `autocomplete` ∈ {current-password, new-password,
  one-time-code, otp, cc-*, } and name/id/placeholder/aria-label matching
  password-ish patterns; blocks the action outright.
- **Downloads** — `a[download]` clicks and `input[type=file]` are blocked
  outright ("no arbitrary file downloads").
- **Host permissions** — the whole burst is gated: the drive tab's origin must
  match one of the extension's `host_permissions` patterns
  (`${protocol}//${host}${port}/*` via `chrome.permissions.contains`), and
  the check is re-run on every action (in case the page navigated mid-burst).
- **Cap** — `MAX_ACTIONS = 15` (server rejects >15 too: `_MAX_CONTROL_ACTIONS`
  in `screen_vision.py`); plus the existing `MAX_DRIVE_MS = 60_000` wall
  clock per burst.

RISKY set (asked in AUTOMATIC): `credential-adjacent` (an input inside a form
containing a password field), `destructive` (delete/remove/sign-out/deactivate
… buttons), `submit` (submit/save/publish/checkout/pay/journey buttons),
`leaving` (an `<a>` whose href resolves to a different origin — leaving the
study page set).

### Approval broker (extension ↔ popup ↔ notifications)

`agent_mode.js` → `chrome.runtime.sendMessage({action:'REQ_APPROVAL', title,
summary})` → background (`background.js`) decides a delivery surface:

1. **Popup-first**: the popup opens a port `helpotron-popup` on open
   (`chrome.runtime.connect`) — the only reliable "popup is alive" signal in
   MV3 (`chrome.extension.getViews` returns `[]` from a service worker). Its
   `onDisconnect` = popup closed, and any prompts still held *via the popup*
   are denied (`popup-closed`).
2. **Notification card** when the popup is closed: id `helpotron_appr_*`,
   buttons **[Allow] [Deny]**, `requireInteraction: true`. `onButtonClicked`:
   index 0 = allow, any other index = deny; `onClosed` **without** a button =
   deny (deny-default); `chrome.runtime.lastError` (notifications refused) =
   deny.
3. **TTL**: every pending request auto-denies after **~60 s** — a
   `setTimeout` in the worker **plus** a one-shot `chrome.alarms` mirror
   (`helpotron_approval_<reqId>`) so a killed worker still expires it. Deny is
   always the default. `agent_mode.js` also has a 90 s safety that denies if
   the worker never answers.

The popup renders the prompt as an in-card alertdialog (shield, title,
summary, Deny/Allow) and answers `APPROVAL_RESPONSE {reqId, decision}`.
Only one approval card shows at a time (small queue, cap 5).

## 4. See screen / Execute switches

- `helpotron_chat_seescreen` (default **true**) — controls whether chat
  messages carry a fresh 1280-px JPEG frame + viewport. On being toggled ON
  (or on Agent Mode open with it already ON) the page auto-captures the
  active tab of the current window; if the capture API refuses (some browsers
  need a gesture) it logs the reason and the user picks the tab manually.
  OFF ⇒ messages carry text only.
- `helpotron_chat_execute` (default **false**) — when OFF, returned
  `control_actions` are **not** executed at all (logged + status hint). When
  ON, they still need Control ON (customary consent modal) and mode approval.

Both are read live: `storage.onChanged` in `agent_mode.js` re-applies them
without a reload, and Agent Mode's chip shows
`mode — <m> · seescreen ON/OFF · execute ON/OFF`.

## 5. Storage keys (extension.local)

| Key | Writer | Meaning / default |
|-----|--------|-------------------|
| `helpotron_chat_seescreen` | popup | bool, default `true` |
| `helpotron_chat_execute` | popup | bool, default `false` |
| `helpotron_agent_mode` | popup | `manual`/`auto`/`yolo`, default `manual` |
| `helpotron_agent_effort` | popup (cached from backend) | 1..1000, default 500 |
| `helpotron_agent_model` | popup (cached) | canonical id, default med |
| `helpotron_agent_model_tier` | popup (cached) | `low`/`med`/`high` |
| `helpotron_chat` | popup/agent | chat mirror (shared) |
| `helpotron_crawl_cache` | popup | last crawl status snapshot |
| `helpotron_last_scrapes` | popup | per-tab bubble pinning |
| `agent_mode_log` | agent page | log ring (200) |

## 6. Scrape crawl results (revealed to the user)

`background.js` now records a per-page entry (`recordCrawlResult`) —
`{kind:'content', status: saved|failed|unparseable, title, assignment_id,
promptLen, files:{found,uploaded,recorded}, error?}` — into the crawl state
(capped 500; `crawlStatus()` returns the newest 200). The popup renders them
as a live page-by-page list inside the SCRAPE sub-options while the crawl
runs and keeps the last snapshot cached.

## 7. Accessibility & skin

- Popup reuses `design.css` tokens & components only (`@import design.css`;
  append-only shell section in `popup.css`): `.seg/.seg-btn.active` for the
  3-way mode control (same pill language as the web MyAgentView
  manual/auto/yolo), `.card`, `.switch-row`/`.switch`/`.track` for the two
  switches (knob translate 20 px), `.status`, `.update-banner`, `.chip`,
  `.btn` variants, `.error-card`, `.success-card`.
- `role="switch"` + `aria-checked` on both switches; the mode segmented
  control is a `role="group"` with `aria-pressed` per button; option cards
  carry `aria-expanded`/`aria-controls` and are keyboard-activatable
  (Enter/Space). The approval card is an `alertdialog` (non-modal) fed by
  `aria-live` statuses; `#status` is `role="status" aria-live="polite"`.
- Chrome MV3 rules: no remote scripts/images in the popup (SVG symbol defs
  inline), CSP untouched, `manifest.json` valid + `notifications` added to
  permissions (required for the notification approval path).

## 8. What the server enforces (extension is the hands)

- `/api/extension/vision`: effort resolved per request; every response
  (success, refused, error, insufficient tokens) carries
  `model`, `model_tier`, `effort_score`; the payload prompt is mod-reviewed
  (screen) and flagged (`vision_prompt`) without breaking the shape.
- `/api/extension/agent_chat`: effort resolved per turn and `model_id` passed
  to frame analyses; the chat text is mod-reviewed at write time
  (`agent_chat:<user>:<thread>`), and the agent-mode directive spells out the
  15-action cap and the per-action permission rule.
- Control action lists: >15 actions ⇒ the whole list is dropped (never
  partial); coordinates are clamped to the frame viewport.

## 9. Deferrals / conscious removals

- **Popup mini-chat removed** in favor of Agent Mode's chat (spec: CHAT mode
  is the screen-seeing agent). The `agent_chat` API and mirror stay shared.
- **Pop-up typing controllers removed from the popup shell** — the assistive
  typing engine (background `launchToDoc` etc.) is unchanged; it is no longer
  surfaced by the popup launcher (spec's two options only). Reachable again
  later from a settings surface if the owner wants it.
- **Recording** ("Record Lecture Audio" button) — removed from the popup; the
  recorder page (`recorder.html`) still exists untouched.
- **Popup tab dropdown removed** — option ① is scoped to the focused tab
  (exact spec wording); "some other tab" scraping is still available through
  the agent chat instruction path.
- Auto-capture on "See screen" depends on the browser allowing
  `tabCapture.getMediaStreamId` without a gesture; when refused the page logs
  the reason and the user clicks "Select tab" (same one-click flow).
- Notification-based approvals require the new `notifications` permission;
  if notifications are unavailable the broker deny-defaults and the agent
  page logs it.
