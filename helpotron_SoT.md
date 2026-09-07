# Helpotron — Source of Truth (SoT)
Permanent Architectural Constraints & Product North Star for Audits, Refactors, Redesigns, and Autonomous Agentic Improvement Cycles.

**Owner:** 16-Year-Old Solo Developer / Operator  
**Last Updated:** August 24, 2026 (v20 Master Plan Alignment)  
**Status:** Active / Immutable Invariant  

---

## 1. Project Identity & Development Context
Helpotron is an AI-native academic productivity and study operating system centered around the user's personal, configurable AI agent.

### Core Philosophy:
> "Tell My Agent what you want, or configure exactly how it behaves yourself."

The product is built on a dual-layer UX doctrine: simple, focused, and low-cognitive-load on the surface; deeply capable, configurable, and automated underneath.

### Developer & Operational Context:
- **Solo Developer (16yo):** Helpotron is engineered and maintained by a single technical owner/developer.
- **Operating Principle:** Optimize exclusively for high leverage, automation, maintainability, reusable primitives, and agent-assisted administration.
- **Zero Enterprise Bureaucracy:** Do not design around multi-tiered approval layers, enterprise administrative ceremony, or bloated corporate workflows. Spend complexity budget on computational capability under the hood rather than UI navigation depth.
- **North Star Metric:** Maximum useful intelligence per dollar & maximum capability per unit of cognitive load.

---

## 2. Non-Negotiable AI Model & Routing Philosophy

### 2.1 Pure Effort-Based Abstraction (No Model Selection UI)
- Normal user and admin interfaces never expose model or provider pickers (e.g., no dropdowns selecting Claude, GPT, DeepSeek, Gemini, Llama, Qwen, etc.).
- The sole user-facing abstraction is **Effort**:
  - **Low** (fast, concise, budget-conscious grunt work)
  - **Medium** (balanced reasoning and depth)
  - **Advanced** (deep academic rigor, multi-step calculation, comprehensive citations)
  - **Auto-Routing** (dynamically selects effort based on assignment rubric and complexity)
- The interface communicates Effort and outcomes, never implementation plumbing.

### 2.2 Hard AI Economics Engine & Dynamic Grunt-Tier Qualification
- **Strict Ban on Claude and OpenAI GPT Models:** Due to extreme token inefficiency and high API costs that quickly drain student credit budgets, Claude and GPT models are strictly prohibited from normal routing cascades.
- **Strict Ban on Legacy Models:** Models from previous generations (`deepseek/deepseek-chat`, `deepseek/deepseek-v3`, `deepseek/deepseek-r1`, `google/gemini-1.5-*`, `google/gemini-2.0-*`) are strictly banned from production routing.
- **Approved Active Catalog:**
  - **Primary Frontier Reasoning & Text:** `deepseek/deepseek-v4-flash-vision`, `deepseek/deepseek-v4-pro-vision`
  - **Primary Multimodal, OCR & Vision:** `google/gemini-3.1-flash-lite`, `google/gemini-3.8-flash` (for Canvas LMS document ingestion, image/diagram recognition, audio/video lecture transcription, and visual OCR)
  - **Auxiliary Grunt Worker Pool:** `qwen/qwen-2.5-72b-instruct`, `mistralai/mistral-nemo`, `nvidia/nemotron-mini-4b-instruct`
- **Dynamic Grunt-Tier Invariant:**
  $$\text{effective\_candidate\_cost} < \text{deepseek\_baseline\_cost} \land \text{minimum\_capability\_met} == \text{True} \land \text{reliability} \ge 0.985$$
- **Low-Effort Cost Contract:** Use the cheapest eligible model capable of completing the task to the required minimum quality. Never knowingly pay DeepSeek or frontier pricing for work that qualifies as grunt work.
- **Routing Decision Pipeline:**
  $$\text{Capability Eligibility} \longrightarrow \text{Economic Eligibility} \longrightarrow \text{Reliability/Latency} \longrightarrow \text{Execution} \longrightarrow \text{Telemetry}$$
- **Escalation Policy:** Hard failure when no grunt model qualifies $\longrightarrow$ escalate to next tier + log escalation event with detailed rationale to Admin Cost Intelligence.
- **Target Gross Margin:** Internal routing must strictly preserve 75%–85%+ operational gross margins.

### 2.3 Scoped Effort Configuration
Effort can be configured globally or overridden at granular entity scopes:

```text
Global Scope       →   Medium (Default)
  └── Subject Scope    →   Advanced (e.g., Biology 101)
        └── Assignment →   Low (e.g., Quiz Review #2)
```

- When Auto-Routing is enabled, manual effort controls become visibly disabled with a clear explanation badge. Disabling Auto-Routing immediately restores manual control.
- The UI must always display the Effective Effort Value and provenance (where the setting was inherited from).

---

## 3. "My Agent" Control Plane & User Experience

### 3.1 Single Canonical User Agent
- The primary user-facing agent is **My Agent** embedded directly in `AppShell.jsx`.
- There is no competing generic "Agent", "Agent Overlord", or fragmented agent sidebar.

