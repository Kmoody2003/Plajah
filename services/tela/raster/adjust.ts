// raster/adjust — every adjustment as a compiled per-pixel colour function, CPU reference.
//
// compileAdjustment(adj) precomputes LUTs/splines once and returns fn(rgb) that maps a
// STRAIGHT, sRGB-ENCODED colour (0..1) in place. Adjustments always see sRGB-encoded
// values (the compositor converts when the document blends in linear light) so a Curves
// setting means the same thing in either blend space — which is what Photoshop does.
//
// Algorithms (documented because Photoshop's are proprietary):
//  levels      per-channel then master: v=((v−inB)/(inW−inB))^(1/γ)·(outW−outB)+outB
//  curves      natural cubic spline through the points, flat outside the end points,
//              baked to a 4096 LUT; per-channel curve then master
//  hue/sat     HSL; hue rotate, sat×(1+s) (+ toward 1 for s>0 like PS), lightness lerp
//              to black/white; per-range edits weighted by hue membership with feathers
//  colorBalance GIMP's PS-matching tonal-weight transfer + optional luminosity restore
//  vibrance    saturation boost weighted by (1−sat)² and damped on skin hues
//  exposure    linear light: lin·2^e + offset, then ^(1/γ)
//  B&W         min + (mid−min)·W[secondary] + (max−mid)·W[primary] (PS's 6-slider model)
//  selective   CMY(K) per colour-family weight (reds..magentas by max−mid / mid−min,
//              whites/neutrals/blacks by min/max) relative or absolute
//  lut3d       .cube parsing (DOMAIN_MIN/MAX, size ≤ 256), tetrahedral interpolation

import type { Adjustment, CurvePoint, HueRange, HueRangeName, LevelsChannel, CMYKAdjust } from './model';
import { clamp01, srgbToLinear, linearToSrgb, luma601, type RasterF, SRGB8_TO_LINEAR } from './buffer';
import { rgbToHsl, hslToRgb, hueDist } from './colorMath';
import { gradientLut } from './gradient';
import { lum as wLum } from './blend';

export type ColorFn = (c: number[]) => void;

// ── Curves ──────────────────────────────────────────────────────────────────
/** Natural cubic spline LUT through `points` (sorted, unique x). n entries over 0..1. */
export function curveLut(points: CurvePoint[], n = 4096): Float32Array {
  const pts = [...points].sort((a, b) => a[0] - b[0]).filter((p, i, a) => i === 0 || p[0] - a[i - 1][0] > 1e-6);
  const lut = new Float32Array(n);
  if (pts.length === 0) { for (let i = 0; i < n; i++) lut[i] = i / (n - 1); return lut; }
  if (pts.length === 1) { lut.fill(clamp01(pts[0][1])); return lut; }
  const k = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  // second derivatives (natural spline) — tridiagonal solve
  const y2 = new Float64Array(k), u = new Float64Array(k);
  for (let i = 1; i < k - 1; i++) {
    const sig = (xs[i] - xs[i - 1]) / (xs[i + 1] - xs[i - 1]), p = sig * y2[i - 1] + 2;
    y2[i] = (sig - 1) / p;
    u[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) - (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
    u[i] = (6 * u[i] / (xs[i + 1] - xs[i - 1]) - sig * u[i - 1]) / p;
  }
  for (let i = k - 2; i >= 0; i--) y2[i] = y2[i] * y2[i + 1] + u[i];
  let seg = 0;
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1);
    if (x <= xs[0]) { lut[j] = clamp01(ys[0]); continue; }
    if (x >= xs[k - 1]) { lut[j] = clamp01(ys[k - 1]); continue; }
    while (seg < k - 2 && x > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg], a = (xs[seg + 1] - x) / h, b = (x - xs[seg]) / h;
    lut[j] = clamp01(a * ys[seg] + b * ys[seg + 1] + ((a * a * a - a) * y2[seg] + (b * b * b - b) * y2[seg + 1]) * h * h / 6);
  }
  return lut;
}
const lutAt = (lut: Float32Array, v: number) => { const f = clamp01(v) * (lut.length - 1), i = Math.floor(f), t = f - i; return i >= lut.length - 1 ? lut[lut.length - 1] : lut[i] * (1 - t) + lut[i + 1] * t; };

