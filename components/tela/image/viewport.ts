// viewport — Image Studio view maths: doc ⇄ screen mapping with zoom + view rotation,
// zoom about a point, fit / 100 %, Photoshop zoom steps, ruler ticks, and the GPU render
// region for a rotated view. Pure (tested).
//
// The view is stored as the document point under the viewport centre (cx, cy), a zoom
// (screen px per doc px) and a rotation (degrees, view-only — the document never rotates).

export interface View { cx: number; cy: number; zoom: number; rotation: number }
export interface Size { width: number; height: number }

export const ZOOM_MIN = 1 / 64, ZOOM_MAX = 64;
/** Photoshop's preset ladder (Ctrl+ / Ctrl−). */
export const ZOOM_STEPS = [1 / 64, 1 / 48, 1 / 32, 1 / 24, 1 / 16, 1 / 12, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 32, 64];
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export function docToScreen(v: View, vp: Size, x: number, y: number): [number, number] {
  const a = v.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = (x - v.cx) * v.zoom, dy = (y - v.cy) * v.zoom;
  return [vp.width / 2 + dx * c - dy * s, vp.height / 2 + dx * s + dy * c];
}
export function screenToDoc(v: View, vp: Size, sx: number, sy: number): [number, number] {
  const a = -v.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = sx - vp.width / 2, dy = sy - vp.height / 2;
  return [v.cx + (dx * c - dy * s) / v.zoom, v.cy + (dx * s + dy * c) / v.zoom];
}
/** CSS/canvas matrix [a,b,c,d,e,f] mapping doc → screen. */
export function viewMatrix(v: View, vp: Size): [number, number, number, number, number, number] {
  const a = v.rotation * Math.PI / 180, c = Math.cos(a) * v.zoom, s = Math.sin(a) * v.zoom;
  const [ex, ey] = docToScreen(v, vp, 0, 0);
  return [c, s, -s, c, ex, ey];
}

/** Zoom keeping the doc point under screen (sx, sy) fixed. */
export function zoomAt(v: View, vp: Size, sx: number, sy: number, zoom: number): View {
  const z = clampZoom(zoom), [px, py] = screenToDoc(v, vp, sx, sy);
  const next = { ...v, zoom: z };
  const [nx, ny] = screenToDoc(next, vp, sx, sy);
  return { ...next, cx: v.cx + (px - nx), cy: v.cy + (py - ny) };
}
export function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find(s => s > z * 1.001) ?? ZOOM_MAX;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < z / 1.001) return ZOOM_STEPS[i];
  return ZOOM_MIN;
}
/** Pan by a screen-space delta (accounts for rotation). */
export function panBy(v: View, dx: number, dy: number): View {
  const a = -v.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { ...v, cx: v.cx - (dx * c - dy * s) / v.zoom, cy: v.cy - (dx * s + dy * c) / v.zoom };
}
/** Fit on screen (Ctrl+0) with a margin; never upsamples past `maxZoom`. */
export function fitView(doc: Size, vp: Size, margin = 32, maxZoom = 1, rotation = 0): View {
  const z = Math.min((vp.width - margin * 2) / Math.max(1, doc.width), (vp.height - margin * 2) / Math.max(1, doc.height), maxZoom);
  return { cx: doc.width / 2, cy: doc.height / 2, zoom: clampZoom(z > 0 ? z : 0.01), rotation };
}
/** Rotate the view about the viewport centre (doc point under centre is unchanged). */
export const rotateView = (v: View, deg: number): View => ({ ...v, rotation: ((v.rotation + deg) % 360 + 540) % 360 - 180 });

/**
 * Where the GPU should render. Unrotated: exactly the viewport. Rotated: a square canvas
 * (side = viewport diagonal) centred on the viewport and CSS-rotated, so the compositor keeps
 * rendering axis-aligned regions. `css` is the canvas placement relative to the viewport.
 */
export function renderRegion(v: View, vp: Size, dpr = 1): { view: { x: number; y: number; scale: number; width: number; height: number }; css: { left: number; top: number; width: number; height: number; rotate: number } } {
  const rot = Math.abs(v.rotation) > 0.01;
  const W = rot ? Math.ceil(Math.hypot(vp.width, vp.height)) : vp.width, H = rot ? W : vp.height;
  const scale = v.zoom * dpr;
  return {
    view: { x: v.cx - W / 2 / v.zoom, y: v.cy - H / 2 / v.zoom, scale, width: Math.max(1, Math.round(W * dpr)), height: Math.max(1, Math.round(H * dpr)) },
    css: { left: (vp.width - W) / 2, top: (vp.height - H) / 2, width: W, height: H, rotate: rot ? v.rotation : 0 },
  };
}

/** Visible doc rect (axis-aligned bounds of the viewport in doc space) — navigator box, culling. */
export function visibleDocRect(v: View, vp: Size) {
  const pts = [screenToDoc(v, vp, 0, 0), screenToDoc(v, vp, vp.width, 0), screenToDoc(v, vp, 0, vp.height), screenToDoc(v, vp, vp.width, vp.height)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/** Ruler ticks for a doc span [from, to] at `zoom`: major every `step`, labelled in doc px. */
export function rulerTicks(from: number, to: number, zoom: number, minPx = 64): { at: number; major: boolean; label?: string }[] {
  const raw = minPx / zoom, pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw) ?? 10 * pow;
  const minor = step / (step / pow === 2 ? 4 : 5), out: { at: number; major: boolean; label?: string }[] = [];
  const start = Math.floor(from / minor) * minor;
  for (let t = start, i = 0; t <= to && i < 2000; t += minor, i++) {
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    out.push({ at: t, major, label: major ? String(Math.round(t * 100) / 100) : undefined });
  }
  return out;
}

/** Two-finger gesture: new view from the start view, start/now finger pairs (screen px). */
export function pinchView(start: View, vp: Size, a0: [number, number], b0: [number, number], a1: [number, number], b1: [number, number], allowRotate = false): View {
  const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1, d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) || 1;
  const m0: [number, number] = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1: [number, number] = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  const ang = allowRotate ? (Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0])) * 180 / Math.PI : 0;
  // anchor: the doc point under the starting midpoint ends up under the current midpoint
  const [px, py] = screenToDoc(start, vp, m0[0], m0[1]);
  const v: View = { ...start, zoom: clampZoom(start.zoom * d1 / d0), rotation: start.rotation + ang };
  const [qx, qy] = screenToDoc(v, vp, m1[0], m1[1]);
  return { ...v, cx: v.cx + (px - qx), cy: v.cy + (py - qy) };
}
