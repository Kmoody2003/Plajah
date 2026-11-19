// Cyber Forest creatures, modelled from the level's creature turnarounds (Cyber Forest Level Assets):
// Electric Wolf, Poisonous Glowing Mantis, Bioluminescent Wasp (plasma stinger), the Alien Deer, the Storm Bat
// (shape from a spread-wing frame of "Bat creature flying motion study", painted from that frame) and a swarm of
// Bio-electrical Moths (shape from the moth sheet's front view, painted from its front/side/back).
// Pipeline: sheet side view → Hunyuan3D-2mini shape → painted from the sheet's front/side/back
// (engines/tela-3d/paint_from_views.py) → scripts/riftrealm/cf_creature_export.py (glow map from the bio-light hues).
// No skeleton: at load each mesh's vertices are sorted into regions (legs by quadrant and phase, head, tail, wings,
// raptor arms, stinger) and a TSL vertex program animates them — gallop / trot / tripod scuttle, wing buzz, strikes.
// One geometry + one material per kind; per-creature gait phase, speed and attack come in through object uniforms.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attribute, color, cos, float, fract, max, mix, positionLocal, sign, sin, smoothstep, time, uniform, uv, vec3 } from 'three/tsl';

export type CreatureKind = 'wolf' | 'mantis' | 'wasp' | 'deer' | 'bat';

interface Spec {
  file: string;
  height: number;      // metres, ground to top of the model
  hip: number;         // fraction of model height where the legs join the body
  stride: number;      // metres per full gait cycle at a run
  swing: number;       // leg swing amplitude (model units at the foot)
  lift: number;        // foot lift
  bob: number;         // body bob
  phases: [number, number, number, number] | 'tripod'; // LF RF LB RB (fractions of the cycle)
  hover?: number;      // flying height above the ground
}
const SPECS: Record<CreatureKind, Spec> = {
  wolf: { file: 'electric_wolf.glb', height: 1.45, hip: 0.42, stride: 2.6, swing: 0.34, lift: 0.12, bob: 0.05, phases: [0, 0.12, 0.5, 0.62] },
  mantis: { file: 'venom_mantis.glb', height: 2.5, hip: 0.4, stride: 1.4, swing: 0.16, lift: 0.08, bob: 0.02, phases: 'tripod' },
  wasp: { file: 'plasma_wasp.glb', height: 1.8, hip: 0.32, stride: 1.0, swing: 0.05, lift: 0, bob: 0, phases: [0, 0.5, 0.25, 0.75], hover: 1.7 },
  deer: { file: 'lumen_deer.glb', height: 2.3, hip: 0.4, stride: 1.8, swing: 0.24, lift: 0.1, bob: 0.03, phases: [0, 0.5, 0.5, 0] },
  bat: { file: 'storm_bat.glb', height: 1.6, hip: 0.36, stride: 1, swing: 0, lift: 0, bob: 0, phases: [0, 0.5, 0.5, 0], hover: 2.4 },
};
const BASE = '/games/rift-realm/assets/creatures/';

interface Template { geo: THREE.BufferGeometry; mat: THREE.Material; scale: number; extra?: { geo: THREE.BufferGeometry; mat: THREE.Material } }
const templates = new Map<CreatureKind, Template>();
const pending = new Map<CreatureKind, CreatureBody[]>();
const loading = new Set<CreatureKind>();
const loader = new GLTFLoader();

/** Per-vertex regions: x = leg weight (0 at the hip → 1 at the foot), y = gait phase (cycle fraction),
 *  z = head (wolf/deer/mantis) or wing (wasp), w = tail (wolf/deer), raptor arm (mantis) or stinger (wasp). */
