// FxPreviewTile — live, animated thumbnails for the FX page, rendered by the
// shared fxPreview engine. Replaces the static gradient chips so a preset shows
// what it actually does. Three variants: effect, generator, transition.
import React, { useEffect, useRef } from 'react';
import { fxPreview, type FxPreviewTileRef } from '../plajahPixels/engine/fx/fxPreview';
import type { FxEffect, FxPreset } from '../plajahPixels/engine/fx/effects';

export function paramsFor(effect: FxEffect, preset?: FxPreset | null): number[] {
  return effect.params.map((p) => (preset?.params?.[p.key] ?? p.default));
}

const FALLBACK = 'radial-gradient(circle at 36% 32%, rgba(255,190,112,.82), rgba(93,54,132,.46) 42%, #0a0a12 78%)';

// Shared mount logic: register a tile spec with the engine while on screen.
function usePreviewTile(spec: () => Omit<FxPreviewTileRef, 'canvas' | 'visible'>, deps: unknown[], height: number) {
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

const tileStyle = (height: number, bg = FALLBACK): React.CSSProperties => ({ height, width: '100%', display: 'block', borderRadius: 5, objectFit: 'cover', background: bg });

export const FxPreviewTile: React.FC<{ effect: FxEffect; preset?: FxPreset | null; className?: string; height?: number }> = ({ effect, preset, className, height = 44 }) => {
  const ref = usePreviewTile(() => ({ kind: 'fx', effectId: effect.id, params: paramsFor(effect, preset) }), [effect.id, preset?.id], height);
  return <canvas ref={ref} className={className} style={tileStyle(height)} aria-label={`${effect.name}${preset ? ' · ' + preset.name : ''} preview`} />;
};

export const GenPreviewTile: React.FC<{ mode: string; colors?: number[][]; params?: number[]; className?: string; height?: number }> = ({ mode, colors, params, className, height = 44 }) => {
  const ref = usePreviewTile(() => ({ kind: 'gen', mode, colors, params }), [mode], height);
  return <canvas ref={ref} className={className} style={tileStyle(height, 'radial-gradient(circle at 30% 30%, #2a1b4e, #0a0a12 75%)')} aria-label={`${mode} generator preview`} />;
};

export const TransPreviewTile: React.FC<{ transId: string; transParams?: Record<string, number>; className?: string; height?: number }> = ({ transId, transParams, className, height = 44 }) => {
  const ref = usePreviewTile(() => ({ kind: 'trans', transId, transParams }), [transId, JSON.stringify(transParams || {})], height);
  return <canvas ref={ref} className={className} style={tileStyle(height, 'linear-gradient(120deg,#24174b 0 46%,#ff8c42 54% 100%)')} aria-label={`${transId} transition preview`} />;
};

export default FxPreviewTile;
