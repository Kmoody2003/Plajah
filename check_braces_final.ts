import fs from 'fs';
const content = fs.readFileSync('components/AlbumCreator.tsx', 'utf8');
const lines = content.split('\n');

let stack = [];
let inString = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (inString) {
      if (char === inString && line[j-1] !== '\\') inString = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = char;
      continue;
    }
    if (char === '{' || char === '(') stack.push({ char, line: i + 1 });
    if (char === '}') {
      if (stack.length > 0 && stack[stack.length - 1].char === '{') stack.pop();
      else console.log(`Extra } at line ${i + 1}`);
    }
    if (char === ')') {
      if (stack.length > 0 && stack[stack.length - 1].char === '(') stack.pop();
      else console.log(`Extra ) at line ${i + 1}`);
    }
  }
}
if (stack.length > 0) {
  console.log('Unclosed:', stack);
} else {
  console.log('Balanced!');
}
