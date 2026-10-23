// High-quality outdoor vegetation: foliaged trees (recursive branch skeletons
// with instanced leaf-cluster cards), grass tufts and wall ivy. Leaf textures
// are painted onto canvases at runtime — no external assets to ship — and all
// foliage sways in the shared wind (per-instance phase, gust-driven).
import * as THREE from 'three/webgpu';
import { float, vec3, sin, time, uv, positionLocal, attribute, mix, color, mx_fractal_noise_float, positionWorld, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './kit';

// ── Painted textures ─────────────────────────────────────────────────────────
function leafTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const R = rng(1234);
  x.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const cx = 20 + R() * 216, cy = 20 + R() * 216;
    const a = R() * Math.PI * 2, len = 16 + R() * 22, wid = 6 + R() * 7;
    const g = 60 + R() * 70, warm = R() * 26;
    x.save();
    x.translate(cx, cy); x.rotate(a);
    x.fillStyle = `rgb(${52 + warm + R() * 20},${86 + R() * 46},${34 + R() * 22})`;
    x.beginPath();
    x.ellipse(0, 0, len / 2, wid / 2, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(18,28,12,0.55)';
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(-len / 2, 0); x.lineTo(len / 2, 0); x.stroke();
    x.restore();
    void g;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function grassTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const R = rng(777);
  x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 42; i++) {
    const bx = 6 + R() * 116, bend = (R() - 0.5) * 22, h = 62 + R() * 58;
    const grad = x.createLinearGradient(0, 128, 0, 128 - h);
    grad.addColorStop(0, '#22331a');
    grad.addColorStop(1, `rgb(${96 + R() * 40},${128 + R() * 40},${58})`);
    x.strokeStyle = grad;
    x.lineWidth = 2.4 + R() * 1.6;
    x.beginPath();
    x.moveTo(bx, 128);
    x.quadraticCurveTo(bx + bend * 0.3, 128 - h * 0.6, bx + bend, 128 - h);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let _leaf: THREE.Texture | null = null;
let _grass: THREE.Texture | null = null;
export const leafTex = () => (_leaf ??= leafTexture());
export const grassTex = () => (_grass ??= grassTexture());

// ── Materials ────────────────────────────────────────────────────────────────
/** Procedural bark: dark vertical streaks over brown, no texture files needed. */
export function barkMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const streak = mx_fractal_noise_float(positionWorld.mul(vec3(1.6, 0.22, 1.6)), 4, 2, 0.5, 1);
  const fine = mx_fractal_noise_float(positionWorld.mul(vec3(9, 3, 9)), 3, 2, 0.5, 1);
  m.colorNode = mix(color(0x2b2019), color(0x54432f), streak.mul(0.7).add(fine.mul(0.3)).clamp());
  m.roughnessNode = float(0.94);
  m.metalness = 0;
  return m;
}

/**
 * Leaf cards that breathe with the wind. Per-instance phase comes from an
 * instanced attribute; amplitude is weighted by the card's uv.y so the base
 * stays planted and the tips flutter. `gust` is a live uniform main.ts feeds
 * from the Wind system each frame.
 */
/** Live gust uniform (0..1) — main.ts writes the Wind system's gust here. */
export const gustUniform = uniform(0.5);
export function leafCardMaterial(tex: THREE.Texture, amp = 0.16): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  m.map = tex;
  m.alphaTest = 0.42;
  m.side = THREE.DoubleSide;
  m.roughness = 0.9;
  m.metalness = 0;
  const phase = attribute<'float'>('aPhase', 'float');
  const w = uv().y.mul(uv().y);
  const sway = sin(time.mul(1.35).add(phase))
    .mul(0.6)
    .add(sin(time.mul(0.43).add(phase.mul(1.7))).mul(0.7));
  const flutter = sin(time.mul(6.1).add(phase.mul(3.1))).mul(0.18);
  const g = float(0.35).add(float(0.65).mul(gustUniform));
  const off = vec3(sway.mul(amp), flutter.mul(amp).mul(0.3), sway.mul(amp * 0.7)).mul(w).mul(g);
  m.positionNode = positionLocal.add(off);
  return m;
}

/** Two crossed planes, origin at the bottom centre. */
function crossCard(w: number, h: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(w, h);
  a.translate(0, h / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()], false)!;
  return g;
}

function setPhases(geo: THREE.BufferGeometry, count: number, seed: number) {
  const R = rng(seed);
  const arr = new Float32Array(count);
  for (let i = 0; i < count; i++) arr[i] = R() * Math.PI * 2;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(arr, 1));
}

// ── Foliaged tree ────────────────────────────────────────────────────────────
export interface FoliagedTree { group: THREE.Group; foliage: THREE.InstancedMesh; trunk: THREE.Mesh }

