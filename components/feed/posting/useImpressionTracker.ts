/**
 * useImpressionTracker — counts post impressions + dwell for the author's insights.
 *
 * Usage in PostCard (attach the returned ref to the card's root element):
 *   const impressionRef = useImpressionTracker({ postId: post.id, authorId: post.authorId, referrer: 'FEED' });
 *   <div ref={impressionRef} ...>
 *
 * Counts when >= 50% of the card has been visible for 800 ms. One impression per
 * viewer per post per day; the author's own views and signed-out views are ignored.
 * Writes are batched (8 s / tab hide) into bounded increments — see postAnalyticsService.
 * `referrer` = where the viewer found it: FEED | PROFILE | SEARCH | HASHTAG | SHARE | OTHER.
 * `enabled=false` makes it a no-op (e.g. embedded previews).
 */
import { useCallback, useEffect, useRef } from 'react';
import { queueImpression, queueDwell } from '../../../services/postAnalyticsService';
import type { StatReferrer } from '../../../services/postingLogic';

export interface ImpressionTrackerOptions {
  postId: string;
  authorId: string;
  referrer?: StatReferrer;
  enabled?: boolean;
}

interface Handlers { enter: () => void; leave: () => void }
const handlers = new WeakMap<Element, Handlers>();
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        const h = handlers.get(e.target);
        if (!h) continue;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) h.enter(); else h.leave();
      }
    }, { threshold: [0, 0.5, 1] });
  }
  return observer;
}

export function useImpressionTracker(opts: ImpressionTrackerOptions): (el: HTMLElement | null) => void {
  const { postId, authorId, referrer = 'FEED', enabled = true } = opts;
  const elRef = useRef<HTMLElement | null>(null);
  const cfg = useRef({ postId, authorId, referrer });
  cfg.current = { postId, authorId, referrer };

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counted = useRef(false);
  const visibleSince = useRef<number | null>(null);

  const stopVisible = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (visibleSince.current !== null && counted.current) {
      queueDwell(cfg.current.postId, cfg.current.authorId, Date.now() - visibleSince.current);
    }
    visibleSince.current = null;
  }, []);

  const detach = useCallback(() => {
    const el = elRef.current;
    if (el) { observer?.unobserve(el); handlers.delete(el); }
    stopVisible();
  }, [stopVisible]);

  const attach = useCallback((el: HTMLElement | null) => {
    detach();
    elRef.current = el;
    counted.current = false;
    if (!el || !enabled) return;
    const obs = getObserver();
    if (!obs) return;
    handlers.set(el, {
      enter: () => {
        if (visibleSince.current !== null) return;
        visibleSince.current = Date.now();
        if (!counted.current) {
          timer.current = setTimeout(() => {
            counted.current = queueImpression(cfg.current.postId, cfg.current.authorId, cfg.current.referrer) || counted.current;
            // Dwell is only meaningful once an impression counted today.
            if (!counted.current) visibleSince.current = null;
          }, 800);
        }
      },
      leave: stopVisible,
    });
    obs.observe(el);
  }, [detach, enabled, stopVisible]);

  // Flush dwell if the card unmounts while visible.
  useEffect(() => detach, [detach]);

  return attach;
}

export default useImpressionTracker;
