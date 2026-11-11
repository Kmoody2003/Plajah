// Rebindable controls for Era Clash 3D. Every action takes up to three inputs: keyboard keys (KeyboardEvent.code)
// or mouse buttons ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right, 'Mouse3' back side button, 'Mouse4' forward
// side button). Saved per browser. The editor is a panel opened from the pause menu (Esc) or the ⚙ button.
// Movement stays on WASD / arrows (the controller reads those keys itself).

export type Action = 'punch' | 'kick' | 'blade' | 'block' | 'roll' | 'jump' | 'super' | 'grab' | 'stanceHigh' | 'stanceMid' | 'stanceLow';
export const ACTIONS: { id: Action; label: string; hold?: boolean }[] = [
  { id: 'punch', label: 'Punch' },
  { id: 'kick', label: 'Kick' },
  { id: 'blade', label: 'Katana' },
  { id: 'block', label: 'Block (hold)', hold: true },
  { id: 'roll', label: 'Roll' },
  { id: 'jump', label: 'Jump' },
  { id: 'super', label: 'Super' },
  { id: 'grab', label: 'Grab / throw' },
  { id: 'stanceHigh', label: 'Stance: high (jōdan)' },
  { id: 'stanceMid', label: 'Stance: middle (chūdan)' },
  { id: 'stanceLow', label: 'Stance: low (gedan)' },
];
export const DEFAULT_BINDS: Record<Action, string[]> = {
  punch: ['Mouse0', 'Mouse3', 'KeyJ'],
  kick: ['Mouse2', 'Mouse4', 'KeyK'],
  blade: ['Mouse1', 'KeyE', 'KeyL'],
  block: ['KeyQ'],
  roll: ['KeyC'],
  jump: ['Space'],
  super: ['KeyF'],
  grab: ['KeyG'],
  stanceHigh: ['Digit1'],
  stanceMid: ['Digit2'],
  stanceLow: ['Digit3'],
};
const KEY = 'eraclash3d.binds.v1';

export function loadBinds(): Record<Action, string[]> {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Record<Action, string[]>> | null;
    if (s) return Object.fromEntries(ACTIONS.map((a) => [a.id, Array.isArray(s[a.id]) ? s[a.id]!.slice(0, 3) : [...DEFAULT_BINDS[a.id]]])) as Record<Action, string[]>;
  } catch { /* storage blocked */ }
  return structuredClone(DEFAULT_BINDS);
}
export function saveBinds(b: Record<Action, string[]>) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* */ } }

/** A readable name for an input code. */
export function inputName(code: string) {
  const mouse: Record<string, string> = { Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse back', Mouse4: 'Mouse forward' };
  if (mouse[code]) return mouse[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return ({ Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`', Enter: 'Enter' } as Record<string, string>)[code] ?? code;
}

/** Live bindings: look up which actions an input triggers. */
export class Binds {
  map: Record<Action, string[]> = loadBinds();
  actionsFor(code: string): Action[] { return ACTIONS.filter((a) => this.map[a.id].includes(code)).map((a) => a.id); }
  set(a: Action, list: string[]) { this.map[a] = list.slice(0, 3); saveBinds(this.map); }
  reset() { this.map = structuredClone(DEFAULT_BINDS); saveBinds(this.map); }
  /** One line for the on-screen hint. */
  hint() {
    const f = (a: Action) => this.map[a].map(inputName).join(' / ') || '—';
    return `WASD move · Shift run · <b>${f('punch')}</b> punch · <b>${f('kick')}</b> kick · <b>${f('blade')}</b> katana · <b>${f('block')}</b> block · <b>${f('roll')}</b> roll · <b>${f('stanceHigh')} ${f('stanceMid')} ${f('stanceLow')}</b> stance · <b>${f('super')}</b> super · <b>Esc</b> pause / controls`;
  }
}

/** The editor panel: one row per action, its inputs as chips (click × to drop one), "+ Add" listens for the next input. */
export function openBindEditor(host: HTMLElement, binds: Binds, onChange: () => void) {
  let listening: { a: Action; btn: HTMLButtonElement } | null = null;
  const render = () => {
    host.innerHTML = `<div class="bd-panel"><div class="cz bd-h">CONTROLS</div><div class="bd-rows">${ACTIONS.map((a) => `
      <div class="bd-row"><span>${a.label}</span><div class="bd-chips">${binds.map[a.id].map((c, i) => `<button class="bd-chip" data-a="${a.id}" data-i="${i}" title="Remove">${inputName(c)} ×</button>`).join('')}
      ${binds.map[a.id].length < 3 ? `<button class="bd-add" data-a="${a.id}">+ Add</button>` : ''}</div></div>`).join('')}</div>
      <div class="bd-foot"><button class="btn" id="bdReset">Reset to defaults</button><button class="btn primary" id="bdDone">Done</button></div>
      <div class="bd-tip">Click “+ Add”, then press a key or a mouse button (side buttons work). Esc cancels.</div></div>`;
    host.querySelectorAll<HTMLButtonElement>('.bd-chip').forEach((b) => b.onclick = () => {
      const a = b.dataset.a as Action; const l = [...binds.map[a]]; l.splice(Number(b.dataset.i), 1); binds.set(a, l); onChange(); render();
    });
    host.querySelectorAll<HTMLButtonElement>('.bd-add').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      listening = { a: b.dataset.a as Action, btn: b }; b.textContent = 'Press…'; b.classList.add('on');
    });
    (host.querySelector('#bdReset') as HTMLButtonElement).onclick = () => { binds.reset(); onChange(); render(); };
    (host.querySelector('#bdDone') as HTMLButtonElement).onclick = () => close();
  };
  const take = (code: string) => {
    if (!listening) return false;
    const a = listening.a; listening = null;
    if (code !== 'Escape') {
      // an input does one job: take it off any other action first
      for (const o of ACTIONS) if (o.id !== a && binds.map[o.id].includes(code)) binds.set(o.id, binds.map[o.id].filter((c) => c !== code));
      if (!binds.map[a].includes(code)) binds.set(a, [...binds.map[a], code]);
      onChange();
    }
    render();
    return true;
  };
  const onKey = (e: KeyboardEvent) => { if (take(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const onMouse = (e: MouseEvent) => { if (listening && !(e.target as HTMLElement).closest('.bd-add')) { e.preventDefault(); e.stopImmediatePropagation(); take(`Mouse${e.button}`); } };
  const noMenu = (e: Event) => { if (listening) e.preventDefault(); };
  addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true); addEventListener('contextmenu', noMenu, true);
  const close = () => {
    removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true); removeEventListener('contextmenu', noMenu, true);
    host.classList.remove('on'); host.innerHTML = '';
  };
  host.classList.add('on');
  render();
  return { close, get listening() { return !!listening; } };
}
