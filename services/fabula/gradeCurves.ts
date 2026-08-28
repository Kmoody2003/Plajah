// ═══════════════════════════════════════════════════════════════════════════
// gradeCurves — tone-curve model + LUT builder, shared by EVERY render path so
// the live grade monitor, the offline MP4 render and the GL compositor agree.
//
// A curve is a short list of control points [x, y] in 0..1, sorted by x. The
// implicit endpoints (0,0) and (1,1) mean "empty curve == identity". The
// compositor samples a prebuilt 256×RGBA LUT (per-channel in R/G/B, master in
// alpha) so a curve costs six texture reads in-shader and nothing on the CPU.
//
// Catmull-Rom through the points (clamped to 0..1) — smooth like a real grading
// curve, and the SAME evaluator the color-room editor draws, so what you draw is
// what samples. This is the first of the "structural hole" grading primitives
// (see docs/fabula/EDIT_COLOR_FX_GAP_PLAN.md §3.1).
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

/** An empty / straight-diagonal curve — nothing to apply. */
export function isCurveIdentity(pts?: CurvePoint[] | null): boolean {
  if (!pts || pts.length === 0) return true;
  // Every point sits on y = x → identity.
  return pts.every((p) => Math.abs(p[0] - p[1]) < 1e-4);
}

export function isCurvesIdentity(c?: Curves | null): boolean {
  if (!c) return true;
  return isCurveIdentity(c.master) && isCurveIdentity(c.r) && isCurveIdentity(c.g) && isCurveIdentity(c.b);
}

/** Full control-point list with the implied endpoints, sorted, de-duped by x. */
function normalized(pts?: CurvePoint[] | null): CurvePoint[] {
  const list: CurvePoint[] = (pts || []).map((p) => [clamp01(p[0]), clamp01(p[1])] as CurvePoint);
  if (!list.some((p) => p[0] <= 0.0001)) list.unshift([0, 0]);
  if (!list.some((p) => p[0] >= 0.9999)) list.push([1, 1]);
  list.sort((a, b) => a[0] - b[0]);
  // collapse duplicate x (keep the last y set for that x)
  const out: CurvePoint[] = [];
  for (const p of list) {
    if (out.length && Math.abs(out[out.length - 1][0] - p[0]) < 1e-4) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Evaluate a curve at x∈[0,1] via Catmull-Rom through the control points. */
export function evalCurve(pts: CurvePoint[] | null | undefined, x: number): number {
  if (isCurveIdentity(pts)) return clamp01(x);
  const p = normalized(pts);
  x = clamp01(x);
  // locate the segment [p[i], p[i+1]] containing x
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

/** Sample a curve into a Float32Array(256) of output values — for the JS scope/preview path. */
export function curveTable(pts?: CurvePoint[] | null): Float32Array {
  const out = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) out[i] = evalCurve(pts, i / (LUT_SIZE - 1));
  return out;
}

/**
 * Build the GPU LUT: a 256×1 RGBA8 image where each texel i encodes the graded
 * output for input level i — R/G/B carry the per-channel curves, A carries the
 * master curve. The shader applies per-channel first, then master, in two passes.
 * Returns a Uint8Array of length 256*4 = 1024.
 */
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