function regions(kind: CreatureKind, g: THREE.BufferGeometry): { rgn: Float32Array; info: Record<string, number> } {
  const s = SPECS[kind], p = g.attributes.position, n = p.count, rgn = new Float32Array(n * 4);
  g.computeBoundingBox();
  const bb = g.boundingBox!, y0 = bb.min.y, H = bb.max.y - y0, z0 = bb.min.z, z1 = bb.max.z, L = z1 - z0;
  const hipY = y0 + H * s.hip;
  // feet = the lowest vertices; their z spread splits front legs from back legs
  let fz0 = 1e9, fz1 = -1e9;
  for (let i = 0; i < n; i++) if (p.getY(i) - y0 < H * 0.05) { fz0 = Math.min(fz0, p.getZ(i)); fz1 = Math.max(fz1, p.getZ(i)); }
  if (fz0 > fz1) { fz0 = z0; fz1 = z1; }
  const zMid = (fz0 + fz1) / 2;
  const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // wasp wings: in each slice along the body, the vertices above the biggest vertical gap in the upper half
  const wing = new Uint8Array(n);
  let wingRoot = y0 + H * 0.55;
  if (kind === 'wasp') {
    const bins = 28, lists: number[][] = Array.from({ length: bins }, () => []);
    for (let i = 0; i < n; i++) lists[Math.min(bins - 1, Math.floor((p.getZ(i) - z0) / L * bins))].push(i);
    const roots: number[] = [];
    for (const l of lists) {
      const ys = l.map((i) => p.getY(i)).sort((a, b) => a - b);
      let cut = Infinity;
      for (let k = 1; k < ys.length; k++) if (ys[k] > y0 + H * 0.42 && ys[k] - ys[k - 1] > H * 0.035) { cut = ys[k]; break; }
      if (cut < Infinity) { roots.push(cut); for (const i of l) if (p.getY(i) >= cut) wing[i] = 1; }
    }
    if (roots.length) wingRoot = roots.sort((a, b) => a - b)[Math.floor(roots.length * 0.2)];
  }
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const legW = y < hipY ? (hipY - y) / (hipY - y0) : 0;
    let ph = 0;
    if (s.phases === 'tripod') {
      const band = z < fz0 + (fz1 - fz0) / 3 ? 0 : z < fz0 + (fz1 - fz0) * 2 / 3 ? 1 : 2;
      ph = ((band + (x > 0 ? 1 : 0)) % 2) * 0.5;
    } else {
      const front = z > zMid, left = x > 0;
      ph = s.phases[(front ? 0 : 2) + (left ? 0 : 1)];
    }
    let zc = 0, wc = 0;
    if (kind === 'wolf' || kind === 'deer') {
      zc = sm(z1 - L * 0.32, z1 - L * 0.16, z) * sm(hipY - H * 0.05, hipY + H * 0.1, y);       // head + neck
      wc = sm(z0 + L * 0.26, z0 + L * 0.04, z) * sm(y0 + H * 0.2, y0 + H * 0.35, y);           // tail
    } else if (kind === 'mantis') {
      zc = sm(y0 + H * 0.82, y0 + H * 0.9, y);                                                   // head
      wc = sm(zMid + L * 0.02, zMid + L * 0.18, z) * sm(y0 + H * 0.4, y0 + H * 0.5, y) * (1 - zc) * sm(0.03, 0.09, Math.abs(x)); // raptor arms
    } else if (kind === 'wasp') {
      zc = wing[i];
      wc = sm(z0 + L * 0.45, z0 + L * 0.15, z) * (1 - wing[i]) * (y < hipY + H * 0.4 ? 1 : 0);  // abdomen / stinger
    } else if (kind === 'bat') {
      wc = sm(z0 + L * 0.5, z0 + L * 0.15, z) * (y < y0 + H * 0.4 ? 1 : 0);                      // tail
    }
    rgn.set([kind === 'wasp' && wing[i] ? 0 : legW, ph, zc, wc], i * 4);
  }
  const ww = wingMasks(kind, g, rgn);
  return { rgn, info: { y0, H, z0, z1, L, hipY, wingRoot, ...ww } };

}

/** Bat / moth (generated with the wings spread): z = inner wing (from the shoulder), w = the hand (from the wrist),
 *  x = legs under the body. Moth antennae (top, inside the span) stay still. */
function wingMasks(kind: string, g: THREE.BufferGeometry, rgn: Float32Array): Record<string, number> {
  if (kind !== 'bat' && kind !== 'moth') return {};
  const p = g.attributes.position, bb = g.boundingBox!, y0 = bb.min.y, H = bb.max.y - y0, W = bb.max.x - bb.min.x;
  const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const shX = W * (kind === 'bat' ? 0.1 : 0.11), wX = W * 0.27, shY = y0 + H * (kind === 'bat' ? 0.7 : 0.55), legTop = y0 + H * 0.32;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(p.getX(i)), y = p.getY(i);
    const ant = kind === 'moth' ? sm(y0 + H * 0.62, y0 + H * 0.7, y) * (ax < W * 0.3 ? 1 : 0) : 0;
    const leg = ax < shX && y < legTop ? (legTop - y) / (legTop - y0) : 0;
    rgn.set([leg, 0, sm(shX * 0.9, shX * 1.5, ax) * (1 - ant), sm(wX * 0.85, wX * 1.15, ax) * (1 - ant)], i * 4);
  }
  return { shX, wX, shY };
}

