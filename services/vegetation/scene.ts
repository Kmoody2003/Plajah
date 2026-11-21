// Plajah Vegetation — one object a level drops in to get all of it (docs/plajah-vegetation.md §2).
//
// Trees (grown, LOD + impostors), grass (GPU blades + trample), plants (ferns … vines, stumps), fungi (caps, shelves,
// spores) and the one wind, behind three calls: new VegetationScene(...), await prepare(renderer, camera) once the
// renderer is up (impostor bakes), update(dt, camera, walkers) every frame. A level supplies species, spots and the
// ground rules; everything else (culling, LOD, wind, trample, spring-back) is the service's.
import * as THREE from 'three/webgpu';
import type { FungusSpecies, GrassSpecies, PlantSpecies, TreeSpecies } from './species';
import { Forest, type TreeSpot } from './trees/forest';
import { GrassField } from './grass/field';
import { bakeGround, type Ground, type GroundBounds } from './grass/ground';
import { PlantField, type PlantSpot } from './plants/field';
import { FungusField, type FungusSpot } from './fungi/field';
import { addImpulse, updateWind } from './wind';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface VegetationSceneOptions {
  trees?: { species: TreeSpecies[]; spots: TreeSpot[] };
  grass?: {
    species: GrassSpecies[];
    bounds: GroundBounds;
    heightAt: (x: number, z: number) => number;
    /** How strongly each grass species (up to 4) grows at (x, z), 0…1. */
    coverAt: (x: number, z: number) => [number, number?, number?, number?];
  };
  /** `more` runs once the forest exists (e.g. vines hung from its branches via scene.hangPoints). */
  plants?: { species: PlantSpecies[]; spots: PlantSpot[]; more?: (scene: VegetationScene) => PlantSpot[] };
  fungi?: { species: FungusSpecies[]; spots: FungusSpot[] };
  lowTier?: boolean;
  /** A uniform the glow pulses with (the music's beat). */
  beat?: N;
  shadows?: boolean;
  /** Wind strength 0…1 (a forest floor ≈ 0.55). */
  wind?: number;
}

export class VegetationScene {
  readonly group = new THREE.Group();
  readonly forest: Forest | null;
  readonly grass: GrassField | null;
  readonly ground: Ground | null;
  readonly plants: PlantField | null;
  readonly fungi: FungusField | null;
  private camera: THREE.Camera | null = null;
  private stepT = 0;
  private tmp = new THREE.Vector3();

  constructor(private o: VegetationSceneOptions) {
    this.group.name = 'vegetation';
    const lo = !!o.lowTier, beat = o.beat;
    this.forest = o.trees ? new Forest(o.trees.species, o.trees.spots, { lowTier: lo, beat, shadows: o.shadows ?? !lo }) : null;
    if (o.grass) {
      this.ground = bakeGround(o.grass.bounds, o.grass.heightAt, o.grass.coverAt);
      this.grass = new GrassField(o.grass.species, this.ground, { lowTier: lo, beat, shadows: false });
    } else { this.ground = null; this.grass = null; }
    this.plants = o.plants ? new PlantField(o.plants.species, [...o.plants.spots, ...(o.plants.more?.(this) ?? [])], { lowTier: lo, beat, shadows: o.shadows ?? !lo }) : null;
    this.fungi = o.fungi ? new FungusField(o.fungi.species, o.fungi.spots, { lowTier: lo, beat, shadows: o.shadows ?? !lo }) : null;
    for (const f of [this.forest, this.grass, this.plants, this.fungi]) if (f) this.group.add(f.group);
  }

  /** Branch points where vines can hang (see Forest.hangPoints). */
  hangPoints(perTree: number, keep?: (p: TreeSpot) => boolean, seed?: number) { return this.forest?.hangPoints(perTree, keep, seed) ?? []; }

  /** Once the renderer is up: bake the tree impostors (far trees stay on the coarse mesh until then). */
  async prepare(renderer: THREE.WebGPURenderer, camera: THREE.Camera, light: { environment?: THREE.Texture | null; envIntensity?: number } = {}) {
    this.camera = camera;
    if (this.forest) await this.forest.bake(renderer, light);
  }

  /** Every frame. `walkers` (on the ground) lay the grass flat; the first one also pushes the vegetation as it runs. */
  update(dt: number, walkers: THREE.Vector3[] = [], camera: THREE.Camera | null = this.camera) {
    updateWind(dt, this.o.wind ?? 0.55);
    const lead = walkers[0];
    if (lead && (this.stepT -= dt) <= 0) { this.stepT = 0.2; addImpulse(lead.x, lead.z, 3.0, 0.3, 3); }
    if (this.ground) {
      const g = this.o.grass!;
      for (const w of walkers) if (Math.abs(w.y - g.heightAt(w.x, w.z)) < 1.2) this.ground.press(w.x, w.z, 0.85, 0.85);
    }
    const view = camera ?? (lead ? this.tmp.copy(lead) : null);
    if (!view) return;
    this.forest?.update(view, dt);
    if (camera) { this.grass?.update(camera, dt); this.plants?.update(camera, dt); this.fungi?.update(camera, dt); }
    else this.ground?.update(dt);
  }
}

export type { TreeSpot, PlantSpot, FungusSpot };
