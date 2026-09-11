# B5 — My Agent page: design teardown + next-Stitch regeneration spec

Mission: Helpotron OS redesign (Stitch-sourced). Role: B5, read-only.
Pages owned: `web/src/components/MyAgentView.jsx` (1,941 lines, read fully) + `web/src/components/AgentConfigsSidebar.jsx` (1,072 lines, read fully).
Stitch source of truth: `stitch_helpotron_study_os_redesign/helpotron_my_agent_v3_1/` + `v3_2` (code.html + screen.png, 444/436 lines; the two exports are near-identical — v3_2 differs only by avatar image).
Tokens: M3 role classes in `web/src/index.css` (`@theme inline` at line 1580; fonts at 1679–1685; `font-label-caps`/`font-tabular-stat` = JetBrains Mono, `title-md`/`body-*` = Inter, `headline-lg` = Hanken Grotesk). Icons: lucide-react only. No AI-generated images (Stitch's `Alex R.` portrait is an aida-public AI render — must not survive).

---

## PART 1 — CATALOG: what the page is, block by block

### 1.1 `MyAgentView.jsx` — a single screen, 4 stacked zones

```
┌─ Zone A: PAGE HEADER CARD (bg-surface-container-lowest, rounded-3xl, p-6, shadow-sm)
│    left:  AvatarUpload (agent avatar, 56px, rounded-2xl; hover Camera chip; uploads PNG/JPG)
│           inline-edit agent NAME input (bg-surface-container-low, rounded-xl, min-w 120 max 240,
│           saves onBlur/Enter)
│           ① READY chip  — font-label-caps 11px, bg-primary/15 text-primary, pulsing dot
│           ② EFFORT chip — "⚡ 5/10 (Balanced)" — bg-surface-container-high, READ-ONLY
│           tagline "Ask anything, draft papers, transcribe lectures." (line-clamp-2, text-xs)
│    right: ③ ACTIVE IDENTITY PILL — bg-secondary-container/20, emoji + name + ChevronDown;
│           HIDDEN ENTIRELY when no identity is active (rendered only when currentIdentity != null)
│           ④ MODE segmented control — bg-surface-container-low p-1 rounded-2xl, 3 buttons:
│              Manual (Shield, blue), Auto-Pilot (ShieldCheck, emerald), YOLO (Flame, amber);
│              active = bg-surface-container-lowest + text-primary + shadow-sm
│           ⑤ EDU MODE — button role="switch" aria-checked, GraduationCap + mini knob switch
│           ⑥ CONFIGS (N) — Settings2 icon + count = identities+skills+memory+files
│           ⑦ NEW CHAT — primary filled button (Plus)
│
├─ Zone B: PENDING PERMISSION BANNER (only when action pending; @100% width card)
│    border-l-4 sem-amber, "⚠️ ACTION REQUIRED" caps + mono (action_type) + "Assignment #N"
│    description body; buttons Review / Deny / Approve Action (44px) + "Always auto-approve {type}" checkbox
│
├─ Zone C: WORKSPACE GRID  h-[calc(100vh-14rem)] min-h-[580px]
│   C1 THREADS RAIL 240px (bg-surface-container-low, rounded-2xl): "Conversations" + count,
│      Pinned group, rows (emoji 📌/💬, title truncate, mono time, active dot),
│      hover-only row actions: rename (inline input), pin, delete; empty state:
│      "No previous chats. Start a new topic!"
│      Bottom (border-t): "MODEL EFFORT" label + mono readout + native range input 1–10 (accent-primary)
│   C2 CHAT CANVAS (bg-surface-container-lowest, rounded-2xl):
│      header: Cpu avatar circle 44px, title = thread title | "Chat with {agentName}",
│      subtitle "Co-pilot Active"
│      right: ⑧ MODE segmented control AGAIN (hidden below sm — mobile gets none here, only Zone A's)
│             ⑨ COMPACT button (RefreshCw; spins + "Compacting…" while running)
│      stream: assignment bubbles (EVENT_META icon/label, ⑩ CONSTANT "COMPLETED" chip w/ sem-green dot,
│              headline, detail, buttons Launch to Doc / Open Assignment or View in Dashboard)
│              user bubbles (right, rounded-3xl rounded-tr-sm, max-w 85/70%, copy action)
│              agent bubbles (left, Cpu 44px avatar, copy / mic "listen" / Launch to Doc — all 44px targets)
│              ⑪ THINKING BUBBLE: minimized = pill "💭 Thinking…" + ChevronDown;
│                 expanded = card: "💭 Model Reasoning" + mono "Live" pulse + ChevronUp;
│                 mono 11px body, max-h-64, auto-scroll w/ user-scrolled guard, Escape = minimize;
│                 renders only if thinking.visible && thinking.text
│              ⑫ BUSY ROW "…is thinking & generating…" — pulsing card with RefreshCw spin
│      composer: rounded-FULL pill input row (paperclip, mic — error+animate-pulse while recording,
│              autosize textarea Enter=send/Shift+Enter=newline max-h 240, round primary ArrowUp 44px,
│              disabled 30% when empty/busy); disclaimer line below
│   C3 (xl and configsOpen only): docked AgentConfigsSidebar, fixed 440px column, non-modal
│
├─ Zone D (below xl, configsOpen): modal slide-over drawer — fixed inset-0 z-50, scrim bg-black/60
│   blur, panel w-full max-w-lg h-full bg-surface-container-low, Escape closes, xl:hidden
│
└─ Overlays: File viewer modal, LaunchToDocModal, PermissionModal (full approving popup, bottom-sheet
    on mobile per its own Stitch source), zero confirm dialogs anywhere
```

### 1.2 `AgentConfigsSidebar.jsx` — the "Agent Configurations" panel

Header: `SlidersHorizontal` + "Agent Configurations" (caps) + X collapse.
Tabs (`role=tablist`): **Identities** (UserIcon) · **Skills** (Cpu) · **Memories** (Database) · **Rules & Files** (FileText) — each with count pill, min-h-44.

- **TAB 1 Identities**: "Agent Display Name" card first (input + Save Name button + transient "✓ Saved").
  Then `h3` **"Agent Identities"** + "Add Identity" button. Empty state: 🎭 dashed card "No custom identities yet" + "＋ Create Persona". Identity rows: expander chevron, emoji, name, "ACTIVE" pill, **Select/Active** button, edit (Edit3), delete (Trash2 — NO confirm). Expanded: mono "System Instructions" block + "Edit Identity".
- **TAB 2 Skills**: h3 "Skills & Capabilities" + Add Skill. Empty: ⚡ card. Rows: chevron, emoji, name, **Select** (injects promptTemplate into composer), **Enable/Enabled** toggle, edit, delete. Expanded: mono "Prompt Blueprint".
- **TAB 3 Memories**: h3 "Permanent Memories", add input + plus button (Enter works). Empty: dashed line. Rows: chevron, 🧠, truncated text, `timeAgo`, **Select** (loads text into composer), edit, delete; expanded full memory + Edit; inline textarea edit mode w/ Cancel/Save Memory.
- **TAB 4 Rules & Files**: h3 "Rules, Automations & Files" + kind `<select>` (Rule/Skill/Automation/Personality) + Upload button. Empty line. Rows: FileText icon, name + kind badge, byte size, **View** / **Select** (fetches content → composer) / delete; expanded: kind/size + "Open Full Viewer".
- **Modals (all fixed-centered, max-w-md, black/70 blur scrim)**: Create Identity (emoji, name, instructions textarea), Create Skill (emoji, name, prompt blueprint), Edit Identity, Edit Skill. None use `role=dialog`/focus trap.

Data wiring: identities/skills persisted in **localStorage only** (`helpotron.agent.custom_identities`, `.custom_skills`, `.active_identity_id`, `.active_skill_ids`); memory/files via backend API; identity "active" check is a match on `(ai.personality === item.persona && ai.instructions === item.instructions)` OR activeIdentityId. Adding an identity auto-selects it; deleting the active one resets personality to `Coach` via chat message. `DEFAULT_IDENTITIES = []` / `DEFAULT_SKILLS = []` — that is, **no presets ship**; the sidebar is empty-until-created.

### 1.3 Stitch v3 export (helpotron_my_agent_v3_1/2) — what the current Stitch screens actually show

Full-bleed chat canvas. Shell: desktop side nav (w-64, "Helpotron OS / Premium Co-pilot", "New Study Session" primary button, nav items w/ `border-r-4 border-primary` active state + `active:translate-x-1`), mobile top bar (logo + "Credits: 1,240" + account) and mobile bottom nav (Home/Agent/Insights/History). Main: h-16 chat header (avatar chip, **thread title as the headline**, "Co-pilot Active", segmented **Manual / Auto / Yolo** — Yolo hover uses `hover:bg-error-container`!). Messages: centered "Session Started: …" pill; right user bubble; **tool-call progress cards** ("Generating Study Guide" + `alt Completed` chip / "Drafting Quiz Questions" + `alt Running` chip + progress bar + mini attachment card "2 Pages • Study Notes" with open_in_new); agent reply in `.glass-ai` (blur + 0.7 alpha surface); inline **permission card** ("ACTION REQUIRED" + tertiary left border + "Save Quiz to Study Sets?" + description w/ backticked db name + **Deny / Approve Action**); text-only **typing indicator** (3 pulsing dots); docked bottom composer in `absolute bottom-0` glass bar (add_circle, autosize textarea, ArrowUp circle) + disclaimer; `pb-safe` iOS handling.

**What Stitch v3 has that the app does NOT**: tool-call cards with Running/Completed chips + progress bar, inline permission card in the flow, centered session-start pill, typing-dot indicator, glass bubble style, thread title as chat headline.
**What the app has that Stitch v3 OMITS entirely**: threads rail, effort slider, identities configs + identity pill, skills, memories, files, mic, name edit, Ready chip, Edu Mode, New Chat, Composer compact, permission banner-with-buttons, assignment bubbles w/ Launch to Doc, thinking bubble, copy/speak per message. Stitch v3 is chat-only.

---

## PART 2 — CONCRETE PROBLEMS (this is a top-3-felt page)

### 2.1 Crowding / duplication (worst offenders)
1. **TWO mode selectors** (Zone A ④ and chat-header ⑧ — `hidden sm:flex`). Same state, same styles, rendered twice on desktop; mobile only gets the top-bar copy. Duplicated control = double the width budget, double the confusion when someone asks "why is it here and here?".
2. **Effort appears 3×**: read-only chip in page header ("⚡ 5/10 (Balanced)"), the actual slider buried at the bottom of the threads rail ("Model Effort" + range), and the same number as a secondary chip. The chip looks clickable (its neighbors are buttons) but isn't. Nothing explains 1–10 ↔ backend 1–1000 or Low/Balanced/High vs token cost.
3. **Page header card carries 6–7 affordances** (avatar, editable name, Ready, effort, identity pill, mode, Edu + knob, Configs counter, New Chat). At 1024–1366px the right cluster wraps to a second row and the h-calc workspace shrinks. The `flex-wrap` controls sit beside a `line-clamp-2` growing name — the identity pill `truncate max-w-[140px]` makes room by chopping identity names.
4. **`Configs (N)` counter is an opaque gateway.** The number = identities+skills+memories+files, so "Configs (7)" tells nothing about what's inside; new users then hit an EMPTY identities tab (no presets export) — buried discovery for the page's most-persistent surface.
5. **Identity pill appears only when an identity exists** (conditionally null-rendered). Zero-identity users see the slot silently vanish — inconsistent affordance; and clicking the pill opens the whole 4-tab panel rather than a quick switcher menu.

### 2.2 Semantics that actually mislead
6. **"COMPLETED" chip is hard-coded on EVERY assignment bubble** (lines 1656–1660) — a NEW ASSIGNMENT or DUE SOON event also shows a green-dot "Completed". It is genuinely wrong 2/3 of the time (eventType is only in the header label). Everyone reading this page sees green "Completed" next to a ⏰ due-soon bubble.
7. **"Ready"** (pulsing, primary) vs **"Co-pilot Active"** vs **"…is thinking & generating…"** — three overlapping liveness words; Ready never changes state (no Busy/Degraded/Offline variant wired in).
8. **Errors masquerade as assistant chat bubbles.** `sendMessage` catch → `pushAssistant("⚠️ The agent couldn't reach the backend right now (...)")`; every failure (net, 401, server) becomes a permanent transcript row with no retry affordance and no distinction from a real answer. Same for compact/rollback/thread failures.
9. **Permission UX = two competing surfaces at once.** Pending banner (Zone B) AND PermissionModal auto-popup (on response, or 12s poll on reload). On desktop both can be visible simultaneously; mobile gets banner above the grid plus bottom-sheet modal. The banner is a second implementation of the same decision (Deny/Approve + always-approve checkbox), so decisions can split across surfaces; the modal has 4 decisions (approve / always-approve / deny / write-something-else) the banner doesn't.
10. **Thinking bubble** — only when model supports reasoning AND text non-empty; has no stop/abort affordance, no control to dismiss permanently, and `Live` pulse + mono body compete with the busy row's separate liveness message (both can show at once).

### 2.3 Machinery problems
11. **`promptMinimized` is dead state** — declared (line 185, "collapse the prompt composer to a slim bar (header toggle)") and never rendered anywhere. Intent (operator 08-28) half-landed: there is no composer-collapse control in the header.
12. **Thread row nests an `<input>` inside a `<button>`** (rename input inside the row button, lines 1227–1249) — invalid HTML, broken keyboard semantics, click-stopPropagation hacks.
13. **No `aria-live` on the message stream / thinking body**, though Stitch's rationale doc (Deliverable 5) promises `aria-live` on streaming chat. Streaming success is only visually marked; `ThinkingBubble` has `tabIndex` but no live region.
14. **Grid arithmetic**: `h-[calc(100vh-14rem)] min-h-[580px]` + 3 columns (240 + 1fr + 440) at 1280–1450px leaves the chat ~500–630px wide while the configs column is a full management panel; on 768px-tall laptops the 580px min forces page scroll. The drawer-scrim below xl covers the exact chat the user came to (mitigated by auto-close, but the 09-01 QA comment accepts the modal as "correct" only below xl).
15. **Everything is English-cap-labels in a 12–14px mono font** — readable but dense; three different label grammars ("Agent Configurations" / "Agent Identities" / "Skills & Capabilities" / "Permanent Memories" / "Rules, Automations & Files" / tab label "Rules & Files").

### 2.4 Gaps vs Stitch v3 design language
16. Stitch's tool-call cards (Running + progress, Completed + attachment) have NO client-surface in the app: the stream only emits `reasoning` / `delta` / `done` (api.js 405–483), so "tool/action states" today = assignment bubbles + busy row + permission surfaces. The regeneration spec below treats tool cards as a **backend-gated enhancement** (new `tool`/`action` SSE event), not an assumption.
17. Stitch's inline permission card in the flow is *better* than the app's banner (contextual to the reply that requested it), but the app intentionally moved to the full modal for the 4-decision contract — the two designs must merge, not coexist.
18. Stitch's `Alex R.` avatar is an AI-generated portrait (aida-public URL) — violates the no-AI-images rule; initiials-avatar or real upload instead, in the app shell (not this page).

---

## PART 3 — REGENERATION SPEC (next Stitch iteration, "My Agent v4")

Design intent: **chat-first, configuration-second, everything reachable in ≤2 taps.** The page the user "feels" at all times = the conversation; identity/mode/effort/configs live as first-class, always-visible chrome, never behind a counting block.

### 3.1 Layout (desktop ≥ md, shell-owned nav excluded — the page assumes AppShell's side nav)

```
┌ PAGE (space-y-4, within AppShell main; no h-calc on the page — the window owns height)
│
│ ┌ PAGE HEADER (one row, rounded-3xl surface-container-lowest, 14px inner padding)
│ │  [AvatarUpload 56px] [Name (inline edit) + READY status word + model badge (B7 slot)]……[EFFORT GLOBAL chip (link→rail)] [Convs btn] [NEW CHAT primary]
│ │
│ └ WORKSPACE  grid lg:grid-cols-[240px_1fr]  xl:grid-cols-[240px_1fr_380px]   (no min-h; height = window-relative)
│    ├ RAIL 240px: Conversations + effort slider REHOUSED HERE as "session effort" (kept, better spacing) — NOT duplicated elsewhere
│    ├ CANVAS (minmax 0,1fr): header holds THE single mode selector (always visible, incl. mobile) + Compact + "Current model" name (B7)
│    └ CONFIGS 380px at xl only, non-modal (unchanged concept); below xl → bottom-sheet or right drawer
└ OVERLAYS: PermissionModal (approved contract), LaunchToDocModal, FileViewer — unchanged
```

Key decisions:
- **One mode selector.** Put it in the **chat header** (the place users "feel" permission scope: next to the reply that is about to act). Delete Zone A's copy. Labels **MANUAL / AUTO-PILOT / YOLO** (task naming beats Stitch's "Auto"). YOLO keeps the amber treatment (app) but adopts Stitch's error-hover hint as a `hover:bg-error-container/20` on the YOLO segment to telegraph risk.
- **Header simplification**: avatar + editable name + one status word + model/token slot (B7) + Configs gear + New Chat. Move **identity pill INTO the chat header** (next to the mode control) — that's where "who am I talking to" belongs — and give it a **chevron-expand quick-switcher** (list of identities inline, no need to open the panel). Delete the pill from the page header; delete the read-only effort chip from the page header (effort reads live near the rail slider + B7 model pool).
- **Edu Mode** (school-gate) stays in the page header right edge as a compact icon-only switch labeled `School mode` — actual switch-in-label is (copy) simpler: a lone toggle w/ GraduationCap tooltip.
- **Session pill**: adopt Stitch's centered "Session Started: …" pill as the empty/idle lead-in only (replaces the hard-coded intro line on empty threads), using the thread title or a "New session" phrase.

