// vec — the 2D point/vector vocabulary every geometry module speaks.
//
// Plain {x, y} objects (not tuples) so call sites read like maths and the JIT can
// keep them monomorphic. Everything here is pure and allocation-light.

export interface Vec { x: number; y: number }

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
/** z of the 3D cross product; > 0 means b turns LEFT of a (counter-clockwise in maths axes). */
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const norm = (a: Vec): Vec => { const l = Math.hypot(a.x, a.y); return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; };
/** Left normal (rotate +90° in maths axes): the side `cross(dir, n) > 0`. */
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const neg = (a: Vec): Vec => ({ x: -a.x, y: -a.y });
export const eq = (a: Vec, b: Vec, eps = 1e-9): boolean => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
export const rot = (a: Vec, ang: number, c: Vec = { x: 0, y: 0 }): Vec => {
  const s = Math.sin(ang), k = Math.cos(ang), dx = a.x - c.x, dy = a.y - c.y;
  return { x: c.x + dx * k - dy * s, y: c.y + dx * s + dy * k };
};
export const angle = (a: Vec): number => Math.atan2(a.y, a.x);
export const copy = (a: Vec): Vec => ({ x: a.x, y: a.y });

export interface Rect { x: number; y: number; w: number; h: number }
export const emptyRect = (): Rect => ({ x: Infinity, y: Infinity, w: -Infinity, h: -Infinity });
export function rectUnion(a: Rect, b: Rect): Rect {
  if (!isFinite(a.x)) return { ...b }; if (!isFinite(b.x)) return { ...a };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
export function rectOfPoints(pts: Vec[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export const rectsOverlap = (a: Rect, b: Rect, eps = 0): boolean =>
  a.x <= b.x + b.w + eps && b.x <= a.x + a.w + eps && a.y <= b.y + b.h + eps && b.y <= a.y + a.h + eps;
export const rectContains = (r: Rect, p: Vec, eps = 0): boolean => p.x >= r.x - eps && p.x <= r.x + r.w + eps && p.y >= r.y - eps && p.y <= r.y + r.h + eps;
export const rectCenter = (r: Rect): Vec => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Round to a fixed number of decimals for serialisation (never emits "-0"). */
export function fmt(n: number, dp = 3): string {
  if (!isFinite(n)) return '0';
  const k = 10 ** dp; const r = Math.round(n * k) / k;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}
export const clamp = (x: number, a: number, b: number) => x < a ? a : x > b ? b : x;