export function levelsFn(l: LevelsChannel): (v: number) => number {
  const span = Math.max(1e-6, l.inWhite - l.inBlack), ig = 1 / Math.max(0.01, l.gamma || 1);
  return v => l.outBlack + Math.pow(clamp01((v - l.inBlack) / span), ig) * (l.outWhite - l.outBlack);
}

// ── Hue ranges (Photoshop Hue/Sat "Edit:" families) ─────────────────────────
const RANGE_CENTER: Record<HueRangeName, number> = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 };
/** Membership 0..1 of hue h in a range: flat ±15° core, 30° linear feather (Photoshop defaults). */
export function hueRangeWeight(h: number, range: HueRange['range']): number {
  if (typeof range === 'string') { const d = hueDist(h, RANGE_CENTER[range]); return d <= 15 ? 1 : d >= 45 ? 0 : 1 - (d - 15) / 30; }
  const from = ((range.from % 360) + 360) % 360, to = ((range.to % 360) + 360) % 360;
  const inside = from <= to ? h >= from && h <= to : h >= from || h <= to;
  if (inside) return 1;
  const d = Math.min(hueDist(h, from), hueDist(h, to));
  return range.feather > 0 && d < range.feather ? 1 - d / range.feather : 0;
}
function hslEdit(hsl: number[], hue: number, sat: number, light: number, w: number) {
  if (w <= 0) return;
  hsl[0] += hue * w;
  const s = (sat / 100) * w;
  hsl[1] = clamp01(hsl[1] * (1 + s)); // multiplicative: greys stay grey (PS/GIMP behaviour)
  const l = (light / 100) * w;
  hsl[2] = l >= 0 ? hsl[2] + (1 - hsl[2]) * l : hsl[2] * (1 + l);
}

// ── Colour balance (GIMP's PS-compatible transfer) ──────────────────────────
function cbTransfer(v: number, l: number, sh: number, mid: number, hi: number): number {
  const a = 0.25, b = 0.333, scale = 0.7;
  const s = clamp01((l - b) / -a + 0.5) * scale;
  const m = clamp01((l - b) / a + 0.5) * clamp01((l + b - 1) / -a + 0.5) * scale;
  const h = clamp01((l + b - 1) / a + 0.5) * scale;
  return clamp01(v + (sh * s + mid * m + hi * h) / 100);
}

// ── Selective colour ────────────────────────────────────────────────────────
function selectiveWeights(r: number, g: number, b: number): Record<string, number> {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), mid = r + g + b - mx - mn;
  const w: Record<string, number> = { reds: 0, yellows: 0, greens: 0, cyans: 0, blues: 0, magentas: 0 };
  const prim = mx - mid, sec = mid - mn;
  if (mx === r) w.reds = prim; else if (mx === g) w.greens = prim; else w.blues = prim;
  if (mn === b) w.yellows = sec; else if (mn === r) w.cyans = sec; else w.magentas = sec;
  w.whites = mn > 0.5 ? (mn - 0.5) * 2 : 0;
  w.blacks = mx < 0.5 ? (0.5 - mx) * 2 : 0;
  w.neutrals = Math.max(0, 1 - (Math.abs(mx - 0.5) + Math.abs(mn - 0.5)));
  return w;
}

