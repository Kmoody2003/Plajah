// Forage: the forest gives as well as hurts. Fungi, berries and fruit (kinds in forageTable.ts, placed by spots.ts FORAGE
// and, later, from the forest map's own vegetation through addSites()). Hold the eat action by one (danger/eat.ts).
// Good and bad kinds share colours; you tell them apart by the glow's rhythm (slow breath / on the beat vs fast
// flicker / off the beat / twinkle) and by a "look closer" tell that only shows within a few metres (a pale ring
// under the cap, a dark seam on each berry, fine spines, sweet smoke dripping from a pod). Near one, a prompt names it
// if you've learned it ("??? — look closer" if not); the first bite of each kind shows a hint with its tell.
// Effects run as HUD chips with timers (status.ts). Eaten ones grow back after a while.
import * as THREE from 'three/webgpu';
import { cameraPosition, color, distance, exp, float, floor, fract, max, min, positionWorld, sin, smoothstep, step, time, uniform } from 'three/tsl';
import type { VfxSystem, Recipe } from '../../../../services/vfx';
import { PICKUP_GLINT, POISON_MIST } from '../../../../services/vfx/hazards';
import type { DangerAudio } from './audio';
import type { PlayerStatus } from './status';
import type { ForagePatch } from './spots';
import { forageTable, type ForageKind } from './forageTable';

export interface ForageEnv {
  scene: THREE.Scene;
  vfx: VfxSystem;
  audio: DangerAudio;
  status: PlayerStatus;
  lo: boolean;
  ground(x: number, z: number): number;
  /** 0…1 position inside the current beat (rhythm.phase; 0 = on the beat). */
  phase(): number;
  heal(n: number): void;
  hurt(dmg: number, why: string): void;
  addResonance(n: number): void;
  /** The musk scent: predators hear/smell you from far away. */
  lure(pos: THREE.Vector3): void;
  hint(text: string, color: string): void;
}

export interface Item { id: string; kind: string; k: ForageKind; pos: THREE.Vector3; obj: THREE.Group; alive: boolean; regrow: number; smokeT: number }

/** Sweet musk smoke dripping from a Musk Pod (its tell). */
const MUSK_DRIP: Recipe = {
  id: 'musk_drip',
  emitters: [{ layer: 'alpha', shape: 'smoke', count: 1, life: [1.2, 2], speed: [0.05, 0.2], spread: 0.4, size: [0.08, 0.35], color: [0xffb0d8, 0xc87aa8], alpha: [0.45, 0], gravity: 0.6, drag: 1.5 }],
};
const SEEN_KEY = 'rrForageSeen';
const lcg = (seed: number) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

export class Forage {
  readonly group = new THREE.Group();
  readonly items: Item[] = [];
  private table = forageTable();
  private mats = new Map<string, { body: THREE.Material; glow: THREE.Material; tell: THREE.Material | null; stem: THREE.Material }>();
  private uPhase = uniform(0);
  private seen = new Set<string>();
  private regenLeft = 0; private regenRate = 0; private regenAcc = 0;
  private lureT = 0;
  /** Damage dealt multiplier (Furyberry) and move multiplier (Swiftpod), read by the game. */
  dmgMul = 1; moveMul = 1;
  shield = 0;
  private view: HTMLElement | null = document.getElementById('view');
  private v = new THREE.Vector3();
  private geo = {
    stem: new THREE.CylinderGeometry(0.05, 0.08, 1, 7), cap: new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    gill: new THREE.CircleGeometry(0.28, 16), ring: new THREE.TorusGeometry(0.2, 0.018, 5, 20), spine: new THREE.ConeGeometry(0.012, 0.12, 4),
    berry: new THREE.SphereGeometry(0.07, 10, 8), seam: new THREE.TorusGeometry(0.068, 0.009, 4, 14), leaf: new THREE.IcosahedronGeometry(0.22, 0),
    pod: new THREE.SphereGeometry(0.16, 14, 10),
  };

