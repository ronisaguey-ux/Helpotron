# B7 — Settings Bare-Bones, 3-Level Config Architecture, Control Center Teardown

Agent B7 · read-only · 2026-09-05 · feeds master `improvement.md`

---

## 0. Executive summary (the 6 load-bearing findings)

1. **Two disconnected settings stores.** The web app lives in `localStorage["helpotron_os_settings_v1"]` (~120 settings, set only by the Settings UI). The server lives in `users.settings` JSON (`server/user_settings_service.py`), written only by `MyAgentView`/`AppShell` mirrors through `PATCH /api/user/settings` (keyword allowlist). **`getUserSettings` is dead code, never called**, and the Settings UI itself never PATCHes — so the Humanizer/detection/sample-voice toggles turned in Settings never reach the server that enforces them.
2. **A working 3-level resolve engine ALREADY exists, client side: `settings.scoped[path] = [{id, scope:{level,ref}, value}]`** (`web/src/components/ScopedSetting.jsx`: `resolveScopedValue`/`effectiveValue`, most-specific-wins: task > assignment > class > subject > place) **and server side** (`server/humanize_skill.py:_scoped_value`, assignment > subject, matched against `assignments.progress.subject`/title via `ctx`). Bob's decree is ~50% already built — what's missing is (a) the per-subject/per-assignment *surface* (config lives inside Settings menus, invisible where users see the work), (b) server persistence of the scoped layer, (c) subject identity keyed properly.
3. **Subjects are free-text strings, no subjects table.** `assignments.progress.subject` (LLM-extracted), `settings.subjects` (localStorage map), `settings.custom_subjects` (server JSON, 6 defaults with ids `subj_math`…), `settings.custom_bubbles` (server JSON), and a hardcoded frontend `DEFAULT_SUBJECT_BUBBLES` const (`AssignmentCardDashboard.jsx:24`, duplicate of the server defaults). The dashboard "subject cards" ARE bubbles: default subjects + user custom bubbles, assignments matched by fuzzy title/description heuristics (`matchCardToBubble`).
4. **Roughly 60% of Settings is never read anywhere.** `automation.*`, `data.*`, `language.*`, `shortcuts.*`, `extension.*`, `experimental.*`, `advanced.{debugMode,apiLogging}`, `ai.{creativity,reasoning,conciseness,rigor,sourceDepth,originality,temperature,tokenBudget,fallbackEnabled,subsetting}`, `writing.{tone,vocabulary,sentenceComplexity,formality,voice}`, `notifications.*` (full grid) have zero consumers outside Settings files (`grep -rEn` across web/src + server). They are inventory, not features. Deleting them costs nothing and removes most of the clutter Bob hates.
5. **Server settings schema is a superset of the UI's.** `get_user_settings()` defaults include `effort_score`, `scoped_subsettings`, `trio_rules`, `personas`, `custom_style_samples`, `ai_detectors`, `model_selection`, `gemini_multimodal`, `presentation_gemini_config`, `fake_writing_history`, `academic_level`, `target_score_*`, `grade_scheduling`, `datalake_opt_in`, `leaderboard_*`, `display`, `localization`, `permissions`, `goals` — most with no UI at all. These are the "global defaults" that survive into the 3-level model.
6. **`ai.hierarchy` (per-surface edu/open/identity) is orphaned server-side**: server supports it (`agent_prompt.py` HIERARCHY_NODES + `mode_for_node`), but no web UI writes it any more (grep: only a stale comment). Extension surface overwrites `hierarchy.extensions.instructions` per-turn (never stored).

---

## 1. STEP 1 — INVENTORY

### 1.1 Storage layer (client)

| Piece | Location |
|---|---|
| Key | `helpotron_os_settings_v1` localStorage |
| Defaults | `DEFAULT_SETTINGS` in `web/src/demoData.js:299-341` |
| Load | `loadSettings()` `demoData.js:343` — `deepMerge(DEFAULT, parsed)` |
| Save | `saveSettings()` `demoData.js:354` — writes localStorage + dispatches `helpotron:settings-changed` |
| Writer | `SettingsApp.jsx` `set(path,value)` (dot-walk) + `setVariants(path,variants)` for `scoped.*` |
| Applier | `AppShell.jsx:372-394` — listens for the event, resolves per-**place** appearance variants (`resolveScopedValue(settings.scoped, 'appearance.X', {place: activeView})`), then `applyAppearance()` + `applyAccessibility()` |
| Apply fns | `SettingsApp.jsx` `applyFontScale` (html root font-size, 0.8×–1.6×), `applyAppearance` (data-theme/accent/density/anim/bg/ui attrs), `applyAccessibility` (data-motion/contrast/reading/textscale/screenreader) |
| Effort map | `EFFORT_SCORES = {low:100, balanced:500, high:900}` `demoData.js:377` |

### 1.2 Server mirror

