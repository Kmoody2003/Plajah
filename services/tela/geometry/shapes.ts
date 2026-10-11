// shapes — primitive shapes as compound paths (what Illustrator's shape tools emit).
//
// Ellipses use the standard 4-cubic approximation (κ = 0.5522847498, radial error
// 2.7e-4 r). Rounded corners are true quarter-ellipse cubics clamped so neighbouring radii
// never overlap (Illustrator's live-corner behaviour). Polygon / star corners can be
// rounded too, which is what makes procedural art read "designed" rather than "default".
import type { Vec } from './vec';
import type { Anchor, CompoundPath } from './model';

export const KAPPA = 0.5522847498307936;

export interface RectRadii { tl: number; tr: number; br: number; bl: number }

/** Rectangle; `r` = one radius or per-corner { tl, tr, br, bl }. Clockwise on screen from top-left. */
export function rectPath(x: number, y: number, w: number, h: number, r: number | Partial<RectRadii> = 0): CompoundPath {
  const R = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : { tl: r.tl ?? 0, tr: r.tr ?? 0, br: r.br ?? 0, bl: r.bl ?? 0 };
  // CSS-style clamping: scale all radii so adjacent pairs fit the side.
  const f = Math.min(1, w / Math.max(1e-12, R.tl + R.tr), w / Math.max(1e-12, R.bl + R.br), h / Math.max(1e-12, R.tl + R.bl), h / Math.max(1e-12, R.tr + R.br));
  const tl = Math.max(0, R.tl * f), tr = Math.max(0, R.tr * f), br = Math.max(0, R.br * f), bl = Math.max(0, R.bl * f);
  const A: Anchor[] = []; const k = KAPPA;
  const corner = (r0: number, px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    // corner point (px,py); arrive along direction a, leave along direction b
    if (r0 <= 1e-12) { A.push({ x: px, y: py, kind: 'corner' }); return; }
    const s = { x: px - ax * r0, y: py - ay * r0 }, e = { x: px + bx * r0, y: py + by * r0 };
    A.push({ x: s.x, y: s.y, hout: { x: s.x + ax * r0 * k, y: s.y + ay * r0 * k }, kind: 'corner' });
    A.push({ x: e.x, y: e.y, hin: { x: e.x - bx * r0 * k, y: e.y - by * r0 * k }, kind: 'corner' });
  };
  corner(tl, x, y, 0, -1, 1, 0);
  corner(tr, x + w, y, 1, 0, 0, 1);
  corner(br, x + w, y + h, 0, 1, -1, 0);
  corner(bl, x, y + h, -1, 0, 0, -1);
  return { fillRule: 'nonzero', subpaths: [{ anchors: A, closed: true }] };
}

/** Ellipse inscribed in a box, or by centre/radii via ellipseAt. Starts at the right-most point, clockwise on screen. */
export function ellipsePath(x: number, y: number, w: number, h: number): CompoundPath { return ellipseAt(x + w / 2, y + h / 2, w / 2, h / 2); }
export function ellipseAt(cx: number, cy: number, rx: number, ry: number, rotDeg = 0): CompoundPath {
  const k = KAPPA; const a = rotDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const T = (px: number, py: number): Vec => ({ x: cx + px * c - py * s, y: cy + px * s + py * c });
  const mk = (px: number, py: number, ix: number, iy: number, ox: number, oy: number): Anchor => { const p = T(px, py); return { x: p.x, y: p.y, hin: T(ix, iy), hout: T(ox, oy), kind: 'symmetric' }; };
  return { fillRule: 'nonzero', subpaths: [{ closed: true, anchors: [
    mk(rx, 0, rx, -ry * k, rx, ry * k),
    mk(0, ry, rx * k, ry, -rx * k, ry),
    mk(-rx, 0, -rx, ry * k, -rx, -ry * k),
    mk(0, -ry, -rx * k, -ry, rx * k, -ry),
  ] }] };
}
export const circlePath = (cx: number, cy: number, r: number) => ellipseAt(cx, cy, r, r);

/** Round the corners of a closed polyline with radius r (per vertex array or one value). */
export function roundedPolygon(pts: Vec[], r: number | number[]): CompoundPath {
  const n = pts.length; const A: Anchor[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const ri = Array.isArray(r) ? (r[i] ?? 0) : r;
    const la = Math.hypot(a.x - p.x, a.y - p.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    if (ri <= 0 || la < 1e-9 || lb < 1e-9) { A.push({ x: p.x, y: p.y, kind: 'corner' }); continue; }
    const ua = { x: (a.x - p.x) / la, y: (a.y - p.y) / la }, ub = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb };
    const cosT = Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y)); const th = Math.acos(cosT); // interior angle
    if (th < 1e-6 || Math.PI - th < 1e-6) { A.push({ x: p.x, y: p.y, kind: 'corner' }); continue; }
    let tdist = ri / Math.tan(th / 2); tdist = Math.min(tdist, la / 2, lb / 2);
    const rr = tdist * Math.tan(th / 2); const sweep = Math.PI - th; const hk = 4 / 3 * Math.tan(sweep / 4) * rr;
    const s = { x: p.x + ua.x * tdist, y: p.y + ua.y * tdist }, e = { x: p.x + ub.x * tdist, y: p.y + ub.y * tdist };
    A.push({ x: s.x, y: s.y, hout: { x: s.x - ua.x * hk, y: s.y - ua.y * hk }, kind: 'corner' });
    A.push({ x: e.x, y: e.y, hin: { x: e.x - ub.x * hk, y: e.y - ub.y * hk }, kind: 'corner' });
  }
  return { fillRule: 'nonzero', subpaths: [{ anchors: A, closed: true }] };
}

