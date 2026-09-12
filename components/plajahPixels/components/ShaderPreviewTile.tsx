// ShaderPreviewTile — live, animated thumbnails for the Plajah Pixels library,
// rendered by the shared preview engine (engine/fx/fxPreview) so many tiles share
// ONE WebGL2 context instead of hitting the browser's live-context ceiling.
// Two variants: a generative shader, and a built-in generator mode.
import React, { useEffect, useRef } from 'react';
import { fxPreview, type FxPreviewTileRef } from '../engine/fx/fxPreview';
import { hasGenerator } from '../engine/core/generators';

function usePreviewTile(spec: () => Omit<FxPreviewTileRef, 'canvas' | 'visible'>, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !fxPreview.available()) return;
    canvas.width = 192; canvas.height = 108;
    const tile: FxPreviewTileRef = { canvas, visible: false, ...spec() };
    fxPreview.register(tile);
    const io = new IntersectionObserver((es) => { for (const e of es) fxPreview.setVisible(tile, e.isIntersecting); }, { rootMargin: '160px' });
    io.observe(canvas);
    return () => { io.disconnect(); fxPreview.unregister(tile); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', objectFit: 'cover' };

export const ShaderPreviewTile: React.FC<{ id: string; src: string; params?: number[]; className?: string; style?: React.CSSProperties }> = ({ id, src, params, className, style }) => {
  const ref = usePreviewTile(() => ({ kind: 'shader', effectId: id, shaderSrc: src, params: params || [] }), [id, src]);
  return <canvas ref={ref} className={className} style={{ ...fill, ...style }} aria-label={`${id} preview`} />;
};

/** A generator tile — renders live when the mode has a GLSL implementation,
 *  otherwise a hue swatch (the classic Canvas2D-only modes). */
export const GeneratorPreviewTile: React.FC<{ mode: string; hue?: number; colors?: number[][]; className?: string; style?: React.CSSProperties }> = ({ mode, hue = 270, colors, className, style }) => {
  const live = hasGenerator(mode);
  const ref = usePreviewTile(() => ({ kind: 'gen', mode, colors }), [mode]);
  if (!live) return <div className={className} style={{ ...fill, background: `radial-gradient(90% 80% at 40% 40%, hsl(${hue} 70% 45% / 0.7), transparent 62%), #100c18`, ...style }} aria-label={`${mode} preview`} />;
  return <canvas ref={ref} className={className} style={{ ...fill, ...style }} aria-label={`${mode} preview`} />;
};

export default ShaderPreviewTile;
