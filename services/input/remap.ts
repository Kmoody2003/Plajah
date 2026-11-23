// Plajah input remapping — player-customisable controls for any Plajah game (keyboard, mouse incl. extra side
// buttons, gamepads), without touching the game's own input code.
//
// A game lists its actions, each with the CANONICAL input its code already listens for (Rift Realm's fire is the
// left mouse button, dash is Shift, the controller's jump is button 0 …) plus default bindings. When the player binds
// an action to something else, the remapper intercepts that physical input in the capture phase and re-dispatches it
// as the canonical input, so every listener in the game (player, combat, menus) just works. Inputs that an action no
// longer uses are swallowed. Gamepads are remapped by wrapping navigator.getGamepads with a button permutation.
//
// Extra mouse buttons: browsers report the side buttons as button 3 (back) and 4 (forward); some mice report more.
// Any button index can be bound, and the browser's back / forward navigation on those buttons is blocked while the
// remapper is installed (a side-button press must never leave the game). Mice whose driver sends key presses for
// their extra buttons (many Razer mice send 1-0, -, =) bind like keys.

export type Bind = { t: 'key'; code: string } | { t: 'mouse'; b: number };

export interface ActionDef {
  id: string;
  label: string;
  group: string;
  /** The keyboard / mouse input the game's own code listens for. */
  canonical: Bind;
  /** Default keyboard / mouse bindings (up to two). */
  defaults: Bind[];
  /** The controller button index the game reads for this action (standard mapping), if any. */
  padCanonical?: number;
}

export interface Binding { binds: Bind[]; pad: number | null }
export type Bindings = Record<string, Binding>;

export const bindKey = (b: Bind) => (b.t === 'key' ? `k:${b.code}` : `m:${b.b}`);
export const sameBind = (a: Bind, b: Bind) => bindKey(a) === bindKey(b);

const MOUSE_NAMES = ['Left click', 'Middle click', 'Right click', 'Mouse 4 (back)', 'Mouse 5 (forward)'];
const PAD_NAMES = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB', 'RB', 'LT', 'RT', 'View / Share', 'Menu / Options', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];

