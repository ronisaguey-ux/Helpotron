// Assert against the built output and sources: ensure no evasion claims in UI
const fs = require('fs');
const path = require('path');

// Banned copy patterns representing evasion/stealth marketing claims.
// Note on TermsOfServiceView.jsx:
// - Line ~71: "...are not guaranteed to be undetectable..." (legitimate legal disclaimer)
// - Line ~181: "...attempt to evade rate limits..." (prohibiting abuse)
// - Line ~252: "...or undetectable, or that the Service..." (legitimate warranty disclaimer)
// We disallow affirmative marketing claims while permitting negative disclaimers
// (e.g. using negative lookbehind /(?<!not\s+)guaranteed\s+undetectable/i).
const bannedPatterns = [
  /passed stealth/i,
  /stealth index/i,
  /multi-detector evasion/i,
  /detector evasion/i,
  /beats?\s+(the\s+)?ai\s+detectors?/i,
  /fool(s|ed)?\s+the\s+detector/i,
  /bypass(es|ed)?\s+detection/i,
  /(?<!not\s+)guaranteed\s+undetectable/i,
];

function containsBannedCopy(text) {
  return bannedPatterns.some((re) => re.test(text));
}

// 1. Check web/index.html and web/src components (source check)
const indexHtml = path.join(__dirname, '..', 'web', 'index.html');
const srcDir = path.join(__dirname, '..', 'web', 'src');
function walk(d) {
  let files = [];
  for (const f of fs.readdirSync(d)) {
    const full = path.join(d, f);
    if (fs.statSync(full).isDirectory()) files = files.concat(walk(full));
    else if (f.endsWith('.jsx') || (f.endsWith('.js') && !f.includes('check_copy_hygiene'))) files.push(full);
  }
  return files;
}

const candidateFiles = (fs.existsSync(indexHtml) ? [indexHtml] : []).concat(walk(srcDir));
const srcHits = candidateFiles.filter(f => containsBannedCopy(fs.readFileSync(f, 'utf8')));
if (srcHits.length) {
  console.error('evasion copy in source files:', srcHits);
  process.exit(1);
}

// 2. Check web/dist/assets if it exists
const distDir = path.join(__dirname, '..', 'web', 'dist', 'assets');
if (fs.existsSync(distDir)) {
  const distHits = fs.readdirSync(distDir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => containsBannedCopy(fs.readFileSync(path.join(distDir, f), 'utf8')));
  if (distHits.length) {
    console.error('evasion copy in bundle:', distHits);
    process.exit(1);
  }
}

console.log('copy hygiene OK');
