// EmoteOverlay — a transparent canvas over the live video that runs an EmoteStage.
// Sleeps (no rAF) whenever nothing is on stage, so an idle stream costs nothing.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { EmoteStage } from '../../services/emotes/emoteStage';
import type { EmoteDef } from '../../services/emotes/emoteTypes';
import type { CrowdLightState } from '../../services/emotes/emoteEngine';

export interface EmoteOverlayHandle {
  spawn: (def: EmoteDef, n?: number, o?: { x?: number }) => void;
  chorus: (def: EmoteDef, tier: 1 | 2 | 3, count: number) => void;
  setCrowdLight: (s: CrowdLightState | null) => void;
  stage: EmoteStage;
}

export interface EmoteOverlayProps {
  className?: string;
  style?: React.CSSProperties;
  /** Called every frame while awake (dt seconds) — lets the parent step its CrowdLight in sync. */
  onFrame?: (dt: number) => void;
  layers?: Partial<EmoteStage['layers']>;
}

export const EmoteOverlay = forwardRef<EmoteOverlayHandle, EmoteOverlayProps>(({ className, style, onFrame, layers }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stage = useMemo(() => new EmoteStage({ px: 96 }), []);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const frameCb = useRef(onFrame); frameCb.current = onFrame;
  if (layers) Object.assign(stage.layers, layers);

  const loop = useCallback((now: number) => {
    const c = canvasRef.current;
    if (!c) { rafRef.current = 0; return; }
    const dt = Math.min(0.05, lastRef.current ? (now - lastRef.current) / 1000 : 1 / 60);
    lastRef.current = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    frameCb.current?.(dt);
    stage.draw(g, w, h, dt);
    if (stage.busy) rafRef.current = requestAnimationFrame(loop);
    else { rafRef.current = 0; lastRef.current = 0; g.clearRect(0, 0, w, h); }
  }, [stage]);

  const wake = useCallback(() => { if (!rafRef.current) rafRef.current = requestAnimationFrame(loop); }, [loop]);
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }, []);

  useImperativeHandle(ref, () => ({
    stage,
    spawn: (def, n, o) => { stage.spawn(def, n, o); wake(); },
    chorus: (def, tier, count) => { stage.chorus(def, tier, count); wake(); },
    setCrowdLight: s => { stage.setCrowdLight(s); if (s && s.intensity > 0.01) wake(); },
  }), [stage, wake]);

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} />;
});
EmoteOverlay.displayName = 'EmoteOverlay';

export default EmoteOverlay;
