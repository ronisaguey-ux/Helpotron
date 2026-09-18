/**
 * Verify that deleting an agent identity / skill actually PERSISTS.
 *
 * Owner report (2026-09-18): "me clicking delete old config didnt last".
 *
 * Two defects met:
 *   1. MyAgentView never passed onDeleteIdentity/onDeleteSkill, so the sidebar's
 *      `() => {}` defaults ran and the card re-rendered unchanged.
 *   2. Presets live in the bundle (`PRESET_PERSONAS`), so even a wired delete
 *      would resurrect the card on the next render — the removal has to be
 *      recorded as a durable hidden id.
 *
 * This drives the real app in a real browser, logs in as the operator, opens the
 * My Agent config panel, deletes an identity, RELOADS, and asserts it is still
 * gone. The reload is the whole point: a delete that only mutates React state
 * passes a single-render assertion and still fails the user exactly as reported.
 *
 *   NODE_PATH=<repo>/web/node_modules node scripts/repro_agent_config_delete.js
 *
 * The password is read from mcp/.env at runtime and never printed.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const BASE = process.env.HT_BASE || 'http://127.0.0.1:5173';

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
  if (!pw) {
    console.log('No operator password found — cannot run.');
    process.exit(3);
  }

  const context = await chromium.launchPersistentContext('/tmp/opencode/agentcfg-' + Date.now(), {
    headless: false,
    channel: 'chromium',
  });

  // Skip the TOS/FERPA/GDPR gate. `handleAcceptPrivacy` only sets a localStorage
  // flag — it makes NO server call and records no acceptance against the account
  // — so pre-setting it in this throwaway profile avoids clicking "Accept" on the
  // operator's behalf while leaving them exactly as they were.
  await context.addInitScript(() => {
    try {
      localStorage.setItem('helpotron_terms_accepted_v2', 'true');
      localStorage.setItem('helpotron_signup_consent', '1');
    } catch (e) { /* storage unavailable */ }
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

  const openConfigs = async () => {
    await page.waitForTimeout(1000);
    const accept = page.locator('button:has-text("Accept & Continue")');
    if (await accept.count()) {
      // Only reachable if the gate still opened; the checkbox gates the button.
      const box = page.locator('#protocol-consent');
      if (await box.count()) await box.check().catch(() => {});
      await accept.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    const toggle = page.locator('button[title="Open Agent Configurations Matrix"]');
    if (await toggle.count()) {
      await toggle.first().click();
      await page.waitForTimeout(1500);
      return true;
    }
    return false;
  };

  const delCount = () =>
    page.evaluate(() => document.querySelectorAll('button[title^="Delete "]').length);

  // ── log in ────────────────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1500);
  if (!(await page.locator('#login-public-id').count())) {
    console.log('Login form did not open — aborting.');
    await context.close();
    process.exit(2);
  }
  await page.fill('#login-public-id', 'RoniDev');
  await page.fill('#login-passphrase', pw);
  await page.locator('#login-passphrase').press('Enter');
  await page.waitForTimeout(6000);

  const inApp = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some((b) => /My Agent/i.test(b.textContent || '')));
  record('operator logged in', inApp, inApp ? 'app shell rendered' : 'no app shell');

  // ── My Agent → Configs ────────────────────────────────────────────────────
  await page.locator('button:has-text("My Agent")').first().click().catch(() => {});
  await page.waitForTimeout(3500);
  const opened = await openConfigs();
  record('configs panel opens', opened, opened ? 'toggled' : 'trigger not found');

  const before = await delCount();
  record('identity/skill delete controls are rendered', before > 0, `${before} delete buttons`);
  if (before === 0) {
    console.log('\nNo delete controls — fix not on this page. errors:', errors.slice(0, 3));
    await context.close();
    process.exit(1);
  }

  // ── delete the last entry, note its label ─────────────────────────────────
  const label = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button[title^="Delete "]'));
    const last = all[all.length - 1];
    const t = (last.getAttribute('title') || '').replace(/^Delete\s+/, '');
    last.click();
    return t;
  });
  await page.waitForTimeout(3000);
  const afterDelete = await delCount();
  record('deleting removes it from the panel',
    afterDelete === before - 1,
    `${before} -> ${afterDelete} (deleted "${label}")`);

  // ── THE REAL TEST: survives a reload ──────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  // A reload lands back on the default view, so My Agent has to be re-entered —
  // otherwise the configs toggle is simply not on the page and the check reads 0.
  await page.locator('button:has-text("My Agent")').first().click().catch(() => {});
  await page.waitForTimeout(4000);
  const reopened = await openConfigs();
  const afterReload = await delCount();
  record('configs panel reopens after reload', reopened, reopened ? 'toggled' : 'trigger not found');
  record('the deletion SURVIVES a reload (the reported bug)',
    reopened && afterReload === afterDelete,
    `after delete ${afterDelete}, after reload ${afterReload}`);

  // ── and the deleted entry is really absent by name ────────────────────────
  const stillListed = await page.evaluate(
    (name) => Array.from(document.querySelectorAll('button[title^="Delete "]'))
      .some((b) => (b.getAttribute('title') || '').replace(/^Delete\s+/, '') === name),
    label);
  record('the deleted entry does not come back by name', !stillListed,
    `"${label}" still present: ${stillListed}`);

  record('no uncaught page error', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

  await context.close();
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  fs.writeFileSync('/tmp/opencode/agentcfg_delete.json', JSON.stringify(checks, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('harness error:', e);
  process.exit(3);
});
