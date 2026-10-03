// telaMotion: the shared motion layer for Tela documents. Anything rendered through Tela's device renderer can be wrapped in
// <TelaReveal> to settle in as it scrolls into view, with its marks drawing in turn (chart lines trace, bars rise, points,
// list rows and captions follow). useTelaPointerGlow adds the soft light that follows a mouse or finger across the page and
// steps aside over media. Both are off when `enabled` is false (the viewer's Motion setting), and both fail visible: if the
// observer never fires, content is shown after a timeout.
import React, { useEffect, useRef } from 'react';

export const TELA_MOTION_CSS = `
.tm{transition:opacity .8s ease,transform .8s cubic-bezier(.2,.7,.2,1)}
.tm.tm-pre{opacity:0;transform:translateY(22px)}
.tm-glow{position:absolute;left:0;top:0;width:360px;height:360px;margin:-180px 0 0 -180px;border-radius:50%;background:radial-gradient(closest-side,var(--tm-glow,#fff),transparent);opacity:0;pointer-events:none;z-index:0;transform:translate3d(var(--px,0px),var(--py,0px),0);transition:opacity .5s ease;will-change:transform,opacity}
.tm-glow.on{opacity:var(--tm-glow-a,.16)}
`;

const EASE = 'cubic-bezier(.2,.7,.2,1)';

/** Plays the entrance on a rendered Tela device. Pure DOM; safe to call on any subtree. */
export function playReveal(el: HTMLElement) {
  el.classList.remove('tm-pre');
  el.querySelectorAll<SVGPathElement>('svg [data-mark="line"], svg path[fill="none"]').forEach((p, i) => {
    if (p.closest('marker') || !p.getTotalLength) return;
    const len = Math.ceil(p.getTotalLength()); if (!len || len > 6000) return;
    p.animate([{ strokeDasharray: `${len}`, strokeDashoffset: len }, { strokeDasharray: `${len}`, strokeDashoffset: 0 }], { duration: 1100, delay: 250 + i * 150, easing: EASE, fill: 'backwards' });
  });
  el.querySelectorAll<SVGElement>('svg [data-mark="bar"], svg rect[fill^="var(--f-a"]').forEach((r, i) => {
    r.style.transformBox = 'fill-box'; r.style.transformOrigin = 'bottom';
    r.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 700, delay: 250 + i * 60, easing: EASE, fill: 'backwards' });
  });
  el.querySelectorAll<SVGElement>('svg circle, svg g > text').forEach((c, i) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 700 + Math.min(i, 12) * 70, easing: EASE, fill: 'backwards' }));
  el.querySelectorAll<HTMLElement>('.ff-timeline li, .fl-list li, figcaption').forEach((n, i) => n.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 200 + i * 110, easing: EASE, fill: 'backwards' }));
}

export const TelaReveal: React.FC<{ enabled: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ enabled, className = '', style, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('tm-pre');
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); playReveal(el); } }, { threshold: 0.2 });
    io.observe(el);
    const safety = window.setTimeout(() => { io.disconnect(); el.classList.remove('tm-pre'); }, 20000);
    return () => { io.disconnect(); window.clearTimeout(safety); el.classList.remove('tm-pre'); };
  }, [enabled]);
  return <div ref={ref} className={`tm ${className}`} style={style}>{children}</div>;
};

/** Soft light that follows the pointer or finger inside `root`; hidden over media and controls. Renders nothing itself. */
export function useTelaPointerGlow(root: React.RefObject<HTMLElement>, dot: React.RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    const r0 = root.current, d = dot.current; if (!r0 || !d || !enabled) return;
    let raf = 0, x = 0, y = 0, over = false;
    const paint = () => { raf = 0; d.style.setProperty('--px', `${x}px`); d.style.setProperty('--py', `${y}px`); d.classList.toggle('on', over); };
    const move = (cx: number, cy: number, t: EventTarget | null) => {
      const r = r0.getBoundingClientRect(); x = cx - r.left; y = cy - r.top;
      over = !(t instanceof Element && t.closest('figure,img,video,iframe,audio,svg,.folio-controls'));
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const pm = (e: PointerEvent) => move(e.clientX, e.clientY, e.target);
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY, document.elementFromPoint(t.clientX, t.clientY)); };
    const off = () => { over = false; if (!raf) raf = requestAnimationFrame(paint); };
    r0.addEventListener('pointermove', pm, { passive: true }); r0.addEventListener('pointerdown', pm, { passive: true });
    r0.addEventListener('touchstart', tm, { passive: true }); r0.addEventListener('touchmove', tm, { passive: true });
    r0.addEventListener('pointerleave', off); r0.addEventListener('touchend', off); r0.addEventListener('touchcancel', off);
    return () => { if (raf) cancelAnimationFrame(raf); r0.removeEventListener('pointermove', pm); r0.removeEventListener('pointerdown', pm); r0.removeEventListener('touchstart', tm); r0.removeEventListener('touchmove', tm); r0.removeEventListener('pointerleave', off); r0.removeEventListener('touchend', off); r0.removeEventListener('touchcancel', off); };
  }, [root, dot, enabled]);
}
