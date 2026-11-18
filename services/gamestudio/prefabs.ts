// Prop kits: parametric pieces a creator places in the World room (plan §4 Props, Phase 1).
// This file is data only (what a piece is called, its parameters, their ranges and defaults), so the
// Studio can draw controls for any kit without loading the game. Each runtime builds the geometry from
// these parameters (Rift Realm: games/rift-realm/src/studio/prefabs.ts), always in world space so world-
// projected textures line up. That is why pieces have length/height parameters instead of a free scale.

import type { Instance, ParamValue, Vec3 } from './schema';

export type ParamSpec =
  | { key: string; label: string; kind: 'number'; min: number; max: number; step: number; default: number; unit?: string; pro?: boolean }
  | { key: string; label: string; kind: 'int'; min: number; max: number; default: number; pro?: boolean }
  | { key: string; label: string; kind: 'bool'; default: boolean; pro?: boolean }
  | { key: string; label: string; kind: 'choice'; options: { value: string; label: string }[]; default: string; pro?: boolean };

export interface PrefabDef {
  id: string;
  name: string;
  category: 'Walls' | 'Towers' | 'Stairs' | 'Cover' | 'Nature';
  /** One line for the palette. */
  blurb: string;
  params: ParamSpec[];
  /** Rough size [w, h, d] in metres for the selection box, from the parameters. */
  size: (p: Record<string, ParamValue>) => Vec3;
}

const MATERIALS = [
  { value: 'stone', label: 'Mossy stone' }, { value: 'darkStone', label: 'Dark stone' }, { value: 'basalt', label: 'Basalt' },
  { value: 'brick', label: 'Old brick' }, { value: 'steel', label: 'Steel' },
];
const material = (def = 'stone'): ParamSpec => ({ key: 'material', label: 'Material', kind: 'choice', options: MATERIALS, default: def });
const n = (p: Record<string, ParamValue>, k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);

