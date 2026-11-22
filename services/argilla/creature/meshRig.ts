/**
 * meshRig.ts — the Character Forge's rig for a mesh it didn't build: an image-to-3D shell (Hunyuan, a turnaround
 * build) or a creator's own model gets the Forge's human skeleton, skin weights and runtime extras, so it plays in
 * every playkit game exactly like a Forge character (forgeRig.ts: twist drivers, hand grips, capsules, springs).
 *
 *   1. Fit: the Forge anatomy (human.ts: contract joints + three-joint fingers and thumb, twist joints, eyes) is laid
 *      onto anchors the mesh already has — the 22 contract joints of its current rig. Every Forge joint the anchors
 *      don't name (fingers, twists, eyes) follows the nearest anchored segment (turned, scaled and moved with it),
 *      and bone radii scale with their segment.
 *   2. Weights: humanSkinWeights, the Forge's own pass (a bone claims a vertex only through the solid, the twist
 *      joints take their share along the limb, the head is held rigid), on a solid field voxelised from the mesh.
 *      Rigid extra parts (weapons, a wing cloak: every piece apart from the body) keep a single bone.
 *   3. Extras: twists, grips (relaxed / fist / katana / dagger, from the fitted fingers), capsules, sockets
 *      (hand_r_weapon, hand_l_weapon at the Forge grip; back_weapon on the back).
 * The result is a ForgeCharacter for exportCreature.forgeToGlb.
 */
import type { Vec3 } from '../engine';
import { HUMAN_JOINTS, PARENT, TWIST_JOINTS, buildHumanAnatomy, qaxis, type HumanAnatomy, type HumanBone, type HumanJoint, type HumanTune } from './human';
import { humanSkinWeights } from './humanFinish';
import type { ForgeBone, ForgeCharacter, ForgeSocket } from './exportCreature';
import type { GMaterial, GPrim } from './gltfWriter';

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1));
const D2R = Math.PI / 180;

/** Rotation taking unit u onto unit v, as a function (Rodrigues; the shortest turn). */
function turn(u: Vec3, v: Vec3): (p: Vec3) => Vec3 {
  const c = dot(u, v), k = cross(u, v), s = len(k);
  if (s < 1e-8) return c > 0 ? (p) => p : (p) => mul(p, -1);
  const ax = mul(k, 1 / s), a = Math.atan2(s, c);
  const cs = Math.cos(a), sn = Math.sin(a);
  return (p) => add(add(mul(p, cs), mul(cross(ax, p), sn)), mul(ax, dot(ax, p) * (1 - cs)));
}

/** The contract joints an imported rig names, and the child that sets each one's direction (its segment). */
export const CONTRACT_SEGMENT: Partial<Record<HumanJoint, [HumanJoint, HumanJoint]>> = {
  Hips: ['Hips', 'Spine'], Spine: ['Spine', 'Spine1'], Spine1: ['Spine1', 'Spine2'], Spine2: ['Spine2', 'Neck'],
  Neck: ['Neck', 'Head'], Head: ['Neck', 'Head'],
  ...Object.fromEntries((['Left', 'Right'] as const).flatMap((s) => [
    [`${s}Shoulder`, [`${s}Shoulder`, `${s}Arm`]], [`${s}Arm`, [`${s}Arm`, `${s}ForeArm`]],
    [`${s}ForeArm`, [`${s}ForeArm`, `${s}Hand`]], [`${s}Hand`, [`${s}ForeArm`, `${s}Hand`]],
    [`${s}UpLeg`, [`${s}UpLeg`, `${s}Leg`]], [`${s}Leg`, [`${s}Leg`, `${s}Foot`]],
    [`${s}Foot`, [`${s}Foot`, `${s}ToeBase`]], [`${s}ToeBase`, [`${s}Foot`, `${s}ToeBase`]],
  ])),
} as Partial<Record<HumanJoint, [HumanJoint, HumanJoint]>>;

/**
 * Lay a Forge anatomy onto a mesh's anchors (contract joint positions, rest pose, the mesh's space). Returns an
 * anatomy whose bones, capsules and grips sit in the mesh. `tune` sets the starting proportions (height from the mesh).
 */
