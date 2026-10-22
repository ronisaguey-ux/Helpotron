# Helpotron — design direction

Owner-decided, 2026-10-22. Every later decision answers to this file.
Source: `docs/UI_UX_SWEEP.md` (the brief), `helptron.pptx` (the owner's wireframes
and comments), and twelve decisions taken in session — recorded verbatim below so
they are not re-litigated.

---

## 0. The thesis

> "The main issue with the whole UI/UX is complexity. It has too many
> overcomplicated fancy words, too many conflicting buttons/actions. Every
> page/state should have 1 main call to action button, all the other options are
> smaller/less significant. It should guide the user to different pages as they
> click through. Every state/page should have as little as possible going on.
> Purge all unnecessary complexity, and have it be done server side, not on the UI."
> — owner

And from the brief: *eliminate user friction, then increase appeal — in that order.
Appeal that costs a click is a regression. Friction that looks tidy is still
friction. When the two conflict, remove the step.*

### What that means concretely

1. **One primary action per screen.** Exactly one filled, saturated control. Everything
   else is outline, ghost, or deleted. Measured, not eyeballed — see §5.
2. **No control for a thing that does not exist yet.** Export/Archive/Mark-as-Done do
   not render before there is an artifact to export.
3. **Decisions belong on the server.** If the backend can choose it, it is not a
   control. Config inheritance, pipeline composition and routing are server concerns.
4. **Plain words.** If a student would not say it, we do not print it.
5. **Each click goes somewhere.** A screen that answers a question hands you to the
   next screen rather than growing another panel.

### The complexity census that prompted this (measured 2026-10-22, live)

| Screen | Actions | Competing filled CTAs | Jargon terms | Words |
|---|---|---|---|---|
| Settings | 20 | **7** | **5** | 732 |
| Credits | 12 | **3** | 0 | 549 |
| Dashboard | 20 | 1 | 0 | 81 |
| Library | 7 | **2** (same action twice) | 0 | 64 |
| My Agent | 5 | **2** | 1 | 45 |
| Assignment Dump | 8 | 1 | 1 | 122 |
| Insights | 4 | 1 | 1 | 45 |

Target for every screen: **1 filled CTA, 0 jargon terms.**

---

## 1. The twelve decisions