export const RIFT_KIT: PrefabDef[] = [
  { id: 'rr.gothicWall', name: 'Arched wall', category: 'Walls', blurb: 'Wall with pointed arches you can shoot through.',
    params: [
      { key: 'len', label: 'Length', kind: 'number', min: 4, max: 40, step: 0.5, default: 14, unit: ' m' },
      { key: 'h', label: 'Height', kind: 'number', min: 3, max: 16, step: 0.5, default: 7, unit: ' m' },
      { key: 'bays', label: 'Arches', kind: 'int', min: 1, max: 8, default: 3 },
      { key: 'thick', label: 'Thickness', kind: 'number', min: 0.6, max: 3, step: 0.1, default: 1.2, unit: ' m', pro: true },
      material('stone'),
    ],
    size: p => [n(p, 'len', 14) + 1.2, n(p, 'h', 7) + 0.6, n(p, 'thick', 1.2) + 0.7] },
  { id: 'rr.curtainWall', name: 'Battlement wall', category: 'Walls', blurb: 'Solid wall with merlons on top.',
    params: [
      { key: 'len', label: 'Length', kind: 'number', min: 2, max: 60, step: 0.5, default: 12, unit: ' m' },
      { key: 'h', label: 'Height', kind: 'number', min: 1, max: 20, step: 0.5, default: 5, unit: ' m' },
      { key: 'thick', label: 'Thickness', kind: 'number', min: 0.5, max: 4, step: 0.1, default: 2, unit: ' m', pro: true },
      material('darkStone'),
    ],
    size: p => [n(p, 'len', 12), n(p, 'h', 5) + 0.9, n(p, 'thick', 2)] },
  { id: 'rr.tower', name: 'Tower', category: 'Towers', blurb: 'Square tower with a crown.',
    params: [
      { key: 'w', label: 'Width', kind: 'number', min: 2, max: 12, step: 0.5, default: 4, unit: ' m' },
      { key: 'h', label: 'Height', kind: 'number', min: 3, max: 30, step: 0.5, default: 10, unit: ' m' },
      { key: 'spikes', label: 'Spiked crown', kind: 'bool', default: false },
      material('stone'),
    ],
    size: p => [n(p, 'w', 4) + 0.8, n(p, 'h', 10) + 1.6, n(p, 'w', 4) + 0.8] },
  { id: 'rr.stairs', name: 'Stone stairs', category: 'Stairs', blurb: 'A solid flight of steps up to a height.',
    params: [
      { key: 'rise', label: 'Climbs', kind: 'number', min: 0.5, max: 12, step: 0.25, default: 2, unit: ' m' },
      { key: 'width', label: 'Width', kind: 'number', min: 1, max: 10, step: 0.25, default: 3, unit: ' m' },
      { key: 'cheeks', label: 'Side walls', kind: 'bool', default: true, pro: true },
      material('basalt'),
    ],
    // a step is 0.25 high and 0.4 deep; the box is centred, so depth spans the run
    size: p => [n(p, 'width', 3) + 1.2, n(p, 'rise', 2) + 0.9, Math.max(1, Math.round(n(p, 'rise', 2) / 0.25)) * 0.4] },
  { id: 'rr.steelStair', name: 'Steel stairs', category: 'Stairs', blurb: 'Open-tread scaffold stairs with rails.',
    params: [
      { key: 'rise', label: 'Climbs', kind: 'number', min: 0.5, max: 12, step: 0.25, default: 3, unit: ' m' },
      { key: 'width', label: 'Width', kind: 'number', min: 0.8, max: 4, step: 0.1, default: 1.6, unit: ' m' },
    ],
    size: p => [n(p, 'width', 1.6), n(p, 'rise', 3) + 1, Math.max(1, Math.round(n(p, 'rise', 3) / 0.24)) * 0.3] },
  { id: 'rr.block', name: 'Cover block', category: 'Cover', blurb: 'A plain block to hide behind or stand on.',
    params: [
      { key: 'w', label: 'Width', kind: 'number', min: 0.5, max: 20, step: 0.25, default: 3, unit: ' m' },
      { key: 'h', label: 'Height', kind: 'number', min: 0.25, max: 10, step: 0.25, default: 1.25, unit: ' m' },
      { key: 'd', label: 'Depth', kind: 'number', min: 0.5, max: 20, step: 0.25, default: 1, unit: ' m' },
      material('basalt'),
    ],
    size: p => [n(p, 'w', 3), n(p, 'h', 1.25), n(p, 'd', 1)] },
  { id: 'rr.pillar', name: 'Pillar', category: 'Cover', blurb: 'A round or many-sided column.',
    params: [
      { key: 'r', label: 'Radius', kind: 'number', min: 0.2, max: 4, step: 0.05, default: 0.7, unit: ' m' },
      { key: 'h', label: 'Height', kind: 'number', min: 0.5, max: 20, step: 0.25, default: 5, unit: ' m' },
      { key: 'sides', label: 'Sides', kind: 'int', min: 4, max: 16, default: 8, pro: true },
      material('stone'),
    ],
    size: p => [n(p, 'r', 0.7) * 2, n(p, 'h', 5), n(p, 'r', 0.7) * 2] },
  { id: 'rr.boulder', name: 'Boulder', category: 'Nature', blurb: 'A natural rock; change the seed for a new shape.',
    params: [
      { key: 'r', label: 'Size', kind: 'number', min: 0.4, max: 8, step: 0.1, default: 1.6, unit: ' m' },
      { key: 'seed', label: 'Shape', kind: 'int', min: 1, max: 999, default: 7 },
      material('basalt'),
    ],
    size: p => [n(p, 'r', 1.6) * 2, n(p, 'r', 1.6) * 1.6, n(p, 'r', 1.6) * 2] },
];

export const KITS: Record<string, PrefabDef[]> = { 'rift-realm': RIFT_KIT };
export const prefabById = (id: string) => RIFT_KIT.find(p => p.id === id);

export function defaultParams(def: PrefabDef): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const s of def.params) out[s.key] = s.default;
  return out;
}

/** Clamp/round a value to its spec (UI typing, Aria, imported files all go through this). */
export function coerceParam(spec: ParamSpec, v: unknown): ParamValue {
  switch (spec.kind) {
    case 'number': { const x = typeof v === 'number' && Number.isFinite(v) ? v : spec.default; return Math.min(spec.max, Math.max(spec.min, x)); }
    case 'int': { const x = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : spec.default; return Math.min(spec.max, Math.max(spec.min, x)); }
    case 'bool': return typeof v === 'boolean' ? v : spec.default;
    case 'choice': return spec.options.some(o => o.value === v) ? (v as string) : spec.default;
  }
}

/** An instance's parameters with every missing/out-of-range value fixed. */
export function resolvedParams(def: PrefabDef, inst: Pick<Instance, 'params'>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const s of def.params) out[s.key] = coerceParam(s, inst.params?.[s.key]);
  return out;
}

let seq = 0;
export function newInstance(def: PrefabDef, pos: Vec3, yawDeg = 0, taken: Iterable<string> = []): Instance {
  const used = new Set(taken);
  const base = def.id.replace(/^\w+\./, '');
  let id = '';
  do { id = `${base}-${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}`; } while (used.has(id));
  return { id, prefab: def.id, pos: [...pos] as Vec3, rot: [0, yawDeg, 0], scale: [1, 1, 1], params: defaultParams(def) };
}
