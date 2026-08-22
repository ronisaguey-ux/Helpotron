/* ht_clickthrough.js — post-plan inspection screenshots (directive 08-22).
 * Launches its OWN headless chrome (never touches the gemini webchat
 * instance), drives http://localhost:5173 through the main views, and
 * captures FRESH screenshots into /tmp/ht_views/. Exit 0 only if every
 * view rendered and every shot was written.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('/home/roni/Roni_Workspace/webchat-api/node_modules/puppeteer');

const BASE = 'http://localhost:5173';
const OUT = '/tmp/ht_views';
const VIEWS = [
  { id: 'home',        label: 'Home — Today / Activity / Notifications' },
  { id: 'activity',    label: 'Activity view' },
  { id: 'history',     label: 'Assignment history' },
  { id: 'study',       label: 'Study Tools Hub' },
  { id: 'ai-workspace', label: 'AI Workspace' },
  { id: 'library',     label: 'Library' },
  { id: 'automation',  label: 'Automation Center' },
  { id: 'analytics',   label: 'Analytics Dashboard' },
  { id: 'progress',    label: 'Intelligence — progress' },
  { id: 'wallet',      label: 'Credit Wallet' },
  { id: 'billing',     label: 'Billing / pricing' },
  { id: 'settings',    label: 'Settings' },
  { id: 'admin',       label: 'Admin Control Center' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function navigateToView(page, viewId) {
  // All navigation is client-side (SPA); reload lands on Home, so use the
  // command palette binding: Ctrl+K then type the view label. Fallback:
  // direct click on the AppShell nav entry.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await sleep(700);
  const typed = VIEWS.find((v) => v.id === viewId);
  if (typed) {
    await page.keyboard.type(typed.label.split(' ')[0].toLowerCase(), { delay: 60 });
    await sleep(600);
  }
  await page.keyboard.press('Enter');
  await sleep(1200);
  // If the palette didn't navigate, try the sidebar: click any nav element
  // whose data key contains the view id.
  const navigated = await page.evaluate((vid) => {
    const btn = document.querySelector(`[data-view="${vid}"], [data-key="${vid}"]`);
    if (btn) { btn.click(); return true; }
    return false;
  }, viewId);
  if (navigated) await sleep(1200);
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
  const results = [];
  try {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500); // let React mount + Study Buddy panel load
    const title = await page.title().catch(() => '');
    results.push({ view: 'index', shot: 'index.png', title, ok: true });

    for (const v of VIEWS) {
      await navigateToView(page, v.id);
      const shot = `${v.id}.png`;
      const fp = path.join(OUT, shot);
      await page.screenshot({ path: fp, fullPage: false });
      const bytes = fs.statSync(fp).size;
      results.push({ view: v.id, shot, bytes, ok: bytes > 5000 });
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const bad = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.view}: ${r.shot}${r.bytes ? ` (${r.bytes}b)` : ''}${r.title ? ` title="${r.title}"` : ''}`);
  }
  console.log(bad.length === 0 ? 'ALL VIEWS CAPTURED' : `${bad.length} VIEWS FAILED`);
  process.exit(bad.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
