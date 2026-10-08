import React, { useLayoutEffect, useRef } from 'react';
import { RAIL_GUTTER } from './tvFocusRing';

/**
 * The one horizontal rail every grid-driven TV screen renders (Chora, Reello, Taleo, Search).
 *
 * Built for a Mali-G31 / 2GB panel where a D-pad press must feel instant:
 *
 *  · WINDOWED. Only cards within ±WINDOW of the anchor (the focused column, or the column this
 *    rail was last left at) are mounted; leading/trailing spacers keep the scroll width exact, so
 *    a rail of 600 albums costs the same as a rail of 25.
 *  · CHEAP SCROLL. The rail is scrolled by writing scrollLeft from offsetLeft — no
 *    getBoundingClientRect, no scrollIntoView walking every scrollable ancestor — and smoothly only
 *    when the viewer is NOT holding a direction (a key-repeat burst snaps, so focus never lags the
 *    remote).
 *  · MEMOIZED. A focus move re-renders only rails whose `focusedCol` changed (the one being left
 *    and the one being entered). Callers must pass stable `renderItem` (useCallback) for this.
 *  · OFFSCREEN-SKIPPED. Each rail section is `content-visibility: auto`, so rails below the fold
 *    are neither laid out nor painted until they approach the viewport. The section is padded by
 *    the ring bleed (and pulled back with an equal negative margin) because content-visibility
 *    implies paint containment — without the padding it would crop the focus halo.
 */

export const RAIL_WINDOW = 12;

/** Last time any rail/row moved focus — used to detect a held direction key (repeat burst). */
let lastMoveAt = -1e9;
let lastResult: ScrollBehavior = 'smooth';
/**
 * 'smooth' for a deliberate single press, 'auto' (instant) inside a key-repeat burst. Calls within
 * the same frame (a vertical move scrolls both the page and the entered rail) share one answer.
 */
export function scrollBehaviorForMove(): ScrollBehavior {
  const now = performance.now();
  const dt = now - lastMoveAt;
  if (dt < 25) return lastResult;
  lastMoveAt = now;
  lastResult = dt < 220 ? 'auto' : 'smooth';
  return lastResult;
}

/**
 * Bring a rail section into vertical view inside its scrolling <main>, only when it is near an
 * edge. Uses offsetTop arithmetic against the scroller rather than scrollIntoView.
 */
