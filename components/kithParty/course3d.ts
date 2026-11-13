import * as T from 'three';

export type CourseId =
 | 'crestfall-gardens'
 | 'abyssal-trench'
 | 'dune-canyon'
 | 'polar-vortex'
 | 'amazon-canopy'
 | 'ember-ridge';

export interface LoopZone {
 centerT: number;
 halfWidth: number;
 radius: number;
 helixOffset: number;
 boostPadT: number;
}

/** A kicker ramp whose lip is at `t`. `gap` > 0 means the road is missing for that span after the lip (chasm / lava / water). */
export interface JumpZone {
 t: number;
 rampLen: number;
 height: number;
 gap: number;
 label: string;
}

export interface TunnelZone { startT: number; endT: number; style: 'rock' | 'glass' | 'ice' | 'jungle' | 'lava'; }
export interface BridgeZone { startT: number; endT: number; style: 'arch' | 'suspension' | 'rope' | 'ice' | 'basalt'; }

/** Moving / timed dangers that spin karts out. Lanes use the same -55..55 scale as Player.lane. */
export type ObstacleKind = 'crusher' | 'pendulum' | 'roller' | 'fire-jet' | 'slick';
export interface Obstacle { kind: ObstacleKind; t: number; lane: number; width: number; period: number; phase: number; label: string; }

/** An off-road cut across the inside of a bend, found automatically per course. */
export interface Shortcut { fromT: number; toT: number; side: 1 | -1; length: number; curve: T.CatmullRomCurve3; }

export interface TrackHazard {
 t: number;
 lane: number; // -38 to +38 (occupies only ~16% of road width, always easily avoidable)
 kind: 'crystal' | 'geyser' | 'sand-pocket' | 'ice-patch' | 'vine-root';
 label: string;
}

export interface CourseDef {
 id: CourseId;
 /** 'circuit' = closed loop raced for `laps`; 'sprint' = point to point, start and finish in different places */
 kind: 'circuit' | 'sprint';
 laps: number;
 tunnels: TunnelZone[];
 bridges: BridgeZone[];
 obstacles: Obstacle[];
 itemRows: number[];
 name: string;
 subtitle: string;
 badge: string;
 description: string;
 layoutName: string;
 accent: string;
 skyZenith: string;
 skyMid: string;
 skyHorizon: string;
 fogColor: string;
 fogDensity: number;
 roadColor: string;
 deckColor: string;
 copingColor: string;
 stripeColor: string;
 curbColorA: string;
 curbColorB: string;
 terrainColorA: string;
 terrainColorB: string;
 boostPads: number[];
 loops: LoopZone[];
 jumps: JumpZone[];
 hazards: TrackHazard[];
 maxBank: number;
 bankScale: number;
}

