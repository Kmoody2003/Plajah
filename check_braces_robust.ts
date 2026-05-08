import fs from 'fs';
const content = fs.readFileSync('components/AlbumCreator.tsx', 'utf8');

let depth = 0;
let lineNum = 1;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '\n') lineNum++;
  if (content[i] === '(') depth++;
  if (content[i] === ')') depth--;
  if (depth < 0) {
    console.log(`Line ${lineNum}: Negative parenthesis depth!`);
    depth = 0;
  }
}
console.log(`Final parenthesis depth: ${depth}`);

depth = 0;
lineNum = 1;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '\n') lineNum++;
  if (content[i] === '{') depth++;
  if (content[i] === '}') depth--;
  if (depth < 0) {
    console.log(`Line ${lineNum}: Negative brace depth!`);
    depth = 0;
  }
}
console.log(`Final brace depth: ${depth}`);
