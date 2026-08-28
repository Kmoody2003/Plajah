// ═══════════════════════════════════════════════════════════════════════════
// hslKey — the HSL qualifier (secondary) model + helpers, shared by the color
// room's eyedropper and the GL compositor. A qualifier isolates a hue/sat/lum
// RANGE (a "key") and applies a correction only inside it — the fastest path to
// "make the skin right, leave everything else alone".
//
// The heavy lifting (per-pixel key + correction) lives in the compositor's grade
// shader so it previews live in the grade monitor AND bakes into the export from
// one place — the same parity contract as the tone curves (see gradeCurves.ts).
// This module carries the DATA MODEL, an identity check, and the RGB→HSL math
// the eyedropper uses to seed a key from a sampled pixel.
// ═══════════════════════════════════════════════════════════════════════════

export interface Qualifier {
  /** hue centre 0..1 and half-width 0..1 (circular). */
  h: number; hw: number;
  /** saturation range 0..1. */
  sl: number; sh: number;
  /** luminance range 0..1. */
  ll: number; lh: number;
  /** edge softness 0..1 added to every boundary. */
  soft: number;
  /** correction applied INSIDE the key. */
  dHue: number;  // hue rotation, turns (-0.5..0.5)
  mSat: number;  // saturation multiplier (1 = none)
  mLum: number;  // luminance multiplier (1 = none)
  /** show the key as a matte (desaturate everything outside it). */
  show?: boolean;
  enabled?: boolean;
}

export const QUALIFIER_DEFAULT: Qualifier = {
  h: 0.07, hw: 0.06, sl: 0.15, sh: 1, ll: 0.2, lh: 0.9, soft: 0.08,
  dHue: 0, mSat: 1, mLum: 1, show: false, enabled: true,
};

/** No correction → nothing to apply (even if a key is defined). */
export function isQualifierIdentity(q?: Qualifier | null): boolean {
  if (!q || q.enabled === false) return true;
  if (q.show) return false; // show-key is a live preview, always "active"
  return (q.dHue ?? 0) === 0 && (q.mSat ?? 1) === 1 && (q.mLum ?? 1) === 1;
}

/** sRGB 0..1 → HSL 0..1 (H circular). Matches the compositor's rgb2hsl. */
export function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

/** Seed a sensible key from a sampled pixel (used by the eyedropper). */
export function keyFromPixel(r: number, g: number, b: number, base?: Qualifier): Qualifier {
  const [h, s, l] = rgb2hsl(r, g, b);
  return {
    ...(base || QUALIFIER_DEFAULT),
    h,
    hw: 0.06,
    sl: Math.max(0, s - 0.25), sh: Math.min(1, s + 0.25),
    ll: Math.max(0, l - 0.25), lh: Math.min(1, l + 0.25),
    soft: 0.08,
    enabled: true,
  };
}
