/* ht_flow_smoke.mjs — live functional dogfood pass on the running helpotron app.
 * Scenarios: auth gate, signup, privacy modal, dashboard, 2FA settings panel,
 * admin upgrade/top-up/downgrade, data-lake feedback. Outputs JSON + screenshots.
 * Run from web/:  node scripts/ht_flow_smoke.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = '/tmp/ht_dogfood';
mkdirSync(OUT, { recursive: true });
const results = [];
const consoleErrors = [];
const snapshot = (page, name) =>
  page.screenshot({ path: `${OUT}/${name}.png` }).catch((e) => results.push({ severity: 'LOW', where: 'screenshot', issue: `snapshot ${name}: ${e}` }));

const PU = 'demo_pw_' + Date.now().toString(36);
const PW = 'Smoke12345!';
const ADMIN = 'RoniDev';
const ADMINPW = process.env.ADMIN_PW || 'ChromiumSmoke9!';

const rec = (severity, where, issue, detail = '') => results.push({ severity, where, issue, detail });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
page.on('response', (r) => { if (r.status() >= 500) rec('HIGH', 'api', `5xx on ${r.request().method()} ${r.url().replace(BASE, '')}`, `status ${r.status()}`); });
const step = async (name, fn) => {
  try { await fn(); rec('OK', name, 'passed'); }
  catch (e) { rec('BUG', name, `caught: ${e.message.split('\n')[0]}`); }
  await page.waitForTimeout(350);
};

// ---- 1. First visit -> mandatory auth modal
await step('auth-gate', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await snapshot(page, '01_first_visit');
  const modal = page.locator('text=Create Student Account, Sign in to Helpotron').first().isVisible().catch(() => false);
  const dial = await page.locator('h2, .title, [class*=z-\\[100\\]]').allTextContents().catch(() => []);
  const anyAuth = await page.getByText('Create Student Account', { exact: false }).count();
  if (anyAuth === 0) throw new Error('auth modal not visible on first visit');
});
await page.waitForTimeout(800);
// close cookie banner if present
await page.getByText('Accept', { exact: true }).click({ timeout: 1200 }).catch(() => {});

// ---- 2. Signup (switch to signup tab, fill, consent, submit)
await step('signup', async () => {
  const signupTab = page.getByText('Sign up', { exact: false }).first();
  if (await signupTab.count()) await signupTab.click();
  await page.waitForTimeout(400);
  const byLabel = (lbl) => page.locator(`input[placeholder*="${lbl}"], input[name*="${lbl}"], label:has-text("${lbl}") + input, label:has-text("${lbl}") >> xpath=following-sibling::*//input`).first();
  const idField = page.locator('input[placeholder*="username" i], input[placeholder*="public" i], input[autocomplete="username"]').first();
  const pwField = page.locator('input[type="password"]').first();
  await idField.fill(PU);
  await pwField.fill(PW);
  const consent = page.getByText('I agree to the Academic').first();
  if (await consent.count()) await consent.click();
  const submit = page.getByRole('button', { name: /create|sign up|register/i }).first();
  await submit.click();
  await page.waitForTimeout(1500);
  const inApp = await page.getByText('Academic OS', { exact: false }).count();
  if (!inApp) throw new Error('no app shell after signup (modal may still be open)');
});

// ---- 3. Privacy modal (post-login mandatory)
await step('privacy-modal', async () => {
  await page.waitForTimeout(1000);
  const agree = page.getByText('I agree', { exact: false }).first();
  if (await agree.count()) { await agree.click(); await page.waitForTimeout(600); }
  const visible = await page.getByText('Academic OS', { exact: false }).count() > 0;
  if (!visible) throw new Error('privacy modal not dismissible / app not visible');
});

// ---- 4. Dashboard renders
await step('dashboard', async () => {
  await page.waitForTimeout(800);
  const nav = page.getByRole('button').count();
  await snapshot(page, '02_dashboard');
  if (nav === 0) throw new Error('no interactive content after login');
});

// ---- 5. 2FA settings panel (open Settings -> Privacy & Security -> 2FA panel exists + TOTP secret/QR rendered)
await step('2fa-panel', async () => {
  await page.getByText('Settings', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  const section = page.getByText('Privacy & Security', { exact: false }).first();
  if (await section.count()) await section.click().catch(() => {});
  await page.waitForTimeout(600);
  const any2fa = await page.getByText(/two[- ]factor|2FA|authenticator|TOTP/i).count();
  const secret = await page.getByText(/[A-Z2-7]{16,}/).allTextContents().catch(() => []);
  const qr = await page.locator('img[src*="otpauth"], canvas, svg:has(rect)').count();
  await snapshot(page, '03_2fa_panel');
  if (any2fa === 0) throw new Error('no 2FA section found in settings');
  rec('INFO', '2fa-panel', `2FA strings=${any2fa} secretCandidates=${secret.length} qr-ish=${qr}`);
});

// ---- 6. Admin flow — upgrade/top-up/downgrade via GUI
await step('admin-login', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByText('Accept', { exact: true }).click({ timeout: 1000 }).catch(() => {});
  const idField = page.locator('input[autocomplete="username"], input[placeholder*="username" i]').first();
  const pwField = page.locator('input[type="password"]').first();
  // switch to sign-in tab
  const inTab = page.getByText('Sign In', { exact: false }).first();
  if (await inTab.count()) await inTab.click();
  await page.waitForTimeout(400);
  await idField.fill(ADMIN);
  await pwField.fill(ADMINPW);
  const submit = page.getByRole('button', { name: /sign in|log in|login/i }).first();
  await submit.click();
  await page.waitForTimeout(1800);
  const inApp = await page.getByText('Academic OS', { exact: false }).count();
  if (!inApp) throw new Error('admin login did not land in app (2FA or bad password?)');
});
await step('admin-panel', async () => {
  await page.getByText('Control Center', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await snapshot(page, '04_admin');
  const hasPlanUI = await page.getByText(/set plan|plan|elite|credits|top[- ]?up/i).count();
  const planSelect = await page.locator('select:has(option:has-text("elite"))').count();
  rec('INFO', 'admin-panel', `planStrings=${hasPlanUI} planSelect=${planSelect}`);
  if (planSelect === 0 && hasPlanUI < 3) throw new Error('advanced admin dashboard not mounted (no plan controls)');
});
await step('admin-upgrade', async () => {
  // find row for the test user (search box or loop rows)
  const search = page.locator('input[placeholder*="search" i]').first();
  if (await search.count()) { await search.fill(PU); await page.waitForTimeout(500); }
  const row = page.locator(`tr:has-text("${PU}"), [class*=row]:has-text("${PU}")`).first();
  const rowVisible = await row.count() > 0;
  if (!rowVisible) throw new Error('test user row not found in admin list');
  const select = row.locator('select').first();
  const setPlanBtn = row.getByRole('button', { name: /set plan|apply|save|update/i }).first();
  if (await select.count()) await select.selectOption({ label: 'elite' }).catch(async () => await select.selectOption('elite'));
  if (await setPlanBtn.count()) await setPlanBtn.click();
  await page.waitForTimeout(1200);
  await snapshot(page, '05_after_upgrade');
});
await step('admin-topup-downgrade', async () => {
  // creds adjust
  const amount = page.locator('input[placeholder*="amount" i], input[name*="amount" i]').first();
  if (await amount.count()) { await amount.fill('100'); }
  const apply = page.getByRole('button', { name: /top[- ]?up|grant|add credits|apply/i }).first();
  if (await apply.count()) await apply.click();
  await page.waitForTimeout(900);
  const row = page.locator(`tr:has-text("${PU}")`).first();
  if (await row.count()) {
    const sel = row.locator('select').first();
    if (await sel.count()) await sel.selectOption({ label: 'basic' }).catch(async () => await sel.selectOption('basic'));
    const btn = row.getByRole('button', { name: /set plan|apply|save|update/i }).first();
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(900);
  }
  await snapshot(page, '06_after_downgrade');
});

// ---- 7. Data lake feedback (as test user — re-login switch not needed if session admin; feedback submits as admin, still round-trip)
await step('datalake-feedback', async () => {
  const feedback = page.getByText(/submit feedback|data lake|feedback/i).first();
  if (await feedback.count()) await feedback.click().catch(() => {});
  await page.waitForTimeout(700);
  const ta = page.locator('textarea').first();
  if (await ta.count()) {
    await ta.fill('Dogfood smoke feedback: all flows tested ' + PU);
    const send = page.getByRole('button', { name: /send|submit|log/i }).first();
    if (await send.count()) await send.click();
    await page.waitForTimeout(900);
    await snapshot(page, '07_feedback');
    rec('INFO', 'datalake-feedback', 'feedback submitted (no throw)');
  } else {
    throw new Error('no feedback textarea found');
  }
});

console.log(JSON.stringify({ PU, results, consoleErrors: consoleErrors.slice(0, 20) }, null, 1));
await browser.close();