export function fitAnatomyToAnchors(anchors: Partial<Record<HumanJoint, Vec3>>, tune: HumanTune): HumanAnatomy {
  const a = buildHumanAnatomy(tune);
  const A = (n: HumanJoint) => a.byName[n].at;
  const anchored = (n: HumanJoint) => !!anchors[n] && !!CONTRACT_SEGMENT[n] && !!anchors[CONTRACT_SEGMENT[n]![0]] && !!anchors[CONTRACT_SEGMENT[n]![1]];
  // per anchored joint: x → anchor + s·R(x − anatomy joint)
  const xf = new Map<HumanJoint, { R: (p: Vec3) => Vec3; s: number }>();
  for (const n of HUMAN_JOINTS) {
    if (!anchored(n)) continue;
    const [p, c] = CONTRACT_SEGMENT[n]!;
    const da = sub(A(c), A(p)), dm = sub(anchors[c]!, anchors[p]!);
    xf.set(n, { R: turn(norm(da), norm(dm)), s: len(dm) / (len(da) || 1) });
  }
  const anchorOf = (n: HumanJoint): HumanJoint => { let j: HumanJoint | null = n; while (j && !xf.has(j)) j = PARENT[j]; return j ?? 'Hips'; };
  const map = (n: HumanJoint, p: Vec3) => { const k = anchorOf(n), t = xf.get(k); return t ? add(anchors[k]!, mul(t.R(sub(p, A(k))), t.s)) : p; };
  const scaleOf = (n: HumanJoint) => xf.get(anchorOf(n))?.s ?? 1;
  const at = new Map<HumanJoint, Vec3>();
  for (const n of HUMAN_JOINTS) at.set(n, xf.has(n) ? anchors[n]! : map(n, A(n)));
  const bones: HumanBone[] = a.bones.map((b) => {
    const n = b.name as HumanJoint;
    const seg = CONTRACT_SEGMENT[n];
    // a chained contract bone ends on its mapped child; anything else carries its tip with its own segment
    const tip = seg && seg[0] === n && at.has(seg[1]) ? at.get(seg[1])! : map(n, b.tip);
    return { ...b, at: at.get(n)!, tip, radius: b.radius * scaleOf(n) };
  });
  const byName = Object.fromEntries(bones.map((b) => [b.name, b])) as HumanAnatomy['byName'];
  const capsules = a.capsules.map((c) => ({ ...c, a: map(c.bone, c.a), b: map(c.bone, c.b), r: c.r * scaleOf(c.bone) }));
  const grip = Object.fromEntries((['Left', 'Right'] as const).map((s) => {
    const g = a.grip[s], R = xf.get(anchorOf(`${s}Hand` as HumanJoint))?.R ?? ((p: Vec3) => p);
    return [s, { at: map(`${s}Hand` as HumanJoint, g.at), axis: norm(R(g.axis)), palm: norm(R(g.palm)) }];
  })) as HumanAnatomy['grip'];
  return { ...a, bones, byName, capsules, grip };
}

/**
 * A solid field for a closed-ish shell (what image-to-3D gives): triangles rasterised into a voxel grid, the outside
 * flood-filled from the border, the rest is solid. d < 0 inside, > 0 outside (a step, not a distance: the Forge's
 * weight pass only asks "is this point in the body").
 */
export function solidField(positions: Float32Array, indices: ArrayLike<number>, cell = 0.012) {
  let lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], positions[i + c]); hi[c] = Math.max(hi[c], positions[i + c]); }
  lo = sub(lo, [cell * 2, cell * 2, cell * 2]); hi = add(hi, [cell * 2, cell * 2, cell * 2]);
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
  const g = new Uint8Array(nx * ny * nz); // 1 = surface, 2 = outside
  const id = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  const P = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let t = 0; t < indices.length; t += 3) {
    const a = P(indices[t]), b = P(indices[t + 1]), c = P(indices[t + 2]);
    const m = Math.max(len(sub(a, b)), len(sub(b, c)), len(sub(c, a)));
    const steps = Math.max(1, Math.ceil(m / (cell * 0.5)));
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
      const u = i / steps, v = j / steps, p = add(add(mul(a, 1 - u - v), mul(b, u)), mul(c, v));
      g[id(Math.floor((p[0] - lo[0]) / cell), Math.floor((p[1] - lo[1]) / cell), Math.floor((p[2] - lo[2]) / cell))] = 1;
    }
  }
  const stack: number[] = [id(0, 0, 0)]; g[id(0, 0, 0)] = 2;
  while (stack.length) {
    const k = stack.pop()!, x = k % nx, y = Math.floor(k / nx) % ny, z = Math.floor(k / (nx * ny));
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
      const q = id(X, Y, Z); if (g[q]) continue;
      g[q] = 2; stack.push(q);
    }
  }
  const d = (x: number, y: number, z: number) => {
    const X = Math.floor((x - lo[0]) / cell), Y = Math.floor((y - lo[1]) / cell), Z = Math.floor((z - lo[2]) / cell);
    if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) return 1;
    return g[id(X, Y, Z)] === 2 ? 0.05 : -0.01;
  };
  let solid = 0; for (let i = 0; i < g.length; i++) if (g[i] !== 2) solid++;
  return { d, solidShare: solid / g.length };
}

