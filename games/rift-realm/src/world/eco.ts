// Elderwood Wilds — the forest's life as EcoSystem rules (services/terrain/eco, docs/plajah-terrain.md phase 5).
//
// The same forest world/index.ts grows by hand today, written as rules: region species and densities for the canopy,
// undergrowth and fungi round the trees, flowers along the rivers. With the erosion bake loaded (?erosion=1) the land's
// maps join in: trees thin out on scree fans and in drainage channels, ferns crowd the wet hollows, glowcaps follow the
// channels. Pure data + layout maths (no three.js), so it runs in tests and tools as well as the game.
import { ELDERWOOD_TREES } from '../../../../services/vegetation/catalog/cyberForest';
import { scatterEcosystem, type EcoResult, type EcoRule, type EcoSample, type EcoWorld, type Range, type Spot } from '../../../../services/terrain/eco/index';
import { CORE, HALF, POOL_STREAM, RIVER, WATER_Y, plateauMask, polyNear } from './layout';

type Region = 'wet' | 'vale' | 'highland' | 'redwood' | 'plateau';
const regionOf = (s: EcoSample): Region => (s.memo.region as Region | undefined) ?? (s.memo.region = regionCalc(s));
const regionCalc = (s: EcoSample): Region => {
  if (s.y < WATER_Y + 0.4) return 'wet';
  if (plateauMask(s.x, s.z) < 0.5) return 'vale';
  if (s.z < -470) return 'highland';
  if (s.x > 220 && s.z < 40) return 'redwood';
  return 'plateau';
};
const REGION_DENSITY: Record<Region, number> = { wet: 0.82 * 0.35, vale: 0.9, highland: 0.7, redwood: 0.62, plateau: 0.82 };
/** Willows take 45 % of the dry ground within 34 m of the river. */
const nearRiver = (s: EcoSample) => (s.memo.nearRiver as number | undefined) ?? (s.memo.nearRiver = s.y >= WATER_Y + 0.4 && riverDist(s.x, s.z) < 34 ? 1 : 0);
/** Distance to the river, skipping the polyline walk far from it (padded segment boxes). */
const RIVER_BOX = RIVER.slice(0, -1).map((a, i) => { const b = RIVER[i + 1], p = 50; return [Math.min(a[0], b[0]) - p, Math.max(a[0], b[0]) + p, Math.min(a[1], b[1]) - p, Math.max(a[1], b[1]) + p]; });
const riverDist = (x: number, z: number) => (RIVER_BOX.some((b) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) ? polyNear(RIVER, x, z).d : Infinity);
/** With the erosion maps: fewer trees on fresh scree and in drainage channels. */
const landFactor = (s: EcoSample) => (s.maps ? (1 - 0.75 * sm(0.2, 0.6, s.dep)) * (1 - 0.85 * sm(0.36, 0.46, s.flow)) : 1);
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const density = (s: EcoSample) => (Math.max(Math.abs(s.x), Math.abs(s.z)) > 880 ? (regionOf(s) === 'wet' ? 0.55 * 0.35 : 0.55) : REGION_DENSITY[regionOf(s)]);

/** A canopy rule for one species in a region, sharing the region with the others by weight. */
const tree = (id: string, species: number, region: Region, share: number, scale: Range = [0.85, 1.4]): EcoRule => ({
  id, kind: 'tree', layer: 'canopy', species, weight: share, density, scale,
  up: [0.78, 0.82], clear: [4.6, 5.4],
  where: (s) => (regionOf(s) === region ? (1 - 0.45 * nearRiver(s)) * landFactor(s) : 0),
});

const STREAM_BOX = POOL_STREAM.slice(0, -1).map((a, i) => { const b = POOL_STREAM[i + 1], p = 30; return [Math.min(a[0], b[0]) - p, Math.max(a[0], b[0]) + p, Math.min(a[1], b[1]) - p, Math.max(a[1], b[1]) + p]; });
const inBoxes = (bx: number[][], x: number, z: number) => bx.some((b) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]);
const RIVERSIDE = (s: EcoSample) => (s.memo.riverside as number | undefined) ?? (s.memo.riverside = riversideCalc(s));
const riversideCalc = (s: EcoSample) => {
  // a band 2–9 m beyond the water's edge, on the gentle reaches (not the falls)
  for (const [pts, bx] of [[RIVER, RIVER_BOX], [POOL_STREAM, STREAM_BOX]] as const) {
    if (!inBoxes(bx, s.x, s.z)) continue;
    const n = polyNear(pts, s.x, s.z), a = pts[n.i], b = pts[n.i + 1];
    if (Math.abs(b[2] - a[2]) > 10) continue;
    const e = n.d - (a[3] + (b[3] - a[3]) * n.t) / 2;
    if (e > 2 && e < 9) return 1;
  }
  return 0;
};

/** Undergrowth grows round trees inside the 950 m circle (as world/index.ts). */
const inside = (t: Spot) => Math.hypot(t.x, t.z) < HALF * 0.95;

