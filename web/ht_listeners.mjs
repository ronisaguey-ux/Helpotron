import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const PU = 'lisprobe_' + Date.now().toString(36);
const PW = 'Probe123!';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
const log = (s) => console.log('[pg]', s);
try {
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.getByText('Accept', { exact: true }).click({ timeout: 2000 }).catch(() => {});
  const su = page.getByText('Sign up', { exact: false }).first();
  if (await su.count()) { await su.click(); await page.waitForTimeout(400); }
  await page.locator('input[placeholder*="username" i], input[placeholder*="public" i], input[autocomplete="username"]').first().fill(PU);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(PW); if (await pw.count() > 1) await pw.nth(1).fill(PW);
  const consent = page.getByText('I agree to the Academic').first();
  if (await consent.count()) await consent.click();
  await page.getByRole('button', { name: /Create Free Account/i }).first().click({ timeout: 4000 });
  let t0 = Date.now();
  while (Date.now() - t0 < 15000) { await page.waitForTimeout(500); if (await page.getByRole('dialog', { name: /Authentication/ }).count() === 0) break; }
  const acceptTerms = page.getByRole('button', { name: /Accept Legal Terms/i }).first();
  if (await acceptTerms.count()) {
    await page.locator('.fixed input[type="checkbox"]').first().check({ timeout: 4000 }).catch(() => {});
    await acceptTerms.click({ timeout: 5000 }).catch(() => {});
  }
  await page.keyboard.press('Escape').catch(() => {});
  const nav = page.getByRole('button').filter({ hasText: 'My Agent' }).first();
  await nav.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const input = page.locator('input[aria-label="Agent prompt input"]').first();
  if (await input.count()) {
    await input.fill('Say hi');
    await page.getByRole('button', { name: /Send message to agent/i }).first().click({ timeout: 3000 });
    await page.waitForTimeout(2500);
  }
  const bubble = page.locator('div[class*="max-w-[85%]"]').filter({ hasText: /Say hi|Overlord/i }).first();
  await bubble.scrollIntoViewIfNeeded();
  const obj = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const els=[]; let n=document.querySelectorAll('div[class*="max-w-[85%]"]')[0]; for(let i=0;i<5&&n;i++){els.push(n);n=n.parentElement;} return els; })()`,
    returnByValue: false,
  });
  const refs = obj.result.value || [];
  const out = [];
  for (const r of refs) {
    const oid = r.objectId || r.value?.objectId;
    if (!oid) { out.push({ skip: true }); continue; }
    const cls = await cdp.send('Runtime.callFunctionOn', { objectId: oid, functionDeclaration: 'function(){ return String(this.className).slice(0,60); }', returnByValue: true }).then((o) => o.result.value).catch(() => '?');
    const ev = await cdp.send('DOMDebugger.getEventListeners', { objectId: oid, depth: 1, pierce: false }).catch(() => ({ listeners: [] }));
    out.push({
      cls,
      listeners: (ev.listeners || []).map((l) => ({ type: l.type, useCapture: l.useCapture, passive: l.passive, handler: String(l.handler?.description || l.handler?.toString?.() || l.handler || '').slice(0, 90) })),
    });
  }
  log('listeners: ' + JSON.stringify(out));
} catch (e) {
  log('ERR ' + e.message);
} finally {
  await browser.close();
}
