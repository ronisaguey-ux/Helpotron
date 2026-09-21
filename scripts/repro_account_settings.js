/**
 * Verify the Account consolidation and the profile editor.
 *
 * Owner (2026-09-21):
 *   "have privacy and security, api keys credits and billing, all be under
 *    account, and also give the ability to upload a pfp, edit username/public id
 *    all be under account"
 *
 * Two things are checked, and the second is the one that matters: the NAV shape
 * (the three sections live under Account), and that the profile editor works
 * end-to-end — a picture really uploads and really persists, a display name
 * really saves, and the public ID change is really password-gated.
 *
 *   DISPLAY=:0 NODE_PATH=<repo>/web/node_modules node scripts/repro_account_settings.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO = path.resolve(__dirname, '..');
const BASE = process.env.HT_BASE || 'http://127.0.0.1:5000';
const PROBE_NAME = `E2E Probe ${Date.now()}`;

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

/** A real, valid 8x8 PNG built by hand — no binary fixture to keep in the repo. */
function tinyPng() {
  const W = 8, H = 8;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y += 1) {
    const row = y * (W * 3 + 1);
    raw[row] = 0; // filter type
    for (let x = 0; x < W; x += 1) {
      raw[row + 1 + x * 3] = 89;
      raw[row + 2 + x * 3] = 216;
      raw[row + 3 + x * 3] = 201;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const crc32 = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (~c) >>> 0;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

(async () => {
  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  const pw = adminPassword();
  if (!pw) { console.log('No operator password found — cannot run.'); process.exit(3); }

  const context = await chromium.launchPersistentContext('/tmp/opencode/acct-' + Date.now(), {
    headless: false,
    channel: 'chromium',
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('helpotron_terms_accepted_v2', 'true');
      localStorage.setItem('helpotron_signup_consent', '1');
    } catch (e) { /* storage unavailable */ }
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(1500);
  if (!(await page.locator('#login-public-id').count())) {
    console.log('Login form did not open — aborting.');
    await context.close(); process.exit(2);
  }
  await page.fill('#login-public-id', 'RoniDev');
  await page.fill('#login-passphrase', pw);
  await page.locator('#login-passphrase').press('Enter');
  await page.waitForTimeout(6000);
  const accept = page.locator('button:has-text("Accept & Continue")');
  if (await accept.count()) {
    const box = page.locator('#protocol-consent');
    if (await box.count()) await box.check().catch(() => {});
    await accept.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  await page.locator('button:has-text("Settings")').first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // ── nav shape: the three sections are NOT top-level any more ─────────────
  const topLevel = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-settings-nav]')).map((b) => b.getAttribute('data-settings-nav')));
  record('API Keys is not a top-level settings tab', !topLevel.includes('apikeys'), topLevel.join(', '));
  record('Privacy is not a top-level settings tab', !topLevel.includes('privacy'), topLevel.join(', '));
  record('Credits is not a top-level settings tab', !topLevel.includes('credits'), topLevel.join(', '));
  record('Account is a top-level settings tab', topLevel.includes('account'), topLevel.join(', '));

  // ── opening Account reveals them as sub-sections ─────────────────────────
  await page.locator('[data-settings-nav="account"]').click();
  await page.waitForTimeout(1800);

  const subs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-settings-subnav]')).map((b) => b.getAttribute('data-settings-subnav')));
  record('Account reveals Profile / API Keys / Privacy / Credits',
    ['account', 'apikeys', 'privacy', 'credits'].every((k) => subs.includes(k)),
    subs.join(', ') || 'no sub-tabs');

  // Each sub-tab must actually open its section.
  for (const [id, needle] of [['apikeys', /API Key/i], ['privacy', /Privacy|Security/i], ['credits', /Credits|Billing|Token/i]]) {
    const btn = page.locator(`[data-settings-subnav="${id}"]`);
    if (!(await btn.count())) { record(`Account → ${id} opens`, false, 'sub-tab missing'); continue; }
    await btn.click();
    await page.waitForTimeout(2000);
    const body = await page.evaluate(() => document.body.innerText);
    record(`Account → ${id} opens its section`, needle.test(body), `${body.length} chars`);
  }

  // ── profile editor ───────────────────────────────────────────────────────
  await page.locator('[data-settings-subnav="account"]').click();
  await page.waitForTimeout(2000);

  const nameInput = page.locator('#profileDisplayName');
  record('Profile has a display-name field', (await nameInput.count()) > 0,
    (await nameInput.count()) ? 'present' : 'missing');
  record('Profile has an avatar upload control', (await page.locator('#profileAvatarInput').count()) > 0,
    (await page.locator('#profileAvatarInput').count()) ? 'present' : 'missing');
  record('Profile has a public-ID change control', (await page.locator('#profileChangeIdBtn').count()) > 0,
    (await page.locator('#profileChangeIdBtn').count()) ? 'present' : 'missing');

  // Display name round-trips through the server.
  if (await nameInput.count()) {
    await nameInput.fill(PROBE_NAME);
    await page.locator('#profileDisplayName').locator('xpath=..').locator('button:has-text("Save")').click();
    await page.waitForTimeout(2500);
    const saved = await page.evaluate(async () => {
      const r = await fetch('/api/user/profile', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
      const j = await r.json();
      return j.display_name;
    });
    record('display name persists to the server', saved === PROBE_NAME, `server says "${saved}"`);
  }

  // Avatar upload: a real PNG through the real endpoint, then read it back.
  const png = tinyPng();
  const tmp = path.join('/tmp/opencode', 'probe-avatar.png');
  fs.writeFileSync(tmp, png);
  await page.locator('#profileAvatarInput').setInputFiles(tmp);
  await page.waitForTimeout(4000);

  const after = await page.evaluate(async () => {
    const r = await fetch('/api/user/profile', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
    const j = await r.json();
    return j.avatar_url || '';
  });
  record('avatar uploads AND persists to the account', /^\/uploads\/avatars\/.+\.png$/.test(after),
    after || 'no avatar_url on the account');

  if (after) {
    const served = await page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      return r.status;
    }, after);
    record('the stored avatar is actually served', served === 200, `GET ${after} -> ${served}`);

    const rendered = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img')).some((i) => /\/uploads\/avatars\//.test(i.getAttribute('src') || '')));
    record('the profile picture renders in the UI', rendered, rendered ? 'img present' : 'no img in DOM');
  }

  // Public ID: password-gated, and a wrong password must change nothing.
  if (await page.locator('#profileChangeIdBtn').count()) {
    await page.locator('#profileChangeIdBtn').click();
    await page.waitForTimeout(800);
    await page.fill('#profileNewId', 'some_new_id_probe');
    await page.fill('#profileIdPassword', 'definitely-not-the-password');
    await page.locator('#profileConfirmIdBtn').click();
    // The error is set from a catch after the request settles; 2500ms was
    // occasionally too tight for the round trip plus the paint.
    await page.waitForTimeout(4000);

    const still = await page.evaluate(async () => {
      const r = await fetch('/api/user/profile', { credentials: 'include', headers: { 'X-Public-ID': 'RoniDev' } });
      return (await r.json()).public_id;
    });
    record('a wrong password does NOT rename the account', still === 'RoniDev', `public_id is "${still}"`);

    const errShown = await page.evaluate(() => /Incorrect password/i.test(document.body.innerText));
    record('the wrong-password error is shown to the user', errShown, errShown ? 'visible' : 'no message');
  }

  record('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

  // Restore the operator's own state — this harness must leave nothing behind.
  const restored = await page.evaluate(async ([name]) => {
    const token = (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || '';
    const h = { 'Content-Type': 'application/json', 'X-Public-ID': 'RoniDev' };
    if (token) h['X-CSRF-Token'] = decodeURIComponent(token);
    const r = await fetch('/api/user/profile', {
      method: 'PATCH', credentials: 'include', headers: h,
      body: JSON.stringify({ display_name: name, avatar_url: '' }),
    });
    return r.status;
  }, ['']);
  record('harness restored the account (name + avatar cleared)', restored === 200, `PATCH -> ${restored}`);

  fs.unlinkSync(tmp);
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await context.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e && e.message); process.exit(1); });
