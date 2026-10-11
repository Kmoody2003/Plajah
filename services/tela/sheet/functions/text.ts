// text — Text functions. Positions are 1-based UTF-16 code units like Excel.

import { eachValue, scalarOf, textToNumber, toStr, toMatrix, wildcardRegex, type Frame } from '../coerce';
import { textFunction, formatValue } from '../numfmt';
import { CellError, ERR, Matrix, OMITTED, type Scalar, type Value, isErr } from '../values';
import { B, BO, I, IO, N, NO, S, SO, firstErr, omitted } from './helpers';
import { roundHalfAway } from './math';
import { def, alias } from './registry';

const L = { lift: 'all' as const };
const MAX_TEXT = 32767;
const capped = (s: string) => (s.length > MAX_TEXT ? ERR.VALUE : s);

def('LEN', 'text', 1, 1, 'text', 'Number of characters.', a => { const s = S(a[0]); return isErr(s) ? s : s.length; }, L);
alias('LENB', 'LEN');
def('LEFT', 'text', 1, 2, 'text, [num_chars]', 'Leftmost characters.', a => {
  const s = S(a[0]), n = NO(a[1], 1); const e = firstErr(s, n); if (e) return e;
  return (n as number) < 0 ? ERR.VALUE : (s as string).slice(0, Math.trunc(n as number));
}, L);
alias('LEFTB', 'LEFT');
def('RIGHT', 'text', 1, 2, 'text, [num_chars]', 'Rightmost characters.', a => {
  const s = S(a[0]), n = NO(a[1], 1); const e = firstErr(s, n); if (e) return e;
  const k = Math.trunc(n as number); if (k < 0) return ERR.VALUE;
  return k === 0 ? '' : (s as string).slice(-k);
}, L);
alias('RIGHTB', 'RIGHT');
def('MID', 'text', 3, 3, 'text, start_num, num_chars', 'Characters from the middle.', a => {
  const s = S(a[0]), st = N(a[1]), n = N(a[2]); const e = firstErr(s, st, n); if (e) return e;
  const p = Math.trunc(st as number), k = Math.trunc(n as number);
  if (p < 1 || k < 0) return ERR.VALUE;
  return (s as string).substr(p - 1, k);
}, L);
alias('MIDB', 'MID');
def('FIND', 'text', 2, 3, 'find_text, within_text, [start_num]', 'Case-sensitive position of text.', a => {
  const f = S(a[0]), w = S(a[1]), st = NO(a[2], 1); const e = firstErr(f, w, st); if (e) return e;
  const p = Math.trunc(st as number);
  if (p < 1 || p > (w as string).length + 1) return ERR.VALUE;
  const i = (w as string).indexOf(f as string, p - 1);
  return i < 0 ? ERR.VALUE : i + 1;
}, L);
alias('FINDB', 'FIND');
def('SEARCH', 'text', 2, 3, 'find_text, within_text, [start_num]', 'Case-insensitive, wildcard position of text.', a => {
  const f = S(a[0]), w = S(a[1]), st = NO(a[2], 1); const e = firstErr(f, w, st); if (e) return e;
  const p = Math.trunc(st as number), within = w as string;
  if (p < 1 || p > within.length + 1) return ERR.VALUE;
  const pat = f as string;
  if (!/[*?~]/.test(pat)) { const i = within.toLowerCase().indexOf(pat.toLowerCase(), p - 1); return i < 0 ? ERR.VALUE : i + 1; }
  const re = wildcardRegex(pat);
  const inner = new RegExp(re.source.slice(1, -1), 'i');
  for (let i = p - 1; i <= within.length; i++) { const m = inner.exec(within.slice(i)); if (m && m.index === 0) return i + 1; }
  return ERR.VALUE;
}, L);
alias('SEARCHB', 'SEARCH');
def('SUBSTITUTE', 'text', 3, 4, 'text, old_text, new_text, [instance_num]', 'Replace occurrences of text.', a => {
  const s = S(a[0]), o = S(a[1]), n = S(a[2]); const e = firstErr(s, o, n); if (e) return e;
  const text = s as string, old = o as string, nw = n as string;
  if (!old) return text;
  if (omitted(a[3])) return capped(text.split(old).join(nw));
  const k = I(a[3]); if (isErr(k)) return k; if (k < 1) return ERR.VALUE;
  let idx = -1;
  for (let c = 0; c < k; c++) { idx = text.indexOf(old, idx + 1); if (idx < 0) return text; }
  return capped(text.slice(0, idx) + nw + text.slice(idx + old.length));
}, L);
def('REPLACE', 'text', 4, 4, 'old_text, start_num, num_chars, new_text', 'Replace part of a text by position.', a => {
  const s = S(a[0]), st = N(a[1]), n = N(a[2]), nw = S(a[3]); const e = firstErr(s, st, n, nw); if (e) return e;
  const p = Math.trunc(st as number), k = Math.trunc(n as number);
  if (p < 1 || k < 0) return ERR.VALUE;
  return capped((s as string).slice(0, p - 1) + nw + (s as string).slice(p - 1 + k));
}, L);
alias('REPLACEB', 'REPLACE');
def('UPPER', 'text', 1, 1, 'text', 'Upper case.', a => { const s = S(a[0]); return isErr(s) ? s : s.toUpperCase(); }, L);
def('LOWER', 'text', 1, 1, 'text', 'Lower case.', a => { const s = S(a[0]); return isErr(s) ? s : s.toLowerCase(); }, L);
def('PROPER', 'text', 1, 1, 'text', 'Capitalize each word.', a => {
  const s = S(a[0]); if (isErr(s)) return s;
  return s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
}, L);
def('TRIM', 'text', 1, 1, 'text', 'Remove extra spaces.', a => { const s = S(a[0]); return isErr(s) ? s : s.replace(/ +/g, ' ').replace(/^ | $/g, ''); }, L);
def('CLEAN', 'text', 1, 1, 'text', 'Remove non-printable characters.', a => { const s = S(a[0]); return isErr(s) ? s : s.replace(/[\x00-\x1f]/g, ''); }, L);
def('REPT', 'text', 2, 2, 'text, number_times', 'Repeat text.', a => {
  const s = S(a[0]), n = N(a[1]); const e = firstErr(s, n); if (e) return e;
  const k = Math.trunc(n as number); if (k < 0) return ERR.VALUE;
  if ((s as string).length * k > MAX_TEXT) return ERR.VALUE;
  return (s as string).repeat(k);
}, L);
def('EXACT', 'text', 2, 2, 'text1, text2', 'Case-sensitive equality.', a => { const x = S(a[0]), y = S(a[1]); const e = firstErr(x, y); return e ?? x === y; }, L);
// Windows-1252 for CHAR/CODE 128–159.
const CP1252: Record<number, number> = { 128: 0x20ac, 130: 0x201a, 131: 0x192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x2c6, 137: 0x2030, 138: 0x160, 139: 0x2039, 140: 0x152, 142: 0x17d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x2dc, 153: 0x2122, 154: 0x161, 155: 0x203a, 156: 0x153, 158: 0x17e, 159: 0x178 };
const CP1252_REV = new Map(Object.entries(CP1252).map(([k, v]) => [v, Number(k)]));
def('CHAR', 'text', 1, 1, 'number', 'Character for a code (1–255).', a => {
  const n = I(a[0]); if (isErr(n)) return n;
  if (n < 1 || n > 255) return ERR.VALUE;
  return String.fromCharCode(CP1252[n] ?? n);
}, L);
def('CODE', 'text', 1, 1, 'text', 'Code of the first character.', a => {
  const s = S(a[0]); if (isErr(s)) return s; if (!s) return ERR.VALUE;
  const c = s.charCodeAt(0); return CP1252_REV.get(c) ?? (c > 255 ? 63 : c);
}, L);
def('UNICHAR', 'text', 1, 1, 'number', 'Unicode character for a code point.', a => {
  const n = I(a[0]); if (isErr(n)) return n;
  if (n < 1 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return ERR.VALUE;
  return String.fromCodePoint(n);
}, { ...L, future: true });
def('UNICODE', 'text', 1, 1, 'text', 'Code point of the first character.', a => { const s = S(a[0]); if (isErr(s)) return s; return s ? s.codePointAt(0)! : ERR.VALUE; }, { ...L, future: true });
def('T', 'text', 1, 1, 'value', 'Text if the value is text, else "".', a => { const v = a[0]; return v instanceof CellError ? v : typeof v === 'string' ? v : ''; }, L);
def('VALUE', 'text', 1, 1, 'text', 'Text to number.', a => {
  const v = a[0];
  if (typeof v === 'number') return v;
  if (v instanceof CellError) return v;
  if (v === null || v === OMITTED) return 0;
  if (typeof v === 'boolean') return ERR.VALUE;
  const n = textToNumber(String(v)); return n === null ? ERR.VALUE : n;
}, L);
def('NUMBERVALUE', 'text', 1, 3, 'text, [decimal_separator], [group_separator]', 'Text to number with explicit separators.', a => {
  const s = S(a[0]), d = SO(a[1], '.'), g = SO(a[2], ','); const e = firstErr(s, d, g); if (e) return e;
  let t = (s as string).replace(/\s/g, '');
  if (!t) return 0;
  const dec = (d as string)[0] ?? '.', grp = (g as string)[0] ?? ',';
  if (dec === grp) return ERR.VALUE;
  const di = t.indexOf(dec);
  if (di >= 0 && t.slice(di + 1).includes(grp)) return ERR.VALUE;
  t = t.split(grp).join('');
  t = t.replace(dec, '.');
  let pct = 0; while (t.endsWith('%')) { pct++; t = t.slice(0, -1); }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return ERR.VALUE;
  return Number(t) / Math.pow(100, pct);
}, { ...L, future: true });
def('TEXT', 'text', 2, 2, 'value, format_text', 'Format a value as text.', a => {
  const f = S(a[1]); if (isErr(f)) return f;
  const v = a[0];
  if (v instanceof CellError) return v;
  if (typeof v === 'string') { const n = textToNumber(v); return textFunction(n === null ? v : n, f); }
  return textFunction(v === OMITTED ? null : (v as Scalar) ?? 0, f);
}, L);
function fixed(x: number, d: number, noCommas: boolean): string {
  const r = roundHalfAway(x, d);
  let s = Math.abs(r).toFixed(Math.max(0, d));
  if (!noCommas) { const [i, f] = s.split('.'); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); }
  return (r < 0 ? '-' : '') + s;
}
def('FIXED', 'text', 1, 3, 'number, [decimals], [no_commas]', 'Number as text with fixed decimals.', a => {
  const x = N(a[0]), d = NO(a[1], 2), nc = BO(a[2], false); const e = firstErr(x, d, nc); if (e) return e;
  return fixed(x as number, Math.trunc(d as number), nc as boolean);
}, L);
def('DOLLAR', 'text', 1, 2, 'number, [decimals]', 'Number as currency text.', a => {
  const x = N(a[0]), d = NO(a[1], 2); const e = firstErr(x, d); if (e) return e;
  const s = fixed(Math.abs(x as number), Math.trunc(d as number), false);
  return (x as number) < 0 && /[1-9]/.test(s) ? `($${s})` : `$${s}`;
}, L);

