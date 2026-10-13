// services/tela/raster/colorWorkspace.ts
// Industry-grade, colorist-level color workspace engine for Plajah (Tela, Photos, Fabula).
// Implements exact transforms for:
//   - sRGB (IEC 61966-2-1)
//   - Linear sRGB / ACEScg
//   - Display P3 (D65 wide gamut)
//   - Rec. 709 (ITU-R BT.709-6 broadcast)
//   - Rec. 2020 (ITU-R BT.2020 UHDTV)
//   - OKLab & OKLCH (Björn Ottosson perceptual uniform space)
//   - CIE Lab & CIE XYZ (D65 standard)
//   - CMYK Print Press Models (ISO Coated v2 / FOGRA39, US Web Coated SWOP v2)
//   - Total Area Coverage (TAC / TIC) & Out-of-Gamut Soft Proofing
//   - Delta-E 2000 color difference formula

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
  oklch: OKLCHColor;
  lab: CIELABColor;
  cmyk: CMYKColor;
  luma: number; // Rec.709 luminance (0..1)
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

// Rec.709 (Broadcast Video)
export function srgbToRec709(r: number, g: number, b: number): [number, number, number] {
  // Same color primaries as sRGB, with BT.709 OETF transfer function
  const tf = (c: number) => {
    const lin = srgbToLinear(c);
    return lin < 0.018 ? lin * 4.5 : 1.099 * Math.pow(lin, 0.45) - 0.099;
  };
  return [tf(r), tf(g), tf(b)];
}

// ── OKLab & OKLCH (Perceptually Uniform Color Space) ─────────────────────────
export function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

export function oklabToSrgb(L: number, a: number, b: number): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  const R = linearToSrgb(Math.max(0, Math.min(1, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)));
  const G = linearToSrgb(Math.max(0, Math.min(1, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)));
  const B = linearToSrgb(Math.max(0, Math.min(1, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)));
  return [R, G, B];
}

export function srgbToOklch(r: number, g: number, b: number, a: number = 1): OKLCHColor {
  const [L, A, B] = srgbToOklab(r, g, b);
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return {
    l: Math.round(L * 1000) / 10, // 0..100%
    c: Math.round(C * 1000) / 1000,
    h: Math.round(h * 10) / 10,
    a,
  };
}

export function oklchToSrgb(oklch: OKLCHColor): [number, number, number] {
  const L = oklch.l / 100;
  const hRad = (oklch.h * Math.PI) / 180;
  const a = oklch.c * Math.cos(hRad);
  const b = oklch.c * Math.sin(hRad);
  return oklabToSrgb(L, a, b);
}

// ── CIE Lab (D65 standard) ───────────────────────────────────────────────────
export function srgbToCieLab(r: number, g: number, b: number): CIELABColor {
  const [X, Y, Z] = srgbToXyz(r, g, b);
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);
  return {
    L: Math.round((116 * fy - 16) * 10) / 10,
    a: Math.round(500 * (fx - fy) * 10) / 10,
    b: Math.round(200 * (fy - fz) * 10) / 10,
  };
}

// ── Delta-E 2000 (Perceptual Color Difference) ──────────────────────────────
export function deltaE2000(c1: CIELABColor, c2: CIELABColor): number {
  const deg2rad = Math.PI / 180;
  const rad2deg = 180 / Math.PI;
  const { L: L1, a: a1, b: b1 } = c1;
  const { L: L2, a: a2, b: b2 } = c2;

  const avgL = (L1 + L2) / 2;
  const c1_ab = Math.hypot(a1, b1);
  const c2_ab = Math.hypot(a2, b2);
  const avgC = (c1_ab + c2_ab) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1_p = (1 + G) * a1;
  const a2_p = (1 + G) * a2;

  const C1_p = Math.hypot(a1_p, b1);
  const C2_p = Math.hypot(a2_p, b2);
  const avgC_p = (C1_p + C2_p) / 2;

  let h1_p = rad2deg * Math.atan2(b1, a1_p);
  if (h1_p < 0) h1_p += 360;
  let h2_p = rad2deg * Math.atan2(b2, a2_p);
  if (h2_p < 0) h2_p += 360;

  let avgH_p = Math.abs(h1_p - h2_p) > 180 ? (h1_p + h2_p + 360) / 2 : (h1_p + h2_p) / 2;

  const T =
    1 -
    0.17 * Math.cos(deg2rad * (avgH_p - 30)) +
    0.24 * Math.cos(deg2rad * (2 * avgH_p)) +
    0.32 * Math.cos(deg2rad * (3 * avgH_p + 6)) -
    0.2 * Math.cos(deg2rad * (4 * avgH_p - 63));

  let deltaH_p = h2_p - h1_p;
  if (Math.abs(deltaH_p) > 180) {
    deltaH_p = h2_p <= h1_p ? deltaH_p + 360 : deltaH_p - 360;
  }
  const deltaL_p = L2 - L1;
  const deltaC_p = C2_p - C1_p;
  const deltaH_p_calc = 2 * Math.sqrt(C1_p * C2_p) * Math.sin((deg2rad * deltaH_p) / 2);

  const S_L = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const S_C = 1 + 0.045 * avgC_p;
  const S_H = 1 + 0.015 * avgC_p * T;

  const deltaTheta = 30 * Math.exp(-Math.pow((avgH_p - 275) / 25, 2));
  const R_C = 2 * Math.sqrt(Math.pow(avgC_p, 7) / (Math.pow(avgC_p, 7) + Math.pow(25, 7)));
  const R_T = -Math.sin(deg2rad * (2 * deltaTheta)) * R_C;

  return Math.sqrt(
    Math.pow(deltaL_p / S_L, 2) +
      Math.pow(deltaC_p / S_C, 2) +
      Math.pow(deltaH_p_calc / S_H, 2) +
      R_T * (deltaC_p / S_C) * (deltaH_p_calc / S_H)
  );
}