| Piece | Location |
|---|---|
| DB column | `users.settings` JSON (`server/database.py:56` `User`) |
| Route | `GET/PATCH /api/user/settings` → `server/routes_user_settings.py:175-202` → `UserSettingsService.get_user_settings/update_user_settings` |
| Write allowlist | `user_writable_settings_keys()` = keys of `get_user_settings()` defaults minus `micro_credits_balance`/`credits_used_total`. **Undeclared keys are silently dropped** — this is why new settings (e.g. `scoped`, hierarchy toggles) must be declared in server defaults or they never persist server-side. |
| Mirror writers (web) | `MyAgentView.jsx:580,655,675,683,700` (`ai`, `operation_mode`, `educationalMode`, `effort_score`, `operation_mode`), `AppShell.jsx:68,78,89` (`profile.phone/avatarUrl`), `SettingsApp.jsx:647` (`educationalMode`), `AccountSection` (`profile.avatarUrl`). **SettingsApp's humanizer/detection/style/scoped writes do NOT get mirrored — dead end today.** |
| Dead | `api.getUserSettings()` (`api.js:623`) no callers. |
| Scoped server tables (exist, unused by UI) | `user_settings_scopes` (user, scope_type, scope_id, settings_json; unique uq_user_scope_target) `database.py:209-228`; `user_settings` KV (user, setting_key, value, scope_type, scope_id) `database.py:231-244`; `ScopedSettingsService`/`resolve_effective_setting` 6-tier (global→task) `user_settings_service.py:1104-1276`. BATCH-04 artifacts. |
| Server-side scoped reads (LIVE) | `humanize_skill.py:159-1376` — `_scoped_value(settings,'ai.humanizer'|'ai.detection.enabled'|'ai.detection.min_human', ctx)`, `sample_voice_block` (scoped `ai.style.samples`, `humanize_skill.py:420`); ctx built in `routes_overlord.py:1583-1596` from the bubble assignment row: `ctx = {assignment: a.title, subject: a.progress.subject|course}`. |

### 1.3 AI config shape (the exact keys the 3-level system must carry)

Client (`DEFAULT_SETTINGS.ai`, plus top level):
```
educationalMode: bool            // school-only gate (mirrored to server)
ai: {
  aiName, personality, instructions,          // identity
  effortScore (100-1000), effort: 'low'|'balanced'|'high',  // effort; score source of truth
  autoRouting: bool,
  mode: 'manual'|'auto'|'yolo',               // extension chat approvals (MyAgentView)
  humanizer: 'on'|'off',                       // scoped-able
  detection: { enabled:'on'|'off', min_human: 50-95, detectors:{sapling,pangram} },  // enabled+min scoped-able
  style: { enabled:'on'|'off', selection:[sampleIds], samples:{id:{name,text}} },     // enabled+selection scoped-able
  creativity, reasoning, conciseness, rigor, sourceDepth, originality (0-100) — READ BY NOBODY
  temperature, tokenBudget, fallbackEnabled, subsetting — READ BY NOBODY
  hierarchy: { my_agent, assignment_team, study_tools, dump_agent, qa_chat, extensions } — each
              {mode:'edu'|'open', personality, instructions, memories, files} — READ server-side, never written by current UI
}
scoped: { 'ai.humanizer': [...], 'ai.detection.enabled': [...], 'ai.detection.min_human': [...],
          'ai.style.enabled': [...], 'ai.style.samples': [...] }   // [{id, scope:{level:'subject'|'assignment', ref}, value}]
```
Server (`get_user_settings` defaults, read by engine): `effort_score` (resolve_effort_tier→model cascade), `ai.*` same keys + `operation_mode`, plus legacy full schema (see §5 finding 5).

Writing (client): `writing.{tone,vocabulary,sentenceComplexity,formality,voice}` (no consumers), `writing.profile` (active profile name), `writing.profiles` (picklist), `writing.style` (APA/MLA/Chicago/Harvard/IEEE — server has `generate_citation(style)` in user_settings_service; also `default_styles.py` DEFAULT_STYLES/ACADEMIC_LEVELS). Server legacy writers: `tone`, `vocabulary_level`, `sentence_length`, `creativity_level`, `burstiness`, `perplexity`, `active_persona_id`, `personas[]`, `custom_style_samples[]`.

### 1.4 Full settings inventory (17 sections → every setting; tier = SECTIONS tier in SettingsApp.jsx:19-37)

Legend — CONSUMED = read anywhere outside SettingsApp/SettingsSections/demoData. ✅ real. ⚠️ partial/display-only. ❌ dead.

#### Account (simple)
| Key | Label | Type | Purpose | Storage | Status |
|---|---|---|---|---|---|
| profile.displayName | Display name | text | topbar/agent name | local + PATCH mirror | ✅ AppShell/agent |
| profile.avatarUrl | Profile picture | file upload (PNG/JPG ≤5MB) | topbar, agent | `/api/user/upload-avatar` + local | ✅ |
| profile.phone | Phone number | tel | SMS 2FA/recovery | local + PATCH | ✅ 2FA flows |
| — | Email | readonly | sign-in provider | derived `{userId}@helpotron.app` | ⚠️ fake format |
| — | Password change | action | api.changePassword | server | ✅ |
| — | Forgot password | action | RecoveryFlowModal | server | ✅ |
| — | Plan badge | display | real plan ∈ none/basic/pro/elite; admin ⇒ 'Admin' | server | ✅ |

