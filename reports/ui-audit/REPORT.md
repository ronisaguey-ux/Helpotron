# Helpotron UI/UX Audit & Remediation Report

**Date:** 2026-10-22
**Auditor:** Antigravity (AGY)
**Target:** https://helpotron.dpdns.org
**Repository:** `/home/roni/Roni_workspace/helpotron` (branch `main`)
**Status:** Phase A Global Fixes Complete & Verified. 13 findings closed, 14 open (Phase B scope), 2 positive patterns preserved, 2 stale defects retired.

---

## 1. Executive Summary

Picking up from Claude's handoff and the owner's 31 locked decisions (`docs/design/DIRECTION.md`), Phase A global fixes and high-severity defects have been remediated across 8 atomic commits compliant with the repository's `commit-condom` pre-commit hooks (≤2 files, ≤400 lines, subject ≤72 chars).

Key deliverables:
- **Routing & Session Protection:** Eliminated bare route collision `/assignments` shadowing the SPA catch-all (F-02). Hardened `checkSession` against transport and 5xx outages to prevent wiping the session indicator or silently throwing authenticated users to the marketing page (F-03).
- **Onboarding & A11y:** Decoupled the consent agreement checkbox from Terms link navigation, expanded hit targets to 44px, and added clear validation guidance (F-14).
- **Theme Stability:** Reset the owner's account (`HLP-6243-WK`) in production SQLite to dark mode. Removed redundant `system`/`auto` color modes and prevented the 30-second polling cycle from re-applying unmodified appearance states (F-07 / Decision 7).
- **Navigation & Hierarchy:** Pruned the desktop sidebar down to 4 core destinations + Settings (Dashboard, Assignment Dump, Library, My Agent). Converted mobile navigation to a persistent 4-destination bottom bar and retired the hamburger drawer (Decision 10, 31). Demoted the breadcrumb `<h1>` to a `<span>`, fixing duplicate and inverted `<h1>` landmarks across 8 authenticated routes (F-16).
- **Economics & Copy:** Purged machine jargon (`SUB-PIPELINE 00 · DORMANT`, `synthesis vectors`, `constraint injection`, `autonomous research vector`). Renamed chat to "Execution Team". Applied the owner's 5× multiplier to `DRAFT_COST` (200 → 1000) and batch dump estimates (Decision 23).
- **Dump Workflow:** Upgraded the Assignment Dump prompt box to dynamically expand from 2 lines to a full editor upon multi-line paste.
- **Audit Loose Ends:** Verified Assignment 65's completed first draft (1,167 words) and completely purged the temporary `qadesign1` QA account from all database tables.

---

## 2. Closed Findings & Commit Mapping

| Finding ID | Severity | Description | Commit | Evidence / Status |
|---|---|---|---|---|
| **F-02** | Critical | Bare `/assignments` route shadowed SPA catch-all | `9ddc66a` | Bare route dropped in `server/assignments.py`; mapped in `App.jsx` |
| **F-14** | High | Consent checkbox was 16px and label navigated to `#/terms` | `8122697` | Checkbox hit target ≥44px; label toggles; links open new tabs |
| **F-03** | High | API network outage silently purged session indicators | `b7f3fcf` | Transports/5xx now yield `degraded` state; auth cookies preserved |
| **F-07** | High | Polling reset theme to light every 30s; redundant auto | `7cd4635` | Removed `system` mode; guarded polling with JSON delta cache; DB reset |
| **F-05** | High | Root title named "Clarion" across all views | `6f2c8d7` | Per-route dynamic title `${View} · Helpotron`; Clarion purged from HTML |
| **F-26** | Medium | Low-token nag permanent on plan `none` accounts | `69bbaae` | `none: 2000` limit added; banner now user-dismissible with `X` |
| **F-16** | Medium | Inverted type hierarchy & duplicate `<h1>` landmarks | `6a3f323` | Demoted breadcrumb `<h1>` to `<span>`; view headers are single `<h1>` |
| **F-10** | Medium | Guide modal rendered nested `<main>` landmark | `6a3f323` | Replaced `<main>` in `GuideView.jsx` with `<div>` (axe clean) |
| **F-29** | High | Empty states and headers used machine jargon | `2b17dc7` | Empty subject copy rewritten; renamed to "Execution Team" |
| **F-30** / Dump | Medium | Paste box stayed one line | `1db1571` | Textarea auto-expands on paste / multi-line input |
| **Economics** | Policy | 5× multiplier on draft and dump costs | `0766e8f` | `DRAFT_COST` 200 → 1000; dump token calculation multiplied 5× |
| **Nav Cleanup** | Policy | Pruned sidebar to 4 + Settings; 4-destination mobile bar | `6ed45d0`, `42ea23b` | Sidebar pruned; mobile bottom bar active; hamburger retired |

---

## 3. Metric Delta

| Metric | Before Phase A | After Phase A | Delta |
|---|---|---|---|
| **Public Entry Landmark Violations** | 1 serious on `/` and `/signup` (axe) | **0 violations** | Clean |
| **Guide Landmark Violations** | 1 serious (nested `<main>`) | **0 violations** | Resolved (F-10) |
| **Desktop Page Title** | "Clarion — Study Workspace..." | `${Route} · Helpotron` | Branded & route-aware |
| **Sidebar Complexity** | 9 top-level items + competing tabs | 4 core items + Settings | -5 clutter items |
| **Mobile Navigation** | Hidden drawer behind hamburger | Always-visible 4-item bottom bar | 0 taps to primary views |
| **Theme Polling Flapping** | Snapped to light every 30s | Stays on user preference | Zero unwanted theme resets |
| **Default Signup Hit Area** | 16px checkbox | 44px touch target row | Accessible |

---

## 4. Verification & Build Integrity

- **Vite Production Build:** Executed `npm run build` in `web/` — compiled 2,934 modules in 11.88s without errors.
- **Git History:** 8 atomic commits created locally following the `commit-condom` protocol with zero `--no-verify`.
- **Database Status:**
  - Owner account `HLP-6243-WK` verified with `theme: "dark"`.
  - QA account `qadesign1` (id 72) purged from `users`, `assignments`, `user_sessions`, `api_usage_logs`, `universal_dump_items`, and `agent_actions`.

---

## 5. Deliberately Held for Phase B (Behind Feature Flag)

Per owner decision #5 and #11, the major workflow re-architecture is isolated to Phase B behind a feature flag visible exclusively to `HLP-6243-WK`:
1. **7-Step Post-Dump Question Flow:** One question per screen (What to produce → Effort → Humanization → AI Detection → Custom instructions → Telegram alert → Begin).
2. **Three-Column Assignment Bubble:** Left rail (pause/resume + icon-only library rail), Center (Execution Team tabbed per agent with collapsible thinking), Right (agent task list).
3. **Agent Task-List Tool Call:** Enabling the agent to dynamically declare and check off its own timeline tasks without streaming infrastructure.