export const COURSES: CourseDef[] = [
 {
  id: 'crestfall-gardens',
  kind: 'circuit', laps: 3,
  tunnels: [{startT: 0.14, endT: 0.215, style: 'rock'}],
  bridges: [{startT: 0.465, endT: 0.535, style: 'arch'}],
  obstacles: [
   {kind: 'crusher', t: 0.295, lane: -24, width: 16, period: 2.6, phase: 0, label: 'GUARDIAN STOMP'},
   {kind: 'crusher', t: 0.305, lane: 24, width: 16, period: 2.6, phase: 0.5, label: 'GUARDIAN STOMP'},
   {kind: 'pendulum', t: 0.695, lane: 0, width: 10, period: 3.2, phase: 0, label: 'LANTERN SWING'},
   {kind: 'slick', t: 0.74, lane: -30, width: 9, period: 1, phase: 0, label: 'PETAL SLICK'},
  ],
  itemRows: [0.115, 0.375, 0.6, 0.88],
  name: 'Crestfall Gardens',
  subtitle: 'Sakura Grand Prix · Sweeping Viaducts & Guardian Hairpin',
  badge: 'SANCTUARY CUP',
  layoutName: 'GRAND CRESCENT CIRCUIT',
  description: 'A sweeping Grand Prix crescent across cherry-blossom viaducts, high sanctuary overlooks, and a fast S-curve valley.',
  accent: '#ff8c00',
  skyZenith: '#235fd6',
  skyMid: '#7cb2f8',
  skyHorizon: '#ffd8ea',
  fogColor: '#edd0e2',
  fogDensity: 0.0014,
  roadColor: '#212438',
  deckColor: '#cbb8cc',
  copingColor: '#e4d6c5',
  stripeColor: '#ff8400',
  curbColorA: '#ff7300',
  curbColorB: '#f7ead8',
  terrainColorA: '#5f8f54',
  terrainColorB: '#74a665',
  boostPads: [0.08, 0.24, 0.52, 0.79],
  loops: [],
  jumps: [
   {t: 0.425, rampLen: 0.012, height: 1.6, gap: 0.03, label: 'BLOSSOM CREEK'},
   {t: 0.805, rampLen: 0.01, height: 1.1, gap: 0, label: 'GARDEN KICKER'},
  ],
  hazards: [
   {t: 0.34, lane: -26, kind: 'crystal', label: 'AMBER SHARD'},
   {t: 0.66, lane: 28, kind: 'crystal', label: 'AMBER SHARD'},
  ],
  maxBank: 0.22,
  bankScale: 0.28,
 },
 {
  id: 'abyssal-trench',
  kind: 'circuit', laps: 3,
  tunnels: [{startT: 0.12, endT: 0.3, style: 'glass'}, {startT: 0.44, endT: 0.53, style: 'glass'}],
  bridges: [{startT: 0.88, endT: 0.965, style: 'suspension'}],
  obstacles: [
   {kind: 'crusher', t: 0.245, lane: 0, width: 18, period: 2.8, phase: 0.2, label: 'CLAMSHELL'},
   {kind: 'roller', t: 0.78, lane: 0, width: 9, period: 4.2, phase: 0, label: 'ROLLING MINE'},
   {kind: 'fire-jet', t: 0.61, lane: 28, width: 18, period: 2.4, phase: 0, label: 'THERMAL VENT'},
   {kind: 'fire-jet', t: 0.63, lane: -28, width: 18, period: 2.4, phase: 0.5, label: 'THERMAL VENT'},
  ],
  itemRows: [0.1, 0.34, 0.58, 0.83],
  name: 'Abyssal Glass Trench',
  subtitle: ' Underwater Serpentine · Trench Plunge & Bioluminescent Reefs',
  badge: 'DEEP SEA DIVE',
  layoutName: 'TRIDENT SERPENTINE',
  description: 'Dive through a 3-lobed underwater glass tunnel serpentine with deep trench drops and bioluminescent sea leviathans.',
  accent: '#00f0ff',
  skyZenith: '#020b1f',
  skyMid: '#06264d',
  skyHorizon: '#0b4e7a',
  fogColor: '#052242',
  fogDensity: 0.0018,
  roadColor: '#0c1c36',
  deckColor: '#0f365c',
  copingColor: '#2ee6ff',
  stripeColor: '#00f2ff',
  curbColorA: '#00e5ff',
  curbColorB: '#ff2e93',
  terrainColorA: '#081b33',
  terrainColorB: '#0d2b4d',
  boostPads: [0.07, 0.22, 0.43, 0.65, 0.86],
  loops: [],
  jumps: [
   {t: 0.67, rampLen: 0.012, height: 1.4, gap: 0.028, label: 'TRENCH LEAP'},
  ],
  hazards: [
   {t: 0.31, lane: 24, kind: 'geyser', label: 'VENT PLUME'},
   {t: 0.56, lane: -26, kind: 'geyser', label: 'VENT PLUME'},
   {t: 0.76, lane: 22, kind: 'geyser', label: 'VENT PLUME'},
  ],
  maxBank: 0.28,
  bankScale: 0.34,
 },
 {
  id: 'dune-canyon',
  kind: 'circuit', laps: 3,
  tunnels: [{startT: 0.515, endT: 0.595, style: 'rock'}],
  bridges: [{startT: 0.03, endT: 0.115, style: 'arch'}],
  obstacles: [
   {kind: 'roller', t: 0.335, lane: 0, width: 10, period: 3.8, phase: 0, label: 'BOULDER ROLL'},
   {kind: 'fire-jet', t: 0.155, lane: -26, width: 20, period: 2.2, phase: 0, label: 'SAND GEYSER'},
   {kind: 'fire-jet', t: 0.165, lane: 26, width: 20, period: 2.2, phase: 0.5, label: 'SAND GEYSER'},
   {kind: 'crusher', t: 0.8, lane: 0, width: 20, period: 3, phase: 0.3, label: 'SANDSTONE PRESS'},
  ],
  itemRows: [0.13, 0.4, 0.66, 0.92],
  name: 'Dune Worm Canyon',
  subtitle: 'Figure-8 Overpass · Sandstone Viaduct & Breaching Sandworms',
  badge: 'DESERT STORM',
  layoutName: 'CANYON FIGURE-8 CROSSOVER',
  description: 'A giant desert Figure-8 where the high sandstone sky-bridge crosses 26 meters above the deep canyon floor while sandworms breach.',
  accent: '#ff6a00',
  skyZenith: '#3d1536',
  skyMid: '#b84428',
  skyHorizon: '#ffba66',
  fogColor: '#e69862',
  fogDensity: 0.0015,
  roadColor: '#332018',
  deckColor: '#a86038',
  copingColor: '#e6b88a',
  stripeColor: '#ffaa00',
  curbColorA: '#ff5500',
  curbColorB: '#fff0d4',
  terrainColorA: '#cf7b38',
  terrainColorB: '#e09248',
  boostPads: [0.09, 0.26, 0.48, 0.72, 0.90],
  loops: [],
  jumps: [
   {t: 0.455, rampLen: 0.012, height: 1.5, gap: 0.03, label: 'CREVASSE JUMP'},
   {t: 0.625, rampLen: 0.01, height: 1.0, gap: 0, label: 'DUNE KICKER'},
  ],
  hazards: [
   {t: 0.18, lane: -28, kind: 'sand-pocket', label: 'DUNE DRIFT'},
   {t: 0.62, lane: 26, kind: 'sand-pocket', label: 'DUNE DRIFT'},
  ],
  maxBank: 0.25,
  bankScale: 0.30,
 },
 {
  id: 'polar-vortex',
  kind: 'circuit', laps: 3,
  tunnels: [{startT: 0.795, endT: 0.885, style: 'ice'}],
  bridges: [{startT: 0.04, endT: 0.125, style: 'ice'}],
  obstacles: [
   {kind: 'pendulum', t: 0.2, lane: 0, width: 10, period: 3, phase: 0.25, label: 'ICICLE SWING'},
   {kind: 'crusher', t: 0.705, lane: -22, width: 18, period: 2.6, phase: 0, label: 'GLACIER PRESS'},
   {kind: 'crusher', t: 0.715, lane: 22, width: 18, period: 2.6, phase: 0.5, label: 'GLACIER PRESS'},
  ],
  itemRows: [0.15, 0.4, 0.65, 0.9],
  name: 'Polar Vortex Citadel',
  subtitle: 'Arctic 4-Star Circuit · Glacier Hairpins & Aurora Cyclone',
  badge: 'ARCTIC SQUALL',
  layoutName: 'ARCTIC STAR CIRCUIT',
  description: 'A 4-pointed Arctic Star circuit orbiting the towering North Pole cyclone with sweeping glacier lobes and aurora ice bridges.',
  accent: '#3df5ff',
  skyZenith: '#071329',
  skyMid: '#123d5e',
  skyHorizon: '#6ef2d8',
  fogColor: '#173654',
  fogDensity: 0.0016,
  roadColor: '#18304c',
  deckColor: '#78b8e0',
  copingColor: '#e6f9ff',
  stripeColor: '#42f5ff',
  curbColorA: '#00d9ff',
  curbColorB: '#ffffff',
  terrainColorA: '#8ec5e8',
  terrainColorB: '#bce2fa',
  boostPads: [0.06, 0.275, 0.44, 0.68, 0.86],
  loops: [
   {centerT: 0.32, halfWidth: 0.034, radius: 14.5, helixOffset: 6.5, boostPadT: 0.275},
  ],
  jumps: [
   {t: 0.565, rampLen: 0.012, height: 1.6, gap: 0.032, label: 'ICE CREVASSE'},
  ],
  hazards: [
   {t: 0.16, lane: 25, kind: 'ice-patch', label: 'FROST GLAZE'},
   {t: 0.54, lane: -25, kind: 'ice-patch', label: 'FROST GLAZE'},
   {t: 0.78, lane: 24, kind: 'ice-patch', label: 'FROST GLAZE'},
  ],
  maxBank: 0.26,
  bankScale: 0.32,
 },
 {
  id: 'amazon-canopy',
  kind: 'circuit', laps: 3,
  tunnels: [{startT: 0.355, endT: 0.44, style: 'jungle'}],
  bridges: [{startT: 0.6, endT: 0.7, style: 'rope'}],
  obstacles: [
   {kind: 'roller', t: 0.27, lane: 0, width: 10, period: 3.6, phase: 0, label: 'ROLLING LOG'},
   {kind: 'pendulum', t: 0.74, lane: 0, width: 10, period: 3.1, phase: 0, label: 'VINE SWING'},
  ],
  itemRows: [0.11, 0.31, 0.58, 0.9],
  name: 'Amazon Canopy Loop',
  subtitle: 'Jungle Mountainside · Rope Viaducts & 3 Vertical 360° Loops',
  badge: 'GRAVITY LOOP',
  layoutName: 'JUNGLE BOOMERANG · 3 LOOPS',
  description: 'Climb an Amazon rainforest mountain across rope viaducts and blast through 3 vertical 360° loops powered by turbo pads!',
  accent: '#9dff2e',
  skyZenith: '#0f3828',
  skyMid: '#26784a',
  skyHorizon: '#d9f296',
  fogColor: '#1c4730',
  fogDensity: 0.0015,
  roadColor: '#24291e',
  deckColor: '#5c4228',
  copingColor: '#8c9968',
  stripeColor: '#a8ff2e',
  curbColorA: '#80e619',
  curbColorB: '#ffe866',
  terrainColorA: '#255e34',
  terrainColorB: '#337843',
  boostPads: [0.07, 0.165, 0.35, 0.495, 0.66, 0.795, 0.93],
  loops: [
   {centerT: 0.200, halfWidth: 0.032, radius: 14.5, helixOffset: 6.5, boostPadT: 0.165},
   {centerT: 0.530, halfWidth: 0.032, radius: 15.5, helixOffset: -6.5, boostPadT: 0.495},
   {centerT: 0.830, halfWidth: 0.032, radius: 14.5, helixOffset: 6.5, boostPadT: 0.795},
  ],
  jumps: [
   {t: 0.455, rampLen: 0.011, height: 1.4, gap: 0.024, label: 'CANOPY GAP'},
   {t: 0.9, rampLen: 0.01, height: 1.0, gap: 0, label: 'ROOT KICKER'},
  ],
  hazards: [
   {t: 0.39, lane: -26, kind: 'vine-root', label: 'CANOPY ROOT'},
   {t: 0.70, lane: 26, kind: 'vine-root', label: 'CANOPY ROOT'},
  ],
  maxBank: 0.20,
  bankScale: 0.24,
 },
 {
  id: 'ember-ridge',
  kind: 'sprint', laps: 1,
  name: 'Ember Ridge Run',
  subtitle: 'Point-to-Point Sprint · Crater Rim to the Black Sand Coast',
  badge: 'VOLCANO SPRINT',
  layoutName: 'SUMMIT-TO-SEA SPRINT',
  description: 'One run, no laps: plunge off a smoking crater rim, through a lava tube, over a basalt bridge and a lava river gap, all the way down to the coast.',
  accent: '#ff5a1a',
  skyZenith: '#1a0a14',
  skyMid: '#5a1a1a',
  skyHorizon: '#ff8a3d',
  fogColor: '#4a1e18',
  fogDensity: 0.0017,
  roadColor: '#1c1618',
  deckColor: '#3a2a26',
  copingColor: '#8a5a44',
  stripeColor: '#ff7a1a',
  curbColorA: '#ff3d00',
  curbColorB: '#2a1a16',
  terrainColorA: '#2a1c1a',
  terrainColorB: '#3e2620',
  boostPads: [0.06, 0.2, 0.36, 0.52, 0.7, 0.86],
  loops: [],
  jumps: [
   {t: 0.3, rampLen: 0.008, height: 1.6, gap: 0.018, label: 'LAVA RIVER'},
   {t: 0.62, rampLen: 0.007, height: 1.2, gap: 0, label: 'ASH KICKER'},
   {t: 0.79, rampLen: 0.008, height: 1.7, gap: 0.02, label: 'MAGMA FALLS'},
  ],
  hazards: [
   {t: 0.15, lane: 24, kind: 'crystal', label: 'OBSIDIAN SHARD'},
   {t: 0.47, lane: -24, kind: 'crystal', label: 'OBSIDIAN SHARD'},
  ],
  tunnels: [{startT: 0.4, endT: 0.47, style: 'lava'}],
  bridges: [{startT: 0.555, endT: 0.6, style: 'basalt'}],
  obstacles: [
   {kind: 'fire-jet', t: 0.12, lane: -26, width: 20, period: 2.2, phase: 0, label: 'LAVA GEYSER'},
   {kind: 'fire-jet', t: 0.125, lane: 26, width: 20, period: 2.2, phase: 0.5, label: 'LAVA GEYSER'},
   {kind: 'roller', t: 0.25, lane: 0, width: 10, period: 3.4, phase: 0, label: 'MAGMA BOULDER'},
   {kind: 'crusher', t: 0.68, lane: -22, width: 18, period: 2.6, phase: 0, label: 'BASALT PRESS'},
   {kind: 'crusher', t: 0.69, lane: 22, width: 18, period: 2.6, phase: 0.5, label: 'BASALT PRESS'},
   {kind: 'pendulum', t: 0.9, lane: 0, width: 10, period: 3, phase: 0, label: 'CHAIN HAMMER'},
  ],
  itemRows: [0.09, 0.23, 0.38, 0.54, 0.73, 0.88],
  maxBank: 0.24,
  bankScale: 0.28,
 },
];

