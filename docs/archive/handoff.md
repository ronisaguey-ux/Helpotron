# Handoff — Opus Worker Campaign: Helpotron fixing sweep (Aug 28–29, 2026)

> Compiled 2026-08-29 ~20:15 EDT from the worker's session transcripts + git history.
> Worker: tmux `claude_worker`, pid 322238, "You are Opus working on helpotron" (spawned Aug 28 15:54 EDT).
> It ran out of claude.ai usage and is idle at its prompt ("done 2:11 AM", history intact, 6 monitors running).

## TL;DR

The Opus lane ran a **three-phase fixing campaign** on Helpotron and its main body of work is
**DONE and COMMITTED** (PRs #19, #20 and related merges are in git history on the current branch).
What remains is a short list of follow-up fixes — the most important being an **infra-level
HTTPS redirect** that is the root cause of phones "logging in then bouncing" over plain HTTP.

## Campaign structure

- **Phase 1 (Aug 28 15:54→16:18)** — Assignment bubbles: chat button + ghost-assignment hardening
  (transcript: subagent `a0b508ea`).
- **Phase 2 (Aug 28 23:18 → Aug 29 ~01:46)** — "the website is completely broken on mobile":
  a **10-agent squad (A1–A10 + OPUS lead)** audited and fixed the SPA across every surface,
  two passes (initial sweep + fix, then re-verify), finishing with a **24/24 green walk**
  (12 views × 390px/360px × Chromium/WebKit).
- **Phase 3 (Aug 29 ~01:46→02:11, "Batch 3")** — MonitorsView overflow guard + persistent uvicorn
  access logging (`server/access_log.py`, new).
- Orbit: dump-delete UX fix (`fix/dump-delete` branch), extension chat-agent fixes
  (`server/agent_prompt.py`, `server/routes_overlord.py`), browser-extension scrape tool.

## Committed (do NOT redo)

| commit | what |
|---|---|
| `66d5bce` (#19) | `fix(mobile): responsive sweep — auth modals, topbar/overlays, charts, perf` — the A-squad fixes |
| `301ae1a` (#20) | `fix(monitors)+log: batch-3 leftovers — MonitorsView overflow, persistent uvicorn access logs` |
| `4728908` | `overlay: bring working tree into repo — audit wave-1 fixes (security headers, per-IP throttle, auth gating, new assignment UI, dump delete UX, code split), extension scrape tool, single-branch layout` |
| `d50e5f0`, `de82f89` | nuclear-sweep merges |
| `fix/dump-delete` | branch commit (merged upstream) |

All five batch-3 files are tracked & committed: `web/src/components/MonitorsView.jsx`,
`server/access_log.py`, `server/main.py`, `.gitignore`, `data/logs/.gitkeep`.
**Verified live:** persistent logging is ACTIVE — `data/logs/access.log` is 1.5MB+ and growing;
`server/main.py:119-122,173` wires `access_log.install()` (log dir `data/logs/`, rotating 10MB×10,
`HELPOTRON_LOG_DIR` override, never fatal).

## What was found & fixed (summary, key items per lane)

### Assignment bubbles (Phase 1)
- **Chat button** on every Level-2 assignment card → reuses the existing per-assignment team chat
  (`AssignmentCard.onChat` → `AssignmentCardDashboard.handleAssignmentChat` → `focus_chat` effect
  in `AssignmentDetailView`; same `api.agentChat*` endpoints/thread keys as MyAgentView).
- **Ghost assignment hardening**: all three creation paths ship unconstrained title/date
  (`AssignmentIn.title` in `server/assignments.py`, `overlord_agent` `"New Assignment"` fallback,
  `canvas_sync:99` `"Untitled Assignment"`) — frontend now renders honest fallbacks
  (`Assignment #? · Due: No deadline`), never an empty shell. No ghost row existed in the DB.

### Mobile squad (Phase 2) — headline results
- **A1 Landing/Bento/Beams**: bento grid clipped at md+ (768–1023px) **fixed**; hero jank —
  BackgroundBeams = 50 animated SVG gradients ≈50ms/frame at 360px@4× throttle (~60% of frame
  budget, ~12–18fps) **fixed**; header `backdrop-blur-xl` ~4.8ms/frame repaint **fixed**;
  MovingBorder per-frame `getTotalLength()` **fixed**; `flex` on `<td>` in CreditLeaderboard
  (invalid, WebKit breaks out of table layout) **fixed**.
- **A2 Auth flow** (WebKit/iOS-critical): consent gate **dead in WebKit** — pointer-events gate
  lived inside CSS keyframes; WebKit's animation clock stalls → modal stayed `pointer-events:none`
  forever (30s timeouts). Fixed: React-state-driven `peReady` armed by `onAnimationEnd` +
  clock-independent 4.5s fallback, in all owned modals. Auth modal **top-clipped** on small phones
  (`items-center` + scrollable backdrop → `m-auto`, top 18@390 / ~14@360). **Recovery modal
  trapped inside the settings card** — `section.clean-card` `backdrop-filter` becomes the
  containing block for `fixed inset-0` → fixed with `createPortal(..., document.body)`.
  iOS focus auto-zoom (`text-base` ≥17.6px on all owned inputs, `inputMode`/`autoComplete` on TOTP),
  auto-opened auth modal tap-through + submit below fold fixed.
- **A3 Shell/topbar — THE viewport zoom-out root cause**: 390px iPhone rendered at ~0.72× because
  the topbar flex row's min-content was **exactly 544px** — a **layout-viewport ShrinkToFit
  min-content expansion**, NOT `overflow-x` (`body{overflow-x:hidden}` only clipped it).
  Three independent proofs (remove header → unzoom; clamp row to 390 → rowMin 544; child pie:
  hamburger 44 + brand 44 + back/fwd 90 + search + ml-auto credits/greeting group 278).
  **Fixed** — `AppShell.jsx:421-462` (back/fwd `hidden sm:flex`, search `flex-1 min-w-0 max-w-md`,
  label+Kbd `hidden sm:block`, tokens hidden on phones). Post-fix: true-390 across loads.
- **A4 Assignments**: `NewAssignmentModal` POST `'/assignments'` → `'/api/assignments'`
  (hard 404 through the vite proxy — **every assignment create failed in the built app**);
  modal backdrop `flex` + `m-auto`; `break-words` in `AssignmentDumpView` (long filename
  measured 964px forcing modal blowout) + `AssignmentDetailView` (prompt/rubric/chat bubbles).
  Blocked finding — **server 500 on empty-prompt create** (`upsert_assignment` skip-guard +
  `database.py` prompt NOT NULL) → **NOW FIXED in current tree** (`server/main.py:1034-1038`).
- **A5 Extension install**: "Connecting to:" span `min-w-0 break-all` (single-token serverUrl gave
  a 401px floor at 360). Also upgraded the box's sweep probe with a **`maskedMaxRight` detector**
  (`AppShell`'s `overflow-x-clip` was hiding element overflow from doc-width checks).
- **A6 Credits/Datalake/Scoped settings**: CreditsPricingDashboard header cards re-flow
  (`flex-col sm:flex-row`, `min-w-0`, `whitespace-nowrap`; global coarse-pointer 44px checkbox
  inflation worked around locally); DataLakeView valuation header + history table
  (`min-w-[640px]` + `overflow-x-auto`); ScopedSetting pencil/trash `opacity-0 group-hover:`
  → visible off-hover on touch.
- **A7 Charts + Control Center audit (investigate-only)**: `AnalyticsDashboard` area chart
  margins/ticks + **`ChartTooltip` prop bug** (`rowsRenderer=` vs destructured `rows` — tooltip
  showed raw `time_minutes` dataKey); `use-chart-interaction` tap-pin tooltip died 100–350ms after
  lift — browser replays `mousedown`/`mouseleave` after taps → 600ms compat guards;
  `touchAction:"none"` was trapping whole-page scroll → `pan-y`. **Control Center audit: the
  admin→user notice feature WORKS** (end-to-end proven). See open items for its one patch.
- **A8 Popup/overlay/flash**: **AdminNoticePopup re-pops the same notice after dismissal** (20s
  poll closes over `visible` — re-enqueues the id; a notice up >20s appears non-dismissable) —
  fixed; tap targets <40px (28×28 X, 66×32 Got-it — Apple HIG 44pt) — fixed; skip-link z-50
  covered by popup z-9999 (App.jsx-owned, see open items); AssignmentDumpView toast offscreen at
  320px + overlapping the bottom tab bar (z-[70] vs z-40) — see open items.
- **A9 Global layer** (`index.css`, live and committed): safe-area tokens `env(safe-area-inset-*)`
  (index.css:826); **16px focus guard** `:is(input,select,textarea):not([type=range]):not([type=hidden])
  { font-size: max(16px,1em)!important }` (855-859 — prevents iOS auto-zoom); global `touch-action`
  (866-868); print ink pass (887-899); `@media (pointer:coarse)` 44px tap targets with
  checkbox/radio exception (135-147). Verified: desktop negative-control inert (17.6px natural),
  390/360 auth password 15.4→17.6px.
- **A10 Real-device fidelity — HEADLINE finding (still OPEN, see items)**:
  **login-completes-then-bounces on plain HTTP**. Wire capture:
  `POST /api/login → 200` with `Set-Cookie=helpotron_session=…; Secure` → `GET /api/me` with NO
  cookie → 401 → app flips to signedOut. WebKit (every real iPhone) **refuses Secure cookies over
  http://**; Chromium grants `localhost` a trust exemption, masking the bug in every chromium
  probe. Entry points: https tunnel works; `http://` host names and LAN/preview = bounce.
  Decided at `server/main.py:663-671` (`secure=config.production_mode or request.url.is_secure` —
  uvicorn runs **without `--proxy-headers`** so `is_secure` is always False) and
  `server/csrf.py:43-49`. Client amplifier: `web/src/App.jsx:282-289` (immediate `checkSession()`,
  401 fallthrough → signedOut, no cookie-store race tolerance). Also fixed the box's Playwright
  **webkit** (missing `libwoff2dec.so.1.0.2` + gstreamer libs — copied from the .debs into
  `~/.cache/ms-playwright/webkit-2248/minibrowser-wpe/lib`; debs kept in `helpotron_audit/tmp_pwlibs/`).
- **OPUS lead final verification**: 24/24 green (12 views × 390/360 × Chromium/WebKit):
  `docW == innerW` everywhere, `topbarClipped=false`; bottom nav footer clears; ⌘K palette fits;
  bell dropdown fits; WebKit hooks crash fixed; drawer balance chip (AppShell.jsx L608-626)
  navigates to Credits. QA account `mobile_qa_opus` cleaned.

## Remaining / open items (priority order)

1. **A10 fix #1 — force HTTPS at the tunnel (TOP; kills the real-device login bounce).**
   Cloudflare zone → SSL/TLS → *Always Use HTTPS*, or a cloudflared rule:
   `if {http.host == "helpotron.dpdns.org" && !https} { rewrite_https! }`. Infra config, not code.
   Checkpoint: GET `http://helpotron.dpdns.org` must redirect/refuse, never serve 200.
   (Note: as of 20:10 EDT a plain-http GET returned **no headers** — may already be failing, but no
   redirect was proven. Verify first.)
2. **A10 fix #2 (server, only correct together with #1)** — conditional `secure`:
   `server/main.py:663-671` use `request.url.is_secure` OR run uvicorn with `--proxy-headers`;
   same for `server/csrf.py:43-49`. Requires backend restart + tunnel touch → confirm with the
   user before touching (campaign rule: no backend/cloudflared restarts without approval).
   Optional #3: `App.jsx:282-289` — tolerate a brief cookie-store race before flipping signedOut.
3. **A7 Control Center patch #1 — header wraps into a 4-line column at 390**:
   `AdminAdvancedDashboard.jsx:412-416` — `h2` `text-xl` → `text-lg sm:text-xl`, wrap div gets
   `min-w-0` (chip ~230px + chevron in a 364px card squeezes the title). **Re-check line numbers
   first** — AppShell.jsx/AdminAgentChat.jsx were modified at 00:59 during the audit.
4. **A8 leftovers — verify/fix if still present**: skip-link (z-50, `fixed top-4 left-4`) fully
   covered by AdminNoticePopup (z-9999) at 390/360/320 — popup owns z-order, skip-link is in
   App.jsx; AssignmentDumpView toast: `fixed bottom-6 right-6 z-[70] max-w-xs` goes −24px
   offscreen at 320 and overlaps the `md:hidden fixed bottom-0 z-40` tab bar — needs e.g.
   `bottom-20 sm:bottom-6` + `max-w-[calc(100vw-3rem)]`.
5. **Datalake/feedback** — nothing open from this campaign (normal traffic verified).
6. **Housekeeping (low priority)**: `scripts/start_services.sh`, `deploy/run_native.sh`,
   `deploy/helpotron-api.service` still redirect stdout as before — now redundant alongside
   `access_log.py`; QA accounts `shellqa*`/`mobile_qa_*` — query found none remaining (verify
   before declaring); audit artifacts in `/home/roni/Roni_workspace/helpotron_audit/`
   (`tools/aiwta/*.mjs` probes, `design_shots/`, `tmp_pwlibs/`) — keep as reference.
7. **NOT the worker's changes — do not touch/commit blindly**: current branch
   `ux/conversion-overhaul-0829` has 24 uncommitted files (`server/analytics.py`, `routes_*.py`,
   `user_settings_service.py`, `web/App.jsx`, `AnonymousLanding.jsx`, `SettingsSections.jsx`,
   `IntelligenceView.jsx`, several `D` components…) — that's another lane's WIP.

## Environment facts

- Backend uvicorn `server.main:app --host 0.0.0.0 --port 8000` (**no `--proxy-headers`**); live site:
  vite preview :5173 serving `web/dist`, tunneled via cloudflared (config
  `~/.cloudflared/helpotron.yml`, protocol http2 since Aug 29 19:28Z).
- **Build only** with `node node_modules/vite/bin/vite.js build` from `web/` (never `npm run build`).
- No commits/pushes straight to master — PR flow only. No sudo, no pkill (exact PIDs).
- The squad's shared dev server on :5199 was **killed** (pid 629763) on Aug 29 20:10 EDT.
- Transcripts of every lane live under
  `~/.claude/projects/-home-roni-Roni-workspace/ce471cc8-0a67-4593-80b9-4f9a22e3f197/subagents/agent-*.jsonl`
  (Phase 1: `a0b508ea`; Phase 2 squad: `a755c5c5` A2, `a1bfd13b` A4, `a803efc2` A3, `aca4537f` A7,
  `aadacfd5` A5, `a4f909e6` A10, `a42c74be` A8, `ac452637` A9, `a9b23fee` A6, `afb23b71`/`a5f9d805`
  A1, `a9e08aeb` OPUS lead).
