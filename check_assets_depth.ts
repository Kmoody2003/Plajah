import fs from 'fs';
const content = fs.readFileSync('components/AlbumCreator.tsx', 'utf8');
const lines = content.split('\n');

let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div\b(?![^>]*\/>)/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  console.log(`Line ${i+1}: depth ${depth} (${opens} opens, ${closes} closes)`);
}
console.log(`Final depth: ${depth}`);