/** Wingbeat about the body's long axis: the hand turns at the wrist, then the whole wing at the shoulder. */
function flap(P: THREE.Node<'vec3'>, inner: THREE.Node<'float'>, outer: THREE.Node<'float'>, info: Record<string, number>,
  f: THREE.Node<'float'>, a1: number, a2: number, lift: number) {
  const sx = sign(P.x);
  const rot = (x: THREE.Node<'float'>, y: THREE.Node<'float'>, px: THREE.Node<'float'>, ang: THREE.Node<'float'>) => {
    const dx = x.sub(px), dy = y.sub(info.shY);
    return [px.add(dx.mul(cos(ang))).sub(dy.mul(sin(ang))), dy.mul(cos(ang)).add(dx.mul(sin(ang))).add(info.shY)] as const;
  };
  const [x1, y1] = rot(P.x, P.y, sx.mul(info.wX), sin(f.sub(0.9)).mul(a2).mul(outer).mul(sx));
  const [x2, y2] = rot(x1, y1, sx.mul(info.shX), sin(f).mul(a1).add(lift).mul(inner).mul(sx));
  return vec3(x2, y2, P.z);
}

/** Per-creature values reach the shared material through object uniforms (set from userData each frame). */
const uPhase = uniform(0).onObjectUpdate(({ object }) => (object?.userData.cPhase as number) ?? 0);
const uGait = uniform(0).onObjectUpdate(({ object }) => (object?.userData.cGait as number) ?? 0);
const uAtk = uniform(0).onObjectUpdate(({ object }) => (object?.userData.cAtk as number) ?? 0);
const uSeed = uniform(0).onObjectUpdate(({ object }) => (object?.userData.cSeed as number) ?? 0);

function motion(kind: CreatureKind, info: Record<string, number>) {
  const s = SPECS[kind], r = attribute<'vec4'>('rgn', 'vec4'), P = positionLocal;
  const legW = r.x, head = r.z, aux = r.w;
  const a = uPhase.add(r.y.mul(Math.PI * 2));
  const run = uGait;
  const swingZ = sin(a).mul(legW).mul(s.swing).mul(run);
  const liftY = max(cos(a), 0).mul(legW).mul(s.lift).mul(run);
  const bob = sin(uPhase.mul(2)).mul(s.bob).mul(run).mul(float(1).sub(legW));
  if (kind === 'wolf' || kind === 'deer') {
    // head nods with the gait, looks about when standing (deer: grazes, the head drops); the tail streams + wags
    const graze = kind === 'deer' ? smoothstep(float(0.0), float(0.3), float(1).sub(run)).mul(sin(time.mul(0.25).add(uSeed)).mul(0.5).add(0.5)) : float(0);
    const headY = sin(uPhase.mul(2).add(1.2)).mul(0.04).mul(run).sub(graze.mul(0.45).mul(head));
    const headX = sin(time.mul(0.6).add(uSeed)).mul(0.06).mul(float(1).sub(run)).mul(head);
    const tail = aux.mul(aux);
    const tailX = sin(time.mul(kind === 'wolf' ? 9 : 3).add(uSeed)).mul(0.08).mul(tail);
    const tailY = run.mul(0.12).mul(tail);
    // attack (wolf): a snapping lunge, the front half dips and pushes forward
    const lunge = uAtk.mul(smoothstep(float(info.z0 + info.L * 0.4), float(info.z1), P.z));
    return P.add(vec3(headX.add(tailX), liftY.add(bob).add(headY.mul(head)).add(tailY).sub(lunge.mul(0.12)), swingZ.add(lunge.mul(0.35))));
  }
  if (kind === 'mantis') {
    // raptor arms sway when idle and whip forward and down on a strike; the head tracks
    const sway = sin(time.mul(2.2).add(uSeed)).mul(0.03);
    const armZ = aux.mul(uAtk.mul(0.55).add(sway));
    const armY = aux.mul(uAtk.mul(-0.3).add(sway.mul(0.5)));
    const headX = sin(time.mul(1.3).add(uSeed)).mul(0.05).mul(head);
    return P.add(vec3(headX, liftY.add(bob).add(armY), swingZ.add(armZ)));
  }
  if (kind === 'bat') {
    // the real spread wings beat (faster in a chase), the hands lag and fold; on an attack the wings sweep forward;
    // the legs dangle and trail back at speed
    const f = time.mul(Math.PI * 2).mul(run.mul(1.4).add(2.8)).add(uSeed);
    const w = flap(P, head, aux, info, f, 0.62, 0.38, 0.12);
    const dangle = sin(time.mul(2.5).add(uSeed).add(P.x.mul(3))).mul(0.04).mul(legW);
    return w.add(vec3(0, legW.mul(run).mul(0.05), dangle.sub(legW.mul(run).mul(0.15)).add(head.mul(uAtk).mul(0.35))));
  }
  // wasp: wings buzz round the body's long axis at the wing root; legs dangle; the stinger curls under on an attack
  const ang = sin(time.mul(78).add(uSeed)).mul(0.55).add(0.15).mul(sign(P.x)).mul(head);
  const ry = P.y.sub(info.wingRoot);
  const wx = P.x.mul(cos(ang)).sub(ry.mul(sin(ang)));
  const wy = P.x.mul(sin(ang)).add(ry.mul(cos(ang))).add(info.wingRoot);
  const wing = vec3(wx, wy, P.z);
  const dangle = sin(time.mul(3).add(uSeed).add(P.x.mul(4))).mul(0.04).mul(legW);
  const sting = aux.mul(uAtk);
  const body = P.add(vec3(0, sting.mul(-0.18).add(sin(time.mul(9)).mul(0.012).mul(aux)), dangle.add(sting.mul(0.22))));
  return mix(body, wing, head);
}