/** A readable name for a binding ("Space", "Mouse 4 (back)", "Num 4"). */
export function bindLabel(b: Bind | null | undefined): string {
  if (!b) return '—';
  if (b.t === 'mouse') return MOUSE_NAMES[b.b] ?? `Mouse ${b.b + 1}`;
  const c = b.code;
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (c.startsWith('Numpad')) return `Num ${c.slice(6)}`;
  if (c.startsWith('Arrow')) return `${c.slice(5)} arrow`;
  const named: Record<string, string> = { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Tab: 'Tab', Enter: 'Enter', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', CapsLock: 'Caps Lock' };
  return named[c] ?? c;
}
export const padLabel = (i: number | null | undefined) => (i === null || i === undefined ? '—' : PAD_NAMES[i] ?? `Button ${i}`);

/** Default bindings from the action table. */
export function defaultBindings(actions: ActionDef[]): Bindings {
  const out: Bindings = {};
  for (const a of actions) out[a.id] = { binds: a.defaults.slice(0, 2), pad: a.padCanonical ?? null };
  return out;
}

/**
 * The translation the bindings imply (pure; exported for tests):
 *  - `map`: physical input → the canonical input to dispatch instead
 *  - `swallow`: physical inputs to drop (an action's canonical input it was moved off, now bound to nothing)
 *  - `pad`: canonical button index → physical button index
 */
export function compile(actions: ActionDef[], bindings: Bindings) {
  const map = new Map<string, Bind>();
  const bound = new Set<string>();
  for (const a of actions) for (const b of bindings[a.id]?.binds ?? []) bound.add(bindKey(b));
  for (const a of actions) {
    for (const b of bindings[a.id]?.binds ?? []) if (!sameBind(b, a.canonical)) map.set(bindKey(b), a.canonical);
  }
  const swallow = new Set<string>();
  for (const a of actions) {
    const k = bindKey(a.canonical);
    if (!bound.has(k) && !map.has(k)) swallow.add(k);
  }
  const pad = new Map<number, number>();
  for (const a of actions) {
    if (a.padCanonical === undefined) continue;
    const p = bindings[a.id]?.pad;
    pad.set(a.padCanonical, p === null || p === undefined ? -1 : p);
  }
  return { map, swallow, pad };
}

/** Which actions already use this binding (for "already used by …" in the UI). */
export function usersOf(actions: ActionDef[], bindings: Bindings, b: Bind): string[] {
  return actions.filter((a) => (bindings[a.id]?.binds ?? []).some((x) => sameBind(x, b))).map((a) => a.id);
}
export function padUsersOf(actions: ActionDef[], bindings: Bindings, i: number): string[] {
  return actions.filter((a) => bindings[a.id]?.pad === i).map((a) => a.id);
}

const KEY_FOR_CODE = (code: string) => (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code);

export class InputRemap {
  bindings: Bindings;
  private compiled: ReturnType<typeof compile>;
  private installed = false;
  /** While capturing a new binding the remapper passes nothing through (the UI owns the next press). */
  capturing: ((b: Bind | 'cancel' | 'clear') => void) | null = null;
  capturingPad: ((i: number | 'cancel') => void) | null = null;
  private lastX = 0; private lastY = 0;
  private realGetGamepads: (() => (Gamepad | null)[]) | null = null;
  private padPrev: boolean[] = [];
  private listeners = new Set<() => void>();

  /** `active`: remap only while the game is being played (menus and text fields see raw input). */
  constructor(private storageKey: string, readonly actions: ActionDef[], private mouseTarget: () => EventTarget | null, private active: () => boolean = () => true) {
    this.bindings = this.load();
    this.compiled = compile(actions, this.bindings);
  }

  private load(): Bindings {
    const d = defaultBindings(this.actions);
    try {
      const raw = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as Bindings | null;
      if (raw) for (const a of this.actions) if (raw[a.id]) d[a.id] = { binds: (raw[a.id].binds ?? []).slice(0, 2), pad: raw[a.id].pad ?? null };
    } catch { /* private mode / bad data: defaults */ }
    return d;
  }
  private save() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.bindings)); } catch { /* private mode */ }
    this.compiled = compile(this.actions, this.bindings);
    for (const f of this.listeners) f();
  }
  onChange(f: () => void) { this.listeners.add(f); return () => this.listeners.delete(f); }

  /** Bind slot 0 / 1 of an action; whoever else had this input loses it (no double meanings). */
  setBind(id: string, slot: number, b: Bind) {
    for (const a of this.actions) {
      const x = this.bindings[a.id];
      if (x) x.binds = x.binds.filter((y) => !sameBind(y, b));
    }
    const cur = this.bindings[id] ?? (this.bindings[id] = { binds: [], pad: null });
    const binds = cur.binds.slice();
    if (slot < binds.length) binds[slot] = b; else binds.push(b);
    cur.binds = binds.slice(0, 2);
    this.save();
  }
  clearBind(id: string, slot: number) { const cur = this.bindings[id]; if (!cur) return; cur.binds = cur.binds.filter((_, i) => i !== slot); this.save(); }
  setPad(id: string, i: number) {
    for (const a of this.actions) if (this.bindings[a.id]?.pad === i) this.bindings[a.id].pad = null;
    (this.bindings[id] ?? (this.bindings[id] = { binds: [], pad: null })).pad = i;
    this.save();
  }
  clearPad(id: string) { if (this.bindings[id]) { this.bindings[id].pad = null; this.save(); } }
  reset(id?: string) {
    const d = defaultBindings(this.actions);
    if (id) this.bindings[id] = d[id]; else this.bindings = d;
    this.save();
  }

  /** Start remapping: capture-phase listeners, side-button navigation blocked, gamepads permuted. */
  install() {
    if (this.installed) return;
    this.installed = true;
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      if (this.capturing) {
        if (e.type !== 'keydown' || e.repeat) { e.stopImmediatePropagation(); e.preventDefault(); return; }
        e.stopImmediatePropagation(); e.preventDefault();
        const cb = this.capturing; this.capturing = null;
        cb(e.code === 'Escape' ? 'cancel' : e.code === 'Backspace' || e.code === 'Delete' ? 'clear' : { t: 'key', code: e.code });
        return;
      }
      this.route(e, { t: 'key', code: e.code }, e.type === 'keydown');
    };
    const onMouse = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (e.button >= 3) e.preventDefault(); // side buttons never navigate the page back / forward
      if (this.capturing) {
        if (e.type === 'mousedown') {
          // the click that opened the capture shouldn't bind itself: ignore presses on the capture button
          if ((e.target as HTMLElement | null)?.closest?.('[data-capture-ignore]')) return;
          e.stopImmediatePropagation(); e.preventDefault();
          const cb = this.capturing; this.capturing = null; cb({ t: 'mouse', b: e.button });
        } else { e.stopImmediatePropagation(); }
        return;
      }
      this.route(e, { t: 'mouse', b: e.button }, e.type === 'mousedown');
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('mouseup', onMouse, true);
    window.addEventListener('mousemove', (e) => { this.lastX = e.clientX; this.lastY = e.clientY; }, true);
    // the browser's back / forward on side buttons fires on auxclick / mouseup; block it
    window.addEventListener('auxclick', (e) => { if (e.button >= 3) e.preventDefault(); }, true);
    // gamepads: the game sees buttons in the player's arrangement
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      this.realGetGamepads = navigator.getGamepads.bind(navigator);
      const self = this;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => self.gamepads() });
    }
  }

  /** The real (unpermuted) pads, for the capture UI. */
  rawGamepads() { return this.realGetGamepads ? this.realGetGamepads() : (navigator.getGamepads?.() ?? []); }

  private gamepads(): (Gamepad | null)[] {
    const pads = this.rawGamepads();
    // capture a controller button for the UI (edge-triggered on the raw pad)
    if (this.capturingPad) {
      const p = pads[0];
      if (p) {
        const now = p.buttons.map((b) => b.pressed || b.value > 0.5);
        const i = now.findIndex((v, k) => v && !this.padPrev[k]);
        this.padPrev = now;
        if (i >= 0) { const cb = this.capturingPad; this.capturingPad = null; cb(i === 9 ? 'cancel' : i); }
      }
      return pads.map(() => null); // the game ignores the pad while a button is being chosen
    }
    if (!this.compiled.pad.size) return [...pads];
    return pads.map((p) => {
      if (!p) return p;
      const buttons = p.buttons.slice();
      for (const [canon, phys] of this.compiled.pad) {
        if (canon >= buttons.length) continue;
        buttons[canon] = phys >= 0 && phys < p.buttons.length ? p.buttons[phys] : ({ pressed: false, touched: false, value: 0 } as GamepadButton);
      }
      return { id: p.id, index: p.index, connected: p.connected, mapping: p.mapping, timestamp: p.timestamp, axes: p.axes, buttons, vibrationActuator: (p as Gamepad & { vibrationActuator?: unknown }).vibrationActuator } as unknown as Gamepad;
    });
  }

  /** Watch for the next controller button (the UI polls getGamepads each frame anyway; this keeps it ticking). */
  capturePad(cb: (i: number | 'cancel') => void) {
    const p = this.rawGamepads()[0];
    this.padPrev = p ? p.buttons.map((b) => b.pressed || b.value > 0.5) : [];
    this.capturingPad = cb;
    const tick = () => { if (!this.capturingPad) return; this.gamepads(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  /** Physical inputs currently held down as a remapped input, so their release always goes through (even if the
   *  game paused in between) and nothing stays stuck down. */
  private held = new Map<string, Bind>();
  private route(e: Event, phys: Bind, down: boolean) {
    const k = bindKey(phys);
    if (!down && this.held.has(k)) { const to = this.held.get(k)!; this.held.delete(k); e.stopImmediatePropagation(); e.preventDefault(); this.dispatch(to, false); return; }
    if (!this.active()) return;
    const to = this.compiled.map.get(k);
    if (to) {
      e.stopImmediatePropagation(); e.preventDefault();
      if ((e as KeyboardEvent).repeat) return;
      if (down) this.held.set(k, to);
      this.dispatch(to, down);
      return;
    }
    if (this.compiled.swallow.has(k)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }

  private dispatch(b: Bind, down: boolean) {
    if (b.t === 'key') {
      const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { code: b.code, key: KEY_FOR_CODE(b.code), bubbles: true, cancelable: true });
      (document.activeElement ?? document.body ?? document).dispatchEvent(ev);
    } else {
      const target = this.mouseTarget() ?? document.body;
      const init: MouseEventInit = { button: b.b, buttons: down ? 1 << [0, 2, 1, 3, 4][b.b] : 0, clientX: this.lastX, clientY: this.lastY, bubbles: true, cancelable: true };
      target.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', init));
    }
  }
}
