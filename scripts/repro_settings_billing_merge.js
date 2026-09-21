/**
 * Verify batch 3: Insights in Settings, Billing in Settings, the Library merge.
 *
 * Owner's UI audit (2026-09-19):
 *   "Insights = move inside Settings. History + Library = merge into one Library.
 *    Billing = remove top-level Billing, keep+improve in Settings as 4 tiers,
 *    remove top-up, fix legacy amounts in the settings ledger."
 *
 * The amounts assertion is the important one: the settings page used to advertise
 * Trial 150 / Basic 300 / Pro 1,000 / Elite 2,700 — stale by 100x after the token
 * unit changed — so this checks the page against GET /api/plans, not against a
 * literal copied out of the component.
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_settings_billing_merge.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const BASE = process.env.HT_BASE || 'http://127.0.0.1:5000';

function adminPassword() {
  for (const rel of ['mcp/.env', '.env']) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (line.startsWith('HELPOTRON_ADMIN_PASSWORD=')) {
        return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return '';
}

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const pw = adminPassword();
  if (!pw) { console.log('No operator password found — cannot run.'); process.exit(3); }

  // The oracle: what the server says the tiers are.
  const live = await fetch(`${BASE}/api/plans`).then((r) => r.json()).catch(() => null);
  const liveTiers = (live && live.plans) || [];

  const context = await chromium.launchPersistentContext('/tmp/opencode/setmerge-' + Date.now(), {
    headless: false,
    channel: 'chromium',
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('helpotron_terms_accepted_v2', 'true');
      localStorage.setItem('helpotron_signup_consent', '1');
    } catch (e) { /* storage unavailable */ }
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1500);
  if (!(await page.locator('#login-public-id').count())) {
    console.log('Login form did not open — aborting.');
    await context.close(); process.exit(2);
  }
  await page.fill('#login-public-id', 'RoniDev');
  await page.fill('#login-passphrase', pw);
  await page.locator('#login-passphrase').press('Enter');
  await page.waitForTimeout(6000);

  const accept = page.locator('button:has-text("Accept & Continue")');
  if (await accept.count()) {
    const box = page.locator('#protocol-consent');
    if (await box.count()) await box.check().catch(() => {});
    await accept.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // ── nav: the three destinations are gone from the rail ───────────────────
  const navText = await page.evaluate(() => {
    const nav = document.querySelector('nav') || document.body;
    return nav.innerText;
  });
  const railHas = (label) => new RegExp(`(^|\\n)\\s*${label}\\s*($|\\n)`, 'i').test(navText);
  record('nav advertises Library', railHas('Library'), railHas('Library') ? 'present' : 'missing');
  record('nav no longer advertises Insights',
    !/^\s*Insights\s*$/im.test(navText), 'absent');
  record('nav no longer advertises Billing',
    !/^\s*Billing\s*$/im.test(navText), 'absent');
  record('nav no longer advertises a separate History',
    !/^\s*History\s*$/im.test(navText), 'absent');

  // ── Settings → Insights ──────────────────────────────────────────────────
  await page.locator('button:has-text("Settings")').first().click().catch(() => {});
  await page.waitForTimeout(3000);

  const insightsNav = page.locator('button:has-text("Insights")').first();
  record('Settings has an Insights section', (await insightsNav.count()) > 0,
    `${await insightsNav.count()} entry`);
  if (await insightsNav.count()) {
    await insightsNav.click();
    await page.waitForTimeout(3000);
    const body = await page.evaluate(() => document.body.innerText);
    record('Insights content renders inside Settings',
      body.length > 400 && !/Loading insights/.test(body.slice(0, 400)),
      `${body.length} chars of content`);
  }

  // ── Settings → Account → Credits & Billing ───────────────────────────────
  // Credits & Billing moved UNDER Account (owner 2026-09-21), so it is a
  // sub-tab now: open the Account group first, then the section.
  const accountNav = page.locator('[data-settings-nav="account"]').first();
  if (await accountNav.count()) {
    await accountNav.click();
    await page.waitForTimeout(2000);
  }
  const creditsNav = page.locator('[data-settings-subnav="credits"]').first();
  record('Credits & Billing lives under Account', (await creditsNav.count()) > 0,
    `${await creditsNav.count()} sub-tab`);
  if (await creditsNav.count()) {
    await creditsNav.click();
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body.innerText);

    // Every live allowance must appear, and NO pre-100x number may.
    const liveStrs = liveTiers.map((t) => Number(t.monthly_task_tokens).toLocaleString());
    const missing = liveStrs.filter((s) => !body.includes(s));
    record('every live tier allowance is shown', missing.length === 0,
      missing.length ? `missing ${missing.join(', ')}` : liveStrs.join(' / '));

    const stale = ['150 task', '300 task', '1,000 task', '2,700 task',
      '150 token', '300 token', '1,000 token', '2,700 token'];
    const foundStale = stale.filter((s) => body.includes(s));
    record('no pre-100x legacy amounts remain', foundStale.length === 0,
      foundStale.length ? `still present: ${foundStale.join(', ')}` : 'clean');

    record('no top-up is offered', !/top.?up/i.test(body),
      /top.?up/i.test(body) ? 'still offering a top-up' : 'none');

    // Prices must match the server too.
    const priceMissing = liveTiers
      .filter((t) => t.price_cents > 0)
      .map((t) => `$${(t.price_cents / 100).toFixed(0)}`)
      .filter((p) => !body.includes(p));
    record('tier prices match the server', priceMissing.length === 0,
      priceMissing.length ? `missing ${priceMissing.join(', ')}` : 'all prices present');
  }

  // ── Library merge ────────────────────────────────────────────────────────
  await page.locator('button:has-text("Library")').first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const libTabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim()));
  record('Library has a Completed Work tab',
    libTabs.some((t) => /^Completed Work/.test(t)),
    libTabs.filter((t) => /Completed|Files|Saved|Deadlines/.test(t)).join(' | ') || 'no tabs found');

  const completedTab = page.locator('button:has-text("Completed Work")').first();
  if (await completedTab.count()) {
    await completedTab.click();
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body.innerText);
    record('Completed Work renders turned-in work',
      body.length > 200 && !/undefined/.test(body),
      `${body.length} chars`);
  }

  // ── the /history deep-link must land somewhere, not blank ────────────────
  await page.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const histBody = await page.evaluate(() => document.body.innerText);
  record('/history lands on the Library, not a blank page',
    /Completed Work/.test(histBody) || /Library/i.test(histBody),
    histBody.replace(/\s+/g, ' ').slice(0, 90) || '(empty)');

  record('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await context.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e && e.message); process.exit(1); });
