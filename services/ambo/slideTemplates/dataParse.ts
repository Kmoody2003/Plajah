// dataParse — pure parsing / formatting / scale maths for the Data slide
// templates. No DOM, no canvas: unit-tested in tests/amboDataTemplates.test.ts.
//
// Data fields are plain text, one row per line:
//   Label, value              "January, 1,240"   "Missions: $12,500"   "Youth — 38%"
//   Label, v1, v2             "Easter, 1,820, 1,510"   (second series)
//   Label<TAB>v1<TAB>v2       pasted from a spreadsheet
//   first row with no numbers = header naming the series ("Month, 2026, 2025")
// Thousands commas are kept ("1,240" is one number) as long as the field
// separator has a space after it or the row uses tabs / semicolons / pipes.

export interface ParsedNumber {
  value: number;
  prefix: string;   // currency sign seen ('$', '€', '£', '¥', '₦', '₹')
  suffix: string;   // '%', or a trailing unit word kept verbatim
  decimals: number; // decimals as written (after k/M expansion → 0..2)
  percent: boolean;
}

export interface DataRow { label: string; values: number[]; raw: string }
export interface DataSet {
  rows: DataRow[];
  /** Series names from a header row (may be empty). */
  series: string[];
  /** Number of value columns the data actually has (max over rows, ≥ 1 when rows exist). */
  width: number;
  /** Prefix / suffix most rows agree on ('$', '%'), for formatting when the template's own unit fields are empty. */
  prefix: string; suffix: string;
  /** Decimals to show (max written, capped at 2). */
  decimals: number;
}

const CURRENCY = /^[$€£¥₦₹₩₱]/;
const MINUS = /[−–—]/g;

