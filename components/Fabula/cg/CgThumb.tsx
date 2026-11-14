// CgThumb — a library tile for a CG graphic. Renders the resting frame once it
// scrolls into view; on hover it plays the full IN → hold → OUT so the operator
// sees the motion before dragging it anywhere.
import React, { useEffect, useRef, useState } from 'react';
import type { CgGraphic, CgGraphicRef } from '../../../services/fabula/cg/cgTypes';
import { drawCgGraphic, ensureCgFonts } from '../../../services/fabula/cg/cgRender';
import { cgDefaultDuration } from '../../../services/fabula/cg/cgEvaluate';

const GROUND = 'linear-gradient(135deg,#1b2433 0%,#2b2f3a 55%,#14161c 100%)';

export const CgThumb: React.FC<{ graphic: CgGraphic; refOverride?: CgGraphicRef; width?: number; height?: number; autoplay?: boolean; style?: React.CSSProperties }> = ({ graphic, refOverride, width = 320, height = 180, autoplay, style }) => {
  const cv = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);
  const [fontsTick, setFontsTick] = useState(0);

  useEffect(() => {
    const el = cv.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  useEffect(() => { if (!visible) return; let alive = true; ensureCgFonts(graphic).then(() => { if (alive) setFontsTick(n => n + 1); }); return () => { alive = false; }; }, [visible, graphic.id]);

  useEffect(() => {
    const c = cv.current; if (!c || !visible) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    const play = hover || autoplay;
    const D = graphic.live === 'transition' ? graphic.timing.in + graphic.timing.out : Math.min(cgDefaultDuration(graphic), graphic.timing.in + 2.2 + graphic.timing.out);
    const restT = graphic.live === 'transition' ? (graphic.timing.cutPoint ?? graphic.timing.in) * .55 : graphic.timing.in + .6;
    if (!play) { ctx.clearRect(0, 0, c.width, c.height); drawCgGraphic(ctx, graphic, restT, Infinity, c.width, c.height, refOverride, { now: Date.now() }); return; }
    let raf = 0; const t0 = performance.now();
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) % (D + .5);
      ctx.clearRect(0, 0, c.width, c.height);
      drawCgGraphic(ctx, graphic, t, D, c.width, c.height, refOverride, { now: Date.now() });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, hover, autoplay, graphic, refOverride, width, height, fontsTick]);

  return (
    <canvas ref={cv} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: '100%', aspectRatio: '16 / 9', display: 'block', borderRadius: 6, background: GROUND, ...style }} />
  );
};

export default CgThumb;
