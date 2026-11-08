// Hatch patterns: parallel line families clipped to the boundary (even-odd, so holes work).
// Spacings follow the standard AutoCAD/ISO pattern definitions at scale 1:
//   ANSI31  45° lines, 3.175 apart (general cut / brick in section)
//   ANSI37  ANSI31 crossed at 135° (cross-hatch)
//   NET     0° and 90° grid, 3.175 apart
//   AR-BRSTD / BRICK  running bond: courses 67.7 apart, joints every 203.2, staggered half a brick
//   LINE    horizontal lines, 3.175 apart

export type Pt = [number, number];
export interface HatchStroke { a: Pt; b: Pt }

export const HATCH_PATTERNS = ['SOLID', 'ANSI31', 'ANSI37', 'NET', 'AR-BRSTD', 'LINE'] as const;
export type HatchPattern = typeof HATCH_PATTERNS[number];
export const HATCH_LABELS: Record<HatchPattern, string> = { SOLID: 'Solid fill', ANSI31: 'Diagonal (ANSI31)', ANSI37: 'Cross-hatch (ANSI37)', NET: 'Grid (NET)', 'AR-BRSTD': 'Brick, running bond', LINE: 'Horizontal lines' };

function insideEvenOdd(p: Pt, loops: Pt[][]): boolean {
  let inside = false;
  for (const poly of loops) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Pieces of segment a-b that lie inside the boundary. */
export function clipSegment(a: Pt, b: Pt, loops: Pt[][]): HatchStroke[] {
  const ts = [0, 1]; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const poly of loops) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[j], q = poly[i]; const ex = q[0] - p[0], ey = q[1] - p[1]; const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-15) continue;
    const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den, u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: HatchStroke[] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-9) continue;
    const m = (t0 + t1) / 2; if (!insideEvenOdd([a[0] + dx * m, a[1] + dy * m], loops)) continue;
    out.push({ a: [a[0] + dx * t0, a[1] + dy * t0], b: [a[0] + dx * t1, a[1] + dy * t1] });
  }
  return out;
}

/** One family of parallel lines at `angle` (deg), `spacing` apart, through `origin`, clipped to the loops. */
function family(loops: Pt[][], angle: number, spacing: number, origin: Pt = [0, 0], dash?: { on: number; period: number; shift: number }): HatchStroke[] {
  const r = angle * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r), nx = -uy, ny = ux;
  let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
  for (const poly of loops) for (const [x, y] of poly) { const s = (x - origin[0]) * nx + (y - origin[1]) * ny, t = (x - origin[0]) * ux + (y - origin[1]) * uy; smin = Math.min(smin, s); smax = Math.max(smax, s); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
  if (!Number.isFinite(smin) || spacing <= 0) return [];
  const count = (smax - smin) / spacing; if (count > 4000) spacing = (smax - smin) / 4000; // keep huge areas drawable
  const out: HatchStroke[] = [];
  for (let k = Math.ceil(smin / spacing); k * spacing <= smax; k++) {
    const s = k * spacing; const base: Pt = [origin[0] + nx * s, origin[1] + ny * s];
    if (!dash) { out.push(...clipSegment([base[0] + ux * (tmin - 1), base[1] + uy * (tmin - 1)], [base[0] + ux * (tmax + 1), base[1] + uy * (tmax + 1)], loops)); continue; }
    const shift = (k % 2) * dash.shift;
    for (let t = Math.floor((tmin - shift) / dash.period) * dash.period + shift; t <= tmax; t += dash.period) {
      out.push(...clipSegment([base[0] + ux * t, base[1] + uy * t], [base[0] + ux * (t + dash.on), base[1] + uy * (t + dash.on)], loops));
    }
  }
  return out;
}

/** Strokes for a named pattern; unknown patterns get ANSI31 so they still read as hatched. */
export function hatchStrokes(loops: Pt[][], pattern: string, scale = 1, angle = 0): HatchStroke[] {
  const s = Math.max(1e-9, scale); const p = pattern.toUpperCase();
  switch (p) {
    case 'SOLID': return [];
    case 'ANSI37': return [...family(loops, 45 + angle, 3.175 * s), ...family(loops, 135 + angle, 3.175 * s)];
    case 'NET': return [...family(loops, angle, 3.175 * s), ...family(loops, 90 + angle, 3.175 * s)];
    case 'LINE': return family(loops, angle, 3.175 * s);
    case 'AR-BRSTD': case 'BRICK': case 'AR-B816': {
      const course = 67.7 * s, brick = 203.2 * s;
      // Bed joints, then the head joints of each course offset by half a brick.
      const beds = family(loops, angle, course);
      const r = angle * Math.PI / 180; const heads: HatchStroke[] = [];
      const ux = Math.cos(r), uy = Math.sin(r), nx = -uy, ny = ux;
      let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
      for (const poly of loops) for (const [x, y] of poly) { const sv = x * nx + y * ny, tv = x * ux + y * uy; smin = Math.min(smin, sv); smax = Math.max(smax, sv); tmin = Math.min(tmin, tv); tmax = Math.max(tmax, tv); }
      if (Number.isFinite(smin) && (smax - smin) / course < 2000 && (tmax - tmin) / brick < 2000) {
        for (let k = Math.floor(smin / course); k * course <= smax; k++) {
          const off = (k % 2 === 0 ? 0 : brick / 2);
          for (let t = Math.floor((tmin - off) / brick) * brick + off; t <= tmax; t += brick) {
            const a: Pt = [ux * t + nx * k * course, uy * t + ny * k * course], b: Pt = [a[0] + nx * course, a[1] + ny * course];
            heads.push(...clipSegment(a, b, loops));
          }
        }
      }
      return [...beds, ...heads];
    }
    default: return family(loops, 45 + angle, 3.175 * s);
  }
}
