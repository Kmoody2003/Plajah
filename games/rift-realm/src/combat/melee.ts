// Rift Realm close combat as a fighting game: light / heavy chains with timing windows and on-beat bonuses, a guard
// with a perfect-parry counter, hit-stun, launchers and air strings, guard breaks, the dash-in strike, and the
// Soul-Rend executions (a slowed, side-on camera beat while the vessel tears the rift-soul out of a broken enemy).
// All numbers live in combat/tuning.ts (COMBAT.player / COMBAT.feel).
//
// Controls: F / E light, G heavy (or hold F / gamepad X ~0.3 s), hold X / mouse back-button / gamepad R3 to guard
// (tap it just before a hit lands = perfect parry). Shift dash: i-frames, and a strike right after is the lunge.
import * as THREE from 'three/webgpu';
import type { PlayerController } from '../player';
import type { EnemyManager, Enemy, EnemyStrike, StrikeOutcome, HitResult } from '../enemies';
import type { RhythmEngine, BeatQuality } from '../rhythm';
import type { Targeting } from '../targeting';
import { VfxSystem, HIT_SPARKS, HIT_PERFECT, WALL_IMPACT, KILL_BURST, SHADOW_BURST, SLASH, SLASH_PERFECT, SLASH_SHADOW } from '../../../../services/vfx';
import { COMBAT, type PlayerMove } from './tuning';

export interface MeleeHost {
  player: PlayerController;
  enemies: EnemyManager;
  vfx: VfxSystem;
  rhythm: RhythmEngine;
  targeting: Targeting;
  camera: THREE.PerspectiveCamera;
  rayDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number): number;
  resonance: { get(): number; set(v: number): void };
  addScore(pts: number): void;
  feedback(label: string, color: string): void;
  showHit(point: THREE.Vector3, dmg: number, killed: boolean): void;
  /** A kill by a strike / a Soul-Rend: XP, achievements. */
  onKill(e: Enemy, how: 'melee' | 'rend'): void;
  /** Any fight contact (starts the match, keeps the combat music). */
  onContact(): void;
  /** A swing started: main lights the blade trail. */
  onSwing(tint: number, perfect: boolean): void;
  /** Optional strike damage multiplier (a power-up such as danger.dmgMul / Furyberry). */
  dmgMul?: () => number;
}

