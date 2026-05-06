import fs from 'fs';
const chatFile = 'components/ChatSystem.tsx';
let b = fs.readFileSync(chatFile, 'utf8');
b = b.replace(/bg-\[\#0a0a0a\]/g, 'bg-theme');
fs.writeFileSync(chatFile, b);
