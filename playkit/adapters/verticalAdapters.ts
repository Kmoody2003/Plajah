// playkit/adapters/verticalAdapters.ts
//
// Zero-breaking interop bridges folding Plajah's existing verticals directly onto the unified
// `playkit` spine without duplicating logic or introducing any `isFirstParty` privilege paths:
//   - Kith Quest (2D side-scroller input & tuning)
//   - Kith Racing (4-wheel suspension vehicle config preset)
//   - Firstlight (3D football ballistic spiral pass & stadium visual preset)
//   - Live Party & Parlor Games (Brain Rush / Crowd Says / Impostor Night -> ParlorSession + 3D Stages)
//   - Game Studio Prop Kits (`RIFT_KIT` -> PlaykitRegistry)

import type { UnifiedInputFrame } from '../input/unifiedInput';
import type { Platformer2DInput } from '../physics/physics2d';
import type { BallisticProjectile, Vec3, VehicleConfig } from '../physics/runtime';
import { ParlorSession, type BuiltInParlorKind } from '../modes/parlor';
import type { PlaykitRegistry } from '../core/registry';
import { RIFT_KIT } from '../../services/gamestudio/prefabs';
import { STAGE_VISUAL_PRESETS } from '../render/pipeline';
import { VegetationScene, type VegetationSceneOptions } from '../../services/vegetation/scene';
import { CYBER_FOREST_TREES, CF_GREAT_OAK, CF_PLATFORM_OAK } from '../../services/vegetation/catalog/cyberForest';

/** Re-export Plajah's unified VegetationScene (trees + GPU trample grass + plants + fungi + wind + beat). */
export { VegetationScene, CYBER_FOREST_TREES, CF_GREAT_OAK, CF_PLATFORM_OAK };
export function createPlaykitVegetationScene(opts: VegetationSceneOptions): VegetationScene {
  return new VegetationScene(opts);
}

/** High-speed road/circuit supercar preset preserving Plajah Motorsport Apex vehicle dynamics. */
export const APEX_SUPERCAR_VEHICLE_CONFIG: VehicleConfig = {
  massKg: 1380,
  maxEngineForce: 22_000,
  maxBrakeForce: 28_000,
  maxSteerRad: 0.44,
  wheelRestLength: 0.36,
  suspensionStiffness: 38_000,
  suspensionDamping: 3_600,
  lateralGrip: 11.5,
  driftGripFactor: 0.42,
  wheelOffsets: [
    [-0.92, 0.36, -1.42],
    [0.92, 0.36, -1.42],
    [-0.96, 0.36, 1.38],
    [0.96, 0.36, 1.38],
  ],
};

/** Preserved Era Clash 3D & Ravencrest world-pipeline presets mapped onto unified Playkit tiers. */
export const LEGACY_VERTICAL_PROFILES = {
  'era-clash-3d': {
    template: 'fighter' as const,
    stagePreset: 'kith-storybook-garden' as const,
    vegetationSpecies: ['autumn-maple', 'fable-ancient-oak', 'coastal-windswept-cedar'],
    features: ['csm-shadows', 'gtao', 'godrays', 'season-climate', 'mocap-fight-clips'],
  },
  ravencrest: {
    template: 'adventure' as const,
    stagePreset: 'fable-void-sanctum' as const,
    vegetationSpecies: ['autumn-maple', 'marsh-cypress', 'fable-ancient-oak'],
    features: ['ktx2-polyhaven', 'verlet-cloth-wind', 'bushido-stances', 'lens-splatter', 'nightmare-events'],
  },
  'apex-forth-horizon': {
    template: 'racer' as const,
    stagePreset: 'firstlight-primetime-stadium' as const,
    vegetationSpecies: ['coastal-windswept-cedar', 'nordic-spruce', 'tropical-royal-palm'],
    features: ['4w-raycast-suspension', 'region-hlod-streaming', 'skidmark-decals', 'clustered-headlights'],
  },
} as const;

/** Map a Playkit UnifiedInputFrame into Kith Quest / 2D Platformer input cleanly. */
export function toPlatformer2DInput(frame: UnifiedInputFrame): Platformer2DInput {
  return {
    moveX: frame.moveX,
    jumpHeld: frame.held.jump,
    jumpPressed: frame.pressed.jump,
    dashPressed: frame.pressed.dash,
    glideHeld: frame.held.special,
  };
}