export function scrollRowIntoView(scroller: HTMLElement | null, el: HTMLElement | null, behavior: ScrollBehavior) {
  if (!scroller || !el) return;
  // offsetTop relative to the scroller: walk offsetParents until we reach it (usually 1-2 hops).
  let top = 0;
  let n: HTMLElement | null = el;
  while (n && n !== scroller) { top += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  if (n !== scroller) { el.scrollIntoView({ block: 'nearest', behavior }); return; }
  const h = el.offsetHeight;
  const viewTop = scroller.scrollTop;
  const viewH = scroller.clientHeight;
  const pad = Math.min(120, viewH * 0.15);
  let target: number | null = null;
  if (top - pad < viewTop) target = top - pad;
  else if (top + h + pad > viewTop + viewH) target = top + h + pad - viewH;
  if (target == null) return;
  scroller.scrollTo({ top: Math.max(0, target), behavior });
}

interface Props<T> {
  id: string;
  title: string;
  /** Module-level (stable) heading renderer; defaults to a plain uppercase label. */
  heading?: (title: string) => React.ReactNode;
  items: readonly T[];
  /** Focused column in this rail, or -1 when focus is elsewhere. */
  focusedCol: number;
  /**
   * Render one card. MUST be referentially stable (useCallback at the view, not per rail) for
   * memoization to hold. `variant` is passed through untouched (e.g. Chora's large first rail).
   */
  renderItem: (item: T, index: number, focused: boolean, variant?: string) => React.ReactNode;
  variant?: string;
  /** Estimated card width + gap in CSS px, used until the real stride has been measured. */
  estimateStride: number;
  /** Gap between cards (tailwind class). */
  gapClass?: string;
  /** Estimated section height for content-visibility's intrinsic size. */
  estimateHeight?: number;
  /** Extra class on the <section>. */
  className?: string;
}

const BLEED = 16;   // ≥ RING_BLEED (13) — see tvFocusRing.ts

function TvWindowedRailImpl<T>({
  id, title, items, focusedCol, renderItem, variant, estimateStride, gapClass = 'gap-4', estimateHeight = 300, className, heading = defaultHeading,
}: Props<T>) {
  const count = items.length;
  const anchorRef = useRef(0);
  if (focusedCol >= 0) anchorRef.current = focusedCol;
  const anchor = Math.min(anchorRef.current, Math.max(0, count - 1));

  const start = Math.max(0, anchor - RAIL_WINDOW);
  const end = Math.min(count, anchor + RAIL_WINDOW + 1);

  const railRef = useRef<HTMLDivElement>(null);
  const strideRef = useRef(estimateStride);
  const firstRef = useRef<HTMLDivElement>(null);

  // Measure the real stride once two cards exist (card width + gap), so spacers are exact.
  useLayoutEffect(() => {
    const first = firstRef.current;
    const next = first?.nextElementSibling as HTMLElement | null;
    if (first && next && next.dataset.tvCard) {
      const s = next.offsetLeft - first.offsetLeft;
      if (s > 0) strideRef.current = s;
    }
  }, [count]);

  // Scroll the rail to keep the focused card centred-ish. Pure offset arithmetic.
  useLayoutEffect(() => {
    if (focusedCol < 0) return;
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>(`[data-tv-col="${focusedCol}"]`);
    if (!card) return;
    const left = card.offsetLeft;
    const w = card.offsetWidth;
    const vw = rail.clientWidth;
    // Only move when the card is outside a comfortable band — a hop inside the band costs nothing.
    const band = Math.max(48, vw * 0.12);
    const cur = rail.scrollLeft;
    if (left - band >= cur && left + w + band <= cur + vw) return;
    const target = Math.max(0, left - (vw - w) / 2);
    rail.scrollTo({ left: target, behavior: scrollBehaviorForMove() });
  }, [focusedCol]);

  const stride = strideRef.current;
  const cells: React.ReactNode[] = [];
  for (let i = start; i < end; i++) {
    cells.push(
      <div key={i} ref={i === start ? firstRef : undefined} data-tv-card="1" data-tv-col={i} className="shrink-0">
        {renderItem(items[i], i, i === focusedCol, variant)}
      </div>,
    );
  }

  return (
    <section
      data-tv-rail={id}
      className={className}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: `auto ${estimateHeight}px`,
        padding: BLEED,
        margin: `-${BLEED}px -${BLEED}px ${32 - BLEED}px`,
      } as React.CSSProperties}
    >
      {heading(title)}
      <div ref={railRef} className={`relative flex ${gapClass} overflow-x-auto no-scrollbar ${RAIL_GUTTER}`}>
        {start > 0 && <div aria-hidden className="shrink-0" style={{ width: Math.max(0, start * stride - parseGap(gapClass)) }} />}
        {cells}
        {end < count && <div aria-hidden className="shrink-0" style={{ width: Math.max(0, (count - end) * stride - parseGap(gapClass)) }} />}
      </div>
    </section>
  );
}

const defaultHeading = (t: string) => (
  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/60 mb-4">{t}</h2>
);

/** Tailwind gap-N → px (N × 4). Spacer width subtracts one gap because flex adds it back. */
function parseGap(cls: string): number {
  const m = /gap-(\d+)/.exec(cls);
  return m ? Number(m[1]) * 4 : 16;
}

const TvWindowedRail = React.memo(TvWindowedRailImpl) as typeof TvWindowedRailImpl;
export default TvWindowedRail;
