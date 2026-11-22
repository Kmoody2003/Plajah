// Touch-first virtual stick + right-side look + Gamepad API controller support.
export interface InputState {
  moveX: number; // -1..1 (right/left)
  moveY: number; // -1..1 (forward/back, +1 = forward)
  lookDeltaX: number;
  lookDeltaY: number;
  jumpPressed: boolean;
  dashPressed: boolean;
  firePressed: boolean;
  surgePressed: boolean;
  strikePressed: boolean;
  toggleViewPressed: boolean;
  cycleVesselPressed: boolean;
  /** Lock-on toggled this frame (middle mouse / Tab / R3-less pads: LT tap). */
  lockPressed: boolean;
  /** Lock-on held (LT on a controller): locked while held. */
  lockHeld: boolean;
  /** Aim down sights held (right mouse / LT), Fortnite-style. */
  aimHeld: boolean;
  /** Reload pressed (D-pad left; R on the keyboard is handled by the player). */
  reloadPressed: boolean;
  /** Crouch toggle pressed (D-pad down; C / Ctrl on the keyboard are handled by the player). */
  crouchPressed: boolean;
  crouchHeld?: boolean;
  isTouchActive: boolean;
}

export class UnifiedControls {
  private moveTouchId: number | null = null;
  private moveOriginX = 0;
  private moveOriginY = 0;
  private moveStickX = 0;
  private moveStickY = 0;

  private lookTouchId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private pendingLookX = 0;
  private pendingLookY = 0;
  /** Pointer lock refused (some embedded browsers, iframes): plain mouse movement over the game turns the view. */
  private hoverLook = false;

  private queuedJump = false;
  private queuedDash = false;
  private queuedFire = false;
  private queuedSurge = false;
  private queuedStrike = false;
  private queuedToggleView = false;
  private queuedCycleVessel = false;
  private queuedLock = false;

  private prevPadButtons: boolean[] = [];
  // hold to fire: while the left button / right trigger is held, a shot repeats on every eighth note of the
  // 124 BPM pulse (the press itself fires the first one), so holding keeps you in rhythm
  private fireHeld = false;
  private aimHeld = false;
  private fireRepeat = 0;
  private static readonly REPEAT = 60 / 124 / 2;
  isTouchDevice = false;

  private stickBaseEl = document.getElementById('touchStickBase');
  private stickKnobEl = document.getElementById('touchStickKnob');

