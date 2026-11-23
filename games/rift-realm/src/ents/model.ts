// Vesselbound (Rift Realm) — the tree ent's body, grown with the vegetation tree generator (services/vegetation/trees).
//
// Placeholder until Kenne's Flow character sheets arrive (then it is rebuilt to the sheets and scored, ≥95 %).
// A walking guardian about 46 m tall: a furrowed, gnarled trunk for a torso, branch limbs, root-splay feet, a burl head
// with two sap-lit knot eyes, a living crown on the head, small living trees on its shoulders and back, giant flowers
// and long moss hanging like hair and beard.
//
// Every wood part is a hand-laid TreeSkeleton (trunk nodes, twig and finger branches, root toes) put through the same
// mesher and bark/leaf materials as the forest's trees, so it reads as "one of the trees" until it moves. Parts are
// rigid (wood doesn't bend): each limb segment is its own mesh, oriented between two joints by ent.ts every frame.
// The joints carry the Character Forge contract names (Hips, Spine2, Neck, Head, LeftUpLeg/LeftLeg/LeftFoot,
// LeftArm/LeftForeArm/LeftHand …) so the sheet-built, meshRig-skinned model can drop into the same poses later.
import * as THREE from 'three/webgpu';
import { color, float, mix, positionLocal, sin, smoothstep, time, uv, attribute, vec3, max } from 'three/tsl';
import { growTree, rng, type TreeLeaf, type TreeNode, type TreeSkeleton } from '../../../../services/vegetation/trees/grow';
import { buildTreeGeometry } from '../../../../services/vegetation/trees/mesh';
import { treeMaterials, type TreeMaterials } from '../../../../services/vegetation/trees/material';
import type { TreeSpecies } from '../../../../services/vegetation/species';
import { CF_BLUE, CF_PLATFORM_OAK, CF_VIOLET } from '../../../../services/vegetation/catalog/cyberForest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Body measurements (metres). Root-local: +Z forward, +Y up, the character's left at +X. */
export const ENT = {
  hipY: 18.4, hipX: 3.5,
  thigh: 9.8, shin: 9.5, ankleY: 1.5,
  /** Pelvis-local: the torso rises from the hips; shoulders and head sit on it. */
  torso: 13.4, shoulderY: 11.6, shoulderX: 6.6,
  upperArm: 9.6, foreArm: 9.4, finger: 4.6,
  neckY: 13.2, headY: 15.6, headLen: 5.0, headZ: 1.5,
  crownH: 11.5,
} as const;

/** The ent's own wood: old warm bark, deep moss, gold sap light in the veins (the forest's trees run cyan). */
const BARK = '/games/rift-realm/assets/cyberforest/bark_albedo.jpg';
const BARK_N = '/games/rift-realm/assets/cyberforest/bark_normal.jpg';
const VEINS = '/games/rift-realm/assets/cyberforest/conduit_albedo.jpg';
export const ENT_WOOD: TreeSpecies = {
  kind: 'tree', id: 'ent-wood', name: 'Ent heartwood', height: 46,
  trunk: { crownBase: 0.5, radius: 3.6, flare: 1, lean: 0, wobble: 0.4, twist: 0.2, roots: 0, rootReach: 1, furrow: 0.12, gnarl: 0.2, buttress: 0 },
  crown: { profile: [{ y: 0, r: 0.1 }, { y: 1, r: 0.1 }], depthScale: 1, attractors: 0, kill: 1, influence: 1, step: 1, gravitropism: 0 },
  branches: { pipe: 2.3, tipRadius: 0.05 },
  leaves: { atlas: '/vegetation/leaves/cf_oak.webp', cells: [4, 4], perTip: 3, size: 2.6, sizeJitter: 0.3, tint: 0xc8e6a8, transmission: 0x4a8a30, glow: { color: 0xffd27a, strength: 0.12, beat: 0.15 } },
  bark: { map: BARK, normal: BARK_N, tint: 0x6e5a48, veins: { map: VEINS, color: 0xffc45a, strength: 0.5 }, moss: { color: 0x58842e, amount: 0.95 } },
  wind: { trunk: 0, branch: 0.35, flutter: 0.6 },
  provenance: { art: ['placeholder until the Flow ent character sheets arrive'] },
};
/** The crown it wears: a broad domed oak growing out of the top of its head. */
export const ENT_CROWN: TreeSpecies = {
  ...CF_PLATFORM_OAK, id: 'ent-crown', name: 'Ent crown', height: ENT.crownH,
  trunk: { crownBase: 0.18, radius: 1.5, flare: 1, lean: 0, wobble: 0.3, twist: 0.3, roots: 0, rootReach: 1, furrow: 0.1, gnarl: 0.15 },
  crown: {
    profile: [{ y: 0.15, r: 0.2 }, { y: 0.3, r: 0.48 }, { y: 0.5, r: 0.58 }, { y: 0.7, r: 0.52 }, { y: 0.86, r: 0.36 }, { y: 1, r: 0.06 }],
    depthScale: 0.9, attractors: 650, kill: 0.9, influence: 3.6, step: 0.7, gravitropism: 0.1, limbs: 6,
  },
  leaves: { ...ENT_WOOD.leaves, size: 2.9, perTip: 3, tint: 0xb4dc98 },
  bark: ENT_WOOD.bark,
  wind: { trunk: 0.02, branch: 0.4, flutter: 0.7 },
};

