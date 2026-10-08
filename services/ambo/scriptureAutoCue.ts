// scriptureAutoCue — "when a scripture goes to Program, cue the next one".
//
// ON by default. The operator can switch it off from the scripture quick bar;
// the choice is remembered on this machine. A tiny external store so the
// presenter (which fires scripture) and the toggle (which lives in the
// Scripture tab and dock) never need a prop between them.

const KEY = 'ambo_auto_cue_next_scripture_v1';

function read(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

let on = read();
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  // Another window (an output, a second operator tab) flipped it.
  window.addEventListener('storage', e => { if (e.key === KEY) { on = read(); listeners.forEach(fn => fn()); } });
}

export const getAutoCueNext = (): boolean => on;

export function setAutoCueNext(next: boolean): void {
  on = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* private mode */ }
  listeners.forEach(fn => { try { fn(); } catch { /* */ } });
}

export function subscribeAutoCueNext(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
