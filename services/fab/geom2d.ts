// 2D geometry for fabrication: polygons, offsetting (tool radius / kerf compensation), and turning
// CAD drawing entities into closed cut loops and open paths. Our own code, no clipping library.

import type { CadEntity2D, Vec3 } from '../cad/model';

export type P2 = [number, number];
export type Loop = P2[]; // closed; last point is not repeated

export const area = (l: Loop) => { let s = 0; for (let i = 0, j = l.length - 1; i < l.length; j = i++) s += (l[j][0] - l[i][0]) * (l[j][1] + l[i][1]); return s / 2; }; // > 0 = counter-clockwise (y up)
export const ccw = (l: Loop) => (area(l) >= 0 ? l : [...l].reverse());
export const cw = (l: Loop) => (area(l) < 0 ? l : [...l].reverse());
export const perimeter = (l: Loop, closed = true) => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); if (closed && l.length > 1) s += Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]); return s; };

export function pointInLoop(p: P2, l: Loop): boolean {
  let inside = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) { const [xi, yi] = l[i], [xj, yj] = l[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
export function distToSeg(p: P2, a: P2, b: P2) { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
export function distToLoop(p: P2, l: Loop) { let d = Infinity; for (let i = 0, j = l.length - 1; i < l.length; j = i++) d = Math.min(d, distToSeg(p, l[j], l[i])); return d; }

/** Remove duplicate and collinear points. */
export function clean(l: Loop, eps = 1e-6): Loop {
  const out: Loop = [];
  for (const p of l) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > eps) out.push(p);
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) { const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length]; if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < eps * eps * 10) { out.splice(i, 1); changed = true; break; } }
  }
  return out;
}

function segX(a: P2, b: P2, c: P2, d: P2): [number, number, P2] | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]]; const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return [t, u, [a[0] + t * r[0], a[1] + t * r[1]]];
}

/** Split a self-intersecting loop into simple loops. */
export function untangle(l: Loop, depth = 0): Loop[] {
  if (l.length < 3 || depth > 200) return l.length >= 3 ? [l] : [];
  const n = l.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const x = segX(l[i], l[(i + 1) % n], l[j], l[(j + 1) % n]); if (!x) continue;
    const a: Loop = [x[2], ...l.slice(i + 1, j + 1)], b: Loop = [x[2], ...l.slice(j + 1), ...l.slice(0, i + 1)];
    return [...untangle(a, depth + 1), ...untangle(b, depth + 1)];
  }
  return [l];
}

/** Offset a closed loop by d (positive = outward, negative = inward). Mitre joins, bevelled past
 *  2·|d|; self-intersections are split and loops that come closer than |d| to the source dropped. */
export function offset(src: Loop, d: number, arcSteps = 6): Loop[] {
  const l = ccw(clean(src)); const n = l.length; if (n < 3 || d === 0) return n >= 3 ? [l] : [];
  const out: Loop = [];
  for (let i = 0; i < n; i++) {
    const a = l[(i + n - 1) % n], b = l[i], c = l[(i + 1) % n];
    const n1 = norm([b[1] - a[1], a[0] - b[0]]), n2 = norm([c[1] - b[1], b[0] - c[0]]); // outward normals for CCW
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const convexOut = (turn > 0) === (d > 0); // corners the offset goes around get an arc; the others a mitre
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]); const cosHalf = bis[0] * n1[0] + bis[1] * n1[1];
    if (!convexOut && cosHalf > 0.25) { const k = d / cosHalf; out.push([b[0] + bis[0] * k, b[1] + bis[1] * k]); continue; }
    // Arc join around the corner (keeps true tool-radius geometry on outside corners).
    const a0 = Math.atan2(n1[1], n1[0]); let a1 = Math.atan2(n2[1], n2[0]); let sweep = a1 - a0; while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) * arcSteps)); a1 = a0 + sweep;
    for (let s = 0; s <= steps; s++) { const t = a0 + (a1 - a0) * s / steps; out.push([b[0] + Math.cos(t) * Math.abs(d) * Math.sign(d), b[1] + Math.sin(t) * Math.abs(d) * Math.sign(d)]); }
  }
  const loops = untangle(clean(out)).filter(x => x.length >= 3 && area(x) > 1e-9);
  return loops.filter(x => { const probe = x.filter((_, i) => i % Math.max(1, Math.floor(x.length / 12)) === 0); return probe.every(p => distToLoop(p, l) >= Math.abs(d) * 0.98); });
}
const norm = (v: P2): P2 => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };

/** Group loops into regions: each outer boundary with the holes directly inside it. */
export function regions(loops: Loop[]): Array<{ outer: Loop; holes: Loop[] }> {
  const items = loops.map(l => ({ l: ccw(l), a: Math.abs(area(l)) })).sort((x, y) => y.a - x.a);
  const depth = items.map((it, i) => items.slice(0, i).filter(o => pointInLoop(it.l[0], o.l)).length);
  const out: Array<{ outer: Loop; holes: Loop[] }> = [];
  items.forEach((it, i) => { if (depth[i] % 2 === 0) out.push({ outer: it.l, holes: [] }); });
  items.forEach((it, i) => { if (depth[i] % 2 === 1) { const host = out.filter(r => pointInLoop(it.l[0], r.outer)).sort((a, b) => Math.abs(area(a.outer)) - Math.abs(area(b.outer)))[0]; host?.holes.push(cw(it.l)); } });
  return out;
}

