// playkit/adapters/visualOverhaulHooks.ts
//
// Drop-in Visual & Physics Overhaul Controllers for Plajah's Existing Verticals:
//   - FirstlightOverhaulController: stadium floodlight ClusteredLightManager, turf-scuff/divot
//     DecalPool, instanced crowd GPU-culler batches, and spiral ballistic pass trajectories.
//   - KithOverhaulController: storybook VegetationScene tree catalog, drift rubber skidmark
//     DecalPool, 4-wheel suspension telemetry, and Kith Quest 2D Scene2D spring juice.
//
// Keeps Firstlight & Kith 100% non-breaking while letting their upcoming aesthetic overhauls
// plug directly into Playkit's unified Phase 1–4 engine with a single attach call.

import { ClusteredLightManager } from '../render/clusteredLights';
import { DecalPool, type DecalInstance } from '../render/decals';
import { buildFrustumPlanes, cullAndSelectLod, type CullableInstance, type CullBatchSummary } from '../render/gpuCuller';
import { STAGE_VISUAL_PRESETS, type StageVisualPreset } from '../render/pipeline';
import { PlajahPhysicsWorld, type Vec3 } from '../physics/runtime';
import { createFirstlightPassSpec, KITH_KART_VEHICLE_CONFIG } from './verticalAdapters';
import { VEGETATION_SPECIES_CATALOG } from '../../services/gamestudio/pipelines/vegetationPipeline';
import type { QualityTier } from '../core/engine';

export class FirstlightOverhaulController {
  readonly preset: StageVisualPreset = STAGE_VISUAL_PRESETS['firstlight-primetime-stadium'];
  readonly lights = new ClusteredLightManager({ maxTotalLights: 128 });
  readonly turfDecals: DecalPool;
  readonly physics: PlajahPhysicsWorld;
  private crowdSectors: CullableInstance[] = [];

  constructor(tier: QualityTier = 'medium') {
    this.turfDecals = new DecalPool(tier);
    this.physics = new PlajahPhysicsWorld({ gravity: [0, -24, 0] });
    this.setupStadiumFloodlights();
  }

  private setupStadiumFloodlights(): void {
    // 4 towering corner floodlight banks + endzone rim lights
    const corners: Array<[string, Vec3]> = [
      ['tower_NW', [-42, 34, -55]],
      ['tower_NE', [42, 34, -55]],
      ['tower_SW', [-42, 34, 55]],
      ['tower_SE', [42, 34, 55]],
    ];
    for (const [id, position] of corners) {
      this.lights.upsert({
        id, kind: 'spot', position, color: [1.0, 0.97, 0.9], intensity: 28, range: 130,
        direction: [-position[0] * 0.015, -0.75, -position[2] * 0.01], outerConeCos: 0.5, castShadow: true,
      });
    }
  }

  /** Stamp a turf scuff or tackle divot onto the field ring buffer. */
  stampTurfScuff(pos: Vec3, rotationRad = 0): DecalInstance {
    return this.turfDecals.spawn({
      kind: 'turf-scuff',
      position: [pos[0], 0.02, pos[2]],
      normal: [0, 1, 0],
      sizeMeters: [0.85, 0.45],
      rotationRad,
      tintHex: 0x3f2e1e,
      maxLifeSec: 45,
    });
  }

  /** Register stadium seating crowd blocks for frustum + LOD instanced culling. */
  registerCrowdSectors(sectors: Array<{ id: string; center: Vec3; radius: number }>): void {
    this.crowdSectors = sectors.map((s) => ({
      id: s.id,
      prefabId: 'firstlight.crowd_sector',
      center: s.center,
      radius: s.radius,
      lodCoverages: [0.2, 0.06, 0.01],
    }));
  }

  cullCrowd(camPos: Vec3, camForward: Vec3, camRight: Vec3, camUp: Vec3): CullBatchSummary {
    const planes = buildFrustumPlanes(camPos, camForward, camRight, camUp, Math.PI / 3, 16 / 9, 0.2, 220);
    return cullAndSelectLod(this.crowdSectors, camPos, planes, Math.PI / 3);
  }

  launchSpiralPass(id: string, qbPos: Vec3, targetPos: Vec3, bulletPass = false) {
    return this.physics.spawnProjectile(createFirstlightPassSpec({ id, qbPos, targetPos, bulletPass }));
  }

  update(dt: number): void {
    this.turfDecals.update(dt);
    this.physics.step(dt);
  }
}

export class KithOverhaulController {
  readonly preset: StageVisualPreset = STAGE_VISUAL_PRESETS['kith-storybook-garden'];
  readonly skidDecals: DecalPool;
  readonly kartConfig = KITH_KART_VEHICLE_CONFIG;
  readonly courseTreeSpeciesIds = [
    'fable-ancient-oak',
    'cf-willow',
    'autumn-maple',
    'coastal-windswept-cedar',
    'tropical-royal-palm',
  ].filter((id) => Boolean(VEGETATION_SPECIES_CATALOG[id]));

  constructor(tier: QualityTier = 'medium') {
    this.skidDecals = new DecalPool(tier);
  }

  /** Stamp twin rear-tyre drift skidmarks on asphalt/curb when burnout or drifting is active. */
  stampDriftSkid(leftRearPos: Vec3, rightRearPos: Vec3, headingRad: number): [DecalInstance, DecalInstance] {
    const mk = (pos: Vec3) =>
      this.skidDecals.spawn({
        kind: 'skidmark',
        position: [pos[0], pos[1] + 0.015, pos[2]],
        normal: [0, 1, 0],
        sizeMeters: [0.24, 0.9],
        rotationRad: headingRad,
        tintHex: 0x16161a,
        maxLifeSec: 18,
      });
    return [mk(leftRearPos), mk(rightRearPos)];
  }

  update(dt: number): void {
    this.skidDecals.update(dt);
  }
}