/** Antlers for the deer (the sheet's branching cyan→gold antlers; they dropped out of the cut-out, so they are built). */
function antlers(info: Record<string, number>, g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position;
  // the crown of the head: the highest vertices in the front third
  let bx = 0, by = -1e9, bz = 0;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > info.z1 - info.L * 0.4 && p.getY(i) > by) { by = p.getY(i); bz = p.getZ(i); }
  by -= info.H * 0.12;
  const parts: THREE.BufferGeometry[] = [];
  const S = info.H;
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const side of [-1, 1]) {
    const o = new THREE.Vector3(bx + side * 0.05 * S, by, bz - 0.02 * S);
    const pts = [o, o.clone().add(new THREE.Vector3(side * 0.1 * S, 0.14 * S, -0.04 * S)), o.clone().add(new THREE.Vector3(side * 0.24 * S, 0.3 * S, -0.1 * S)),
      o.clone().add(new THREE.Vector3(side * 0.3 * S, 0.46 * S, -0.06 * S))];
    const beam = new THREE.CatmullRomCurve3(pts);
    parts.push(new THREE.TubeGeometry(beam, 16, 0.016 * S, 5, false));
    for (let k = 0; k < 5; k++) { // tines curving up and out along the beam
      const t = 0.25 + k * 0.15, b0 = beam.getPointAt(t), len = (0.1 + rnd() * 0.08) * S * (1 - t * 0.4);
      const dir = new THREE.Vector3(side * (0.2 + rnd() * 0.5), 1, (rnd() - 0.6) * 0.8).normalize();
      const mid = b0.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(side * 0.02 * S, 0, 0));
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([b0, mid, b0.clone().addScaledVector(dir, len)]), 6, 0.009 * S, 4, false));
    }
  }
  const out = mergeTubes(parts);
  const rg = new Float32Array(out.attributes.position.count * 4);
  for (let i = 0; i < out.attributes.position.count; i++) rg.set([0, 0, 1, 0], i * 4); // they ride on the head
  out.setAttribute('rgn', new THREE.BufferAttribute(rg, 4));
  return out;
}
function mergeTubes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], uvs: number[] = [], nor: number[] = [];
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.attributes.position.array as Float32Array)); nor.push(...(g.attributes.normal.array as Float32Array)); uvs.push(...(g.attributes.uv.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return out;
}

function load(kind: CreatureKind) {
  if (loading.has(kind)) return;
  loading.add(kind);
  loader.loadAsync(BASE + SPECS[kind].file).then((gltf) => {
    let src: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh; });
    if (!src) return;
    const m0 = src as THREE.Mesh;
    m0.updateWorldMatrix(true, false);
    const geo = m0.geometry.clone().applyMatrix4(m0.matrixWorld);
    const { rgn, info } = regions(kind, geo);
    geo.setAttribute('rgn', new THREE.BufferAttribute(rgn, 4));
    const std = m0.material as THREE.MeshStandardMaterial;
    const mat = new THREE.MeshStandardNodeMaterial({
      map: std.map, normalMap: std.normalMap, roughnessMap: std.roughnessMap, metalnessMap: std.metalnessMap,
      emissiveMap: std.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.75, metalness: 0.15,
      side: THREE.DoubleSide, alphaTest: kind === 'wasp' ? 0.3 : 0,
    });
    if (std.map) mat.map!.colorSpace = THREE.SRGBColorSpace;
    if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    mat.positionNode = motion(kind, info);
    const t: Template = { geo, mat, scale: SPECS[kind].height / info.H };
    if (kind === 'deer') {
      const am = new THREE.MeshStandardNodeMaterial({ color: 0x1a3040, roughness: 0.4 });
      am.emissiveNode = mix(color(0x40c8ff), color(0xffc060), smoothstep(float(0.35), float(1.0), uv().x)).mul(1.6);
      am.positionNode = motion(kind, info);
      t.extra = { geo: antlers(info, geo), mat: am };
    }
    templates.set(kind, t);
    for (const b of pending.get(kind) ?? []) b.attach(t);
    pending.delete(kind);
  }).catch((err) => console.warn('[rift] creature failed to load', kind, err));
}

