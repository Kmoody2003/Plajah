// studio/transform — bounding-box handle maths, numeric transform, reflect, transform each.
//
// Every gesture produces ONE affine matrix in artboard px. The canvas previews it by setting
// a `transform` attribute on the selected objects' DOM nodes (no React work per frame) and
// commits it once on pointer-up with objectGeom.transformObject, as a single undo step.
import type { Matrix } from '../geometry/model';
import type { Rect, Vec } from '../geometry/vec';
import type { TelaVectorObject } from '../../../types';
import { translate, scale, rotate, shear, reflect, multiply, compose, IDENTITY } from '../geometry/transform';
import { boundsOf, transformObject, unionBounds } from './objectGeom';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export function handlePoint(b: Rect, h: Handle): Vec {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.w : b.x + b.w / 2;
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.h : b.y + b.h / 2;
  return { x, y };
}
const opposite: Record<Handle, Handle> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };

/**
 * Scale by dragging handle `h` to `p`. Shift: proportional. Alt: about the centre.
 * Dragging past the opposite edge reflects, as in Illustrator.
 */
export function scaleMatrix(b: Rect, h: Handle, p: Vec, mods: { shift?: boolean; alt?: boolean } = {}): Matrix {
  const anchor = mods.alt ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : handlePoint(b, opposite[h]);
  const from = handlePoint(b, h);
  const W = from.x - anchor.x, H = from.y - anchor.y;
  let sx = h === 'n' || h === 's' ? 1 : (Math.abs(W) < 1e-9 ? 1 : (p.x - anchor.x) / W);
  let sy = h === 'e' || h === 'w' ? 1 : (Math.abs(H) < 1e-9 ? 1 : (p.y - anchor.y) / H);
  if (mods.shift) {
    if (h === 'n' || h === 's') sx = Math.abs(sy) * Math.sign(sx || 1);
    else if (h === 'e' || h === 'w') sy = Math.abs(sx) * Math.sign(sy || 1);
    else { const k = Math.max(Math.abs(sx), Math.abs(sy)); sx = k * Math.sign(sx || 1); sy = k * Math.sign(sy || 1); }
  }
  // Never collapse to zero (it is not invertible and loses the art).
  const guard = (v: number) => Math.abs(v) < 1e-3 ? (v < 0 ? -1e-3 : 1e-3) : v;
  return scale(guard(sx), guard(sy), anchor);
}

/** Rotate about `c` by the angle swept from `start` to `p`. Shift snaps to 45°. */
export function rotateMatrix(c: Vec, start: Vec, p: Vec, shift = false): { m: Matrix; angle: number } {
  let a = (Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x)) * 180 / Math.PI;
  if (shift) a = Math.round(a / 45) * 45;
  return { m: rotate(a, c), angle: a };
}

/** Skew by dragging a side handle (Ctrl/Cmd + side handle, as Free Transform does). */
export function skewMatrix(b: Rect, h: Handle, p: Vec, alt = false): Matrix {
  const anchor = alt ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : handlePoint(b, opposite[h]);
  const from = handlePoint(b, h);
  if (h === 'n' || h === 's') {
    const dy = from.y - anchor.y; if (Math.abs(dy) < 1e-9) return IDENTITY;
    const k = (p.x - from.x) / dy; return compose(translate(-anchor.x, -anchor.y), [1, 0, k, 1, 0, 0], translate(anchor.x, anchor.y));
  }
  const dx = from.x - anchor.x; if (Math.abs(dx) < 1e-9) return IDENTITY;
  const k = (p.y - from.y) / dx; return compose(translate(-anchor.x, -anchor.y), [1, k, 0, 1, 0, 0], translate(anchor.x, anchor.y));
}

/** Reference point (0..1, 0..1) inside a box (the 9-point grid). */
export const refPoint = (b: Rect, r: Vec): Vec => ({ x: b.x + b.w * r.x, y: b.y + b.h * r.y });

/**
 * Numeric transform (the X/Y/W/H/angle fields): the matrix that takes the selection box `b`
 * to the requested values, measured at reference point `ref`. Angle is a delta rotation.
 */
export function boxMatrix(b: Rect, ref: Vec, want: { x?: number; y?: number; w?: number; h?: number; rotate?: number; shear?: number }): Matrix {
  const R = refPoint(b, ref);
  const sx = want.w !== undefined && b.w > 1e-9 ? want.w / b.w : 1, sy = want.h !== undefined && b.h > 1e-9 ? want.h / b.h : 1;
  let m = scale(sx, sy, R);
  if (want.shear) m = multiply(shear(want.shear, 0, R), m);
  if (want.rotate) m = multiply(rotate(want.rotate, R), m);
  const tx = want.x !== undefined ? want.x - R.x : 0, ty = want.y !== undefined ? want.y - R.y : 0;
  return multiply(translate(tx, ty), m);
}

/** Reflect the selection across a vertical (axis 90) or horizontal (0) axis through its centre / a point. */
export function reflectMatrix(b: Rect, axis: 'vertical' | 'horizontal' | number, about?: Vec): Matrix {
  const c = about ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return reflect(axis === 'vertical' ? 90 : axis === 'horizontal' ? 0 : axis, c);
}

/** Apply one matrix to a set of objects (a single undo step for the caller). */
export function applyMatrix(objects: TelaVectorObject[], ids: Set<string>, m: Matrix): TelaVectorObject[] {
  return objects.map(o => ids.has(o.id) ? transformObject(o, m) : o);
}

/** Object ▸ Transform ▸ Transform Each: every object about its own reference point. */
export interface EachSpec { sx?: number; sy?: number; rotate?: number; dx?: number; dy?: number; reflectX?: boolean; reflectY?: boolean; ref?: Vec; random?: boolean; seed?: number }
export function transformEachObjects(objects: TelaVectorObject[], ids: Set<string>, o: EachSpec): TelaVectorObject[] {
  let seed = o.seed ?? 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return objects.map(ob => {
    if (!ids.has(ob.id)) return ob;
    const b = boundsOf(ob); const R = refPoint(b, o.ref ?? { x: .5, y: .5 });
    const k = o.random ? rnd() : 1;
    const sx = 1 + ((o.sx ?? 1) - 1) * k, sy = 1 + ((o.sy ?? 1) - 1) * k;
    let m = scale((o.reflectX ? -1 : 1) * sx, (o.reflectY ? -1 : 1) * sy, R);
    if (o.rotate) m = multiply(rotate(o.rotate * k, R), m);
    if (o.dx || o.dy) m = multiply(translate((o.dx ?? 0) * k, (o.dy ?? 0) * k), m);
    return transformObject(ob, m);
  });
}

export const selectionBounds = (objects: TelaVectorObject[], ids: Set<string>): Rect | null => unionBounds(objects.filter(o => ids.has(o.id)).map(boundsOf));

/** SVG transform attribute for previewing a matrix on a DOM node. */
export const matrixAttr = (m: Matrix) => `matrix(${m.map(v => +v.toFixed(6)).join(' ')})`;
