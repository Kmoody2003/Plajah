// Universal Gamepad Manager for Lexicon: The Unwriting
// Xbox-style spatial layout working across ALL controllers:
// - Xbox (Series X|S, One, 360, XInput)
// - PlayStation (DualSense PS5, DualShock 4, DualShock 3)
// - Nintendo Switch (Pro Controller, Joy-Con Pair, NSO)
// - Steam Deck, 8BitDo, Backbone, Razer Kishi, Backbone, Logitech F310/F710
// - Generic / DirectInput non-standard USB & Bluetooth gamepads (mapping === '')
// Automatically ignores non-gamepad peripherals (racing wheels, pedals, flight sticks, HOTAS).

export type PadStyle = 'xbox' | 'playstation' | 'nintendo' | 'generic';
export type PadStylePref = 'auto' | 'xbox' | 'playstation' | 'nintendo';

export interface PadGlyphs {
  style: PadStyle;
  name: string;
  confirm: string;   // South face button: A / ✕ / B
  cancel: string;    // East face button:  B / ○ / A
  strike: string;    // West face button:  X / □ / Y
  lyre: string;      // North face button: Y / △ / X
  lb: string;        // Left bumper:       LB / L1 / L
  rb: string;        // Right bumper:      RB / R1 / R
  lt: string;        // Left trigger:      LT / L2 / ZL
  rt: string;        // Right trigger:     RT / R2 / ZR
  lasso: string;     // Combined display:  RB/RT / R1/R2 / R/ZR
  select: string;    // Back / View / Create / -
  start: string;     // Start / Menu / Options / +
  r3: string;        // Right stick click: RS / R3 / R3
  move: string;      // LS / L
  look: string;      // RS / R
  dpadUp: string;
  dpadRight: string;
  dpadDown: string;
  dpadLeft: string;
}

const GLYPHS: Record<PadStyle, PadGlyphs> = {
  xbox: {
    style: 'xbox', name: 'Xbox Controller',
    confirm: 'A', cancel: 'B', strike: 'X', lyre: 'Y',
    lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', lasso: 'RB',
    select: 'View', start: 'Menu', r3: 'RS', move: 'LS', look: 'RS',
    dpadUp: '▲', dpadRight: '▶', dpadDown: '▼', dpadLeft: '◀',
  },
  playstation: {
    style: 'playstation', name: 'PlayStation Controller',
    confirm: '✕', cancel: '○', strike: '□', lyre: '△',
    lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', lasso: 'R1',
    select: 'Share', start: 'Options', r3: 'R3', move: 'L3', look: 'R3',
    dpadUp: '▲', dpadRight: '▶', dpadDown: '▼', dpadLeft: '◀',
  },
  nintendo: {
    style: 'nintendo', name: 'Nintendo Controller',
    confirm: 'B', cancel: 'A', strike: 'Y', lyre: 'X',
    lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', lasso: 'R',
    select: '−', start: '+', r3: 'R3', move: 'L', look: 'R',
    dpadUp: '▲', dpadRight: '▶', dpadDown: '▼', dpadLeft: '◀',
  },
  generic: {
    style: 'generic', name: 'Gamepad',
    confirm: 'A', cancel: 'B', strike: 'X', lyre: 'Y',
    lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', lasso: 'RB',
    select: 'Back', start: 'Start', r3: 'R3', move: 'LS', look: 'RS',
    dpadUp: '▲', dpadRight: '▶', dpadDown: '▼', dpadLeft: '◀',
  },
};

export interface PadButtons {
  confirm: boolean;  // South (0): A / ✕
  cancel: boolean;   // East  (1): B / ○
  strike: boolean;   // West  (2): X / □
  lyre: boolean;     // North (3): Y / △
  lb: boolean;       // Left Bumper (4): Cycle lock / Switch Left
  rb: boolean;       // Right Bumper (5): Word Lasso / Switch Right
  lt: boolean;       // Left Trigger (6): Hold Lock-On / Switch Left
  rt: boolean;       // Right Trigger (7): Word Lasso (alt) / Switch Right
  select: boolean;   // View / Back / Share (8): Archive
  start: boolean;    // Menu / Start / Options (9): Pause
  l3: boolean;       // Left Stick Click (10)
  r3: boolean;       // Right Stick Click (11): Recenter Camera
  up: boolean;       // D-Pad Up (12): Great Forest Elk / Answer 1
  down: boolean;     // D-Pad Down (13): Guide Toggle / Duck / Answer 3
  left: boolean;     // D-Pad Left (14): Music Toggle / Switch Left / Answer 4
  right: boolean;    // D-Pad Right (15): Quick Lyre / Switch Right / Answer 2
}

