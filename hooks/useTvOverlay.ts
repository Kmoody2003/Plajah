import { useEffect } from 'react';

/**
 * Which full-screen TV overlay (if any) owns the remote right now.
 *
 * Every TV navigator listens on `window`, and listeners on the same target and phase fire in
 * REGISTRATION order — so a screen that mounted first (useTvGrid, LiveTvPlus, the tab bar) always
 * sees a key before an overlay opened on top of it, and would move behind the overlay or swallow
 * the press. Capture vs bubble can't fix that ordering, so arbitration is explicit: an open overlay
 * claims the remote here, and every other navigator checks `isTvOverlayOpen()` first and stays
 * deaf while it is true. The overlay itself handles keys normally (and should still
 * stopImmediatePropagation what it consumes).
 *
 * A stack, not a flag: the speaker picker can open over the ambient screen, and closing it must
 * hand the remote back to the ambient screen, not to the page underneath both.
 */

const stack: string[] = [];
const listeners = new Set<(top: string | null) => void>();

const emit = () => { const top = stack[stack.length - 1] ?? null; listeners.forEach(l => l(top)); };

export function pushTvOverlay(id: string): void {
  const at = stack.indexOf(id);
  if (at >= 0) stack.splice(at, 1);
  stack.push(id);
  emit();
}

export function popTvOverlay(id: string): void {
  const at = stack.indexOf(id);
  if (at < 0) return;
  stack.splice(at, 1);
  emit();
}

/** True while any overlay owns the remote. Cheap — safe to call on every keypress. */
export const isTvOverlayOpen = (): boolean => stack.length > 0;

/** Is `id` the overlay currently on top (the one that should act on keys)? */
export const isTopTvOverlay = (id: string): boolean => stack[stack.length - 1] === id;

export function subscribeTvOverlay(fn: (top: string | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Claim the remote while `open` is true. Use in any full-screen TV overlay. */
export function useTvOverlayClaim(id: string, open: boolean): void {
  useEffect(() => {
    if (!open) return;
    pushTvOverlay(id);
    return () => popTvOverlay(id);
  }, [id, open]);
}
