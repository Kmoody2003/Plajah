import fs from 'fs';
const content = fs.readFileSync('components/AlbumCreator.tsx', 'utf8');

let divCount = 0;
const openDivRegex = /<div\b[^>]*>/g;
const closeDivRegex = /<\/div>/g;

let match;
const tags = [];

while ((match = openDivRegex.exec(content)) !== null) {
  tags.push({ type: 'open', index: match.index, line: content.substring(0, match.index).split('\n').length });
}

while ((match = closeDivRegex.exec(content)) !== null) {
  tags.push({ type: 'close', index: match.index, line: content.substring(0, match.index).split('\n').length });
}

tags.sort((a, b) => a.index - b.index);

let depth = 0;
for (const tag of tags) {
  if (tag.type === 'open') depth++;
  else depth--;
  if (depth < 0) {
    console.log(`Extra </div> at line ${tag.line}`);
    depth = 0;
  }
}
console.log(`Final depth: ${depth}`);
