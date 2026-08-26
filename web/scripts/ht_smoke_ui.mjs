/* ht_smoke_ui.mjs — corrected live dogfood (08-26).
 * Fixes over ht_flow_smoke.mjs:
 *  - submit buttons matched EXACTLY (Create Free Account / Sign in to Workspace),
 *    never the Create-Account/Sign-In TAB buttons (which match /create|sign in/i
 *    first in DOM and silently no-op — that left the bot on the auth gate);
 *  - "in app" check looks for the real sidebar ('command center') not the modal
 *    header 'Academic OS', which the gate modal ALSO contains.
 * Runs against the local stack (API :8000, web :5173). READ-ONLY on code.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = '/tmp/ht_ui_smoke';
import { mkdirSync, writeFileSync } from 'fs';
mkdirSync(OUT, { recursive: true });

const PU = 'uismoke_' + Date.now().toString(36);
const PW = 'UiSmoke123!';
const ADMIN = 'RoniDev';
const ADMINPW = process.env.ADMIN_PW || 'ChromiumSmoke9!';
const results = [];
const consoleErrors = [];

function rec(severity, where, issue, detail = '') {
  results.push({ severity, where, issue, detail });
  console.log(`${severity.padEnd(6)} ${where.padEnd(16)} ${issue}`);
}
const snapshot = (page, name) =>
  page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const inApp = (page) => page.getByText('command center', { exact: false }).count();

async function step(name, fn) {
  try { await fn(); if (!results.some(r => r.where === name && r.severity === 'INFO')) rec('OK', name, 'passed'); }
  catch (e) { rec('BUG', name, e.message.slice(0, 90)); }
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

// 1. first visit gate
await step('auth-gate', async () => {
  await page.goto(BASE);
  await page.waitForTimeout(800);
  if (!(await page.getByText('Create Student Account', { exact: false }).count()))
    throw new Error('auth modal not visible on first visit');
});
await page.getByText('Accept', { exact: true }).click({ timeout: 1200 }).catch(() => {});

// 2. signup (submit EXACT)
await step('signup', async () => {
  const allInputs = page.locator('form input, dialog input, .modal input, input').first();
  await allInputs.fill(PU);
  await page.locator('input[type="password"]').nth(0).fill(PW);
  const confirm = page.locator('input[type="password"]').nth(1);
  if (await confirm.count()) await confirm.fill(PW);
  const consent = page.getByText('I agree to the Academic').first();
  if (await consent.count()) await consent.click();
  await page.locator('form').first().press('Enter').catch(() => {});
  await page.getByRole('button', { name: /Create Free Account/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!(await inApp(page))) throw new Error('not in app after signup');
});

// 3. privacy modal dismiss
await step('privacy-modal', async () => {
  await page.waitForTimeout(1000);
  const agree = page.getByText('I agree', { exact: false }).first();
  if (await agree.count()) { await agree.click(); await page.waitForTimeout(600); }
  if (!(await inApp(page))) throw new Error('privacy modal not dismissible / app not visible');
});

// 4. dashboard
await step('dashboard', async () => {
  await page.waitForTimeout(800);
  await snapshot(page, '02_dashboard');
  if (!(await page.getByText(/command center|assignments/i).count())) throw new Error('no dashboard content');
});

// 5. 2FA settings panel (settings -> Privacy & Security -> section exists)
await step('2fa-panel', async () => {
  await page.getByText(/^Settings$/).last().click().catch(() => {});
  await page.waitForTimeout(900);
  const navTxts = await page.locator('nav, [class*=sidebar], [class*=rail]').allTextContents().catch(() => []);
  rec('INFO', 'nav-dump', navTxts.join(' | ').slice(0, 400));
  const sec = page.getByText('Privacy & Security', { exact: false }).first();
  if (await sec.count()) await sec.click();
  await page.waitForTimeout(700);
  const any2fa = await page.getByText(/two[- ]factor|2FA|authenticator|TOTP/i).count();
  await snapshot(page, '03_2fa_panel');
  if (any2fa === 0) throw new Error('no 2FA section found in settings');
  rec('INFO', '2fa-panel', `2FA strings=${any2fa}`);
});

// 6. admin login (submit EXACT)
await step('admin-login', async () => {
  // full sign-out first: clear storage so gate is clean
  await page.evaluate(() => { localStorage.clear(); });
  const logoutBtn = page.getByRole('button', { name: /log out|sign out/i }).first();
  if (await logoutBtn.count()) await logoutBtn.click().catch(() => {});
  await page.goto(BASE);
  await page.waitForTimeout(900);
  const tab = page.getByText('Sign In', { exact: true }).first();
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(400);
  await page.locator('input[name="username"], input[name="user"]').first().fill(ADMIN);
  await page.locator('input[name="password"]').first().fill(ADMINPW);
  await page.getByRole('button', { name: /Sign in to Workspace/i }).click();
  await page.waitForTimeout(2000);
  if (!(await inApp(page))) throw new Error('admin login did not land in app');
});

// 7. admin control center -> advanced dashboard -> bulk users table + set plan
await step('admin-upgrade', async () => {
  await page.getByText('Control Center', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await snapshot(page, '04_admin');
  const seat = await page.getByText(/User Operations|elite|Set Plan/i).count();
  if (!seat) throw new Error('advanced admin dashboard not mounted');
  const row = page.locator(`tr:has-text("${PU}")`).first();
  // PU row exists only if listed; adjust credits to make it appear if needed
  rec('INFO', 'admin-upgrade', `admin UI mounted, PU row=${await row.count()}`);
  // set test user plan via bulk select
  const sel = page.locator('select:has(option:has-text("elite"))').first();
  if (await sel.count()) {
    await sel.selectOption('elite');
    await page.getByRole('button', { name: /apply|set plan|execute|update/i }).first().click().catch(() => {});
    await page.waitForTimeout(900);
    rec('INFO', 'admin-upgrade', 'bulk elite applied (if row existed)');
  }
  await snapshot(page, '05_after_upgrade');
});

// 8. data lake feedback (navigate Data Lake view)
await step('datalake-feedback', async () => {
  await page.getByRole('button', { name: /More/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  await page.getByText('Data Lake', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  const ta = page.locator('textarea').first();
  if (!(await ta.count())) throw new Error('no feedback textarea found');
  await ta.fill('UI smoke feedback: ' + PU);
  const send = page.getByRole('button', { name: /submit|send|log/i }).first();
  if (await send.count()) await send.click();
  await page.waitForTimeout(900);
  await snapshot(page, '07_feedback');
  rec('INFO', 'datalake-feedback', 'feedback textarea found and submitted');
});

await browser.close();
writeFileSync('/tmp/ht_ui_smoke/results.json', JSON.stringify({ results, consoleErrors }, null, 1));
console.log(`console_errors=${consoleErrors.length}`);
