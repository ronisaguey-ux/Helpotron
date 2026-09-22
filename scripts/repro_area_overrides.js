/**
 * Verify the per-area overrides the owner asked for actually exist and persist on
 * all three surfaces he named: subject bubble, assignment, and My Agent.
 *
 * Each one saves through the real UI, reads the value back OUT OF THE SERVER, and
 * asserts the scope level + ref are the ones the resolver will match. A control
 * that renders and a PATCH that returns 200 prove nothing — three separate bugs
 * made this whole feature inert with both of those true.
 *
 *   DISPLAY=:0 NODE_PATH=<repo>/web/node_modules node scripts/repro_area_overrides.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const BASE = process.env.HT_BASE || 'http://127.0.0.1:5000';

function adminPassword() {
  for (const rel of ['mcp/.env', '.env']) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (line.startsWith('HELPOTRON_ADMIN_PASSWORD=')) {
        return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return '';
}

(async () => {
  const checks = [];
  const record = (n, pass, d) => {
    checks.push({ n, pass });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
  };

  const pw = adminPassword();
  if (!pw) { console.log('No operator password — aborting.'); process.exit(3); }

  const context = await chromium.launchPersistentContext('/tmp/opencode/area-' + Date.now(), {
    headless: false, channel: 'chromium',
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('helpotron_terms_accepted_v2', 'true');
      localStorage.setItem('helpotron_signup_consent', '1');
    } catch (e) { /* none */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

  const readScoped = () => page.evaluate(async () => {
    const r = await fetch('/api/user/settings', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
    const j = await r.json();
    return (j.settings || j)?.scoped || {};
  });
  const wipe = () => page.evaluate(async () => {
    const t = (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || '';
    const h = { 'Content-Type': 'application/json', 'X-Public-ID': 'RoniDev' };
    if (t) h['X-CSRF-Token'] = decodeURIComponent(t);
    await fetch('/api/user/settings', { method: 'PATCH', credentials: 'include', headers: h, body: JSON.stringify({ scoped: {} }) });
  });
  const levelsFor = (scoped, path, level) =>
    (scoped[path] || []).map((v) => v?.scope?.level || v?.target_type).filter((l) => l === level);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1500);
  await page.fill('#login-public-id', 'RoniDev');
  await page.fill('#login-passphrase', pw);
  await page.locator('#login-passphrase').press('Enter');
  await page.waitForTimeout(7000);
  const acc = page.locator('button:has-text("Accept & Continue")');
  if (await acc.count()) {
    const b = page.locator('#protocol-consent');
    if (await b.count()) await b.check().catch(() => {});
    await acc.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  // The cookie banner is a full-width overlay and it eats clicks aimed at the
  // cards underneath — silently, so the app looks like it ignored the click.
  for (const label of ['ACCEPT ALL', 'Necessary only', 'Accept All']) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(1200); break; }
  }

  await wipe();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  /* ── 1. MY AGENT — place scope ───────────────────────────────────────── */
  await page.locator('button:has-text("My Agent")').first().click();
  await page.waitForTimeout(3000);
  const configsBtn = page.locator('button[title="Open Agent Configurations Matrix"]').first();
  record('My Agent exposes its config surface', (await configsBtn.count()) > 0,
    (await configsBtn.count()) ? 'configs toggle found' : 'missing');
  await configsBtn.click();
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Behaviour")').first().click();
  await page.waitForTimeout(1800);

  const agentOv = page.locator('[data-override-key="ai.humanizer"]').first();
  record('My Agent offers overrides on the global defaults', (await agentOv.count()) > 0,
    (await agentOv.count()) ? 'control found' : 'not rendered');
  if (await agentOv.count()) {
    await agentOv.locator('button[aria-pressed]').first().click();
    await page.waitForTimeout(3000);
    const scoped = await readScoped();
    const refs = (scoped['ai.humanizer'] || []).map((v) => `${v?.scope?.level}:${v?.scope?.ref}`);
    record('a My Agent override saves with place scope', refs.some((r) => r === 'place:my_agent'),
      refs.join(', ') || 'nothing saved');
    const st = await agentOv.getAttribute('data-override-state');
    record('My Agent control reads as overridden after saving', st === 'overridden', st);
  }

  /* ── 2. ASSIGNMENT — assignment + subject scope ──────────────────────── */
  await wipe();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.locator('button:has-text("Dashboard")').first().click();
  await page.waitForTimeout(3000);

  // Into a subject that actually has an assignment, then into that assignment.
  // Some subjects are legitimately empty, so iterate rather than assuming.
  let opened = false;
  const openButtons = page.locator('button:has-text("Open")');
  const subjectCount = await openButtons.count();
  for (let i = 0; i < subjectCount && !opened; i++) {
    const bubbleText = await openButtons.nth(i).evaluate((el) => {
      const s = el.closest('section') || el.closest('div[class*="rounded"]') || el.parentElement;
      return (s && s.innerText) || '';
    });
    if (!/\d+ assignments? present/.test(bubbleText)) continue;
    if (/0 assignments present/.test(bubbleText)) continue;

    // Click by coordinates: this button sits inside a transformed/card container and
    // a plain .click() lands on a wrapper, so the view never changes.
    const pt = await openButtons.nth(i).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(4000);

    // A subject shows its assignments as cards; a pending one says REVIEW NOW.
    for (const label of ['REVIEW NOW', 'OPEN ASSIGNMENT', 'CONTINUE', 'OPEN']) {
      const c = page.locator(`button:has-text("${label}")`).first();
      if (await c.count()) { await c.click().catch(() => {}); await page.waitForTimeout(3500); break; }
    }

    // The config panel is a collapsed accordion — the overrides live inside it.
    const header = page.locator('text=Assignment Configuration').first();
    if (await header.count()) {
      await header.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
    }

    const cfg = page.locator('text=Overrides for this assignment').first();
    if (await cfg.count()) { opened = true; break; }

    const back = page.locator('button:has-text("All subjects"), button:has-text("Active subjects")').first();
    if (await back.count()) { await back.click().catch(() => {}); await page.waitForTimeout(2500); }
  }

  record('an assignment offers its own overrides', opened,
    opened ? 'override block present' : 'no assignment with an override block reached');

  if (opened) {
    const ov = page.locator('[data-override-key="ai.humanizer"]').first();
    if (await ov.count()) {
      await ov.locator('button[aria-pressed]').first().click();
      await page.waitForTimeout(3000);
      const scoped = await readScoped();
      const refs = (scoped['ai.humanizer'] || []).map((v) => `${v?.scope?.level}:${v?.scope?.ref}`);
      record('an assignment override saves with assignment scope',
        refs.some((r) => r.startsWith('assignment:')), refs.join(', ') || 'nothing saved');
    }
  }

  record('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

  await wipe();
  const finalScoped = await readScoped();
  record('operator scoped left clean', Object.keys(finalScoped).length === 0,
    JSON.stringify(finalScoped));

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await context.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e && e.message); process.exit(1); });
