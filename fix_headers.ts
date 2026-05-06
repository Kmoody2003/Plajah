import fs from 'fs';
import path from 'path';

function walk(dir: string, callback: (filepath: string) => void) {
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      walk(p, callback);
    } else {
      callback(p);
    }
  });
}

walk('components', (file) => {
  if (file.endsWith('.tsx')) {
    let text = fs.readFileSync(file, 'utf8');
    let newText = text.replace(/text-8xl md:text-\[12rem\]/g, 'text-6xl md:text-[12rem]');
    if (newText !== text) {
      fs.writeFileSync(file, newText);
    }
  }
});