export interface PadSnapshot {
  connected: boolean;
  id: string;
  style: PadStyle;
  glyphs: PadGlyphs;
  /** Calibrated left-stick vector (-1..1, +moveY = forward/up). */
  moveX: number;
  moveY: number;
  /** Calibrated right-stick look vector (-1..1, +lookY = down). */
  lookX: number;
  lookY: number;
  held: PadButtons;
  pressed: PadButtons;
  /** Edge-triggered (with smooth hold-repeat) UI navigation from Left Stick or D-Pad. */
  navX: -1 | 0 | 1;
  navY: -1 | 0 | 1;
  /** True on any frame where the player touched a stick or button on the controller. */
  anyInput: boolean;
}

const EMPTY_BUTTONS: PadButtons = {
  confirm: false, cancel: false, strike: false, lyre: false,
  lb: false, rb: false, lt: false, rt: false,
  select: false, start: false, l3: false, r3: false,
  up: false, down: false, left: false, right: false,
};

const PERIPHERAL_RE = /(wheel|pedal|rudder|throttle|flight|hotas|yoke|steering|driving force|g29|g920|g923|t300|t150|fanatec|spacepilot|3dconnexion|vjoy|virtual|headtrack|opentrack|trackir|mouse|keyboard|rgb|razer tartarus|keypad)/i;
const PS_RE = /(dualsense|dualshock|playstation|sony|054c|wireless controller|ps4|ps5)/i;
const NINTENDO_RE = /(nintendo|pro controller|joy-con|switch|057e)/i;
const XBOX_RE = /(xbox|xinput|045e|microsoft|steam|8bitdo)/i;

const STYLE_PREF_KEY = 'plajah.lexicon.padStyle.v1';

export function detectPadStyle(id: string): PadStyle {
  if (XBOX_RE.test(id)) return 'xbox';
  if (NINTENDO_RE.test(id)) return 'nintendo';
  if (PS_RE.test(id)) return 'playstation';
  return 'generic';
}

export function glyphsFor(style: PadStyle): PadGlyphs {
  return GLYPHS[style] ?? GLYPHS.xbox;
}

function isUsableGamepad(p: Gamepad | null | undefined): p is Gamepad {
  if (!p || !p.connected) return false;
  if (PERIPHERAL_RE.test(p.id)) return false;
  // Need at least 2 axes and 6 buttons to be a real gamepad (filters tiny foot switches / macro pads)
  if (p.buttons.length < 6 || p.axes.length < 2) return false;
  return true;
}

/** Smooth radial deadzone with gentle quadratic curve for precise walking AND fast sprinting. */
function radialStick(x: number, y: number, deadzone = 0.16): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone) return [0, 0];
  const norm = Math.min(1, (mag - deadzone) / (1 - deadzone));
  const curved = norm * (0.45 + 0.55 * norm);
  return [(x / mag) * curved, (y / mag) * curved];
}

/** Decode DirectInput / non-standard POV hat axis (commonly axis[9] in -1..+1 range) into D-Pad directions. */
function decodePovHat(val: number | undefined): { up: boolean; right: boolean; down: boolean; left: boolean } {
  if (val === undefined || val > 1.15 || val < -1.15 || Math.abs(val - 3.285) < 0.2) {
    return { up: false, right: false, down: false, left: false };
  }
  // Standard W3C/DirectInput hat encoding: -1.0 = N, -0.71 = NE, -0.43 = E, -0.14 = SE, 0.14 = S, 0.43 = SW, 0.71 = W, 1.0 = NW, >1.1 = neutral
  // Some drivers report 0 as neutral only if outside typical 8-way ticks; check proximity to the 8 cardinal/diagonal steps.
  const steps: Array<[number, boolean, boolean, boolean, boolean]> = [
    [-1.000, true, false, false, false],  // N
    [-0.714, true, true, false, false],   // NE
    [-0.429, false, true, false, false],  // E
    [-0.143, false, true, true, false],   // SE
    [0.143, false, false, true, false],   // S
    [0.429, false, false, true, true],    // SW
    [0.714, false, false, false, true],   // W
    [1.000, true, false, false, true],    // NW
  ];
  for (const [t, u, r, d, l] of steps) {
    if (Math.abs(val - t) < 0.12) return { up: u, right: r, down: d, left: l };
  }
  return { up: false, right: false, down: false, left: false };
}

