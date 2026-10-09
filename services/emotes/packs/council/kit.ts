// kit — shared helpers for the six Council collections.
//
// The SPECS-table pattern from corePack, plus a few light-plot helpers more than one collection
// needs (escaping, a deterministic jitter, the floor spill a light-emitting emote throws).

import type { EmoteDef, EmoteMotion, ChorusEvolution, EmotePackId } from '../../emoteTypes';
import type { Svg } from '../../emoteRig';

export type Spec = [code: string, name: string, gel: string, motion: EmoteMotion, art: () => string, tags: string, unicode?: string, evolution?: ChorusEvolution];

export function toDefs(pack: EmotePackId, specs: Spec[]): EmoteDef[] {
  return specs.map(([code, name, gel, motion, svg, tags, unicode, evolution]) => ({
    id: `${pack}.${code}`, code, name, pack, gel, motion, tags: tags.split(' ').filter(Boolean), unicode, evolution,
    art: { kind: 'svg', svg },
  }));
}

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Deterministic pseudo-random in [-1, 1] — hand-made wobble that is the same every render. */
export function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Light an emitting emote throws on the floor below it — the contact shadow's inverse. */
export function floorSpill(s: Svg, gel: string, cx = 64, y = 118, w = 42, opacity = 0.42) {
  s.add(`<ellipse cx="${cx}" cy="${y}" rx="${w}" ry="${(w * 0.15).toFixed(1)}" fill="${gel}" opacity="${opacity}" ${s.blurFilter(4)}/>`);
}

/** Point on a circle, degrees, screen coords (0° = east, 90° = south). */
export function pol(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}
export const f1 = (n: number) => n.toFixed(1);

/** Gaussian blur whose filter region is the whole emote square. The rig's blurFilter sizes its
 *  region from the bbox, which excludes stroke width — fine for fills, but a wide blurred STROKE
 *  (a neon halo, a light cone) gets cut into a visible rectangle. */
export function wideBlur(s: Svg, std: number): string {
  const id = s.uid('wb');
  s.def(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-16" y="-16" width="160" height="160"><feGaussianBlur stdDeviation="${std}"/></filter>`);
  return `filter="url(#${id})"`;
}