/** One creature: a group (feet at its origin, facing +Z) and its gait state. */
export class CreatureBody {
  readonly root = new THREE.Group();
  /** The model's own offset group (flying height + bob for the wasp). */
  readonly body = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private phase = Math.random() * 10;
  private gait = 0;
  private atkT = 0;
  private seed = Math.random() * 100;
  private el = Math.random() * 10;
  readonly spec: Spec;
  constructor(readonly kind: CreatureKind, readonly size = 1) {
    this.spec = SPECS[kind];
    this.root.add(this.body);
    this.body.position.y = this.hover;
    const t = templates.get(kind);
    if (t) this.attach(t);
    else { if (!pending.has(kind)) pending.set(kind, []); pending.get(kind)!.push(this); load(kind); }
  }
  get hover() { return (this.spec.hover ?? 0) * this.size; }
  get height() { return this.spec.height * this.size; }
  attach(t: Template) {
    for (const part of [{ geo: t.geo, mat: t.mat }, ...(t.extra ? [t.extra] : [])]) {
      const m = new THREE.Mesh(part.geo, part.mat);
      m.scale.setScalar(t.scale * this.size);
      m.castShadow = true;
      m.frustumCulled = false;
      this.body.add(m); this.meshes.push(m);
    }
    this.write();
  }
  /** speed in m/s over the ground this frame. */
  update(dt: number, speed: number) {
    this.el += dt;
    const target = Math.min(1, speed / (this.kind === 'mantis' ? 4 : this.kind === 'deer' ? 5 : 6));
    this.gait += (target - this.gait) * Math.min(1, dt * 6);
    // cadence: one full gait cycle per stride length travelled, with a floor so a creature on the spot still breathes
    this.phase += dt * Math.PI * 2 * Math.max(speed / (this.spec.stride * this.size), 0.2);
    this.atkT = Math.max(0, this.atkT - dt);
    if (this.kind === 'bat') this.body.rotation.x = this.gait * 0.5 + (this.atkT > 0 ? Math.sin(this.atkT / 0.4 * Math.PI) * 0.5 : 0); // lean into the flight / the dive
    if (this.spec.hover) this.body.position.y = this.hover + Math.sin(this.el * 2.1 + this.seed) * 0.18 - (this.atkT > 0 ? Math.sin(this.atkT / 0.4 * Math.PI) * 0.7 : 0);
    this.write();
  }
  attack() { this.atkT = 0.4; }
  private write() {
    const atk = this.atkT > 0 ? Math.sin(this.atkT / 0.4 * Math.PI) : 0;
    for (const m of this.meshes) { m.userData.cPhase = this.phase; m.userData.cGait = this.gait; m.userData.cAtk = atk; m.userData.cSeed = this.seed; }
  }
}

