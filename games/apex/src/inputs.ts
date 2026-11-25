// Controller and touch input for the drive. Both produce the same analog state the keyboard feeds (throttle, brake, steer, handbrake, look) and press the
// same keys the keyboard does for the discrete actions (camera, replay, reset, exit), so replay and the HUD behave identically on every device.
//
// Gamepad (standard mapping): left stick steer, RT throttle, LT brake/reverse, right stick look, A handbrake, B hold to look back, X replay, Y camera,
// Back reset, Start exit. In the replay: d-pad left/right seek, A pause, Y next shot, LB/RB speed, B or Start leave.
// Touch: drag the left half of the screen like a steering wheel, GAS and BRAKE on the right, a handbrake button, drag anywhere else to look around.

export interface DriveAxes { throttle: number; brake: number; steer: number; handbrake: boolean; lookX: number; lookY: number; active: boolean }

const DEAD = 0.14;
const shape = (v: number): number => { const a = Math.abs(v); if (a < DEAD) return 0; const t = (a - DEAD) / (1 - DEAD); return Math.sign(v) * (t * 0.6 + t * t * t * 0.4); };

function press(code: string): void { dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })); }
function release(code: string): void { dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true })); }

export class DriveInput {
  readonly axes: DriveAxes = { throttle: 0, brake: 0, steer: 0, handbrake: false, lookX: 0, lookY: 0, active: false };
  private prev: boolean[] = [];
  private pad: Gamepad | null = null;
  // touch state
  private touch = { gas: 0, brake: 0, hand: false, steer: 0 };
  private root: HTMLDivElement | null = null;
  private replayBtns: HTMLElement[] = [];
  touchMode = false;
  /** true while the replay is running so the touch overlay shows the replay buttons */
  replayOn: () => boolean = () => false;
  drivingOn: () => boolean = () => false;

