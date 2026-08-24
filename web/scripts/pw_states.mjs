/* Extended state swarm: captures every view + interactive variants
 * (open menus, expanded panels, tab switches, sidebar rail, mobile). */
import { chromium } from 'playwright';

const OUT = '/tmp/helpotron_shots';
const BASE = 'http://localhost:5173';
let seq = 80; // after pw_shots numbering
const snap = async (pg, name) => {
  seq += 1;
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${OUT}/${String(seq).padStart(2, '0')}_${name}.png` });
  console.log(name);
};
const click = async (pg, sel, name) => {
  try { await pg.click(sel, { timeout: 4000 }); console.log('click', name); }
  catch { console.log('MISS', name); }
  await pg.waitForTimeout(600);
};

const b = await chromium.launch();
const pgDesktop = await b.newPage({ viewport: { width: 1280, height: 860 } });
await pgDesktop.goto(BASE, { waitUntil: 'networkidle' });
await pgDesktop.waitForTimeout(1500);

/* ── Shell states ─────────────────────────────────────────────────────── */
await click(pgDesktop, 'aside button[aria-label*="Navigation"]', 'collapse rail');
await snap(pgDesktop, 'shell_sidebar_rail');
await click(pgDesktop, 'aside button[aria-label*="Navigation"]', 'expand rail');

await click(pgDesktop, 'header .rounded-full', 'avatar menu');
await snap(pgDesktop, 'shell_avatar_menu');
await pgDesktop.keyboard.press('Escape');

await click(pgDesktop, 'header button:has(.lucide-bell)', 'notifications');
await snap(pgDesktop, 'shell_notifications_open');
await pgDesktop.keyboard.press('Escape');

await click(pgDesktop, 'button[aria-label="Search anything…"]', 'search palette');
await snap(pgDesktop, 'shell_command_palette');
await pgDesktop.keyboard.press('Escape');

/* ── My Agent states ──────────────────────────────────────────────────── */
await click(pgDesktop, 'aside button:has-text("My Agent")', 'to agent');
await snap(pgDesktop, 'agent_top');
await click(pgDesktop, 'button:has-text("Manage (3)")', 'auto-approve manager');
await snap(pgDesktop, 'agent_autoapprove_manager');
await pgDesktop.keyboard.press('Escape');

/* ── Settings states ──────────────────────────────────────────────────── */
await click(pgDesktop, 'aside button:has-text("Settings")', 'to settings');
await click(pgDesktop, 'button:has-text("AI & Intelligence")', 'settings ai section');
await snap(pgDesktop, 'settings_ai');
await click(pgDesktop, 'button:has-text("Where this applies")', 'expand scoped panel');
await snap(pgDesktop, 'settings_scoped_expanded');
await click(pgDesktop, 'button:has-text("Done — collapse")', 'collapse scoped');
await click(pgDesktop, 'button:has-text("Budget")', 'preset confirm');
await snap(pgDesktop, 'settings_preset_confirm');
await click(pgDesktop, 'button:has-text("Cancel")', 'preset cancel');
await click(pgDesktop, 'button:has-text("Appearance")', 'settings appearance');
await snap(pgDesktop, 'settings_appearance_fontslider');

/* ── Credits tabs ─────────────────────────────────────────────────────── */
await click(pgDesktop, 'aside button:has-text("Credits")', 'to credits');
await snap(pgDesktop, 'credits_balance');
await click(pgDesktop, 'button:has-text("Plans & Top-ups")', 'credits plans');
await snap(pgDesktop, 'credits_plans');
await click(pgDesktop, 'button:has-text("Earn Credits")', 'credits earn');
await snap(pgDesktop, 'credits_earn');

/* ── Insights tabs ────────────────────────────────────────────────────── */
await click(pgDesktop, 'aside button:has-text("Insights")', 'to insights');
await snap(pgDesktop, 'insights_overview');
await click(pgDesktop, 'button:has-text("Academic Progress")', 'insights progress');
await snap(pgDesktop, 'insights_progress');
await click(pgDesktop, 'button:has-text("Recommendations")', 'insights recs');
await snap(pgDesktop, 'insights_recommendations');

/* ── Admin panel ──────────────────────────────────────────────────────── */
await click(pgDesktop, 'aside button:has-text("Control Center")', 'to admin');
await snap(pgDesktop, 'admin_control_center');
await pgDesktop.evaluate(() => window.scrollTo(0, 9999));
await snap(pgDesktop, 'admin_scrolled');

/* ── Mobile key states ────────────────────────────────────────────────── */
const pgMobile = await b.newPage({ viewport: { width: 390, height: 844 } });
await pgMobile.goto(BASE, { waitUntil: 'networkidle' });
await pgMobile.waitForTimeout(1500);
await snap(pgMobile, 'mobile_overview');
await click(pgMobile, 'aside button[aria-label*="Navigation"]', 'mobile nav open');
await snap(pgMobile, 'mobile_nav_open');

await b.close();
console.log('STATES DONE');