### 3.2 Component inventory (each with M3 tokens from index.css)

| Component | Tokens / classes (index.css) | States |
|---|---|---|
| HEADER CARD `AgentHeader` | `bg-surface-container-lowest rounded-3xl border-outline-variant/30 p-4 sm:p-6` | default; busy (name field disabled); offline (status dot `bg-error`) |
| STATUS WORD `ReadyStatus` | `font-label-caps text-label-caps`; `bg-primary/15 text-primary` + pulsing dot; variants: Ready (`bg-sem-green` dot solid — Stitch's completed style), Busy (`bg-sem-amber` + pulse), Offline (`bg-error/15 text-error`) | ready / busy / offline |
| AVATAR+NAME `AgentName` | unchanged; blur-or-enter commit; | idle / editing focus / saved ✓ (1.2s, port the sidebar feedback) |
| MODE SEGMENT `ModeControl` | single instance; `bg-surface-container-low p-1 rounded-2xl border`; active `bg-surface-container-lowest text-primary shadow-sm`; Manual `text-blue-300` icon / Auto `emerald` / YOLO `amber` + `hover:bg-error-container/20`; a11y `role=radiogroup` + `aria-checked` | inactive / active / switching (brief disabled + pulsing) |
| IDENTITY PILL+SWITCHER `IdentitySwitch` | `bg-secondary-container/20 text-secondary border-secondary/30` + ChevronDown; expanded panel = identity list + "+ New identity" (opens configs panel on the Identities tab) | none-selected → "🐞 Coach" default pill (never hidden); open; active |
| CONFIGS GEAR `ConfigsButton` | gear + panel title; **label becomes "Agent Settings"** (opener), counter dropped or hovered | closed / open |
| THREADS RAIL `ThreadRail` | keep; move effort slider under its own caption "SESSION EFFORT"; add `aria-current` | empty ("Start a new topic"); pinned group; active row; renaming (input **outside** the row button — fix the nesting bug) |
| CHAT HEADER `ChatHeader` | avatar 44px, title truncate (thread title first, else "Chat with {name}"), subtitle = status word; right = IdentitySwitch + ModeControl + Compact | default; compacting (spinner) |
| MESSAGE `ChatBubble` | user: `bg-surface-container rounded-3xl rounded-tr-sm max-w-[85%]/[70%]`; agent: `bg-surface-container-lowest rounded-2xl rounded-tl-sm` (drop glass on text bubbles — keep glass only for the composer bar; AA contrast wins); actions copy/speak/launch 44px | user / agent / error (`bg-error-container/20` `text-error` + "Retry" button) / streaming (cursor or typing dots) |
| TOOL-ACTION CARD `ActionCard` **backend-gated** | port Stitch card 1:1: icon + caps label, chip `Running` (secondary w/ pulse) vs `Completed` (green dot) vs `Failed` (`bg-error/15 text-error`), slim progress bar (pulse while running), optional attach chip (`bg-secondary/10` icon + "2 Pages · Study Notes") | needs new SSE `tool`/`action` event from `api.js agentChatStream` — spec-only, do not fabricate |
| ASSIGNMENT BUBBLE `AssignmentEventBubble` | **fix the chip**: map eventType → chip (`created`→`New`, `due`→`Due soon` amber, `submitted`→`Completed` green) | new / due / submitted; buttons unchanged |
| THINKING BUBBLE `ThinkingBubble` | keep card + minimize pill; add a Stop (✕) affordance that aborts the stream request; wrap body in `aria-live=polite`; show only when model flags reasoning | hidden / minimized / expanded / scrolled |
| PERMISSION SURFACE `PermissionInline + Modal` | merge: keep ONE decision surface — the full modal (4-decision contract). The pre-modal inline at 12s poll remains ONLY as a non-blocking notice ("1 action waiting — Review") linking to the modal. Delete the Zone B button-banner. | none / notice / modal open (approve / always approve / deny / edit-request) / error strip |
| COMPOSER `Composer` | pill shape per Stitch (`rounded-3xl` companion instead of pure circle for attach+mic+input, keep circular send); glassy bar `bg-surface-container-lowest/90 backdrop-blur`; `pb-safe`; mic hidden on unsupported browsers (no `alert()` fallback → tooltip "Voice unsupported") | idle / dictating (error pulse) / sending (send disabled) / minimized (implement the half-landed `promptMinimized`: header toggle collapses composer to a slim "Message …" affordance) |

### 3.3 State matrix (the full dictionary the next iteration must render)

| State | Where | Visual |
|---|---|---|
| Empty configs | Configs panel | per-tab dashed empty cards (existing, keep) |
| No identities | Identity pill | default "Coach" pill, never hidden |
| Chat idle | stream | session-start pill + intro line |
| Chat streaming | stream | typing dots (Stitch) until first `delta`, then live words |
| Thinking available | between user send and reply | thinking bubble (live) |
| Thinking minimized | any time during | 💭 pill |
| Mode toggled | chat header | control flips; confirmation = inline toast "AUTO-PILOT on" (keep as a toast, NOT a transcript bubble — it currently spams history with "⚙️ Execution mode updated") |
| Effort change | rail slider | debounced (400ms) → chip updates; toast-free |
| Tool running / done / failed | ActionCard | Running chip+pulse / Completed / Failed+retry |
| Permission requested | modal | busy→error strip per modal's own states |
| Permission pending across reload | notice + modal auto-open once | seen/dismissed keys (existing refs, keep) |
| Compaction | header Compact | spinner label |
| Error (send/compact/thread/rollback) | stream | error bubble + Retry (del from transcript on retry) — no more fake assistant text |
| Offline / demo | header status + composer | "Offline" status; demo stays labeled |

### 3.4 Mobile (< md)

- **Chat is the page.** Header compresses: avatar 40px + name + status dot; mode/identity compacted into a **single "controls" menu button** (Sliders2) in chat header → bottom sheet with MANUAL/AUTO-PILOT/YOLO + identity quick-switcher + effort slider + link to Agent Settings.
- **Configs access on phone**: remove the full-screen drawer (max-w-lg ≈ full 390px now, covering chat). New rule — **configs opens as a bottom sheet (max-h 82dvh, rounded-t-3xl, drag-to-dismiss + Escape/back)** with the same 4 tabs; the chat stays peeking behind the scrim. This is the one structural mobile change requested.
- Rail: conversations become a **back-button stack** (chat header left shows ‹ Conversations) or a `pt` mobile drawer from the header — spec: top bar gains a menu (☰ → "Conversations" list) rather than a permanent 240px column.
- Permission modal = bottom sheet (already its contract), notice → one-line sticky above composer.
- Composer: mic button coexists (Web Speech works on Chrome Android; Safari iOS unsupported → mic hidden), `pb-safe`.

### 3.5 Where subject/assignment-level agent overrides will surface (future; B7 owns the model)

Placement proposals (flag only — no code):
1. **Chat header, right of mode**: a second pill/tier `Scope: This assignment` (vs "Everything") — the exact spot the user "feels" who the instructions were written for, because it's beside the send.
2. **IdentitySwitch quick panel**: group header "Assignment persona (if set) / Default persona" so per-assignment personas are visible exactly where identity is chosen; the configs panel's Identities tab additionally gains a "Per-assignment overrides" group with a + Add per-assignment link (goes to AssignmentCardDashboard which B-sibling owns).
3. **Composer placeholder**: at send time a per-assignment override can tint the "Message your assistant…" placeholder ("Asking on Biology 101's persona"). Cheap, discoverable, no layout change.
4. **Model badge in chat header + B7's model pool**: the effort chip readout (which B7 supplies from the model registry rather than the 1–10 slider) goes where the effort text currently displays — single source: rail slider = coarse effort; header = resolved model name.
5. Per-assignment configs must NOT enter the assignment-bubble card (already 3 buttons) — keep overrides off that card; they live in the two surfaces above.

### 3.6 Explicit NIX list (do not carry into v4)

- Duplicate mode selector; read-only effort chip in page header; "Configs (7)" counter; conditional null-identity pill; hard-coded "Completed" on event bubbles; banner-with-buttons + modal duplicated permission surfaces; transcript pollution from mode/error confirmation messages; AI-generated portrait avatars; inline input inside thread-row button; unused `promptMinimized` state left dead (either implemented or deleted); full-screen configs drawer on mobile.

### 3.7 Honesty notes / grounding
- No invented features: tool-call cards, per-assignment overrides, and stream `tool` events are marked backend-gated (current SSE = `reasoning`/`delta`/`done` only in `web/src/api.js`).
- Everything else in this spec exists in the current code with the exact class names cited from `index.css` tokens or the two reviewed components; delete/merge guidance refers to real lines (mode duplicated: MyAgentView 1404–1423 vs 1586–1605; effort tripled: 1378–1380, 1550–1566; chip bug: 1656–1660; dead promptMinimized: 185; nested input: 1227–1249; rail empty state: 1535–1539).
