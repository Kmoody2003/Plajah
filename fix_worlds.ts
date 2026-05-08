import fs from 'fs';
const file = 'components/WorldsView.tsx';
let txt = fs.readFileSync(file, 'utf8');
txt = txt.replace(
  /<h2 className="text-3xl font-black uppercase tracking-tightest flex items-center gap-4">\s*<Globe className="text-small-orange" size={32} \/>\s*Worlds & Lore\s*<\/h2>/,
  '<h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Worlds</h1>'
);
fs.writeFileSync(file, txt);