/** Standard Kith Racing arcade-suspension kart configuration for `PlajahPhysicsWorld.stepVehicle`. */
export const KITH_KART_VEHICLE_CONFIG: VehicleConfig = {
  massKg: 420,
  maxEngineForce: 9_800,
  maxBrakeForce: 12_500,
  maxSteerRad: 0.56,
  wheelRestLength: 0.42,
  suspensionStiffness: 11_500,
  suspensionDamping: 1_150,
  lateralGrip: 9.2,
  driftGripFactor: 0.34,
  wheelOffsets: [
    [-0.62, 0.32, -0.85],
    [0.62, 0.32, -0.85],
    [-0.66, 0.32, 0.85],
    [0.66, 0.32, 0.85],
  ],
};

/**
 * Compute an initial spiral-stabilized ballistic launch for Firstlight's passing game
 * so passes obey true 3D gravity, wind drift, and tight-spiral Magnus stability.
 */
export function createFirstlightPassSpec(opts: {
  id: string;
  qbPos: Vec3;
  targetPos: Vec3;
  flightTimeSec?: number;
  gravityY?: number;
  bulletPass?: boolean;
}): Omit<BallisticProjectile, 'bounces' | 'active'> {
  const g = Math.abs(opts.gravityY ?? 24);
  const t = Math.max(0.25, opts.flightTimeSec ?? (opts.bulletPass ? 0.55 : 0.95));
  const vx = (opts.targetPos[0] - opts.qbPos[0]) / t;
  const vz = (opts.targetPos[2] - opts.qbPos[2]) / t;
  const vy = (opts.targetPos[1] - opts.qbPos[1] + 0.5 * g * t * t) / t;
  const speed = Math.hypot(vx, vy, vz) || 1;
  // Tight right-handed spiral spin aligned along velocity vector (~25 rad/s)
  const spinRate = opts.bulletPass ? 34 : 25;
  const spin: Vec3 = [(vx / speed) * spinRate, (vy / speed) * spinRate, (vz / speed) * spinRate];

  return {
    id: opts.id,
    position: [...opts.qbPos],
    velocity: [vx, vy, vz],
    spin,
    radius: 0.14,
    restitution: 0.42,
    dragCoeff: 0.008,
    magnusCoeff: 0.004,
  };
}

/**
 * Create a ParlorSession pre-configured for Plajah's Live Party / Parlor catalog
 * (`trivia` = Brain Rush, `crowd` = Crowd Says, `impostor` = Impostor Night, `sketch` = Sketch Rush)
 * paired with a 3D visual overhaul stage preset.
 */
export function createPlajahParlorSession(opts: {
  roomId: string;
  kind: BuiltInParlorKind;
  totalRounds?: number;
  answerWindowMs?: number;
  stagePresetId?: keyof typeof STAGE_VISUAL_PRESETS;
}): ParlorSession {
  const titles: Record<string, string> = {
    trivia: 'Brain Rush',
    crowd: 'Crowd Says',
    impostor: 'Impostor Night',
    sketch: 'Sketch Rush',
  };
  const stageId = opts.stagePresetId ?? (opts.kind === 'impostor' ? 'parlor-fable-tavern-3d' : 'parlor-broadcast-studio-3d');
  return new ParlorSession({
    roomId: opts.roomId,
    kind: opts.kind,
    title: titles[opts.kind] ?? opts.kind,
    totalRounds: opts.totalRounds ?? (opts.kind === 'trivia' ? 10 : opts.kind === 'crowd' ? 6 : 4),
    answerWindowMs: opts.answerWindowMs ?? (opts.kind === 'trivia' ? 12_000 : 25_000),
    stageThemeId: stageId,
  });
}

/** Register Plajah Studio's parametric prop kits (`RIFT_KIT`) into any PlaykitRegistry instance. */
export function registerStudioPropKits(registry: PlaykitRegistry): number {
  let count = 0;
  for (const def of RIFT_KIT) {
    registry.registerPrefab({
      id: def.id,
      name: def.name,
      category: def.category,
      dimension: '3d',
      tags: ['studio-kit', def.category.toLowerCase()],
      params: def.params.map((p) => ({
        key: p.key,
        label: p.label,
        kind: p.kind,
        default: p.default,
        min: 'min' in p ? p.min : undefined,
        max: 'max' in p ? p.max : undefined,
        step: 'step' in p ? p.step : undefined,
        options: 'options' in p ? p.options : undefined,
        pro: p.pro,
      })),
    });
    count++;
  }
  return count;
}
