// code128 - PURE Code 128 (set B, ASCII 32-126) encoder + SVG renderer for bag tags and shelf labels.
// Set B is enough for "WF-217-2" style tag codes and every USB / phone scanner reads it.
// No DOM, no dependencies. Tests: tests/laundryCore.test.ts.

/** Bar/space widths (6 digits, alternating bar,space,...) for symbols 0..105 (106 entries), then the 7-digit stop. */
const P: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232',
];
const STOP = '2331112';
const START_B = 104;

export const CODE128_PATTERNS = P;
export const isCode128B = (text: string): boolean => /^[\x20-\x7e]{1,80}$/.test(String(text ?? ''));

/** Symbol values for a message (start B, data, checksum). null when it can't be encoded. */
export function code128Symbols(text: string): number[] | null {
  if (!isCode128B(text)) return null;
  const data = Array.from(text).map(c => c.charCodeAt(0) - 32);
  let sum = START_B;
  data.forEach((v, i) => { sum += v * (i + 1); });
  return [START_B, ...data, sum % 103];
}

/** Module widths (bar, space, bar...) for the whole symbol including stop. */
export function code128Widths(text: string): number[] | null {
  const sy = code128Symbols(text); if (!sy) return null;
  return [...sy.map(v => P[v]).join('') + STOP].map(Number);
}

/** Total modules (width) including a 10-module quiet zone each side. */
export const code128Modules = (text: string): number => { const w = code128Widths(text); return w ? w.reduce((a, b) => a + b, 0) + 20 : 0; };

/** Inline SVG (black bars on white) at `height` px with `moduleW` px per module. Returns '' if unencodable. */
export function code128Svg(text: string, o: { height?: number; moduleW?: number; label?: boolean } = {}): string {
  const w = code128Widths(text); if (!w) return '';
  const mw = o.moduleW ?? 2, h = o.height ?? 60, q = 10 * mw;
  const total = w.reduce((a, b) => a + b, 0) * mw + q * 2;
  let x = q; let bars = '';
  w.forEach((n, i) => { if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${n * mw}" height="${h}"/>`; x += n * mw; });
  const esc = text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
  const lab = o.label ? `<text x="${total / 2}" y="${h + 14}" text-anchor="middle" font-family="monospace" font-size="12">${esc}</text>` : '';
  const H = h + (o.label ? 18 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${esc}" width="${total}" height="${H}" viewBox="0 0 ${total} ${H}"><rect width="${total}" height="${H}" fill="#fff"/><g fill="#000">${bars}</g>${lab}</svg>`;
}

/** Decode widths back to text (test helper + sanity check for the table). Returns null on any failure. */
export function code128DecodeWidths(widths: number[]): string | null {
  const s = widths.join('');
  if (!s.endsWith(STOP)) return null;
  const body = s.slice(0, -STOP.length);
  if (body.length % 6) return null;
  const vals: number[] = [];
  for (let i = 0; i < body.length; i += 6) { const idx = P.indexOf(body.slice(i, i + 6)); if (idx < 0) return null; vals.push(idx); }
  if (vals[0] !== START_B || vals.length < 3) return null;
  const check = vals[vals.length - 1]; const data = vals.slice(1, -1);
  let sum = START_B; data.forEach((v, i) => { sum += v * (i + 1); });
  if (sum % 103 !== check) return null;
  return data.map(v => String.fromCharCode(v + 32)).join('');
}