// ── 3D LUT (.cube) ──────────────────────────────────────────────────────────
export interface CubeLut { size: number; data: Float32Array; domainMin: [number, number, number]; domainMax: [number, number, number]; title?: string }
export function parseCube(text: string): CubeLut {
  let size = 0, title: string | undefined; const dmin: [number, number, number] = [0, 0, 0], dmax: [number, number, number] = [1, 1, 1];
  const vals: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const head = line.split(/\s+/)[0].toUpperCase();
    if (head === 'TITLE') { title = line.slice(5).trim().replace(/^"|"$/g, ''); continue; }
    if (head === 'LUT_3D_SIZE') { size = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (head === 'LUT_1D_SIZE') throw new Error('1D .cube LUTs are not supported for Color Lookup (use Curves).');
    if (head === 'DOMAIN_MIN') { line.split(/\s+/).slice(1, 4).forEach((v, i) => dmin[i] = +v); continue; }
    if (head === 'DOMAIN_MAX') { line.split(/\s+/).slice(1, 4).forEach((v, i) => dmax[i] = +v); continue; }
    if (/^[A-Z_]+$/.test(head)) continue; // unknown keyword
    const p = line.split(/\s+/); if (p.length >= 3) vals.push(+p[0], +p[1], +p[2]);
  }
  if (size < 2 || size > 256) throw new Error(`Bad LUT_3D_SIZE ${size}`);
  if (vals.length !== size * size * size * 3) throw new Error(`.cube has ${vals.length / 3} entries, expected ${size ** 3}`);
  return { size, data: Float32Array.from(vals), domainMin: dmin, domainMax: dmax, title };
}
/** Tetrahedral interpolation (what Resolve/OCIO use: no trilinear hue shifts). R varies fastest. */
export function sampleCube(lut: CubeLut, r: number, g: number, b: number, out: number[]): void {
  const n = lut.size - 1, d = lut.data;
  const fr = clamp01((r - lut.domainMin[0]) / (lut.domainMax[0] - lut.domainMin[0])) * n;
  const fg = clamp01((g - lut.domainMin[1]) / (lut.domainMax[1] - lut.domainMin[1])) * n;
  const fb = clamp01((b - lut.domainMin[2]) / (lut.domainMax[2] - lut.domainMin[2])) * n;
  const r0 = Math.min(n - 1, Math.floor(fr)), g0 = Math.min(n - 1, Math.floor(fg)), b0 = Math.min(n - 1, Math.floor(fb));
  const x = fr - r0, y = fg - g0, z = fb - b0, S = lut.size;
  const at = (ri: number, gi: number, bi: number, c: number) => d[((bi * S + gi) * S + ri) * 3 + c];
  for (let c = 0; c < 3; c++) {
    const c000 = at(r0, g0, b0, c), c111 = at(r0 + 1, g0 + 1, b0 + 1, c);
    let v: number;
    if (x >= y) {
      if (y >= z) v = c000 + x * (at(r0 + 1, g0, b0, c) - c000) + y * (at(r0 + 1, g0 + 1, b0, c) - at(r0 + 1, g0, b0, c)) + z * (c111 - at(r0 + 1, g0 + 1, b0, c));
      else if (x >= z) v = c000 + x * (at(r0 + 1, g0, b0, c) - c000) + z * (at(r0 + 1, g0, b0 + 1, c) - at(r0 + 1, g0, b0, c)) + y * (c111 - at(r0 + 1, g0, b0 + 1, c));
      else v = c000 + z * (at(r0, g0, b0 + 1, c) - c000) + x * (at(r0 + 1, g0, b0 + 1, c) - at(r0, g0, b0 + 1, c)) + y * (c111 - at(r0 + 1, g0, b0 + 1, c));
    } else {
      if (z >= y) v = c000 + z * (at(r0, g0, b0 + 1, c) - c000) + y * (at(r0, g0 + 1, b0 + 1, c) - at(r0, g0, b0 + 1, c)) + x * (c111 - at(r0, g0 + 1, b0 + 1, c));
      else if (z >= x) v = c000 + y * (at(r0, g0 + 1, b0, c) - c000) + z * (at(r0, g0 + 1, b0 + 1, c) - at(r0, g0 + 1, b0, c)) + x * (c111 - at(r0, g0 + 1, b0 + 1, c));
      else v = c000 + y * (at(r0, g0 + 1, b0, c) - c000) + x * (at(r0 + 1, g0 + 1, b0, c) - at(r0, g0 + 1, b0, c)) + z * (c111 - at(r0 + 1, g0 + 1, b0, c));
    }
    out[c] = v;
  }
}
const cubeCache = new Map<string, CubeLut>();
/** Resolver for lut3d assets; the asset bridge registers loaded .cube text here. */
export function registerCubeText(key: string, text: string): CubeLut { const l = parseCube(text); cubeCache.set(key, l); return l; }
export function cubeFor(adj: Extract<Adjustment, { type: 'lut3d' }>): CubeLut | null {
  const key = adj.assetId || adj.cube || ''; if (!key) return null;
  let l = cubeCache.get(key);
  if (!l && adj.cube) { try { l = parseCube(adj.cube); cubeCache.set(key, l); } catch { return null; } }
  return l || null;
}

