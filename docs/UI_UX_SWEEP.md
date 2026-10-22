# Helpotron — UI/UX Sweep & Redesign Brief

You are taking over the front end of **Helpotron**, a live academic-companion product with paying users. Your job is a complete, honest UI/UX audit followed by a **full redesign** of the web app, driven by evidence from the running site and the source — not by taste alone.

Read this whole brief before you touch anything. It is the result of a manual QA sweep that already found and fixed several defects; do not re-litigate what is marked *settled*.

---

## 1. What Helpotron is

- **Product**: an "academic OS" for students. Courses become *subject bubbles*; assignments get an AI agent that drafts with citations and a completion ledger; there is a Data Lake, a Library, Insights, credits/billing, API keys, a browser extension, and an agent chat.
- **Live site**: <https://helpotron.dpdns.org> (Cloudflare in front of a uvicorn app on a home server).
- **Source**: this repository. `web/` is the SPA (Vite + React 19 + Tailwind v4 + motion), `server/` is FastAPI, `extension/` is the Chrome MV3 extension.
- **Users**: students on laptops and phones, often hurried, often on a bad connection. Friction costs signups. That is the metric that matters.

## 2. Environment you are working in

| Thing | Value |
|---|---|
| Repo root | `/home/roni/Roni_workspace/helpotron` |
| Local API | `http://127.0.0.1:5000` on the server box (`ssh roni@100.88.179.28`, key `~/.ssh/server_ed25519`) |
| Build | `cd web && npx vite build` → outputs `web/dist` |
| Deploy | rsync/tar `web/dist` to `/home/roni/helpotron/web/dist` on the server, then `systemctl restart helpotron-api` (needs root; run through a script file, the shell blocks the literal `sudo` string in ad-hoc commands) |
| Test account | create one through the UI at `/signup`, or `POST /api/signup` with header `X-Helpotron-Captcha-Bypass: <CAPTCHA_BYPASS_SECRET from /home/roni/helpotron/.env>`; a QA login already exists server-side if needed |
| Tokens for AI features | grant with the app's own module: `from server.credits import set_token_balance` (never edit the DB column directly) |
| Browser automation | **Playwright MCP** (`playwright-mcp`) — real Chrome, accessibility-tree driven |
| Performance / console / network | **Chrome DevTools MCP** (`chrome-devtools-mcp`) |
| Design generation | **Stitch MCP** (`stitch`) — Google's UI generator. A fresh project exists: `projects/8988589537304972768` ("Helpotron UI v3 — full redesign"). Old projects are abandoned; ignore them. |
| Design critique | **better-design MCP** (`better-design`) — design-system rules, spacing inspection, comprehension checks |
| Library docs | **context7 MCP** |
| Objective audits | `lighthouse` (installed), `axe` (installed), `pa11y` (installed) |

### Hard rules

1. **No AI-generated imagery. Ever.** No stock photos, no illustration, no hero images, no placeholder art, no emoji-as-icon. Every visual is **coded**: CSS (colour, type, spacing, borders, gradients used as material, not decoration) and **inline SVG** line icons. When you prompt Stitch, put this constraint in the prompt verbatim — it will otherwise return photographic mockups.
2. **Do not break the backend contract.** IDs, `data-*` hooks, and JS selectors used by `popup.js`, the SPA, and the extension must survive. If you restructure markup, keep every `id` that JS touches.
3. **Never commit secrets.** `.env` stays out. Test keys, cookies, and sessions never enter the repo or a screenshot you attach to a report.
4. **Publish nothing.** Commits locally are fine; no pushes, no deploys to production without the owner's explicit go-ahead in the current session. Staging on the server for a visual check is allowed.
5. **Don't rename product concepts.** "Subject bubble", "Data Lake", "Library", "assignment", "agent" are the vocabulary users already learned.
6. **Respect the money paths.** Checkout, credits, trial activation, and 2FA are security surface — restyle freely, restructure carefully, never weaken a gate.

## 3. What we already know (do not re-discover, build on it)

**Fixed and verified in a previous pass** — treat as settled:

- Signup now opens the session server-side (Turnstile tokens are single-use; the old flow replayed a spent token and every new account saw "Security check required").
- `/login` and `/sign-in` 307 to `/?signin=1` (the SPA has no login page — sign-in is a modal).
- `GET /assignments` no longer returns raw JSON (an API alias used to shadow the SPA route).
- Avatars: crop/zoom/rotate dialog, 512×512 JPEG output, 20 uploads/min per account, previous file deleted on replace.
- Agent `change_settings` canonicalises values (`"light mode"` → `light`) and only claims success after a read-back.
- CSP allows the Cloudflare insights beacon and `data:` fonts.

**Open defects found by the manual sweep, still unfixed — they are yours:**

