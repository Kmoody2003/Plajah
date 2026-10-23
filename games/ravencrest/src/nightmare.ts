// The nightmare — the final boss. It can only begin once the Bridge Troll is beaten and Jack is inside
// the castle (the Grand Hall); a few seconds in, the castle turns on him.
//   toll    — the tower clock bell tolls; the world dims to silhouettes; the orbs become the light.
//   stalk   — laughter circles in the dark and closes; a figure darts through the shadows,
//             caught in lightning, once even standing behind you.
//   reveal  — Count Dracula steps out of the dark; title card, organ, lightning. Then: fight.
//   boss    — melee + teleport strikes, bat swarms, mist form (summons wolves), life drain; three
//             escalating tiers (harder, faster, more often) as his life falls.
//   blast   — at half life, in the hall: a supernatural blast hurls Jack out through the front door.
//   flyout  — the Count flies out after him; the fight finishes in the courtyard, in the storm.
//   defeat  — "The Count claims Ravencrest": you rise and he comes again.
//   victory — he burns to ash in a storm of bats; light and calm return.
import * as THREE from 'three/webgpu';
import { color, float, pow, dot, normalView, positionViewDirection } from 'three/tsl';
import { Mob } from './mobs';
import type { Game, LevelName } from './game';
import type { PlayerController } from './player';
import type { Weather } from './weather';
import type { Sfx } from './sfx';
import type { GameAudio } from './audio';
import type { LightPool } from './lights';

export interface NightmareDeps {
  game: Game; player: PlayerController; camera: THREE.PerspectiveCamera;
  weather: Weather; sfx: Sfx; audio: GameAudio;
  level(): LevelName;
  pools: LightPool[];
  sky: { uDim: { value: number } };
  /** Lights that dim toward silhouette: `base` is what weather.ts flashes on top of, `base0`
   *  the resting level, `keep` the fraction left in the dark. Shared with the weather rig. */
  dimLights: { light: THREE.Light; base: number; base0: number; keep: number }[];
  envScenes: { scene: THREE.Scene; base: number }[];
  renderer: THREE.WebGPURenderer;
  live(): boolean;
  /** Self-lit surfaces (billboard faces, painted screens) dimmed with the night: 1 → normal. */
  glow(k: number): void;
  /** May the nightmare begin? (troll defeated and Jack inside the castle) */
  ready(): boolean;
  /** Throw Jack out of the castle through the front door (to the courtyard). */
  eject(): void;
  /** Just outside the hall's front door: where Jack lands and the Count swoops in. */
  frontDoor(): { pos: THREE.Vector3; yaw: number };
}

type Phase = 'wait' | 'toll' | 'stalk' | 'reveal' | 'boss' | 'blast' | 'flyout' | 'defeat' | 'victory' | 'done';
const PHASE = { toll: 8.5, stalk: 26, reveal: 6.5 };

