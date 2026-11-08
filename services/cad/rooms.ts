// Rooms from walls: the wall centrelines form a planar graph; its enclosed faces are rooms.
// Each room's net polygon is the face pulled in by half of each bounding wall's thickness,
// so its area is the floor area inside the wall faces. Room tags inside a face name it.

import type { CadEntity2D } from './model';

type P = [number, number];
type Wall = Extract<CadEntity2D, { type: 'wall' }>;
type Tag = Extract<CadEntity2D, { type: 'room' }>;

export interface Room {
  id: string;
  /** Centreline polygon (counter-clockwise) and the net polygon inside the wall faces. */
  outline: P[]; net: P[];
  area: number; perimeter: number; grossArea: number;
  centroid: P;
  name?: string; number?: string; tagIndex?: number;
}

const key = (p: P, tol: number) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
export const polyArea = (pts: P[]) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
export function pointInPoly(p: P, poly: P[]) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }

function segX(a: P, b: P, c: P, d: P): number | null {
  const r: P = [b[0] - a[0], b[1] - a[1]], s: P = [d[0] - c[0], d[1] - c[1]]; const den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

/** Offset a CCW polygon inward by a distance per edge (edge i runs from pts[i] to pts[i+1]). */
function insetPolygon(pts: P[], dist: number[]): P[] {
  const n = pts.length; const lines = pts.map((a, i) => { const b = pts[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; const nx = -dy / l, ny = dx / l; return { p: [a[0] + nx * dist[i], a[1] + ny * dist[i]] as P, d: [dx, dy] as P }; });
  return pts.map((_, i) => {
    const A = lines[(i - 1 + n) % n], B = lines[i]; const den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    if (Math.abs(den) < 1e-12) return B.p;
    const t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den; return [A.p[0] + A.d[0] * t, A.p[1] + A.d[1] * t];
  });
}

/** Rooms enclosed by walls in this entity list, named by any room tags inside them. */
export function detectRooms(entities: CadEntity2D[]): Room[] {
  const walls = entities.filter((e): e is Wall => e.type === 'wall');
  if (walls.length < 3) return [];
  const tol = Math.max(1e-6, Math.min(...walls.map(w => w.thickness)) * 0.02);
  // 1. Split centrelines where they cross or where one wall ends on another (T-junctions).
  const segs = walls.map(w => ({ a: [w.a[0], w.a[1]] as P, b: [w.b[0], w.b[1]] as P, t: w.thickness }));
  const cuts = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) for (let j = 0; j < segs.length; j++) {
    if (i === j) continue; const t = segX(segs[i].a, segs[i].b, segs[j].a, segs[j].b); if (t !== null) cuts[i].push(t);
  }
  // 2. Vertices and undirected edges (each remembers its wall thickness).
  const verts: P[] = []; const vid = new Map<string, number>();
  const vtx = (p: P) => { const k = key(p, tol); let i = vid.get(k); if (i === undefined) { i = verts.length; verts.push(p); vid.set(k, i); } return i; };
  const edges = new Map<string, { u: number; v: number; t: number }>();
  segs.forEach((s, i) => {
    const ts = [...new Set(cuts[i].map(t => +t.toFixed(9)))].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = (t: number): P => [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      const u = vtx(p(ts[k])), v = vtx(p(ts[k + 1])); if (u === v) continue;
      const ek = u < v ? `${u}_${v}` : `${v}_${u}`; if (!edges.has(ek)) edges.set(ek, { u, v, t: s.t });
    }
  });
  // 3. Half-edges sorted by angle around each vertex; walk faces keeping each face on the left.
  const out = new Map<number, Array<{ to: number; ang: number; t: number }>>();
  for (const { u, v, t } of edges.values()) for (const [a, b] of [[u, v], [v, u]]) { const d = [verts[b][0] - verts[a][0], verts[b][1] - verts[a][1]]; const l = out.get(a) ?? []; l.push({ to: b, ang: Math.atan2(d[1], d[0]), t }); out.set(a, l); }
  for (const l of out.values()) l.sort((x, y) => x.ang - y.ang);
  const used = new Set<string>(); const rooms: Room[] = [];
  for (const [a0, list] of out) for (const h0 of list) {
    if (used.has(`${a0}>${h0.to}`)) continue;
    const loop: number[] = []; const thick: number[] = []; let a = a0, h = h0; let guard = 0;
    while (!used.has(`${a}>${h.to}`) && guard++ < 10000) {
      used.add(`${a}>${h.to}`); loop.push(a); thick.push(h.t);
      const b = h.to; const around = out.get(b)!; const back = around.findIndex(x => x.to === a);
      // Next edge: the one just clockwise of the way back, which keeps the face on the left.
      const next = around[(back - 1 + around.length) % around.length]; a = b; h = next;
    }
    if (loop.length < 3) continue;
    const outline = loop.map(i => verts[i]); const area = polyArea(outline);
    if (area <= tol * tol * 100) continue; // the outer face (clockwise) and slivers
    const net = insetPolygon(outline, thick.map(t => t / 2)); const netArea = polyArea(net);
    if (netArea <= 0) continue;
    let per = 0; for (let i = 0; i < net.length; i++) per += Math.hypot(net[(i + 1) % net.length][0] - net[i][0], net[(i + 1) % net.length][1] - net[i][1]);
    const cx = net.reduce((s, p) => s + p[0], 0) / net.length, cy = net.reduce((s, p) => s + p[1], 0) / net.length;
    rooms.push({ id: `room_${rooms.length + 1}`, outline, net, area: netArea, grossArea: area, perimeter: per, centroid: [cx, cy] });
  }
  // 4. Names from tags.
  entities.forEach((e, i) => {
    if (e.type !== 'room') return; const p: P = [e.at[0], e.at[1]];
    const room = rooms.filter(r => pointInPoly(p, r.net)).sort((x, y) => x.area - y.area)[0];
    if (room && room.tagIndex === undefined) { room.name = e.name; room.number = e.number; room.tagIndex = i; }
  });
  // Stable order: by number when tagged, then top-left first.
  rooms.sort((x, y) => (x.number && y.number ? x.number.localeCompare(y.number, undefined, { numeric: true }) : x.number ? -1 : y.number ? 1 : 0) || (y.centroid[1] - x.centroid[1]) || (x.centroid[0] - y.centroid[0]));
  return rooms;
}

/** Area in the units architects read: m² for metric drawings, ft² for imperial ones. */
export function formatArea(area: number, unitsPerMm: number): string {
  const mm2 = area / (unitsPerMm * unitsPerMm);
  const imperial = Math.abs(unitsPerMm - 1 / 25.4) < 1e-9 || Math.abs(unitsPerMm - 1 / 304.8) < 1e-9;
  return imperial ? `${(mm2 / 92903.04).toFixed(0)} ft²` : `${(mm2 / 1e6).toFixed(2)} m²`;
}

/** What a room tag draws: number over name over live area, centred on the tag. */
export function roomTagLines(tag: Tag, rooms: Room[]): Array<{ text: string; dy: number; h: number }> {
  const room = rooms.find(r => r.tagIndex !== undefined && pointInPoly([tag.at[0], tag.at[1]], r.net));
  const h = tag.height;
  return [
    { text: tag.name || 'ROOM', dy: h * 0.6, h },
    { text: tag.number, dy: -h * 0.7, h: h * 0.75 },
    { text: room ? formatArea(room.area, tag.unitsPerMm) : 'not enclosed', dy: -h * 1.9, h: h * 0.7 },
  ].filter(l => l.text);
}