#### Appearance (simple) — **KEEP (merged w/ Accessibility)**
| Key | Label | Type | Purpose | Status |
|---|---|---|---|---|
| appearance.theme | Theme | chips: dark/light/system/oled/midnight/graphite | data-theme | ✅ applied |
| appearance.accent | Accent | chips 6+custom | data-accent | ✅ |
| appearance.density | Interface density | chips compact/comfortable/spacious | data-density | ✅ |
| appearance.animation | Animations | chips full/reduced/none | data-anim | ✅ |
| appearance.background | Background | chips flat/gradient/aurora/mesh/glass/noise | data-bg | ✅ (08-26 wire-up) |
| appearance.uiStyle | UI style | chips minimal/glass/dense/soft/terminal | data-ui | ✅ |
| appearance.fontScale | Font scale | slider 1–100 (50=default) | html font-size 0.8×–1.6× | ✅ |

#### AI & Intelligence (simple) — **This whole section MOVES (global defaults + subject + assignment)**
| Key | Label | Type | Status |
|---|---|---|---|
| educationalMode | Educational Mode | toggle, mirrors PATCH | ✅ enforced server-side (mode_for_node) |
| ai.aiName | AI Assistant Name | text | ✅ server persona_block |
| ai.personality | Persona & Tone | chips: Tutor/Strict Grader/Socratic Coach/Researcher/Professional/Minimalist | ✅ server (agent_persona_block) |
| ai.instructions | Custom Instructions | textarea, injected | ✅ server |
| ai.effortScore (+ai.effort) | Model Effort Level | slider 1–10 → ×100 | ✅ server effort_score cascade |
| ai.autoRouting | Automatic Task Routing | toggle | ⚠️ decision read... server uses effort_score; autoRouting only labels effect |
| ai.detection.enabled | AI Detection Standard | toggle **scoped** | ✅ server (humanize_skill) — BUT Settings writes never mirrored ⇒ inert |
| ai.detection.min_human | Minimum human score | slider 50–95 **scoped** | ✅ server — same caveat |
| ai.detection.detectors.{sapling,pangram} | Detectors | 2 toggles | ✅ server detectors.py registry |
| ai.humanizer | Humanizer Skill | toggle **scoped** | ✅ server — same caveat |
| ai.style.enabled | Write Like a Sample | toggle **scoped** | ✅ server sample_voice_block — same caveat |
| ai.style.samples | Samples library | add/upload name+text | ✅ server |
| ai.style.selection | Global sample selection | per-sample on/off | ✅ server |
| Per scope picker | Pick samples per subject/assignment | variant editor | ✅ client resolver; ⚠️ server ctx only in bubble chat |
| ai.creativity…originality (6) | Intelligence Tuning | 6 sliders | ❌ NO consumer |
| ai.temperature/tokenBudget/fallbackEnabled/subsetting | (in defaults/presets only) | hidden vals | ❌ NO consumer, no UI |
| Quick presets Budget/Balanced/Power | one-click reset-all | buttons | ⚠️ writes everything; risky UX |
| TelegramAgentCard | Telegram bot ↔ My Agent | token connect | ✅ server endpoints — MOVE to Integrations |

#### Academic Profile (simple) — **MOVE (subject/assignment-adjacent; mostly a DUPLICATE of subject card data)**
| Key | Label | Type | Status |
|---|---|---|---|
| profile.educationLevel | Education level | select | ⚠️ server has academic_level (different key!) — unmap |
| profile.major | Major | text | ❌ no consumer |
| profile.year | Year | select | ❌ no consumer |
| subjects{name→level} | Subjects & skill levels | text→select rows (+image upload) | ⚠️ duplicate of custom_subjects; level consumed by nothing |
| subjectImages{subject} | Subject images | upload | ✅ used by subject card art? (dashboard images via api.uploadAvatar kind=subject) |
| learningStyle{4} | Learning style | 4 sliders | ❌ no consumer |
| goals{4} | Goals | 4 toggles | ❌ (server goals.* exists, different shape) |

#### Writing & Output (simple) — **MOVE (assignment surfaces) + cut dead axes**
| Key | Label | Type | Status |
|---|---|---|---|
| writing.tone/vocabulary/sentenceComplexity/formality/voice | Writing DNA | 5 sliders | ❌ NO consumer (server has own persona vocab) |
| writing.profiles + profile | Saved Writing Profiles → active | chips | ✅ used as picklist; profiles themselves are labels only |
| writing.style | Preferred Citation Style | select APA/MLA/Chicago/Harvard/IEEE | ⚠️ server generate_citation(style) exists; grep shows no wired consumer in generation path — verify |

#### Notifications (simple) — **streamline**
| Key | Label | Type | Status |
|---|---|---|---|
| notifications.assignments.{completed,draft.ready,deadline} | 3 toggles | ⚠️ no consumer (NotificationsView renders its own demo data) |
| notifications.credits.{low,monthly} | 2 toggles | ⚠️ no consumer |
| notifications.study.{streak,recommendation} | 2 toggles | ⚠️ no consumer |
| notifications.channels.{browser,inapp,email,telegram} | 4 toggles | ⚠️ no consumer |

#### Privacy & Security (simple) — **KEEP**
| Key | Label | Type | Status |
|---|---|---|---|
| privacy.twoFactorEnabled/method | 2FA (TOTP/email/SMS) | flows via api.setup2FA/verify/disable | ✅ real server |
| privacy.analytics / dataLake / anonymous | Data usage | 3 toggles | ⚠️ none mirrored; server keys: datalake_opt_in |
| privacy.exportAll | (in defaults, no UI) | — | ❌ |
| Export all data / privacy policy / account deletion | 3 actions | export-all endpoint, DELETE /api/user/account | ✅ |