/** Hand poses as local finger rotations (rest orientation identity), from the fitted fingers and palm. */
export function handGrips(a: HumanAnatomy, extra: Record<string, Record<string, [number, number, number]>> = {}) {
  const POSES: Record<string, Record<string, [number, number, number]>> = {
    katana: { Thumb: [18, 32, 28], Index: [48, 72, 42], Middle: [58, 80, 44], Ring: [64, 84, 44], Pinky: [70, 86, 44] },
    fist: { Thumb: [26, 44, 38], Index: [86, 96, 62], Middle: [88, 98, 62], Ring: [90, 98, 60], Pinky: [92, 98, 58] },
    relaxed: { Thumb: [6, 10, 8], Index: [12, 18, 10], Middle: [16, 22, 12], Ring: [20, 26, 14], Pinky: [24, 30, 16] },
    // a reverse- or forward-held dagger / pistol grip: fingers closed round a thin handle, index a little open
    dagger: { Thumb: [22, 40, 34], Index: [66, 84, 52], Middle: [80, 92, 58], Ring: [84, 94, 58], Pinky: [88, 96, 56] },
    ...extra,
  };
  const out: Record<string, Record<string, [number, number, number, number]>> = {};
  for (const s of ['Left', 'Right'] as const) {
    const palm = a.grip[s].palm;
    for (const [pose, fingers] of Object.entries(POSES)) {
      const g: Record<string, [number, number, number, number]> = {};
      for (const [f, angles] of Object.entries(fingers)) {
        const j1 = a.byName[`${s}Hand${f}1` as HumanJoint];
        const axis = norm(cross(norm(sub(j1.tip, j1.at)), palm));
        angles.forEach((deg, k) => { g[`${s}Hand${f}${k + 1}`] = qaxis(axis, deg * D2R); });
      }
      out[`${s}:${pose}`] = g;
    }
  }
  return out;
}

/** Quaternion [x, y, z, w] of the frame whose columns are x, y, z (orthonormal). */
function quatOfBasis(x: Vec3, y: Vec3, z: Vec3): [number, number, number, number] {
  const m00 = x[0], m11 = y[1], m22 = z[2], t = m00 + m11 + m22;
  let q: number[];
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s]; }
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export interface ImportedMesh {
  positions: Float32Array; normals: Float32Array; uvs?: Float32Array; indices: Uint32Array;
  /** Vertices that belong to rigid extra parts, with the contract bone each was bound to. */
  rigid?: { vertex: Int32Array; bone: HumanJoint[] };
}

export interface MeshRigOptions {
  name: string;
  anchors: Partial<Record<HumanJoint, Vec3>>;
  tune?: Partial<HumanTune>;
  materials: GMaterial[];
  images: (Uint8Array | { bytes: Uint8Array; mime: string })[];
  /** Default grip per hand (a pose name from handGrips). */
  hold?: { Left?: string; Right?: string };
  /** Free-form tags written beside the rig (where the mesh came from). */
  source?: Record<string, unknown>;
}

