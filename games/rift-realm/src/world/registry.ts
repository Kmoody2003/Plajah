// Elderwood Wilds — the contract between the Elderwood Hollow level (elderwood.ts, the CF-24 arena at the centre) and the
// open world built round it (world/*). With the hooks, the hollow becomes the heart of the 2 km map: the world supplies the
// height, terrain, collision field, the places from the art, and their trees and plants. (`?classic` = the arena alone.)
import type * as THREE from 'three/webgpu';
import type { StaticKit } from '../geom';
import type { builders } from '../structures';
import type { TreeSpot } from '../../../../services/vegetation/trees/forest';
import type { PlantSpot } from '../../../../services/vegetation/plants/field';
import type { FungusSpot } from '../../../../services/vegetation/fungi/field';
import type { TerrainField } from '../collision';

export interface WildsMats {
  ground: THREE.Material; bark: THREE.Material; wood: THREE.Material; darkWood: THREE.Material; stone: THREE.Material;
  rock: THREE.Material; rope: THREE.Material; lamp: THREE.Material; rune: THREE.Material; water: THREE.Material; river?: THREE.Material;
  cable: THREE.Material; net: THREE.Material;
}

export interface WildsCtx {
  scene: THREE.Scene; group: THREE.Group; kit: StaticKit; B: ReturnType<typeof builders>;
  lo: boolean; beat: { value: number };
  /** World height (the hollow's own height inside its square). */
  H: (x: number, z: number) => number;
  mats: WildsMats;
  treeSpots: TreeSpot[]; plantSpots: PlantSpot[]; fungusSpots: FungusSpot[];
}

export interface WildsBuilt {
  /** Extra tree placements (species index into ELDERWOOD_TREES (6 = redwood)). */
  treeSpots: TreeSpot[];
  /** Grass cover override outside the hollow (null = the hollow's own rule). */
  grassCover(x: number, z: number): [number, number] | null;
  /** Whether a grown tree outside the hollow gets vines. */
  vineKeep(t: TreeSpot): boolean;
  /** Wind strength for the vegetation (0.55 calm; storms blow harder). */
  wind?(): number;
  update(dt: number, view: THREE.Camera | null, player: THREE.Vector3, pulse: number): void;
  prepare?(renderer: THREE.WebGPURenderer, camera: THREE.Camera): Promise<void> | void;
}

export interface WildsHooks {
  /** World half-size (m). */
  half: number;
  fogDensity: number;
  /** World height; `core` is the hollow's height without its old edge hills. */
  height(x: number, z: number): number;
  setCore(core: (x: number, z: number) => number): void;
  terrain(): TerrainField;
  build(ctx: WildsCtx): WildsBuilt;
}
