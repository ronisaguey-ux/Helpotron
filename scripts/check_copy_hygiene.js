// Assert against the built output and sources: ensure no evasion claims in UI
const fs = require('fs');
const path = require('path');

const banned = /passed stealth|stealth index/i;

// 1. Check web/src components (source check)
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

const srcHits = walk(srcDir).filter(f => banned.test(fs.readFileSync(f, 'utf8')));
if (srcHits.length) {
  console.error('evasion copy in source files:', srcHits);
  process.exit(1);
}

// 2. Check web/dist/assets if it exists
const distDir = path.join(__dirname, '..', 'web', 'dist', 'assets');
if (fs.existsSync(distDir)) {
  const distHits = fs.readdirSync(distDir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => banned.test(fs.readFileSync(path.join(distDir, f), 'utf8')));
  if (distHits.length) {
    console.error('evasion copy in bundle:', distHits);
    process.exit(1);
  }
}

console.log('copy hygiene OK');
