# Design libraries & tooling — what to use on Helpotron

Curated, not exhaustive. Every entry says **why it earns its bundle weight here** and when to skip it.
The app is React 19 + Tailwind v4 + Vite; anything that fights that stack is a no.

## Already installed — use these before adding anything

| Package | Role | Note |
|---|---|---|
| `radix-ui` + `@radix-ui/react-slot` | accessible primitives | already the a11y foundation; **do not** add a second primitive layer |
| `class-variance-authority` + `clsx` + `tailwind-merge` | variant API + class merging | the whole component API pattern is already here |
| `lucide-react` | icon set | every icon must come from here or be inline SVG |
| `motion` (= `framer-motion` 13) | state transitions, layout animation | already the motion engine; no second animation lib |
| `gsap` | timeline-grade sequences | only for the landing hero; not for UI state changes |
| `@visx/*` + `d3-*` | charts | Insights already built on it; do not bolt on Recharts |
| `@tiptap/react` | rich text | the editor |
| `@number-flow/react` | animated numbers | token balance / credits counters |
| `react-markdown` + KaTeX | rendered agent output | — |

**Rule:** a new dependency must replace something or remove a whole class of hand-written code. "It's
popular" is not a reason.

## Worth adding, in priority order

1. **`sonner`** — toast notifications. ~5 KB, one provider, handles stacking/aria/dismissal correctly.
   Use it to kill the silent-success problem (assignment created in `pending_approval` with zero feedback).
   *Skip if* the app already has a toast context — check `web/src/components` first.
2. **`@tanstack/react-table` + `@tanstack/react-virtual`** — headless, no styling, when any list passes
   ~200 rows (assignments, ledger, library). Virtualisation is the difference between a 60 fps scroll and a
   frozen tab on a Chromebook.
3. **`react-aria-components`** — only for a component Radix cannot do well (e.g. a real combobox with async
   filtering, date range). Deepest a11y available; heavier to write. Never both Radix and React Aria on the
   same widget.
4. **`@base-ui/react`** — the successor path if a Radix primitive is abandoned (Radix is in maintenance).
   Migrate per-component, never wholesale.
5. **`embla-carousel-react`** — only if a real carousel is ever required. Prefer not having one.

## Explicitly rejected for this product

- **three.js / `@react-three/fiber` / `drei`** — 150–600 KB and a GPU tax on a study app whose users are on
  laptops and phones with 20 tabs open. A 3D hero would cost LCP and earn nothing. If a spatial metaphor is
  ever wanted, draw it in **inline SVG with CSS transforms** — that is the house rule anyway (no generated
  imagery). Revisit only if the product ever ships a genuinely 3D feature.
- **MUI / Ant / Chakra / Mantine** — a second design system next to an existing Tailwind token layer. No.
- **`styled-components` / `emotion`** — runtime CSS-in-JS, conflicts with Tailwind v4 tokens.
- **Aceternity / Magic UI / Kokonut** — animated marketing kits. Their components are copy-paste demos that
  assume a dark hero page; they fight an app shell and drag in duplicate motion primitives.
- **daisyUI** — semantic class layer on top of a token system that already exists. Two vocabularies, one app.

## Design skills wired into the Claude worker (`~/.claude_worker_config`)

| Skill / plugin | What it gives the agent |
|---|---|
| `frontend-design` (Anthropic official) | house style for coded UI, anti-slop defaults |
| `impeccable` (pbakaus) | ~24 commands + an anti-pattern detector: `/critique`, `/polish`, `/quieter`, `/animate`, `/typeset`, `/colorize` |
| `design-taste-frontend` (tasteskill v2) | art direction distilled from 247 gallery sites; brief → direction → look-and-fix loop on real screenshots |
| `superdesign` | canvas with several models for exploring variants side by side |
| `canvas-design`, `theme-factory`, `webapp-testing`, `web-artifacts-builder`, `brand-guidelines` | Anthropic `example-skills` bundle |
| `helpotron-design-audit` (custom) | the product-specific audit loop: Playwright walk, Lighthouse/axe/pa11y, test account, findings format, the 8 open defects |

Tools: Stitch MCP (screen generation), better-design MCP (spacing/hierarchy critique), Playwright MCP,
Chrome DevTools MCP, Context7 MCP, plus `lighthouse` / `axe` / `pa11y` on the PATH.

## How to combine them (the workflow that actually works)

1. `impeccable` **critique** on the current screen → concrete anti-patterns, not vibes.
2. `design-taste-frontend` for **direction** when the screen needs a composition, not a fix.
3. Stitch for **one** screen at a time when the layout itself is the question — with the no-imagery clause.
4. `better-design` to measure whether the hierarchy survived contact with real spacing.
5. Build it coded. Then `impeccable` polish + `webapp-testing`/Playwright verification, and the numbers
   from `lighthouse` + `axe` decide whether it shipped.
