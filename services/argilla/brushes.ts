/**
 * brushes.ts — what each brush does with a point on the clay. No GPU here, so it can be tested.
 */

import type { PickResult, StampInput, Vec3 } from './engine';

export type ArgillaBrush = 'clay' | 'carve' | 'smooth' | 'flatten' | 'move' | 'inflate' | 'pinch' | 'crease';

export const ARGILLA_BRUSHES: { id: ArgillaBrush; label: string; hint: string; key: string }[] = [
  { id: 'clay', label: 'Clay', hint: 'Build up form', key: 'C' },
  { id: 'carve', label: 'Carve', hint: 'Cut away, even right through', key: 'X' },
  { id: 'smooth', label: 'Smooth', hint: 'Relax the surface. Hold Shift with any brush.', key: 'S' },
  { id: 'flatten', label: 'Flatten', hint: 'Plane down to a flat', key: 'F' },
  { id: 'move', label: 'Move', hint: 'Drag clay across the screen', key: 'G' },
  { id: 'inflate', label: 'Inflate', hint: 'Swell the surface', key: 'I' },
  { id: 'pinch', label: 'Pinch', hint: 'Sharpen toward the stroke', key: 'P' },
  { id: 'crease', label: 'Crease', hint: 'Draw a fine fold', key: 'R' },
];

export interface BrushSettings {
  brush: ArgillaBrush;
  /** World units. The clay's domain is 2 across. */
  radius: number;
  /** 0 to 1. */
  strength: number;
  invert: boolean;
  mirrorX: boolean;
  voxel: number;
}

const along = (p: Vec3, n: Vec3, t: number): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];

/** The stamp for one point of a stroke. Move is handled apart, because it follows the screen. */
export function stampFor(hit: PickResult, s: BrushSettings, pressure = 1): StampInput {
  const r = s.radius;
  const power = s.strength * pressure;
  const base = { a: hit.point, ra: r, dir: hit.normal, plane: hit.normal, mirrorX: s.mirrorX };
  // A stamp must never move the surface by more than a voxel or two, or strokes turn lumpy.
  const creep = Math.min(s.voxel * 2.5, r * 0.12) * power;
  switch (s.brush) {
    case 'clay':
    case 'carve': {
      // Clay is pushed along the surface normal with a soft falloff, so marks melt into the form.
      const out = (s.brush === 'carve') === s.invert;
      const lift = creep * (out ? 1 : -1);
      return { ...base, op: 'grab', dir: [hit.normal[0] * lift, hit.normal[1] * lift, hit.normal[2] * lift] };
    }
    case 'smooth':
      return { ...base, op: 'smooth', strength: 0.5 + 0.5 * power };
    case 'flatten':
      return { ...base, op: 'flatten', strength: 0.35 * power };
    case 'inflate':
      return { ...base, op: 'inflate', strength: creep * (s.invert ? -1 : 1) };
    case 'pinch':
      return { ...base, op: 'pinch', strength: 0.05 * power * (s.invert ? -1 : 1) };
    case 'crease':
      return { ...base, op: 'crease', strength: 0.05 * power };
    case 'move':
      return { ...base, op: 'grab', dir: [0, 0, 0] };
  }
}

/** Stroke points between two hits, spaced so overlapping stamps read as one continuous mark. */
export function strokePoints(from: PickResult | null, to: PickResult, radius: number, spacing = 0.28): PickResult[] {
  if (!from) return [to];
  const d = Math.hypot(to.point[0] - from.point[0], to.point[1] - from.point[1], to.point[2] - from.point[2]);
  const gap = Math.max(radius * spacing, 1e-4);
  // Too far apart means the pointer jumped to other clay, so no stamps are bridged across the gap.
  if (d > radius * 6 || d < gap) return d < gap ? [] : [to];
  const count = Math.floor(d / gap);
  const out: PickResult[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    const mix = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const n = mix(from.normal, to.normal);
    const l = Math.hypot(...n) || 1;
    out.push({ point: mix(from.point, to.point), normal: [n[0] / l, n[1] / l, n[2] / l] });
  }
  return out;
}
