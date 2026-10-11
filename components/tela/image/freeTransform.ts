// freeTransform — Free Transform (Ctrl+T) handle maths: scale / rotate / skew / distort /
// perspective / warp, Photoshop modifiers (Shift toggles proportional, Alt = about the
// reference point, Shift snaps rotation to 15°, Ctrl corner = distort, Ctrl+Alt edge = skew,
// Ctrl+Alt+Shift corner = perspective).
//
// While the result is affine the layer keeps its bitmap and only `transform` changes, so
// scaling down and back up is lossless (the compositor resamples at render, like a smart
// object). Distort / perspective / warp produce a quad or mesh that is resampled once on
// commit (worker `distort` / `warp`). Pure maths, tested.

import { affineApply, affineInvert, affineMul, affineTranslate, type Affine } from '../../../services/tela/raster/model';

export type Pt = [number, number];
export type TransformMode = 'free' | 'scale' | 'rotate' | 'skew' | 'distort' | 'perspective' | 'warp';
export type Handle = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l' | 'move' | 'rotate' | 'pivot' | `mesh:${number}`;

export interface TransformState {
  /** Source size (layer bitmap px). */
  w: number; h: number;
  /** Layer px → doc, while affine. */
  m: Affine;
  /** Doc-space corners TL, TR, BR, BL once the result is no longer affine. */
  quad: Pt[] | null;
  /** Warp mesh control points (4×4, row-major) in doc space when warping. */
  mesh: Pt[] | null;
  pivot: Pt;
  mode: TransformMode;
}
export interface Mods { shift?: boolean; alt?: boolean; ctrl?: boolean }

const CORNERS: Record<'tl' | 'tr' | 'br' | 'bl', number> = { tl: 0, tr: 1, br: 2, bl: 3 };
const LOCAL = (w: number, h: number): Pt[] => [[0, 0], [w, 0], [w, h], [0, h]];

export function beginTransform(w: number, h: number, m: Affine, mode: TransformMode = 'free'): TransformState {
  const c = affineApply(m, w / 2, h / 2);
  const s: TransformState = { w, h, m: [...m] as Affine, quad: null, mesh: null, pivot: [c[0], c[1]], mode };
  return mode === 'warp' ? toWarp(s) : s;
}
export function corners(s: TransformState): Pt[] { return s.quad ? s.quad.map(p => [p[0], p[1]] as Pt) : LOCAL(s.w, s.h).map(p => affineApply(s.m, p[0], p[1]) as Pt); }
export const isAffine = (s: TransformState) => !s.quad && !s.mesh;

/** Handle positions in doc space (corners, edge midpoints, pivot). */
export function handlePoints(s: TransformState): Record<string, Pt> {
  const q = corners(s), mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { tl: q[0], tr: q[1], br: q[2], bl: q[3], t: mid(q[0], q[1]), r: mid(q[1], q[2]), b: mid(q[2], q[3]), l: mid(q[3], q[0]), pivot: s.pivot };
}

/** Which handle a doc point hits (tolerance in doc px; outside the box near a corner = rotate). */
export function hitHandle(s: TransformState, p: Pt, tol: number): Handle | null {
  if (s.mesh) { for (let i = 0; i < s.mesh.length; i++) if (Math.hypot(s.mesh[i][0] - p[0], s.mesh[i][1] - p[1]) <= tol) return `mesh:${i}`; return insideQuad(corners(s), p) ? 'move' : null; }
  const hp = handlePoints(s);
  if (Math.hypot(hp.pivot[0] - p[0], hp.pivot[1] - p[1]) <= tol * 0.8) return 'pivot';
  for (const k of ['tl', 'tr', 'br', 'bl', 't', 'r', 'b', 'l'] as const) if (Math.hypot(hp[k][0] - p[0], hp[k][1] - p[1]) <= tol) return k;
  if (insideQuad(corners(s), p)) return 'move';
  for (const k of ['tl', 'tr', 'br', 'bl'] as const) if (Math.hypot(hp[k][0] - p[0], hp[k][1] - p[1]) <= tol * 3.2) return 'rotate';
  return null;
}
export function insideQuad(q: Pt[], p: Pt): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (Math.abs(c) < 1e-9) continue; const sg = Math.sign(c); if (!sign) sign = sg; else if (sg !== sign) return false; }
  return true;
}