export const WILDS_ECO: EcoRule[] = [
  // ── canopy: species by region (as world/index.ts) ──
  tree('plateau-2', 2, 'plateau', 0.5), tree('plateau-0', 0, 'plateau', 0.5),
  tree('vale-0', 0, 'vale', 0.72), tree('vale-1', 1, 'vale', 0.14), tree('vale-2', 2, 'vale', 0.14),
  tree('highland-2', 2, 'highland', 0.6), tree('highland-0', 0, 'highland', 0.4),
  tree('redwood-6', 6, 'redwood', 0.7, [0.75, 1.25]), tree('redwood-2', 2, 'redwood', 0.3, [1.25, 1.95]),
  tree('mire-3', 3, 'wet', 1),
  { id: 'riverside-willow', kind: 'tree', layer: 'canopy', species: 1, weight: 0.45, density, scale: [0.85, 1.4], up: [0.78, 0.82], clear: [4.6, 5.4], where: (s) => nearRiver(s) * landFactor(s) },
  // ── round the trees ──
  { id: 'redwood-fern', kind: 'plant', layer: 'around', species: 8, hosts: [6], hostWhere: inside, prob: 1, count: [3, 5], ring: [1.6, 4.2], trunkScaled: true, clear: [1.2, 1.8], scale: [0.9, 1.8] },
  { id: 'redwood-leafy', kind: 'plant', layer: 'around', species: 7, hosts: [6], hostWhere: inside, prob: 1, count: [2, 4], ring: [1.6, 4.2], trunkScaled: true, clear: [1.2, 1.8], scale: [0.9, 1.8] },
  { id: 'redwood-shelf', kind: 'fungus', layer: 'around', species: 4, hosts: [6], hostWhere: inside, prob: 1, count: [3, 3], ring: [0, 0], onTrunk: [2, 6], scale: [1.2, 2.4] },
  { id: 'fern', kind: 'plant', layer: 'around', species: 0, hosts: [0, 1, 2, 3], hostWhere: inside, prob: 0.62, count: [1, 3], ring: [2.2, 7.5], clear: [1.5, 2.3], scale: [0.95, 1.9] },
  { id: 'bush', kind: 'plant', layer: 'around', species: 1, hosts: [0, 1, 2, 3], hostWhere: inside, prob: 0.42, count: [1, 2], ring: [2.4, 7.5], clear: [1.5, 2.3], scale: [0.95, 1.85] },
  { id: 'glowcap', kind: 'fungus', layer: 'around', species: 0, hosts: [0, 1, 2, 3], hostWhere: inside, prob: 0.18, count: [1, 2], ring: [1.8, 5.2], sink: 0.08, scale: (_s, r) => (1 + r * 1.25) / 1.16 },
  { id: 'glowcap-tall', kind: 'fungus', layer: 'around', species: 1, hosts: [0, 1, 2, 3], hostWhere: inside, prob: 0.085, count: [1, 1], ring: [2, 5], sink: 0.08, scale: (_s, r) => (1 + r * 1.25) / 1.48 },
  { id: 'trunk-shelf', kind: 'fungus', layer: 'around', species: 4, hosts: [0, 1, 2, 3], hostWhere: inside, prob: 0.14, count: [1, 2], ring: [0, 0], onTrunk: [3.2, 5.0], scale: [1.1, 2.0] },
  // ── along the rivers ──
  { id: 'riverside-flowers', kind: 'plant', layer: 'ground', species: 2, cell: 5, density: 0.48, where: RIVERSIDE, scale: [0.9, 1.85] },
  { id: 'riverside-ferns', kind: 'plant', layer: 'ground', species: 8, cell: 6, density: 0.52, where: RIVERSIDE, scale: [0.85, 1.7] },
  { id: 'riverside-crystals', kind: 'plant', layer: 'ground', species: 4, cell: 5, density: 0.16, where: RIVERSIDE, scale: [0.9, 1.8] },
  // ── with the erosion maps (enabled by default): life that follows the water ──
  { id: 'wet-ferns', kind: 'plant', layer: 'ground', species: 0, cell: 8.5, density: 0.65, needsMaps: true, wet: [0.62, 0.80], up: [0.84, 0.92], clear: [1.5, 2.3], scale: [1.0, 1.95] },
  { id: 'channel-glowcaps', kind: 'fungus', layer: 'ground', species: 0, cell: 10, density: 0.58, needsMaps: true, flow: [0.32, 0.42], up: [0.8, 0.9], clear: [1.2, 2], sink: 0.08, scale: (_s, r) => (1 + r * 1.45) / 1.16 },
];

export interface WildsEcoInput {
  height(x: number, z: number): number;
  normal(x: number, z: number): ArrayLike<number>;
  /** Metres to the nearest trail, river edge or place (world/index.ts's mask). */
  clearance(x: number, z: number): number;
  maps?: EcoWorld['maps'];
  lowTier?: boolean;
  existingTrees?: Spot[];
  seed?: number;
}

/** Grow the Wilds' forest from the rules: canopy trees, undergrowth and fungi round them, flowers by the rivers. */
export function scatterWilds(i: WildsEcoInput): EcoResult {
  const world: EcoWorld = {
    bounds: { x0: -HALF + 40, z0: -HALF + 40, x1: HALF - 40, z1: HALF - 40 },
    height: i.height, normal: i.normal, clearance: i.clearance, maps: i.maps ?? null,
    exclude: (x, z) => Math.abs(x) < CORE + 6 && Math.abs(z) < CORE + 6,
    trunkRadius: (t) => (ELDERWOOD_TREES[t.species]?.trunk.radius ?? 0.5) * t.scale,
  };
  return scatterEcosystem(world, WILDS_ECO, { seed: i.seed ?? 9091, canopyCell: i.lowTier ? 15 : 10.5, existingTrees: i.existingTrees, densityScale: i.lowTier ? 0.45 : 1 });
}
