import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { menuViewport, placeMenu } from './menuPosition';

/** Shared dropdown surface: measured trigger, body portal, flip/clamp, internal scrolling. */
export default function AnchoredPopover({ anchor, children, onClose, className, align = 'start', role, style }: {
  anchor: HTMLElement; children: React.ReactNode; onClose: () => void; className?: string; align?: 'start' | 'end'; role?: React.AriaRole; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (!anchor.isConnected) { closeRef.current(); return; }
      const v = menuViewport();
      el.style.maxWidth = `${Math.max(0, v.width - 16)}px`;
      el.style.maxHeight = `${Math.max(0, v.height - 16)}px`;
      const r = anchor.getBoundingClientRect();
      if (r.bottom < v.top || r.top > v.top + v.height || r.right < v.left || r.left > v.left + v.width) { closeRef.current(); return; }
      const pos = placeMenu(r, el.offsetWidth, el.offsetHeight, v, 'below', align);
      el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; el.style.visibility = 'visible';
    };
    const outside = (e: PointerEvent) => { if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node)) closeRef.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); anchor.focus({ preventScroll: true }); } };
    const observer = new ResizeObserver(update); observer.observe(el); observer.observe(anchor);
    update();
    document.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update);
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key);
    return () => {
      observer.disconnect(); document.removeEventListener('scroll', update, true); window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update);
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key);
    };
  }, [anchor, align]);
  return createPortal(<div ref={ref} role={role} className={className} data-anchored-popover style={{ ...style, position: 'fixed', visibility: 'hidden', zIndex: 2401, overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box', minWidth: 0, margin: 0 }}>{children}</div>, document.body);
}
