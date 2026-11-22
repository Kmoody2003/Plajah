// Plajah Terrain — the EcoSystem (docs/plajah-terrain.md, phase 5): every tree, plant and fungus placed by rules.
//
// A level describes its life as rules instead of hand-written placement loops:
//   canopy rules   compete for one jittered candidate grid (species chosen by weight × suitability, kept by density);
//   around rules   grow from the placed canopy (ferns at a redwood's roots, shelf fungi up a trunk);
//   ground rules   scatter on their own grid (flowers by the water, glowcaps where it's wet).
// Suitability is the product of smoothstep ranges over what the land says (height, steepness, and — with an erosion
// bake — wetness, flow, fresh sediment), a region mask from the level, and the clearance from paths and places.
// Deterministic for a seed. The output is plain {x, y, z, yaw, species, scale} spots for services/vegetation.
//
// CPU today (tens of thousands of spots in tens of ms); the plan's GPU scatter is a later optimisation.

export type Range = [number, number];
export type EcoKind = 'tree' | 'plant' | 'fungus';

/** What the land says at a point. Map values read 0 without an erosion bake (rules can check `maps`). */
export interface EcoSample {
  x: number; z: number; y: number;
  /** |normal.y|: 1 flat … 0 vertical. */
  up: number;
  wet: number; flow: number; dep: number;
  /** Metres to the nearest path, river edge or place (Infinity when the level gives none). */
  clear: number;
  maps: boolean;
  /** Per-point cache for values several rules derive (a region, a distance): compute once, reuse. */
  memo: Record<string, unknown>;
}

export interface Spot { x: number; y: number; z: number; yaw: number; species: number; scale: number }

interface RuleBase {
  id: string;
  kind: EcoKind;
  species: number;
  /** smoothstep ranges ([from, to], from > to falls); all multiply. */
  height?: Range; up?: Range; wet?: Range; flow?: Range; dep?: Range; clear?: Range;
  /** Region mask / extra factor from the level, 0…1. */
  where?: (s: EcoSample) => number;
  /** Scale: a range, or a function of the sample and a 0…1 random. */
  scale?: Range | ((s: EcoSample, r: number) => number);
  /** Sink into the ground (m). */
  sink?: number;
  /** Skip without an erosion bake (map-driven extras). */
  needsMaps?: boolean;
}

export interface CanopyRule extends RuleBase {
  layer: 'canopy';
  /** Share among canopy rules competing for a candidate (times suitability). */
  weight?: number;
  /** Chance a candidate this rule wins is kept, at full suitability (a function for region-dependent density). */
  density: number | ((s: EcoSample) => number);
}

export interface AroundRule extends RuleBase {
  layer: 'around';
  /** Host tree species (any when omitted). */
  hosts?: number[];
  /** Only hosts this accepts (e.g. inside a radius). */
  hostWhere?: (t: Spot) => boolean;
  /** Chance per host. */
  prob: number;
  /** How many per host (inclusive range). */
  count: [number, number];
  /** Ring round the host's trunk in metres (`trunkScaled`: in trunk radii). */
  ring: Range;
  trunkScaled?: boolean;
  /** On the trunk at this height range above the base, in trunk radii (a shelf fungus) instead of on the ground. */
  onTrunk?: Range;
}

export interface GroundRule extends RuleBase {
  layer: 'ground';
  /** Candidate grid spacing (m) and the chance each is kept at full suitability. */
  cell: number;
  density: number;
}

export type EcoRule = CanopyRule | AroundRule | GroundRule;

export interface EcoWorld {
  bounds: { x0: number; z0: number; x1: number; z1: number };
  height(x: number, z: number): number;
  /** Surface normal [x, y, z]. */
  normal(x: number, z: number): ArrayLike<number>;
  maps?: { wet?: Sampler | null; flow?: Sampler | null; dep?: Sampler | null } | null;
  clearance?(x: number, z: number): number;
  /** Hard keep-outs (the arena, inside buildings). */
  exclude?(x: number, z: number): boolean;
  /** Trunk radius of a placed tree (for around rules). */
  trunkRadius?(t: Spot): number;
}
export interface Sampler { at(x: number, z: number): number }

export interface EcoOptions {
  seed?: number;
  /** Canopy candidate spacing (m). */
  canopyCell: number;
  /** Existing trees (authored placements): around rules grow from them too. */
  existingTrees?: Spot[];
  /** Thin the undergrowth (around + ground rules) by this factor (low tier; the canopy thins by canopyCell). */
  densityScale?: number;
}

export interface EcoResult { trees: Spot[]; plants: Spot[]; fungi: Spot[]; byRule: Record<string, number>; ms: number }

const ss = (r: Range, x: number) => { const t = Math.min(1, Math.max(0, (x - r[0]) / (r[1] - r[0]))); return t * t * (3 - 2 * t); };

/** Suitability of a rule at a sample, 0…1. */
export function suitability(r: RuleBase, s: EcoSample): number {
  if (r.needsMaps && !s.maps) return 0;
  let k = 1;
  if (r.height) k *= ss(r.height, s.y);
  if (r.up) k *= ss(r.up, s.up);
  if (r.clear) k *= ss(r.clear, s.clear);
  if (r.wet) k *= ss(r.wet, s.wet);
  if (r.flow) k *= ss(r.flow, s.flow);
  if (r.dep) k *= ss(r.dep, s.dep);
  if (k > 0 && r.where) k *= r.where(s);
  return k;
}

