// LowerThirdMonitor — draws a title clip's motion lower third over Fabula's
// program monitor using the SAME canvas renderer the export uses, so what you
// see is what renders. Drag to re-anchor (writes clip.tx/ty in % of frame).
import React, { useEffect, useRef } from 'react';
import { applyGraphicRef, evaluateLowerThird, type LTGraphicRef } from '../../services/fabula/lowerThirds';
import { findLowerThird } from '../../services/fabula/lowerThirdRegistry';
import { drawLowerThird } from '../plajahPixels/engine/core/lowerThirdLayer';
import { ensureFontsLoaded } from '../../services/tela/telaFonts';
import { materialShaderSource } from '../plajahPixels/engine/presets/materialShaders';
import ShaderLayer from '../plajahPixels/components/ShaderLayer';
import { masterAnalyser } from '../../services/fabula/audioGraph';

export interface LTClipLike { id: string; text?: string; subtitle?: string; tag?: string; start: number; duration: number; tx?: number; ty?: number; tGraphic?: LTGraphicRef }

export const LowerThirdMonitor: React.FC<{
  clip: LTClipLike; playhead: number; selected: boolean;
  onSelect: () => void;
  onMove: (tx: number, ty: number, commit: boolean) => void;
}> = ({ clip, playhead, selected, onSelect, onMove }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spec = clip.tGraphic ? findLowerThird(clip.tGraphic.specId) : undefined;
  const resolvedSpec = spec ? applyGraphicRef(spec, clip.tGraphic) : undefined;
  const fusion = resolvedSpec?.shaderFusion;
  const fusionSource = fusion ? materialShaderSource(fusion.shaderId) : undefined;

  // Load the template's fonts once; redraw when they arrive.
  useEffect(() => {
    if (!resolvedSpec) return;
    const keys = [resolvedSpec.title.font, resolvedSpec.subtitle.font, resolvedSpec.tag?.font].filter(Boolean) as string[];
    ensureFontsLoaded(keys);
    let alive = true;
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) (document as any).fonts.ready.then(() => { if (alive) draw(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSpec?.id]);

  const draw = () => {
    const c = canvasRef.current; if (!c || !resolvedSpec) return;
    const host = c.parentElement; if (!host) return;
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(rect.width * dpr)), H = Math.max(2, Math.round(rect.height * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const origin = clip.tx != null && clip.ty != null ? { x: clip.tx, y: clip.ty } : undefined;
    const r = evaluateLowerThird(resolvedSpec, playhead - clip.start, clip.duration, { title: clip.text || '', subtitle: clip.subtitle, tag: clip.tag }, origin);
    drawLowerThird(ctx, r, W, H);
    if (selected) {
      // Anchor handle only — the graphic itself is the selection outline.
      ctx.save(); ctx.strokeStyle = 'rgba(255,140,0,.9)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.arc(r.origin.x * W / 1920, r.origin.y * H / 1080, 9 * dpr, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  };
  useEffect(draw); // every render — cheap, and keeps the monitor in lockstep with the playhead

  const drag = (e: React.MouseEvent) => {
    if (!selected) { onSelect(); return; }
    e.preventDefault(); e.stopPropagation();
    const host = canvasRef.current?.parentElement; if (!host) return;
    const start = host.getBoundingClientRect();
    const ox = clip.tx ?? resolvedSpec?.origin.x ?? 6, oy = clip.ty ?? resolvedSpec?.origin.y ?? 80;
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: MouseEvent) => onMove(Math.max(0, Math.min(100, ox + (ev.clientX - sx) / start.width * 100)), Math.max(0, Math.min(100, oy + (ev.clientY - sy) / start.height * 100)), false);
    const up = (ev: MouseEvent) => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); onMove(Math.max(0, Math.min(100, ox + (ev.clientX - sx) / start.width * 100)), Math.max(0, Math.min(100, oy + (ev.clientY - sy) / start.height * 100)), true); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  if (!resolvedSpec) return null;
  return <>
    {fusion && fusionSource && <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none', overflow: 'hidden', mixBlendMode: fusion.blend as any, opacity: fusion.opacity }}>
      <ShaderLayer analyser={masterAnalyser()} source={fusionSource} startTimeMs={0} timeSeconds={Math.max(0, playhead - clip.start)} params={fusion.params} fpsCap={45} renderScale={.75} />
    </div>}
    <canvas ref={canvasRef} onMouseDown={drag} title={selected ? 'Drag to re-anchor the motion graphic' : 'Click to select this motion graphic'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 61, cursor: selected ? 'move' : 'pointer', pointerEvents: 'auto' }} />
  </>;
};

export default LowerThirdMonitor;
