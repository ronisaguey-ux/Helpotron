# Helpotron — Working Notes for Claude Code

This repository is the **live** Helpotron product (academic companion web app + Chrome extension).
This file is the standing context for any Claude Code session started here.

## Read first

`docs/UI_UX_SWEEP.md` — the full UI/UX redesign brief: environment, access, hard rules, known
defects, phases, and the definition of done. If your task touches the front end, that document is
authoritative.

## Shape of the repository

```
web/            Vite + React 19 + Tailwind v4 + motion SPA (build → web/dist)
  src/App.jsx           auth state machine, routing, shell mounting
  src/components/       views and sections (SettingsApp, AppShell, SettingsSections, ...)
  src/api.js            every fetch; one place, one style
server/         FastAPI app (uvicorn server.main:app --port 5000)
extension/      Chrome MV3 extension (popup.html/js/css, options, agent_mode)
docs/           design notes and this brief
reports/        audit output (create reports/ui-audit/ during a sweep)
```

## Commands

```bash
# front end
cd web && npm install && npx vite build        # build to web/dist
cd web && npx vite dev                        # dev server (expects the API at :5000)

# API (on the server box: ssh roni@100.88.179.28)
cd /home/roni/helpotron && .venv/bin/uvicorn server.main:app --host 0.0.0.0 --port 5000

# objective audits
lighthouse https://helpotron.dpdns.org --preset=desktop --output=json --output-path=reports/ui-audit/lh-home.json
axe https://helpotron.dpdns.org --exit
pa11y https://helpotron.dpdns.org
```

## Non-negotiables

- **No AI-generated imagery.** Coded CSS and inline SVG only. Say so explicitly in every Stitch prompt.
- **Keep JS hooks.** `id`s and `data-*` attributes are a contract with `popup.js`, the SPA, and tests.
- **No secrets in the repo.** `.env`, cookies, API keys, session tokens.
- **No production deploys** without the owner's explicit approval in the current session.
- **Money and auth paths** (checkout, credits, trial, 2FA, CSRF) are restyled at most — never weakened.

## Design vocabulary already in the product

Subject bubble · assignment · Data Lake · Library · Insights · credits · token balance ·
Study Buddy · Agent · My Agent. Keep the words; change how they look, not what they mean.

## Known context from the last QA pass

- Signup opens the session server-side; `/login` 307s to `/?signin=1`; `/assignments` no longer
  returns raw JSON; avatars are cropped client-side to 512×512 with a 20/min per-account budget;
  agent `change_settings` canonicalises values and verifies the write.
- Still open: landing-page-on-API-failure, 1.5–3s landing flash on hard loads, the localStorage
  consent gate, `/help` + `/assignments` 404s, `pending_approval` assignments invisible in the UI,
  a single document title for all routes, tight rate limits, and small tap targets.

Full detail and the redesign plan: `docs/UI_UX_SWEEP.md`.
