// services/color/colorWorkspace.ts
// ═══════════════════════════════════════════════════════════════════════════
// Plajah Unified Colorist Science & Workspace Engine
// Shared by Tela (design & raster document canvas) and Fabula (video NLE & color grading).
//
// Combines:
//   1. Color Spaces: sRGB, Linear sRGB / ACEScg, Display P3, Rec. 709, Rec. 2020, OKLab / OKLCH, CIE Lab
//   2. Press CMYK: ISO Coated v2 / FOGRA39, US Web Coated SWOP v2 with Total Area Coverage (TAC)
//   3. Catmull-Rom Tone Curves: Master Y, Red, Green, Blue splines with 256×RGBA GPU LUT builder
//   4. Resolve 3-Phasor Color Wheels: Lift, Gamma, Gain, Offset with puck projection & master luma rings
//   5. Kelvin Temperature & Tint White Balance
//   6. Broadcast Legal Range & Delta-E 2000 Perceptual Accuracy
// ═══════════════════════════════════════════════════════════════════════════

export type ColorSpaceId =
  | 'srgb'
  | 'display-p3'
  | 'rec709'
  | 'rec2020'
  | 'linear-srgb'
  | 'oklch'
  | 'cielab'
  | 'cmyk-fogra39'
  | 'cmyk-swop';

export interface RGBColor {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
  a?: number; // 0..1
}

export interface CMYKColor {
  c: number; // 0..100%
  m: number; // 0..100%
  y: number; // 0..100%
  k: number; // 0..100%
  tac: number; // Total Area Coverage (0..400%)
  isOutOfGamut?: boolean;
}

export interface OKLCHColor {
  l: number; // Lightness 0..100%
  c: number; // Chroma 0..0.4
  h: number; // Hue 0..360°
  a?: number; // Alpha 0..1
}

export interface CIELABColor {
  L: number; // 0..100
  a: number; // -128..127
  b: number; // -128..127
}

export interface ColorMeasurement {
  hex: string;
  srgb: [number, number, number]; // 0..255
  srgbNormalized: [number, number, number]; // 0..1
  displayP3: [number, number, number]; // 0..1
  rec709: [number, number, number]; // 0..1
  rec2020: [number, number, number]; // 0..1
  oklch: OKLCHColor;
  lab: CIELABColor;
  cmyk: CMYKColor;
  luma: number; // Rec.709 luminance (0..1)
  isBroadcastLegal: boolean; // Rec. 709 legal range
}

// ── Gamma & Transfer Curves ──────────────────────────────────────────────────
export function srgbToLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// ── Matrix Transformations ───────────────────────────────────────────────────
// sRGB D65 to XYZ
export function srgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  return [X, Y, Z];
}

export function xyzToSrgb(X: number, Y: number, Z: number): [number, number, number] {
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

// Display-P3 ↔ sRGB (D65 white point, 3×3 in linear space)
const SRGB_TO_P3_MAT = [0.8224621, 0.177538, 0.0, 0.0331941, 0.9668058, 0.0, 0.0170827, 0.0723974, 0.9105199];
const P3_TO_SRGB_MAT = [1.2249401, -0.2249404, 0.0, -0.0420569, 1.0420571, 0.0, -0.0196376, -0.0786361, 1.0982735];

export function srgbToDisplayP3(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const m = SRGB_TO_P3_MAT;
  return [
    linearToSrgb(Math.max(0, Math.min(1, m[0] * R + m[1] * G + m[2] * B))),
    linearToSrgb(Math.max(0, Math.min(1, m[3] * R + m[4] * G + m[5] * B))),
    linearToSrgb(Math.max(0, Math.min(1, m[6] * R + m[7] * G + m[8] * B))),
  ];
}

export function displayP3ToSrgb(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const m = P3_TO_SRGB_MAT;
  return [
    linearToSrgb(Math.max(0, Math.min(1, m[0] * R + m[1] * G + m[2] * B))),
    linearToSrgb(Math.max(0, Math.min(1, m[3] * R + m[4] * G + m[5] * B))),
    linearToSrgb(Math.max(0, Math.min(1, m[6] * R + m[7] * G + m[8] * B))),
  ];
}

// Rec. 709 ↔ sRGB (Same primaries, different transfer gamma: Rec.709 gamma ~1.95 / 2.22)
export function srgbToRec709(r: number, g: number, b: number): [number, number, number] {
  const to709 = (c: number) => {
    const l = srgbToLinear(c);
    return l < 0.018 ? l * 4.5 : 1.099 * Math.pow(l, 0.45) - 0.099;
  };
  return [to709(r), to709(g), to709(b)];
}

export function rec709ToSrgb(r: number, g: number, b: number): [number, number, number] {
  const from709 = (c: number) => {
    const l = c < 0.081 ? c / 4.5 : Math.pow((c + 0.099) / 1.099, 1 / 0.45);
    return linearToSrgb(l);
  };
  return [from709(r), from709(g), from709(b)];
}

// Rec. 2020 ↔ sRGB (UHD Cinema Wide Gamut)
const SRGB_TO_2020_MAT = [0.627404, 0.329283, 0.043313, 0.069097, 0.919540, 0.011362, 0.016391, 0.088013, 0.895595];
export function srgbToRec2020(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const m = SRGB_TO_2020_MAT;
  const to2020 = (l: number) => (l < 0.0181 ? l * 4.5 : 1.0993 * Math.pow(l, 0.45) - 0.0993);
  return [
    to2020(Math.max(0, Math.min(1, m[0] * R + m[1] * G + m[2] * B))),
    to2020(Math.max(0, Math.min(1, m[3] * R + m[4] * G + m[5] * B))),
    to2020(Math.max(0, Math.min(1, m[6] * R + m[7] * G + m[8] * B))),
  ];
}

// ── OKLab & OKLCH (Perceptually Uniform Color Space) ──────────────────────────
export function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bOklab = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, a, bOklab];
}

