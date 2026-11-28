// Touch-first virtual stick + right-side look + Gamepad API controller support.
export interface InputState {
  moveX: number; // -1..1 (right/left)
  moveY: number; // -1..1 (forward/back, +1 = forward)
  lookDeltaX: number;
  lookDeltaY: number;
  jumpPressed: boolean;
  /** Jump / swim up / glide held (A / Cross on controller). */
  jumpHeld: boolean;
  dashPressed: boolean;
  /** Retracting grapple hook pressed (LB on controller; E on keyboard). */
  grapplePressed: boolean;
  /** Pick up nearby world weapon / armor / item (D-pad Up on controller; H on keyboard). */
  pickupPressed: boolean;
  /** Open / close Armory & Loadouts (Hold View/Select on controller; L on keyboard). */
  armoryTogglePressed: boolean;
  /** Hot-swap next / previous custom loadout (LT + D-pad Right / Left; ] / [ on keyboard). */
  loadoutNextPressed: boolean;
  loadoutPrevPressed: boolean;
  /** Pause / resume pressed (Menu / Start / Options on controller). */
  pausePressed: boolean;
  /** Spray Living Waters / Sow Pure Seeds / Gather Seeds ([U] on KB; LT + D-pad Up on controller; WATER/SEED on touch). */
  restorePressed: boolean;
  /** Summon / Command allied Grovewarden (LT + Y on controller; WARDEN on touch; Y on KB handled by wardens.ts). */
  wardenPressed: boolean;
  firePressed: boolean;
  surgePressed: boolean;
  strikePressed: boolean;
  toggleViewPressed: boolean;
  cycleVesselPressed: boolean;
  /** Lock-on toggled this frame (Tab; LT holds it on a controller). */
  lockPressed: boolean;
  /** Lock-on held (LT on a controller): locked while held. */
  lockHeld: boolean;
  /** Aim down sights held (Z / LT). */
  aimHeld: boolean;
  /** Melee pressed (right mouse): a light strike with a gun out, a heavy one in fists mode. */
  meleePressed: boolean;
  /** Switch between gun and hand-to-hand (middle mouse / 5 / D-pad right). */
  fistsPressed: boolean;
  /** Reload pressed (D-pad left; R on the keyboard is handled by the player). */
  reloadPressed: boolean;
  /** Crouch toggle pressed (D-pad down; C / Ctrl on the keyboard are handled by the player). */
  crouchPressed: boolean;
  /** Crouch / dive underwater / drop off cliff held (D-pad down on controller). */
  crouchHeld: boolean;
  isTouchActive: boolean;
  /** The last aim input came from a controller stick (aim assist applies) rather than the mouse (raw aim). */
  padAim: boolean;
  /** Whether any standard gamepad is currently connected. */
  padConnected: boolean;
  /** Cursor aim (third person): where the mouse points over the game, normalised -1..1 (x right, y up), or null. */
  cursor: { x: number; y: number } | null;
}

/** Pick the first connected gamepad across any slot (Windows / Steam / Bluetooth pads often land on slot 1–3). */
export function findActiveGamepad(pads: ArrayLike<Gamepad | null> | null | undefined): Gamepad | null {
  if (!pads) return null;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected !== false) return p;
  }
  return null;
}

