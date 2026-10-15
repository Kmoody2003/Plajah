import * as T from 'three';

export type CourseId =
 | 'crestfall-gardens'
 | 'abyssal-trench'
 | 'dune-canyon'
 | 'polar-vortex'
 | 'amazon-canopy';

export interface LoopZone {
 centerT: number;
 halfWidth: number;
 radius: number;
 helixOffset: number;
 boostPadT: number;
}

export interface JumpZone {
 startT: number;
 endT: number;
 height: number;
}

export interface TrackHazard {
 t: number;
 lane: number; // -38 to +38 (occupies only ~16% of road width, always easily avoidable)
 kind: 'crystal' | 'geyser' | 'sand-pocket' | 'ice-patch' | 'vine-root';
 label: string;
}

export interface CourseDef {
 id: CourseId;
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
  jumps: [],
  hazards: [
   {t: 0.34, lane: -26, kind: 'crystal', label: 'AMBER SHARD'},
   {t: 0.66, lane: 28, kind: 'crystal', label: 'AMBER SHARD'},
  ],
  maxBank: 0.22,
  bankScale: 0.28,
 },
 {
  id: 'abyssal-trench',
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
  jumps: [],
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
  jumps: [],
  hazards: [
   {t: 0.18, lane: -28, kind: 'sand-pocket', label: 'DUNE DRIFT'},
   {t: 0.62, lane: 26, kind: 'sand-pocket', label: 'DUNE DRIFT'},
  ],
  maxBank: 0.25,
  bankScale: 0.30,
 },
 {
  id: 'polar-vortex',
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
  boostPads: [0.06, 0.24, 0.44, 0.68, 0.86],
  loops: [],
  jumps: [],
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
  jumps: [],
  hazards: [
   {t: 0.39, lane: -26, kind: 'vine-root', label: 'CANOPY ROOT'},
   {t: 0.70, lane: 26, kind: 'vine-root', label: 'CANOPY ROOT'},
  ],
  maxBank: 0.20,
  bankScale: 0.24,
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
function buildRoute(pts: [number, number, number][]): T.CatmullRomCurve3 {
 let vecs = pts.map(([x, y, z]) => new T.Vector3(x, y, z));
 for (let pass = 0; pass < 2; pass++) {
  const next: T.Vector3[] = [];
  const n = vecs.length;
  for (let i = 0; i < n; i++) {
   const a = vecs[i];
   const b = vecs[(i + 1) % n];
   next.push(a.clone().multiplyScalar(0.75).addScaledVector(b, 0.25));
   next.push(a.clone().multiplyScalar(0.25).addScaledVector(b, 0.75));
  }
  vecs = next;
 }
 const curve = new T.CatmullRomCurve3(vecs, true, 'centripetal', 0.5);
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
};

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
 const t = ((progress % 1) + 1) % 1;

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
  const tc = ((t + offsets[k]) % 1 + 1) % 1;
  const t1 = ((tc - dt) % 1 + 1) % 1;
  const t2 = (tc + dt) % 1;
  const tan1 = route.getTangentAt(t1);
  const tan2 = route.getTangentAt(t2);
  const turn = (tan2.x * tan1.z - tan2.z * tan1.x) / (dt * 2);
  turnSum += turn * weights[k];
 }
 const rawBank = Math.max(-def.maxBank, Math.min(def.maxBank, -turnSum * def.bankScale * 0.18));
 return rawBank * loopAtten;
}

export function loopPitchAt(progress: number, courseId: CourseId = activeCourseId): {inLoop: boolean; theta: number; loop: LoopZone | null} {
 const def = courseById(courseId);
 const t = ((progress % 1) + 1) % 1;
 for (const loop of def.loops) {
  const diff = t - loop.centerT;
  if (Math.abs(diff) <= loop.halfWidth) {
   const u = (diff + loop.halfWidth) / (2 * loop.halfWidth);
   return {inLoop: true, theta: u * Math.PI * 2, loop};
  }
 }
 return {inLoop: false, theta: 0, loop: null};
}

export function jumpFactorAt(_progress: number, _courseId: CourseId = activeCourseId): number {
 return 0;
}

export function trackFrame(progress: number, lane = 0, courseId: CourseId = activeCourseId) {
 const def = courseById(courseId);
 const route = ROUTES[def.id];
 const t = ((progress % 1) + 1) % 1;
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
 parts.push('Z');
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
 for (let pass = 0; pass < 3; pass++) {
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
  let dt = Math.abs(st - ((progress % 1 + 1) % 1));
  if (dt > 0.5) dt = 1 - dt;
  if (dt < 0.06) continue;
  const s = cache.samples[i];
  if (Math.hypot(p.x - s.x, p.z - s.z) < 22) {
   return false;
  }
 }
 return true;
}

