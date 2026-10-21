// components/Fabula/anima/AnimaStage.tsx — the canvas. Paints from refs every animation frame
// (no React re-render per frame) and turns pointer input into document edits per tool.
//
// Coordinates: "stage" = what you see (after the camera view), "frame" = project pixels,
// "content" = a layer's own space. services/anima/affine.ts converts between them.

import React, { useEffect, useRef } from 'react';
import type { AnimaLayer, AnimaProject, DrawingStroke } from '../../../services/anima/types';
import { AnimaRenderRuntime, layerContentBounds, renderAnimaFrame } from '../../../services/anima/render';
import { evaluateProjectAtFrame, frameToTime, timeToFrame, type EvaluatedLayerState } from '../../../services/anima/evaluator';
import { IDENTITY, activeCamera, apply, invert, layerMatrix, mul, type Affine } from '../../../services/anima/affine';
import { LiveMotionPuppeteer, type MotionBrushKind } from '../../../services/anima/worldClassEngine';
import { valueAt, type AnimaAction } from '../../../services/anima/document';
import type { FrameStore } from './frameStore';

export type AnimaTool = 'select' | 'draw' | 'puppet' | 'brush';
export type CameraMode = 'camera' | 'overview';

export interface AnimaStageProps {
  project: AnimaProject;
  frames: FrameStore;
  playing: boolean;
  tool: AnimaTool;
  selectedLayerId: string | null;
  brushKind: MotionBrushKind;
  ink: { color: string; width: number };
  cameraVideo: HTMLVideoElement | null;
  cameraMode: CameraMode;
  autoKey: boolean;
  dispatch: (action: AnimaAction, coalesceKey?: string) => void;
  setPlaying: (p: boolean) => void;
  onSelectLayer: (id: string | null) => void;
  onNotice: (msg: string) => void;
}

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Handle = 'move' | 'rotate' | 'nw' | 'ne' | 'se' | 'sw';

interface HandleGeometry {
  layer: AnimaLayer;
  st: EvaluatedLayerState;
  /** content → stage */
  m: Affine;
  corners: { x: number; y: number }[]; // nw, ne, se, sw in stage space
  rotate: { x: number; y: number };
  pivot: { x: number; y: number }; // stage space
}

function viewFor(project: AnimaProject, evaluated: EvaluatedLayerState[], mode: CameraMode): Affine {
  const cam = activeCamera(project, evaluated);
  return cam && mode !== 'overview' ? cam.view : IDENTITY;
}

function handleGeometry(project: AnimaProject, layer: AnimaLayer, st: EvaluatedLayerState, view: Affine, unit: number): HandleGeometry {
  const m = mul(view, layerMatrix(layer, st));
  const b = layerContentBounds(project, layer, st);
  const corners = [apply(m, b.x, b.y), apply(m, b.x + b.w, b.y), apply(m, b.x + b.w, b.y + b.h), apply(m, b.x, b.y + b.h)];
  const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
  const side = { x: corners[0].x - corners[3].x, y: corners[0].y - corners[3].y };
  const len = Math.hypot(side.x, side.y) || 1;
  const rotate = { x: topMid.x + (side.x / len) * 30 * unit, y: topMid.y + (side.y / len) * 30 * unit };
  const o = layer.origin ?? { x: 0, y: 0 };
  const pivot = apply(view, o.x + st.transform.x, o.y + st.transform.y);
  return { layer, st, m, corners, rotate, pivot };
}