  constructor(private surface: HTMLElement) {
    // Touch mode only when touch is the main pointer (phones, tablets). Windows reports maxTouchPoints = 10 on
    // ordinary mouse-and-keyboard PCs, which used to drop desktop players into touch mode: no pointer lock,
    // so the mouse could neither look nor fire. A real touch on the screen still switches to touch mode.
    this.isTouchDevice = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

    this.bindTouchSurface();
    this.bindTouchButtons();
    this.bindMouseFallback();
    // Tab (and middle mouse, below) toggles the lock-on
    window.addEventListener('keydown', (e) => { if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) this.queuedLock = true; } });
  }

  /** Mouse buttons (Fortnite-style): left = fire (hold to keep firing on the beat), right = hold to aim down sights,
   *  middle = lock-on; melee is F / E.
   *  Without pointer lock (lock refused, or a touch laptop in touch mode) a drag also looks. */
  private bindMouseFallback() {
    let dragging = false, lastX = 0, lastY = 0;
    this.surface.addEventListener('contextmenu', (e) => e.preventDefault());
    this.surface.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.fireHeld = true; this.fireRepeat = UnifiedControls.REPEAT; this.queuedFire = true; }
      if (e.button === 1) { e.preventDefault(); this.queuedLock = true; }
      if (e.button === 2) this.aimHeld = true;
      if (document.pointerLockElement) return;
      if (e.button !== 0 && e.button !== 2) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      // like Ravencrest / Era Clash: a click on the scene (re)takes the pointer lock for always-on mouse look
      if (!this.isTouchDevice) (this.surface.requestPointerLock?.() as Promise<void> | undefined)?.catch?.(() => { this.hoverLook = true; /* refused: look follows the mouse without a drag */ });
    });
    document.addEventListener('pointerlockerror', () => { this.hoverLook = true; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) return;
      if (!dragging && this.hoverLook && e.target === this.surface) { this.pendingLookX += e.movementX * 1.4; this.pendingLookY += e.movementY * 1.4; return; }
      if (!dragging) return;
      this.pendingLookX += (e.clientX - lastX) * 1.6;
      this.pendingLookY += (e.clientY - lastY) * 1.6;
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => { dragging = false; if (e.button === 0) this.fireHeld = false; if (e.button === 2) this.aimHeld = false; });
    window.addEventListener('blur', () => { this.fireHeld = false; this.aimHeld = false; dragging = false; });
  }

  private bindTouchSurface() {
    this.surface.addEventListener(
      'touchstart',
      (e) => {
        this.isTouchDevice = true;
        for (const t of Array.from(e.changedTouches)) {
          // Left half = virtual movement stick; Right half = camera aim
          if (t.clientX < window.innerWidth * 0.48 && this.moveTouchId === null) {
            this.moveTouchId = t.identifier;
            this.moveOriginX = t.clientX;
            this.moveOriginY = t.clientY;
            this.moveStickX = 0;
            this.moveStickY = 0;
            this.updateStickVisual(true, t.clientX, t.clientY, 0, 0);
          } else if (t.clientX >= window.innerWidth * 0.48 && this.lookTouchId === null) {
            this.lookTouchId = t.identifier;
            this.lookLastX = t.clientX;
            this.lookLastY = t.clientY;
          }
        }
      },
      { passive: true },
    );

    this.surface.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.moveTouchId) {
            const maxR = 52;
            const dx = t.clientX - this.moveOriginX;
            const dy = t.clientY - this.moveOriginY;
            const len = Math.hypot(dx, dy);
            const clamped = len > maxR ? maxR / len : 1;
            const cx = dx * clamped;
            const cy = dy * clamped;
            this.moveStickX = cx / maxR;
            this.moveStickY = -cy / maxR; // up = +1 forward
            this.updateStickVisual(true, this.moveOriginX, this.moveOriginY, cx, cy);
          } else if (t.identifier === this.lookTouchId) {
            this.pendingLookX += (t.clientX - this.lookLastX) * 2.2;
            this.pendingLookY += (t.clientY - this.lookLastY) * 1.8;
            this.lookLastX = t.clientX;
            this.lookLastY = t.clientY;
          }
        }
      },
      { passive: true },
    );

    const endTouch = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.moveTouchId) {
          this.moveTouchId = null;
          this.moveStickX = 0;
          this.moveStickY = 0;
          this.updateStickVisual(false, 0, 0, 0, 0);
        } else if (t.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };
    this.surface.addEventListener('touchend', endTouch, { passive: true });
    this.surface.addEventListener('touchcancel', endTouch, { passive: true });
  }

  private updateStickVisual(visible: boolean, ox: number, oy: number, kx: number, ky: number) {
    if (!this.stickBaseEl || !this.stickKnobEl) return;
    this.stickBaseEl.style.display = visible ? 'block' : 'none';
    if (visible) {
      this.stickBaseEl.style.left = `${ox}px`;
      this.stickBaseEl.style.top = `${oy}px`;
      this.stickKnobEl.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }
  }

  private bindTouchButtons() {
    const bindBtn = (id: string, cb: () => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.isTouchDevice = true;
          cb();
        },
        { passive: false },
      );
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        cb();
      });
    };

    bindBtn('btnFire', () => { this.queuedFire = true; });
    bindBtn('btnDash', () => { this.queuedDash = true; });
    bindBtn('btnSurge', () => { this.queuedSurge = true; });
    bindBtn('btnStrike', () => { this.queuedStrike = true; });
    bindBtn('btnJump', () => { this.queuedJump = true; });
    bindBtn('btnView', () => { this.queuedToggleView = true; });
  }

  poll(dt: number): InputState {
    let moveX = this.moveStickX;
    let moveY = this.moveStickY;
    let lookDeltaX = this.pendingLookX;
    let lookDeltaY = this.pendingLookY;
    this.pendingLookX = 0;
    this.pendingLookY = 0;

    let jumpPressed = this.queuedJump;
    let dashPressed = this.queuedDash;
    let firePressed = this.queuedFire;
    let surgePressed = this.queuedSurge;
    let strikePressed = this.queuedStrike;
    let toggleViewPressed = this.queuedToggleView;
    let cycleVesselPressed = this.queuedCycleVessel;
    let lockPressed = this.queuedLock;
    let lockHeld = false;
    let aimHeld = this.aimHeld;
    let reloadPressed = false, crouchPressed = false;

    this.queuedJump = false;
    this.queuedDash = false;
    this.queuedFire = false;
    this.queuedSurge = false;
    this.queuedStrike = false;
    this.queuedToggleView = false;
    this.queuedCycleVessel = false;
    this.queuedLock = false;

    let held = this.fireHeld;
    // Poll standard Gamepad API
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads?.[0];
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.16 ? 0 : v);
      const lx = dead(pad.axes[0] ?? 0);
      const ly = dead(pad.axes[1] ?? 0);
      const rx = dead(pad.axes[2] ?? 0);
      const ry = dead(pad.axes[3] ?? 0);

      if (Math.abs(lx) > Math.abs(moveX)) moveX = lx;
      if (Math.abs(ly) > Math.abs(moveY)) moveY = -ly;
      lookDeltaX += rx * 1100 * dt;
      lookDeltaY += ry * 850 * dt;

      const edge = (idx: number) => {
        const down = Boolean(pad.buttons[idx]?.pressed || (pad.buttons[idx]?.value ?? 0) > 0.45);
        const was = this.prevPadButtons[idx] ?? false;
        this.prevPadButtons[idx] = down;
        return down && !was;
      };

      if (edge(0)) jumpPressed = true;          // A / Cross
      if (edge(7)) { firePressed = true; this.fireRepeat = UnifiedControls.REPEAT; } // RT
      if ((pad.buttons[7]?.value ?? 0) > 0.45) held = true;
      if (edge(2)) strikePressed = true;        // X / Square (Melee Strike / Finisher)
      if (edge(1) || edge(4)) dashPressed = true; // B / Circle or LB
      if (edge(3)) surgePressed = true;          // Y / Triangle
      edge(6);
      if ((pad.buttons[6]?.value ?? 0) > 0.45) { lockHeld = true; aimHeld = true; } // LT: aim down sights + lock on
      if (edge(5)) cycleVesselPressed = true;    // RB
      if (edge(14)) reloadPressed = true;         // D-pad left
      if (edge(13)) crouchPressed = true;         // D-pad down
      if (edge(8) || edge(11)) toggleViewPressed = true; // Select / R3
    }

    if (held) {
      this.fireRepeat -= dt;
      if (this.fireRepeat <= 0) { firePressed = true; this.fireRepeat += UnifiedControls.REPEAT; }
    }

    return {
      moveX,
      moveY,
      lookDeltaX,
      lookDeltaY,
      jumpPressed,
      dashPressed,
      firePressed,
      surgePressed,
      strikePressed,
      toggleViewPressed,
      cycleVesselPressed,
      lockPressed,
      lockHeld,
      aimHeld,
      reloadPressed,
      crouchPressed,
      isTouchActive: this.isTouchDevice,
    };
  }
}