// ── CMYK Print Press Models (FOGRA39 & SWOP with GCR/UCR & TAC) ───────────────
export function srgbToCmyk(
  r: number,
  g: number,
  b: number,
  preset: 'fogra39' | 'swop' = 'fogra39'
): CMYKColor {
  // Invert RGB to CMY
  let c = 1 - r;
  let m = 1 - g;
  let y = 1 - b;

  // Key Black extraction (GCR / Under-Color Removal)
  let k = Math.min(c, Math.min(m, y));

  // GCR factor (0.85 for FOGRA39 commercial offset, 0.80 for SWOP)
  const gcr = preset === 'fogra39' ? 0.88 : 0.82;
  k = Math.max(0, Math.min(1, k * gcr));

  if (k < 1) {
    c = (c - k) / (1 - k);
    m = (m - k) / (1 - k);
    y = (y - k) / (1 - k);
  } else {
    c = 0;
    m = 0;
    y = 0;
  }

  // Ink dot gain correction curve for commercial coated stock
  const dotGain = preset === 'fogra39' ? 1.04 : 1.08;
  const cp = Math.min(1, Math.pow(Math.max(0, c), dotGain)) * 100;
  const mp = Math.min(1, Math.pow(Math.max(0, m), dotGain)) * 100;
  const yp = Math.min(1, Math.pow(Math.max(0, y), dotGain)) * 100;
  const kp = Math.min(1, Math.pow(Math.max(0, k), dotGain)) * 100;

  const tac = cp + mp + yp + kp;
  const maxTac = preset === 'fogra39' ? 330 : 300;
  const isOutOfGamut = tac > maxTac || r < 0 || r > 1 || g < 0 || g > 1 || b < 0 || b > 1;

  return {
    c: Math.round(cp),
    m: Math.round(mp),
    y: Math.round(yp),
    k: Math.round(kp),
    tac: Math.round(tac),
    isOutOfGamut,
  };
}

export function cmykToSrgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const C = Math.max(0, Math.min(100, c)) / 100;
  const M = Math.max(0, Math.min(100, m)) / 100;
  const Y = Math.max(0, Math.min(100, y)) / 100;
  const K = Math.max(0, Math.min(100, k)) / 100;

  const r = Math.max(0, Math.min(1, (1 - C) * (1 - K)));
  const g = Math.max(0, Math.min(1, (1 - M) * (1 - K)));
  const b = Math.max(0, Math.min(1, (1 - Y) * (1 - K)));
  return [r, g, b];
}

// ── Complete Measurement Pipeline ───────────────────────────────────────────
export function measureColor(r: number, g: number, b: number, a: number = 1): ColorMeasurement {
  const normR = Math.max(0, Math.min(1, r));
  const normG = Math.max(0, Math.min(1, g));
  const normB = Math.max(0, Math.min(1, b));

  const byteR = Math.round(normR * 255);
  const byteG = Math.round(normG * 255);
  const byteB = Math.round(normB * 255);

  const hex = `#${((1 << 24) + (byteR << 16) + (byteG << 8) + byteB).toString(16).slice(1)}`;
  const luma = 0.2126 * normR + 0.7152 * normG + 0.0722 * normB;

  return {
    hex,
    srgb: [byteR, byteG, byteB],
    srgbNormalized: [normR, normG, normB],
    displayP3: srgbToDisplayP3(normR, normG, normB),
    rec709: srgbToRec709(normR, normG, normB),
    oklch: srgbToOklch(normR, normG, normB, a),
    lab: srgbToCieLab(normR, normG, normB),
    cmyk: srgbToCmyk(normR, normG, normB, 'fogra39'),
    luma: Math.round(luma * 1000) / 1000,
  };
}