### 3.2 Full-System Capability via My Agent
Users can instruct My Agent in natural language to perform any supported operation they have permissions for:
- Modifying settings and scoping rules
- Configuring effort levels
- Ingesting and solving assignments
- Launching contextual study tools (quizzes, flashcards, explanations)
- Uploading custom context/rules/skills
- Explaining complex settings or academic progress

### 3.3 Zero-AI-Cost Manual Control vs. Agent Orchestration
- **Manual Path:** 100% free of AI token costs; direct user interaction with UI forms and settings.
- **Agent Path:** Consumes computational credits for natural language processing and autonomous execution.

### 3.4 Action Ledger & 1-Click Undo
- Every autonomous state mutation performed by My Agent is recorded in an immutable Action Ledger.
- **Displays:** Action ID, Before State, After State, Scope, Reason, and a 1-Click Undo / Rollback button.

---

## 4. User-Provided Agent Extensions (Skills, Rules & Context)
Users can extend My Agent by uploading supported context artifacts:
- Context markdown documents (`.md`, `.txt`)
- Custom rules (`RULES.md`, prompt constraints)
- Custom skills (`SKILL.md`)

Custom extensions must operate within strict AST / sandbox execution boundaries without arbitrary code execution vulnerabilities.

---

## 5. Universal Scoped Settings & Effective Configuration

### 5.1 Deterministic Precedence Hierarchy
All configurable parameters resolve through a strict 6-tier hierarchy:

```text
Global
  ↓
Subject
  ↓
Class
  ↓
Teacher
  ↓
Assignment
  ↓
Task
```

### 5.2 Effective Value Inspector
Every scoped setting UI exposes an Effective Configuration Inspector:
- Shows the current active value.
- Shows the entire inheritance chain (`[Global: Medium]` → `[Subject: Advanced]` → `[Assignment: Low (Active)]`).
- Explains in natural language: *"Value 'Low' is active because it is explicitly overridden at the Assignment scope."*
- Provides an "Explain Why" button and an instant "Reset to Inherited" action.

### 5.3 Style Presets & Progressive Disclosure
- Avoids slider choice paralysis by wrapping granular settings into a Simple vs. Advanced toggle.
- Provides 4 intuitive presets:
  - **Fast & Concise** (Low effort, 0.5x latency)
  - **Balanced Standard** (Medium effort, optimal clarity)
  - **Deep Academic** (Advanced effort, formal citations, peer-reviewed rigor)
  - **Creative Synthesis** (Advanced effort, novel analogies, brainstorming)
- Includes a natural-language "Teach My Agent" input card.

---

## 6. Academic Workspace & Assignment-Centric UX

### 6.1 Core Navigation Structure
```text
Subjects → Assignments → Signature Assignment Workspace
```
The dashboard prioritizes **Active Work & Due Soon (within 48 hours)** rather than large empty history tables.

### 6.2 Signature Assignment Workspace
Assignments are the primary unit of work. The workspace features:
- **Visible Subagent Team Telemetry:**
  - Researcher (Source extraction & paper analysis)
  - Analyst (Calculations, reasoning & draft synthesis)
  - Reviewer (Academic rigor, APA formatting & rubric checks)
  - Displays real-time progress bars and status indicators.
- **Interactive Task DAG Checklist:** Hierarchical checklist tracking assignment milestones from rubric extraction to final verification.
- **Contextual Study Tools Drawer:** Embedded tools (Explain Concept, Quiz Me, Flashcards FSRS v5, Find Weak Areas) contextualized to the current assignment and subject.

---

## 7. Contextual Study Tools & Spaced Repetition
Study tools live where the student works (inside assignment drawers and course modules), not isolated in a disconnected top-level hub.

### Built-in algorithms:
- **FSRS v5 Scheduler:** Free Spaced Repetition Scheduler (`server/fsrs_scheduler.py`) outperforming legacy SM-2.
- **Anki 2.1 .apkg Binary Exporter:** One-click native deck export with embedded media and tags.
- **Google Docs API Exporter:** Formatted export with headers, tables, and citations.

---

## 8. Insights & Intelligence Layer
- **Zombie-Content Purge:** Complete removal of fabricated charts, hardcoded analytics, and fake telemetry. Only real production data, deliberate empty states, or explicit Mock Mode are permitted.
- **Study Activity:** "Study Activity" (minutes actively studied over the past 7/14/30 days) replaces vanity telemetry.
- **Your Next Best Action:** Prominent hero card indicating the exact assignment, due date, progress %, rationale, and a 1-click start action.
- **Contextual Explain This:** Deep invocation of My Agent with exact background metrics.
- **Consolidated API:** `InsightsSnapshot` endpoint consolidates metrics to eliminate request waterfalls.

---