function btnDown(pad: Gamepad, idx: number, threshold = 0.42): boolean {
  const b = pad.buttons[idx];
  return Boolean(b && (b.pressed || b.value > threshold));
}

export interface GamepadManager {
  poll(dt: number): PadSnapshot;
  rumble(strong?: number, weak?: number, durationMs?: number): void;
  getStylePref(): PadStylePref;
  setStylePref(pref: PadStylePref): void;
  cycleStylePref(): PadStylePref;
  getActiveGlyphs(): PadGlyphs;
}

export function createGamepadManager(hooks?: {
  onConnect?: (glyphs: PadGlyphs, id: string) => void;
  onDisconnect?: () => void;
}): GamepadManager {
  let stylePref: PadStylePref = (() => {
    try {
      const v = localStorage.getItem(STYLE_PREF_KEY);
      if (v === 'xbox' || v === 'playstation' || v === 'nintendo' || v === 'auto') return v;
    } catch { /* ignore */ }
    return 'auto';
  })();

  const restAxes = new Map<string, number[]>();
  const engagedPads = new Set<string>();
  let prevHeld: PadButtons = { ...EMPTY_BUTTONS };
  let activePadKey: string | null = null;
  let lastConnected = false;
  let lastStyle: PadStyle = 'xbox';

  // Menu navigation edge + hold-repeat timers
  let navHoldX = 0, navHoldY = 0;
  let navRepeatX = 0, navRepeatY = 0;

  function pickPad(): Gamepad | null {
    const pads = [...(navigator.getGamepads?.() ?? [])].filter(isUsableGamepad);
    if (!pads.length) return null;
    // Prefer an already-engaged gamepad, then a standard-mapped pad, then generic DirectInput pads
    const engaged = pads.find((p) => engagedPads.has(`${p.index}:${p.id}`));
    if (engaged) return engaged;
    const standard = pads.find((p) => p.mapping === 'standard');
    return standard ?? pads[0]!;
  }

  function resolveStyle(id: string): PadStyle {
    if (stylePref !== 'auto') return stylePref;
    return detectPadStyle(id);
  }

  function readNormalized(pad: Gamepad): { moveX: number; moveY: number; lookX: number; lookY: number; held: PadButtons } {
    const key = `${pad.index}:${pad.id}`;
    let rest = restAxes.get(key);
    if (!rest) {
      // Capture EVERY axis's exact initial resting position (even ±1.0 on triggers/pedals/drifting HIDs!)
      // so an idle or off-center peripheral can NEVER make the Scribe walk on his own!
      rest = Array.from(pad.axes);
      restAxes.set(key, rest);
    }
    const ax = (i: number) => {
      const raw = pad.axes[i];
      if (raw === undefined) return 0;
      const r = rest![i] ?? 0;
      const v = raw - r;
      return Math.max(-1, Math.min(1, v));
    };

    const isStd = pad.mapping === 'standard';
    const isNintendoNonStd = !isStd && !XBOX_RE.test(pad.id) && NINTENDO_RE.test(pad.id);
    const isPsNonStd = !isStd && !XBOX_RE.test(pad.id) && !NINTENDO_RE.test(pad.id) && PS_RE.test(pad.id);

    // Face & shoulder buttons — normalized to Xbox spatial positions regardless of controller brand!
    let confirm = btnDown(pad, 0);
    let cancel = btnDown(pad, 1);
    let strike = btnDown(pad, 2);
    let lyre = btnDown(pad, 3);
    let lb = btnDown(pad, 4);
    let rb = btnDown(pad, 5);
    let lt = btnDown(pad, 6, 0.35);
    let rt = btnDown(pad, 7, 0.35);
    let select = btnDown(pad, 8);
    let start = btnDown(pad, 9);
    let l3 = btnDown(pad, 10);
    let r3 = btnDown(pad, 11);

    if (isPsNonStd) {
      // Raw DirectInput DualShock/DualSense mapping: 0=Square, 1=Cross, 2=Circle, 3=Triangle, 8=Share, 9=Options
      strike = btnDown(pad, 0);
      confirm = btnDown(pad, 1);
      cancel = btnDown(pad, 2);
      lyre = btnDown(pad, 3);
      l3 = btnDown(pad, 10);
      r3 = btnDown(pad, 11);
    } else if (isNintendoNonStd) {
      // Raw DirectInput Switch Pro spatial layout
    }

    // Fallback analog trigger axes on non-standard XInput/DirectInput pads (only relative to rest!)
    if (!isStd && pad.buttons.length <= 12) {
      if (!lt && pad.axes[4] !== undefined && Math.abs(ax(4)) > 0.45 && pad.axes[4] > 0.3) lt = true;
      if (!rt && pad.axes[5] !== undefined && Math.abs(ax(5)) > 0.45 && pad.axes[5] > 0.3) rt = true;
    }

    // D-Pad: standard buttons 12..15, OR fallback POV hat axis (axis 9) / D-pad axes (axes 6,7) for non-standard pads!
    let up = btnDown(pad, 12);
    let down = btnDown(pad, 13);
    let left = btnDown(pad, 14);
    let right = btnDown(pad, 15);
    if (!up && !down && !left && !right && !isStd) {
      if (pad.axes.length >= 10) {
        const hat = decodePovHat(pad.axes[9]);
        up = hat.up; right = hat.right; down = hat.down; left = hat.left;
      } else if (pad.axes.length >= 8) {
        if (ax(6) < -0.5) left = true;
        if (ax(6) > 0.5) right = true;
        if (ax(7) < -0.5) up = true;
        if (ax(7) > 0.5) down = true;
      }
    }

    const held: PadButtons = { confirm, cancel, strike, lyre, lb, rb, lt, rt, select, start, l3, r3, up, down, left, right };
    const anyBtn = Object.values(held).some(Boolean);

    // Sticks: standard uses [0,1] left & [2,3] right; some DirectInput pads put right stick on [2,5]
    const rawLX = ax(0);
    const rawLY = ax(1);
    const rawRX = isStd ? ax(2) : ax(2);
    const rawRY = isStd ? ax(3) : (pad.axes.length >= 6 && Math.abs(ax(3)) < 0.05 && Math.abs(ax(5)) > 0.2 ? ax(5) : ax(3));

    // Anti-ghost-walk gate:
    // - Non-standard USB/DirectInput HIDs stay stick-muted until the user presses a real button on them!
    // - Standard controllers whose initial resting axes were off-center (>0.35) also wait for a button press.
    // - Clean standard controllers engage as soon as a button is pressed OR stick moves cleanly past 0.24.
    const restOffCenter = Math.abs(rest[0] ?? 0) > 0.35 || Math.abs(rest[1] ?? 0) > 0.35;
    if (!engagedPads.has(key)) {
      const stickActive = isStd && !restOffCenter && (Math.hypot(rawLX, rawLY) > 0.24 || Math.hypot(rawRX, rawRY) > 0.24);
      if (anyBtn || stickActive) engagedPads.add(key);
    }

    const engaged = engagedPads.has(key);
    // Generous 0.22 radial deadzone prevents subtle analog stick drift from slowly walking the character
    const [moveX, moveYDown] = engaged ? radialStick(rawLX, rawLY, 0.22) : [0, 0];
    const [lookX, lookY] = engaged ? radialStick(rawRX, rawRY, 0.22) : [0, 0];

    return {
      moveX,
      moveY: -moveYDown, // +1 = forward / up
      lookX,
      lookY,
      held,
    };
  }

  function poll(dt: number): PadSnapshot {
    const pad = pickPad();
    if (!pad) {
      if (lastConnected) {
        lastConnected = false;
        activePadKey = null;
        prevHeld = { ...EMPTY_BUTTONS };
        hooks?.onDisconnect?.();
      }
      return {
        connected: false, id: '', style: lastStyle, glyphs: glyphsFor(lastStyle),
        moveX: 0, moveY: 0, lookX: 0, lookY: 0,
        held: { ...EMPTY_BUTTONS }, pressed: { ...EMPTY_BUTTONS },
        navX: 0, navY: 0, anyInput: false,
      };
    }

    const key = `${pad.index}:${pad.id}`;
    const style = resolveStyle(pad.id);
    lastStyle = style;
    const glyphs = glyphsFor(style);

    if (!lastConnected || activePadKey !== key) {
      lastConnected = true;
      activePadKey = key;
      hooks?.onConnect?.(glyphs, pad.id);
    }

    const { moveX, moveY, lookX, lookY, held } = readNormalized(pad);
    const pressed: PadButtons = {
      confirm: held.confirm && !prevHeld.confirm,
      cancel: held.cancel && !prevHeld.cancel,
      strike: held.strike && !prevHeld.strike,
      lyre: held.lyre && !prevHeld.lyre,
      lb: held.lb && !prevHeld.lb,
      rb: held.rb && !prevHeld.rb,
      lt: held.lt && !prevHeld.lt,
      rt: held.rt && !prevHeld.rt,
      select: held.select && !prevHeld.select,
      start: held.start && !prevHeld.start,
      l3: held.l3 && !prevHeld.l3,
      r3: held.r3 && !prevHeld.r3,
      up: held.up && !prevHeld.up,
      down: held.down && !prevHeld.down,
      left: held.left && !prevHeld.left,
      right: held.right && !prevHeld.right,
    };
    prevHeld = held;

    // Smooth UI navigation (Left Stick OR D-Pad) with initial 0.34s delay then 0.14s repeat
    const dirX: -1 | 0 | 1 = (held.right || moveX > 0.55) ? 1 : (held.left || moveX < -0.55) ? -1 : 0;
    const dirY: -1 | 0 | 1 = (held.down || moveY < -0.55) ? 1 : (held.up || moveY > 0.55) ? -1 : 0;
    let navX: -1 | 0 | 1 = 0;
    let navY: -1 | 0 | 1 = 0;

    if (dirX !== 0) {
      if (dirX !== navHoldX) { navX = dirX; navHoldX = dirX; navRepeatX = 0.34; }
      else { navRepeatX -= dt; if (navRepeatX <= 0) { navX = dirX; navRepeatX = 0.14; } }
    } else { navHoldX = 0; navRepeatX = 0; }

    if (dirY !== 0) {
      if (dirY !== navHoldY) { navY = dirY; navHoldY = dirY; navRepeatY = 0.34; }
      else { navRepeatY -= dt; if (navRepeatY <= 0) { navY = dirY; navRepeatY = 0.14; } }
    } else { navHoldY = 0; navRepeatY = 0; }

    const anyBtn = Object.values(held).some(Boolean);
    const anyInput = anyBtn || Math.abs(moveX) > 0.08 || Math.abs(moveY) > 0.08 || Math.abs(lookX) > 0.08 || Math.abs(lookY) > 0.08;

    return { connected: true, id: pad.id, style, glyphs, moveX, moveY, lookX, lookY, held, pressed, navX, navY, anyInput };
  }

  function rumble(strong = 0.35, weak = 0.25, durationMs = 110): void {
    const pad = pickPad() as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, opts: Record<string, number>) => Promise<unknown> } }) | null;
    try {
      void pad?.vibrationActuator?.playEffect?.('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        strongMagnitude: Math.max(0, Math.min(1, strong)),
        weakMagnitude: Math.max(0, Math.min(1, weak)),
      });
    } catch { /* unsupported browser / controller */ }
  }

  return {
    poll,
    rumble,
    getStylePref: () => stylePref,
    setStylePref(pref: PadStylePref) {
      stylePref = pref;
      try { localStorage.setItem(STYLE_PREF_KEY, pref); } catch { /* ignore */ }
    },
    cycleStylePref(): PadStylePref {
      const order: PadStylePref[] = ['auto', 'xbox', 'playstation', 'nintendo'];
      const next = order[(order.indexOf(stylePref) + 1) % order.length]!;
      this.setStylePref(next);
      return next;
    },
    getActiveGlyphs(): PadGlyphs {
      return glyphsFor(stylePref === 'auto' ? lastStyle : stylePref);
    },
  };
}
