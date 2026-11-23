// Targeting: what the gun is pointed at, and a lock-on you can run and shoot with.
//
// Every frame the enemies in front of the camera are scored by how close they sit to the crosshair (in screen
// space, so a near enemy has a bigger catch area than a far one) and whether a clear line reaches them.
//  · Soft target: the best enemy inside the catch area. A bracket marks it, the reticle turns red, and shots
//    bend toward it (aim assist), more so on the run.
//  · Lock-on (middle mouse / Tab toggles, LT on a controller holds): the camera follows the locked enemy so you
//    can circle-strafe, dash and keep firing; every shot goes to it. The lock drops when it dies or stays out of
//    sight for 1.5 s, then hops to the next enemy near the crosshair if there is one.
// The HUD shows a corner bracket, name, health bar and distance over the target, and an arrow at the screen edge
// when a locked enemy is off screen.
//
// Each view has its own tuning (VIEW_PROFILES). Third person (camera ~3.6 m behind the shoulder) catches a much
// wider area, also takes anything close in front of the character, checks line of sight from the character's chest
// (not the camera, which trees and walls behind you would block), and pulls the view gently toward the soft target
// while you move. First person keeps a tighter catch and a lighter crosshair glide. Both slow the look a little
// over a target (friction). While locked, a sideways flick of the mouse / right stick hops to the next enemy that way.
import * as THREE from 'three/webgpu';
import type { Enemy } from './enemies';

export interface TargetWorld { rayDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number): number }

const RANGE = 75;

export interface ViewProfile {
  /** Soft-target catch radius in normalised screen units (1 = half the screen height): far (25 m+) and near (4 m). */
  catchFar: number; catchNear: number;
  /** Anything closer than this (m) and in front of the view counts within `closeCatch` (third person melee range). */
  closeDist: number; closeCatch: number;
  /** How far the crosshair glides onto a soft target, standing / on the run (1 = all the way). */
  glide: number; glideMoving: number;
  /** Bullet magnet: a shot bends onto the soft target only when its body is this close to the crosshair (screen units). */
  magnet: number;
  /** Rotational assist toward the soft target while moving (per second; 0 = off). */
  assist: number;
  /** Look-speed multiplier while on a target. */
  friction: number;
  /** How fast lock-on turns the view onto the target (per second). */
  lockRate: number;
  /** Mouse px (or stick-equivalent) of sideways flick that switches the locked target. */
  flick: number;
}

export const VIEW_PROFILES: Record<'first' | 'third', ViewProfile> = {
  // the crosshair never slides (glide 0): it is always exactly where the shot goes (Kenne: "not where you think it is")
  first: { catchFar: 0.13, catchNear: 0.3, closeDist: 0, closeCatch: 0, glide: 0, glideMoving: 0, magnet: 0.035, assist: 0, friction: 0.7, lockRate: 10, flick: 140 },
  third: { catchFar: 0.2, catchNear: 0.45, closeDist: 7, closeCatch: 0.8, glide: 0, glideMoving: 0, magnet: 0.05, assist: 0.8, friction: 0.8, lockRate: 7, flick: 160 },
};

export class Targeting {
  /** The enemy under (or near) the crosshair; null if none. */
  soft: Enemy | null = null;
  locked: Enemy | null = null;
  private lockOn = false;
  private lostT = 0;
  private heldLock = false;
  /** Where the crosshair sits, in normalised screen coords (-1…1). It glides onto the enemy you're aiming at
   *  (all the way onto a locked one) and back to the centre when there's none; shots go exactly through it. */
  aimX = 0; aimY = 0;
  /** The crosshair's position in CSS pixels (for anything drawn on it, e.g. hit markers). */
  screenX = window.innerWidth / 2; screenY = window.innerHeight / 2;
  private hud: HTMLDivElement;
  private label: HTMLDivElement;
  private bar: HTMLDivElement;
  private arrow: HTMLDivElement;
  private reticle: HTMLElement | null;
  private v = new THREE.Vector3(); private o = new THREE.Vector3(); private d = new THREE.Vector3(); private los = new THREE.Vector3();
  /** The active view's tuning (setView). */
  profile: ViewProfile = VIEW_PROFILES.first;
  /** Where line-of-sight checks start (third person: the character's chest); null = the camera. */
  losFrom: ((out: THREE.Vector3) => THREE.Vector3) | null = null;
  /** Aim assist (the bullet magnet) applies: controller / touch aim. A mouse aims raw. */
  assistOn = false;
  /** Cursor aim: the crosshair sits where the mouse points (normalised), or null for a centred crosshair. */
  cursor: { x: number; y: number } | null = null;

