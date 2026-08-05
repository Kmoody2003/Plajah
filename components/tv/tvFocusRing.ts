// ─── One focus ring for every TV surface ──────────────────────────────────────
//
// Taleo's cards are native focusables, so they pick up the `html.tv-nav :focus`
// ring in index.css: an offset orange outline with a soft halo. Chora and Reello
// drive selection through useTvGrid instead — the grid tracks a row/col, the DOM
// element never takes focus, so that rule never fires and those screens fell back
// to a thin inset line. Same remote, same gesture, visibly weaker feedback.
//
// This restates the index.css ring as inline styles so the grid-driven screens
// match. Keep the two in step: if the ring changes there, change it here.
//
// The halo is drawn OUTSIDE the card, which means the rail that holds these cards
// must leave room for it — see RAIL_GUTTER. An `overflow-x` rail clips both axes,
// so without that padding the ring is cropped exactly when it matters.

export const TV_ACCENT = '#FF8C00';

/** Total space the ring needs outside the card's own box, in pixels. */
export const RING_BLEED = 13;   // 4px outline + 3px offset + 6px halo

/** Tailwind classes for a rail that must not clip the ring. */
export const RAIL_GUTTER = 'px-3 py-3 -mx-3 -my-3';

/**
 * @param focused  This cell is the D-pad selection.
 * @param playing  This item is the one currently playing (a weaker, secondary ring).
 * @param playingColor  Service accent for the playing ring — Chora teal, Reello orange.
 */
export function tvCardRing(focused: boolean, playing = false, playingColor = TV_ACCENT): string {
  if (focused) {
    return [
      `0 0 0 4px ${TV_ACCENT}`,                 // the outline itself
      '0 0 0 7px rgba(0,0,0,0.85)',             // the offset gap, so the ring reads off artwork
      '0 0 0 13px rgba(255,140,0,0.22)',        // halo
      '0 0 28px rgba(255,140,0,0.35)',          // glow
      '0 12px 32px rgba(0,0,0,0.55)',           // lift
    ].join(', ');
  }
  return playing ? `inset 0 0 0 3px ${playingColor}` : 'none';
}
