import { useEffect, useState } from 'react';

/**
 * Who owns the remote right now: the app shell (the tab bar) or the screen below it.
 *
 * A `data-tv-capture` screen listens on window in the capture phase and calls
 * stopImmediatePropagation, which is what makes its navigation deterministic. The cost is that
 * the shell's tab bar becomes unreachable — and worse, if the shell ALSO listens, both handlers
 * see the same press and one keystroke moves two things.
 *
 * Threading a `focused` prop down through every screen would work, but it has to be repeated
 * correctly for every capture screen that ever gets built, and forgetting it fails silently as a
 * double-handled key. A single store instead: the shell claims focus, every grid reads the same
 * flag and goes inert. New screens get it by using useTvGrid, without knowing this exists.
 */

let shellHasFocus = false;
const listeners = new Set<(v: boolean) => void>();

export const isShellFocused = () => shellHasFocus;

export function setShellFocus(v: boolean) {
  if (shellHasFocus === v) return;
  shellHasFocus = v;
  listeners.forEach(fn => fn(v));
}

export function subscribeShellFocus(fn: (v: boolean) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** React binding for the shell side (the tab bar). */
export function useTvShellFocus(): boolean {
  const [v, setV] = useState(shellHasFocus);
  useEffect(() => subscribeShellFocus(setV), []);
  return v;
}