  setView(firstPerson: boolean, losFrom: ((out: THREE.Vector3) => THREE.Vector3) | null) {
    this.profile = firstPerson ? VIEW_PROFILES.first : VIEW_PROFILES.third;
    this.losFrom = firstPerson ? null : losFrom;
  }

  /** The point the view should drift toward this frame (soft target, unlocked), or null. */
  assistPoint(out = new THREE.Vector3()): THREE.Vector3 | null {
    if (this.locked || !this.soft || this.profile.assist <= 0) return null;
    return this.aimPoint(this.soft, out);
  }

  /** Locked: hop to the nearest enemy on screen to the left (dir < 0) or right (dir > 0) of the current one. */
  flickSwitch(enemies: Enemy[], dir: number): boolean {
    if (!this.locked) return false;
    const cur = this.aimPoint(this.locked, this.v).project(this.camera).x;
    let best: Enemy | null = null, bestD = Infinity;
    for (const e of enemies) {
      if (e === this.locked || e.hp <= 0) continue;
      const p = this.aimPoint(e, this.d).project(this.camera);
      if (p.z > 1 || Math.abs(p.y) > 1.2) continue;
      const dx = (p.x - cur) * Math.sign(dir);
      if (dx <= 0.02 || dx >= bestD) continue;
      if (!this.visible(e, RANGE)) continue;
      best = e; bestD = dx;
    }
    if (!best) return false;
    this.locked = best; this.lostT = 0;
    return true;
  }

  constructor(private camera: THREE.PerspectiveCamera, private world: TargetWorld) {
    const css = document.createElement('style');
    css.textContent = `
      #rrTarget{position:fixed;left:0;top:0;pointer-events:none;z-index:11;display:none;transform:translate(-50%,-50%);}
      #rrTarget i{position:absolute;width:14px;height:14px;border:2px solid currentColor;filter:drop-shadow(0 0 4px currentColor);}
      #rrTarget i:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
      #rrTarget i:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
      #rrTarget i:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
      #rrTarget i:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
      #rrTarget.lock i{border-width:3px}
      #rrTarget .lab{position:absolute;left:50%;bottom:100%;transform:translate(-50%,-6px);white-space:nowrap;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.08em;text-shadow:0 0 4px #000,0 0 2px #000;text-align:center}
      #rrTarget .hp{width:72px;height:4px;margin:3px auto 0;background:#0008;border:1px solid #fff4}
      #rrTarget .hp b{display:block;height:100%;background:currentColor}
      #rrTargetArrow{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:11;display:none;border:11px solid transparent;border-left:18px solid #fb7185;filter:drop-shadow(0 0 6px #fb7185)}
      #reticle.on-target .ret-dot{background:#fb7185;box-shadow:0 0 10px #fb7185}
      #reticle.on-target .ret-ring{border-color:#fb7185cc;box-shadow:0 0 14px #fb718566}
    `;
    document.head.appendChild(css);
    this.hud = document.createElement('div');
    this.hud.id = 'rrTarget';
    this.hud.innerHTML = '<i></i><i></i><i></i><i></i><div class="lab"><span></span><div class="hp"><b></b></div></div>';
    this.label = this.hud.querySelector('.lab span')!;
    this.bar = this.hud.querySelector('.hp b')!;
    this.arrow = document.createElement('div');
    this.arrow.id = 'rrTargetArrow';
    document.body.append(this.hud, this.arrow);
    this.reticle = document.getElementById('reticle');
  }

  get target() { return this.locked ?? this.soft; }
  get isLocked() { return !!this.locked; }

  /** Where to shoot at an enemy: the middle of its hit body. */
  aimPoint(e: Enemy, out = new THREE.Vector3()) { return e.hitTarget.getWorldPosition(out); }

