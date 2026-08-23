/* ht_vision_inspect.js — post-plan vision inspection (directive 08-22).
 * Sends the FRESH screenshots from /tmp/ht_views/ plus the API probe report
 * to google/gemini-3.1-flash-lite-image on OpenRouter and returns the model's
 * verdict on whether the site is actually done and issue-free.
 *
 * Usage: node ht_vision_inspect.js <screenshots-dir> <probe-report> <out-file>
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL = 'google/gemini-3.1-flash-lite-image';
const KEY = fs.readFileSync(path.join(process.env.HOME, '.claude/openrouter.token'), 'utf8').trim();
const SHOTS_DIR = process.argv[2] || '/tmp/ht_views';
const PROBE_FILE = process.argv[3] || '/tmp/ht_probe_report.txt';
const OUT_FILE = process.argv[4] || '/tmp/ht_vision_report.txt';

const PROMPT = `You are the final QA inspector for the "Helpotron Automator" web app (localhost:5173). You are looking at FRESH screenshots captured just now, plus an automated API probe report. Your job: determine whether the app is genuinely done and issue-free.

INSTRUCTIONS — examine each screenshot carefully:
1. Is each view RENDERED (real UI content, layout, text), or blank/crashed (white page, error screen, "React" crash, empty shell)?
2. Do the views show DIFFERENT content from each other (navigation actually works)?
3. Any visible red flags: unstyled/broken layout, overlapping elements, cut-off text, placeholder text like "lorem ipsum" or "TODO", console-error artifacts, broken images, obvious styling breakage?
4. Is the design coherent (dark theme, professional dashboard aesthetic) across views?

The 13 views are: home(Today), activity, history(Assignments), study(Study Tools), ai-workspace, library, automation(Automations), analytics, progress(Academic Progress), wallet(Credits), billing(Plans & Credits), settings, admin(Control Center).

API probe report follows the screenshots — treat it as ground truth for backend status.

RESPOND WITH:
- VERDICT: PASS or FAIL or PASS-WITH-CAVEATS (one line)
- Per-view notes: 1 line each, only for views with problems or notable observations
- Overall: 3-5 bullet summary of what is confirmed working
- Issues: numbered list of anything wrong (empty if none)`;

function callOpenRouter(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, messages, max_tokens: 1500 });
    const req = https.request({
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        try { resolve(JSON.parse(data).choices[0].message.content); }
        catch (e) { reject(new Error('parse failed: ' + data.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const files = fs.readdirSync(SHOTS_DIR).filter((f) => f.endsWith('.png')).sort();
  if (!files.length) { console.error('No screenshots found in ' + SHOTS_DIR); process.exit(1); }
  const probe = fs.existsSync(PROBE_FILE) ? fs.readFileSync(PROBE_FILE, 'utf8') : '(probe report missing)';

  const content = [{ type: 'text', text: PROMPT }];
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(SHOTS_DIR, f)).toString('base64');
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
  }
  content.push({ type: 'text', text: 'API PROBE REPORT:\n' + probe });
  console.log(`Sending ${files.length} screenshots to ${MODEL}...`);

  let verdict = null;
  for (let attempt = 1; attempt <= 2 && !verdict; attempt++) {
    try {
      verdict = await callOpenRouter([{ role: 'user', content }]);
    } catch (e) {
      console.error(`attempt ${attempt} failed: ${e.message}`);
      if (attempt === 2) process.exit(1);
    }
  }
  fs.writeFileSync(OUT_FILE, verdict);
  console.log(verdict);
  console.log(`\nReport saved to ${OUT_FILE}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
