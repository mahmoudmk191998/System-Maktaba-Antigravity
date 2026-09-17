import { execSync } from 'child_process';
import path from 'path';

console.log('🔍 Auditing @rms/sdk package contents before publication...');

try {
  const output = execSync('npm pack --dry-run --json', { encoding: 'utf-8' });
  const parsed = JSON.parse(output);
  const tarballFiles = parsed[0]?.files || [];
  const filePaths = tarballFiles.map((f) => f.path);

  console.log(`📦 Tarball contains ${filePaths.length} files:`);
  filePaths.forEach((f) => console.log(`   - ${f}`));

  // Forbidden patterns
  const forbiddenPatterns = [
    /^\.env/i,
    /\.pem$/i,
    /\.key$/i,
    /firebase/i,
    /redis/i,
    /server\//i,
    /src\//i,
    /__tests__/i,
    /\.test\./i,
    /\.spec\./i,
    /coverage/i,
    /node_modules/i,
    /\.secret/i,
    /password/i,
  ];

  const violations = [];

  for (const file of filePaths) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(file)) {
        violations.push(`Forbidden file matched '${pattern}': ${file}`);
      }
    }
  }

  // Required files
  const requiredFiles = ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'];
  for (const req of requiredFiles) {
    if (!filePaths.some((f) => f === req || f.endsWith(`/${req}`))) {
      violations.push(`Missing required release file: ${req}`);
    }
  }

  // Must have compiled distribution output
  const hasDistJs = filePaths.some((f) => f.startsWith('dist/') && f.endsWith('.js'));
  const hasDistDts = filePaths.some((f) => f.startsWith('dist/') && f.endsWith('.d.ts'));

  if (!hasDistJs) violations.push('Missing compiled JavaScript in dist/');
  if (!hasDistDts) violations.push('Missing TypeScript declaration files (.d.ts) in dist/');

  if (violations.length > 0) {
    console.error('❌ Package content audit FAILED:');
    violations.forEach((v) => console.error(`   - ${v}`));
    process.exit(1);
  }

  console.log('✅ Package content audit PASSED! Package contains only authorized public distribution files.');
} catch (error) {
  console.error('❌ Error executing package audit:', error.message);
  process.exit(1);
}