/** Regular polygon (first vertex at `rotDeg`, default pointing up). */
export function polygonPath(cx: number, cy: number, r: number, sides: number, rotDeg = -90, cornerRadius = 0): CompoundPath {
  const pts: Vec[] = []; for (let i = 0; i < sides; i++) { const a = (rotDeg + i * 360 / sides) * Math.PI / 180; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return cornerRadius > 0 ? roundedPolygon(pts, cornerRadius) : polyPath(pts, true);
}
/** Star with `points` tips, outer radius r1, inner r2. */
export function starPath(cx: number, cy: number, r1: number, r2: number, points = 5, rotDeg = -90, cornerRadius = 0): CompoundPath {
  const pts: Vec[] = []; for (let i = 0; i < points * 2; i++) { const a = (rotDeg + i * 180 / points) * Math.PI / 180, r = i % 2 ? r2 : r1; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  return cornerRadius > 0 ? roundedPolygon(pts, cornerRadius) : polyPath(pts, true);
}
/**
 * Spiral (Illustrator's tool): `segments` quarter-turns, the radius multiplied by `decay`
 * each quarter-turn (a logarithmic spiral), one cubic per quarter with Hermite handles
 * scaled by the circle-optimal 4/3·tan(Δ/4) factor. Starts on the OUTSIDE and winds in.
 */
export function spiralPath(cx: number, cy: number, radius: number, decay = .8, segments = 10, clockwise = true, startDeg = 0): CompoundPath {
  const A: Anchor[] = []; const dir = clockwise ? 1 : -1; const D = Math.PI / 2; const lnk = Math.log(Math.max(1e-6, decay)) / D;
  const th0 = startDeg * Math.PI / 180; const hk = 4 / 3 * Math.tan(D / 4);
  const P = (u: number) => { const r = radius * Math.exp(lnk * u), a = th0 + dir * u; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; };
  const dP = (u: number) => { const r = radius * Math.exp(lnk * u), a = th0 + dir * u; return { x: lnk * r * Math.cos(a) - dir * r * Math.sin(a), y: lnk * r * Math.sin(a) + dir * r * Math.cos(a) }; };
  for (let i = 0; i <= segments; i++) {
    const u = i * D; const p = P(u), d = dP(u); const a: Anchor = { x: p.x, y: p.y, kind: i === 0 || i === segments ? 'corner' : 'smooth' };
    if (i > 0) a.hin = { x: p.x - d.x * hk, y: p.y - d.y * hk };
    if (i < segments) a.hout = { x: p.x + d.x * hk, y: p.y + d.y * hk };
    A.push(a);
  }
  return { fillRule: 'nonzero', subpaths: [{ anchors: A, closed: false }] };
}
/** Straight polyline/polygon from points. */
export function polyPath(pts: Vec[], closed: boolean): CompoundPath {
  return { fillRule: 'nonzero', subpaths: pts.length ? [{ closed, anchors: pts.map(p => ({ x: p.x, y: p.y, kind: 'corner' as const })) }] : [] };
}
export const linePath = (x1: number, y1: number, x2: number, y2: number): CompoundPath => polyPath([{ x: x1, y: y1 }, { x: x2, y: y2 }], false);

/**
 * Smooth closed/open curve THROUGH points (centripetal Catmull-Rom → cubic). The
 * workhorse for organic procedural shapes: give it a few jittered points, get a curve.
 * `tension` 0..1 (0.5 = classic Catmull-Rom).
 */
export function smoothThrough(pts: Vec[], closed: boolean, tension = .5): CompoundPath {
  const n = pts.length; if (n < 2) return polyPath(pts, closed);
  const P = (i: number) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const A: Anchor[] = pts.map(p => ({ x: p.x, y: p.y, kind: 'smooth' as const }));
  const k = tension * 2 / 3; // 0.5 → each handle is 1/3 of its adjacent chord (classic Catmull–Rom)
  for (let i = 0; i < n; i++) {
    const a = P(i - 1), b = P(i + 1), p = pts[i];
    if (!closed && (i === 0 || i === n - 1)) {
      const q = i === 0 ? pts[1] : pts[n - 2]; const dx = (q.x - p.x) * k, dy = (q.y - p.y) * k;
      if (i === 0) A[i].hout = { x: p.x + dx, y: p.y + dy }; else A[i].hin = { x: p.x + dx, y: p.y + dy };
      A[i].kind = 'corner'; continue;
    }
    // centripetal scaling: handle length ∝ neighbouring chord lengths
    const tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
    const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const ux = tx / tl, uy = ty / tl;
    A[i].hin = { x: p.x - ux * la * k, y: p.y - uy * la * k };
    A[i].hout = { x: p.x + ux * lb * k, y: p.y + uy * lb * k };
  }
  return { fillRule: 'nonzero', subpaths: [{ anchors: A, closed }] };
}
