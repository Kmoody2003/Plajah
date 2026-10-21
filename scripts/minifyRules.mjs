// minifyRules — strips comments + indentation from a Firestore/Storage rules file so it fits
// Firebase's 256 KiB source limit. The source of truth stays the commented `firestore.rules`;
// deploys use the generated `firestore.rules.min` (firebase.json points at it).
//
//   node scripts/minifyRules.mjs [in=firestore.rules] [out=firestore.rules.min] [--no-compact]
//
// Firestore rules are then compacted (scripts/compactRules.mjs) to fit Firebase's separate
// 256,000-byte cap on the *compiled* ruleset. Every build re-expands its own output and refuses
// to write anything unless the result matches the minified source grant for grant.
//
// Only whole-line and trailing `//` comments outside string literals are removed, plus `/* */`
// blocks. Statements are never joined or reordered, so line structure (and therefore any error a
// deploy reports) maps back to a recognisable rule.

import { readFileSync, writeFileSync } from 'node:fs';
import { compactRules, expandRules, allowSet } from './compactRules.mjs';

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
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const inp = args[0] ?? 'firestore.rules', outp = args[1] ?? `${inp}.min`;
  const src = readFileSync(inp, 'utf8');
  let min = minifyRules(src);
  const kb = n => (n / 1024).toFixed(1) + ' KiB';
  const compact = !process.argv.includes('--no-compact') && /service cloud\.firestore/.test(min);
  if (compact) {
    const { out, meta } = compactRules(min);
    const a = allowSet(min), b = allowSet(expandRules(out, meta));
    if (a.rest !== b.rest || a.grants.join('|') !== b.grants.join('|')) {
      console.error('compactRules: expanded output does not match the source — refusing to write', outp);
      process.exit(1);
    }
    console.log(`compacted ${kb(Buffer.byteLength(min))} → ${kb(Buffer.byteLength(out))} (${meta.helpers.length + meta.templates.length} helpers, ${a.grants.length} grants verified identical)`);
    min = out;
  }
  writeFileSync(outp, min);
  const size = Buffer.byteLength(min);
  console.log(`${inp} ${kb(Buffer.byteLength(src))} → ${outp} ${kb(size)} ${size < 256 * 1024 ? '(under the 256 KiB limit)' : '(STILL OVER 256 KiB)'}`);
  if (size >= 256 * 1024) process.exitCode = 1;
}