/**
 * Apply a drag of `handle` from `start` (doc) to `now` (doc), starting from state `s0`
 * (the state at pointer-down, so drags never accumulate error).
 */
export function dragHandle(s0: TransformState, handle: Handle, start: Pt, now: Pt, mods: Mods = {}): TransformState {
  const dx = now[0] - start[0], dy = now[1] - start[1];
  if (handle === 'pivot') return { ...s0, pivot: [s0.pivot[0] + dx, s0.pivot[1] + dy] };
  if (handle === 'move') {
    const t = affineTranslate(dx, dy);
    return { ...s0, m: affineMul(t, s0.m), quad: s0.quad && s0.quad.map(p => [p[0] + dx, p[1] + dy] as Pt), mesh: s0.mesh && s0.mesh.map(p => [p[0] + dx, p[1] + dy] as Pt), pivot: [s0.pivot[0] + dx, s0.pivot[1] + dy] };
  }
  if (handle.startsWith('mesh:')) { const i = Number(handle.slice(5)); const mesh = s0.mesh!.map(p => [...p] as Pt); mesh[i] = [mesh[i][0] + dx, mesh[i][1] + dy]; return { ...s0, mesh }; }
  if (handle === 'rotate' || s0.mode === 'rotate') {
    const a0 = Math.atan2(start[1] - s0.pivot[1], start[0] - s0.pivot[0]), a1 = Math.atan2(now[1] - s0.pivot[1], now[0] - s0.pivot[0]);
    let deg = (a1 - a0) * 180 / Math.PI;
    if (mods.shift) { const cur = currentAngle(s0); deg = Math.round((cur + deg) / 15) * 15 - cur; }
    return rotateAbout(s0, deg);
  }
  const isCorner = handle in CORNERS;
  const mode: TransformMode = s0.mode !== 'free' && s0.mode !== 'scale' ? s0.mode : mods.ctrl ? (isCorner ? (mods.alt && mods.shift ? 'perspective' : 'distort') : (mods.alt ? 'skew' : 'skew')) : 'scale';
  if (mode === 'distort' || mode === 'perspective') {
    if (!isCorner) return skewEdge(s0, handle as 't' | 'r' | 'b' | 'l', dx, dy);
    const q = corners(s0), i = CORNERS[handle as keyof typeof CORNERS];
    if (mode === 'perspective') {
      // Photoshop perspective: the corner slides along one axis and its partner on the same
      // edge mirrors it, keeping the quad a symmetric trapezoid.
      const horizontal = Math.abs(dx) >= Math.abs(dy), k = horizontal ? [1, 0, 3, 2][i] : [3, 2, 1, 0][i];
      if (horizontal) { q[i] = [q[i][0] + dx, q[i][1]]; q[k] = [q[k][0] - dx, q[k][1]]; }
      else { q[i] = [q[i][0], q[i][1] + dy]; q[k] = [q[k][0], q[k][1] - dy]; }
    } else q[i] = [q[i][0] + dx, q[i][1] + dy];
    return { ...s0, quad: q };
  }
  if (mode === 'skew') return skewEdge(s0, (isCorner ? 't' : handle) as 't' | 'r' | 'b' | 'l', dx, dy);
  if (s0.quad) { // scaling a distorted quad: move the corner (keeps it simple and predictable)
    if (!isCorner) return skewEdge(s0, handle as 't' | 'r' | 'b' | 'l', dx, dy);
    const q = corners(s0); const i = CORNERS[handle as keyof typeof CORNERS]; q[i] = [q[i][0] + dx, q[i][1] + dy]; return { ...s0, quad: q };
  }
  return scaleAffine(s0, handle as 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l', now, mods);
}

function currentAngle(s: TransformState) { const q = corners(s); return Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) * 180 / Math.PI; }
export function rotateAbout(s: TransformState, deg: number): TransformState {
  const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), [px, py] = s.pivot;
  const R: Affine = affineMul(affineTranslate(px, py), affineMul([c, sn, -sn, c, 0, 0], affineTranslate(-px, -py)));
  const rot = (p: Pt): Pt => affineApply(R, p[0], p[1]) as Pt;
  return { ...s, m: affineMul(R, s.m), quad: s.quad && s.quad.map(rot), mesh: s.mesh && s.mesh.map(rot) };
}

