# axe — before / after (live site)

| Route | Before | After |
|---|---|---|
| `/` | 1 serious (color-contrast 2.57:1) | **0 violations** |
| `/signup` | 1 serious (color-contrast 2.57:1) | **0 violations** |
| `/guide` | 1 serious + 3 moderate | 3 moderate (guide modal renders its own `<main>` — F-10) |

Serious/critical violations on the public entry points: **1 → 0**.
Raw JSON: `metrics/before/axe-*.json`, `metrics/after/axe-*.json` (gitignored, on disk).
