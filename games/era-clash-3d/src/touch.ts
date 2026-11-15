// Touch play for Era Clash 3D (phones and tablets): a floating joystick under the left thumb, drag anywhere on the
// right half to look, and a thumb arc of buttons. It speaks the same Action names as the keyboard binds, so every
// move behaves exactly as it does on a keyboard or pad. Shown only on touch-first devices (or on the first touch,
// for a touchscreen laptop) and only while the fight is live.
import type { Action } from './binds';

export interface TouchDeps {
  /** Analog move: x right, y forward, magnitude 0..1 (player.stick). */
  stick: { set(x: number, y: number): unknown };
  setRun(on: boolean): void;
  /** Camera look in radians this frame (player.look). */
  look(dYaw: number, dPitch: number): void;
  press(a: Action): void;
  release(a: Action): void;
  pause(): void;
}

const CSS = `
#touch { position: fixed; inset: 0; z-index: 12; pointer-events: none; display: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none;
  --tb: clamp(54px, 13vmin, 84px); }
#touch.on { display: block; }
#touch .tz { position: absolute; pointer-events: auto; touch-action: none; }
#tMove { left: 0; top: 30%; bottom: 0; width: 44%; }
#tLook { right: 0; top: 0; bottom: 0; width: 56%; }
#tBase { position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; border: 2px solid #e8d8b066; background: #120c0755; opacity: 0; transition: opacity .12s; pointer-events: none; }
#tBase.on { opacity: 1; }
#tKnob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%; background: #f0c46acc; border: 2px solid #fff3d6; box-shadow: 0 2px 10px #000a; }
#tBtns { position: absolute; right: max(12px, env(safe-area-inset-right)); bottom: max(12px, env(safe-area-inset-bottom)); width: calc(var(--tb) * 3.3); height: calc(var(--tb) * 3.3); pointer-events: none; }
.tb { position: absolute; width: var(--tb); height: var(--tb); border-radius: 50%; border: 2px solid #e8d8b0aa; background: #120c07b8; color: #f4e6c8; pointer-events: auto; touch-action: none;
  font: 700 clamp(9px, 2.4vmin, 12px)/1 Cinzel, Georgia, serif; letter-spacing: .06em; display: grid; place-items: center; text-align: center; box-shadow: 0 2px 8px #0009; -webkit-tap-highlight-color: transparent; }
.tb.down { background: #8a2a14e0; border-color: #ffd9a0; transform: scale(.94); }
.tb.sm { width: calc(var(--tb) * .78); height: calc(var(--tb) * .78); }
.tb.big { width: calc(var(--tb) * 1.18); height: calc(var(--tb) * 1.18); background: #7a2412c8; }
#tPunch { right: 0; bottom: calc(var(--tb) * .9); }
#tKick  { right: calc(var(--tb) * 1.28); bottom: calc(var(--tb) * .2); }
#tBlade { right: calc(var(--tb) * 1.55); bottom: calc(var(--tb) * 1.5); }
#tBlock { right: calc(var(--tb) * 2.4); bottom: calc(var(--tb) * .85); }
#tRoll  { right: calc(var(--tb) * .2); bottom: calc(var(--tb) * 2.2); }
#tJump  { right: calc(var(--tb) * 2.3); bottom: calc(var(--tb) * 2.28); }
#tGrab  { right: calc(var(--tb) * 2.6); bottom: calc(var(--tb) * 0); }
#tSuper { right: calc(var(--tb) * .05); bottom: calc(var(--tb) * 3.2); opacity: .45; }
#tSuper.ready { opacity: 1; border-color: #f0c46a; box-shadow: 0 0 16px #f0c46a, 0 2px 8px #0009; animation: tpulse .7s ease-in-out infinite alternate; }
@keyframes tpulse { from { transform: scale(1); } to { transform: scale(1.08); } }
#tTurn { position: fixed; left: 50%; top: 58%; transform: translateX(-50%); display: none; padding: 6px 14px; border-radius: 99px; background: #120c07dd; border: 1px solid #6b4d2a; color: #f4e6c8; font: 13px Georgia, serif; z-index: 13; pointer-events: none; }
@media (orientation: portrait) { html.touch #touch.on ~ #tTurn, #touch.on #tTurn { display: block; } }
@media (orientation: portrait) {
  #tMove { top: 45%; width: 50%; } #tLook { width: 50%; }
  #tBtns { width: calc(var(--tb) * 3.3); }
}
`;

