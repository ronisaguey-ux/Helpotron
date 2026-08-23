/* ht_capture_all.js — full-site screenshot sweep (user request 08-22).
 * Captures EVERY section of the helpotron app: all 19 sidebar views at
 * desktop (top + scrolled-bottom for long pages) AND mobile width, the
 * landing view, overlay states (notifications dropdown, command palette
 * open + queried, quick-settings avatar menu), and the palette-routed
 * pages (Privacy, Terms, Inbox, Message Admin, Notifications) — roughly
 * 60 shots total. Each shot is saved immediately with a resume manifest
 * (/tmp/ht_cap/.done) so watchdog pauses only lose the in-flight shot.
 * Exit 0 when every shot exists with real content.
 *
 * Usage: node ht_capture_all.js [--resume]
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const puppeteer = require('/home/roni/Roni_Workspace/webchat-api/node_modules/puppeteer');

const BASE = 'http://localhost:5173';
const OUT = '/tmp/ht_cap';
const DONE = path.join(OUT, '.done');
const RESUME = process.argv.includes('--resume');

// id -> exact aria-label of the AppShell sidebar button (AppShell.jsx nav tree).
const NAV = [
  ['overview', 'Today'],
  ['activity', 'Activity'],
  ['history', 'Assignments'],
  ['study', 'Study Tools'],
  ['ai-workspace', 'AI Workspace'],
  ['library', 'Library'],
  ['automation', 'Automations'],
  ['analytics', 'Analytics'],
  ['progress', 'Academic Progress'],
  ['recommendations', 'Recommendations'],
  ['cost', 'Cost Intelligence'],
  ['wallet', 'Credits'],
  ['referral', 'Referrals'],
  ['settings', 'Settings'],
  ['admin', 'Control Center'],
  ['billing', 'Plans & Credits'],
  ['datalake', 'Data Lake'],
  ['leaderboard', 'Credits Leaderboard'],
  ['dump', 'Assignment Dump'],
];
// palette-routed pages: [id, query to type into the command palette]
const PALETTE_ROUTES = [
  ['privacy', 'Privacy'],
  ['terms', 'Terms'],
  ['inbox', 'Inbox'],
  ['message_admin', 'Message Admin'],
  ['notifications', 'Notifications'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const doneKeys = fs.existsSync(DONE)
  ? new Set(fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean))
  : new Set();

const results = [];

// Save one shot immediately (resume-safe) and record it in the manifest.
async function shot(page, key) {
  if (RESUME && doneKeys.has(key)) {
    results.push({ key, ok: true, resumed: true });
    return true;
  }
  const fp = path.join(OUT, `${key}.png`);
  await page.screenshot({ path: fp, fullPage: false });
  const bytes = fs.statSync(fp).size;
  const bodyLen = await page.evaluate(() => (document.body ? document.body.innerText.length : 0));
  const ok = bytes > 5000 && bodyLen > 200;
  if (ok) { fs.appendFileSync(DONE, key + '\n'); doneKeys.add(key); }
  results.push({ key, bytes, bodyLen, ok });
  return ok;
}

async function clickSidebar(page, label) {
  const clicked = await page.evaluate((lbl) => {
    const btn = [...document.querySelectorAll('button[aria-label]')]
      .find((b) => b.getAttribute('aria-label').toLowerCase() === lbl.toLowerCase());
    if (!btn) return 'missing';
    btn.click();
    return 'clicked';
  }, label);
  if (clicked === 'missing') return false;
  await sleep(900);
  return true;
}

// Open the command palette, type a query, click the first matching result.
async function paletteNav(page, query) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-label]')]
      .find((x) => x.getAttribute('aria-label') === 'Global search');
    if (b) b.click();
  });
  await sleep(700);
  const typed = await page.evaluate((q) => {
    const inp = document.querySelector('input[aria-label="Command palette search"]');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, q);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, query);
  if (!typed) return false;
  await sleep(700);
  // Click the first result button whose text includes the query.
  const clicked = await page.evaluate((q) => {
    const btns = [...document.querySelectorAll('button')]
      .filter((b) => (b.innerText || '').toLowerCase().includes(q.toLowerCase()));
    if (!btns.length) return false;
    btns[0].click();
    return true;
  }, query);
  await sleep(1000);
  return clicked;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--window-size=1440,950', '--force-device-scale-factor=1'],
    defaultViewport: { width: 1440, height: 950 },
  });
  const page = await browser.newPage();

  try {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);
    await shot(page, '00_landing_desktop');

    // ── All nav views: desktop top, desktop bottom (if scrollable), mobile ──
    for (const [id, label] of NAV) {
      if (!(await clickSidebar(page, label))) { results.push({ key: `${id}_desktop_top`, ok: false, note: 'nav-missing' }); continue; }
      await sleep(700);
      await shot(page, `${id}_desktop_top`);

      const scrollable = await page.evaluate(() =>
        document.documentElement.scrollHeight > window.innerHeight + 150);
      if (scrollable) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await sleep(600);
        await shot(page, `${id}_desktop_bottom`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(300);
      }

      await page.setViewport({ width: 420, height: 900 });
      await sleep(800);
      await shot(page, `${id}_mobile_top`);
      await page.setViewport({ width: 1440, height: 950 });
      await sleep(300);
    }

    // ── Overlays (on overview) ──
    await clickSidebar(page, 'Today');
    await sleep(700);
    // Notifications dropdown
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[aria-label]')]
        .find((x) => (x.getAttribute('aria-label') || '').startsWith('Notifications ('));
      if (b) b.click();
    });
    await sleep(500);
    await shot(page, '20_notifications_dropdown');
    await page.keyboard.press('Escape');
    await sleep(300);
    // Command palette open
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[aria-label]')]
        .find((x) => x.getAttribute('aria-label') === 'Global search');
      if (b) b.click();
    });
    await sleep(600);
    await shot(page, '21_palette_open');
    // Palette with a query typed
    await page.type('input[aria-label="Command palette search"]', 'cred');
    await sleep(600);
    await shot(page, '22_palette_query');
    await page.keyboard.press('Escape');
    await sleep(400);
    // Quick settings avatar menu
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[aria-label]')]
        .find((x) => x.getAttribute('aria-label') === 'Quick settings');
      if (b) b.click();
    });
    await sleep(500);
    await shot(page, '23_quick_settings');
    await page.keyboard.press('Escape');
    await sleep(300);

    // ── Palette-routed pages ──
    for (const [id, query] of PALETTE_ROUTES) {
      const ok = await paletteNav(page, query);
      if (!ok) { results.push({ key: `${id}`, ok: false, note: 'palette-fail' }); continue; }
      await shot(page, `${id}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const bad = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.key}${r.resumed ? ' (resumed)' : ''}${r.bytes ? ` (${r.bytes}b, dom=${r.bodyLen})` : ''}${r.note ? ` [${r.note}]` : ''}`);
  }
  console.log(`TOTAL: ${results.length} shots, ${results.length - bad.length} ok, ${bad.length} bad`);
  process.exit(bad.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