  constructor(private env: ForageEnv, patches: ForagePatch[]) {
    this.group.name = 'danger-forage';
    env.scene.add(this.group);
    try { for (const k of JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]) this.seen.add(k); } catch { /* none */ }
    this.geo.gill.rotateX(Math.PI / 2); this.geo.ring.rotateX(Math.PI / 2); this.geo.seam.rotateX(Math.PI / 2);
    for (const p of patches) {
      const R = lcg(Math.abs(Math.round(p.x * 31 + p.z * 17)) + 7);
      for (let i = 0; i < p.n; i++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * p.r, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        this.add(`${p.id}-${i}`, p.kinds[i % p.kinds.length], x, env.ground(x, z), z, R());
      }
    }
  }

  /** Hook for the forest map: make some of its vegetation instances edible ({x, y, z, kind} with a kind from the table). */
  addSites(sites: { x: number; y: number; z: number; kind: string }[]) { sites.forEach((s, i) => this.add(`site-${this.items.length}-${i}`, s.kind, s.x, s.y, s.z, Math.random())); }

  /** Live fruit (predators wander to it on patrol). */
  attractors(): THREE.Vector3[] { return this.items.filter((it) => it.alive && it.k.shape === 'fruit').map((it) => it.pos); }

  // ── looks ─────────────────────────────────────────────────────────────────────────────────────────────────────
  private rhythm(k: ForageKind) {
    const ph = this.uPhase, seed = positionWorld.x.mul(3.1).add(positionWorld.z.mul(1.7));
    switch (k.rhythm) {
      case 'breath': return sin(time.mul(1.3).add(seed)).mul(0.3).add(0.7);
      case 'steady': return float(0.85);
      case 'beat': { const d = min(ph, float(1).sub(ph)); return exp(d.mul(d).mul(-60)).mul(1.1).add(0.25); }
      case 'offbeat': { const d = ph.sub(0.5); return exp(d.mul(d).mul(-60)).mul(1.1).add(0.25); }
      case 'flicker': return step(float(0.45), fract(sin(floor(time.mul(13)).add(seed).mul(12.9898)).mul(43758.5))).mul(0.75).add(0.3);
      case 'twinkle': return max(sin(time.mul(7).add(positionWorld.x.mul(41)).add(positionWorld.y.mul(23))), 0).pow(6).mul(1.4).add(0.45);
    }
  }
  private mat(kind: string, k: ForageKind) {
    let m = this.mats.get(kind);
    if (m) return m;
    const body = new THREE.MeshStandardNodeMaterial({ color: k.color, roughness: 0.45 });
    body.emissiveNode = color(k.glow).mul(this.rhythm(k)).mul(0.75);
    const glow = new THREE.MeshStandardNodeMaterial({ color: k.color, roughness: 0.3 });
    glow.emissiveNode = color(k.glow).mul(this.rhythm(k)).mul(1.6);
    const stem = new THREE.MeshStandardNodeMaterial({ color: k.shape === 'cap' ? 0xc8d8d0 : 0x24361a, roughness: 0.7 });
    let tell: THREE.Material | null = null;
    if (k.tell !== 'none' && k.tell !== 'smoke') {
      // only visible up close: fades in from 7 m to 3.5 m
      const t = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      const near = smoothstep(float(7), float(3.5), distance(cameraPosition, positionWorld));
      t.colorNode = k.tell === 'seam' ? color(0x0a0604) : color(0xf0f4ff).mul(1.3);
      t.opacityNode = near.mul(k.tell === 'seam' ? 0.95 : 0.85);
      tell = t;
    }
    m = { body, glow, tell, stem };
    this.mats.set(kind, m);
    return m;
  }

  private add(id: string, kind: string, x: number, y: number, z: number, r: number) {
    const k = this.table[kind];
    if (!k) return;
    const M = this.mat(kind, k), g = new THREE.Group(), G = this.geo;
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, s = 1) => { const o = new THREE.Mesh(geo, mat); o.position.set(px, py, pz); o.scale.setScalar(s); g.add(o); return o; };
    if (k.shape === 'cap') {
      const n = 1 + Math.floor(r * 3);                                    // a cluster of 1–3 caps
      for (let i = 0; i < n; i++) {
        const s = (0.8 + ((r * 7 + i * 0.37) % 1) * 0.6) * (i ? 0.7 : 1), ox = i ? Math.cos(i * 2.4 + r * 6) * 0.3 : 0, oz = i ? Math.sin(i * 2.4 + r * 6) * 0.3 : 0, h = 0.45 * s;
        const st = mesh(G.stem, M.stem, ox, h / 2, oz); st.scale.set(s, h, s);
        mesh(G.cap, M.body, ox, h - 0.02, oz, s);
        mesh(G.gill, M.glow, ox, h - 0.03, oz, s);                       // the glowing gills underneath
        if (M.tell && k.tell === 'ring') mesh(G.ring, M.tell, ox, h - 0.07 * s, oz, s * 0.55);
        if (M.tell && k.tell === 'spines') for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2; const sp = mesh(G.spine, M.tell, ox + Math.cos(a) * 0.06 * s, h * (0.3 + (j % 3) * 0.2), oz + Math.sin(a) * 0.06 * s, s); sp.rotation.set(Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3); }
      }
    } else if (k.shape === 'berries') {
      for (let i = 0; i < 4; i++) { const lf = mesh(G.leaf, M.stem, Math.cos(i * 1.7) * 0.18, 0.22 + (i % 2) * 0.1, Math.sin(i * 1.7) * 0.18, 1 + (i % 2) * 0.3); lf.scale.y *= 0.8; }
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39 + r * 6, rr = 0.18 + (i % 3) * 0.06, px = Math.cos(a) * rr, py = 0.3 + ((i * 0.31) % 1) * 0.28, pz = Math.sin(a) * rr;
        mesh(G.berry, M.glow, px, py, pz);
        if (M.tell && k.tell === 'seam') { const sm = mesh(G.seam, M.tell, px, py, pz); sm.rotation.set(i, i * 0.7, 0); }
        if (M.tell && k.tell === 'spines') for (let j = 0; j < 3; j++) { const sp = mesh(G.spine, M.tell, px, py, pz, 0.8); sp.rotation.set(i + j * 2.1, j * 1.3, i * 0.5); sp.translateY(0.07); }
      }
    } else {
      const st = mesh(G.stem, M.stem, 0, 0.4, 0); st.scale.set(0.7, 0.8, 0.7);
      mesh(G.leaf, M.stem, 0.12, 0.8, 0, 0.8); mesh(G.leaf, M.stem, -0.1, 0.72, 0.08, 0.7);
      for (let i = 0; i < 2; i++) { const pd = mesh(G.pod, M.glow, (i ? -0.14 : 0.13), 0.55 - i * 0.08, (i ? 0.05 : -0.04)); pd.scale.set(1, 1.35, 1); }
    }
    g.position.set(x, y, z); g.rotation.y = r * 6.28;
    g.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    this.group.add(g);
    this.items.push({ id, kind, k, pos: new THREE.Vector3(x, y, z), obj: g, alive: true, regrow: 0, smokeT: r });
  }

  // ── eating ────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Eat a forage item (the eat action, danger/eat.ts). */
  eat(it: Item) {
    it.alive = false; it.obj.visible = false; it.regrow = it.k.respawn;
    this.consume(it.kind, it.pos);
  }

  /** Apply what eating / drinking `kind` does (forage, meat, water), with its sound, VFX and first-time hint. */
  consume(kind: string, where: THREE.Vector3) {
    const k = this.table[kind]; if (!k) return;
    const env = this.env;
    let hint = this.seen.has(kind) ? '' : k.hint;
    if (k.risk && Math.random() < k.risk.chance) { this.apply(k.risk.effect, k); hint = k.risk.hint; }
    const at = this.v.copy(where).setY(where.y + 0.5);
    if (k.shape === 'water') env.audio.play('splash', at, { gain: 0.7, rate: 1.3 });
    else env.audio.play('crack', at, { gain: 0.6, rate: k.shape === 'meat' ? 0.8 : 1.6 });
    if (k.good) { env.vfx.spawn(PICKUP_GLINT, at, { tint: k.glow }); env.audio.play('zap', at, { gain: 0.45, rate: 2.2 }); }
    else { env.vfx.spawn(POISON_MIST, at, { scale: 0.35 }); env.audio.play('hiss', at, { gain: 0.6, rate: 1.3 }); }
    this.apply(k.effect, k);
    if (!this.seen.has(kind)) {
      this.seen.add(kind);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen])); } catch { /* private mode */ }
    }
    env.hint(hint || k.name.toUpperCase(), k.good ? '#7dffb0' : '#fb7185');
  }

  private apply(e: ForageKind['effect'], k: ForageKind) {
    const env = this.env, st = env.status;
    switch (e.kind) {
      case 'heal': env.heal(e.amount); break;
      case 'regen': this.regenLeft = e.seconds; this.regenRate = e.amount / e.seconds; st.buff('regen', 'REGEN', '#7dffb0', e.seconds); break;
      case 'haste': st.buff('haste', 'SWIFT', '#9cff4a', e.seconds); this.hasteMul = e.mul; break;
      case 'fury': st.buff('fury', 'FURY', '#ff4860', e.seconds); this.furyMul = e.mul; break;
      case 'resonance': env.addResonance(e.amount); break;
      case 'shield': this.shield = Math.max(this.shield, e.amount); st.buff('shield', `SHIELD ${e.amount}`, '#8fd8ff', e.seconds); break;
      case 'poison': st.apply('poison', e.seconds); if (e.dmg) env.hurt(e.dmg, k.name.toUpperCase()); break;
      case 'slow': st.apply('slow', e.seconds, e.amount); break;
      case 'blur': st.buff('blur', 'DAZED', '#b36aff', e.seconds); break;
      case 'lure': st.buff('lure', 'MUSK SCENT', '#ffb0d8', e.seconds); this.lureT = 0; break;
    }
  }

  /** The kind table (the eat action reads names / eat times). */
  kind(id: string): ForageKind | undefined { return this.table[id]; }
  /** Have you eaten one of these before (so the prompt can name it)? */
  known(id: string) { return this.seen.has(id); }
  /** The nearest uneaten item within `r` of `at`. */
  nearest(at: THREE.Vector3, r: number): Item | null {
    let best: Item | null = null, bd = r;
    for (const it of this.items) { if (!it.alive) continue; const d = Math.hypot(it.pos.x - at.x, it.pos.z - at.z); if (d < bd && Math.abs(at.y - it.pos.y) < 2) { best = it; bd = d; } }
    return best;
  }
  private hasteMul = 1; private furyMul = 1;

  /** Shield (Shellfruit) soaks damage first: returns what gets through. */
  absorb(dmg: number) {
    if (this.shield <= 0 || this.env.status.buffLeft('shield') <= 0) { this.shield = 0; return dmg; }
    const took = Math.min(this.shield, dmg);
    this.shield -= took;
    if (this.shield <= 0) this.env.status.endBuff('shield');
    else this.env.status.buff('shield', `SHIELD ${Math.ceil(this.shield)}`, '#8fd8ff', 0);
    return dmg - took;
  }

  update(dt: number, playerPos: THREE.Vector3, active: boolean) {
    const env = this.env, st = env.status;
    this.uPhase.value = env.phase();
    // effects on timers
    this.moveMul = st.buffLeft('haste') > 0 ? this.hasteMul : 1;
    this.dmgMul = st.buffLeft('fury') > 0 ? this.furyMul : 1;
    if (this.regenLeft > 0) { this.regenLeft -= dt; this.regenAcc += this.regenRate * dt; if (this.regenAcc >= 1) { const n = Math.floor(this.regenAcc); this.regenAcc -= n; env.heal(n); } }
    if (st.buffLeft('lure') > 0 && (this.lureT -= dt) <= 0) { this.lureT = 2; env.lure(playerPos); }
    if (this.view) {
      const b = st.buffLeft('blur');
      const want = b > 0 ? `blur(${(2 + Math.sin(performance.now() / 300) * 1.2).toFixed(2)}px) hue-rotate(${Math.round(Math.sin(performance.now() / 900) * 40)}deg) saturate(1.4)` : '';
      if (this.view.style.filter !== want) this.view.style.filter = want;
    }
    // regrowth and smoke tells (eating is the eat action, danger/eat.ts)
    for (const it of this.items) {
      if (!it.alive) { if ((it.regrow -= dt) <= 0) { it.alive = true; it.obj.visible = true; } continue; }
      const dx = it.pos.x - playerPos.x, dz = it.pos.z - playerPos.z, d = Math.hypot(dx, dz);
      if (d > 40) continue;
      if (it.k.tell === 'smoke' && d < 9 && (it.smokeT -= dt) <= 0) { it.smokeT = 0.5 + Math.random() * 0.4; env.vfx.spawn(MUSK_DRIP, this.v.copy(it.pos).setY(it.pos.y + 0.45)); }
    }
    void active;
  }

  info() { return { items: this.items.length, alive: this.items.filter((i) => i.alive).length, seen: [...this.seen], dmgMul: this.dmgMul, moveMul: this.moveMul, shield: this.shield }; }
}
