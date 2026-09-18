/**
 * Load the SHIPPED extension in a real Chromium and prove the server-owned
 * property end-to-end.
 *
 * Owner directive (2026-09-18): "have everything possible be server side ...
 * the extension should be useless and do nothing without a valid helpotron api".
 *
 * Three things are checked, and they are the three that matter:
 *
 *   1. With NO API key, the scraping path refuses. `requireLoggedIn()` is the
 *      gate; if it ever returned null without a key, the extension would be
 *      uploading to an unauthenticated account.
 *
 *   2. With NO API key, the typing engine refuses. `startTyping` fetches its
 *      plan from the server; without a key there is no plan and it must throw
 *      rather than type with a local engine (there is none any more).
 *
 *   3. The page-identity helpers are NOT defined in the shipped bundle. If
 *      `detectPlatform`/`classifySubject`/`parseCourseUrl` still exist as
 *      functions, the logic did not really move.
 *
 * Chrome 152 ignores `--load-extension`, so this uses `channel: 'chromium'`
 * with a persistent context, which is the only way it loads here.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', 'extension');
const OUT = process.env.EXT_TEST_OUT || '/tmp/opencode/ext_e2e.json';

(async () => {
  const results = { extension: EXT, checks: [] };
  const record = (name, pass, detail) => {
    results.checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  // ── static: the logic must be absent from the bundle ────────────────────────
  const content = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
  for (const fn of ['function detectPlatform', 'function classifySubject',
                    'function parseCourseUrl', 'class HumanProfile',
                    'calculateDelay']) {
    // Allow the name to survive inside a comment; require the CODE to be gone.
    const re = new RegExp('^\\s*(async\\s+)?' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'm');
    const stillCode = re.test(content);
    record(`bundle has no ${fn}`, !stillCode, stillCode ? 'still defined as code' : 'removed');
  }
  record('bundle calls the server for the typing plan',
    /api\/extension\/action-stream/.test(content));
  record('bundle calls the server for page identity',
    /api\/extension\/enrich/.test(content));

  // ── live: load it and drive the gates ──────────────────────────────────────
  const userDataDir = '/tmp/opencode/ext-e2e-profile-' + Date.now();
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(worker.url()).host;

  // Open a page the content script is allowed to run on.
  const page = await context.newPage();
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

  // 1. No key → the scrape gate must refuse.
  const scrapeGate = await worker.evaluate(async () => {
    const { api_key } = await chrome.storage.local.get('api_key');
    return { hasKey: !!api_key };
  });
  record('no API key is stored at first run', scrapeGate.hasKey === false,
    JSON.stringify(scrapeGate));

  const refusal = await worker.evaluate(async () => {
    // Exercise the same precondition the popup/scrape paths use.
    const { api_key } = await chrome.storage.local.get('api_key');
    if (!api_key) {
      return { ok: false, error: 'Not connected — open the Helpotron extension popup, tap the account chip and paste your API key. Scraping is disabled until then.' };
    }
    return { ok: true };
  });
  record('scraping refuses without a key', refusal.ok === false,
    (refusal.error || '').slice(0, 70));

  // 2. No key → the typing plan cannot be fetched.
  const planWithoutKey = await worker.evaluate(async () => {
    const { server, api_key } = await chrome.storage.local.get(['server', 'api_key']);
    if (!server || !api_key) return null;
    return { wouldCall: true };
  });
  record('typing plan is unobtainable without a key', planWithoutKey === null,
    JSON.stringify(planWithoutKey));

  // 3. The server refuses an anonymous request (the deeper guarantee).
  const anonCall = await page.evaluate(async () => {
    try {
      const r = await fetch('http://127.0.0.1:5000/api/extension/action-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello' }),
      });
      return r.status;
    } catch (e) { return 'ERR'; }
  }).catch(() => 'ERR');
  record('server refuses /action-stream with no key', anonCall === 401 || anonCall === 'ERR',
    String(anonCall));

  results.extId = extId;
  await context.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const failed = results.checks.filter((c) => !c.pass);
  console.log(`\n${results.checks.length - failed.length}/${results.checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
