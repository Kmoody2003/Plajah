// color — tiny colour toolkit for paint and procedural art (parse, mix, tint, OKLab-ish
// perceptual mixing for gradients and atmospheric perspective). No dependencies.

export interface RGBA { r: number; g: number; b: number; a: number }

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff',
  gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a', navy: '#000080', teal: '#008080',
  silver: '#c0c0c0', maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff', gold: '#ffd700', transparent: '#00000000',
};

export function parseColor(s: string): RGBA {
  const t = s.trim().toLowerCase(); if (NAMED[t]) return parseColor(NAMED[t]);
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) { const v = h.split('').map(c => parseInt(c + c, 16)); return { r: v[0], g: v[1], b: v[2], a: h.length === 4 ? v[3] / 255 : 1 }; }
    const v = [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16)); return { r: v[0], g: v[1], b: v[2], a: h.length === 8 ? v[3] / 255 : 1 };
  }
  m = /^rgba?\(([^)]*)\)$/.exec(t);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x, i) => x.endsWith('%') ? parseFloat(x) * (i < 3 ? 2.55 : .01) : parseFloat(x)); return { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p[3] ?? 1 }; }
  m = /^hsla?\(([^)]*)\)$/.exec(t);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); const [r, g, b] = hsl(p[0] ?? 0, (p[1] ?? 0) / 100, (p[2] ?? 0) / 100); return { r, g, b, a: p[3] ?? 1 }; }
  return { r: 0, g: 0, b: 0, a: 1 };
}
function hsl(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
export const toHex = (c: RGBA): string => '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const toCss = (c: RGBA): string => c.a >= 1 ? toHex(c) : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.round(c.a * 1000) / 1000})`;

const lin = (v: number) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
const gam = (v: number) => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055);
/** OKLab (Björn Ottosson, public domain) — perceptual mixing without muddy midpoints. */
export function toOklab(c: RGBA): [number, number, number] {
  const r = lin(c.r), g = lin(c.g), b = lin(c.b);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
export function fromOklab(L: number, A: number, B: number, a = 1): RGBA {
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3, m = (L - .1055613458 * A - .0638541728 * B) ** 3, s = (L - .0894841775 * A - 1.291485548 * B) ** 3;
  return { r: gam(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s), g: gam(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s), b: gam(-.0041960863 * l - .7034186147 * m + 1.707614701 * s), a };
}
/** Perceptual mix of two colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const A = parseColor(a), B = parseColor(b); const la = toOklab(A), lb = toOklab(B);
  return toCss(fromOklab(la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t, A.a + (B.a - A.a) * t));
}
/** Lighten (+) / darken (−) in OKLab lightness, keeping hue. */
export function shade(c: string, amount: number): string { const A = parseColor(c); const [L, a, b] = toOklab(A); return toCss(fromOklab(Math.max(0, Math.min(1, L + amount)), a, b, A.a)); }
/** Rotate hue / scale chroma in OKLab (warm/cool shifts for painterly light). */
export function hueShift(c: string, deg: number, chroma = 1): string {
  const A = parseColor(c); const [L, a, b] = toOklab(A); const h = Math.atan2(b, a) + deg * Math.PI / 180, C = Math.hypot(a, b) * chroma;
  return toCss(fromOklab(L, C * Math.cos(h), C * Math.sin(h), A.a));
}
export const withAlpha = (c: string, a: number) => { const A = parseColor(c); return toCss({ ...A, a }); };
export const luminance = (c: string) => { const A = parseColor(c); return .2126 * lin(A.r) + .7152 * lin(A.g) + .0722 * lin(A.b); };
