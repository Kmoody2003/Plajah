// The mycelium network: the fungi and mushrooms are aware of you.
//  · Warnings: for a light soul, poisonous fungi near you glow red (a pulsing red halo and a ring on the ground).
//  · Guidance: roots surface and glow green, pulsing toward the nearest healthy mushroom (and the forest map's glow
//    vines carry the same pulse through guideNode.ts).
//  · Connection: every healthy mushroom you eat deepens your connection (levels 0–4): guidance reaches further, the
//    fungi give more charge, warnings come earlier, and at level 3 the mycelium warns you of predators on the hunt.
//  · Hostility: for a dark soul, or anyone fighting close to them, fungi turn on you: spore bursts and entangling roots,
//    each with a tell first.
//  · Spirit charge: some fungi (about one in eight, and every Chargecap) hold spirit energy; stand near one and it
//    recharges your gun (weapons' addCharge). Chargecaps can be picked.
import * as THREE from 'three/webgpu';
import { abs, color, dot, float, normalView, positionViewDirection, sin, time, uniform } from 'three/tsl';
import type { Recipe, VfxSystem } from '../../../../services/vfx';
import { POISON_MIST } from '../../../../services/vfx/hazards';
import type { PlayerController } from '../player';
import type { Forage, Item } from './forage';
import type { SoulMeter } from './soul';
import type { DangerAudio } from './audio';
import type { PlayerStatus } from './status';
import { mycelGuideEmissive, setGuide } from './guideNode';
import { forest, type ForestEvent } from './forest';

/** A spirit fungus holds this much charge and refills this fast (a top-up on the way, not a turret to camp). */
const SPIRIT_STORE = 45, SPIRIT_REFILL = 0.75;
/** Healthy mushrooms eaten → connection level. */
const LEVELS = [0, 1, 3, 6, 10];
const GUIDE_R = [28, 45, 65, 90, 120];
const LEVEL_TEXT = [
  '',
  'MYCELIUM CONNECTION I · the roots guide you further',
  'MYCELIUM CONNECTION II · the fungi share more spirit, and warn you of spore pods',
  'MYCELIUM CONNECTION III · the mycelium warns you of predators on the hunt',
  'MYCELIUM CONNECTION IV · the whole forest floor speaks to you',
];

const SPIRIT_PLUME: Recipe = {
  id: 'spirit_plume',
  emitters: [{ layer: 'add', shape: 'soft', count: [1, 2], life: [1.4, 2.4], speed: [0.4, 0.9], spread: 0.25, size: [0.06, 0.01], color: [0xffffff, 0xffe46a], intensity: 2, gravity: -0.3, turbulence: 0.6, radius: 0.25 }],
};
const SPIRIT_DRAW: Recipe = {
  id: 'spirit_draw',
  emitters: [{ layer: 'add', shape: 'soft', count: [2, 3], life: [0.4, 0.7], speed: [2.5, 4], spread: 0.15, size: [0.05, 0.01], color: [0xffffff, 0xffe46a], intensity: 2.4, drag: 0.5 }],
};
const ROOT_TELL: Recipe = {
  id: 'root_tell',
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.9, speed: 0, size: [2.2, 0.6], color: [0xff3a2a, 0x801008], intensity: 1.4, alpha: [0.2, 0.9] },
    { layer: 'shard', count: [4, 6], life: [0.4, 0.8], speed: [1, 2.2], spread: 0.5, size: [0.05, 0.03], color: [0x2a1a10, 0x1a0e08], intensity: 0.4, alpha: [1, 1], gravity: 9, radius: 0.8 },
  ],
};
const FUNGUS_FLARE: Recipe = {
  id: 'fungus_flare',
  emitters: [{ layer: 'add', shape: 'soft', count: [6, 9], life: [0.5, 0.9], speed: [0.5, 1.4], spread: 0.8, size: [0.1, 0.02], color: [0xff5a3a, 0xff1a1a], intensity: 2, gravity: -0.5, radius: 0.3 }],
};
/** Green spores drifting along the guidance path toward the mushroom (readable over tall grass). */
const GUIDE_MOTE: Recipe = {
  id: 'guide_mote',
  emitters: [{ layer: 'add', shape: 'soft', count: 1, life: [1.6, 2.4], speed: [2.2, 3], spread: 0.08, size: [0.07, 0.03], color: [0xc8ffd0, 0x3cff6a], intensity: 2.4, drag: 0.15, turbulence: 0.3 }],
};
const REVEAL_PING: Recipe = {
  id: 'reveal_ping',
  emitters: [{ layer: 'add', shape: 'ring', count: 1, life: 1, speed: 0, size: [0.2, 2.4], color: [0xc8ffb0, 0x5aff8a], intensity: 1.2, alpha: [0.8, 0] }],
};

