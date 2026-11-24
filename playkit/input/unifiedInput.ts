// playkit/input/unifiedInput.ts
//
// Cross-platform Input Layer serving:
//   - Touch-first mobile/foldable games (virtual stick, right-half look, ≥44px action pads)
//   - Standard Gamepad API controllers (dual-stick + triggers + face buttons)
//   - Desktop Keyboard + Mouse
//   - Rhythm tap queues (4-lane arrow taps without dropping fast inputs — Kith Party)
//   - Buffered platformer/action inputs (jump buffer + action edge triggers — Kith Quest / Firstlight)

export type InputDeviceKind = 'keyboard-mouse' | 'touch' | 'gamepad';

export type ActionName =
  | 'jump'
  | 'fire'
  | 'altFire'
  | 'melee'
  | 'dash'
  | 'interact'
  | 'special'
  | 'item'
  | 'toggleView'
  | 'cycleSlot'
  | 'pause';

export interface UnifiedInputFrame {
  moveX: number; // -1..1
  moveY: number; // -1..1 (+1 = forward / up)
  lookDeltaX: number;
  lookDeltaY: number;
  /** Actions currently held down. */
  held: Record<ActionName, boolean>;
  /** Actions newly pressed since the previous poll. */
  pressed: Record<ActionName, boolean>;
  /** Buffered rhythm/stunt lane taps in chronological order (0=L, 1=D, 2=U, 3=R). */
  laneTaps: number[];
  /** Currently held 4-lane states (Kith Party rhythm). */
  lanesHeld: [boolean, boolean, boolean, boolean];
  /** Seconds remaining in jump buffer (for crisp 2D/3D platforming). */
  jumpBufferRemaining: number;
  activeDevice: InputDeviceKind;
}

const ALL_ACTIONS: ActionName[] = [
  'jump', 'fire', 'altFire', 'melee', 'dash', 'interact',
  'special', 'item', 'toggleView', 'cycleSlot', 'pause',
];

function emptyActionMap(): Record<ActionName, boolean> {
  return {
    jump: false, fire: false, altFire: false, melee: false, dash: false,
    interact: false, special: false, item: false, toggleView: false, cycleSlot: false, pause: false,
  };
}

export class UnifiedInputBuffer {
  private held = emptyActionMap();
  private queuedPresses = emptyActionMap();
  private prevGamepadButtons: boolean[] = [];
  private laneTaps: number[] = [];
  private lanesHeld: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  private stickMoveX = 0;
  private stickMoveY = 0;
  private lookX = 0;
  private lookY = 0;
  private jumpBuf = 0;
  readonly jumpBufferWindowSec: number;
  activeDevice: InputDeviceKind = 'keyboard-mouse';

  constructor(opts?: { jumpBufferWindowSec?: number }) {
    this.jumpBufferWindowSec = opts?.jumpBufferWindowSec ?? 0.12;
  }

