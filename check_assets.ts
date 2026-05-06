import fs from 'fs';
const content = fs.readFileSync('components/AlbumCreator.tsx', 'utf8');

const lines = content.split('\n');
let inAssets = false;
let divCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes("activeTab === 'ASSETS' && (")) {
    inAssets = true;
    console.log(`ASSETS starts at line ${i + 1}`);
  }
  
  if (inAssets) {
    const openDivs = (line.match(/<div/g) || []).length;
    const closeDivs = (line.match(/<\/div>/g) || []).length;
    
    divCount += openDivs - closeDivs;
    
    if (line.includes("activeTab === 'SETTINGS' && (")) {
      console.log(`SETTINGS starts at line ${i + 1}, divCount is ${divCount}`);
      inAssets = false;
    }
  }
}
