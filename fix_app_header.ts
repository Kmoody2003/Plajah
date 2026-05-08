import fs from 'fs';
const file = 'App.tsx';
let txt = fs.readFileSync(file, 'utf8');
txt = txt.replace(/text-8xl md:text-\[12rem\]/g, 'text-6xl md:text-[12rem]');
fs.writeFileSync(file, txt);