type Input = 'L' | 'H';
const SLASHES = { slash: SLASH, perfect: SLASH_PERFECT, shadow: SLASH_SHADOW } as const;
/** Combo tiers, by hit count (music words: the fight builds like a piece). */
const TIERS: [number, string, string][] = [[3, 'ECHO', '#7dd3fc'], [6, 'CADENCE', '#38bdf8'], [10, 'CRESCENDO', '#a78bfa'], [16, 'FORTISSIMO', '#f472b6'], [25, 'SYMPHONY', '#fbbf24']];

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Melee {
  move: PlayerMove | null = null;
  private moveT = 0;
  private hitDone = false;
  private moveFwd = new THREE.Vector3(0, 0, -1);
  private moveQ: BeatQuality = 'OFF';
  private moveCounter = false;
  private flip = false;
  chain = '';
  private windowT = 0;
  private buffered: Input | null = null;
  private bufferT = 0;
  counterT = 0;
  private sinceDash = 9;
  private iframeT = 0;
  combo = 0;
  private comboT = 0;
  private beatChain = 0;
  guard = 0;
  blocking = false;
  private blockSince = 9;
  private blockAnimT = 0;
  stunT = 0;
  private hitStopT = 0;
  private slowT = 0;
  private slowScale = 1;
  private holdT = 0;
  private holdFired = false;
  private mouseBlock = false;
  exec: { e: Enemy; t: number; stage: number; variant: 'rend' | 'resonant' | 'sky'; fp: boolean; side: THREE.Vector3 } | null = null;
  /** Debug: counts of what happened (for the arena checks). */
  readonly stats = { swings: 0, hits: 0, blocks: 0, parries: 0, evades: 0, guardBreaks: 0, launches: 0, rends: 0, interrupts: 0, hitsTaken: 0 };
  private hud: HTMLDivElement;
  private hudN: HTMLDivElement;
  private hudSub: HTMLDivElement;
  private guardEl: HTMLDivElement;
  private guardFill: HTMLDivElement;

  constructor(private h: MeleeHost) {
    this.guard = COMBAT.player.guard;
    window.addEventListener('keydown', (e) => {
      if (!h.player.enabled || e.repeat) return;
      if (e.code === 'KeyG') this.press('H');
    });
    window.addEventListener('mousedown', (e) => { if (e.button === 3 || e.button === 4) { this.mouseBlock = true; e.preventDefault(); } });
    window.addEventListener('mouseup', (e) => { if (e.button === 3 || e.button === 4) this.mouseBlock = false; });
    window.addEventListener('blur', () => { this.mouseBlock = false; });

    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;right:28px;top:38%;z-index:12;pointer-events:none;text-align:right;font-family:system-ui,sans-serif;opacity:0;transition:opacity .25s;text-shadow:0 2px 8px #000';
    this.hudN = document.createElement('div');
    this.hudN.style.cssText = 'font:900 44px/1 system-ui,sans-serif;letter-spacing:.02em;color:#e2f3ff';
    this.hudSub = document.createElement('div');
    this.hudSub.style.cssText = 'font:700 12px/1.4 system-ui,sans-serif;letter-spacing:.22em;color:#9fd8ff;margin-top:4px';
    this.hud.append(this.hudN, this.hudSub);
    document.body.appendChild(this.hud);
    this.guardEl = document.createElement('div');
    this.guardEl.style.cssText = 'position:fixed;left:50%;top:calc(50% + 46px);width:96px;height:5px;transform:translateX(-50%);z-index:12;pointer-events:none;background:#0b1626cc;border:1px solid #38bdf866;border-radius:3px;opacity:0;transition:opacity .2s';
    this.guardFill = document.createElement('div');
    this.guardFill.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#38bdf8,#a5f3fc);border-radius:2px';
    this.guardEl.appendChild(this.guardFill);
    document.body.appendChild(this.guardEl);
  }

  /** Enemy tells: a wind-up sound (near ones), the slam's shock ring and shake, bolts bursting on walls / reflected. */
  wireEnemyFx() {
    const h = this.h;
    h.enemies.onTelegraph = (e, a) => { if (e.mesh.position.distanceTo(h.player.object.position) < 32) h.rhythm.playTelegraph(a.kind); };
    h.enemies.onSlam = (e, at, radius) => {
      for (let k = 0; k < 10; k++) {
        const an = (k / 10) * Math.PI * 2;
        h.vfx.spawn(WALL_IMPACT, [at.x + Math.sin(an) * radius * 0.8, at.y + 0.15, at.z + Math.cos(an) * radius * 0.8], { dir: [Math.sin(an), 0.6, Math.cos(an)], tint: e.tune.tint, count: 0.5 });
      }
      const d = at.distanceTo(h.player.object.position);
      if (d < 14) this.shake(0.5 * (1 - d / 14));
    };
    h.enemies.onBoltHit = (at, reflected) => h.vfx.spawn(reflected ? HIT_PERFECT : WALL_IMPACT, at, { tint: reflected ? 0xfbbf24 : 0xa855f7, count: 0.7 });
  }

  /** World time scale for this frame: hit-stop freezes, a parry / Soul-Rend slows. */
  get timeScale() { return this.hitStopT > 0 ? 0.04 : this.slowT > 0 ? this.slowScale : 1; }
  get busy() { return !!this.move || !!this.exec || this.stunT > 0; }
  get invulnerable() { return !!this.exec || this.iframeT > 0; }

  hitStop(s: number) { this.hitStopT = Math.min(0.25, Math.max(this.hitStopT, s * COMBAT.feel.hitStop)); }
  slow(s: number, scale: number) { this.slowT = Math.max(this.slowT, s); this.slowScale = Math.min(this.slowT > 0 ? this.slowScale : 1, scale); }
  shake(v: number) { this.h.vfx.sim.shake = Math.max(this.h.vfx.sim.shake, v * COMBAT.feel.shake); }

  /** The dash: i-frames, and a strike right after it is the lunge. */
  noteDash() { this.sinceDash = 0; this.iframeT = COMBAT.player.dashIFrames; if (this.move && this.moveT > this.move.startup + this.move.active) this.move = null; }

  /** Light strike (F / E / gamepad X), via player.onStrike. */
  light() { this.press('L'); }
  heavy() { this.press('H'); }

  private bump(res: number) { const r = this.h.resonance; r.set(Math.min(4, r.get() + res)); }

  private press(kind: Input) {
    const p = this.h.player;
    if (!p.enabled || p.downed || this.exec || this.stunT > 0) return;
    const beat = this.h.rhythm.evaluateBeat();
    // a broken, low enemy in reach: tear its soul out
    const fin = this.finishable();
    if (fin) { this.startExecution(fin, beat.quality); return; }
    // mid-swing: buffer it for the next link
    if (this.move && this.moveT < this.move.startup + this.move.active) { this.buffered = kind; this.bufferT = COMBAT.player.buffer; return; }
    this.startFrom(kind, beat.quality);
  }

  private startFrom(kind: Input, q: BeatQuality) {
    const p = this.h.player, C = COMBAT.player;
    let key: string;
    let counter = false;
    if (this.counterT > 0) { key = 'C' + kind; counter = true; }
    else if (!p.grounded) key = 'A' + kind;
    else if (this.sinceDash < C.dashStrikeWindow) key = 'D' + kind;
    else {
      const prev = this.move || this.windowT > 0 ? this.chain : '';
      key = prev + kind;
      if (!C.chains[key]) key = kind;
    }
    const id = C.chains[key] ?? C.chains[kind];
    const m = C.moves[id];
    if (!m) return;
    this.chain = key.replace(/^[CAD]/, '');
    if (key[0] === 'D') this.sinceDash = 9;
    this.beginMove(m, q, counter);
  }

  private target(range: number): Enemy | null {
    const p = this.h.player.object.position;
    const t = this.h.targeting.target;
    if (t && this.h.enemies.enemies.includes(t) && t.mesh.position.distanceTo(p) < range) return t;
    // nearest in front
    const fwd = _w.set(-Math.sin(this.h.player.yaw), 0, -Math.cos(this.h.player.yaw));
    let best: Enemy | null = null, bd = range;
    for (const e of this.h.enemies.enemies) {
      _v.subVectors(e.mesh.position, p).setY(0);
      const d = _v.length();
      if (d < bd && (d < 1.4 || fwd.dot(_v.divideScalar(d)) > 0.2)) { best = e; bd = d; }
    }
    return best;
  }

  private finishable(): Enemy | null {
    const p = this.h.player.object.position;
    const fwd = _w.set(-Math.sin(this.h.player.yaw), 0, -Math.cos(this.h.player.yaw));
    let best: Enemy | null = null, bd = 4.2;
    for (const e of this.h.enemies.enemies) {
      if (!e.staggered || e.state === 'held') continue;
      _v.subVectors(e.mesh.position, p);
      if (Math.abs(_v.y) > 3) continue;
      _v.setY(0);
      const d = _v.length();
      if (d < bd && (d < 1.6 || fwd.dot(_v.divideScalar(d)) > 0)) { best = e; bd = d; }
    }
    return best;
  }

  private beginMove(m: PlayerMove, q: BeatQuality, counter: boolean) {
    const h = this.h, p = h.player;
    this.move = m; this.moveT = 0; this.hitDone = false; this.moveQ = q; this.moveCounter = counter;
    this.buffered = null; this.windowT = 0;
    this.stats.swings++;
    const clip = m.clips.find((c) => p.hasClip(c)) ?? m.clips[m.clips.length - 1];
    const total = m.startup + m.active + m.recovery;
    p.playClip(clip, 1, Math.max(0.3, total + 0.12));
    p.faceAim(0.9);
    // aim the swing at the target in reach (third person especially: it may not be dead ahead), step in toward it
    const pos = p.object.position;
    this.moveFwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const tg = this.target(m.range * (m.lunge ? 2.2 : 1.8));
    if (tg) {
      _v.subVectors(tg.mesh.position, pos).setY(0);
      const d = _v.length();
      if (d > 0.2) this.moveFwd.copy(_v).divideScalar(d);
      const t = m.startup + m.active * 0.5;
      if (d > 1.5) p.lunge(this.moveFwd, Math.min(m.lunge ?? 9, (d - 1.3) / t), t);
    } else if (m.lunge) p.lunge(this.moveFwd, m.lunge * 0.6, m.startup + m.active);
    if (!p.grounded) p.airHang(total + 0.2);
    h.enemies.strikeIncoming(pos, this.moveFwd, m.range);
    const heavy = m.id.startsWith('h') || m.id === 'spike' || m.id === 'counter';
    h.rhythm.playSwing(heavy);
    h.onSwing(q === 'PERFECT' || counter ? 0xffd36a : p.vessel.primaryColor, q === 'PERFECT' || counter);
    if (q !== 'OFF') this.beatChain++; else this.beatChain = 0;
  }

  private doHit(m: PlayerMove) {
    const h = this.h, p = h.player, C = COMBAT.player;
    const pos = p.object.position;
    const perfect = this.moveQ === 'PERFECT', counter = this.moveCounter;
    const tint = perfect || counter ? 0xffd36a : p.vessel.primaryColor;
    const chest = _v.copy(pos).setY(pos.y + 1.15).addScaledVector(this.moveFwd, 0.6).clone();
    h.vfx.slash(perfect && m.slash === 'slash' ? SLASH_PERFECT : SLASHES[m.slash], chest, { forward: this.moveFwd, tilt: m.tilt * (this.flip ? -1 : 1), flip: this.flip, tint, scale: m.scale });
    this.flip = !this.flip;
    const beatMul = perfect ? C.beatPerfect : this.moveQ === 'GOOD' ? C.beatGood : 1;
    const resMul = 1 + (h.resonance.get() - 1) * 0.12;
    let hits = 0, launched = false;
    for (const e of [...h.enemies.enemies]) {
      if (e.state === 'held') continue;
      const toE = new THREE.Vector3().subVectors(e.mesh.position, pos);
      const dy = toE.y; toE.y = 0;
      const dist = toE.length();
      const reach = m.range + 0.4 * (e.mesh.scale.x - 1) + (e.boss ? 0.6 : 0);
      if (dist > reach || Math.abs(dy) > (m.id === 'air' || m.id === 'spike' ? 3.8 : 2.6)) continue;
      if (dist > 0.01) toE.divideScalar(dist);
      if (!m.around && this.moveFwd.dot(toE) < m.cone && dist > 1.2) continue;
      const dmg = Math.round(m.dmg * beatMul * resMul * (counter ? C.counterMul : 1) * (h.dmgMul?.() ?? 1));
      const res = h.enemies.damageEnemy(e.id, dmg, toE, m.knock, {
        source: 'melee', hitstun: m.hitstun * (perfect ? 1.2 : 1), guardDmg: m.guardDmg * (perfect ? 1.3 : 1),
        launch: m.launch, spike: m.spike, unblockable: counter,
      });
      if (!res) continue;
      h.onContact();
      this.react(e, res, m, toE, tint, perfect);
      if (res.dodged) continue;
      hits++;
      if (m.launch && res.airborne) launched = true;
    }
    if (hits) {
      this.hitStop(m.hitStop * (perfect || counter ? 1.35 : 1));
      this.shake(m.shake * (counter ? 1.5 : 1));
      this.bump(m.resonance * (perfect ? 1.6 : this.moveQ === 'GOOD' ? 1.25 : 1)); // melee reloads resonance
      if (counter) { this.counterT = 0; this.slow(0.3, 0.35); h.feedback('RIPOSTE!', '#fbbf24'); }
    }
    if (launched) {
      this.stats.launches++;
      h.rhythm.playLaunch();
      h.feedback('LAUNCH! · SHOOT OR JUMP IN', '#a78bfa');
      if (p.grounded) p.hop(9); // follow it up
    }
  }

  private react(e: Enemy, res: HitResult, m: PlayerMove, toE: THREE.Vector3, tint: number, perfect: boolean) {
    const h = this.h;
    const at = res.pos;
    if (res.dodged) { h.feedback('DODGED', '#94a3b8'); return; }
    if (res.blocked) {
      this.stats.blocks++;
      h.vfx.spawn(WALL_IMPACT, at, { dir: [-toE.x, 0.3, -toE.z], tint: 0x9fd8ff });
      h.rhythm.playBlock();
      h.showHit(at, res.dmg ?? 0, false);
      h.feedback(m.guardDmg >= 60 ? 'GUARD CRACKING' : 'BLOCKED · USE HEAVY / SUNDER', '#94a3b8');
      this.combo++; this.comboT = 1.8;
      return;
    }
    if (res.guardBroken) {
      this.stats.guardBreaks++;
      h.vfx.spawn(HIT_PERFECT, at, { dir: [-toE.x, 0.4, -toE.z], tint: 0x38bdf8, scale: 1.5 });
      h.rhythm.playGuardBreak();
      this.hitStop(0.14); this.shake(0.45);
      h.feedback('GUARD BREAK!', '#38bdf8');
    }
    if (res.killed) {
      h.vfx.spawn(KILL_BURST, at, { tint });
      this.shake(0.35);
      h.onKill(e, 'melee');
      h.addScore(Math.round(120 * h.resonance.get()));
    } else h.vfx.spawn(perfect ? HIT_PERFECT : HIT_SPARKS, at, { dir: [-toE.x, 0.25, -toE.z], tint, scale: m.scale });
    h.rhythm.playImpact(this.combo, m.id.startsWith('h') || m.id === 'spike', perfect);
    h.showHit(at, res.dmg ?? m.dmg, res.killed);
    if (res.interrupted) { this.stats.interrupts++; h.feedback('INTERRUPTED!', '#fde047'); }
    else if (res.dazed) h.feedback('STAGGERED!', '#fbbf24');
    this.combo++; this.comboT = 1.8; this.stats.hits++;
    if (!res.guardBroken && !res.interrupted && !res.dazed && !res.airborne && !res.killed) h.feedback(`${m.name}${this.moveQ !== 'OFF' ? ' · ON BEAT' : ''}`, this.moveQ === 'PERFECT' ? '#fbbf24' : '#38bdf8');
    if (e.staggered && !res.killed) h.feedback('SOUL-REND READY · STRIKE', '#c4b5fd');
  }

  /** A shot landed (main.ts): interrupts and air shots count into the fight. */
  onShot(res: HitResult) {
    const h = this.h;
    if (res.killed) return;
    if (res.interrupted) { this.stats.interrupts++; h.rhythm.playInterrupt(); h.feedback('INTERRUPT!', '#fde047'); this.bump(0.15); }
    else if (res.dazed) h.feedback('STAGGERED · DASH IN!', '#fbbf24');
    if (res.airborne) { this.combo++; this.comboT = 1.8; if (this.combo % 3 === 0) h.feedback('AIR JUGGLE', '#a78bfa'); }
    else if (this.combo > 0 && !res.blocked) { this.combo++; this.comboT = Math.max(this.comboT, 1.2); }
  }

  /** An enemy's attack reaches the player: evade, block, parry or take it. Returns what happened + damage to take. */
  incoming(s: EnemyStrike): { outcome: StrikeOutcome; dmg: number } {
    const h = this.h, p = h.player, C = COMBAT.player;
    if (this.exec) return { outcome: 'evaded', dmg: 0 };
    if (this.iframeT > 0) {
      this.stats.evades++;
      const perfect = this.sinceDash < 0.12;
      h.rhythm.playEvade();
      h.feedback(perfect ? 'PERFECT EVADE' : 'EVADED', perfect ? '#fbbf24' : '#7dd3fc');
      this.bump(perfect ? 0.3 : 0.12);
      if (perfect) this.slow(0.35, 0.4);
      return { outcome: 'evaded', dmg: 0 };
    }
    const pos = p.object.position;
    _v.subVectors(s.from, pos).setY(0).normalize();
    const facing = _v.dot(_w.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw))) > -0.15;
    if (this.blocking && facing && !s.unblockable) {
      // first person: the spark sits further out and smaller, so it flashes without whiting out the view
      const fp = p.firstPerson;
      const contact = _w.copy(pos).setY(pos.y + 1.2).addScaledVector(_v, fp ? 1.3 : 0.6).clone();
      if (this.blockSince <= C.parryWindow) {
        this.stats.parries++;
        this.counterT = C.counterSec;
        this.hitStop(0.1); this.slow(0.4, 0.3); this.shake(0.25);
        h.vfx.spawn(HIT_PERFECT, contact, { dir: [_v.x, 0.3, _v.z], tint: 0xffd36a, scale: fp ? 0.7 : 1.4 });
        h.rhythm.playParry();
        h.feedback(s.bolt ? 'PERFECT PARRY · REFLECTED' : 'PERFECT PARRY · COUNTER!', '#fbbf24');
        this.bump(0.4);
        return { outcome: 'parried', dmg: 0 };
      }
      this.guard -= s.dmg * 2.4;
      if (this.guard <= 0) {
        this.guard = 0; this.stunT = 0.85; this.blocking = false; p.blocking = false;
        h.rhythm.playGuardBreak();
        h.feedback('GUARD CRUSHED', '#fb7185');
        p.takeHit(30);
        return { outcome: 'hit', dmg: Math.round(s.dmg * 0.6) };
      }
      this.stats.blocks++;
      h.vfx.spawn(WALL_IMPACT, contact, { dir: [_v.x, 0.2, _v.z], tint: 0x9fd8ff });
      h.rhythm.playBlock();
      this.shake(0.12);
      return { outcome: 'blocked', dmg: Math.round(s.dmg * C.blockMul) };
    }
    if (this.blocking && s.unblockable) h.feedback('UNBLOCKABLE · DASH OUT!', '#fb923c');
    // took it: the swing is cut, a short hit-stun
    this.stats.hitsTaken++;
    this.move = null; this.chain = ''; this.buffered = null;
    this.stunT = s.dmg >= 18 ? 0.42 : 0.22;
    this.combo = 0;
    this.hitStop(0.05);
    return { outcome: 'hit', dmg: s.dmg };
  }

  // ── Soul-Rend executions ──────────────────────────────────────────────────────────────────────────────────
  private startExecution(e: Enemy, q: BeatQuality) {
    const h = this.h, p = h.player;
    h.enemies.holdForExecution(e.id);
    const variant = e.air > 0.6 ? 'sky' : q === 'PERFECT' ? 'resonant' : 'rend';
    const to = _v.subVectors(e.mesh.position, p.object.position).setY(0);
    const d = to.length() || 1;
    to.divideScalar(d);
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    this.exec = { e, t: 0, stage: 0, variant, fp: p.firstPerson, side };
    this.move = null; this.chain = ''; this.buffered = null;
    if (d > 1.4) p.lunge(to, (d - 1.2) / 0.18, 0.18);
    if (!p.grounded || variant === 'sky') p.airHang(COMBAT.feel.finisherSec);
    p.playClip(variant === 'sky' ? 'finisher' : 'finisher_2', 1, COMBAT.feel.finisherSec * COMBAT.feel.finisherSlowmo + 0.35);
    p.faceAim(2);
    p.yaw = Math.atan2(-to.x, -to.z);
    if (p.firstPerson) { p.vesselMesh.visible = true; p.viewmodel.visible = false; }
    this.slow(COMBAT.feel.finisherSec, COMBAT.feel.finisherSlowmo);
    h.rhythm.playRend(0);
    h.onContact();
    h.feedback(variant === 'sky' ? 'SKY REND' : variant === 'resonant' ? 'RESONANT UNMAKING' : 'SOUL-REND', variant === 'resonant' ? '#fbbf24' : '#c4b5fd');
  }

  private updateExecution(dt: number) {
    const x = this.exec!;
    const h = this.h, p = h.player, F = COMBAT.feel;
    x.t += dt;
    const alive = h.enemies.enemies.includes(x.e);
    const ePos = x.e.mesh.position;
    const eChest = new THREE.Vector3(ePos.x, ePos.y + 1.1 * x.e.mesh.scale.y, ePos.z);
    const pChest = p.chestPos(new THREE.Vector3());
    const fwd = _v.subVectors(eChest, pChest).setY(0).normalize().clone();
    const gold = x.variant === 'resonant';
    const tint = gold ? 0xffd36a : 0xb48cff;
    const at = (k: number) => x.stage < k && x.t >= k * F.finisherSec / 5;
    if (alive && at(1)) { x.stage = 1; h.vfx.slash(SLASH_SHADOW, pChest.clone().addScaledVector(fwd, 0.7), { forward: fwd, tilt: -0.9, tint, scale: 1.1 }); h.vfx.spawn(HIT_SPARKS, eChest, { dir: [-fwd.x, 0.3, -fwd.z], tint }); h.rhythm.playImpact(4, true, gold); this.shake(0.2); }
    if (alive && at(2)) { x.stage = 2; h.vfx.slash(SLASH_SHADOW, pChest.clone().addScaledVector(fwd, 0.7), { forward: fwd, tilt: 0.9, flip: true, tint, scale: 1.25 }); h.vfx.spawn(SHADOW_BURST, eChest, { dir: [fwd.x, 0.4, fwd.z] }); h.rhythm.playRend(1); this.shake(0.3); }
    if (alive && at(3)) {
      // the rift-soul drawn out of it in a ribbon of motes, toward the vessel
      x.stage = 3;
      for (let k = 0; k <= 6; k++) h.vfx.spawn(HIT_PERFECT, eChest.clone().lerp(pChest, k / 6), { dir: [-fwd.x, 0.6, -fwd.z], tint, count: 0.35, scale: 0.6 });
      h.vfx.slash(gold ? SLASH_PERFECT : SLASH_SHADOW, eChest, { forward: _w.set(0, 1, 0).add(fwd).normalize(), tilt: 1.57, tint, scale: 1.5 });
    }
    if (x.stage < 4 && x.t >= 4 * F.finisherSec / 5) {
      x.stage = 4;
      if (alive) {
        const res = h.enemies.damageEnemy(x.e.id, x.e.hp + 999, fwd, 2, { source: 'execute', unblockable: true });
        h.vfx.spawn(KILL_BURST, eChest, { tint, scale: 1.4 });
        h.vfx.spawn(SHADOW_BURST, eChest, { dir: [fwd.x, 0.5, fwd.z], scale: 1.3 });
        h.rhythm.playRend(2);
        this.shake(0.8); this.hitStop(0.12);
        p.hp = Math.min(p.maxHp, p.hp + (gold ? 40 : 25));
        this.bump(gold ? 1 : 0.6);
        h.addScore(Math.round((gold ? 260 : 180) * h.resonance.get()));
        this.stats.rends++;
        if (res?.killed) h.onKill(x.e, 'rend');
        h.feedback(gold ? 'RESONANT UNMAKING · +40 HP' : x.variant === 'sky' ? 'SKY REND · +25 HP' : 'SOUL-REND · +25 HP', gold ? '#fbbf24' : '#c4b5fd');
        this.combo++; this.comboT = 2.5;
      }
    }
    if (x.t >= F.finisherSec) this.endExecution();
  }

  private endExecution() {
    const x = this.exec!, p = this.h.player;
    if (x.fp && p.firstPerson) { p.vesselMesh.visible = false; p.viewmodel.visible = true; }
    if (this.h.enemies.enemies.includes(x.e) && x.e.state === 'held') { x.e.state = 'stun'; x.e.stateT = 0.5; }
    this.exec = null;
    this.slowT = 0;
  }

  /**
   * The Soul-Rend camera: side-on and low, slowly orbiting the pair (blended in and out). Main applies it for the
   * render only (the player controller owns the camera). Returns the blend weight 0..1.
   */
  cinematic(outPos: THREE.Vector3, outLook: THREE.Vector3): number {
    const x = this.exec;
    if (!x) return 0;
    const F = COMBAT.feel;
    const p = this.h.player.object.position, e = x.e.mesh.position;
    const mid = _v.copy(p).lerp(e, 0.5);
    mid.y = Math.max(p.y, e.y) + 1.1;
    const k = x.t / F.finisherSec;
    const ang = (k - 0.5) * 0.7;
    const side = _w.copy(x.side).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
    // a 3/4 view: off to the side and a little behind the vessel, so both bodies and the rend read
    const back = new THREE.Vector3().subVectors(p, e).setY(0).normalize();
    const dir = side.clone().multiplyScalar(4.6).addScaledVector(back, 1.6).add(new THREE.Vector3(0, 1.5, 0));
    const len = dir.length();
    dir.divideScalar(len);
    const free = this.h.rayDistance(mid, dir, len);
    outPos.copy(mid).addScaledVector(dir, Math.max(1.2, free - 0.3));
    outLook.copy(mid).setY(mid.y - 0.25);
    return Math.min(1, x.t / 0.18, (F.finisherSec - x.t) / 0.22);
  }

  /** Per frame, real seconds (the move clock runs on the scaled world time). */
  update(dt: number) {
    const h = this.h, p = h.player, C = COMBAT.player;
    dt = Math.max(0, dt);
    this.hitStopT = Math.max(0, this.hitStopT - dt);
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowScale = 1; }
    const gdt = dt * this.timeScale;
    this.sinceDash += gdt;
    this.iframeT = Math.max(0, this.iframeT - gdt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.stunT = Math.max(0, this.stunT - gdt);
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo) { this.combo = 0; this.beatChain = 0; }
    if (this.exec) this.updateExecution(dt);

    // guard: hold X / mouse back button / gamepad R3; the moment it goes up is the parry window
    const pad = navigator.getGamepads?.()[0];
    const padBlock = !!pad?.buttons[11]?.pressed;
    const want = p.enabled && !p.downed && !this.exec && this.stunT <= 0 && this.guard > 0 && (p.keys.has('KeyX') || this.mouseBlock || padBlock);
    if (want && !this.blocking && (!this.move || this.moveT > this.move.startup + this.move.active)) {
      this.blocking = true; this.blockSince = 0; this.move = null; this.blockAnimT = 0;
    } else if (!want) this.blocking = false;
    if (this.blocking) {
      this.blockSince += dt;
      if ((this.blockAnimT -= dt) <= 0) { p.playClip('block', 1, 0.55); this.blockAnimT = 0.45; p.faceAim(0.5); }
    } else this.guard = Math.min(C.guard, this.guard + C.guardRegen * dt);
    p.blocking = this.blocking;

    // heavy by holding light (F / E / gamepad X)
    const holding = p.enabled && (p.keys.has('KeyF') || p.keys.has('KeyE') || !!pad?.buttons[2]?.pressed);
    if (holding) { this.holdT += dt; if (this.holdT > 0.32 && !this.holdFired) { this.holdFired = true; this.press('H'); } }
    else { this.holdT = 0; this.holdFired = false; }

    // the current move
    if (this.move) {
      const m = this.move;
      this.moveT += gdt;
      if (!this.hitDone && this.moveT >= m.startup) { this.hitDone = true; this.doHit(m); }
      if (this.buffered && this.moveT >= m.startup + m.active) { const b = this.buffered; this.buffered = null; this.startFrom(b, h.rhythm.evaluateBeat().quality); }
      else if (this.moveT >= m.startup + m.active + m.recovery) { this.move = null; this.windowT = C.comboWindow; }
    } else if (this.windowT > 0) { this.windowT -= gdt; if (this.windowT <= 0) this.chain = ''; }
    if (this.bufferT > 0) { this.bufferT -= dt; if (this.bufferT <= 0) this.buffered = null; }

    const m = this.move;
    p.moveLock = this.exec ? 0 : this.stunT > 0 ? 0.15 : m ? (this.moveT < m.startup + m.active ? 0.2 : 0.55) : 1;

    // HUD: combo count + tier, guard bar
    const tier = [...TIERS].reverse().find(([n]) => this.combo >= n);
    if (this.combo >= 2) {
      this.hud.style.opacity = '1';
      const n = `${this.combo} HITS`;
      if (this.hudN.textContent !== n) { this.hudN.textContent = n; this.hudN.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 140 }); }
      this.hudN.style.color = tier?.[2] ?? '#e2f3ff';
      const sub = `${tier?.[1] ?? 'RIFT'}${this.beatChain >= 2 ? ` · ${this.beatChain} ON BEAT` : ''}${this.counterT > 0 ? ' · COUNTER READY' : ''}`;
      if (this.hudSub.textContent !== sub) this.hudSub.textContent = sub;
    } else this.hud.style.opacity = this.counterT > 0 ? '1' : '0';
    if (this.combo < 2 && this.counterT > 0) { this.hudN.textContent = ''; this.hudSub.textContent = 'COUNTER READY'; }
    const gk = this.guard / C.guard;
    this.guardEl.style.opacity = this.blocking || gk < 0.98 ? '1' : '0';
    this.guardFill.style.width = `${(gk * 100).toFixed(1)}%`;
    this.guardFill.style.background = gk < 0.3 ? '#fb7185' : 'linear-gradient(90deg,#38bdf8,#a5f3fc)';
  }
}