export interface EntSeg {
  /** The joint the segment hangs from (or rises from) and the one it reaches. */
  name: string;
  group: THREE.Group;
  len: number;
}

export interface EntModel {
  root: THREE.Group;
  /** Torso, yoke, neck, head, crown, shoulder trees: one rigid upper body on the pelvis. */
  pelvis: THREE.Group;
  head: THREE.Group;
  segs: Record<'LeftUpLeg' | 'LeftLeg' | 'RightUpLeg' | 'RightLeg' | 'LeftArm' | 'LeftForeArm' | 'RightArm' | 'RightForeArm', EntSeg>;
  feet: { Left: THREE.Group; Right: THREE.Group };
  /** Near-only meshes (flowers, moss, limb leaves, the small trees): hidden at mid range. */
  detail: THREE.Object3D[];
  /** Everything the ent draws (for the impostor bake and compile). */
  meshes: THREE.Mesh[];
  eyes: THREE.MeshBasicNodeMaterial;
  /** 0…1: how lit the eyes and veins are (awake). */
  wake: { value: number };
  dispose(): void;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A hand-laid branch skeleton: a gnarled, tapering limb along ±Y with twigs, fingers or root toes. */
interface LimbSpec {
  len: number; r0: number; r1: number; seed: number;
  /** +1 rises along +Y (torso, neck, head), −1 hangs along −Y (legs, arms). */
  dir: 1 | -1;
  /** Extend past both joints so neighbouring segments overlap (no gap at the knee). */
  overlap?: number;
  wobble?: number;
  twigs?: number; twigLen?: [number, number]; twigUp?: number;
  leaves?: number;
  fingers?: number;
  roots?: number;
  /** Where on the limb twigs may start (0 base … 1 tip). */
  twigFrom?: number; twigTo?: number;
}

function limbSkeleton(s: LimbSpec): TreeSkeleton {
  const R = rng(s.seed * 131 + 7);
  const nodes: TreeNode[] = [], leaves: TreeLeaf[] = [];
  const add = (x: number, y: number, z: number, parent: number, radius: number, order: number, branchRoot: number, root = false) => {
    const p = parent >= 0 ? nodes[parent] : null;
    nodes.push({ x, y, z, parent, children: [], radius, order, branchRoot, dist: p ? p.dist + Math.hypot(x - p.x, y - p.y, z - p.z) : 0, root });
    if (p) p.children.push(nodes.length - 1);
    return nodes.length - 1;
  };
  const ov = s.overlap ?? Math.min(s.r0, s.r1) * 0.6, d = s.dir, wob = s.wobble ?? 0.35;
  const steps = Math.max(3, Math.round((s.len + ov * 2) / 1.3));
  const trunk: number[] = [];
  let prev = -1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, y = (-ov + (s.len + ov * 2) * t) * d;
    const w = Math.sin(t * Math.PI) * wob;
    const x = Math.sin(t * 5.3 + s.seed) * w * 0.6, z = Math.cos(t * 4.1 + s.seed * 1.7) * w * 0.6;
    const r = s.r0 + (s.r1 - s.r0) * Math.min(1, Math.max(0, (t * (s.len + ov * 2) - ov) / s.len));
    prev = add(x, y, z, prev, r, 0, 0);
    trunk.push(prev);
  }
  const leafAt = (n: number, outx: number, outy: number, outz: number, k: number) => {
    const nd = nodes[n];
    for (let j = 0; j < k; j++) {
      const l = Math.hypot(outx, outy, outz) || 1;
      leaves.push({
        x: nd.x + (R() - 0.5) * 1.6, y: nd.y + (R() - 0.5) * 1.2, z: nd.z + (R() - 0.5) * 1.6,
        nx: outx / l + (R() - 0.5) * 0.5, ny: outy / l + (R() - 0.5) * 0.5, nz: outz / l + (R() - 0.5) * 0.5,
        node: n, size: ENT_WOOD.leaves.size * (0.75 + R() * 0.5), cell: Math.floor(R() * 16), phase: R(), roll: R() * Math.PI * 2,
      });
    }
  };
  const branch = (from: number, dx: number, dy: number, dz: number, L: number, r0: number, order: number, curl: number, leafK: number, root = false, sinkTo?: number) => {
    const nSteps = Math.max(2, Math.round(L / 1.1));
    let x = nodes[from].x, y = nodes[from].y, z = nodes[from].z, p = from, br = -1;
    let ux = dx, uy = dy, uz = dz;
    for (let k = 1; k <= nSteps; k++) {
      const t = k / nSteps;
      // twigs turn up toward the light; fingers curl toward the palm (+Z); toes sink to the ground
      if (root && sinkTo !== undefined) uy = Math.min(uy, ((sinkTo - y) / Math.max(1, (nSteps - k + 1) * 1.1)));
      else { uy += curl === 0 ? 0.12 : 0; uz += curl; }
      const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
      ux += (R() - 0.5) * 0.18; uz += (R() - 0.5) * 0.18;
      x += ux * (L / nSteps); y += uy * (L / nSteps); z += uz * (L / nSteps);
      p = add(x, y, z, p, Math.max(ENT_WOOD.branches.tipRadius, r0 * (1 - t * 0.78)), order, from, root);
      if (br < 0) br = p;
      if (leafK && (k === nSteps || (k > nSteps / 2 && R() < 0.5))) leafAt(p, ux, uy + 0.4, uz, leafK);
    }
    return p;
  };
  // twigs: from the limb's surface, outward and upward
  for (let i = 0; i < (s.twigs ?? 0); i++) {
    const f = (s.twigFrom ?? 0.15) + R() * ((s.twigTo ?? 0.9) - (s.twigFrom ?? 0.15));
    const at = trunk[Math.min(trunk.length - 1, Math.round(f * (trunk.length - 1)))];
    const a = R() * Math.PI * 2, out = [Math.cos(a), Math.sin(a)];
    const [L0, L1] = s.twigLen ?? [2, 5];
    branch(at, out[0], (s.twigUp ?? 0.4) + R() * 0.3, out[1], L0 + R() * (L1 - L0), Math.max(0.18, nodes[at].radius * 0.22), 1, 0, s.leaves ?? 0);
  }
  // fingers: root-like, splaying from the wrist and curling to the palm
  const end = trunk[trunk.length - 1];
  for (let i = 0; i < (s.fingers ?? 0); i++) {
    const thumb = i === (s.fingers ?? 0) - 1, a = thumb ? 0.6 : (i / Math.max(1, (s.fingers ?? 1) - 2) - 0.5) * 1.1;
    const dx = Math.sin(a) * 0.55, dz = thumb ? 0.7 : 0.15;
    branch(end, dx, d * 1, dz, ENT.finger * (thumb ? 0.6 : 0.85 + R() * 0.3), s.r1 * (thumb ? 0.36 : 0.32), 1, 0.16, 0);
  }
  // root toes: splaying out of the ankle and down into the ground (feet)
  for (let i = 0; i < (s.roots ?? 0); i++) {
    const back = i === (s.roots ?? 0) - 1, a = back ? Math.PI + (R() - 0.5) * 0.5 : (i / Math.max(1, (s.roots ?? 1) - 2) - 0.5) * 1.6 + (R() - 0.5) * 0.2;
    const reach = back ? 3.2 : 4.4 + R() * 1.4;
    branch(0, Math.sin(a), -0.15, Math.cos(a), reach, s.r0 * 0.5, 1, 0, 0, true, -ENT.ankleY - 0.3);
  }
  return { species: ENT_WOOD.id, seed: s.seed, nodes, leaves, height: s.len, crownCenter: { x: 0, z: 0 } };
}