export function preloadCreatures(kinds: CreatureKind[]) { for (const k of kinds) load(k); }

const lcg = (seed: number) => { let sd = seed; return () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }; };

// ── moths: the generated Bio-electrical Moth, instanced, circling the forest's glowing things ──────────────────────
export class MothSwarm {
  private mesh: THREE.InstancedMesh | null = null;
  private m: { a: THREE.Vector3; r: number; h: number; w: number; ph: number; s: number }[] = [];
  private t = 0;
  private M = new THREE.Matrix4(); private Q = new THREE.Quaternion(); private Q2 = new THREE.Quaternion(); private X = new THREE.Vector3(1, 0, 0);
  private P = new THREE.Vector3(); private P2 = new THREE.Vector3(); private S = new THREE.Vector3(); private Z = new THREE.Vector3(0, 0, 1);
  constructor(parent: THREE.Object3D, anchors: THREE.Vector3[], n: number, wingspan = 0.75) {
    const R = lcg(99);
    for (let i = 0; i < n; i++) this.m.push({ a: anchors[i % anchors.length], r: 1 + R() * 2.8, h: 1.2 + R() * 2.6, w: 0.5 + R() * 0.7, ph: R() * 6.28, s: 0.75 + R() * 0.5 });
    loader.loadAsync(BASE + 'glow_moth.glb').then((gltf) => {
      let src: THREE.Mesh | null = null;
      gltf.scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh; });
      if (!src) return;
      const m0 = src as THREE.Mesh; m0.updateWorldMatrix(true, false);
      const geo = m0.geometry.clone().applyMatrix4(m0.matrixWorld);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!, k = wingspan / (bb.max.x - bb.min.x);
      // centre it on the body (the model's feet sit at y = 0) so it turns about its middle
      geo.translate(0, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2); geo.scale(k, k, k); geo.computeBoundingBox();
      const rgn = new Float32Array(geo.attributes.position.count * 4);
      const info = wingMasks('moth', geo, rgn);
      geo.setAttribute('rgn', new THREE.BufferAttribute(rgn, 4));
      const ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = this.m[i].ph * 10;
      geo.setAttribute('mph', new THREE.InstancedBufferAttribute(ph, 1));
      const std = m0.material as THREE.MeshStandardMaterial;
      const mat = new THREE.MeshStandardNodeMaterial({ map: std.map, normalMap: std.normalMap, emissiveMap: std.emissiveMap, emissive: 0xffffff,
        emissiveIntensity: 1.8, roughness: 0.6, side: THREE.DoubleSide });
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      const r = attribute<'vec4'>('rgn', 'vec4');
      mat.positionNode = flap(positionLocal, r.z, r.w, info, time.mul(Math.PI * 2 * 2.4).add(attribute<'float'>('mph', 'float')), 0.75, 0.3, 0.2);
      this.mesh = new THREE.InstancedMesh(geo, mat, n);
      this.mesh.frustumCulled = false;
      parent.add(this.mesh);
      this.update(0);
    }).catch((err) => console.warn('[rift] moth failed to load', err));
  }
  private pos(o: { a: THREE.Vector3; r: number; h: number; w: number; ph: number }, t: number, out: THREE.Vector3) {
    return out.set(o.a.x + Math.cos(t * o.w + o.ph) * o.r, o.a.y + o.h + Math.sin(t * o.w * 2.3 + o.ph) * 0.5, o.a.z + Math.sin(t * o.w * 1.3 + o.ph) * o.r * 0.8);
  }
  update(dt: number) {
    this.t += dt;
    if (!this.mesh) return;
    this.m.forEach((o, i) => {
      this.pos(o, this.t, this.P); this.pos(o, this.t + 0.05, this.P2);
      // face along the path, body pitched forward into flight (the model stands upright, as on the sheet)
      this.Q.setFromUnitVectors(this.Z, this.P2.sub(this.P).setY(0).normalize()).multiply(this.Q2.setFromAxisAngle(this.X, 0.9));
      this.mesh!.setMatrixAt(i, this.M.compose(this.P, this.Q, this.S.setScalar(o.s)));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