// ---- CAD entities to paths ----
function arcPts(c: Vec3, r: number, a0: number, a1: number, tol: number): P2[] {
  while (a1 <= a0) a1 += 2 * Math.PI; const steps = Math.max(8, Math.ceil((a1 - a0) / (2 * Math.acos(Math.max(-1, 1 - tol / Math.max(r, tol))))));
  return Array.from({ length: steps + 1 }, (_, i) => { const t = a0 + (a1 - a0) * i / steps; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as P2; });
}
function bulgePts(a: Vec3, b: Vec3, bulge: number, tol: number): P2[] {
  if (!bulge) return [[b[0], b[1]]];
  const th = 4 * Math.atan(bulge); const ch = Math.hypot(b[0] - a[0], b[1] - a[1]); const r = ch / (2 * Math.sin(th / 2));
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const h = r * Math.cos(th / 2); const ux = -(b[1] - a[1]) / ch, uy = (b[0] - a[0]) / ch;
  const cx = mx + ux * h, cy = my + uy * h; const a0 = Math.atan2(a[1] - cy, a[0] - cx);
  const steps = Math.max(4, Math.ceil(Math.abs(th) / (2 * Math.acos(Math.max(-1, 1 - tol / Math.abs(r))))));
  return Array.from({ length: steps }, (_, i) => { const t = a0 + th * (i + 1) / steps; return [cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)] as P2; });
}

/** Closed loops (cut outlines, holes) and open paths (engrave/score lines) from 2D entities. Lines and
 *  arcs that join end to end are chained, so a shape drawn as separate segments still cuts as a loop. */
export function entitiesToPaths(ents: CadEntity2D[], tol = 0.05): { loops: Loop[]; open: P2[][] } {
  const loops: Loop[] = []; const pieces: P2[][] = [];
  for (const e of ents) {
    switch (e.type) {
      case 'circle': loops.push(arcPts(e.c, e.r, 0, 2 * Math.PI, tol).slice(0, -1)); break;
      case 'line': pieces.push([[e.a[0], e.a[1]], [e.b[0], e.b[1]]]); break;
      case 'arc': pieces.push(arcPts(e.c, e.r, e.start * Math.PI / 180, e.end * Math.PI / 180, tol)); break;
      case 'polyline': {
        const pts: P2[] = [[e.points[0][0], e.points[0][1]]]; const n = e.points.length;
        for (let i = 1; i < n + (e.closed ? 1 : 0); i++) pts.push(...bulgePts(e.points[i - 1], e.points[i % n], e.bulges?.[i - 1] ?? 0, tol));
        if (e.closed) loops.push(clean(pts)); else pieces.push(pts); break;
      }
      case 'ellipse': { const L = Math.hypot(e.major[0], e.major[1]); const rot = Math.atan2(e.major[1], e.major[0]); let a1 = e.end; while (a1 <= e.start) a1 += 2 * Math.PI; const steps = 72;
        const pts = Array.from({ length: steps + 1 }, (_, i) => { const t = e.start + (a1 - e.start) * i / steps; const x = L * Math.cos(t), y = L * e.ratio * Math.sin(t); return [e.c[0] + x * Math.cos(rot) - y * Math.sin(rot), e.c[1] + x * Math.sin(rot) + y * Math.cos(rot)] as P2; });
        if (Math.abs(a1 - e.start - 2 * Math.PI) < 1e-6) loops.push(pts.slice(0, -1)); else pieces.push(pts); break; }
      case 'spline': { const pts = e.points.map(p => [p[0], p[1]] as P2); if (e.closed) loops.push(pts); else pieces.push(pts); break; }
      default: break; // text, dimensions, hatches, inserts are not cut geometry
    }
  }
  // Chain open pieces end to end.
  const key = (p: P2) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`; const used = new Set<number>(); const open: P2[][] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (used.has(i)) continue; used.add(i); let chain = [...pieces[i]]; let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < pieces.length; j++) {
        if (used.has(j)) continue; const p = pieces[j]; const end = key(chain[chain.length - 1]), start = key(chain[0]);
        if (key(p[0]) === end) chain = [...chain, ...p.slice(1)]; else if (key(p[p.length - 1]) === end) chain = [...chain, ...[...p].reverse().slice(1)];
        else if (key(p[p.length - 1]) === start) chain = [...p.slice(0, -1), ...chain]; else if (key(p[0]) === start) chain = [...[...p].reverse().slice(0, -1), ...chain]; else continue;
        used.add(j); grew = true;
      }
    }
    if (chain.length > 2 && key(chain[0]) === key(chain[chain.length - 1])) loops.push(clean(chain.slice(0, -1))); else open.push(chain);
  }
  return { loops: loops.filter(l => l.length >= 3), open };
}