/** Still air for the tree materials' wind (they sample the wind field at aInst.xy). */
function still(g: THREE.BufferGeometry) {
  const n = g.getAttribute('position').count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a[i * 4 + 3] = 1;
  g.setAttribute('aInst', new THREE.BufferAttribute(a, 4));
  return g;
}

/** One flower: five cupped petals round a gold heart (instanced; aTint per instance). */
function flowerGeometry() {
  const pos: number[] = [], nor: number[] = [], part: number[] = [], idx: number[] = [];
  const P = 5;
  pos.push(0, 0.08, 0); nor.push(0, 1, 0); part.push(1);
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; pos.push(Math.cos(a) * 0.16, 0.06, Math.sin(a) * 0.16); nor.push(0, 1, 0); part.push(1); }
  for (let k = 0; k < 10; k++) idx.push(0, k + 2, k + 1);
  for (let p = 0; p < P; p++) {
    const a = (p / P) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), b = pos.length / 3;
    // a petal: a rounded fan of 4 tris, lifting at the tip (cupped)
    const tip = 0.5, w = 0.24;
    const pts = [[0.05, 0, 0], [0.22, w * 0.8, 0.04], [tip * 0.75, w, 0.11], [tip, 0, 0.17], [tip * 0.75, -w, 0.11], [0.22, -w * 0.8, 0.04]];
    for (const [r, s, y] of pts) { pos.push(ca * r - sa * s, y, sa * r + ca * s); nor.push(-ca * y * 2, 1, -sa * y * 2); part.push(r / tip); }
    for (let k = 1; k < 5; k++) idx.push(b, b + k + 1, b + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

/** Moss hair: ribbons hanging along −Y from anchors; aHang 0 at the anchor → 1 at the tip (sways), u across. */
function mossGeometry(anchors: { p: THREE.Vector3; len: number; w: number; face: THREE.Vector3 }[]) {
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], hang: number[] = [], idx: number[] = [];
  const S = 6;
  anchors.forEach((a, ai) => {
    const side = new THREE.Vector3(-a.face.z, 0, a.face.x).normalize();
    const b = pos.length / 3;
    for (let k = 0; k <= S; k++) {
      const t = k / S, y = -a.len * t, bulge = Math.sin(t * Math.PI) * 0.25;
      for (const e of [-1, 1]) {
        const ww = a.w * (1 - t * 0.55) * 0.5 * e;
        pos.push(a.p.x + side.x * ww + a.face.x * bulge, a.p.y + y, a.p.z + side.z * ww + a.face.z * bulge);
        nor.push(a.face.x, 0.2, a.face.z); uvs.push((e + 1) / 2 + ai * 0.37, t * a.len * 0.5); hang.push(t);
      }
      if (k) { const i = b + (k - 1) * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aHang', new THREE.Float32BufferAttribute(hang, 1));
  g.setIndex(idx);
  return g;
}

function mossMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.5 });
  const h: N = attribute('aHang', 'float'), u: N = uv();
  // stringy: fibres across the ribbon, thinning and splitting toward the tips
  const fib: N = sin(u.x.mul(61).add(sin(u.y.mul(3.1).add(u.x.mul(17))).mul(2))).mul(0.5).add(0.5);
  const fib2: N = sin(u.x.mul(23).add(u.y.mul(0.7))).mul(0.5).add(0.5);
  m.opacityNode = smoothstep(h.mul(0.55).add(0.18), h.mul(0.55).add(0.32), max(fib, fib2.mul(0.85))).mul(smoothstep(float(1), float(0.82), h));
  m.colorNode = mix(color(0x2e4a1a), color(0x8aa64a), h.mul(0.8).add(fib.mul(0.2)));
  m.emissiveNode = color(0x9cff6a).mul(fib.mul(h).mul(0.05));
  const sway: N = sin(time.mul(1.1).add(u.x.mul(2.3))).mul(h.mul(h)).mul(0.7);
  m.positionNode = positionLocal.add(vec3(sway, h.mul(h).mul(0.12).negate(), sway.mul(0.6)));
  return m;
}

function flowerMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6 });
  const part: N = attribute('aPart', 'float'), tint: N = attribute('aTint', 'vec3');
  const heart: N = smoothstep(float(0.98), float(1.0), part);
  const petal: N = mix(tint.mul(1.15), tint.mul(0.55), part.mul(0.6));
  m.colorNode = mix(petal, color(0xffc94a), heart);
  // the forest glows: petals hold a little light, hearts more
  m.emissiveNode = mix(tint.mul(0.22), color(0xffb02a).mul(0.6), heart);
  return m;
}