#### Credits & Billing (simple) — **KEEP as read-only summary (real panel is CreditsView)**
Plan badge card, token balance/progress, discount balance, button → Credits. Values real (BILLING_META none/trial/basic/pro/elite).

#### Automation (advanced) — **DELETE section, keep 2 things as assignment-level gates**
| Key | 12 toggles (autoRun,autoFetch,autoTranscribe,autoDraft,autoOrganize,autoNotify,autoSubmit + requireApproval.{submit,messages,bigSpend,premium,modify}) | **❌ ALL have zero consumers.** Keep only `approval gates` concept as assignment-level "Confirm before: submit/send/spend" — server enforcement point is routes_overlord approval handling; verify before wiring. |

#### Integrations (advanced) — **KEEP (slim: Telegram only)**: 4-step guided BotFather flow (real, api /api/features/telegram/*); "Not built yet" Canvas/Drive/Notion honor list without buttons (honest). Move the AI-section TelegramAgentCard here.

#### Browser Extension (advanced) — **MOVE / slim**
| Key | Status |
|---|---|
| extension.recorder/autoCapture/badge | ⚠️ reference the extension's own popup settings (reads localStorage keys directly) — Settings toggles are cosmetic duplicates |
| "Helpotron Extension v2.0 · installed" card | ❌ hardcoded version, dead (release is v2.5.2) |

#### Shortcuts (advanced) — **DELETE** (4 kbd display rows, NOT editable; CommandPalette is hardcoded ⌘K)

#### Accessibility (advanced) — **merge into Appearance**
| Key | Status |
|---|---|
| accessibility.reducedMotion/highContrast/largeText/dyslexiaFriendly/screenReader | ✅ applied via data-* attrs + CSS hooks in index.css. Move under "Appearance → Display & accessibility". |

#### Data & Analytics (advanced) — **DELETE** (weeklyDigest/streakReminders/accuracyTracking ❌ zero consumers)

#### Language & Region (advanced) — **KEEP language** (`locale` … applied? ❌ no i18n; keep as "coming soon" or cut), timezone/measurement ❌ (measurement not even rendered). Recommend: keep locale+timezone as global defaults, delete measurement.

#### Experimental (expert) — **DELETE from user Settings** (ocrBeta/edgeEval/newUI are feature-flag demo toggles server-gated for everyone else; DemoModeToggle is dev-only — move to Control Center or remove).

#### Advanced (expert) — **DELETE user-facing toggles** (debugMode/apiLogging ❌ nothing reads them, apiLogging is dev console logging), keep "Reset all settings to defaults" (working: api.softResetData) and Data Lake pointer (move → Control Center? no — Data Lake is a user surface; it already has its own view; drop the pointer).

### 1.5 Honesty list — verified-fake / never-verified
- Integrations Canvas/Drive/Notion: no backend (audit comment 08-29) — shown as "Planned" now. ✓ honest.
- `settings.integrations.*` stale default flags (canvas:true for everyone) — never read. Dead.
- Quick presets wipe ALL behavior settings including scoped overrides — surprising, keep only in "Defaults" panel with clear wording.
- `displayMode` setting ('simple'|'advanced'|'expert') exists in defaults; per-section tiers are hardcoded in SECTIONS; nothing reads displayMode. Dead.
- `settings.privacy.exportAll`: declared, no UI, no reader. Delete.
- `NotificationsView.jsx` renders its own mock/demo notification list — can't verify whether notifications.* is wired by backend notifiers (Telegram notifier sends via features.py; email via mailer.py). Mark "server-side notifiers exist; the settings grid is not connected".

---

## 2. STEP 2 — BARE BONES SETTINGS SPEC

### Keep-list (final Settings = 6 sections, max one screen)
1. **Account** — display name, avatar, phone, change password, forgot password, plan badge, 2FA shortcut.
2. **Appearance & Display** — theme, accent, density, animations, background, UI style, font scale, + merged accessibility toggles (reduced motion, high contrast, larger text, dyslexia-friendly, screen reader), lorem live preview. *The one section users actually reach for.*
3. **Notifications** — one flat "push-notification digest" panel: in-app, email, telegram, + "quiet hours" (server key exists quiet_hours_*) as toggles, plus per-surface toggles (assignments/deadlines/credits/streaks) — but only the ones with real senders (telegram notifier / mailer). Anything unverifiable is cut.
4. **Privacy & Security** — 2FA setup, data toggles (analytics, data lake contribution), export all data, delete account, privacy policy link.
5. **Credits & Billing** — balance card + link to Credits view (no forms).
6. **Integrations** — Telegram guided setup (moved from AI section + Integrations), "Planned" list.

### Where everything else goes
- Ai/writing/academic config → **Dashboard Defaults panel** (global level) + **subject cards** + **assignment bubbles** (3-level, §3).
- Automation approval gates → **assignment-level "Ask me before…"** toggles (§3.3).
- Extension toggles → **extension popup's own settings** (real storage), Settings shows only install status + link.
- Experimental/Demo mode → removed from user-facing settings entirely (feature flags are operator/admin config).
- Shortcuts → deleted; if real keybindings ship, land in Command Palette docs, not settings.
- Reset-to-defaults → moves into Defaults panel header (global level only).
- TelegramAgentCard → Integrations.

### Move/delete matrix (summary)

