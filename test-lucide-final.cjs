const lucide = require('lucide-react');
const fs = require('fs');

const appTsx = fs.readFileSync('App.tsx', 'utf8');
const allImportsMatch = appTsx.match(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/);
const icons = [];
if (allImportsMatch) {
  allImportsMatch[1].split(',').forEach(item => {
    const name = item.trim().split(/\s+as\s+/)[0].trim();
    if (name) icons.push(name);
  });
}

function findLucideImports(dir) {
  const f = fs.readdirSync(dir);
  for (const file of f) {
    const fullPath = dir + '/' + file;
    if (fs.statSync(fullPath).isDirectory()) {
      findLucideImports(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("from 'lucide-react'")) {
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
               if (name && !icons.includes(name)) icons.push(name);
             });
           }
        }
      }
    }
  }
}

findLucideImports('./components');

const undefinedIcons = [];
for (const icon of icons) {
   if (lucide[icon] === undefined) {
      if (icon !== 'lucide-react' && icon !== '') {
          undefinedIcons.push(icon);
      }
   }
}

console.log("Undefined:", undefinedIcons);