export function scatterEcosystem(world: EcoWorld, rules: EcoRule[], o: EcoOptions): EcoResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let seed = (o.seed ?? 1) >>> 0 || 1;
  const R = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const dk = o.densityScale ?? 1, maps = !!(world.maps && (world.maps.wet || world.maps.flow || world.maps.dep));
  const sample = (x: number, z: number): EcoSample => {
    const n = world.normal(x, z);
    return {
      x, z, y: world.height(x, z), up: Math.abs(n[1]),
      wet: world.maps?.wet?.at(x, z) ?? 0, flow: world.maps?.flow?.at(x, z) ?? 0, dep: world.maps?.dep?.at(x, z) ?? 0,
      clear: world.clearance ? world.clearance(x, z) : Infinity, maps, memo: {},
    };
  };
  const scaleOf = (r: RuleBase, s: EcoSample) => { const q = R(); return typeof r.scale === 'function' ? r.scale(s, q) : r.scale ? r.scale[0] + (r.scale[1] - r.scale[0]) * q : 1; };
  const out: EcoResult = { trees: [], plants: [], fungi: [], byRule: {}, ms: 0 };
  const push = (r: RuleBase, spot: Spot) => { (r.kind === 'tree' ? out.trees : r.kind === 'plant' ? out.plants : out.fungi).push(spot); out.byRule[r.id] = (out.byRule[r.id] ?? 0) + 1; };
  const { x0, z0, x1, z1 } = world.bounds;

  // ── canopy: one jittered grid, rules compete ──
  const canopy = rules.filter((r): r is CanopyRule => r.layer === 'canopy');
  if (canopy.length) {
    const c = o.canopyCell, wts = new Float64Array(canopy.length);
    for (let gz = z0; gz < z1; gz += c) for (let gx = x0; gx < x1; gx += c) {
      const x = gx + (R() - 0.5) * c * 0.95, z = gz + (R() - 0.5) * c * 0.95;
      if (world.exclude?.(x, z)) continue;
      const s = sample(x, z);
      let sum = 0;
      for (let k = 0; k < canopy.length; k++) { wts[k] = (canopy[k].weight ?? 1) * suitability(canopy[k], s); sum += wts[k]; }
      if (sum <= 0) continue;
      let pick = R() * sum, k = 0;
      while (k < canopy.length - 1 && pick > wts[k]) { pick -= wts[k]; k++; }
      const r = canopy[k], suit = wts[k] / (r.weight ?? 1);
      if (R() > (typeof r.density === 'function' ? r.density(s) : r.density) * suit) continue;
      push(r, { x, y: s.y - (r.sink ?? 0.25), z, yaw: R() * 6.283, species: r.species, scale: scaleOf(r, s) });
    }
  }

  // ── around the canopy (and the authored trees) ──
  const hosts = [...(o.existingTrees ?? []), ...out.trees];
  for (const r of rules) {
    if (r.layer !== 'around' || (r.needsMaps && !maps)) continue;
    for (const t of hosts) {
      if ((r.hosts && !r.hosts.includes(t.species)) || (r.hostWhere && !r.hostWhere(t))) continue;
      if (R() > r.prob * dk) continue;
      const tr = world.trunkRadius?.(t) ?? 0.5;
      const m = r.count[0] + Math.floor(R() * (r.count[1] - r.count[0] + 1));
      for (let q = 0; q < m; q++) {
        const a = R() * 6.283, k = r.trunkScaled ? tr : 1;
        if (r.onTrunk) {
          const d = tr * 0.92, x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
          push(r, { x, y: t.y + tr * (r.onTrunk[0] + R() * (r.onTrunk[1] - r.onTrunk[0])), z, yaw: a, species: r.species, scale: scaleOf(r, sample(t.x, t.z)) });
          continue;
        }
        const d = k * (r.ring[0] + R() * (r.ring[1] - r.ring[0])), x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d;
        if (world.exclude?.(x, z)) continue;
        const s = sample(x, z), suit = suitability(r, s);
        if (suit <= 0 || R() > suit) continue;
        push(r, { x, y: s.y - (r.sink ?? 0.05), z, yaw: R() * 6.283, species: r.species, scale: scaleOf(r, s) });
      }
    }
  }

  // ── ground rules on their own grids ──
  for (const r of rules) {
    if (r.layer !== 'ground' || (r.needsMaps && !maps)) continue;
    const c = r.cell;
    for (let gz = z0; gz < z1; gz += c) for (let gx = x0; gx < x1; gx += c) {
      const x = gx + R() * c, z = gz + R() * c;
      if (world.exclude?.(x, z)) continue;
      const s = sample(x, z), suit = suitability(r, s);
      if (suit <= 0 || R() > r.density * dk * suit) continue;
      push(r, { x, y: s.y - (r.sink ?? 0.05), z, yaw: R() * 6.283, species: r.species, scale: scaleOf(r, s) });
    }
  }
  out.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return out;
}

/** Problems with a rule set (bad ranges, densities, counts); empty when sound. */
export function validateEco(rules: EcoRule[]): string[] {
  const errs: string[] = [], ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) errs.push(`duplicate rule id ${r.id}`); ids.add(r.id);
    for (const k of ['height', 'up', 'wet', 'flow', 'dep', 'clear'] as const) { const v = r[k]; if (v && v[0] === v[1]) errs.push(`${r.id}: ${k} range is empty`); }
    if ((r.layer === 'canopy' || r.layer === 'ground') && typeof r.density === 'number' && !(r.density > 0 && r.density <= 1)) errs.push(`${r.id}: density must be in (0, 1]`);
    if (r.layer === 'ground' && !(r.cell > 0)) errs.push(`${r.id}: cell must be > 0`);
    if (r.layer === 'around' && (r.count[0] > r.count[1] || r.count[0] < 0)) errs.push(`${r.id}: bad count`);
    if (r.layer === 'around' && !(r.prob >= 0 && r.prob <= 1)) errs.push(`${r.id}: prob must be in [0, 1]`);
  }
  return errs;
}
