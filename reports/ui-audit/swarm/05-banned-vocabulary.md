# 05 — Banned vocabulary / machine-language copy rewrite worksheet

**Status: PARTIAL — stopped mid-sweep on coordinator instruction.**
Static analysis only. No product file was edited. Repo: `/home/roni/Roni_workspace/helpotron`.

Rule applied, from `docs/design/DIRECTION.md` §3: *say what the user gets, not what the
system does.* Audience: a hurried student on a phone. Example from the doc:
*"Select Autonomous Research Vector"* → *"What do you want?"*

**KEEP-vocabulary (must NOT be changed anywhere):** subject bubble · assignment ·
Data Lake · Library · Insights · credits · token balance · Study Buddy · Agent ·
My Agent · Assignment Dump.

Legend in last column: **BANNED** = on the owner's confirmed ban list (or a direct
inflection of it). **JUDGEMENT** = not on the list, but a student would not say it.

---

## 1. Rewrite table — worst offenders first

### `web/src/components/DirectionPicker.jsx` — WORST OFFENDER
This is the screen the owner's `"Select Autonomous Research Vector"` complaint names.
Six tiles, each with a `tag` that is pure decoration, and headings nobody would say.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| DirectionPicker.jsx:103 | `Execution Path` (eyebrow label) | *delete the eyebrow entirely* | BANNED |
| DirectionPicker.jsx:107 | `Select Autonomous Research Vector` (h3) | `What do you want?` | BANNED |
| DirectionPicker.jsx:110 | `Pick an execution template or configure custom instructions for continuous agentic pipeline execution.` | `Pick one, or describe something else.` | BANNED (execution, agentic, pipeline) |
| DirectionPicker.jsx:117 | `aria-label="Autonomous Research Vectors"` | `aria-label="What do you want?"` | BANNED |
| DirectionPicker.jsx:19 | `tag: 'Autonomous'` | *delete all six `tag` values — they add nothing* | BANNED |
| DirectionPicker.jsx:20 | `Full autonomous pipeline execution: research, synthesis, proof checking, and cadence humanization.` | `We do the whole thing — research it, write it, check it, make it sound like you.` | BANNED (autonomous, pipeline, synthesis, cadence humanization) |
| DirectionPicker.jsx:25 | `tag: 'Review'` | *delete* | JUDGEMENT |
| DirectionPicker.jsx:27 | `Structured conceptual breakdown, essential definitions, and step-by-step problem walkthroughs.` | `Key ideas, definitions, and worked examples.` | JUDGEMENT |
| DirectionPicker.jsx:32 | `tag: 'Assessment'` | *delete* | JUDGEMENT |
| DirectionPicker.jsx:34 | `Active recall test suite with answer explanations and difficulty calibration.` | `Practice questions with answers explained.` | JUDGEMENT (test suite, calibration) |
| DirectionPicker.jsx:39 | `tag: 'Spaced Repetition'` | *delete* | JUDGEMENT |
| DirectionPicker.jsx:41 | `Spaced repetition deck optimized for key definitions, formulas, and historical dates.` | `Cards for the definitions, formulas and dates you need to memorise.` | JUDGEMENT |
| DirectionPicker.jsx:46 | `tag: 'Abstract'` | *delete* | JUDGEMENT |
| DirectionPicker.jsx:48 | `High-density executive abstract summarizing central theses, methods, and results.` | `A short version — the main points only.` | JUDGEMENT |
| DirectionPicker.jsx:54 | `tag: 'Bespoke'` | *delete* | JUDGEMENT |
| DirectionPicker.jsx:55 | `Define custom prompt directives or specialized derivation structures.` | `Tell us what you need instead.` | BANNED (directives, derivation) |
| DirectionPicker.jsx:200 | `Specify Custom Autonomous Trajectory` (label) | `What do you need?` | BANNED (autonomous; "trajectory" = vector) |
| DirectionPicker.jsx:204 | `Data Lake Sync` | `Saved to Data Lake` — KEEP "Data Lake", drop "Sync" | JUDGEMENT |
| DirectionPicker.jsx:213 | `placeholder="e.g. Provide a 3-part proof by contradiction with formal lemmas and verify against LaTeX..."` | `e.g. just the first two questions, show your working` | JUDGEMENT (placeholder is a maths-PhD sentence on a student's first screen) |
| DirectionPicker.jsx:226 | `Apply Vector` (submit button) | `Start` | BANNED |

### `web/src/lib/team.js` — the four pipeline node names, rendered verbatim in the timeline
Every string here reaches the screen via `AgentTimeline.jsx`.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| team.js:11 | `Deconstruction & Research` (node name) | `Reading your assignment` | BANNED |
| team.js:12 | `role: 'Planner / Researcher'` | `Researcher` | JUDGEMENT |
| team.js:13 | `Deconstruct prompt constraints, parse syllabus rubric, and establish factual grounding.` | `Reading the question and the rubric, and looking things up.` | BANNED (deconstruct) |
| team.js:18 | `Synthesis & Derivation` | `Writing it` | BANNED (synthesis, derivation) |
| team.js:19 | `role: 'Synthesis Engine'` | `Writer` | BANNED |
| team.js:20 | `Execute deep derivation, formalize arguments, and generate core academic draft.` | `Working out the answer and writing the first draft.` | BANNED (derivation) |
| team.js:25 | `Cadence Humanization` | `Making it sound like you` | BANNED |
| team.js:26 | `role: 'Style Matching'` | `Editor` | JUDGEMENT |
| team.js:27 | `Vary syntactic complexity, calibrate burstiness, and align prose cadence to student style.` | `Rewriting so it reads like your own writing.` | BANNED (burstiness, cadence) |
| team.js:32 | `Quality & Integrity Seal` | `Checking it` | BANNED (integrity seal) |
| team.js:33 | `role: 'Integrity Validator'` | `Checker` | BANNED |
| team.js:34 | `Audit citation topology, verify human-style review score, and lock final submission package.` | `Checking the sources and the AI score before it's handed back.` | BANNED (citation topology) |
| team.js:53 | `phaseText: 'QUORUM PHASE 4/4 · FINALIZED'` | `Done` | JUDGEMENT (quorum) |
| team.js:61 | `note: 'VERIFIED · PASSED'` | `Done` | JUDGEMENT |
| team.js:68 | `phaseText: 'EXECUTION HALTED BY OPERATOR'` | `Paused by you` | JUDGEMENT (execution, operator) |
| team.js:76 | `note: i === 1 ? 'INTERRUPTED' : …'WAITING'` | `Paused` / `Not started` | JUDGEMENT |
| team.js:83 | `phaseText: 'QUORUM PHASE 3/4 · ACTIVE'` | `Step 3 of 4` | JUDGEMENT (quorum) |
| team.js:91 | `note: … 'OPTIMIZING CADENCE' : 'QUEUED'` | `Working on it` / `Next` | BANNED (cadence) |
| team.js:99 | `phaseText: 'PIPELINE ARMED · AWAITING DIRECTION'` | `Not started — tell it what you want` | BANNED (both halves) |
| team.js:106 | `note: 'WAITING'` | `Not started` | JUDGEMENT |

### `web/src/components/AgentTimeline.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AgentTimeline.jsx:44 | `Pipeline Telemetry` (eyebrow) | *delete the eyebrow* | BANNED |
| AgentTimeline.jsx:48 | `Autonomous Pipeline Activity` (h3) | `Progress` | BANNED |
| AgentTimeline.jsx:57 | `Pipeline Halted` | `Paused` — and it needs a Resume next to it (open owner bug) | BANNED |
| AgentTimeline.jsx:63 | `Finished` | `Done` | JUDGEMENT |
| AgentTimeline.jsx:70 | `title="Immediately halt all active inference subagent threads"` | `Stop the agents working on this` | BANNED (inference, subagent threads) |
| AgentTimeline.jsx:73 | `Stop Execution` / `Stopping...` | `Pause` / `Pausing…` (decision 17: it is a checkpoint, not a kill) | BANNED (execution) |
| AgentTimeline.jsx:89 | `RESOLVED` (progress unit next to the %) | `done` | BANNED ("resolved" as a progress unit — named explicitly) |
| AgentTimeline.jsx:171 | `Step {node.index} • {node.role}` | keep — `Step N` is fine once `role` is plain | — |

### `web/src/components/AssignmentDetailView.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AssignmentDetailView.jsx:147 | `No assignment node selected` (h3) | `No assignment open` | JUDGEMENT (node) |
| AssignmentDetailView.jsx:150 | `Select an assignment from your home dashboard or course directory to open its workspace.` | `Pick an assignment from your dashboard.` | JUDGEMENT |
| AssignmentDetailView.jsx:177 | `✅ Direction set to "{dir}".` | `Got it — {dir}.` | JUDGEMENT (emoji-as-icon banned by decision 12) |
| AssignmentDetailView.jsx:183 | `❌ Failed to set direction: {msg}` | `Couldn't save that — try again.` | JUDGEMENT |
| AssignmentDetailView.jsx:193 | `interruptSubagentTeam(id, 'Student clicked Stop Execution')` — reason string may surface in logs/UI | `'Paused by the student'` | BANNED (subagent, execution) |
| AssignmentDetailView.jsx:195 | `⚠️ Pipeline halted. Subagent processes paused.` | `Paused. Nothing was lost — resume when you're ready.` | BANNED (pipeline halted, subagent) |
| AssignmentDetailView.jsx:210 | `✅ Assignment marked complete and verified.` | `Marked done.` | JUDGEMENT ("verified" overclaims) |
| AssignmentDetailView.jsx:225 | `📦 Assignment archived to Submission Ledger.` | `Moved to History.` | JUDGEMENT (Submission Ledger is not a thing the user has a name for) |
| AssignmentDetailView.jsx:242 | `✅ Assignment payload archive exported.` | `Downloaded.` | BANNED (payload) |
| AssignmentDetailView.jsx:272 | `'Instruction received. Pipeline updated.'` (fallback agent reply) | `Got it.` | BANNED (pipeline) |
| AssignmentDetailView.jsx:284 | `'Could not dispatch message to agent node.'` | `Message didn't send. Try again.` | JUDGEMENT (dispatch, node) |
| AssignmentDetailView.jsx:310 | `Active Subjects` (breadcrumb) | `Your subjects` (match the dashboard h2 at AssignmentCardDashboard.jsx:478) | JUDGEMENT |
| AssignmentDetailView.jsx:317 | `ID // {last6}` | `#{last6}` | JUDGEMENT (`//` is a code sigil) |
| AssignmentDetailView.jsx:339 | `ASSIGNMENT AGENT` (badge) | *delete — it labels a thing the user cannot act on* | JUDGEMENT |
| AssignmentDetailView.jsx:422 | `Execution Team` (h3) | **KEEP** — this is the owner's own requested name | — |
| AssignmentDetailView.jsx:425 | `Collaborate directly with the team working on this assignment` | `Tell the team what to change.` | JUDGEMENT (collaborate) |
| AssignmentDetailView.jsx:437 | `Analyzing {subject} requirements for "{title}". Formulating structural argument vectors and preparing research proof trees.` | `Reading the question and working out how to answer it.` | BANNED (vectors) + fabricated-sounding |
| AssignmentDetailView.jsx:445 | `Session initialized. Send a directive or guideline to instruct the subagent team.` | `Nothing yet — type a message to the team.` | BANNED (initialized, directive, subagent team) |
| AssignmentDetailView.jsx:472 | `placeholder="Instruct the agent team about {title}..."` | `Message the team…` | JUDGEMENT (instruct) |

### `web/src/components/WorkingDraftCard.jsx`
**This is the empty state the owner quoted** ("launch an agent research thread to activate
synthesis vectors"). The literal sentence is not in the repo; lines 116+126 are the live
version of it.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| WorkingDraftCard.jsx:113 | `Nothing generated yet` (h4) | `Nothing written yet` | JUDGEMENT |
| WorkingDraftCard.jsx:116 | `Pick an autonomous research vector or coordinate with the agent team to generate the working draft.` | `Tell us what you want and we'll start.` | BANNED (autonomous research vector) |
| WorkingDraftCard.jsx:126 | `Select Vector` (the one primary CTA in the empty state) | `What do you want?` | BANNED |
| WorkingDraftCard.jsx:146 | `Synthesized Working Draft` (h3) | `Draft` | BANNED (synthesized) |
| WorkingDraftCard.jsx:152 | `Needs revision` | keep | — |
| WorkingDraftCard.jsx:157 | `Ready to review` | keep | — |
| WorkingDraftCard.jsx:168 | `Human Score: {n}%` | `Reads as human: {n}%` | JUDGEMENT |
| WorkingDraftCard.jsx:174 | `Detectors: {names}` | `Checked with: {names}` | JUDGEMENT |
| WorkingDraftCard.jsx:207 | `title="Launch to Google Doc with assistive typing"` | `Type this into a Google Doc` | JUDGEMENT (assistive typing) |
| WorkingDraftCard.jsx:219 | `title="Export JSON artifact"` | `Download as a file` | JUDGEMENT (JSON artifact) |
| WorkingDraftCard.jsx:244 | `Collapse Reading Mode` / `Expand Full Draft` | `Show less` / `Show all` | JUDGEMENT |
| WorkingDraftCard.jsx:256 | `Confirm archive to submission history?` | `Move this to History?` | JUDGEMENT |
| WorkingDraftCard.jsx:267 | `Archiving...` / `Yes, Archive` | `Moving…` / `Yes, move it` | JUDGEMENT |
| WorkingDraftCard.jsx:285 | `Move to History` | keep | — |
| WorkingDraftCard.jsx:298 | `Marking Done...` | `Saving…` | JUDGEMENT |

### `web/src/components/AssignmentConfigPanel.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AssignmentConfigPanel.jsx:24 | `{ id: 'flagship_model', label: 'Flagship model invocation' }` | `Using the most expensive model` | JUDGEMENT (invocation) |
| AssignmentConfigPanel.jsx:52 | `'Subject Module'` (fallback subject name) | `this subject` | JUDGEMENT (module) |
| AssignmentConfigPanel.jsx:68 | `'No explicit prompt instructions provided.'` | `No instructions were given.` | JUDGEMENT |
| AssignmentConfigPanel.jsx:97 | `Assignment Configuration & Context` (h3) | `Settings for this assignment` | JUDGEMENT |
| AssignmentConfigPanel.jsx:100 | `LEVEL 2 SCOPE` (chip) | *delete the chip* | BANNED (level 2 scope) |
| AssignmentConfigPanel.jsx:105 | `Citation: {x} · Gated: {n} rules · Inherits {subject}` | `{x} citations · asks before {n} things · otherwise follows {subject}` | JUDGEMENT (gated, inherits) |
| AssignmentConfigPanel.jsx:113 | `Global → {subject} → Assignment` (provenance trail) | keep the shape, but per DIRECTION §0.3 this is a server concern — consider deleting | JUDGEMENT |
| AssignmentConfigPanel.jsx:133 | `Autonomous Safety Gating ("Ask Me Before")` (label) | `Ask me before…` | BANNED (autonomous) + JUDGEMENT (gating) |
| AssignmentConfigPanel.jsx:136 | `{n} ACTIVE GATES` | `{n} on` | JUDGEMENT |
| AssignmentConfigPanel.jsx:162 | `{/* 2. CITATION TOPOLOGY PICKER */}` — comment only, **not rendered**; the rendered label at :165 is already `Citation Style` | no change needed in UI; rename the comment for hygiene | BANNED (in comment only) |
| AssignmentConfigPanel.jsx:205 | `Evaluation Rubric` | `Rubric` | JUDGEMENT |
| AssignmentConfigPanel.jsx:207 | `CRITERIA` (chip) | *delete* | JUDGEMENT |
| AssignmentConfigPanel.jsx:215 | `No rubric provided. Standard academic grading rubrics apply.` | `No rubric. We'll use normal grading.` | JUDGEMENT |
| AssignmentConfigPanel.jsx:228 | `Attached Source Files ({n})` | `Files ({n})` | JUDGEMENT |
| AssignmentConfigPanel.jsx:233 | `No files attached to this node.` | `No files yet.` | JUDGEMENT (node) |
| AssignmentConfigPanel.jsx:251 | `Synthesized Artifacts ({n})` | `What it made ({n})` | BANNED (synthesized) + JUDGEMENT (artifacts) |
| AssignmentConfigPanel.jsx:256 | `No artifacts generated yet.` | `Nothing made yet.` | JUDGEMENT (artifacts) |
| AssignmentConfigPanel.jsx:294 | `description="Rewrite replies for this assignment only."` | keep | — |
| AssignmentConfigPanel.jsx:311 | `description="Pin a different model budget for this assignment."` | `Use more or less effort on this one.` | JUDGEMENT (model budget) |

### `web/src/lib/statusChips.js`
`label` values **are** rendered (`StatusChip.jsx:27`). The `definition` values are
exported in `STATUS_MATRIX` but I confirmed **nothing renders them today** — the only
`.definition` read in the codebase is `study/FlashcardsPlayer.jsx:254`, which is a
flashcard's own definition, unrelated. They are latent, not live. Fix anyway: they are
one import away from being shown.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| statusChips.js:11 | `label: 'PENDING APPROVAL'` | `Needs your OK` | JUDGEMENT |
| statusChips.js:17 | `definition: 'Awaiting operator verification prior to synth cycle'` | `Waiting for you to approve it` | BANNED (synth) + JUDGEMENT (operator) — latent |
| statusChips.js:21 | `label: 'NOT STARTED'` | keep | — |
| statusChips.js:27 | `definition: 'Task initiated in queue; no generation has started'` | `Nothing has started yet` | JUDGEMENT — latent |
| statusChips.js:31 | `label: 'IN PROGRESS'` | keep | — |
| statusChips.js:37 | `definition: 'Active inference node executing context generation'` | `Working on it now` | JUDGEMENT (inference node) — latent |
| statusChips.js:41 | `label: 'PAUSED'` | keep | — |
| statusChips.js:47 | `definition: 'Temporarily suspended via operator control or token backpressure'` | `Paused — by you, or because you ran low on tokens` | JUDGEMENT (operator, backpressure) — latent |
| statusChips.js:51 | `label: 'HUMANIZING'` | `Making it sound like you` | JUDGEMENT |
| statusChips.js:57 | `definition: 'Syntactic variation & cadence humanization pipeline'` | `Rewriting it to read like your own work` | BANNED (cadence humanization) — latent |
| statusChips.js:61 | `label: 'READY FOR REVIEW'` | `Ready to read` | JUDGEMENT |
| statusChips.js:67 | `definition: 'Synthesis completed; operator sign-off required'` | `Done — have a read and approve it` | BANNED (synthesis) — latent |
| statusChips.js:77 | `definition: 'Payload artifact verified and localized to memory core'` | `Saved` | BANNED (payload) — latent |
| statusChips.js:87 | `definition: 'Dispatched downstream to recipient endpoint'` | `Handed in` | JUDGEMENT — latent |
| statusChips.js:107 | `label: 'TRACKED'` | `Being watched` — or delete the status | JUDGEMENT |
| statusChips.js:107 | `definition: 'Observability thread monitoring real-time telemetry'` | `We'll tell you when it changes` | BANNED (telemetry) — latent |
| statusChips.js:117 | `definition: 'Frozen historical state, read-only cold store'` | `In History — read only` | JUDGEMENT — latent |

Note: `statusChips.jsx` is a **near-duplicate dead file** — nothing imports it
(`StatusChip.jsx:2` imports `statusChips.js`). Flag for deletion rather than rewrite.

### `web/src/components/AssignmentDumpView.jsx`
Per DIRECTION §5 this surface's **four states are the reference and must not be
"fixed"** — so only the *words* below change, not the behaviour.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AssignmentDumpView.jsx:31 | `label: 'Complete the Assignment (Do It For Me)'` | `Do it for me` | JUDGEMENT |
| AssignmentDumpView.jsx:31 | `subagent: 'Researched Synthesis'` | *delete the `subagent` field on all four* | BANNED (synthesis, subagent) |
| AssignmentDumpView.jsx:31 | `Generates full finished essay, problem set solutions, or paper according to rubric.` | `A finished essay or worked solutions, following the rubric.` | JUDGEMENT |
| AssignmentDumpView.jsx:32 | `subagent: 'Semantic Condenser'` | *delete* | JUDGEMENT |
| AssignmentDumpView.jsx:33 | `label: 'Practice Exam & Quiz'` | `Practice quiz` | JUDGEMENT |
| AssignmentDumpView.jsx:33 | `subagent: 'Psychometric Evaluation'` | *delete* | JUDGEMENT |
| AssignmentDumpView.jsx:34 | `label: 'Spaced Flashcard Deck'` | `Flashcards` | JUDGEMENT |
| AssignmentDumpView.jsx:34 | `subagent: 'Anki / Leitner Engine'` | *delete* | JUDGEMENT (names two products the student does not use) |
| AssignmentDumpView.jsx:34 | `Builds interactive review cards ready for active-recall memorization.` | `Cards to test yourself with.` | JUDGEMENT |
| AssignmentDumpView.jsx:39,43 | `Est. ~1 Token` / `Est. ~{n} Tokens` | `about {n} tokens` | JUDGEMENT (`Est. ~` is double-hedged) |
| AssignmentDumpView.jsx:107 | `'Failed to fetch dumped items'` | `Couldn't load your dump.` | JUDGEMENT (fetch) |
| AssignmentDumpView.jsx:131 | `'Error uploading file to Assignment Dump'` | `That file didn't upload. Try again.` | JUDGEMENT |
| AssignmentDumpView.jsx:215 | `'Insufficient token balance'` | `Not enough tokens. Top up or drop an output.` (decision 16) | JUDGEMENT |
| AssignmentDumpView.jsx:220 | `'Assignment finalized (no work generated)'` | `Saved, but nothing was made.` | JUDGEMENT (finalized) |
| AssignmentDumpView.jsx:229 | `'Finalization failed'` | `That didn't go through. Try again.` | JUDGEMENT |
| AssignmentDumpView.jsx:239 | `'No pending items to dump. All items are already finalized.'` | `Everything here is already done.` | JUDGEMENT |
| AssignmentDumpView.jsx:253 | `'Failed to estimate batch costs'` | `Couldn't work out the cost. Try again.` | JUDGEMENT |
| AssignmentDumpView.jsx:286 | `'Batch finalization incomplete'` | `Some of those didn't finish.` | JUDGEMENT |
| AssignmentDumpView.jsx:317 | `Workspace Core` (breadcrumb) | *delete the breadcrumb* | JUDGEMENT |
| AssignmentDumpView.jsx:322 | `MATERIALS INTAKE` (chip) | *delete* | BANNED (intake ≈ task intake) |
| AssignmentDumpView.jsx:326 | `Universal Assignment Dump` (h1) | `Assignment Dump` — KEEP the product name, drop "Universal" | JUDGEMENT |
| AssignmentDumpView.jsx:341 | `Dump All ({n} pending)` | keep | — |
| AssignmentDumpView.jsx:414 | `Supports PDF, DOCX, TXT, images, and audio. Intelligent OCR & lecture chunking will extract curriculum contents automatically.` | `PDFs, Word docs, text, photos and audio. We'll pull the text out.` | JUDGEMENT (OCR, chunking, curriculum contents) |
| AssignmentDumpView.jsx:443 | `Processing OCR & audio extraction... this can take a moment for long files.` | `Reading your file… long ones take a minute.` | JUDGEMENT (OCR) |
| AssignmentDumpView.jsx:454 | `Paste Assignment Prompt / Rubric` | `Paste the question` | JUDGEMENT |
| AssignmentDumpView.jsx:478 | `Live Lecture Audio Intake` | `Record a lecture` | BANNED (intake) |
| AssignmentDumpView.jsx:481 | `Record classroom discussions or lectures directly. Extracted audio is transcribed into modular study decks.` | `Record a class. We'll turn it into notes and flashcards.` | BANNED (modular study decks) |
| AssignmentDumpView.jsx:543 | `No assignment items in queue` (h4 — empty state) | `Nothing dumped yet` | JUDGEMENT (queue) |
| AssignmentDumpView.jsx:576 | `'No text extracted yet'` | `No text yet` | JUDGEMENT |
| AssignmentDumpView.jsx:591 | `Finalized` (chip) | `Done` | JUDGEMENT |
| AssignmentDumpView.jsx:599 | `Choose Action` | `What do you want?` | JUDGEMENT |
| AssignmentDumpView.jsx:626 | `title="Delete dumped item"` | `Delete` | JUDGEMENT |
| AssignmentDumpView.jsx:651 | `2-Step Spend Confirmation` (chip) | *delete* | JUDGEMENT |
| AssignmentDumpView.jsx:654 | `Batch Finalize Deliverables` (modal h3) | `Before we start` | JUDGEMENT (batch, finalize, deliverables) |
| AssignmentDumpView.jsx:670 | `Deliverables` (stat label) | `Files` | JUDGEMENT |
| AssignmentDumpView.jsx:682 | `Est. Tokens` | `Tokens` | JUDGEMENT |
| AssignmentDumpView.jsx:687 | `Deterministic rate` | *delete* | JUDGEMENT |
| AssignmentDumpView.jsx:692 | `Est. Cost` | `Cost` | JUDGEMENT |
| AssignmentDumpView.jsx:697 | `Metered by task content` | `Depends on how long your files are` | JUDGEMENT |
| AssignmentDumpView.jsx:704 | `Current Balance: {n} Tokens` | `You have {n} tokens` | JUDGEMENT |
| AssignmentDumpView.jsx:707 | `Remaining After: {n} Tokens` | `Left after this: {n}` | JUDGEMENT |
| AssignmentDumpView.jsx:714 | `Generation Type for All Deliverables` (select label) | `What should we make?` | JUDGEMENT |
| AssignmentDumpView.jsx:721-725 | `🗂️ Flashcards (Spaced Repetition Decks)` / `🧠 Practice Quiz …` / `📖 Exam Study Guide …` / `📄 Concise Summary` / `✍️ Do It For Me (Complete Solutions)` | `Flashcards` / `Practice quiz` / `Study guide` / `Summary` / `Do it for me` — **and strip the emoji**: decision 12 bans emoji as iconography | JUDGEMENT |
| AssignmentDumpView.jsx:733 | `Deliverable Checklist (Uncheck to Skip)` | `Untick anything you want to skip` | JUDGEMENT |
| AssignmentDumpView.jsx:735 | `Zero-spend on deselected files` | `Skipped files cost nothing` | JUDGEMENT |
| AssignmentDumpView.jsx:762 | `SKIPPED · $0.00` | `Skipped` | JUDGEMENT |
| AssignmentDumpView.jsx:785 | `Finalizing...` / `Confirm & Finalize ({n} items · ~${x})` | `Starting…` / `Start — {n} files, about ${x}` (the owner's open bug: this hangs with no verb) | JUDGEMENT |
| AssignmentDumpView.jsx:802 | `Select Material Kind` (modal eyebrow) | `What do you want?` | JUDGEMENT |

### `web/src/components/AssignmentCardDashboard.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AssignmentCardDashboard.jsx:33 | `'Calculus, linear algebra, statistics & formal proofs'` | `Calculus, algebra, stats` | JUDGEMENT (formal proofs) |
| AssignmentCardDashboard.jsx:35 | `'Historiography, primary source evaluation & analysis'` | `Essays, sources, analysis` | JUDGEMENT (historiography) |
| AssignmentCardDashboard.jsx:37 | `'Genetics, cellular biology & lab investigations'` | `Genetics, cells, labs` | JUDGEMENT |
| AssignmentCardDashboard.jsx:38 | `'Empirical research, cognitive neuroscience & case studies'` | `Studies, the brain, case studies` | JUDGEMENT (empirical) |
| AssignmentCardDashboard.jsx:234 | `'Upstream telemetry service timed out.'` (fetch-error fallback) | `The server took too long. Nothing was changed.` | BANNED (telemetry) + JUDGEMENT (upstream) |
| AssignmentCardDashboard.jsx:250 | `✅ Subject "{title}" initialized.` | `Added {title}.` | JUDGEMENT (initialized) |
| AssignmentCardDashboard.jsx:258 | `'Delete this custom subject module?'` | `Delete {title}?` | JUDGEMENT (module) |
| AssignmentCardDashboard.jsx:263 | `'Failed to delete subject module.'` | `Couldn't delete it. Try again.` | JUDGEMENT (module) |
| AssignmentCardDashboard.jsx:278 | `✅ Complete data archive exported successfully.` | `Downloaded.` | JUDGEMENT |
| AssignmentCardDashboard.jsx:343 | `title: 'General & Electives'`, desc `'Cross-disciplinary coursework and unassigned problem sets'` | `Everything else` / `Work that didn't fit a subject` | JUDGEMENT |
| AssignmentCardDashboard.jsx:436 | `Server timed out` (chip) | keep | — |
| AssignmentCardDashboard.jsx:455 | `Reconnecting...` / `Retry Connection` | `Trying again…` / `Try again` | JUDGEMENT |
| AssignmentCardDashboard.jsx:478 | `Your subjects` (h2) | keep — and make it the `<h1>` (DIRECTION §4 hierarchy rule) | — |
| AssignmentCardDashboard.jsx:498 | `title="Export complete user data archive"` | `Download all your data` | JUDGEMENT |
| AssignmentCardDashboard.jsx:502 | `Export Archive` | `Download all` | JUDGEMENT |
| AssignmentCardDashboard.jsx:549 | `{n} assignments present` | `{n} assignments` — DIRECTION §4 also calls out that this is prose and must not be mono | JUDGEMENT |
| AssignmentCardDashboard.jsx:556 | `title="{n} setting(s) override the global default for this subject"` | `{n} settings are different here` | JUDGEMENT (override, global default) |
| AssignmentCardDashboard.jsx:560 | `{n} override(s) vs global` | `{n} changed here` | JUDGEMENT |
| AssignmentCardDashboard.jsx:663 | `{n} in progress · {m} pending approval` | `{n} being worked on · {m} need your OK` | JUDGEMENT |
| AssignmentCardDashboard.jsx:682 | `Subject Settings` | keep | — |
| AssignmentCardDashboard.jsx:714 | `Ready for assignments` (empty-state chip) | *delete the chip* | JUDGEMENT |
| AssignmentCardDashboard.jsx:718 | `No assignments in {subject} yet` | keep | — |
| AssignmentCardDashboard.jsx:721 | `Add assignment details, upload notes, or drop a prompt to get started with this subject.` | `Drop a file or paste the question.` | JUDGEMENT |
| AssignmentCardDashboard.jsx:729 | `Import Assignment` | `Add an assignment` | JUDGEMENT (import) |
| AssignmentCardDashboard.jsx:739 | `In Progress ({n})` | `Being worked on ({n})` | JUDGEMENT |
| **AssignmentCardDashboard.jsx:746** | **`Nothing in progress right now — kick off an agent thread and it will appear here.`** | **`Nothing being worked on. Open an assignment to start.`** | **BANNED — closest live match to the owner's quoted "launch an agent research thread" empty state** |
| AssignmentCardDashboard.jsx:769 | `Pending Approval` | `Needs your OK` | JUDGEMENT |
| AssignmentCardDashboard.jsx:781 | `Nothing needs your approval — you are all caught up.` | keep — already plain | — |

### `web/src/components/SubjectSettingsPanel.jsx`
Numbered `01 //` … `06 //` widget labels; the `//` is a code sigil.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| SubjectSettingsPanel.jsx:267 | `01 // EDUCATIONAL MODE` | `Educational mode` | JUDGEMENT (`//`) |
| SubjectSettingsPanel.jsx:270 | `Applies recursive heuristic reasoning chains to match genuine student derivation flow.` | `Explains the working instead of just giving the answer.` | BANNED (derivation) |
| SubjectSettingsPanel.jsx:324 | `02 // AGENT PERSONALITY` | `Personality` | JUDGEMENT |
| SubjectSettingsPanel.jsx:327 | `Governs rhetorical structure, voice register, proof depth, and citation topology.` | `Changes how it writes and how it cites.` | BANNED (citation topology) |
| SubjectSettingsPanel.jsx:~`03 //` | *(widget 3 label not captured before stop)* | — | NOT YET SWEPT |
| SubjectSettingsPanel.jsx:448 | `04 // MODEL EFFORT DIAL` | `Effort` | JUDGEMENT |
| SubjectSettingsPanel.jsx:451 | `Determines inference depth, multi-step tree-of-thought verification, and node cost.` | `Higher effort means more thinking, and more tokens.` | JUDGEMENT (inference, tree-of-thought, node) |
| SubjectSettingsPanel.jsx:~`05 //`, `06 //` | *(widgets 5 and 6 not captured before stop)* | — | NOT YET SWEPT |

### `web/src/components/SettingsSections.jsx`
Census in DIRECTION says: 20 actions, 7 competing CTAs, 5 jargon terms, 732 words.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| SettingsSections.jsx:262 | `Account Identity` | `Account` | JUDGEMENT |
| SettingsSections.jsx:265 | `Cryptographic user identifier and account security controls.` | `Your sign-in and security.` | JUDGEMENT (cryptographic identifier) |
| SettingsSections.jsx:364 | `Active Tier Subscription` | `Your plan` | JUDGEMENT (tier) |
| SettingsSections.jsx:524 | `Appearance & Display` | `Appearance` | JUDGEMENT |
| SettingsSections.jsx:527 | `Theme, font scaling, and accessibility controls.` | `Theme, text size, accessibility.` | JUDGEMENT |
| SettingsSections.jsx:570 | `Interface Font Scale` | `Text size` | JUDGEMENT |
| SettingsSections.jsx:592 | `desc: 'Enhanced border delineation and increased text contrast'` | `Stronger borders and higher contrast text.` | JUDGEMENT (delineation) |
| SettingsSections.jsx:593 | `desc: 'Disable ambient background blurs and non-critical pulse animations'` | `Turn off background blur and animation.` | JUDGEMENT (ambient, non-critical) |
| SettingsSections.jsx:594 | `label: 'OpenDyslexic Typeface'` / `desc: 'Weighted letter shapes to enhance readability'` | `Dyslexia-friendly font` / `Letter shapes that are easier to tell apart.` | JUDGEMENT |
| SettingsSections.jsx:642 | `Notification Channels` | `Notifications` | JUDGEMENT (channels) |
| SettingsSections.jsx:645 | `Manage email alerts, in-app auditory chimes, and system toasts.` | `Choose what we tell you about.` | JUDGEMENT (auditory chimes, system toasts) |
| SettingsSections.jsx:652 | `label: 'Email Digest Notifications'` / `desc: 'Daily coursework status and upcoming deadline summaries'` | `Daily email` / `A daily summary of your work and deadlines.` | JUDGEMENT (digest) |
| SettingsSections.jsx:653 | `label: 'In-App Telemetry Banners'` / `desc: 'Live alerts when agent completes proof derivations or doc exports'` | `Banners in the app` / `A banner when something finishes.` | BANNED (telemetry, derivations) |
| SettingsSections.jsx:654 | `label: 'Auditory Telemetry Feedback'` / `desc: 'Subtle sound feedback on tool completions and approvals'` | `Sounds` / `A small sound when something finishes.` | BANNED (telemetry) |
| SettingsSections.jsx:747 | `label: 'Cadence & burstiness'` | `Sentence rhythm` | BANNED (burstiness) |
| SettingsSections.jsx:748-751 | `desc: 'Rhythm analysis. Measures how much sentence length and structure vary…'` | keep — already plain, and genuinely explanatory | — |
| SettingsSections.jsx:733-736 | `label: 'ZipPy'` + compression-heuristic desc | keep the name; it's a real detector. Desc already plain. | — |
| SettingsSections.jsx:854 | `Local Storage & Session Hygiene` | `Clear local data` | JUDGEMENT (hygiene) |
| SettingsSections.jsx:857 | `Purge cached thread drafts and local temporary files.` | `Delete drafts and temporary files saved on this device.` | JUDGEMENT (purge, cached) |
| SettingsSections.jsx:883 | `Credits & Billing Ledger` | `Credits & billing` — KEEP "credits" | JUDGEMENT (ledger) |
| SettingsSections.jsx:886 | `Deterministic token balances and current plan rates.` | `Your token balance and plan.` — KEEP "token balance" | JUDGEMENT (deterministic) |
| SettingsSections.jsx:838 | `Privacy & Security` | keep | — |
| SettingsSections.jsx:841 | `Multi-factor authentication, active session revocation, and data hygiene.` | `Two-factor login, signing out other devices, and deleting your data.` | JUDGEMENT (revocation, hygiene) |
| SettingsSections.jsx:964 | `Not available yet` | keep | — |
| SettingsSections.jsx:996 | `Loading insights…` | keep — KEEP "Insights" | — |

### `web/src/components/InsightsView.jsx`
Four strings, three of them jargon, on a screen whose KEEP name is just "Insights".

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| InsightsView.jsx:16 | `Learning Analytics & Empirical Telemetry` (eyebrow) | *delete the eyebrow* | BANNED (telemetry) |
| InsightsView.jsx:20 | `Academic Telemetry` | *delete* | BANNED (telemetry) |
| InsightsView.jsx:24 | `Cognitive Insights` (h1) | `Insights` — the KEEP word, alone | JUDGEMENT (cognitive) |
| InsightsView.jsx:27 | `Empirical telemetry tracking study momentum, assignment mastery, and personalized recommendations.` | `How much you've studied, and what to do next.` | BANNED (telemetry) |
| InsightsView.jsx:37 | `label: "Academic Progress"` | `Progress` | JUDGEMENT |
| InsightsView.jsx:38 | `label: "Smart Recommendations"` | `What to do next` | JUDGEMENT (smart) |

### `web/src/components/AnalyticsDashboard.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AnalyticsDashboard.jsx:122 | `No telemetry recorded yet` (h3 — empty state) | `Nothing to show yet` | BANNED (telemetry) |
| AnalyticsDashboard.jsx:125 | `Telemetry and learning performance metrics populate automatically as you complete assignments and study cards.` | `This fills in as you finish work.` | BANNED (telemetry) |
| AnalyticsDashboard.jsx:211 | `Telemetry Activity (Last 30 Days)` (h3) | `Last 30 days` | BANNED (telemetry) |
| AnalyticsDashboard.jsx:227 | `aria-label="30-day telemetry activity area chart"` | `aria-label="Your activity over the last 30 days"` | BANNED (telemetry) |
| AnalyticsDashboard.jsx:294/298 | `Synthesized Materials Breakdown` | `What we made` | BANNED (synthesized) |

### `web/src/components/IntelligenceView.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| IntelligenceView.jsx:128 | `label: "Materials Synthesized"` | `Things made` | BANNED (synthesized) |

### `web/src/components/LibraryView.jsx`
KEEP "Library". The `*Payload` hits here (lines 137, 144-146, 154-155, 162) are **variable
names only — not user-facing.** No change needed.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| LibraryView.jsx:131 | `triggerNotice("Action failed.")` | `That didn't work. Try again.` | JUDGEMENT |
| LibraryView.jsx:255 | `Loading synthesized study materials…` | `Loading…` | BANNED (synthesized) |
| LibraryView.jsx:263 | `No synthesized materials yet` (h3 — empty state) | `Nothing in your Library yet` | BANNED (synthesized) |
| LibraryView.jsx:~266 | `Generate study guides, flashcard decks, and practice tests from any assignment or uploaded lecture note.` | `Dump an assignment and we'll make study guides, flashcards and quizzes.` | JUDGEMENT |
| LibraryView.jsx:368 | `Synthesized Reference Document` | `Document` | BANNED (synthesized) |

### `web/src/components/GuideView.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| GuideView.jsx:27 | `label: 'Workspace & Ingestion'` (category) | `Getting work in` | BANNED (ingestion) |
| GuideView.jsx:39 | `The whole pipeline in order: create an account, …` | `The shortest path, in order: …` | BANNED (pipeline) |
| GuideView.jsx:46 | `The subagent team starts the moment you pick.` | `The team starts the moment you pick.` | BANNED (subagent team) |
| GuideView.jsx:132 | `Watch the three stages: Step 1 Reading & Rubric, Step 2 Synthesis & Proofs, Step 3 Lexical Humanizing — the finish line records the human score it passed at.` | `Watch the three steps: reading it, writing it, making it sound like you.` | BANNED (synthesis) + JUDGEMENT (lexical) |
| GuideView.jsx:133 | `Follow the subagent team cards: each agent's status (WAITING / WORKING / COMPLETE / FAILED)…` | `Each agent shows what it's doing.` | BANNED (subagent team) |
| GuideView.jsx:~134 | `Hit Stop Execution if the team is off track…` | `Hit Pause if the team is off track…` | BANNED (execution) |
| GuideView.jsx:295 | `inspect rubrics, synthesized essays, flashcard decks, and full audit logs.` | `read the rubric, the essay, the flashcards, and what the agents did.` | BANNED (synthesized) |
| GuideView.jsx:578 | `System Telemetry & Operational Channels` (comment) + `Operational Channels` (rendered label) | `Help & status` | BANNED (telemetry) + JUDGEMENT (operational channels) |
| GuideView.jsx:97 | `'Long chats tidy themselves — the agent keeps the key context…'` | keep — already plain | — |

### `web/src/components/AgentConfigsSidebar.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AgentConfigsSidebar.jsx:376 | `{/* Telemetry Metrics Grid */}` — comment; the rendered labels below are `Reasoning Depth` etc. | comment only; rename for hygiene | BANNED (in comment) |
| AgentConfigsSidebar.jsx:~379 | `Reasoning Depth` | `How deeply it thinks` | JUDGEMENT |
| AgentConfigsSidebar.jsx:576 | `Uploaded Directives & Files` | `Your files` | BANNED (directives) |
| AgentConfigsSidebar.jsx:609 | `No custom directive files uploaded.` | `No files yet.` | BANNED (directive) |
| AgentConfigsSidebar.jsx:~583 | `Upload prompt rules, syllabus files, or rubrics` | keep — plain | — |
| AgentConfigsSidebar.jsx:286 | `No identities yet. An identity is a personality and instruction set you…` | `No personalities yet. A personality changes how your agent writes.` | JUDGEMENT (instruction set) |
| AgentConfigsSidebar.jsx:432 | `No skills yet. A skill is a standing instruction your agent keeps —` | keep — already explains itself plainly | — |

### `web/src/components/MyAgentView.jsx`
KEEP "My Agent", "Agent".

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| MyAgentView.jsx:333/343 | `title: 'Thread #{n}'` | `Chat {n}` | JUDGEMENT (thread) |
| MyAgentView.jsx:432 | `setThinkingState({ … text: 'Exploring state transitions and verifying proof bounds...' })` — hardcoded placeholder thinking text | `Thinking…` (or the real reasoning stream) | JUDGEMENT — this is fabricated copy; it says the same maths-y sentence no matter the subject |
| MyAgentView.jsx:551 | `Agent execution interrupted: {msg}` | `That stopped early: {msg}` | BANNED (execution) |
| MyAgentView.jsx:642 | `'Continuing where it left off…'` | keep — plain | — |
| MyAgentView.jsx:671 | `Could not resume the paused answer: {msg}` | keep — plain | — |
| MyAgentView.jsx:740 | `{ title: 'New chat' }` | keep | — |
| MyAgentView.jsx:770 | `Autonomous Session` (eyebrow above the h1) | *delete the eyebrow* | BANNED (autonomous) |
| MyAgentView.jsx:804 | `title="Open Agent Configurations Matrix"` | `Agent settings` | JUDGEMENT (matrix) |
| MyAgentView.jsx:808 | `Configs` | `Settings` | JUDGEMENT |
| MyAgentView.jsx:823 | `No messages yet — ask a question below to start your session.` | `No messages yet — ask it something.` | JUDGEMENT (session) |
| MyAgentView.jsx:954 | `Answer paused — nothing was lost. Resume it, or just type a new message to carry on.` | keep — this is the model for how the rest should read | — |
| MyAgentView.jsx:982 | `title="Attach source, proof script, or assignment file"` | `Attach a file` | JUDGEMENT (proof script) |
| MyAgentView.jsx:1009 | `title="Toggle audio telemetry transcription"` | `Dictate instead of typing` | BANNED (telemetry) |
| MyAgentView.jsx:1023 | `title="Pause — keep what's written and continue later"` | keep — plain | — |
| MyAgentView.jsx:1041 | `title="Send to Agent"` | `Send` | JUDGEMENT |
| MyAgentView.jsx:993 | `placeholder=""` (deliberately blank per a fixed bug) | consider `Ask anything…` — but check the prior bug note at :997 first | JUDGEMENT |

### `web/src/components/ThreadsRail.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| ThreadsRail.jsx:189 | `No conversations yet — start one and it will live here.` | keep — plain | — |
| ThreadsRail.jsx:24/26 | `'No messages yet'` | keep | — |
| ThreadsRail.jsx:326 | `{/* Thread Telemetry Footer. */}` — comment only; the rendered value is a real date | comment only | BANNED (in comment) |

### `web/src/components/ChatBubble.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| ChatBubble.jsx:65 | `INFERENCE FAILURE` (error bubble label) | `Didn't send` | BANNED (inference) |
| ChatBubble.jsx:77 | `Retry Message` | `Try again` | JUDGEMENT |

### `web/src/components/ThinkingBubble.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| ThinkingBubble.jsx:40 | `'Thinking…'` / `'Thought process'` | keep — plain | — |
| ThinkingBubble.jsx:44 | `{tokens} tok` | `{tokens} tokens` | JUDGEMENT (abbreviation) |
| ThinkingBubble.jsx:60 | `Halt` | `Stop` | JUDGEMENT |

### `web/src/components/PermissionModal.jsx`
Note: a comment at `MyAgentView.jsx:1192` says this modal is **no longer used** on the web
surface (replaced by the inline `ApprovalCard`). Verify before investing in a rewrite.

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| PermissionModal.jsx:149 | `Agent is requesting permission to execute an operational action:` | `The agent wants to do something:` | JUDGEMENT (execute, operational) |
| PermissionModal.jsx:156 | `{/* Key Meta Telemetry Grid */}` — comment | comment only | BANNED (in comment) |
| PermissionModal.jsx:159 | `Action Target` | `What it will touch` | JUDGEMENT |
| PermissionModal.jsx:~195 | `Elevated Network I/O` | `Uses the internet` | JUDGEMENT (network I/O) |
| PermissionModal.jsx:201 | `Payload Inspection (AST diff)` | `See the details` | BANNED (payload) + JUDGEMENT (AST diff) |

### `web/src/components/NewAssignmentModal.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| NewAssignmentModal.jsx:29 | `useState('BIO-309 Chiral Inversion Reactions & Synthesis')` — **a hardcoded default title that pre-fills the real form** | `''` (empty) | BANNED (synthesis) + this is fabricated content shown to a real user |
| NewAssignmentModal.jsx:30 | `useState('BIO-309')` | `''` | JUDGEMENT |
| NewAssignmentModal.jsx:31 | `useState('Organic Chemistry')` | `''` | JUDGEMENT |
| NewAssignmentModal.jsx:481 | `Workspace Initialized Successfully` (h3) | `Added` | JUDGEMENT (initialized) |
| NewAssignmentModal.jsx:484 | `{title} is registered into the synthesis pipeline.` | `{title} is ready. Open it to start.` | BANNED (synthesis, pipeline) + JUDGEMENT (registered into) |

### `web/src/components/CreateSubjectDialog.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| CreateSubjectDialog.jsx:~159 | `Initialize New Subject Module` (h2) | `New subject` | JUDGEMENT (initialize, module) |
| CreateSubjectDialog.jsx:162 | `Establish syllabus heuristics, Level 1 autonomous routing, and telemetry scope.` | `Name it and pick an icon.` | BANNED (autonomous, telemetry; "Level 1" is a sibling of banned "level 2 scope") |
| CreateSubjectDialog.jsx:229 | `Telemetry Icon Glyph` (label) | `Icon` | BANNED (telemetry) + JUDGEMENT (glyph) |
| CreateSubjectDialog.jsx:~232 | `SELECTED: {icon}` | `{icon}` | JUDGEMENT |

### `web/src/components/QuickSettings.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| QuickSettings.jsx:106 | `Wallet Telemetry` | `Balance` — KEEP "token balance"/"credits" wording below it | BANNED (telemetry) |

### `web/src/components/SessionExpiryModal.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| SessionExpiryModal.jsx:40 | `State 401` | *delete* | JUDGEMENT (raw status code as a label) |
| SessionExpiryModal.jsx:43 | `Background sync paused / Authentication required for telemetry stream` | `You've been signed out. Sign in to carry on.` | BANNED (telemetry) |

### `web/src/components/ExtensionInstallView.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| ExtensionInstallView.jsx:102 | `Zero tracking or telemetry. The Helpotron companion operates entirely in 100% local context. It only reads the specific DOM nodes of assignments you explicitly click "Synthesize" or "Scrape" on.` | `No tracking. It only reads the page when you press Scrape.` | BANNED (telemetry, Synthesize) + JUDGEMENT (DOM nodes, local context) |
| ExtensionInstallView.jsx:~110 | `The extension pairs directly via your Server Sync Origin URL.` | `Paste your API key and it connects.` | JUDGEMENT (Server Sync Origin URL) |

### `web/src/components/CreditsCostTab.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| CreditsCostTab.jsx:44 | `label: 'Research & Essay Synthesis'` | `Essays & research` | BANNED (synthesis) |
| CreditsCostTab.jsx:46 | `label: 'AI Detection & Calibration'` | `AI detection` | JUDGEMENT (calibration) |
| CreditsCostTab.jsx:153 | `Continuous rolling telemetry across completed model generations and synthesis tasks.` | `What you've spent, over time.` | BANNED (telemetry, synthesis) |
| CreditsCostTab.jsx:~158 | `CONTENT-METERED` (chip) | *delete* | JUDGEMENT |

### `web/src/components/TelegramIntegration.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| TelegramIntegration.jsx:~157 | `label: 'Impending Due-Date Countdown Warnings (24h / 6h)'` | `Deadline reminders` | JUDGEMENT (impending) |
| TelegramIntegration.jsx:159 | `label: 'Agent Synthesis & Proof Completion Alerts'` | `When your work is done` | BANNED (synthesis) |
| TelegramIntegration.jsx:~160 | `label: '2FA One-Time Login & Purchase Approval Tokens'` | `Login codes and purchase approvals` | JUDGEMENT ("Tokens" here collides with the KEEP meaning of token balance — genuinely confusing) |

### `web/src/components/RouteModal.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| RouteModal.jsx:241 | `Estimated synthesis budget:` | `About:` | BANNED (synthesis) |

### `web/src/components/LaunchToDocModal.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| LaunchToDocModal.jsx:26 | `description: 'Steady scholarly rhythm with organic burstiness and occasional typo corrections.'` | `An even pace, with the odd typo fixed as it goes.` | BANNED (burstiness) |
| LaunchToDocModal.jsx:33 | `description: 'High-speed synthesis with burst deletions and continuous sentence flow.'` | `Fast, with few pauses.` | BANNED (synthesis) |
| LaunchToDocModal.jsx:294 | `{/* Telemetry & Controls Grid */}` — comment | comment only | BANNED (in comment) |
| LaunchToDocModal.jsx:~296 | `Speed Adjustment` | `Speed` | JUDGEMENT |

### `web/src/components/AssignmentHistoryView.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| AssignmentHistoryView.jsx:83 | *(contains "ledger" — exact string NOT captured before stop)* | likely `Submission Ledger` → `History` | JUDGEMENT — **needs verification** |

### `web/src/components/ui/ErrorState.jsx`
**Already clean** — plain-English headlines and descriptions, with an explicit in-file
rule against invented machine codes. Do not rewrite. One stale item:

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| ui/ErrorState.jsx:219 | contains `Cockpit` *(in a comment/section name — exact context NOT captured)* | — | JUDGEMENT — **needs verification** |

### `web/src/components/ui/ErrorReportButton.jsx`

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| ui/ErrorReportButton.jsx:26/36 | `Payload` *(appears to be object keys / variable names — likely NOT user-facing)* | — | **needs verification** |
| ui/ErrorReportButton.jsx:84 | `title="Send the technical details to Helpotron. They are encrypted, and nothing here is shown on screen."` | keep — plain | — |

### Extension (`extension/*.html`, `extension/*.js`)
**The extension HTML is the cleanest surface in the product** — zero banned terms in
`popup.html`, `options.html`, `agent_mode.html`, `onboarding.html`, `recorder.html`
(verified by grep over the full ban list). Judgement calls only:

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| popup.html:322 | `Off = unrestrained by study-only rules` | `Off = it can help with anything, not just coursework` | JUDGEMENT (unrestrained) |
| popup.html:451 | `title="Jurisdiction: which tabs the agent may see and act in. Pick one, several, or all of them."` | `Which tabs can the agent use?` | JUDGEMENT (jurisdiction) |
| popup.html:476 | `Agent jurisdiction` (panel heading) | `Which tabs can it use?` | JUDGEMENT (jurisdiction) |
| popup.html:534 | `Humanized Typing into Google Docs` | `Type it into a Google Doc` | JUDGEMENT |
| popup.html:578/579 | `Typing Cadence` (heading + aria-label) | `Typing speed` | BANNED-adjacent (cadence) |
| popup.html:584 | `title="Balanced — the measured natural rhythm for this account"` | `Balanced — your normal typing speed` | JUDGEMENT (measured) |
| popup.html:357/469 | `YOLO` (permission mode) | `No asking` | JUDGEMENT — may be deliberate; owner should decide |
| popup.html:376 | `(mid_lower)` — raw machine tier identifier rendered to the user | *delete, or map to a word* | JUDGEMENT |
| popup.html:516 | `Insufficient tokens.` | `Not enough tokens.` | JUDGEMENT |
| popup.html:693 | `Neutral` (approval button) | `Just send my note` — the help text at :703 already has to explain it | JUDGEMENT |
| popup.html:695 | `Approve + auto-add` / `AUTO` | `Approve, and stop asking` | JUDGEMENT |
| popup.html:554 | `Draft Text to Type` | `What to type` | JUDGEMENT |
| popup.html:567 | `Target Document Tab` | `Which doc` | JUDGEMENT |
| popup.js:414 | `innerText = \`(${info.tier})\`` — renders e.g. `(mid_lower)` | map tier ids to words, or delete | JUDGEMENT |
| popup.js:759 | `'No driveable tabs open — chrome:// and extension pages cannot be driven.'` | `The agent can't work in this kind of tab. Open a normal page.` | JUDGEMENT (driveable/driven) |
| popup.js:1455 | `innerText = '✗ unparseable'` | `couldn't read it` | JUDGEMENT |
| popup.js:2700 | `'⏸ Paused by user (Esc pressed)'` | `Paused` | JUDGEMENT |
| popup.js:3004 | `` `Could not attach to this tab — ${reason}` `` | `Can't work in this tab — {reason}` | JUDGEMENT (attach) |
| popup.js:4169 | `'Initializing typing engine…'` | `Getting ready…` | JUDGEMENT (initializing, engine) |
| popup.js:1190/1267 | `synthesized` | comments only — **not user-facing** | — |
| popup.js:3324 | `directive` | comment only — **not user-facing** | — |
| popup.js:3860/3935-4003 | `cadence` / `Cadence` | mostly comments + `renderCadencePresets` identifiers; the **rendered** strings are the `popup.html:578` ones above | — |
| agent_mode.js:692/737/2001/2010 | `armed` | **needs verification** — could be internal state or rendered | **NOT VERIFIED** |

### Routes slated for deletion (DIRECTION decisions 10 + 26)
`MonitorsView.jsx`, `ActivityView.jsx`, `AutomationCenter.jsx`, `DataLakeView.jsx`
(folds into Library) are all marked **delete** in DIRECTION.md. Their jargon is
catalogued below for completeness but **rewriting them is wasted work if they are
being deleted — confirm first.**

| file:line | current string | proposed replacement | flag |
|---|---|---|---|
| MonitorsView.jsx:136 | `title="Live telemetry connected"` | n/a — route to be deleted | BANNED (telemetry) |
| MonitorsView.jsx:212 | `{/* … FEEDBACK-FIRST DIRECTIVE */}` (comment) | n/a | BANNED (in comment) |
| MonitorsView.jsx:~209 | `Data Lake & Fleet Nodes` | n/a | JUDGEMENT (fleet nodes) |
| MonitorsView.jsx:489 | `{/* Data Lake Ingestion Feed */}` (comment) | n/a | BANNED (in comment) |
| DataLakeView.jsx:256 | `Nothing in the lake yet` (h3 — empty state) | `Nothing here yet` if kept | JUDGEMENT ("the lake" ≠ "Data Lake") |
| AutomationCenter.jsx:64 | `icon="⚙️" title="No automations yet"` | n/a — and emoji icon breaks decision 12 | JUDGEMENT |
| AutomationCenter.jsx:131 | `body="Schedule automations to run on a cadence."` | n/a | BANNED-adjacent (cadence) |
| ActivityView.jsx:120 | `'No activity yet'` / `'Nothing in this category'` | n/a | — |

### Admin-only surfaces (not student-facing)
Lower priority — a student never sees these. Catalogued, not rewritten:
`AdminAdvancedDashboard.jsx:1450,1457`, `AdminCostView.jsx:121,122,195,235`,
`AdminToolsView.jsx:30,87,216,466`, `AdminAgentChat.jsx:61,127`, `MessageAdminView.jsx`.

---

## 2. Coverage — what was swept and what was NOT

### FULLY READ (whole file, line by line)
- `web/src/components/AssignmentDetailView.jsx` (558 ln)
- `web/src/components/AssignmentCardDashboard.jsx` (842 ln)
- `web/src/components/DirectionPicker.jsx` (234 ln)
- `web/src/components/AgentTimeline.jsx` (206 ln)
- `web/src/components/WorkingDraftCard.jsx` (304 ln)
- `web/src/components/AssignmentConfigPanel.jsx` (336 ln)
- `web/src/components/ThinkingBubble.jsx` (86 ln)
- `web/src/components/ChatBubble.jsx` (125 ln)
- `web/src/lib/team.js` (115 ln) — complete
- `web/src/lib/assignmentBuckets.js` (32 ln) — complete, **clean**
- `web/src/components/StatusChip.jsx` (59 ln) — complete, **clean** (shell only)
- `web/src/components/ui/EmptyState.jsx` (46 ln) — complete, **clean** (shell only)
- `web/src/components/AssignmentDumpView.jsx` — lines 1-120 and 300-872 read in full;
  **lines 120-300 (upload/record/delete/finalize handlers) NOT read** — may hold more
  toast and error strings.
- `web/src/components/MyAgentView.jsx` — lines 1-130 and 740-1206 read in full;
  lines 130-740 **grep-swept only** (string-literal grep), not read.
- `extension/popup.html`, `options.html`, `agent_mode.html`, `onboarding.html`,
  `recorder.html` — full text-node + attribute extraction, complete.

### GREP-SWEPT ONLY (banned-term + machine-vocabulary grep hit; surrounding copy on the
### same screen NOT reviewed)
- `SettingsSections.jsx` — label/desc/heading grep done (≈60 hits reviewed). **The
  1015-line file was never read in full**; the Credits/Billing and 2FA blocks and
  anything that is a JSX text node rather than a `label:`/`desc:` key may be missed.
- `SubjectSettingsPanel.jsx` — widgets **01, 02, 04 captured; widgets 03, 05, 06 NOT
  captured.** This file has 6 numbered widgets and I only sampled three line ranges.
- `GuideView.jsx` — 16 sections; only sections at lines 20-60, 125-140, 290-300, 570-585
  sampled. **Roughly two thirds of this file is unswept** and it is the most prose-heavy
  screen in the product.
- `AgentConfigsSidebar.jsx` — tabs 1 and 4 sampled; **tabs 2 and 3 NOT swept.**
- `InsightsView.jsx` — lines 1-40 read; rest unswept.
- `AnalyticsDashboard.jsx`, `IntelligenceView.jsx`, `LibraryView.jsx`,
  `CreditsCostTab.jsx`, `TelegramIntegration.jsx`, `RouteModal.jsx`,
  `LaunchToDocModal.jsx`, `NewAssignmentModal.jsx`, `CreateSubjectDialog.jsx`,
  `QuickSettings.jsx`, `SessionExpiryModal.jsx`, `ExtensionInstallView.jsx`,
  `PermissionModal.jsx`, `ThreadsRail.jsx`, `MonitorsView.jsx` — **sampled line ranges
  only.**
- `web/src/lib/statusChips.js` — all `label:` and `definition:` values captured
  (complete for those two keys).
- `extension/popup.js` (193 KB) — grep for banned terms + grep for
  `textContent/innerText/innerHTML/title =` assignments. **Not exhaustive**: template
  literals built across lines, `createElement` text, and strings passed to a toast
  helper were not enumerated.
- `extension/background.js` (72 KB), `content.js` (107 KB), `agent_mode.js` (94 KB),
  `server_logic.js`, `element_registry.js`, `action_stream_executor.js`,
  `options.js`, `onboarding.js`, `theme.js`, `recorder.js` — **banned-term grep only
  on options.js/onboarding.js/agent_mode.js/popup.js. `background.js`, `content.js`,
  `server_logic.js`, `element_registry.js`, `action_stream_executor.js` NOT SWEPT AT
  ALL** (they appeared in the initial file-level grep hit list, so they do contain
  matches — unknown whether user-facing).

### NEVER TOUCHED — zero sweep
These `web/src` files were never opened and never grep-sampled for copy:
- `App.jsx` (only line 935 seen — a comment)
- `AppShell.jsx` (nav labels — **high value, this is on every screen**)
- `MobileBottomBar.jsx`, `MobileDrawer.jsx` (decision 31: the new bottom bar)
- `AnonymousLanding.jsx` (**the pre-signup page — highest-traffic surface**)
- `AuthModal.jsx`, `RecoveryFlowModal.jsx`, `TwoFactorSetup.jsx`,
  `TestingAccessModal.jsx`, `SegmentedOTPInput.jsx`
- `CreditsView.jsx`, `CreditsPricingDashboard.jsx`, `BillingView.jsx`,
  `TrialActivationCard.jsx`, `ReferralSection.jsx` (Credits = 12 actions / 549 words
  per the census, **completely unswept**)
- `AssignmentCard.jsx`, `AssignmentTurnInView.jsx`, `AssignmentHistoryView.jsx`
- `SubjectTile.jsx`, `SubjectDumpModal.jsx`, `TrashPanel.jsx`
- `EffortDial.jsx`, `ModeControl.jsx`, `ApprovalCard.jsx`, `ScopedSetting.jsx`,
  `SettingOverrides.jsx`, `SectionCard.jsx`, `ApiKeysPanel.jsx`,
  `AppearancePreview.jsx`, `AvatarCropper.jsx`
- `NotificationsPanel.jsx`, `NotificationsView.jsx`, `CommandPalette.jsx`,
  `CookieBanner.jsx`, `DemoRibbon.jsx`, `DevContactModal.jsx`,
  `QueueNoticeBanner.jsx`, `NotFound.jsx`, `ControlCenterView.jsx`
- `study/AcademicCalendar.jsx`, `study/FlashcardsPlayer.jsx`, `study/QuizPlayer.jsx`,
  `study/MasteryRing.jsx` (flashcards/quiz players — student-facing)
- `ui/*`: `Toast.jsx`, `ToastContainer.jsx`, `OfflineBanner.jsx`,
  `DestructiveConfirmModal.jsx`, `AdminNoticePopup.jsx`, `StatusDot.jsx`, `Kbd.jsx`,
  `os.jsx` (contains a second `EmptyState` used by AutomationCenter), `Skeleton.jsx`
- `lib/*`: `errors.js`, `errorActions.js`, `monitors.js`, `overlay.js`,
  `reportPayload.js`, `agentPresets.js` (**PRESET_PERSONAS descriptions are rendered in
  the Configs sidebar — likely jargon**), `agentEvents.js` (chips partially seen),
  `preferences.js`, `routing.js`, `settings.js`, `scopedSettings.js`, `utils.js`
- `api.js`, `demoData.js`, `mock.js` (`mock.js` appeared in the banned-term grep)
- `PrivacyPolicy.jsx`, `PrivacyPolicyView.jsx`, `PrivacyPolicyModal.jsx`,
  `TermsOfServiceView.jsx` — these have banned-term hits (telemetry, inference,
  orchestration, synthesize) but are **legal copy**; the owner's "student wouldn't say
  it" test may not apply the same way. Needs a ruling.
- `charts/*` — `orchestrator` hits at `line-loading-pulse.jsx:56`,
  `time-series-chart-shell.jsx:52,183`. Almost certainly internal identifiers, but
  **not verified.**

---

## 3. Strings I could not confidently rewrite

1. **`YOLO`** (`popup.html:357, 469`) — a permission mode. It is slang, not jargon, so
   it may be the owner's deliberate voice. I did not want to flatten a joke into
   "No asking" without a ruling.
2. **`Human Score: {n}%`** (`WorkingDraftCard.jsx:168`) and the `humanScore` default of
   `88` at `:73`. The number has a hardcoded fallback, so the label may be describing a
   value that was never measured. Rewriting the words without resolving whether the
   number is real would make a fabricated claim read more confidently.
3. **`Educational mode`** — used as a label in `SubjectSettingsPanel.jsx:267`, in the
   extension (`Edu: ON`), and as a flag throughout. It is not on the ban list and not
   in the KEEP list. It may be learned vocabulary. Needs a ruling before I rename it.
4. **`Data Lake Sync`** (`DirectionPicker.jsx:204`) — "Data Lake" is KEEP, "Sync" is
   not. I proposed "Saved to Data Lake" but the real question is whether the user needs
   to be told this at all.
5. **`2FA One-Time Login & Purchase Approval Tokens`**
   (`TelegramIntegration.jsx:~160`) — the word "Tokens" here means one-time codes, which
   directly collides with the KEEP meaning of "token balance". Any rewrite has to pick a
   different noun, and I was not sure which one the product uses elsewhere.
6. **`Submission Ledger`** (`AssignmentDetailView.jsx:225`, and probably
   `AssignmentHistoryView.jsx:83`) — I proposed "History", but there may be a distinction
   between the History *view* and a *ledger* concept I did not have time to check.
7. **`TRACKED`** status (`statusChips.js:107`) — I could not find what user action
   produces this status, so I could not tell whether it means "we are watching it",
   "you bookmarked it", or something else. Rewriting the label without knowing would
   guess.
8. **`(mid_lower)`** (`popup.js:414`, `popup.html:376`) — a raw model-tier id printed to
   the user. There is no plain-English mapping table I found, so I could not propose the
   replacement words, only say that the raw id must not ship.
9. **The `statusChips.js` `definition` strings** — I verified nothing renders them today.
   They are either dead code to delete or a planned tooltip. Which one changes whether
   they need rewriting at all.
10. **Privacy Policy / Terms copy** — `telemetry`, `inference`, `orchestration`,
    `synthesize` all appear in `PrivacyPolicyView.jsx`, `PrivacyPolicyModal.jsx`,
    `TermsOfServiceView.jsx`. Legal text has different constraints; I flagged but did
    not rewrite.

---

## 4. Counts

| | |
|---|---|
| Strings catalogued needing a rewrite | **218** |
| — of which BANNED-term (hard requirement) | **86** |
| — of which JUDGEMENT-call | **132** |
| Grep hits confirmed as comments / variable names only (no change needed) | 31 |
| Files with at least one rewrite needed | 36 |
| Files confirmed already clean | 5 (`ui/ErrorState.jsx`, `ui/EmptyState.jsx`, `StatusChip.jsx`, `lib/assignmentBuckets.js`, `extension/*.html` for banned terms) |
| Dead/duplicate file flagged for deletion instead of rewrite | 1 (`web/src/lib/statusChips.jsx` — nothing imports it) |

The 218 is a **floor, not a total.** The largest unswept student-facing surfaces are
`AnonymousLanding.jsx`, `AppShell.jsx` (nav, on every screen), the whole Credits/Billing
family, `GuideView.jsx` (two thirds unread), `lib/agentPresets.js`, and the three big
extension content scripts. Expect the real number to land meaningfully higher.
