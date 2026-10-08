/**
 * The TV's bottom player bar, as a D-pad destination.
 *
 * The bar is pinned under every screen while music plays, but nothing could FOCUS it: reaching its
 * controls meant pressing Down through every rail on the page. Screens now hand off to it directly:
 *   - Down past a screen's last row (useTvGrid),
 *   - holding Down (useTvGrid: a sustained run of Down presses ends on the bar),
 *   - the remote's Menu key (TVNavigationLayer).
 * Those callers only know "the bar exists and wants focus" — this module is that contract, so they
 * don't import the bar component.
 */

let available = false;

export const FOCUS_PLAYER_BAR_EVENT = 'plajah:focus-player-bar';

/** The bar reports whether it is on screen (music playing, no other transport showing). */
export function setPlayerBarAvailable(v: boolean): void { available = v; }

export const isPlayerBarAvailable = (): boolean => available;

/** Ask the bar to take the remote. Returns false (and does nothing) when there is no bar. */
export function focusPlayerBar(): boolean {
  if (!available) return false;
  window.dispatchEvent(new CustomEvent(FOCUS_PLAYER_BAR_EVENT));
  return true;
}
