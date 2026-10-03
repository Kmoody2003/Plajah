import fs from 'node:fs';
const [file, patch] = process.argv.slice(2);
let s = fs.readFileSync(file, 'utf8');
const lines = fs.readFileSync(patch, 'utf8').split(/\r?\n/).filter(l => l.includes(' ||| '));
for (const l of lines) {
  const [o, n] = l.split(' ||| ');
  let done = false;
  for (const [a, b] of [[o, n], [o.replace(/'/g, "\\'"), n.replace(/'/g, "\\'")], [o.replace(/'/g, '’'), n.replace(/'/g, '’')]]) {
    const c = s.split(a).length - 1;
    if (c === 1) { s = s.replace(a, () => b); done = true; break; }
    if (c > 1) { console.log('AMBIG', o.slice(0, 50)); done = true; break; }
  }
  if (!done) console.log('MISS', o.slice(0, 60));
}
fs.writeFileSync(file, s);
