/* Screenshot swarm — captures every view/state of the helpotron app into
 * /tmp/helpotron_shots/ and prints a manifest. Run from web/:
 *   node scripts/pw_shots.mjs
 * Uses live data (mock ON/OFF), desktop + mobile, plus the extension popup. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const OUT = '/tmp/helpotron_shots';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const shots = [];
let seq = 0;

const snap = (page, name) => {
  seq += 1;
  const file = `${OUT}/${String(seq).padStart(2, '0')}_${name}.png`;
  return page.screenshot({ path: file }).then(() => shots.push(file));
};
const snapScroll = async (page, name) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(450);
  await snap(page, `${name}_scrolled`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const nav = async (label) => {
  const el = page.locator('button', { hasText: label }).first();
  await el.click().catch(() => {});
  await page.waitForTimeout(600);
};
const dismissCookies = async () => {
  await page.getByText('Accept', { exact: true }).click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(200);
};

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await dismissCookies();

/* ── Mock OFF: every view, full + scrolled ──────────────────────────────── */
const VIEWS = [
  ['Dashboard', 'overview'],
  ['Activity', 'activity'],
  ['My Agent', 'agent'],
  ['Assignments', 'history'],
  ['Study Tools', 'study'],
  ['Library', 'library'],
  ['Insights', 'insights'],
  ['Credits', 'credits'],
  ['Settings', 'settings'],
  ['Control Center', 'admin'],
];
for (const [label, key] of VIEWS) {
  await nav(label);
  await snap(page, key);
  await snapScroll(page, key);
}

/* ── Agent chat: send a real message ────────────────────────────────────── */
await nav('My Agent');
try {
  const input = page.locator('main textarea, main input[placeholder]').first();
  await input.fill('Summarize your readiness for my exams week in 2 lines.').catch(() => {});
  await input.press('Enter').catch(() => {});
  await page.waitForTimeout(5000);
} catch {}
await snap(page, 'agent_chat_sent');

/* ── Settings: search + open a section ──────────────────────────────────── */
await nav('Settings');
try {
  const search = page.locator('main input[placeholder*="search" i], main input[type="search"]').first();
  await search.fill('notifications').catch(() => {});
  await page.waitForTimeout(700);
  await snap(page, 'settings_search');
  await search.fill('').catch(() => {});
} catch {}
await page.evaluate(() => window.scrollBy(0, 450));
await page.waitForTimeout(400);
await snap(page, 'settings_mid');

/* ── Admin agent chat ───────────────────────────────────────────────────── */
await nav('Control Center');
try {
  const input = page.locator('main textarea, main input[placeholder]').first();
  if (await input.count()) {
    await input.fill('Health check please.').catch(() => {});
    await input.press('Enter').catch(() => {});
    await page.waitForTimeout(4000);
  }
} catch {}
await snap(page, 'admin_agent_chat');

/* ── Overlays: command palette, notifications, avatar menu ──────────────── */
await page.keyboard.press('Control+K').catch(() => {});
await page.waitForTimeout(600);
await snap(page, 'command_palette');
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(300);

await page.locator('header button svg.lucide-bell, header button[aria-label*="notification" i]').first().click().catch(() => {});
await page.waitForTimeout(600);
await snap(page, 'notifications_open');
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(300);

await page.locator('header').getByText('R', { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(600);
await snap(page, 'avatar_menu');
await page.keyboard.press('Escape').catch(() => {});

/* ── Mock ON: data-heavy views reshoot ──────────────────────────────────── */
await page.locator('button', { hasText: 'MOCK' }).first().click().catch(() => {});
await page.waitForTimeout(800);
for (const key of ['overview', 'activity', 'agent', 'history', 'library', 'insights', 'credits', 'admin']) {
  await nav(VIEWS.find((v) => v[1] === key)?.[0] ?? key.replace(/-/g, ' '));
  await snap(page, `${key}_mock`);
}
await page.locator('button', { hasText: 'MOCK' }).first().click().catch(() => {});
await page.waitForTimeout(500);

/* ── Mobile pass (390x844) ──────────────────────────────────────────────── */
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await mobile.getByText('Accept', { exact: true }).click({ timeout: 1500 }).catch(() => {});
await mobile.waitForTimeout(400);
for (const [label, key] of [['Dashboard', 'overview'], ['My Agent', 'agent'], ['Insights', 'insights'], ['Credits', 'credits'], ['Settings', 'settings']]) {
  await mobile.locator('button', { hasText: label }).first().click().catch(() => {});
  await mobile.waitForTimeout(600);
  await snap(mobile, `mobile_${key}`);
}

/* ── Extension popup ────────────────────────────────────────────────────── */
const ext = await browser.newPage({ viewport: { width: 400, height: 600 } });
await ext.goto('file:///home/roni/Roni_Workspace/helpotron/extension/popup.html', { waitUntil: 'load' }).catch(() => {});
await ext.waitForTimeout(600);
await snap(ext, 'extension_popup');

await browser.close();
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ count: shots.length, files: shots }, null, 2));
console.log(JSON.stringify({ count: shots.length }));
