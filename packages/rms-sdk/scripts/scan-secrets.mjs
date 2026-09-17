import fs from 'fs';
import path from 'path';

console.log('🔒 Scanning @rms/sdk for leaked credentials and hardcoded secrets...');

const filesToScan = [
  path.resolve('README.md'),
  path.resolve('package.json'),
  path.resolve('CHANGELOG.md'),
];

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.d.ts') || entry.name.endsWith('.json') || entry.name.endsWith('.md'))) {
      filesToScan.push(fullPath);
    }
  }
}

collectFiles(path.resolve('src'));
if (fs.existsSync(path.resolve('dist'))) {
  collectFiles(path.resolve('dist'));
}

const secretRules = [
  { name: 'Private Key Block', regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/ },
  { name: 'Firebase Private Key', regex: /"private_key":\s*"-----BEGIN/ },
  { name: 'Hardcoded Redis URL with password', regex: /redis:\/\/:[^@\s]+@[^/\s]+/ },
  { name: 'Hardcoded Live API Token', regex: /rms_live_[a-zA-Z0-9]{24,}/ },
  { name: 'Hardcoded Live Webhook Secret', regex: /whsec_[a-zA-Z0-9]{24,}/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
];

let violationCount = 0;

for (const filePath of filesToScan) {
  if (!fs.existsSync(filePath)) continue;
  const relative = path.relative(process.cwd(), filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

  for (const rule of secretRules) {
    if (rule.regex.test(content)) {
      // Check if it's a documentation placeholder
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (rule.regex.test(line)) {
          // Ignore explicit doc placeholders
          if (!line.includes('<YOUR_API_KEY>') && !line.includes('<REDACTED>') && !line.includes('process.env.')) {
            console.error(`❌ [${rule.name}] Detected secret pattern in ${relative}:${idx + 1}`);
            console.error(`   Line: ${line.trim().slice(0, 80)}...`);
            violationCount++;
          }
        }
      });
    }
  }
}

if (violationCount > 0) {
  console.error(`\n❌ Secret scan FAILED: ${violationCount} potential secret(s) found!`);
  process.exit(1);
}

console.log(`✅ Secret scan PASSED! Scanned ${filesToScan.length} files with zero leaked credentials.`);