def('CONCATENATE', 'text', 1, 255, 'text1, [text2], ...', 'Join texts.', a => {
  let out = '';
  for (const v of a) { const s = S(v); if (isErr(s)) return s; out += s; }
  return capped(out);
}, L);
def('CONCAT', 'text', 1, 254, 'text1, [text2], ...', 'Join texts and ranges.', (a, f) => {
  let out = ''; let err: CellError | null = null;
  eachValue(a, f, v => { const s = toStr(v); if (isErr(s)) { err = s; return false; } out += s; }, { clamp: true });
  return err ?? capped(out);
}, { future: true });
def('TEXTJOIN', 'text', 3, 252, 'delimiter, ignore_empty, text1, ...', 'Join texts with a delimiter.', (a, f) => {
  const dm = toMatrix(a[0], f); if (isErr(dm)) return dm;
  const delims: string[] = [];
  for (const v of dm.data.flat()) { const s = toStr(v); if (isErr(s)) return s; delims.push(s); }
  const ign = B(a[1], f); if (isErr(ign)) return ign;
  const parts: string[] = []; let err: CellError | null = null;
  eachValue(a.slice(2), f, v => { const s = toStr(v); if (isErr(s)) { err = s; return false; } if (ign && s === '') return; parts.push(s); }, { clamp: true });
  if (err) return err;
  let out = '';
  parts.forEach((p, i) => { out += (i ? delims[(i - 1) % delims.length] : '') + p; });
  return capped(out);
}, { future: true });

