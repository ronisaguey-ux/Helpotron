// scripts/check_stale_numbers.js
// Guard test: assert that web/src components contain no pre-migration token numbers (150, 300, 1000, 2700).

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'web', 'src');

// Regex patterns indicating pre-migration token allowances or stale counts
const STALE_PATTERNS = [
  { name: 'Trial 150/100 tokens', re: /(grants\s+150\b|trial\s*\(\s*100\s*tokens?\s*\)|credits_grant\s*\|\|\s*150\b|\b150\s+task\s+tokens\b)/i },
  { name: 'Basic 300 tokens', re: /(\b300\s+tokens?\b|basic\s*\(\s*300\s*tokens?\s*\))/i },
  { name: 'Pro 1,000 tokens', re: /(pro\s*\(\s*1,?000\s*tokens?\s*\)|\b1,?000\s+task\s+tokens\b)/i },
  { name: 'Elite 2,700 tokens', re: /(elite\s*\(\s*2,?700\s*tokens?\s*\)|\b2,?700\s+tokens?\b|\b2,?700\s+task\s+tokens\b)/i },
  { name: 'Big spend >100 tokens', re: />100\s+tokens/i },
];

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      files = files.concat(walk(p));
    } else if (p.endsWith('.jsx') || p.endsWith('.js')) {
      files.push(p);
    }
  }
  return files;
}

const files = walk(srcDir);
const errors = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Skip this check script itself or mock/demo data
    if (file.includes('check_stale_numbers') || file.includes('mock.js') || file.includes('demoData.js')) {
      return;
    }
    for (const pat of STALE_PATTERNS) {
      if (pat.re.test(line)) {
        errors.push({
          file: path.relative(path.join(__dirname, '..'), file),
          line: idx + 1,
          pattern: pat.name,
          text: line.trim(),
        });
      }
    }
  });
}

if (errors.length > 0) {
  console.error(`Found ${errors.length} stale token number occurrences:`);
  errors.forEach((e) => {
    console.error(`  ${e.file}:${e.line} [${e.pattern}] -> ${e.text}`);
  });
  process.exit(1);
} else {
  console.log('check_stale_numbers: OK (0 stale token numbers found)');
  process.exit(0);
}