const FLOWER_TINTS = [0xffd6e4, 0xf7f2ff, 0xc9a8ff, 0xff9ec2, 0xffe6a8, 0x9fd8ff];

/** Scatter flowers on a skeleton's surface (facing out of the wood), as one instanced mesh. */
function flowersOn(sk: TreeSkeleton, count: number, seed: number, size: [number, number], mat: THREE.Material, base: THREE.BufferGeometry, upOnly = false) {
  const R = rng(seed);
  const g = base.clone();
  const tint = new Float32Array(count * 3);
  const im = new THREE.InstancedMesh(g, mat, count);
  im.name = 'ent-flowers';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), up = V(0, 1, 0);
  const trunk = sk.nodes.filter((x) => x.order === 0 && !x.root);
  let k = 0;
  for (let tries = 0; k < count && tries < count * 8; tries++) {
    const nd = trunk[Math.floor(R() * trunk.length)];
    const a = R() * Math.PI * 2;
    n.set(Math.cos(a), (R() - 0.3) * 0.8, Math.sin(a)).normalize();
    if (upOnly && n.y < 0.05) continue;
    p.set(nd.x, nd.y, nd.z).addScaledVector(n, nd.radius * 1.04);
    const sc = size[0] + R() * (size[1] - size[0]);
    q.setFromUnitVectors(up, n);
    m4.compose(p, q, s.set(sc, sc, sc));
    im.setMatrixAt(k, m4);
    const c = new THREE.Color(FLOWER_TINTS[Math.floor(R() * FLOWER_TINTS.length)]);
    tint[k * 3] = c.r; tint[k * 3 + 1] = c.g; tint[k * 3 + 2] = c.b;
    k++;
  }
  im.count = k;
  g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  im.computeBoundingSphere();
  return im;
}

