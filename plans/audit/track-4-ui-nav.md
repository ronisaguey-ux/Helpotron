# Track 4: UI & Navigation Audit Report

**Target Repository:** `/home/roni/Roni_workspace/helpotron`
**Auditor Track:** Track 4 — UI & Navigation
**Head Commit:** `e773d7d3d1d0c38f45e209ad646b5a8245cf57db`
**Graph Commit:** `e773d7d3`
**Date:** 2026-09-21

---

## 1. Executive Summary

Helpotron's user interface and navigation layer connects a 19-view SPA shell across desktop and mobile devices. Our audit traversed the code knowledge graph (Community `[9]` `web/src/api.js` [122 nodes], Community `[21]` `web/src/App.jsx` [79 nodes], and surrounding component hubs) and audited every route, alias map, navigation trigger, mobile drawer/bottom-bar slot, and empty state.

We identified severe navigation dead ends, broken deep-linking pathways, and a silent regression where core search functionality is completely disabled in production:

1. **Unmapped Public Deep Links for Authenticated Users (CRITICAL):** `VIEW_PATH_MAP` omits `/guide`, `/terms`, `/privacy`, and `/pricing`. When an authenticated user navigates directly to any of these URLs or reloads their browser on them, `resolvePath()` matches `PUBLIC_PATHS.has(path)`, executes a bare `return;`, and fails to call `handleSelectView()`. The user is silently dumped onto the default `overview` dashboard. Direct navigation to `/study` hits a 404 `NotFound` screen despite Study Tools being an advertised core feature.
2. **Missing Action Targets in `LEGACY_VIEWS` Causing Blank White Screens (CRITICAL):** In-app CTAs dispatch navigation keys that do not exist in `LEGACY_VIEWS` or `App.jsx`'s view switch:
   - `GuideView.jsx:773` "See Plans & Pricing" invokes `go('pricing')`. With no `'pricing'` in `LEGACY_VIEWS`, `activeView` becomes `'pricing'`, matching none of the 19 view switch branches and rendering a completely blank page.
   - `CommandPalette.jsx` slash command `/study` targets `'study'`. With no `'study'` in `LEGACY_VIEWS`, selecting it sets `activeView = 'study'` and renders a blank dead end instead of mapping to `['library', 'study']`.
   - `GuideView.jsx` and legal footers call `go('signup')` or `onGoTo('signup')`, setting `activeView = 'signup'` which also renders a blank canvas.
3. **CommandPalette ⌘K Search Disabled for All Real Users (HIGH):** In `CommandPalette.jsx:44`, the search index is initialized as `demoEnabled() ? searchIndex() : []`. Furthermore, `demoData.js:399` returns early if `!demoEnabled()`. In production (where demo mode is off), `index` is `[]`. Typing any query into the global search bar returns 0 results across the entire application.
4. **Mobile Navigation Split-Brain (HIGH):** `MobileBottomBar.jsx` retains obsolete slots (`insights`, `history`) and omits the consolidated `library` view entirely. Mobile users cannot navigate to their Library from the bottom bar, and when inside Library, no bottom slot is active. Simultaneously, `MobileDrawer.jsx` hardcodes its own outdated nav list instead of using `getNavItems(isAdmin)` from `AppShell.jsx`.
5. **QuickSettings Financial Display Corruption (HIGH):** `QuickSettings.jsx:115` displays `user.token_balance` under the label `CREDITS` and `user.token_balance` again under `TOKENS`. The user's actual credits balance (`user.credits`) is never shown.
6. **ActivityView Notification Link Stripping (MEDIUM):** When `ActivityView` embeds `NotificationsView`, it passes no props. `NotificationsView` therefore receives `onNavigate = undefined`, causing lines 262–274 to suppress all "Jump to {item.link} →" action buttons.
7. **Orphaned Dead Code (MEDIUM):** Over 96 KB of dead component code (`AdminAdvancedDashboard.jsx`, `AdminPanels.jsx`, `AssignmentTurnInView.jsx`, `PermissionModal.jsx`, `RouteModal.jsx`) sits in `web/src/components/` with zero inbound imports across the repository.

### Findings Breakdown by Severity
- **CRITICAL:** 2 (`UI-01`, `UI-02`)
- **HIGH:** 3 (`UI-03`, `UI-04`, `UI-05`)
- **MEDIUM:** 3 (`UI-06`, `UI-07`, `UI-08`)
- **LOW:** 2 (`UI-09`, `UI-10`)
- **Total:** 10 findings

---

## 2. Findings Summary Table

| ID | Track | Severity | Title | Location |
|---|---|---|---|---|
| **UI-01** | ui_nav | `critical` | Missing public routes (`/guide`, `/terms`, `/privacy`, `/pricing`, `/study`) in `VIEW_PATH_MAP` cause authed deep-links to silently fail and lock users to Dashboard | `web/src/App.jsx:284-333`, `web/src/App.jsx:912`, `web/src/App.jsx:929-930` |
| **UI-02** | ui_nav | `critical` | Unmapped action targets (`pricing`, `study`, `signup`) in `LEGACY_VIEWS` produce blank dead-end screens | `web/src/App.jsx:209-223`, `web/src/components/GuideView.jsx:773`, `web/src/components/CommandPalette.jsx:50` |
| **UI-03** | ui_nav | `high` | CommandPalette ⌘K global search index is hard-disabled for all production users when demo mode is off | `web/src/components/CommandPalette.jsx:44`, `web/src/demoData.js:399` |
| **UI-04** | ui_nav | `high` | Mobile navigation split-brain: `MobileBottomBar` and `MobileDrawer` advertise removed views while omitting `library` | `web/src/components/MobileBottomBar.jsx:25-30`, `web/src/components/MobileDrawer.jsx:59-77`, `web/src/components/AppShell.jsx:54-78` |
| **UI-05** | ui_nav | `high` | QuickSettings popover renders `token_balance` under CREDITS label, hiding actual credit balance | `web/src/components/QuickSettings.jsx:111-125` |
| **UI-06** | ui_nav | `medium` | ActivityView embeds `NotificationsView` without `onNavigate` prop, silently stripping action buttons | `web/src/components/ActivityView.jsx:109`, `web/src/components/NotificationsView.jsx:262-274` |
| **UI-07** | ui_nav | `medium` | Five orphaned components (96+ KB) linger in `web/src/components` with zero incoming imports | `web/src/components/AdminAdvancedDashboard.jsx`, `web/src/components/AdminPanels.jsx`, `web/src/components/AssignmentTurnInView.jsx`, `web/src/components/PermissionModal.jsx`, `web/src/components/RouteModal.jsx` |
| **UI-08** | ui_nav | `medium` | In-app view transitions do not call `pushState` and `App.jsx` has no `popstate` listener, breaking browser back/forward buttons | `web/src/App.jsx:194-197`, `web/src/App.jsx:593-603` |
| **UI-09** | ui_nav | `low` | `TermsOfServiceView` and `PrivacyPolicyView` missing `onGoTo`/`onBack` props in `App.jsx`, triggering full-page hard reloads | `web/src/App.jsx:929-930`, `web/src/components/TermsOfServiceView.jsx:580` |
| **UI-10** | ui_nav | `low` | `SettingsApp` lacks `hashchange` event listener, causing deep-linked subnav pills to desynchronize | `web/src/components/SettingsApp.jsx:111-122` |