  /** Toggle lock-on (middle mouse / Tab). Locks the soft target, or the best enemy on screen. */
  toggle(enemies: Enemy[]) {
    if (this.lockOn) { this.lockOn = false; this.locked = null; return; }
    this.lockOn = true;
    this.locked = this.soft ?? this.pick(enemies, 0.9);
    this.lostT = 0;
    if (!this.locked) this.lockOn = false;
  }

  release() { this.lockOn = false; this.locked = null; }

  update(dt: number, enemies: Enemy[], held = false, active = true, moving = 0) {
    if (!active) { this.hide(); this.aimX = this.aimY = 0; this.placeReticle(); return; }
    this.camera.updateMatrixWorld();
    this.soft = this.pick(enemies, null);
    // LT held behaves like a lock for as long as it's held
    if (held && !this.lockOn) { this.lockOn = true; this.locked = this.soft ?? this.pick(enemies, 0.9); this.lostT = 0; this.heldLock = true; }
    if (!held && this.heldLock) { this.heldLock = false; this.release(); }
    if (this.lockOn) {
      const l = this.locked;
      if (!l || l.hp <= 0 || !enemies.includes(l)) { this.locked = this.pick(enemies, 0.6); this.lostT = 0; }
      else if (!this.visible(l, RANGE * 1.2)) { this.lostT += dt; if (this.lostT > 1.5) { this.locked = this.pick(enemies, 0.6); this.lostT = 0; } }
      else this.lostT = 0;
      if (!this.locked) this.lockOn = false;
    }
    // the crosshair glides onto the target (soft: most of the way, more on the run; locked: onto it)
    let gx = 0, gy = 0;
    const t = this.target;
    if (t) {
      const p = this.aimPoint(t, this.v).project(this.camera);
      if (p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1) {
        const P = this.profile, k = this.locked ? 1 : THREE.MathUtils.lerp(P.glide, P.glideMoving, Math.min(1, moving));
        gx = p.x * k; gy = p.y * k;
      }
    }
    const a = 1 - Math.exp(-dt * (this.locked ? 18 : 12));
    if (this.cursor && !this.locked) { this.aimX = this.cursor.x; this.aimY = this.cursor.y; } // the crosshair is the mouse
    else { this.aimX += (gx - this.aimX) * a; this.aimY += (gy - this.aimY) * a; }
    this.placeReticle();
    this.draw();
  }

  private placeReticle() {
    this.screenX = (this.aimX * 0.5 + 0.5) * window.innerWidth;
    this.screenY = (-this.aimY * 0.5 + 0.5) * window.innerHeight;
    if (this.reticle) { this.reticle.style.left = `${this.screenX}px`; this.reticle.style.top = `${this.screenY}px`; }
  }

  /** Aim the shot through the crosshair (which sits on the target when there is one): what you see is where it goes.
   *  A locked target is hit dead centre. `moving` is kept for callers; the crosshair already leans more on the run. */
  assist(origin: THREE.Vector3, dir: THREE.Vector3, _moving = 0) {
    if (this.locked) return dir.copy(this.aimPoint(this.locked, this.v).sub(origin).normalize());
    if (this.cursor) return dir; // cursor aim: the player's aim ray already goes through the cursor
    if (this.soft && this.profile.magnet > 0 && this.assistOn) {
      // the crosshair is on (or just off) the marked enemy: the shot lands on it
      const p = this.aimPoint(this.soft, this.d).project(this.camera);
      if (p.z < 1 && Math.hypot(p.x * this.camera.aspect - this.aimX * this.camera.aspect, p.y - this.aimY) < this.profile.magnet)
        return dir.copy(this.aimPoint(this.soft, this.v).sub(origin).normalize());
    }
    if (Math.abs(this.aimX) < 1e-4 && Math.abs(this.aimY) < 1e-4) return dir;
    this.v.set(this.aimX, this.aimY, 0.5).unproject(this.camera);
    return dir.copy(this.v.sub(origin).normalize());
  }

