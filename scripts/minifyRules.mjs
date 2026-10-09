// minifyRules — strips comments + indentation from a Firestore/Storage rules file so it fits
// Firebase's 256 KiB source limit. The source of truth stays the commented `firestore.rules`;
// deploys use the generated `firestore.rules.min` (firebase.json points at it).
//
//   node scripts/minifyRules.mjs [in=firestore.rules] [out=firestore.rules.min]
//
// Only whole-line and trailing `//` comments outside string literals are removed, plus `/* */`
// blocks. Statements are never joined or reordered, so line structure (and therefore any error a
// deploy reports) maps back to a recognisable rule.

import { readFileSync, writeFileSync } from 'node:fs';

export function minifyRules(src) {
  const out = [];
  let inBlock = false;
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    let res = '', q = null;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (inBlock) { if (c === '*' && raw[i + 1] === '/') { inBlock = false; i++; } continue; }
      if (q) {
        res += c;
        if (c === '\\') { res += raw[i + 1] ?? ''; i++; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'") { q = c; res += c; continue; }
      if (c === '/' && raw[i + 1] === '/') break;
      if (c === '/' && raw[i + 1] === '*') { inBlock = true; i++; continue; }
      res += c;
    }
    const t = res.trim();   // never collapse inner whitespace: it could sit inside a string literal
    if (t) out.push(t);
  }
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('minifyRules.mjs')) {
  const inp = process.argv[2] ?? 'firestore.rules', outp = process.argv[3] ?? `${inp}.min`;
  const src = readFileSync(inp, 'utf8');
  const min = minifyRules(src);
  writeFileSync(outp, min);
  const kb = n => (n / 1024).toFixed(1) + ' KiB';
  const size = Buffer.byteLength(min);
  console.log(`${inp} ${kb(Buffer.byteLength(src))} → ${outp} ${kb(size)} ${size < 256 * 1024 ? '(under the 256 KiB limit)' : '(STILL OVER 256 KiB)'}`);
  if (size >= 256 * 1024) process.exitCode = 1;
}