| Section / setting | Verdict | Destination |
|---|---|---|
| Account (all) | KEEP | Settings |
| Appearance (all) | KEEP | Settings |
| Accessibility (5) | KEEP, merged | Appearance |
| Notifications grid (13) | CUT > 8, merge 4 channels | Settings → flat panel |
| Privacy (2FA/data/export/delete) | KEEP | Settings |
| Billing | KEEP (read-only) | Settings |
| Integrations | KEEP (Telegram) | Settings |
| Extension (3 + version card) | MOVE | Extension popup; settings shows status+link only |
| Shortcuts (4) | DELETE | — |
| Language & Region | KEEP locale+timezone (global default); DELETE measurement | Defaults panel |
| Academic Profile (educationLevel, major, year, subjects+levels, subjectImages, learningStyle, goals) | MOVE | Subjects are Dashboard units: educationLevel stays a GLOBAL default; subjects/skill-levels/images merge into the subject cards themselves; learningStyle+goals → DEFAULT (cut: no consumers) |
| Writing DNA 5 axes | MOVE→ subject/assignment; KEEP as defaults too (server persona engine uses tone/vocab…) | Defaults + subject + assignment |
| Writing profiles / citation style | MOVE | Defaults + subject card + assignment ("Writing profile" picker; citation style per assignment) |
| AI & Intelligence everything | MOVE | Defaults + subject + assignment |
| Quick presets Budget/Balanced/Power | MOVE | Defaults panel header ("Try a preset") |
| Automation 12 toggles | DELETE section; approval gates → assignment "Ask me before" | Assignment level |
| Data & Analytics 3 | DELETE | — |
| Experimental 3 + demo | DELETE | Control Center (admin/dev) |
| Advanced debug/API log | DELETE | Control Center |
| Advanced reset-all | MOVE | Defaults panel |
| displayMode, privacy.exportAll, integrations.*, ai.intelligence dust, ai.{temp,tokenBudget,fallback,subsetting} | DELETE | — |

**Net user-facing Settings: ~45 real settings, down from ~120. Bob's "confusing and complex" items (AI sliders, automation, safety gates, experimental, Data, Advanced) are all gone from Settings.** They reappear ONE place at a time, in context (§3).

---

## 3. STEP 3 — 3-LEVEL CONFIG ARCHITECTURE

### 3.0 The three levels and what inherits from what

```
Level 0  GLOBAL DEFAULTS  (new "Defaults" panel on Dashboard — gear on page header)
   │  inherits downward
   ▼ "Inherit" shown on every field at every level
Level 1  SUBJECT  (per subject card: gear icon on the card)
   │
   ▼
Level 2  ASSIGNMENT  (per assignment bubble: "Agent settings" section in AssignmentDetailView)
assignment > subject > global — one effective value per setting
```
**Exactly the resolver already in `ScopedSetting.jsx` + `humanize_skill._scoped_value`**, collapsed from 6 levels (place/class/task extras die) to 3: `assignment > subject > global`. `class` and `task` and `place` scopes are dropped (no data model exists for class/task; place overrides only apply to appearance, which stays global).

### 3.1 Global defaults surface — "Defaults" panel