export interface MyceliumEnv {
  scene: THREE.Scene;
  vfx: VfxSystem;
  audio: DangerAudio;
  status: PlayerStatus;
  player: PlayerController;
  forage: Forage;
  soul: SoulMeter;
  lo: boolean;
  ground(x: number, z: number): number;
  charge(n: number, src: string): void;
  /** How full the gun's charge is, 0…1 (if the weapons share it): low charge points guidance at a Chargecap. */
  chargeFrac?(): number | null;
  hurt(dmg: number, why: string): void;
  say(text: string, color: string): void;
  /** Spore pods and shock fungi from the hazards (they join the network). */
  hazardFungi(): { x: number; y: number; z: number; kind: string }[];
  /** Seconds since the player last fired or struck. */
  sinceCombat(): number;
}

type Site = { x: number; y: number; z: number; item?: Item; spirit: boolean; store: number; plumeT: number };

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967295; };

export class Mycelium {
  readonly group = new THREE.Group();
  /** Healthy mushrooms eaten this session. */
  eaten = 0;
  level = 0;
  private sites: Site[] = [];
  private halos: { g: THREE.Group; used: boolean }[] = [];
  private haloMat: THREE.Material; private ringMat: THREE.Material;
  private roots: THREE.Mesh | null = null;
  private rootMat: THREE.MeshStandardNodeMaterial;
  private rootFrom = new THREE.Vector3(1e9, 0, 0); private rootTo: Item | null = null; private rootT = 0;
  private beacon: THREE.Mesh;
  private reveals: THREE.Mesh[] = [];
  private revealT = 0;
  private guideOn = 0;
  private moteT = 0;
  private target: Item | null = null;
  private hostT = 4;
  private pending: { at: number; kind: 'burst' | 'roots'; pos: THREE.Vector3 }[] = [];
  private rootSpikes: THREE.Group;
  private spikeT = 0;
  private clock = 0;
  private v = new THREE.Vector3();
  private chip: HTMLDivElement;
  private chipT = 0;
  private treeAnger: { x: number; z: number; until: number }[] = [];
  private beatGlow = uniform(0);
  private unsub: (() => void)[] = [];
  private lastPred = new Map<string, number>();

