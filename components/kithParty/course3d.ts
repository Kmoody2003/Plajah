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

export interface CourseDef {
 id: CourseId;
 name: string;
 subtitle: string;
 badge: string;
 description: string;
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
 boostPads: number[];
 loops: LoopZone[];
 jumps: JumpZone[];
 maxBank: number;
 bankScale: number;
}

export const COURSES: CourseDef[] = [
 {
  id: 'crestfall-gardens',
  name: 'Crestfall Gardens',
  subtitle: 'Kith Sanctuary · Cherry Blossom Viaducts & Colossal Guardian',
  badge: 'SANCTUARY CUP',
  description: 'Sweeping stone viaducts, cherry blossom canopies, cascading waterfalls, and the Colossal Kith Guardian.',
  accent: '#ff8c00',
  skyZenith: '#296be8',
  skyMid: '#85b8fa',
  skyHorizon: '#ffd9eb',
  fogColor: '#f4d5e6',
  fogDensity: 0.0019,
  roadColor: '#202236',
  deckColor: '#cbb8cc',
  copingColor: '#ded0be',
  stripeColor: '#ff7b00',
  curbColorA: '#ff7300',
  curbColorB: '#f7ead8',
  boostPads: [0.09, 0.17, 0.49, 0.78],
  loops: [],
  jumps: [{startT: 0.42, endT: 0.45, height: 1.9}],
  maxBank: 0.26,
  bankScale: 0.44,
 },
 {
  id: 'abyssal-trench',
  name: 'Abyssal Glass Trench',
  subtitle: 'Underwater Glass Tunnels · Steep Trench Drops & Bioluminescent Life',
  badge: 'DEEP SEA DIVE',
  description: 'Plunge down steep abyssal drops inside transparent glass tunnels while glowing manta rays, jellyfish, and sea leviathans swim outside.',
  accent: '#00f0ff',
  skyZenith: '#020b1f',
  skyMid: '#06264d',
  skyHorizon: '#0b4e7a',
  fogColor: '#052242',
  fogDensity: 0.0024,
  roadColor: '#0c1c36',
  deckColor: '#0f365c',
  copingColor: '#2ee6ff',
  stripeColor: '#00f2ff',
  curbColorA: '#00e5ff',
  curbColorB: '#ff2e93',
  boostPads: [0.08, 0.21, 0.44, 0.66, 0.85],
  loops: [],
  jumps: [
   {startT: 0.15, endT: 0.185, height: 2.8},
   {startT: 0.58, endT: 0.615, height: 2.4},
  ],
  maxBank: 0.48,
  bankScale: 0.72,
 },
 {
  id: 'dune-canyon',
  name: 'Dune Worm Canyon',
  subtitle: 'Sandstone Mountains · Sweeping Dunes & Colossal Breaching Sandworms',
  badge: 'DESERT STORM',
  description: 'Carve across golden sand dunes and red-rock mountain canyons while giant armored sandworms breach and race across the horizon.',
  accent: '#ff6a00',
  skyZenith: '#42163b',
  skyMid: '#b84228',
  skyHorizon: '#ffba66',
  fogColor: '#e89b64',
  fogDensity: 0.0021,
  roadColor: '#362219',
  deckColor: '#a86038',
  copingColor: '#e6b88a',
  stripeColor: '#ffaa00',
  curbColorA: '#ff5500',
  curbColorB: '#fff0d4',
  boostPads: [0.09, 0.24, 0.48, 0.71, 0.89],
  loops: [],
  jumps: [
   {startT: 0.25, endT: 0.285, height: 3.1},
   {startT: 0.61, endT: 0.645, height: 3.2},
   {startT: 0.81, endT: 0.84, height: 2.4},
  ],
  maxBank: 0.36,
  bankScale: 0.56,
 },
 {
  id: 'polar-vortex',
  name: 'Polar Vortex Citadel',
  subtitle: 'North Pole Cyclone · Aurora Skies, Glacier Bridges & Ice Caverns',
  badge: 'ARCTIC SQUALL',
  description: 'Battle a swirling North Pole vortex storm across crystalline glacier bridges, aurora-lit ice spires, and sub-zero banked hairpins.',
  accent: '#3df5ff',
  skyZenith: '#071329',
  skyMid: '#123d5e',
  skyHorizon: '#6ef2d8',
  fogColor: '#1b3b5c',
  fogDensity: 0.0022,
  roadColor: '#18304c',
  deckColor: '#78b8e0',
  copingColor: '#e6f9ff',
  stripeColor: '#42f5ff',
  curbColorA: '#00d9ff',
  curbColorB: '#ffffff',
  boostPads: [0.09, 0.22, 0.43, 0.65, 0.84],
  loops: [],
  jumps: [
   {startT: 0.33, endT: 0.365, height: 2.6},
   {startT: 0.73, endT: 0.765, height: 2.5},
  ],
  maxBank: 0.40,
  bankScale: 0.62,
 },
 {
  id: 'amazon-canopy',
  name: 'Amazon Canopy Loop',
  subtitle: 'Jungle Mountainside · Rope Bridges, Temple Tunnels & 360° Power Loops',
  badge: 'GRAVITY LOOP',
  description: 'Climb an Amazon rainforest mountain through ancient temple tunnels, suspension bridges, and 3 vertical 360° loops powered by turbo pads!',
  accent: '#9dff2e',
  skyZenith: '#0f3828',
  skyMid: '#26784a',
  skyHorizon: '#d9f296',
  fogColor: '#1e4d34',
  fogDensity: 0.0020,
  roadColor: '#24291e',
  deckColor: '#5c4228',
  copingColor: '#8c9968',
  stripeColor: '#a8ff2e',
  curbColorA: '#80e619',
  curbColorB: '#ffe866',
  boostPads: [0.08, 0.178, 0.36, 0.502, 0.66, 0.772, 0.91],
  loops: [
   {centerT: 0.215, halfWidth: 0.032, radius: 13.5, helixOffset: 9.0, boostPadT: 0.178},
   {centerT: 0.540, halfWidth: 0.034, radius: 15.0, helixOffset: -9.5, boostPadT: 0.502},
   {centerT: 0.810, halfWidth: 0.032, radius: 14.0, helixOffset: 9.0, boostPadT: 0.772},
  ],
  jumps: [
   {startT: 0.37, endT: 0.405, height: 2.7},
   {startT: 0.67, endT: 0.705, height: 2.6},
  ],
  maxBank: 0.34,
  bankScale: 0.52,
 },
];

