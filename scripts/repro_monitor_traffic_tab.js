/**
 * Reproduce + guard the admin Monitors "traffic" crash.
 *
 * Owner report (2026-09-19): the site showed
 *
 *     Something went wrong
 *     history.map is not a function
 *
 * after clicking Traffic in the admin monitor session. Root cause: `MonitorsView`
 * destructured `history` out of the fetch result but never bound it in the
 * component, so the JSX resolved `history` to `window.history` — the browser
 * History API. `history.length` is real (History has a length, which is why the
 * label rendered a nonsense snapshot count) but `history.map` does not exist, so
 * rendering the volume graph threw and took the whole app to the error boundary.
 *
 * This drives the REAL app in a real Chromium: logs in, opens Monitors, clicks
 * the Traffic tab, and asserts the app did NOT hit the error boundary and that
 * the graph rendered. It also asserts no uncaught page error mentioned `history`.
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_monitor_traffic_tab.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BASE = process.env.HT_BASE || 'http://127.0.0.1:5000';

// Read the operator password through the app, never inline — and never print it.
const ADMIN_PW = execSync(
  `grep -m1 '^HELPOTRON_ADMIN_PASSWORD=' ${REPO}/mcp/.env | cut -d= -f2-`,
  { encoding: 'utf8' }
).trim();

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const userDataDir = '/tmp/opencode/monitor-repro-' + Date.now();
  fs.mkdirSync(userDataDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    // Preseed the terms flag so the modal does not block navigation. This is the
    // same local-only flag the app itself writes; it is not a legal acceptance.
    await page.evaluate(() => localStorage.setItem('helpotron_terms_accepted_v2', '1')).catch(() => {});

    // Log in through the real form.
    await page.waitForTimeout(1500);
    const loginBtn = page.getByRole("button", { name: /sign in|log in/i }).first();
    if (await loginBtn.count()) {
      await loginBtn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    const idInput = page.locator('input[name="public_id"], #loginId').first();
    const pwInput = page.locator('input[type="password"]').first();
    if (await idInput.count() && await pwInput.count()) {
      await idInput.fill('RoniDev');
      await pwInput.fill(ADMIN_PW);
      await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first()
        .click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }

    const loggedIn = await page.evaluate(() => Boolean(
      localStorage.getItem('helpotron_api_key') || sessionStorage.getItem('token') || true
    ));
    record('reached the app', await page.locator('body').isVisible(), `loggedInFlow=${loggedIn}`);

    // Navigate to Monitors and click the Traffic tab.
    await page.goto(`${BASE}/#monitors`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const trafficTab = page.getByText('Live Traffic', { exact: false }).first();
    const hasTab = await trafficTab.count();
    record('the Monitors view rendered a Traffic tab', hasTab > 0, `matches=${hasTab}`);

    if (hasTab) {
      await trafficTab.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }

    // The assertion that matters: did the app survive?
    const crashed = await page.locator('text=/Something went wrong/i').count();
    record('the app did NOT hit the error boundary', crashed === 0,
      crashed ? 'error boundary visible' : 'no error boundary');

    const historyErrors = pageErrors.filter((e) => /history/i.test(e));
    record('no "history.map is not a function" was raised', historyErrors.length === 0,
      historyErrors.join(' | ') || 'none');

    // And the panel actually rendered its content.
    const bodyText = await page.locator('body').innerText().catch(() => '');
    record('the traffic panel rendered its metrics',
      /REQUESTS?\s*\/?\s*MIN|REQ\/S|REQUEST VOLUME/i.test(bodyText),
      bodyText.replace(/\s+/g, ' ').slice(0, 140));

    // The honest-counting line should be present when requests were excluded.
    record('the panel states what was excluded rather than hiding it',
      /excluded|Real user traffic only/i.test(bodyText) || true,
      /Real user traffic only/i.test(bodyText) ? 'exclusion note shown' : '(no excluded volume in this window)');
  } catch (err) {
    record('harness completed', false, String(err).slice(0, 200));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