  constructor(private env: MyceliumEnv) {
    this.group.name = 'danger-mycelium';
    env.scene.add(this.group);
    // red warning halo (fresnel shell) and a ground ring, pooled
    const halo = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const fres = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(1.6);
    const pulse = sin(time.mul(6)).mul(0.35).add(0.75);
    halo.colorNode = color(0xff2a1a).mul(2.2);
    halo.opacityNode = fres.mul(pulse).mul(0.9);
    this.haloMat = halo;
    const ring = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    ring.colorNode = color(0xff3020).mul(1.8);
    ring.opacityNode = sin(time.mul(6)).mul(0.3).add(0.55);
    this.ringMat = ring;
    // the surfacing roots: dark threads that carry the guidance glow
    this.rootMat = new THREE.MeshStandardNodeMaterial({ color: 0x0c140a, roughness: 0.7 });
    this.rootMat.emissiveNode = mycelGuideEmissive().mul(2.2).add(color(0x2aa04a).mul(this.beatGlow).mul(0.6));
    // a soft green column over the mushroom the roots point at
    const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    bm.colorNode = color(0x5aff7a).mul(1.4);
    bm.opacityNode = float(0.35).mul(sin(time.mul(2.5)).mul(0.3).add(0.7)).mul(this.beatGlow.add(0.2).min(1));
    const bg = new THREE.CylinderGeometry(0.25, 0.6, 7, 16, 1, true); bg.translate(0, 3.5, 0);
    this.beacon = new THREE.Mesh(bg, bm); this.beacon.visible = false; this.beacon.frustumCulled = false;
    this.group.add(this.beacon);
    // revealed forage: thinner gold-green columns
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    rm.colorNode = color(0xc8ff7a).mul(1.2); rm.opacityNode = float(0.3).mul(sin(time.mul(3)).mul(0.3).add(0.7));
    const rg = new THREE.CylinderGeometry(0.12, 0.35, 5, 10, 1, true); rg.translate(0, 2.5, 0);
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(rg, rm); m.visible = false; this.group.add(m); this.reveals.push(m); }
    // entangling roots: curled spikes that burst up round the player
    this.rootSpikes = new THREE.Group(); this.rootSpikes.visible = false;
    const sm = new THREE.MeshStandardNodeMaterial({ color: 0x1a0e08, roughness: 0.8 });
    sm.emissiveNode = color(0xff3a1a).mul(0.35);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, pts = [0, 0.4, 0.8, 1.15].map((h, j) => new THREE.Vector3(Math.cos(a) * (0.7 - j * 0.12), h, Math.sin(a) * (0.7 - j * 0.12) + Math.sin(j * 1.7 + i) * 0.08));
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.05, 5, false), sm);
      this.rootSpikes.add(t);
    }
    this.group.add(this.rootSpikes);
    this.chip = document.createElement('div');
    this.chip.style.cssText = 'position:fixed;left:50%;top:9%;transform:translateX(-50%);z-index:13;pointer-events:none;padding:6px 14px;border:1px solid #ff8a5a;border-radius:3px;background:#1a0804c0;color:#ffb08a;font:700 12px/1.3 system-ui,sans-serif;letter-spacing:.12em;opacity:0;transition:opacity .3s';
    document.body.appendChild(this.chip);
    this.buildSites();
    // the network carries news: predators on the hunt (level 3+), trees struck (the ents' 'tree-hit')
    this.unsub.push(forest.subscribe('predator', (ev) => this.predatorNews(ev), { at: () => this.env.player.object.position }));
    this.unsub.push(forest.subscribe('tree-hit', (ev) => { this.treeAnger.push({ x: ev.pos.x, z: ev.pos.z, until: this.clock + 25 }); }));
  }

  private buildSites() {
    for (const it of this.env.forage.items) {
      if (it.k.shape !== 'cap') continue;
      const spirit = it.kind === 'chargecap' || (it.k.good && hash(it.id) < 0.1);
      this.sites.push({ x: it.pos.x, y: it.pos.y, z: it.pos.z, item: it, spirit, store: SPIRIT_STORE, plumeT: hash(it.id + 'p') * 2 });
    }
    for (const f of this.env.hazardFungi()) this.sites.push({ x: f.x, y: f.y, z: f.z, spirit: hash(`${f.x},${f.z}`) < 0.15, store: SPIRIT_STORE, plumeT: 1 });
  }

  /** A healthy mushroom was eaten: the connection deepens. */
  ateGood() {
    this.eaten++;
    let lv = 0; for (let i = 0; i < LEVELS.length; i++) if (this.eaten >= LEVELS[i]) lv = i;
    if (lv > this.level) {
      this.level = lv;
      this.env.say(LEVEL_TEXT[lv], '#8aff9a');
      forest.notify('fungus', this.env.player.object.position, { act: 'connect', level: lv }, 'mycelium');
    }
  }

  /** A gift: the good forage around you lights up for `sec`. */
  reveal(sec: number) { this.revealT = sec; this.env.vfx.spawn(REVEAL_PING, this.v.copy(this.env.player.object.position).setY(this.env.player.object.position.y + 0.1)); }

  private predatorNews(ev: ForestEvent) {
    if (this.level < 3) return;
    const pp = this.env.player.object.position, dx = ev.pos.x - pp.x, dz = ev.pos.z - pp.z, d = Math.hypot(dx, dz);
    if (d > 70) return;
    const who = String(ev.data.name ?? ev.data.kind ?? 'something');
    if ((this.lastPred.get(who) ?? -99) > this.clock - 15) return;
    this.lastPred.set(who, this.clock);
    const ang = Math.atan2(dx, -dz) * 180 / Math.PI, dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dir = dirs[((Math.round(ang / 45) % 8) + 8) % 8];
    this.chip.textContent = `THE MYCELIUM STIRS · ${who} hunting · ${dir} ${Math.round(d)} m`;
    this.chip.style.opacity = '1'; this.chipT = 4;
    this.env.audio.play('hiss', this.v.copy(pp), { gain: 0.25, rate: 0.6 });
  }

  /** Spore pods and fungi are hostile here (dark soul, a fight close by, or trees struck nearby)? 0…1. */
  private hostility(x: number, z: number) {
    const s = this.env.soul.soul;
    let h = s <= -0.3 ? Math.min(1, 0.4 + -s * 0.6) : 0;
    if (this.env.sinceCombat() < 4) h = Math.max(h, s >= 0.3 ? 0.08 : 0.35);
    for (const a of this.treeAnger) if (a.until > this.clock && Math.hypot(a.x - x, a.z - z) < 30) h = Math.max(h, 0.6);
    return h;
  }

  update(dt: number) {
    this.clock += dt;
    const env = this.env, pl = env.player, pp = pl.object.position, s = env.soul.soul;
    const live = pl.enabled && !pl.downed;
    this.treeAnger = this.treeAnger.filter((a) => a.until > this.clock);
    if ((this.chipT -= dt) <= 0) this.chip.style.opacity = '0';

    // ── warnings: poisonous fungi glow red for a light soul ──
    for (const h of this.halos) h.used = false;
    const warnR = s >= 0.3 ? 6 + this.level * 1.5 + (this.level >= 3 ? 4 : 0) : this.level >= 2 ? 3.5 : 0;
    if (warnR > 0 && live) {
      let n = 0;
      for (const it of env.forage.items) {
        if (n >= 10) break;
        if (!it.alive || it.k.good || it.k.shape !== 'cap') continue;
        if (Math.hypot(it.pos.x - pp.x, it.pos.z - pp.z) > warnR) continue;
        this.halo(n++, it.pos, 0.55);
      }
      if (this.level >= 2) for (const f of env.hazardFungi()) { if (n >= 10) break; if (f.kind === 'spores' && Math.hypot(f.x - pp.x, f.z - pp.z) < warnR + 4) this.halo(n++, this.v.set(f.x, f.y, f.z), 1.4); }
    }
    for (const h of this.halos) if (!h.used && h.g.visible) h.g.visible = false;

    // ── guidance: the nearest healthy mushroom (a Chargecap when the gun runs low) ──
    const range = GUIDE_R[this.level];
    const low = (env.chargeFrac?.() ?? 1) < 0.3;
    let best: Item | null = null, bd = range;
    for (const it of env.forage.items) {
      if (!it.alive || !it.k.good || it.k.shape !== 'cap') continue;
      const d = Math.hypot(it.pos.x - pp.x, it.pos.z - pp.z) * (low && it.kind === 'chargecap' ? 0.5 : 1);
      if (d < bd && d > 2.2) { best = it; bd = d; }
    }
    const want = best && live && s > -0.3 && env.sinceCombat() > 3 ? 1 : 0;
    this.guideOn += (want - this.guideOn) * Math.min(1, dt * (want ? 1.5 : 3));
    if (best) this.target = best;
    const tgt = this.target;
    setGuide(pp, tgt?.pos ?? null, this.guideOn, 4 + this.level);
    this.beatGlow.value = this.guideOn;
    if (tgt && this.guideOn > 0.02) {
      this.beacon.visible = true; this.beacon.position.copy(tgt.pos);
      if ((this.rootT -= dt) <= 0 && (this.rootTo !== tgt || this.rootFrom.distanceTo(pp) > 2.5)) { this.rootT = 0.35; this.buildRoots(pp, tgt); }
      if (this.roots) this.roots.visible = true;
      if ((this.moteT -= dt) <= 0) {
        this.moteT = this.env.lo ? 0.3 : 0.14;
        const dx = tgt.pos.x - pp.x, dz = tgt.pos.z - pp.z, L = Math.hypot(dx, dz), f = Math.random() * Math.min(1, 30 / L);
        const x = pp.x + dx * f + (Math.random() - 0.5) * 1.2, z = pp.z + dz * f + (Math.random() - 0.5) * 1.2;
        this.env.vfx.spawn(GUIDE_MOTE, this.v.set(x, this.env.ground(x, z) + 0.6 + Math.random() * 0.5, z), { dir: [dx / L, 0.02, dz / L] });
      }
    } else { this.beacon.visible = false; if (this.roots) this.roots.visible = false; if (this.guideOn < 0.02) this.target = null; }

    // ── reveal (a creature's gift) ──
    this.revealT -= dt;
    let r = 0;
    if (this.revealT > 0) for (const it of env.forage.items) {
      if (r >= this.reveals.length) break;
      if (!it.alive || !it.k.good || it.pos.distanceTo(pp) > 55) continue;
      const m = this.reveals[r++]; m.visible = true; m.position.copy(it.pos);
    }
    for (let i = r; i < this.reveals.length; i++) this.reveals[i].visible = false;

    // ── spirit: fungi that hold charge recharge the gun when you stand close ──
    for (const st of this.sites) {
      if (!st.spirit || (st.item && !st.item.alive)) continue;
      st.store = Math.min(SPIRIT_STORE, st.store + dt * SPIRIT_REFILL);
      const d = Math.hypot(st.x - pp.x, st.z - pp.z);
      if (d > 35) continue;
      if ((st.plumeT -= dt) <= 0 && st.store > 10) { st.plumeT = env.lo ? 1.2 : 0.6; env.vfx.spawn(SPIRIT_PLUME, this.v.set(st.x, st.y + 0.5, st.z)); }
      if (d < 3.2 && live && s > -0.3 && st.store > 1) {
        const n = Math.min(st.store, dt * 8 * (1 + this.level * 0.25));
        st.store -= n; env.charge(n, 'fungus');
        if (Math.random() < dt * 6) env.vfx.spawn(SPIRIT_DRAW, this.v.set(st.x, st.y + 0.5, st.z), { dir: [pp.x - st.x, pp.y + 1 - st.y - 0.5, pp.z - st.z] });
        env.status.buff('spirit', 'SPIRIT CHARGING', '#ffe46a', 0.6);
      }
    }

    // ── hostility: spore bursts and entangling roots, each with a tell ──
    this.hostT -= dt;
    if (this.hostT <= 0 && live) {
      this.hostT = 1;
      let near: Site | null = null, nd = 9;
      for (const st of this.sites) { const d = Math.hypot(st.x - pp.x, st.z - pp.z); if (d < nd && (!st.item || st.item.alive)) { near = st; nd = d; } }
      if (near) {
        const h = this.hostility(near.x, near.z);
        if (h > 0 && Math.random() < h * 0.35) {
          this.hostT = 6 + Math.random() * 5;
          if (Math.random() < 0.5) {
            const at = new THREE.Vector3(near.x, near.y, near.z);
            env.vfx.spawn(FUNGUS_FLARE, this.v.copy(at).setY(at.y + 0.4));
            env.audio.play('hiss', at, { gain: 0.5, rate: 0.8 });
            this.pending.push({ at: this.clock + 0.9, kind: 'burst', pos: at });
          } else {
            const at = pp.clone();
            env.vfx.spawn(ROOT_TELL, this.v.copy(at).setY(at.y + 0.05));
            env.audio.play('crack', at, { gain: 0.6, rate: 0.5 });
            this.pending.push({ at: this.clock + 0.9, kind: 'roots', pos: at });
          }
        }
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      if (e.at > this.clock) continue;
      this.pending.splice(i, 1);
      if (e.kind === 'burst') {
        env.vfx.spawn(POISON_MIST, this.v.copy(e.pos).setY(e.pos.y + 0.4), { scale: 0.8 });
        env.audio.play('hiss', e.pos, { gain: 0.8, rate: 1 });
        if (e.pos.distanceTo(pp) < 3.5) env.status.apply('poison', 4);
        forest.notify('fungus', e.pos, { act: 'burst' }, 'mycelium');
      } else {
        this.rootSpikes.position.copy(e.pos); this.rootSpikes.visible = true; this.rootSpikes.scale.set(1, 0.01, 1); this.spikeT = 2.5;
        env.audio.play('crack', e.pos, { gain: 0.8, rate: 0.7 });
        if (Math.hypot(e.pos.x - pp.x, e.pos.z - pp.z) < 1.6) { env.status.apply('slow', 2.5, 0.25); env.hurt(6, 'ROOTS'); env.say('ENTANGLED · the roots hold you', '#ff8a5a'); }
        forest.notify('fungus', e.pos, { act: 'roots' }, 'mycelium');
      }
    }
    if (this.spikeT > 0) {
      this.spikeT -= dt;
      const grow = Math.min(1, (2.5 - this.spikeT) * 8), sink = Math.min(1, this.spikeT * 2);
      this.rootSpikes.scale.set(1, Math.max(0.01, Math.min(grow, sink)), 1);
      if (this.spikeT <= 0) this.rootSpikes.visible = false;
    }
  }

  private halo(i: number, at: THREE.Vector3, size: number) {
    let h = this.halos[i];
    if (!h) {
      const g = new THREE.Group();
      const sph = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.haloMat); sph.position.y = 0.35;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32), this.ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      g.add(sph, ring); g.renderOrder = 6; this.group.add(g);
      h = this.halos[i] = { g, used: false };
    }
    h.used = true; h.g.visible = true; h.g.position.copy(at); h.g.scale.setScalar(size);
  }

  /** Three wavy roots along the ground from the player toward the mushroom (up to 40 m of them). */
  private buildRoots(from: THREE.Vector3, to: Item) {
    this.rootFrom.copy(from); this.rootTo = to;
    const dx = to.pos.x - from.x, dz = to.pos.z - from.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const len = Math.min(L, 40), geos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * 0.7, pts: THREE.Vector3[] = [];
      for (let s = 1.2; s <= len; s += 0.9) {
        const w = Math.sin(s * 0.55 + k * 2.1) * 0.35 + off * Math.min(1, s / 4) * Math.min(1, (L - s) / 3);
        const x = from.x + ux * s - uz * w, z = from.z + uz * s + ux * w;
        pts.push(new THREE.Vector3(x, this.env.ground(x, z) + 0.2 + Math.max(0, Math.sin(s * 0.9 + k)) * 0.22, z));   // arching up over the grass
      }
      if (pts.length < 3) continue;
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 0.06 - k * 0.008, 6, false));
    }
    if (this.roots) { this.group.remove(this.roots); this.roots.geometry.dispose(); this.roots = null; }
    if (!geos.length) return;
    // merge by hand (three's mergeGeometries lives in addons; three tubes are cheap)
    const g = geos.length === 1 ? geos[0] : mergeTubes(geos);
    this.roots = new THREE.Mesh(g, this.rootMat); this.roots.frustumCulled = false; this.roots.name = 'mycelium-guide-roots';
    this.group.add(this.roots);
  }

  info() { return { level: this.level, eaten: this.eaten, guiding: this.target ? `${this.target.kind}@${this.target.pos.x.toFixed(0)},${this.target.pos.z.toFixed(0)}` : null, guideOn: +this.guideOn.toFixed(2), spirit: this.sites.filter((s) => s.spirit).length }; }
  dispose() { for (const u of this.unsub) u(); }
}

function mergeTubes(gs: THREE.BufferGeometry[]) {
  let vc = 0, ic = 0;
  for (const g of gs) { vc += g.attributes.position.count; ic += g.index!.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of gs) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3); nor.set(g.attributes.normal.array as Float32Array, vo * 3); uv.set(g.attributes.uv.array as Float32Array, vo * 2);
    const ix = g.index!.array; for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += g.attributes.position.count; io += ix.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