/**
 * A full-foliage tree: the same recursive gnarled skeleton as kit.bareTree,
 * but every outer branch tip carries a cluster of leaf cards. ~30–50 cards
 * per tree in ONE instanced draw.
 */
export function foliagedTree(seed: number, height: number, opts: { cards?: number; spread?: number } = {}): FoliagedTree {
  const rand = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const anchors: { p: THREE.Vector3; s: number }[] = [];
  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const pts: THREE.Vector3[] = [start.clone()];
    const p = start.clone();
    const d = dir.clone();
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      d.add(new THREE.Vector3((rand() - 0.5) * 0.45, (rand() - 0.3) * 0.22, (rand() - 0.5) * 0.45)).normalize();
      p.addScaledVector(d, len / segs);
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 6, rad, 6, false);
    const pos = tube.attributes.position as THREE.BufferAttribute;
    const rings = 7;
    for (let i = 0; i < pos.count; i++) {
      const ring = Math.floor(i / 7);
      const t = ring / (rings - 1);
      const c = curve.getPointAt(Math.min(1, t));
      _tmp.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - t * 0.5).add(c);
      pos.setXYZ(i, _tmp.x, _tmp.y, _tmp.z);
    }
    parts.push(tube);
    const tip = curve.getPointAt(1);
    if (depth <= 2) anchors.push({ p: tip, s: 0.8 + rand() * 0.7 });
    if (depth <= 0 || rad < 0.02) return;
    const kids = depth > 2 ? 2 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3);
    for (let k = 0; k < kids; k++) {
      const t = 0.45 + rand() * 0.55;
      const from = curve.getPointAt(t);
      const nd = d.clone().add(new THREE.Vector3((rand() - 0.5) * 1.5, rand() * 0.55, (rand() - 0.5) * 1.5)).normalize();
      grow(from, nd, len * (0.55 + rand() * 0.2), rad * 0.5, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 1, 0.02), height * 0.4, height * 0.032, 4);
  const trunk = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!, barkMaterial());
  trunk.castShadow = true;
  trunk.receiveShadow = true;

  const count = Math.min(anchors.length, opts.cards ?? 64);
  const cardGeo = crossCard(1.9 * (opts.spread ?? 1), 1.9 * (opts.spread ?? 1));
  setPhases(cardGeo, count, seed + 9);
  const foliage = new THREE.InstancedMesh(cardGeo, leafCardMaterial(leafTex(), 0.14), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = anchors[i % anchors.length];
    e.set((rand() - 0.5) * 0.7, rand() * Math.PI * 2, (rand() - 0.5) * 0.7);
    q.setFromEuler(e);
    const s = a.s * (0.85 + rand() * 0.5);
    sc.set(s, s * (0.85 + rand() * 0.3), s);
    m4.compose(a.p, q, sc);
    foliage.setMatrixAt(i, m4);
    tint.setHSL(0.26 + rand() * 0.05, 0.32 + rand() * 0.2, 0.32 + rand() * 0.14);
    foliage.setColorAt(i, tint);
  }
  foliage.castShadow = true;
  const group = new THREE.Group();
  group.add(trunk, foliage);
  return { group, foliage, trunk };
}
const _tmp = new THREE.Vector3();

// ── Grass + ivy ──────────────────────────────────────────────────────────────
export function grassTufts(positions: THREE.Vector3[], seed = 31): THREE.InstancedMesh {
  const geo = crossCard(0.62, 0.55);
  setPhases(geo, positions.length, seed);
  const inst = new THREE.InstancedMesh(geo, leafCardMaterial(grassTex(), 0.05), positions.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const R = rng(seed + 4);
  positions.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * Math.PI * 2);
    const s = 0.8 + R() * 0.7;
    sc.set(s, s, s);
    m4.compose(p, q, sc);
    inst.setMatrixAt(i, m4);
  });
  inst.receiveShadow = true;
  return inst;
}

/** A patch of ivy: leaf cards scattered over a w×h wall plane (local XY). */
export function ivyPatch(w: number, h: number, count: number, seed = 97): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(0.55, 0.55);
  setPhases(geo, count, seed);
  const inst = new THREE.InstancedMesh(geo, leafCardMaterial(leafTex(), 0.03), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const R = rng(seed);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Denser toward the bottom and the edges, like real ivy climbing.
    const y = Math.pow(R(), 1.4) * h;
    const x = (R() - 0.5) * w * (0.55 + 0.45 * (1 - y / h));
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, (R() - 0.5) * 0.5, R() * Math.PI * 2));
    const s = 0.7 + R() * 0.9;
    sc.set(s, s, s);
    m4.compose(new THREE.Vector3(x, y, 0.03 + R() * 0.05), q, sc);
    inst.setMatrixAt(i, m4);
    tint.setHSL(0.27 + R() * 0.04, 0.36, 0.3 + R() * 0.12);
    inst.setColorAt(i, tint);
  }
  return inst;
}
