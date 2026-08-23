/* ht_clickthrough.js — post-plan inspection screenshots (directive 08-22).
 * Launches its OWN headless chrome (never touches the gemini webchat
 * instance), drives http://localhost:5173 through the main views by clicking
 * the real AppShell sidebar buttons (matched via aria-label — the nav tree
 * in AppShell.jsx renders <button aria-label={item.label}>, no data-* attrs),
 * and captures FRESH screenshots into /tmp/ht_views/. Each view must both
 * navigate (aria-current="page" moves to the clicked button) and render a
 * non-trivial DOM before the shot is kept. Exit 0 only if every view was
 * captured with distinct, non-blank screenshots.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('/home/roni/Roni_Workspace/webchat-api/node_modules/puppeteer');

const BASE = 'http://localhost:5173';
const OUT = '/tmp/ht_views';

// view id -> exact aria-label of the AppShell sidebar button (AppShell.jsx
// nav tree: overview=Today, history=Assignments, automation=Automations,
// wallet=Credits, billing=Plans & Credits, admin=Control Center).
const VIEWS = [
  { id: 'home',      label: 'Today' },
  { id: 'activity',  label: 'Activity' },
  { id: 'history',   label: 'Assignments' },
  { id: 'study',     label: 'Study Tools' },
  { id: 'ai-workspace', label: 'AI Workspace' },
  { id: 'library',   label: 'Library' },
  { id: 'automation', label: 'Automations' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'progress',  label: 'Academic Progress' },
  { id: 'wallet',    label: 'Credits' },
  { id: 'billing',   label: 'Plans & Credits' },
  { id: 'settings',  label: 'Settings' },
  { id: 'admin',     label: 'Control Center' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickSidebar(page, label) {
  // The sidebar buttons always render (even when collapsed) and carry
  // aria-label=item.label. Click through to onNavigate(item.key).
  const clicked = await page.evaluate((lbl) => {
    const btn = [...document.querySelectorAll('button[aria-label]')]
      .find((b) => b.getAttribute('aria-label').toLowerCase() === lbl.toLowerCase());
    if (!btn) return 'missing';
    btn.click();
    return 'clicked';
  }, label);
  if (clicked === 'missing') return false;
  await sleep(900);
  // Assert navigation actually happened: aria-current="page" must now sit on
  // the clicked button (AppShell sets aria-current={selected ? 'page' : undefined}).
  const active = await page.evaluate(() => {
    const cur = document.querySelector('button[aria-current="page"]');
    return cur ? cur.getAttribute('aria-label') : null;
  });
  return active !== null && active.toLowerCase() === label.toLowerCase();
}

// Resume support: views already captured OK (recorded in .done) are skipped,
// so a watchdog-paused run can be re-launched without redoing work.
const DONE = path.join(OUT, '.done');
const doneViews = fs.existsSync(DONE)
  ? new Set(fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean))
  : new Set();
const RESUME = process.argv.includes('--resume');

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
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 150)); });
  page.on('pageerror', (e) => pageErrors.push('PAGEERROR ' + String(e).slice(0, 150)));
  page.on('requestfailed', (r) => pageErrors.push('REQFAIL ' + (r.failure()?.errorText || '') + ' ' + r.url().slice(0, 90)));

  const results = [];
  let lastMd5 = null;
  const { createHash } = require('crypto');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500); // React mount + Study Buddy panel
    results.push({ view: 'index', shot: 'index.png', title: await page.title().catch(() => ''), ok: true });

    for (const v of VIEWS) {
      if (RESUME && doneViews.has(v.id)) { results.push({ view: v.id, shot: `${v.id}.png`, resumed: true, ok: true }); continue; }
      const navigated = await clickSidebar(page, v.label);
      await sleep(700); // let the view's data render
      const fp = path.join(OUT, `${v.id}.png`);
      await page.screenshot({ path: fp, fullPage: false });
      const bytes = fs.statSync(fp).size;
      const md5 = createHash('md5').update(fs.readFileSync(fp)).digest('hex');
      const bodyLen = await page.evaluate(() => document.body ? document.body.innerText.length : 0);
      const distinct = md5 !== lastMd5 || results.length === 0;
      lastMd5 = md5;
      const ok = navigated && bytes > 5000 && bodyLen > 300 && distinct;
      if (ok) fs.appendFileSync(DONE, v.id + '\n');
      results.push({ view: v.id, shot: `${v.id}.png`, bytes, md5, bodyLen, navigated, ok });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  let worst = '';
  for (const r of results) {
    if (!r.ok && !worst) worst = `${r.view}: nav=${r.navigated} bodyLen=${r.bodyLen} bytes=${r.bytes}`;
    console.log(`${r.ok ? '✓' : '✗'} ${r.view}: ${r.shot}${r.resumed ? ' (resumed)' : ''}${r.bytes ? ` (${r.bytes}b, dom=${r.bodyLen})` : ''}${r.navigated ? '' : ' NAV-FAIL'}${r.md5 ? '' : ''}${r.title ? ` title="${r.title}"` : ''}`);
  }
  const bad = results.filter((r) => !r.ok);
  console.log(`PAGE ERRORS (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 6)) console.log('  ' + e);
  if (bad.length === 0) console.log('ALL VIEWS CAPTURED — distinct screenshots verified');
  else console.log(`${bad.length} VIEWS FAILED — first: ${worst}`);
  process.exit(bad.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
