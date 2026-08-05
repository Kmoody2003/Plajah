// One-time codemod: route every direct `onSnapshot` import from
// 'firebase/firestore' through services/safeSnapshot (throw-proof wrapper).
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const out = execSync(
  `git grep -l "onSnapshot" -- "*.ts" "*.tsx"`,
  { cwd: root, encoding: 'utf8' }
);
const files = out.split(/\r?\n/).filter(Boolean)
  .filter(f => !f.includes('safeSnapshot') && !f.endsWith('backendService.ts') && !f.startsWith('.claude'));

let changed = 0;
for (const rel of files) {
  const file = path.join(root, rel);
  let src = readFileSync(file, 'utf8');

  // Only touch files importing onSnapshot from firebase/firestore
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]firebase\/firestore['"]/m;
  const m = src.match(importRe);
  if (!m || !/\bonSnapshot\b/.test(m[1])) continue;

  // Remove the onSnapshot specifier (handles leading/trailing commas)
  const cleaned = m[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s !== 'onSnapshot')
    .join(', ');
  const newImport = cleaned
    ? `import { ${cleaned} } from 'firebase/firestore'`
    : `// (firestore value imports removed — onSnapshot now comes from safeSnapshot)`;

  // Relative path from this file's directory to services/safeSnapshot
  const fromDir = path.dirname(rel).replace(/\\/g, '/');
  let relPath = path.posix.relative(fromDir === '.' ? '' : fromDir, 'services/safeSnapshot');
  if (!relPath.startsWith('.')) relPath = './' + relPath;

  src = src.replace(importRe, `${newImport};\nimport { onSnapshot } from '${relPath}'`);
  // Guard against double semicolons from the replacement
  src = src.replace(/safeSnapshot';;/g, "safeSnapshot';");
  writeFileSync(file, src, 'utf8');
  changed++;
  console.log('rewrote', rel);
}
console.log(`done: ${changed} files`);