| # | Question | Decision |
|---|---|---|
| 1 | Where do Task list items come from? | **Agent-generated real per-assignment tasks.** The agent gets a task-list tool call and defines/edits the list as it works. No streaming infrastructure. |
| 2 | Where does the 5-question flow live? | **After the dump, and re-editable later.** Asked once when material is dumped; a quiet entry point on the assignment screen re-opens it. |
| 3 | Is Q5 (subjects map, drag & drop) a question? | **Yes — the final step of the flow.** |
| 4 | Multi-select on Q1? | **Do it all at once and charge accordingly.** One run, several artifacts, cost reflects the total. |
| 5 | How does a redesign this size ship? | **Behind a flag only the owner's account sees.** Owner flips it when satisfied. No real student gets a changed screen mid-essay. |
| 6 | The assignment screen's existing furniture? | **Delete the telemetry panel. Hide Export / Archive / Mark as Done until an artifact exists.** Chat becomes the Execution Team panel; config moves server-side. |
| 7 | The light-mode bug? | **Reset the owner to dark, remove `auto`, and stop the 30s poll re-applying appearance when nothing changed.** |
| 8 | Six pre-made empty subjects? | **Keep them, collapsed until used.** |
| 9 | How many of the 5 questions does a normal user see? | **All five, one at a time, as drawn.** |
| 10 | The nine-item sidebar? | **Cut to four + Settings:** Dashboard, Assignment Dump, Library, My Agent. Data Lake folds into Library; Extension and Guide move into Settings. |
| 11 | What order? | **Cheap global fixes first, then build behind the flag.** |
| 12 | (from the brief) Imagery? | **None.** Coded CSS and inline SVG only. No stock, no illustration, no hero art, no emoji as iconography. |
| 13 | Abandoned flow? | **Resume where they left off.** Answers persist; the assignment sits in "needs setup". |
| 14 | Skippable questions? | **Humanization and AI detection are never skippable** — they have no safe default. Q1 required. Effort, notes and filing may be skipped. |
| 15 | Cost visibility? | **Live estimate that updates as they answer.** |
| 16 | Not enough tokens at the end? | **Offer to run what they can afford** — drop an output or top up, answers kept. |
| 17 | Pause semantics? | **Inject a message telling the agents to log all thoughts and unfinished work; once everything is safe, it is paused until the user resumes.** A graceful checkpoint, not a kill. |
| 18 | Can the user edit the agent's task list? | **Read-only while running, editable when paused.** |
| 19 | Task failure / timeout? | **Retry once, then ask** (retry or skip), **plus a "Report to Data Lake" button** that auto-drafts a bug report the user reviews before sending. The UI must never show "nothing" while work is actually running. |
| 20 | Execution Team layout? | **A tab per agent**, each message carrying its own collapsible thinking and token count. |
| 21 | Is "what do you want" still asked? | **Yes — question 1.** Full order below. |
| 22 | Humanization for maths? | **Always ask, but pre-answer "no"** for maths and other non-prose output. |
| 23 | Cost multiplier? | **5×** on `DRAFT_COST` and the per-output estimate. |
| 24 | Artifact delete? | **Soft delete into Trash, with confirmation.** |
| 25 | "Clarion" in the title? | **A mistake.** The product is Helpotron; every route gets its own title. |
| 26 | `/activity`, `/automation`, `/monitors`, `/datalake`? | **Delete them.** Data Lake content folds into Library. |
| 27 | Subagent count? | **Shown, with an override available in custom instructions.** The agent picks 1–10 and writes each one's role and system prompt. |
| 28 | "Sales funnel"? | **The guided question flow itself** — one question per screen narrowing to Begin. No selling in the core loop. |
| 29 | Telegram alert when not linked? | **Offer it; link inline if they say yes**, otherwise the step passes. |
| 30 | What goes in a bug report? | **Technical by default, with an opt-in tickbox to include the assignment content — and the user reviews the draft before sending.** |
| 31 | Mobile navigation? | **A bottom bar, always visible.** Four destinations, no hamburger. |

### The flow, settled

Dump → **auto-route to the right subject bubble** (with an obvious way to re-route if
it guessed wrong) → then, one question per screen:

1. What do you want produced? *(multi-select; all of it runs at once and is charged accordingly)*
2. Effort level — low / medium / high / auto
3. Humanization *(pre-answered "no" for maths and other non-prose)*
4. AI detection
5. Any custom instructions or extra files? *(also where a subagent-count override lives)*
6. Telegram alert when it's done? *(link inline if they say yes)*
7. **Begin**

**The Assignment Dump must not auto-start an assignment.** It routes and then asks.
A live cost estimate sits beside the token chip and moves as they answer.

### Owner's bug list — still open as of this session

- Assignment Dump paste box stays one line; **it should expand into an editor on paste**.
- The two-step spend confirmation hangs on "finalize" for ~a minute, then returns to
  confirm and **never finalizes**. Needs a real loading state with a verb.
- "The server took too long to respond" appeared **only after X-ing out** — otherwise an
  infinite loop. Meanwhile the work *was* running: a dumped worksheet showed nothing in
  the Dump but was being worked on in the Maths bubble.
- Pause shows "pipeline halted" with **no resume**.
- The agent greets you with "what are you studying today?" — **it has no idea which
  assignment it is working on**.
- Subagent thinking is not visible; **token usage is not shown per message**.
- The agent shows **nothing for a second, then the whole message at once** — needs a
  thinking spinner with a verb.
- **"Subagent Team Workspace Thread" → "Execution Team."**
- **No educational-mode toggle** in My Agent.
- `auto` theme is identical to dark — **remove it**.
- The extension UI.

Already fixed and deployed this session: avatar rate limit (20/min, own budget),
avatar crop/zoom dialog, agent settings canonicalisation with read-back, extension
update banner, the CSP auth outage, fonts, container gutter, button contrast,
duplicate landmarks, discount code on signup.

---

## 2. The screens the owner drew

### Assignment bubble (slide 1)

Three columns.

