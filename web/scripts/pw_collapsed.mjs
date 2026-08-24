import { chromium } from 'playwright';
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1280, height: 860 } });
await pg.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(1200);
await pg.click('aside button[aria-label*="Navigation"]');
await pg.waitForTimeout(1100);
const geo = await pg.evaluate(() => {
  const asides = [...document.querySelectorAll('aside')];
  const nav = asides[asides.length - 1];
  const card = nav?.querySelector('.clean-card');
  const img = nav?.querySelector('img');
  const btn = img?.closest('button');
  const r = (el) => el ? { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, x: el.getBoundingClientRect().x } : null;
  return { asideW: r(nav), cardW: r(card), btnW: r(btn), imgW: r(img),
           imgClass: img?.getAttribute('class'),
           asideClass: nav?.getAttribute('class'),
           cardPad: card ? getComputedStyle(card).padding : null };
});
console.log(JSON.stringify(geo, null, 1));
await b.close();
