const fs = require('fs');
const p = process.argv[2];
const pairsFile = process.argv[3];
let s = fs.readFileSync(p, 'utf8');
const lines = fs.readFileSync(pairsFile, 'utf8').split('\n').filter(l => l.includes(' => '));
for (const l of lines) {
  const [a, b] = l.split(' => ');
  const A = "'" + a.replace(/'/g, "\\'") + "'";
  const B = "'" + b.replace(/'/g, "\\'") + "'";
  if (!s.includes(A)) { console.log('MISSING', a); continue; }
  s = s.split(A).join(B);
}
fs.writeFileSync(p, s);