/** Parse one number token; null when the token is not numeric. */
export function parseNumber(tok: string): ParsedNumber | null {
  let s = (tok || '').trim().replace(MINUS, '-').replace(/[    ]/g, ' ');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1).trim(); }
  if (s.startsWith('+')) s = s.slice(1).trim();
  let prefix = '';
  const cm = s.match(CURRENCY);
  if (cm) { prefix = cm[0]; s = s.slice(1).trim(); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1).trim(); }
  // number core: digits with optional thousands separators (comma / space / apostrophe) and decimals
  const m = s.match(/^(\d{1,3}(?:[,' ]\d{3})+|\d+)?(?:\.(\d+))?/);
  if (!m || (!m[1] && !m[2])) return null;
  const intPart = (m[1] || '0').replace(/[,' ]/g, '');
  const dec = m[2] || '';
  let value = parseFloat(intPart + (dec ? '.' + dec : ''));
  if (!Number.isFinite(value)) return null;
  let rest = s.slice(m[0].length).trim();
  let decimals = dec.length;
  let suffix = '', percent = false;
  const mult = rest.match(/^(k|K|thousand|m|M|mn|million|b|B|bn|billion)\b/);
  if (mult) {
    const k = mult[1].toLowerCase();
    const f = k.startsWith('k') || k === 'thousand' ? 1e3 : k.startsWith('b') ? 1e9 : 1e6;
    value *= f; decimals = Math.max(0, decimals - Math.round(Math.log10(f)));
    rest = rest.slice(mult[0].length).trim();
  }
  if (rest.startsWith('%')) { percent = true; suffix = '%'; rest = rest.slice(1).trim(); }
  if (!prefix) { const tm = rest.match(CURRENCY); if (tm && rest.length === 1) { prefix = tm[0]; rest = ''; } }
  // A trailing unit word ("meals", "people") is allowed; anything with more digits is not a number.
  if (rest) { if (/\d/.test(rest) || rest.length > 14) return null; if (!suffix) suffix = ' ' + rest; }
  return { value: neg ? -value : value, prefix, suffix, decimals: Math.min(2, decimals), percent };
}

/** First number found in free text ("50000 extended edition" → 50000); null if none. */
export function numberIn(s: string): number | null {
  const direct = parseNumber(s);
  if (direct) return direct.value;
  const m = (s || '').replace(MINUS, '-').match(/[-+]?[$€£¥₦₹]?\s?\d[\d,]*(?:\.\d+)?\s?(?:k|K|m|M|%)?/);
  if (!m) return null;
  const p = parseNumber(m[0]);
  return p ? p.value : null;
}

/** Split a row into cells. */
function cells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(s => s.trim());
  if (line.includes(';')) return line.split(';').map(s => s.trim());
  if (line.includes('|')) return line.split('|').map(s => s.trim()).filter((s, i, a) => s || (i > 0 && i < a.length - 1));
  // Comma with a following space (or end) separates fields; "1,240" stays one number.
  let parts = line.split(/,(?=\s)|,$/).map(s => s.trim());
  if (parts.length === 1 && line.includes(',')) {
    // No spaces at all ("Jan,1200,1050"): split on commas that are not thousands separators.
    parts = line.replace(/(\d),(?=\d{3}(?!\d))/g, '$1\u0001').split(',').map(s => s.replace(/\u0001/g, ',').trim());
  }
  if (parts.length > 1) return parts;
  // "Label: value", "Label — value", "Label - value", "Label = value"
  const sep = line.match(/^(.*?\S)\s*(?::|=|\s[—–-]\s)\s*(\S.*)$/);
  if (sep && parseNumber(sep[2])) return [sep[1], sep[2]];
  // "Label 1,240" — trailing number
  const tail = line.match(/^(.*\S)\s+([-+(]?[$€£¥₦₹]?\s?\d[\d,' ]*(?:\.\d+)?\s?(?:k|K|m|M)?%?\)?)$/);
  if (tail && parseNumber(tail[2])) return [tail[1], tail[2]];
  return [line.trim()];
}

/** Parse a "Label, value[, value2…]" multiline field. Never throws. */
export function parseData(text: string, maxRows = 24): DataSet {
  const out: DataSet = { rows: [], series: [], width: 0, prefix: '', suffix: '', decimals: 0 };
  const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(#|\/\/)/.test(l));
  const pre: Record<string, number> = {}, suf: Record<string, number> = {};
  for (const line of lines) {
    const cs = cells(line);
    // Peel trailing numeric cells; everything before them is the label.
    const nums: ParsedNumber[] = [];
    let i = cs.length - 1;
    while (i >= (cs.length > 1 ? 1 : 0)) {
      const p = parseNumber(cs[i]);
      if (!p) break;
      nums.unshift(p); i--;
    }
    const label = cs.slice(0, i + 1).filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
    if (!nums.length) {
      // Header row: a label column then series names — only before any data.
      if (!out.rows.length && !out.series.length && cs.length >= 2) out.series = cs.slice(1).filter(Boolean).slice(0, 4);
      continue;
    }
    if (out.rows.length >= maxRows) break;
    for (const n of nums) {
      if (n.prefix) pre[n.prefix] = (pre[n.prefix] || 0) + 1;
      if (n.suffix) suf[n.suffix] = (suf[n.suffix] || 0) + 1;
      out.decimals = Math.max(out.decimals, n.decimals);
    }
    out.rows.push({ label: label || `#${out.rows.length + 1}`, values: nums.slice(0, 4).map(n => n.value), raw: line });
  }
  // A header of years ("Month, 2026, 2025") parses as numbers: lift it to series names
  // when the rows below it are not years themselves.
  const isYear = (v: number) => Number.isInteger(v) && v >= 1900 && v <= 2100;
  const h0 = out.rows[0];
  if (h0 && !out.series.length && out.rows.length >= 2 && h0.values.length >= 2 && h0.values.every(isYear) && !/[$€£¥%]/.test(h0.raw)
    && /[a-z]/i.test(h0.label) && !out.rows.slice(1).every(r => r.values.every(isYear))) {
    out.series = h0.values.map(String);
    out.rows.shift();
  }
  out.width = out.rows.reduce((w, r) => Math.max(w, r.values.length), 0);
  const top = (m: Record<string, number>) => { const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e && e[1] * 2 >= out.rows.length ? e[0] : ''; };
  out.prefix = top(pre); out.suffix = top(suf);
  return out;
}

// ── formatting ──────────────────────────────────────────────────────────────

export interface NumFormat { prefix?: string; suffix?: string; decimals?: number; compact?: boolean }

const group = (n: number) => {
  const [i, d] = Math.abs(n).toString().split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
};

/** "1,240", "$12.5k", "38%", "−4". `compact` abbreviates ≥ 10,000. */
export function formatValue(v: number, f: NumFormat = {}): string {
  if (!Number.isFinite(v)) return '—';
  const dec = Math.max(0, Math.min(2, f.decimals ?? 0));
  const a = Math.abs(v);
  let body: string;
  if (f.compact && a >= 10000) {
    const [div, unit] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'k'];
    const q = a / div;
    body = group(+q.toFixed(q >= 100 ? 0 : 1)) + unit;
  } else body = group(+a.toFixed(dec));
  if (dec > 0 && !(f.compact && a >= 10000)) {
    const [i, d = ''] = body.split('.');
    body = i + '.' + d.padEnd(dec, '0');
  }
  return (v < 0 ? '−' : '') + (f.prefix || '') + body + (f.suffix || '');
}

/** Signed change: "+12%" / "−3" / "+$4,200". */
export function formatDelta(cur: number, prev: number, mode: 'percent' | 'difference', f: NumFormat = {}): { text: string; dir: -1 | 0 | 1 } {
  const diff = cur - prev;
  const dir = (Math.abs(diff) < 1e-9 ? 0 : diff > 0 ? 1 : -1) as -1 | 0 | 1;
  const sign = dir > 0 ? '+' : dir < 0 ? '−' : '±';
  if (mode === 'percent' && Math.abs(prev) > 1e-9) {
    const pct = diff / Math.abs(prev) * 100;
    const p = Math.abs(pct);
    return { dir, text: `${sign}${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%` };
  }
  return { dir, text: sign + formatValue(Math.abs(diff), f).replace(/^−/, '') };
}

// ── scales ──────────────────────────────────────────────────────────────────

/** A "nice" axis: round step (1/2/2.5/5 × 10ⁿ), ticks from lo to hi inclusive. */
export function niceScale(min: number, max: number, maxTicks = 5): { lo: number; hi: number; step: number; ticks: number[] } {
  let lo = Math.min(0, min), hi = Math.max(0, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) hi = lo + (Math.abs(lo) || 1);
  const span = hi - lo, raw = span / Math.max(1, maxTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw * .999) || 10 * mag;
  const nlo = Math.floor(lo / step + 1e-9) * step, nhi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = nlo, i = 0; v <= nhi + step * .001 && i < 50; v += step, i++) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : +v.toPrecision(12));
  return { lo: nlo, hi: nhi, step, ticks };
}

/** Decimals a tick step needs (2.5 → 1, 0.25 → 2). */
export function stepDecimals(step: number): number {
  for (let d = 0; d <= 2; d++) if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-6) return d;
  return 2;
}

// ── other field shapes ──────────────────────────────────────────────────────

export interface Milestone { when: string; what: string }
/** "2019, Church planted in the school gym" / "2019 — Planted" / "Spring 2024: New roof". */
export function parseMilestones(text: string, max = 8): Milestone[] {
  const out: Milestone[] = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(#|\/\/)/.test(line)) continue;
    const m = line.match(/^(.*?)\s*(?:\t|\s[—–-]\s|:\s|,\s|\s\|\s)\s*(.+)$/);
    if (m && m[1].length <= 24) out.push({ when: m[1].trim(), what: m[2].trim() });
    else out.push({ when: '', what: line });
    if (out.length >= max) break;
  }
  return out;
}

/** "1 in 4", "3 of 10", "3/4", "25%", "0.25" → a fraction with a display denominator. */
export function parseRatio(s: string): { num: number; den: number; fraction: number } | null {
  const t = (s || '').trim().toLowerCase().replace(/,/g, '');
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:in|of|out of|\/)\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const num = +m[1], den = +m[2];
    if (den > 0 && num >= 0) return { num, den, fraction: Math.min(1, num / den) };
  }
  m = t.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) { const p = Math.min(100, +m[1]); return { num: p, den: 100, fraction: p / 100 }; }
  m = t.match(/^(0?\.\d+|1(?:\.0+)?)$/);
  if (m) { const p = +m[1]; return { num: Math.round(p * 100), den: 100, fraction: p }; }
  return null;
}

/** Match a select value tolerant of case and decoration ("Largest first extended" → 'largest'). */
export function pick<C extends Record<string, RegExp>>(value: string | undefined, choices: C, fallback: keyof C & string): keyof C & string {
  const v = (value || '').toLowerCase();
  for (const [k, re] of Object.entries(choices)) if (re.test(v)) return k;
  return fallback;
}
