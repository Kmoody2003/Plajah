// components/Fabula/anima/AnimaStage.tsx — the canvas. Paints from refs every animation frame
// (no React re-render per frame) and turns pointer input into document edits per tool.

import React, { useEffect, useRef } from 'react';
import type { AnimaLayer, AnimaProject, DrawingStroke } from '../../../services/anima/types';
import { AnimaRenderRuntime, renderAnimaFrame } from '../../../services/anima/render';
import { frameToTime, timeToFrame } from '../../../services/anima/evaluator';
import { LiveMotionPuppeteer, type MotionBrushKind } from '../../../services/anima/worldClassEngine';
import { valueAt, type AnimaAction } from '../../../services/anima/document';
import type { FrameStore } from './frameStore';

export type AnimaTool = 'select' | 'draw' | 'puppet' | 'brush';

export interface AnimaStageProps {
  project: AnimaProject;
  frames: FrameStore;
  playing: boolean;
  tool: AnimaTool;
  selectedLayerId: string | null;
  brushKind: MotionBrushKind;
  ink: { color: string; width: number };
  cameraVideo: HTMLVideoElement | null;
  autoKey: boolean;
  dispatch: (action: AnimaAction, coalesceKey?: string) => void;
  setPlaying: (p: boolean) => void;
  onSelectLayer: (id: string | null) => void;
  onNotice: (msg: string) => void;
}

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const AnimaStage: React.FC<AnimaStageProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rtRef = useRef<AnimaRenderRuntime | null>(null);
  if (!rtRef.current && typeof document !== 'undefined') rtRef.current = new AnimaRenderRuntime();
  // Latest props for the paint loop and pointer handlers, without re-subscribing.
  const live = useRef(props);
  live.current = props;
  const gesture = useRef<
    | { kind: 'move'; layerId: string; startX: number; startY: number; baseX: number; baseY: number; key: string }
    | { kind: 'draw'; layerId: string; points: { x: number; y: number }[] }
    | { kind: 'puppet'; layer: AnimaLayer; startSec: number; startWall: number; puppeteer: LiveMotionPuppeteer; path: { x: number; y: number }[] }
    | { kind: 'brush' }
    | null
  >(null);

  // Paint loop: playback clock + rendering.
  useEffect(() => {
    const canvas = canvasRef.current;
    const rt = rtRef.current;
    if (!canvas || !rt) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastPainted = '';
    const paint = (now: number) => {
      const p = live.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (p.playing) {
        acc += dt;
        const step = 1 / p.project.fps;
        if (acc >= step) {
          const n = Math.floor(acc / step);
          acc -= n * step;
          const f = p.frames.get();
          p.frames.set(((f - 1 + n) % p.project.durationFrames) + 1);
        }
      } else acc = 0;
      // Paused and nothing changed: skip the repaint.
      const sig = `${p.frames.get()}|${rt.version}|${p.selectedLayerId}`;
      const busy = p.playing || !!gesture.current || !!p.cameraVideo || p.tool === 'brush';
      if (busy || sig !== lastPainted || (canvas as any).__doc !== p.project) {
        renderAnimaFrame(ctx, p.project, p.frames.get(), rt, { playing: p.playing, dt, now: now / 1000, editor: { selectedLayerId: p.selectedLayerId } });
        const g = gesture.current;
        ctx.save();
        ctx.setTransform(canvas.width / p.project.width, 0, 0, canvas.height / p.project.height, 0, 0);
        if (p.cameraVideo && p.cameraVideo.readyState >= 2) {
          ctx.globalAlpha = 0.55;
          ctx.drawImage(p.cameraVideo, 0, 0, p.project.width, p.project.height);
          ctx.globalAlpha = 1;
        }
        if (g?.kind === 'draw' && g.points.length > 1) {
          ctx.strokeStyle = p.ink.color;
          ctx.lineWidth = p.ink.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          g.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
          ctx.stroke();
        }
        if (g?.kind === 'puppet' && g.path.length > 1) {
          ctx.strokeStyle = '#00DAF3';
          ctx.shadowColor = '#00DAF3';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          g.path.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
          ctx.stroke();
        }
        ctx.restore();
        (canvas as any).__doc = p.project;
        lastPainted = sig;
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    rtRef.current?.prune(props.project);
  }, [props.project]);
  useEffect(() => () => rtRef.current?.dispose(), []);

  const toFrame = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * props.project.width, y: ((e.clientY - r.top) / r.height) * props.project.height };
  };
  const selected = () => props.project.layers.find((l) => l.id === props.selectedLayerId) ?? null;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toFrame(e);
    const layer = selected();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (props.tool === 'brush') {
      gesture.current = { kind: 'brush' };
      rtRef.current?.brush.emitFromBrush(props.brushKind, pt.x, pt.y, 4);
      return;
    }
    if (!layer) {
      props.onNotice('Select a layer first.');
      return;
    }
    if (layer.locked) {
      props.onNotice(`${layer.name} is locked.`);
      return;
    }
    const frame = props.frames.get();
    if (props.tool === 'select') {
      gesture.current = {
        kind: 'move',
        layerId: layer.id,
        startX: pt.x,
        startY: pt.y,
        baseX: valueAt(props.project, layer, 'transform.x', frame),
        baseY: valueAt(props.project, layer, 'transform.y', frame),
        key: newId('move'),
      };
    } else if (props.tool === 'draw') {
      if (layer.type !== 'cel' && layer.type !== 'stop_motion') {
        props.onNotice('Drawing goes on a drawing layer. Add one from the Layers panel.');
        return;
      }
      gesture.current = { kind: 'draw', layerId: layer.id, points: [pt] };
    } else if (props.tool === 'puppet') {
      const puppeteer = new LiveMotionPuppeteer({ fps: props.project.fps, stepRate: 2, inertia: 0.45, enableSquashStretch: true });
      const startSec = frameToTime(frame, props.project.fps);
      puppeteer.startRecording(pt.x, pt.y, 0);
      gesture.current = { kind: 'puppet', layer, startSec, startWall: performance.now(), puppeteer, path: [pt] };
      props.setPlaying(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g) return;
    const pt = toFrame(e);
    if (g.kind === 'brush') {
      if (e.buttons === 1) rtRef.current?.brush.emitFromBrush(props.brushKind, pt.x, pt.y, 2);
    } else if (g.kind === 'move') {
      const frame = props.frames.get();
      props.dispatch({ type: 'setValue', layerId: g.layerId, path: 'transform.x', frame, value: Math.round(g.baseX + pt.x - g.startX), autoKey: props.autoKey }, `${g.key}x`);
      props.dispatch({ type: 'setValue', layerId: g.layerId, path: 'transform.y', frame, value: Math.round(g.baseY + pt.y - g.startY), autoKey: props.autoKey }, `${g.key}x`);
    } else if (g.kind === 'draw') {
      const lastPt = g.points[g.points.length - 1];
      if (Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) > 1.5) g.points.push(pt);
    } else if (g.kind === 'puppet') {
      g.path.push(pt);
      if (g.path.length > 60) g.path.shift();
      g.puppeteer.feedPoint(pt.x, pt.y, (performance.now() - g.startWall) / 1000);
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'draw' && g.points.length > 1) {
      const stroke: DrawingStroke = { id: newId('stroke'), points: g.points, color: props.ink.color, width: props.ink.width, opacity: 1, cap: 'round', join: 'round' };
      props.dispatch({ type: 'addStroke', layerId: g.layerId, frame: props.frames.get(), stroke, newDrawingId: newId('drawing') });
    } else if (g.kind === 'puppet') {
      props.setPlaying(false);
      const take = g.puppeteer.stopRecording(g.layer.id);
      const o = g.layer.origin ?? { x: 0, y: 0 };
      // Recorded in frame pixels from 0 s: shift to the playhead and make positions offsets from the pivot.
      const shift = (ch: typeof take.xChannel, dv: number) => ({
        ...ch,
        keyframes: ch.keyframes.map((k) => ({ ...k, t: k.t + g.startSec, v: k.v - dv })).filter((k) => k.t <= frameToTime(props.project.durationFrames, props.project.fps) + 1e-6),
      });
      const channels: Record<string, typeof take.xChannel> = {
        'transform.x': shift(take.xChannel, o.x),
        'transform.y': shift(take.yChannel, o.y),
        ...(take.rotationChannel ? { 'transform.rotationZ': shift(take.rotationChannel, 0) } : {}),
        ...(take.scaleXChannel ? { 'transform.scaleX': shift(take.scaleXChannel, 0) } : {}),
        ...(take.scaleYChannel ? { 'transform.scaleY': shift(take.scaleYChannel, 0) } : {}),
      };
      props.dispatch({ type: 'mergeChannels', layerId: g.layer.id, channels });
      props.frames.set(timeToFrame(g.startSec, props.project.fps));
      props.onNotice(`Recorded ${take.keyframeCount} keys on ${g.layer.name}.`);
    }
  };

  const cursor = props.tool === 'draw' ? 'crosshair' : props.tool === 'puppet' ? 'grab' : props.tool === 'brush' ? 'cell' : 'move';
  return (
    <canvas
      ref={canvasRef}
      width={props.project.width}
      height={props.project.height}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="block max-w-full max-h-full rounded-[6px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] touch-none"
      style={{ aspectRatio: `${props.project.width} / ${props.project.height}`, cursor }}
    />
  );
};
