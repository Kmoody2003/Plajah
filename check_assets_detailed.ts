import fs from 'fs';
const content = fs.readFileSync('components/AlbumCreator.tsx', 'utf8');

const lines = content.split('\n');
let inAssets = false;
let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes("activeTab === 'ASSETS' && (")) {
    inAssets = true;
  }
  
  if (inAssets) {
    const openDivs = (line.match(/<div/g) || []).length;
    const closeDivs = (line.match(/<\/div>/g) || []).length;
    
    for (let j = 0; j < openDivs; j++) stack.push(i + 1);
    for (let j = 0; j < closeDivs; j++) stack.pop();
    
    if (line.includes("activeTab === 'SETTINGS' && (")) {
      console.log(`Unclosed divs opened at lines: ${stack.join(', ')}`);
      break;
    }
  }
}