/** Scale in the layer's own frame (handles stay attached to the rotated box). */
function scaleAffine(s0: TransformState, h: 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l', now: Pt, mods: Mods): TransformState {
  const inv = affineInvert(s0.m), [lx, ly] = affineApply(inv, now[0], now[1]);
  const W = s0.w, H = s0.h;
  const hx = h.includes('l') ? 0 : h.includes('r') ? W : W / 2, hy = h.includes('t') ? 0 : h.includes('b') ? H : H / 2;
  let ax = W - hx, ay = H - hy; // opposite side
  if (mods.alt) { const [pvx, pvy] = affineApply(inv, s0.pivot[0], s0.pivot[1]); ax = pvx; ay = pvy; }
  const edgeX = h === 't' || h === 'b', edgeY = h === 'l' || h === 'r';
  let sx = edgeX ? 1 : (lx - ax) / ((hx - ax) || 1), sy = edgeY ? 1 : (ly - ay) / ((hy - ay) || 1);
  const corner = !edgeX && !edgeY;
  // Photoshop 2019+: corners scale proportionally; Shift frees the aspect ratio.
  if (corner && !mods.shift) { const u = Math.abs(sx) > Math.abs(sy) ? sx : sy; sx = Math.sign(sx || 1) * Math.abs(u); sy = Math.sign(sy || 1) * Math.abs(u); }
  const S: Affine = [sx, 0, 0, sy, ax - sx * ax, ay - sy * ay];
  const m = affineMul(s0.m, S);
  return { ...s0, m, pivot: mods.alt ? s0.pivot : (affineApply(m, W / 2, H / 2) as Pt) };
}
function skewEdge(s0: TransformState, edge: 't' | 'r' | 'b' | 'l', dx: number, dy: number): TransformState {
  if (s0.quad) { const q = corners(s0); const idx = { t: [0, 1], r: [1, 2], b: [2, 3], l: [3, 0] }[edge]; for (const i of idx) q[i] = [q[i][0] + dx, q[i][1] + dy]; return { ...s0, quad: q }; }
  // affine skew: shear along the edge direction in layer space
  const inv = affineInvert(s0.m), d = [inv[0] * dx + inv[2] * dy, inv[1] * dx + inv[3] * dy];
  const W = s0.w, H = s0.h; let K: Affine;
  if (edge === 't') K = [1, 0, -d[0] / H, 1, d[0], 0];          // top moves by d.x, bottom fixed
  else if (edge === 'b') K = [1, 0, d[0] / H, 1, 0, 0];
  else if (edge === 'l') K = [1, -d[1] / W, 0, 1, 0, d[1]];
  else K = [1, d[1] / W, 0, 1, 0, 0];
  return { ...s0, m: affineMul(s0.m, K) };
}

/** Switch to warp: a 4×4 Bézier control grid spanning the current quad (bilinear placement). */
export function toWarp(s: TransformState): TransformState {
  const q = corners(s), mesh: Pt[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const u = i / 3, v = j / 3;
    const top: Pt = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u], bot: Pt = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
    mesh.push([top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v]);
  }
  return { ...s, mesh, mode: 'warp' };
}

/** Doc-space bounds of the transformed content (for the resampled output canvas). */
export function outputBounds(s: TransformState): { x: number; y: number; width: number; height: number } {
  const pts = s.mesh ? s.mesh : corners(s);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
  return { x, y, width: Math.max(1, Math.ceil(Math.max(...xs)) - x), height: Math.max(1, Math.ceil(Math.max(...ys)) - y) };
}

/** Numeric readout for the options bar (W/H %, angle, x/y of the reference point). */
export function readout(s: TransformState): { wPct: number; hPct: number; angle: number; x: number; y: number } {
  const q = corners(s);
  return { wPct: Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / s.w * 100, hPct: Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) / s.h * 100, angle: currentAngle(s), x: s.pivot[0], y: s.pivot[1] };
}
