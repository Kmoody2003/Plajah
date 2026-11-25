// Glossa Hollow vegetation on the platform service (services/vegetation): grown trees with LOD + impostors, GPU grass
// that the Scribe tramples, ferns and undergrowth around the trunks, one wind. Species: catalog/glossaHollow.ts.
import { VegetationScene } from '../../../services/vegetation/scene';
import { GLOSSA_GRASS, GLOSSA_TREES } from '../../../services/vegetation/catalog/glossaHollow';
import { CF_FOREST_FERN, CF_UNDERGROWTH } from '../../../services/vegetation/catalog/cyberForestPlants';
import type { PlantSpot, TreeSpot } from '../../../services/vegetation/scene';
import { heightGlossa } from './world';
import { SIGILS, VILLAGERS } from './content';

const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HOUSES = [0.35, 1.25, 2.2, 3.05, 3.9, 5.5].map((a) => [Math.cos(a) * 19, Math.sin(a) * 19] as const);

/** Where grass grows: [meadow, moss], 0…1 each. Bare on the cobbles, the road, the temple grounds, under houses. */
function coverAt(x: number, z: number): [number, number] {
  const r = Math.hypot(x, z), h = heightGlossa(x, z);
  if (h < -0.5) return [0, 0];
  let bare = 1 - smooth(11, 15, r);                                                    // the village square
  if (z < -6 && z > -72) bare = Math.max(bare, 1 - smooth(2.6, 4.2, Math.abs(x)));     // the north road
  if (Math.abs(x) < 46 && z < -60) bare = Math.max(bare, 0.85);                         // temple grounds
  for (const [hx, hz] of HOUSES) bare = Math.max(bare, 1 - smooth(3.2, 4.6, Math.hypot(x - hx, z - hz)));
  for (const s of SIGILS) if (s.level === 'glossa') bare = Math.max(bare, 1 - smooth(1.4, 2.6, Math.hypot(x - s.pos[0], z - s.pos[1])));
  const keep = 1 - bare;
  const moss = keep * (0.35 + 0.65 * smooth(15, 11, r) + 0.3 * smooth(20, 26, r) * (1 - smooth(30, 40, r)));
  const meadow = keep * smooth(13, 20, r) * (0.7 + 0.3 * hash(Math.floor(x / 6), Math.floor(z / 6)));
  return [Math.min(1, meadow), Math.min(1, moss * 0.8)];
}

export function glossaVegetation(allSpots: TreeSpot[], o: { lowTier: boolean; maxTrees?: number }): VegetationScene {
  // the iGPU profile keeps every giant (they are the hollow) and thins the oaks and far ash
  const treeSpots = o.maxTrees && allSpots.length > o.maxTrees
    ? [...allSpots.filter((t) => t.species === 0), ...allSpots.filter((t) => t.species !== 0).filter((_, i, a) => i < o.maxTrees! - (allSpots.length - a.length))]
    : allSpots;
  // ferns at the feet of the trees and along the hollow's edge; broadleaf undergrowth round the giants
  const plants: PlantSpot[] = [];
  treeSpots.forEach((t, i) => {
    const n = t.species === 0 ? 5 : o.lowTier ? 0 : 2;
    for (let k = 0; k < n; k++) {
      const a = hash(i, k) * Math.PI * 2, d = (t.species === 0 ? 3.5 : 1.8) + hash(k, i) * 3;
      const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      if (Math.hypot(x, z) < 16 || VILLAGERS.some((v) => Math.hypot(v.pos[0] - x, v.pos[1] - z) < 2)) continue;
      plants.push({ x, y: heightGlossa(x, z), z, yaw: a * 5, species: t.species === 0 && k % 2 ? 1 : 0, scale: 0.7 + hash(x, z) * 0.6 });
    }
  });
  // ?notrees / ?nograss / ?noplants: A/B the cost of each part on the target GPU
  const q = new URLSearchParams(location.search);
  return new VegetationScene({
    trees: q.has('notrees') ? undefined : { species: GLOSSA_TREES, spots: treeSpots },
    grass: q.has('nograss') ? undefined : { species: GLOSSA_GRASS, bounds: { x0: -110, z0: -110, size: 220, res: 256 }, heightAt: heightGlossa, coverAt },
    plants: q.has('noplants') ? undefined : { species: [CF_FOREST_FERN, CF_UNDERGROWTH], spots: plants },
    lowTier: o.lowTier,
    wind: 0.5,
  });
}
