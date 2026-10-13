/**
 * services/anima/assetLibrary.ts
 *
 * Plajah Unified Motion & Animation System ("Anima") - Asset & Motion Library
 *
 * Comprehensive repository of production-ready animation presets, rigged assets,
 * walk/run cycles, vehicles, skies, secondary motion props, animals, and general people.
 *
 * Every asset features authentic visual styling, procedural drawing instructions,
 * skeletal bone hierarchies, and rich keyframe animation loops.
 */

import type { AnimaLayer, AnimaBone, AnimaChannel, Keyframe } from './types';

export type AssetCategory =
  | 'walk_cycles'
  | 'vehicles'
  | 'skies'
  | 'props'
  | 'animals'
  | 'people';

export interface AssetDefinition {
  id: string;
  name: string;
  category: AssetCategory;
  description: string;
  tags: string[];
  thumbnailIcon: string;
  durationSec: number;
  looping: boolean;
  createLayer: (id?: string) => AnimaLayer;
  applyMotionToRig?: (layer: AnimaLayer, durationSec?: number) => void;
}

// Helper to make smooth keyframes
function makeKf(id: string, t: number, v: number, ease: 'smooth' | 'linear' | 'bounce' = 'smooth'): Keyframe<number> {
  return { id, t, v, ease };
}

