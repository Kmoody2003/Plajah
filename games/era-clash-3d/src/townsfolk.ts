// The townsfolk of Otsu-no-ura going about their day (the reference shots' crowded streets): strolling the
// shopfronts, circling the market, lingering at the stalls, working the harbour quay. When raiders come near, or
// once the Outer Wall is breached, they drop everything and run for the hills up the road, so the player meets
// a town emptying in panic as it starts to burn.
//
// The figures are the sheet-built villagers (fisherman, carpenter, peasant woman: scripts/eraclash3d/
// buildSheetCast.py), lightly tinted so a crowd doesn't read as clones. Cost is kept down for the iGPU: no
// shadows, full-rate animation only near the camera, a slower tick further out, nothing drawn beyond 75 m.
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from './core/character';
import { rng } from './core/kit';
import { MeshoptSimplifier } from 'meshoptimizer';

/** A quarter-detail copy of a figure's geometry for the crowd: only the index buffer is rebuilt (meshoptimizer), so
 *  every vertex, UV and skin weight is kept and it still deforms on the same skeleton. */
const lodCache = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
function crowdLod(g: THREE.BufferGeometry, keep = 0.25) {
  if (lodCache.has(g)) return lodCache.get(g)!;
  let out = g;
  try {
    const pa = g.attributes.position as THREE.BufferAttribute, n = pa.count;
    const pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = pa.getX(i); pos[i * 3 + 1] = pa.getY(i); pos[i * 3 + 2] = pa.getZ(i); }
    const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    const target = Math.floor((idx.length * keep) / 3) * 3;
    const [lod] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.02, ['LockBorder']);
    if (lod.length >= 3 && lod.length < idx.length) { out = g.clone(); out.setIndex(new THREE.BufferAttribute(lod, 1)); }
  } catch (e) { console.warn('[eraclash3d] crowd LOD', e); }
  lodCache.set(g, out);
  return out;
}

const MODELS = ['fisherman', 'carpenter', 'peasant'].map((id) => `/games/era-clash/3d/assets/characters/${id}.glb`);
const HEIGHT = [1.62, 1.68, 1.56];
const TINTS = [0xffffff, 0xdfe4f4, 0xf6e4cc, 0xe8e8e0];

type Role = 'street' | 'ring' | 'browse' | 'quay';
type State = 'about' | 'pause' | 'flee' | 'gone';

interface Folk {
  role: Role; group: THREE.Group; body: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null; acts: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationAction>>; cur: 'idle' | 'walk' | 'run' | null;
  state: State; t: number; wait: number; dir: number; speed: number;
  /** street: lane offset and z span; ring: angle; browse: stall index; quay: x span. */
  side: number; a: number; b: number; ang: number; fleeAt: number; tick: number; yaw: number;
}

export interface TownsfolkOpts {
  heightAt: (x: number, z: number) => number;
  roadX: (z: number) => number;
  plaza: { x: number; z: number; r: number };
  safety: THREE.Vector3;
  wallZ: number;
  quay: { x0: number; x1: number; z: number; top: number };
}

const _v = new THREE.Vector3();

export class Townsfolk {
  readonly group = new THREE.Group();
  readonly list: Folk[] = [];
  private R = rng(4711);
  private frame = 0;

  constructor(private o: TownsfolkOpts) {
    this.group.name = 'townsfolk';
    const add = (role: Role, n: number) => { for (let i = 0; i < n; i++) this.list.push(this.make(role, i)); };
    add('street', 9); add('ring', 5); add('browse', 4); add('quay', 5);
  }