  /** Set analog movement vector (e.g. from touch virtual thumbstick or WASD synthesis). */
  setMoveStick(x: number, y: number, device: InputDeviceKind = 'touch'): void {
    const len = Math.hypot(x, y);
    if (len > 1) {
      this.stickMoveX = x / len;
      this.stickMoveY = y / len;
    } else {
      this.stickMoveX = x;
      this.stickMoveY = y;
    }
    if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) this.activeDevice = device;
  }

  /** Accumulate look/aim delta (mouse movement, right-side touch drag, or right stick). */
  addLookDelta(dx: number, dy: number, device: InputDeviceKind = 'touch'): void {
    this.lookX += dx;
    this.lookY += dy;
    if (dx !== 0 || dy !== 0) this.activeDevice = device;
  }

  /** Press or release a semantic action from keyboard, touch button, or script test. */
  setAction(action: ActionName, down: boolean, device: InputDeviceKind = 'keyboard-mouse'): void {
    if (down && !this.held[action]) {
      this.queuedPresses[action] = true;
      if (action === 'jump') this.jumpBuf = this.jumpBufferWindowSec;
    }
    this.held[action] = down;
    if (down) this.activeDevice = device;
  }

  /** Trigger a single-frame action tap (ideal for ≥44px touch buttons). */
  tapAction(action: ActionName, device: InputDeviceKind = 'touch'): void {
    this.queuedPresses[action] = true;
    if (action === 'jump') this.jumpBuf = this.jumpBufferWindowSec;
    this.activeDevice = device;
  }

  /** Push a rhythm/stunt directional lane tap (0=Left, 1=Down, 2=Up, 3=Right). */
  setLane(laneIndex: 0 | 1 | 2 | 3, down: boolean, device: InputDeviceKind = 'keyboard-mouse'): void {
    if (down && !this.lanesHeld[laneIndex]) {
      this.laneTaps.push(laneIndex);
    }
    this.lanesHeld[laneIndex] = down;
    if (down) this.activeDevice = device;
  }

  /** Consume a buffered jump (returns true if within the buffer window). */
  consumeJumpBuffer(): boolean {
    if (this.jumpBuf > 0) {
      this.jumpBuf = 0;
      return true;
    }
    return false;
  }

  /** Ingest a Standard Gamepad snapshot (browser `navigator.getGamepads()[0]` or mock in tests). */
  ingestGamepad(pad: { axes: ReadonlyArray<number>; buttons: ReadonlyArray<{ pressed: boolean; value?: number }> } | null, dt: number): void {
    if (!pad) return;
    const dead = (v: number) => (Math.abs(v) < 0.16 ? 0 : v);
    const lx = dead(pad.axes[0] ?? 0);
    const ly = dead(pad.axes[1] ?? 0);
    const rx = dead(pad.axes[2] ?? 0);
    const ry = dead(pad.axes[3] ?? 0);

    if (Math.abs(lx) > 0 || Math.abs(ly) > 0) {
      this.setMoveStick(lx, -ly, 'gamepad');
    }
    if (Math.abs(rx) > 0 || Math.abs(ry) > 0) {
      this.addLookDelta(rx * 1100 * dt, ry * 850 * dt, 'gamepad');
    }

    const edge = (idx: number): boolean => {
      const btn = pad.buttons[idx];
      const down = Boolean(btn?.pressed || (btn?.value ?? 0) > 0.45);
      const was = this.prevGamepadButtons[idx] ?? false;
      this.prevGamepadButtons[idx] = down;
      return down && !was;
    };

    const map: Array<[number, ActionName]> = [
      [0, 'jump'],      // A / Cross
      [1, 'dash'],      // B / Circle
      [2, 'melee'],     // X / Square
      [3, 'special'],   // Y / Triangle
      [4, 'dash'],      // LB
      [5, 'cycleSlot'], // RB
      [6, 'altFire'],   // LT
      [7, 'fire'],      // RT
      [8, 'toggleView'],// Select
      [9, 'pause'],     // Start
    ];
    for (const [idx, action] of map) {
      if (edge(idx)) this.tapAction(action, 'gamepad');
    }

    // D-pad to 4-lane rhythm taps (14=L, 13=D, 12=U, 15=R)
    const dpad: Array<[number, 0 | 1 | 2 | 3]> = [[14, 0], [13, 1], [12, 2], [15, 3]];
    for (const [idx, lane] of dpad) {
      if (edge(idx)) this.laneTaps.push(lane);
    }
  }

  /** Produce the immutable frame snapshot and clear single-frame edges. */
  poll(dt: number): UnifiedInputFrame {
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    const pressed = emptyActionMap();
    for (const a of ALL_ACTIONS) {
      pressed[a] = this.queuedPresses[a];
      this.queuedPresses[a] = false;
    }

    const frame: UnifiedInputFrame = {
      moveX: this.stickMoveX,
      moveY: this.stickMoveY,
      lookDeltaX: this.lookX,
      lookDeltaY: this.lookY,
      held: { ...this.held },
      pressed,
      laneTaps: this.laneTaps.splice(0, this.laneTaps.length),
      lanesHeld: [...this.lanesHeld] as [boolean, boolean, boolean, boolean],
      jumpBufferRemaining: this.jumpBuf,
      activeDevice: this.activeDevice,
    };

    this.lookX = 0;
    this.lookY = 0;
    return frame;
  }
}
