import fs from 'fs';
import path from 'path';

function findImports(dir) {
  let imports = new Set();
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file.startsWith('.')) continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findImports(fullPath).forEach(i => imports.add(i));
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lucideMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]lucide-react['"]/g);
      if (lucideMatch) {
        for (const match of lucideMatch) {
          const inner = match.replace(/import\s+{/, '').replace(/}\s+from\s+['"]lucide-react['"]/, '');
          const parts = inner.split(',').map(p => p.trim()).filter(Boolean);
          for (const p of parts) {
            const name = p.split(' as ')[0].trim();
            imports.add(name);
          }
        }
      }
    }
  }
  return imports;
}

const allImports = Array.from(findImports('.'));
const testContent = `
import * as lucide from 'lucide-react';
const icons = ${JSON.stringify(allImports)};
let hasError = false;
for (const icon of icons) {
  if (!lucide[icon]) {
    console.error('Undefined icon:', icon);
    hasError = true;
  }
}
if (!hasError) console.log('All icons exist!');
`;
fs.writeFileSync('test-gen.ts', testContent);
