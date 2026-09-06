# Batch 1 Foundation Operations Log

- **Batch**: `b1`
- **Branch**: `stitch/b01-foundation`
- **Theme**: Foundation — LUMINOUS GLASS design tokens + core primitives + avatar honesty fix + batch worktree bootstrap
- **Date**: 2026-09-06
- **Lead**: Antigravity & Claude Code peer integration

## Objectives & Scope
1. `b1-s1`: Bootstrap feature branch (`stitch/b01-foundation`), ops documentation, pin environment gates.
2. `b1-s2`: Complete rewrite of `web/src/index.css` to LUMINOUS GLASS Material Design 3 role tokens per `luminous_glass/DESIGN.md`, dual data-theme (`dark` default, `light` faithful translation), zero hex literals in components, zero `dark:` variants.
3. `b1-s3`: Build core shared UI primitives under `web/src/components/ui/` and replace `Button.jsx`, `SectionCard.jsx` (Button 5 variants + loading, SectionCard glass panel, EmptyState, StatusDot, Kbd, Skeleton, Toast).
4. `b1-s4`: Create foundational libraries under `web/src/lib/`: `statusChips.js` (11-status matrix), `settings.js` (scoped preferences), `overlay.js` (toast / inline error helpers), `api.js` honest error helpers.
5. `b1-s5`: AppShell avatar/identity honesty fix (AvatarWidget per spec 3.1.1: identity pill + build-id mono footer).

## Verification Gates
- **G1 Pytest**: `ENVIRONMENT=development DATABASE_URL="sqlite:///./test_helpotron.db" .venv/bin/python -m pytest server/tests -q && ENVIRONMENT=development DATABASE_URL="sqlite:///./test_helpotron.db" .venv/bin/python -m pytest tests -q`
- **G2 Web Build**: `cd web && npm run build`
- **G3 Smoke/Health**: Server health endpoint & public-config.
