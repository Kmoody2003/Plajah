// Secondary motion for the Rift Realm characters: the wind they feel, which outfit parts swing (the data table), and
// the Void Stalker's bat wings. CharacterRig (characters.ts) builds and updates these; player.ts sets the wing pose.
//
// Wind: the forest map's weather owns the real field (`windAt(p, t)` in the world module, agreed with that session).
// main.ts hands it over with setWindSource(); until then (and in levels without weather) a breeze with gusts stands in.
// `?wind=calm|breeze|strong|storm` (+ `&winddir=deg`) forces the stand-in for testing.
import * as THREE from 'three/webgpu';
import { SoftRegions, softStep as ss, type Joints, type SoftRegionSpec } from '../../../playkit/character/softRegions';
import { BatWings, type BatWingTuning } from '../../../playkit/character/batWings';

// ── wind ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** World air velocity (m/s) at a point; t = sim seconds. */
export type WindFn = (p: { x: number; y: number; z: number }, t: number, out?: THREE.Vector3) => THREE.Vector3;
let source: WindFn | null = null;
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const forced = q.get('wind');
const LEVELS: Record<string, number> = { calm: 0.5, breeze: 3, strong: 10, storm: 16 };
const meanSpeed = LEVELS[forced ?? 'breeze'] ?? (Number(forced) || 3);
const dirRad = ((Number(q.get('winddir')) || 60) * Math.PI) / 180;

/** The weather's wind field (forest map session's `windAt`). Ignored while `?wind=` forces the stand-in. */
export function setWindSource(fn: WindFn | null) { source = fn; }

/** Air velocity at p (m/s): the weather's field, or a gusty breeze. */
export function windAt(p: { x: number; y: number; z: number }, t: number, out = new THREE.Vector3()) {
  if (source && !forced) return source(p, t, out);
  // gusts: two slow beats drifting downwind across the map, 0.7×…1.6× the mean
  const along = p.x * Math.sin(dirRad) + p.z * Math.cos(dirRad);
  const g = 0.5 + 0.5 * Math.sin(t * 0.63 - along * 0.045) * Math.sin(t * 1.71 + p.x * 0.07 - p.z * 0.05);
  const s = meanSpeed * (0.7 + 0.9 * g * g);
  const wob = Math.sin(t * 2.3 + along * 0.2) * 0.12;
  return out.set(Math.sin(dirRad + wob) * s, Math.sin(t * 3.1 + p.z * 0.3) * 0.08 * s, Math.cos(dirRad + wob) * s);
}

