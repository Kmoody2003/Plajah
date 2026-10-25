import React, { useLayoutEffect, useRef } from 'react';

/**
 * Shrinks its content just enough that the WHOLE page sits inside the reader without scrolling.
 * The host (the parent element) keeps overflow-y-auto, so once the reader zooms in themselves —
 * or the floor below is hit — the page scrolls like before. Compares on-screen rects, so it is
 * independent of ancestor transforms and CSS-zoom quirks in offsetHeight.
 */
const FLOOR = 0.58;

const FitToPage: React.FC<{ enabled: boolean; refit: unknown; children: React.ReactNode }> = ({ enabled, refit, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The nearest scroll container is the room the page has to fit in.
    let host: HTMLElement | null = el.parentElement;
    while (host && !/(auto|scroll)/.test(getComputedStyle(host).overflowY)) host = host.parentElement;
    if (!host) return;
    const hostEl = host;
    const fit = () => {
      if (!enabled) { el.style.zoom = ''; return; }
      const room = hostEl.getBoundingClientRect().height - 2;
      if (room <= 40) return;
      const heightAt = (z: number) => { el.style.zoom = String(z); return el.getBoundingClientRect().height; };
      if (heightAt(1) <= room) { el.style.zoom = ''; return; }
      let lo = FLOOR, hi = 1;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (heightAt(mid) <= room) lo = mid; else hi = mid;
      }
      el.style.zoom = String(heightAt(lo) <= room ? lo : FLOOR);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(hostEl);
    // Fonts / images finishing late change the page height.
    const t = window.setTimeout(fit, 400);
    return () => { ro.disconnect(); window.clearTimeout(t); };
  }, [enabled, refit]);

  return <div ref={ref}>{children}</div>;
};

export default FitToPage;