const BUTTONS: { id: string; label: string; act: Action; cls?: string; hold?: boolean }[] = [
  { id: 'tPunch', label: 'PUNCH', act: 'punch', cls: 'big' },
  { id: 'tKick', label: 'KICK', act: 'kick', cls: 'big' },
  { id: 'tBlade', label: 'BLADE', act: 'blade' },
  { id: 'tBlock', label: 'BLOCK', act: 'block', hold: true },
  { id: 'tRoll', label: 'ROLL', act: 'roll', cls: 'sm' },
  { id: 'tJump', label: 'JUMP', act: 'jump', cls: 'sm' },
  { id: 'tGrab', label: 'GRAB', act: 'grab', cls: 'sm' },
  { id: 'tSuper', label: 'SUPER', act: 'super', cls: 'sm' },
];

/** Does this device take touch first (a phone or tablet, not a touchscreen laptop)? */
export const touchFirst = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

export function mountTouch(d: TouchDeps) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'touch';
  root.innerHTML = `<div class="tz" id="tMove"><div id="tBase"><div id="tKnob"></div></div></div><div class="tz" id="tLook"></div>
    <div id="tBtns">${BUTTONS.map((b) => `<button type="button" class="tb ${b.cls ?? ''}" id="${b.id}" aria-label="${b.label}">${b.label}</button>`).join('')}</div>
    <div id="tTurn">Turn your phone sideways for the best view</div>`;
  document.body.appendChild(root);
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  let active = false;

  // ── joystick: appears under the thumb that lands in the left zone ─────────────────────────────────────
  const move = q('tMove'), base = q('tBase'), knob = q('tKnob');
  let moveId = -1, ox = 0, oy = 0;
  const R = 56;
  const endMove = (e: PointerEvent) => {
    if (e.pointerId !== moveId) return;
    moveId = -1; base.classList.remove('on'); knob.style.transform = ''; d.stick.set(0, 0); d.setRun(false);
  };
  move.addEventListener('pointerdown', (e) => {
    if (moveId !== -1) return;
    moveId = e.pointerId; move.setPointerCapture(e.pointerId);
    const r = move.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
    base.style.left = `${ox - r.left}px`; base.style.top = `${oy - r.top}px`; base.classList.add('on'); e.preventDefault();
  });
  move.addEventListener('pointermove', (e) => {
    if (e.pointerId !== moveId) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, l / R), dead = m < 0.12 ? 0 : m;
    d.stick.set(dead ? dx / R : 0, dead ? -dy / R : 0);
    d.setRun(l > R * 1.1);
  });
  move.addEventListener('pointerup', endMove); move.addEventListener('pointercancel', endMove);

  // ── look: drag anywhere on the right half ─────────────────────────────────────────────────────────────
  const lookZ = q('tLook');
  let lookId = -1, lx = 0, ly = 0;
  lookZ.addEventListener('pointerdown', (e) => { if (lookId !== -1) return; lookId = e.pointerId; lookZ.setPointerCapture(e.pointerId); lx = e.clientX; ly = e.clientY; e.preventDefault(); });
  lookZ.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    d.look(-dx * 0.0055, -dy * 0.004);
  });
  const endLook = (e: PointerEvent) => { if (e.pointerId === lookId) lookId = -1; };
  lookZ.addEventListener('pointerup', endLook); lookZ.addEventListener('pointercancel', endLook);

  // ── buttons ───────────────────────────────────────────────────────────────────────────────────────────
  for (const b of BUTTONS) {
    const el = q<HTMLButtonElement>(b.id);
    let pid = -1;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); pid = e.pointerId; el.setPointerCapture(e.pointerId);
      el.classList.add('down'); d.press(b.act);
      if ('vibrate' in navigator) try { navigator.vibrate(b.hold ? 8 : 12); } catch { /* not allowed */ }
    });
    const up = (e: PointerEvent) => { if (e.pointerId !== pid) return; pid = -1; el.classList.remove('down'); if (b.hold) d.release(b.act); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  let enabled = touchFirst();
  const apply = () => { root.classList.toggle('on', enabled && active); document.documentElement.classList.toggle('touch', enabled); };
  apply();
  // a touchscreen laptop keeps mouse controls until the screen is actually touched
  if (!enabled) addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { enabled = true; apply(); } }, { capture: true });

  return {
    get enabled() { return enabled; },
    /** Call as often as you like: shows the controls while the fight is live, lights SUPER when the meter is full. */
    sync(playing: boolean, superReady: boolean) {
      if (playing !== active) { active = playing; apply(); if (!playing) { d.stick.set(0, 0); d.setRun(false); d.release('block'); } }
      q('tSuper').classList.toggle('ready', superReady);
    },
  };
}