// Helper to make channel
function makeChannel(path: string, defaultValue: number, keyframes: Keyframe<number>[], unit = ''): AnimaChannel<number> {
  return {
    id: `ch_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
    name: path,
    path,
    defaultValue,
    keyframes,
    unit,
  };
}

// --------------------------------------------------------------------------
// 1. WALK & RUN CYCLES
// --------------------------------------------------------------------------

/**
 * Standard 8-pose walk cycle generator (Contact, Down, Passing, Up)
 */
export function createWalkCycleKeyframes(duration = 1.0, stride = 30): Record<string, Keyframe<number>[]> {
  const d = duration;
  return {
    'bone.leg_l_upper.rot': [
      makeKf('k1', 0, stride),
      makeKf('k2', d * 0.25, 0),
      makeKf('k3', d * 0.5, -stride),
      makeKf('k4', d * 0.75, 10),
      makeKf('k5', d, stride),
    ],
    'bone.leg_r_upper.rot': [
      makeKf('k1', 0, -stride),
      makeKf('k2', d * 0.25, 10),
      makeKf('k3', d * 0.5, stride),
      makeKf('k4', d * 0.75, 0),
      makeKf('k5', d, -stride),
    ],
    'bone.leg_l_lower.rot': [
      makeKf('k1', 0, 5),
      makeKf('k2', d * 0.25, 15),
      makeKf('k3', d * 0.5, 0),
      makeKf('k4', d * 0.75, 50), // swing knee bend
      makeKf('k5', d, 5),
    ],
    'bone.leg_r_lower.rot': [
      makeKf('k1', 0, 0),
      makeKf('k2', d * 0.25, 50),
      makeKf('k3', d * 0.5, 5),
      makeKf('k4', d * 0.75, 15),
      makeKf('k5', d, 0),
    ],
    'bone.arm_l_upper.rot': [
      makeKf('k1', 0, -25),
      makeKf('k2', d * 0.25, 0),
      makeKf('k3', d * 0.5, 25),
      makeKf('k4', d * 0.75, 0),
      makeKf('k5', d, -25),
    ],
    'bone.arm_r_upper.rot': [
      makeKf('k1', 0, 25),
      makeKf('k2', d * 0.25, 0),
      makeKf('k3', d * 0.5, -25),
      makeKf('k4', d * 0.75, 0),
      makeKf('k5', d, 25),
    ],
    'transform.y': [
      makeKf('k1', 0, 0),
      makeKf('k2', d * 0.25, 12), // down
      makeKf('k3', d * 0.5, 0),
      makeKf('k4', d * 0.75, -8), // up
      makeKf('k5', d, 0),
    ],
  };
}

/**
 * Sneak / Tiptoe walk cycle
 */
export function createSneakCycleKeyframes(duration = 1.4): Record<string, Keyframe<number>[]> {
  const d = duration;
  return {
    'bone.leg_l_upper.rot': [
      makeKf('k1', 0, 45),
      makeKf('k2', d * 0.25, 60),
      makeKf('k3', d * 0.5, -20),
      makeKf('k4', d * 0.75, -10),
      makeKf('k5', d, 45),
    ],
    'bone.leg_r_upper.rot': [
      makeKf('k1', 0, -20),
      makeKf('k2', d * 0.25, -10),
      makeKf('k3', d * 0.5, 45),
      makeKf('k4', d * 0.75, 60),
      makeKf('k5', d, -20),
    ],
    'bone.leg_l_lower.rot': [
      makeKf('k1', 0, 40),
      makeKf('k2', d * 0.25, 90),
      makeKf('k3', d * 0.5, 10),
      makeKf('k4', d * 0.75, 20),
      makeKf('k5', d, 40),
    ],
    'bone.leg_r_lower.rot': [
      makeKf('k1', 0, 10),
      makeKf('k2', d * 0.25, 20),
      makeKf('k3', d * 0.5, 40),
      makeKf('k4', d * 0.75, 90),
      makeKf('k5', d, 10),
    ],
    'transform.rotationZ': [
      makeKf('k1', 0, 15),
      makeKf('k2', d * 0.5, 10),
      makeKf('k3', d, 15),
    ],
    'transform.y': [
      makeKf('k1', 0, 20),
      makeKf('k2', d * 0.5, 15),
      makeKf('k3', d, 20),
    ],
  };
}

/**
 * Sprint / Dash cycle
 */
export function createSprintCycleKeyframes(duration = 0.6): Record<string, Keyframe<number>[]> {
  const d = duration;
  return {
    'bone.leg_l_upper.rot': [
      makeKf('k1', 0, 65),
      makeKf('k2', d * 0.25, 0),
      makeKf('k3', d * 0.5, -60),
      makeKf('k4', d * 0.75, 20),
      makeKf('k5', d, 65),
    ],
    'bone.leg_r_upper.rot': [
      makeKf('k1', 0, -60),
      makeKf('k2', d * 0.25, 20),
      makeKf('k3', d * 0.5, 65),
      makeKf('k4', d * 0.75, 0),
      makeKf('k5', d, -60),
    ],
    'bone.arm_l_upper.rot': [
      makeKf('k1', 0, -70),
      makeKf('k2', d * 0.5, 70),
      makeKf('k3', d, -70),
    ],
    'bone.arm_r_upper.rot': [
      makeKf('k1', 0, 70),
      makeKf('k2', d * 0.5, -70),
      makeKf('k3', d, 70),
    ],
    'transform.rotationZ': [
      makeKf('k1', 0, 22), // heavy forward lean
      makeKf('k2', d * 0.5, 24),
      makeKf('k3', d, 22),
    ],
    'transform.y': [
      makeKf('k1', 0, -15),
      makeKf('k2', d * 0.25, 10),
      makeKf('k3', d * 0.5, -15),
      makeKf('k4', d * 0.75, 10),
      makeKf('k5', d, -15),
    ],
  };
}

// --------------------------------------------------------------------------
// 2. VEHICLES
// --------------------------------------------------------------------------

/**
 * 1930s Jalopy Car Rig & Layer
 */
export function createJalopyCar(id = 'vehicle_jalopy'): AnimaLayer {
  const duration = 0.8;
  const d = duration;

  const channels: Record<string, AnimaChannel<number>> = {
    'transform.y': makeChannel('transform.y', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d * 0.25, -14, 'smooth'),
      makeKf('k3', d * 0.5, 4, 'bounce'),
      makeKf('k4', d * 0.75, -8, 'smooth'),
      makeKf('k5', d, 0),
    ]),
    'transform.rotationZ': makeChannel('transform.rotationZ', 0, [
      makeKf('k1', 0, -2),
      makeKf('k2', d * 0.25, 3),
      makeKf('k3', d * 0.5, -3),
      makeKf('k4', d * 0.75, 2),
      makeKf('k5', d, -2),
    ]),
    'wheel_rot': makeChannel('wheel_rot', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d, 360, 'linear'),
    ]),
    'exhaust_puff': makeChannel('exhaust_puff', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d * 0.5, 1),
      makeKf('k3', d, 0),
    ]),
  };

  return {
    id,
    name: '1930s Jalopy Car',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 400, y: 350, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

/**
 * Steam Train Locomotive
 */
export function createSteamTrain(id = 'vehicle_train'): AnimaLayer {
  const duration = 1.0;
  const d = duration;

  const channels: Record<string, AnimaChannel<number>> = {
    'piston_stroke': makeChannel('piston_stroke', 0, [
      makeKf('k1', 0, -30),
      makeKf('k2', d * 0.5, 30),
      makeKf('k3', d, -30),
    ]),
    'wheels_rot': makeChannel('wheels_rot', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d, 360, 'linear'),
    ]),
    'transform.y': makeChannel('transform.y', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d * 0.25, -4),
      makeKf('k3', d * 0.5, 0),
      makeKf('k4', d * 0.75, -4),
      makeKf('k5', d, 0),
    ]),
  };

  return {
    id,
    name: 'Steam Train Locomotive',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 300, y: 400, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

/**
 * Vintage Propeller Biplane
 */
export function createBiplane(id = 'vehicle_biplane'): AnimaLayer {
  const duration = 1.2;
  const d = duration;

  const channels: Record<string, AnimaChannel<number>> = {
    'propeller_rot': makeChannel('propeller_rot', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', 0.1, 360, 'linear'),
    ]),
    'transform.y': makeChannel('transform.y', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d * 0.5, -25, 'smooth'),
      makeKf('k3', d, 0, 'smooth'),
    ]),
    'transform.rotationZ': makeChannel('transform.rotationZ', 0, [
      makeKf('k1', 0, -4),
      makeKf('k2', d * 0.5, 5),
      makeKf('k3', d, -4),
    ]),
  };

  return {
    id,
    name: 'Vintage Biplane',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 450, y: 200, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

// --------------------------------------------------------------------------
// 3. SKIES & ATMOSPHERES
// --------------------------------------------------------------------------

/**
 * Studio Ghibli Volumetric Clouds
 */
export function createGhibliSky(id = 'sky_ghibli'): AnimaLayer {
  const duration = 12.0;

  const channels: Record<string, AnimaChannel<number>> = {
    'cloud_drift_near': makeChannel('cloud_drift_near', 0, [
      makeKf('k1', 0, -200),
      makeKf('k2', duration, 200, 'linear'),
    ]),
    'cloud_drift_mid': makeChannel('cloud_drift_mid', 0, [
      makeKf('k1', 0, -100),
      makeKf('k2', duration, 100, 'linear'),
    ]),
    'sun_glow': makeChannel('sun_glow', 0.8, [
      makeKf('k1', 0, 0.75),
      makeKf('k2', duration * 0.5, 0.95),
      makeKf('k3', duration, 0.75),
    ]),
  };

  return {
    id,
    name: 'Studio Ghibli Volumetric Clouds',
    type: 'vector',
    visible: true,
    locked: true,
    opacity: 1,
    parentId: null,
    transform: { x: 0, y: 0, z: -100, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

/**
 * Starry Night with Parallax Stars
 */
export function createStarryNightSky(id = 'sky_starry_night'): AnimaLayer {
  const duration = 8.0;

  const channels: Record<string, AnimaChannel<number>> = {
    'stars_twinkle': makeChannel('stars_twinkle', 0.5, [
      makeKf('k1', 0, 0.3),
      makeKf('k2', duration * 0.25, 0.9),
      makeKf('k3', duration * 0.5, 0.4),
      makeKf('k4', duration * 0.75, 1.0),
      makeKf('k5', duration, 0.3),
    ]),
    'moon_glow': makeChannel('moon_glow', 1.0, [
      makeKf('k1', 0, 0.85),
      makeKf('k2', duration * 0.5, 1.15),
      makeKf('k3', duration, 0.85),
    ]),
  };

  return {
    id,
    name: 'Starry Night Parallax',
    type: 'vector',
    visible: true,
    locked: true,
    opacity: 1,
    parentId: null,
    transform: { x: 0, y: 0, z: -120, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

/**
 * Thunderstorm with Flashing Lightning
 */
export function createThunderstormSky(id = 'sky_thunderstorm'): AnimaLayer {
  const duration = 4.0;

  const channels: Record<string, AnimaChannel<number>> = {
    'lightning_flash': makeChannel('lightning_flash', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', 1.45, 0),
      makeKf('k3', 1.48, 1.0, 'hold'),
      makeKf('k4', 1.52, 0.2, 'hold'),
      makeKf('k5', 1.55, 0.9, 'hold'),
      makeKf('k6', 1.62, 0.0, 'smooth'),
      makeKf('k7', duration, 0),
    ]),
    'rain_speed': makeChannel('rain_speed', 100, [
      makeKf('k1', 0, 100),
      makeKf('k2', duration, 100),
    ]),
  };

  return {
    id,
    name: 'Thunderstorm Sky',
    type: 'vector',
    visible: true,
    locked: true,
    opacity: 1,
    parentId: null,
    transform: { x: 0, y: 0, z: -80, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

// --------------------------------------------------------------------------
// 4. PROPS WITH SECONDARY MOTION
// --------------------------------------------------------------------------

/**
 * 12 Principles Bouncing Ball (Squash & Stretch)
 */
export function createBouncingBall(id = 'prop_bouncing_ball'): AnimaLayer {
  const duration = 1.0;
  const d = duration;

  const channels: Record<string, AnimaChannel<number>> = {
    'transform.y': makeChannel('transform.y', 100, [
      makeKf('k1', 0, 100),         // apex
      makeKf('k2', d * 0.45, 400),  // falling fast
      makeKf('k3', d * 0.5, 440, 'bounce'), // contact floor
      makeKf('k4', d * 0.55, 400),  // rebound
      makeKf('k5', d, 100),         // apex
    ]),
    'transform.scaleX': makeChannel('transform.scaleX', 1.0, [
      makeKf('k1', 0, 1.0),
      makeKf('k2', d * 0.45, 0.8),  // stretched vertically (thin)
      makeKf('k3', d * 0.5, 1.5, 'bounce'), // squashed flat on impact
      makeKf('k4', d * 0.55, 0.85), // rebounding stretch
      makeKf('k5', d, 1.0),
    ]),
    'transform.scaleY': makeChannel('transform.scaleY', 1.0, [
      makeKf('k1', 0, 1.0),
      makeKf('k2', d * 0.45, 1.25), // stretch long
      makeKf('k3', d * 0.5, 0.5, 'bounce'), // squashed flat
      makeKf('k4', d * 0.55, 1.2),
      makeKf('k5', d, 1.0),
    ]),
  };

  return {
    id,
    name: 'Bouncing Ball (Squash & Stretch)',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 400, y: 100, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

/**
 * Waving Pennant Flag (Sinusoidal harmonics)
 */
export function createWavingFlag(id = 'prop_flag'): AnimaLayer {
  const duration = 1.2;
  const d = duration;

  const channels: Record<string, AnimaChannel<number>> = {
    'wave_phase': makeChannel('wave_phase', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d, Math.PI * 2, 'linear'),
    ]),
    'wind_strength': makeChannel('wind_strength', 25, [
      makeKf('k1', 0, 20),
      makeKf('k2', d * 0.5, 35),
      makeKf('k3', d, 20),
    ]),
  };

  return {
    id,
    name: 'Waving Pennant Flag',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 250, y: 300, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

/**
 * Campfire with organic flame tongues
 */
export function createCampfire(id = 'prop_campfire'): AnimaLayer {
  const duration = 0.8;
  const d = duration;

  const channels: Record<string, AnimaChannel<number>> = {
    'flame_height': makeChannel('flame_height', 50, [
      makeKf('k1', 0, 50),
      makeKf('k2', d * 0.25, 68),
      makeKf('k3', d * 0.5, 44),
      makeKf('k4', d * 0.75, 75),
      makeKf('k5', d, 50),
    ]),
    'flame_flicker': makeChannel('flame_flicker', 0, [
      makeKf('k1', 0, -4),
      makeKf('k2', d * 0.33, 5),
      makeKf('k3', d * 0.66, -3),
      makeKf('k4', d, -4),
    ]),
  };

  return {
    id,
    name: 'Campfire with Leaping Flames',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 450, y: 450, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

// --------------------------------------------------------------------------
// 5. ANIMALS
// --------------------------------------------------------------------------

/**
 * Prowling Cat (Quadruped gait)
 */
export function createProwlingCat(id = 'animal_cat'): AnimaLayer {
  const duration = 1.0;
  const d = duration;

  const bones: AnimaBone[] = [
    { id: 'cat_pelvis', name: 'Pelvis', parentId: null, length: 40, baseAngle: 0, pivot: [0, 0, 0] },
    { id: 'cat_spine', name: 'Spine', parentId: 'cat_pelvis', length: 50, baseAngle: 0, pivot: [30, 0, 0] },
    { id: 'cat_head', name: 'Head', parentId: 'cat_spine', length: 30, baseAngle: 0, pivot: [40, -10, 0] },
    { id: 'cat_tail1', name: 'Tail Base', parentId: 'cat_pelvis', length: 30, baseAngle: 120, pivot: [-20, -10, 0] },
    { id: 'cat_tail2', name: 'Tail Tip', parentId: 'cat_tail1', length: 30, baseAngle: 140, pivot: [-25, -20, 0] },
  ];

  const channels: Record<string, AnimaChannel<number>> = {
    'bone.cat_spine.rot': makeChannel('cat_spine.rot', 0, [
      makeKf('k1', 0, -8),
      makeKf('k2', d * 0.5, 8),
      makeKf('k3', d, -8),
    ]),
    'bone.cat_tail2.rot': makeChannel('cat_tail2.rot', 0, [
      makeKf('k1', 0, 25),
      makeKf('k2', d * 0.5, -25),
      makeKf('k3', d, 25),
    ]),
    'transform.y': makeChannel('transform.y', 0, [
      makeKf('k1', 0, 0),
      makeKf('k2', d * 0.25, 6),
      makeKf('k3', d * 0.5, 0),
      makeKf('k4', d * 0.75, 6),
      makeKf('k5', d, 0),
    ]),
  };

  return {
    id,
    name: 'Prowling Cat',
    type: 'bone',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 350, y: 400, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    bones,
    channels,
  };
}

/**
 * Bird in Flight (Wing flapping loop)
 */
export function createFlyingBird(id = 'animal_bird'): AnimaLayer {
  const duration = 0.5;
  const d = duration;

  const channels: Record<string, AnimaChannel<number>> = {
    'wing_l_rot': makeChannel('wing_l_rot', 0, [
      makeKf('k1', 0, 45),          // upstroke apex
      makeKf('k2', d * 0.4, -45),   // downstroke power
      makeKf('k3', d * 0.7, -20),   // glide
      makeKf('k4', d, 45),
    ]),
    'wing_r_rot': makeChannel('wing_r_rot', 0, [
      makeKf('k1', 0, -45),
      makeKf('k2', d * 0.4, 45),
      makeKf('k3', d * 0.7, 20),
      makeKf('k4', d, -45),
    ]),
    'transform.y': makeChannel('transform.y', 0, [
      makeKf('k1', 0, -10),
      makeKf('k2', d * 0.4, 12),
      makeKf('k3', d, -10),
    ]),
  };

  return {
    id,
    name: 'Flying Bird',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    parentId: null,
    transform: { x: 500, y: 150, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    channels,
  };
}

// --------------------------------------------------------------------------
// 6. ASSET REGISTRY & CATALOG
// --------------------------------------------------------------------------

export const ASSET_CATALOG: AssetDefinition[] = [
  // Walk Cycles
  {
    id: 'walk_standard',
    name: 'Standard Walk Cycle',
    category: 'walk_cycles',
    description: 'Classic 8-pose walk cycle on 2s with natural bounce and arm counter-swing',
    tags: ['walk', 'cycle', 'biped', 'character'],
    thumbnailIcon: '🚶',
    durationSec: 1.0,
    looping: true,
    createLayer: () => ({
      id: 'layer_walk_standard',
      name: 'Standard Walk Rig',
      type: 'bone',
      visible: true,
      locked: false,
      opacity: 1,
      parentId: null,
      transform: { x: 400, y: 350, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      channels: {},
    }),
    applyMotionToRig: (layer, duration = 1.0) => {
      const kfs = createWalkCycleKeyframes(duration);
      for (const [ch, keys] of Object.entries(kfs)) {
        layer.channels[ch] = makeChannel(ch, keys[0]?.v ?? 0, keys);
      }
    },
  },
  {
    id: 'walk_sneak',
    name: 'Sneak / Tiptoe Cycle',
    category: 'walk_cycles',
    description: 'Exaggerated stealth walk with high knee lift and delayed toe contact',
    tags: ['sneak', 'tiptoe', 'stealth', 'cartoon'],
    thumbnailIcon: '🤫',
    durationSec: 1.4,
    looping: true,
    createLayer: () => ({
      id: 'layer_walk_sneak',
      name: 'Sneak Walk Rig',
      type: 'bone',
      visible: true,
      locked: false,
      opacity: 1,
      parentId: null,
      transform: { x: 400, y: 350, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      channels: {},
    }),
    applyMotionToRig: (layer, duration = 1.4) => {
      const kfs = createSneakCycleKeyframes(duration);
      for (const [ch, keys] of Object.entries(kfs)) {
        layer.channels[ch] = makeChannel(ch, keys[0]?.v ?? 0, keys);
      }
    },
  },
  {
    id: 'run_sprint',
    name: 'Sprint / Dash Cycle',
    category: 'walk_cycles',
    description: 'High velocity athletic run cycle with forward torso lean and wide arm drive',
    tags: ['run', 'sprint', 'dash', 'fast'],
    thumbnailIcon: '🏃',
    durationSec: 0.6,
    looping: true,
    createLayer: () => ({
      id: 'layer_run_sprint',
      name: 'Sprint Rig',
      type: 'bone',
      visible: true,
      locked: false,
      opacity: 1,
      parentId: null,
      transform: { x: 400, y: 350, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      channels: {},
    }),
    applyMotionToRig: (layer, duration = 0.6) => {
      const kfs = createSprintCycleKeyframes(duration);
      for (const [ch, keys] of Object.entries(kfs)) {
        layer.channels[ch] = makeChannel(ch, keys[0]?.v ?? 0, keys);
      }
    },
  },

  // Vehicles
  {
    id: 'veh_jalopy',
    name: '1930s Jalopy Car',
    category: 'vehicles',
    description: 'Vintage 1930s jalopy with squash-and-stretch bouncing suspension, spinning wheels, and exhaust puffs',
    tags: ['car', 'vintage', '1930s', 'classic', 'vehicle'],
    thumbnailIcon: '🚗',
    durationSec: 0.8,
    looping: true,
    createLayer: (id) => createJalopyCar(id),
  },
  {
    id: 'veh_train',
    name: 'Steam Train Locomotive',
    category: 'vehicles',
    description: 'Pounding industrial steam locomotive with reciprocating drive rods and heavy wheel churn',
    tags: ['train', 'locomotive', 'steam', 'vehicle'],
    thumbnailIcon: '🚂',
    durationSec: 1.0,
    looping: true,
    createLayer: (id) => createSteamTrain(id),
  },
  {
    id: 'veh_biplane',
    name: 'Vintage Biplane',
    category: 'vehicles',
    description: 'Propeller biplane with banking wing tilt and spinning propeller disc',
    tags: ['plane', 'biplane', 'aviation', 'flight'],
    thumbnailIcon: '✈️',
    durationSec: 1.2,
    looping: true,
    createLayer: (id) => createBiplane(id),
  },

  // Skies & Atmospheres
  {
    id: 'sky_ghibli',
    name: 'Studio Ghibli Volumetric Clouds',
    category: 'skies',
    description: 'Layered painterly cumulus cloud towers with golden rim illumination and parallax drifting',
    tags: ['ghibli', 'clouds', 'sky', 'anime', 'volumetric'],
    thumbnailIcon: '☁️',
    durationSec: 12.0,
    looping: true,
    createLayer: (id) => createGhibliSky(id),
  },
  {
    id: 'sky_starry',
    name: 'Starry Night Parallax',
    category: 'skies',
    description: 'Deep midnight blue expanse with multi-depth twinkling stars and glowing crescent moon',
    tags: ['space', 'night', 'stars', 'moon', 'sky'],
    thumbnailIcon: '✨',
    durationSec: 8.0,
    looping: true,
    createLayer: (id) => createStarryNightSky(id),
  },
  {
    id: 'sky_storm',
    name: 'Thunderstorm with Lightning',
    category: 'skies',
    description: 'Dramatic stormy cumulonimbus clouds with hold-frame lightning flashes and driving rain',
    tags: ['storm', 'lightning', 'rain', 'thunder', 'sky'],
    thumbnailIcon: '⚡',
    durationSec: 4.0,
    looping: true,
    createLayer: (id) => createThunderstormSky(id),
  },

  // Props
  {
    id: 'prop_ball',
    name: 'Bouncing Ball (12 Principles)',
    category: 'props',
    description: 'Foundational animation exercise demonstrating squash and stretch, gravity, and timing',
    tags: ['ball', 'physics', 'squash', 'stretch', 'prop'],
    thumbnailIcon: '⚽',
    durationSec: 1.0,
    looping: true,
    createLayer: (id) => createBouncingBall(id),
  },
  {
    id: 'prop_flag',
    name: 'Waving Silk Pennant Flag',
    category: 'props',
    description: 'Fluid sine-wave cloth simulation simulating outdoor breeze turbulence',
    tags: ['flag', 'cloth', 'wind', 'wave', 'prop'],
    thumbnailIcon: '🚩',
    durationSec: 1.2,
    looping: true,
    createLayer: (id) => createWavingFlag(id),
  },
  {
    id: 'prop_campfire',
    name: 'Dynamic Campfire Flames',
    category: 'props',
    description: 'Organic flickering flame tongues with rising heat distortion and embers',
    tags: ['fire', 'flame', 'campfire', 'prop', 'light'],
    thumbnailIcon: '🔥',
    durationSec: 0.8,
    looping: true,
    createLayer: (id) => createCampfire(id),
  },

  // Animals
  {
    id: 'anim_cat',
    name: 'Prowling Cat Rig',
    category: 'animals',
    description: 'Skeletal quadruped feline rig with flexing spine vertebrae and swishing tail',
    tags: ['cat', 'feline', 'quadruped', 'animal'],
    thumbnailIcon: '🐱',
    durationSec: 1.0,
    looping: true,
    createLayer: (id) => createProwlingCat(id),
  },
  {
    id: 'anim_bird',
    name: 'Flying Bird Wing-Flap',
    category: 'animals',
    description: 'Realistic avian wing cycle with powerful downstroke and feather feathering upstroke',
    tags: ['bird', 'flight', 'wing', 'animal'],
    thumbnailIcon: '🦅',
    durationSec: 0.5,
    looping: true,
    createLayer: (id) => createFlyingBird(id),
  },
];

/**
 * Public API to query and instantiate assets
 */
export function getAssetCategories(): AssetCategory[] {
  return ['walk_cycles', 'vehicles', 'skies', 'props', 'animals', 'people'];
}

export function getAssetsByCategory(category: AssetCategory): AssetDefinition[] {
  return ASSET_CATALOG.filter((a) => a.category === category);
}

export function findAssetById(id: string): AssetDefinition | undefined {
  return ASSET_CATALOG.find((a) => a.id === id);
}

export function instantiateAsset(assetId: string, customId?: string): AnimaLayer {
  const asset = findAssetById(assetId);
  if (!asset) {
    throw new Error(`Asset ${assetId} not found in catalog`);
  }
  return asset.createLayer(customId);
}