export const courseById = (id?: CourseId): CourseDef =>
 COURSES.find(c => c.id === id) || COURSES[0];

/**
 * 5 Distinct Macro-Scale 3D Circuit Splines.
 * We apply 2 passes of Chaikin corner-cutting on the control polygon before building the
 * centripetal Catmull-Rom spline so curvature is C2-smooth and minimum turn radius is always > 28m
 * (guaranteeing the ±13.3m wide road ribbon NEVER folds, creases, or tears!).
 */
function buildRoute(pts: [number, number, number][], closed = true): T.CatmullRomCurve3 {
 let vecs = pts.map(([x, y, z]) => new T.Vector3(x, y, z));
 for (let pass = 0; pass < 2; pass++) {
  const next: T.Vector3[] = [];
  const n = vecs.length;
  if (!closed) next.push(vecs[0].clone());
  for (let i = 0; i < (closed ? n : n - 1); i++) {
   const a = vecs[i];
   const b = vecs[(i + 1) % n];
   next.push(a.clone().multiplyScalar(0.75).addScaledVector(b, 0.25));
   next.push(a.clone().multiplyScalar(0.25).addScaledVector(b, 0.75));
  }
  if (!closed) next.push(vecs[n - 1].clone());
  vecs = next;
 }
 const curve = new T.CatmullRomCurve3(vecs, closed, 'centripetal', 0.5);
 curve.arcLengthDivisions = 3000;
 return curve;
}

const ROUTES: Record<CourseId, T.CatmullRomCurve3> = {
 // 1. CRESTFALL GARDENS: Grand Crescent with Northern S-Bend Valley (Kidney / Crescent shape)
 'crestfall-gardens': buildRoute([
  [0, 3, -105],
  [78, 5, -98],
  [138, 12, -45],
  [142, 20, 36],
  [96, 24, 98],
  [32, 17, 64],
  [-28, 15, 42],
  [-92, 19, 92],
  [-142, 12, 42],
  [-132, 6, -42],
  [-76, 3, -95],
 ]),

 // 2. ABYSSAL GLASS TRENCH: 3-Lobed Manta Serpentine with Deep Marianas Plunge
 'abyssal-trench': buildRoute([
  [0, 20, -118],
  [78, 22, -106],
  [148, 8, -48],
  [152, -14, 34],
  [92, -18, 68],
  [36, -10, 36],
  [-12, -20, 108],
  [-82, -16, 118],
  [-94, -6, 46],
  [-148, 4, -12],
  [-128, 15, -84],
  [-64, 19, -112],
 ]),

 // 3. DUNE WORM CANYON: True 3D Figure-8 Overpass (Bridge at y=+26m over Canyon Floor at y=+1m)
 'dune-canyon': buildRoute([
  [-56, 15, -52],
  [0, 26, 0],        // Upper Overpass Bridge crossing (+X, +Z) at y = 26m!
  [58, 22, 54],
  [128, 14, 92],
  [162, 8, 26],
  [128, 4, -64],
  [58, 2, -54],
  [0, 1, 0],         // Lower Canyon Underpass crossing (-X, +Z) at y = 1m (25m below bridge!)
  [-58, 4, 54],
  [-128, 12, 92],
  [-162, 18, 24],
  [-126, 14, -64],
 ]),

 // 4. POLAR VORTEX CITADEL: 4-Pointed Arctic Star / Clover Circuit
 'polar-vortex': buildRoute([
  [0, 6, -142],      // South Star Tip
  [68, 10, -74],     // SE Inner Waist
  [146, 18, -12],    // East Star Tip
  [76, 25, 62],      // NE Inner Waist
  [10, 30, 142],     // North Star Tip (High Glacier Peak)
  [-68, 22, 72],     // NW Inner Waist
  [-146, 14, 8],     // West Star Tip
  [-72, 8, -68],     // SW Inner Waist
 ]),

 // 5. AMAZON CANOPY LOOP: Elongated Jungle Mountain Climb with 3 Long Straightaways for the 360° Loops
 'amazon-canopy': buildRoute([
  [-48, 4, -112],
  [42, 6, -112],     // Loop 1 approach straight
  [124, 12, -78],
  [158, 20, -4],
  [118, 28, 74],     // Loop 2 approach straight
  [32, 32, 112],
  [-62, 26, 106],
  [-136, 18, 56],    // Loop 3 approach straight
  [-152, 10, -26],
  [-108, 5, -92],
 ]),

 // 6. EMBER RIDGE RUN: open point-to-point descent, crater rim (y 74) down to the coast (y 4)
 'ember-ridge': buildRoute([
  [-40, 74, -230],
  [40, 72, -236],
  [118, 68, -214],
  [172, 62, -150],
  [182, 56, -70],
  [140, 50, 0],
  [66, 46, 22],
  [-6, 42, 52],
  [-52, 36, 118],
  [-34, 30, 196],
  [36, 24, 244],
  [124, 18, 250],
  [204, 13, 204],
  [244, 9, 124],
  [236, 6, 40],
  [210, 4, -30],
 ], false),
};