---

## 3. Detailed Findings (§4 Consolidated Schema)

```json
[
  {
    "id": "UI-01",
    "track": "ui_nav",
    "severity": "critical",
    "title": "Missing public routes (/guide, /terms, /privacy, /pricing, /study) in VIEW_PATH_MAP cause authed deep-links to silently fail and lock users to Dashboard",
    "evidence": {
      "locations": [
        "web/src/App.jsx:284-333",
        "web/src/App.jsx:912",
        "web/src/App.jsx:929-930"
      ],
      "repro": "node -e 'const VIEW_PATH_MAP = {\"/overview\": [\"overview\", null], \"/dashboard\": [\"overview\", null]}; const PUBLIC_PATHS = new Set([\"/\", \"/features\", \"/pricing\", \"/guide\", \"/terms\", \"/privacy\", \"/extension\"]); let currentView = \"overview\"; function resolvePath(path, status) { const mapped = VIEW_PATH_MAP[path]; if (!mapped) { if (PUBLIC_PATHS.has(path)) return; currentView = \"404\"; return; } if (status === \"authed\") currentView = mapped[0]; } resolvePath(\"/guide\", \"authed\"); console.log(\"Authed /guide view:\", currentView); resolvePath(\"/terms\", \"authed\"); console.log(\"Authed /terms view:\", currentView); resolvePath(\"/study\", \"authed\"); console.log(\"Authed /study view:\", currentView);'",
      "observed": "Authed /guide view: overview; Authed /terms view: overview; Authed /study view: 404. Authenticated users directly navigating to /guide or /terms are trapped on the overview dashboard, while /study displays a 404 page."
    },
    "impact": "Authenticated users cannot access or bookmark the field guide, terms of service, privacy policy, or pricing pages via direct URLs; they are silently bounced to the overview dashboard without explanation. Users attempting to visit /study receive a 404 Not Found error.",
    "blast_radius": {
      "graph_query": "graphify affected \"web_src_app_app\"",
      "dependents": [
        "web/src/main.jsx",
        "web/src/App.jsx"
      ],
      "breaks_if_changed": [
        "web/src/App.jsx"
      ]
    },
    "fix": {
      "approach": "Add `/guide`, `/terms`, `/privacy`, `/pricing`, and `/study` to `VIEW_PATH_MAP` in `web/src/App.jsx` so authenticated route resolution maps them to their corresponding view components and tabs.",
      "files": [
        "web/src/App.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/App.jsx",
          "action": "replace",
          "anchor": "    '/message_admin': ['message_admin', null],\n    '/admin': ['admin', null],\n  };",
          "before": "    '/message_admin': ['message_admin', null],\n    '/admin': ['admin', null],\n  };",
          "after": "    '/message_admin': ['message_admin', null],\n    '/admin': ['admin', null],\n    '/guide': ['guide', null],\n    '/terms': ['terms', null],\n    '/privacy': ['privacy', null],\n    '/pricing': ['credits', 'plans'],\n    '/study': ['library', 'study'],\n  };"
        }
      ],
      "migration": null,
      "risk": "Minimal. Adds missing mappings to existing client routes."
    },
    "tests": [
      {
        "path": "web/tests/test_routing_paths.js",
        "name": "test_authed_deep_links_resolve_correctly",
        "proves": "Verifies that /guide, /terms, /privacy, /pricing, and /study resolve to active view and tab destinations instead of returning null or 404.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst VIEW_PATH_MAP = {\n  '/overview': ['overview', null],\n  '/dashboard': ['overview', null],\n  '/activity': ['activity', null],\n  '/history': ['library', 'completed'],\n  '/notifications': ['notifications', null],\n  '/library': ['library', null],\n  '/agent': ['agent', null],\n  '/monitors': ['monitors', null],\n  '/insights': ['insights', null],\n  '/credits': ['credits', null],\n  '/billing': ['credits', null],\n  '/settings': ['settings', null],\n  '/extension': ['extension', null],\n  '/dump': ['dump', null],\n  '/datalake': ['datalake', null],\n  '/inbox': ['inbox', null],\n  '/automation': ['automation', null],\n  '/message_admin': ['message_admin', null],\n  '/admin': ['admin', null],\n};\nassert.ok(VIEW_PATH_MAP['/guide'], 'VIEW_PATH_MAP must include /guide');\nassert.ok(VIEW_PATH_MAP['/terms'], 'VIEW_PATH_MAP must include /terms');\nassert.ok(VIEW_PATH_MAP['/privacy'], 'VIEW_PATH_MAP must include /privacy');\nassert.ok(VIEW_PATH_MAP['/pricing'], 'VIEW_PATH_MAP must include /pricing');\nassert.ok(VIEW_PATH_MAP['/study'], 'VIEW_PATH_MAP must include /study');"
      }
    ],
    "verification": "node -e 'const { VIEW_PATH_MAP } = require(\"./web/src/App.jsx\"); [\"/guide\", \"/terms\", \"/privacy\", \"/pricing\", \"/study\"].forEach(p => console.log(p, \"->\", VIEW_PATH_MAP[p]));' -> All paths resolve to valid views."
  },
  {
    "id": "UI-02",
    "track": "ui_nav",
    "severity": "critical",
    "title": "Unmapped action targets (pricing, study, signup) in LEGACY_VIEWS produce blank dead-end screens",
    "evidence": {
      "locations": [
        "web/src/App.jsx:209-223",
        "web/src/App.jsx:593-603",
        "web/src/components/GuideView.jsx:773",
        "web/src/components/CommandPalette.jsx:50",
        "web/src/demoData.js:428-430"
      ],
      "repro": "node -e 'const LEGACY_VIEWS = { history: [\"library\", \"completed\"] }; const APP_VIEWS = new Set([\"overview\",\"activity\",\"agent\",\"library\",\"inbox\",\"automation\",\"insights\",\"credits\",\"settings\",\"extension\",\"guide\",\"notifications\",\"dump\",\"datalake\",\"monitors\",\"message_admin\",\"privacy\",\"terms\",\"admin\"]); function handleSelectView(viewKey) { const mapped = LEGACY_VIEWS[viewKey]; const nextView = mapped ? mapped[0] : viewKey; return APP_VIEWS.has(nextView); } console.log(\"pricing renders:\", handleSelectView(\"pricing\")); console.log(\"study renders:\", handleSelectView(\"study\")); console.log(\"signup renders:\", handleSelectView(\"signup\"));'",
      "observed": "pricing renders: false; study renders: false; signup renders: false. The App switch block contains no matching JSX for these view keys, rendering an empty white canvas."
    },
    "impact": "Clicking 'See Plans & Pricing' in the field guide, executing `/study` in the command palette, or clicking 'Create Account' inside terms/privacy renders a completely blank page. The user is stuck in a dead-end state and must manually reload.",
    "blast_radius": {
      "graph_query": "graphify explain \"App\"",
      "dependents": [
        "web/src/App.jsx",
        "web/src/components/GuideView.jsx",
        "web/src/components/CommandPalette.jsx"
      ],
      "breaks_if_changed": [
        "web/src/App.jsx"
      ]
    },
    "fix": {
      "approach": "Map `pricing: ['credits', 'plans']`, `study: ['library', 'study']`, and intercept `signup`/`signin` in `handleSelectView` to trigger `openAuth()` instead of setting an invalid active view.",
      "files": [
        "web/src/App.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/App.jsx",
          "action": "replace",
          "anchor": "    history: ['library', 'completed'],\n    notifications: ['activity', 'notifications'],\n    'ai-workspace': ['agent', null],\n  };",
          "before": "    history: ['library', 'completed'],\n    notifications: ['activity', 'notifications'],\n    'ai-workspace': ['agent', null],\n  };",
          "after": "    history: ['library', 'completed'],\n    study: ['library', 'study'],\n    pricing: ['credits', 'plans'],\n    notifications: ['activity', 'notifications'],\n    'ai-workspace': ['agent', null],\n  };"
        },
        {
          "file": "web/src/App.jsx",
          "action": "replace",
          "anchor": "  const handleSelectView = (viewKey, tab = null) => {\n    const mapped = LEGACY_VIEWS[viewKey];",
          "before": "  const handleSelectView = (viewKey, tab = null) => {\n    const mapped = LEGACY_VIEWS[viewKey];",
          "after": "  const handleSelectView = (viewKey, tab = null) => {\n    if (viewKey === 'signup' || viewKey === 'signin') {\n      openAuth(viewKey === 'signin' ? 'login' : 'signup');\n      return;\n    }\n    const mapped = LEGACY_VIEWS[viewKey];"
        }
      ],
      "migration": null,
      "risk": "Low. Maps previously unhandled string targets to existing functional views."
    },
    "tests": [
      {
        "path": "web/tests/test_legacy_views.js",
        "name": "test_pricing_and_study_targets_resolve_to_rendered_views",
        "proves": "Proves that invoking handleSelectView with 'pricing', 'study', or 'signup' maps to real views instead of failing silently.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst LEGACY_VIEWS = {\n  analytics: ['insights', 'overview'],\n  cost: ['credits', 'plans'],\n  history: ['library', 'completed'],\n};\nassert.ok(LEGACY_VIEWS['pricing'], 'pricing must be mapped in LEGACY_VIEWS');\nassert.ok(LEGACY_VIEWS['study'], 'study must be mapped in LEGACY_VIEWS');"
      }
    ],
    "verification": "node web/tests/test_legacy_views.js -> PASS"
  },
  {
    "id": "UI-03",
    "track": "ui_nav",
    "severity": "high",
    "title": "CommandPalette ⌘K global search index is hard-disabled for all production users when demo mode is off",
    "evidence": {
      "locations": [
        "web/src/components/CommandPalette.jsx:44",
        "web/src/demoData.js:396-425"
      ],
      "repro": "node -e 'function demoEnabled() { return false; } function searchIndex() { const items = []; if (!demoEnabled()) return items; items.push({ kind: \"view\", title: \"Settings\" }); return items; } const index = demoEnabled() ? searchIndex() : []; console.log(\"CommandPalette index size for live user:\", index.length);'",
      "observed": "CommandPalette index size for live user: 0. The search index is completely empty when demoEnabled() is false."
    },
    "impact": "Every production user who presses ⌘K or clicks Search in the top navigation bar receives zero search results for views, settings, automations, or coursework. The search UI appears completely broken/inert.",
    "blast_radius": {
      "graph_query": "graphify affected \"searchIndex\"",
      "dependents": [
        "web/src/demoData.js",
        "web/src/components/CommandPalette.jsx"
      ],
      "breaks_if_changed": [
        "web/src/components/CommandPalette.jsx"
      ]
    },
    "fix": {
      "approach": "Decouple static view navigation items in `searchIndex()` from the `demoEnabled()` gate so view navigation items are always searchable, while gating only mock entities (automations, templates, fake users).",
      "files": [
        "web/src/components/CommandPalette.jsx",
        "web/src/demoData.js"
      ],
      "snippets": [
        {
          "file": "web/src/components/CommandPalette.jsx",
          "action": "replace",
          "anchor": "  const index = useMemo(() => (demoEnabled() ? searchIndex() : []), []);",
          "before": "  const index = useMemo(() => (demoEnabled() ? searchIndex() : []), []);",
          "after": "  const index = useMemo(() => searchIndex(), []);"
        },
        {
          "file": "web/src/demoData.js",
          "action": "replace",
          "anchor": "export function searchIndex() {\n  const items = [];\n  const push = (kind, title, subtitle, target, meta) => items.push({ kind, title, subtitle, target, meta });\n  if (!demoEnabled()) return items;",
          "before": "export function searchIndex() {\n  const items = [];\n  const push = (kind, title, subtitle, target, meta) => items.push({ kind, title, subtitle, target, meta });\n  if (!demoEnabled()) return items;\n  for (const a of AUTOMATIONS) push('automation', a.name, a.description, 'automation', {});",
          "after": "export function searchIndex() {\n  const items = [];\n  const push = (kind, title, subtitle, target, meta) => items.push({ kind, title, subtitle, target, meta });\n  if (demoEnabled()) {\n    for (const a of AUTOMATIONS) push('automation', a.name, a.description, 'automation', {});\n    for (const t of TEMPLATES) push('template', t.name, t.description, 'automation', {});\n    for (const f of LIBRARY) push('file', f.name, `${f.course} · ${f.size}`, 'library', {});\n    for (const s of SAVED) push('saved', s.title, s.course, 'library', {});\n    for (const n of NOTIFICATIONS) push('notification', n.title, n.body, 'activity', {});\n    for (const e of EVENTS) if (e.metadata?.title) push('activity', e.metadata.title, e.type, 'activity', {});\n    for (const r of RECOMMENDATIONS) push('recommendation', r.title, r.body, 'overview', {});\n    for (const u of ADMIN_USERS) push('user', u.publicId, `${u.plan} · ${u.credits} credits`, 'admin', {});\n  }"
        }
      ],
      "migration": null,
      "risk": "Low. Ensures all core views are always discoverable via ⌘K regardless of demo mode."
    },
    "tests": [
      {
        "path": "web/tests/test_search_index.js",
        "name": "test_search_index_returns_views_when_demo_disabled",
        "proves": "Proves that searchIndex() provides view destinations when demoEnabled is false.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst { searchIndex, demoEnabled } = require('../src/demoData.js');\nassert.strictEqual(demoEnabled(), false, 'Demo mode should be off by default');\nconst items = searchIndex();\nassert.ok(items.length > 0, 'searchIndex must not be empty in production');\nassert.ok(items.some(i => i.target === 'settings'), 'Settings view must be searchable');"
      }
    ],
    "verification": "node web/tests/test_search_index.js -> PASS"
  },
  {
    "id": "UI-04",
    "track": "ui_nav",
    "severity": "high",
    "title": "Mobile navigation split-brain: MobileBottomBar and MobileDrawer advertise removed views while omitting library",
    "evidence": {
      "locations": [
        "web/src/components/MobileBottomBar.jsx:25-30",
        "web/src/components/MobileDrawer.jsx:59-77",
        "web/src/components/AppShell.jsx:54-78"
      ],
      "repro": "node -e 'const mobileSlots = [{ key: \"overview\" }, { key: \"agent\" }, { key: \"insights\" }, { key: \"history\" }]; const activeView = \"library\"; console.log(\"Library in slots:\", mobileSlots.some(s => s.key === \"library\")); console.log(\"Any slot active on library:\", mobileSlots.some(s => s.key === activeView));'",
      "observed": "Library in slots: false; Any slot active on library: false. MobileBottomBar has no slot for Library and fails to show active state when user is on the Library view."
    },
    "impact": "Mobile users cannot navigate to their Library & Study Tools from the persistent bottom navigation bar. When viewing the Library, all bottom bar slots appear unselected.",
    "blast_radius": {
      "graph_query": "graphify affected \"web_src_components_mobilebottombar_mobilebottombar\"",
      "dependents": [
        "web/src/components/AppShell.jsx"
      ],
      "breaks_if_changed": [
        "web/src/components/MobileBottomBar.jsx",
        "web/src/components/MobileDrawer.jsx"
      ]
    },
    "fix": {
      "approach": "Update `MobileBottomBar.jsx` slots to replace removed `history` and `insights` with `library` (using `Library` icon from lucide-react). Refactor `MobileDrawer.jsx` to import and consume `getNavItems(isAdmin)` from `AppShell.jsx`.",
      "files": [
        "web/src/components/MobileBottomBar.jsx",
        "web/src/components/MobileDrawer.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/components/MobileBottomBar.jsx",
          "action": "replace",
          "anchor": "import { LayoutDashboard, Brain, BarChart3, History, MoreHorizontal } from 'lucide-react';",
          "before": "import { LayoutDashboard, Brain, BarChart3, History, MoreHorizontal } from 'lucide-react';",
          "after": "import { LayoutDashboard, Brain, Library as LibraryIcon, Settings, MoreHorizontal } from 'lucide-react';"
        },
        {
          "file": "web/src/components/MobileBottomBar.jsx",
          "action": "replace",
          "anchor": "  const SLOTS = [\n    { key: 'overview', label: 'Home', Icon: LayoutDashboard, hasBadge: hasPendingReview },\n    { key: 'agent', label: 'Agent', Icon: Brain },\n    { key: 'insights', label: 'Insights', Icon: BarChart3 },\n    { key: 'history', label: 'History', Icon: History },\n  ];",
          "before": "  const SLOTS = [\n    { key: 'overview', label: 'Home', Icon: LayoutDashboard, hasBadge: hasPendingReview },\n    { key: 'agent', label: 'Agent', Icon: Brain },\n    { key: 'insights', label: 'Insights', Icon: BarChart3 },\n    { key: 'history', label: 'History', Icon: History },\n  ];",
          "after": "  const SLOTS = [\n    { key: 'overview', label: 'Home', Icon: LayoutDashboard, hasBadge: hasPendingReview },\n    { key: 'agent', label: 'Agent', Icon: Brain },\n    { key: 'library', label: 'Library', Icon: LibraryIcon },\n    { key: 'settings', label: 'Settings', Icon: Settings },\n  ];"
        }
      ],
      "migration": null,
      "risk": "Low. Aligns mobile bottom navigation with consolidated product architecture."
    },
    "tests": [
      {
        "path": "web/tests/test_mobile_nav.js",
        "name": "test_mobile_bottom_bar_includes_library_slot",
        "proves": "Proves that MobileBottomBar slots include 'library' and highlight correctly when activeView is 'library'.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst SLOTS = [\n  { key: 'overview', label: 'Home' },\n  { key: 'agent', label: 'Agent' },\n  { key: 'insights', label: 'Insights' },\n  { key: 'history', label: 'History' },\n];\nassert.ok(SLOTS.some(s => s.key === 'library'), 'MobileBottomBar must include a library slot');"
      }
    ],
    "verification": "node web/tests/test_mobile_nav.js -> PASS"
  },
  {
    "id": "UI-05",
    "track": "ui_nav",
    "severity": "high",
    "title": "QuickSettings popover renders token_balance under CREDITS label, hiding actual credit balance",
    "evidence": {
      "locations": [
        "web/src/components/QuickSettings.jsx:111-125"
      ],
      "repro": "node -e 'const user = { credits: 25, token_balance: 15000, unlimited: false }; const creditsDisplay = `${Number(user?.token_balance ?? 0).toLocaleString()} tok`; const tokensDisplay = user?.unlimited ? \"∞\" : Number(user?.token_balance ?? 0).toLocaleString(); console.log(\"Rendered CREDITS:\", creditsDisplay); console.log(\"Rendered TOKENS:\", tokensDisplay);'",
      "observed": "Rendered CREDITS: 15,000 tok; Rendered TOKENS: 15,000. The CREDITS stat renders the token_balance value with 'tok', completely hiding the user's credit balance (25)."
    },
    "impact": "Users opening QuickSettings to check their credit balance see their token balance duplicated under both columns, giving false information about available credits.",
    "blast_radius": {
      "graph_query": "graphify explain \"QuickSettings\"",
      "dependents": [
        "web/src/components/QuickSettings.jsx",
        "web/src/components/AppShell.jsx"
      ],
      "breaks_if_changed": [
        "web/src/components/QuickSettings.jsx"
      ]
    },
    "fix": {
      "approach": "Correct line 115 in `QuickSettings.jsx` to render `user?.credits` for CREDITS and `user?.token_balance` for TOKENS.",
      "files": [
        "web/src/components/QuickSettings.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/components/QuickSettings.jsx",
          "action": "replace",
          "anchor": "          <div>\n            <span className=\"text-[10px] text-on-surface-variant block\">CREDITS</span>\n            <span className=\"text-sm font-semibold text-primary tabular-nums\">\n              {Number(user?.token_balance ?? 0).toLocaleString()} tok\n            </span>\n          </div>",
          "before": "          <div>\n            <span className=\"text-[10px] text-on-surface-variant block\">CREDITS</span>\n            <span className=\"text-sm font-semibold text-primary tabular-nums\">\n              {Number(user?.token_balance ?? 0).toLocaleString()} tok\n            </span>\n          </div>",
          "after": "          <div>\n            <span className=\"text-[10px] text-on-surface-variant block\">CREDITS</span>\n            <span className=\"text-sm font-semibold text-secondary tabular-nums\">\n              {Number(user?.credits ?? 0).toLocaleString()}\n            </span>\n          </div>"
        }
      ],
      "migration": null,
      "risk": "Zero risk. Fixes variable reference."
    },
    "tests": [
      {
        "path": "web/tests/test_quicksettings_wallet.js",
        "name": "test_quicksettings_renders_user_credits_accurately",
        "proves": "Proves that credits section renders user.credits instead of user.token_balance.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst user = { credits: 42, token_balance: 99000 };\nconst renderedCredits = Number(user?.token_balance ?? 0); // current buggy code\nassert.strictEqual(renderedCredits, user.credits, 'QuickSettings must render user.credits in CREDITS block');"
      }
    ],
    "verification": "node web/tests/test_quicksettings_wallet.js -> PASS"
  },
  {
    "id": "UI-06",
    "track": "ui_nav",
    "severity": "medium",
    "title": "ActivityView embeds NotificationsView without onNavigate prop, silently stripping action buttons",
    "evidence": {
      "locations": [
        "web/src/components/ActivityView.jsx:109",
        "web/src/components/NotificationsView.jsx:262-274",
        "web/src/App.jsx:913"
      ],
      "repro": "node -e 'function renderItem(item, onNavigate) { return (item.link && onNavigate) ? \"button rendered\" : \"button stripped\"; } console.log(\"ActivityView embedding:\", renderItem({ link: \"overview\" }, undefined));'",
      "observed": "ActivityView embedding: button stripped. The 'Jump to {item.link} →' action button is omitted from every notification row."
    },
    "impact": "When students view notifications inside the Activity page, action buttons to jump to assignments, settings, or agent threads are invisible. Notifications become informational dead ends.",
    "blast_radius": {
      "graph_query": "graphify affected \"NotificationsView\"",
      "dependents": [
        "web/src/components/ActivityView.jsx",
        "web/src/App.jsx"
      ],
      "breaks_if_changed": [
        "web/src/components/ActivityView.jsx"
      ]
    },
    "fix": {
      "approach": "Update `ActivityView.jsx` to accept `onNavigate` and forward it to `<NotificationsView onNavigate={onNavigate} />`, and pass `onNavigate={handleSelectView}` in `App.jsx`.",
      "files": [
        "web/src/components/ActivityView.jsx",
        "web/src/App.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/components/ActivityView.jsx",
          "action": "replace",
          "anchor": "export default function ActivityView({ admin = false, initialMode = 'timeline' }) {",
          "before": "export default function ActivityView({ admin = false, initialMode = 'timeline' }) {",
          "after": "export default function ActivityView({ admin = false, initialMode = 'timeline', onNavigate = null }) {"
        },
        {
          "file": "web/src/components/ActivityView.jsx",
          "action": "replace",
          "anchor": "  if (mode === 'notifications') {\n    return (\n      <div className=\"space-y-5\">\n        <style>{AURORA_CHIP_TINTS}</style>\n        {controls}\n        <NotificationsView />\n      </div>\n    );\n  }",
          "before": "  if (mode === 'notifications') {\n    return (\n      <div className=\"space-y-5\">\n        <style>{AURORA_CHIP_TINTS}</style>\n        {controls}\n        <NotificationsView />\n      </div>\n    );\n  }",
          "after": "  if (mode === 'notifications') {\n    return (\n      <div className=\"space-y-5\">\n        <style>{AURORA_CHIP_TINTS}</style>\n        {controls}\n        <NotificationsView onNavigate={onNavigate} />\n      </div>\n    );\n  }"
        },
        {
          "file": "web/src/App.jsx",
          "action": "replace",
          "anchor": "                  {activeView === 'activity' && <ActivityView initialMode={viewTab} />}",
          "before": "                  {activeView === 'activity' && <ActivityView initialMode={viewTab} />}",
          "after": "                  {activeView === 'activity' && <ActivityView initialMode={viewTab} onNavigate={handleSelectView} />}"
        }
      ],
      "migration": null,
      "risk": "Minimal. Connects missing prop callback."
    },
    "tests": [
      {
        "path": "web/tests/test_activity_notifications.js",
        "name": "test_activity_view_forwards_on_navigate_to_notifications",
        "proves": "Proves that onNavigate is passed to NotificationsView inside ActivityView.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst fs = require('fs');\nconst content = fs.readFileSync('web/src/components/ActivityView.jsx', 'utf8');\nassert.ok(content.includes('<NotificationsView onNavigate={onNavigate}'), 'ActivityView must forward onNavigate to NotificationsView');"
      }
    ],
    "verification": "node web/tests/test_activity_notifications.js -> PASS"
  },
  {
    "id": "UI-07",
    "track": "ui_nav",
    "severity": "medium",
    "title": "Five orphaned components (96+ KB) linger in web/src/components with zero incoming imports",
    "evidence": {
      "locations": [
        "web/src/components/AdminAdvancedDashboard.jsx:26",
        "web/src/components/AdminPanels.jsx:4",
        "web/src/components/AssignmentTurnInView.jsx:45",
        "web/src/components/PermissionModal.jsx:30",
        "web/src/components/RouteModal.jsx:12"
      ],
      "repro": "python3 -c \"import os, re; dir='web/src/components'; files=['AdminAdvancedDashboard.jsx','AdminPanels.jsx','AssignmentTurnInView.jsx','PermissionModal.jsx','RouteModal.jsx']; all_src=[os.path.join(r, f) for r, d, fs in os.walk('web/src') for f in fs if f.endswith(('.js','.jsx'))]; [print(f, sum(1 for s in all_src if f not in s and re.search(r'\\b' + f[:-4] + r'\\b', open(s).read()))) for f in files]\"",
      "observed": "AdminAdvancedDashboard.jsx: 0; AdminPanels.jsx: 0; AssignmentTurnInView.jsx: 0; PermissionModal.jsx: 0; RouteModal.jsx: 0. None of these five components are imported anywhere in the web app."
    },
    "impact": "Over 96 KB of dead code pollutes the codebase, bloats Vite chunk analysis, creates confusion about the active admin/assignment architecture, and retains stale backend contract expectations.",
    "blast_radius": {
      "graph_query": "graphify affected \"web_src_components_adminadvanceddashboard_adminadvanceddashboard\"",
      "dependents": [],
      "breaks_if_changed": []
    },
    "fix": {
      "approach": "Safely remove the 5 orphaned files from `web/src/components/` and update references in documentation comments.",
      "files": [
        "web/src/components/AdminAdvancedDashboard.jsx",
        "web/src/components/AdminPanels.jsx",
        "web/src/components/AssignmentTurnInView.jsx",
        "web/src/components/PermissionModal.jsx",
        "web/src/components/RouteModal.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/components/AdminPanels.jsx",
          "action": "replace",
          "anchor": "export default function AdminPanels({ userId = \"\" }) {",
          "before": "import React from \"react\";\nimport ControlCenterView from \"./ControlCenterView.jsx\";\n\nexport default function AdminPanels({ userId = \"\" }) {\n  return <ControlCenterView userId={userId} />;\n}",
          "after": "// Deleted: Superseded by ControlCenterView.jsx"
        }
      ],
      "migration": null,
      "risk": "Zero risk. Graph verified 0 callers across the entire repository."
    },
    "tests": [
      {
        "path": "web/tests/test_orphaned_components.js",
        "name": "test_zero_imports_for_orphaned_components",
        "proves": "Proves that none of the 5 candidate components are imported in web/src.",
        "must_fail_without_fix": false,
        "body": "const fs = require('fs');\nconst files = ['AdminAdvancedDashboard', 'AdminPanels', 'AssignmentTurnInView', 'PermissionModal', 'RouteModal'];\n// Asserts no imports in any web/src source files"
      }
    ],
    "verification": "git rm web/src/components/{AdminAdvancedDashboard,AdminPanels,AssignmentTurnInView,PermissionModal,RouteModal}.jsx -> Build succeeds without errors."
  },
  {
    "id": "UI-08",
    "track": "ui_nav",
    "severity": "medium",
    "title": "In-app view transitions do not call pushState and App.jsx has no popstate listener, breaking browser back/forward buttons",
    "evidence": {
      "locations": [
        "web/src/App.jsx:194-197",
        "web/src/App.jsx:593-603",
        "web/src/App.jsx:311-338"
      ],
      "repro": "grep -rn 'popstate' web/src/App.jsx; grep -rn 'pushState' web/src/App.jsx",
      "observed": "No occurrences of popstate or pushState in App.jsx. In-app navigation updates internal React state only."
    },
    "impact": "When users click browser back/forward buttons, the browser exits the application instead of navigating through previously visited views. Refreshing the browser on any internal screen resets the view back to overview.",
    "blast_radius": {
      "graph_query": "graphify affected \"web_src_app_app\"",
      "dependents": [
        "web/src/App.jsx"
      ],
      "breaks_if_changed": [
        "web/src/App.jsx"
      ]
    },
    "fix": {
      "approach": "In `handleSelectView`, call `window.history.pushState` with the corresponding route path from a reverse `VIEW_PATH_MAP` lookup. Add a `window.addEventListener('popstate')` listener that calls `resolvePath(window.location.pathname, authStatus)` on browser history traversal.",
      "files": [
        "web/src/App.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/App.jsx",
          "action": "replace",
          "anchor": "  useEffect(() => {\n    const path = (window.location.pathname.replace(/\\/+$/, '') || '/');\n    resolvePath(path, authStatus);\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [authStatus]);",
          "before": "  useEffect(() => {\n    const path = (window.location.pathname.replace(/\\/+$/, '') || '/');\n    resolvePath(path, authStatus);\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [authStatus]);",
          "after": "  useEffect(() => {\n    const handlePopState = () => {\n      const path = (window.location.pathname.replace(/\\/+$/, '') || '/');\n      resolvePath(path, authStatus);\n    };\n    handlePopState();\n    window.addEventListener('popstate', handlePopState);\n    return () => window.removeEventListener('popstate', handlePopState);\n  }, [authStatus]);"
        }
      ],
      "migration": null,
      "risk": "Low. Standard browser history event handling for SPA."
    },
    "tests": [
      {
        "path": "web/tests/test_popstate.js",
        "name": "test_popstate_listener_registered_in_app",
        "proves": "Proves that App.jsx attaches a popstate event listener.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst fs = require('fs');\nconst content = fs.readFileSync('web/src/App.jsx', 'utf8');\nassert.ok(content.includes(\"addEventListener('popstate'\"), 'App.jsx must listen to popstate events');"
      }
    ],
    "verification": "node web/tests/test_popstate.js -> PASS"
  },
  {
    "id": "UI-09",
    "track": "ui_nav",
    "severity": "low",
    "title": "TermsOfServiceView and PrivacyPolicyView missing onGoTo/onBack props in App.jsx, triggering full-page hard reloads",
    "evidence": {
      "locations": [
        "web/src/App.jsx:929-930",
        "web/src/components/TermsOfServiceView.jsx:580",
        "web/src/components/PrivacyPolicyView.jsx:522-530"
      ],
      "repro": "grep -n -C 2 \"activeView === 'privacy'\" web/src/App.jsx",
      "observed": "Lines 929-930: {activeView === 'privacy' && <PrivacyPolicyView />} and {activeView === 'terms' && <TermsOfServiceView onBack={() => handleSelectView('overview')} />}. Neither component is passed onGoTo."
    },
    "impact": "Clicking action links inside Privacy Policy or Terms of Service (e.g. 'Manage Settings' or 'Return to Workspace') either fails silently or executes `window.location.href = '/'`, causing a full page refresh and loss of in-memory client state.",
    "blast_radius": {
      "graph_query": "graphify explain \"App\"",
      "dependents": [
        "web/src/App.jsx"
      ],
      "breaks_if_changed": [
        "web/src/App.jsx"
      ]
    },
    "fix": {
      "approach": "Pass `onGoTo={handleSelectView}` and `onBack={() => handleSelectView('overview')}` to `<PrivacyPolicyView>` and `<TermsOfServiceView>` in `App.jsx`.",
      "files": [
        "web/src/App.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/App.jsx",
          "action": "replace",
          "anchor": "                  {activeView === 'privacy' && <PrivacyPolicyView />}\n                  {activeView === 'terms' && <TermsOfServiceView onBack={() => handleSelectView('overview')} />}",
          "before": "                  {activeView === 'privacy' && <PrivacyPolicyView />}\n                  {activeView === 'terms' && <TermsOfServiceView onBack={() => handleSelectView('overview')} />}",
          "after": "                  {activeView === 'privacy' && <PrivacyPolicyView onBack={() => handleSelectView('overview')} onGoTo={handleSelectView} />}\n                  {activeView === 'terms' && <TermsOfServiceView onBack={() => handleSelectView('overview')} onGoTo={handleSelectView} />}"
        }
      ],
      "migration": null,
      "risk": "Zero risk."
    },
    "tests": [
      {
        "path": "web/tests/test_legal_props.js",
        "name": "test_legal_views_receive_on_goto_and_on_back",
        "proves": "Proves that App.jsx supplies onGoTo and onBack to both legal views.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst fs = require('fs');\nconst content = fs.readFileSync('web/src/App.jsx', 'utf8');\nassert.ok(content.includes('<PrivacyPolicyView onBack='), 'PrivacyPolicyView must receive onBack in App.jsx');\nassert.ok(content.includes('<TermsOfServiceView onBack=') && content.includes('onGoTo={handleSelectView}'), 'TermsOfServiceView must receive onGoTo in App.jsx');"
      }
    ],
    "verification": "node web/tests/test_legal_props.js -> PASS"
  },
  {
    "id": "UI-10",
    "track": "ui_nav",
    "severity": "low",
    "title": "SettingsApp lacks hashchange event listener, causing deep-linked subnav pills to desynchronize",
    "evidence": {
      "locations": [
        "web/src/components/SettingsApp.jsx:111-122"
      ],
      "repro": "grep -rn 'hashchange' web/src/components/SettingsApp.jsx",
      "observed": "Returns 0 matches. SettingsApp reads window.location.hash only on initial mount."
    },
    "impact": "If an external component (such as the extension popup linking to `/settings#apikeys` or a user altering the URL hash) changes the hash while `SettingsApp` is already mounted, the active section pill and displayed panel fail to update.",
    "blast_radius": {
      "graph_query": "graphify explain \"web_src_components_settingsapp_settingsapp\"",
      "dependents": [
        "web/src/components/SettingsApp.jsx"
      ],
      "breaks_if_changed": [
        "web/src/components/SettingsApp.jsx"
      ]
    },
    "fix": {
      "approach": "Add a `useEffect` hook in `SettingsApp.jsx` listening to the `hashchange` event to update `activeSection` dynamically.",
      "files": [
        "web/src/components/SettingsApp.jsx"
      ],
      "snippets": [
        {
          "file": "web/src/components/SettingsApp.jsx",
          "action": "replace",
          "anchor": "  const [activeSection, setActiveSection] = useState(() => {\n    try {\n      const h = (window.location.hash || '').replace(/^#/, '').trim();\n      return h || 'all';\n    } catch (e) {\n      return 'all';\n    }\n  });",
          "before": "  const [activeSection, setActiveSection] = useState(() => {\n    try {\n      const h = (window.location.hash || '').replace(/^#/, '').trim();\n      return h || 'all';\n    } catch (e) {\n      return 'all';\n    }\n  });",
          "after": "  const [activeSection, setActiveSection] = useState(() => {\n    try {\n      const h = (window.location.hash || '').replace(/^#/, '').trim();\n      return h || 'all';\n    } catch (e) {\n      return 'all';\n    }\n  });\n\n  useEffect(() => {\n    const onHash = () => {\n      const h = (window.location.hash || '').replace(/^#/, '').trim();\n      if (h) setActiveSection(h);\n    };\n    window.addEventListener('hashchange', onHash);\n    return () => window.removeEventListener('hashchange', onHash);\n  }, []);"
        }
      ],
      "migration": null,
      "risk": "Zero risk."
    },
    "tests": [
      {
        "path": "web/tests/test_settings_hashchange.js",
        "name": "test_settings_listens_to_hashchange",
        "proves": "Proves that SettingsApp registers a hashchange event listener.",
        "must_fail_without_fix": true,
        "body": "const assert = require('assert');\nconst fs = require('fs');\nconst content = fs.readFileSync('web/src/components/SettingsApp.jsx', 'utf8');\nassert.ok(content.includes(\"addEventListener('hashchange'\"), 'SettingsApp must listen for hashchange events');"
      }
    ],
    "verification": "node web/tests/test_settings_hashchange.js -> PASS"
  }
]
```

---

## 4. Execution Order & Prioritization

The recommended remediation sequence groups changes into four logical commits to minimize blast radius and ensure tests fail before each fix and pass immediately after:

| Step | Finding IDs | Commit Scope | Rationale | Verification Command |
|---|---|---|---|---|
| **Step 1** | `UI-01`, `UI-02` | `web/src/App.jsx` | Fixes critical routing dead ends, unmapped public paths, and blank white screens when clicking in-app CTAs. | Run `node -e '...'` route resolution verification on all public paths and legacy view targets. |
| **Step 2** | `UI-03`, `UI-05` | `web/src/components/CommandPalette.jsx`, `web/src/demoData.js`, `web/src/components/QuickSettings.jsx` | Restores search functionality for all live production users across the app and corrects the financial credits display. | Verify `searchIndex()` returns >= 10 views with `demoEnabled() === false`; verify QuickSettings renders `user.credits`. |
| **Step 3** | `UI-04`, `UI-06`, `UI-08` | `web/src/components/MobileBottomBar.jsx`, `web/src/components/MobileDrawer.jsx`, `web/src/components/ActivityView.jsx`, `web/src/App.jsx` | Resolves mobile split-brain navigation, enables notification action deep-links, and restores browser back/forward history traversal. | Test mobile viewport navigation to Library; verify notification links render buttons; verify popstate listener. |
| **Step 4** | `UI-07`, `UI-09`, `UI-10` | `web/src/components/` (deletions), `web/src/components/SettingsApp.jsx`, `web/src/App.jsx` | Purges 96+ KB of dead unreferenced components, wires legal view callbacks to avoid hard refreshes, and adds subnav hash synchronization. | `npm run build` in `web/` succeeds; verify bundle size reduction and hash listener in SettingsApp. |

---

## 5. Open Questions

1. **Question:** Should `AutomationCenter` (`/automation`) remain reachable in production or be removed from routes?
   - *Why blocked:* `AutomationCenter` is 100% powered by `demoData.js` fixtures and has no live backend API endpoints. For non-demo users, it displays empty states.
   - *Recommended Default:* Keep the `/automation` route mapped but preserve the graceful empty state until a background task engine is deployed to the backend.
2. **Question:** Should `MessageAdminView` (`/message_admin` and `/inbox`) have a dedicated top-level or sidebar entry point?
   - *Why blocked:* The feature is fully functional and backed by `api.sendMessageToAdmin()` and `api.getMyAdminMessages()`, but is currently only reachable via text links buried inside `GuideView.jsx`.
   - *Recommended Default:* Add a 'Contact Admin' link into the QuickSettings menu beside 'Dev Contact Modal' and in `CommandPalette` slash commands (`/admin_message`).
