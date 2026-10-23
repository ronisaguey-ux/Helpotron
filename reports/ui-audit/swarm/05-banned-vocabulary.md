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