/** Normalised track parameter: wraps on circuits, clamps on point-to-point sprints. */
export function normT(progress: number, courseId: CourseId = activeCourseId): number {
 const def = courseById(courseId);
 if (def.kind === 'sprint') return Math.max(0, Math.min(0.99999, progress));
 return ((progress % 1) + 1) % 1;
}
/** Progress value at which a racer has finished. */
export function finishProgress(courseId: CourseId = activeCourseId): number {
 const def = courseById(courseId);
 return def.kind === 'sprint' ? 0.985 : def.laps;
}
/** Grid slot progress for racer i (circuits start behind the line, sprints start just after the top). */
export function gridProgress(i: number, courseId: CourseId = activeCourseId): number {
 const def = courseById(courseId);
 return def.kind === 'sprint' ? 0.016 - i * 0.0035 : -i * 0.009;
}
/** Signed distance in progress units from a to b (shortest way round on circuits). */
export function tDelta(a: number, b: number, courseId: CourseId = activeCourseId): number {
 let d = normT(b, courseId) - normT(a, courseId);
 if (courseById(courseId).kind === 'circuit') { if (d > 0.5) d -= 1; if (d < -0.5) d += 1; }
 return d;
}

const lengthCache = new Map<CourseId, number>();
/** Centre-line length in metres. */
export function courseLength(courseId: CourseId = activeCourseId): number {
 let L = lengthCache.get(courseId);
 if (L === undefined) { L = ROUTES[courseById(courseId).id].getLength(); lengthCache.set(courseId, L); }
 return L;
}

/** Ramp height (metres, along the road normal) at progress t, 0 when not on a ramp. */
export function rampHeightAt(progress: number, courseId: CourseId = activeCourseId): number {
 const def = courseById(courseId);
 const t = normT(progress, courseId);
 for (const j of def.jumps) {
  const d = t - (j.t - j.rampLen);
  if (d >= 0 && d <= j.rampLen) { const u = d / j.rampLen; return j.height * u * u * (1.6 - 0.6 * u); }
 }
 return twistKickAt(t, courseId);
}
/** The jump whose lip was just passed (within `window`) — used to launch karts. */
export function jumpLipAt(progress: number, window: number, courseId: CourseId = activeCourseId): JumpZone | null {
 const def = courseById(courseId);
 const t = normT(progress, courseId);
 for (const j of def.jumps) { const d = t - j.t; if (d >= 0 && d < window) return j; }
 return null;
}
/** True where the road surface is missing (gap jumps). */
export function isGapAt(progress: number, courseId: CourseId = activeCourseId): boolean {
 const def = courseById(courseId);
 const t = normT(progress, courseId);
 return def.jumps.some(j => j.gap > 0 && t > j.t && t < j.t + j.gap);
}
export function tunnelAt(progress: number, courseId: CourseId = activeCourseId): TunnelZone | null {
 const t = normT(progress, courseId);
 return courseById(courseId).tunnels.find(z => t >= z.startT && t <= z.endT) || null;
}

/** Live state of an obstacle at `time` seconds: where it is across the road and whether it is dangerous. `amount` drives animation (crusher height, jet strength). */
export function obstacleState(o: Obstacle, time: number): {lane: number; active: boolean; amount: number} {
 const u = (((time / o.period + o.phase) % 1) + 1) % 1;
 switch (o.kind) {
  case 'crusher': {
   // raised -> slam -> rest on the road -> lift
   const amount = u < 0.5 ? 1 : u < 0.6 ? 1 - (u - 0.5) / 0.1 : u < 0.88 ? 0 : (u - 0.88) / 0.12;
   return {lane: o.lane, active: u >= 0.58 && u < 0.9, amount};
  }
  case 'pendulum': return {lane: o.lane + Math.sin(u * Math.PI * 2) * 44, active: true, amount: Math.sin(u * Math.PI * 2)};
  case 'roller': { const tri = u < 0.5 ? u * 2 : 2 - u * 2; return {lane: -50 + tri * 100, active: true, amount: u}; }
  case 'fire-jet': {
   const on = u >= 0.45 && u < 0.85;
   const amount = u < 0.45 ? Math.max(0, (u - 0.3) / 0.15) * 0.25 : on ? 1 : Math.max(0, 1 - (u - 0.85) / 0.1);
   return {lane: o.lane, active: on, amount};
  }
  default: return {lane: o.lane, active: true, amount: 1};
 }
}

/** Item box positions for a course (5 across each row). */
export function itemBoxSlots(courseId: CourseId = activeCourseId): {t: number; lane: number}[] {
 const out: {t: number; lane: number}[] = [];
 for (const t of courseById(courseId).itemRows) for (const lane of [-34, -17, 0, 17, 34]) out.push({t, lane});
 return out;
}


let activeCourseId: CourseId = 'crestfall-gardens';
export function setActiveCourse(id: CourseId) {
 activeCourseId = id;
}
export function getActiveCourse(): CourseId {
 return activeCourseId;
}

/** Smooth 5-tap Gaussian curvature banking so there are never C1 kinks at spline control points. */
export function trackBanking(progress: number, courseId: CourseId = activeCourseId): number {
 const def = courseById(courseId);
 const route = ROUTES[def.id];
 const t = normT(progress, def.id);

 // Smoothly feather banking to 0 approaching any 360-degree vertical loop
 let loopAtten = 1.0;
 for (const loop of def.loops) {
  let d = Math.abs(t - loop.centerT);
  if (d > 0.5) d = 1 - d;
  const outer = loop.halfWidth * 1.65;
  const inner = loop.halfWidth * 1.02;
  if (d <= inner) return 0;
  if (d < outer) {
   const u = (d - inner) / (outer - inner);
   loopAtten = Math.min(loopAtten, u * u * (3 - 2 * u));
  }
 }

 const offsets = [-0.016, -0.008, 0, 0.008, 0.016];
 const weights = [0.12, 0.24, 0.28, 0.24, 0.12];
 const dt = 0.006;
 let turnSum = 0;
 for (let k = 0; k < offsets.length; k++) {
  const tc = normT(t + offsets[k], def.id);
  const t1 = normT(tc - dt, def.id);
  const t2 = normT(tc + dt, def.id);
  const tan1 = route.getTangentAt(t1);
  const tan2 = route.getTangentAt(t2);
  const turn = (tan2.x * tan1.z - tan2.z * tan1.x) / (dt * 2);
  turnSum += turn * weights[k];
 }
 const rawBank = Math.max(-def.maxBank, Math.min(def.maxBank, -turnSum * def.bankScale * 0.18));
 return rawBank * loopAtten + twistRollAt(t, def.id);
}

export function loopPitchAt(progress: number, courseId: CourseId = activeCourseId): {inLoop: boolean; theta: number; loop: LoopZone | null} {
 const def = courseById(courseId);
 const t = normT(progress, def.id);
 for (const loop of def.loops) {
  const diff = t - loop.centerT;
  if (Math.abs(diff) <= loop.halfWidth) {
   const u = (diff + loop.halfWidth) / (2 * loop.halfWidth);
   return {inLoop: true, theta: u * Math.PI * 2, loop};
  }
 }
 return {inLoop: false, theta: 0, loop: null};
}

export function jumpFactorAt(progress: number, courseId: CourseId = activeCourseId): number {
 return rampHeightAt(progress, courseId);
}