Where: **Dashboard header gear** (next to the greeting / view switcher) and a "Defaults" entry card on the Dashboard. NOT inside Settings (Bob's rule: config lives next to what it affects).

Appearance: gear button in the Dashboard top bar `(icon: Settings2 or SlidersHorizontal, lucide)` → bottom sheet on mobile / right-side panel on desktop. Panel contains 5 tabs (bottom navigation on mobile):
1. **Agent** — aiName, persona chips, custom instructions, effort slider (with live "$-cost" chip: Budget/Balanced/Power capsule labels), auto-routing toggle.
2. **Mode & ethics** — Educational Mode toggle, Humanizer toggle, AI Detection Standard toggle + min-human slider + detector chips, Write-like-a-sample (samples library lives HERE, at global level).
3. **Writing** — citation style select, writing profile picker (profiles managed here), the 5 writing axes as compact sliders (visually same as today but plain English labels: "Formal ↔ Casual").
4. **Study profile** — education level, goals (keep 2-3 honest toggles), quiet hours.
5. **Danger zone** — reset to defaults (keeps account/appearance), presets row.

Inheritance UI: every control shows a small state chip: `Default` (nothing set), `Set to X — clears if the subject sets its own` etc. No "Inherit/Override" tri-state needed at global level (it IS the base).

### 3.2 Subject-level config

Subject identity = **subject card on the Dashboard** (bubble). Cards already exist (`AssignmentCardDashboard.jsx` `finalSubjects`: `DEFAULT_SUBJECT_BUBBLES` + `custom_bubbles` + catch-all "General & Electives"). Config editor:
- Gear `(SlidersHorizontal)` on each subject card header → **expands an inline row below the card header** (no navigation, no modal) with the SAME widget set, each prefixed by a state chip.
- New **subject fields on the card itself** migrate from the old Academic section: skill level select (Beginner…Expert), optional subject image, description (name/description/color/icon already exist on bubbles).
- **Subject creation/renaming** already exists (created from the dashboard "+ New subject", server `custom_subjects`).

State model per field (three-state): `Inherit from defaults` (default) / `Override: <value>` / `Reset` (clears the override). Visual: overridden → chip `Subject` in accent color + field tint; inherited → nothing (or a translucent “Default” label on first expansion).

### 3.3 Assignment-level config

Where: **AssignmentDetailView.jsx** — new "Agent settings" section inside the assignment bubble (below the brief/progress, above the agent chat box), collapsed by default with a summary line ("Agent: Atlas · Effort 4 · Detection on · Inherits Biology").
Widgets: same components, plus assignment-specific ones:
- **Ask me before:** chips — Submit to LMS / Send messages / Big spend / Flagship model (the 3 approval gates that were in Automation that actually have enforcement surfaces; verify each server-side consumer before wiring — today `requireApproval.*` is unread, so this is a re-build, not a move).
- **Writing profile** picker per assignment, **citation style** per assignment, **due-subject** (the free-text `progress.subject` is editable HERE — this is what matches the subject scope).

### 3.4 DATA MODEL (recommendation + reasoning)

**Recommendation: single source of truth in the server `users.settings` JSON, `scoped.*` promoted to a first-class sanitized sub-schema. No new tables.**

Reasoning:
- `users.settings` JSON is the live pattern (writable-allowlist + deep-merge); new tables (`user_settings_scopes`, `user_settings`) already exist but are unused by any UI and duplicate the JSON — choosing table rows now means resurrecting BATCH-04 machinery with zero callers. JSON keeps one read path for prompt building (`agent_system_prompt` reads `user.settings`), which is where the enforcement happens.
- Subject/assignment identity is by **string ref** (`progress.subject`, assignment title) — matching happens per-turn server-side by building `ctx` and walking variants (`humanize_skill._scoped_value`); that code already exists and is proven.

Concrete schema (all inside `users.settings`):
```jsonc
{
  // existing keys stay (effort_score, ai.*, educationalMode, datalake_opt_in, ...)
  "scoped": {                       // REPLACES the ad-hoc flat map — see key rules below
    "ai.humanizer":       [{ "id": "v1", "scope": {"level":"subject","ref":"Biology"}, "value":"on" }],
    "ai.detection.min_human": [{ "id":"v2", "scope":{"level":"assignment","ref":"Chapter 5 test"}, "value":80 }],
    "ai.effortScore":     [{ "id":"v3", "scope":{"level":"subject","ref":"Computer Science"}, "value":700 }],
    "ai.personality":     [...], "ai.style.samples": [...], "writing.style": [...], "writing.profile": [...]
  },
  "subjectConfig": {       // NEW top-level: rich per-subject config (non-scalar pieces)
    "Biology": {
      "level": "Advanced", "image": "https://…", "description": "Genetics & ecology",
      "writingProfiles": [ {"id":"wp1","name":"Bio lab report","tone":20,"terms":["Lab report"],"citationStyle":"APA"} ]
    }
  }
}
```
Rules:
1. Only *scalar, enumerated* configs (on/off, score, label, person name, style) go through `scoped.*` — one variant list per dot-path, refs = subject name or assignment title (verbatim strings, matched case-sensitively like today).
2. *Structured* per-subject data (level, image, description, saved writing profiles) go in `subjectConfig.<name>`.
3. Assignment-level free-form only needs refs in `scoped.*` (assignment titles are unique per user for chat purposes); store nothing on the assignment row (progress JSON stays untouched — the config travels in settings, keyed by title).
4. Declaration: every path prefix must be added to the server defaults schema **before** PATCH (the writable allowlist drops undeclared top-level keys; `scoped` and `subjectConfig` must be declared in `get_user_settings` defaults).

APIs (new, thin; reuse `filter_user_settings_payload` + `persist_user_settings`):
```
GET  /api/user/settings                  (exists — now returns scoped + subjectConfig too)
PATCH /api/user/settings                 (exists — extended allowlist {scoped, subjectConfig}; server validates scope.level ∈ {subject,assignment}, ref ≤128 chars, value type per known path registry)
GET  /api/user/config/subjects           → subjectConfig map (for subject-card editors)   [could reuse GET settings]
PUT  /api/user/config/subjects/{name}    → upsert one subject block (name = URL-encoded ref)
DELETE /api/user/config/subjects/{name}  → remove subject block + its scoped.subject variants
GET  /api/user/config/assignments/{id}   → effective config for one assignment (server resolves global→subject→assignment with ctx from assignments row; returns {values, provenance: [{scope,ref,value}]})
PUT  /api/user/config/assignments/{id}   → write assignment-scoped variants (value; optional partial)
```
Effective-resolution endpoint is the one that matters: the agent/bubble surfaces call it once per turn, replacing the client-side resolver for server enforcement.

**Migration (nothing lost):** one-time, on first load after upgrade — `loadSettings()` merge step: take current `settings.ai.*`, `settings.writing.*`, `settings.educationalMode`, `settings.subjects`, `settings.subjectImages` and write them into the new Defaults shape (same values, deeper nesting) in localStorage; server side `user_settings_service.get_user_settings` already returns defaults for missing keys, so existing users automatically get the new schema with their old values on top. Existing `scoped` variant lists (humanizer/detection/style) carry forward untouched — same shape, same keys. Nothing is deleted: the "DELETE" verdicts in §2 only apply to the *UI*, values in storage are ignored harmlessly.

### 3.5 UI spec for Stitch (widgets, states, mobile)

Design tokens (M3, `web/src/index.css` @theme inline): surfaces `surface-container-lowest/-low/-high`, text `on-surface`/`on-surface-variant`, primary, error; type roles `font-display-xl`, `font-headline-lg`, `font-title-md`, `font-body-md/sm`, `font-label-caps` (caps labels), `font-tabular-stat` for numbers.

- **Config field widget (the one primitive, used at all 3 levels):** row = `font-label-caps` label (11px, uppercase) + control + state chip. Controls: Toggle (`Toggle` from ui/os.jsx), ChipRow (segmented chips for enums, existing `ChipRow` in SettingsApp), slider with value readout (`font-tabular-stat`), select, textarea. NO nested "overrides per place" expander — a direct **three-state mini-select** on the label: `Default` (nothing) → `Override` (value controls enabled) → `Reset`. States: `Inherited` shows a muted `Globe`-less baseline (no chip); `Override` shows a `Pencil`/accent chip + `tertiary` tint on the control track; `Clear` affordance always reachable as an X on the state chip.
- **Subject card header:** existing card (icon, title, count) + right-side `SlidersHorizontal` icon-button (44px touch target, `surface-container` bg, hover → primary). Tapping expands an in-card drawn section (`border-outline-variant/20`, `surface-container-lowest`) with the same field rows, labeled "Biology — agent settings". Card also gains the subject level select + image affordances (moved from Academic).
- **Assignment:** in `AssignmentDetailView`, section heading `font-title-md` "Agent settings" + summary line in `on-surface-variant` (e.g. "Effort 5 · Detection on · Writing: Lab report · Inherits <subject>"), chevron expand. Nested progress identity: three stacked chips `({Globe} Defaults → {Book} Biology → {FileText} Assignment)` for the active provenance trail.
- **Mobile:** subject config = full-screen bottom sheet (Stitch "mobile sheet" pattern, swipe-down dismiss), assignment config = accordion (already fits 1-col), defaults panel = bottom sheet with 5 icon tabs (shown as icon bar at sheet bottom). All controls ≥44px min target; state chips never require hover.
- **No AI-generated images** anywhere (rule respected — all icons lucide-react: `SlidersHorizontal`, `Globe`, `Book`, `FileText`, `Pencil`, `X`, `Check`, `RefreshCw`, `ShieldCheck`).

---

## 4. STEP 4 — CONTROL CENTER + MONITORS TEARDOWN

### 4.1 Catalog (what exists)

**Navigation** (AppShell `getNavItems(isAdmin)`, only for admins): `admin` (Control Center, Shield) + `monitors` (Monitors, Gauge). Settings' `ADMIN_SECTIONS['control-center']` is dead code (08-28 comment).

**Control Center (`App.jsx` → `AdminPanels.jsx`)** — 3 tabs:
1. `users` → **AdminAdvancedDashboard.jsx** (1537 lines) — 7 sub-tabs:
   - **User Operations** (User Management, the honest core): alphabetized user list (fuzzy search), bulk select, credits adjust, tokens grant, plan set (none/trial/basic/pro/elite), password reset / change, ban / tempban / kick / delete, **act-as-user**, admin inbox (messages) w/ reply + clear, moderation queue, model scorecards sidebar. Real endpoints (`api.js:695-716`).
   - **Cost & Usage** — cost/usage analytics (adminAnalytics).
   - **Inquiries Inbox** — admin messages w/ counts chip.
   - **Model Scorecards** — metrics.scorecard view.
   - **Moderation** — mod queue w/ count chip.
   - **System Health** — health panel.
   - **Storage Control** — storage/system-control panel.
2. `system_map` → **SystemMapPanel** (subsystem nodes: users/gateway/assignments/router/storage/fast/balanced/flagship/queue; status+p95; `adminSystemMapNodes`; demo mode shows mock nodes `SYSTEM_MAP` in demoData).
3. `agent` → **AdminAgentChat** — agent chat with admin actions in prompt.

**Monitors (`MonitorsView.jsx`, 30s poll, server `routes_monitors.py`)** — 4 stat cards + feedback list:
- Traffic (reqs total/last-60s/rate, status-code bar, top endpoints), Activity (sessions 24h/all, assignments 24h/all, materials, transcripts, uptime), Data Lake (operational events, user feedback, microcredits, humanized samples + sparkline of history), API Cost (per-day cost + sparkline + today's spend) — real `/api/monitors/*` telemetry, plus **Feedback queue** (mark resolved).

### 4.2 Problems (from source + evidence)

1. **Two headings-deep of dead chrome.** AdminAdvancedDashboard opened with an empty "Helpotron Master Admin Panel" section card + seven tabs — the 08-30 overhaul already fixed the worst (segmented track + identity chip), but the 7-tab layout still floods one screen: 7 sub-tabs × 4 admin side surfaces (users/costs/inbox/models/moderation/health/storage) = 10+ competing panels in one view.
2. **Jargon everywhere**: "operational events", "microcredit submissions", "humanized samples", "subsystem node", "p95 latency", "act-as-user", "tempban", "flagship tier". Bob's complaint: technical vocabulary with no plain-English translation.
3. **Dead/placeholder content**: `SystemMapPanel` reads demo-data nodes when demo mode is on (or empty states — "No subsystem nodes reported yet"); models scorecards/moderation queue can be empty for most of a day but are still first-class tabs; `AdminAgentChat` is a raw prompt box (admin actions listed as bullet text in a chat prompt, not a UI). Storage Control "system_control" tab is a black box (ShieldCheck icon) next to populated panels.
4. **Mobile is broken by construction**: horizontal tab rows + dense multi-column user rows + hover-revealed bulk ops (`group-hover` patterns) — 1537-line component with no `md:` responsive split for the ops table; admin nav itself is desktop-first.
5. **Cost & Usage duplicates Monitors' cost card** (both fetch `/api/monitors/overview` by a different name) — two places showing the same number, both admin-only.
6. **Feedback/mod queues are hidden in Control Center**: real users' feedback only reachable by an admin — "Monitors" is where the feedback lives, but the tab name doesn't say "feedback", it says "Datalake / humanized samples" and the feedback list sits after four stat walls.
7. **No action-first patterns**: every sub-tab is a list; nothing answers "what needs me right now" (pending moderation count is a chip, but ordering isn't by need).

### 4.3 Regeneration spec (admin surfaces, incl. mobile)

Single principle: **Control Center = 3 questions, answered in this order — Who needs help? What is broken? What am I spending?** Cut anything else.

**Control Center regenerate (AdminPanels → AdminDesktop):**
- **Header**: title + identity chip + "Refresh" (30s auto) — same as Monitors header for coherence.
- **Tab 1 — "User & Operations"** (default): one search bar (fuzzy substring, existing), then a **"Needs attention" strip first** (users with open inquiries, pending moderation items, users near plan caps, banned-flag counters), then the user table simplified to: alias/id, plan chip, tokens (statusbar), last activity, and ONE "⋯" menu (MobileMenu pattern: change plan / adjust credits / reset password / ban / delete; destructive items grouped at the bottom, red `error-container`). **Delete the master-panel chrome IRL: no "Act as user" beyond a dev-only accordion (keep endpoint, hide UI default).**
- **Tab 2 — "Cost"**: merge with Monitors cost card → one panel: today's spend, per-day sparkline, per-plan cost table, top feature costs (existing adminAnalytics shape), plain-English labels ("Fast engine work", "Essay drafting", "Audio transcription").
- **Tab 3 — "Tools"** (progressive disclosure, drawer/lower priority): System Map (rename "Engine status"; show only non-operational nodes first), Model Scorecards, Storage, Inquiries Inbox, Admin Agent chat — each as a card in a 2-col grid, inline "…" to expand on demand. Removes 7-tab clutter and hides empty panels.
- **Mobile:** tabs become a bottom bar (3 items, labels under icon — M3 style); user list becomes single-column cards with 88px action surface; bulk-ops hidden (admins act one user at a time on touch).
- **Kill list**: SystemMapPanel demo-data fallback (`demoData.SYSTEM_MAP`) — show real node data or "no telemetry" plain line; "Helpotron Master Admin Panel"-style empty headers; AdminAgentChat replaced by a "Give the agent a command" input with plain-command help, not prompt-engineering text.

**Monitors regenerate (rename → "Live" or keep "Monitors" but fix order):**
- **Order on mobile/desktop**: 1) Feedback & alerts (user feedback list w/ resolve; needs-attention chips — the ONLY interactive operators need), 2) Traffic one-liner (total/rate/error % as a single stat strip), 3) Data lake + Activity (read-only, 2 cards), 4) Cost (merge into Control Center Tab 2 — remove duplicate card here).
- **Cut**: "humanized samples"/"operational events" microcopy → "Feedback received", "New study material", "New assignments" plain-language labels. Status-code bar → single "Error rate" delta chip. Top endpoints stays (admins actually use it) labeled "Busesiest pages".
- **Feedback stays accessible to admins without typing** (default tab = feedback on load), and one "Acknowledge" action (exists: updateFeedbackStatus resolved).
- **Mobile:** cards cascade 1-col, feedback rows = full-width, 44px "done" target; no hover dependencies (already none — good).

