/* Playwright CLI smoke: launches chromium, screenshots the live app,
 * asserts the brand chrome renders. Run from web/: node scripts/pw_smoke.mjs */
import { chromium } from 'playwright';

const url = process.env.PW_URL || 'http://localhost:5173';
const out = process.env.PW_OUT || '/tmp/pw_home.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const checks = {
  logoCount: 0,
  wordmark: 'MISSING',
  consoleErrors: 0,
};
// Register before navigation so console errors from page load are captured.
page.on('console', (m) => { if (m.type() === 'error') checks.consoleErrors += 1; });
page.on('pageerror', () => { checks.consoleErrors += 1; });

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
checks.logoCount = await page.locator('header img[src="/HelpoTron_logo.jpeg"]').count();
checks.wordmark = await page.locator('header span.font-extrabold').textContent().catch(() => 'MISSING');
await page.screenshot({ path: out });

console.log(JSON.stringify({ screenshot: out, ...checks }));
await browser.close();
process.exit(checks.logoCount >= 1 ? 0 : 1);
