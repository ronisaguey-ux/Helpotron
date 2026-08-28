import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.request.post('http://localhost:5173/api/login', { data: { public_id: 'RoniDev', password: 'ChromiumSmoke9!' } });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.getByText('Accept', { exact: true }).click({ timeout: 1200 }).catch(() => {});
// mandatory legal modal: tick + accept
const agreeLabel = page.getByText('solemnly agree', { exact: false });
if (await agreeLabel.count()) { await agreeLabel.click(); await page.waitForTimeout(300); }
const acceptBtn = page.getByRole('button', { name: /Accept Legal Terms/i });
if (await acceptBtn.count()) await acceptBtn.click();
await page.waitForTimeout(1000);
const navExt = await page.getByText('Extension', { exact: true }).count();
if (navExt) await page.getByText('Extension', { exact: true }).first().click();
await page.waitForTimeout(1200);
console.log(JSON.stringify({
  navExt,
  heading: await page.getByText('Helpotron Extension', { exact: false }).count(),
  dlBtn: await page.getByRole('button', { name: /Download Extension/i }).count(),
  chromeCard: await page.getByText('Chrome / Edge / Brave', { exact: false }).count(),
  firefoxCard: await page.getByText('Firefox', { exact: true }).count(),
  safariCard: await page.getByText('Safari', { exact: true }).count(),
  oldPopup: await page.getByText('Extension Setup & Update Guide', { exact: false }).count(),
}));
await browser.close();