  constructor() {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !this.touchMode) this.enableTouch(); }, { passive: true });
    if (coarse || 'ontouchstart' in window) this.enableTouch();
  }

  private enableTouch(): void {
    if (this.touchMode) return;
    this.touchMode = true;
    this.build();
  }

  /** a short vibration on the controller (impacts, kerbs) */
  rumble(strong: number, weak: number, ms: number): void {
    const a = this.pad?.vibrationActuator as (GamepadHapticActuator & { playEffect?: (t: string, p: object) => Promise<unknown> }) | undefined;
    try { a?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* not supported */ }
  }

  /** called once a frame; reads the pad, merges touch, presses the discrete keys */
  tick(): DriveAxes {
    const ax = this.axes;
    const live = this.drivingOn() || this.replayOn();
    let t = 0, b = 0, s = 0, hand = false, lx = 0, ly = 0, active = false;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.pad = pad;
    if (pad) {
      const bt = (i: number): number => (pad!.buttons[i] ? pad!.buttons[i].value : 0);
      const down = (i: number): boolean => !!pad!.buttons[i]?.pressed;
      t = bt(7); b = bt(6);
      s = -shape(pad.axes[0] ?? 0);
      lx = shape(pad.axes[2] ?? 0); ly = shape(pad.axes[3] ?? 0);
      hand = down(0);
      if (Math.abs(t) + Math.abs(b) + Math.abs(s) + Math.abs(lx) + Math.abs(ly) > 0.02 || pad.buttons.some((x) => x.pressed)) active = true;
      const edge = (i: number, code: string, hold = false): void => {
        const d = down(i);
        if (d !== !!this.prev[i] && live) { if (d) press(code); else if (hold || code === 'Space') release(code); }
        this.prev[i] = d;
      };
      if (this.replayOn()) {
        edge(0, 'Space'); edge(3, 'KeyC'); edge(1, 'Escape'); edge(9, 'Escape'); edge(14, 'ArrowLeft'); edge(15, 'ArrowRight'); edge(5, 'BracketRight'); edge(4, 'BracketLeft');
        hand = false; t = 0; b = 0;
      } else {
        edge(0, 'Space'); edge(1, 'KeyB', true); edge(2, 'KeyP'); edge(3, 'KeyC'); edge(8, 'KeyR'); edge(9, 'Escape');
        // d-pad as a fallback for steering and pedals on pads without usable axes
        if (!s) s = (down(14) ? 1 : 0) - (down(15) ? 1 : 0);
        if (!t && down(12)) t = 1;
        if (!b && down(13)) b = 1;
      }
    }
    if (this.touchMode) {
      const tt = this.touch;
      if (tt.gas > t) t = tt.gas;
      if (tt.brake > b) b = tt.brake;
      if (Math.abs(tt.steer) > Math.abs(s)) s = tt.steer;
      if (tt.hand) hand = true;
      if (this.root) {
        this.root.style.display = live ? 'block' : 'none';
        const rep = this.replayOn();
        for (const e of this.replayBtns) e.style.display = rep ? 'flex' : 'none';
        (this.root.querySelector('[data-drv]') as HTMLElement | null)?.style.setProperty('display', rep ? 'none' : 'block');
      }
      active = active || tt.gas > 0 || tt.brake > 0 || Math.abs(tt.steer) > 0;
    }
    ax.throttle = t; ax.brake = b; ax.steer = s; ax.handbrake = hand; ax.lookX = lx; ax.lookY = ly; ax.active = active;
    return ax;
  }

  private build(): void {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;display:none;font:700 12px Inter,system-ui,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;touch-action:none';
    const mk = (css: string, label: string, parent: HTMLElement = root): HTMLDivElement => {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:18px;letter-spacing:.08em;background:rgba(14,16,28,.52);border:1.5px solid rgba(255,255,255,.28);backdrop-filter:blur(6px);' + css;
      d.textContent = label; parent.appendChild(d); return d;
    };
    const drv = document.createElement('div'); drv.setAttribute('data-drv', '1'); drv.style.cssText = 'position:absolute;inset:0;pointer-events:none'; root.appendChild(drv);
    // steering zone: bottom-left, drag sideways
    const wheel = mk('left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:min(42vw,300px);height:min(34vh,170px);border-radius:90px', 'STEER', drv);
    const knob = document.createElement('div'); knob.style.cssText = 'position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(0,218,243,.5);border:2px solid rgba(0,218,243,.9);pointer-events:none'; wheel.appendChild(knob);
    let wid = -1, wx0 = 0;
    const setSteer = (x: number): void => { const r = wheel.getBoundingClientRect(); const k = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / (r.width * 0.36))); this.touch.steer = -shape(k * 1.0) * 1; knob.style.transform = `translateX(${k * r.width * 0.34}px)`; wx0 = x; };
    wheel.addEventListener('pointerdown', (e) => { wid = e.pointerId; try { wheel.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } setSteer(e.clientX); e.preventDefault(); });
    wheel.addEventListener('pointermove', (e) => { if (e.pointerId === wid) setSteer(e.clientX); });
    const endW = (e: PointerEvent): void => { if (e.pointerId === wid) { wid = -1; this.touch.steer = 0; knob.style.transform = ''; } };
    wheel.addEventListener('pointerup', endW); wheel.addEventListener('pointercancel', endW);
    void wx0;
    // pedals: bottom-right
    const holdBtn = (el: HTMLElement, on: () => void, off: () => void): void => {
      let id = -1;
      el.addEventListener('pointerdown', (e) => { id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } on(); el.style.background = 'rgba(255,140,0,.55)'; e.preventDefault(); });
      const end = (e: PointerEvent): void => { if (e.pointerId === id) { id = -1; off(); el.style.background = 'rgba(14,16,28,.52)'; } };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    };
    const gas = mk('right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));width:min(20vw,130px);height:min(34vh,170px);font-size:14px', 'GAS', drv);
    const brk = mk('right:calc(max(14px,env(safe-area-inset-right)) + min(20vw,130px) + 12px);bottom:max(14px,env(safe-area-inset-bottom));width:min(15vw,96px);height:min(24vh,120px);font-size:13px', 'BRAKE', drv);
    const hnd = mk('right:calc(max(14px,env(safe-area-inset-right)) + min(20vw,130px) + 12px);bottom:calc(max(14px,env(safe-area-inset-bottom)) + min(24vh,120px) + 10px);width:min(15vw,96px);height:46px;font-size:11px', 'HAND', drv);
    holdBtn(gas, () => { this.touch.gas = 1; }, () => { this.touch.gas = 0; });
    holdBtn(brk, () => { this.touch.brake = 1; }, () => { this.touch.brake = 0; });
    holdBtn(hnd, () => { this.touch.hand = true; }, () => { this.touch.hand = false; });
    // top-right: camera, replay, reset, exit (these press the keyboard keys)
    const tapBtn = (label: string, code: string, left: number, parent: HTMLElement): HTMLDivElement => {
      const b = mk(`right:calc(max(12px,env(safe-area-inset-right)) + ${left}px);top:max(12px,env(safe-area-inset-top));width:56px;height:40px;border-radius:12px;font-size:11px`, label, parent);
      b.addEventListener('pointerdown', (e) => { press(code); setTimeout(() => release(code), 60); e.preventDefault(); });
      return b;
    };
    tapBtn('CAM', 'KeyC', 0, root); tapBtn('REPLAY', 'KeyP', 64, drv); tapBtn('RESET', 'KeyR', 128, drv); tapBtn('EXIT', 'Escape', 192, root);
    // replay: pause, slower, faster, seek
    const rb = (label: string, code: string, left: number): void => { const b = tapBtn(label, code, left, root); b.style.display = 'none'; this.replayBtns.push(b); };
    rb('PAUSE', 'Space', 64); rb('◀◀', 'ArrowLeft', 128); rb('▶▶', 'ArrowRight', 256);
    document.body.appendChild(root);
    this.root = root;
  }
}
