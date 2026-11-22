// Elderwood Wilds — terrain: the world height baked once into grids (2 m over the world, 1 m over the hollow), streamed
// as 100 m chunks at three detail levels round the camera, and answered to the collision world as a height field with
// caves (the vaults, the Titan Tree's hollow) and a trunk grid (every grown tree's trunk is a cylinder, not triangles).
// The grids, columns and chunk streaming are the shared terrain service (services/terrain); this file adds the Wilds'
// regions, caves, holes and ground material.
import * as THREE from 'three/webgpu';
import { color, float, mix, normalWorld, positionWorld, smoothstep, texture as tslTexture, uniform, vec2, vec3 } from 'three/tsl';
import { ColumnGrid, HeightField, type TerrainField } from '../../../../services/terrain/field';
import { TerrainChunks as ServiceChunks } from '../../../../services/terrain/chunks';
import { compileGraph, type TerrainGraph } from '../../../../services/terrain/graph';
import { art } from '../cyberforest';
import { pbr } from '../textures';
import { CAVES, CAVE_CIRCLES, HALF, MESH_HOLES, worldHeight } from './layout';

const inBox = (x: number, z: number, b: number[], pad = 0) => {
  const c = Math.cos(b[4]), s = Math.sin(b[4]), dx = x - b[0], dz = z - b[1];
  return Math.abs(dx * c - dz * s) <= b[2] / 2 + pad && Math.abs(dx * s + dz * c) <= b[3] / 2 + pad;
};

/** The Wilds as a terrain graph. Today its one node is the hand-written height (layout.ts worldHeight); later phases
 *  add erosion and other nodes on top without touching it. */
export const WILDS_GRAPH: TerrainGraph = { version: 1, name: 'elderwood-wilds', nodes: { base: { type: 'fn', name: 'wilds.worldHeight' } }, output: 'base' };
const wildsHeight = compileGraph(WILDS_GRAPH, { 'wilds.worldHeight': worldHeight });

/** The Wilds' ground: 2 m over the 2 km world, 1 m over the hollow (worldHeight is read at bake time, so setCoreHeight
 *  then `baked = false` re-bakes with the new core). */
export class WorldTerrain extends HeightField implements TerrainField {
  private trunks = new ColumnGrid(8);
  step = 0.55;

  constructor() {
    super({ name: 'wilds', height: wildsHeight, world: { x0: -HALF, z0: -HALF, size: HALF * 2, cell: 2 }, detail: [{ x0: -112, z0: -112, size: 224, cell: 1 }] });
  }

  heightAt(x: number, z: number, y?: number) {
    if (y !== undefined) {
      for (const c of CAVES) if (y < c[5] && inBox(x, z, c)) return -Infinity;
      for (const c of CAVE_CIRCLES) if (y < c[3] && (x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2] * c[2]) return -Infinity;
    }
    return this.surface(x, z);
  }

  addTrunk(x: number, z: number, r: number, y0: number, y1: number) { this.trunks.add(x, z, r, y0, y1); }
  trunksNear(x: number, z: number, r: number) { return this.trunks.near(x, z, r); }
}

// ── the ground material: the hollow's moss on the flats, rock on the slopes and cliffs, mud by the water ──────────
export function terrainMaterial(beat: { value: number }) {
  const mossA = art('moss_cable_albedo.jpg', true, true), mossB = art('moss_strand_albedo.jpg', true, true), mossG = art('moss_glow_albedo.jpg', true, true);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, normalMap: art('moss_cable_normal.jpg', false, true) });
  m.normalScale.set(0.8, 0.8);
  const rockSet = pbr('volc-rock', { maps: ['normal', 'roughness'], tint: 0x8a9488, normalScale: 1.3 }) as THREE.MeshStandardNodeMaterial;
  const rockMap = rockSet.map ?? null;
  const wp = positionWorld.xz;
  const a = tslTexture(mossA, wp.mul(1 / 9).add(vec2(0.21, 0.63))).rgb, b = tslTexture(mossB, wp.mul(1 / 8).add(vec2(0.37, 0.11))).rgb;
  const g = tslTexture(mossG, wp.mul(1 / 6)).rgb;
  const k = tslTexture(mossG, wp.mul(1 / 97)).g, k2 = tslTexture(mossB, wp.mul(1 / 71).add(vec2(0.5, 0.2))).g;
  const base = mix(b.mul(0.75), g.mul(0.45), smoothstep(float(0.62), float(0.82), k2));
  const lum = a.dot(vec3(0.3, 0.5, 0.2));
  const moss = mix(base, a.mul(0.6), smoothstep(float(0.62), float(0.8), k).mul(smoothstep(float(0.6), float(0.2), lum))).mul(vec3(0.4, 0.58, 0.36));
  // rock: side-projected on the steep faces (x/z planes by the normal), grey-green
  const ny = normalWorld.y.abs();
  const rx = rockMap ? tslTexture(rockMap, positionWorld.zy.mul(1 / 7)).rgb : vec3(0.35);
  const rz = rockMap ? tslTexture(rockMap, positionWorld.xy.mul(1 / 7)).rgb : vec3(0.35);
  // grey-green stone: the rock sheet's luminance only (its lava-orange cracks belong to the volcanic level)
  const rl = mix(rx, rz, normalWorld.z.abs().div(normalWorld.x.abs().add(normalWorld.z.abs()).add(0.001))).dot(vec3(0.3, 0.55, 0.15));
  const rock = vec3(rl).mul(vec3(0.5, 0.6, 0.55));
  const steep = smoothstep(float(0.78), float(0.6), ny);
  // mud at the waterline and in the vale's wet ground
  const wet = smoothstep(float(-47.6), float(-48.8), positionWorld.y);
  m.colorNode = mix(mix(moss, rock, steep), vec3(0.09, 0.1, 0.08), wet.mul(0.7));
  const cyan = color(0x2ae6ff), uB = uniform(0);
  m.emissiveNode = g.mul(smoothstep(float(0.6), float(0.9), g.g)).mul(cyan).mul(smoothstep(float(0.25), float(0.75), k).mul(0.8).add(0.2))
    .mul(float(0.12).add(uB.mul(0.1))).mul(float(1).sub(steep));
  return { material: m, setBeat: () => { uB.value = beat.value; } };
}

// ── streamed chunks ────────────────────────────────────────────────────────────────────────────────────────────────
function holed(x: number, z: number) {
  for (const c of MESH_HOLES.circles) if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2] * c[2]) return true;
  for (const b of MESH_HOLES.boxes) if (inBox(x, z, b)) return true;
  return false;
}

/** The service's chunk streamer with the Wilds' settings: 100 m chunks, the hollow at double detail up close, holes
 *  for the cave mouths and wells. */
export class TerrainChunks extends ServiceChunks {
  constructor(terrain: WorldTerrain, material: THREE.Material, lowTier: boolean) {
    super(terrain, material, {
      name: 'wilds-terrain', half: HALF, chunk: 100, lowTier, holed,
      // the hollow's chunks get double the detail at the nearest level (decks, pads and the pool basin are small)
      segFor: (cx, cz, lod, seg) => (lod === 0 && Math.abs(cx) < 130 && Math.abs(cz) < 130 ? 100 : seg),
      mayHaveHoles: (cx, cz, C) => MESH_HOLES.circles.some((c) => Math.abs(c[0] - cx) < C / 2 + c[2] && Math.abs(c[1] - cz) < C / 2 + c[2])
        || MESH_HOLES.boxes.some((b) => Math.abs(b[0] - cx) < C / 2 + 10 && Math.abs(b[1] - cz) < C / 2 + 10),
    });
  }
}
