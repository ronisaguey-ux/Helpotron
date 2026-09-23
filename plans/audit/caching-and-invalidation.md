# Caching & Invalidation Audit — Helpotron (agent 6/10)

Scope: cache stampedes, consistent hashing, cache invalidation. Applied to what
Helpotron **actually has**, not the abstract problem. Read-only audit; no code changed.

---

## (a) Inventory — every cache in the tree

| # | Cache | Key | What it stores | Invalidation | Stampede risk | file:line |
|---|-------|-----|----------------|--------------|---------------|-----------|
| 1 | `_SCORE_CACHE` (dict) | `sha256(text\|select_tag)` | AI-detection score + results + pass/fail | 24h TTL, size-cap 500 (clear-all) | **YES** — concurrent miss on identical text re-runs paid detectors in parallel | `server/detectors.py:671-672,707-712,784-786` |
| 2 | `DETECTOR_CACHE` (dict, alias `detector_cache`) | `sha256(text)` | single `0.0–1.0` risk score | 24h TTL, size-cap 2000 (pop 1000) | **YES** — same text miss re-runs `score_text` | `server/detectors.py:817-818,824-869` |
| 3 | `_DETECTOR_CACHE` (dict) + `run_detector_cached` | `sha256(detector:name:text)` | detector result dict | explicit `clear_detector_cache()` only | n/a — **dead code**, never called | `server/detectors.py:792-809` |
| 4 | `_store_version_cache` (dict) | single slot | Chrome Web Store served version | 900s TTL | low — one outbound HTTP GET, serialized by GIL | `server/routes_extension.py:77-78,81-118` |
| 5 | `_WRITABLE_KEYS_CACHE` (frozenset) | single slot | settable user-settings keys | **nothing** (immutable declaration) | none | `server/user_settings_service.py:1154-1164` |
| 6 | `@lru_cache` x7 | args | stylometry Zipf freq tables, sample selectors (pure CPU) | **nothing** (immutable data) | none — sync pure functions | `server/stylometry/zipf.py:98,111,159,177,342`, `engine.py:137`, `target_sampler.py:80` |
| 7 | `zipf_freq.json` (disk) | file path | Zipf frequency corpus | regenerate on absence | none | `server/stylometry/zipf.py:41,163-172` |
| 8 | `redis>=5.0.0` | — | **NOT USED.** Listed in `requirements.txt:27`, zero imports in `server/` | — | — | `server/requirements.txt:27` |
| 9 | web `localStorage` | `helpotron_server`, `public_id`, `token`, `helpotron_csrf_token` | client auth/session artifacts | explicit set/remove | none (client prefs) | `web/src/api.js:8,19,74,92,297` |
| 10 | web `_csrfHealInFlight` | single promise | **the only single-flight in the whole codebase** | promise resolves | n/a | `web/src/api.js:83-99` |
| 11 | extension `chrome.storage.local` CHAT_KEY | `helpotron_chat[_t{threadId}]` | chat thread `[{sender,text}]` | overwrite on fetch — see (d) | n/a (client) | `extension/popup.js:1778,3440-3458` |

**Headline:** there is **no Redis, no memcached, no shared/multi-node cache anywhere.**
The only real caches are three in-process Python dicts (detectors, store-version,
writable-keys), a handful of `lru_cache` for pure stylometry math, one disk JSON,
and client-side `localStorage`/`chrome.storage`. There is **no service worker, no
Cache Storage, and no HTTP cache config** in `web/` — confirmed: `vite.config.js`
sets no cache headers, `web/src` has no `caches.`/`serviceWorker` usage, and
`deploy/nginx.conf` (the unused `helpotron.com` config) sets none either.

---

## (b) Public site cache headers — the real-world instance of the stale-deploy bug

**How it is served today** (verified): `helpotron-web.service` runs
`vite preview --host 127.0.0.1 --port 5173`, and `~/.cloudflared/helpotron.yml`
tunnels `helpotron.dpdns.org → http://localhost:5173`. Vite preview's static
server is `sirv` with `{ dev: true, etag: true }` and **no `maxAge`/`immutable`**
(verified in `web/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:35451-35465`).
With `dev:true` + `etag:true`, sirv's `viaLocal` sets **every** static response
(including hashed assets *and* `index.html`) to:

```
Cache-Control: no-cache        (viaLocal → headers['Cache-Control'] = isEtag ? 'no-cache' : 'no-store')
```