/** Moss strands hanging from points round a skeleton's nodes between two fractions of its length. */
function mossOn(sk: TreeSkeleton, count: number, seed: number, from: number, to: number, len: [number, number], faceBias?: THREE.Vector3) {
  const R = rng(seed + 99);
  const trunk = sk.nodes.filter((x) => x.order === 0 && !x.root);
  const out: { p: THREE.Vector3; len: number; w: number; face: THREE.Vector3 }[] = [];
  for (let i = 0; i < count; i++) {
    const nd = trunk[Math.min(trunk.length - 1, Math.floor((from + R() * (to - from)) * trunk.length))];
    let a = R() * Math.PI * 2;
    if (faceBias && R() < 0.6) a = Math.atan2(faceBias.z, faceBias.x) + (R() - 0.5) * 1.8;
    const face = V(Math.cos(a), 0, Math.sin(a));
    out.push({ p: V(nd.x, nd.y, nd.z).addScaledVector(face, nd.radius * 0.95), len: len[0] + R() * (len[1] - len[0]), w: 0.6 + R() * 0.7, face });
  }
  return out;
}

/** Build one ent. `lo` = the Intel / low tier: fewer flowers, moss and leaves, a coarser crown. */
export function buildEntModel(seed: number, o: { lo?: boolean } = {}): EntModel {
  const lo = !!o.lo;
  const R = rng(seed * 977 + 3);
  const root = new THREE.Group(); root.name = 'ent';
  const meshes: THREE.Mesh[] = [], detail: THREE.Object3D[] = [];
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const woodMats: TreeMaterials = treeMaterials(ENT_WOOD, 46);
  mats.push(woodMats.wood, woodMats.leaves);
  const flowerMat = flowerMaterial(), mossMat = mossMaterial(), flowerBase = flowerGeometry();
  mats.push(flowerMat, mossMat); geos.push(flowerBase);
  // the eyes and the veins wake: the sap light brightens when it moves or fights
  const wake = { value: 0 };
  const eyes = new THREE.MeshBasicNodeMaterial({ color: 0xffb347 });
  mats.push(eyes);

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, name: string, isDetail = false, shadow = true) => {
    const me = new THREE.Mesh(g, m); me.name = name; me.castShadow = shadow; me.receiveShadow = true;
    parent.add(me); meshes.push(me); geos.push(g);
    if (isDetail) detail.push(me);
    return me;
  };
  const addWood = (sk: TreeSkeleton, parent: THREE.Object3D, name: string, radial?: number) => {
    const tg = buildTreeGeometry(sk, ENT_WOOD, { radial: radial ?? (lo ? 10 : 14), barkTile: 2.4 });
    mesh(still(tg.wood), woodMats.wood, parent, name + '-wood');
    if (sk.leaves.length) mesh(still(tg.leaves), woodMats.leaves, parent, name + '-leaves', true, false);
    else tg.leaves.dispose();
    tg.cables?.dispose();
  };
  const addFlowers = (sk: TreeSkeleton, parent: THREE.Object3D, n: number, s: number, size: [number, number], upOnly = false) => {
    const im = flowersOn(sk, lo ? Math.round(n * 0.5) : n, seed * 31 + s, size, flowerMat, flowerBase, upOnly);
    im.castShadow = false; parent.add(im); meshes.push(im); detail.push(im); geos.push(im.geometry);
  };
  const addMoss = (anchors: ReturnType<typeof mossOn>, parent: THREE.Object3D, name: string) => {
    if (!anchors.length) return;
    mesh(mossGeometry(lo ? anchors.filter((_, i) => i % 2 === 0) : anchors), mossMat, parent, name, true, false);
  };

  // ── pelvis + upper body (rigid) ──
  const pelvis = new THREE.Group(); pelvis.name = 'Hips'; root.add(pelvis);
  pelvis.position.set(0, ENT.hipY, 0);
  {
    // hip log across the pelvis, the legs hang from its ends
    const hip = new THREE.Group(); hip.rotation.z = Math.PI / 2; hip.position.x = ENT.hipX + 0.9; pelvis.add(hip);
    addWood(limbSkeleton({ len: (ENT.hipX + 0.9) * 2, r0: 2.9, r1: 2.9, seed: seed + 1, dir: -1, wobble: 0.5 }), hip, 'pelvis');
  }
  const spine = new THREE.Group(); spine.name = 'Spine2'; pelvis.add(spine);
  const torsoSk = limbSkeleton({ len: ENT.torso, r0: 3.7, r1: 4.5, seed: seed + 2, dir: 1, overlap: 1.6, wobble: 0.8, twigs: lo ? 5 : 9, twigLen: [3, 6.5], twigFrom: 0.55, twigTo: 0.98, leaves: 3, twigUp: 0.9 });
  {
    const torso = new THREE.Group(); torso.scale.set(1.2, 1, 0.88); spine.add(torso);
    addWood(torsoSk, torso, 'torso');
    addFlowers(torsoSk, torso, 70, 1, [0.9, 1.6]);
    // moss down the chest and back, a mantle round the shoulders
    addMoss(mossOn(torsoSk, 46, seed + 3, 0.62, 1, [3, 8.5]), torso, 'torso-moss');
    // the yoke: a thick bough across the shoulders
    const yoke = new THREE.Group(); yoke.rotation.z = Math.PI / 2; yoke.position.set(ENT.shoulderX + 1.2, ENT.shoulderY, 0); spine.add(yoke);
    const yokeSk = limbSkeleton({ len: (ENT.shoulderX + 1.2) * 2, r0: 2.5, r1: 2.5, seed: seed + 4, dir: -1, wobble: 0.6 });
    addWood(yokeSk, yoke, 'yoke');
    addFlowers(yokeSk, yoke, 46, 2, [0.9, 1.5]);
  }
  // neck + head: a burl with two sap-lit knot eyes, moss hanging as hair and a long beard
  const head = new THREE.Group(); head.name = 'Head'; head.position.set(0, ENT.headY, ENT.headZ); head.rotation.x = 0.12; spine.add(head);
  {
    const neck = new THREE.Group(); neck.name = 'Neck'; neck.position.set(0, ENT.neckY - 1.2, 0.6); spine.add(neck);
    addWood(limbSkeleton({ len: 3.8, r0: 2.4, r1: 2.2, seed: seed + 5, dir: 1, wobble: 0.3 }), neck, 'neck');
    const headSk = limbSkeleton({ len: ENT.headLen, r0: 2.9, r1: 2.0, seed: seed + 6, dir: 1, overlap: 1.2, wobble: 0.5, twigs: lo ? 3 : 6, twigLen: [1.5, 3.5], twigFrom: 0.7, twigTo: 1, twigUp: 1.2, leaves: 2 });
    addWood(headSk, head, 'head');
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), eyes);
      e.name = 'ent-eye'; e.position.set(sx * 1.05, 2.3, 2.45); e.scale.set(1, 0.7, 0.6); head.add(e); meshes.push(e); geos.push(e.geometry);
      // a deep socket round each eye: a dark knot ring
      const sock = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.32, 8, 16), woodMats.wood);
      sock.position.copy(e.position).setZ(2.3); sock.rotation.y = sx * 0.25; still(sock.geometry); head.add(sock); meshes.push(sock); geos.push(sock.geometry);
    }
    // beard + hair: moss from the jaw down over the chest, and off the back and sides of the head
    const beard = mossOn(headSk, 30, seed + 7, 0.05, 0.35, [5, 11], V(0, 0, 1));
    const hair = mossOn(headSk, 26, seed + 8, 0.5, 1, [4, 9], V(0, 0, -1));
    addMoss([...beard, ...hair], head, 'head-moss');
    addFlowers(headSk, head, 18, 3, [0.7, 1.2], true);
    // the crown: a living oak growing out of the top of its head
    const crownSk = growTree(ENT_CROWN, seed * 13 + 5, { scale: 1, detail: lo ? 0.55 : 0.9 });
    const cg = new THREE.Group(); cg.name = 'crown'; cg.position.set(0, ENT.headLen - 0.6, -0.8); cg.rotation.y = R() * 6.28; head.add(cg);
    const ctm = treeMaterials(ENT_CROWN, ENT.crownH); mats.push(ctm.wood, ctm.leaves);
    const ct = buildTreeGeometry(crownSk, ENT_CROWN, { radial: lo ? 8 : 12, barkTile: 2 });
    mesh(still(ct.wood), ctm.wood, cg, 'crown-wood');
    mesh(still(ct.leaves), ctm.leaves, cg, 'crown-leaves', false, true);
    ct.cables?.dispose();
    // flowers through the crown: blossom clusters on its limbs
    const crownLimbs: TreeSkeleton = { ...crownSk, nodes: crownSk.nodes.map((n) => ({ ...n, order: n.order <= 1 && n.radius > 0.12 ? 0 : 5 })) };
    addFlowers(crownLimbs, cg, 60, 4, [0.8, 1.4], true);
  }
  // living trees on its shoulders and back (the forest's own species, small)
  {
    const spots: [TreeSpecies, number, THREE.Vector3, number][] = [
      [CF_VIOLET, 0.3, V(ENT.shoulderX * 0.8, ENT.shoulderY + 2.0, -0.8), 0.25],
      [CF_BLUE, 0.27, V(-ENT.shoulderX * 0.55, ENT.shoulderY + 2.2, -2.6), -0.2],
      [CF_VIOLET, 0.22, V(-1.2, ENT.torso * 0.55, -4.1), -0.7],
    ];
    if (lo) spots.pop();
    spots.forEach(([sp, sc, at, tilt], i) => {
      const sk = growTree(sp, seed * 7 + i * 3, { scale: sc, detail: lo ? 0.4 : 0.6 });
      const g = new THREE.Group(); g.name = 'ent-tree'; g.position.copy(at); g.rotation.set(tilt * 0.4, R() * 6.28, tilt); spine.add(g);
      const tm = treeMaterials(sp, sk.height); mats.push(tm.wood, tm.leaves); if (tm.cables) mats.push(tm.cables);
      const tg = buildTreeGeometry(sk, sp, { radial: 7 });
      mesh(still(tg.wood), tm.wood, g, 'ent-tree-wood', true, false);
      mesh(still(tg.leaves), tm.leaves, g, 'ent-tree-leaves', true, false);
      if (tg.cables && tm.cables) mesh(still(tg.cables), tm.cables, g, 'ent-tree-cables', true, false);
    });
  }

  // ── limbs: each a rigid segment hanging along −Y from its joint ──
  const seg = (name: string, sk: TreeSkeleton, len: number, extra?: (g: THREE.Group, sk: TreeSkeleton) => void): EntSeg => {
    const g = new THREE.Group(); g.name = name; root.add(g);
    addWood(sk, g, name);
    extra?.(g, sk);
    return { name, group: g, len };
  };
  const segs = {} as EntModel['segs'];
  let si = 10;
  for (const side of ['Left', 'Right'] as const) {
    const s = si; si += 10;
    segs[`${side}UpLeg`] = seg(`${side}UpLeg`, limbSkeleton({ len: ENT.thigh, r0: 2.6, r1: 2.0, seed: seed + s, dir: -1, wobble: 0.5, twigs: lo ? 1 : 3, twigLen: [2, 4], twigFrom: 0.1, twigTo: 0.6, leaves: 2 }), ENT.thigh,
      (g, sk) => { addFlowers(sk, g, 16, s, [0.8, 1.3]); addMoss(mossOn(sk, 10, seed + s, 0.05, 0.4, [2, 5]), g, 'thigh-moss'); });
    segs[`${side}Leg`] = seg(`${side}Leg`, limbSkeleton({ len: ENT.shin, r0: 2.1, r1: 1.7, seed: seed + s + 1, dir: -1, wobble: 0.4 }), ENT.shin,
      (g, sk) => addMoss(mossOn(sk, 8, seed + s + 1, 0.0, 0.35, [1.5, 3.5]), g, 'shin-moss'));
    segs[`${side}Arm`] = seg(`${side}Arm`, limbSkeleton({ len: ENT.upperArm, r0: 2.1, r1: 1.6, seed: seed + s + 2, dir: -1, wobble: 0.5, twigs: lo ? 2 : 4, twigLen: [2.5, 5], twigFrom: 0.05, twigTo: 0.7, leaves: 3, twigUp: 0.8 }), ENT.upperArm,
      (g, sk) => { addFlowers(sk, g, 22, s + 2, [0.8, 1.4]); addMoss(mossOn(sk, 14, seed + s + 2, 0.05, 0.9, [2.5, 6.5]), g, 'arm-moss'); });
    segs[`${side}ForeArm`] = seg(`${side}ForeArm`, limbSkeleton({ len: ENT.foreArm, r0: 1.6, r1: 1.25, seed: seed + s + 3, dir: -1, wobble: 0.5, twigs: lo ? 1 : 3, twigLen: [2, 4], twigFrom: 0.1, twigTo: 0.6, leaves: 2, fingers: 5, twigUp: 0.8 }), ENT.foreArm,
      (g, sk) => { addFlowers(sk, g, 12, s + 3, [0.7, 1.1]); addMoss(mossOn(sk, 10, seed + s + 3, 0.0, 0.7, [2, 5.5]), g, 'forearm-moss'); });
  }
  // feet: root toes gripping the ground (the group sits at the ankle, yawed with the foot)
  const feet = {} as EntModel['feet'];
  for (const side of ['Left', 'Right'] as const) {
    const g = new THREE.Group(); g.name = `${side}Foot`; root.add(g);
    addWood(limbSkeleton({ len: 1.2, r0: 2.0, r1: 1.9, seed: seed + (side === 'Left' ? 51 : 61), dir: 1, overlap: 0.4, wobble: 0.1, roots: 6 }), g, `${side}Foot`, lo ? 8 : 12);
    feet[side] = g;
  }
  root.traverse((o) => { o.matrixAutoUpdate = true; });
  return {
    root, pelvis, head, segs, feet, detail, meshes, eyes, wake,
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
  };
}