  private make(role: Role, i: number): Folk {
    const R = this.R, group = new THREE.Group();
    this.group.add(group);
    const f: Folk = { role, group, body: null, mixer: null, acts: {}, cur: null, state: 'about', t: 0, wait: 0, dir: R() < 0.5 ? 1 : -1, speed: 1.05 + R() * 0.35,
      side: R() < 0.5 ? -1 : 1, a: 0, b: 0, ang: R() * Math.PI * 2, fleeAt: -1, tick: i % 3, yaw: 0 };
    const o = this.o;
    if (role === 'street') { f.a = 0 + R() * 8; f.b = 24 + R() * 8; const z = f.a + R() * (f.b - f.a); this.place(f, o.roadX(z) + f.side * (3.3 + R() * 0.8), z); }
    else if (role === 'ring') { const r = o.plaza.r * 0.4; this.place(f, o.plaza.x + Math.sin(f.ang) * r, o.plaza.z + Math.cos(f.ang) * r); }
    else if (role === 'browse') { f.ang = (i / 4) * Math.PI * 2 + 0.6; const r = o.plaza.r * 0.47; this.place(f, o.plaza.x + Math.sin(f.ang) * r, o.plaza.z + Math.cos(f.ang) * r); f.yaw = f.ang; f.state = 'pause'; f.wait = 3 + R() * 6; }
    else { f.a = o.quay.x0 + 2; f.b = o.quay.x1 - 2; this.place(f, f.a + R() * (f.b - f.a), o.quay.z + (R() - 0.5) * 2.4); }
    return f;
  }

  private ground(x: number, z: number) {
    const q = this.o.quay;
    return x > q.x0 && x < q.x1 && z > q.z - 4.6 && z < q.z + 4.6 ? q.top : this.o.heightAt(x, z);
  }
  private place(f: Folk, x: number, z: number) { f.group.position.set(x, this.ground(x, z), z); }