/** Shared delimiter search for TEXTBEFORE/TEXTAFTER: returns [start,end] of the n-th delimiter. */
function findDelim(text: string, delims: string[], n: number, ci: boolean, matchEnd: boolean): [number, number] | null {
  const hay = ci ? text.toLowerCase() : text;
  const ds = delims.map(d => (ci ? d.toLowerCase() : d));
  const hits: [number, number][] = [];
  let i = 0;
  while (i <= hay.length) {
    let best: [number, number] | null = null;
    for (const d of ds) { if (!d) continue; const k = hay.indexOf(d, i); if (k >= 0 && (!best || k < best[0])) best = [k, k + d.length]; }
    if (!best) break;
    hits.push(best); i = best[1];
  }
  if (matchEnd) hits.push([text.length, text.length]);
  if (n > 0) return hits[n - 1] ?? null;
  // Negative: count from the end; match_end adds a virtual delimiter at the start.
  const back = matchEnd ? [[0, 0] as [number, number], ...hits.slice(0, -1)] : hits;
  return back[back.length + n] ?? null;
}
function textAround(a: Value[], f: Frame, before: boolean): Value {
  const s = S(a[0], f); if (isErr(s)) return s;
  const dm = toMatrix(a[1], f); if (isErr(dm)) return dm;
  const delims: string[] = []; for (const v of dm.data.flat()) { const x = toStr(v); if (isErr(x)) return x; delims.push(x); }
  const n = IO(a[2], 1, f), mode = IO(a[3], 0, f), mEnd = IO(a[4], 0, f); const e = firstErr(n, mode, mEnd); if (e) return e;
  if (n === 0 || Math.abs(n as number) > s.length + 1) return ERR.VALUE;
  if (delims.every(d => d === '')) return before ? (n as number) > 0 ? '' : s : (n as number) > 0 ? s : '';
  const hit = findDelim(s, delims, n as number, mode === 1, mEnd === 1);
  if (!hit) return omitted(a[5]) ? ERR.NA : a[5];
  return before ? s.slice(0, hit[0]) : s.slice(hit[1]);
}
def('TEXTBEFORE', 'text', 2, 6, 'text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found]', 'Text before a delimiter.', (a, f) => textAround(a, f, true), { lift: [0], future: true });
def('TEXTAFTER', 'text', 2, 6, 'text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found]', 'Text after a delimiter.', (a, f) => textAround(a, f, false), { lift: [0], future: true });
def('TEXTSPLIT', 'text', 2, 6, 'text, col_delimiter, [row_delimiter], [ignore_empty], [match_mode], [pad_with]', 'Split text into an array.', (a, f) => {
  const s = S(a[0], f); if (isErr(s)) return s;
  const list = (v: Value): string[] | CellError => { if (omitted(v)) return []; const m = toMatrix(v, f); if (isErr(m)) return m; const out: string[] = []; for (const x of m.data.flat()) { const t = toStr(x); if (isErr(t)) return t; if (t) out.push(t); } return out; };
  const cd = list(a[1]), rd = list(a[2]); if (isErr(cd)) return cd; if (isErr(rd)) return rd;
  const ign = BO(a[3], false, f), mode = IO(a[4], 0, f); const e = firstErr(ign, mode); if (e) return e;
  if (!cd.length && !rd.length) return ERR.VALUE;
  const pad = omitted(a[5]) ? ERR.NA : scalarOf(a[5], f);
  const esc = (d: string) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const split = (t: string, ds: string[]) => (ds.length ? t.split(new RegExp(ds.map(esc).join('|'), mode === 1 ? 'i' : '')) : [t]);
  let rows = split(s, rd).map(r => split(r, cd));
  if (ign) rows = rows.map(r => r.filter(x => x !== '')).filter(r => r.length);
  if (!rows.length) return ERR.CALC;
  const w = Math.max(...rows.map(r => r.length));
  return new Matrix(rows.map(r => [...r, ...new Array(w - r.length).fill(pad)]));
}, { future: true });

