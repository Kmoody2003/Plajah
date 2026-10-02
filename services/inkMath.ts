/**
 * Ink geometry for the notebook: smoothing, simplification, stroke widths from pressure, hit-testing
 * for the eraser and lasso, and conversion to Tela vector PATH objects. Pure functions, unit-tested,
 * so drawing feels consistent and nothing about it depends on a canvas.
 */
export interface InkPoint { x: number; y: number; p: number }

export type InkTool = 'pen' | 'pencil' | 'highlighter';

export interface InkStyle { color: string; size: number; tool: InkTool }

/** Visual defaults per tool: width multiplier, opacity, and whether pressure matters. */
export const TOOL_LOOK: Record<InkTool, { widthMul: number; opacity: number; pressure: number }> = {
  pen: { widthMul: 1, opacity: 1, pressure: 0.6 },
  pencil: { widthMul: 0.8, opacity: 0.75, pressure: 0.9 },
  highlighter: { widthMul: 5, opacity: 0.35, pressure: 0 },
};

/** Stroke width (px) for a tool, base size and pressure 0..1 (mouse reports 0.5). */
export function widthFor(style: InkStyle, pressure: number): number {
  const look = TOOL_LOOK[style.tool]; const p = Math.max(0, Math.min(1, pressure || 0.5));
  return Math.max(0.5, style.size * look.widthMul * (1 - look.pressure + look.pressure * (0.35 + 1.3 * p)));
}

/** One pass of Chaikin corner cutting; endpoints are kept. Smooths jitter without rounding the ends. */
export function chaikin(pts: InkPoint[], passes = 2): InkPoint[] {
  let cur = pts;
  for (let k = 0; k < passes && cur.length > 2; k++) {
    const next: InkPoint[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y, p: 0.75 * a.p + 0.25 * b.p }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y, p: 0.25 * a.p + 0.75 * b.p });
    }
    next.push(cur[cur.length - 1]); cur = next;
  }
  return cur;
}

const distToSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Ramer-Douglas-Peucker: drop points that deviate less than `eps` px from the simplified line. */
export function simplify(pts: InkPoint[], eps = 0.6): InkPoint[] {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = distToSeg(pts[i], pts[0], pts[pts.length - 1]); if (d > maxD) { maxD = d; idx = i; } }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

export const avgPressure = (pts: InkPoint[]) => (pts.length ? pts.reduce((s, p) => s + p.p, 0) / pts.length : 0.5);

export interface Box { x: number; y: number; w: number; h: number }
export function boundsOf(flat: number[], pad = 0): Box {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let i = 0; i + 1 < flat.length; i += 2) { x1 = Math.min(x1, flat[i]); x2 = Math.max(x2, flat[i]); y1 = Math.min(y1, flat[i + 1]); y2 = Math.max(y2, flat[i + 1]); }
  if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
}

/** True when any segment of a stroke (flat [x,y,...]) passes within `r` of the point. Used by the eraser. */
export function strokeNear(flat: number[], pt: { x: number; y: number }, r: number): boolean {
  if (flat.length === 2) return Math.hypot(flat[0] - pt.x, flat[1] - pt.y) <= r;
  for (let i = 0; i + 3 < flat.length; i += 2) if (distToSeg(pt, { x: flat[i], y: flat[i + 1] }, { x: flat[i + 2], y: flat[i + 3] }) <= r) return true;
  return false;
}

/** True when the stroke's bounding box overlaps the rectangle (lasso select). */
export function strokeInBox(flat: number[], box: Box): boolean {
  const b = boundsOf(flat);
  return b.x <= box.x + box.w && b.x + b.w >= box.x && b.y <= box.y + box.h && b.y + b.h >= box.y;
}

export const flatten = (pts: InkPoint[]): number[] => pts.flatMap(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);

/** Smooth path data (quadratic through midpoints) for rendering a flat polyline as SVG. */
export function pathData(flat: number[]): string {
  if (flat.length < 2) return '';
  if (flat.length < 6) return `M${flat[0]},${flat[1]}${flat.length >= 4 ? ` L${flat[2]},${flat[3]}` : ' l0.01,0'}`;
  let d = `M${flat[0]},${flat[1]}`;
  for (let i = 2; i + 3 < flat.length; i += 2) { const mx = (flat[i] + flat[i + 2]) / 2, my = (flat[i + 1] + flat[i + 3]) / 2; d += ` Q${flat[i]},${flat[i + 1]} ${mx},${my}`; }
  d += ` L${flat[flat.length - 2]},${flat[flat.length - 1]}`;
  return d;
}
