import { chromium } from 'playwright';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1200);
await pg.click('header button:has(.w-9.h-9)').catch(async () => {
  // fallback: last button in the header
  await pg.click('header > div > button:last-child').catch(() => {});
});
await pg.waitForTimeout(900);
await pg.screenshot({ path: '/tmp/helpotron_shots/82_shell_avatar_menu.png' });
await b.close();
console.log('menu done');