/** Rig an imported mesh with the Forge: returns the ForgeCharacter (for forgeToGlb) and a short report. */
export function rigImportedMesh(mesh: ImportedMesh, o: MeshRigOptions): { character: ForgeCharacter; report: Record<string, unknown> } {
  let top = -Infinity, bottom = Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) { top = Math.max(top, mesh.positions[i]); bottom = Math.min(bottom, mesh.positions[i]); }
  const tune: HumanTune = { height: top - bottom, build: 1, musculature: 0.6, weight: 0.2, age: 30, ...o.tune } as HumanTune;
  const anatomy = fitAnatomyToAnchors(o.anchors, tune);
  const field = solidField(mesh.positions, mesh.indices);
  const { skinIndex, skinWeight } = humanSkinWeights(
    { positions: mesh.positions, normals: mesh.normals, indices: mesh.indices }, anatomy, field as unknown as Parameters<typeof humanSkinWeights>[2]);
  if (mesh.rigid) {
    for (let k = 0; k < mesh.rigid.vertex.length; k++) {
      const v = mesh.rigid.vertex[k], j = HUMAN_JOINTS.indexOf(mesh.rigid.bone[k]);
      if (j < 0) continue;
      skinIndex.set([j, 0, 0, 0], v * 4); skinWeight.set([1, 0, 0, 0], v * 4);
    }
  }
  const joints = new Uint16Array(skinIndex), weights = new Float32Array(skinWeight);
  const prim: GPrim = { positions: mesh.positions, normals: mesh.normals, uvs: mesh.uvs, indices: mesh.indices, joints, weights, material: 0 };
  const bones: ForgeBone[] = HUMAN_JOINTS.map((n) => ({ name: n, parent: PARENT[n], at: anatomy.byName[n].at }));
  const relCaps = anatomy.capsules.map((c) => ({ bone: c.bone, a: sub(c.a, anatomy.byName[c.bone].at), b: sub(c.b, anatomy.byName[c.bone].at), r: c.r }));
  // sockets: the Forge grip (palm centre; +Z along the handle axis through the fingers turned to point forward of the
  // fist, +Y toward the thumb side) and a back mount
  const sockets: ForgeSocket[] = (['Right', 'Left'] as const).map((s) => {
    const g = anatomy.grip[s];
    const fwd = norm(sub(anatomy.byName[`${s}Hand` as HumanJoint].tip, anatomy.byName[`${s}Hand` as HumanJoint].at));
    const y = norm(sub(g.axis, mul(fwd, dot(g.axis, fwd)))), x = cross(y, fwd);
    return { name: s === 'Right' ? 'hand_r_weapon' : 'hand_l_weapon', bone: `${s}Hand`, at: g.at, rotation: quatOfBasis(x, y, fwd), meshes: [] };
  });
  const s2 = anatomy.byName.Spine2;
  let back = Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (Math.abs(mesh.positions[i + 1] - s2.at[1]) < 0.06 && Math.abs(mesh.positions[i] - s2.at[0]) < 0.1 ) back = Math.min(back, mesh.positions[i + 2]);
  }
  sockets.push({ name: 'back_weapon', bone: 'Spine2', at: [s2.at[0], s2.at[1], (Number.isFinite(back) ? back : s2.at[2] - 0.15) - 0.02], rotation: quatOfBasis([1, 0, 0], [0, 0, -1], [0, -1, 0]), meshes: [] });
  const extras = {
    forge: {
      version: 1, height: tune.height,
      springs: [], cloth: [], capsules: relCaps, drivers: [],
      twists: Object.entries(TWIST_JOINTS).map(([bone, t]) => ({ bone, driver: t.driver, share: t.share, axis: norm(sub(anatomy.byName[t.parent as HumanJoint].tip, anatomy.byName[t.parent as HumanJoint].at)) })),
      grips: handGrips(anatomy),
      hold: { Right: `Right:${o.hold?.Right ?? 'relaxed'}`, Left: `Left:${o.hold?.Left ?? 'relaxed'}` },
      rigFrom: { kind: 'imported-mesh', ...o.source },
    },
  };
  const character: ForgeCharacter = {
    name: o.name, bones, sockets,
    skinned: [{ name: `${o.name}_body`, prims: [prim] }],
    rigid: [], materials: o.materials, images: o.images as ForgeCharacter['images'], extras,
  };
  return { character, report: { joints: bones.length, solidShare: +field.solidShare.toFixed(3), height: +tune.height.toFixed(3), rigidVerts: mesh.rigid?.vertex.length ?? 0 } };
}
