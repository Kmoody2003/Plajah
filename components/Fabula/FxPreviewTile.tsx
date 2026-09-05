// FxPreviewTile — a live, animated thumbnail of one FX effect/preset, rendered
// by the shared fxPreview engine. Replaces the static gradient chips on the FX
// page so a preset shows what it actually does to a moving reference frame.
import React, { useEffect, useRef } from 'react';
import { fxPreview } from '../plajahPixels/engine/fx/fxPreview';
import type { FxEffect, FxPreset } from '../plajahPixels/engine/fx/effects';

// Resolve a preset (or an effect's defaults) into the P0..Pn array FxRenderer wants.
export function paramsFor(effect: FxEffect, preset?: FxPreset | null): number[] {
  return effect.params.map((p) => (preset?.params?.[p.key] ?? p.default));
}

const FALLBACK = 'radial-gradient(circle at 36% 32%, rgba(255,190,112,.82), rgba(93,54,132,.46) 42%, #0a0a12 78%)';

export const FxPreviewTile: React.FC<{ effect: FxEffect; preset?: FxPreset | null; className?: string; height?: number }> = ({ effect, preset, className, height = 44 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = `${effect.id}|${preset?.id || ''}`;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    if (!fxPreview.available()) return; // leave the CSS fallback showing
    canvas.width = 192; canvas.height = 108;
    const tile = { canvas, effectId: effect.id, params: paramsFor(effect, preset), visible: false };
    fxPreview.register(tile);
    const io = new IntersectionObserver((es) => { for (const e of es) fxPreview.setVisible(tile, e.isIntersecting); }, { rootMargin: '160px' });
    io.observe(canvas);
    return () => { io.disconnect(); fxPreview.unregister(tile); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <canvas ref={ref} className={className}
      style={{ height, width: '100%', display: 'block', borderRadius: 5, objectFit: 'cover', background: FALLBACK }}
      aria-label={`${effect.name}${preset ? ' · ' + preset.name : ''} preview`} />
  );
};

export default FxPreviewTile;
