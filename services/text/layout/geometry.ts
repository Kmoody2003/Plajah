// geometry — text wrap: which horizontal intervals of a column band are free of exclusions.
//
// Each exclusion is a shape in the same coordinates as the frames (page px) with a standoff
// offset and a wrap side, InDesign-style. For a line band [y0, y1] we compute the shape's
// horizontal extent over the band (exact for rects/circles/ellipses, clipped-edge extent for
// contour polygons), then subtract per wrap side. Intervals narrower than `minWidth` are dropped
// so text never threads through slivers.

export type WrapShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  /** Contour polygon, flat [x0, y0, x1, y1, …]. */
  | { kind: 'polygon'; points: number[] };

export interface Exclusion {
  shape: WrapShape;
  /** Standoff in px. */
  offset?: number;
  /** both = text on both sides; left/right = only that side; largest = the roomier side; jump = no text beside it. */
  side?: 'both' | 'left' | 'right' | 'largest' | 'jump';
}

export interface Interval { x: number; width: number }

function ellipseExtent(cx: number, cy: number, rx: number, ry: number, y0: number, y1: number): [number, number] | null {
  if (y1 < cy - ry || y0 > cy + ry) return null;
  const dy = cy >= y0 && cy <= y1 ? 0 : Math.min(Math.abs(y0 - cy), Math.abs(y1 - cy));
  const t = 1 - (dy * dy) / (ry * ry);
  if (t <= 0) return null;
  const half = rx * Math.sqrt(t);
  return [cx - half, cx + half];
}

/** Horizontal extent of a shape (inflated by `off`) over the band [y0, y1], or null. */
export function shapeExtent(s: WrapShape, off: number, y0: number, y1: number): [number, number] | null {
  switch (s.kind) {
    case 'rect': {
      if (y1 < s.y - off || y0 > s.y + s.h + off) return null;
      return [s.x - off, s.x + s.w + off];
    }
    case 'circle': return ellipseExtent(s.cx, s.cy, s.r + off, s.r + off, y0, y1);
    case 'ellipse': return ellipseExtent(s.cx, s.cy, s.rx + off, s.ry + off, y0, y1);
    case 'polygon': {
      const p = s.points;
      const a = y0 - off, b = y1 + off;
      let lo = Infinity, hi = -Infinity;
      const n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const x1 = p[i * 2], ya = p[i * 2 + 1];
        const x2 = p[((i + 1) % n) * 2], yb = p[((i + 1) % n) * 2 + 1];
        if (ya >= a && ya <= b) { lo = Math.min(lo, x1); hi = Math.max(hi, x1); }
        if ((ya < a && yb < a) || (ya > b && yb > b)) continue;
        for (const yc of [a, b]) {
          if ((ya - yc) * (yb - yc) <= 0 && ya !== yb) {
            const x = x1 + ((yc - ya) / (yb - ya)) * (x2 - x1);
            lo = Math.min(lo, x); hi = Math.max(hi, x);
          }
        }
      }
      return lo <= hi ? [lo - off, hi + off] : null;
    }
  }
}

/** Free intervals of [x0, x1] for the band [y0, y1]. */
export function freeIntervals(x0: number, x1: number, y0: number, y1: number, exclusions: Exclusion[] | undefined, minWidth: number): Interval[] {
  const blocked: [number, number][] = [];
  for (const e of exclusions ?? []) {
    const ext = shapeExtent(e.shape, e.offset ?? 0, y0, y1);
    if (!ext) continue;
    const [a, b] = ext;
    if (b <= x0 || a >= x1) continue;
    switch (e.side ?? 'both') {
      case 'both': blocked.push([a, b]); break;
      case 'left': blocked.push([a, x1]); break;
      case 'right': blocked.push([x0, b]); break;
      case 'jump': blocked.push([x0, x1]); break;
      case 'largest': (a - x0 >= x1 - b) ? blocked.push([a, x1]) : blocked.push([x0, b]); break;
    }
  }
  blocked.sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [];
  let cur = x0;
  for (const [a, b] of blocked) {
    if (a > cur && a - cur >= minWidth) out.push({ x: cur, width: Math.min(a, x1) - cur });
    cur = Math.max(cur, b);
    if (cur >= x1) break;
  }
  if (x1 - cur >= minWidth) out.push({ x: cur, width: x1 - cur });
  return out;
}