// ── Compile ─────────────────────────────────────────────────────────────────
const tmp3 = [0, 0, 0];
export function compileAdjustment(adj: Adjustment): ColorFn {
  switch (adj.type) {
    case 'invert': return c => { c[0] = 1 - c[0]; c[1] = 1 - c[1]; c[2] = 1 - c[2]; };
    case 'posterize': { const n = Math.max(2, Math.round(adj.levels)); const q = (v: number) => Math.min(n - 1, Math.floor(v * n)) / (n - 1); return c => { c[0] = q(c[0]); c[1] = q(c[1]); c[2] = q(c[2]); }; }
    case 'threshold': return c => { const v = luma601(c[0], c[1], c[2]) >= adj.level ? 1 : 0; c[0] = c[1] = c[2] = v; };
    case 'levels': {
      const m = levelsFn(adj.master), ch = [adj.r, adj.g, adj.b].map(l => l ? levelsFn(l) : null);
      return c => { for (let i = 0; i < 3; i++) { let v = c[i]; const f = ch[i]; if (f) v = f(v); c[i] = clamp01(m(v)); } };
    }
    case 'curves': {
      const m = curveLut(adj.master), ch = [adj.r, adj.g, adj.b].map(p => p && p.length ? curveLut(p) : null);
      return c => { for (let i = 0; i < 3; i++) { let v = c[i]; const l = ch[i]; if (l) v = lutAt(l, v); c[i] = lutAt(m, v); } };
    }
    case 'exposure': {
      const k = Math.pow(2, adj.exposure), ig = 1 / Math.max(0.01, adj.gamma || 1);
      return c => { for (let i = 0; i < 3; i++) c[i] = clamp01(linearToSrgb(clamp01(Math.pow(Math.max(0, srgbToLinear(c[i]) * k + adj.offset), ig)))); };
    }
    case 'brightnessContrast': {
      // Modern PS B/C: brightness = midtone curve shift, contrast = S-curve around 0.5.
      const b = adj.brightness / 150, ct = adj.contrast / 100;
      const pts: CurvePoint[] = [[0, 0], [0.5, clamp01(0.5 + b * 0.5)], [1, 1]];
      if (ct !== 0) { const d = 0.25 * ct * (ct > 0 ? 0.5 : 0.7); pts.splice(1, 0, [0.25, clamp01(0.25 - d + b * 0.3)]); pts.splice(3, 0, [0.75, clamp01(0.75 + d + b * 0.2)]); }
      const lut = curveLut(pts); return c => { c[0] = lutAt(lut, c[0]); c[1] = lutAt(lut, c[1]); c[2] = lutAt(lut, c[2]); };
    }
    case 'cssColor': {
      const s = adj.saturate, m = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
      return c => {
        for (let i = 0; i < 3; i++) c[i] = clamp01(clamp01(c[i] * adj.brightness) * adj.contrast + 0.5 - 0.5 * adj.contrast);
        const r = c[0], g = c[1], b = c[2];
        c[0] = clamp01(m[0] * r + m[1] * g + m[2] * b); c[1] = clamp01(m[3] * r + m[4] * g + m[5] * b); c[2] = clamp01(m[6] * r + m[7] * g + m[8] * b);
      };
    }
    case 'hueSaturation': {
      const hsl = [0, 0, 0];
      if (adj.colorize) {
        return c => { const l = luma601(c[0], c[1], c[2]); hslToRgb(adj.hue < 0 ? adj.hue + 360 : adj.hue, clamp01(Math.abs(adj.saturation) / 100 || 0.25), l, tmp3); const L = adj.lightness / 100; for (let i = 0; i < 3; i++) c[i] = L >= 0 ? tmp3[i] + (1 - tmp3[i]) * L : tmp3[i] * (1 + L); };
      }
      const ranges = adj.ranges || [];
      return c => {
        rgbToHsl(c[0], c[1], c[2], hsl);
        const h0 = hsl[0];
        for (const r of ranges) hslEdit(hsl, r.hue, r.saturation, r.lightness, hsl[1] > 1e-4 ? hueRangeWeight(h0, r.range) : 0);
        hslEdit(hsl, adj.hue, adj.saturation, adj.lightness, 1);
        hslToRgb(hsl[0], hsl[1], hsl[2], c);
      };
    }
    case 'colorBalance': {
      const hsl = [0, 0, 0];
      return c => {
        rgbToHsl(c[0], c[1], c[2], hsl); const l = hsl[2];
        const r = cbTransfer(c[0], l, adj.shadows[0], adj.midtones[0], adj.highlights[0]);
        const g = cbTransfer(c[1], l, adj.shadows[1], adj.midtones[1], adj.highlights[1]);
        const b = cbTransfer(c[2], l, adj.shadows[2], adj.midtones[2], adj.highlights[2]);
        if (adj.preserveLuminosity) { rgbToHsl(r, g, b, hsl); hslToRgb(hsl[0], hsl[1], l, c); } else { c[0] = r; c[1] = g; c[2] = b; }
      };
    }
    case 'vibrance': {
      const v = adj.vibrance / 100, s = adj.saturation / 100, hsl = [0, 0, 0];
      return c => {
        rgbToHsl(c[0], c[1], c[2], hsl);
        if (hsl[1] > 1e-5) {
          const skin = Math.max(0, 1 - hueDist(hsl[0], 25) / 30) * 0.6; // protect skin tones
          let sat = hsl[1];
          sat = v >= 0 ? sat + v * (1 - sat) * (1 - sat) * (1 - skin) * sat * 2 : sat * (1 + v * (1 - sat * 0.5));
          sat = s >= 0 ? sat + (1 - sat) * s * sat : sat * (1 + s);
          hslToRgb(hsl[0], clamp01(sat), hsl[2], c);
        }
      };
    }
    case 'blackWhite': {
      const W = { r: adj.reds / 100, y: adj.yellows / 100, g: adj.greens / 100, c: adj.cyans / 100, b: adj.blues / 100, m: adj.magentas / 100 };
      const tint = adj.tint;
      return c => {
        const [r, g, b] = c; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), mid = r + g + b - mx - mn;
        const prim = mx === r ? W.r : mx === g ? W.g : W.b;
        const sec = mn === b ? W.y : mn === r ? W.c : W.m;
        const gray = clamp01(mn + (mid - mn) * sec + (mx - mid) * prim);
        if (tint) { hslToRgb(tint.hue, clamp01(tint.saturation / 100), gray, c); const d = gray - luma601(c[0], c[1], c[2]); for (let i = 0; i < 3; i++) c[i] = clamp01(c[i] + d); }
        else c[0] = c[1] = c[2] = gray;
      };
    }
    case 'photoFilter': {
      const F = adj.color.map(v => v / 255), dn = adj.density;
      return c => {
        const l0 = wLum(c[0], c[1], c[2]);
        for (let i = 0; i < 3; i++) c[i] = c[i] * (1 - dn) + c[i] * F[i] * dn;
        if (adj.preserveLuminosity) { const d = l0 - wLum(c[0], c[1], c[2]); for (let i = 0; i < 3; i++) c[i] = clamp01(c[i] + d); }
      };
    }
    case 'channelMixer': {
      const R = adj.red.map(v => v / 100), G = adj.green.map(v => v / 100), B = adj.blue.map(v => v / 100);
      return c => {
        const r = c[0], g = c[1], b = c[2];
        const nr = clamp01(R[0] * r + R[1] * g + R[2] * b + R[3]);
        if (adj.monochrome) { c[0] = c[1] = c[2] = nr; return; }
        c[0] = nr; c[1] = clamp01(G[0] * r + G[1] * g + G[2] * b + G[3]); c[2] = clamp01(B[0] * r + B[1] * g + B[2] * b + B[3]);
      };
    }
    case 'gradientMap': {
      const n = 4096, lut = gradientLut(adj.gradient, n, adj.reverse);
      return c => { const i = Math.round(clamp01(wLum(c[0], c[1], c[2])) * (n - 1)) * 4; c[0] = lut[i]; c[1] = lut[i + 1]; c[2] = lut[i + 2]; };
    }
    case 'selectiveColor': {
      const fams = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'] as const;
      const active = fams.filter(f => adj[f] && (adj[f] as CMYKAdjust).some(v => v !== 0));
      const rel = adj.method === 'relative';
      return c => {
        if (!active.length) return;
        const w = selectiveWeights(c[0], c[1], c[2]);
        const cmy = [1 - c[0], 1 - c[1], 1 - c[2]];
        const delta = [0, 0, 0];
        for (const f of active) {
          const wt = w[f]; if (wt <= 0) continue; const a = adj[f] as CMYKAdjust; const k = a[3] / 100;
          for (let i = 0; i < 3; i++) {
            const base = cmy[i]; const amt = a[i] / 100;
            let d = rel ? amt * base : amt;
            d += k >= 0 ? k * (rel ? base : 1) * (1 - base) : k * base;
            delta[i] += d * wt;
          }
        }
        for (let i = 0; i < 3; i++) c[i] = clamp01(1 - clamp01(cmy[i] + delta[i]));
      };
    }
    case 'lut3d': {
      const lut = cubeFor(adj); const s = adj.strength ?? 1; const o = [0, 0, 0];
      if (!lut) return () => {};
      return c => { sampleCube(lut, c[0], c[1], c[2], o); for (let i = 0; i < 3; i++) c[i] = clamp01(c[i] + (o[i] - c[i]) * s); };
    }
  }
}

