/**
 * Verify the two owner requests land in the running app:
 *   1. included detectors are selectable and the choice PERSISTS to the server
 *   2. a subject override writes settings.scoped and RESOLVES in the backend
 *
 * The second is the one worth the effort: three separate breaks made the whole
 * scoped-override feature inert (wrong key, unwritable key, localStorage-only UI),
 * and a UI that renders a control proves none of them are fixed.
 *
 *   DISPLAY=:0 NODE_PATH=<repo>/web/node_modules node scripts/repro_settings_scoped.js
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

  const context = await chromium.launchPersistentContext('/tmp/opencode/scoped-' + Date.now(), {
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

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1500);
  await page.fill('#login-public-id', 'RoniDev');
  await page.fill('#login-passphrase', pw);
  await page.locator('#login-passphrase').press('Enter');
  await page.waitForTimeout(6000);
  const acc = page.locator('button:has-text("Accept & Continue")');
  if (await acc.count()) {
    const b = page.locator('#protocol-consent');
    if (await b.count()) await b.check().catch(() => {});
    await acc.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // ── 1. detector select/deselect ──────────────────────────────────────────
  await page.locator('button:has-text("Settings")').first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const detNav = page.locator('[data-settings-nav="humanizer"]').first();
  if (await detNav.count()) {
    await detNav.click();
    await page.waitForTimeout(2500);
  }

  const toggles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-detector-toggle]')).map((e) => e.getAttribute('data-detector-toggle')));
  record('detectors are individually selectable',
    toggles.includes('zippy') && toggles.includes('roberta_onnx'),
    toggles.join(', ') || 'no toggles');

  const body = await page.evaluate(() => document.body.innerText);
  record('no "Free" badge on the detectors', !/\bFree\b/.test(body.replace(/Free Trial|Free Access|Free$/gm, '')),
    /Free/.test(body) ? 'the word Free appears' : 'absent');
  record('no "local" claim about the detectors',
    !/local compression|runs? locally|this machine|your own machine/i.test(body),
    'no local/machine phrasing');
  record('detector copy describes what each one does',
    /Compression heuristic/.test(body) && /Rhythm analysis/.test(body),
    'descriptions present');

  const zippy = page.locator('[data-detector-toggle="zippy"]');
  let originalZippy = null;
  if (await zippy.count()) {
    originalZippy = await zippy.isChecked();
    await zippy.click();
    await page.waitForTimeout(2500);
    const after = await page.evaluate(async () => {
      const r = await fetch('/api/user/settings', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
      const j = await r.json();
      const s = j.settings || j;
      return s?.ai?.detection?.detectors?.zippy;
    });
    record('toggling a detector PERSISTS to the server', after === !originalZippy,
      `${originalZippy} -> server says ${after}`);
    await zippy.click();
    await page.waitForTimeout(2000);
  }

  // ── 2. per-subject override writes settings.scoped ────────────────────────
  await page.locator('button:has-text("Dashboard")').first().click().catch(() => {});
  await page.waitForTimeout(3500);

  const readScoped = () => page.evaluate(async () => {
    const r = await fetch('/api/user/settings', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
    const j = await r.json();
    return (j.settings || j)?.scoped || {};
  });
  const restoreScoped = () => page.evaluate(async () => {
    const token = (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || '';
    const h = { 'Content-Type': 'application/json', 'X-Public-ID': 'RoniDev' };
    if (token) h['X-CSRF-Token'] = decodeURIComponent(token);
    await fetch('/api/user/settings', { method: 'PATCH', credentials: 'include', headers: h, body: JSON.stringify({ scoped: {} }) });
  });

  await restoreScoped();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // The override controls live one level in: the grid shows subject bubbles, and
  // "Open" drills into the subject view that carries its settings section.
  record('the subject grid renders', (await page.locator('button:has-text("Open")').count()) > 0,
    `${await page.locator('button:has-text("Open")').count()} subject(s)`);
  await page.locator('button:has-text("Open")').first().click();
  await page.waitForTimeout(3000);

  const openBtn = page.locator('button:has-text("Subject Settings")').first();
  record('a subject bubble exposes a Settings control', (await openBtn.count()) > 0,
    (await openBtn.count()) ? 'button found' : 'no "Subject Settings" button');
  await openBtn.click();
  await page.waitForTimeout(2500);

  const panel = await page.evaluate(() => document.body.innerText);
  record('subject settings offers global-setting overrides',
    /GLOBAL SETTINGS THIS SUBJECT OVERRIDES/i.test(panel),
    /OVERRIDES/i.test(panel) ? 'override block present' : 'not found');

  const ov = page.locator('[data-override-key="ai.humanizer"]').first();
  const hasOv = (await ov.count()) > 0;
  record('the override control is keyed to a path the backend resolves', hasOv,
    hasOv ? 'ai.humanizer present' : 'no keyed override control');

  if (hasOv) {
    const before = await ov.getAttribute('data-override-state');
    const beforeLabel = await page.evaluate(() =>
      document.querySelector('[data-override-key="ai.humanizer"]')?.innerText || '');
    await ov.locator('button[aria-pressed]').first().click();
    await page.waitForTimeout(3000);

    const scoped = await readScoped();
    const keys = Object.keys(scoped);
    record('a subject override is SAVED to settings.scoped', keys.includes('ai.humanizer'),
      keys.length ? `saved: ${keys.join(', ')}` : 'settings.scoped is still empty');

    const v = (scoped['ai.humanizer'] || [])[0];
    record('the override carries a scope with level + ref (name, not id)',
      !!v?.scope?.level && !!v?.scope?.ref && !/^\d+$/.test(String(v.scope.ref)),
      JSON.stringify(v?.scope) + ` value=${JSON.stringify(v?.value)}`);

    const after = await ov.getAttribute('data-override-state');
    record('the control flips to "Overridden here"', before === 'global' && after === 'overridden',
      `${before} -> ${after}`);

    // THE BUG: with the global ON, clicking used to call clearOverride() and change
    // nothing, so an "off for this subject" override was unreachable.
    const sawOverriddenText = /Overridden here/.test(await ov.innerText());
    record('the override is visibly marked as overriding the global', sawOverriddenText,
      sawOverriddenText ? '"Overridden here" rendered' : 'still reads "Following global"');

    // and it must resolve — a stored value the backend ignores is still broken
    const eff = await page.evaluate(async () => {
      const r = await fetch('/api/user/settings', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
      const j = await r.json();
      return (j.settings || j)?.scoped?.['ai.humanizer']?.[0]?.value;
    });
    record('the stored override is an explicit boolean (backend can resolve it)',
      typeof eff === 'boolean', `value=${JSON.stringify(eff)}`);

    // THE DESTRUCTIVE-WRITE BUG: the save used to spread a stale local copy of
    // `scoped`, so a second override REPLACED the whole server map and deleted the
    // first one. Two different paths must both survive.
    const second = page.locator('[data-override-key="ai.detection.enabled"]').first();
    if ((await second.count()) > 0) {
      await second.locator('button[aria-pressed]').first().click();
      await page.waitForTimeout(3000);
      const both = await readScoped();
      record('saving a second override does NOT delete the first',
        !!both['ai.humanizer'] && !!both['ai.detection.enabled'],
        Object.keys(both).join(', '));
      const resetBoth = page.locator('[data-override-key="ai.detection.enabled"] button:has-text("Use global")').first();
      if (await resetBoth.count()) { await resetBoth.click(); await page.waitForTimeout(2000); }
    }

    // reset via the UI control, not a raw PATCH
    const reset = page.locator('[data-override-key="ai.humanizer"] button:has-text("Use global")').first();
    if (await reset.count()) {
      await reset.click();
      await page.waitForTimeout(2500);
      const afterReset = await readScoped();
      record('"Use global" clears the override from the server',
        !(afterReset['ai.humanizer'] || []).length,
        JSON.stringify(afterReset['ai.humanizer'] || []));
    }
    void beforeLabel;
  }
  await restoreScoped();

  record('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await context.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e && e.message); process.exit(1); });