/** The unmorphed road frame (see trackFrame for the morph-aware one). */
function baseTrackFrame(progress: number, lane = 0, courseId: CourseId = activeCourseId) {
 const def = courseById(courseId);
 const route = ROUTES[def.id];
 const t = normT(progress, def.id);
 const baseCenter = route.getPointAt(t);
 const baseTangent = route.getTangentAt(t).normalize();
 const bank = trackBanking(t, def.id);
 const hRight = new T.Vector3(baseTangent.z, 0, -baseTangent.x).normalize();

 // Seamless C2 Vertical 360-degree Loop-the-Loop (Amazon Canopy Loop)
 const lp = loopPitchAt(t, def.id);
 if (lp.inLoop && lp.loop) {
  const loop = lp.loop;
  const u = (t - (loop.centerT - loop.halfWidth)) / (2 * loop.halfWidth);
  const theta = lp.theta; // 0 -> 2*PI
  const baseUp = new T.Vector3().crossVectors(baseTangent, hRight).normalize();

  // Smooth bell envelope w(u) = sin^2(pi*u) so position & tangent blend with zero tear at u=0 and u=1
  const win = Math.sin(Math.PI * u);
  const env = win * win;
  const forwardExcursion = Math.sin(theta) * env * loop.radius * 0.92;
  const verticalLift = (1 - Math.cos(theta)) * loop.radius;
  const lateralShift = Math.sin(Math.PI * u) * loop.helixOffset;

  const center = baseCenter.clone()
   .addScaledVector(baseTangent, forwardExcursion)
   .addScaledVector(baseUp, verticalLift)
   .addScaledVector(hRight, lateralShift);

  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const tangent = baseTangent.clone().multiplyScalar(cosT).addScaledVector(baseUp, sinT).normalize();
  const normal = baseUp.clone().multiplyScalar(cosT).addScaledVector(baseTangent, -sinT).normalize();
  const right = hRight.clone();
  const position = center.clone().addScaledVector(right, lane * 0.18);
  return {position, tangent, right, normal, bankAngle: 0, loopAngle: theta, inLoop: true, center};
 }

 const right = new T.Vector3(
  hRight.x * Math.cos(bank),
  Math.sin(bank),
  hRight.z * Math.cos(bank)
 ).normalize();
 const normal = new T.Vector3().crossVectors(baseTangent, right).normalize();
 const position = baseCenter.clone().addScaledVector(right, lane * 0.18);
 return {position, tangent: baseTangent, right, normal, bankAngle: bank, loopAngle: 0, inLoop: false, center: baseCenter};
}

export function worldPoint(progress: number, lane = 0, offset = 0, courseId: CourseId = activeCourseId): T.Vector3 {
 const frame = trackFrame(progress, lane, courseId);
 if (offset !== 0) frame.position.addScaledVector(frame.normal, offset);
 return frame.position;
}

/** Pre-sampled track centerline cache for fast prop-clearance and minimap projection. */
interface CourseSampleCache {
 samples: T.Vector3[];
 minX: number;
 maxX: number;
 minZ: number;
 maxZ: number;
 svgPath: string;
}
const sampleCache = new Map<CourseId, CourseSampleCache>();

function getCourseCache(courseId: CourseId): CourseSampleCache {
 let cached = sampleCache.get(courseId);
 if (cached) return cached;
 const N = 240;
 const samples: T.Vector3[] = [];
 let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
 for (let i = 0; i < N; i++) {
  const p = worldPoint(i / N, 0, 0, courseId);
  samples.push(p);
  if (p.x < minX) minX = p.x;
  if (p.x > maxX) maxX = p.x;
  if (p.z < minZ) minZ = p.z;
  if (p.z > maxZ) maxZ = p.z;
 }
 const pad = 18;
 minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
 const spanX = Math.max(1, maxX - minX);
 const spanZ = Math.max(1, maxZ - minZ);
 const W = 120, H = 84, margin = 10;
 const scale = Math.min((W - margin * 2) / spanX, (H - margin * 2) / spanZ);
 const cx = (minX + maxX) * 0.5;
 const cz = (minZ + maxZ) * 0.5;

 const parts: string[] = [];
 for (let i = 0; i < N; i++) {
  const sx = 60 + (samples[i].x - cx) * scale;
  const sy = 42 + (samples[i].z - cz) * scale;
  parts.push(`${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`);
 }
 if (courseById(courseId).kind === 'circuit') parts.push('Z');
 cached = {samples, minX, maxX, minZ, maxZ, svgPath: parts.join(' ')};
 sampleCache.set(courseId, cached);
 return cached;
}

/** Project any progress `t` and `lane` onto the 120x84 minimap coordinate space for the given course. */
export function courseMinimapPoint(progress: number, lane = 0, courseId: CourseId = activeCourseId): {x: number; y: number} {
 const cache = getCourseCache(courseId);
 const p = worldPoint(progress, lane, 0, courseId);
 const spanX = Math.max(1, cache.maxX - cache.minX);
 const spanZ = Math.max(1, cache.maxZ - cache.minZ);
 const W = 120, H = 84, margin = 10;
 const scale = Math.min((W - margin * 2) / spanX, (H - margin * 2) / spanZ);
 const cx = (cache.minX + cache.maxX) * 0.5;
 const cz = (cache.minZ + cache.maxZ) * 0.5;
 return {
  x: 60 + (p.x - cx) * scale,
  y: 42 + (p.z - cz) * scale,
 };
}

/** 960x560 logical-field point used by 2D fallbacks and HUD maths. */
export function trackPoint2D(progress: number, lane = 0, courseId: CourseId = activeCourseId): {x: number; y: number} {
 const mp = courseMinimapPoint(progress, lane, courseId);
 return {x: 480 + (mp.x - 60) * 7.2, y: 280 + (mp.y - 42) * 5.8};
}

/** Returns the SVG path string (`viewBox="0 0 120 84"`) representing the exact 2D layout of `courseId`. */
export function courseMinimapPath(courseId: CourseId = activeCourseId): string {
 return getCourseCache(courseId).svgPath;
}

/**
 * Checks whether a world-space object at `(x, z)` with bounding radius `objRadius` is safely outside
 * the entire 3D track corridor (road half-width ~13.5m + safety margin).
 * If it intrudes on ANY segment of the track, returns a pushed-out safe `(x, z)` coordinate!
 */
export function ensureOffTrackXZ(x: number, z: number, objRadius: number, courseId: CourseId = activeCourseId): {x: number; z: number; safe: boolean} {
 const cache = getCourseCache(courseId);
 const minClearance = 16.5 + objRadius;
 let curX = x, curZ = z;
 for (let pass = 0; pass < 8; pass++) {
  let closestDist = Infinity;
  let closestSample: T.Vector3 | null = null;
  for (const s of cache.samples) {
   const d = Math.hypot(curX - s.x, curZ - s.z);
   if (d < closestDist) {
    closestDist = d;
    closestSample = s;
   }
  }
  if (closestDist >= minClearance || !closestSample) {
   return {x: curX, z: curZ, safe: true};
  }
  // Push radially outward away from the closest track sample
  let dx = curX - closestSample.x;
  let dz = curZ - closestSample.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) {
   dx = curX || 1;
   dz = curZ || 1;
  }
  const norm = Math.hypot(dx, dz) || 1;
  curX = closestSample.x + (dx / norm) * (minClearance + 2.0);
  curZ = closestSample.z + (dz / norm) * (minClearance + 2.0);
 }
 // Final check
 for (const s of cache.samples) {
  if (Math.hypot(curX - s.x, curZ - s.z) < minClearance * 0.92) {
   return {x: curX, z: curZ, safe: false};
  }
 }
 return {x: curX, z: curZ, safe: true};
}

/**
 * Ensures a vertical viaduct support column placed below `progress = t` does not intersect any
 * lower road segment (such as the Canyon Figure-8 underpass on `dune-canyon`).
 */
