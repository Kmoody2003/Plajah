// Exact copper geometry for DRC and the router: every copper item is a capsule (segment with a
// radius; a round pad or via is a zero-length capsule) or an axis-aligned rectangle.

export type Shape = { k: 'cap'; ax: number; ay: number; bx: number; by: number; r: number } | { k: 'rect'; x0: number; y0: number; x1: number; y1: number };

export const cap = (ax: number, ay: number, bx: number, by: number, r: number): Shape => ({ k: 'cap', ax, ay, bx, by, r });
export const rect = (cx: number, cy: number, w: number, h: number): Shape => ({ k: 'rect', x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });

export function bbox(s: Shape): [number, number, number, number] {
  return s.k === 'rect' ? [s.x0, s.y0, s.x1, s.y1] : [Math.min(s.ax, s.bx) - s.r, Math.min(s.ay, s.by) - s.r, Math.max(s.ax, s.bx) + s.r, Math.max(s.ay, s.by) + s.r];
}

function ptSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function ptRect(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - px, 0, px - x1), dy = Math.max(y0 - py, 0, py - y1); return Math.hypot(dx, dy);
}
function segsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy), o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
function segSeg(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (segsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(ptSeg(ax, ay, cx, cy, dx, dy), ptSeg(bx, by, cx, cy, dx, dy), ptSeg(cx, cy, ax, ay, bx, by), ptSeg(dx, dy, ax, ay, bx, by));
}
function segRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): number {
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (inside(ax, ay) || inside(bx, by)) return 0;
  const edges: Array<[number, number, number, number]> = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
  let d = Infinity; for (const e of edges) d = Math.min(d, segSeg(ax, ay, bx, by, e[0], e[1], e[2], e[3]));
  return d;
}

/** Edge-to-edge distance between two copper shapes (0 when they touch or overlap). */
export function dist(a: Shape, b: Shape): number {
  if (a.k === 'cap' && b.k === 'cap') return Math.max(0, segSeg(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by) - a.r - b.r);
  if (a.k === 'rect' && b.k === 'rect') { const dx = Math.max(a.x0 - b.x1, 0, b.x0 - a.x1), dy = Math.max(a.y0 - b.y1, 0, b.y0 - a.y1); return Math.hypot(dx, dy); }
  const c = (a.k === 'cap' ? a : b) as Extract<Shape, { k: 'cap' }>, r = (a.k === 'rect' ? a : b) as Extract<Shape, { k: 'rect' }>;
  return Math.max(0, segRect(c.ax, c.ay, c.bx, c.by, r.x0, r.y0, r.x1, r.y1) - c.r);
}
/** Distance from a point to a shape's copper (0 inside). */
export function ptDist(px: number, py: number, s: Shape): number {
  return s.k === 'rect' ? ptRect(px, py, s.x0, s.y0, s.x1, s.y1) : Math.max(0, ptSeg(px, py, s.ax, s.ay, s.bx, s.by) - s.r);
}