function valueToText(v: Scalar, strict: boolean): string {
  if (v === null) return '';
  if (v instanceof CellError) return v.code;
  if (typeof v === 'string') return strict ? `"${v.replace(/"/g, '""')}"` : v;
  const s = toStr(v); return isErr(s) ? s.code : s;
}
def('VALUETOTEXT', 'text', 1, 2, 'value, [format]', 'Value as text (format 1 = strict).', a => {
  const fm = IO(a[1], 0); if (isErr(fm)) return fm;
  return valueToText(a[0] as Scalar, fm === 1);
}, { lift: [0, 1], future: true });
def('ARRAYTOTEXT', 'text', 1, 2, 'array, [format]', 'Array as text.', (a, f) => {
  const m = toMatrix(a[0], f); if (isErr(m)) return m;
  const fm = IO(a[1], 0, f); if (isErr(fm)) return fm;
  if (fm === 1) return '{' + m.data.map(r => r.map(v => valueToText(v, true)).join(',')).join(';') + '}';
  return m.data.flat().map(v => valueToText(v, false)).join(', ');
}, { future: true });

// Regular expressions (Excel 2024 REGEX* family; JS regex dialect).
function regex(pattern: string, ci: boolean, g = false): RegExp | CellError {
  try { return new RegExp(pattern, (ci ? 'i' : '') + (g ? 'g' : '') + 'u'); } catch { return ERR.VALUE; }
}
def('REGEXTEST', 'text', 2, 3, 'text, pattern, [case_sensitivity]', 'TRUE if text matches a regular expression.', a => {
  const s = S(a[0]), p = S(a[1]), c = IO(a[2], 0); const e = firstErr(s, p, c); if (e) return e;
  const re = regex(p as string, c === 1); return isErr(re) ? re : re.test(s as string);
}, { ...L, future: true });
def('REGEXEXTRACT', 'text', 2, 4, 'text, pattern, [return_mode], [case_sensitivity]', 'Extract text matching a regular expression.', a => {
  const s = S(a[0]), p = S(a[1]), mode = IO(a[2], 0), c = IO(a[3], 0); const e = firstErr(s, p, mode, c); if (e) return e;
  const re = regex(p as string, c === 1, mode === 1); if (isErr(re)) return re;
  if (mode === 1) { const all = [...(s as string).matchAll(re)].map(m => m[0]); return all.length ? Matrix.col(all) : ERR.NA; }
  const m = re.exec(s as string); if (!m) return ERR.NA;
  if (mode === 2) return m.length > 1 ? Matrix.row(m.slice(1).map(x => x ?? '')) : ERR.NA;
  return m[0];
}, { lift: [0, 1, 3], future: true });
def('REGEXREPLACE', 'text', 3, 5, 'text, pattern, replacement, [occurrence], [case_sensitivity]', 'Replace text matching a regular expression.', a => {
  const s = S(a[0]), p = S(a[1]), r = S(a[2]), occ = IO(a[3], 0), c = IO(a[4], 0); const e = firstErr(s, p, r, occ, c); if (e) return e;
  const re = regex(p as string, c === 1, true); if (isErr(re)) return re;
  if (occ === 0) return (s as string).replace(re, r as string);
  const hits = [...(s as string).matchAll(re)];
  const h = (occ as number) > 0 ? hits[(occ as number) - 1] : hits[hits.length + (occ as number)];
  if (!h) return s;
  return (s as string).slice(0, h.index) + (h[0].replace(new RegExp(re.source, re.flags.replace('g', '')), r as string)) + (s as string).slice(h.index! + h[0].length);
}, { ...L, future: true });

export { formatValue };
