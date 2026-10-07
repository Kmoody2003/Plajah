// AmboSquareThumb — the ONE square-thumbnail primitive for every gallery in Ambo's bottom library dock.
//
// Why this exists: cards used `w-full aspect-square` inside a plain CSS grid in a short
// `overflow-y-auto` dock. Percent-width + aspect-ratio is a cyclic dependency during grid
// row sizing, so rows collapsed to ~2px (just the card border) and `overflow-hidden` clipped
// every picture into a slim sliver. SquareFrame sizes itself with an in-flow padding-bottom:100%
// spacer (resolved against the column width, never cyclic), and squareGridStyle makes the grid
// scroll instead of squash.
import React from 'react';

/** Smallest legible side for a gallery thumbnail, in px. */
export const SQUARE_MIN_PX = 112;
/** Pixel size used when rasterising a square snapshot/thumbnail. */
export const SQUARE_SNAPSHOT_PX = 256;

/** Column width helper (pure, unit-tested): never below SQUARE_MIN_PX. */
export function squareMinPx(requested?: number): number {
  const n = Number.isFinite(requested as number) ? Math.round(requested as number) : SQUARE_MIN_PX;
  return Math.max(SQUARE_MIN_PX, n);
}

/** Style for a gallery grid: square-friendly auto-fill columns, content-height rows, scroll not squash. */
export function squareGridStyle(minPx?: number, gapPx = 10): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${squareMinPx(minPx)}px, 1fr))`,
    gridAutoRows: 'max-content',
    alignContent: 'start',
    alignItems: 'start',
    gap: gapPx,
  };
}

/** Class for the scroll viewport that holds a square grid. */
export const SQUARE_GRID_CLASS = 'flex-1 min-h-0 overflow-y-auto custom-scrollbar';

/** Style for a card (outer cell): never shrinks, never stretches. */
export const squareCardStyle: React.CSSProperties = { minHeight: 0, flex: 'none', alignSelf: 'start', minWidth: 0 };

/**
 * A true square picture area. Children are laid out absolutely over the square
 * (use them for the picture, badges and hover overlays).
 */
export const SquareFrame: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ className = '', style, children }) => (
  <div className={`relative w-full overflow-hidden ${className}`} style={{ ...style, aspectRatio: '1 / 1', flex: 'none', minHeight: 0 }} data-square-frame>
    {/* in-flow spacer: guarantees height == width even when aspect-ratio is ignored in intrinsic row sizing */}
    <div aria-hidden style={{ paddingBottom: '100%', width: 0 }} />
    <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
  </div>
);

export default SquareFrame;