  /** Swap in the painted, rigged figures (each folk keeps its place and role). */
  async dress() {
    const files = await Promise.all(MODELS.map((u) => loadGLB(u).catch(() => null)));
    await MeshoptSimplifier.ready.catch(() => {});
    const tinted = new Map<string, THREE.Material>();
    this.list.forEach((f, i) => {
      const k = (i * 7) % files.length, file = files[k];
      if (!file) return;
      const node = cloneSkinned(file.scene);
      const box = new THREE.Box3().setFromObject(file.scene);
      node.scale.setScalar((HEIGHT[k] * (0.94 + this.R() * 0.1)) / Math.max(0.3, box.max.y - box.min.y));
      const tint = TINTS[(i * 5) % TINTS.length];
      node.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        m.castShadow = false; m.frustumCulled = false;
        if (MeshoptSimplifier.supported) m.geometry = crowdLod(m.geometry);
        const src = m.material as THREE.MeshStandardMaterial, key = src.uuid + tint;
        if (!tinted.has(key)) { const c = src.clone(); c.roughnessMap = null; c.roughness = 0.92; c.color.setHex(0xccc2ba).multiply(new THREE.Color(tint)); tinted.set(key, c); }
        m.material = tinted.get(key)!;
      });
      const mixer = new THREE.AnimationMixer(node);
      for (const n of ['idle', 'walk', 'run'] as const) { const c = file.animations.find((a) => a.name === n); if (c) f.acts[n] = mixer.clipAction(c); }
      f.body = node; f.mixer = mixer; f.group.add(node);
      this.play(f, f.state === 'pause' ? 'idle' : 'walk');
      f.mixer.update(this.R() * 2);
    });
  }

  private play(f: Folk, n: 'idle' | 'walk' | 'run') {
    if (f.cur === n || !f.acts[n]) return;
    const next = f.acts[n]!; next.reset().play();
    if (f.cur && f.acts[f.cur]) f.acts[f.cur]!.crossFadeTo(next, 0.25, false);
    f.cur = n;
  }

  get fled() { return this.list.filter((f) => f.state === 'flee' || f.state === 'gone').length; }

  /**
   * `cam`: camera position (drawing and animation LOD); `hero`: the player (folk step round him);
   * `threats`: raiders standing (folk within 13 m of one run); `breached`: the Outer Wall has fallen.
   */
  update(dt: number, cam: THREE.Vector3, hero: THREE.Vector3, threats: THREE.Vector3[], breached: boolean) {
    this.frame++;
    const o = this.o, R = this.R;
    for (const f of this.list) {
      if (f.state === 'gone') continue;
      const p = f.group.position;
      // panic: a raider close by, or the town's wall breached (staggered: the gate end first)
      if (f.state !== 'flee') {
        const near = threats.some((t) => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < 169);
        if (near) f.fleeAt = 0;
        else if (breached && f.fleeAt < 0) f.fleeAt = 0.4 + Math.max(0, (p.z - o.wallZ) / 18) + R() * 2.5;
        if (f.fleeAt >= 0) { f.fleeAt -= dt; if (f.fleeAt <= 0) { f.state = 'flee'; f.t = 0; f.speed = 4.2 + R() * 0.9; } }
      }
      let goal: THREE.Vector3 | null = null, speed = f.speed;
      if (f.state === 'flee') {
        f.t += dt;
        // up the road for the hills (out of the harbour through the gate first)
        const outside = p.z < o.wallZ + 1;
        const ahead = Math.min(p.z + 6, o.safety.z);
        goal = outside && Math.abs(p.x - o.roadX(o.wallZ)) > 2.5 ? _v.set(o.roadX(o.wallZ), 0, o.wallZ + 1.5) : _v.set(o.roadX(ahead) + (f.side * 1.2), 0, ahead);
        if (p.distanceTo(o.safety) < 3 || f.t > 40) { f.state = 'gone'; f.group.visible = false; continue; }
        this.play(f, 'run');
      } else if (f.state === 'pause') {
        f.wait -= dt; this.play(f, 'idle');
        if (f.wait <= 0) {
          f.state = 'about';
          if (f.role === 'browse') { f.ang += (R() < 0.5 ? 1 : -1) * (Math.PI * 2) / 11; }
        }
      } else {
        // going about: each role has its own walk
        if (f.role === 'street') {
          const lane = (z: number) => o.roadX(z) + f.side * 3.6;
          const tz = f.dir > 0 ? f.b : f.a;
          const z2 = p.z + f.dir * 2.5;
          goal = _v.set(lane(z2), 0, z2);
          if ((f.dir > 0 && p.z > tz) || (f.dir < 0 && p.z < tz)) { f.dir *= -1; f.state = 'pause'; f.wait = 1 + R() * 4; }
        } else if (f.role === 'ring' || f.role === 'browse') {
          const r = o.plaza.r * (f.role === 'ring' ? 0.4 : 0.47);
          if (f.role === 'ring') f.ang += f.dir * (speed / r) * dt;
          goal = _v.set(o.plaza.x + Math.sin(f.ang) * r, 0, o.plaza.z + Math.cos(f.ang) * r);
          if (f.role === 'browse' && Math.hypot(goal.x - p.x, goal.z - p.z) < 0.3) { f.state = 'pause'; f.wait = 4 + R() * 7; f.yaw = f.ang; }
        } else {
          const tx = f.dir > 0 ? f.b : f.a;
          goal = _v.set(tx, 0, o.quay.z + Math.sin(p.x * 0.3 + f.ang) * 1.2);
          if (Math.abs(p.x - tx) < 0.6) { f.dir *= -1; f.state = 'pause'; f.wait = 2 + R() * 5; }
        }
        if (f.state === 'about') this.play(f, 'walk');
      }
      if (goal) {
        const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
        if (d > 0.05) {
          let mx = dx / d, mz = dz / d;
          // step round Haru
          const hx = p.x - hero.x, hz = p.z - hero.z, hd = Math.hypot(hx, hz);
          if (hd < 1.4 && hd > 0.01) { mx += (hx / hd) * (1.4 - hd) * 2; mz += (hz / hd) * (1.4 - hd) * 2; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
          const step = Math.min(d, speed * dt);
          p.x += mx * step; p.z += mz * step;
          f.yaw = Math.atan2(mx, mz);
        }
      }
      p.y = this.ground(p.x, p.z);
      const dy = Math.atan2(Math.sin(f.yaw - f.group.rotation.y), Math.cos(f.yaw - f.group.rotation.y));
      f.group.rotation.y += dy * Math.min(1, dt * 8);
      // drawing and animation LOD
      const dc = Math.hypot(p.x - cam.x, p.z - cam.z);
      f.group.visible = dc < 75;
      if (f.mixer && f.group.visible) {
        if (dc < 40) f.mixer.update(dt);
        else if ((this.frame + f.tick) % 3 === 0) f.mixer.update(dt * 3);
      }
    }
  }
}
