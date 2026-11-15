import { useEffect, useState } from 'react';

/**
 * How many CSS px of the layout viewport the on-screen keyboard currently covers (0 when it's closed).
 *
 * iOS Safari and Chrome ≥108 on Android both "resize the visual viewport" when the keyboard opens: the layout
 * viewport stays full height, so a `position: fixed; bottom: 0` composer ends up hidden behind the keyboard and the
 * browser scrolls the page to the input instead — the big empty gap people see. Pinning the composer at
 * `bottom: inset` (or translating it up by it) keeps it flush on top of the keyboard on every phone, tablet and
 * foldable posture. Also follows the keyboard while it animates and when the page auto-scrolls (offsetTop).
 */
export function useKeyboardInset(active = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active || typeof window === 'undefined') { setInset(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const covered = window.innerHeight - (vv.height + vv.offsetTop);
        // Ignore sub-keyboard noise (URL bar collapse ≈ 50–80px is real space too, so keep anything > 0 but round).
        setInset(covered > 1 ? Math.round(covered) : 0);
      });
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [active]);
  return inset;
}

/** True on touch-first devices (phones, tablets, foldables) — where the docked composer is used. */
export function isTouchFirst(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
}