export const courseById = (id?: CourseId): CourseDef =>
 COURSES.find(c => c.id === id) || COURSES[0];

const ROUTES: Record<CourseId, T.CatmullRomCurve3> = {
 'crestfall-gardens': new T.CatmullRomCurve3([
  new T.Vector3(0, 3, -58), new T.Vector3(43, 5, -54), new T.Vector3(69, 12, -20),
  new T.Vector3(60, 20, 20), new T.Vector3(27, 24, 45), new T.Vector3(4, 18, 62),
  new T.Vector3(-34, 11, 59), new T.Vector3(-69, 7, 28), new T.Vector3(-61, 4, -6),
  new T.Vector3(-42, 2, -28), new T.Vector3(-29, 2, -51),
 ], true, 'catmullrom', 0.4),

 // Underwater Glass Trench: High shelf launch -> steep 44m abyssal plunge -> crazy banked S-curves -> thermal spiral climb
 'abyssal-trench': new T.CatmullRomCurve3([
  new T.Vector3(0, 22, -62), new T.Vector3(46, 25, -54), new T.Vector3(78, 12, -18),
  new T.Vector3(66, -14, 24), new T.Vector3(24, -19, 58), new T.Vector3(-18, -12, 72),
  new T.Vector3(-58, -18, 48), new T.Vector3(-78, -6, 12), new T.Vector3(-54, 10, -22),
  new T.Vector3(-38, 18, -44), new T.Vector3(-22, 21, -58),
 ], true, 'catmullrom', 0.45),

 // Dune Worm Canyon: Desert mountain climb, sweeping canyon hairpins, and massive sand dune rollers
 'dune-canyon': new T.CatmullRomCurve3([
  new T.Vector3(0, 4, -60), new T.Vector3(48, 8, -55), new T.Vector3(82, 22, -18),
  new T.Vector3(64, 10, 26), new T.Vector3(28, 28, 56), new T.Vector3(-12, 14, 68),
  new T.Vector3(-52, 24, 48), new T.Vector3(-76, 8, 16), new T.Vector3(-62, 16, -16),
  new T.Vector3(-44, 5, -38), new T.Vector3(-24, 3, -55),
 ], true, 'catmullrom', 0.42),

 // Polar Vortex Citadel: High glacier citadel climb, spiral vortex bowl, and sub-zero chicanes
 'polar-vortex': new T.CatmullRomCurve3([
  new T.Vector3(0, 5, -60), new T.Vector3(44, 10, -54), new T.Vector3(76, 24, -18),
  new T.Vector3(66, 32, 24), new T.Vector3(24, 26, 58), new T.Vector3(-16, 16, 66),
  new T.Vector3(-56, 8, 48), new T.Vector3(-76, 14, 14), new T.Vector3(-58, 20, -18),
  new T.Vector3(-40, 10, -40), new T.Vector3(-24, 6, -55),
 ], true, 'catmullrom', 0.42),

 // Amazon Canopy Loop: Mountain jungle climb with long straightaways into 3 vertical 360° loops
 'amazon-canopy': new T.CatmullRomCurve3([
  new T.Vector3(0, 4, -60), new T.Vector3(45, 9, -54), new T.Vector3(76, 16, -18),
  new T.Vector3(68, 24, 24), new T.Vector3(28, 32, 54), new T.Vector3(-14, 26, 64),
  new T.Vector3(-54, 18, 48), new T.Vector3(-74, 12, 14), new T.Vector3(-60, 8, -18),
  new T.Vector3(-42, 5, -40), new T.Vector3(-24, 4, -55),
 ], true, 'catmullrom', 0.4),
};

