// BroadcastGraphicMonitor — draws a broadcast template graphic clip over
// Fabula's program monitor using the SAME renderer the export uses, so the
// preview and the render match. The graphic's entrance/exit is driven by the
// clip's duration: drag the clip handles and the motion retimes.
import React, { useEffect, useRef, useState } from 'react';
import { broadcastStill, ensureBroadcastBase, getBroadcastBase, drawBroadcastGraphic, type BroadcastGraphicRef } from '../plajahPixels/engine/core/broadcastGraphicLayer';
import { evaluateGraphicEnvelope } from '../../services/fabula/graphicMotion';

export interface BGClipLike { id: string; text?: string; subtitle?: string; start: number; duration: number; bGraphic?: BroadcastGraphicRef }

export const BroadcastGraphicMonitor: React.FC<{
  clip: BGClipLike; playhead: number; selected: boolean; onSelect: () => void;
}> = ({ clip, playhead, selected, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  const ref = clip.bGraphic;
  const { svg, key, fontKeys } = ref ? broadcastStill(ref, { title: clip.text, subtitle: clip.subtitle }) : { svg: '', key: '', fontKeys: [] as string[] };

  // Rasterize the held still whenever the identity or text changes; redraw when ready.
  useEffect(() => {
    if (!ref || !svg) return;
    let alive = true;
    ensureBroadcastBase(key, svg, fontKeys).then(() => { if (alive) force(n => n + 1); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const draw = () => {
    const c = canvasRef.current; if (!c || !ref) return;
    const host = c.parentElement; if (!host) return;
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(rect.width * dpr)), H = Math.max(2, Math.round(rect.height * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const img = getBroadcastBase(key); if (!img) return;
    const speed = ref.controls?.motionSpeed ?? 1;
    const env = evaluateGraphicEnvelope(ref.kind, playhead - clip.start, clip.duration, speed);
    drawBroadcastGraphic(ctx, img, ref.kind, env, W, H);
    if (selected) { ctx.save(); ctx.strokeStyle = 'rgba(255,140,0,.9)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeRect(dpr, dpr, W - 2 * dpr, H - 2 * dpr); ctx.restore(); }
  };
  useEffect(draw); // every render — keeps the monitor in lockstep with the playhead

  return <canvas ref={canvasRef} onMouseDown={(e) => { e.stopPropagation(); onSelect(); }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: selected ? 'default' : 'pointer' }} />;
};

export default BroadcastGraphicMonitor;