export function srgbToOklch(r: number, g: number, b: number): OKLCHColor {
  const [L, a, bOklab] = srgbToOklab(r, g, b);
  const c = Math.hypot(a, bOklab);
  let h = Math.atan2(bOklab, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return {
    l: Math.round(L * 1000) / 10, // 0..100%
    c: Math.round(c * 10000) / 10000,
    h: Math.round(h * 10) / 10,
  };
}

// ── CIE L*a*b* (D65 standard) ─────────────────────────────────────────────────
const D65_X = 0.95047, D65_Y = 1.0, D65_Z = 1.08883;

export function srgbToCielab(r: number, g: number, b: number): CIELABColor {
  const [X, Y, Z] = srgbToXyz(r, g, b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / D65_X), fy = f(Y / D65_Y), fz = f(Z / D65_Z);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return {
    L: Math.round(L * 10) / 10,
    a: Math.round(a * 10) / 10,
    b: Math.round(bVal * 10) / 10,
  };
}

// ── CMYK Print Press Models (FOGRA39 & SWOP v2) ──────────────────────────────
export function srgbToCmyk(r: number, g: number, b: number, standard: 'fogra39' | 'swop' = 'fogra39'): CMYKColor {
  const kMax = standard === 'fogra39' ? 0.95 : 0.90;
  const tacLimit = standard === 'fogra39' ? 330 : 300;

  const invR = 1 - Math.max(0, Math.min(1, r));
  const invG = 1 - Math.max(0, Math.min(1, g));
  const invB = 1 - Math.max(0, Math.min(1, b));

  let k = Math.min(invR, invG, invB);
  let c = k < 1 ? (invR - k) / (1 - k) : 0;
  let m = k < 1 ? (invG - k) / (1 - k) : 0;
  let y = k < 1 ? (invB - k) / (1 - k) : 0;

  // Under Color Removal (UCR) & Black Generation curve
  if (k > 0.2) {
    const ucrFactor = standard === 'fogra39' ? 0.35 : 0.40;
    c = Math.max(0, c - k * ucrFactor * 0.5);
    m = Math.max(0, m - k * ucrFactor * 0.5);
    y = Math.max(0, y - k * ucrFactor * 0.5);
  }

  k = Math.min(kMax, k * 1.05);

  const C = Math.round(c * 100);
  const M = Math.round(m * 100);
  const Y = Math.round(y * 100);
  const K = Math.round(k * 100);
  const tac = C + M + Y + K;

  return {
    c: C,
    m: M,
    y: Y,
    k: K,
    tac,
    isOutOfGamut: tac > tacLimit,
  };
}

// ── Delta-E 2000 (CIEDE2000) Perceptual Color Difference ─────────────────────
export function deltaE2000(c1: CIELABColor, c2: CIELABColor): number {
  const deg2rad = Math.PI / 180;
  const rad2deg = 180 / Math.PI;

  const L1 = c1.L, a1 = c1.a, b1 = c1.b;
  const L2 = c2.L, a2 = c2.a, b2 = c2.b;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const a1Prime = (1 + G) * a1;
  const a2Prime = (1 + G) * a2;

  const C1Prime = Math.hypot(a1Prime, b1);
  const C2Prime = Math.hypot(a2Prime, b2);

  let h1Prime = Math.atan2(b1, a1Prime) * rad2deg;
  if (h1Prime < 0) h1Prime += 360;
  let h2Prime = Math.atan2(b2, a2Prime) * rad2deg;
  if (h2Prime < 0) h2Prime += 360;

  const deltaLPrime = L2 - L1;
  const deltaCPrime = C2Prime - C1Prime;

  let deltahPrime = 0;
  if (C1Prime * C2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) deltahPrime = diff;
    else if (diff > 180) deltahPrime = diff - 360;
    else deltahPrime = diff + 360;
  }
  const deltaHPrime = 2 * Math.sqrt(C1Prime * C2Prime) * Math.sin((deltahPrime * deg2rad) / 2);

  const LbarPrime = (L1 + L2) / 2;
  const CbarPrime = (C1Prime + C2Prime) / 2;

  let hbarPrime = 0;
  if (C1Prime * C2Prime !== 0) {
    const sum = h1Prime + h2Prime;
    if (Math.abs(h1Prime - h2Prime) <= 180) hbarPrime = sum / 2;
    else if (sum < 360) hbarPrime = (sum + 360) / 2;
    else hbarPrime = (sum - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarPrime - 30) * deg2rad) +
    0.24 * Math.cos(2 * hbarPrime * deg2rad) +
    0.32 * Math.cos((3 * hbarPrime + 6) * deg2rad) -
    0.20 * Math.cos((4 * hbarPrime - 63) * deg2rad);

  const deltaTheta = 30 * Math.exp(-Math.pow((hbarPrime - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(CbarPrime, 7) / (Math.pow(CbarPrime, 7) + Math.pow(25, 7)));
  const RT = -RC * Math.sin(2 * deltaTheta * deg2rad);

  const SL = 1 + (0.015 * Math.pow(LbarPrime - 50, 2)) / Math.sqrt(20 + Math.pow(LbarPrime - 50, 2));
  const SC = 1 + 0.045 * CbarPrime;
  const SH = 1 + 0.015 * CbarPrime * T;

  const dE = Math.sqrt(
    Math.pow(deltaLPrime / SL, 2) +
    Math.pow(deltaCPrime / SC, 2) +
    Math.pow(deltaHPrime / SH, 2) +
    RT * (deltaCPrime / SC) * (deltaHPrime / SH)
  );

  return Math.round(dE * 100) / 100;
}

// ── Complete Color Profiler ───────────────────────────────────────────────────
export function measureColor(r: number, g: number, b: number, a = 1): ColorMeasurement {
  const normR = Math.max(0, Math.min(1, r));
  const normG = Math.max(0, Math.min(1, g));
  const normB = Math.max(0, Math.min(1, b));

  const byteR = Math.round(normR * 255);
  const byteG = Math.round(normG * 255);
  const byteB = Math.round(normB * 255);

  const hex = `#${[byteR, byteG, byteB].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const luma = 0.2126 * normR + 0.7152 * normG + 0.0722 * normB;

  // Rec. 709 broadcast legal levels check: 16/255=0.0627 to 235/255=0.9216
  const isBroadcastLegal =
    byteR >= 16 && byteR <= 235 &&
    byteG >= 16 && byteG <= 235 &&
    byteB >= 16 && byteB <= 235;

  return {
    hex,
    srgb: [byteR, byteG, byteB],
    srgbNormalized: [normR, normG, normB],
    displayP3: srgbToDisplayP3(normR, normG, normB),
    rec709: srgbToRec709(normR, normG, normB),
    rec2020: srgbToRec2020(normR, normG, normB),
    oklch: srgbToOklch(normR, normG, normB),
    lab: srgbToCielab(normR, normG, normB),
    cmyk: srgbToCmyk(normR, normG, normB, 'fogra39'),
    luma: Math.round(luma * 1000) / 1000,
    isBroadcastLegal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tone-Curve Spline Math (Adopted from Fabula's Catmull-Rom Engine)
// ═══════════════════════════════════════════════════════════════════════════

export type CurvePoint = [number, number];

export interface Curves {
  master?: CurvePoint[];
  r?: CurvePoint[];
  g?: CurvePoint[];
  b?: CurvePoint[];
}

export const LUT_SIZE = 256;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function isCurveIdentity(pts?: CurvePoint[] | null): boolean {
  if (!pts || pts.length === 0) return true;
  return pts.every((p) => Math.abs(p[0] - p[1]) < 1e-4);
}

export function isCurvesIdentity(c?: Curves | null): boolean {
  if (!c) return true;
  return isCurveIdentity(c.master) && isCurveIdentity(c.r) && isCurveIdentity(c.g) && isCurveIdentity(c.b);
}

function normalizeCurvePoints(pts?: CurvePoint[] | null): CurvePoint[] {
  const list: CurvePoint[] = (pts || []).map((p) => [clamp01(p[0]), clamp01(p[1])] as CurvePoint);
  if (!list.some((p) => p[0] <= 0.0001)) list.unshift([0, 0]);
  if (!list.some((p) => p[0] >= 0.9999)) list.push([1, 1]);
  list.sort((a, b) => a[0] - b[0]);
  const out: CurvePoint[] = [];
  for (const p of list) {
    if (out.length && Math.abs(out[out.length - 1][0] - p[0]) < 1e-4) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Evaluate a curve at x in [0, 1] using Catmull-Rom spline interpolation */
export function evalCurve(pts: CurvePoint[] | null | undefined, x: number): number {
  if (isCurveIdentity(pts)) return clamp01(x);
  const p = normalizeCurvePoints(pts);
  x = clamp01(x);
  let i = 0;
  while (i < p.length - 2 && x > p[i + 1][0]) i++;
  const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
  const span = p2[0] - p1[0];
  const t = span > 1e-6 ? (x - p1[0]) / span : 0;
  const t2 = t * t, t3 = t2 * t;
  const y = 0.5 * (
    (2 * p1[1]) +
    (-p0[1] + p2[1]) * t +
    (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
    (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
  );
  return clamp01(y);
}

/** Sample a curve into a 256-entry Float32Array */
export function curveTable(pts?: CurvePoint[] | null): Float32Array {
  const out = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) out[i] = evalCurve(pts, i / (LUT_SIZE - 1));
  return out;
}

/** Build a 256x1 RGBA8 GPU texture LUT (R/G/B in channels 0,1,2; Master in channel 3) */
export function buildCurveLut(c?: Curves | null): Uint8Array {
  const lut = new Uint8Array(LUT_SIZE * 4);
  const rT = curveTable(c?.r), gT = curveTable(c?.g), bT = curveTable(c?.b), mT = curveTable(c?.master);
  for (let i = 0; i < LUT_SIZE; i++) {
    lut[i * 4 + 0] = Math.round(rT[i] * 255);
    lut[i * 4 + 1] = Math.round(gT[i] * 255);
    lut[i * 4 + 2] = Math.round(bT[i] * 255);
    lut[i * 4 + 3] = Math.round(mT[i] * 255);
  }
  return lut;
}

// ═══════════════════════════════════════════════════════════════════════════
// Resolve 3-Phasor Color Wheel Math
// ═══════════════════════════════════════════════════════════════════════════

export const RESOLVE_PHASORS = { R: 90, G: 210, B: 330 };
export const RESOLVE_UNIT_VECTORS = Object.fromEntries(
  Object.entries(RESOLVE_PHASORS).map(([k, deg]) => [
    k,
    [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] as [number, number],
  ])
) as Record<'R' | 'G' | 'B', [number, number]>;

/** Inverse 3-phasor projection: converts [R, G, B] values into 2D disc puck coordinates (-1..1) */
export function rgbToPuck(rgb: [number, number, number], defVal: number, scale: number): { px: number; py: number } {
  const d = [rgb[0] - defVal, rgb[1] - defVal, rgb[2] - defVal];
  const u = RESOLVE_UNIT_VECTORS;
  let px = ((2 / 3) * (d[0] * u.R[0] + d[1] * u.G[0] + d[2] * u.B[0])) / scale;
  let py = ((2 / 3) * (d[0] * u.R[1] + d[1] * u.G[1] + d[2] * u.B[1])) / scale;
  const mag = Math.hypot(px, py);
  if (mag > 1) {
    px /= mag;
    py /= mag;
  }
  return { px, py };
}

/** Forward 3-phasor projection: projects 2D disc coordinates onto R/G/B channel axes */
export function puckToRgb(
  nx: number,
  ny: number,
  defVal: number,
  scale: number,
  minVal: number,
  maxVal: number
): [number, number, number] {
  const m = Math.hypot(nx, ny);
  let x = nx, y = ny;
  if (m > 1) {
    x /= m;
    y /= m;
  }
  const u = RESOLVE_UNIT_VECTORS;
  const project = (axis: [number, number]) => {
    const off = (x * axis[0] + y * axis[1]) * scale;
    return Math.max(minVal, Math.min(maxVal, defVal + off));
  };
  return [project(u.R), project(u.G), project(u.B)];
}