Object.values(ROUTES).forEach(r => {
 r.arcLengthDivisions = 2400;
});

let activeCourseId: CourseId = 'crestfall-gardens';
export function setActiveCourse(id: CourseId) {
 activeCourseId = id;
}
export function getActiveCourse(): CourseId {
 return activeCourseId;
}

export function trackBanking(progress: number, courseId: CourseId = activeCourseId): number {
 const def = courseById(courseId);
 const route = ROUTES[def.id];
 const t = ((progress % 1) + 1) % 1;
 // Reduce lateral banking inside a vertical loop so the loop stays upright
 for (const loop of def.loops) {
  if (Math.abs(t - loop.centerT) < loop.halfWidth * 1.15) return 0;
 }
 const dt = 0.003;
 const t1 = ((t - dt) % 1 + 1) % 1, t2 = (t + dt) % 1;
 const tan1 = route.getTangentAt(t1), tan2 = route.getTangentAt(t2);
 const turn = (tan2.x * tan1.z - tan2.z * tan1.x) / dt;
 return Math.max(-def.maxBank, Math.min(def.maxBank, -turn * def.bankScale));
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

export function jumpFactorAt(progress: number, courseId: CourseId = activeCourseId): number {
 const def = courseById(courseId);
 const t = ((progress % 1) + 1) % 1;
 for (const j of def.jumps) {
  if (t >= j.startT && t <= j.endT) {
   const u = (t - j.startT) / (j.endT - j.startT);
   return Math.sin(u * Math.PI) * j.height;
  }
 }
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

 // Check if t is inside a vertical 360-degree loop-the-loop (Amazon Canopy Loop)
 const lp = loopPitchAt(t, def.id);
 if (lp.inLoop && lp.loop) {
  const loop = lp.loop;
  const u = (t - (loop.centerT - loop.halfWidth)) / (2 * loop.halfWidth);
  const theta = lp.theta; // 0 -> 2*PI
  const baseUp = new T.Vector3().crossVectors(baseTangent, hRight).normalize();

  // Smooth C1 parametric vertical loop + corkscrew lateral separation
  const forwardExcursion = Math.sin(theta) * Math.sin(Math.PI * u) * loop.radius * 1.38;
  const verticalLift = (1 - Math.cos(theta)) * loop.radius;
  const lateralShift = (1 - Math.cos(theta)) * 0.5 * loop.helixOffset;

  const center = baseCenter.clone()
   .addScaledVector(baseTangent, forwardExcursion)
   .addScaledVector(baseUp, verticalLift)
   .addScaledVector(hRight, lateralShift);

  // Rotate tangent and normal a full 360 degrees around hRight
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
