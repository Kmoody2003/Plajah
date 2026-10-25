// The bridge battle: crossing the drawbridge over the moat, there is an even chance the Bridge
// Troll flips up from underneath and blocks the way.
//   rumble  — the deck shudders, water boils under the near edge.
//   flip    — the troll vaults up and over onto the deck; it roars (real-time cutscene).
//   fight   — the duel on the planks. The River Kraken surfaces: eight 14 m arms, four a side,
//             writhing, slamming the deck, tearing out the rails. Then Wicked Witch Miriam
//             arrives on her hover broom with her flying monkey squadron and takes the kraken
//             on in the air behind you.
//   finale  — the troll is nearly done: the monkeys strafe it with their rifles and Miriam
//             blasts it with green witch-lightning — you land the last blow.
//   victory — the troll topples into the moat, the arms sink, Miriam and the monkeys wheel away.
// Stand-ins until Muse's bridge_troll.glb / kraken_tentacle.glb land (the troll is the Unknown,
// re-dressed; the arms are procedural, kraken.ts; the monkeys and the broom are built here).
import * as THREE from 'three/webgpu';
import { color, float, pow, dot, normalView, positionViewDirection } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mob, KINDS } from './mobs';
import { loadGLB } from './character';
import { Tentacle, tentacleMaterial, tentacleGlow, ARM_LEN } from './kraken';
import { buildBroom } from './fx';
import type { Game } from './game';
import type { PlayerController } from './player';
import type { Sfx } from './sfx';
import type { Weather } from './weather';
import type { ArrivalWorld } from './arrival';
import type { LightPool } from './lights';
import { halloweenAudio } from '../../../services/halloween/halloweenAudioSfx';

export interface BridgeBattleDeps {
  game: Game; player: PlayerController; camera: THREE.PerspectiveCamera;
  sfx: Sfx; weather: Weather;
  bridge: ArrivalWorld['bridge'];
  scene: THREE.Scene;
  pool: LightPool;
  /** Jack is outside, in play, and nothing else (the nightmare, a horde) owns the night. */
  free(): boolean;
  live(): boolean;
}

type Phase = 'idle' | 'rumble' | 'flip' | 'roar' | 'fight' | 'kraken' | 'finale' | 'victory';
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ── flying monkeys: one instanced body + two instanced wings ───────────────────────────────
function monkeyBody() {
  const parts: [THREE.BufferGeometry, number][] = [];
  const add = (g: THREE.BufferGeometry, c: number, x = 0, y = 0, z = 0, rx = 0) => { g.rotateX(rx); g.translate(x, y, z); parts.push([g, c]); };
  add(new THREE.CapsuleGeometry(0.2, 0.42, 4, 8), 0x2a2019, 0, 0, 0);                       // furred torso
  add(new THREE.CylinderGeometry(0.235, 0.225, 0.2, 10), 0x353a26, 0, 0.08, 0);              // webbing vest
  add(new THREE.SphereGeometry(0.17, 10, 8), 0x2a2019, 0, 0.47, 0.02);                       // head
  add(new THREE.SphereGeometry(0.115, 10, 8), 0xa88566, 0, 0.45, 0.1);                        // pale face
  add(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x3b4129, 0, 0.53, 0.0); // helmet
  add(new THREE.BoxGeometry(0.05, 0.07, 0.8), 0x0c0c0c, 0.06, 0.12, 0.42);                    // rifle
  add(new THREE.CapsuleGeometry(0.055, 0.32, 3, 6), 0x2a2019, 0.14, 0.14, 0.2, Math.PI / 2.4); // arms on the rifle
  add(new THREE.CapsuleGeometry(0.055, 0.32, 3, 6), 0x2a2019, -0.1, 0.14, 0.22, Math.PI / 2.2);
  add(new THREE.CapsuleGeometry(0.07, 0.34, 3, 6), 0x2a2019, 0.1, -0.42, -0.12, -0.5);       // legs trailing
  add(new THREE.CapsuleGeometry(0.07, 0.34, 3, 6), 0x2a2019, -0.1, -0.42, -0.12, -0.5);
  add(new THREE.CylinderGeometry(0.02, 0.035, 0.7, 5), 0x2a2019, 0, -0.35, -0.38, -1.0);       // tail
  const geos = parts.map(([g, c]) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    const col = new THREE.Color(c), arr = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
    n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return n;
  });
  return mergeGeometries(geos, false)!;
}
function wingShape() {
  // Feathered wing from the shoulder (origin) out along +X, scalloped trailing edge.
  const s = new THREE.Shape();
  s.moveTo(0, 0.05); s.quadraticCurveTo(0.6, 0.32, 1.35, 0.12);
  const pts: [number, number][] = [[1.2, -0.12], [1.0, -0.06], [0.85, -0.3], [0.65, -0.18], [0.45, -0.38], [0.28, -0.22], [0.1, -0.3]];
  for (const [x, y] of pts) s.quadraticCurveTo(x + 0.08, y + 0.1, x, y);
  s.lineTo(0, -0.08);
  const g = new THREE.ShapeGeometry(s, 4);
  g.rotateX(-Math.PI / 2);          // lie in the XZ plane, leading edge toward +Z
  return g;
}
interface Flyer {
  ax: number; az: number; ay: number; h: number; w: number; ph: [number, number, number];
  pos: THREE.Vector3; prev: THREE.Vector3; yaw: number; bank: number; pitch: number;
  mode: 'fly' | 'fall' | 'gone'; fallV: THREE.Vector3; spin: number; respawn: number;
  shotCd: number; flap: number;
}