export function isSupportPillarSafe(progress: number, courseId: CourseId = activeCourseId): boolean {
 const cache = getCourseCache(courseId);
 const p = worldPoint(progress, 0, 0, courseId);
 const N = cache.samples.length;
 for (let i = 0; i < N; i++) {
  const st = i / N;
  let dt = Math.abs(st - normT(progress, courseId));
  if (dt > 0.5) dt = 1 - dt;
  if (dt < 0.06) continue;
  const s = cache.samples[i];
  if (Math.hypot(p.x - s.x, p.z - s.z) < 22) {
   return false;
  }
 }
 return true;
}


/**
 * Shortcuts: chords across the inside of a hairpin that save real distance. Found automatically so they
 * always clear every other piece of road (including figure-8 crossings). Surface is dirt: slower than
 * asphalt unless you're boosting, so it rewards a saved Nitro or a Grove kart.
 */
const shortcutCache = new Map<CourseId, Shortcut[]>();
export function courseShortcuts(courseId: CourseId = activeCourseId): Shortcut[] {
 const hit = shortcutCache.get(courseId);
 if (hit) return hit;
 const def = courseById(courseId);
 const cache = getCourseCache(courseId);
 const L = courseLength(courseId);
 const N = cache.samples.length;
 const blocked = (t: number) => {
  const near = (a: number, b: number) => Math.abs(tDelta(a, t, courseId)) < b;
  return def.loops.some(l => near(l.centerT, l.halfWidth + 0.04)) || def.jumps.some(j => near(j.t, 0.03))
   || def.tunnels.some(z => t > z.startT - 0.02 && t < z.endT + 0.02) || def.bridges.some(z => t > z.startT - 0.02 && t < z.endT + 0.02)
   || (def.kind === 'circuit' && near(0, 0.04));
 };
 type Cand = {from: number; to: number; side: 1 | -1; ratio: number; chord: number};
 const cands: Cand[] = [];
 for (let a = 0.02; a < (def.kind === 'sprint' ? 0.8 : 1); a += 0.004) {
  for (let span = 0.06; span <= 0.2; span += 0.004) {
   const b = a + span;
   if (def.kind === 'sprint' && b > 0.95) continue;
   if (blocked(a) || blocked(b) || blocked(a + span / 2)) continue;
   const fa = trackFrame(a, 0, courseId), fb = trackFrame(b, 0, courseId);
   const mid = trackFrame(a + span / 2, 0, courseId).position;
   const chordMid = fa.position.clone().lerp(fb.position, 0.5);
   const toChord = chordMid.clone().sub(mid);
   const side: 1 | -1 = toChord.dot(trackFrame(a + span / 2, 0, courseId).right) > 0 ? 1 : -1;
   const pa = worldPoint(a, side * 62, 0, courseId), pb = worldPoint(b, side * 62, 0, courseId);
   const chord = Math.hypot(pb.x - pa.x, pb.z - pa.z);
   if (chord < 30 || Math.abs(pb.y - pa.y) > 9) continue;
   const ratio = (span * L) / chord;
   if (ratio < 1.22) continue;
   let clear = true;
   for (let k = 1; k < 10 && clear; k++) {
    const u = k / 10;
    const q = pa.clone().lerp(pb, u);
    const need = u < 0.2 || u > 0.8 ? 12.5 : 17;
    for (let i = 0; i < N; i++) {
     const st = i / N;
     if ((u < 0.2 && Math.abs(tDelta(st, a, courseId)) < 0.025) || (u > 0.8 && Math.abs(tDelta(st, b, courseId)) < 0.025)) continue;
     const sp = cache.samples[i];
     if (Math.hypot(q.x - sp.x, q.z - sp.z) < need && Math.abs(q.y - sp.y) < 10) { clear = false; break; }
    }
   }
   if (clear) cands.push({from: a, to: b, side, ratio, chord});
  }
 }
 cands.sort((x, y) => y.ratio - x.ratio);
 const chosen: Cand[] = [];
 for (const c of cands) {
  if (chosen.length >= 2 || (chosen.length === 1 && c.ratio < 1.38)) break;
  if (chosen.some(o => !(c.to < o.from - 0.05 || c.from > o.to + 0.05))) continue;
  chosen.push(c);
 }
 const out = chosen.map(c => {
  const fa = trackFrame(c.from, 0, courseId), fb = trackFrame(c.to, 0, courseId);
  const pa = worldPoint(c.from, c.side * 60, 0, courseId), pb = worldPoint(c.to, c.side * 60, 0, courseId);
  const pts = [
   pa,
   pa.clone().addScaledVector(fa.tangent, 9).addScaledVector(fa.right, c.side * 4),
   pa.clone().lerp(pb, 0.5).add(new T.Vector3(0, 0.6, 0)),
   pb.clone().addScaledVector(fb.tangent, -9).addScaledVector(fb.right, c.side * 4),
   pb,
  ];
  const curve = new T.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  return {fromT: c.from, toT: c.to, side: c.side, length: curve.getLength(), curve} as Shortcut;
 });
 shortcutCache.set(courseId, out);
 return out;
}

/** World frame for a kart `u` (0..1) of the way along shortcut `idx`, `lane` across it (-20..20). */
export function shortcutFrame(courseId: CourseId, idx: number, u: number, lane = 0) {
 const sc = courseShortcuts(courseId)[idx];
 const uu = Math.max(0, Math.min(1, u));
 const center = sc.curve.getPointAt(uu);
 const tangent = sc.curve.getTangentAt(uu).normalize();
 const right = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
 const normal = new T.Vector3().crossVectors(tangent, right).normalize();
 const position = center.clone().addScaledVector(right, lane * 0.18);
 return {position, tangent, right, normal, bankAngle: 0, loopAngle: 0, inLoop: false, center};
}

export function shortcutMinimapPath(courseId: CourseId, idx: number): string {
 const sc = courseShortcuts(courseId)[idx];
 const cache = getCourseCache(courseId);
 const spanX = Math.max(1, cache.maxX - cache.minX), spanZ = Math.max(1, cache.maxZ - cache.minZ);
 const scale = Math.min(100 / spanX, 64 / spanZ);
 const cx = (cache.minX + cache.maxX) * 0.5, cz = (cache.minZ + cache.maxZ) * 0.5;
 const parts: string[] = [];
 for (let i = 0; i <= 16; i++) { const p = sc.curve.getPointAt(i / 16); parts.push(`${i ? 'L' : 'M'}${(60 + (p.x - cx) * scale).toFixed(1)},${(42 + (p.z - cz) * scale).toFixed(1)}`); }
 return parts.join(' ');
}

// ============================================================================
// TRACK MORPHS — sections of road that shift into a different shape mid-race.
// A morph zone sits just after a jump or right before/after a bridge. When the
// leader reaches its trigger it may (chance roll) activate: the section bends
// into a shorter chord across the bend, or bulges out into a longer, humped arc.
// trackFrame() is morph-aware, so road, karts, items, camera and minimap follow.
// ============================================================================
export type MorphKind = 'short' | 'long';
export interface MorphZone { startT: number; endT: number; triggerT: number; trigger: 'jump' | 'bridge' | 'timer'; chance: number; allowShort: boolean; bend: number; }
export interface MorphLive { m: number; kind: MorphKind; side: number; len: number; }

const morphZoneCache = new Map<CourseId, MorphZone[]>();
const morphLive = new Map<CourseId, MorphLive[]>();

function bendBetween(a: number, b: number, id: CourseId) {
 const A = baseTrackFrame(a, 0, id).tangent, B = baseTrackFrame(b, 0, id).tangent;
 return Math.acos(Math.max(-1, Math.min(1, (A.x * B.x + A.z * B.z) / (Math.hypot(A.x, A.z) * Math.hypot(B.x, B.z) || 1))));
}