  /** Best enemy near the crosshair. `within` = catch radius override (screen units), null = the soft-target rule. */
  private pick(enemies: Enemy[], within: number | null): Enemy | null {
    const cam = this.camera;
    cam.getWorldPosition(this.o);
    let best: Enemy | null = null, bestS = Infinity;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const p = this.aimPoint(e, this.v);
      const dist = p.distanceTo(this.o);
      if (dist > RANGE) continue;
      // the body on screen as a vertical segment (feet → head): the crosshair anywhere on it counts as on target
      const half = e.hitTarget.scale.y * 1.05 * (e.boss ? 1.6 : 1);
      const top = p.clone(); top.y += half; top.project(cam);
      p.y -= half; p.project(cam);
      if (p.z > 1 || p.z < -1) continue;                                   // behind or past the far plane
      const sx = (p.x - this.aimX) * cam.aspect, y0 = p.y - this.aimY, y1 = top.y - this.aimY; // square screen units, from the crosshair
      const dy = y0 > 0 ? y0 : y1 < 0 ? y1 : 0;                            // 0 when the crosshair is between feet and head
      const off = Math.hypot(sx, dy);
      const P = this.profile;
      let radius = within ?? THREE.MathUtils.lerp(P.catchNear, P.catchFar, THREE.MathUtils.smoothstep(dist, 4, 25)) * (e.boss ? 1.5 : 1);
      // third person: anything close in front of you is fair game even off the crosshair (it's about to hit you)
      const close = within === null && dist < P.closeDist + 3.6 * (this.losFrom ? 1 : 0);
      if (close) radius = Math.max(radius, P.closeCatch);
      if (off > radius) continue;
      const s = off + dist * (close ? 0.02 : 0.004);
      if (s >= bestS || !this.visible(e, RANGE)) continue;
      best = e; bestS = s;
    }
    return best;
  }

  private visible(e: Enemy, max: number) {
    const from = this.losFrom ? this.losFrom(this.los) : this.camera.getWorldPosition(this.los);
    const p = this.aimPoint(e, this.v);
    this.d.subVectors(p, from);
    const dist = this.d.length();
    if (dist > max) return false;
    this.d.divideScalar(dist);
    return this.world.rayDistance(from, this.d, dist) >= dist - 0.6;
  }

  private hide() {
    this.hud.style.display = 'none'; this.arrow.style.display = 'none';
    this.reticle?.classList.remove('on-target');
  }

  private draw() {
    const t = this.target;
    this.reticle?.classList.toggle('on-target', !!t);
    if (!t) { this.hide(); return; }
    const W = window.innerWidth, H = window.innerHeight;
    const wp = this.aimPoint(t, this.v);
    const dist = wp.distanceTo(this.o);
    const p = wp.clone().project(this.camera);
    const col = this.locked ? '#fb7185' : '#fbbf24';
    const behind = p.z > 1;
    const onScreen = !behind && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
    if (!onScreen) {
      this.hud.style.display = 'none';
      if (!this.locked) { this.arrow.style.display = 'none'; return; }
      // arrow on the screen edge toward the locked enemy
      let ax = p.x, ay = p.y;
      if (behind) { ax = -ax; ay = -ay; }
      const ang = Math.atan2(-ay, ax), r = Math.min(W, H) * 0.42;
      this.arrow.style.display = 'block';
      this.arrow.style.transform = `translate(${W / 2 + Math.cos(ang) * r}px, ${H / 2 + Math.sin(ang) * r}px) translate(-9px,-11px) rotate(${ang}rad)`;
      return;
    }
    this.arrow.style.display = 'none';
    // bracket sized to the enemy's body on screen
    const tall = t.hitTarget.scale.y * 2.1 * (t.boss ? 1.6 : 1);
    const px = (tall / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2))) * H;
    const h = THREE.MathUtils.clamp(px * 1.15, 34, H * 0.7), w = THREE.MathUtils.clamp(h * 0.62, 30, H * 0.45);
    const s = this.hud.style;
    s.display = 'block'; s.color = col; s.width = `${w}px`; s.height = `${h}px`;
    s.left = `${(p.x * 0.5 + 0.5) * W}px`; s.top = `${(-p.y * 0.5 + 0.5) * H}px`;
    this.hud.classList.toggle('lock', !!this.locked);
    const name = (t.who || (t.boss ? 'Rift Tyrant' : 'Hostile')).toUpperCase();
    this.label.textContent = `${this.locked ? '◆ ' : ''}${name} · ${Math.round(dist)} m`;
    this.bar.style.width = `${Math.max(0, (t.hp / t.maxHp) * 100).toFixed(1)}%`;
  }
}