/** True when the function is smooth enough to bake into a 3D LUT texture for the GPU. */
export function isLutSafe(adj: Adjustment): boolean { return !['posterize', 'threshold', 'invert', 'levels', 'curves', 'exposure', 'cssColor', 'channelMixer', 'gradientMap', 'lut3d'].includes(adj.type); }

/** Bake any colour function into an N³ RGBA float LUT (R fastest) — GPU path for complex adjustments. */
export function bakeLut3d(fn: ColorFn, n = 64): Float32Array {
  const out = new Float32Array(n * n * n * 4), c = [0, 0, 0];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    c[0] = r / (n - 1); c[1] = g / (n - 1); c[2] = b / (n - 1); fn(c);
    const i = ((b * n + g) * n + r) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 1;
  }
  return out;
}

/**
 * Apply an adjustment to a premultiplied raster in place: result = lerp(Cb, Adj(Cb), k)
 * where k = opacity × coverage; alpha untouched. `linear` = the raster holds linear-light
 * values (document blendSpace 'linear') so we encode → adjust → decode.
 */
export function applyAdjustmentRaster(r: RasterF, fn: ColorFn, opacity = 1, coverage: Float32Array | null = null, linear = false): void {
  const d = r.data, c = [0, 0, 0];
  for (let p = 0, i = 0; i < d.length; p++, i += 4) {
    const a = d[i + 3]; if (a <= 0) continue;
    const k = coverage ? opacity * coverage[p] : opacity; if (k <= 0) continue;
    const ia = 1 / a;
    for (let j = 0; j < 3; j++) { const v = clamp01(d[i + j] * ia); c[j] = linear ? linearToSrgb(v) : v; }
    const o0 = c[0], o1 = c[1], o2 = c[2];
    fn(c);
    for (let j = 0; j < 3; j++) { let v = (j === 0 ? o0 : j === 1 ? o1 : o2) * (1 - k) + c[j] * k; if (linear) v = srgbToLinear(v); d[i + j] = v * a; }
  }
}
export { SRGB8_TO_LINEAR };
