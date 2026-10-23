// Controller and touch play.
//  • Xbox / standard gamepad: left stick move (push all the way, or hold LT / click LS, to run),
//    right stick look, A jump, B roll, X / RT attack, Y molotov, RB use (doors, films), LB / D-pad
//    stance, R3 recentre the camera, Menu = start (on the title screen).
//  • Touch (phones, tablets): a floating joystick under the left thumb, drag anywhere on the right to
//    look, and big Attack / Roll / Jump / Use buttons. Only shown on touch devices.
import type { PlayerController } from './player';
import type { Game } from './game';

export interface InputDeps {
  player: PlayerController;
  game: Game;
  interact(): void;
  /** The title screen: true while it's up. */
  menuOpen(): boolean;
  menuPick(dir: -1 | 1): void;
  menuStart(): void;
}

const DEAD = 0.18;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class ExtraInput {
  private prev: boolean[] = [];
  private touchUI: HTMLDivElement | null = null;
  private padStickActive = false;
  private touchMove = false;
  /** Touch-first device (phone/tablet). Touch laptops stay on mouse controls until the screen is touched. */
  readonly isTouch = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  private shown = true;

  constructor(private d: InputDeps) {
    if (this.isTouch) this.buildTouch();
    else {
      // Hybrid (touchscreen laptop): the on-screen controls appear on the first touch and step aside
      // again as soon as the mouse is used, so they never sit over the canvas eating clicks.
      addEventListener('touchstart', () => {
        if (!this.touchUI) this.buildTouch();
        this.touchUI!.classList.remove('off');
      }, { passive: true });
      addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && this.touchUI) this.touchUI.classList.add('off'); });
    }
  }

  /** Poll the gamepad (call every frame). */
  update(dt: number) {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = Array.from(pads).find((p) => p && p.connected && p.mapping === 'standard') ?? Array.from(pads).find((p) => p && p.connected);
    if (!gp) { if (this.padStickActive) { this.d.player.stick.set(0, 0); this.d.player.stickRun = false; this.padStickActive = false; } return; }
    const btn = (i: number) => !!gp.buttons[i]?.pressed;
    const pressed = (i: number) => btn(i) && !this.prev[i];
    const { player, game } = this.d;

    if (this.d.menuOpen()) {
      if (pressed(14) || dz(gp.axes[0] ?? 0) < -0.6 && !this.prev[100]) this.d.menuPick(-1);
      if (pressed(15) || dz(gp.axes[0] ?? 0) > 0.6 && !this.prev[101]) this.d.menuPick(1);
      if (pressed(0) || pressed(9)) this.d.menuStart();
      this.prev[100] = dz(gp.axes[0] ?? 0) < -0.6; this.prev[101] = dz(gp.axes[0] ?? 0) > 0.6;
    } else {
      // Move.
      const lx = dz(gp.axes[0] ?? 0), ly = dz(gp.axes[1] ?? 0);
      if (lx || ly || this.padStickActive) {
        if (!this.touchMove) player.stick.set(lx, -ly);
        this.padStickActive = !!(lx || ly);
      }
      player.stickRun = Math.hypot(lx, ly) > 0.92 || btn(6) || btn(10);
      // Look.
      const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
      if (rx || ry) player.look(rx * 2.6 * dt, ry * 1.8 * dt);
      // Actions.
      if (pressed(0)) player.jump();
      if (pressed(1)) game.roll();
      if (pressed(2) || pressed(7)) game.attack();
      if (pressed(3)) game.throwMolotov();
      if (pressed(5)) this.d.interact();
      if (pressed(12)) game.setStance('HIGH');
      if (pressed(14) || pressed(4)) game.setStance('MID');
      if (pressed(13)) game.setStance('LOW');
      if (pressed(11)) player.recenter();
    }
    for (let i = 0; i < gp.buttons.length; i++) this.prev[i] = btn(i);
  }

  // ── touch ──────────────────────────────────────────────────────────────────────────
  private buildTouch() {
    const ui = document.createElement('div');
    ui.id = 'touchUI';
    ui.innerHTML = `
      <div class="t-look"></div>
      <div class="t-move"><div class="t-base"><div class="t-knob"></div></div></div>
      <button class="t-btn t-attack" data-a="attack">⚔</button>
      <button class="t-btn t-roll" data-a="roll">⟲</button>
      <button class="t-btn t-jump" data-a="jump">⤒</button>
      <button class="t-btn t-use" data-a="use">E</button>
      <button class="t-btn t-fire" data-a="molotov">🔥</button>`;
    document.body.appendChild(ui);
    this.touchUI = ui;
    if (!this.shown) ui.style.display = 'none';
    const { player, game } = this.d;
    const base = ui.querySelector<HTMLElement>('.t-base')!, knob = ui.querySelector<HTMLElement>('.t-knob')!;
    const moveZone = ui.querySelector<HTMLElement>('.t-move')!, lookZone = ui.querySelector<HTMLElement>('.t-look')!;
    const R = 56;
    let moveId: number | null = null, ox = 0, oy = 0;
    moveZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; moveId = t.identifier; ox = t.clientX; oy = t.clientY;
      base.style.left = `${ox - R}px`; base.style.top = `${oy - R}px`; base.style.opacity = '1';
      this.touchMove = true;
    }, { passive: false });
    moveZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === moveId) {
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        player.stick.set(dx / R, -dy / R);
        player.stickRun = l > R * 0.95;
      }
    }, { passive: false });
    const endMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === moveId) {
        moveId = null; player.stick.set(0, 0); player.stickRun = false; this.touchMove = false;
        knob.style.transform = ''; base.style.opacity = '0.35';
      }
    };
    moveZone.addEventListener('touchend', endMove); moveZone.addEventListener('touchcancel', endMove);
    let lookId: number | null = null, lx = 0, ly = 0;
    lookZone.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) if (t.identifier === lookId) {
        player.look((t.clientX - lx) * 0.006, (t.clientY - ly) * 0.0045);
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    lookZone.addEventListener('touchend', () => { lookId = null; });
    ui.querySelectorAll<HTMLButtonElement>('.t-btn').forEach((b) => b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120);
      const a = b.dataset.a;
      if (a === 'attack') game.attack();
      else if (a === 'roll') game.roll();
      else if (a === 'jump') player.jump();
      else if (a === 'use') this.d.interact();
      else if (a === 'molotov') game.throwMolotov();
    }, { passive: false }));
  }

  /** Hide the touch controls behind the title screen. */
  setVisible(v: boolean) { this.shown = v; if (this.touchUI) this.touchUI.style.display = v ? '' : 'none'; }
}