---

## 5. What I could not verify (honesty)

1. Whether `requireApproval.*` (Automation safety gates) has any live enforcement — grep shows zero consumers; presumed rebuild, not move.
2. Notifications: `server/mailer.py` + `features.py` Telegram notifier send real messages, but no code reads `settings.notifications.*` per-user to gate them — presumable hard-coded defaults.
3. `writing.style` citation consumers: `generate_citation()` exists in the service but I found no generation-path caller; flag for a quick server grep before wiring per-assignment citation style.
4. `subjectImages` server round-trip: upload path exists (`api.uploadAvatar(file,'subject',subject)`); whether the server persists the URL per subject beyond settings JSON — only the JSON mirror, so subject card art is device-local unless mirrored.
5. `AdminAdvancedDashboard` internals beyond the tab names (1537 lines, read only outline) — sub-tab content judged from tab labels + api.js endpoints.

---

*Sources: `web/src/components/{SettingsApp,SettingsSections,ScopedSetting,AppShell,App,AssignmentCardDashboard,AssignmentDetailView,AdminPanels,AdminAdvancedDashboard,MonitorsView,AgentConfigsSidebar,MyAgentView}.jsx`, `web/src/demoData.js`, `web/src/api.js`, `web/src/index.css`, `server/{routes_user_settings,user_settings_service,humanize_skill,agent_prompt,routes_overlord,database,assignment_dump,routes_import_url,routes_organization,routes_extension,routes_monitors}.py`.*
