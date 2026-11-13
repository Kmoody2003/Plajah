/**
 * forgeArms.ts — the arms the context stage resolved (context.json), built and fitted to the body.
 *
 * Build reads this to make the sword in the hand and the sword in the obi from the same koshirae (koshirae.ts), to wear
 * it as the codex says (edge up or down, the kurikata on the omote face, away from the body), and to give it the
 * behaviour the codex records: the scabbard pinned at the obi and swinging a few degrees about it, the sageo's free
 * ends hanging and swinging as cords. The kit exports the same build for every arm the character owns.
 */
import fs from 'node:fs';
import type { Vec3 } from '../../services/argilla/engine';
import { MeshBuilder, tube } from '../../services/argilla/creature/wardrobe';
import { nihontoKoshirae, type Koshirae, type NihontoDims, type NihontoFeatures } from '../../services/argilla/creature/koshirae';
import { armsLook, type ArmLook } from './forgeArmsLook';
import { dataFile } from './forgeSpec';

export interface ContextArm {
  id: string; label: string; role: 'worn' | 'kit' | 'implied'; builder: string; period: string; why: string;
  dims: NihontoDims & Record<string, number>; features: NihontoFeatures; colours: ArmLook['colours'];
  materials: ArmLook['materials']; carry: { how: string; side: string; edge: 'up' | 'down' | 'none'; downDeg: [number, number, number]; tie?: string };
  behaviour: { physics: { swingDeg: number; stiffness: number; drag: number } };
  notes: string[];
}
export interface ForgeContext { recognised: Record<string, { id: string; confidence: number }>; bearing: Record<string, unknown>; body: { bounds: Record<string, [number, number, number]> }; arms: (ContextArm | { id: string; missing: true })[]; [k: string]: unknown }

export function loadContext(): ForgeContext | null {
  const f = dataFile('context.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
const built = (c: ForgeContext | null) => (c?.arms ?? []).filter((a): a is ContextArm => !('missing' in a) && a.builder === 'nihonto');

/** The sword the character wears (the turnaround shows it), or the codex's typical uchigatana without a context. */
export function wornSword(ctx: ForgeContext | null): ContextArm | null {
  return built(ctx).find((a) => a.role === 'worn') ?? null;
}
export function ownedArms(ctx: ForgeContext | null): ContextArm[] { return built(ctx); }

const TYPICAL: NihontoDims = { nagasa: 0.7, sori: 0.016, motohaba: 0.031, sakihaba: 0.022, kasane: 0.0072, kissaki: 0.036, tsuka: 0.25, tsuba: 0.078, saya: 0.76 };
export function buildArm(arm: ContextArm | null): Koshirae { return nihontoKoshirae(arm?.dims ?? TYPICAL, arm?.features ?? { bohi: false, hamon: 'notare' }); }

export function lookOf(arm: ContextArm | null) {
  if (!arm) return null;
  return armsLook({ colours: arm.colours, features: arm.features, materials: arm.materials, dims: arm.dims });
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];

/**
 * Wear it as the record says. Returns the socket's corrected basis and whether the scabbard is to be mirrored so its
 * kurikata (built on +z) faces away from the body (the omote, the side the world sees).
 */
export function wear(arm: ContextArm | null, s: { at: Vec3; x: Vec3; y: Vec3 }, hipCentre: Vec3, notes: string[]) {
  let x = s.x;
  const edge = arm?.carry.edge ?? 'up';
  if ((edge === 'up' && x[1] < 0) || (edge === 'down' && x[1] > 0)) { x = neg(x); notes.push(`turned the ${arm?.id ?? 'sword'} edge-${edge}, as it is worn`); }
  const z = cross(x, s.y);
  const out: Vec3 = [s.at[0] - hipCentre[0], 0, s.at[2] - hipCentre[2]];
  const mirror = dot(z, out) < 0;
  return { x, y: s.y, z: mirror ? neg(z) : z, mirror };
}

/** A point in socket space → world (rest). */
export const toWorld = (at: Vec3, x: Vec3, y: Vec3, z: Vec3, p: Vec3): Vec3 => [
  at[0] + x[0] * p[0] + y[0] * p[1] + z[0] * p[2],
  at[1] + x[1] * p[0] + y[1] * p[1] + z[1] * p[2],
  at[2] + x[2] * p[0] + y[2] * p[1] + z[2] * p[2],
];

/**
 * The behaviour: a pivot bone at the obi with the scabbard's far end as its child (a two-bone spring the codex's swing
 * limit holds), and the sageo's free ends as cords hanging from the knot under gravity.
 */
export function armsRig(arm: ContextArm | null, k: Koshirae, sock: { at: Vec3; x: Vec3; y: Vec3; z: Vec3 }, parent: string) {
  const ph = arm?.behaviour.physics ?? { swingDeg: 7, stiffness: 40, drag: 0.35 };
  const bones: { name: string; parent: string; at: Vec3 }[] = [
    { name: 'SayaPivot', parent, at: sock.at },
    { name: 'SayaEnd', parent: 'SayaPivot', at: toWorld(sock.at, sock.x, sock.y, sock.z, k.kojiri) },
  ];
  const springs = [{ bones: ['SayaPivot', 'SayaEnd'], stiffness: ph.stiffness, drag: ph.drag, gravity: 2, radius: 0.022, maxAngle: ph.swingDeg }];
  const cord = new MeshBuilder();
  k.sageoEnds.forEach((e, i) => {
    const top = toWorld(sock.at, sock.x, sock.y, sock.z, e);
    const n = 4, segL = 0.038, chain: string[] = [], pts: Vec3[] = [];
    for (let j = 0; j < n; j++) {
      const name = `Sageo${i}_${j}`;
      const at: Vec3 = [top[0] + (i ? 0.004 : -0.004) * j, top[1] - j * segL, top[2] + 0.003 * j];
      bones.push({ name, parent: j ? `Sageo${i}_${j - 1}` : 'SayaPivot', at });
      chain.push(name); pts.push(at);
    }
    pts.push([pts[n - 1][0], pts[n - 1][1] - segL, pts[n - 1][2]]);
    // the cord's end: a flat braid, frayed into a short tassel
    tube(cord, pts, (t) => 0.0032 * (t > 0.92 ? 1.6 : 1), 6, (t) => chain[Math.min(n - 1, Math.floor(t * n))], 0.45);
    springs.push({ bones: chain, stiffness: 7, drag: 0.12, gravity: 9.8, radius: 0.012, maxAngle: 70 });
  });
  return { bones, springs, cord };
}
