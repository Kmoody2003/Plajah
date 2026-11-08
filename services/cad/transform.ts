// Affine transforms for 2D entities (rotate, scale, mirror). Kept apart from the drafting
// engine so wall and block geometry can use it without import cycles.

import type { CadEntity2D, Vec3 } from './model';

type P = [number, number];


/** 2D affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Affine = [number, number, number, number, number, number];
export const rotateAbout = (p: P, deg: number): Affine => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, p[0] - c * p[0] + s * p[1], p[1] - s * p[0] - c * p[1]]; };
export const scaleAbout = (p: P, k: number): Affine => [k, 0, 0, k, p[0] * (1 - k), p[1] * (1 - k)];
/** Reflection across the line through a and b. */
export function mirrorAcross(a: P, b: P): Affine {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy || 1; const c = (dx * dx - dy * dy) / l2, s = 2 * dx * dy / l2;
  return [c, s, s, -c, a[0] - c * a[0] - s * a[1], a[1] - s * a[0] + c * a[1]];
}

export function transformEntity(e: CadEntity2D, M: Affine): CadEntity2D {
  const [a, b, c, d, tx, ty] = M; const det = a * d - b * c; const k = Math.sqrt(Math.abs(det)); const mirrored = det < 0;
  const phi = Math.atan2(b, a) * 180 / Math.PI;
  const T = (p: Vec3): Vec3 => [a * p[0] + c * p[1] + tx, b * p[0] + d * p[1] + ty, p[2]];
  const V = (p: Vec3): Vec3 => [a * p[0] + c * p[1], b * p[0] + d * p[1], p[2]];
  const norm = (deg: number) => ((deg % 360) + 360) % 360;
  switch (e.type) {
    case 'line': return { ...e, a: T(e.a), b: T(e.b) };
    case 'polyline': return { ...e, points: e.points.map(T), bulges: e.bulges && mirrored ? e.bulges.map(x => -x) : e.bulges, width: e.width ? e.width * k : e.width };
    case 'circle': return { ...e, c: T(e.c), r: e.r * k };
    case 'arc': return mirrored ? { ...e, c: T(e.c), r: e.r * k, start: norm(phi - e.end), end: norm(phi - e.start) } : { ...e, c: T(e.c), r: e.r * k, start: norm(e.start + phi), end: norm(e.end + phi) };
    case 'ellipse': return { ...e, c: T(e.c), major: V(e.major), ...(mirrored ? { start: Math.PI * 2 - e.end, end: Math.PI * 2 - e.start } : {}) };
    case 'text': {
      const r = e.rotation * Math.PI / 180; const dir = V([Math.cos(r), Math.sin(r), 0]);
      let ang = Math.atan2(dir[1], dir[0]) * 180 / Math.PI;
      if (mirrored && (norm(ang) > 90.0001 && norm(ang) < 269.9999)) ang += 180; // keep text readable (AutoCAD MIRRTEXT = 0)
      return { ...e, at: T(e.at), height: e.height * k, rotation: norm(ang) };
    }
    case 'point': return { ...e, at: T(e.at) };
    case 'face': return { ...e, points: e.points.map(T) };
    case 'hatch': return { ...e, loops: e.loops.map(l => l.map(T)) };
    case 'spline': return { ...e, points: e.points.map(T) };
    case 'insert': return mirrored
      ? { ...e, at: T(e.at), rotation: norm(phi - e.rotation), scale: [e.scale[0] * k, -e.scale[1] * k, e.scale[2]] }
      : { ...e, at: T(e.at), rotation: norm(e.rotation + phi), scale: [e.scale[0] * k, e.scale[1] * k, e.scale[2]] };
    case 'dimension': return { ...e, a: T(e.a), b: T(e.b), at: T(e.at), height: e.height * k };
    case 'room': return { ...e, at: T(e.at), height: e.height * k };
    // Mirroring reverses handedness: hosted openings move to the other face and swap hinge side.
    case 'wall': return { ...e, a: T(e.a), b: T(e.b), thickness: e.thickness * k, height: e.height * k, unitsPerMm: e.unitsPerMm * k,
      openings: e.openings.map(o => ({ ...o, at: o.at * k, width: o.width * k, ...(mirrored ? { flip: !o.flip, params: { ...(o.params ?? {}), ...(o.params?.hand ? { hand: o.params.hand === 'right' ? 'left' : 'right' } : {}) } } : {}) })) };
  }
}