So today:

- **Hashed assets (`/assets/*`)**: `no-cache` + ETag → the browser revalidates
  every chunk on every load. **Safe but wasteful** — the filenames are already
  content-hashed (`index-BO8dMyzv.js`, `react-vendor-D0xX8Ih1.js`, …), so they
  could be cached forever. Every page load currently pays an If-None-Match
  round-trip on every chunk for zero correctness benefit.
- **`index.html`**: also `no-cache` + ETag → revalidated every navigation.
  This is the **correct** behaviour and must be preserved.
- **`nginx.conf`** (`deploy/nginx.conf`, `helpotron.com`, **not in use**): sets
  **no** cache headers at all → nginx would apply heuristic caching; `index.html`
  has no Last-Modified-independent guard. If this config is ever deployed as-is,
  it is the thing that would introduce the stale-deploy bug at the origin.
- **cloudflared**: no caching — it is a tunnel, not the CDN; it forwards whatever
  the origin sends.

**Why the stale-deploy bug is a *runtime* bug, not a header bug, in the current
setup:** the failure is an already-open SPA tab holding stale chunk URLs after a
redeploy; its next lazy `import()` 404s → `TypeError: Failed to fetch dynamically
imported module`. `isStaleDeployError()` + the `clear-cache` action (already
shipped) is the correct *runtime* remedy. **But** the header bug is one
misconfiguration away: the moment anyone adds `Cache-Control: max-age=<long>` to
`index.html` (the tempting "cache the HTML" optimisation), a returning visitor
gets old HTML → old chunk URLs → the 404 on every reload, and the UI handler is
fighting the header layer instead of the source.

**Exact header change to prevent the class of bug at the source** — add a
`configurePreviewServer` middleware (same slot as the existing `httpsRedirect` /
`appSecurityHeaders` plugins in `web/vite.config.js`):

```
/assets/*          Cache-Control: public, max-age=31536000, immutable
*.html and SPA     Cache-Control: no-cache          (never no-store, never max-age)
/public non-hashed Cache-Control: public, max-age=86400, must-revalidate
```

Concretely, in `web/vite.config.js`, add:

```js
function assetCacheHeaders() {
  return {
    name: 'asset-cache-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '/').split('?')[0];
        if (path.startsWith('/api/') || path.startsWith('/uploads/')) return next();
        if (path.startsWith('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (/\.[a-z0-9]+$/i.test(path)) {
          res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
        next();
      });
    },
  };
}
// register it alongside react(), tailwindcss(), httpsRedirect(), appSecurityHeaders()
```

Do **not** set `preview.headers` globally (it cannot branch on path). Do **not**
touch `appSecurityHeaders` — it owns CSP/XFO/HSTS, a different concern.

---

## (c) LLM duplicate-call finding — is there a stampede on paid calls?

**Yes, there is no protection of any kind.** `server/llm.py` `call_llm`
(`:369`) and `stream_llm` (`:611`) each open a **fresh `httpx.AsyncClient`** and
**POST OpenRouter on every invocation**. Full file read confirms: zero
memoisation, zero `lru_cache`, zero in-flight map, zero single-flight. 13
server files call `call_llm`/`stream_llm` (`orchestrator.py:281`,
`overlord_agent.py:604,628,1002`, `draft.py:142`, `routes_overlord.py:1639,1644,
1939,2103,2362`, `routes_dump.py:476,496`, `study_tools.py:80,84,241`,
`assignment_dump.py:127`, `humanizer.py:568,584`, `humanize_skill.py:437,520`,
`agent_session.py:178`, plus `screen_vision.py` via the same resolution chain) —
**none of them dedupe**.

**Two identical concurrent requests = two paid upstream calls.** An N-user
thundering herd on the same assignment = N OpenRouter POSTs = N charges, and
(N−1)× of them are also burning the *user's metered credits*
(`TOKENS_PER_USD = 10_000`).

**Honest size of the waste.** Per-call cost is small: a level-4–7 assignment
finalize on `deepseek-v4.1-flash` ($0.15/M in, $0.60/M out) at ~4k in + ~2k out
≈ **$0.0018/call**. So a 100× herd ≈ $0.18 — *dollar* waste is negligible. The
real costs are:

1. **Correctness / double-charging** — a double-click "Generate", or a client
   retry (the `queueRetry` path in `web/src/api.js:141-164` re-runs the whole
   stream on 429), makes the same metered user pay twice. This is the argument
   that matters.
2. **Latency** — N serial OpenRouter round-trips instead of one.

**Verdict: a short-lived single-flight cache is worth it *now*, but narrowly and
for correctness, not for dollar savings.** Recommendation:

- **Key** = `sha256(model + json-mode + system_prompt + user_prompt)`, **TTL ≈
  30–60s**, **only dedupe while in-flight** (single-flight), do **not** persist
  LLM outputs (they are per-user content and must not be shared across users —
  include `user_id` in the key if you ever cache across a process, which you
  should not yet).
- It is **premature** to add a response *cache* (storing results beyond the
  in-flight window). Single-flight (coalesce concurrent identical calls) is the
  high-value, low-risk 90%; an actual result-cache invites staleness and
  cross-user leakage for pennies of saving.

The cheaper, higher-value client-side fix already partially exists: the extension
guards double-submit with `chatBusy` (`extension/popup.js:1785,3764-3772`). The
web `generateStream`/`agentChatStream` callers should be checked for the same
busy-state guard — **UNVERIFIED** whether every web "Generate" button disables
while in-flight.

---

## (d) `CHAT_KEY` / `chrome.storage.local` staleness — extension

`loadPopupChatHistory()` (`extension/popup.js:3439-3463`):

1. Reads `CHAT_KEY` (`helpotron_chat`) or `helpotron_chat_t{threadId}` and
   **renders it immediately** (`:3442`) — a stale copy is *always* shown first.
2. Fetches `/api/extension/agent_chat/history?thread_id=N`, maps to
   `[{sender,text}]` (`:3455`), and re-renders + overwrites the cache **only if
   `msgs.length` is truthy** (`:3456-3458`).

**Two real staleness defects:**

- **Empty-server response never clears the local copy.** If the server returns
  `chat: []` (thread deleted/cleared server-side), the `if (msgs.length)` guard
  skips the write, so the old thread stays on screen and in storage forever.
  `renderPopupChatHistory` even special-cases the empty case to show the greeting
  (`:1916-1918`) — but it is only reached when the *cached* array is empty, not
  when the server says empty.
- **No shape versioning.** The cached object is read and rendered against the
  *current* renderer's expectations (`m.sender`, `m.text`, `m.html` —
  `:1920`). A new build that adds fields (`m.id`, `m.timestamp`, actions) would
  read an old-shaped object and silently drop the new fields; a build that
  *renames* a field renders `undefined`. There is no `SCHEMA_VERSION` key, so
  nothing detects or migrates an old shape.

**Assessment:** yes, a stale local copy can be served after server data changes
(and it is, by design, on every load before the fetch resolves). Severity is low
today because the shape is a flat `{sender,text}` that has been stable; the fix is
a versioned key + clearing on empty response (see plan).

---

## (e) Consistent hashing — applicable? **No. Not today.**

Helpotron is **one process, one box, one SQLite file**. Verified facts:

- No Redis/memcached tier (`redis` appears only as an unused requirement line).
- No second app instance; the public site and API are single `uvicorn` + single
  `vite preview` on one machine (`start_stack.sh`, `helpotron-api.service`,
  `helpotron-web.service`).
- Every cache in (a) is a process-local dict or `lru_cache` — there is nothing to
  shard, so `hash(key) mod N` and the 75%-remap failure mode cannot occur, and a
  360° hash ring has nothing to distribute.

**Verdict: `not yet`.** The correct output is a trigger condition, not a build:

> **Trigger:** consistent hashing becomes relevant the moment **a second app
> instance** (for availability/scale-out) or **a shared Redis/memcached tier**
> appears — i.e. the first time there are ≥2 cache nodes sharing a key space.
> When that happens, key → node must be via a hash ring (e.g.
> `hash(key)` on a 2³² ring with vnodes), never `hash(key) % len(nodes)`, and
> node add/remove must rebalance only the affected arc.

Do **not** build a hash ring for a single node — that is premature abstraction
with zero payoff and a new failure mode.

---

## (f) Do-now plan (numbered, exact files/changes/tests/verify)

**P1 — immutable hashed assets + `no-cache` index.html (source-fix the stale-deploy class).**
- File: `web/vite.config.js`. Change: add the `assetCacheHeaders()` plugin from
  (b) to the `plugins` array.
