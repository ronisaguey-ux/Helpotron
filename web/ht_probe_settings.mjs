// Probe: faithful reproduction of smoke steps 4->5 -> why does the app land on the AUTH GATE instead of Settings?
import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const PU = 'probe_' + Date.now().toString(36);
const PW = 'Probe123!';
const browser = await chromium.launch();
const page = await browser.newPage();
const log = (s) => console.log(`[pg] ${s}`);
try {
  // signup
  await page.goto(BASE);
  await page.getByText('Create Account', { exact: true }).first().click().catch(() => {});
  const inputs = await page.locator('input').all();
  log('inputs: ' + inputs.length);
  for (const inp of inputs.slice(0, 4)) log('  inp placeholder=' + await inp.getAttribute('placeholder'));
  const user = page.locator('input').first();
  await user.fill(PU);
  await page.locator('#password, input[type=password]').first().fill(PW);
  await page.getByText('Create Free Account', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  log('url after signup: ' + page.url());
  const gateOn = await page.getByText('Create Student Account', { exact: false }).count();
  log('gate visible after signup: ' + gateOn);
  // dashboard loaded?
  const dash = await page.getByText(/command center|assignments/i).count();
  log('dashboard text count: ' + dash);
  // click "Settings" like the smoke
  const before = await page.locator('[data-nav], nav a, header a, button').filter({ hasText: 'Settings' }).count();
  log('clickable Settings candidates: ' + before);
  await page.getByText('Settings', { exact: false }).first().click().catch((e) => log('settings click err: ' + e.message));
  await page.waitForTimeout(1200);
  log('url after settings click: ' + page.url());
  log('gate visible after settings: ' + await page.getByText('Create Student Account', { exact: false }).count());
  log('settings section header visible: ' + await page.getByText(/Appearance|Navigating|Workspace/i).count());
  // privacy
  await page.getByText('Privacy & Security', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  log('2fa texts: ' + await page.getByText(/two[- ]factor|2FA|authenticator|TOTP/i).count());
  log('url at privacy: ' + page.url());
  await page.screenshot({ path: '/tmp/probe_settings.png' });
} catch (e) {
  log('PROBE ERROR: ' + e.message);
} finally {
  await browser.close();
}