/** Morph zones for a course: found next to its jumps and bridges, clear of ramps, gaps, loops, tunnels, bridges and shortcuts. */
export function courseMorphs(courseId: CourseId = activeCourseId): MorphZone[] {
 const hit = morphZoneCache.get(courseId);
 if (hit) return hit;
 const def = courseById(courseId);
 const blocked: [number, number][] = [];
 def.jumps.forEach(j => blocked.push([j.t - j.rampLen, j.t + j.gap + .008]));
 def.bridges.forEach(b => blocked.push([b.startT, b.endT]));
 def.tunnels.forEach(z => blocked.push([z.startT, z.endT]));
 def.loops.forEach(l => blocked.push([l.centerT - l.halfWidth - .01, l.centerT + l.halfWidth + .01]));
 courseTwists(courseId).forEach(z => blocked.push([z.startT - .01, z.t + .03]));
 courseShortcuts(courseId).forEach(s => { blocked.push([s.fromT - .015, s.fromT + .015]); blocked.push([s.toT - .015, s.toT + .015]); });
 const lo = def.kind === 'sprint' ? .05 : .03, hi = def.kind === 'sprint' ? .93 : .955;
 const fits = (a: number, b: number) => a > lo && b < hi && !blocked.some(([x, y]) => x < b + .004 && y > a - .004);
 const zones: MorphZone[] = [];
 const anchors: {at: number; trig: number; kind: MorphZone['trigger']}[] = [
  ...def.jumps.map(j => ({at: j.t + j.gap + .01, trig: j.t, kind: 'jump' as const})),
  ...def.bridges.map(b => ({at: b.endT + .004, trig: b.startT, kind: 'bridge' as const})),
  ...def.bridges.map(b => ({at: b.startT - .075, trig: b.startT - .1, kind: 'bridge' as const})),
 ];
 for (const an of anchors) {
  let done = false;
  for (let len = .07; len >= .034 && !done; len -= .004) {
   for (let a = an.at; a < an.at + .05 && !done; a += .002) {
    const b = a + len;
    if (!fits(a, b) || zones.some(z => z.startT < b + .02 && z.endT > a - .02)) continue;
    const bend = bendBetween(a, b, courseId);
    zones.push({startT: a, endT: b, triggerT: Math.min(an.trig, a - .012), trigger: an.kind, chance: .6, allowShort: bend > .3, bend});
    done = true;
   }
  }
  if (zones.length >= 3) break;
 }
 if (!zones.length) {
  // fallback: one timed morph wherever the course has room
  for (let a = lo; a < hi - .05 && !zones.length; a += .004) {
   const b = a + .045;
   if (fits(a, b)) { const bend = bendBetween(a, b, courseId); zones.push({startT: a, endT: b, triggerT: a - .03, trigger: 'timer', chance: .55, allowShort: bend > .3, bend}); }
  }
 }
 morphZoneCache.set(courseId, zones);
 return zones;
}

export function morphState(courseId: CourseId = activeCourseId): MorphLive[] {
 let s = morphLive.get(courseId);
 if (!s) { s = courseMorphs(courseId).map(z => ({m: 0, kind: 'long' as MorphKind, side: 1, len: morphBaseLength(courseId, z)})); morphLive.set(courseId, s); }
 return s;
}

const morphWindow = (u: number) => { const a = Math.min(1, u / .3), b = Math.min(1, (1 - u) / .3); const s = (x: number) => x * x * (3 - 2 * x); return s(Math.max(0, a)) * s(Math.max(0, b)); };

function morphCenter(courseId: CourseId, z: MorphZone, live: MorphLive, t: number, m = live.m): T.Vector3 {
 const route = ROUTES[courseById(courseId).id];
 const base = route.getPointAt(t);
 if (m <= 0) return base;
 const u = (t - z.startT) / (z.endT - z.startT);
 const w = morphWindow(u) * m;
 if (live.kind === 'short') {
  const A = route.getPointAt(z.startT), B = route.getPointAt(z.endT);
  const chord = A.lerp(B, u);
  return base.lerp(chord, w);
 }
 const tan = route.getTangentAt(t);
 const right = new T.Vector3(tan.z, 0, -tan.x).normalize();
 const hump = Math.sin(Math.PI * u) ** 2;
 return base.addScaledVector(right, live.side * 7.5 * w).add(new T.Vector3(0, 3.6 * hump * m, 0));
}

function pathLength(courseId: CourseId, z: MorphZone, live: MorphLive, m: number) {
 let L = 0, prev = morphCenter(courseId, z, live, z.startT, m);
 for (let i = 1; i <= 24; i++) { const p = morphCenter(courseId, z, live, z.startT + (z.endT - z.startT) * i / 24, m); L += p.distanceTo(prev); prev = p; }
 return L;
}
function morphBaseLength(courseId: CourseId, z: MorphZone) { return pathLength(courseId, z, {m: 0, kind: 'long', side: 1, len: 0}, 0); }

/** Set a zone's live morph amount (0..1) and shape. Called by the race sim each step. */
export function setMorph(courseId: CourseId, index: number, m: number, kind: MorphKind, side: number) {
 const s = morphState(courseId)[index];
 if (!s) return;
 const changed = Math.abs(s.m - m) > 1e-4 || s.kind !== kind || s.side !== side;
 s.m = m; s.kind = kind; s.side = side;
 // a 'short' shift straightens AND compresses the section (glowing compression field): ~22% less distance at full morph
 if (changed) s.len = pathLength(courseId, courseMorphs(courseId)[index], s, m) * (kind === 'short' ? 1 - .22 * m : 1);
}
/** Clear all morphs (new race). */
export function resetMorphs(courseId: CourseId) { morphState(courseId).forEach((s, i) => setMorph(courseId, i, 0, 'long', 1)); }

/** Multiplier on progress-per-metre inside an active zone: >1 on a shorter shape, <1 on a longer one. */
export function morphSpeedFactor(progress: number, courseId: CourseId = activeCourseId): number {
 const zs = courseMorphs(courseId);
 if (!zs.length) return 1;
 const t = normT(progress, courseId), st = morphState(courseId);
 for (let i = 0; i < zs.length; i++) {
  const z = zs[i], s = st[i];
  if (s.m > 0 && t >= z.startT && t <= z.endT) { const base = morphBaseLength(courseId, z); return base / Math.max(1, s.len); }
 }
 return 1;
}

export function trackFrame(progress: number, lane = 0, courseId: CourseId = activeCourseId) {
 const zs = morphZoneCache.get(courseId);
 if (!zs || !zs.length) return baseTrackFrame(progress, lane, courseId);
 const t = normT(progress, courseId);
 const st = morphLive.get(courseId);
 if (!st) return baseTrackFrame(progress, lane, courseId);
 for (let i = 0; i < zs.length; i++) {
  const z = zs[i], s = st[i];
  if (s.m <= 0 || t < z.startT || t > z.endT) continue;
  const e = .0012;
  const c = morphCenter(courseId, z, s, t);
  const tangent = morphCenter(courseId, z, s, Math.min(z.endT + e, t + e)).sub(morphCenter(courseId, z, s, Math.max(z.startT - e, t - e))).normalize();
  const bf = baseTrackFrame(progress, 0, courseId);
  const w = morphWindow((t - z.startT) / (z.endT - z.startT)) * s.m;
  const flat = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
  const right = bf.right.clone().lerp(flat, w).normalize();
  const normal = new T.Vector3().crossVectors(tangent, right).normalize();
  const rightOrtho = new T.Vector3().crossVectors(normal, tangent).normalize();
  const position = c.clone().addScaledVector(rightOrtho, lane * 0.18);
  return {position, tangent, right: rightOrtho, normal, bankAngle: bf.bankAngle * (1 - w), loopAngle: 0, inLoop: false, center: c};
 }
 return baseTrackFrame(progress, lane, courseId);
}

