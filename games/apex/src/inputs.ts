// Full Console-Grade Gamepad & Touch Input Controller for Plajah Motorsport: Apex.
//
// Supports Xbox, PlayStation DualSense/DualShock, Switch Pro, 8BitDo & generic HID/DirectInput controllers
// across EVERY screen — Map Overview, Circuit Briefings, Settings Audio/Graphics Sliders, Driving,
// Cop Pursuit, Broadcast Replay, Photo Mode, and Post-Race Results — with zero keyboard/mouse required!
//
// Driving controls:
//   Left Stick          Analog steering (smooth center curve, DEAD = 0.10)
//   RT (R2)             Analog throttle (+ DirectInput axis fallback)
//   LT (L2)             Analog brake / reverse (+ DirectInput axis fallback)
//   Right Stick         360° free-look camera (R3 click = recenter)
//   A (Cross)           Handbrake / drift
//   B (Circle)          Hold to look back
//   X (Square)          Instant Broadcast Replay (P)
//   Y (Triangle)        Cycle Camera View (C)
//   LB / RB (L1 / R1)   Previous / Next Chora Radio station ([ / ])
//   D-Pad Up / Down     Racing Line (L) / Photo Mode (K)
//   D-Pad Left / Right  Police Siren (G) / Siren Tone (T)
//   L3                  Police Air Horn (H)
//   View / Back (8)     Reset Car on Track (R)
//   Menu / Start (9)    Open / Close In-Race Settings Mixer (adjust Music/Engine/SFX live!)
//
// Menu / Settings / Map Overview / Results:
//   Left Stick / D-Pad  Navigate cards, buttons, sliders & dropdowns (glowing .gp-focus ring)
//   Left / Right        Adjust focused range slider (Music, Engine, SFX, Solar clock) or cycle dropdown
//   A (Cross)           Activate / Select / START RACE
//   B (Circle)          Close Settings / Back / Return to Map (Escape)
//   Right Stick + LT/RT Orbit & zoom the 3D World Map smoothly
//   Menu / Start        Toggle Settings panel from anywhere

export interface DriveAxes {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  lookX: number;
  lookY: number;
  mapOrbitX: number;
  mapOrbitY: number;
  mapZoom: number;
  recenterCam: boolean;
  active: boolean;
  connected: boolean;
  padName: string;
}

const DEAD = 0.10;
const shape = (v: number): number => {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  const t = (a - DEAD) / (1 - DEAD);
  return Math.sign(v) * (t * 0.58 + t * t * t * 0.42);
};

function press(code: string, key?: string): void {
  dispatchEvent(new KeyboardEvent('keydown', { code, key: key ?? code, bubbles: true, cancelable: true }));
}
function release(code: string, key?: string): void {
  dispatchEvent(new KeyboardEvent('keyup', { code, key: key ?? code, bubbles: true, cancelable: true }));
}

function isElementVisible(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.05) return false;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4;
}

export class DriveInput {
  readonly axes: DriveAxes = {
    throttle: 0, brake: 0, steer: 0, handbrake: false,
    lookX: 0, lookY: 0, mapOrbitX: 0, mapOrbitY: 0, mapZoom: 0,
    recenterCam: false, active: false, connected: false, padName: '',
  };
  private prev: boolean[] = [];
  private pad: Gamepad | null = null;
  private lastPadId = '';
  // menu / UI focus & repeat timers
  private focusedEl: HTMLElement | null = null;
  private navRepeatAt = 0;
  private navLastDir = '';
  private toastEl: HTMLDivElement | null = null;
  private toastHideTimer = 0;
  // touch state
  private touch = { gas: 0, brake: 0, hand: false, steer: 0 };
  private root: HTMLDivElement | null = null;
  private replayBtns: HTMLElement[] = [];
  touchMode = false;

