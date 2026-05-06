import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import fs from 'fs';

let failed = [];

async function testAll() {
  const tsxFiles = fs.readdirSync('components').filter(f => f.endsWith('.tsx'));
  // compile a quick test file to import them all
  let testFile = `
    import React from 'react';
    ` + tsxFiles.map((f, i) => `import C${i} from './components/${f.replace('.tsx','')}';`).join('\n') + `
    export const components = [${tsxFiles.map((f,i) => `C${i}`).join(',')}];
    export const names = [${tsxFiles.map(f => `'${f}'`).join(',')}];
  `;
  fs.writeFileSync('test-imports.tsx', testFile);
}

testAll();