export class BridgeBattle {
  phase: Phase = 'idle';
  private t = 0;
  private armed = true;
  private cool = 0;
  private troll: Mob | null = null;
  private arms: Tentacle[] = [];
  private flyers: Flyer[] = [];
  private bodies: THREE.InstancedMesh;
  private wingsL: THREE.InstancedMesh;
  private wingsR: THREE.InstancedMesh;
  private squad = false; private squadT = 0; private leaving = false; private leaveT = 0;
  private miriam: Mob | null = null;
  private broom: THREE.Group;
  private witchLight: ReturnType<LightPool['addTransient']> | null = null;
  private witch = { pos: new THREE.Vector3(), prev: new THREE.Vector3(), bolt: 2, from: new THREE.Vector3() };
  private bolts: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
  private boltMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0x5dff7a).multiplyScalar(5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  private pieces: { o: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; t: number; wet: boolean }[] = [];
  private holes: { c: THREE.Vector3; r: number }[] = [];
  private scars = new THREE.Group();
  private scarMat = new THREE.MeshStandardNodeMaterial({ color: 0x040405, roughness: 0.95 });
  private splinterMat = new THREE.MeshStandardNodeMaterial({ color: 0x5a5d62, roughness: 0.9 });
  private surfaced = false;
  /** The troll is beaten (the way to Dracula is open) — no more battles on the bridge. */
  defeated = false;
  /** Dracula is slain: the crossing is no longer guarded every time. */
  cleared = false;
  onDefeated?: () => void;
  /** Jack has been inside the castle: the next crossing is certain to bring the troll. */
  visitedCastle = false;
  /** +1 crossing toward the gate, −1 back out. */
  private runDir = 1;
  /** Difficulty tier (0 → 2) as the troll's life falls. */
  private tier = 0;
  private pace = 1;
  private prevAlong = 0;
  /** The troll's ground slam: wind-up (telegraphed), then a shockwave — jump or roll clear. */
  private slamT = 6; private slamWind = -1;
  /** Things scheduled on game time (simulation-safe, unlike setTimeout). */
  private timers: { t: number; fn: () => void }[] = [];
  private later(secs: number, fn: () => void) { this.timers.push({ t: secs, fn }); }
  private fall: { from: THREE.Vector3; to: THREE.Vector3; side: number; t: number } | null = null;
  /** Where along the deck the fight is (the troll's landing): the kraken and the air war gather there. */
  private fightAlong = 10;
  private slamCd = 0; private ripCd = 0; private swatCd = 0; private slapCd = 0; private rifleSnd = 0;
  private flipFrom = new THREE.Vector3(); private flipTo = new THREE.Vector3(); private trollSide = 1;
  private ui = document.createElement('div');
  private bar!: HTMLDivElement; private title!: HTMLDivElement;

  constructor(private d: BridgeBattleDeps, private chance = 0.5) {
    this.ui.id = 'bridgeBattle';
    this.ui.innerHTML = '<div class="nm-title"><h1></h1><h2></h2></div><div class="nm-boss"><span>THE BRIDGE TROLL</span><div><i></i></div></div>';
    document.body.appendChild(this.ui);
    this.title = this.ui.querySelector('.nm-title')!;
    this.bar = this.ui.querySelector('.nm-boss')!;
    d.scene.add(this.scars);

    // Eight arms, four a side, spread along the bridge, facing the deck.
    const B = d.bridge, mat = tentacleMaterial(tentacleGlow);
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
      const along = B.len * (0.1 + 0.27 * k) + rnd(-1, 1);
      const base = this.at(along, side * (B.width / 2 + rnd(3.2, 7.5)), B.waterY);
      const facing = B.right.clone().multiplyScalar(-side).addScaledVector(B.dir, rnd(-0.25, 0.25)).normalize();
      const arm = new Tentacle(base, facing, mat, (k + (side > 0 ? 1 : 0)) % 2 ? 'B' : 'A');
      d.scene.add(arm.mesh);
      this.arms.push(arm);
    }

    // Muse's sculpted arms (creatures/bases): skinned onto the same procedural chains.
    const T = '/games/ravencrest/assets/creatures/bases/';
    // Only seen at the bridge: fetched after start-up so they don't compete with the opening road.
    new Promise((res) => setTimeout(res, 25000)).then(() => Promise.all([loadGLB(`${T}kraken_tentacle_a.glb`), loadGLB(`${T}kraken_tentacle_b.glb`)])).then(([ga, gb]) => {
      const first = (g: { scene: THREE.Object3D }) => { let m: THREE.Mesh | null = null; g.scene.traverse((o) => { if (!m && (o as THREE.Mesh).isMesh) m = o as THREE.Mesh; }); return m as THREE.Mesh | null; };
      const a = first(ga), b = first(gb);
      for (const arm of this.arms) { const src = arm.variant === 'B' ? b ?? a : a ?? b; if (src) arm.useModel(src); }
    }).catch((e) => console.warn('[ravencrest] kraken arms: using procedural tubes', e));

    // The flying monkey squadron.
    const mat2 = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85 });
    const wingMat = new THREE.MeshStandardNodeMaterial({ color: 0x1b1511, roughness: 0.8, side: THREE.DoubleSide });
    const n = 12;
    this.bodies = new THREE.InstancedMesh(monkeyBody(), mat2, n);
    const wg = wingShape();
    this.wingsL = new THREE.InstancedMesh(wg, wingMat, n);
    this.wingsR = new THREE.InstancedMesh(wg, wingMat, n);
    for (const m of [this.bodies, this.wingsL, this.wingsR]) { m.frustumCulled = false; m.visible = false; m.userData.dynamic = true; m.castShadow = true; d.scene.add(m); }
    for (let i = 0; i < n; i++) this.flyers.push({
      ax: rnd(9, 18), az: rnd(5, 11), ay: rnd(1, 3), h: rnd(4.5, 10), w: rnd(0.2, 0.32) * (Math.random() < 0.5 ? -1 : 1),
      ph: [rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)], pos: new THREE.Vector3(), prev: new THREE.Vector3(), yaw: 0, bank: 0, pitch: 0,
      mode: 'fly', fallV: new THREE.Vector3(), spin: 0, respawn: 0, shotCd: rnd(1, 3), flap: rnd(0, 6.28),
    });

    // Miriam's hover broom.
    this.broom = buildBroom();
    this.broom.visible = false;
    d.scene.add(this.broom);
  }

  /** The battle owns the bridge (no hordes, the nightmare waits). */
  get active() { return this.phase !== 'idle'; }
  /** A directed cutscene owns the camera (quality locks to full). */
  get inCutscene() { return this.phase === 'kraken' || this.phase === 'rumble' || this.phase === 'flip' || this.phase === 'roar'; }
  /** Start it now (debug / ?bridge=1 makes every crossing a battle). */
  trigger() { if (this.phase === 'idle' && this.onBridge()) this.go('rumble'); }

  // ── bridge frame ───────────────────────────────────────────────────────────
  private at(along: number, across: number, y: number) {
    const B = this.d.bridge;
    return B.start.clone().addScaledVector(B.dir, along).addScaledVector(B.right, across).setY(y);
  }
  private local(p: THREE.Vector3) {
    const B = this.d.bridge, r = p.clone().sub(B.start);
    return { along: r.dot(B.dir), across: r.dot(B.right) };
  }
  private onBridge(margin = 0) {
    const B = this.d.bridge, l = this.local(this.d.player.object.position);
    return l.along > -margin && l.along < B.len + margin && Math.abs(l.across) < B.width / 2 + margin;
  }
  private pan(p: THREE.Vector3) {
    const c = this.d.camera, to = p.clone().sub(c.position).setY(0).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion).setY(0).normalize();
    return THREE.MathUtils.clamp(to.dot(right), -1, 1);
  }
  private dist(p: THREE.Vector3) { return p.distanceTo(this.d.camera.position); }

  private showTitle(h: string, sub: string, secs: number) {
    this.title.querySelector('h1')!.textContent = h;
    this.title.querySelector('h2')!.textContent = sub;
    this.title.classList.add('on');
    setTimeout(() => this.title.classList.remove('on'), secs * 1000);
  }

  private go(p: Phase) {
    this.phase = p; this.t = 0;
    const { player, sfx, game } = this.d;
    if (p === 'rumble') {
      this.cutHit = this.cutLine1 = this.cutLine2 = false;
      player.enabled = false; player.cinematic = true;
      this.spawnTroll();
      sfx.roar(0, 18);
    }
    if (p === 'roar') {
      sfx.roar(this.pan(this.troll!.object.position), 4);
      this.showTitle('THE BRIDGE TROLL', 'None cross without paying the toll', 3.5);
    }
    if (p === 'fight') {
      player.enabled = true; player.cinematic = false;
      this.troll!.scripted = false;
      this.troll!.makeEnemy(player.object.position);
      this.troll!.armor = 0.75;
      this.later(1.5, () => game.call('Its hide turns your blade — dodge its slam and strike while its fists are stuck, hit it from behind, burn it, or lure the kraken onto it', 7, '#ffd9a0'));
      this.bar.classList.add('on');
      this.slamCd = 4; this.ripCd = 7; this.swatCd = 3; this.slapCd = 1;
    }
    if (p === 'kraken') {
      player.enabled = false; player.cinematic = true;
      game.shield(33);
      this.cutShake = 0; this.cutStage = -1; this.cutSub = -1; this.cutHit = false; this.cutLine1 = false; this.cutLine2 = false;
      if (this.troll) { this.troll.scripted = true; this.troll.pose('attack'); }
      this.bar.classList.remove('on');
    }
    if (p === 'finale') {
      game.call('The monkeys open fire!', 2, '#9ad86a');
      sfx.laugh(0, 8, 1.6);
    }
    if (p !== 'fight' && p !== 'finale') this.d.player.wide = 0;
    if (p === 'victory') {
      const first = !this.defeated;
      this.defeated = true;
      this.cool = 45;
      if (first) this.onDefeated?.();
      this.bar.classList.remove('on');
      this.showTitle('THE CROSSING IS CLEAR', 'The kraken sinks back into the moat', 4);
      this.arms.forEach((a, i) => this.later(0.4 + i * 0.26, () => { a.retract(); this.splash(a.base, true); }));
      this.leaving = true; this.leaveT = 0;
      halloweenAudio.playWitchLaughAndMonkeys();
    }
    if (p === 'idle') {
      this.bar.classList.remove('on');
      this.surfaced = false; this.slamming.clear();
      this.cool = 240;
    }
  }

  // ── actors ─────────────────────────────────────────────────────────────────
  private spawnTroll() {
    const { game, player } = this.d, B = this.d.bridge;
    const pl = this.local(player.object.position);
    const ahead = THREE.MathUtils.clamp(pl.along + 6.5 * this.runDir, 2, B.len - 2);
    this.fightAlong = ahead;
    this.trollSide = Math.random() < 0.5 ? -1 : 1;
    this.flipTo.copy(this.at(ahead, -this.trollSide * 0.4, B.deckY));
    // Hanging under the deck's edge (the moat is 12 m below).
    this.flipFrom.copy(this.at(ahead - 1.2 * this.runDir, this.trollSide * (B.width / 2 + 1.1), B.deckY - 2.4));
    this.troll?.object.removeFromParent(); this.troll?.bar?.remove();
    const m = game.spawn(new Mob('troll', 'npc', this.flipFrom, 'outside'));
    m.scripted = true;
    this.troll = m;
    // Muse's troll is painted from the sheet; only the stand-in needed re-dressing.
    const dress = () => {
      if (KINDS.troll.url.includes('bridge_troll')) return;
      if (!m.ready || !m.body) { setTimeout(dress, 200); return; }
      m.body.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Wet slate-green hide with a cold moonlit rim, so it reads as a hulking silhouette.
        const src = mesh.material as THREE.MeshStandardMaterial;
        const nm = new THREE.MeshStandardNodeMaterial({ map: src.map, normalMap: src.normalMap, roughness: 0.42, metalness: 0 });
        nm.color.copy(src.color).multiply(new THREE.Color(0.26, 0.33, 0.25));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const facing: any = dot(normalView, positionViewDirection).abs();
        nm.emissiveNode = color(0x4a6a5a).mul(pow(float(1).sub(facing), float(4))).mul(0.3);
        mesh.material = nm;
      });
      let head: THREE.Object3D | null = null;
      m.body.traverse((o) => { if (!head && o.name.replace(/_\d+$/, '') === 'Head') head = o; });
      const host = head ?? m.body, ws = host.getWorldScale(new THREE.Vector3()).x || 1;
      const eye = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffa020).multiplyScalar(7) });
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.03 / ws, 8, 6), eye);
        e.position.set(sx * 0.04 / ws, 0.07 / ws, 0.1 / ws);
        host.add(e);
      }
    };
    dress();
  }

  // ── per frame ──────────────────────────────────────────────────────────────
  update(dt: number, now: number) {
    const { game, player } = this.d;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    this.updateFall(dt);
    for (const a of this.arms) a.update(dt, now);
    this.updatePieces(dt);
    this.updateBolts(dt);
    this.updateSquad(dt, now);
    this.pushOutOfHoles();
    tentacleGlow.value = 1;

    if (this.phase === 'idle') {
      this.cool -= dt;
      if (!this.onBridge(1.5)) this.armed = true;
      // The user's flow: it happens while Jack is running across — a third of the way over,
      // heading for the gate — not as he steps on.
      // Either way across: a third of the way over in the direction Jack is running.
      const along = this.local(player.object.position).along, B = this.d.bridge;
      const dir = Math.sign(along - this.prevAlong);
      const mid = dir > 0 ? along > B.len * 0.3 && along < B.len * 0.5 : along < B.len * 0.7 && along > B.len * 0.5;
      if (!this.cleared && dir !== 0 && this.armed && this.cool <= 0 && this.d.free() && this.d.live() && this.onBridge() && mid) {
        this.armed = false;
        this.runDir = dir;
        // 50/50 — but once Jack has been inside the castle without meeting it, it's certain
        // (Dracula can only be faced after the troll).
        // Until Dracula falls the troll guards every crossing (and before the castle it's certain).
        if (!this.cleared || this.visitedCastle || Math.random() < this.chance) this.go('rumble');
      }
      this.prevAlong = along;
      return;
    }
    if (!this.d.live() && this.phase !== 'flip' && this.phase !== 'roar') return;
    this.t += dt;
    const tr = this.troll!;

    // Jack fell: the troll slinks back under, the arms sink, the witch and her army withdraw.
    if (game.isDown && this.phase !== 'victory') {
      if (tr.alive) game.smoke(tr.object.position.clone().setY(tr.object.position.y + 1.5), 30);
      tr.object.removeFromParent(); tr.bar?.remove(); this.troll = null;
      for (const a of this.arms) a.retract();
      if (this.squad) { this.leaving = true; this.leaveT = 0; }
      player.enabled = true; player.cinematic = false;
      this.go('idle'); this.cool = 20;
      return;
    }

    switch (this.phase) {
      case 'rumble': {
        player.shake = Math.max(player.shake, 0.3);
        if (Math.random() < dt * 12) this.splash(this.flipFrom.clone().addScaledVector(this.d.bridge.right, this.trollSide * rnd(0, 1.5)), false);
        this.introCam(dt, 0);
        if (this.t > 1.3) { this.go('flip'); this.d.sfx.splash(this.pan(this.flipFrom), true, 6); this.splash(this.flipFrom, true); }
        break;
      }
      case 'flip': {
        // Up from under the deck, a full forward somersault, down onto the planks.
        const k = Math.min(1, this.t / 1.45);
        const e = k * k * (3 - 2 * k);
        const centre = this.flipFrom.clone().lerp(this.flipTo, e).addScaledVector(UP, 3.2 * Math.sin(Math.PI * k) + 1.6);
        const yaw = Math.atan2(player.object.position.x - this.flipTo.x, player.object.position.z - this.flipTo.z);
        const spin = -Math.PI * 2 * THREE.MathUtils.smoothstep(k, 0.08, 0.9);
        tr.object.rotation.set(spin, yaw, 0, 'YXZ');
        const off = new THREE.Vector3(0, 1.6, 0).applyQuaternion(tr.object.quaternion);
        tr.object.position.copy(centre).sub(off);
        tr.yaw = yaw;
        tr.pose('run');
        this.introCam(dt, k);
        if (k >= 1) {
          tr.object.rotation.set(0, yaw, 0);
          tr.object.position.copy(this.flipTo);
          tr.pose('idle');
          player.shake = 0.9;
          this.d.sfx.woodCrack(0, 4);
          this.crack(this.flipTo, 1.1);
          this.go('roar');
        }
        break;
      }
      case 'roar':
        this.introCam(dt, 1);
        if (this.t > 0.15 && this.t < 1.4) player.shake = Math.max(player.shake, 0.35);
        if (this.t > 2.2) this.go('fight');
        break;
      case 'fight':
      case 'finale':
        this.fight(dt);
        break;
      case 'kraken':
        this.krakenCut(dt);
        break;
      case 'victory':
        if (this.t > 8) { this.go('idle'); }
        break;
    }
  }

  // ── The kraken cutscene ─────────────────────────────────────────────────────────────
  //  (times below ×1.35 in the code: each beat holds a little longer)
  //  0 – 1.1   the troll lunges and swats the hero: thrown back, landing flat (side-on wide, heavy shake)
  //  1.1 – 3.2 tight on the hero, stunned on the stones, the shake settling: "What is that?"
  //  3.2 – 5.2 low over the water: the first giant tentacle erupts at the lens, the others after it
  //  5.2 – 7.2 wide: all eight arms risen around the bridge
  //  7.2 – 9.6 pull back in to the hero getting up: "I could really use some backup."
  //  9.6 – 13 Miriam's cackle; cut to her and the monkey squadron streaking in from the castle
  //  (real seconds from here) 17.5 – 29.5 the aerial battle: a slow wide orbit of the squadron diving
  //  on the arms; low over the water as her witch-lightning hits an arm; riding behind her broom
  //  29.5  "The West Hallow Witch" — control returns already on the wide shot of hero and troll, and
  //        the camera eases in behind the hero over ~8 s while the witch's battle carries on behind
  private cutShake = 0;
  private cutStage = -1;
  private cutDown = 0;
  private krakenCut(dt: number) {
    const { player, camera, sfx, game } = this.d;
    const t = this.t, B = this.d.bridge, tr = this.troll;
    const p = player.object.position;
    const hero = player.character?.root;
    const stage = t < 1.49 ? 0 : t < 4.32 ? 1 : t < 7.02 ? 2 : t < 9.72 ? 3 : t < 12.96 ? 4 : t < 17.5 ? 5 : 6;
    const enter = stage !== this.cutStage;
    this.cutStage = stage;
    const toTroll = tr ? tr.object.position.clone().sub(p).setY(0).normalize() : B.dir.clone();
    const side = new THREE.Vector3(toTroll.z, 0, -toTroll.x);
    const shot = (pos: THREE.Vector3, look: THREE.Vector3, fov: number) => {
      const s = this.cutShake;
      this.cutShake = Math.max(0, s - dt * 0.9);
      camera.position.copy(pos).add(new THREE.Vector3(Math.sin(t * 41) * s * 0.12, Math.sin(t * 37 + 1) * s * 0.1, Math.sin(t * 29 + 2) * s * 0.08));
      camera.lookAt(look);
      camera.fov = fov; camera.updateProjectionMatrix();
    };
    // The hero's body: knocked flat, lying, then getting up (the character root tips onto its back).
    const down = t < 0.68 ? 0 : t < 1.35 ? (t - 0.68) / 0.67 : t < 10.67 ? 1 : Math.max(0, 1 - (t - 10.67) / 1.2);
    this.cutDown = down;
    if (hero) { hero.rotation.x = -1.42 * down * down * (3 - 2 * down); hero.position.y = 0.12 * down; }

    if (stage === 0) {
      if (tr) {
        // The lunge: closing to arm's length, swinging.
        const want = p.clone().addScaledVector(toTroll, 2.3);
        tr.object.position.lerp(want.setY(tr.object.position.y), 1 - Math.exp(-dt * 10));
        tr.yaw = Math.atan2(-toTroll.x, -toTroll.z); tr.object.rotation.y = tr.yaw;
      }
      if (t > 0.57 && !this.cutHit) {
        this.cutHit = true;
        player.launch(toTroll.clone().negate(), 11, 5.5);
        sfx.hit('troll', true, 3); sfx.roar(0, 3); sfx.hurt(true);
        this.cutShake = 1.6;
        game.lensHit('dirt', 0.8);
        game.flashAt(p.clone().setY(p.y + 1.3), 0xffffff, 25);
      }
      // Side-on, wide enough for the troll and the hero both: between them, and back.
      const mid = tr ? p.clone().lerp(tr.object.position, 0.5) : p.clone().addScaledVector(toTroll, 1.4);
      shot(mid.clone().addScaledVector(side, 10).setY(p.y + 2.6), mid.clone().setY(p.y + 1.6), 56);
    } else if (stage === 1) {
      if (enter) { this.cutShake = 0.9; tr?.pose('idle'); }
      if (t > 2.43 && !this.cutLine1) { this.cutLine1 = true; game.call('“What is that?”', 2.2, '#f4ead8'); sfx.heartbeat(1); }
      // Low, close on the hero's face and chest as they lie on the stones (the body tips back along
      // the hero's own facing, so the head lies behind the feet).
      const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      const across = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const head = p.clone().addScaledVector(fwd, -1.35).setY(p.y + 0.22);
      const chest = p.clone().addScaledVector(fwd, -0.9).setY(p.y + 0.25);
      shot(head.clone().addScaledVector(across, 1.15).addScaledVector(fwd, 0.5).setY(p.y + 0.95), chest, 40);
      // The deep groan under the bridge.
      if (enter) { sfx.thunder(80); this.d.weather.strike(60, p); }
    } else if (stage === 2) {
      // Arms begin to erupt: the first right at the lens.
      if (enter) {
        this.surfaced = true;
        this.placeArms();
        this.arms.forEach((a, i) => this.later(i === 0 ? 0.25 : 0.7 + i * 0.32, () => {
          a.emerge(); this.splash(a.base, true); sfx.splash(this.pan(a.base), true, this.dist(a.base));
          this.cutShake = Math.max(this.cutShake, 0.6);
        }));
      }
      const a = this.arms[0];
      const water = a.base.clone().setY(B.waterY + 0.6);
      const out = a.base.clone().sub(this.at(this.fightAlong, 0, B.waterY)).setY(0).normalize();
      const k = (t - 4.32) / 2.7;
      shot(water.clone().addScaledVector(out, 7 - 1.5 * k).addScaledVector(new THREE.Vector3(out.z, 0, -out.x), 2.5).setY(B.waterY + 1.5),
        a.base.clone().setY(B.waterY + 1.5 + 8 * Math.min(1, k * 1.2)), 50);
    } else if (stage === 3) {
      if (enter) this.showTitle('THE RIVER KRAKEN', 'It wakes beneath Ravencrest', 3);
      const c = this.at(this.fightAlong, 0, B.deckY);
      const k = (t - 7.02) / 2.7;
      shot(c.clone().addScaledVector(B.right, 46 - 6 * k).addScaledVector(B.dir, -22).setY(B.deckY + 16 - 3 * k), c.clone().setY(B.deckY + 8), 52);
    } else if (stage === 4) {
      // From the wide, pull in behind the hero as they get up.
      const k = THREE.MathUtils.smoothstep((t - 9.72) / 3.24, 0, 1);
      const c = this.at(this.fightAlong, 0, B.deckY);
      const wide = c.clone().addScaledVector(B.right, 40).addScaledVector(B.dir, -22).setY(B.deckY + 13);
      const close = p.clone().addScaledVector(toTroll, -3.2).addScaledVector(side, 1.0).setY(p.y + 1.7);
      shot(wide.lerp(close, k), c.clone().setY(B.deckY + 7).lerp(p.clone().setY(p.y + 1.2 + 0.4 * (1 - down)), k), 52 - 8 * k);
      if (t > 11.74 && !this.cutLine2) { this.cutLine2 = true; game.call('“I could really use some backup.”', 2.6, '#f4ead8'); }
    } else if (stage === 5) {
      if (enter) { sfx.laugh(0, 6, 2.4); this.callSquad(); }
      // Tracking Miriam as she streams in from the castle, her squadron around her.
      const w = this.witch.pos.lengthSq() > 1 ? this.witch.pos.clone() : this.at(B.len + 20, 0, 25);
      const toBridge = this.at(this.fightAlong, 0, B.deckY).sub(w).normalize();
      if (this.witchLight) { this.witchLight.intensity = 9; this.witchLight.distance = 14; }
      shot(w.clone().addScaledVector(toBridge, 6).addScaledVector(B.right, 2.2).add(new THREE.Vector3(0, 1.0, 0)), w.clone().add(new THREE.Vector3(0, 0.6, 0)), 38);
    } else {
      // The aerial battle, three shots. Her bolts are helped along so each shot has a hit in it.
      const c = this.centre();
      const sub = t < 21.5 ? 0 : t < 25.5 ? 1 : 2;
      if (sub !== this.cutSub) {
        this.cutSub = sub;
        const tg = this.targets();
        const arm = tg.find((x) => x.arm) ?? tg[0];
        if (arm) this.witchBolt(this.witch.pos.clone().addScaledVector(UP, 1.3), arm);
        if (sub === 0) game.call('Miriam and her monkeys take on the kraken', 3, '#7ad08a');
      }
      if (sub === 0) {
        // Slow, high orbit round the crossing: squadron, arms and the bridge all in frame.
        const a = (t - 17.5) * 0.16 + 0.6;
        const pos = c.clone().addScaledVector(B.right, Math.cos(a) * 34).addScaledVector(B.dir, Math.sin(a) * 26).setY(B.deckY + 15);
        shot(pos, c.clone().setY(B.deckY + 6), 54);
      } else if (sub === 1) {
        // Low over the water on one arm as the lightning lands.
        const arm = this.arms.find((x) => x.up) ?? this.arms[0];
        const base = arm ? arm.base.clone() : c.clone();
        const out = base.clone().sub(c).setY(0).normalize();
        const k = (t - 21.5) / 4;
        shot(base.clone().addScaledVector(out, 9 - 2 * k).addScaledVector(new THREE.Vector3(out.z, 0, -out.x), 3.5).setY(B.waterY + 2.2 + k),
          base.clone().setY(B.waterY + 6 + 2 * k), 48);
        if (Math.random() < dt * 0.9) this.d.weather.strike(40, base);
      } else {
        // Riding behind the witch as she banks and blasts.
        const w = this.witch.pos;
        const fwd = w.clone().sub(this.witch.prev).setY(0);
        if (fwd.lengthSq() < 1e-6) fwd.copy(B.dir); else fwd.normalize();
        shot(w.clone().addScaledVector(fwd, -5).addScaledVector(UP, 1.6), w.clone().addScaledVector(fwd, 6).addScaledVector(UP, -1.5), 50);
      }
      if (t > 29.5) {
        // Back to the fight, already on the wide shot; the fight cycle eases it in behind the hero.
        if (hero) { hero.rotation.x = 0; hero.position.y = 0; }
        player.enabled = true; player.cinematic = false;
        player.setWideNow(1);
        if (tr?.alive) tr.scripted = false;
        this.bar.classList.add('on');
        this.showTitle('THE WEST HALLOW WITCH', 'Miriam and her flying monkeys fight at your side', 3.5);
        game.call('Let her army work the kraken while you take the troll', 4, '#7ad08a');
        this.phase = 'fight'; this.t = 45; this.settleT = 0;
        this.slamCd = 3; this.ripCd = 6; this.swatCd = 2; this.slapCd = 1.5;
      }
    }
  }
  private cutHit = false; private cutLine1 = false; private cutLine2 = false; private cutSub = -1;
  /** Seconds since the cutscene handed back (the wide shot eases in behind the hero). */
  private settleT = 99;

  /** The troll must never just stand there: if it hasn't swung for a while with the hero in range,
   *  it's pushed back into the hunt; if it's stuck (holes, wreckage, the balustrade), it leaps. */
  private sinceSwing = 0;
  private stuckFrom = new THREE.Vector3();
  private stuckT = 0;
  private leap: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private trollWatchdog(dt: number, tr: Mob, p: THREE.Vector3) {
    if (!tr.alive) return;
    if (this.leap) { this.updateLeap(dt, tr, p); return; }
    if (tr.scripted) return;                                   // a slam wind-up / stagger owns it
    if (tr.state === 'attack') this.sinceSwing = 0; else this.sinceSwing += dt;
    if (tr.state !== 'chase' && tr.state !== 'attack' && tr.state !== 'hurt') tr.makeEnemy(p);
    const d = tr.object.position.distanceTo(p);
    this.stuckT += dt;
    if (this.stuckT > 2.5) { if (tr.object.position.distanceTo(this.stuckFrom) < 0.6 && d > 3.5) this.sinceSwing = Math.max(this.sinceSwing, 9); this.stuckFrom.copy(tr.object.position); this.stuckT = 0; }
    if (this.sinceSwing > 5 && d < 22) {
      if (d > 3.2) {
        // Leap: up and over whatever's in the way, landing beside the hero with a slam.
        const to = p.clone().add(tr.object.position.clone().sub(p).setY(0).normalize().multiplyScalar(2.4));
        to.y = this.d.bridge.deckY;
        this.leap = { from: tr.object.position.clone(), to, t: 0 };
        tr.scripted = true; tr.pose('run');
        this.d.sfx.roar(this.pan(tr.object.position), this.dist(tr.object.position));
        this.d.game.call('The troll leaps!', 0.9, '#ffb36b');
      } else tr.strikeNow();
      this.sinceSwing = 0;
    }
  }
  private updateLeap(dt: number, tr: Mob, p: THREE.Vector3) {
    const L = this.leap!;
    L.t += dt;
    const k = Math.min(1, L.t / 0.95), e = k * k * (3 - 2 * k);
    tr.object.position.lerpVectors(L.from, L.to, e).add(new THREE.Vector3(0, Math.sin(Math.PI * k) * 4.5, 0));
    const to = p.clone().sub(tr.object.position);
    tr.yaw = Math.atan2(to.x, to.z); tr.object.rotation.y = tr.yaw;
    if (k >= 1) {
      this.leap = null;
      tr.scripted = false;
      this.d.player.shake = 0.8;
      this.d.sfx.woodCrack(this.pan(L.to), this.dist(L.to));
      this.crack(L.to, 0.9);
      this.d.game.lensHit('dirt', 0.5);
      const airborne = p.y > this.d.bridge.deckY + 0.35;
      if (!airborne && Math.hypot(p.x - L.to.x, p.z - L.to.z) < 3.6) this.d.game.hurtPlayer(16, L.to);
      tr.strikeNow();
    }
  }

  /** The entrance, framed over Jack's shoulder toward where the troll comes up. */
  private introCam(dt: number, k: number) {
    const { player, camera } = this.d;
    const p = player.object.position, to = this.flipTo.clone().sub(p).setY(0).normalize();
    const side = new THREE.Vector3(to.z, 0, -to.x).multiplyScalar(-this.trollSide);
    const at = p.clone().addScaledVector(to, -3.4).addScaledVector(side, 1.5).setY(p.y + 1.7 - 0.4 * k);
    camera.position.lerp(at, 1 - Math.exp(-dt * 4));
    // Hold the landing spot in frame; the somersault arcs through the top of it.
    const look = this.flipTo.clone().setY(this.flipTo.y + 1.6);
    if (this.troll) look.lerp(this.troll.object.position.clone().setY(this.troll.object.position.y + 1.6), 0.35);
    camera.lookAt(look.lerp(p.clone().setY(p.y + 1.4), 0.2));
    camera.fov = 58 - 12 * k; camera.updateProjectionMatrix();
    player.yaw = Math.atan2(to.x, to.z); player.object.rotation.y = player.yaw;
  }

  private fight(dt: number) {
    const { game, player, sfx } = this.d;
    const tr = this.troll!;
    const p = player.object.position;
    (this.bar.querySelector('i') as HTMLElement).style.width = `${(100 * tr.hp) / tr.maxHp}%`;
    if (!tr.alive) { this.trollFalls(); this.d.player.wide = 0; this.go('victory'); return; }
    // The camera breathes between a medium shot behind the hero and a wide one above and behind,
    // so the kraken and Miriam's aerial battle play out in frame — wide when the arms first
    // surface, then ~7 s medium / 5 s wide once the squadron is up. Never wide mid-slam.
    {
      const cyc = this.squad ? (this.t % 12) > 7 : this.surfaced && this.t < 9;
      this.settleT += dt;
      // After the cutscene: hold wide 3 s, then a slow ~8 s push in behind the hero.
      if (this.settleT < 11) this.d.player.wide = 1 - THREE.MathUtils.smoothstep(this.settleT, 3, 11);
      else this.d.player.wide = cyc && this.slamWind < 0 ? 1 : 0;
    }
    tr.home.copy(p);
    // Escalation: as its life falls the troll hits harder and moves faster, and the slams (its own
    // and the kraken's) come more often.
    const life = tr.hp / tr.maxHp;
    const tier = life > 0.66 ? 0 : life > 0.33 ? 1 : 2;
    if (tier !== this.tier) {
      this.tier = tier;
      this.d.game.call(tier === 1 ? 'The troll is getting angry' : 'The troll goes berserk!', 1.4, '#ffb36b');
      this.d.sfx.roar(this.pan(tr.object.position), 4);
    }
    tr.power = [1, 1.25, 1.5][tier]; tr.haste = [1, 1.12, 1.25][tier];
    this.pace = [1, 0.75, 0.55][tier];
    if (this.phase === 'fight' && life < 0.25 && this.squad) this.go('finale');
    this.groundSlam(dt, tr, p);

    // The kraken wakes: the troll knocks the hero flat and the cutscene takes over (krakenCut).
    // Once the hero has properly fought it (a quarter of its life gone, or 40 s), the kraken wakes.
    if (this.phase === 'fight' && !this.surfaced && (life < 0.75 || this.t > 40)) { this.go('kraken'); return; }
    this.trollWatchdog(dt, tr, p);
    // (Miriam and the monkeys arrive in that cutscene.)
    if (this.phase === 'fight' && this.surfaced && !this.squad) this.callSquad();
    void sfx;

    // The arms attack.
    const up = this.arms.filter((a) => a.up && !a.busy);
    this.slamCd -= dt; this.ripCd -= dt; this.swatCd -= dt; this.slapCd -= dt;
    if (up.length && this.slamCd <= 0 && this.slamming.size === 0) {
      this.slamCd = (this.phase === 'finale' ? rnd(4.5, 6.5) : rnd(3.2, 5)) * this.pace;
      this.slam(up.sort((a, b) => a.base.distanceTo(p) - b.base.distanceTo(p))[0]);
    } else if (up.length && this.ripCd <= 0) {
      this.ripCd = rnd(6, 9);
      this.rip(up[Math.floor(Math.random() * up.length)]);
    } else if (up.length && this.squad && this.swatCd <= 0) {
      this.swatCd = rnd(2, 3.5);
      this.swat(up[Math.floor(Math.random() * up.length)]);
    } else if (up.length && this.slapCd <= 0) {
      this.slapCd = rnd(1.2, 2.4);
      const a = up[Math.floor(Math.random() * up.length)];
      const at = a.base.clone().addScaledVector(a.facing, rnd(-2, 3)).addScaledVector(UP, 0.3);
      a.reach([[a.base.clone().addScaledVector(UP, ARM_LEN * 0.7).addScaledVector(a.facing, -2), 0.7], [at, 0.25]], 0.3, (i, tip) => { if (i === 1) { this.splash(tip, true); sfx.splash(this.pan(tip), true, this.dist(tip)); } });
    }
  }

  /** Spread the arms around the fight: four a side, from just behind Jack to beyond the troll. */
  private placeArms() {
    const B = this.d.bridge;
    this.arms.forEach((a, i) => {
      const side = i < 4 ? -1 : 1, k = i % 4;
      const along = THREE.MathUtils.clamp(this.fightAlong - 6 + k * 6.5 + rnd(-1.2, 1.2) + (side > 0 ? 2.5 : 0), 3, B.len - 2);
      a.base.copy(this.at(along, side * (B.width / 2 + rnd(3.2, 6.5)), B.waterY));
      a.facing.copy(B.right).multiplyScalar(-side).addScaledVector(B.dir, rnd(-0.25, 0.25)).normalize();
    });
  }

  /** Every 6-8 s: the troll rears up roaring (dust, a shudder), then smashes both fists into the
   *  deck — a shockwave across 5 m that only a jump or a roll gets you through. */
  private groundSlam(dt: number, tr: Mob, p: THREE.Vector3) {
    const { player, sfx, game } = this.d;
    if (this.slamWind < 0) {
      this.slamT -= dt;
      if (this.slamT <= 0 && tr.alive && tr.state !== 'attack' && tr.object.position.distanceTo(p) < 7) {
        this.slamWind = 0.85; tr.scripted = true; tr.pose('attack3');
        sfx.roar(this.pan(tr.object.position), this.dist(tr.object.position));
        game.call('The troll rears up — jump!', 0.9, '#ffb36b');
      }
      return;
    }
    this.slamWind -= dt;
    player.shake = Math.max(player.shake, 0.12);
    game.smoke(tr.object.position.clone().setY(tr.object.position.y + 0.2), 1);
    if (this.slamWind > 0) return;
    // Impact.
    this.slamWind = -1; this.slamT = rnd(6, 8) * this.pace;
    // Its fists are wedged in the stone for a moment: the opening.
    tr.exposed = 2.6; tr.pose('hit');
    this.later(2.4, () => { tr.scripted = false; });
    const at = tr.object.position.clone().addScaledVector(new THREE.Vector3(Math.sin(tr.yaw), 0, Math.cos(tr.yaw)), 1.6);
    player.shake = 0.9;
    sfx.woodCrack(this.pan(at), this.dist(at));
    this.crack(at, 0.9);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; game.debris({ pos: at.clone().setY(this.d.bridge.deckY + 0.1), vel: new THREE.Vector3(Math.cos(a) * 9, 1.2, Math.sin(a) * 9), color: new THREE.Color(0.3, 0.3, 0.32), size: 0.12, life: 0.55, drag: 2 }); }
    if (Math.hypot(p.x - at.x, p.z - at.z) < 7) game.lensHit('dirt', 0.9);
    const airborne = p.y > this.d.bridge.deckY + 0.35;
    if (!airborne && Math.hypot(p.x - at.x, p.z - at.z) < 5) game.hurtPlayer(20, at);
  }

  private slamming = new Set<Tentacle>();
  private lureAt = -99;
  /** Rear up, then whip down onto where Jack is standing (roll!). */
  private slam(a: Tentacle) {
    const { player, sfx, game } = this.d;
    const B = this.d.bridge;
    const p = player.object.position;
    const target = p.clone().add(new THREE.Vector3(rnd(-0.8, 0.8), 0, rnd(-0.8, 0.8))).setY(B.deckY + 0.3);
    const away = target.clone().sub(a.base).setY(0).normalize();
    const rear = a.base.clone().addScaledVector(UP, ARM_LEN * 0.82).addScaledVector(away, -1.5);
    this.slamming.add(a);
    a.reach([[rear, 0.85], [target, 0.26]], 0.75, (i, tip) => {
      if (i === 0) sfx.lash(this.pan(tip), this.dist(tip));
      if (i !== 1) { this.slamming.delete(a); return; }
      player.shake = Math.max(player.shake, 0.8);
      sfx.woodCrack(this.pan(tip), this.dist(tip));
      if (Math.hypot(target.x - p.x, target.z - p.z) < 6) game.lensHit('dirt', 0.7);
      if (Math.hypot(target.x - p.x, target.z - p.z) < 2.4) game.hurtPlayer(18, target);
      this.crack(target, 0.95);
      if (this.troll?.alive && this.troll.object.position.distanceTo(target) < 3 && this.t - this.lureAt > 8) {
        this.lureAt = this.t;
        // Lured: the kraken's blow lands on the troll — a huge hit and a stagger.
        this.troll.damage(Math.round(this.troll.maxHp * 0.045), target);
        this.troll.exposed = 2;
        game.call('The kraken struck the troll!', 1.4, '#9ad86a');
        this.d.sfx.roar(this.pan(this.troll.object.position), 4);
      }
    });
  }

  /** Coil around a rail section, tear it out, fling it into the moat. */
  private rip(a: Tentacle) {
    const B = this.d.bridge, { sfx, player } = this.d;
    const side = Math.sign(this.local(a.base).across);
    const along = this.local(a.base).along;
    const span = B.spans.filter((s) => s.side === side && s.mesh.parent === B.deck).sort((x, y) => Math.abs(x.along - along) - Math.abs(y.along - along))[0];
    if (!span) return;
    const at = span.mesh.getWorldPosition(new THREE.Vector3());
    const lift = at.clone().addScaledVector(UP, 6).addScaledVector(B.right, side * 4);
    const fling = at.clone().addScaledVector(B.right, side * 14).addScaledVector(B.dir, rnd(-6, 6)).setY(B.waterY + 3);
    a.reach([[at.clone().addScaledVector(UP, 0.2), 0.8], [lift, 0.9], [fling, 0.45]], 0.05, (i, tip) => {
      if (i === 0) {
        sfx.woodCrack(this.pan(tip), this.dist(tip));
        player.shake = Math.max(player.shake, 0.4);
        this.detach(span.mesh);
        a.carry = span.mesh;
        // The posts either side go too, splintering.
        for (const post of B.posts.filter((q) => q.side === side && !q.fixed && Math.abs(q.along - span.along) < 2.5 && q.mesh.parent === B.deck)) {
          this.detach(post.mesh);
          this.pieces.push({ o: post.mesh, v: B.right.clone().multiplyScalar(side * rnd(2, 5)).addScaledVector(UP, rnd(2, 5)), w: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), t: 0, wet: false });
        }
        this.splinters(tip, 24);
      }
      if (i === 2 && a.carry) {
        const o = a.carry; a.carry = null;
        this.pieces.push({ o, v: fling.clone().sub(at).normalize().multiplyScalar(12).addScaledVector(UP, 3), w: new THREE.Vector3(rnd(-5, 5), rnd(-5, 5), rnd(-5, 5)), t: 0, wet: false });
      }
    });
  }

  /** Swat at a monkey (or the witch) overhead. */
  private swat(a: Tentacle) {
    const live = this.flyers.filter((f) => f.mode === 'fly');
    if (!live.length) return;
    const f = live.sort((x, y) => x.pos.distanceTo(a.base) - y.pos.distanceTo(a.base))[0];
    if (f.pos.distanceTo(a.base) > ARM_LEN + 2) return;
    const lead = f.pos.clone().addScaledVector(f.pos.clone().sub(f.prev), 20);
    a.reach([[lead, 0.55]], 0.15, (_i, tip) => {
      this.d.sfx.lash(this.pan(tip), this.dist(tip));
      for (const g of this.flyers) if (g.mode === 'fly' && g.pos.distanceTo(tip) < 3.2) {
        g.mode = 'fall'; g.fallV.copy(g.pos.clone().sub(a.base).setY(0).normalize().multiplyScalar(9)).addScaledVector(UP, 4); g.spin = rnd(6, 12);
        this.d.sfx.laugh(this.pan(g.pos), this.dist(g.pos), 2.4);
      }
    });
  }

  private trollFalls() {
    // Off the edge and into the moat.
    const tr = this.troll!, B = this.d.bridge;
    tr.scripted = true;
    tr.pose('death');
    const l = this.local(tr.object.position);
    const side = l.across >= 0 ? 1 : -1;
    this.fall = { from: tr.object.position.clone(), to: this.at(l.along, side * (B.width / 2 + 2.2), B.waterY - 2.5), side, t: 0 };
    this.d.player.shake = 0.6;
  }
  private updateFall(dt: number) {
    const f = this.fall, tr = this.troll;
    if (!f || !tr) return;
    f.t += dt;
    const k = Math.min(1, f.t / 1.6), B = this.d.bridge;
    tr.object.position.lerpVectors(f.from, f.to, k).addScaledVector(UP, Math.sin(Math.PI * k) * 1.2);
    tr.object.rotation.z = f.side * -1.4 * k;
    if (k >= 1) {
      this.splash(f.to.clone().setY(B.waterY), true); this.d.sfx.splash(this.pan(f.to), true, this.dist(f.to));
      tr.object.removeFromParent(); tr.bar?.remove();
      this.fall = null;
    }
  }

  // ── Miriam and the flying monkeys ──────────────────────────────────────────
  private callSquad() {
    const { game } = this.d;
    this.squad = true; this.squadT = 0; this.leaving = false;
    game.call('Wicked Witch Miriam and her flying monkeys!', 2.6, '#7ad08a');
    setTimeout(() => game.bark('miriam', 'miriam_darling'), 2800);
    halloweenAudio.playWitchLaughAndMonkeys();
    for (const f of this.flyers) { f.mode = 'fly'; f.respawn = 0; }
    for (const m of [this.bodies, this.wingsL, this.wingsR]) m.visible = true;
    if (!this.miriam || !this.miriam.object.parent) {
      this.miriam = game.spawn(new Mob('miriam', 'npc', this.centre(), 'outside'));
      this.miriam.scripted = true;
    }
    this.miriam.pose('idle');
    const B = this.d.bridge;
    this.witch.pos.copy(this.at(B.len + 25, 0, 30)); this.witch.prev.copy(this.witch.pos);
    for (const f of this.flyers) { f.pos.copy(this.witch.pos); f.prev.copy(f.pos); }
    this.witchLight ??= this.d.pool.addTransient(this.centre(), 0x43ff6a, 3, 9);
  }
  /** Where the aerial battle circles: over the middle of the moat crossing. */
  private centre() { return this.at(this.fightAlong + 9, 0, 0); }
  private squadPos(f: Flyer, s: number, out: THREE.Vector3) {
    const B = this.d.bridge, fin = this.phase === 'finale';
    const h = fin ? f.h * 0.4 + 2.2 : f.h, ax = fin ? f.ax * 0.6 : f.ax;
    return out.copy(this.centre())
      .addScaledVector(B.right, ax * Math.sin(f.w * s + f.ph[0]))
      .addScaledVector(B.dir, f.az * Math.sin(2 * f.w * s + f.ph[1]))
      .addScaledVector(UP, h + f.ay * Math.sin(1.5 * f.w * s + f.ph[2]));
  }
  private updateSquad(dt: number, now: number) {
    if (!this.squad) return;
    this.squadT += dt;
    if (this.leaving) this.leaveT += dt;
    const { sfx, game } = this.d, B = this.d.bridge;
    const arrive = THREE.MathUtils.smoothstep(this.squadT, 0, 3.5);
    const leave = THREE.MathUtils.smoothstep(this.leaveT, 0, 4.5);
    const castle = this.at(B.len + 25, 0, 30), exit = this.at(B.len * 0.5, 0, 60).addScaledVector(B.right, 80);
    const dummy = new THREE.Object3D(), wing = new THREE.Object3D(), tmp = new THREE.Vector3();
    const targets = this.targets();
    this.rifleSnd -= dt;
    this.flyers.forEach((f, i) => {
      f.prev.copy(f.pos);
      if (f.mode === 'fall') {
        f.fallV.y -= 9.8 * dt; f.pos.addScaledVector(f.fallV, dt); f.bank += f.spin * dt;
        if (f.pos.y < B.waterY) { this.splash(f.pos.clone().setY(B.waterY), false); sfx.splash(this.pan(f.pos), false, this.dist(f.pos)); f.mode = 'gone'; f.respawn = 6; }
      } else if (f.mode === 'gone') {
        f.respawn -= dt;
        if (f.respawn <= 0 && !this.leaving) { f.mode = 'fly'; f.pos.copy(castle); }
      } else {
        this.squadPos(f, this.squadT, tmp);
        tmp.lerpVectors(castle, tmp, arrive).lerp(exit, leave);
        f.pos.lerp(tmp, 1 - Math.exp(-dt * 3));
        const v = f.pos.clone().sub(f.prev);
        if (v.lengthSq() > 1e-6) {
          const yaw = Math.atan2(v.x, v.z);
          const dy = Math.atan2(Math.sin(yaw - f.yaw), Math.cos(yaw - f.yaw));
          f.yaw = yaw; f.bank = THREE.MathUtils.lerp(f.bank, THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3) * 0.35, -0.9, 0.9), 1 - Math.exp(-dt * 4));
          f.pitch = THREE.MathUtils.lerp(f.pitch, 0.9 - Math.atan2(v.y, Math.hypot(v.x, v.z)), 1 - Math.exp(-dt * 4));
        }
        // Rifle bursts at whatever's in reach.
        f.shotCd -= dt;
        if (f.shotCd <= 0 && arrive > 0.9 && !this.leaving && targets.length) {
          const tg = targets[Math.floor(Math.random() * targets.length)];
          if (tg.p.distanceTo(f.pos) < 34) { f.shotCd = rnd(1.4, 2.6); this.burst(f.pos, tg); } else f.shotCd = 0.3;
        }
      }
      f.flap += dt * (f.mode === 'fly' ? 13 : 30);
      dummy.position.copy(f.pos);
      dummy.rotation.set(f.pitch, f.yaw, f.bank, 'YXZ');
      dummy.scale.setScalar(f.mode === 'gone' ? 0 : 1);
      dummy.updateMatrix();
      this.bodies.setMatrixAt(i, dummy.matrix);
      for (const [mesh, s] of [[this.wingsL, -1], [this.wingsR, 1]] as const) {
        wing.position.set(s * 0.14, 0.28, -0.08);
        wing.rotation.set(0, 0, s * (0.15 + Math.sin(f.flap) * 0.75));
        wing.scale.set(s, 1, 1);
        wing.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix.clone().multiply(wing.matrix));
      }
    });
    for (const m of [this.bodies, this.wingsL, this.wingsR]) m.instanceMatrix.needsUpdate = true;

    // Miriam on her hover broom: wide figure-eights, blasting with green witch-lightning.
    const w = this.witch, mi = this.miriam;
    this.broom.visible = !!mi?.ready && !(this.leaving && leave >= 1);
    if (mi?.ready) {
      w.prev.copy(w.pos);
      const s = this.squadT * 0.2, fin = this.phase === 'finale';
      const goal = this.centre()
        .addScaledVector(B.right, (fin ? 11 : 17) * Math.sin(s))
        .addScaledVector(B.dir, (fin ? 7 : 11) * Math.sin(2 * s + 0.6))
        .addScaledVector(UP, (fin ? 4.5 : 8) + 2 * Math.sin(1.3 * s));
      goal.lerpVectors(castle, goal, arrive).lerp(exit, leave);
      w.pos.lerp(goal, 1 - Math.exp(-dt * 2.5));
      const v = w.pos.clone().sub(w.prev);
      const yaw = v.lengthSq() > 1e-6 ? Math.atan2(v.x, v.z) : mi.yaw;
      const dy = Math.atan2(Math.sin(yaw - mi.yaw), Math.cos(yaw - mi.yaw));
      mi.yaw = yaw;
      const bank = THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3) * 0.3, -0.6, 0.6);
      this.broom.position.copy(w.pos);
      this.broom.rotation.set(0, yaw, THREE.MathUtils.lerp(this.broom.rotation.z, bank, 1 - Math.exp(-dt * 3)), 'YXZ');
      mi.object.position.copy(w.pos).addScaledVector(UP, 0.06);
      mi.object.rotation.set(0, yaw + 0.5, this.broom.rotation.z * 0.8, 'YXZ');    // riding side-on, surfer style
      if (this.witchLight) { this.witchLight.pos.copy(w.pos); this.witchLight.intensity = 3 * (1 - leave); }
      game.sparkle({ pos: w.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), -1.3), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.5, 0), rnd(-0.3, 0.3)), color: new THREE.Color(0.25, 1.6, 0.4), size: 0.09, life: 0.8, drag: 1 });
      w.bolt -= dt;
      if (w.bolt <= 0 && arrive > 0.95 && !this.leaving && targets.length) {
        w.bolt = this.phase === 'finale' ? rnd(1.6, 2.4) : rnd(2.2, 3.4);
        const pick = this.phase === 'finale' && this.troll?.alive && Math.random() < 0.6 ? targets.find((t) => t.troll) ?? targets[0] : targets[Math.floor(Math.random() * targets.length)];
        this.witchBolt(w.pos.clone().addScaledVector(UP, 1.3), pick);
      }
      if (this.leaving && leave >= 1) { mi.object.removeFromParent(); this.miriam = null; this.broom.visible = false; }
    }
    if (this.leaving && leave >= 1) {
      this.squad = false; this.leaving = false;
      for (const m of [this.bodies, this.wingsL, this.wingsR]) m.visible = false;
      if (this.witchLight) this.witchLight.intensity = 0;
    }
    void now;
  }

  /** What the witch and the monkeys shoot at: arms out of the water, and (finale) the troll. */
  private targets() {
    const out: { p: THREE.Vector3; arm?: Tentacle; troll?: boolean }[] = [];
    for (const a of this.arms) if (a.up) out.push({ p: a.pts[Math.floor(a.pts.length * 0.62)], arm: a });
    if (this.phase === 'finale' && this.troll?.alive) {
      const tp = this.troll.object.position.clone().setY(this.troll.object.position.y + 1.8);
      out.push({ p: tp, troll: true }, { p: tp, troll: true });
    }
    return out;
  }
  /** Helpers chip the troll down but never take the kill from Jack. */
  private helperHit(dmg: number, from: THREE.Vector3) {
    const tr = this.troll;
    if (!tr?.alive) return;
    const floor = tr.maxHp * 0.06;
    if (tr.hp - dmg > floor) tr.damage(dmg, from); else tr.hp = Math.min(tr.hp, floor);
  }
  private burst(from: THREE.Vector3, tg: { p: THREE.Vector3; arm?: Tentacle; troll?: boolean }) {
    const { game, sfx } = this.d;
    const to = tg.p.clone().add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(-0.6, 0.6), rnd(-0.6, 0.6)));
    const dir = to.clone().sub(from).normalize(), len = from.distanceTo(to);
    for (let k = 0; k < 3; k++) {
      game.sparkle({ pos: from.clone().addScaledVector(dir, 0.6 + k * 0.5), vel: dir.clone().multiplyScalar(85), color: new THREE.Color(3, 2.2, 0.8), size: 0.05, life: len / 85, drag: 0 });
    }
    game.sparkle({ pos: from.clone().addScaledVector(dir, 0.5), vel: new THREE.Vector3(), color: new THREE.Color(4, 3, 1), size: 0.25, life: 0.06 });
    for (let k = 0; k < 6; k++) game.sparkle({ pos: to.clone(), vel: new THREE.Vector3(rnd(-3, 3), rnd(0, 4), rnd(-3, 3)), color: new THREE.Color(2.5, 1.6, 0.6), size: 0.04, life: 0.3, gravity: 9 });
    if (this.rifleSnd <= 0) { this.rifleSnd = 0.22; sfx.rifle(this.pan(from), this.dist(from)); }
    if (tg.troll) this.helperHit(9, from);
    else if (tg.arm && Math.random() < 0.25) tg.arm.recoil();
  }
  private witchBolt(from: THREE.Vector3, tg: { p: THREE.Vector3; arm?: Tentacle; troll?: boolean }) {
    const { game, sfx } = this.d;
    const to = tg.p.clone();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.boltMat);
    mesh.frustumCulled = false; mesh.renderOrder = 8;
    this.d.scene.add(mesh);
    this.bolts.push({ mesh, from, to, t: 0 });
    this.jag(mesh, from, to);
    game.flashAt(to, 0x43ff6a, 30);
    game.flashAt(from, 0x43ff6a, 12);
    for (let k = 0; k < 26; k++) game.sparkle({ pos: to.clone(), vel: new THREE.Vector3(rnd(-5, 5), rnd(-2, 5), rnd(-5, 5)), color: new THREE.Color(0.3, 2.2, 0.6), size: 0.07, life: 0.5, drag: 2 });
    sfx.witchBolt(this.pan(to), this.dist(to));
    if (tg.arm) tg.arm.recoil();
    if (tg.troll) this.helperHit(40, from);
  }
  /** A forked, flickering ribbon from → to (rebuilt every few frames while it lives). */
  private jag(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
    const cam = this.d.camera.position;
    const strands: THREE.Vector3[][] = [];
    const main: THREE.Vector3[] = [];
    const n = 10, len = from.distanceTo(to);
    for (let i = 0; i <= n; i++) {
      const k = i / n, q = from.clone().lerp(to, k);
      if (i > 0 && i < n) q.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(len * 0.03));
      main.push(q);
    }
    strands.push(main);
    for (let b = 0; b < 2; b++) {
      const s = 2 + Math.floor(Math.random() * 6), fork = [main[s].clone()];
      for (let i = 1; i < 4; i++) fork.push(fork[i - 1].clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 0.4), rnd(-1, 1)).multiplyScalar(len * 0.06)));
      strands.push(fork);
    }
    const pos: number[] = [];
    strands.forEach((pts, si) => {
      const w = si === 0 ? 0.07 : 0.035;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const side = new THREE.Vector3().crossVectors(b.clone().sub(a), cam.clone().sub(a)).normalize().multiplyScalar(w);
        const a0 = a.clone().sub(side), a1 = a.clone().add(side), b0 = b.clone().sub(side), b1 = b.clone().add(side);
        pos.push(...a0.toArray(), ...a1.toArray(), ...b1.toArray(), ...a0.toArray(), ...b1.toArray(), ...b0.toArray());
      }
    });
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  private updateBolts(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      if (b.t > 0.32) { b.mesh.removeFromParent(); b.mesh.geometry.dispose(); this.bolts.splice(i, 1); continue; }
      if (Math.floor(b.t / 0.05) !== Math.floor((b.t - dt) / 0.05)) this.jag(b.mesh, b.from, b.to);
    }
  }

  // ── the bridge coming apart ────────────────────────────────────────────────
  /** Lift a deck part out into the world (it keeps its world transform). */
  private detach(o: THREE.Object3D) {
    o.updateWorldMatrix(true, false);
    const m = o.matrixWorld.clone();
    this.d.scene.add(o);
    m.decompose(o.position, o.quaternion, o.scale);
    o.userData.dynamic = true;
  }
  private updatePieces(dt: number) {
    const B = this.d.bridge;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i];
      pc.t += dt;
      if (!pc.wet) {
        pc.v.y -= 9.8 * dt;
        pc.o.position.addScaledVector(pc.v, dt);
        pc.o.rotation.x += pc.w.x * dt; pc.o.rotation.y += pc.w.y * dt; pc.o.rotation.z += pc.w.z * dt;
        if (pc.o.position.y < B.waterY) { pc.wet = true; pc.t = 0; this.splash(pc.o.position.clone().setY(B.waterY), false); this.d.sfx.splash(this.pan(pc.o.position), false, this.dist(pc.o.position)); }
      } else {
        pc.o.position.y -= dt * 0.6;
        if (pc.t > 2) { pc.o.removeFromParent(); this.pieces.splice(i, 1); }
      }
    }
  }
  /**
   * A blow on the deck: splinters always; near the edges (outside a 1.8 m walkway down the
   * middle) the planks give way into a jagged hole.
   */
  private crack(at: THREE.Vector3, r: number) {
    const B = this.d.bridge;
    const l = this.local(at);
    this.splinters(at.clone().setY(B.deckY + 0.1), 18);
    if (Math.abs(l.across) < 0.25 || l.along < 0.5 || l.along > B.len - 0.5 || this.holes.length >= 8) return;
    r = Math.min(r, 0.75);
    const across = Math.sign(l.across) * (B.width / 2 - r * 0.45);
    const c = this.at(l.along, across, B.deckY + 0.012);
    if (this.holes.some((h) => h.c.distanceTo(c) < h.r + r * 0.5)) return;
    // Jagged hole.
    const shape = new THREE.Shape();
    const k = 11;
    for (let i = 0; i <= k; i++) {
      const a = (i / k) * Math.PI * 2, rr = r * (i % 2 ? rnd(0.55, 0.8) : rnd(0.9, 1.15));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.75;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const hole = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.scarMat);
    hole.rotation.x = -Math.PI / 2;
    hole.rotation.z = Math.atan2(B.dir.x, B.dir.z);
    hole.position.copy(c);
    this.scars.add(hole);
    // Broken plank ends bristling up around the rim.
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, rnd(0.3, 0.7)), this.splinterMat);
      sp.position.copy(c).add(new THREE.Vector3(Math.cos(a) * r * 0.85, 0.06, Math.sin(a) * r * 0.65));
      sp.rotation.set(rnd(-0.9, -0.3), a + rnd(-0.4, 0.4), rnd(-0.3, 0.3));
      this.scars.add(sp);
    }
    // Planks dropping through.
    for (let i = 0; i < 5; i++) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.15, 0.3), 0.06, rnd(0.6, 1.2)), this.splinterMat);
      pl.position.copy(c).add(new THREE.Vector3(rnd(-r, r) * 0.6, -0.1, rnd(-r, r) * 0.6));
      this.d.scene.add(pl);
      this.pieces.push({ o: pl, v: new THREE.Vector3(rnd(-1, 1), rnd(-2, 0), rnd(-1, 1)), w: new THREE.Vector3(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)), t: 0, wet: false });
    }
    this.holes.push({ c, r: r * 0.85 });
  }
  /** Keep Jack out of the holes (the walkway is never holed). */
  private pushOutOfHoles() {
    const p = this.d.player.object.position;
    for (const h of this.holes) {
      const d = new THREE.Vector2(p.x - h.c.x, p.z - h.c.z), min = h.r + 0.3;
      if (d.length() < min && Math.abs(p.y - h.c.y) < 1) { d.setLength(min); p.x = h.c.x + d.x; p.z = h.c.z + d.y; }
    }
  }
  private splinters(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) this.d.game.debris({ pos: at.clone().add(new THREE.Vector3(rnd(-0.4, 0.4), 0.1, rnd(-0.4, 0.4))), vel: new THREE.Vector3(rnd(-3, 3), rnd(2, 6), rnd(-3, 3)), color: new THREE.Color(0.22, 0.22, 0.24), size: rnd(0.04, 0.12), life: 1.2, gravity: 12 });
  }
  private splash(at: THREE.Vector3, big: boolean) {
    const B = this.d.bridge, n = big ? 70 : 22, s = big ? 1 : 0.5;
    const c = at.clone().setY(B.waterY + 0.05);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0, 1.2) * s;
      this.d.game.sparkle({ pos: c.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)), vel: new THREE.Vector3(Math.cos(a) * rnd(1, 4) * s, rnd(3, 11) * s, Math.sin(a) * rnd(1, 4) * s), color: new THREE.Color(0.35, 0.42, 0.5), size: rnd(0.08, 0.2) * s, life: rnd(0.8, 1.5), gravity: 9.8, drag: 0.4 });
    }
  }

  /** The troll's fist hit the deck (game.ts → onTrollSlam). */
  trollSlam(m: Mob) {
    const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    const at = m.object.position.clone().addScaledVector(fwd, 2);
    if (this.onDeck(at)) { this.crack(at, 0.8); this.d.sfx.woodCrack(this.pan(at), this.dist(at)); }
  }
  private onDeck(p: THREE.Vector3) { const l = this.local(p); return l.along > 0 && l.along < this.d.bridge.len && Math.abs(l.across) < this.d.bridge.width / 2; }
}