1. With `/api/**` unreachable, an authenticated session silently renders the **marketing landing page**. No error, no spinner, no retry. This is the worst failure mode in the product.
2. Every authenticated hard load shows that landing page for ~1.5–3s while `/api/me` resolves. No skeleton, no shell.
3. The post-signup legal-consent gate ("STEP 2 OF 2") blocks the entire app and lives in `localStorage`, so it reappears on every new browser. Behind it users see the landing page and conclude they are signed out.
4. `/help` and `/assignments` are 404 pages; navigation is JS buttons, so nothing is bookmarkable or shareable.
5. An assignment created through the API lands in `pending_approval` and appears in **no UI view** — bubbles still read "0 assignments present", even though `/api/dashboard` returns it. Creating a task produces zero feedback.
6. One document title for every route.
7. Rate limits bite ordinary use: 45 JSON POSTs/min per user, 10/min on draft generation.
8. Up to 11 buttons under 24px; `/automation` and `/features` have no `h1`; one unnamed icon button on `/extension`.

## 4. How to work

### Phase 0 — reconnaissance (do this before forming opinions)

1. Run the app locally (`uvicorn server.main:app --port 5000`) or use the live site, then drive it with Playwright.
2. Create a QA account, grant it ~2000 tokens, and walk **every** route as a real user would: signup → consent → empty dashboard → create subject → dump an assignment → generate → history → library → insights → credits → settings → API keys → export.
3. For each screen record: URL, time-to-interactive, console errors, horizontal overflow at 1440 / 1024 / 768 / 390, tap-target sizes, contrast of body text, and a screenshot.
4. Run `lighthouse` and `axe` against `/`, `/dashboard`, `/settings`, `/credits` and `/signup`. Save the JSON into `reports/ui-audit/`.
5. Read the source that produces those screens — do not audit screenshots alone. The state machine in `web/src/App.jsx` (auth status, consent, routing) is where defects 1–3 live.

### Phase 1 — findings, ranked by what they cost the user

Write `reports/ui-audit/FINDINGS.md`. Each entry: what the user experiences, the cause in code (`path/file.jsx:line`), the cost (lost signup, stuck user, perceived jank), and the fix. Rank by user cost, not by effort. No finding may be based on a screenshot alone if the source disagrees with it.

### Phase 2 — design direction

1. Use **Stitch** to explore. Give it: the surface, the constraints from §2, the palette anchor (`#0e1014` ground, `#00e5f5` accent), and the exact content. Ask for *one* screen at a time; variants are for comparing hierarchy, not for collage.
2. Use **better-design** to critique what comes back (spacing inspection measures the real rendered layout; comprehension check asks whether a stranger can find the primary action).
3. Write the outcome to `docs/design/DIRECTION.md`: the type scale, spacing scale, radii, colour roles, motion rules, and the one primary action per screen. Every later decision must reference this file.

### Phase 3 — build

Order the work by user cost:

1. **The shell** — an app frame that renders before data, with skeletons; an explicit offline/degraded state with retry; the consent gate rendered *inside* the shell, not instead of it.
2. **The first five minutes** — signup, consent, empty dashboard, first capture, first generation. This is where users are lost.
3. **The core loop** — subject bubbles, assignment creation with immediate visible feedback, generation with progress and a real failure state, the ledger/history.
4. **The supporting surfaces** — library, insights, credits/billing, settings, API keys, help.
5. **Route-level craft** — per-route titles, real URLs for shareable pages, focus management, keyboard paths, reduced-motion.

Design constraints while building:

- One primary action per screen; everything else secondary or tertiary.
- Every async surface has four states: empty, loading (skeleton, not a spinner on white), error (what happened, why, what to do), success.
- No layout shift on load; no horizontal scroll at 390px.
- Hit targets ≥ 44px on touch, ≥ 32px on desktop.
- Body text ≥ 4.5:1 contrast; never grey-on-grey.
- Motion: ≤ 200ms for state changes, honour `prefers-reduced-motion`, never block input.
- Prefer deleting UI to adding it. If a control can be inferred, remove it.

### Phase 4 — verify like a user

For each screen you touched: drive it with Playwright, screenshot at 1440 and 390, confirm zero console errors, confirm the four async states, re-run axe and lighthouse, and diff the numbers against Phase 0. A redesign that cannot show better numbers is a repaint — say so instead of dressing it up.

### Phase 5 — report

`reports/ui-audit/REPORT.md`:

- What was broken, with evidence.
- What you changed, file by file.
- Before/after metrics table (LCP, CLS, axe violations, console errors, tap targets, screens at 390px).
- What you deliberately did **not** change, and why.
- What still needs a human decision.

Attach the before/after screenshots under `reports/ui-audit/shots/`.

## 5. Definition of done

- [ ] Every route in the SPA audited and either redesigned or justified.
- [ ] Defects 1–8 from §3 closed, each with a reproduction that now passes.
- [ ] Signup → first generated artifact is a single uninterrupted flow with visible progress at every step.
- [ ] Zero console errors on every route; zero axe critical/serious violations.
- [ ] Lighthouse accessibility ≥ 95 and performance ≥ 85 on `/` and `/dashboard` (mobile preset).
- [ ] No horizontal scroll at 390px on any route.
- [ ] `docs/design/DIRECTION.md` exists and every screen follows it.
- [ ] `web && npx vite build` succeeds; the built bundle is deployed to staging and smoke-tested.
- [ ] The report tells the truth about what is still bad.

## 6. Tone of the work

The owner's words, which are the acceptance criterion: *"eliminating user friction and increasing website appeal."* Appeal that costs a click is a regression. Friction that looks tidy is still friction. When the two conflict, remove the step.