- **Left rail** — pause/resume at the top, then the assignment's library: rubric,
  research files, every artifact. Download-all at the top, download and delete per
  item. **Icon only, no text labels** — obvious inline SVG.
- **Centre** — the Execution Team panel. Research agent, Executor agent, Verifier
  agent; this is where the agents speak while the work happens. Upload file on the
  left of the composer, Send message on the right. **A long message expands into a
  full editor** rather than staying a cramped one-liner.
- **Right** — the Task list: the agent's own tasks for this assignment, as a vertical
  timeline. **A checkmark appears next to each action as it completes.**

Known bug to fix here: **the pause control only pauses — there is no resume.**

### Post-dump screen (slide 2) — "the current assignment dump looks fine, but the page after u dump it, is ass"

- Library rail on the left, Dump directory across the top.
- Token balance and credit balance top-right: **token with a coin SVG, credits with a
  dollar-sign SVG — on every screen.**
- The five questions, **one at a time, the next only appearing once the user advances**:
  1. What do you want completed? *Do it for me / PowerPoint / Study guide / Practice
     quiz / Flashcards / Something else* — multiple allowed.
  2. Effort level: low / medium / high / auto.
  3. Humanization: yes or no. If yes, which of the pending outputs to humanize.
  4. Any custom notes or extra files?
  5. The subjects map: where every artifact from the library went, drag and drop
     artifacts between subjects and assignments, create a subject, edit a subject,
     edit an assignment.
- Dumped text is **organised into separate `.md` files by circumstance**, server-side.

### Extension (slide 3)

A vertical icon rail beside the content pane: settings, launch-to-doc, chat, scrape.

---

## 3. Vocabulary

**Keep** (users learned these): subject bubble · assignment · Data Lake · Library ·
Insights · credits · token balance · Study Buddy · Agent · My Agent · Assignment Dump.

**Ban** (measured in the live product, all to be removed):
autonomous research vector · execution path · pipeline telemetry · pipeline armed ·
subagent team workspace thread · constraint injection · cadence humanization ·
burstiness · derivation · citation topology · synthesis vectors · sub-pipeline ·
dormant · resolved (as a progress unit) · level 2 scope · task intake.

Rewrite rule: say what the user gets, not what the system does.
*"Select Autonomous Research Vector"* → *"What do you want?"*

---

## 4. Tokens

Already fixed in this session and now load-bearing:

- `--font-sans: "Inter Variable", …` — the root `.app-canvas` carries `font-sans`;
  before this was declared, the whole signed-in app rendered in the OS font.
- `--font-mono: "JetBrains Mono Variable", …`
- `--spacing-container-padding: clamp(1rem, 3vw, 2.5rem)` — the hero, nav and footer
  had no gutter at all before this existed.
- `--st-sem-deepgreen: #047857` / `--st-on-sem-deepgreen: #ECFDF5` — 5.21:1.

Type: display and headline in Hanken Grotesk, body and UI in Inter, numerals and
identifiers in JetBrains Mono. **Mono is for data, never for prose** — "0 assignments
present" is prose.

Hierarchy rule: the page's `<h1>` is its largest text. Today the dashboard `<h1>`
renders at 14px while an `<h2>` below it renders at 32px.

Motion ≤200ms, honours `prefers-reduced-motion`. Hit targets ≥44px touch, ≥32px
pointer. Body text ≥4.5:1.

---

## 5. The four states

Every async surface ships **empty, loading, error, success**. Loading is a skeleton
shaped like the content, never a full-screen spinner — there is currently not one
skeleton in the product; all eleven authed routes show the same "Checking session…".

The **Assignment Dump** surface already does loading, success and empty correctly
(disabled control, spinner, success toast, counter, empty state with guidance). It is
the reference. Do not "fix" it.

---

## 6. Definition of done, per screen

- Exactly one filled CTA. Zero banned terms.
- Four designed states.
- One `<h1>`, and it is the largest text on the page.
- Its own `document.title`.
- No horizontal scroll at 390px; nothing flush to a viewport edge.
- axe: zero critical or serious.
- Before/after screenshots at 1440 and 390, and the metric diff stated plainly —
  including when a number did not move.
