// raster/colorMath — small, exact colour-space helpers shared by adjustments, selections,
// gradients and colour management. All inputs/outputs are 0..1 floats unless noted.

import { srgbToLinear, linearToSrgb } from './buffer';

export function rgbToHsl(r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  out[0] = h; out[1] = s; out[2] = l; return out;
}
const hue2 = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
export function hslToRgb(h: number, s: number, l: number, out: number[] = [0, 0, 0]): number[] {
  if (s <= 0) { out[0] = out[1] = out[2] = l; return out; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, hh = (((h % 360) + 360) % 360) / 360;
  out[0] = hue2(p, q, hh + 1 / 3); out[1] = hue2(p, q, hh); out[2] = hue2(p, q, hh - 1 / 3); return out;
}
export function rgbToHsv(r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-9) { h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  out[0] = h; out[1] = mx > 0 ? d / mx : 0; out[2] = mx; return out;
}
export function hsvToRgb(h: number, s: number, v: number, out: number[] = [0, 0, 0]): number[] {
  const hh = ((((h % 360) + 360) % 360) / 60), i = Math.floor(hh), f = hh - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; out[0] = m[0]; out[1] = m[1]; out[2] = m[2]; return out;
}

// ── OKLab (perceptual gradient interpolation, colour-range distance) ────────
export function srgbToOklab(r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  out[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s; return out;
}
export function oklabToSrgb(L: number, a: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const c = (v: number) => Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, v)))));
  out[0] = c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[1] = c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[2] = c(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s); return out;
}

// ── CIE Lab (D65 → D50 not needed: colour range uses Lab D65) ───────────────
const finv = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
export function srgbToLab(r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B, Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const fx = finv(X), fy = finv(Y), fz = finv(Z);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz); return out;
}
export function labToSrgb(L: number, a: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const f = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = f(fx) * 0.95047, Y = f(fy), Z = f(fz) * 1.08883;
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z, B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const c = (v: number) => Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, v)))));
  out[0] = c(R); out[1] = c(G); out[2] = c(B); return out;
}

// ── sRGB ↔ Display-P3 (same D65 white + transfer curve; 3×3 in linear light) ─
export const SRGB_TO_P3 = [0.8224621, 0.177538, 0.0, 0.0331941, 0.9668058, 0.0, 0.0170827, 0.0723974, 0.9105199];
export const P3_TO_SRGB = [1.2249401, -0.2249404, 0.0, -0.0420569, 1.0420571, 0.0, -0.0196376, -0.0786361, 1.0982735];
export function convertGamut(r: number, g: number, b: number, m: number[], out: number[] = [0, 0, 0]): number[] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  out[0] = linearToSrgb(Math.min(1, Math.max(0, m[0] * R + m[1] * G + m[2] * B)));
  out[1] = linearToSrgb(Math.min(1, Math.max(0, m[3] * R + m[4] * G + m[5] * B)));
  out[2] = linearToSrgb(Math.min(1, Math.max(0, m[6] * R + m[7] * G + m[8] * B)));
  return out;
}

/** Hue distance in degrees (0..180). */
export const hueDist = (a: number, b: number) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; };