// ── outfit regions (the data table) ───────────────────────────────────────────────────────────────────────────
// Bind-space masks per character. Hard armour stays rigid; cloth, hood, pouches and hanging plates swing.
// hz/zeta: the swing's frequency and damping (cloth ~1.5 Hz loose; hanging plates stiffer); inertia: how much of the
// body's acceleration it feels; drag: push per (m/s)² of air past it; max / inward: largest swing / toward the body (m).
const seg = (a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3) => {
  const ab = _s.copy(b).sub(a), t = Math.max(0, Math.min(1, _t.copy(p).sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return ab.multiplyScalar(t).add(a).distanceTo(p);
};
const _s = new THREE.Vector3(), _t = new THREE.Vector3();
const J = (j: Joints, n: string) => j.get(n) ?? new THREE.Vector3();
const legDist = (p: THREE.Vector3, j: Joints) => Math.min(seg(J(j, 'LeftUpLeg'), J(j, 'LeftLeg'), p), seg(J(j, 'RightUpLeg'), J(j, 'RightLeg'), p), seg(J(j, 'LeftLeg'), J(j, 'LeftFoot'), p), seg(J(j, 'RightLeg'), J(j, 'RightFoot'), p));
const handDist = (p: THREE.Vector3, j: Joints) => Math.min(J(j, 'LeftHand').distanceTo(p), J(j, 'RightHand').distanceTo(p));
const armDist = (p: THREE.Vector3, j: Joints) => Math.min(seg(J(j, 'LeftArm'), J(j, 'LeftForeArm'), p), seg(J(j, 'LeftForeArm'), J(j, 'LeftHand'), p), seg(J(j, 'RightArm'), J(j, 'RightForeArm'), p), seg(J(j, 'RightForeArm'), J(j, 'RightHand'), p));

/** The Void Stalker's long coat (four panels so they swing apart), hood and belt pouches. */
const coat = (front: boolean, left: boolean) => (p: THREE.Vector3, j: Joints) => {
  const hip = J(j, 'Hips');
  // from the belt down to the hem (the coat ends above the knee at the front, the tatters a little lower behind)
  const knee = J(j, 'LeftLeg').y;
  const hang = ss(hip.y - 0.04, hip.y - 0.42, p.y) * ss(knee - 0.08, knee + 0.06, p.y);
  if (!hang) return 0;
  const loose = ss(0.105, 0.165, legDist(p, j)) * ss(0.09, 0.15, armDist(p, j)) * ss(0.14, 0.2, handDist(p, j));
  const f = ss(-0.05, 0.08, p.z - hip.z), l = ss(-0.06, 0.06, p.x);
  return hang * loose * (front ? f : 1 - f) * (left ? l : 1 - l);
};
const STALKER: SoftRegionSpec[] = [
  { name: 'coat front L', bone: 'Hips', select: coat(true, true), hz: 1.9, zeta: 0.32, inertia: 0.55, drag: 0.06, max: 0.16, inward: 0.03 },
  { name: 'coat front R', bone: 'Hips', select: coat(true, false), hz: 2.0, zeta: 0.32, inertia: 0.55, drag: 0.06, max: 0.16, inward: 0.03 },
  { name: 'coat back L', bone: 'Hips', select: coat(false, true), hz: 1.6, zeta: 0.28, inertia: 0.6, drag: 0.08, max: 0.22, inward: 0.03 },
  { name: 'coat back R', bone: 'Hips', select: coat(false, false), hz: 1.7, zeta: 0.28, inertia: 0.6, drag: 0.08, max: 0.22, inward: 0.03 },
  {
    name: 'hood', bone: 'Head', hz: 2.6, zeta: 0.3, inertia: 0.6, drag: 0.012, max: 0.06, inward: 0.01,
    select: (p, j) => { const h = J(j, 'Head'); return ss(0.04, 0.17, h.z - p.z) * ss(h.y - 0.02, h.y + 0.16, p.y); },
  },
  {
    name: 'pouches', bone: 'Hips', hz: 3.2, zeta: 0.18, inertia: 0.7, drag: 0.004, max: 0.035, inward: 0.008,
    select: (p, j) => { const h = J(j, 'Hips'); return ss(0.19, 0.23, Math.abs(p.x)) * ss(0.34, 0.29, Math.abs(p.x)) * ss(h.y + 0.12, h.y + 0.04, p.y) * ss(h.y - 0.2, h.y - 0.1, p.y) * ss(0.08, 0.13, armDist(p, j)) * ss(0.15, 0.22, handDist(p, j)); },
  },
];
/** The Robot Paladin: the front tabard plate, hinged tassets at the hips and the rear plate; the rest is plate. */
const tasset = (left: boolean) => (p: THREE.Vector3, j: Joints) => {
  const h = J(j, 'Hips');
  return ss(h.y - 0.02, h.y - 0.36, p.y) * ss(h.y - 0.6, h.y - 0.45, p.y) * ss(0.2, 0.26, left ? p.x : -p.x) * ss(0.42, 0.36, Math.abs(p.x))
    * ss(0.1, 0.14, legDist(p, j)) * ss(0.08, 0.13, armDist(p, j)) * ss(0.15, 0.22, handDist(p, j));
};
const PALADIN: SoftRegionSpec[] = [
  {
    name: 'tabard', bone: 'Hips', hz: 1.35, zeta: 0.3, inertia: 0.85, drag: 0.03, max: 0.14, inward: 0.01,
    select: (p, j) => { const h = J(j, 'Hips'); return ss(h.y - 0.08, h.y - 0.5, p.y) * ss(0.05, 0.11, p.z - h.z) * ss(0.17, 0.09, Math.abs(p.x)); },
  },
  { name: 'tasset L', bone: 'Hips', select: tasset(true), hz: 2.3, zeta: 0.35, inertia: 0.5, drag: 0.008, max: 0.06, inward: 0.005 },
  { name: 'tasset R', bone: 'Hips', select: tasset(false), hz: 2.4, zeta: 0.35, inertia: 0.5, drag: 0.008, max: 0.06, inward: 0.005 },
  {
    name: 'rear plate', bone: 'Hips', hz: 2.5, zeta: 0.35, inertia: 0.45, drag: 0.006, max: 0.04, inward: 0.005,
    select: (p, j) => { const h = J(j, 'Hips'); return ss(h.y - 0.06, h.y - 0.32, p.y) * ss(h.y - 0.62, h.y - 0.5, p.y) * ss(0.07, 0.13, h.z - p.z) * ss(0.2, 0.12, Math.abs(p.x)) * ss(0.09, 0.13, legDist(p, j)); },
  },
];

/** Seraph-9: floating crystal wing-blades (spring-damped hover & sweep) + hovering halo emitter ring on Spine2. */
const SERAPH: SoftRegionSpec[] = [
  {
    name: 'crystal wing L', bone: 'Spine2', hz: 2.2, zeta: 0.34, inertia: 0.72, drag: 0.035, max: 0.14, inward: 0.04,
    select: (p, j) => {
      const sp = J(j, 'Spine2'), hd = J(j, 'Head');
      return ss(0.18, 0.32, p.x) * ss(sp.y - 0.15, sp.y + 0.05, p.y) * ss(hd.y + 0.45, hd.y + 0.25, p.y) * ss(0.05, 0.14, sp.z - p.z);
    },
  },
  {
    name: 'crystal wing R', bone: 'Spine2', hz: 2.25, zeta: 0.34, inertia: 0.72, drag: 0.035, max: 0.14, inward: 0.04,
    select: (p, j) => {
      const sp = J(j, 'Spine2'), hd = J(j, 'Head');
      return ss(0.18, 0.32, -p.x) * ss(sp.y - 0.15, sp.y + 0.05, p.y) * ss(hd.y + 0.45, hd.y + 0.25, p.y) * ss(0.05, 0.14, sp.z - p.z);
    },
  },
  {
    name: 'halo emitter', bone: 'Spine2', hz: 1.8, zeta: 0.42, inertia: 0.5, drag: 0.015, max: 0.06, inward: 0.02,
    select: (p, j) => {
      const hd = J(j, 'Head');
      return ss(hd.y + 0.26, hd.y + 0.36, p.y);
    },
  },
];

/** Sylva (Rootwarden): hanging arm moss/vines and lower frond tendrils sway in the wind and combat turns. */
const SYLVA: SoftRegionSpec[] = [
  {
    name: 'vine L', bone: 'LeftForeArm', hz: 1.85, zeta: 0.30, inertia: 0.65, drag: 0.065, max: 0.16, inward: 0.03,
    select: (p, j) => {
      const f = J(j, 'LeftForeArm'), h = J(j, 'LeftHand');
      return ss(0.18, 0.28, p.x) * ss(f.y + 0.06, f.y - 0.18, p.y) * ss(h.y - 0.34, h.y - 0.04, p.y);
    },
  },
  {
    name: 'vine R', bone: 'RightForeArm', hz: 1.9, zeta: 0.30, inertia: 0.65, drag: 0.065, max: 0.16, inward: 0.03,
    select: (p, j) => {
      const f = J(j, 'RightForeArm'), h = J(j, 'RightHand');
      return ss(0.18, 0.28, -p.x) * ss(f.y + 0.06, f.y - 0.18, p.y) * ss(h.y - 0.34, h.y - 0.04, p.y);
    },
  },
];

/** Pyre (Cinder Smith): heavy leather smith apron swings at the hips over the obsidian greaves. */
const PYRE: SoftRegionSpec[] = [
  {
    name: 'smith apron', bone: 'Hips', hz: 1.5, zeta: 0.36, inertia: 0.78, drag: 0.025, max: 0.12, inward: 0.012,
    select: (p, j) => {
      const h = J(j, 'Hips'), k = J(j, 'LeftLeg');
      return ss(h.y - 0.04, h.y - 0.36, p.y) * ss(k.y - 0.08, k.y + 0.06, p.y) * ss(0.05, 0.14, p.z - h.z) * ss(0.28, 0.16, Math.abs(p.x));
    },
  },
];

/** Flowing rear cloak/cape (Dragon Knight, Valkyrie Templar, Frost-Rune Sorceress, Shadow Assassin coat-tails). */
const CAPE: SoftRegionSpec[] = [
  {
    name: 'cape L', bone: 'Spine2', hz: 1.55, zeta: 0.28, inertia: 0.68, drag: 0.085, max: 0.22, inward: 0.025,
    select: (p, j) => {
      const sp = J(j, 'Spine2'), h = J(j, 'Hips'), k = J(j, 'LeftLeg');
      return ss(sp.y - 0.05, h.y - 0.35, p.y) * ss(k.y - 0.35, k.y - 0.05, p.y)
        * ss(0.06, 0.16, h.z - p.z) * ss(-0.04, 0.06, p.x) * ss(0.08, 0.14, legDist(p, j));
    },
  },
  {
    name: 'cape R', bone: 'Spine2', hz: 1.60, zeta: 0.28, inertia: 0.68, drag: 0.085, max: 0.22, inward: 0.025,
    select: (p, j) => {
      const sp = J(j, 'Spine2'), h = J(j, 'Hips'), k = J(j, 'RightLeg');
      return ss(sp.y - 0.05, h.y - 0.35, p.y) * ss(k.y - 0.35, k.y - 0.05, p.y)
        * ss(0.06, 0.16, h.z - p.z) * ss(-0.04, 0.06, -p.x) * ss(0.08, 0.14, legDist(p, j));
    },
  },
];

/** Articulated feathered/metallic dorsal wings (Fallen Archangel, Cyber Harpy Sentinel) spring-damped on Spine2. */
const FEATHER_WINGS: SoftRegionSpec[] = [
  {
    name: 'wing L', bone: 'Spine2', hz: 1.9, zeta: 0.34, inertia: 0.62, drag: 0.05, max: 0.18, inward: 0.03,
    select: (p, j) => {
      const sp = J(j, 'Spine2');
      return ss(0.24, 0.42, p.x) * ss(0.04, 0.14, sp.z - p.z) * ss(0.10, 0.18, armDist(p, j));
    },
  },
  {
    name: 'wing R', bone: 'Spine2', hz: 1.95, zeta: 0.34, inertia: 0.62, drag: 0.05, max: 0.18, inward: 0.03,
    select: (p, j) => {
      const sp = J(j, 'Spine2');
      return ss(0.24, 0.42, -p.x) * ss(0.04, 0.14, sp.z - p.z) * ss(0.10, 0.18, armDist(p, j));
    },
  },
];

/** Wing tuning for the Void Stalker (see BatWingTuning); the low tier halves the solver work. */
const WINGS: Partial<BatWingTuning> = {};

export type CharacterKind =
  | 'void_stalker' | 'robot_paladin' | 'seraph_9' | 'lumen' | 'sylva' | 'pyre'
  | 'fallen_archangel' | 'cyber_harpy' | 'dragon_knight' | 'female_warrior' | 'sorceress' | 'shadow_assassin'
  | 'other';
export function characterKind(model: THREE.Object3D): CharacterKind {
  let k: CharacterKind = 'other';
  model.traverse((o) => {
    if (o.name === 'void_stalker' || o.name === 'void_stalker_body') k = 'void_stalker';
    else if (k === 'other' && /robot_paladin/.test(o.name)) k = 'robot_paladin';
    else if (k === 'other' && /seraph_9/.test(o.name)) k = 'seraph_9';
    else if (k === 'other' && /lumen/.test(o.name)) k = 'lumen';
    else if (k === 'other' && /sylva/.test(o.name)) k = 'sylva';
    else if (k === 'other' && /pyre_knight/.test(o.name)) k = 'other';
    else if (k === 'other' && /\bpyre\b|^pyre/.test(o.name)) k = 'pyre';
    else if (k === 'other' && /fallen_archangel/.test(o.name)) k = 'fallen_archangel';
    else if (k === 'other' && /cyber_harpy/.test(o.name)) k = 'cyber_harpy';
    else if (k === 'other' && /dragon_knight/.test(o.name)) k = 'dragon_knight';
    else if (k === 'other' && /female_warrior/.test(o.name)) k = 'female_warrior';
    else if (k === 'other' && /sorceress/.test(o.name)) k = 'sorceress';
    else if (k === 'other' && /shadow_assassin/.test(o.name)) k = 'shadow_assassin';
  });
  return k;
}

let tier: 'low' | 'high' = q.get('q') === 'low' ? 'low' : 'high';
/** main.ts passes the GPU tier: the low tier (Intel iGPU) runs the wing cloth lighter. Call before characters spawn. */
export function setSecondaryTier(t: 'low' | 'high') { tier = t; }
const lowTier = () => tier === 'low';

/** `?soft=0` turns the outfit swing off, `?wings=0` leaves the cloak rigid (A/B checks). */
export function buildSecondary(model: THREE.Object3D, opts: { wings?: boolean } = {}) {
  const kind = characterKind(model);
  const specs = kind === 'void_stalker' ? STALKER
    : kind === 'robot_paladin' ? PALADIN
    : kind === 'seraph_9' ? SERAPH
    : kind === 'sylva' ? SYLVA
    : kind === 'pyre' ? PYRE
    : (kind === 'fallen_archangel' || kind === 'cyber_harpy') ? FEATHER_WINGS
    : (kind === 'dragon_knight' || kind === 'female_warrior' || kind === 'sorceress' || kind === 'shadow_assassin') ? CAPE
    : [];
  // wings first: they split the cloak off the body mesh (a cloned geometry), then the outfit masks go on that body
  const wantWings = (opts.wings ?? kind === 'void_stalker') && q.get('wings') !== '0';
  const wings = wantWings ? BatWings.create(model, { tuning: { ...WINGS, ...(lowTier() ? { maxSubsteps: 2, iterations: 1, spacing: 0.085, normalsEvery: 2 } : {}) } }) : null;
  const soft = q.get('soft') === '0' ? null : SoftRegions.create(model, specs);
  return { kind, soft, wings };
}