- Test: none needed for headers (config-only); verify with two curls after a
  local preview:
  ```
  node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 &   # or systemctl --user start helpotron-web.service
  curl -sI http://127.0.0.1:5173/ | grep -i cache-control       # expect: no-cache
  curl -sI http://127.0.0.1:5173/assets/index-<hash>.js | grep -i cache-control   # expect: public, max-age=31536000, immutable
  ```
- Prove: `curl -sI` shows the two distinct headers above. **UNVERIFIED** live
  because the site is deliberately down (maintenance service) — do not start it
  per owner rule; run `vite preview` locally against `web/dist` only.

**P2 — single-flight coalescing for paid LLM calls.**
- File: `server/llm.py` (or a new `server/llm_singleflight.py` imported by it).
  Change: wrap the OpenRouter POST in a per-key in-flight map
  (`key = sha256(model|json_mode|system_prompt|user_prompt)`, include `user_id`;
  on second concurrent identical request, `await` the first one's future and
  return the same result; drop the key when the first resolves/raises). No
  result caching beyond the in-flight window.
- Test: add `server/tests/test_llm_singleflight.py` — monkeypatch the OpenRouter
  client, fire two identical `call_llm`s concurrently, assert the patched client
  is called **once** and both get the result. This drives the actual network
  layer (the fake must capture the call count).
- Verify: `./.venv/bin/python -m pytest server/tests/test_llm_singleflight.py -q`.

**P3 — version + clear the extension chat cache.**
- File: `extension/popup.js`. Change: (1) rename keys to versioned
  `helpotron_chat_v2` / `helpotron_chat_v2_t{threadId}` (or add a
  `helpotron_chat_schema` version key checked before read); (2) in
  `loadPopupChatHistory`, clear the cache and render the greeting when the
  server returns `chat: []` (remove the `if (msgs.length)` guard around the
  write so empty clears).
- Test: `extension/tests/` — a unit test asserting an empty server response
  removes the cached key (stub `chrome.storage.local` and `fetch`).
- Verify: `node --test extension/tests/<name>.test.js` (match existing runner;
  confirm the exact test command in `extension/package.json` / tests dir).

**P4 — document the redis dead dependency.**
- File: `server/requirements.txt:27`. Change: remove `redis>=5.0.0,<6.0.0` (no
  import exists) — or leave it but add a comment. Do the removal only if you
  confirm no transitive import; **UNVERIFIED** whether any plugin imports it.

---

## (g) RISKS / DO NOT DO

- **DO NOT cache `index.html` aggressively.** Any `Cache-Control: max-age=N` on
  the HTML (or the `try_files`-without-no-cache nginx config) makes the
  stale-deploy bug *worse*: old HTML → old hashed chunk URLs → 404 → the exact
  `isStaleDeployError` path the session already shipped. `index.html` must stay
  `no-cache`. `no-store` is also wrong (kills bfcache for no gain).
- **DO NOT cache LLM responses across users.** A result cache keyed on prompt
  without `user_id` leaks one student's generated material to another. If
  single-flight is added, the key **must** include the metered user, and the
  entry must die the instant the request settles (in-flight only).
- **DO NOT build a hash ring / consistent-hash layer now.** Single process, no
  shared cache → pure complexity, zero benefit (see (e)).
- **DO NOT change `_SCORE_CACHE`/`DETECTOR_CACHE` invalidation to "nothing."**
  They already have 24h TTLs; a detector model update is a silent invalidation
  gap today (`clear_detector_cache()` exists but is dead code — `_DETECTOR_CACHE`
  at `detectors.py:792` is unused; the live `DETECTOR_CACHE` has no clear hook).
  If detectors get re-tuned, wire `clear_detector_cache`/a TTL bump first.
- **DO NOT `git checkout` or "clean up" the dirty tree.** Other agents + the
  owner have uncommitted WIP in these files; only add this report.
- **DO NOT restart `helpotron-api` / `helpotron-web` to "verify."** The site is
  intentionally down; a preview restart of the wrong thing is an outage. Verify
  headers with a local `vite preview` only.
- **DO NOT add a service worker to `web/`** to "cache the shell" — a SW with a
  stale precache is a *worse* stale-deploy vector than any header, and it would
  need its own update/`skipWaiting` discipline that this codebase does not have.
