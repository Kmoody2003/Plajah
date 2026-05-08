import fs from 'fs';
const content = fs.readFileSync('components/AlbumCreator.tsx', 'utf8');

const lines = content.split('\n');
let inAssets = false;
let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes("activeTab === 'ASSETS' && (")) {
    inAssets = true;
    stack.push({ line: i + 1, type: 'ASSETS' });
  }
  
  if (inAssets) {
    // This is a bit naive because of strings and comments, but let's try
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    
    for (let j = 0; j < openBraces; j++) stack.push({ line: i + 1, type: 'BRACE' });
    for (let j = 0; j < closeBraces; j++) {
      if (stack.length > 0 && stack[stack.length - 1].type === 'BRACE') {
        stack.pop();
      } else {
        console.log(`Extra closing brace at line ${i + 1}`);
      }
    }
    
    if (line.includes("activeTab === 'SETTINGS' && (")) {
      console.log(`At SETTINGS (line ${i + 1}), stack is:`, stack);
      break;
    }
  }
}