// ---- road curvature (for steering): signed, in "lane direction" — + means the road bends toward +lane ----
const curvCache=new Map<CourseId,Float32Array>();
/** Signed road curvature (1/m) at a progress value; + = the road bends toward +lane. Base layout (morphs ignored). */
export function roadCurvature(progress: number, courseId: CourseId = activeCourseId): number {
 let tab=curvCache.get(courseId);
 if(!tab){
  const N=1024,L=courseLength(courseId);tab=new Float32Array(N);
  const ds=6/L;
  for(let i=0;i<N;i++){
   const t=i/N,a=baseTrackFrame(t,0,courseId),b=baseTrackFrame(t+ds,0,courseId),c=baseTrackFrame(t-ds,0,courseId);
   const laneDir=baseTrackFrame(t,1,courseId).position.sub(a.position).normalize();
   const second=b.position.clone().add(c.position).sub(a.position.clone().multiplyScalar(2)); // ≈ κ·n·ds²
   const k=second.dot(laneDir)/36;
   tab[i]=Number.isFinite(k)?Math.max(-.05,Math.min(.05,k)):0;
  }
  // light smoothing so spline knots don't kick the wheel
  const sm=new Float32Array(N);for(let i=0;i<N;i++){let acc=0;for(let j=-3;j<=3;j++)acc+=tab[(i+j+N)%N];sm[i]=acc/7;}
  tab=sm;curvCache.set(courseId,tab);
 }
 const f=((normT(progress,courseId)%1)+1)%1*tab.length,i0=Math.floor(f)%tab.length,i1=(i0+1)%tab.length,u=f-Math.floor(f);
 return tab[i0]*(1-u)+tab[i1]*u;
}


// ---- Solid hazards & wind fans ----
/** Lane units → metres across the road (trackFrame uses lane * 0.18). */
export const LANE_M = 0.18;
/**
 * Hazards you can't drive through: a cylinder (metres) the kart bounces off unless it is higher than `height`.
 * Geysers and ice are surface effects (null) — you drive over them.
 */
export function hazardSolid(h: TrackHazard): {radius: number; height: number} | null {
 switch (h.kind) {
  case 'sand-pocket': return {radius: 2.7, height: 2.5};
  case 'crystal': return {radius: 1.3, height: 2.2};
  default: return null;
 }
}
/** How far before a sand pile its wind fan sits (metres), and the fan's radius. */
export const FAN_LEAD = 21, FAN_RADIUS = 3.1;
export interface WindFan { t: number; lane: number; label: string }
/** A ground fan in front of every sand pile: drive over it and it blows the kart up and over the pile. */
export function windFans(courseId: CourseId): WindFan[] {
 const def = courseById(courseId), L = courseLength(courseId);
 return def.hazards.filter(h => h.kind === 'sand-pocket').map(h => ({t: (((h.t - FAN_LEAD / L) % 1) + 1) % 1, lane: h.lane, label: 'WIND FAN'}));
}


// ---- Twist kickers: the road corkscrews into a steep bank, then a kicker lip throws karts into the air ----
export interface TwistZone { startT: number; t: number; dir: 1 | -1; label: string }
/** Roll at full twist (rad), twist run-up and kicker lengths (metres), kicker lip height (m). */
export const TWIST_ROLL = 0.62, TWIST_LEN = 50, KICK_LEN = 13, KICK_HEIGHT = 1.15;
const twistCache = new Map<CourseId, TwistZone[]>();
/** Two per course, auto-placed on straight-ish road clear of jumps, loops, tunnels, bridges, pads and hazards. */
export function courseTwists(courseId: CourseId = activeCourseId): TwistZone[] {
 const hit = twistCache.get(courseId); if (hit) return hit;
 const def = courseById(courseId), route = ROUTES[def.id], L = route.getLength();
 const len = TWIST_LEN / L, tail = 26 / L, kick = 22 / L;
 // hard: road geometry a twist can't share. soft: things that may sit on the run-up but not on the kicker / landing.
 const blocked: [number, number][] = [], soft: number[] = [];
 def.jumps.forEach(j => blocked.push([j.t - j.rampLen - .015, j.t + j.gap + .03]));
 def.loops.forEach(l => blocked.push([l.centerT - l.halfWidth * 1.8, l.centerT + l.halfWidth * 1.8]));
 def.tunnels.forEach(z => blocked.push([z.startT - .012, z.endT + .012]));
 def.bridges.forEach(b => blocked.push([b.startT - .012, b.endT + .012]));
 // leave the stretches track morphs anchor to (just after jumps and bridges) to the morphs
 def.jumps.forEach(j => blocked.push([j.t + j.gap, j.t + j.gap + .1]));
 def.boostPads.forEach(t => soft.push(t));
 def.hazards.forEach(h => soft.push(h.t));
 (def.obstacles || []).forEach(o => soft.push(o.t));
 const lo = def.kind === 'sprint' ? .1 : .06, hi = def.kind === 'sprint' ? .88 : .95;
 const turnAt = (t: number) => { const a = route.getTangentAt(((t - .004) % 1 + 1) % 1), b = route.getTangentAt(((t + .004) % 1 + 1) % 1); return Math.abs(b.x * a.z - b.z * a.x) + Math.abs(b.y - a.y) * 2; };
 const cands: {t: number; score: number}[] = [];
 for (let t = lo + len; t < hi; t += .0025) {
  const a = t - len, b = t + tail;
  if (blocked.some(([x, y]) => x < b && y > a) || soft.some(x => x > t - kick && x < b)) continue;
  let turn = 0; for (let k = 0; k <= 8; k++) turn += turnAt(a + (b - a) * k / 8);
  cands.push({t, score: turn});
 }
 cands.sort((x, y) => x.score - y.score);
 const picks: TwistZone[] = [];
 for (const c of cands) {
  if (picks.some(p => Math.min(Math.abs(p.t - c.t), 1 - Math.abs(p.t - c.t)) < .18)) continue;
  picks.push({startT: c.t - len, t: c.t, dir: picks.length % 2 ? -1 : 1, label: 'TWIST KICKER'});
  if (picks.length === 2) break;
 }
 picks.sort((x, y) => x.t - y.t);
 twistCache.set(courseId, picks);
 return picks;
}
const smoothstep = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** Extra road roll from a twist (rad): winds up over the run-up, holds through the kicker, unwinds just after the lip. */
export function twistRollAt(progress: number, courseId: CourseId = activeCourseId): number {
 const t = ((progress % 1) + 1) % 1;
 for (const z of courseTwists(courseId)) {
  const span = z.t - z.startT, after = span * .3;
  if (t < z.startT || t > z.t + after) continue;
  const up = smoothstep((t - z.startT) / (span * .7));
  const down = t > z.t ? 1 - smoothstep((t - z.t) / after) : 1;
  return z.dir * TWIST_ROLL * up * down;
 }
 return 0;
}
/** Kicker lip height (m) on the last KICK_LEN metres before the twist's lip. */
export function twistKickAt(progress: number, courseId: CourseId = activeCourseId): number {
 const t = ((progress % 1) + 1) % 1, k = KICK_LEN / courseLength(courseId);
 for (const z of courseTwists(courseId)) { const d = t - (z.t - k); if (d >= 0 && d <= k) { const u = d / k; return KICK_HEIGHT * u * u * (1.6 - .6 * u); } }
 return 0;
}
/** The twist whose lip was just passed (within `window`). */
export function twistLipAt(progress: number, window: number, courseId: CourseId = activeCourseId): TwistZone | null {
 const t = ((progress % 1) + 1) % 1;
 for (const z of courseTwists(courseId)) { const d = t - z.t; if (d >= 0 && d < window) return z; }
 return null;
}