function inside(poly: { x: number; y: number }[], p: { x: number; y: number }) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export const AnimaStage: React.FC<AnimaStageProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rtRef = useRef<AnimaRenderRuntime | null>(null);
  if (!rtRef.current && typeof document !== 'undefined') rtRef.current = new AnimaRenderRuntime();
  // Latest props for the paint loop and pointer handlers, without re-subscribing.
  const live = useRef(props);
  live.current = props;
  const hover = useRef<Handle | null>(null);
  const gesture = useRef<
    | { kind: 'transform'; handle: Handle; geo: HandleGeometry; start: { x: number; y: number }; key: string; base: { x: number; y: number; r: number; sx: number; sy: number }; viewInv: Affine }
    | { kind: 'pan-camera'; layer: AnimaLayer; start: { x: number; y: number }; base: { x: number; y: number }; key: string; viewInv: Affine }
    | { kind: 'draw'; layerId: string; toContent: Affine; points: { x: number; y: number }[]; stagePts: { x: number; y: number }[] }
    | { kind: 'puppet'; layer: AnimaLayer; startSec: number; startWall: number; puppeteer: LiveMotionPuppeteer; path: { x: number; y: number }[]; viewInv: Affine }
    | { kind: 'brush' }
    | null
  >(null);

  // Paint loop: playback clock + rendering + editor overlays.
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
          p.frames.set(((p.frames.get() - 1 + n) % p.project.durationFrames) + 1);
        }
      } else acc = 0;
      const sig = `${p.frames.get()}|${rt.version}|${p.selectedLayerId}|${p.tool}|${p.cameraMode}|${hover.current}`;
      const busy = p.playing || !!gesture.current || !!p.cameraVideo || p.tool === 'brush';
      if (busy || sig !== lastPainted || (canvas as any).__doc !== p.project) {
        const { evaluated, view } = renderAnimaFrame(ctx, p.project, p.frames.get(), rt, {
          playing: p.playing,
          dt,
          now: now / 1000,
          editor: { selectedLayerId: p.selectedLayerId },
          cameraMode: p.cameraMode,
        });
        const W = p.project.width;
        const H = p.project.height;
        const unit = W / Math.max(1, canvas.getBoundingClientRect().width || W);
        ctx.save();
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
        if (p.cameraVideo && p.cameraVideo.readyState >= 2) {
          ctx.globalAlpha = 0.55;
          ctx.drawImage(p.cameraVideo, 0, 0, W, H);
          ctx.globalAlpha = 1;
        }
        const g = gesture.current;
        if (g?.kind === 'draw' && g.stagePts.length > 1) {
          ctx.strokeStyle = p.ink.color;
          ctx.lineWidth = p.ink.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          g.stagePts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
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
          ctx.shadowBlur = 0;
        }
        // Selection handles (Move tool, not while playing).
        const layer = p.project.layers.find((l) => l.id === p.selectedLayerId);
        const st = layer && evaluated.find((e) => e.layerId === layer.id);
        if (layer && st && p.tool === 'select' && !p.playing && layer.visible && layer.type !== 'camera') {
          const geo = handleGeometry(p.project, layer, st, view, unit);
          ctx.strokeStyle = layer.locked ? 'rgba(255,209,102,0.7)' : '#00DAF3';
          ctx.lineWidth = 1.5 * unit;
          ctx.setLineDash(layer.locked ? [6 * unit, 4 * unit] : []);
          ctx.beginPath();
          geo.corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
          ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);
          if (!layer.locked) {
            const topMid = { x: (geo.corners[0].x + geo.corners[1].x) / 2, y: (geo.corners[0].y + geo.corners[1].y) / 2 };
            ctx.beginPath();
            ctx.moveTo(topMid.x, topMid.y);
            ctx.lineTo(geo.rotate.x, geo.rotate.y);
            ctx.stroke();
            const s = 9 * unit;
            for (const [i, c] of geo.corners.entries()) {
              const hot = hover.current === (['nw', 'ne', 'se', 'sw'] as Handle[])[i];
              ctx.fillStyle = hot ? '#00DAF3' : '#0e0d14';
              ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
              ctx.strokeRect(c.x - s / 2, c.y - s / 2, s, s);
            }
            ctx.fillStyle = hover.current === 'rotate' ? '#00DAF3' : '#0e0d14';
            ctx.beginPath();
            ctx.arc(geo.rotate.x, geo.rotate.y, 5.5 * unit, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Pivot
            ctx.beginPath();
            ctx.arc(geo.pivot.x, geo.pivot.y, 5 * unit, 0, Math.PI * 2);
            ctx.moveTo(geo.pivot.x - 11 * unit, geo.pivot.y);
            ctx.lineTo(geo.pivot.x + 11 * unit, geo.pivot.y);
            ctx.moveTo(geo.pivot.x, geo.pivot.y - 11 * unit);
            ctx.lineTo(geo.pivot.x, geo.pivot.y + 11 * unit);
            ctx.stroke();
          }
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

  /** Pointer → stage coordinates (project pixels as displayed) and the px→unit factor. */
  const toStage = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { pt: { x: ((e.clientX - r.left) / r.width) * props.project.width, y: ((e.clientY - r.top) / r.height) * props.project.height }, unit: props.project.width / r.width };
  };
  const evaluatedNow = () => evaluateProjectAtFrame(props.project, props.frames.get());

  const hitTest = (pt: { x: number; y: number }, unit: number): { handle: Handle; geo: HandleGeometry } | null => {
    const layer = props.project.layers.find((l) => l.id === props.selectedLayerId);
    if (!layer || layer.type === 'camera' || !layer.visible) return null;
    const ev = evaluatedNow();
    const st = ev.find((e) => e.layerId === layer.id);
    if (!st) return null;
    const geo = handleGeometry(props.project, layer, st, viewFor(props.project, ev, props.cameraMode), unit);
    const r = 10 * unit;
    if (Math.hypot(pt.x - geo.rotate.x, pt.y - geo.rotate.y) < r) return { handle: 'rotate', geo };
    const names: Handle[] = ['nw', 'ne', 'se', 'sw'];
    for (let i = 0; i < 4; i++) if (Math.hypot(pt.x - geo.corners[i].x, pt.y - geo.corners[i].y) < r) return { handle: names[i], geo };
    if (inside(geo.corners, pt)) return { handle: 'move', geo };
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { pt, unit } = toStage(e);
    const ev = evaluatedNow();
    const view = viewFor(props.project, ev, props.cameraMode);
    const viewInv = invert(view);
    const framePt = apply(viewInv, pt.x, pt.y);
    const layer = props.project.layers.find((l) => l.id === props.selectedLayerId) ?? null;
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
      if (layer.type === 'camera') {
        // Drag pans the camera; in camera view the picture follows your finger.
        const sign = props.cameraMode === 'overview' ? 1 : -1;
        gesture.current = {
          kind: 'pan-camera',
          layer,
          start: props.cameraMode === 'overview' ? framePt : pt,
          base: { x: valueAt(props.project, layer, 'transform.x', frame) * sign, y: valueAt(props.project, layer, 'transform.y', frame) * sign },
          key: newId('cam'),
          viewInv: sign < 0 ? IDENTITY : viewInv,
        };
        return;
      }
      const hit = hitTest(pt, unit);
      if (!hit) return;
      gesture.current = {
        kind: 'transform',
        handle: hit.handle,
        geo: hit.geo,
        start: framePt,
        key: newId('xf'),
        viewInv,
        base: {
          x: valueAt(props.project, layer, 'transform.x', frame),
          y: valueAt(props.project, layer, 'transform.y', frame),
          r: valueAt(props.project, layer, 'transform.rotationZ', frame),
          sx: valueAt(props.project, layer, 'transform.scaleX', frame),
          sy: valueAt(props.project, layer, 'transform.scaleY', frame),
        },
      };
    } else if (props.tool === 'draw') {
      if (layer.type !== 'cel' && layer.type !== 'stop_motion') {
        props.onNotice('Drawing goes on a drawing layer. Add one from the Layers panel.');
        return;
      }
      const st = ev.find((x) => x.layerId === layer.id)!;
      // Strokes live in the layer's own space, so a moved or rotated layer still draws under the pen.
      const toContent = invert(layerMatrix(layer, st));
      gesture.current = { kind: 'draw', layerId: layer.id, toContent, points: [apply(toContent, framePt.x, framePt.y)], stagePts: [pt] };
    } else if (props.tool === 'puppet') {
      const puppeteer = new LiveMotionPuppeteer({ fps: props.project.fps, stepRate: 2, inertia: 0.45, enableSquashStretch: true });
      puppeteer.startRecording(framePt.x, framePt.y, 0);
      gesture.current = { kind: 'puppet', layer, startSec: frameToTime(frame, props.project.fps), startWall: performance.now(), puppeteer, path: [pt], viewInv };
      props.setPlaying(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { pt, unit } = toStage(e);
    const g = gesture.current;
    if (!g) {
      if (props.tool === 'select') {
        const h = hitTest(pt, unit)?.handle ?? null;
        hover.current = h;
        e.currentTarget.style.cursor = h === 'rotate' ? 'grab' : h === 'nw' || h === 'se' ? 'nwse-resize' : h === 'ne' || h === 'sw' ? 'nesw-resize' : h === 'move' ? 'move' : 'default';
      }
      return;
    }
    const frame = props.frames.get();
    const set = (layerId: string, path: string, value: number, key: string) =>
      props.dispatch({ type: 'setValue', layerId, path, frame, value, autoKey: props.autoKey }, key);
    if (g.kind === 'brush') {
      if (e.buttons === 1) rtRef.current?.brush.emitFromBrush(props.brushKind, pt.x, pt.y, 2);
    } else if (g.kind === 'pan-camera') {
      const p = apply(g.viewInv, pt.x, pt.y);
      const sign = props.cameraMode === 'overview' ? 1 : -1;
      // In camera view a stage pixel is 1/zoom frame pixels.
      const zoom = sign < 0 ? Math.max(0.01, Math.abs(valueAt(props.project, g.layer, 'transform.scaleX', frame))) : 1;
      set(g.layer.id, 'transform.x', Math.round((g.base.x + (p.x - g.start.x) / zoom) * sign), g.key);
      set(g.layer.id, 'transform.y', Math.round((g.base.y + (p.y - g.start.y) / zoom) * sign), g.key);
    } else if (g.kind === 'transform') {
      const p = apply(g.viewInv, pt.x, pt.y);
      const pivot = apply(g.viewInv, g.geo.pivot.x, g.geo.pivot.y);
      if (g.handle === 'move') {
        set(g.geo.layer.id, 'transform.x', Math.round(g.base.x + p.x - g.start.x), g.key);
        set(g.geo.layer.id, 'transform.y', Math.round(g.base.y + p.y - g.start.y), g.key);
      } else if (g.handle === 'rotate') {
        const a0 = Math.atan2(g.start.y - pivot.y, g.start.x - pivot.x);
        const a1 = Math.atan2(p.y - pivot.y, p.x - pivot.x);
        let r = g.base.r + ((a1 - a0) * 180) / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        set(g.geo.layer.id, 'transform.rotationZ', Math.round(r * 10) / 10, g.key);
      } else {
        // Corner: scale along the layer's own (rotated) axes, about the pivot.
        const rad = (-g.base.r * Math.PI) / 180;
        const local = (q: { x: number; y: number }) => {
          const dx = q.x - pivot.x;
          const dy = q.y - pivot.y;
          return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
        };
        const v0 = local(g.start);
        const v1 = local(p);
        let sx = Math.abs(v0.x) > 2 ? g.base.sx * (v1.x / v0.x) : g.base.sx;
        let sy = Math.abs(v0.y) > 2 ? g.base.sy * (v1.y / v0.y) : g.base.sy;
        if (e.shiftKey) {
          const k = Math.hypot(v1.x, v1.y) / Math.max(1, Math.hypot(v0.x, v0.y));
          sx = g.base.sx * k;
          sy = g.base.sy * k;
        }
        set(g.geo.layer.id, 'transform.scaleX', Math.round(sx * 1000) / 1000, g.key);
        set(g.geo.layer.id, 'transform.scaleY', Math.round(sy * 1000) / 1000, g.key);
      }
    } else if (g.kind === 'draw') {
      const framePt = apply(invert(viewFor(props.project, evaluatedNow(), props.cameraMode)), pt.x, pt.y);
      const c = apply(g.toContent, framePt.x, framePt.y);
      const last = g.points[g.points.length - 1];
      if (Math.hypot(c.x - last.x, c.y - last.y) > 1.5) {
        g.points.push(c);
        g.stagePts.push(pt);
      }
    } else if (g.kind === 'puppet') {
      const framePt = apply(g.viewInv, pt.x, pt.y);
      g.path.push(pt);
      if (g.path.length > 60) g.path.shift();
      g.puppeteer.feedPoint(framePt.x, framePt.y, (performance.now() - g.startWall) / 1000);
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
      const end = frameToTime(props.project.durationFrames, props.project.fps) + 1e-6;
      // Recorded in frame pixels from 0 s: shift to the playhead and make positions offsets from the pivot.
      const shift = (ch: typeof take.xChannel, dv: number) => ({
        ...ch,
        keyframes: ch.keyframes.map((k) => ({ ...k, t: k.t + g.startSec, v: k.v - dv })).filter((k) => k.t <= end),
      });
      props.dispatch({
        type: 'mergeChannels',
        layerId: g.layer.id,
        channels: {
          'transform.x': shift(take.xChannel, o.x),
          'transform.y': shift(take.yChannel, o.y),
          ...(take.rotationChannel ? { 'transform.rotationZ': shift(take.rotationChannel, 0) } : {}),
          ...(take.scaleXChannel ? { 'transform.scaleX': shift(take.scaleXChannel, 0) } : {}),
          ...(take.scaleYChannel ? { 'transform.scaleY': shift(take.scaleYChannel, 0) } : {}),
        },
      });
      props.frames.set(timeToFrame(g.startSec, props.project.fps));
      props.onNotice(`Recorded ${take.keyframeCount} keys on ${g.layer.name}.`);
    }
  };

  const cursor = props.tool === 'draw' ? 'crosshair' : props.tool === 'puppet' ? 'grab' : props.tool === 'brush' ? 'cell' : 'default';
  return (
    <canvas
      ref={canvasRef}
      width={props.project.width}
      height={props.project.height}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => (hover.current = null)}
      className="block max-w-full max-h-full rounded-[6px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] touch-none"
      style={{ aspectRatio: `${props.project.width} / ${props.project.height}`, cursor }}
    />
  );
};
