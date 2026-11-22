// Environment hazards (data in danger/spots.ts). Every one reads at a glance, warns before it hurts, and has a sound:
//  · thorns    — crimson-tipped bramble spikes; walking through bites (scratch sparks) and slows you
//  · spores    — glowing pods that swell and wheeze when you come close, then burst into a poison cloud
//  · toxic     — acid-green swamp water that bubbles; wading poisons and slows
//  · lava      — cracked glowing crust shedding embers; stepping in burns hard
//  · vent      — a rock mouth that sputters smoke and sparks, rumbles, then erupts a column of fire
//  · rockfall  — grit trickles and a warning ring spreads on the ground, then a boulder lands
//  · fungi     — electrified mushrooms that charge on the beat and arc lightning into anyone near on the next downbeat
//  · deep      — deep water: you wade slowly and run out of air (the vale's standing water counts everywhere)
// Vents, rockfall, spores and fungi also hurt predators and the rift's creatures caught in them — lure them in.
import * as THREE from 'three/webgpu';
import { color, float, length, mix, mx_noise_float, mx_worley_noise_float, positionLocal, positionWorld, smoothstep, sin, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import type { VfxSystem } from '../../../../services/vfx';
import { POISON_MIST, POISON_WISP, TOXIC_BUBBLE, LAVA_EMBERS, VENT_SPUTTER, VENT_BURST, ROCK_IMPACT, ROCK_TRICKLE, SPARK_ARC, SPARK_CHARGE, THORN_SCRATCH } from '../../../../services/vfx/hazards';
import type { DangerAudio } from './audio';
import type { PlayerStatus } from './status';
import type { Hazard } from './spots';

export interface HazardEnv {
  scene: THREE.Scene;
  vfx: VfxSystem;
  audio: DangerAudio;
  status: PlayerStatus;
  lo: boolean;
  /** Terrain height (the open ground, not decks). */
  ground(x: number, z: number): number;
  /** The level's beat (rhythm.ts): index of the current beat. */
  beat(): number;
  /** Hurt the player (`why` names it for the HUD). */
  hurt(dmg: number, why: string): void;
  /** Hurt anything else in a radius (predators, the rift's creatures). */
  areaDamage(at: THREE.Vector3, r: number, dmg: number, why: string): void;
  /** Deep water outside the listed pools: the surface height at (x, z), or null where there's none. */
  water?(x: number, z: number): number | null;
}

interface Live {
  h: Hazard;
  y: number;            // ground (or surface) height at the centre
  at: THREE.Vector3;
  t: number;            // per-hazard clock
  phase: 'idle' | 'tell' | 'active' | 'cool';
  obj?: THREE.Object3D;
  parts?: THREE.Mesh[];
  glow?: { value: number };
  hitOnce?: boolean;
  amb: number;          // ambient effect timer
  rocks?: Rock[];
  ring?: THREE.Mesh;
  spot?: THREE.Vector3; // where the next rock lands
  lastBeat?: number;
}
interface Rock { mesh: THREE.Mesh; v: number; spin: THREE.Vector3; t: number; state: 'fall' | 'rest' | 'off'; target: THREE.Vector3 }
interface Arc { mesh: THREE.Object3D; life: number }

const lcg = (seed: number) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const hash = (str: string) => { let h = 7; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 2147483647; return h || 1; };

export class HazardField {
  readonly group = new THREE.Group();
  private live: Live[] = [];
  private near: Live[] = [];
  private scanT = 0;
  private arcs: Arc[] = [];
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3();
  private beatLast = -1; private beatT = 0; private ownBeat = 0;
  private thornCd = 0;
  private wetCd = 0;
  private lavaCd = 0;
  /** The beat pulse, for the glows. */
  private uPulse = uniform(0);

  constructor(private env: HazardEnv, list: Hazard[]) {
    this.group.name = 'danger-hazards';
    env.scene.add(this.group);
    const thorns: Live[] = [];
    for (const h of list) {
      const y = this.surfaceY(h);
      const L: Live = { h, y, at: new THREE.Vector3(h.x, y, h.z), t: lcg(hash(h.id))() * (h.every ?? 5), phase: 'idle', amb: Math.random() };
      this.live.push(L);
      if (h.kind === 'thorns') thorns.push(L);
      else if (h.kind === 'spores') this.buildSpores(L);
      else if (h.kind === 'toxic') this.buildPool(L, 'toxic');
      else if (h.kind === 'lava') this.buildPool(L, 'lava');
      else if (h.kind === 'vent') this.buildVent(L);
      else if (h.kind === 'rockfall') this.buildRocks(L);
      else if (h.kind === 'fungi') this.buildFungi(L);
    }
    if (thorns.length) this.buildThorns(thorns);
  }

  /** Pools sit level at the highest ground across their footprint (so they never sink into a bank). */
  private surfaceY(h: Hazard) {
    const g = this.env.ground;
    if (h.kind === 'toxic' || h.kind === 'lava') {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, y = g(h.x + Math.cos(a) * h.r * 0.7, h.z + Math.sin(a) * h.r * 0.7); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      const c = g(h.x, h.z);
      return Math.min(hi, Math.max(c, lo) + 0.35) + 0.06;
    }
    if (h.kind === 'deep') return h.y ?? g(h.x, h.z) + 2.5;
    return g(h.x, h.z);
  }

  // ── builders ────────────────────────────────────────────────────────────────────────────────────────────────────
  private buildThorns(list: Live[]) {
    const geo = new THREE.ConeGeometry(0.05, 1, 5, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x24140c, roughness: 0.8 });
    // crimson glowing tips so a brake reads as "don't" even in the dark
    mat.emissiveNode = color(0xff2238).mul(smoothstep(float(0.6), float(1.0), positionLocal.y)).mul(this.uPulse.mul(0.6).add(1.1));
    let n = 0; for (const L of list) n += Math.round(Math.PI * L.h.r * L.h.r * (this.env.lo ? 5 : 9));
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
    let i = 0;
    for (const L of list) {
      const R = lcg(hash(L.h.id)), m = Math.round(Math.PI * L.h.r * L.h.r * (this.env.lo ? 5 : 9));
      for (let k = 0; k < m; k++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * L.h.r, x = L.h.x + Math.cos(a) * d, z = L.h.z + Math.sin(a) * d;
        P.set(x, this.env.ground(x, z) - 0.05, z);
        const out = 0.25 + (d / L.h.r) * 0.7;                                    // spikes lean out at the brake's edge
        E.set(Math.sin(a) * out * (R() * 0.8 + 0.4), R() * 6.28, -Math.cos(a) * out * (R() * 0.8 + 0.4));
        const hgt = (0.5 + R() * 0.9) * (1.1 - (d / L.h.r) * 0.45);
        M.compose(P, Q.setFromEuler(E), S.set(1 + R(), hgt, 1 + R()));
        inst.setMatrixAt(i++, M);
      }
    }
    inst.count = i; inst.castShadow = !this.env.lo; inst.frustumCulled = false; inst.name = 'thorns';
    this.group.add(inst);
  }

  private buildSpores(L: Live) {
    const g = new THREE.Group(), R = lcg(hash(L.h.id));
    const glow = uniform(1);
    const pod = new THREE.MeshStandardNodeMaterial({ color: 0x31481c, roughness: 0.5 });
    pod.emissiveNode = color(0x9cff3a).mul(sin(time.mul(1.7).add(positionWorld.x)).mul(0.25).add(0.75)).mul(glow).mul(0.9);
    const stalk = new THREE.MeshStandardNodeMaterial({ color: 0x1e2c14, roughness: 0.9 });
    const podG = new THREE.SphereGeometry(0.34, 12, 9), stalkG = new THREE.CylinderGeometry(0.05, 0.09, 1, 5);
    L.parts = [];
    for (let k = 0; k < (this.env.lo ? 4 : 7); k++) {
      const a = R() * 6.28, d = R() * L.h.r * 0.45, x = L.h.x + Math.cos(a) * d, z = L.h.z + Math.sin(a) * d, gy = this.env.ground(x, z);
      const hgt = 0.4 + R() * 0.8;
      const s = new THREE.Mesh(stalkG, stalk); s.position.set(x, gy + hgt / 2, z); s.scale.y = hgt; g.add(s);
      const p = new THREE.Mesh(podG, pod); p.position.set(x, gy + hgt + 0.25, z); p.scale.set(1, 1.3, 1).multiplyScalar(0.8 + R() * 0.6);
      p.userData.base = p.scale.clone(); g.add(p); L.parts.push(p);
    }
    L.glow = glow; L.obj = g; this.group.add(g);
  }

  private buildPool(L: Live, kind: 'toxic' | 'lava') {
    const geo = new THREE.CircleGeometry(L.h.r, 48); geo.rotateX(-Math.PI / 2);
    const edge = smoothstep(float(0.5), float(0.43), length(uv().sub(vec2(0.5, 0.5))));
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: kind === 'toxic' ? 0.15 : 0.9 });
    const p = positionWorld.xz;
    if (kind === 'toxic') {
      const n = mx_noise_float(vec3(p.x.mul(0.35), p.y.mul(0.35), time.mul(0.25))).mul(0.5).add(0.5);
      mat.colorNode = mix(color(0x1a2a0c), color(0x4c7a18), n);
      mat.emissiveNode = mix(color(0x0c1a04), color(0x8cff2a), n.pow(3)).mul(this.uPulse.mul(0.25).add(0.9));
      mat.opacityNode = edge.mul(0.88);
    } else {
      // cooling crust in cells, molten cracks between them that crawl and breathe
      const w = mx_worley_noise_float(vec3(p.x.mul(0.55), p.y.mul(0.55), time.mul(0.08)));
      const crack = smoothstep(float(0.18), float(0.02), w);
      const flow = mx_noise_float(vec3(p.x.mul(0.2), p.y.mul(0.2), time.mul(0.15))).mul(0.5).add(0.5);
      mat.colorNode = mix(color(0x1a0d08), color(0x3a160a), flow);
      mat.emissiveNode = mix(color(0xff3a06), color(0xffd070), crack.mul(flow)).mul(crack.mul(3.2).add(flow.mul(0.6))).mul(this.uPulse.mul(0.3).add(1));
      mat.opacityNode = edge;
    }
    const m = new THREE.Mesh(geo, mat); m.position.copy(L.at); m.renderOrder = 2; m.name = `hazard-${kind}`;
    L.obj = m; this.group.add(m);
    if (kind === 'lava') { const l = new THREE.PointLight(0xff5a14, this.env.lo ? 0 : 18, L.h.r * 3, 2); l.position.set(L.h.x, L.y + 1.2, L.h.z); this.group.add(l); }
  }

  private buildVent(L: Live) {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardNodeMaterial({ color: 0x1c1816, roughness: 0.95, flatShading: true });
    const glow = uniform(0.4);
    rock.emissiveNode = color(0xff4a10).mul(smoothstep(float(0.2), float(0.9), positionLocal.y)).mul(glow).mul(0.8);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(L.h.r * 0.45, L.h.r * 1.1, 1.1, 9, 2, true), rock);
    cone.position.set(L.h.x, L.y + 0.45, L.h.z); g.add(cone);
    const throat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
    throat.colorNode = mix(color(0x501206), color(0xffc060), glow.clamp(0, 1.5).div(1.5));
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(L.h.r * 0.42, 16), throat); mouth.rotation.x = -Math.PI / 2; mouth.position.set(L.h.x, L.y + 0.9, L.h.z); g.add(mouth);
    // scorched ring round it
    const ash = new THREE.Mesh(new THREE.RingGeometry(L.h.r * 0.9, L.h.r * 2.4, 24), new THREE.MeshStandardNodeMaterial({ color: 0x141110, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }));
    ash.rotation.x = -Math.PI / 2; ash.position.set(L.h.x, L.y + 0.05, L.h.z); g.add(ash);
    L.glow = glow; L.obj = g; this.group.add(g);
  }

  private buildRocks(L: Live) {
    const R = lcg(hash(L.h.id));
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x5a544c, roughness: 0.95, flatShading: true });
    L.rocks = [];
    for (let k = 0; k < 3; k++) {
      const geo = new THREE.IcosahedronGeometry(0.8, 0);
      const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) * (0.8 + R() * 0.5), pa.getY(i) * (0.7 + R() * 0.4), pa.getZ(i) * (0.8 + R() * 0.5));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.castShadow = !this.env.lo; this.group.add(m);
      L.rocks.push({ mesh: m, v: 0, spin: new THREE.Vector3(R() * 4, R() * 4, R() * 4), t: 0, state: 'off', target: new THREE.Vector3() });
    }
    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const k = uniform(0); ringMat.colorNode = color(0xff7a20).mul(k.mul(1.5)); ringMat.opacityNode = k;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.3, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.userData.k = k;
    this.group.add(ring); L.ring = ring; L.spot = new THREE.Vector3();
  }

  private buildFungi(L: Live) {
    const g = new THREE.Group(), R = lcg(hash(L.h.id));
    const glow = uniform(1);
    const cap = new THREE.MeshStandardNodeMaterial({ color: 0x0c2a3a, roughness: 0.35 });
    cap.emissiveNode = color(0x34e6ff).mul(glow).mul(sin(time.mul(3).add(positionWorld.x.mul(2))).mul(0.15).add(0.85));
    const stem = new THREE.MeshStandardNodeMaterial({ color: 0x9ab8c0, roughness: 0.6 });
    stem.emissiveNode = color(0x1a6a80).mul(glow).mul(0.5);
    const capG = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), stemG = new THREE.CylinderGeometry(0.08, 0.13, 1, 7);
    L.parts = [];
    for (let k = 0; k < (this.env.lo ? 4 : 7); k++) {
      const a = R() * 6.28, d = 0.4 + R() * L.h.r * 0.5, x = L.h.x + Math.cos(a) * d, z = L.h.z + Math.sin(a) * d, gy = this.env.ground(x, z);
      const hgt = 0.6 + R() * 1.4, s = 0.6 + R() * 0.9;
      const st = new THREE.Mesh(stemG, stem); st.position.set(x, gy + hgt / 2, z); st.scale.set(s, hgt, s); g.add(st);
      const c = new THREE.Mesh(capG, cap); c.position.set(x, gy + hgt - 0.05, z); c.scale.set(s * 1.2, s * 0.8, s * 1.2); g.add(c); L.parts.push(c);
    }
    if (!this.env.lo) { const l = new THREE.PointLight(0x34e6ff, 6, 9, 2); l.position.set(L.h.x, L.y + 1.6, L.h.z); g.add(l); }
    L.glow = glow; L.obj = g; this.group.add(g);
  }

  // ── lightning: a jagged bright tube in a soft glow, gone in a blink ─────────────────────────────────────────────
  arc(a: THREE.Vector3, b: THREE.Vector3, col = 0x5ef0ff, jag = 0.35) {
    const pts: THREE.Vector3[] = [], n = 7, d = this.v.subVectors(b, a), side = this.v2.set(-d.z, 0, d.x).normalize();
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = a.clone().lerp(b, t);
      if (i > 0 && i < n) p.addScaledVector(side, (Math.random() - 0.5) * jag * 2).add(new THREE.Vector3(0, (Math.random() - 0.5) * jag * 2, 0));
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    const g = new THREE.Group();
    for (const [r, op] of [[0.025, 1], [0.09, 0.35]] as const) {
      const m = new THREE.MeshBasicNodeMaterial({ color: r < 0.05 ? 0xffffff : col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      if (r < 0.05) m.color.lerp(new THREE.Color(col), 0.3);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 4, false), m));
    }
    this.group.add(g); this.arcs.push({ mesh: g, life: 0.16 });
    for (let i = 1; i < pts.length - 1; i += 2) this.env.vfx.spawn(SPARK_ARC, pts[i], { tint: col, count: 0.5 });
  }

  // ── per frame ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** `pos` = the player's feet. Returns the slow factor the hazards want this frame (1 = none). */
  update(dt: number, pos: THREE.Vector3, pulse: number) {
    this.uPulse.value = pulse;
    this.thornCd -= dt; this.wetCd -= dt; this.lavaCd -= dt;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i]; a.life -= dt;
      a.mesh.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicNodeMaterial | undefined; if (m) m.opacity *= Math.max(0, 1 - dt * 9); });
      if (a.life <= 0) { this.group.remove(a.mesh); a.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.arcs.splice(i, 1); }
    }
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      this.near = this.live.filter((L) => Math.hypot(L.h.x - pos.x, L.h.z - pos.z) < L.h.r + (L.h.kind === 'rockfall' ? 70 : 90));
    }
    // a beat: the level's music clock, or our own 124 bpm when the music isn't running
    const bi = this.env.beat();
    let beatNow = false;
    if (bi !== this.beatLast) { beatNow = this.beatLast >= 0; this.beatLast = bi; this.beatT = 0; this.ownBeat = bi; }
    else if ((this.beatT += dt) > 60 / 124) { this.beatT -= 60 / 124; this.ownBeat++; beatNow = true; }
    const beatIdx = this.ownBeat;

    const env = this.env, st = env.status;
    let submerged = false;
    for (const L of this.near) {
      const h = L.h, dx = pos.x - h.x, dz = pos.z - h.z, d = Math.hypot(dx, dz), dy = pos.y - L.y;
      const close = d < 55;
      L.amb -= dt;
      switch (h.kind) {
        case 'thorns':
          if (d < h.r && dy < 1.2 && dy > -1) {
            st.apply('slow', 0.4, 0.5);
            if (this.thornCd <= 0) { this.thornCd = 0.45; env.hurt(4, 'THORNS'); env.vfx.spawn(THORN_SCRATCH, this.v.set(pos.x, pos.y + 0.6, pos.z), { dir: [0, 1, 0] }); env.audio.play('thorn', this.v, { gain: 0.8 }); }
          }
          break;
        case 'toxic':
          if (close && L.amb <= 0) { L.amb = 0.25 + Math.random() * 0.5; const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * h.r * 0.9; env.vfx.spawn(Math.random() < 0.2 ? POISON_WISP : TOXIC_BUBBLE, this.v.set(h.x + Math.cos(a) * r, L.y + 0.05, h.z + Math.sin(a) * r)); }
          if (d < h.r * 0.95 && dy < 0.6) {
            st.apply('poison', 3); st.apply('slow', 0.3, 0.45);
            if (this.wetCd <= 0) { this.wetCd = 0.7; env.audio.play('splash', this.v.set(pos.x, L.y, pos.z), { gain: 0.6 }); }
          }
          break;
        case 'lava':
          if (close && L.amb <= 0) { L.amb = 0.15 + Math.random() * 0.25; const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * h.r * 0.8; env.vfx.spawn(LAVA_EMBERS, this.v.set(h.x + Math.cos(a) * r, L.y + 0.1, h.z + Math.sin(a) * r)); }
          if (d < h.r * 0.95 && dy < 0.7) {
            st.apply('burn', 4);
            if (this.lavaCd <= 0) { this.lavaCd = 0.25; env.hurt(6, 'LAVA'); env.audio.play('sizzle', this.v.set(pos.x, L.y, pos.z), { gain: 0.9, gap: 0.2 }); env.vfx.spawn(LAVA_EMBERS, this.v, { count: 2 }); }
          }
          break;
        case 'deep':
          if (d < h.r && pos.y + 1.45 < L.y) submerged = true;
          if (d < h.r && pos.y < L.y - 0.4) st.apply('slow', 0.25, 0.5);
          break;
        case 'spores': this.spores(L, dt, d, dy, pos); break;
        case 'vent': this.vent(L, dt, d, dy, pos); break;
        case 'rockfall': this.rockfall(L, dt, pos); break;
        case 'fungi': this.fungi(L, dt, d, dy, pos, beatNow, beatIdx); break;
      }
    }
    // the vale's standing water (and any other surface the level reports)
    const ws = env.water?.(pos.x, pos.z);
    if (ws != null) { if (pos.y + 1.45 < ws) submerged = true; if (pos.y < ws - 0.4) st.apply('slow', 0.25, 0.5); }
    if (submerged && !st.submerged) env.audio.play('splash', pos, { gain: 1 });
    st.submerged = submerged;
  }

  private spores(L: Live, dt: number, d: number, dy: number, pos: THREE.Vector3) {
    const h = L.h, env = this.env;
    L.t -= dt;
    const swell = (k: number) => { for (const p of L.parts!) p.scale.copy(p.userData.base as THREE.Vector3).multiplyScalar(1 + k * 0.4); };
    if (L.phase === 'idle') {
      if (L.amb <= 0 && d < 50) { L.amb = 2 + Math.random() * 3; env.vfx.spawn(POISON_WISP, this.v.set(h.x, L.y + 1, h.z), { count: 0.6 }); }
      // you (or the cycle) set it off: it swells and wheezes for 0.9 s — time to back off
      if ((d < h.r + 2 && Math.abs(dy) < 3 && L.t <= 0) || L.t < -(h.every ?? 7) * 2) { L.phase = 'tell'; L.t = 0.9; env.audio.play('hiss', L.at, { gain: 0.9 }); }
    } else if (L.phase === 'tell') {
      const k = 1 - L.t / 0.9; swell(k); L.glow!.value = 1 + k * 2.5;
      if (L.t <= 0) {
        L.phase = 'active'; L.t = 3.5; swell(0); L.glow!.value = 0.4;
        env.vfx.spawn(POISON_MIST, this.v.set(h.x, L.y + 0.8, h.z), { scale: h.r / 3.5 });
        env.audio.play('hiss', L.at, { gain: 1.2, rate: 0.8 });
        env.areaDamage(L.at, h.r + 0.5, 12, 'spores');
      }
    } else if (L.phase === 'active') {
      if (L.amb <= 0) { L.amb = 0.6; env.vfx.spawn(POISON_WISP, this.v.set(h.x + (Math.random() - 0.5) * h.r, L.y + 0.6, h.z + (Math.random() - 0.5) * h.r), { scale: 1.4 }); }
      if (d < h.r + 0.5 && dy < 3) { env.status.apply('poison', 5); }
      if (L.t <= 0) { L.phase = 'idle'; L.t = h.every ?? 7; L.glow!.value = 1; }
    }
  }

  private vent(L: Live, dt: number, d: number, dy: number, pos: THREE.Vector3) {
    const h = L.h, env = this.env, every = h.every ?? 7, TELL = 1.4;
    L.t -= dt;
    if (L.phase === 'idle') {
      L.glow!.value = 0.4 + Math.sin(performance.now() / 300) * 0.1;
      if (L.amb <= 0 && d < 60) { L.amb = 0.8 + Math.random(); env.vfx.spawn(LAVA_EMBERS, this.v.set(h.x, L.y + 1, h.z), { count: 0.5 }); }
      if (L.t <= 0) { L.phase = 'tell'; L.t = TELL; if (d < 70) env.audio.play('rumble', L.at, { gain: 1 }); }
    } else if (L.phase === 'tell') {
      const k = 1 - L.t / TELL; L.glow!.value = 0.5 + k * 2.2;
      if (L.amb <= 0) { L.amb = 0.12; env.vfx.spawn(VENT_SPUTTER, this.v.set(h.x, L.y + 1, h.z), { dir: [0, 1, 0], count: 0.5 + k }); }
      if (L.t <= 0) {
        L.phase = 'active'; L.t = 1.1; L.hitOnce = false;
        env.vfx.spawn(VENT_BURST, this.v.set(h.x, L.y + 1, h.z), { dir: [0, 1, 0] });
        env.audio.play('erupt', L.at, { gain: 1.2, range: 120 });
        env.areaDamage(L.at, h.r + 0.8, 40, 'vent');
      }
    } else if (L.phase === 'active') {
      L.glow!.value = 3;
      if (L.amb <= 0) { L.amb = 0.18; env.vfx.spawn(VENT_BURST, this.v.set(h.x, L.y + 1.5, h.z), { dir: [0, 1, 0], count: 0.35, scale: 0.8 }); }
      if (!L.hitOnce && d < h.r + 0.6 && dy > -1 && dy < 9) { L.hitOnce = true; env.hurt(30, 'ERUPTION'); env.status.apply('burn', 4); }
      if (L.t <= 0) { L.phase = 'idle'; L.t = every - TELL; }
    }
  }

  private rockfall(L: Live, dt: number, pos: THREE.Vector3) {
    const h = L.h, env = this.env, TELL = 1.3, DROP = 18, V0 = (DROP - 0.5 * 9.8 * TELL * TELL) / TELL;
    for (const r of L.rocks!) {
      if (r.state === 'fall') {
        r.v += 9.8 * dt; r.mesh.position.y -= r.v * dt;
        r.mesh.rotation.x += r.spin.x * dt; r.mesh.rotation.y += r.spin.y * dt; r.mesh.rotation.z += r.spin.z * dt;
        if (r.mesh.position.y <= r.target.y + 0.5) {
          r.state = 'rest'; r.t = 5; r.mesh.position.y = r.target.y + 0.45;
          env.vfx.spawn(ROCK_IMPACT, r.target, { dir: [0, 1, 0] });
          env.audio.play('rumble', r.target, { gain: 1.3, rate: 1.3 });
          L.ring!.visible = false;
          const d = Math.hypot(pos.x - r.target.x, pos.z - r.target.z);
          if (d < 2.4 && pos.y - r.target.y < 3) env.hurt(35, 'ROCKFALL');
          env.areaDamage(r.target, 2.6, 60, 'rockfall');
        }
      } else if (r.state === 'rest') {
        r.t -= dt; if (r.t < 1) r.mesh.position.y -= dt * 0.9;
        if (r.t <= 0) { r.state = 'off'; r.mesh.visible = false; }
      }
    }
    L.t -= dt;
    if (L.phase === 'tell') {
      const k = 1 - L.t / TELL, u = L.ring!.userData.k as { value: number };
      u.value = 0.35 + 0.65 * Math.abs(Math.sin(k * Math.PI * 4)); L.ring!.scale.setScalar(0.6 + k * 0.5);
      if (L.amb <= 0) { L.amb = 0.2; env.vfx.spawn(ROCK_TRICKLE, this.v.copy(L.spot!).setY(L.spot!.y + 6 + Math.random() * 6)); }
      if (L.t <= 0) { L.phase = 'idle'; L.t = (h.every ?? 6) * (0.6 + Math.random() * 0.8); }
      return;
    }
    if (L.t > 0) return;
    // the next rock: somewhere in the zone, most often near the player when they are inside it
    const free = L.rocks!.find((r) => r.state === 'off'); if (!free) { L.t = 0.5; return; }
    const inZone = Math.hypot(pos.x - h.x, pos.z - h.z) < h.r + 4;
    let x: number, z: number;
    if (inZone && Math.random() < 0.6) { x = pos.x + (Math.random() - 0.5) * 5; z = pos.z + (Math.random() - 0.5) * 5; }
    else { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * h.r; x = h.x + Math.cos(a) * rr; z = h.z + Math.sin(a) * rr; }
    const gy = env.ground(x, z);
    L.spot!.set(x, gy, z);
    free.target.set(x, gy, z); free.state = 'fall'; free.v = V0; free.mesh.visible = true; free.mesh.position.set(x, gy + DROP, z); free.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
    L.ring!.visible = true; L.ring!.position.set(x, gy + 0.08, z);
    L.phase = 'tell'; L.t = TELL; L.amb = 0;                 // the next rock is scheduled when this tell ends
    env.audio.play('crack', L.spot!, { gain: 1 });
  }

  private fungi(L: Live, dt: number, d: number, dy: number, pos: THREE.Vector3, beatNow: boolean, beat: number) {
    const h = L.h, env = this.env, every = Math.max(2, Math.round(h.every ?? 4));
    if (d > 60) { L.glow!.value = 1; return; }
    const until = (every - (beat % every)) % every;          // beats until the discharge (0 = this beat)
    // the beat before: caps flare and crackle (the tell); on the beat: lightning into anything near
    L.glow!.value = until === 1 ? 2.2 + Math.random() * 0.8 : 1 + (L.glow!.value - 1) * Math.exp(-dt * 6);
    if (until === 1 && L.amb <= 0) { L.amb = 0.08; const c = L.parts![Math.floor(Math.random() * L.parts!.length)].position; env.vfx.spawn(SPARK_CHARGE, c, { tint: 0x5ef0ff }); }
    if (beatNow && until === 1) env.audio.play('zap', L.at, { gain: 0.45, rate: 1.4, gap: 0.3 });
    if (beatNow && until === 0 && L.lastBeat !== beat) {
      L.lastBeat = beat; L.glow!.value = 4;
      const caps = L.parts!;
      for (let i = 0; i < Math.min(3, caps.length - 1); i++) this.arc(caps[i].position.clone().setY(caps[i].position.y + 0.3), caps[i + 1].position.clone().setY(caps[i + 1].position.y + 0.3), 0x5ef0ff, 0.25);
      env.audio.play('zap', L.at, { gain: 1, gap: 0.3 });
      if (d < h.r + 0.8 && dy < 3 && dy > -1.5) {
        const c = caps.reduce((b, p) => (p.position.distanceToSquared(pos) < b.position.distanceToSquared(pos) ? p : b), caps[0]);
        this.arc(c.position.clone().setY(c.position.y + 0.3), pos.clone().setY(pos.y + 1.1));
        env.hurt(16, 'SHOCKED'); env.status.apply('shock', 0.8);
      }
      env.areaDamage(L.at, h.r + 0.8, 20, 'fungi');
    }
  }

  /** Debug: positions and phases. */
  info() { return this.live.map((L) => ({ id: L.h.id, kind: L.h.kind, y: +L.y.toFixed(1), phase: L.phase })); }
  /** Debug: the live record of a hazard. */
  get(id: string) { return this.live.find((L) => L.h.id === id); }
}
