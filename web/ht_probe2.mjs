// Faithful smoke steps 1-5 with state dumps at the 2FA step.
import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const PU = 'probe2_' + Date.now().toString(36);
const PW = 'Probe123!';
const browser = await chromium.launch();
const page = await browser.newPage();
const log = (s) => console.log(`[pg] ${s}`);
try {
  await page.goto(BASE);
  await page.waitForTimeout(800);
  await page.getByText('Accept', { exact: true }).click({ timeout: 1200 }).catch(() => {});
  const signupTab = page.getByText('Sign up', { exact: false }).first();
  if (await signupTab.count()) await signupTab.click();
  await page.waitForTimeout(400);
  const idField = page.locator('input[placeholder*="username" i], input[placeholder*="public" i], input[autocomplete="username"]').first();
  const pwField = page.locator('input[type="password"]').first();
  await idField.fill(PU); await pwField.fill(PW);
  const consent = page.getByText('I agree to the Academic').first();
  if (await consent.count()) await consent.click();
  await page.getByRole('button', { name: /create|sign up|register/i }).first().click();
  await page.waitForTimeout(1500);
  log('after signup inApp=' + await page.getByText('Academic OS', { exact: false }).count() + ' url=' + page.url());
  await page.waitForTimeout(1000);
  const agree = page.getByText('I agree', { exact: false }).first();
  if (await agree.count()) { await agree.click(); await page.waitForTimeout(600); }
  await page.waitForTimeout(800);
  log('dashboard buttons=' + await page.getByRole('button').count());
  // settings click (smoke step 5)
  await page.getByText('Settings', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  log('AFTER settings click: url=' + page.url() + ' gate=' +
      await page.getByText('Create Student Account', { exact: false }).count() +
      ' academic_os=' + await page.getByText('Academic OS', { exact: false }).count());
  const ls = await page.evaluate(() => JSON.stringify({ pub: localStorage.getItem('public_id'), ht: localStorage.getItem('helpotron_public_id') }));
  log('localStorage: ' + ls);
  const cookies = await page.context().cookies();
  log('cookies: ' + cookies.map(c => c.name + '=' + (c.value || '').slice(0, 10)).join(' '));
  const settingsBtn = await page.getByText('Settings', { exact: false }).count();
  log('settings count now: ' + settingsBtn);
  await page.screenshot({ path: '/tmp/probe2_gate.png' });
} catch (e) {
  log('PROBE2 ERROR: ' + e.message);
} finally {
  await browser.close();
}
