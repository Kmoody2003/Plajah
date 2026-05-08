import fs from 'fs';
let content = fs.readFileSync('components/MusicView.tsx', 'utf8');

const regex = /<h2 className="text-4xl font-black uppercase tracking-tightest(?: mb-12)?">([\s\S]*?)<\/h2>/g;
content = content.replace(regex, '<h1 className="text-8xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-12">$1</h1>');

fs.writeFileSync('components/MusicView.tsx', content);
