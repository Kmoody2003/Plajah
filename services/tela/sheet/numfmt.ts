// numfmt — Excel number-format codes → display text, plus input "format guess".
//
// Covers General, digit placeholders (0 # ?), thousands separators and
// scaling commas, percent, scientific (incl. engineering ##0.0E+0), fractions
// (# ?/?, # ??/??, fixed denominators), currency/accounting with _x padding
// and *x fill, quoted/escaped literals, up to four sections (pos;neg;zero;text)
// with [Red]/[ColorN] colours and [<100] conditions, @ text, and dates/times
// (yyyy, mmm, dddd, h, mm, ss, .000, AM/PM, elapsed [h]:mm:ss). US locale.
// Compiled formats are cached, so formatting a 100k-cell viewport is cheap.

import { DAYS, MONTHS, parseDateTime, serialToHMS, serialToYMD, weekday0 } from './dates';
import { numberToText } from './coerce';
import { CellError, type Scalar } from './values';

export interface Formatted {
  text: string;
  color?: string;
  /** Suggested horizontal alignment for General-aligned cells. */
  align: 'left' | 'right' | 'center';
  /** Accounting-style fill: repeat `fill.char` at `fill.index` of `text` to pad the column. */
  fill?: { char: string; index: number };
}

const COLORS: Record<string, string> = { black: '#000000', blue: '#0000FF', cyan: '#00FFFF', green: '#00FF00', magenta: '#FF00FF', red: '#FF0000', white: '#FFFFFF', yellow: '#FFFF00' };
const PALETTE = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080', '#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF', '#000080', '#FF00FF', '#FFFF00', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF', '#00CCFF', '#CCFFFF', '#CCFFCC', '#FFFF99', '#99CCFF', '#FF99CC', '#CC99FF', '#FFCC99', '#3366FF', '#33CCCC', '#99CC00', '#FFCC00', '#FF9900', '#FF6600', '#666699', '#969696', '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333'];

type Tok =
  | { t: 'lit'; s: string }
  | { t: 'digit'; c: '0' | '#' | '?' }
  | { t: 'point' } | { t: 'comma' } | { t: 'percent' } | { t: 'slash' }
  | { t: 'exp'; plus: boolean }
  | { t: 'text' }
  | { t: 'fill'; c: string }
  | { t: 'pad'; c: string }
  | { t: 'date'; s: string }
  | { t: 'ampm'; s: string }
  | { t: 'elapsed'; u: 'h' | 'm' | 's'; n: number }
  | { t: 'subsec'; n: number }
  | { t: 'general' };

interface Section {
  toks: Tok[];
  color?: string;
  cond?: { op: string; v: number };
  kind: 'number' | 'date' | 'text' | 'general';
}
interface Compiled { sections: Section[]; isDate: boolean; isText: boolean; hasConds: boolean }

const cache = new Map<string, Compiled>();

function splitSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = '', q = false, br = false;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (q) { cur += c; if (c === '"') q = false; continue; }
    if (c === '\\' && i + 1 < fmt.length) { cur += c + fmt[++i]; continue; }
    if (c === '"') q = true;
    if (c === '[') br = true; else if (c === ']') br = false;
    if (c === ';' && !br) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function compileSection(src: string): Section {
  const toks: Tok[] = [];
  const sec: Section = { toks, kind: 'number' };
  let i = 0;
  const lower = src.toLowerCase();
  let hasDate = false, hasDigits = false, hasText = false;
  while (i < src.length) {
    const c = src[i], lc = lower[i];
    if (c === '"') { let j = i + 1; while (j < src.length && src[j] !== '"') j++; toks.push({ t: 'lit', s: src.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === '\\') { toks.push({ t: 'lit', s: src[i + 1] ?? '' }); i += 2; continue; }
    if (c === '_') { toks.push({ t: 'pad', c: src[i + 1] ?? ' ' }); i += 2; continue; }
    if (c === '*') { toks.push({ t: 'fill', c: src[i + 1] ?? ' ' }); i += 2; continue; }
    if (c === '[') {
      const j = src.indexOf(']', i);
      const body = j < 0 ? src.slice(i + 1) : src.slice(i + 1, j);
      const lb = body.toLowerCase();
      i = j < 0 ? src.length : j + 1;
      if (COLORS[lb]) { sec.color = COLORS[lb]; continue; }
      const cm = /^color\s*(\d+)$/.exec(lb);
      if (cm) { sec.color = PALETTE[Number(cm[1]) - 1] ?? '#000000'; continue; }
      const cond = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+(?:e[-+]?\d+)?)$/.exec(lb);
      if (cond) { sec.cond = { op: cond[1], v: Number(cond[2]) }; continue; }
      if (/^h+$/.test(lb)) { toks.push({ t: 'elapsed', u: 'h', n: lb.length }); hasDate = true; continue; }
      if (/^m+$/.test(lb)) { toks.push({ t: 'elapsed', u: 'm', n: lb.length }); hasDate = true; continue; }
      if (/^s+$/.test(lb)) { toks.push({ t: 'elapsed', u: 's', n: lb.length }); hasDate = true; continue; }
      if (lb.startsWith('$')) { const sym = body.slice(1).split('-')[0]; if (sym) toks.push({ t: 'lit', s: sym }); continue; }
      continue; // locale / DBNum etc. — ignored
    }
    if (lower.startsWith('general', i)) { toks.push({ t: 'general' }); i += 7; continue; }
    if (lower.startsWith('am/pm', i)) { toks.push({ t: 'ampm', s: src.slice(i, i + 5) }); i += 5; hasDate = true; continue; }
    if (lower.startsWith('a/p', i)) { toks.push({ t: 'ampm', s: src.slice(i, i + 3) }); i += 3; hasDate = true; continue; }
    if (lc === 'y' || lc === 'd' || lc === 'h' || lc === 's' || lc === 'e' && hasDate || lc === 'm') {
      let j = i; while (j < src.length && lower[j] === lc) j++;
      const run = lower.slice(i, j);
      // A digit placeholder before "e" makes it scientific, not a date "e".
      if (lc === 'e') { toks.push({ t: 'date', s: 'yyyy' }); i = j; continue; }
      toks.push({ t: 'date', s: run });
      hasDate = true; i = j; continue;
    }
    if ((c === 'E' || c === 'e') && (src[i + 1] === '+' || src[i + 1] === '-')) { toks.push({ t: 'exp', plus: src[i + 1] === '+' }); i += 2; continue; }
    if (c === '0' || c === '#' || c === '?') {
      // Sub-second ".0" after a seconds token.
      const prev = toks[toks.length - 1];
      if (c === '0' && prev?.t === 'point' && toks.some(t => t.t === 'date' && t.s.startsWith('s') || t.t === 'elapsed' && t.u === 's')) {
        let j = i; while (src[j] === '0') j++;
        toks.pop(); toks.push({ t: 'subsec', n: j - i }); i = j; continue;
      }
      toks.push({ t: 'digit', c }); hasDigits = true; i++; continue;
    }
    if (c === '.') { toks.push({ t: 'point' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    if (c === '%') { toks.push({ t: 'percent' }); i++; continue; }
    if (c === '/' && hasDigits && !hasDate) { toks.push({ t: 'slash' }); i++; continue; }
    if (c === '@') { toks.push({ t: 'text' }); hasText = true; i++; continue; }
    if (/[1-9]/.test(c) && toks.some(t => t.t === 'slash')) {
      // Fixed denominator: "# ?/8".
      let j = i; while (/\d/.test(src[j] ?? '')) j++;
      toks.push({ t: 'lit', s: '\u0000den' + src.slice(i, j) }); i = j; continue;
    }
    toks.push({ t: 'lit', s: c }); i++;
  }
  if (toks.length === 1 && toks[0].t === 'general') sec.kind = 'general';
  else if (hasDate) sec.kind = 'date';
  else if (hasText && !hasDigits) sec.kind = 'text';
  else if (!hasDigits && toks.some(t => t.t === 'general')) sec.kind = 'general';
  // Date tokens that are really minutes: m/mm right after an hour or right before seconds.
  if (sec.kind === 'date') {
    const idx = toks.map((t, k) => (t.t === 'date' || t.t === 'elapsed' ? k : -1)).filter(k => k >= 0);
    for (let n = 0; n < idx.length; n++) {
      const t = toks[idx[n]] as { t: 'date'; s: string };
      if (t.t !== 'date' || (t.s !== 'm' && t.s !== 'mm')) continue;
      const prev = n > 0 ? toks[idx[n - 1]] : null;
      const next = n + 1 < idx.length ? toks[idx[n + 1]] : null;
      const isHour = (x: Tok | null) => !!x && ((x.t === 'date' && x.s.startsWith('h')) || (x.t === 'elapsed' && x.u === 'h'));
      const isSec = (x: Tok | null) => !!x && ((x.t === 'date' && x.s.startsWith('s')) || (x.t === 'elapsed' && x.u === 's'));
      if (isHour(prev) || isSec(next)) toks[idx[n]] = { t: 'date', s: t.s === 'm' ? 'M' : 'MM' };
    }
  }
  return sec;
}

export function compileFormat(fmt: string): Compiled {
  let c = cache.get(fmt);
  if (c) return c;
  const parts = splitSections(fmt || 'General');
  const sections = parts.map(compileSection);
  c = { sections, isDate: sections[0].kind === 'date', isText: sections[0].kind === 'text', hasConds: sections.some(s => !!s.cond) };
  if (cache.size > 2000) cache.clear();
  cache.set(fmt, c);
  return c;
}

export const isDateFormat = (fmt: string | undefined) => !!fmt && compileFormat(fmt).isDate;
export const isTextFormat = (fmt: string | undefined) => !!fmt && compileFormat(fmt).isText;

// ── General ──────────────────────────────────────────────────────────────────

/** General format at a column's character budget (Excel shows ~11 chars in a default column). */
export function formatGeneral(n: number, maxChars = 11): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const a = Math.abs(n);
  const neg = n < 0 ? 1 : 0;
  const plain = numberToText(n);
  if (plain.length <= maxChars && !plain.includes('E')) return plain;
  if (a >= 1e-4 && a < 10 ** (maxChars - neg)) {
    const intDigits = Math.max(1, Math.floor(Math.log10(a)) + 1);
    const dec = Math.max(0, maxChars - neg - intDigits - 1);
    let s = n.toFixed(Math.min(dec, 20));
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s.length <= maxChars) return s;
  }
  // Scientific with as many mantissa digits as fit.
  for (let d = Math.max(0, maxChars - 6 - neg); d >= 0; d--) {
    const [m, e] = n.toExponential(d).split('e');
    const mant = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
    const ex = Number(e);
    const s = `${mant}E${ex < 0 ? '-' : '+'}${String(Math.abs(ex)).padStart(2, '0')}`;
    if (s.length <= maxChars || d === 0) return s;
  }
  return plain;
}

// ── Number sections ──────────────────────────────────────────────────────────

const roundTo = (x: number, d: number) => {
  const p = Math.pow(10, d);
  return Math.round(Number((x * p).toPrecision(15))) / p;
};

function groupThousands(s: string) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function formatNumberSection(x: number, sec: Section): { text: string; fill?: { char: string; index: number } } {
  const toks = sec.toks;
  let pct = 0;
  for (const t of toks) if (t.t === 'percent') pct++;
  x *= Math.pow(100, pct);
  const expIdx = toks.findIndex(t => t.t === 'exp');
  const slashIdx = toks.findIndex(t => t.t === 'slash');
  // Scaling commas: a comma (or run) right after the last digit placeholder of the mantissa.
  const mantEnd = expIdx >= 0 ? expIdx : toks.length;
  let lastDigit = -1; for (let k = 0; k < mantEnd; k++) if (toks[k].t === 'digit') lastDigit = k;
  let scale = 0;
  for (let k = lastDigit + 1; k < mantEnd && toks[k].t === 'comma'; k++) scale++;
  if (lastDigit >= 0 && toks.slice(lastDigit + 1, mantEnd).some(t => t.t === 'point')) scale = 0;
  x /= Math.pow(1000, scale);
  const pointIdx = toks.findIndex((t, k) => t.t === 'point' && k < mantEnd);
  const intEnd = pointIdx >= 0 ? pointIdx : mantEnd;
  const intToks = toks.slice(0, intEnd);
  const thousands = intToks.some((t, k) => t.t === 'comma' && intToks.slice(0, k).some(q => q.t === 'digit') && intToks.slice(k + 1).some(q => q.t === 'digit'));

  if (slashIdx >= 0) return { text: formatFraction(x, toks, slashIdx) };

  const fracToks = pointIdx >= 0 ? toks.slice(pointIdx + 1, mantEnd) : [];
  const decimals = fracToks.filter(t => t.t === 'digit').length;
  let exponent = 0;
  if (expIdx >= 0) {
    const intPh = intToks.filter(t => t.t === 'digit').length || 1;
    if (x !== 0) {
      const e10 = Math.floor(Math.log10(Math.abs(x)));
      if (intPh > 1 && intToks.some(t => t.t === 'digit' && t.c === '#')) exponent = Math.floor(e10 / intPh) * intPh;
      else exponent = e10 - (intPh - 1);
      x /= Math.pow(10, exponent);
      if (roundTo(Math.abs(x), decimals) >= Math.pow(10, intPh) && !(intPh > 1 && intToks.some(t => t.t === 'digit' && t.c === '#'))) { x /= 10; exponent += 1; }
    }
  }
  const r = roundTo(Math.abs(x), decimals);
  let intStr = Math.floor(r).toFixed(0);
  let fracStr = decimals ? (r - Math.floor(r)).toFixed(decimals).slice(2) : '';
  if (fracStr.length > decimals) fracStr = fracStr.slice(0, decimals);
  if (/e/.test(intStr)) intStr = BigInt(Math.floor(r)).toString();
  // Integer placeholders.
  const intPh = intToks.filter(t => t.t === 'digit') as { t: 'digit'; c: string }[];
  const zeros = intPh.length - intPh.findIndex(p => p.c === '0');
  const minDigits = intPh.findIndex(p => p.c === '0') >= 0 ? zeros : 0;
  if (intStr === '0' && minDigits === 0) intStr = '';
  while (intStr.length < minDigits) intStr = '0' + intStr;
  if (thousands) intStr = groupThousands(intStr);
  // Lay out the integer part right-to-left through its tokens.
  let out = '';
  let fill: { char: string; index: number } | undefined;
  const intOut: string[] = [];
  let digitsLeft = intStr;
  const phCount = intPh.length;
  let phSeen = 0;
  for (let k = intToks.length - 1; k >= 0; k--) {
    const t = intToks[k];
    if (t.t === 'digit') {
      phSeen++;
      if (phSeen === phCount) { intOut.push(digitsLeft || (t.c === '?' ? ' ' : '')); digitsLeft = ''; }
      else if (digitsLeft.length) {
        let take = 1;
        if (thousands && digitsLeft.length >= 2 && digitsLeft[digitsLeft.length - 2] === ',') take = 2;
        intOut.push(digitsLeft.slice(-take)); digitsLeft = digitsLeft.slice(0, -take);
      } else intOut.push(t.c === '?' ? ' ' : '');
    } else if (t.t === 'lit') intOut.push(t.s);
    else if (t.t === 'pad') intOut.push(' ');
    else if (t.t === 'fill') intOut.push('\u0001' + t.c);
    else if (t.t === 'percent') intOut.push('%');
    else if (t.t === 'text') intOut.push('');
  }
  // A number section without digit placeholders shows only its literals ("[<10]\"small\"").
  out = intOut.reverse().join('');
  if (pointIdx >= 0) {
    // Decimal point is dropped only when every decimal placeholder is '#' and nothing is shown.
    let frac = '';
    let di = 0;
    const trimmed = fracStr.split('');
    // Strip trailing zeros for '#'/'?' placeholders.
    const phs = fracToks.filter(t => t.t === 'digit') as { t: 'digit'; c: string }[];
    for (let k = phs.length - 1; k >= 0; k--) {
      if (trimmed[k] !== '0') break;
      if (phs[k].c === '#') trimmed[k] = '';
      else if (phs[k].c === '?') trimmed[k] = ' ';
      else break;
    }
    for (const t of fracToks) {
      if (t.t === 'digit') frac += trimmed[di++] ?? '';
      else if (t.t === 'lit') frac += t.s;
      else if (t.t === 'pad') frac += ' ';
      else if (t.t === 'percent') frac += '%';
      else if (t.t === 'fill') frac += '\u0001' + t.c;
      else if (t.t === 'comma') frac += '';
    }
    out += '.' + frac;
  }
  if (expIdx >= 0) {
    const et = toks[expIdx] as { t: 'exp'; plus: boolean };
    const after = toks.slice(expIdx + 1);
    const eDigits = after.filter(t => t.t === 'digit').length;
    const es = String(Math.abs(exponent)).padStart(eDigits, '0');
    out += 'E' + (exponent < 0 ? '-' : et.plus ? '+' : '') + es;
    for (const t of after) if (t.t === 'lit') out += t.s; else if (t.t === 'pad') out += ' ';
  } else {
    for (const t of toks.slice(mantEnd)) if (t.t === 'lit') out += t.s;
  }
  const fi = out.indexOf('\u0001');
  if (fi >= 0) { fill = { char: out[fi + 1], index: fi }; out = out.slice(0, fi) + out.slice(fi + 2); }
  return { text: out, fill };
}

function bestFraction(x: number, maxDen: number): [number, number] {
  let bestN = 0, bestD = 1, bestErr = Math.abs(x);
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    const err = Math.abs(x - n / d);
    if (err < bestErr - 1e-12) { bestErr = err; bestN = n; bestD = d; if (err === 0) break; }
  }
  return [bestN, bestD];
}

function formatFraction(x: number, toks: Tok[], slashIdx: number): string {
  const abs = Math.abs(x);
  // Numerator run = contiguous digit tokens immediately before the slash.
  let numStart = slashIdx; while (numStart > 0 && toks[numStart - 1].t === 'digit') numStart--;
  const numPh = slashIdx - numStart;
  const before = toks.slice(0, numStart);
  const hasInt = before.some(t => t.t === 'digit');
  const after = toks.slice(slashIdx + 1);
  let denPh = 0, fixedDen = 0;
  for (const t of after) { if (t.t === 'digit') denPh++; else if (t.t === 'lit' && t.s.startsWith('\u0000den')) fixedDen = Number(t.s.slice(4)); else if (denPh || fixedDen) break; }
  const whole = hasInt ? Math.floor(abs) : 0;
  const rem = abs - whole;
  let n: number, d: number;
  if (fixedDen) { d = fixedDen; n = Math.round(rem * d); }
  else [n, d] = bestFraction(rem, Math.pow(10, Math.max(1, denPh)) - 1);
  let w = whole;
  if (n === d && d) { w += 1; n = 0; }
  const intPart = hasInt ? (w === 0 && n !== 0 && !before.some(t => t.t === 'digit' && t.c === '0') ? '' : String(w)) : '';
  let lead = '';
  for (const t of before) if (t.t === 'lit') lead += t.s; else if (t.t === 'pad') lead += ' ';
  const sep = lead.endsWith(' ') ? '' : intPart ? ' ' : '';
  if (n === 0 && hasInt) {
    // Whole number: pad the fraction area with spaces like Excel.
    return (intPart || '0') + ' '.repeat(numPh + 1 + Math.max(denPh, String(fixedDen || '').length) + (sep ? 1 : 0));
  }
  const ns = String(n).padStart(numPh, ' ');
  const ds = String(d).padEnd(denPh, ' ');
  let trail = '';
  let seenDen = false;
  for (const t of after) { if (t.t === 'digit' || (t.t === 'lit' && t.s.startsWith('\u0000den'))) { seenDen = true; continue; } if (seenDen && t.t === 'lit') trail += t.s; }
  // Literals before the integer placeholder stay; the separator after it shows as a space even when the integer is blank (Excel: " 1/2").
  return lead.replace(/ $/, '') + intPart + (sep || lead.endsWith(' ') || intPart ? ' ' : '') + ns + '/' + ds + trail;
}

// ── Dates ────────────────────────────────────────────────────────────────────

function formatDateSection(serial: number, sec: Section): string {
  const subsecDigits = Math.max(0, ...sec.toks.map(t => (t.t === 'subsec' ? t.n : 0)));
  // Round to the displayed precision first (Excel rounds, never truncates, seconds).
  const unit = 86400 * Math.pow(10, subsecDigits);
  let s = Math.round(serial * unit) / unit;
  const hasAmPm = sec.toks.some(t => t.t === 'ampm');
  const { y, m, d } = serialToYMD(s);
  const t = serialToHMS(s);
  const totalSec = s * 86400;
  let out = '';
  for (const tok of sec.toks) {
    switch (tok.t) {
      case 'lit': out += tok.s.startsWith('\u0000den') ? tok.s.slice(4) : tok.s; break;
      case 'pad': out += ' '; break;
      case 'fill': break;
      case 'point': out += '.'; break;
      case 'comma': out += ','; break;
      case 'percent': out += '%'; break;
      case 'slash': out += '/'; break;
      case 'digit': out += tok.c === '0' ? '0' : ''; break;
      case 'text': break;
      case 'general': break;
      case 'subsec': out += '.' + String(Math.floor((s * 86400 - Math.floor(s * 86400 + 1e-9)) * Math.pow(10, tok.n) + 0.5)).padStart(tok.n, '0').slice(0, tok.n); break;
      case 'elapsed': {
        const v = tok.u === 'h' ? Math.floor(totalSec / 3600 + 1e-9) : tok.u === 'm' ? Math.floor(totalSec / 60 + 1e-9) : Math.floor(totalSec + 1e-9);
        out += String(v).padStart(tok.n, '0');
        break;
      }
      case 'ampm': {
        const pm = t.h >= 12;
        const low = tok.s.toLowerCase();
        if (low === 'am/pm') out += tok.s[0] === 'a' ? (pm ? 'pm' : 'am') : pm ? 'PM' : 'AM';
        else out += tok.s[0] === 'a' ? (pm ? 'p' : 'a') : pm ? 'P' : 'A';
        break;
      }
      case 'date': {
        const k = tok.s;
        if (k === 'M' || k === 'MM') { out += k === 'MM' ? String(t.mi).padStart(2, '0') : String(t.mi); break; }
        if (k[0] === 'y') { out += k.length <= 2 ? String(y % 100).padStart(2, '0') : String(y); break; }
        if (k[0] === 'm') {
          if (k.length === 1) out += String(m);
          else if (k.length === 2) out += String(m).padStart(2, '0');
          else if (k.length === 3) out += MONTHS[m - 1].slice(0, 3);
          else if (k.length === 5) out += MONTHS[m - 1][0];
          else out += MONTHS[m - 1];
          break;
        }
        if (k[0] === 'd') {
          if (k.length === 1) out += String(d);
          else if (k.length === 2) out += String(d).padStart(2, '0');
          else if (k.length === 3) out += DAYS[weekday0(s)].slice(0, 3);
          else out += DAYS[weekday0(s)];
          break;
        }
        if (k[0] === 'h') {
          let h = t.h;
          if (hasAmPm) { h = h % 12; if (h === 0) h = 12; }
          out += k.length >= 2 ? String(h).padStart(2, '0') : String(h);
          break;
        }
        if (k[0] === 's') { out += k.length >= 2 ? String(t.s).padStart(2, '0') : String(t.s); break; }
        break;
      }
      default: break;
    }
  }
  return out;
}

function formatTextSection(text: string, sec: Section): string {
  let out = '';
  for (const t of sec.toks) {
    if (t.t === 'text') out += text;
    else if (t.t === 'lit') out += t.s;
    else if (t.t === 'pad') out += ' ';
  }
  return out;
}

const condTest = (c: { op: string; v: number }, x: number) => {
  switch (c.op) { case '<': return x < c.v; case '<=': return x <= c.v; case '>': return x > c.v; case '>=': return x >= c.v; case '=': return x === c.v; default: return x !== c.v; }
};

/**
 * Format a cell value for display. `maxChars` bounds General output (pass the
 * column's character width; default fits a standard column).
 */
export function formatValue(v: Scalar, fmt?: string, maxChars = 11): Formatted {
  if (v === null) return { text: '', align: 'left' };
  if (v instanceof CellError) return { text: v.code, align: 'center' };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', align: 'center' };
  const c = compileFormat(fmt || 'General');
  if (typeof v === 'string') {
    const ts = c.sections[3] ?? c.sections.find(s => s.kind === 'text');
    if (ts) return { text: formatTextSection(v, ts), color: ts.color, align: 'left' };
    return { text: v, align: 'left' };
  }
  // Pick the numeric section.
  let sec: Section, signed = false;
  const S = c.sections;
  const numericSections = S.filter(s => s.kind !== 'text');
  if (c.hasConds) {
    if (S[0].cond && condTest(S[0].cond, v)) sec = S[0];
    else if (S[1] && S[1].kind !== 'text' && (!S[1].cond || condTest(S[1].cond, v)) && (S[1].cond || S.length > 2)) sec = S[1];
    else sec = S[2] && S[2].kind !== 'text' ? S[2] : S[1]?.kind !== 'text' && S[1] ? S[1] : S[0];
    signed = v < 0 && !(sec.cond && sec.cond.op.startsWith('<'));
  } else if (numericSections.length <= 1 || S.length === 1) { sec = S[0]; signed = v < 0; }
  else if (v > 0 || (v === 0 && S.length < 3)) sec = S[0];
  else if (v < 0) sec = S[1];
  else sec = S[2] && S[2].kind !== 'text' ? S[2] : S[0];
  if (sec.kind === 'text') { sec = S[0]; signed = v < 0; }
  if (sec.kind === 'general') {
    const gt = formatGeneral(signed ? v : Math.abs(v) * (sec === S[0] && v < 0 ? -1 : 1), maxChars);
    return { text: sec.toks.length > 1 ? formatTextSection(gt, { ...sec, toks: sec.toks.map(t => (t.t === 'general' ? { t: 'text' } as Tok : t)) }) : gt, color: sec.color, align: 'right' };
  }
  if (sec.kind === 'date') {
    if (v < 0 || v > 2958465.99999) return { text: '#'.repeat(Math.min(maxChars, 11)), align: 'right' };
    return { text: formatDateSection(v, sec), color: sec.color, align: 'right' };
  }
  const r = formatNumberSection(Math.abs(v), sec);
  let text = r.text;
  if (signed) text = '-' + text; // Excel keeps the sign of tiny negatives: -0.001 → "-0.00"
  return { text, color: sec.color, align: 'right', fill: r.fill ? { char: r.fill.char, index: r.fill.index + (text.length - r.text.length) } : undefined };
}

/** TEXT(): like formatValue but General keeps full precision and no fill padding. */
export function textFunction(v: Scalar, fmt: string): string {
  if (typeof v === 'number' && /^general$/i.test(fmt.trim())) return formatGeneral(v, 11);
  const f = formatValue(v, fmt, 255);
  return f.text;
}

// ── Format guessing for typed input ──────────────────────────────────────────

export type Guess =
  | { kind: 'number'; value: number; numFmt?: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'error'; code: string }
  | { kind: 'text'; value: string }
  | { kind: 'formula'; formula: string }
  | { kind: 'blank' };

/**
 * Interpret what a user typed into a cell: "=..." formulas, "'" text escape,
 * TRUE/FALSE, error literals, "$1,200" → 1200 "$#,##0", "12%" → 0.12 "0%",
 * "1.5e3", "(42)" → -42, "1 1/2" → 1.5 "# ?/?", dates and times → serials with
 * a matching format. `currentFmt` keeps a text-formatted (@) cell as text.
 */
export function guessInput(raw: string, currentFmt?: string): Guess {
  if (raw === '') return { kind: 'blank' };
  if (currentFmt && isTextFormat(currentFmt)) return { kind: 'text', value: raw };
  if (raw.startsWith("'")) return { kind: 'text', value: raw.slice(1) };
  if (raw.startsWith('=') && raw.length > 1) return { kind: 'formula', formula: raw.slice(1) };
  const s = raw.trim();
  const up = s.toUpperCase();
  if (up === 'TRUE' || up === 'FALSE') return { kind: 'bool', value: up === 'TRUE' };
  if (/^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!)$/.test(up)) return { kind: 'error', code: up };
  let m: RegExpExecArray | null;
  // Plain number.
  if ((m = /^([-+]?)(\d+\.?\d*|\.\d+)$/.exec(s))) return { kind: 'number', value: Number(s) };
  if ((m = /^\((\d+\.?\d*|\.\d+)\)$/.exec(s))) return { kind: 'number', value: -Number(m[1]) };
  // Scientific.
  if (/^[-+]?(\d+\.?\d*|\.\d+)[eE][-+]?\d+$/.test(s)) return { kind: 'number', value: Number(s), numFmt: '0.00E+00' };
  // Thousands.
  if ((m = /^([-+]?)(\d{1,3}(,\d{3})+)(\.\d*)?$/.exec(s))) {
    const v = Number(s.replace(/,/g, ''));
    return { kind: 'number', value: v, numFmt: m[4] && m[4].length > 1 ? '#,##0.00' : '#,##0' };
  }
  // Percent.
  if ((m = /^([-+]?)(\d+\.?\d*|\.\d+|\d{1,3}(,\d{3})+(\.\d*)?)\s*%$/.exec(s))) {
    const body = m[2].replace(/,/g, '');
    const dec = body.includes('.') ? body.split('.')[1].length : 0;
    return { kind: 'number', value: Number(m[1] + body) / 100, numFmt: dec ? '0.' + '0'.repeat(Math.min(dec, 10)) + '%' : '0%' };
  }
  // Currency: $1,200.50  -$5  ($5)  $-5
  if ((m = /^(\(?)([-+]?)\$\s*([-+]?)(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?(\)?)$/.exec(s)) && (m[4] || m[6]) && (m[1] === '(') === (m[7] === ')')) {
    let v = Number(((m[4] ?? '0').replace(/,/g, '')) + (m[6] ?? ''));
    if (m[1] === '(' || m[2] === '-' || m[3] === '-') v = -v;
    return { kind: 'number', value: v, numFmt: m[6] ? '"$"#,##0.00' : '"$"#,##0' };
  }
  // Mixed fraction "1 1/2" / "0 3/4".
  if ((m = /^([-+]?)(\d+)\s+(\d+)\/(\d+)$/.exec(s)) && Number(m[4]) > 0 && Number(m[3]) < Number(m[4])) {
    const v = Number(m[2]) + Number(m[3]) / Number(m[4]);
    return { kind: 'number', value: m[1] === '-' ? -v : v, numFmt: Number(m[4]) > 9 ? '# ??/??' : '# ?/?' };
  }
  // Dates / times.
  const d = parseDateTime(s);
  if (d) {
    const fmt = d.hasDate && d.hasTime ? 'm/d/yyyy h:mm' : d.kind.includes('AM/PM') ? d.kind.replace(/^.* (h:mm)/, '$1') : d.kind;
    return { kind: 'number', value: d.serial, numFmt: d.hasDate && !d.hasTime ? dateKindFmt(d.kind) : fmt };
  }
  return { kind: 'text', value: raw };
}
function dateKindFmt(kind: string) {
  switch (kind) {
    case 'yyyy-mm-dd': return 'yyyy-mm-dd';
    case 'yyyy/m/d': return 'yyyy/m/d';
    case 'd-mmm': return 'd-mmm';
    case 'd-mmm-yy': return 'd-mmm-yy';
    case 'mmm-yy': return 'mmm-yy';
    case 'mmmm d, yyyy': return 'mmmm d, yyyy';
    default: return 'm/d/yyyy';
  }
}

/** Built-in OOXML numFmtId → code (the implicit ones xlsx files reference by id). */
export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
};