/** Radial deadzone + optional non-linear precision curve for analog sticks. */
export function applyStickCurve(x: number, y: number, deadzone = 0.15, power = 1): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone) return [0, 0];
  const norm = Math.min(1, (mag - deadzone) / (1 - deadzone));
  const curved = power === 1 ? norm : Math.pow(norm, power);
  const scale = curved / mag;
  return [x * scale, y * scale];
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
  /** Where the cursor is over the game (client px) and whether it's inside it: without pointer lock the cursor runs
   *  into the window edge and mouse movement stops, so resting it near a side keeps turning (edge turn). */
  private curX = 0; private curY = 0; private cursorIn = false;
  private hoverLook = true;
  /** The browser refused to capture the mouse (embedded views such as the Claude pane): main.ts switches to the
   *  fallback scheme (A / D turn, strong aim assist). Cleared when a capture succeeds. */
  lockRefused = false;
  private cursorNdc(): { x: number; y: number } | null {
    if (!this.cursorAim || this.isTouchDevice || document.pointerLockElement || this.padAim) return null;
    const r = this.surface.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = THREE_CLAMP(((this.curX - r.left) / r.width) * 2 - 1), y = THREE_CLAMP(-(((this.curY - r.top) / r.height) * 2 - 1));
    return { x, y };
  }
  /** Cursor aim (main.ts sets it: third person): the mouse moves the crosshair, the camera turns with A / D and the
   *  screen edges, and no pointer lock is taken. */
  cursorAim = false; // the view follows the mouse from the start: no click needed to turn (pointer lock, when granted, takes over)

  private queuedJump = false;
  private queuedDash = false;
  private queuedFire = false;
  private queuedSurge = false;
  private queuedStrike = false;
  private queuedToggleView = false;
  private queuedCycleVessel = false;
  private queuedLock = false;
  private queuedMelee = false;
  private padAim = false;
  private queuedFists = false;
  private queuedGrapple = false;
  private queuedPickup = false;
  private queuedArmory = false;
  private queuedPause = false;
  private queuedRestore = false;
  private queuedWarden = false;
  private queuedLoadoutPrev = false;
  private queuedLoadoutNext = false;
  private queuedCrouch = false;
  private touchJumpHeld = false;
  private touchCrouchHeld = false;
  private touchFireHeld = false;

  private prevPadButtons: boolean[] = [];
  private viewHoldT = 0;
  private viewHoldFired = false;
  // hold to fire: while the left button / right trigger is held, a shot repeats on every eighth note of the
  // 124 BPM pulse (the press itself fires the first one), so holding keeps you in rhythm
  private fireHeld = false;
  private aimHeld = false;
  private fireRepeat = 0;
  private static readonly REPEAT = 60 / 124 / 2;
  isTouchDevice = false;

  /** Trigger dual-rumble haptic feedback on the active controller when supported by the browser. */
  rumble(strong = 0.35, weak = 0.25, duration = 90) {
    try {
      const pad = findActiveGamepad(navigator.getGamepads?.());
      const act = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: Record<string, number>) => Promise<unknown> } }) | null)?.vibrationActuator;
      if (act?.playEffect) {
        void act.playEffect('dual-rumble', {
          startDelay: 0,
          duration,
          strongMagnitude: Math.max(0, Math.min(1, strong)),
          weakMagnitude: Math.max(0, Math.min(1, weak)),
        });
      }
    } catch { /* browser / pad without rumble */ }
  }

  private stickBaseEl = document.getElementById('touchStickBase');
  private stickKnobEl = document.getElementById('touchStickKnob');

  constructor(private surface: HTMLElement) {
    // Touch mode on mobile/Android/tablets (or ?touch=1 to preview touch controls on desktop).
    // Windows reports maxTouchPoints = 10 on desktop PCs, so only auto-enable when coarse pointer or mobile UA.
    const forceTouch = typeof location !== 'undefined' && new URLSearchParams(location.search).get('touch') === '1';
    const isMobileUa = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '');
    this.isTouchDevice = forceTouch || isMobileUa || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);

    this.bindTouchSurface();
    this.bindTouchButtons();
    this.bindMouseFallback();
    // Tab (and middle mouse, below) toggles the lock-on
    window.addEventListener('keydown', (e) => { if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) this.queuedLock = true; } });
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyU' && !e.repeat) this.queuedRestore = true; });
    // Z holds aim down sights; T switches gun / fists (middle mouse does too)
    // gun <-> fists is 5 / middle mouse (input/actions.ts); T belongs to Pray now
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyZ') this.aimHeld = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyZ') this.aimHeld = false; });
  }

  /** Mouse buttons (Fortnite-style): left = fire (hold to keep firing on the beat), right = hold to aim down sights,
   *  middle = lock-on; melee is F / E.
   *  Without pointer lock (lock refused, or a touch laptop in touch mode) a drag also looks. */
  private bindMouseFallback() {
    let dragging = false, lastX = 0, lastY = 0;
    this.surface.addEventListener('contextmenu', (e) => e.preventDefault());
    this.surface.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.fireHeld = true; this.fireRepeat = UnifiedControls.REPEAT; this.queuedFire = true; }
      if (e.button === 1) { e.preventDefault(); this.queuedFists = true; }   // middle: gun <-> hand-to-hand
      if (e.button === 2) this.queuedMelee = true;                           // right: melee strike
      if (document.pointerLockElement) return;
      if (e.button !== 0 && e.button !== 2) return;
      // the mouse already turns the view without a click (hoverLook); a click only fires / strikes, never drag-looks
      if (!this.hoverLook) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
      // like Ravencrest / Era Clash: a click on the scene (re)takes the pointer lock for always-on mouse look
      if (!this.isTouchDevice && !this.cursorAim) (this.surface.requestPointerLock?.() as Promise<void> | undefined)?.catch?.(() => { this.hoverLook = true; this.lockRefused = true; });
    });
    document.addEventListener('pointerlockerror', () => { this.hoverLook = true; this.lockRefused = true; });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement === this.surface) this.lockRefused = false; });
    // while playing, the OS cursor is hidden: without pointer lock it stayed visible and read as the aim, though shots
    // go through the crosshair (main.ts toggles body.rr-ingame)
    const hide = document.createElement('style');
    hide.textContent = 'body.rr-ingame, body.rr-ingame * { cursor: none !important; }';
    document.head.appendChild(hide);
    window.addEventListener('mousemove', (e) => {
      if (e.movementX || e.movementY) this.padAim = false;
      if (document.pointerLockElement) return;
      if (!dragging && this.hoverLook && !this.isTouchDevice) {
        // anywhere over the game counts (HUD text sits on top of the canvas but shouldn't swallow the look)
        const r = this.surface.getBoundingClientRect();
        this.cursorIn = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        this.curX = e.clientX; this.curY = e.clientY;
        // cursor aim: the mouse only moves the crosshair (the edges still turn the view); otherwise it looks
        // without a captured mouse, moving it still turns the view (resting it at an edge keeps turning)
        if (this.cursorIn && !this.cursorAim) { this.pendingLookX += e.movementX * 0.85; this.pendingLookY += e.movementY * 0.85; }
        return;
      }
      if (!dragging) return;
      this.pendingLookX += (e.clientX - lastX) * 1.6;
      this.pendingLookY += (e.clientY - lastY) * 1.6;
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => { dragging = false; if (e.button === 0) this.fireHeld = false; });
    document.documentElement.addEventListener('mouseleave', () => { this.cursorIn = false; });
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
    const bindHold = (id: string, onDown: () => void, onUp: () => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.isTouchDevice = true; onDown(); };
      const end = (e: Event) => { e.stopPropagation(); onUp(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
    };

    // Holdable Fire (beat-synced auto-fire), Jump (swim up / glide), Crouch (dive / drop cliff), Guard & Pick Up/Eat
    bindHold('btnFire', () => { this.touchFireHeld = true; this.fireRepeat = UnifiedControls.REPEAT; this.queuedFire = true; }, () => { this.touchFireHeld = false; });
    bindHold('btnJump', () => { this.touchJumpHeld = true; this.queuedJump = true; }, () => { this.touchJumpHeld = false; });
    bindHold('btnCrouch', () => { this.touchCrouchHeld = true; this.queuedCrouch = true; }, () => { this.touchCrouchHeld = false; });
    bindHold('btnPickup', () => {
      this.queuedPickup = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', bubbles: true }));
    }, () => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyH', bubbles: true }));
    });
    bindHold('btnGuard', () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', bubbles: true })); }, () => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', bubbles: true })); });

    bindBtn('btnDash', () => { this.queuedDash = true; });
    bindBtn('btnGrapple', () => { this.queuedGrapple = true; });
    bindBtn('btnSurge', () => { this.queuedSurge = true; });
    bindBtn('btnStrike', () => { this.queuedStrike = true; });
    bindBtn('btnView', () => { this.queuedToggleView = true; });
    bindBtn('btnPause', () => { this.queuedPause = true; });
    bindBtn('btnArmory', () => { this.queuedArmory = true; });
    bindBtn('btnRestore', () => { this.queuedRestore = true; });
    bindBtn('btnWarden', () => { this.queuedWarden = true; });
    bindBtn('btnLoadoutPrev', () => { this.queuedLoadoutPrev = true; });
    bindBtn('btnLoadoutNext', () => { this.queuedLoadoutNext = true; });
    bindBtn('btnLock', () => { this.queuedLock = true; });
    bindBtn('btnFists', () => { this.queuedFists = true; });
    bindBtn('btnReload', () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', bubbles: true })); });
  }

  poll(dt: number): InputState {
    let moveX = this.moveStickX;
    let moveY = this.moveStickY;
    let lookDeltaX = this.pendingLookX;
    let lookDeltaY = this.pendingLookY;
    // edge turn (no pointer lock): the cursor resting in the outer 8 % of the game keeps turning that way, faster
    // the closer to the edge, so the view never sticks when the cursor reaches the side of the window
    if (this.hoverLook && this.cursorIn && !document.pointerLockElement && !this.isTouchDevice) {
      const r = this.surface.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const nx = (this.curX - r.left) / r.width, ny = (this.curY - r.top) / r.height, B = 0.08;
        if (nx < B) lookDeltaX -= ((B - nx) / B) * 420 * dt; else if (nx > 1 - B) lookDeltaX += ((nx - (1 - B)) / B) * 420 * dt;
        if (ny < B) lookDeltaY -= ((B - ny) / B) * 220 * dt; else if (ny > 1 - B) lookDeltaY += ((ny - (1 - B)) / B) * 220 * dt;
      }
    }
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
    let meleePressed = this.queuedMelee, fistsPressed = this.queuedFists;
    this.queuedMelee = false; this.queuedFists = false;
    let lockHeld = false;
    let aimHeld = this.aimHeld;
    let reloadPressed = false, crouchPressed = this.queuedCrouch, crouchHeld = this.touchCrouchHeld;
    let jumpHeld = this.touchJumpHeld, grapplePressed = this.queuedGrapple, pickupPressed = this.queuedPickup;
    let armoryTogglePressed = this.queuedArmory, loadoutNextPressed = this.queuedLoadoutNext, loadoutPrevPressed = this.queuedLoadoutPrev, pausePressed = this.queuedPause;
    let restorePressed = this.queuedRestore, wardenPressed = this.queuedWarden;
    let padConnected = false;

    this.queuedJump = false;
    this.queuedDash = false;
    this.queuedFire = false;
    this.queuedSurge = false;
    this.queuedStrike = false;
    this.queuedToggleView = false;
    this.queuedCycleVessel = false;
    this.queuedLock = false;
    this.queuedGrapple = false;
    this.queuedPickup = false;
    this.queuedArmory = false;
    this.queuedPause = false;
    this.queuedRestore = false;
    this.queuedWarden = false;
    this.queuedLoadoutPrev = false;
    this.queuedLoadoutNext = false;
    this.queuedCrouch = false;

    let held = this.fireHeld || this.touchFireHeld;
    // Poll standard Gamepad API (supports any connected slot 0–3)
    const pad = findActiveGamepad(navigator.getGamepads ? navigator.getGamepads() : []);
    if (pad) {
      padConnected = true;
      const [lx, ly] = applyStickCurve(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.15, 1.15);
      const [rx, ry] = applyStickCurve(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.14, 1.65);

      if (Math.abs(lx) > Math.abs(moveX)) moveX = lx;
      if (Math.abs(ly) > Math.abs(moveY)) moveY = -ly;
      lookDeltaX += rx * 1180 * dt;
      lookDeltaY += ry * 880 * dt;
      if (rx || ry || lx || ly) this.padAim = true;

      const isDown = (idx: number) => Boolean(pad.buttons[idx]?.pressed || (pad.buttons[idx]?.value ?? 0) > 0.45);
      const edge = (idx: number) => {
        const down = isDown(idx);
        const was = this.prevPadButtons[idx] ?? false;
        this.prevPadButtons[idx] = down;
        if (down && !was) this.padAim = true;
        return down && !was;
      };

      jumpHeld = isDown(0);
      crouchHeld = isDown(13);
      edge(6);
      if (isDown(6)) { lockHeld = true; aimHeld = true; } // LT: Aim Down Sights + Lock-On (+ chords below)
      if (edge(0)) jumpPressed = true;            // A / Cross: Jump / Double Jump / Swim Up / Wall-Kick / Slingshot
      if (edge(7)) { firePressed = true; this.fireRepeat = UnifiedControls.REPEAT; } // RT: Fire
      if (isDown(7)) held = true;
      if (edge(2)) strikePressed = true;          // X / Square: Melee Strike / Finisher (hold: Heavy)
      if (edge(1)) dashPressed = true;            // B / Circle: Dash / Swim Surge
      if (edge(4)) grapplePressed = true;         // LB: Retracting Grappling Hook (Stalker / Sylva)
      if (edge(3)) {
        if (aimHeld) wardenPressed = true;        // LT + Y: Summon / Assist Sworn Friend Grovewarden
        else surgePressed = true;                 // Y / Triangle: Soul Surge
      }
      if (edge(5)) cycleVesselPressed = true;     // RB: Cycle Soul Vessel (Free Roam)
      if (edge(12)) {
        if (aimHeld) restorePressed = true;       // LT + D-pad Up: Spray Living Waters / Sow Pure Seeds
        else pickupPressed = true;                // D-pad Up: Pick up World Gear (or Forage / Hold Eat)
      }
      if (edge(13)) crouchPressed = true;         // D-pad Down: Crouch (tap) / Dive & Cliff Drop (hold)
      if (edge(14)) {
        if (aimHeld) loadoutPrevPressed = true;   // LT + D-pad Left: Previous Loadout
        else reloadPressed = true;                // D-pad Left: Reload / Vent
      }
      if (edge(15)) {
        if (aimHeld) loadoutNextPressed = true;   // LT + D-pad Right: Next Loadout
        else fistsPressed = true;                 // D-pad Right: Gun <-> Fists
      }
      if (edge(9)) pausePressed = true;           // Menu / Start / Options: Pause / Resume

      // View / Select (button 8): short tap = 1st / 3rd person; hold (>= 0.32s) = Armory & Loadouts
      // (Button 11 / R3 is exclusively Guard / Parry — never hijacks camera view.)
      const viewDown = isDown(8);
      const viewWas = this.prevPadButtons[8] ?? false;
      this.prevPadButtons[8] = viewDown;
      if (viewDown) {
        this.padAim = true;
        this.viewHoldT += dt;
        if (this.viewHoldT >= 0.32 && !this.viewHoldFired) {
          this.viewHoldFired = true;
          armoryTogglePressed = true;
        }
      } else {
        if (viewWas && !this.viewHoldFired) toggleViewPressed = true;
        this.viewHoldT = 0;
        this.viewHoldFired = false;
      }
    } else {
      this.viewHoldT = 0;
      this.viewHoldFired = false;
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
      jumpHeld,
      dashPressed,
      grapplePressed,
      pickupPressed,
      armoryTogglePressed,
      loadoutNextPressed,
      loadoutPrevPressed,
      pausePressed,
      restorePressed,
      wardenPressed,
      firePressed,
      surgePressed,
      strikePressed,
      toggleViewPressed,
      cycleVesselPressed,
      lockPressed,
      lockHeld,
      aimHeld,
      meleePressed,
      fistsPressed,
      reloadPressed,
      crouchPressed,
      crouchHeld,
      isTouchActive: this.isTouchDevice,
      padAim: this.padAim || this.isTouchDevice,
      padConnected,
      cursor: this.cursorNdc(),
    };
  }
}
const THREE_CLAMP = (v: number) => Math.max(-1, Math.min(1, v));
