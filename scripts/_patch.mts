import fs from 'node:fs'; import path from 'node:path'; import {pathToFileURL} from 'node:url';
const [id, mapFile] = process.argv.slice(2);
const file = path.resolve('data/practice/courses', id + '.ts');
const mod = (await import(pathToFileURL(file).href)).COURSE_MODULE;
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
let src = fs.readFileSync(file, 'utf8');
const BS = String.fromCharCode(92), SQ = String.fromCharCode(39);
const esc = (s: string) => s.split(BS).join(BS + BS).split(SQ).join(BS + SQ);
for (const [qid, ch] of Object.entries<any>(map)) {
  const q = mod.bank.questions.find((x: any) => x.id === qid);
  if (!q) { console.log('MISSING', qid); continue; }
  for (const [i, text] of Object.entries<string>(ch)) {
    if (+i === q.answer) { console.log('SKIP answer', qid); continue; }
    const old = SQ + esc(q.choices[+i]) + SQ;
    const n = src.split(old).length - 1;
    if (n !== 1) { console.log('NOMATCH', qid, i, n); continue; }
    src = src.split(old).join(SQ + esc(text) + SQ);
  }
}
fs.writeFileSync(file, src);