## 9. Canonical Surface Mapping & Anti-Duplication
Each major concept has exactly one canonical surface:
- **Billing:** Canonical surface is `/billing` (No competing "Credit Wallet", "CreditsView", or duplicate settings sub-tabs).
- **Navigation:** Canonical shell is `AppShell.jsx` (Legacy `Navbar.jsx` is deprecated).
- **Settings:** Canonical surface is `SettingsApp.jsx` with Scoped Settings integration.
- **Admin:** Canonical surface is `AdminConsole.jsx` (Roni's Mission Control).
- **Visual Invariants:** Transparent SVG logos without background tiles, unified Lucide icon system, and reduced card nesting depth.

---

## 10. Solo-Developer Mission Control (Admin Center)
Admin is engineered specifically for a single technical owner/operator (Roni). It answers:
> *What is happening? What is wrong? Why? What changed? What should I do next?*

```text
CONTROL CENTER (Roni's Mission Control)
├── 1. COMMAND (Default Home)
│   ├── Platform Pulse (Live status strip)
│   ├── Needs Attention (Incident queue)
│   ├── Operator Actions (Kill switches, broadcast, user search)
│   ├── What Changed (Changelog diffs & rollback)
│   └── Morning Briefing (Proactive daily briefing)
├── 2. PEOPLE (User 360, Health score, Journey replay, Cohorts)
├── 3. AI & AGENTS (Routing telemetry, Cost attribution, Cascade simulator)
├── 4. PRODUCT (Feature flags, Emergency kill switches, Rollout simulator)
├── 5. SYSTEM (Simplified 3-Mode System Map: Overview, Live, Investigate)
└── 6. FINANCE (Margin intelligence, Cost anomaly radar, Billing telemetry)
```

### 10.1 Solo-Dev Superpowers
- **Intent-First Operator Briefing:** Default home surface answers: (1) What's happening? (2) What needs attention? (3) What changed? (4) What should I do? (5) Ask Admin Agent.
- **Admin Agent:** Universal operator assistant with Action Preview & Blast Radius rails before executing bulk/destructive actions.
- **Simplified 3-Mode System Map:**
  - **Overview:** Subsystem node status list with clean operational dots (● Operational, ● Degraded, ○ Offline).
  - **Live:** Real-time incoming request and error stream.
  - **Investigate:** Deep contextual telemetry inspector on click.

---

## 11. Mock / Preview Mode vs. Production Zero-Fake-Data Invariant

### 11.1 Mock Preview Mode (Developer Toggle)
- Mock Mode is an explicit toggle (`isMockMode = true`) for visual QA, previewing busy states, and screenshot generation.
- Clearly badged in the UI: `MOCK PREVIEW MODE ON`.
- Must remain strictly isolated from production database records.

### 11.2 Zero Fake Data Invariant (When Mock Mode is OFF)
- **Absolute Ban on Fabricated Data:** No fake latency (42ms), no hardcoded user counts (`{stats?.user_count || 1284}`), and no mock activity arrays in production.
- If data is unavailable, loading, or not connected, render explicit empty states:
  - Text: `"--"` or `"Unavailable"`
  - Lists: `"No activity recorded"` or `"Not connected"`
- Never fabricate healthy status or fake metrics.

---

## 12. Universal No-Dead-Control Rule
Every visible interactive control must:
1. Perform a real, implemented backend action,
2. Navigate to a real, implemented surface,
3. Open a real contextual drawer/dialog,
4. Be visibly disabled with a descriptive tooltip explaining why,
5. Or be completely removed from the DOM.

**Prohibited:** Placeholder handlers (`onClick={() => {}}`), fake success toasts, dead buttons (*Simulate Traffic*, *Flush Cache*), and mock dialogs.

---

## 13. Behavioral Verification & Anti-Bum Quality Standard
Source code existence (grep) is never proof that a feature works. Verification must follow:

```text
Code Implementation
  ↓
AST / Syntax Compilation Check
  ↓
API Integration / TestClient Simulation
  ↓
Database State Persistence Verification
  ↓
Browser-Level Acceptance & Reload State Check
  ↓
Visual QA & Responsive Breakpoint Validation
```

---

## 14. UX Complexity Budget & Cognitive Load Gate
Helpotron enforces a mathematical Cognitive Load Budget:

$$\text{Complexity Score} = 0.20 \cdot C_{\text{choices}} + 0.15 \cdot D_{\text{nav}} + 0.15 \cdot V_{\text{controls}} + 0.15 \cdot T_{\text{terms}} + 0.15 \cdot D_{\text{visual}} + 0.10 \cdot C_{\text{cta}} + 0.10 \cdot P_{\text{panels}}$$

- **Passing Threshold:** $\text{Complexity Score} \le 3.5 / 10$ across all student surfaces.
- Automated design QA gates fail any student surface exceeding 3.5/10.

---

## 15. Summary for Future Audits
When auditing or modifying the Helpotron repository:
1. **Never introduce Claude or GPT models** without explicit written owner override.
2. **Never expose model pickers in normal UI** — maintain the pure Effort abstraction.
3. **Never fabricate telemetry** — respect the Zero-Fake-Data rule when mock mode is OFF.
4. **Never create dead buttons or placeholder stubs** — enforce the No-Dead-Control rule.
5. **Preserve single canonical surfaces** — do not re-introduce duplicate navbars or admin toolboxes.
6. **Enforce hard AI economics** — require dynamic grunt-tier qualification against the DeepSeek baseline cost.
7. **Prioritize the solo developer** — build intelligence and leverage into Mission Control.
