const fs = require('fs');
const path = require('path');

function findLucideImports(dir, imports = new Set()) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findLucideImports(fullPath, imports);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("from 'lucide-react'") || line.includes("from \"lucide-react\"")) {
           let importStatement = line;
           let j = i;
           while (!importStatement.includes('import ') && j > 0) {
              j--;
              importStatement = lines[j] + '\n' + importStatement;
           }
           const match = importStatement.match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/);
           if (match) {
             match[1].split(',').forEach(item => {
               const name = item.trim().split(/\s+as\s+/)[0].trim();
               if (name) imports.add(name);
             });
           }
        }
      }
    }
  }
  return imports;
}

const allImports = findLucideImports('./components');
const appImportsMatch = fs.readFileSync('App.tsx', 'utf8').match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/);
if (appImportsMatch) {
  appImportsMatch[1].split(',').forEach(item => {
    const name = item.trim().split(/\s+as\s+/)[0].trim();
    if (name) allImports.add(name);
  });
}

const lucide = require('lucide-react');
const undefinedIcons = [];
for (const icon of allImports) {
   if (lucide[icon] === undefined) {
      if (icon !== 'lucide-react' && icon !== '') {
          undefinedIcons.push(icon);
      }
   }
}

console.log("Undefined icons:", undefinedIcons);