  /** Host state hooks (wired by region.ts) */
  replayOn: () => boolean = () => false;
  drivingOn: () => boolean = () => false;
  photoOn: () => boolean = () => false;
  settingsOpen: () => boolean = () => false;
  toggleSettings: () => void = () => {
    const btn = document.getElementById('settingsBtn') ?? document.querySelector<HTMLElement>('[aria-label="Settings"]');
    btn?.click();
  };

  constructor() {
    this.injectFocusStyles();
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !this.touchMode) this.enableTouch();
      // Clear gamepad focus ring if the user switches back to mouse
      if (e.pointerType === 'mouse') this.clearFocus();
    }, { passive: true });
    if (coarse || 'ontouchstart' in window) this.enableTouch();

    addEventListener('gamepadconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      this.lastPadId = gp.id;
      this.showToast(`🎮 Controller Connected · ${this.shortName(gp.id)}`);
    });
    addEventListener('gamepaddisconnected', () => {
      this.lastPadId = '';
      this.showToast('🎮 Controller Disconnected');
    });
  }

  private shortName(id: string): string {
    if (/xbox|xinput/i.test(id)) return 'Xbox Controller';
    if (/dualsense|054c.*0ce6/i.test(id)) return 'PlayStation DualSense';
    if (/dualshock|playstation|054c/i.test(id)) return 'PlayStation Controller';
    if (/pro controller|nintendo/i.test(id)) return 'Switch Pro Controller';
    if (/8bitdo/i.test(id)) return '8BitDo Controller';
    return id.replace(/\s*\([^)]*\)/g, '').trim().slice(0, 26) || 'Gamepad';
  }

  private injectFocusStyles(): void {
    if (typeof document === 'undefined' || document.getElementById('apex-gp-style')) return;
    const style = document.createElement('style');
    style.id = 'apex-gp-style';
    style.textContent = `
      .gp-focus {
        outline: 2.5px solid #00daf3 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 4px rgba(0, 218, 243, 0.28), 0 0 18px rgba(0, 218, 243, 0.45) !important;
      }
      #apex-gp-toast {
        position: fixed; left: 18px; bottom: 54px; z-index: 9999;
        padding: 9px 15px; border-radius: 999px;
        background: rgba(10, 14, 24, 0.90); border: 1px solid rgba(0, 218, 243, 0.55);
        color: #eef6ff; font: 700 12px/1.2 Inter, system-ui, sans-serif;
        letter-spacing: 0.04em; backdrop-filter: blur(8px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.45);
        opacity: 0; transform: translateY(8px); transition: opacity .22s ease, transform .22s ease;
        pointer-events: none;
      }
      #apex-gp-toast.show { opacity: 1; transform: translateY(0); }
    `;
    document.head.appendChild(style);
  }

  private showToast(msg: string): void {
    if (typeof document === 'undefined') return;
    if (!this.toastEl) {
      this.toastEl = document.createElement('div');
      this.toastEl.id = 'apex-gp-toast';
      document.body.appendChild(this.toastEl);
    }
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastHideTimer);
    this.toastHideTimer = window.setTimeout(() => {
      this.toastEl?.classList.remove('show');
    }, 3400);
  }

  private enableTouch(): void {
    if (this.touchMode) return;
    this.touchMode = true;
    this.build();
  }

  private clearFocus(): void {
    if (this.focusedEl) {
      this.focusedEl.classList.remove('gp-focus');
      this.focusedEl = null;
    }
  }

  private setFocus(el: HTMLElement | null): void {
    if (this.focusedEl === el) return;
    this.focusedEl?.classList.remove('gp-focus');
    this.focusedEl = el;
    if (el) {
      el.classList.add('gp-focus');
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ok */ }
    }
  }

  private collectFocusable(): HTMLElement[] {
    // Scope focus cleanly to the highest active modal/panel (Settings -> Results -> Briefing -> Menu)
    const panel = document.getElementById('panel');
    const results = document.querySelector<HTMLElement>('.results-overlay, [data-results-overlay]');
    const brief = document.getElementById('brief');
    const menu = document.getElementById('menu');
    const scope: HTMLElement =
      (panel && isElementVisible(panel)) ? panel :
      (results && isElementVisible(results)) ? results :
      (brief && isElementVisible(brief)) ? brief :
      (menu && isElementVisible(menu)) ? menu :
      document.body;

    const nodes = Array.from(scope.querySelectorAll<HTMLElement>(
      'button, a[href], input[type="range"], input[type="checkbox"], select, [role="button"], #mapCards > div, .card, .ev-card, .m-item, .gs-btn, .gs-opt',
    ));
    const list: HTMLElement[] = [];
    for (const el of nodes) {
      if (isElementVisible(el)) list.push(el);
    }
    return list;
  }

  private moveFocus(dir: 'up' | 'down' | 'left' | 'right'): void {
    const list = this.collectFocusable();
    if (!list.length) return;
    if (!this.focusedEl || !list.includes(this.focusedEl)) {
      // Default to primary START button if briefing is visible, otherwise first card / item
      const startBtn = list.find((el) => /\bstart\b|\brace again\b|\bdrive\b/i.test(el.textContent ?? ''));
      const firstCard = list.find((el) => el.classList.contains('ev-card') || el.parentElement?.id === 'mapCards');
      this.setFocus(startBtn ?? firstCard ?? list[0]);
      return;
    }

    // If focused on a range slider, Left/Right smoothly adjusts its value live!
    if ((dir === 'left' || dir === 'right') && this.focusedEl instanceof HTMLInputElement && this.focusedEl.type === 'range') {
      const inp = this.focusedEl;
      const min = parseFloat(inp.min || '0');
      const max = parseFloat(inp.max || '1');
      const step = parseFloat(inp.step || '0.05') || (max - min) / 20;
      const delta = (dir === 'right' ? 1 : -1) * Math.max(step, (max - min) / 25);
      const next = Math.max(min, Math.min(max, parseFloat(inp.value) + delta));
      inp.value = String(Number(next.toFixed(4)));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    // Native <select> or custom glassSelect (.gs-btn wrapping a hidden <select>)
    if (dir === 'left' || dir === 'right') {
      const linkedSel = this.focusedEl instanceof HTMLSelectElement
        ? this.focusedEl
        : (this.focusedEl.classList.contains('gs-btn') ? this.focusedEl.parentElement?.querySelector('select') ?? null : null);
      if (linkedSel && linkedSel.options.length > 0) {
        const nextIdx = (linkedSel.selectedIndex + (dir === 'right' ? 1 : -1) + linkedSel.options.length) % linkedSel.options.length;
        linkedSel.selectedIndex = nextIdx;
        linkedSel.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }

    // Spatial nearest-neighbor navigation in the requested direction, falling back to linear tab order
    const cur = this.focusedEl.getBoundingClientRect();
    const cx = cur.left + cur.width * 0.5;
    const cy = cur.top + cur.height * 0.5;
    let best: HTMLElement | null = null;
    let bestScore = 1e18;
    for (const el of list) {
      if (el === this.focusedEl) continue;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width * 0.5;
      const ey = r.top + r.height * 0.5;
      const dx = ex - cx;
      const dy = ey - cy;
      const primary = dir === 'down' ? dy : dir === 'up' ? -dy : dir === 'right' ? dx : -dx;
      const perp = Math.abs(dir === 'down' || dir === 'up' ? dx : dy);
      if (primary <= 4) continue;
      const score = primary + perp * 2.4;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best) {
      const idx = list.indexOf(this.focusedEl);
      const step = dir === 'down' || dir === 'right' ? 1 : -1;
      best = list[(idx + step + list.length) % list.length];
    }
    this.setFocus(best);
  }

  private activateFocused(): void {
    const list = this.collectFocusable();
    if (!list.length) return;
    if (!this.focusedEl || !list.includes(this.focusedEl)) {
      const startBtn = list.find((el) => /\bstart\b|\brace again\b|\bdrive\b/i.test(el.textContent ?? ''));
      this.setFocus(startBtn ?? list[0]);
    }
    const el = this.focusedEl;
    if (!el) return;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = !el.checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el instanceof HTMLSelectElement) {
      if (el.options.length > 0) {
        el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      el.click();
    }
  }

  /** Short dual-motor haptic rumble on the controller (impacts, kerbs, drift, hydroplane) */
  rumble(strong: number, weak: number, ms: number): void {
    const a = this.pad?.vibrationActuator as (GamepadHapticActuator & { playEffect?: (t: string, p: object) => Promise<unknown> }) | undefined;
    try { a?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }); } catch { /* not supported */ }
  }

  private pickActiveGamepad(): Gamepad | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let firstStd: Gamepad | null = null;
    let firstAny: Gamepad | null = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (!firstAny) firstAny = p;
      if (!firstStd && p.mapping === 'standard') firstStd = p;
      // Prefer whichever connected controller has live input right now
      const moved = p.buttons.some((b) => b.pressed || b.value > 0.15) || p.axes.some((v) => Math.abs(v) > 0.25);
      if (moved) return p;
    }
    return firstStd ?? firstAny;
  }

  /** Called once a frame; polls gamepad, drives full UI/menu/settings navigation OR driving/replay controls, and merges touch. */
  tick(): DriveAxes {
    const ax = this.axes;
    const isDriving = this.drivingOn();
    const isReplay = this.replayOn();
    const isPhoto = this.photoOn();
    const isSettings = this.settingsOpen();
    const live = (isDriving || isReplay) && !isSettings;

    let t = 0, b = 0, s = 0, hand = false, lx = 0, ly = 0;
    let mapOrbitX = 0, mapOrbitY = 0, mapZoom = 0, recenterCam = false, active = false;

    const pad = this.pickActiveGamepad();
    this.pad = pad;
    ax.connected = !!pad;
    ax.padName = pad ? this.shortName(pad.id) : '';
    if (pad && pad.id !== this.lastPadId) {
      this.lastPadId = pad.id;
      this.showToast(`🎮 Controller Ready · ${ax.padName}`);
    }

    if (pad) {
      const bt = (i: number): number => (pad.buttons[i] ? pad.buttons[i].value : 0);
      const down = (i: number): boolean => !!pad.buttons[i]?.pressed || bt(i) > 0.55;
      const edgeDown = (i: number): boolean => {
        const d = down(i);
        const fired = d && !this.prev[i];
        return fired;
      };

      // Standard RT/LT triggers + DirectInput axis[4]/axis[5] fallback
      t = bt(7);
      b = bt(6);
      if (pad.mapping !== 'standard' && pad.axes.length >= 6) {
        if (t < 0.02 && pad.axes[5] !== undefined) t = Math.max(0, (pad.axes[5] + 1) * 0.5);
        if (b < 0.02 && pad.axes[4] !== undefined) b = Math.max(0, (pad.axes[4] + 1) * 0.5);
      }
      const lsX = shape(pad.axes[0] ?? 0);
      const lsY = shape(pad.axes[1] ?? 0);
      lx = shape(pad.axes[2] ?? 0);
      ly = shape(pad.axes[3] ?? 0);

      if (Math.abs(t) + Math.abs(b) + Math.abs(lsX) + Math.abs(lsY) + Math.abs(lx) + Math.abs(ly) > 0.02 || pad.buttons.some((x) => x.pressed)) {
        active = true;
      }

      // Start/Menu button (9) ALWAYS toggles Settings from anywhere (except Replay where Start exits Replay!)
      if (!isReplay && edgeDown(9)) {
        this.toggleSettings();
      }

      if (isSettings || (!isDriving && !isReplay)) {
        // ── MENU / MAP OVERVIEW / BRIEFING / SETTINGS / RESULTS CONTROLLER MODE ──
        t = 0; b = 0; s = 0; hand = false;
        if (!isSettings && !isDriving) {
          // Smooth 3D Map Overview orbit & zoom with Right Stick + LT/RT
          mapOrbitX = lx;
          mapOrbitY = ly;
          mapZoom = bt(7) - bt(6);
        }

        const dir: '' | 'up' | 'down' | 'left' | 'right' =
          down(12) || lsY < -0.52 ? 'up' :
          down(13) || lsY > 0.52 ? 'down' :
          down(14) || lsX < -0.52 ? 'left' :
          down(15) || lsX > 0.52 ? 'right' : '';

        const now = performance.now();
        if (dir) {
          if (dir !== this.navLastDir || now >= this.navRepeatAt) {
            this.moveFocus(dir);
            const firstPress = dir !== this.navLastDir;
            this.navLastDir = dir;
            this.navRepeatAt = now + (firstPress ? 300 : 105);
          }
        } else {
          this.navLastDir = '';
          this.navRepeatAt = 0;
        }

        if (edgeDown(0)) this.activateFocused(); // A = Confirm / Start / Toggle
        if (edgeDown(1)) {
          // B = Close Settings -> Close Briefing -> Escape to Map
          if (isSettings) {
            this.toggleSettings();
          } else {
            const closeBtn = document.querySelector<HTMLElement>('#brief .x, #briefClose, #shClose, #backBtn');
            if (closeBtn && isElementVisible(closeBtn)) closeBtn.click();
            else press('Escape');
          }
        }
        // LB/RB quick station switch even in menu
        if (edgeDown(4)) press('BracketLeft', '[');
        if (edgeDown(5)) press('BracketRight', ']');
      } else if (isReplay) {
        // ── BROADCAST REPLAY MODE ──
        this.clearFocus();
        if (edgeDown(0)) press('Space', ' ');
        if (edgeDown(3)) press('KeyC', 'c');
        if (edgeDown(1) || edgeDown(9)) press('Escape', 'Escape');
        if (edgeDown(14)) press('ArrowLeft', 'ArrowLeft');
        if (edgeDown(15)) press('ArrowRight', 'ArrowRight');
        if (edgeDown(4)) press('BracketLeft', '[');
        if (edgeDown(5)) press('BracketRight', ']');
        hand = false; t = 0; b = 0; s = 0;
      } else if (isPhoto) {
        // ── PHOTO MODE ──
        this.clearFocus();
        if (edgeDown(1) || edgeDown(13)) press('KeyK', 'k');
        if (edgeDown(0)) {
          const snap = document.querySelector<HTMLElement>('#photoSnap, [data-photo-snap]');
          snap?.click();
        }
        s = -lsX;
        t = 0; b = 0; hand = false;
      } else {
        // ── LIVE DRIVING & COP PURSUIT MODE ──
        this.clearFocus();
        s = -lsX;
        hand = down(0);

        // Discrete & hold driving actions
        const sendEdge = (i: number, code: string, key: string, hold = false): void => {
          const d = down(i);
          if (d !== !!this.prev[i]) {
            if (d) press(code, key);
            else if (hold || code === 'Space') release(code, key);
          }
        };
        sendEdge(0, 'Space', ' ');           // A = Handbrake
        sendEdge(1, 'KeyB', 'b', true);      // B = Hold Look Back
        sendEdge(2, 'KeyP', 'p');            // X = Broadcast Replay
        sendEdge(3, 'KeyC', 'c');            // Y = Cycle Camera
        sendEdge(4, 'BracketLeft', '[');     // LB = Previous Chora Radio station
        sendEdge(5, 'BracketRight', ']');    // RB = Next Chora Radio station
        sendEdge(8, 'KeyR', 'r');            // View / Back = Reset Car on Track
        sendEdge(10, 'KeyH', 'h');           // L3 = Police Air Horn
        sendEdge(12, 'KeyL', 'l');           // D-Pad Up = Toggle Racing Line
        sendEdge(13, 'KeyK', 'k');           // D-Pad Down = Photo Mode
        sendEdge(14, 'KeyG', 'g');           // D-Pad Left = Police Siren ON/OFF
        sendEdge(15, 'KeyT', 't');           // D-Pad Right = Siren Tone (Wail/Yelp/Phaser)
        if (edgeDown(11)) recenterCam = true; // R3 = Recenter chase camera
      }

      // Snapshot every button state cleanly once at end of tick
      for (let i = 0; i < Math.max(18, pad.buttons.length); i++) {
        this.prev[i] = down(i);
      }
    } else {
      this.clearFocus();
    }

    if (this.touchMode) {
      const tt = this.touch;
      if (tt.gas > t) t = tt.gas;
      if (tt.brake > b) b = tt.brake;
      if (Math.abs(tt.steer) > Math.abs(s)) s = tt.steer;
      if (tt.hand) hand = true;
      if (this.root) {
        this.root.style.display = live ? 'block' : 'none';
        const rep = isReplay;
        for (const e of this.replayBtns) e.style.display = rep ? 'flex' : 'none';
        (this.root.querySelector('[data-drv]') as HTMLElement | null)?.style.setProperty('display', rep ? 'none' : 'block');
      }
      active = active || tt.gas > 0 || tt.brake > 0 || Math.abs(tt.steer) > 0;
    }

    ax.throttle = t;
    ax.brake = b;
    ax.steer = s;
    ax.handbrake = hand;
    ax.lookX = lx;
    ax.lookY = ly;
    ax.mapOrbitX = mapOrbitX;
    ax.mapOrbitY = mapOrbitY;
    ax.mapZoom = mapZoom;
    ax.recenterCam = recenterCam;
    ax.active = active;
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
    const wheel = mk('left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));width:min(42vw,300px);height:min(34vh,170px);border-radius:90px', 'STEER', drv);
    const knob = document.createElement('div'); knob.style.cssText = 'position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(0,218,243,.5);border:2px solid rgba(0,218,243,.9);pointer-events:none'; wheel.appendChild(knob);
    let wid = -1;
    const setSteer = (x: number): void => { const r = wheel.getBoundingClientRect(); const k = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / (r.width * 0.36))); this.touch.steer = -shape(k * 1.0); knob.style.transform = `translateX(${k * r.width * 0.34}px)`; };
    wheel.addEventListener('pointerdown', (e) => { wid = e.pointerId; try { wheel.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } setSteer(e.clientX); e.preventDefault(); });
    wheel.addEventListener('pointermove', (e) => { if (e.pointerId === wid) setSteer(e.clientX); });
    const endW = (e: PointerEvent): void => { if (e.pointerId === wid) { wid = -1; this.touch.steer = 0; knob.style.transform = ''; } };
    wheel.addEventListener('pointerup', endW); wheel.addEventListener('pointercancel', endW);
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
    const tapBtn = (label: string, code: string, left: number, parent: HTMLElement): HTMLDivElement => {
      const b = mk(`right:calc(max(12px,env(safe-area-inset-right)) + ${left}px);top:max(12px,env(safe-area-inset-top));width:56px;height:40px;border-radius:12px;font-size:11px`, label, parent);
      b.addEventListener('pointerdown', (e) => { press(code); setTimeout(() => release(code), 60); e.preventDefault(); });
      return b;
    };
    tapBtn('CAM', 'KeyC', 0, root); tapBtn('REPLAY', 'KeyP', 64, drv); tapBtn('RESET', 'KeyR', 128, drv); tapBtn('EXIT', 'Escape', 192, root);
    const rb = (label: string, code: string, left: number): void => { const b = tapBtn(label, code, left, root); b.style.display = 'none'; this.replayBtns.push(b); };
    rb('PAUSE', 'Space', 64); rb('◀◀', 'ArrowLeft', 128); rb('▶▶', 'ArrowRight', 256);
    document.body.appendChild(root);
    this.root = root;
  }
}