export class Nightmare {
  phase: Phase = 'wait';
  private t = 0;           // seconds in phase
  private idle = 0;        // seconds without choosing a film
  private dim = 0;
  private wait: number;
  private phantom: Mob | null = null;
  private boss: Mob | null = null;
  private nextLaugh = 0; private nextBeat = 0; private nextDart = 0;
  private dart: { from: THREE.Vector3; dir: THREE.Vector3; t: number } | null = null;
  private behindShown = 0; private behindT = -1;
  private tolls = 0;
  private nextTeleport = 0; private nextSwarm = 0; private mistUntil = 0; private mistMarks = new Set<number>();
  private ui = document.createElement('div');
  private bar!: HTMLDivElement; private title!: HTMLDivElement;
  private exposure0: number;
  private blasted = false; private blastHit = false; private ejected = false;
  private tier = 0;
  private fly: { from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private white = document.createElement('div');

  constructor(private d: NightmareDeps, waitSeconds = 120) {
    this.wait = waitSeconds;
    this.exposure0 = d.renderer.toneMappingExposure;
    this.ui.id = 'nightmare';
    this.ui.innerHTML = '<div class="nm-title"><h1></h1><h2></h2></div><div class="nm-boss"><span>COUNT DRACULA</span><div><i></i></div></div>';
    document.body.appendChild(this.ui);
    this.title = this.ui.querySelector('.nm-title')!;
    this.bar = this.ui.querySelector('.nm-boss')!;
    this.white.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .5s;z-index:13';
    document.body.appendChild(this.white);
  }

  /** Dracula has fallen (daybreak.ts takes it from here). */
  onVictory?: (at: THREE.Vector3) => void;
  /** Exposure the dim works from (daybreak raises it). */
  get exposureBase() { return this.exposure0; }
  set exposureBase(e: number) { this.exposure0 = e; }
  /** A film was chosen: the countdown starts over. */
  filmChosen() { if (this.phase === 'wait') this.idle = 0; }
  /** Start it now (debug / ?nightmare=). */
  trigger() { if (this.phase === 'wait' || this.phase === 'done') this.go('toll'); }

  private go(p: Phase) {
    this.phase = p; this.t = 0;
    const { sfx, audio } = this.d;
    if (p === 'toll') { audio.setMood('dread'); this.tolls = 0; this.d.weather.force = Math.max(this.d.weather.force, 0.8); }
    if (p === 'stalk') { this.nextLaugh = 1; this.nextDart = 2.5; this.behindShown = 0; this.spawnPhantom(); }
    if (p === 'reveal') this.startReveal();
    if (p === 'boss') { setTimeout(() => this.d.game.summonMelvin(300), 4000); this.d.game.bossTarget = this.boss; audio.setMood('boss'); this.nextTeleport = 7; this.nextSwarm = 10; this.mistMarks.clear(); this.bar.classList.add('on'); this.d.player.enabled = true; this.d.player.cinematic = false; }
    if (p === 'victory') {
      sfx.bossDeath(); audio.setMood('victory');
      this.onVictory?.(this.boss!.object.position.clone());
      this.d.game.scatterBats();
      this.showTitle('DRACULA DEFEATED', 'The night breaks over Ravencrest', 5);
      this.bar.classList.remove('on');
      for (let i = 0; i < 4; i++) setTimeout(() => this.d.weather.strike(60 + Math.random() * 80, this.d.player.object.position), i * 350);
    }
    if (p === 'blast') { this.blasted = true; this.blastHit = false; this.ejected = false; this.bar.classList.remove('on'); }
    if (p === 'flyout') this.startFlyout();
    if (p === 'defeat') { this.showTitle('THE COUNT CLAIMS RAVENCREST', 'Rise, and face him again', 3); this.bar.classList.remove('on'); }
  }

  private showTitle(h: string, sub: string, secs: number) {
    this.title.querySelector('h1')!.textContent = h;
    this.title.querySelector('h2')!.textContent = sub;
    this.title.classList.add('on');
    setTimeout(() => this.title.classList.remove('on'), secs * 1000);
  }

  // ── actors ─────────────────────────────────────────────────────────────────
  private dress(m: Mob) {
    // The Muse vampire as the Count: near-black, with burning red eyes for the silhouettes.
    const tryDress = () => {
      if (!m.ready || !m.body) { setTimeout(tryDress, 200); return; }
      // Near-black body with a cold moonlit rim, so he reads as an edged silhouette in the dark.
      m.body.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        const nm = new THREE.MeshStandardNodeMaterial({ map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap, aoMap: src.aoMap, roughness: 0.5, metalness: 0.1 });
        nm.color.copy(src.color).multiplyScalar(0.85);   // Muse's Dracula is already painted night-dark
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const facing: any = dot(normalView, positionViewDirection).abs();
        nm.emissiveNode = color(0x5a6a94).mul(pow(float(1).sub(facing), float(5))).mul(0.35);
        mesh.material = nm;
      });
      let head: THREE.Object3D | null = null;
      m.body.traverse((o) => { if (!head && o.name.replace(/_\d+$/, '') === 'Head') head = o; });
      const eyeMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xff1a0a).multiplyScalar(12) });
      const host = head ?? m.body;
      const ws = host.getWorldScale(new THREE.Vector3()).x || 1;
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.026 / ws, 8, 6), eyeMat);
        e.position.set(sx * 0.035 / ws, 0.08 / ws, 0.09 / ws);
        host.add(e);
      }
    };
    tryDress();
    // A faint red glow travels with him (it ignores the night's dimming).
    const v = this.d.pools[this.d.level() === 'hall' ? 1 : 0].addTransient(m.object.position, 0xff2a1a, 5, 5);
    this.auras.push({ m, v });
  }
  private auras: { m: Mob; v: ReturnType<LightPool['addTransient']> }[] = [];
  private spawnPhantom() {
    if (this.phantom) return;
    const lvl = this.d.level();
    this.phantom = this.d.game.spawn(new Mob('dracula', 'npc', new THREE.Vector3(0, -200, 0), lvl));
    this.dress(this.phantom);
  }
  private hidePhantom() { if (this.phantom) this.phantom.object.position.set(0, -200, 0); }

  private ground(p: THREE.Vector3) {
    const g = this.d.game.groundAt(this.d.level(), p.x, p.z, p.y + 6);
    if (g !== null) p.y = g;
    return p;
  }
  private camDir() { return new THREE.Vector3(-Math.sin(this.d.player.camYaw), 0, -Math.cos(this.d.player.camYaw)); }
  /** Pan (-1 left … 1 right) of a world point relative to the camera. */
  private panOf(p: THREE.Vector3) {
    const to = p.clone().sub(this.d.camera.position).setY(0).normalize();
    const right = new THREE.Vector3(Math.cos(this.d.player.camYaw), 0, -Math.sin(this.d.player.camYaw));
    return THREE.MathUtils.clamp(to.dot(right), -1, 1);
  }

  // ── reveal ─────────────────────────────────────────────────────────────────
  private revealFrom = new THREE.Vector3();
  private startReveal() {
    const p = this.d.player.object.position;
    this.hidePhantom();
    const dir = this.camDir();
    const at = this.ground(p.clone().addScaledVector(dir, 11));
    this.revealFrom.copy(at);
    if (!this.boss || !this.boss.alive) {
      this.boss?.object.removeFromParent();
      this.boss = this.d.game.spawn(new Mob('dracula', 'npc', at, this.d.level(), Math.atan2(-dir.x, -dir.z)));
      this.dress(this.boss);
    } else {
      // Back for another round after a defeat: whole again, and scripted until the fight.
      this.boss.team = 'npc'; this.boss.hp = this.boss.maxHp; this.boss.shield = false;
      this.boss.object.position.copy(at);
    }
    this.d.player.enabled = false;
    this.d.player.cinematic = true;
    this.d.sfx.revealSting();
    this.d.weather.strike(45, p);
    setTimeout(() => this.d.sfx.laugh(0, 4, 0.92), 1600);
    this.showTitle('COUNT DRACULA', 'Lord of Ravencrest', 4.5);
  }

  // ── per frame ──────────────────────────────────────────────────────────────
  update(dt: number) {
    for (const a of this.auras) {
      a.v.pos.copy(a.m.object.position).setY(a.m.object.position.y + 0.9);
      a.v.intensity = a.m.alive && a.m.object.position.y > -100 ? 1.6 : 0;
    }
    if (!this.d.live() && this.phase !== 'reveal') return;
    this.t += dt;
    const { sfx, player, camera } = this.d;
    const p = player.object.position;

    if (this.phase === 'wait') {
      // Only once the Bridge Troll is beaten and Jack is inside the castle.
      if (!this.d.ready()) { this.idle = 0; return; }
      this.idle += dt;
      if (this.idle >= this.wait) this.go('toll');
      return;
    }

    // Over and fully lifted: the daybreak owns the light from here.
    if (this.phase === 'done' && this.dim < 0.01) return;
    // Dimming toward silhouettes (and back after victory).
    const wantDim = this.phase === 'victory' || this.phase === 'done' ? 0 : this.phase === 'toll' ? Math.min(1, this.t / PHASE.toll) : 1;
    this.dim += (wantDim - this.dim) * (1 - Math.exp(-dt * (this.phase === 'victory' ? 0.5 : 2)));
    this.applyDim(this.dim);

    // Heartbeat while it hunts.
    if (this.phase === 'stalk' || this.phase === 'reveal') {
      this.nextBeat -= dt;
      const k = this.phase === 'reveal' ? 1 : this.t / PHASE.stalk;
      if (this.nextBeat <= 0) { this.nextBeat = 1.15 - 0.55 * k; sfx.heartbeat(0.5 + 0.5 * k); }
    }

    switch (this.phase) {
      case 'toll':
        if (this.t >= this.tolls * 2.4 && this.tolls < 4) { this.tolls++; sfx.toll(); }
        if (this.t >= PHASE.toll + 1.5) this.go('stalk');
        break;
      case 'stalk': this.stalk(dt, p); if (this.t >= PHASE.stalk) this.go('reveal'); break;
      case 'reveal': {
        const b = this.boss!;
        const k = Math.min(1, this.t / PHASE.reveal);
        // He walks out of the dark toward the player; the camera holds low beside Jack.
        const toward = p.clone().sub(this.revealFrom).setY(0).normalize();
        b.object.position.copy(this.ground(this.revealFrom.clone().addScaledVector(toward, 4.5 * k)));
        b.yaw = Math.atan2(toward.x, toward.z);
        b.pose(k < 0.95 ? 'walk' : 'idle');
        const side = new THREE.Vector3(toward.z, 0, -toward.x);
        const cam = p.clone().addScaledVector(toward, 2.6).addScaledVector(side, 1.4).setY(p.y + 0.9 + 0.4 * (1 - k));
        camera.position.lerp(cam, 1 - Math.exp(-dt * 3));
        camera.lookAt(b.object.position.clone().setY(b.object.position.y + 1.9 - 0.4 * k));
        camera.fov = 38 - 6 * k; camera.updateProjectionMatrix();
        if (this.t >= PHASE.reveal) {
          b.makeEnemy(p);
          this.go('boss');
        }
        break;
      }
      case 'boss': this.bossFight(dt, p); break;
      case 'blast': this.blast(p); break;
      case 'flyout': this.flyout(dt, p); break;
      case 'defeat':
        if (this.t > 3.2 && !this.d.game.isDown) { this.go('reveal'); }
        break;
      case 'victory':
        this.d.weather.force = 0;
        if (this.t > 8) { this.phase = 'done'; this.d.audio.setMood('explore'); }
        break;
    }
  }

  private applyDim(d: number) {
    const D = this.d;
    D.sky.uDim.value = d * 0.85;
    for (const pool of D.pools) pool.scale = 1 - 0.85 * d;
    for (const l of D.dimLights) l.base = THREE.MathUtils.lerp(l.base0, l.base0 * l.keep, d);
    for (const e of D.envScenes) e.scene.environmentIntensity = e.base * (1 - 0.8 * d);
    D.renderer.toneMappingExposure = this.exposure0 * (1 - 0.32 * d);
    D.glow(1 - 0.85 * d);
    D.game.orbBoost = 1 + 1.6 * d;
  }

  private stalk(dt: number, p: THREE.Vector3) {
    const { sfx } = this.d;
    const k = this.t / PHASE.stalk;
    // Laughter, closing in from all around.
    this.nextLaugh -= dt;
    if (this.nextLaugh <= 0) {
      this.nextLaugh = 3.2 + Math.random() * 2.6;
      const dist = THREE.MathUtils.lerp(30, 5, k);
      const a = Math.random() * Math.PI * 2;
      const at = p.clone().add(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist));
      sfx.laugh(this.panOf(at), dist, 0.9 + Math.random() * 0.2);
    }
    // Darting through the shadows at the edge of vision.
    const ph = this.phantom;
    if (!ph?.ready) return;
    if (this.dart) {
      this.dart.t += dt;
      const pos = this.dart.from.clone().addScaledVector(this.dart.dir, 11 * this.dart.t);
      ph.object.position.copy(this.ground(pos));
      ph.yaw = Math.atan2(this.dart.dir.x, this.dart.dir.z);
      ph.pose('run');
      if (this.dart.t > 0.75) { this.mistAt(ph.object.position); this.hidePhantom(); this.dart = null; }
      return;
    }
    if (this.behindT >= 0) {
      // Standing right behind Jack; gone the moment you look at him.
      this.behindT += dt;
      const toP = ph.object.position.clone().sub(this.d.camera.position).setY(0).normalize();
      const looking = toP.dot(this.camDir()) > 0.75;
      ph.pose('idle');
      if ((looking && this.behindT > 0.25) || this.behindT > 4) { sfx.laugh(this.panOf(ph.object.position), 2.5, 0.95); this.mistAt(ph.object.position); this.hidePhantom(); this.behindT = -1; }
      return;
    }
    this.nextDart -= dt;
    if (this.nextDart > 0) return;
    this.nextDart = 2.8 + Math.random() * 2.2;
    if (this.behindShown < 1 && k > 0.55) {
      this.behindShown++;
      const back = this.camDir().negate();
      ph.object.position.copy(this.ground(p.clone().addScaledVector(back, 3.2)));
      ph.yaw = Math.atan2(-back.x, -back.z);
      this.behindT = 0;
      return;
    }
    // Peripheral: 14–32° off the view centre (inside the frame's edge), closing over the phase.
    const dist = THREE.MathUtils.lerp(24, 9, k);
    const side = Math.random() < 0.5 ? -1 : 1;
    const ang = Math.atan2(this.camDir().x, this.camDir().z) + side * THREE.MathUtils.degToRad(14 + Math.random() * 18);
    const from = p.clone().add(new THREE.Vector3(Math.sin(ang) * dist, 0, Math.cos(ang) * dist));
    const across = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)).multiplyScalar(-side);
    this.dart = { from, dir: across, t: 0 };
    if (Math.random() < 0.45) this.d.weather.strike(60 + Math.random() * 60, p);
  }

  private mistAt(pos: THREE.Vector3) {
    this.d.sfx.mist(this.panOf(pos));
    this.d.game.smoke(pos, 40);
  }

  private bossFight(dt: number, p: THREE.Vector3) {
    const b = this.boss!;
    const { game, sfx } = this.d;
    // Bar.
    (this.bar.querySelector('i') as HTMLElement).style.width = `${(100 * b.hp) / b.maxHp}%`;
    if (game.isDown) { this.go('defeat'); return; }
    if (!b.alive) { this.go('victory'); return; }
    if (b.scripted) return;        // stunned (the orbs' angel): no teleports, no swarms
    b.home.copy(p);
    // Three tiers as his life falls: hits harder, moves faster, strikes and summons more often.
    const life = b.hp / b.maxHp;
    const tier = life > 0.66 ? 0 : life > 0.33 ? 1 : 2;
    if (tier !== this.tier) {
      this.tier = tier;
      game.call(tier === 1 ? 'The Count grows furious' : 'The Count is enraged!', 1.6, '#ff4a3a');
      sfx.laugh(this.panOf(b.object.position), 4, 0.85);
    }
    b.power = [1, 1.25, 1.55][tier]; b.haste = [1, 1.15, 1.32][tier];
    const pace = [1, 0.72, 0.5][tier];
    // Half his life, still in the castle: the blast that throws Jack out into the storm.
    if (!this.blasted && this.d.level() === 'hall' && life < 0.55) { this.go('blast'); return; }
    // Mist form at 2/3 and 1/3: untouchable for 4 s, wolves answer his call.
    for (const mark of [0.66, 0.33]) {
      if (b.hp / b.maxHp < mark && !this.mistMarks.has(mark)) {
        this.mistMarks.add(mark);
        this.mistUntil = this.t + 4;
        b.shield = true;
        this.mistAt(b.object.position);
        sfx.laugh(this.panOf(b.object.position), 6, 0.9);
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          game.spawn(new Mob('wolf', 'enemy', this.ground(p.clone().add(new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9))), this.d.level()));
        }
      }
    }
    if (b.shield && this.t > this.mistUntil) b.shield = false;
    if (b.shield) { game.smoke(b.object.position.clone().setY(b.object.position.y + 1), 3); }

    // Teleport strike: gone in mist, reappears at your back and swings.
    if (this.t > this.nextTeleport && !b.shield) {
      this.nextTeleport = this.t + (7 + Math.random() * 3) * pace;
      this.mistAt(b.object.position);
      const back = this.camDir().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
      b.object.position.copy(this.ground(p.clone().addScaledVector(back, 2.6)));
      this.mistAt(b.object.position);
      b.strikeNow();
    }
    // He summons a swarm of bats: they wheel around Jack and dive; cut them down or roll.
    if (this.t > this.nextSwarm && !b.shield) {
      this.nextSwarm = this.t + (12 + Math.random() * 5) * pace;
      game.releaseBats(b.object.position);
      game.smoke(b.object.position.clone().setY(b.object.position.y + 1.5), 20);
      sfx.laugh(this.panOf(b.object.position), Math.max(2, b.object.position.distanceTo(p)), 1);
    }
  }

  // ── the blast: out through the front door ────────────────────────────────────
  private blast(p: THREE.Vector3) {
    const b = this.boss!, { game, sfx, player, weather } = this.d;
    b.scripted = true;
    const to = p.clone().sub(b.object.position).setY(0);
    b.yaw = Math.atan2(to.x, to.z); b.object.rotation.y = b.yaw;
    player.enabled = false;
    if (this.t < 1.1) {
      // Gathering: he rears up, the dark pulls in around him.
      b.pose('attack3');
      game.smoke(b.object.position.clone().setY(b.object.position.y + 1.6 + Math.random()), 2);
      player.shake = Math.max(player.shake, 0.2 * this.t);
      return;
    }
    if (!this.blastHit) {
      this.blastHit = true;
      sfx.revealSting(); sfx.bossDeath();
      weather.strike(15, p);
      this.white.style.opacity = '0.9';
      setTimeout(() => { this.white.style.opacity = '0'; }, 260);
      player.shake = 1.2;
      player.impulse(to.clone().normalize(), 16, 0.45, false);
      game.hurtPlayer(15, b.object.position);
      this.showTitle('', 'Thrown from the castle', 2.2);
    }
    if (this.t > 1.55 && !this.ejected) { this.ejected = true; this.d.eject(); }
    if (this.t > 2.4) this.go('flyout');
  }

  private startFlyout() {
    const b = this.boss!, { game } = this.d;
    const door = this.d.frontDoor();
    const out = new THREE.Vector3(Math.sin(door.yaw), 0, Math.cos(door.yaw));   // away from the hall
    const from = door.pos.clone().addScaledVector(out, -3).setY(door.pos.y + 7);
    const to = this.ground(door.pos.clone().addScaledVector(out, 7));
    game.relocate(b, 'outside', from);
    const v = this.d.pools[0].addTransient(b.object.position, 0xff2a1a, 5, 5);
    this.auras.push({ m: b, v });
    this.fly = { from, to };
    this.d.weather.force = 1;               // the storm breaks over the courtyard
    game.releaseBats(from);
    this.d.sfx.laugh(0, 8, 0.9);
    this.showTitle('', 'He comes for you through the storm', 2.6);
  }

  private flyout(dt: number, p: THREE.Vector3) {
    const b = this.boss!, f = this.fly!;
    const k = Math.min(1, this.t / 2.6), e = k * k * (3 - 2 * k);
    b.object.position.lerpVectors(f.from, f.to, e).y += Math.sin(Math.PI * k) * 2.5;
    const to = p.clone().sub(b.object.position).setY(0);
    b.yaw = Math.atan2(to.x, to.z); b.object.rotation.set(0.35 * (1 - k), b.yaw, 0);
    b.pose(k < 0.9 ? 'run' : 'idle');
    this.d.game.smoke(b.object.position.clone().setY(b.object.position.y + 1), 3);
    void dt;
    if (k >= 1) {
      b.object.rotation.set(0, b.yaw, 0);
      b.scripted = false;
      b.makeEnemy(p);
      this.phase = 'boss'; this.t = 0;          // resume the fight (no re-intro)
      this.d.game.bossTarget = b;
      this.nextTeleport = 6; this.nextSwarm = 4;
      this.bar.classList.add('on');
    }
  }
}
